import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Job, PipelineEntry } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { PIPELINE_STAGES, PipelineStage, isValidStage } from './pipeline-stages';
import { EntryExamResult, deriveEntryExamResults, averageRating } from './derive-entry-exam-results';
import { AddEntryDto } from './dto/add-entry.dto';
import { PatchEntryDto } from './dto/patch-entry.dto';

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

  async addEntry(context: TenantContext, actorUserId: string, jobId: string, dto: AddEntryDto): Promise<PipelineEntry> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: context.organizationId as string } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);

      let candidateId: string;
      if (dto.newCandidate) {
        const candidate = await tx.candidate.upsert({
          where: { organizationId_email: { organizationId: context.organizationId as string, email: dto.newCandidate.email } },
          create: {
            organizationId: context.organizationId as string,
            email: dto.newCandidate.email,
            name: dto.newCandidate.name,
            phone: dto.newCandidate.phone,
          },
          update: { name: dto.newCandidate.name, phone: dto.newCandidate.phone },
        });
        candidateId = candidate.id;
      } else if (dto.candidateId) {
        candidateId = dto.candidateId;
        const cand = await tx.candidate.findFirst({ where: { id: candidateId, organizationId: context.organizationId as string } });
        if (!cand) throw new NotFoundException(`Candidate ${candidateId} not found`);
      } else {
        throw new BadRequestException('candidateId or newCandidate is required');
      }

      const entry = await tx.pipelineEntry.upsert({
        where: { jobId_candidateId: { jobId, candidateId } },
        create: { organizationId: context.organizationId as string, jobId, candidateId, stage: 'applied', enteredVia: 'manual' },
        update: {}, // stamp-if-absent: never touch stage/enteredVia on re-add
      });
      await this.audit.record(context, {
        actorUserId,
        action: 'entry.added',
        entityType: 'pipeline_entry',
        entityId: entry.id,
        metadata: { jobId, candidateId },
      });
      return entry;
    });
  }

  async patchEntry(context: TenantContext, actorUserId: string, entryId: string, dto: PatchEntryDto): Promise<PipelineEntry> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: context.organizationId as string } });
      if (!existing) throw new NotFoundException(`Pipeline entry ${entryId} not found`);

      let data: { stage?: string; rejected: boolean; rejectedReason: string | null; rejectedAt: Date | null };
      let action: string;
      if (dto.stage !== undefined) {
        if (!isValidStage(dto.stage)) throw new BadRequestException(`Invalid stage ${dto.stage}`);
        data = { stage: dto.stage, rejected: false, rejectedReason: null, rejectedAt: null };
        action = 'entry.stage_changed';
      } else if (dto.rejected === true) {
        data = { rejected: true, rejectedReason: dto.reason ?? null, rejectedAt: new Date() };
        action = 'entry.rejected';
      } else if (dto.rejected === false) {
        data = { rejected: false, rejectedReason: null, rejectedAt: null };
        action = 'entry.unrejected';
      } else {
        throw new BadRequestException('patchEntry requires a stage or a rejected flag');
      }

      const entry = await tx.pipelineEntry.update({ where: { id: entryId }, data });
      await this.audit.record(context, { actorUserId, action, entityType: 'pipeline_entry', entityId: entryId, metadata: { ...dto } });
      return entry;
    });
  }

  async deleteEntry(context: TenantContext, actorUserId: string, entryId: string): Promise<{ success: true }> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: context.organizationId as string } });
      if (!existing) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      await tx.pipelineEntry.delete({ where: { id: entryId } });
      await this.audit.record(context, { actorUserId, action: 'entry.removed', entityType: 'pipeline_entry', entityId: entryId });
    });
    return { success: true };
  }
}
