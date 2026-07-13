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

type ExamSectionWithQuestions = ExamSection & {
  questions: (ExamSectionQuestion & { question: Question & { options: QuestionOption[] } })[];
};

interface ExamFilters {
  status?: string;
}

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
}

@Injectable()
export class ExamsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly examRuntime: ExamRuntimeInternalClient,
    private readonly audit: AuditService,
  ) {}

  async create(context: TenantContext, userId: string, dto: CreateExamDto): Promise<Exam> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.create({
        data: {
          organizationId: context.organizationId as string,
          title: dto.title,
          instructions: dto.instructions,
          durationMinutes: dto.durationMinutes,
          passCriteriaPercent: dto.passCriteriaPercent,
          randomizeOrder: dto.randomizeOrder,
          createdBy: userId,
        },
      }),
    );
  }

  async list(context: TenantContext, filters: ExamFilters): Promise<Exam[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.findMany({
        where: {
          organizationId: context.organizationId as string,
          ...(filters.status ? { status: filters.status } : { status: { not: 'archived' } }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
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
      return tx.exam.update({
        where: { id },
        data: {
          title: dto.title,
          instructions: dto.instructions,
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.passCriteriaPercent !== undefined ? { passCriteriaPercent: dto.passCriteriaPercent } : {}),
          ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
        },
      });
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
        include: { candidate: true, attempt: { include: { result: true, proctoringAnalysis: true } } },
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
        include: { result: true, proctoringAnalysis: true },
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

  private toResultRow(
    invitation: { id: string; candidateId: string; status: string; candidate: { name: string } },
    attempt:
      | {
          id: string;
          status: string;
          submittedAt: Date | null;
          result: { score: number; maxScore: number; percentage: number; passFail: string } | null;
          proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
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
    };
  }
}
