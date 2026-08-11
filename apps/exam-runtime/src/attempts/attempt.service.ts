import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Attempt, Prisma } from '@prisma/client';
import {
  TenantPrismaService,
  AuditService,
  isIpAllowed,
  BlobStorageService,
  AiApiKeyResolverService,
  buildSebConfig,
  requestConfigKeyHash,
  SystemEventsService,
  selectCountedAnswers,
  OrgSecretsCryptoService,
  encodeEmbedding,
  extractBase64FromDataUri,
  ALLOWED_DATA_URI_CONTENT_TYPES,
} from '@exam-platform/shared';
import { FaceEmbedderService } from '../face/face-embedder.service';
import { FaceVerificationService } from '../face/face-verification.service';
import { AttemptSettlementService, PauseReason, SettlementExam } from '../grading/attempt-settlement.service';
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
import { ScreenAnalysisDto } from './dto/screen-analysis.dto';
import { ClientErrorDto } from './dto/client-error.dto';
import { FaceEnrolmentDto } from './dto/face-enrolment.dto';
import { sanitizeMetadataOrDrop } from './sanitize-metadata';

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
  requiredCount: number | null;
  questions: AttemptQuestion[];
}

interface SectionSnapshotEntry {
  sectionId: string;
  title: string;
  targetDurationMinutes: number | null;
  // Frozen at attempt-start on purpose: a recruiter editing section weights afterwards must not
  // retroactively rescore a candidate who already sat the exam. Read back by
  // AttemptSettlementService's toGradableSections().
  weightPercent: number;
  // Frozen per-attempt like weightPercent: a recruiter changing the requirement afterwards must
  // not retroactively rescore a candidate who already sat the exam. null = every question required.
  requiredCount: number | null;
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
  organizationName: string | null;
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
  // Server-authoritative owner of the current pause -- null if not paused/blocked, or if this
  // attempt was already paused before this column shipped (no backfill; see resumeFromPause).
  // The client uses this instead of guessing from the violation counters.
  pausedReason: PauseReason | null;
  exam: { title: string; proctoring: ExamProctoringConfig };
  // Server-authoritative "must maintain a share" gate for the candidate's blocking overlay --
  // deliberately excludes "is currently sharing" (the client already knows that instantly via
  // its own MediaStream, and folding it in here would race a refetch against a share the
  // candidate just started/stopped). A bypass narrows what is punished, never what is watched,
  // so screenCaptureEnabled itself stays true under a bypass -- this is the one place that
  // combines it with the bypass to decide whether the candidate must be blocked over it.
  screenShareRequired: boolean;
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
  feedback: AttemptFeedback | null;
  organizationName: string | null;
  organizationLogoUrl: string | null;
  organizationPrimaryColor: string | null;
}

export type AttemptCurrentResponse = AttemptPreviewResponse | AttemptStateResponse;

// What the controller extracts from the incoming request for SEB verification: the ConfigKey
// hash header SEB attaches, and the absolute URL of this request exactly as the client
// addressed it (SEB hashes that URL string; TRUST_PROXY makes protocol/host trustworthy).
export interface SebRequestContext {
  configKeyHash: string | undefined;
  requestUrl: string;
}

// As of ADO #6810 fix round 1, none of this file's three upload call sites (webcamViolation,
// reportProctoringEvent, webcamSnapshot) run the blob upload inside a Prisma transaction anymore
// -- each does decide / upload / commit as separate forTenant calls, so a slow upload can no
// longer expire the interactive transaction's 5s timeout and lose a violation to an uncaught
// "Transaction already closed". This bound now exists purely to cap candidate-visible latency: an
// unbounded blob call would otherwise let a slow storage backend hang the HTTP response
// indefinitely. Keep bounding every upload site added to this file even though none of the
// current ones need it for the transaction-timeout reason anymore -- that reason returns instantly
// if an upload is ever moved back inside a transaction.
const SCREENSHOT_UPLOAD_TIMEOUT_MS = 3000;

// Server-authoritative screen-capture cap, enforced against Attempt.screenCaptureCount (see
// decideScreenCapture/commitScreenCapture below) -- not the client's own MAX_CAPTURES in
// useScreenCapture.ts, which is a separate, non-authoritative politeness limit.
const MAX_SCREEN_CAPTURES = 150;

// Server-authoritative floor between AI screen analyses per attempt. The client aims for ~75s;
// this guard is what actually bounds AI spend against a tampered client hammering the endpoint.
const SCREEN_ANALYSIS_MIN_INTERVAL_MS = 60_000;

const SCREEN_ANALYSIS_PROMPT =
  'This is a screenshot of an exam candidate\'s entire shared monitor during a proctored online exam. ' +
  'Check two things. (1) Remote access: is any remote-access or remote-control software UI visible -- ' +
  'AnyDesk, TeamViewer, Chrome Remote Desktop, RustDesk, VNC, Zoom/Teams/Meet screen-sharing or ' +
  'remote-control bars or borders, or any other indication this machine is being viewed or controlled ' +
  'remotely? (2) Background apps: are any messaging or communication apps visible as open windows or ' +
  'active/highlighted taskbar items (WhatsApp, Telegram, Discord, Slack, Teams chat, email), or any ' +
  'additional browser windows showing non-exam content (search results, AI chatbots, documentation)? ' +
  'The exam page itself asks the candidate to share their screen with the exam platform -- the ' +
  'browser\'s own "sharing this screen" bar for the exam tab alone is expected and must NOT be ' +
  'flagged, and merely-pinned (inactive) taskbar icons must NOT be flagged. Only flag what is ' +
  'genuinely visible and running.';

