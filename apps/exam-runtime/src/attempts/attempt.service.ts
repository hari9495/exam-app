import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService, AuditService, isIpAllowed, BlobStorageService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { LeaderboardService, AUTO_GRADABLE_QUESTION_TYPES, CandidateLeaderboardResponse } from '../leaderboard/leaderboard.service';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { AnswerDto } from './dto/answer.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { getProctoringEventSeverity, isStrikeWorthy } from './proctoring-severity';
import { resolveProctoringConfig, isSignalEnabled, isProctoringBypassActive, ExamProctoringConfig } from './proctoring-config';
import { ReportProctoringEventDto } from './dto/report-proctoring-event.dto';
import { shuffle } from './shuffle';
import { effectiveDurationMinutes } from '../grading/grading';
import { PistonClient, PistonExecuteResult } from '../code-execution/piston-client';
import { PistonRuntimesService } from '../code-execution/piston-runtimes.service';
import { RunLimiter } from '../code-execution/run-limiter';
import { RunCodeDto } from './dto/run-code.dto';
import { WebcamViolationDto } from './dto/webcam-violation.dto';
import { WebcamSnapshotDto } from './dto/webcam-snapshot.dto';
import { ScreenShareStateDto } from './dto/screen-share-state.dto';

interface AttemptQuestionOption {
  id: string;
  text: string;
  imageUrl: string | null;
}

interface AttemptQuestion {
  id: string;
  text: string;
  type: string;
  marks: number;
  languageMode: string;
  allowedLanguages: string[];
  starterCode: string | null;
  allowStdin: boolean;
  snippetCode: string | null;
  snippetLanguage: string | null;
  imageUrl: string | null;
  options: AttemptQuestionOption[];
}

interface AttemptSection {
  title: string;
  targetDurationMinutes: number | null;
  questions: AttemptQuestion[];
}

interface SectionSnapshotEntry {
  sectionId: string;
  title: string;
  targetDurationMinutes: number | null;
  questionIds: string[];
}

interface AttemptAnswerSummary {
  questionId: string;
  selectedOptionIds: string[];
  answerText: string | null;
  codeLanguage: string | null;
  isMarkedForReview: boolean;
}

interface AttemptMessageSummary {
  id: string;
  body: string;
  sentAt: Date;
}

interface AttemptSectionSummary {
  title: string;
  questionCount: number;
}

interface AttemptPreviewResponse {
  candidateName: string;
  exam: {
    title: string;
    instructions: string | null;
    durationMinutes: number;
    schedulingEnabled: boolean;
    availabilityWindowStart: Date | null;
    availabilityWindowEnd: Date | null;
    proctoring: ExamProctoringConfig;
  };
  schedulingWindowState: 'not_open' | 'open' | 'closed' | null;
  sections: AttemptSectionSummary[];
  organizationLogoUrl: string | null;
  organizationPrimaryColor: string | null;
}

interface AttemptSectionFeedback {
  title: string;
  score: number;
  maxScore: number;
}

interface AttemptFeedback {
  status: 'pending_review' | 'settled';
  visibility: string;
  passFail: 'pass' | 'fail' | null;
  percentage: number | null;
  sections: AttemptSectionFeedback[] | null;
}

interface AttemptStateResponse {
  candidateName: string;
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  browserActivityViolationCount: number;
  exam: { title: string; proctoring: ExamProctoringConfig };
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
  feedback: AttemptFeedback | null;
  organizationLogoUrl: string | null;
  organizationPrimaryColor: string | null;
}

export type AttemptCurrentResponse = AttemptPreviewResponse | AttemptStateResponse;

