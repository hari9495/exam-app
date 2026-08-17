import { Injectable, NotFoundException } from '@nestjs/common';
import { Job } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { PIPELINE_STAGES, PipelineStage, isValidStage } from './pipeline-stages';
import { EntryExamResult, deriveEntryExamResults, averageRating } from './derive-entry-exam-results';

export interface JobWithCounts extends Job {
  stageCounts: Record<PipelineStage, number> & { rejected: number };
}

export interface BoardRow {
  entryId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  stage: PipelineStage;
  enteredVia: string;
  examResults: EntryExamResult[];
  avgRating: number | null;
  feedbackCount: number;
}

export interface PipelineBoard {
  stages: Record<PipelineStage, BoardRow[]>;
  rejected: BoardRow[];
}

function emptyStageCounts(): Record<PipelineStage, number> & { rejected: number } {
  const counts = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0])) as Record<PipelineStage, number>;
  return { ...counts, rejected: 0 };
}

@Injectable()
export class PipelineService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async createJob(context: TenantContext, actorUserId: string, dto: { title: string; description?: string }): Promise<Job> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const created = await tx.job.create({
        data: { organizationId: context.organizationId as string, title: dto.title, description: dto.description, createdById: actorUserId },
      });
      await this.audit.record(context, {
        actorUserId,
        action: 'job.created',
        entityType: 'job',
        entityId: created.id,
        metadata: { title: dto.title },
      });
      return created;
    });
  }

  async listJobs(context: TenantContext, status?: 'open' | 'closed'): Promise<JobWithCounts[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const jobs = await tx.job.findMany({
        where: { organizationId: context.organizationId as string, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
      });
      const grouped = await tx.pipelineEntry.groupBy({
        by: ['jobId', 'stage', 'rejected'],
        where: { organizationId: context.organizationId as string },
        _count: true,
      });
      const countsByJob = new Map<string, Record<PipelineStage, number> & { rejected: number }>();
      for (const g of grouped) {
        if (!countsByJob.has(g.jobId)) countsByJob.set(g.jobId, emptyStageCounts());
        const counts = countsByJob.get(g.jobId)!;
        const n = g._count as unknown as number;
        if (g.rejected) counts.rejected += n;
        else if (isValidStage(g.stage)) counts[g.stage] += n;
      }
      return jobs.map((job) => ({ ...job, stageCounts: countsByJob.get(job.id) ?? emptyStageCounts() }));
    });
  }

  async getJob(context: TenantContext, jobId: string): Promise<Job & { linkedExams: { examId: string; title: string }[] }> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: context.organizationId as string } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);
      const links = await tx.jobExam.findMany({ where: { jobId }, include: { exam: { select: { title: true } } } });
      const linkedExams = links.map((l) => ({ examId: l.examId, title: l.exam.title }));
      return { ...job, linkedExams };
    });
  }

  async updateJob(
    context: TenantContext,
    actorUserId: string,
    jobId: string,
    dto: { title?: string; description?: string; status?: 'open' | 'closed' },
  ): Promise<Job> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: context.organizationId as string } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);
      const data: { title?: string; description?: string; status?: string; closedAt?: Date | null } = {
        title: dto.title,
        description: dto.description,
      };
      if (dto.status) {
        data.status = dto.status;
        data.closedAt = dto.status === 'closed' ? new Date() : null;
      }
      const updated = await tx.job.update({ where: { id: jobId }, data });
      await this.audit.record(context, {
        actorUserId,
        action: 'job.updated',
        entityType: 'job',
        entityId: jobId,
        metadata: dto,
      });
      return updated;
    });
  }

  async deleteJob(context: TenantContext, actorUserId: string, jobId: string): Promise<{ success: true }> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: context.organizationId as string } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);
      await tx.job.delete({ where: { id: jobId } });
      await this.audit.record(context, {
        actorUserId,
        action: 'job.deleted',
        entityType: 'job',
        entityId: jobId,
      });
    });
    return { success: true };
  }

  async getPipeline(context: TenantContext, jobId: string): Promise<PipelineBoard> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: context.organizationId as string } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);
      const links = await tx.jobExam.findMany({ where: { jobId }, select: { examId: true } });
      const linkedExamIds = links.map((l) => l.examId);
      const entries = await tx.pipelineEntry.findMany({
        where: { jobId },
        include: {
          candidate: { include: { invitations: { include: { exam: { select: { title: true } }, attempt: { include: { result: true } } } } } },
          feedback: { select: { rating: true } },
        },
      });
      const stages = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, [] as BoardRow[]])) as Record<PipelineStage, BoardRow[]>;
      const rejected: BoardRow[] = [];
      for (const e of entries) {
        const row: BoardRow = {
          entryId: e.id,
          candidateId: e.candidateId,
          candidateName: e.candidate.name,
          candidateEmail: e.candidate.email,
          stage: e.stage as PipelineStage,
          enteredVia: e.enteredVia,
          examResults: deriveEntryExamResults(e.candidate.invitations as any, linkedExamIds),
          avgRating: averageRating(e.feedback.map((f: { rating: number | null }) => f.rating)),
          feedbackCount: e.feedback.length,
        };
        if (e.rejected) rejected.push(row);
        else if (isValidStage(e.stage)) stages[e.stage].push(row);
      }
      return { stages, rejected };
    });
  }
}