const SCREEN_ANALYSIS_TOOL = {
  name: 'report_screen_analysis',
  description: 'Report whether remote-access software or background apps are visible in the screenshot.',
  schema: {
    type: 'object' as const,
    properties: {
      remoteAccessVisible: { type: 'boolean', description: 'True only if third-party remote-access/control UI is visible.' },
      backgroundAppVisible: {
        type: 'boolean',
        description: 'True only if a messaging/communication app window or active taskbar item, or a non-exam browser window, is visible.',
      },
      toolName: { type: 'string', description: 'Name of the most significant tool/app detected, or "unknown".' },
      reasoning: { type: 'string', description: 'One sentence: what is visible and where.' },
    },
    required: ['remoteAccessVisible', 'backgroundAppVisible', 'toolName', 'reasoning'],
  },
};

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
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
    private readonly systemEvents: SystemEventsService,
    private readonly faceEmbedder: FaceEmbedderService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly faceVerification: FaceVerificationService,
  ) {}

  // ponytail: in-memory per-attempt floor between AI screen analyses -- single pm2 process, so a
  // Map is enough; move to a DB column or Redis if the runtime ever runs multi-instance.
  private readonly lastScreenAnalysisAt = new Map<string, number>();

  async getCurrent(session: CandidateSession): Promise<AttemptCurrentResponse> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);
    const {
      name: organizationName,
      logoUrl: organizationLogoUrl,
      primaryColor: organizationPrimaryColor,
    } = await this.getOrganizationBranding(organizationId);

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
          organizationName,
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
        pausedReason: settled.pausedReason as PauseReason | null,
        exam: { title: exam.title, proctoring: resolveProctoringConfig(exam, settled) },
        screenShareRequired: exam.enableAntiCheating && exam.screenCaptureEnabled && !isProctoringBypassActive(settled),
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
        organizationName,
        organizationLogoUrl,
        organizationPrimaryColor,
      };
    });
  }

  async getCodeLanguages(): Promise<{ languages: { language: string; version: string }[] }> {
    const languages = await this.pistonRuntimes.getAvailableLanguages();
    return { languages };
  }

  async start(
    session: CandidateSession,
    dto: StartAttemptDto = {},
    clientIp = '',
    seb?: SebRequestContext,
  ): Promise<{ id: string; status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    // Lockdown gate, before any attempt row exists: the request must carry the ConfigKey hash
    // only SEB running OUR generated config can produce (see packages/shared/src/seb). Checked
    // outside the transaction -- pure hashing, no I/O.
    this.enforceSebLockdown(exam, invitation.token, seb);

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
          weightPercent: section.weightPercent,
          requiredCount: section.requiredCount,
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
    const context = { organizationId, isSuperAdmin: false };

    // Phase 1: read-only decision, inside a transaction (RLS needs the session context set --
    // see TenantPrismaService.forTenant). No network I/O happens in here. If there's no screen
    // capture to upload -- capture off, no screenshot supplied, or already at the 150 cap -- this
    // phase does the entire write itself and returns a final result; see ADO #6810 for why an
    // upload must never be attempted inside this transaction.
    const phase1 = await this.tenantPrisma.forTenant(context, async (tx) => {
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
          pending: false as const,
          result: {
            id: '',
            eventType: dto.eventType,
            severity: 'low',
            strike: attempt.browserActivityViolationCount,
            status: attempt.status,
          },
        };
      }

      // Screenshots are server-authoritative, same as the signal guard above: a disabled
      // capture is ignored, not rejected, so a stale/tampered client can't force an upload
      // the recruiter turned off. `metadata` is the client's own data, sanitized here (strips
      // any client-forged `screenshot`/`screenshotCapReached` key -- those are only ever meant
      // to be set below, by us -- and drops it entirely if it can't be proven safe to
      // serialize; see sanitizeMetadataOrDrop). This pass is what protects the non-strike
      // branch below, which uses `metadata` directly with no further sanitization. The
      // strike-worthy branch's call into registerBrowserActivityViolation sanitizes its
      // `metadata` argument again internally -- that's not this pass being skipped, it's
      // registerBrowserActivityViolation's own guarantee for its *other* caller
      // (screenShareState's stop path), which never pre-sanitizes. The second pass here is
      // simply redundant, not wrong: sanitizeMetadataOrDrop is idempotent, so running
      // already-clean metadata through it twice changes nothing. `serverMetadata` carries our
      // own screenshot/cap-reached keys and is composed in *after* sanitization, never through
      // it -- the sanitizer's key filter matches "screenshot" as a substring, so running our
      // own keys through it would strip them right back out (that regression, and the fix, are
      // in scc-task-5-report.md fix round 6).
      const metadata = sanitizeMetadataOrDrop(dto.metadata, this.logger, attempt.id, dto.eventType);
      const screenDecision = this.decideScreenCapture(attempt, dto.screenshot, proctoring.screenCaptureEnabled);

      if (!screenDecision.shouldUpload) {
        const serverMetadata = screenDecision.capReached ? { screenshotCapReached: true } : undefined;
        const result = await this.writeProctoringEvent(tx, exam, invitation, attempt, dto.eventType, metadata, serverMetadata);
        return { pending: false as const, result };
      }

      // A real upload is needed -- nothing has been written yet, so this transaction can just
      // commit here. The upload happens with no transaction open; a second, short transaction
      // (phase 3 below) writes the result.
      return { pending: true as const, attempt, metadata };
    });

    if (!phase1.pending) {
      return phase1.result;
    }

    // Phase 2: the slow part, outside any transaction.
    const { attempt, metadata } = phase1;
    const screenshotUrl = await this.uploadScreenCapture(attempt.id, dto.screenshot as string);

    // Phase 3: write the result -- fast, DB-only, no I/O wait.
    return this.tenantPrisma.forTenant(context, async (tx) => {
      // Same re-read as webcamViolation's phase 3 below, and for the same reason: this matters
      // when dto.eventType is strike-worthy, since registerBrowserActivityViolation's
      // wasAlreadyPaused guard needs the attempt's *current* status/pausedReason, not phase 1's
      // pre-upload snapshot.
      const current = (await tx.attempt.findUnique({ where: { id: attempt.id } })) ?? attempt;
      const serverMetadata = await this.commitScreenCapture(tx, attempt.id, { capReached: false }, screenshotUrl);
      return this.writeProctoringEvent(tx, exam, invitation, current, dto.eventType, metadata, serverMetadata);
    });
  }

  // Shared by both branches of reportProctoringEvent (single-transaction fast path and the
  // upload-then-commit slow path) -- the strike-worthy/non-strike-worthy split and the event
  // write itself don't care which path got them here.
  private async writeProctoringEvent(
    tx: Prisma.TransactionClient,
    exam: SettlementExam,
    invitation: { candidateId: string },
    attempt: Attempt,
    eventType: string,
    metadata: Record<string, unknown> | undefined,
    serverMetadata: Record<string, unknown> | undefined,
  ): Promise<{ id: string; eventType: string; severity: string; strike: number; status: string }> {
    if (isStrikeWorthy(eventType)) {
      const { attempt: updated, strike, event } = await this.attemptSettlement.registerBrowserActivityViolation(
        tx,
        exam,
        attempt,
        eventType,
        metadata,
        serverMetadata,
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

    const combinedMetadata = metadata || serverMetadata ? { ...metadata, ...serverMetadata } : undefined;
    const event = await tx.proctoringEvent.create({
      data: {
        attemptId: attempt.id,
        eventType,
        severity: getProctoringEventSeverity(eventType),
        metadataJson: combinedMetadata ? JSON.stringify(combinedMetadata) : null,
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
  }

  async webcamViolation(session: CandidateSession, dto: WebcamViolationDto): Promise<{ strike: number; status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);
    const context = { organizationId, isSuperAdmin: false };

    // Phase 1: read-only decision (see reportProctoringEvent above for the same shape and why).
    // Unlike the screen capture, the webcam snapshot itself has no "skip" case once webcam
    // proctoring is enabled -- it always uploads -- so any non-skipped webcam violation needs
    // the full three-phase split.
    const phase1 = await this.tenantPrisma.forTenant(context, async (tx) => {
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
      const proctoring = resolveProctoringConfig(exam, attempt);
      if (!proctoring.webcamEnabled) {
        return { skip: true as const, strike: attempt.webcamViolationCount, status: attempt.status };
      }
      const screenDecision = this.decideScreenCapture(attempt, dto.screenshot, proctoring.screenCaptureEnabled);
      return { skip: false as const, attempt, screenDecision };
    });

    if (phase1.skip) {
      return { strike: phase1.strike, status: phase1.status };
    }
    const { attempt, screenDecision } = phase1;

    // Phase 2: the slow part -- outside any transaction, and run concurrently rather than
    // sequentially (this alone used to halve the worst case, back when both still ran inside the
    // transaction; see ADO #6810). Neither upload holds a pooled DB connection anymore.
    const [snapshotUrl, screenCaptureUrl] = await Promise.all([
      this.uploadWebcamSnapshot(attempt.id, dto.snapshot),
      screenDecision.shouldUpload ? this.uploadScreenCapture(attempt.id, dto.screenshot as string) : Promise.resolve(undefined),
    ]);

    // Phase 3: write the result -- fast, DB-only, no I/O wait.
    return this.tenantPrisma.forTenant(context, async (tx) => {
      // Re-read the attempt fresh rather than reusing phase 1's snapshot: that read is now up to
      // the upload's duration stale (see ADO #6810 fix round 1), long enough for a different
      // pause owner (screen_share, browser_activity) -- or a terminal state (blocked, submitted,
      // expired) -- to have committed in the meantime. registerWebcamViolation's isLive/
      // keepExistingPause guard needs the current status/pausedReason, not the one read before
      // the upload started.
      const current = (await tx.attempt.findUnique({ where: { id: attempt.id } })) ?? attempt;
      const screenMetadata = await this.commitScreenCapture(tx, attempt.id, screenDecision, screenCaptureUrl);
      const { attempt: updated, strike } = await this.attemptSettlement.registerWebcamViolation(
        tx,
        exam,
        current,
        dto.reason,
        snapshotUrl,
        screenMetadata,
      );
      return { strike, status: updated.status };
    });
  }

  // Runs with no open transaction -- see SCREENSHOT_UPLOAD_TIMEOUT_MS and ADO #6810 for why the
  // webcam snapshot upload must never run inside forTenant's interactive transaction. A failed or
  // slow upload logs and resolves to '' rather than throwing: the violation record is what
  // matters, losing the image is acceptable (registerWebcamViolation stores whatever string it's
  // given, including an empty one).
  // `decoded`, when given, is bytes already extracted by the caller (webcamSnapshot, to avoid
  // decoding the same data URI a second time for its face-mismatch check -- see finding 7) --
  // uploads them directly via the raw-buffer path instead of re-decoding through uploadDataUri.
  // webcamViolation has no such buffer lying around, so it omits `decoded` and keeps going
  // through uploadDataUri exactly as before.
  private async uploadWebcamSnapshot(
    attemptId: string,
    snapshot: string,
    decoded?: { contentType: string; buffer: Buffer },
  ): Promise<string> {
    try {
      const blobPath = `webcam-snapshots/${attemptId}-${Date.now()}.jpg`;
      const upload = decoded
        ? this.blobStorage.upload(blobPath, decoded.buffer, decoded.contentType)
        : this.blobStorage.uploadDataUri(blobPath, snapshot);
      return await withTimeout(upload, SCREENSHOT_UPLOAD_TIMEOUT_MS);
    } catch (error) {
      this.logger.error('Failed to upload webcam snapshot', error as Error);
      return '';
    }
  }

  // Shared by reportProctoringEvent and webcamViolation. Split into three steps (decide / upload
  // / commit, below) so the upload -- the slow part -- runs with no Prisma transaction open. See
  // ADO #6810: the old shape ran this upload (and, for webcamViolation, the webcam snapshot
  // upload too) inside the same interactive transaction as the DB writes, which routinely blew
  // Prisma's 5s timeout on its own, with no contention required, and lost the violation outright
  // when it did.
  //
  // The cap is read from Attempt.screenCaptureCount, a real counter column -- not a scan over
  // stored metadataJson. The old design counted prior events with a `LIKE '%"screenshot":%'`
  // query, which five review rounds each found a new way to fool (a nested key, a quote-smuggled
  // key, a fullwidth key, fullwidth punctuation inside an ordinary value -- see
  // sanitize-metadata.ts's history). A JS filter can never fully mirror what a SQL collation
  // folds, and a collation change to `_AI` would have reopened it silently. A counter has no text
  // to fool: it only moves when commitScreenCapture below increments it, and only after a real
  // upload lands (never on a skipped or failed one).
  //
  // decideScreenCapture's read and commitScreenCapture's increment are no longer in the same
  // transaction -- they're now separated by the upload, which runs entirely outside either one.
  // That does not widen the cap's existing race window: the read was already a plain, non-locking
  // read of Attempt.screenCaptureCount reused as a stale JS value across the (already slow)
  // upload and the later increment, so the gap between "decide" and "commit" is the same upload
  // duration either way -- only its location moved, from inside one transaction to between two.
  // Concurrent requests arriving before either commits can still each see a count under the cap
  // and each upload; the overshoot is bounded by the number of requests in flight at that instant
  // and one-shot (the atomic `{ increment: 1 }` can't lose an update, so the counter is exactly
  // correct once everything commits). Accepted as-is, same as before this split: the only
  // exploitable direction is *extra* screenshots, not the evidence blackout this feature exists
  // to prevent. If strict enforcement is ever wanted, replace commitScreenCapture's read+update
  // pair with
  // `tx.attempt.updateMany({ where: { id, screenCaptureCount: { lt: MAX_SCREEN_CAPTURES } }, data: { screenCaptureCount: { increment: 1 } } })`
  // and check its affected count.

  // No I/O -- server-authoritative decision taken from the same in-transaction attempt read the
  // caller already has. Gates whether uploadScreenCapture below should even be attempted.
  private decideScreenCapture(
    attempt: { screenCaptureCount: number },
    screenshot: string | undefined,
    screenCaptureEnabled: boolean,
  ): { shouldUpload: boolean; capReached: boolean } {
    if (!screenshot || !screenCaptureEnabled) {
      return { shouldUpload: false, capReached: false };
    }
    if (attempt.screenCaptureCount >= MAX_SCREEN_CAPTURES) {
      return { shouldUpload: false, capReached: true };
    }
    return { shouldUpload: true, capReached: false };
  }

  // Runs with no open transaction. A failed or slow upload logs and resolves to undefined rather
  // than throwing or blocking -- the violation record is what matters, losing the image isn't
  // fatal.
  private async uploadScreenCapture(attemptId: string, screenshot: string): Promise<string | undefined> {
    try {
      return await withTimeout(
        this.blobStorage.uploadDataUri(`screen-captures/${attemptId}-${Date.now()}.jpg`, screenshot),
        SCREENSHOT_UPLOAD_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.error('Failed to upload screen capture', error as Error);
      return undefined;
    }
  }

  // Called inside the write transaction, after the upload (if any) has already finished outside
  // it. Only increments Attempt.screenCaptureCount when a real upload actually landed -- never on
  // a skipped, disabled, capped, or failed upload -- so the counter only ever reflects images
  // actually stored.
  private async commitScreenCapture(
    tx: Prisma.TransactionClient,
    attemptId: string,
    decision: { capReached: boolean },
    screenshotUrl: string | undefined,
  ): Promise<Record<string, unknown> | undefined> {
    if (decision.capReached) {
      return { screenshotCapReached: true };
    }
    if (!screenshotUrl) {
      return undefined;
    }
    try {
      // Kept in its own try/catch so a DB failure here isn't misreported as an upload failure --
      // the upload already succeeded, so the event still gets its screenshot url either way;
      // only the counter risks drifting low if this throws.
      await tx.attempt.update({ where: { id: attemptId }, data: { screenCaptureCount: { increment: 1 } } });
    } catch (error) {
      this.logger.error('Failed to increment screenCaptureCount after a successful screen-capture upload', error as Error);
    }
    return { screenshot: screenshotUrl };
  }

  // Candidate-browser failure reporting: the exam page posts its own errors (failed saves,
  // JS crashes, webcam loss) here so exam-day failures are diagnosable from the admin
  // console instead of dying silently on the candidate's machine. Best-effort by contract
  // (SystemEventsService.record never throws), and the response carries nothing.
  async reportClientError(session: CandidateSession, dto: ClientErrorDto): Promise<void> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);
    const attempt = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.attempt.findUnique({ where: { invitationId: invitation.id }, select: { id: true } }),
    );
    await this.systemEvents.record({
      organizationId,
      service: 'candidate-browser',
      severity: dto.severity ?? 'error',
      message: `${dto.kind}: ${dto.message}`,
      context: {
        kind: dto.kind,
        attemptId: attempt?.id ?? null,
        candidateId: invitation.candidateId,
        examId: exam.id,
        invitationId: invitation.id,
        ...(dto.detail ? { detail: dto.detail } : {}),
      },
    });
  }

  // The candidate's personal .seb file: SEB opens straight into their own start link, and the
  // embedded settings yield the ConfigKey that enforceSebLockdown verifies on start. Available
  // from the welcome page (behind candidate auth) only when the exam actually requires it.
  async getSebConfig(session: CandidateSession): Promise<{ plistXml: string }> {
    const { exam, invitation } = await this.resolveContext(session.invitationId);
    if (!exam.enableAntiCheating || !exam.lockdownRequired) {
      throw new BadRequestException('This exam does not require Safe Exam Browser');
    }
    return { plistXml: buildSebConfig({ startUrl: this.sebStartUrl(invitation.token) }).plistXml };
  }

  private sebStartUrl(invitationToken: string): string {
    return `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/start?token=${invitationToken}`;
  }

  private enforceSebLockdown(
    exam: { enableAntiCheating: boolean; lockdownRequired: boolean },
    invitationToken: string,
    seb?: SebRequestContext,
  ): void {
    if (!exam.enableAntiCheating || !exam.lockdownRequired) {
      return;
    }
    const expected = seb
      ? requestConfigKeyHash(seb.requestUrl, buildSebConfig({ startUrl: this.sebStartUrl(invitationToken) }).configKey)
      : undefined;
    if (!seb?.configKeyHash || seb.configKeyHash.toLowerCase() !== expected) {
      // Not secret material: the hash derives from a config the candidate already holds.
      // Deliberately verbose -- the ConfigKey algorithm has never been validated against a
      // real SEB client (ADO #6858), and this is the only way to see WHY a real SEB request
      // failed: header absent entirely vs. hash mismatch (algorithm or URL reconstruction).
      this.logger.warn(
        `SEB lockdown rejected start: headerPresent=${Boolean(seb?.configKeyHash)} received=${seb?.configKeyHash ?? 'none'} expected=${expected ?? 'n/a'} requestUrl=${seb?.requestUrl ?? 'n/a'}`,
      );
      throw new ForbiddenException(
        'This exam must be started inside Safe Exam Browser. Download the exam configuration from the welcome page and open it in SEB.',
      );
    }
  }

  // Periodic AI check of the candidate's shared monitor for remote-access tool UI (AnyDesk,
  // TeamViewer, Zoom remote control, ...). A browser cannot see other processes, so this vision
  // pass over the already-mandatory full-monitor share is the only browser-side signal we have
  // for a helper remotely viewing/controlling the machine. Flags are evidence for recruiter
  // review -- high severity, never a strike/auto-block, because a vision-model false positive
  // must not end a live attempt.
  async analyzeScreenCapture(session: CandidateSession, dto: ScreenAnalysisDto): Promise<{ status: 'flagged' | 'clear' | 'skipped' }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);
    const context = { organizationId, isSuperAdmin: false };

    // Phase 1: cheap in-tx read, server-authoritative gates only. No network I/O in here.
    const phase1 = await this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      const proctoring = resolveProctoringConfig(exam, attempt);
      if (!proctoring.screenCaptureEnabled || attempt.status !== 'in_progress') {
        return null;
      }
      return attempt;
    });
    if (!phase1) {
      return { status: 'skipped' };
    }

    const now = Date.now();
    if (now - (this.lastScreenAnalysisAt.get(phase1.id) ?? 0) < SCREEN_ANALYSIS_MIN_INTERVAL_MS) {
      return { status: 'skipped' };
    }
    this.lastScreenAnalysisAt.set(phase1.id, now);

    // The AI call runs with no transaction open, same rule as every upload in this file. An org
    // without AI configured (resolve throws) or a failed/slow model call just skips -- periodic
    // analysis is best-effort, the violation-triggered capture pipeline is unaffected.
    let flagged: { eventType: 'remote_access_suspected' | 'background_app_detected'; toolName: string; reasoning: string } | null = null;
    try {
      const aiProvider = await this.aiApiKeyResolver.resolve(organizationId);
      const verdict = await aiProvider.generateStructured({
        modelTier: 'fast',
        maxTokens: 300,
        prompt: SCREEN_ANALYSIS_PROMPT,
        images: [dto.screenshot],
        tool: SCREEN_ANALYSIS_TOOL,
      });
      // Remote access outranks a background app when both are visible -- one event per
      // analysis, carrying the single most serious finding.
      if (verdict.remoteAccessVisible === true || verdict.backgroundAppVisible === true) {
        flagged = {
          eventType: verdict.remoteAccessVisible === true ? 'remote_access_suspected' : 'background_app_detected',
          toolName: String(verdict.toolName ?? 'unknown'),
          reasoning: String(verdict.reasoning ?? ''),
        };
      }
    } catch (error) {
      this.logger.warn(`Screen analysis skipped for attempt ${phase1.id}: ${(error as Error).message}`);
      return { status: 'skipped' };
    }

    // Same ledger the other AI features write -- one credit per analysis call, billed whether or
    // not it flags (the spend happened either way).
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiCreditUsage.create({ data: { organizationId, source: 'screen_analysis', credits: 1, sourceId: phase1.id } }),
    );

    if (!flagged) {
      return { status: 'clear' };
    }

    // Flagged: persist the evidence via the same decide / upload / commit split as every other
    // capture site (see ADO #6810). Cap-aware -- a capped attempt still gets the event, just
    // without a stored image.
    const decision = this.decideScreenCapture(phase1, dto.screenshot, true);
    const screenshotUrl = decision.shouldUpload ? await this.uploadScreenCapture(phase1.id, dto.screenshot) : undefined;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const serverMetadata = await this.commitScreenCapture(tx, phase1.id, decision, screenshotUrl);
      const metadata = { ...serverMetadata, toolName: flagged.toolName, reasoning: flagged.reasoning };
      const event = await tx.proctoringEvent.create({
        data: {
          attemptId: phase1.id,
          eventType: flagged.eventType,
          severity: getProctoringEventSeverity(flagged.eventType),
          metadataJson: JSON.stringify(metadata),
        },
      });
      this.monitoringGateway.emitProctoringFlag(exam.id, {
        attemptId: phase1.id,
        candidateId: invitation.candidateId,
        eventType: event.eventType,
        severity: event.severity,
        occurredAt: event.occurredAt,
      });
      return { status: 'flagged' as const };
    });
  }

  async webcamSnapshot(session: CandidateSession, dto: WebcamSnapshotDto): Promise<{ ok: true }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    // Unlike webcamViolation/reportProctoringEvent, this touches only Attempt (a single read) and
    // ProctoringEvent (a single create) -- neither RLS-protected -- and needs no multi-statement
    // atomicity, so both calls run on the plain client instead of forTenant (see ADO #6809).
    // Isolation still comes from invitation.id, resolved above through the candidate's own
    // session, not from an organizationId predicate or RLS. This fires unconditionally every
    // 120-180s for the whole exam (useWebcamMonitor.ts), so at volume it used to hold far more of
    // the pool's 25 slots over time than the bursty violation paths ever would.
    const attemptId = await this.tenantPrisma.withoutTenantScope(async (client) => {
      const attempt = await client.attempt.findUnique({ where: { invitationId: invitation.id } });
      return attempt?.id ?? null;
    });
    if (!attemptId) {
      return { ok: true };
    }

    // Decoded once, here, and reused below for both the upload and the face-mismatch check --
    // this endpoint fires every 120-180s per candidate carrying multi-MB images, so decoding the
    // same bytes twice (once per consumer) was measurable, wasted CPU (task-8 finding 7).
    // `snapshotUpload` is only populated when the content type is one uploadDataUri would also
    // have accepted -- an unsupported/malformed data URI falls back to the string path below so
    // uploadWebcamSnapshot's existing validation and error handling still apply unchanged.
    const parsedSnapshot = extractBase64FromDataUri(dto.snapshot);
    const snapshotBuffer = parsedSnapshot ? Buffer.from(parsedSnapshot.base64, 'base64') : null;
    const snapshotUpload =
      parsedSnapshot && ALLOWED_DATA_URI_CONTENT_TYPES.has(parsedSnapshot.contentType)
        ? { contentType: parsedSnapshot.contentType, buffer: snapshotBuffer as Buffer }
        : undefined;

    const snapshotUrl = await this.uploadWebcamSnapshot(attemptId, dto.snapshot, snapshotUpload);

    await this.tenantPrisma.withoutTenantScope(async (client) => {
      await client.proctoringEvent.create({
        data: { attemptId, eventType: 'webcam_snapshot', severity: 'low', metadataJson: JSON.stringify({ snapshot: snapshotUrl }) },
      });
    });

    // Fire-and-forget, relative to THIS response -- deliberately not awaited. verifySnapshot()'s
    // embed call is exactly the kind of slow I/O that must never sit in the candidate's hot path
    // (this endpoint fires every 120-180s for the whole exam; see the comment above). A .catch is
    // required, not optional: Node 24 defaults to --unhandled-rejections=throw and main.ts installs
    // no unhandledRejection handler, so an uncaught rejection here kills the whole exam-runtime
    // process -- every concurrent candidate's exam, not just this one. checkFaceMismatch is an
    // `async` method, so it can never throw synchronously either -- a bare .catch() on its returned
    // promise is sufficient (contrast the void-IIFE idiom in internal.controller.ts, needed there
    // because those callees are not themselves guaranteed to be async).
    if (exam.faceVerificationEnabled && snapshotBuffer) {
      void this.checkFaceMismatch(attemptId, organizationId, snapshotBuffer, snapshotUrl || null, exam.faceMismatchAction).catch(
        (error) => this.logger.warn(`Face mismatch check failed for attempt ${attemptId}: ${String(error)}`),
      );
    }

    return { ok: true };
  }

  // Stage-2 gate (task-8 brief): on a confirmed mismatch, only 'flag' may affect the candidate --
  // and verifySnapshot() already applied it unconditionally by recording the event and
  // incrementing Attempt.faceMismatchCount, so there is nothing left to do for it here.
  // warn/pause/block are accepted and stored (resolveFaceIdFields on the API side,
  // ExamDetailsForm's recruiter control) so recruiters can select them today, but enforcement
  // beyond flag is deliberately deferred to stage 3 pending threshold calibration and a fairness
  // check. Pinned by attempt.service.spec.ts: a confirmed mismatch on an exam set to 'block' must
  // not pause or block anyone yet. Extend this switch, not the gate itself, once stage 3 lands.
  private async checkFaceMismatch(
    attemptId: string,
    organizationId: string,
    snapshotBuffer: Buffer,
    snapshotPath: string | null,
    faceMismatchAction: string,
  ): Promise<void> {
    const outcome = await this.faceVerification.verifySnapshot(attemptId, organizationId, snapshotBuffer, snapshotPath);
    if (!outcome.confirmed || faceMismatchAction === 'flag') return;
    this.logger.debug(
      `Confirmed face mismatch on attempt ${attemptId}: action '${faceMismatchAction}' is stored but not yet enforced (stage 3)`,
    );
  }

  async recordFaceEnrolment(session: CandidateSession, dto: FaceEnrolmentDto): Promise<{ status: string }> {
    // Consent is the lawful basis for holding an IMAGE of the candidate's face, so no consent
    // means no image -- ever. It is NOT a reason to record nothing at all: a candidate who
    // declines must leave a flag with their name on it rather than silence, otherwise they are
    // indistinguishable from an exam that never had the feature switched on. That row carries
    // no image and no consentAt.
    if (!dto.consentGiven && (dto.status === 'enrolled' || dto.snapshot)) {
      throw new BadRequestException('Face enrolment requires the candidate’s consent');
    }
    const { organizationId, invitation } = await this.resolveContext(session.invitationId);
    const attempt = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.attempt.findUnique({ where: { invitationId: invitation.id }, select: { id: true } }),
    );
    if (!attempt) {
      throw new BadRequestException('Cannot enrol before the attempt has started');
    }

    // Upload OUTSIDE the transaction: a slow blob write inside forTenant holds a pooled
    // connection for its whole duration and starves concurrent candidates.
    let referenceImagePath: string | null = null;
    if (dto.status === 'enrolled' && dto.snapshot) {
      const url = await this.blobStorage.uploadDataUri(`face/${attempt.id}.jpg`, dto.snapshot);
      // Store the PATH, never a signed URL -- a stored SAS expires and cannot be re-signed.
      referenceImagePath = url.split('?')[0];
    }

    // "enrolled" with nothing behind it renders as "Verified" to a recruiter, which is worse
    // than an honest "Not verified" -- so an enrolment that stored no image is not one.
    const status = dto.status === 'enrolled' && !referenceImagePath ? 'not_verified' : dto.status;

    // Best-effort, same as the upload above: still outside any transaction, and never allowed to
    // block enrolment. Neither failure mode here can cost a candidate their exam: embed()
    // degrades to null (never throws) whenever the model weights are missing, the image can't
    // be decoded, or anything else goes wrong; encrypt() DOES throw (missing/invalid
    // ORG_SECRETS_ENCRYPTION_KEY), so it's wrapped the same way -- either failure just leaves
    // embedding null. The reference image already recorded above is what actually matters for a
    // candidate to sit their exam.
    let embedding: string | null = null;
    if (referenceImagePath && dto.snapshot) {
      const base64 = extractBase64FromDataUri(dto.snapshot)?.base64;
      const vector = base64 ? await this.faceEmbedder.embed(Buffer.from(base64, 'base64')) : null;
      // Biometric data under GDPR -- never persisted as a bare vector, even transiently in this
      // row object.
      if (vector) {
        try {
          embedding = this.crypto.encrypt(encodeEmbedding(vector));
        } catch (error) {
          this.logger.warn(`Face embedding encryption failed: ${String(error)}`);
        }
      }
    }

    const rowBase = {
      status,
      referenceImagePath,
      qualityJson: dto.qualityJson ?? null,
      consentAt: dto.consentGiven ? new Date() : null,
      capturedAt: referenceImagePath ? new Date() : null,
    };
    await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.faceEnrolment.upsert({
        where: { attemptId: attempt.id },
        create: { attemptId: attempt.id, ...rowBase, embedding },
        // A retry that produces no embedding (model briefly unavailable) must not overwrite a
        // previously-stored good vector with null -- only touch the column when there's a new
        // value to write. Note the consequence: the reference image path is deterministic, so a
        // retry overwrites the photo while keeping the earlier vector. Keeping the first vector
        // is the safer side to err on -- it is the one enrolled under the original capture, so a
        // later substituted photo cannot quietly become the thing every snapshot is matched to.
        update: { ...rowBase, ...(embedding ? { embedding } : {}) },
      }),
    );
    return { status };
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
      // webcam and browser_activity are both strike pauses cleared by acknowledgement and share
      // this one resume action; screen_share is a precondition, only clearable by actually
      // sharing again (screenShareState's active:true path) -- resuming it here would let the
      // candidate wave away a still-unmet "must be sharing" requirement.
      if (attempt.pausedReason === 'screen_share') {
        throw new BadRequestException('Cannot resume — this attempt is paused pending screen sharing, not a strike');
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

      // displaySurface/userAgent are both optional -- build the object only when at least one
      // is actually present. `{ displaySurface: undefined, userAgent: undefined }` is a
      // non-null object literal (always truthy), and JSON.stringify silently drops
      // undefined-valued keys, so passing that ever-truthy shape through unconditionally
      // writes metadataJson: "{}" instead of null, unlike every other metadata-less event.
      const shareMetadata =
        dto.displaySurface !== undefined || dto.userAgent !== undefined
          ? { displaySurface: dto.displaySurface, userAgent: dto.userAgent }
          : undefined;

      if (dto.active) {
        let current = attempt;
        // Only a genuine start (previously not sharing) sets the timestamp and records the
        // event -- a repeated active:true call must not double-record.
        if (!attempt.screenShareStartedAt) {
          current = await tx.attempt.update({ where: { id: attempt.id }, data: { screenShareStartedAt: new Date() } });
          // displaySurface/userAgent are client-controlled free text -- route through the same
          // shared guard as every other metadata write (see sanitize-metadata.ts).
          const startedMetadata = sanitizeMetadataOrDrop(shareMetadata, this.logger, attempt.id, 'screen_share_started');
          await tx.proctoringEvent.create({
            data: {
              attemptId: attempt.id,
              eventType: 'screen_share_started',
              severity: getProctoringEventSeverity('screen_share_started'),
              metadataJson: startedMetadata ? JSON.stringify(startedMetadata) : null,
            },
          });
        }
        // Mirror of the active:false pause rule: resume only lifts a `paused` attempt.
        // A `blocked` (or any other non-paused) attempt must not be handed a way to
        // un-block itself by stopping and restarting its share.
        if (current.status !== 'paused') {
          return { status: current.status };
        }
        // A pause owned by webcam or browser_activity must not be cleared by resharing --
        // that only satisfies *this* precondition, not whatever strike actually paused the
        // attempt. (A pausedReason predating this column is null and falls through here,
        // same safe default as everywhere else.)
        if (current.pausedReason === 'webcam' || current.pausedReason === 'browser_activity') {
          return { status: current.status };
        }
        // Meeting a precondition is not a recruiter pardon: resume without resetting counters.
        const resumed = await this.attemptSettlement.resumeFromPause(tx, current);
        return { status: resumed.status };
      }

      // active: false
      let current = attempt;
      if (attempt.screenShareStartedAt) {
        // A page refresh (or tab crash) cannot carry a getDisplayMedia stream across
        // navigation, so the mount-time effect reports reason:'absent' -- indistinguishable
        // from deliberate tampering, so it must not cost a strike. Only reason:'ended' (the
        // browser's Stop-sharing control, or a missing reason from an older client) is a
        // genuine stop and goes through registerBrowserActivityViolation, which is also the
        // only writer of screen_share_stopped anywhere. Either way the timestamp is cleared,
        // which is what makes a repeated active:false call a no-op.
        if ((dto.reason ?? 'ended') === 'ended') {
          const { attempt: struck } = await this.attemptSettlement.registerBrowserActivityViolation(
            tx,
            exam,
            attempt,
            'screen_share_stopped',
            shareMetadata,
          );
          current = struck;
        } else {
          // 'absent' skips the strike, but must not skip the record -- registerBrowserActivityViolation
          // above is the only writer of this event type, so skipping it entirely would leave a
          // tampered client that always sends 'absent' free to stop sharing with zero trace in
          // the recruiter's proctoring log (emitAttemptStatus is a websocket event, not
          // persisted). Low severity and a { reason: 'absent' } marker distinguish this from a
          // real, strike-worthy stop in the log.
          await tx.proctoringEvent.create({
            data: {
              attemptId: attempt.id,
              eventType: 'screen_share_stopped',
              severity: 'low',
              metadataJson: JSON.stringify({ reason: 'absent' }),
            },
          });
        }
        current = await tx.attempt.update({ where: { id: current.id }, data: { screenShareStartedAt: null } });
      }

      // Pausing for a missing share is a precondition, not enforcement -- it applies even
      // in warn mode, and never downgrades an already-blocked attempt. A bypassed attempt
      // is exempt from the pause entirely (but not from the strike recorded above).
      if (current.status === 'in_progress' && !isProctoringBypassActive(current)) {
        current = await tx.attempt.update({ where: { id: current.id }, data: { status: 'paused', pausedAt: new Date(), pausedReason: 'screen_share' } });
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

  private async getOrganizationBranding(
    organizationId: string,
  ): Promise<{ name: string | null; logoUrl: string | null; primaryColor: string | null }> {
    const organization = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.organization.findUnique({ where: { id: organizationId }, select: { name: true, logoPath: true, primaryColor: true } }),
    );
    return {
      name: organization?.name ?? null,
      // logoPath holds the FULL blob URL that blobStorage.upload() returns -- it is the
      // only writer of the column. This previously built `${API_ORIGIN}/uploads/${logoPath}`,
      // which concatenated an origin onto an absolute URL and produced an unfetchable
      // address. It went unnoticed because no organisation in production has ever uploaded
      // a logo (logo_path is NULL), so the branch never ran; it would have broken every
      // candidate-facing logo the moment one did.
      //
      // signIfOurs() then mints a short-lived read-only SAS, because the blob container is
      // private and the raw URL 403s in a browser. It passes through unchanged for a
      // foreign URL or when storage is unconfigured (local dev), and never throws.
      logoUrl: ((await this.blobStorage.signIfOurs(organization?.logoPath ?? null)) as string | null) ?? null,
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

    // Question/option images live in the private blob container, so the raw stored URL 404s for the
    // candidate's browser -- mint a short-lived read SAS the same way logos/proctoring evidence do.
    return Promise.all(
      snapshot.map(async (section) => ({
        title: section.title,
        targetDurationMinutes: section.targetDurationMinutes,
        requiredCount: section.requiredCount ?? null,
        questions: await Promise.all(
          section.questionIds
            .map((questionId) => questionsById.get(questionId))
            .filter((question): question is NonNullable<typeof question> => question !== undefined)
            .map(async (question) => {
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
                imageUrl: (await this.blobStorage.signIfOurs(question.imageUrl)) as string | null,
                options: await Promise.all(
                  orderedOptions.map(async (option) => ({
                    id: option.id,
                    text: option.text,
                    imageUrl: (await this.blobStorage.signIfOurs(option.imageUrl)) as string | null,
                  })),
                ),
              };
            }),
        ),
      })),
    );
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
      // Route through the same best-N helper grading.ts and reports.service.ts already use --
      // this is the candidate's own result screen, so a flat sum here would print a section line
      // that contradicts the percentage shown right above it under best-N/negative marking.
      sections = snapshot.map((section) => {
        const counted = selectCountedAnswers(
          section.questionIds.map((questionId) => ({
            questionId,
            marks: marksByQuestion.get(questionId) ?? 0,
            marksAwarded: awardedByQuestion.get(questionId) ?? 0,
          })),
          // A legacy snapshot (written before this feature shipped) has no requiredCount key at
          // all -- undefined, not null -- so it must resolve the same way toGradableSections()
          // does, or a pre-feature attempt's breakdown would stop matching today's output.
          section.requiredCount ?? null,
        );
        return { title: section.title, score: counted.score, maxScore: counted.maxScore };
      });
    }

    return { status: 'settled', visibility, passFail, percentage, sections };
  }

  private async broadcastLeaderboard(organizationId: string, examId: string): Promise<void> {
    const rows = await this.leaderboardService.computeRecruiterView({ organizationId, isSuperAdmin: false }, examId);
    this.monitoringGateway.emitLeaderboardUpdate(examId, rows);
  }
}