// `screenshot`/`screenshotCapReached` are server-authoritative outcomes of the upload below --
// a client must never be able to set them itself. The invariant that actually matters is not
// "no key literally named screenshot" -- it's that the serialized JSON text must never contain
// the literal `"screenshot":` the cap-count query greps for. That query matches case- AND
// width-insensitively: confirmed against the actual dev database (SQL_Latin1_General_CP1_CI_AS)
// -- see scc-task-5-report.md fix round 4 -- N'{"ｓcreenshot":1}' (fullwidth U+FF53 "s") LIKE
// N'%"screenshot":%' is a real match there. A key can produce the literal two ways:
//   1. the key, after folding, *contains* "screenshot" as a substring -- not just an exact name
//      match: "screenshot", "screenshotCapReached", "xscreenshotx", and Unicode variants the
//      collation folds to "screenshot" (fullwidth forms; possibly others depending on collation
//      and SQL Server version, so fold aggressively rather than enumerate) -- the key's own
//      structural quotes supply the `"` ... `":`.
//   2. the key contains a raw `"` character itself (e.g. the 11-char key `"screenshot`) -- the
//      embedded quote supplies the opening `"` and the key's own closing quote supplies the
//      `":`, so `"screenshot":` forms even though the key's folded text never contains it.
// (String *values* can't do either: a value's own quote is always escaped as `\"` in the
// serialization, and that backslash sits directly between any preceding text and the quote --
// so a value can never place an unescaped `"` immediately after the text "screenshot" the way
// case 2 needs. A value's escaped rendering *can* contain a bare `":` substring elsewhere in
// general -- e.g. the value `a":b` serializes as `"a\":b"`, which does contain `":` -- but never
// with "screenshot" immediately before it, which is the only occurrence the cap query cares
// about. So values are safe without filtering; only keys need this check.)
// Fold before substring-matching: NFKC normalization maps fullwidth/compatibility Unicode forms
// (e.g. U+FF53 fullwidth "s") to their ASCII equivalent, matching what the collation does above.
// Also strip Unicode "format" characters (`\p{Cf}`, invisible-but-present codepoints) and the
// soft hyphen (U+00AD) first -- NFKC alone doesn't remove those, and some Windows collations
// treat them as ignorable in comparisons. This is deliberately more aggressive than any single
// collation's documented folding, so the filter doesn't have to track collation internals to
// stay correct.
// Recursing into every object and array element is exhaustive over containers; the fold +
// substring + quote check above is what's exhaustive over how the literal can appear in the text.
// Built from a charcode, not an escape or literal character, so the invisible soft hyphen
// (codepoint 0x00AD) can't get silently mangled or lost in an editor/diff.
const SOFT_HYPHEN = String.fromCharCode(0xad);
const IGNORABLE_KEY_CHARS = new RegExp(`[\\p{Cf}${SOFT_HYPHEN}]`, 'gu');

function isForgedScreenshotKey(key: string): boolean {
  const folded = key.replace(IGNORABLE_KEY_CHARS, '').normalize('NFKC').toLowerCase();
  return folded.includes('screenshot') || key.includes('"');
}

function stripForgedScreenshotKeys(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return metadata;
  return sanitizeAgainstForgedScreenshotKeys(metadata) as Record<string, unknown>;
}

function sanitizeAgainstForgedScreenshotKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeAgainstForgedScreenshotKeys);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !isForgedScreenshotKey(key))
        .map(([key, nested]) => [key, sanitizeAgainstForgedScreenshotKeys(nested)]),
    );
  }
  return value;
}

// Hostile or merely absurd metadata (thousands of nesting levels deep -- a few KB of payload,
// trivially inside the body-size limit) can overflow the stack, either in the recursion just
// above or in a later JSON.stringify of the same structure (a different, larger depth, but the
// same failure). Either way that's an uncaught RangeError inside the transaction, which is a
// lost violation -- exactly what this task exists to prevent. Rather than tune two separate
// depth ceilings (one per recursive/stringify path, liable to drift out of sync), prove the
// sanitized metadata is actually serializable once, up front, and drop it entirely if not: the
// violation is what matters, losing a hostile client's metadata is an acceptable trade.
function sanitizeMetadataOrDrop(
  metadata: Record<string, unknown> | undefined,
  logger: Logger,
  attemptId: string,
  eventType: string,
): Record<string, unknown> | undefined {
  try {
    const stripped = stripForgedScreenshotKeys(metadata);
    if (stripped) JSON.stringify(stripped);
    return stripped;
  } catch (error) {
    logger.error(`Dropping unprocessable proctoring event metadata (attempt ${attemptId}, event ${eventType})`, error as Error);
    return undefined;
  }
}

