import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Exam, ExamSection, ExamSectionQuestion, Question, QuestionOption } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { ExamRuntimeInternalClient } from '../exam-runtime-client/exam-runtime-internal.client';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { CreateExamSectionDto } from './dto/create-exam-section.dto';
import { UpdateExamSectionDto } from './dto/update-exam-section.dto';
import { validateSectionQuestionsReplace } from './exam-section-question-validation';
import { resolvePaginationParams, buildPaginatedResponse, PaginatedResponse } from '../common/paginated-response';

type ExamSectionWithQuestions = ExamSection & {
  questions: (ExamSectionQuestion & { question: Question & { options: QuestionOption[] } })[];
};

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
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly examRuntime: ExamRuntimeInternalClient,
    private readonly audit: AuditService,
  ) {}

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

  async create(context: TenantContext, userId: string, dto: CreateExamDto): Promise<Exam> {
    const scheduling = this.resolveSchedulingFields(dto.schedulingEnabled, dto.availabilityWindowStart, dto.availabilityWindowEnd);
    return this.tenantPrisma.forTenant(context, (tx) =>
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
          createdBy: userId,
        },
      }),
    );
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

  async findOne(context: TenantContext, id: string): Promise<Exam & { sections: ExamSectionWithQuestions[] }> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
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
            },
          },
        },
      });
      if (!exam) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      return exam;
    });
  }

  async update(context: TenantContext, id: string, dto: UpdateExamDto): Promise<Exam> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.exam.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Exam ${id} not found`);
      }

      const schedulingEnabledInput = dto.schedulingEnabled !== undefined ? dto.schedulingEnabled : existing.schedulingEnabled;
      const availabilityWindowStartInput =
        dto.availabilityWindowStart !== undefined ? dto.availabilityWindowStart : (existing.availabilityWindowStart?.toISOString() ?? undefined);
      const availabilityWindowEndInput =
        dto.availabilityWindowEnd !== undefined ? dto.availabilityWindowEnd : (existing.availabilityWindowEnd?.toISOString() ?? undefined);
      const scheduling = this.resolveSchedulingFields(schedulingEnabledInput, availabilityWindowStartInput, availabilityWindowEndInput);

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
        include: { sections: { include: { questions: true, poolTags: true } } },
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
      for (const section of exam.sections) {
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

      const lastSection = await tx.examSection.findFirst({
        where: { examId },
        orderBy: { orderIndex: 'desc' },
      });
      const orderIndex = lastSection ? lastSection.orderIndex + 1 : 0;

      return tx.examSection.create({
        data: { examId, title: dto.title, orderIndex, targetDurationMinutes: dto.targetDurationMinutes },
      });
    });
  }

  async updateSection(
    context: TenantContext,
    examId: string,
    sectionId: string,
    dto: UpdateExamSectionDto,
  ): Promise<ExamSection> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      const section = await tx.examSection.findFirst({ where: { id: sectionId, examId }, include: { poolTags: true } });
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
        },
        include: { poolTags: true },
      });
    });
  }

  async deleteSection(context: TenantContext, examId: string, sectionId: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      const section = await tx.examSection.findFirst({ where: { id: sectionId, examId } });
      if (!section) {
        throw new NotFoundException(`Section ${sectionId} not found`);
      }
      await tx.examSection.delete({ where: { id: sectionId } });
    });
  }

  async replaceSectionQuestions(
    context: TenantContext,
    examId: string,
    sectionId: string,
    questionIds: string[],
  ): Promise<ExamSectionWithQuestions> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
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

      validateSectionQuestionsReplace(questionIds, currentlyLinkedQuestionIds, questions);

      await tx.examSectionQuestion.deleteMany({ where: { sectionId } });
      if (questionIds.length > 0) {
        await tx.examSectionQuestion.createMany({
          data: questionIds.map((questionId, index) => ({ sectionId, questionId, orderIndex: index })),
        });
      }

      const updatedSection = await tx.examSection.findFirst({
        where: { id: sectionId },
        include: {
          questions: {
            orderBy: { orderIndex: 'asc' },
            include: { question: { include: { options: true } } },
          },
        },
      });
      return updatedSection as ExamSectionWithQuestions;
    });
  }

  async getResults(context: TenantContext, examId: string): Promise<ExamResultRow[]> {
    const invitations = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }

      return tx.invitation.findMany({
        where: { examId },
        include: { candidate: true, attempt: { include: { result: true, proctoringAnalysis: true, integrityAnalysis: true } } },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });
    });

    const attemptIdsToSettle = invitations
      .filter((invitation) => invitation.attempt && invitation.attempt.status === 'in_progress')
      .map((invitation) => invitation.attempt!.id);

    if (attemptIdsToSettle.length === 0) {
      return invitations.map((invitation) => this.toResultRow(invitation, invitation.attempt));
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
      return this.toResultRow(invitation, attempt);
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
            codeLanguage: answer.question.codeLanguage,
            answerText: answer.answerText,
            marks: answer.question.marks,
            marksAwarded: answer.marksAwarded,
            gradingFeedback: answer.gradingFeedback,
          })),
      }));
    });
  }

  private toResultRow(
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
    };
  }
}
