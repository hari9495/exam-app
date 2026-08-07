import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Exam, ExamSection, ExamSectionPoolTag, ExamSectionQuestion, Prisma, Question, QuestionOption } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { BlobStorageService } from '@exam-platform/shared';
import { ExamRuntimeInternalClient } from '../exam-runtime-client/exam-runtime-internal.client';
import { CreateExamDto, TOGGLEABLE_PROCTORING_SIGNALS } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { CreateExamSectionDto } from './dto/create-exam-section.dto';
import { UpdateExamSectionDto } from './dto/update-exam-section.dto';
import { validateSectionQuestionsReplace } from './exam-section-question-validation';
import { resolvePaginationParams, buildPaginatedResponse, PaginatedResponse } from '../common/paginated-response';

type ExamSectionWithQuestions = ExamSection & {
  questions: (ExamSectionQuestion & { question: Question & { options: QuestionOption[] } })[];
  poolTags?: ExamSectionPoolTag[];
};

// A recruiter checking pool health doesn't need every match, just enough to sanity-check the
// criteria -- totalMatching (a separate count(), uncapped) is what actually answers "is there
// enough?"; this only bounds the list rendered underneath it.
const POOL_PREVIEW_MAX_QUESTIONS = 50;

export interface PoolPreview {
  poolSize: number;
  poolDifficulty: string | null;
  poolTags: { id: string; name: string }[];
  totalMatching: number;
  questions: { id: string; text: string; type: string; difficulty: string; marks: number }[];
}

interface ExamFilters {
  status?: string;
  page?: string;
  pageSize?: string;
  search?: string;
}

export const SETTLED_ATTEMPT_STATUSES = ['submitted', 'auto_submitted', 'force_submitted'];

export interface ExamResultRow {
  candidateId: string;
  candidateName: string;
  invitationId: string;
  attemptId: string | null;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: Date | null;
  proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
  integrityAnalysis: { status: string; level: string | null; flagsJson: string | null; narrative: string | null } | null;
  integrityLevel: string | null;
  integrityFlagCount: number;
  /**
   * The invite created by advancing this candidate to another exam FROM this one, so the
   * recruiter can see whether it actually reached them. Null when they were never advanced.
   * Only invitations stamped with advancedFromExamId count -- an unrelated hand-made invite
   * to another exam must not read as "advanced from here".
   */
  nextRound?: { examTitle: string; emailStatus: string; invitedAt: Date } | null;
}