// The blob upload runs inside the tenant-scoped interactive transaction (see
// TenantPrismaService.forTenant), which has Prisma's default 5s timeout. A slow-but-eventually-
// successful upload wouldn't throw on its own, so without a bound the transaction would already
// be closed by the time we tried to write the event -- an uncaught "Transaction already closed"
// that 500s and loses the violation, which is exactly what the catch below exists to prevent.
// This timeout forces a slow upload to fail fast enough to still land in that catch.
const SCREENSHOT_UPLOAD_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class AttemptService {
  private readonly logger = new Logger(AttemptService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly monitoringGateway: MonitoringGateway,
    private readonly pistonClient: PistonClient,
    private readonly pistonRuntimes: PistonRuntimesService,
    private readonly runLimiter: RunLimiter,
    private readonly leaderboardService: LeaderboardService,
    private readonly audit: AuditService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  async getCurrent(session: CandidateSession): Promise<AttemptCurrentResponse> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);
    const { logoUrl: organizationLogoUrl, primaryColor: organizationPrimaryColor } = await this.getOrganizationBranding(organizationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        const sections = await tx.examSection.findMany({
          where: { examId: exam.id },
          orderBy: { orderIndex: 'asc' },
          include: { questions: true },
        });
        return {
          candidateName: invitation.candidate.name,
          exam: {
            title: exam.title,
            instructions: exam.instructions,
            durationMinutes: exam.durationMinutes,
            schedulingEnabled: exam.schedulingEnabled,
            availabilityWindowStart: exam.availabilityWindowStart,
            availabilityWindowEnd: exam.availabilityWindowEnd,
            proctoring: resolveProctoringConfig(exam),
          },
          schedulingWindowState: this.getSchedulingWindowState(exam),
          sections: sections.map((section) => ({
            title: section.title,
            questionCount: section.selectionMode === 'pool' ? (section.poolSize ?? 0) : section.questions.length,
          })),
          organizationLogoUrl,
          organizationPrimaryColor,
        };
      }

      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      const sections = await this.loadSections(tx, settled.sectionSnapshotJson, settled.optionOrderJson);
      const answers = await tx.answer.findMany({ where: { attemptId: settled.id } });

      const unreadMessages = await tx.candidateMessage.findMany({ where: { attemptId: settled.id, readAt: null } });
      if (unreadMessages.length > 0) {
        await tx.candidateMessage.updateMany({ where: { attemptId: settled.id, readAt: null }, data: { readAt: new Date() } });
      }
      const feedback = await this.buildFeedback(tx, exam, settled);

      return {
        candidateName: invitation.candidate.name,
        status: settled.status,
        remainingSeconds: this.attemptSettlement.remainingSeconds(exam, settled),
        webcamViolationCount: settled.webcamViolationCount,
        browserActivityViolationCount: settled.browserActivityViolationCount,
        exam: { title: exam.title, proctoring: resolveProctoringConfig(exam, settled) },
        sections,
        answers: answers.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionIds: JSON.parse(answer.selectedOptionIdsJson),
          answerText: answer.answerText,
          codeLanguage: answer.codeLanguage,
          isMarkedForReview: answer.isMarkedForReview,
        })),
        messages: unreadMessages.map((message) => ({ id: message.id, body: message.body, sentAt: message.sentAt })),
        feedback,
        organizationLogoUrl,
        organizationPrimaryColor,
      };
    });
  }

  async getCodeLanguages(): Promise<{ languages: { language: string; version: string }[] }> {
    const languages = await this.pistonRuntimes.getAvailableLanguages();
    return { languages };
  }

  async start(session: CandidateSession, dto: StartAttemptDto = {}, clientIp = ''): Promise<{ id: string; status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const existing = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (existing) {
        return { id: existing.id, status: existing.status };
      }

      await this.enforceIpRestriction(exam, organizationId, invitation.id, clientIp, 'start');

      if (dto.consent !== true) {
        throw new BadRequestException('You must consent to exam monitoring before starting.');
      }

      const windowState = this.getSchedulingWindowState(exam);
      if (windowState === 'not_open') {
        throw new BadRequestException('This exam is not open yet — check back during its scheduled window.');
      }
      if (windowState === 'closed') {
        throw new BadRequestException("This exam's availability window has closed.");
      }

      const sections = await tx.examSection.findMany({
        where: { examId: exam.id },
        orderBy: { orderIndex: 'asc' },
        include: { questions: { orderBy: { orderIndex: 'asc' } }, poolTags: true },
      });

      const sectionSnapshot: SectionSnapshotEntry[] = [];
      for (const section of sections) {
        let questionIds: string[];
        if (section.selectionMode === 'pool') {
          const tagIds = section.poolTags.map((poolTag) => poolTag.tagId);
          const candidates = await tx.question.findMany({
            where: {
              organizationId,
              status: 'active',
              ...(section.poolDifficulty ? { difficulty: section.poolDifficulty } : {}),
              AND: tagIds.map((tagId) => ({ tags: { some: { tagId } } })),
            },
            select: { id: true },
          });
          questionIds = shuffle(candidates)
            .slice(0, section.poolSize ?? 0)
            .map((candidate) => candidate.id);
        } else {
          const fixedIds = section.questions.map((link) => link.questionId);
          questionIds = exam.randomizeOrder ? shuffle(fixedIds) : fixedIds;
        }
        sectionSnapshot.push({
          sectionId: section.id,
          title: section.title,
          targetDurationMinutes: section.targetDurationMinutes,
          questionIds,
        });
      }

      const questionIds = sectionSnapshot.flatMap((section) => section.questionIds);

      let optionOrderJson: string | null = null;
      if (exam.randomizeOrder) {
        const questions = await tx.question.findMany({ where: { id: { in: questionIds } }, include: { options: true } });
        const optionOrder: Record<string, string[]> = {};
        for (const question of questions) {
          optionOrder[question.id] = shuffle(question.options.map((option) => option.id));
        }
        optionOrderJson = JSON.stringify(optionOrder);
      }

      const attempt = await tx.attempt.create({
        data: {
          invitationId: invitation.id,
          candidateId: invitation.candidateId,
          examId: exam.id,
          questionOrderJson: JSON.stringify(questionIds),
          sectionSnapshotJson: JSON.stringify(sectionSnapshot),
          optionOrderJson,
          deviceFingerprint: dto.deviceFingerprint,
          consentAt: new Date(),
        },
      });
      this.monitoringGateway.emitAttemptStatus(exam.id, {
        attemptId: attempt.id,
        candidateId: invitation.candidateId,
        status: attempt.status,
      });
      return { id: attempt.id, status: attempt.status };
    });
  }

  async answer(
    session: CandidateSession,
    dto: AnswerDto,
  ): Promise<{ questionId: string; selectedOptionIds: string[]; answerText: string | null; isMarkedForReview: boolean }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    const { response, isAutoGradable } = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      if (settled.status !== 'in_progress') {
        throw new BadRequestException(`Cannot answer — attempt status is "${settled.status}"`);
      }

      const questionIds: string[] = JSON.parse(settled.questionOrderJson);
      if (!questionIds.includes(dto.questionId)) {
        throw new BadRequestException(`Question ${dto.questionId} is not part of this attempt`);
      }
      const question = await tx.question.findFirstOrThrow({ where: { id: dto.questionId }, include: { options: true } });
      const isMarkedForReview = dto.markedForReview ?? false;

      if (question.type === 'code') {
        if (dto.codeLanguage) {
          this.validateChosenLanguage(question, dto.codeLanguage);
        }
        const telemetryPatch = dto.telemetry ? { telemetryJson: JSON.stringify(dto.telemetry) } : {};
        await tx.answer.upsert({
          where: { attemptId_questionId: { attemptId: settled.id, questionId: dto.questionId } },
          create: {
            attemptId: settled.id,
            questionId: dto.questionId,
            selectedOptionIdsJson: JSON.stringify([]),
            answerText: dto.answerText ?? null,
            codeLanguage: dto.codeLanguage ?? null,
            isMarkedForReview,
            ...telemetryPatch,
          },
          update: {
            answerText: dto.answerText ?? null,
            codeLanguage: dto.codeLanguage ?? null,
            isMarkedForReview,
            answeredAt: new Date(),
            ...telemetryPatch,
          },
        });
        return {
          response: { questionId: dto.questionId, selectedOptionIds: [], answerText: dto.answerText ?? null, isMarkedForReview },
          isAutoGradable: false,
        };
      }

      // An empty selection means "no answer yet, possibly just toggling markedForReview" — skip option validation.
      if (dto.selectedOptionIds.length > 0) {
        this.validateSelection(question, dto.selectedOptionIds);
      }

      await tx.answer.upsert({
        where: { attemptId_questionId: { attemptId: settled.id, questionId: dto.questionId } },
        create: {
          attemptId: settled.id,
          questionId: dto.questionId,
          selectedOptionIdsJson: JSON.stringify(dto.selectedOptionIds),
          isMarkedForReview,
        },
        update: {
          selectedOptionIdsJson: JSON.stringify(dto.selectedOptionIds),
          isMarkedForReview,
          answeredAt: new Date(),
        },
      });

      return {
        response: { questionId: dto.questionId, selectedOptionIds: dto.selectedOptionIds, answerText: null, isMarkedForReview },
        isAutoGradable: AUTO_GRADABLE_QUESTION_TYPES.includes(question.type),
      };
    });

    // computeRecruiterView opens its own tenantPrisma.forTenant(...) transaction — this must only
    // fire after the outer transaction above has fully resolved (committed), not from inside its
    // callback, or it risks a nested transaction reading stale/uncommitted data. Fire-and-forget so
    // it never delays the response to the candidate.
    if (isAutoGradable) {
      void this.broadcastLeaderboard(organizationId, exam.id).catch((error) =>
        this.logger.error('Failed to broadcast leaderboard update', error as Error),
      );
    }

    return response;
  }

  async runCode(session: CandidateSession, dto: RunCodeDto): Promise<PistonExecuteResult & { runsRemaining: number }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    const { question } = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      if (settled.status !== 'in_progress') {
        throw new BadRequestException(`Cannot run code — attempt status is "${settled.status}"`);
      }

      const questionIds: string[] = JSON.parse(settled.questionOrderJson);
      if (!questionIds.includes(dto.questionId)) {
        throw new BadRequestException(`Question ${dto.questionId} is not part of this attempt`);
      }
      const question = await tx.question.findFirstOrThrow({ where: { id: dto.questionId } });
      if (question.type !== 'code') {
        throw new BadRequestException(`Question ${dto.questionId} is not a code question`);
      }
      return { question };
    });

    const { allowed, remaining } = await this.runLimiter.checkAndIncrement(invitation.id, dto.questionId);
    if (!allowed) {
      throw new HttpException('You have used all 30 runs for this question', HttpStatus.TOO_MANY_REQUESTS);
    }

    this.validateChosenLanguage(question, dto.codeLanguage);
    const languageEntry = await this.pistonRuntimes.resolveLanguage(dto.codeLanguage);
    if (!languageEntry) {
      throw new BadRequestException(`Unsupported code language: ${dto.codeLanguage}`);
    }

    try {
      const result = await this.pistonClient.execute({
        language: languageEntry.language,
        version: languageEntry.version,
        code: dto.code,
        stdin: question.allowStdin ? dto.stdin : undefined,
      });
      return { ...result, runsRemaining: remaining };
    } catch (error) {
      // Logged before translating to the generic candidate-facing message below — otherwise a
      // real misconfiguration (e.g. Piston's own run_timeout cap set lower than RUN_TIMEOUT_MS
      // in piston-client.ts) is indistinguishable from an actually-down sandbox in server logs.
      this.logger.error(`Piston execute failed for question ${dto.questionId}`, error as Error);
      // `message` (not just `error`) is deliberate: apps/web's candidateApiFetch surfaces a
      // failed response's body.message as the thrown Error's .message, and Task 6's frontend
      // displays that message directly rather than a hardcoded string — so this exact text is
      // what the candidate sees. Keeping `error: 'sandbox_unavailable'` too for any future
      // machine-readable handling.
      throw new HttpException(
        { error: 'sandbox_unavailable', message: "Couldn't run your code right now, try again." },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private validateChosenLanguage(question: { languageMode: string; allowedLanguages: string | null }, chosen: string): void {
    if (question.languageMode === 'fixed') {
      const allowed: string[] = question.allowedLanguages ? JSON.parse(question.allowedLanguages) : [];
      if (!allowed.includes(chosen)) {
        throw new BadRequestException(`${chosen} is not an allowed language for this question`);
      }
    }
  }

  async reportProctoringEvent(
    session: CandidateSession,
    dto: ReportProctoringEventDto,
  ): Promise<{ id: string; eventType: string; severity: string; strike: number; status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }

      // The client is told which signals to skip, but the server cannot trust it:
      // a stale bundle or a tampered client would otherwise still land strikes for
      // a signal the recruiter turned off. Ignore rather than reject.
      const proctoring = resolveProctoringConfig(exam, attempt);
      if (!isSignalEnabled(proctoring, dto.eventType)) {
        return {
          id: '',
          eventType: dto.eventType,
          severity: 'low',
          strike: attempt.browserActivityViolationCount,
          status: attempt.status,
        };
      }

      // Screenshots are server-authoritative, same as the signal guard above: a disabled
      // capture is ignored, not rejected, so a stale/tampered client can't force an upload
      // the recruiter turned off. Strip any client-forged `screenshot`/`screenshotCapReached`
      // key first -- those are only ever meant to be set below, by us -- and drop metadata
      // entirely if it can't be proven safe to serialize (see sanitizeMetadataOrDrop). `metadata`
      // only diverges further from there when a screenshot is actually being handled --
      // otherwise it stays as-is (including `undefined`) so callers below see no behavior change.
      let metadata = sanitizeMetadataOrDrop(dto.metadata, this.logger, attempt.id, dto.eventType);
      if (dto.screenshot && proctoring.screenCaptureEnabled) {
        // Match the JSON key, not the bare word: `screenshotCapReached` also contains the
        // substring "screenshot", and would otherwise inflate this count once the cap is hit.
        const priorScreenshots = await tx.proctoringEvent.count({
          where: { attemptId: attempt.id, metadataJson: { contains: '"screenshot":' } },
        });
        if (priorScreenshots >= 150) {
          metadata = { ...metadata, screenshotCapReached: true };
        } else {
          try {
            const screenshotUrl = await withTimeout(
              this.blobStorage.uploadDataUri(`screen-captures/${attempt.id}-${Date.now()}.jpg`, dto.screenshot),
              SCREENSHOT_UPLOAD_TIMEOUT_MS,
            );
            metadata = { ...metadata, screenshot: screenshotUrl };
          } catch (error) {
            // The violation record is what matters -- losing the image is acceptable, losing
            // the violation is not.
            this.logger.error('Failed to upload screen capture', error as Error);
          }
        }
      }

      if (isStrikeWorthy(dto.eventType)) {
        const { attempt: updated, strike, event } = await this.attemptSettlement.registerBrowserActivityViolation(
          tx,
          exam,
          attempt,
          dto.eventType,
          metadata,
        );
        this.monitoringGateway.emitProctoringFlag(exam.id, {
          attemptId: attempt.id,
          candidateId: invitation.candidateId,
          eventType: event.eventType,
          severity: event.severity,
          occurredAt: new Date(),
        });
        return { id: event.id, eventType: event.eventType, severity: event.severity, strike, status: updated.status };
      }

      const event = await tx.proctoringEvent.create({
        data: {
          attemptId: attempt.id,
          eventType: dto.eventType,
          severity: getProctoringEventSeverity(dto.eventType),
          metadataJson: metadata ? JSON.stringify(metadata) : null,
        },
      });
      this.monitoringGateway.emitProctoringFlag(exam.id, {
        attemptId: attempt.id,
        candidateId: invitation.candidateId,
        eventType: event.eventType,
        severity: event.severity,
        occurredAt: event.occurredAt,
      });
      return {
        id: event.id,
        eventType: event.eventType,
        severity: event.severity,
        strike: attempt.browserActivityViolationCount,
        status: attempt.status,
      };
    });
  }

  async webcamViolation(session: CandidateSession, dto: WebcamViolationDto): Promise<{ strike: number; status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      if (attempt.status !== 'in_progress') {
        throw new BadRequestException(`Cannot report a webcam violation — attempt status is "${attempt.status}"`);
      }
      // The client is told whether webcam proctoring is on, but the server cannot trust
      // it: a stale bundle or a tampered client on a webcam-disabled exam must not be
      // able to record events, strikes, or a pause/block. Ignore rather than reject, for
      // the same reason as the disabled-signal guard above.
      if (!resolveProctoringConfig(exam, attempt).webcamEnabled) {
        return { strike: attempt.webcamViolationCount, status: attempt.status };
      }
      const snapshotUrl = await this.blobStorage.uploadDataUri(`webcam-snapshots/${attempt.id}-${Date.now()}.jpg`, dto.snapshot);
      const { attempt: updated, strike } = await this.attemptSettlement.registerWebcamViolation(tx, exam, attempt, dto.reason, snapshotUrl);
      return { strike, status: updated.status };
    });
  }

  async webcamSnapshot(session: CandidateSession, dto: WebcamSnapshotDto): Promise<{ ok: true }> {
    const { organizationId, invitation } = await this.resolveContext(session.invitationId);
    await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) return;
      const snapshotUrl = await this.blobStorage.uploadDataUri(`webcam-snapshots/${attempt.id}-${Date.now()}.jpg`, dto.snapshot);
      await tx.proctoringEvent.create({
        data: { attemptId: attempt.id, eventType: 'webcam_snapshot', severity: 'low', metadataJson: JSON.stringify({ snapshot: snapshotUrl }) },
      });
    });
    return { ok: true };
  }

  async getLeaderboard(session: CandidateSession): Promise<CandidateLeaderboardResponse> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);
    const attempt = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.attempt.findUnique({ where: { invitationId: invitation.id } }),
    );
    // Live, in-exam ranking stays always-on (accepted trade-off from the original Live
    // Leaderboard design). Once the attempt is no longer live, this is post-submission
    // result data -- only show it if the exam's feedback level already permits the
    // candidate to see their own score, mirroring buildFeedback()'s enforcement.
    const isLive = !attempt || attempt.status === 'in_progress' || attempt.status === 'paused' || attempt.status === 'blocked';
    const canSeeOwnScore = exam.feedbackVisibility === 'score' || exam.feedbackVisibility === 'breakdown';
    if (!isLive && !canSeeOwnScore) {
      return { you: null, top: [] };
    }
    return this.leaderboardService.computeCandidateView({ organizationId, isSuperAdmin: false }, exam.id, invitation.id);
  }

  async webcamResume(session: CandidateSession): Promise<{ status: string }> {
    const { organizationId, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      if (attempt.status !== 'paused') {
        throw new BadRequestException(`Cannot resume — attempt status is "${attempt.status}"`);
      }
      const updated = await this.attemptSettlement.resumeFromPause(tx, attempt);
      return { status: updated.status };
    });
  }

  async screenShareState(session: CandidateSession, dto: ScreenShareStateDto): Promise<{ status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }

      // This endpoint only ever acts on a still-live attempt. A terminal attempt (submitted,
      // auto_submitted, force_submitted, pending_manual_grade) must not be resurrected or
      // re-processed by a stray/late screen-share event -- e.g. the browser's
      // MediaStreamTrack 'ended' handler firing active:false right as the submit tears the
      // page down, well after screenShareStartedAt was set and nothing else clears it.
      // `blocked` stays in the live set alongside in_progress/paused (not excluded) because
      // it's an active enforcement state, not a terminal one: "leave a blocked attempt
      // blocked" still means the strike path (and the started-event on active:true) keeps
      // running for it, same as before this guard existed.
      const isLive = attempt.status === 'in_progress' || attempt.status === 'paused' || attempt.status === 'blocked';
      if (!isLive) {
        return { status: attempt.status };
      }

      // The server is authoritative: a stale or tampered client must not be able to pause
      // an exam that never asked for screen sharing. Write nothing, return status unchanged.
      if (!resolveProctoringConfig(exam, attempt).screenCaptureEnabled) {
        return { status: attempt.status };
      }

      if (dto.active) {
        let current = attempt;
        // Only a genuine start (previously not sharing) sets the timestamp and records the
        // event -- a repeated active:true call must not double-record.
        if (!attempt.screenShareStartedAt) {
          current = await tx.attempt.update({ where: { id: attempt.id }, data: { screenShareStartedAt: new Date() } });
          await tx.proctoringEvent.create({
            data: {
              attemptId: attempt.id,
              eventType: 'screen_share_started',
              severity: getProctoringEventSeverity('screen_share_started'),
              metadataJson: JSON.stringify({ displaySurface: dto.displaySurface, userAgent: dto.userAgent }),
            },
          });
        }
        // Mirror of the active:false pause rule: resume only lifts a `paused` attempt.
        // A `blocked` (or any other non-paused) attempt must not be handed a way to
        // un-block itself by stopping and restarting its share.
        if (current.status !== 'paused') {
          return { status: current.status };
        }
        // Meeting a precondition is not a recruiter pardon: resume without resetting counters.
        const resumed = await this.attemptSettlement.resumeFromPause(tx, current);
        return { status: resumed.status };
      }

      // active: false
      let current = attempt;
      if (attempt.screenShareStartedAt) {
        // A genuine stop: strike-worthy, respects the exam's enforcement mode (and any
        // proctoring bypass) via registerBrowserActivityViolation. Clearing the timestamp
        // makes a repeated active:false call a no-strike, no-record no-op.
        const { attempt: struck } = await this.attemptSettlement.registerBrowserActivityViolation(
          tx,
          exam,
          attempt,
          'screen_share_stopped',
          { displaySurface: dto.displaySurface, userAgent: dto.userAgent },
        );
        current = await tx.attempt.update({ where: { id: struck.id }, data: { screenShareStartedAt: null } });
      }

      // Pausing for a missing share is a precondition, not enforcement -- it applies even
      // in warn mode, and never downgrades an already-blocked attempt. A bypassed attempt
      // is exempt from the pause entirely (but not from the strike recorded above).
      if (current.status === 'in_progress' && !isProctoringBypassActive(current)) {
        current = await tx.attempt.update({ where: { id: current.id }, data: { status: 'paused', pausedAt: new Date() } });
        this.monitoringGateway.emitAttemptStatus(exam.id, {
          attemptId: current.id,
          candidateId: invitation.candidateId,
          status: current.status,
        });
      }

      return { status: current.status };
    });
  }

  async submit(session: CandidateSession): Promise<{ status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      if (settled.status !== 'in_progress') {
        return { status: settled.status };
      }

      const finalized = await this.attemptSettlement.finalize(tx, exam, settled, 'submitted');
      return { status: finalized.status };
    });
  }

  private async resolveContext(invitationId: string) {
    const invitation = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.invitation.findUnique({ where: { id: invitationId }, include: { exam: true, candidate: true } }),
    );
    if (!invitation || !invitation.exam) {
      throw new UnauthorizedException('Invalid candidate session');
    }
    const exam = {
      ...invitation.exam,
      durationMinutes: effectiveDurationMinutes(invitation.exam.durationMinutes, invitation.extraTimePercent),
    };
    return { organizationId: exam.organizationId, exam, invitation };
  }

  private async getOrganizationBranding(organizationId: string): Promise<{ logoUrl: string | null; primaryColor: string | null }> {
    const organization = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.organization.findUnique({ where: { id: organizationId }, select: { logoPath: true, primaryColor: true } }),
    );
    return {
      logoUrl: organization?.logoPath ? `${process.env.API_ORIGIN}/uploads/${organization.logoPath}` : null,
      primaryColor: organization?.primaryColor ?? null,
    };
  }

  private getSchedulingWindowState(exam: {
    schedulingEnabled: boolean;
    availabilityWindowStart: Date | null;
    availabilityWindowEnd: Date | null;
  }): 'not_open' | 'open' | 'closed' | null {
    if (!exam.schedulingEnabled || !exam.availabilityWindowStart || !exam.availabilityWindowEnd) {
      return null;
    }
    const now = new Date();
    if (now < exam.availabilityWindowStart) {
      return 'not_open';
    }
    if (now > exam.availabilityWindowEnd) {
      return 'closed';
    }
    return 'open';
  }

  private async enforceIpRestriction(
    exam: { id: string; allowedIpRange: string | null },
    organizationId: string,
    invitationId: string,
    clientIp: string,
    phase: 'redeem' | 'start',
  ): Promise<void> {
    if (!exam.allowedIpRange) {
      return;
    }
    if (isIpAllowed(clientIp, exam.allowedIpRange)) {
      return;
    }
    await this.audit
      .record(
        { organizationId, isSuperAdmin: true },
        {
          actorUserId: null,
          action: 'attempt.blocked_ip',
          entityType: 'invitation',
          entityId: invitationId,
          metadata: { observedIp: clientIp, allowedIpRange: exam.allowedIpRange, phase },
        },
      )
      .catch(() => undefined); // audit is a side effect; never mask the block itself
    throw new ForbiddenException(
      `Your network (${clientIp}) is not approved for this exam. Please contact the exam organizer.`,
    );
  }

  private validateSelection(question: { type: string; options: { id: string }[] }, selectedOptionIds: string[]): void {
    const validIds = new Set(question.options.map((option) => option.id));
    if (selectedOptionIds.length === 0 || !selectedOptionIds.every((id) => validIds.has(id))) {
      throw new BadRequestException('One or more selected options do not belong to this question');
    }
    if ((question.type === 'single_mcq' || question.type === 'true_false') && selectedOptionIds.length !== 1) {
      throw new BadRequestException(`Question type "${question.type}" requires exactly one selected option`);
    }
  }

  private async loadSections(
    tx: Prisma.TransactionClient,
    sectionSnapshotJson: string,
    optionOrderJson: string | null,
  ): Promise<AttemptSection[]> {
    const snapshot: SectionSnapshotEntry[] = JSON.parse(sectionSnapshotJson);
    const allQuestionIds = snapshot.flatMap((section) => section.questionIds);
    const questions = await tx.question.findMany({ where: { id: { in: allQuestionIds } }, include: { options: true } });
    const questionsById = new Map(questions.map((question) => [question.id, question]));
    const optionOrder: Record<string, string[]> | null = optionOrderJson ? JSON.parse(optionOrderJson) : null;

    return snapshot.map((section) => ({
      title: section.title,
      targetDurationMinutes: section.targetDurationMinutes,
      questions: section.questionIds
        .map((questionId) => questionsById.get(questionId))
        .filter((question): question is NonNullable<typeof question> => question !== undefined)
        .map((question) => {
          const order = optionOrder?.[question.id];
          const orderedOptions = order
            ? order
                .map((optionId) => question.options.find((option) => option.id === optionId))
                .filter((option): option is NonNullable<typeof option> => option !== undefined)
            : question.options;
          return {
            id: question.id,
            text: question.text,
            type: question.type,
            marks: question.marks,
            languageMode: question.languageMode,
            allowedLanguages: question.allowedLanguages ? JSON.parse(question.allowedLanguages) : [],
            starterCode: question.starterCode,
            allowStdin: question.allowStdin,
            snippetCode: question.snippetCode,
            snippetLanguage: question.snippetLanguage,
            imageUrl: question.imageUrl,
            options: orderedOptions.map((option) => ({ id: option.id, text: option.text, imageUrl: option.imageUrl })),
          };
        }),
    }));
  }

  private async buildFeedback(
    tx: Prisma.TransactionClient,
    exam: { feedbackVisibility: string },
    attempt: { id: string; status: string; sectionSnapshotJson: string },
  ): Promise<AttemptFeedback | null> {
    if (attempt.status === 'in_progress' || attempt.status === 'paused' || attempt.status === 'blocked') {
      return null;
    }
    if (attempt.status === 'pending_manual_grade') {
      return { status: 'pending_review', visibility: exam.feedbackVisibility, passFail: null, percentage: null, sections: null };
    }

    const result = await tx.result.findUnique({ where: { attemptId: attempt.id } });
    const visibility = exam.feedbackVisibility;
    const passFail =
      visibility === 'pass_fail' || visibility === 'score' || visibility === 'breakdown'
        ? ((result?.passFail ?? null) as 'pass' | 'fail' | null)
        : null;
    const percentage = visibility === 'score' || visibility === 'breakdown' ? (result?.percentage ?? null) : null;

    let sections: AttemptSectionFeedback[] | null = null;
    if (visibility === 'breakdown') {
      const snapshot: SectionSnapshotEntry[] = JSON.parse(attempt.sectionSnapshotJson);
      const allQuestionIds = snapshot.flatMap((section) => section.questionIds);
      const [questions, answers] = await Promise.all([
        tx.question.findMany({ where: { id: { in: allQuestionIds } }, select: { id: true, marks: true } }),
        tx.answer.findMany({ where: { attemptId: attempt.id }, select: { questionId: true, marksAwarded: true } }),
      ]);
      const marksByQuestion = new Map(questions.map((question) => [question.id, question.marks]));
      const awardedByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.marksAwarded ?? 0]));
      sections = snapshot.map((section) => ({
        title: section.title,
        score: section.questionIds.reduce((sum, id) => sum + (awardedByQuestion.get(id) ?? 0), 0),
        maxScore: section.questionIds.reduce((sum, id) => sum + (marksByQuestion.get(id) ?? 0), 0),
      }));
    }

    return { status: 'settled', visibility, passFail, percentage, sections };
  }

  private async broadcastLeaderboard(organizationId: string, examId: string): Promise<void> {
    const rows = await this.leaderboardService.computeRecruiterView({ organizationId, isSuperAdmin: false }, examId);
    this.monitoringGateway.emitLeaderboardUpdate(examId, rows);
  }
}
