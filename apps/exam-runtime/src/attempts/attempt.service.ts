import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { LeaderboardService, AUTO_GRADABLE_QUESTION_TYPES, CandidateLeaderboardResponse } from '../leaderboard/leaderboard.service';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { AnswerDto } from './dto/answer.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { getProctoringEventSeverity } from './proctoring-severity';
import { ReportProctoringEventDto } from './dto/report-proctoring-event.dto';
import { shuffle } from './shuffle';
import { PistonClient, PistonExecuteResult } from '../code-execution/piston-client';
import { RunLimiter } from '../code-execution/run-limiter';
import { PISTON_LANGUAGE_MAP } from '../code-execution/piston-languages';
import { RunCodeDto } from './dto/run-code.dto';
import { WebcamViolationDto } from './dto/webcam-violation.dto';

interface AttemptQuestionOption {
  id: string;
  text: string;
}

interface AttemptQuestion {
  id: string;
  text: string;
  type: string;
  marks: number;
  codeLanguage: string | null;
  starterCode: string | null;
  allowStdin: boolean;
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
  isMarkedForReview: boolean;
}

interface AttemptMessageSummary {
  id: string;
  body: string;
  sentAt: Date;
}

interface AttemptPreviewResponse {
  exam: {
    title: string;
    instructions: string | null;
    durationMinutes: number;
    schedulingEnabled: boolean;
    availabilityWindowStart: Date | null;
    availabilityWindowEnd: Date | null;
  };
  schedulingWindowState: 'not_open' | 'open' | 'closed' | null;
}

interface AttemptStateResponse {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  exam: { title: string };
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
}

export type AttemptCurrentResponse = AttemptPreviewResponse | AttemptStateResponse;

@Injectable()
export class AttemptService {
  private readonly logger = new Logger(AttemptService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly monitoringGateway: MonitoringGateway,
    private readonly pistonClient: PistonClient,
    private readonly runLimiter: RunLimiter,
    private readonly leaderboardService: LeaderboardService,
  ) {}

  async getCurrent(session: CandidateSession): Promise<AttemptCurrentResponse> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        return {
          exam: {
            title: exam.title,
            instructions: exam.instructions,
            durationMinutes: exam.durationMinutes,
            schedulingEnabled: exam.schedulingEnabled,
            availabilityWindowStart: exam.availabilityWindowStart,
            availabilityWindowEnd: exam.availabilityWindowEnd,
          },
          schedulingWindowState: this.getSchedulingWindowState(exam),
        };
      }

      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      const sections = await this.loadSections(tx, settled.sectionSnapshotJson, settled.optionOrderJson);
      const answers = await tx.answer.findMany({ where: { attemptId: settled.id } });

      const unreadMessages = await tx.candidateMessage.findMany({ where: { attemptId: settled.id, readAt: null } });
      if (unreadMessages.length > 0) {
        await tx.candidateMessage.updateMany({ where: { attemptId: settled.id, readAt: null }, data: { readAt: new Date() } });
      }

      return {
        status: settled.status,
        remainingSeconds: this.attemptSettlement.remainingSeconds(exam, settled),
        webcamViolationCount: settled.webcamViolationCount,
        exam: { title: exam.title },
        sections,
        answers: answers.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionIds: JSON.parse(answer.selectedOptionIdsJson),
          answerText: answer.answerText,
          isMarkedForReview: answer.isMarkedForReview,
        })),
        messages: unreadMessages.map((message) => ({ id: message.id, body: message.body, sentAt: message.sentAt })),
      };
    });
  }

  async start(session: CandidateSession, dto: StartAttemptDto = {}): Promise<{ id: string; status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const existing = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (existing) {
        return { id: existing.id, status: existing.status };
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
        await tx.answer.upsert({
          where: { attemptId_questionId: { attemptId: settled.id, questionId: dto.questionId } },
          create: {
            attemptId: settled.id,
            questionId: dto.questionId,
            selectedOptionIdsJson: JSON.stringify([]),
            answerText: dto.answerText ?? null,
            isMarkedForReview,
          },
          update: {
            answerText: dto.answerText ?? null,
            isMarkedForReview,
            answeredAt: new Date(),
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

    const languageEntry = PISTON_LANGUAGE_MAP[question.codeLanguage as string];
    if (!languageEntry) {
      throw new BadRequestException(`Unsupported code language: ${question.codeLanguage}`);
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

  async reportProctoringEvent(
    session: CandidateSession,
    dto: ReportProctoringEventDto,
  ): Promise<{ id: string; eventType: string; severity: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }

      const event = await tx.proctoringEvent.create({
        data: {
          attemptId: attempt.id,
          eventType: dto.eventType,
          severity: getProctoringEventSeverity(dto.eventType),
          metadataJson: dto.metadata ? JSON.stringify(dto.metadata) : null,
        },
      });
      this.monitoringGateway.emitProctoringFlag(exam.id, {
        attemptId: attempt.id,
        candidateId: invitation.candidateId,
        eventType: event.eventType,
        severity: event.severity,
        occurredAt: event.occurredAt,
      });
      return { id: event.id, eventType: event.eventType, severity: event.severity };
    });
  }

  async webcamViolation(session: CandidateSession, dto: WebcamViolationDto): Promise<{ strike: number; status: string }> {
    const { organizationId, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      if (attempt.status !== 'in_progress') {
        throw new BadRequestException(`Cannot report a webcam violation — attempt status is "${attempt.status}"`);
      }
      const { attempt: updated, strike } = await this.attemptSettlement.registerWebcamViolation(tx, attempt, dto.reason, dto.snapshot);
      return { strike, status: updated.status };
    });
  }

  async getLeaderboard(session: CandidateSession): Promise<CandidateLeaderboardResponse> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);
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
      tx.invitation.findUnique({ where: { id: invitationId }, include: { exam: true } }),
    );
    if (!invitation || !invitation.exam) {
      throw new UnauthorizedException('Invalid candidate session');
    }
    return { organizationId: invitation.exam.organizationId, exam: invitation.exam, invitation };
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
            codeLanguage: question.codeLanguage,
            starterCode: question.starterCode,
            allowStdin: question.allowStdin,
            options: orderedOptions.map((option) => ({ id: option.id, text: option.text })),
          };
        }),
    }));
  }

  private async broadcastLeaderboard(organizationId: string, examId: string): Promise<void> {
    const rows = await this.leaderboardService.computeRecruiterView({ organizationId, isSuperAdmin: false }, examId);
    this.monitoringGateway.emitLeaderboardUpdate(examId, rows);
  }
}