// ponytail: flagsJson is LLM-produced, unlike the app's own JSON blobs — guard against malformed content.
function countIntegrityFlags(flagsJson: string | null): number {
  if (!flagsJson) {
    return 0;
  }
  try {
    const parsed = JSON.parse(flagsJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export interface PendingGradingCodeQuestion {
  questionId: string;
  questionText: string;
  starterCode: string | null;
  codeLanguage: string | null;
  answerText: string | null;
  marks: number;
  marksAwarded: number | null;
  gradingFeedback: string | null;
}

export interface PendingGradingRow {
  attemptId: string;
  candidateId: string;
  candidateName: string;
  codeQuestions: PendingGradingCodeQuestion[];
}

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly examRuntime: ExamRuntimeInternalClient,
    private readonly audit: AuditService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  // Question/option images sit in the private blob container; the raw stored path
  // 404s in the browser, so mint a short-lived read SAS on the way out -- same
  // pattern QuestionsService.toResponse already uses. The exam-detail response
  // embeds full question records too (for the editor and preview to render
  // without a second, separately-filtered fetch), so it needs the same signing.
  private async signSectionQuestionImages(sections: ExamSectionWithQuestions[]): Promise<ExamSectionWithQuestions[]> {
    return Promise.all(
      sections.map(async (section) => ({
        ...section,
        questions: await Promise.all(
          section.questions.map(async (sectionQuestion) => ({
            ...sectionQuestion,
            question: {
              ...sectionQuestion.question,
              imageUrl: (await this.blobStorage.signIfOurs(sectionQuestion.question.imageUrl ?? null)) as string | null,
              options: await Promise.all(
                sectionQuestion.question.options.map(async (option) => ({
                  ...option,
                  imageUrl: (await this.blobStorage.signIfOurs(option.imageUrl ?? null)) as string | null,
                })),
              ),
            },
          })),
        ),
      })),
    );
  }

  private resolveSchedulingFields(
    schedulingEnabled: boolean | undefined,
    availabilityWindowStart: string | undefined,
    availabilityWindowEnd: string | undefined,
  ): { schedulingEnabled: boolean; availabilityWindowStart: Date | null; availabilityWindowEnd: Date | null } {
    if (!schedulingEnabled) {
      return { schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null };
    }
    if (!availabilityWindowStart || !availabilityWindowEnd) {
      throw new BadRequestException('Scheduling requires both an availability window start and end');
    }
    const start = new Date(availabilityWindowStart);
    const end = new Date(availabilityWindowEnd);
    if (end <= start) {
      throw new BadRequestException('The availability window end must be after its start');
    }
    return { schedulingEnabled: true, availabilityWindowStart: start, availabilityWindowEnd: end };
  }

  // Mirrors resolveSchedulingFields' write-time-nulling approach: when the master switch is
  // off, every dependent field is forced off in the row itself (not just left unsubmitted),
  // so a reader that forgets to check enableAntiCheating still sees a genuinely-off config --
  // same "the DB row can't lie" guarantee, extended to a five-field group instead of two.
  private resolveProctoringFields(dto: {
    enableAntiCheating?: boolean;
    webcamProctoringEnabled?: boolean;
    webcamRecordOnly?: boolean;
    proctoringEnforcement?: string;
    proctoringStrikeLimit?: number;
    disabledProctoringSignals?: string[];
    screenCaptureEnabled?: boolean;
    lockdownRequired?: boolean;
  }): {
    enableAntiCheating?: boolean;
    webcamProctoringEnabled?: boolean;
    webcamRecordOnly?: boolean;
    proctoringEnforcement?: string;
    proctoringStrikeLimit?: number;
    disabledProctoringSignalsJson?: string | null;
    screenCaptureEnabled?: boolean;
    lockdownRequired?: boolean;
  } {
    if (dto.enableAntiCheating === false) {
      return {
        enableAntiCheating: false,
        webcamProctoringEnabled: false,
        webcamRecordOnly: false,
        disabledProctoringSignalsJson: JSON.stringify(TOGGLEABLE_PROCTORING_SIGNALS),
        screenCaptureEnabled: false,
        lockdownRequired: false,
      };
    }
    return {
      ...(dto.enableAntiCheating !== undefined ? { enableAntiCheating: dto.enableAntiCheating } : {}),
      ...(dto.webcamProctoringEnabled !== undefined ? { webcamProctoringEnabled: dto.webcamProctoringEnabled } : {}),
      ...(dto.webcamRecordOnly !== undefined ? { webcamRecordOnly: dto.webcamRecordOnly } : {}),
      ...(dto.proctoringEnforcement !== undefined ? { proctoringEnforcement: dto.proctoringEnforcement } : {}),
      ...(dto.proctoringStrikeLimit !== undefined ? { proctoringStrikeLimit: dto.proctoringStrikeLimit } : {}),
      ...(dto.disabledProctoringSignals !== undefined
        ? { disabledProctoringSignalsJson: dto.disabledProctoringSignals.length > 0 ? JSON.stringify(dto.disabledProctoringSignals) : null }
        : {}),
      ...(dto.screenCaptureEnabled !== undefined ? { screenCaptureEnabled: dto.screenCaptureEnabled } : {}),
      ...(dto.lockdownRequired !== undefined ? { lockdownRequired: dto.lockdownRequired } : {}),
    };
  }

  async create(context: TenantContext, userId: string, dto: CreateExamDto): Promise<Exam> {
    const scheduling = this.resolveSchedulingFields(dto.schedulingEnabled, dto.availabilityWindowStart, dto.availabilityWindowEnd);
    const proctoring = this.resolveProctoringFields(dto);
    const exam = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.create({
        data: {
          organizationId: context.organizationId as string,
          title: dto.title,
          instructions: dto.instructions,
          durationMinutes: dto.durationMinutes,
          passCriteriaPercent: dto.passCriteriaPercent,
          randomizeOrder: dto.randomizeOrder,
          feedbackVisibility: dto.feedbackVisibility,
          schedulingEnabled: scheduling.schedulingEnabled,
          availabilityWindowStart: scheduling.availabilityWindowStart,
          availabilityWindowEnd: scheduling.availabilityWindowEnd,
          allowedIpRange: dto.allowedIpRange ?? null,
          ...proctoring,
          createdBy: userId,
        },
      }),
    );
    await this.audit.record(context, {
      actorUserId: userId,
      action: 'exam.created',
      entityType: 'exam',
      entityId: exam.id,
      metadata: { title: exam.title },
    });
    return exam;
  }

  async list(
    context: TenantContext,
    filters: ExamFilters,
  ): Promise<PaginatedResponse<Exam & { invitationCount: number; attemptSettledCount: number; attemptTotalCount: number }>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const where = {
        organizationId: context.organizationId as string,
        ...(filters.status ? { status: filters.status } : { status: { not: 'archived' } }),
        ...(filters.search ? { title: { contains: filters.search } } : {}),
      };
      const [exams, total] = await Promise.all([
        tx.exam.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
        tx.exam.count({ where }),
      ]);
      const examIds = exams.map((exam) => exam.id);

      const [invitationGroups, attemptGroups] = await Promise.all([
        tx.invitation.groupBy({ by: ['examId'], where: { examId: { in: examIds } }, _count: { _all: true } }),
        tx.attempt.groupBy({ by: ['examId', 'status'], where: { examId: { in: examIds } }, _count: { _all: true } }),
      ]);

      const invitationCountByExam = new Map(invitationGroups.map((group) => [group.examId, group._count._all]));
      const settledByExam = new Map<string, number>();
      const totalByExam = new Map<string, number>();
      for (const group of attemptGroups) {
        totalByExam.set(group.examId, (totalByExam.get(group.examId) ?? 0) + group._count._all);
        if ((SETTLED_ATTEMPT_STATUSES as string[]).includes(group.status)) {
          settledByExam.set(group.examId, (settledByExam.get(group.examId) ?? 0) + group._count._all);
        }
      }

      const data = exams.map((exam) => ({
        ...exam,
        invitationCount: invitationCountByExam.get(exam.id) ?? 0,
        attemptSettledCount: settledByExam.get(exam.id) ?? 0,
        attemptTotalCount: totalByExam.get(exam.id) ?? 0,
      }));
      return buildPaginatedResponse(data, total, page, pageSize);
    });
  }

  // Distinct section titles already used across this org's exams (e.g. "Aptitude",
  // "Technical"), so the section-title field can offer a dropdown of names the recruiter
  // has used before instead of retyping/mistyping them -- free text is still accepted.
  async getSectionTitles(context: TenantContext): Promise<string[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const rows = await tx.examSection.findMany({
        where: { exam: { organizationId: context.organizationId as string } },
        select: { title: true },
        distinct: ['title'],
        orderBy: { title: 'asc' },
      });
      return rows.map((row) => row.title);
    });
  }

  async findOne(
    context: TenantContext,
    id: string,
  ): Promise<
    Exam & {
      sections: ExamSectionWithQuestions[];
      invitationCount: number;
      hasStartedAttempts: boolean;
      requiresManualGrading: boolean;
    }
  > {
    const result = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id, organizationId: context.organizationId as string },
        include: {
          sections: {
            orderBy: { orderIndex: 'asc' },
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
                include: { question: { include: { options: true } } },
              },
              poolTags: { include: { tag: true } },
            },
          },
        },
      });
      if (!exam) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      const invitationCount = await tx.invitation.count({ where: { examId: id } });
      const startedAttemptCount = await tx.attempt.count({ where: { examId: id } });
      const requiresManualGrading = await this.computeRequiresManualGrading(tx, context, exam);
      return { ...exam, invitationCount, hasStartedAttempts: startedAttemptCount > 0, requiresManualGrading };
    });
    // Signed outside the transaction (an external call to blob storage, not a DB
    // read) -- same reasoning as the recent fix that moved blob uploads off the
    // forTenant transaction.
    const sections = await this.signSectionQuestionImages(result.sections);
    return { ...result, sections };
  }

  // Grading is only ever needed for 'code' questions -- every other type auto-grades
  // (see AttemptSettlementService.finalize's own hasCodeQuestions check). Fixed
  // sections are checked directly; a pool section draws randomly at attempt time, so
  // it's treated as code-capable if any question CURRENTLY matching its filters is
  // code -- the same AND-tagIds query publish() already uses to validate pool
  // availability. The trailing pending-grade count covers the one case that check
  // can miss: a pool's tag composition changed after an attempt already drew a code
  // question from it, and that attempt is still sitting there waiting to be graded.
  private async computeRequiresManualGrading(
    tx: Prisma.TransactionClient,
    context: TenantContext,
    exam: { id: string; sections: ExamSectionWithQuestions[] },
  ): Promise<boolean> {
    const hasFixedCodeQuestion = exam.sections.some(
      (section) => section.selectionMode === 'fixed' && section.questions.some((q) => q.question.type === 'code'),
    );
    if (hasFixedCodeQuestion) {
      return true;
    }

    for (const section of exam.sections) {
      if (section.selectionMode !== 'pool') continue;
      const tagIds = (section.poolTags ?? []).map((poolTag) => poolTag.tagId);
      const codeMatchCount = await tx.question.count({
        where: {
          organizationId: context.organizationId as string,
          status: 'active',
          type: 'code',
          ...(section.poolDifficulty ? { difficulty: section.poolDifficulty } : {}),
          AND: tagIds.map((tagId) => ({ tags: { some: { tagId } } })),
        },
      });
      if (codeMatchCount > 0) {
        return true;
      }
    }

    const pendingGradeCount = await tx.attempt.count({ where: { examId: exam.id, status: 'pending_manual_grade' } });
    return pendingGradeCount > 0;
  }

  // The exam locks the moment any candidate has actually started it -- title, scheduling,
  // proctoring rules, sections and questions all become read-only from that point on, so
  // that a hiring decision is never made against rules that changed mid-exam. Inviting more
  // candidates and the live-monitoring block/unblock actions are unaffected -- they don't go
  // through this method. Publishing (with nobody started yet) locks the same surface but is
  // reversible via unpublish, so it gets its own message pointing the caller there.
  private async assertExamMutable(
    tx: Prisma.TransactionClient,
    examId: string,
    status: string,
    resource: string = 'sections or questions',
    options: { allowStartedAttempts?: boolean } = {},
  ): Promise<void> {
    // allowStartedAttempts exists for exactly one caller: updateSection's weight-only path (see
    // its own comment). Everything else -- questions, pool config, section structure -- stays
    // permanently frozen the moment a candidate starts, same as always.
    if (!options.allowStartedAttempts) {
      const startedAttemptCount = await tx.attempt.count({ where: { examId } });
      if (startedAttemptCount > 0) {
        throw new ConflictException('Cannot modify this exam once a candidate has started it');
      }
    }
    if (status === 'published') {
      throw new ConflictException(`Exam ${examId} is published -- unpublish it before editing its ${resource}`);
    }
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpdateExamDto): Promise<Exam> {
    const updated = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.exam.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Exam ${id} not found`);
      }

      // The whole exam locks once a candidate has started it -- nothing here is
      // partially editable, so there's no need to diff individual fields. Publishing
      // (reversible via POST /exams/:id/unpublish) locks it the same way until then.
      await this.assertExamMutable(tx, id, existing.status, 'details');

      const schedulingEnabledInput = dto.schedulingEnabled !== undefined ? dto.schedulingEnabled : existing.schedulingEnabled;
      const availabilityWindowStartInput =
        dto.availabilityWindowStart !== undefined ? dto.availabilityWindowStart : (existing.availabilityWindowStart?.toISOString() ?? undefined);
      const availabilityWindowEndInput =
        dto.availabilityWindowEnd !== undefined ? dto.availabilityWindowEnd : (existing.availabilityWindowEnd?.toISOString() ?? undefined);
      const scheduling = this.resolveSchedulingFields(schedulingEnabledInput, availabilityWindowStartInput, availabilityWindowEndInput);
      const proctoring = this.resolveProctoringFields(dto);

      const updated = await tx.exam.update({
        where: { id },
        data: {
          title: dto.title,
          instructions: dto.instructions,
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.passCriteriaPercent !== undefined ? { passCriteriaPercent: dto.passCriteriaPercent } : {}),
          ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
          ...(dto.feedbackVisibility !== undefined ? { feedbackVisibility: dto.feedbackVisibility } : {}),
          ...(dto.walkInEnabled !== undefined ? { walkInEnabled: dto.walkInEnabled } : {}),
          ...(dto.walkInListed !== undefined ? { walkInListed: dto.walkInListed } : {}),
          ...(dto.allowedIpRange !== undefined ? { allowedIpRange: dto.allowedIpRange || null } : {}),
          ...proctoring,
          schedulingEnabled: scheduling.schedulingEnabled,
          availabilityWindowStart: scheduling.availabilityWindowStart,
          availabilityWindowEnd: scheduling.availabilityWindowEnd,
        },
      });

      if (updated.schedulingEnabled) {
        const liveInvitations = await tx.invitation.findMany({
          where: { examId: id, status: 'invited' },
          include: { attempt: true },
        });
        const notYetStartedIds = liveInvitations.filter((invitation) => !invitation.attempt).map((invitation) => invitation.id);
        if (notYetStartedIds.length > 0) {
          await tx.invitation.updateMany({
            where: { id: { in: notYetStartedIds } },
            data: { expiresAt: updated.availabilityWindowEnd as Date },
          });
        }
      }

      return updated;
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'exam.updated',
      entityType: 'exam',
      entityId: id,
      metadata: { title: updated.title },
    });
    return updated;
  }

  // Deliberately bypasses assertExamMutable's published-lock: unlike title/questions/
  // scheduling, walk-in eligibility doesn't change what a candidate who already started
  // sees, so there's no reason recruiters should have to unpublish a live exam just to
  // open (or close) walk-in registration for it.
  async setWalkInEnabled(context: TenantContext, actorUserId: string, id: string, walkInEnabled: boolean): Promise<Exam> {
    const updated = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.exam.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      return tx.exam.update({ where: { id }, data: { walkInEnabled } });
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'exam.updated',
      entityType: 'exam',
      entityId: id,
      metadata: { walkInEnabled },
    });
    return updated;
  }

  // Bypasses assertExamMutable for the same reason as setWalkInEnabled above: whether this
  // exam shows up in the shared /walk-in/{orgSlug} picker isn't exam content and shouldn't
  // require unpublishing to change.
  async setWalkInListed(context: TenantContext, actorUserId: string, id: string, walkInListed: boolean): Promise<Exam> {
    const updated = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.exam.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      return tx.exam.update({ where: { id }, data: { walkInListed } });
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'exam.updated',
      entityType: 'exam',
      entityId: id,
      metadata: { walkInListed },
    });
    return updated;
  }

  async archive(context: TenantContext, actorUserId: string, id: string): Promise<Exam> {
    const archived = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.exam.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      return tx.exam.update({ where: { id }, data: { status: 'archived' } });
    });
    await this.audit.record(context, { actorUserId, action: 'exam.archived', entityType: 'exam', entityId: id });
    return archived;
  }

  async publish(context: TenantContext, actorUserId: string, id: string): Promise<Exam> {
    const published = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id, organizationId: context.organizationId as string },
        include: { sections: { include: { questions: { include: { question: { select: { marks: true } } } }, poolTags: true } } },
      });
      if (!exam) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      if (exam.status !== 'draft') {
        throw new BadRequestException(`Exam ${id} cannot be published from status "${exam.status}"`);
      }
      if (exam.sections.length === 0) {
        throw new BadRequestException('Exam must have at least one section before it can be published');
      }
      // Weights drive the real scoring formula (see grading.ts's computeResult), so anything
      // other than exactly 100 would silently under- or over-award the whole exam.
      const weightSum = exam.sections.reduce((sum, section) => sum + section.weightPercent, 0);
      if (weightSum !== 100) {
        throw new BadRequestException(`Section weights must sum to 100% before publishing (currently ${weightSum}%)`);
      }
      for (const section of exam.sections) {
        if (section.requiredCount != null) {
          const total = section.selectionMode === 'pool' ? (section.poolSize ?? 0) : section.questions.length;
          if (section.requiredCount > total) {
            throw new BadRequestException(
              `Section "${section.title}" asks for ${section.requiredCount} answers but only has ${total} questions`,
            );
          }
          // Candidates choose which questions to answer, so unequal marks would make two
          // candidates' percentages incomparable -- one could pick the cheap questions and be
          // capped below 100% through no fault of their own. Only applies when requiredCount is
          // an actual choice (< total): at requiredCount === total there's nothing to choose, so
          // e.g. deleting a question down to N === M must not suddenly block publish.
          if (section.requiredCount < total) {
            const marks = section.selectionMode === 'pool'
              ? (
                  await tx.question.findMany({
                    where: {
                      organizationId: context.organizationId as string,
                      status: 'active',
                      ...(section.poolDifficulty ? { difficulty: section.poolDifficulty } : {}),
                      AND: section.poolTags.map((poolTag) => ({ tags: { some: { tagId: poolTag.tagId } } })),
                    },
                    select: { marks: true },
                    distinct: ['marks'],
                  })
                ).map((question) => question.marks)
              : [...new Set(section.questions.map((link) => link.question.marks))];
            if (marks.length > 1) {
              throw new BadRequestException(
                `Section "${section.title}" lets candidates choose which questions to answer, so all its questions must carry the same marks`,
              );
            }
          }
        }
        if (section.selectionMode === 'pool') {
          const tagIds = section.poolTags.map((poolTag) => poolTag.tagId);
          const matchingCount = await tx.question.count({
            where: {
              organizationId: context.organizationId as string,
              status: 'active',
              ...(section.poolDifficulty ? { difficulty: section.poolDifficulty } : {}),
              AND: tagIds.map((tagId) => ({ tags: { some: { tagId } } })),
            },
          });
          if (matchingCount < (section.poolSize ?? 0)) {
            throw new BadRequestException(
              `Section "${section.title}" pool requires ${section.poolSize} matching questions, only ${matchingCount} available`,
            );
          }
        } else if (section.questions.length === 0) {
          throw new BadRequestException(`Section "${section.title}" has no questions attached`);
        }
      }
      return tx.exam.update({ where: { id }, data: { status: 'published' } });
    });
    await this.audit.record(context, { actorUserId, action: 'exam.published', entityType: 'exam', entityId: id });
    return published;
  }

  async unpublish(context: TenantContext, actorUserId: string, id: string): Promise<Exam> {
    const updated = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id, organizationId: context.organizationId as string },
      });
      if (!exam) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      if (exam.status !== 'published') {
        throw new BadRequestException(`Exam ${id} cannot be unpublished from status "${exam.status}"`);
      }
      // Only reversible before anyone starts: once an attempt exists, editing would
      // change the exam out from under candidates who already saw the published version.
      const startedAttemptCount = await tx.attempt.count({ where: { examId: id } });
      if (startedAttemptCount > 0) {
        throw new BadRequestException('Exam cannot be unpublished after candidates have started it');
      }
      return tx.exam.update({ where: { id }, data: { status: 'draft' } });
    });
    await this.audit.record(context, { actorUserId, action: 'exam.unpublished', entityType: 'exam', entityId: id });
    return updated;
  }

  async duplicate(context: TenantContext, userId: string, id: string): Promise<Exam> {
    const created = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id, organizationId: context.organizationId as string },
        include: {
          sections: {
            orderBy: { orderIndex: 'asc' },
            include: {
              questions: { orderBy: { orderIndex: 'asc' } },
              poolTags: true,
            },
          },
        },
      });
      if (!exam) {
        throw new NotFoundException(`Exam ${id} not found`);
      }

      const clone = await tx.exam.create({
        data: {
          organizationId: context.organizationId as string,
          title: `${exam.title} (Copy)`,
          instructions: exam.instructions,
          durationMinutes: exam.durationMinutes,
          passCriteriaPercent: exam.passCriteriaPercent,
          randomizeOrder: exam.randomizeOrder,
          feedbackVisibility: exam.feedbackVisibility,
          enableAntiCheating: exam.enableAntiCheating,
          webcamProctoringEnabled: exam.webcamProctoringEnabled,
          webcamRecordOnly: exam.webcamRecordOnly,
          proctoringEnforcement: exam.proctoringEnforcement,
          proctoringStrikeLimit: exam.proctoringStrikeLimit,
          disabledProctoringSignalsJson: exam.disabledProctoringSignalsJson,
          screenCaptureEnabled: exam.screenCaptureEnabled,
          lockdownRequired: exam.lockdownRequired,
          schedulingEnabled: false,
          availabilityWindowStart: null,
          availabilityWindowEnd: null,
          createdBy: userId,
        },
      });

      for (const section of exam.sections) {
        const newSection = await tx.examSection.create({
          data: {
            examId: clone.id,
            title: section.title,
            orderIndex: section.orderIndex,
            selectionMode: section.selectionMode,
            poolSize: section.poolSize,
            poolDifficulty: section.poolDifficulty,
            targetDurationMinutes: section.targetDurationMinutes,
            weightPercent: section.weightPercent,
            requiredCount: section.requiredCount,
            ...(section.poolTags.length > 0
              ? { poolTags: { create: section.poolTags.map((poolTag) => ({ tagId: poolTag.tagId })) } }
              : {}),
          },
        });

        if (section.questions.length > 0) {
          await tx.examSectionQuestion.createMany({
            data: section.questions.map((link) => ({
              sectionId: newSection.id,
              questionId: link.questionId,
              orderIndex: link.orderIndex,
            })),
          });
        }
      }

      return clone;
    });

    await this.audit.record(context, {
      actorUserId: userId,
      action: 'exam.duplicated',
      entityType: 'exam',
      entityId: created.id,
      metadata: { sourceExamId: id },
    });

    return created;
  }

  async createSection(context: TenantContext, examId: string, dto: CreateExamSectionDto): Promise<ExamSection> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      await this.assertExamMutable(tx, examId, exam.status);

      const title = dto.title.trim();
      // Section titles must be unique within an exam (case-insensitive via the DB's
      // default collation) so recruiters can tell two sections apart.
      const duplicate = await tx.examSection.findFirst({ where: { examId, title } });
      if (duplicate) {
        throw new BadRequestException(`A section named "${title}" already exists in this exam`);
      }

      const lastSection = await tx.examSection.findFirst({
        where: { examId },
        orderBy: { orderIndex: 'desc' },
      });
      const orderIndex = lastSection ? lastSection.orderIndex + 1 : 0;
      // A lone section is trivially the whole grade -- no recruiter action needed for the common
      // single-section exam. Any additional section starts unweighted; the running total (surfaced
      // in the UI, enforced again at publish) makes it obvious it needs to be assigned.
      const weightPercent = lastSection ? 0 : 100;

      return tx.examSection.create({
        data: { examId, title, orderIndex, targetDurationMinutes: dto.targetDurationMinutes, weightPercent },
      });
    });
  }

  // A weight-only PATCH (nothing else in the DTO set) is the sole exception to the
  // started-attempts lock: see assertExamMutable's allowStartedAttempts and
  // recomputeSettledResults' own comment for why rebalancing weight after submission is safe
  // and useful, while every other section edit stays frozen.
  private isWeightOnlySectionUpdate(dto: UpdateExamSectionDto): boolean {
    return (
      dto.weightPercent !== undefined
      && dto.title === undefined
      && dto.selectionMode === undefined
      && dto.poolSize === undefined
      && dto.poolDifficulty === undefined
      && dto.poolTagIds === undefined
      && dto.targetDurationMinutes === undefined
      && dto.requiredCount === undefined
    );
  }

  async updateSection(
    context: TenantContext,
    actorUserId: string,
    examId: string,
    sectionId: string,
    dto: UpdateExamSectionDto,
  ): Promise<ExamSection> {
    const isWeightOnlyUpdate = this.isWeightOnlySectionUpdate(dto);
    const updated = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      await this.assertExamMutable(tx, examId, exam.status, 'sections or questions', { allowStartedAttempts: isWeightOnlyUpdate });
      const section = await tx.examSection.findFirst({
        where: { id: sectionId, examId },
        include: { poolTags: true, questions: true },
      });
      if (!section) {
        throw new NotFoundException(`Section ${sectionId} not found`);
      }

      const nextMode = dto.selectionMode ?? section.selectionMode;

      if (nextMode === 'pool') {
        const effectivePoolSize = dto.poolSize ?? section.poolSize;
        const effectivePoolTagCount = dto.poolTagIds !== undefined
          ? [...new Set(dto.poolTagIds)].length
          : section.poolTags.length;
        if (!effectivePoolSize || effectivePoolSize < 1) {
          throw new BadRequestException('A pool section requires poolSize to be at least 1');
        }
        if (effectivePoolTagCount === 0) {
          throw new BadRequestException('A pool section requires at least one poolTagId');
        }
      }

      if (nextMode === 'pool' && section.selectionMode === 'fixed') {
        await tx.examSectionQuestion.deleteMany({ where: { sectionId } });
      }
      if (nextMode === 'fixed' && section.selectionMode === 'pool') {
        await tx.examSectionPoolTag.deleteMany({ where: { sectionId } });
      }
      if (nextMode === 'pool' && dto.poolTagIds) {
        await tx.examSectionPoolTag.deleteMany({ where: { sectionId } });
      }

      const uniquePoolTagIds = dto.poolTagIds ? [...new Set(dto.poolTagIds)] : undefined;

      return tx.examSection.update({
        where: { id: sectionId },
        data: {
          title: dto.title,
          selectionMode: nextMode,
          poolSize: nextMode === 'pool' ? (dto.poolSize ?? section.poolSize) : null,
          poolDifficulty: nextMode === 'pool' ? (dto.poolDifficulty ?? section.poolDifficulty) : null,
          ...(nextMode === 'pool' && uniquePoolTagIds
            ? { poolTags: { create: uniquePoolTagIds.map((tagId) => ({ tagId })) } }
            : {}),
          ...(dto.targetDurationMinutes !== undefined ? { targetDurationMinutes: dto.targetDurationMinutes } : {}),
          ...(dto.weightPercent !== undefined ? { weightPercent: dto.weightPercent } : {}),
          ...(dto.requiredCount !== undefined
            ? { requiredCount: this.normaliseRequiredCount(dto.requiredCount, nextMode, dto.poolSize ?? section.poolSize, section.questions.length) }
            : {}),
        },
        include: { poolTags: true },
      });
    });

    // Outside the transaction above on purpose: this is a separate call to exam-runtime, and a
    // recompute hiccup must not roll back a weight edit that already saved successfully -- the
    // recruiter's change is real either way; recompute just may need a retry. Awaited (not
    // fire-and-forget like finalize()'s side effects) so the Results tab reflects the new
    // weighting the moment this PATCH resolves, since that's the entire point of the edit.
    if (isWeightOnlyUpdate) {
      try {
        const { updated: rescoredCount } = await this.examRuntime.recomputeResults(examId);
        if (rescoredCount > 0) {
          await this.audit.record(context, {
            actorUserId,
            action: 'exam.section_weight_recomputed',
            entityType: 'exam',
            entityId: examId,
            metadata: { sectionId, weightPercent: dto.weightPercent, rescoredAttemptCount: rescoredCount },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to recompute results for exam ${examId} after a weight change`, error as Error);
      }
    }

    return updated;
  }

  // requiredCount === M means "answer all", which is exactly what null already means -- storing
  // both would leave two representations of one state for every reader to handle. M is poolSize
  // for a pool section (the candidate only ever sees the drawn subset) and the attached question
  // count for a fixed one.
  private normaliseRequiredCount(
    requiredCount: number | null | undefined,
    selectionMode: string,
    poolSize: number | null,
    fixedQuestionCount: number,
  ): number | null {
    if (requiredCount == null) {
      return null;
    }
    const total = selectionMode === 'pool' ? (poolSize ?? 0) : fixedQuestionCount;
    return requiredCount >= total ? null : requiredCount;
  }

  async deleteSection(context: TenantContext, examId: string, sectionId: string): Promise<{ success: true }> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      await this.assertExamMutable(tx, examId, exam.status);
      const section = await tx.examSection.findFirst({ where: { id: sectionId, examId } });
      if (!section) {
        throw new NotFoundException(`Section ${sectionId} not found`);
      }
      await tx.examSection.delete({ where: { id: sectionId } });
    });
    // apiFetch always parses the response as JSON -- an empty 200 body (the previous return type,
    // Promise<void>) threw "Unexpected end of JSON input" client-side even though the delete
    // succeeded, which is what ADO #6838 actually was (not a duplication-specific bug: EVERY
    // section delete hit this, the tester just happened to test delete right after duplicate).
    return { success: true };
  }

  async duplicateSection(context: TenantContext, examId: string, sectionId: string): Promise<ExamSection> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      await this.assertExamMutable(tx, examId, exam.status);
      const section = await tx.examSection.findFirst({
        where: { id: sectionId, examId },
        include: { questions: { orderBy: { orderIndex: 'asc' } }, poolTags: true },
      });
      if (!section) {
        throw new NotFoundException(`Section ${sectionId} not found`);
      }

      const lastSection = await tx.examSection.findFirst({ where: { examId }, orderBy: { orderIndex: 'desc' } });
      const orderIndex = lastSection ? lastSection.orderIndex + 1 : 0;

      const clone = await tx.examSection.create({
        data: {
          examId,
          title: `${section.title} (Copy)`,
          orderIndex,
          selectionMode: section.selectionMode,
          poolSize: section.poolSize,
          poolDifficulty: section.poolDifficulty,
          targetDurationMinutes: section.targetDurationMinutes,
          weightPercent: section.weightPercent,
          requiredCount: section.requiredCount,
          ...(section.poolTags.length > 0
            ? { poolTags: { create: section.poolTags.map((poolTag) => ({ tagId: poolTag.tagId })) } }
            : {}),
        },
      });

      // Deliberately NOT copying the source section's fixed question links: every question is
      // in the source section already, so copying them would put the same question in two
      // sections of one exam -- the exact duplication that breaks answer/mark state for
      // candidates (a question is answered once per attempt, not once per section). The clone
      // keeps the section's structure and pool tags; the recruiter fills it with its own
      // (distinct) questions. Pool sections are unaffected -- they carry no fixed links.

      return clone;
    });
  }

  // A pool section draws a random subset at attempt-start (see AttemptService.start in
  // apps/exam-runtime) and never stores which questions it picked -- there is no fixed list
  // to show a recruiter. This mirrors that exact eligibility query (organizationId + active +
  // optional difficulty + AND-every-pool-tag), minus the shuffle/slice, so a recruiter can see
  // what the pool WOULD draw from and -- critically -- whether there are even enough matching
  // questions to fill poolSize (currently silent at attempt time: too few candidates just means
  // a smaller-than-configured section, with no error anywhere).
  async previewSectionPool(context: TenantContext, examId: string, sectionId: string): Promise<PoolPreview> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      const section = await tx.examSection.findFirst({ where: { id: sectionId, examId }, include: { poolTags: { include: { tag: true } } } });
      if (!section) {
        throw new NotFoundException(`Section ${sectionId} not found`);
      }
      if (section.selectionMode !== 'pool') {
        throw new BadRequestException('This section is not pool-based.');
      }

      const tagIds = section.poolTags.map((poolTag) => poolTag.tagId);
      const where: Prisma.QuestionWhereInput = {
        organizationId: context.organizationId as string,
        status: 'active',
        ...(section.poolDifficulty ? { difficulty: section.poolDifficulty } : {}),
        AND: tagIds.map((tagId) => ({ tags: { some: { tagId } } })),
      };

      const [totalMatching, questions] = await Promise.all([
        tx.question.count({ where }),
        tx.question.findMany({
          where,
          take: POOL_PREVIEW_MAX_QUESTIONS,
          orderBy: { createdAt: 'desc' },
          select: { id: true, text: true, type: true, difficulty: true, marks: true },
        }),
      ]);

      return {
        poolSize: section.poolSize ?? 0,
        poolDifficulty: section.poolDifficulty,
        poolTags: section.poolTags.map((poolTag) => ({ id: poolTag.tag.id, name: poolTag.tag.name })),
        totalMatching,
        questions,
      };
    });
  }

  async replaceSectionQuestions(
    context: TenantContext,
    examId: string,
    sectionId: string,
    questionIds: string[],
  ): Promise<ExamSectionWithQuestions> {
    const updatedSection = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      await this.assertExamMutable(tx, examId, exam.status);
      const section = await tx.examSection.findFirst({ where: { id: sectionId, examId } });
      if (!section) {
        throw new NotFoundException(`Section ${sectionId} not found`);
      }

      const currentLinks = await tx.examSectionQuestion.findMany({ where: { sectionId } });
      const currentlyLinkedQuestionIds = currentLinks.map((link) => link.questionId);

      const uniqueQuestionIds = [...new Set(questionIds)];
      const questions = await tx.question.findMany({
        where: { id: { in: uniqueQuestionIds }, organizationId: context.organizationId as string },
        select: { id: true, status: true },
      });
      if (questions.length !== uniqueQuestionIds.length) {
        throw new NotFoundException('One or more questions were not found in this organization');
      }

      // A question must not appear in more than one section of the same exam. Answers are keyed
      // by (attempt, question), so a duplicated question shares a single answer row -- marking or
      // answering it in one section silently affects the other, and the candidate navigator lights
      // up the wrong cell. This surfaced when an exam had the same question in Aptitude and
      // Salesforce and a candidate's "mark for review" on Q12 appeared on Q6.
      const otherSectionLinks = await tx.examSectionQuestion.findMany({
        where: { section: { examId }, sectionId: { not: sectionId } },
        select: { questionId: true },
      });
      const inAnotherSection = new Set(otherSectionLinks.map((link) => link.questionId));
      const conflicts = uniqueQuestionIds.filter((id) => inAnotherSection.has(id));
      if (conflicts.length > 0) {
        throw new BadRequestException(
          `These questions are already used in another section of this exam and can't be added twice: ${conflicts.join(', ')}`,
        );
      }

      validateSectionQuestionsReplace(questionIds, currentlyLinkedQuestionIds, questions);

      await tx.examSectionQuestion.deleteMany({ where: { sectionId } });
      if (questionIds.length > 0) {
        await tx.examSectionQuestion.createMany({
          data: questionIds.map((questionId, index) => ({ sectionId, questionId, orderIndex: index })),
        });
      }

      const refreshedSection = await tx.examSection.findFirst({
        where: { id: sectionId },
        include: {
          questions: {
            orderBy: { orderIndex: 'asc' },
            include: { question: { include: { options: true } } },
          },
        },
      });
      return refreshedSection as ExamSectionWithQuestions;
    });
    const [signed] = await this.signSectionQuestionImages([updatedSection]);
    return signed;
  }

  async getResults(context: TenantContext, examId: string): Promise<ExamResultRow[]> {
    const { invitations, advancedInvitations } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }

      const invitations = await tx.invitation.findMany({
        where: { examId },
        include: { candidate: true, attempt: { include: { result: true, proctoringAnalysis: true, integrityAnalysis: true } } },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });

      // Invitations to OTHER exams created by advancing someone out of THIS one. Fetched in
      // the same transaction rather than its own: every tenant-scoped query holds a pooled
      // connection for the whole transaction, so an extra round-trip here costs a connection
      // on every results page load.
      const advancedInvitations = await tx.invitation.findMany({
        where: { advancedFromExamId: examId },
        select: { candidateId: true, emailStatus: true, invitedAt: true, exam: { select: { title: true } } },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });

      return { invitations, advancedInvitations };
    });

    // Newest-first above, so the first entry per candidate is the latest advance -- the one a
    // recruiter just triggered and is asking about.
    const nextRoundByCandidate = new Map<string, { examTitle: string; emailStatus: string; invitedAt: Date }>();
    for (const advanced of advancedInvitations) {
      if (!nextRoundByCandidate.has(advanced.candidateId)) {
        nextRoundByCandidate.set(advanced.candidateId, {
          examTitle: advanced.exam.title,
          emailStatus: advanced.emailStatus,
          invitedAt: advanced.invitedAt,
        });
      }
    }

    const attemptIdsToSettle = invitations
      .filter((invitation) => invitation.attempt && invitation.attempt.status === 'in_progress')
      .map((invitation) => invitation.attempt!.id);

    if (attemptIdsToSettle.length === 0) {
      return invitations.map((invitation) => this.toResultRow(nextRoundByCandidate, invitation, invitation.attempt));
    }

    await this.examRuntime.settleIfExpiredBatch(attemptIdsToSettle);

    const settledAttempts = await this.tenantPrisma.forTenant(context, async (tx) => {
      const attempts = await tx.attempt.findMany({
        where: { id: { in: attemptIdsToSettle } },
        include: { result: true, proctoringAnalysis: true, integrityAnalysis: true },
      });
      return new Map(attempts.map((attempt) => [attempt.id, attempt]));
    });

    return invitations.map((invitation) => {
      const originalAttempt = invitation.attempt;
      const attempt = originalAttempt && settledAttempts.has(originalAttempt.id)
        ? settledAttempts.get(originalAttempt.id)!
        : originalAttempt;
      return this.toResultRow(nextRoundByCandidate, invitation, attempt);
    });
  }

  async getPendingGrading(context: TenantContext, examId: string): Promise<PendingGradingRow[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }

      const attempts = await tx.attempt.findMany({
        where: { examId, status: 'pending_manual_grade' },
        include: { invitation: { include: { candidate: true } }, answers: { include: { question: true } } },
      });

      return attempts.map((attempt) => ({
        attemptId: attempt.id,
        candidateId: attempt.invitation.candidateId,
        candidateName: attempt.invitation.candidate.name,
        codeQuestions: attempt.answers
          .filter((answer) => answer.question.type === 'code')
          .map((answer) => ({
            questionId: answer.questionId,
            questionText: answer.question.text,
            starterCode: answer.question.starterCode,
            codeLanguage: answer.codeLanguage,
            answerText: answer.answerText,
            marks: answer.question.marks,
            marksAwarded: answer.marksAwarded,
            gradingFeedback: answer.gradingFeedback,
          })),
      }));
    });
  }

  private toResultRow(
    nextRoundByCandidate: Map<string, { examTitle: string; emailStatus: string; invitedAt: Date }>,
    invitation: { id: string; candidateId: string; status: string; candidate: { name: string } },
    attempt:
      | {
          id: string;
          status: string;
          submittedAt: Date | null;
          result: { score: number; maxScore: number; percentage: number; passFail: string | null } | null;
          proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
          integrityAnalysis?: { status: string; level: string | null; flagsJson: string | null; narrative: string | null } | null;
        }
      | null
      | undefined,
  ): ExamResultRow {
    return {
      candidateId: invitation.candidateId,
      candidateName: invitation.candidate.name,
      invitationId: invitation.id,
      attemptId: attempt?.id ?? null,
      status: attempt?.status ?? invitation.status,
      score: attempt?.result?.score ?? null,
      maxScore: attempt?.result?.maxScore ?? null,
      percentage: attempt?.result?.percentage ?? null,
      passFail: attempt?.result?.passFail ?? null,
      submittedAt: attempt?.submittedAt ?? null,
      proctoringAnalysis: attempt?.proctoringAnalysis
        ? { status: attempt.proctoringAnalysis.status, riskLevel: attempt.proctoringAnalysis.riskLevel, summary: attempt.proctoringAnalysis.summary }
        : null,
      integrityAnalysis: attempt?.integrityAnalysis
        ? {
            status: attempt.integrityAnalysis.status,
            level: attempt.integrityAnalysis.level,
            flagsJson: attempt.integrityAnalysis.flagsJson,
            narrative: attempt.integrityAnalysis.narrative,
          }
        : null,
      integrityLevel: attempt?.integrityAnalysis?.level ?? null,
      integrityFlagCount: countIntegrityFlags(attempt?.integrityAnalysis?.flagsJson ?? null),
      nextRound: nextRoundByCandidate.get(invitation.candidateId) ?? null,
    };
  }
}
