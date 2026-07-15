import { Injectable, NotFoundException } from '@nestjs/common';
import { AttemptInsight, CandidateMessage, ProctoringAnalysis, ProctoringEvent } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { ExamRuntimeInternalClient } from '../exam-runtime-client/exam-runtime-internal.client';

@Injectable()
export class AttemptsAdminService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly examRuntime: ExamRuntimeInternalClient,
  ) {}

  async listProctoringEvents(context: TenantContext, attemptId: string): Promise<ProctoringEvent[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      return tx.proctoringEvent.findMany({ where: { attemptId }, orderBy: { occurredAt: 'asc' } });
    });
  }

  async forceSubmit(context: TenantContext, attemptId: string, actorUserId: string): Promise<{ status: string }> {
    await this.requireOwnedAttempt(context, attemptId);

    const result = await this.examRuntime.forceSubmit(attemptId);

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.force_submit',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return result;
  }

  async gradeCodeAnswer(
    context: TenantContext,
    attemptId: string,
    questionId: string,
    actorUserId: string,
    marksAwarded: number,
    feedback?: string,
  ): Promise<{ questionId: string; marksAwarded: number; gradingFeedback: string | null }> {
    await this.requireOwnedAttempt(context, attemptId);

    const result = await this.examRuntime.gradeCodeAnswer(attemptId, questionId, { marksAwarded, feedback });

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.answer_graded',
      entityType: 'attempt',
      entityId: attemptId,
      metadata: { questionId, marksAwarded },
    });

    return result;
  }

  async finalizeManualGrade(context: TenantContext, attemptId: string, actorUserId: string): Promise<{ status: string }> {
    await this.requireOwnedAttempt(context, attemptId);

    const result = await this.examRuntime.finalizeManualGrade(attemptId);

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.manually_graded',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return result;
  }

  async sendMessage(
    context: TenantContext,
    attemptId: string,
    actorUserId: string,
    body: string,
  ): Promise<{ id: string; sentAt: Date }> {
    const { created, examId, candidateId } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      const created = await tx.candidateMessage.create({
        data: { attemptId: attempt.id, sentByUserId: actorUserId, body },
      });
      return { created, examId: attempt.examId, candidateId: attempt.candidateId };
    });

    await this.examRuntime.notifyMessageSent({ examId, attemptId: created.attemptId, candidateId, sentAt: created.sentAt });

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.message_sent',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return { id: created.id, sentAt: created.sentAt };
  }

  async listMessages(context: TenantContext, attemptId: string): Promise<CandidateMessage[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      return tx.candidateMessage.findMany({ where: { attemptId }, orderBy: { sentAt: 'asc' } });
    });
  }

  async reanalyze(context: TenantContext, actorUserId: string, attemptId: string): Promise<ProctoringAnalysis> {
    await this.requireOwnedAttempt(context, attemptId);

    await this.examRuntime.reanalyze(attemptId);

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.reanalyze_triggered',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return this.tenantPrisma.forTenant(context, (tx) => tx.proctoringAnalysis.findUniqueOrThrow({ where: { attemptId } }));
  }

  async getInsight(context: TenantContext, attemptId: string): Promise<AttemptInsight> {
    await this.requireOwnedAttempt(context, attemptId);

    const insight = await this.tenantPrisma.forTenant(context, (tx) => tx.attemptInsight.findFirst({ where: { attemptId } }));
    if (!insight) {
      throw new NotFoundException(`AI insight not yet generated for attempt ${attemptId}`);
    }
    return insight;
  }

  async regenerateInsight(context: TenantContext, actorUserId: string, attemptId: string): Promise<AttemptInsight> {
    await this.requireOwnedAttempt(context, attemptId);

    await this.examRuntime.regenerateInsight(attemptId);

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.insight_regenerated',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return this.tenantPrisma.forTenant(context, (tx) => tx.attemptInsight.findUniqueOrThrow({ where: { attemptId } }));
  }

  private async requireOwnedAttempt(context: TenantContext, attemptId: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
    });
  }
}
