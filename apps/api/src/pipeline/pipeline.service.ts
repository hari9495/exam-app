import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Job, PipelineEntry, PipelineFeedback } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService, StageCategory, STAGE_CATEGORIES } from '@exam-platform/shared';
import { EntryExamResult, deriveEntryExamResults, averageRating } from './derive-entry-exam-results';
import { AddEntryDto } from './dto/add-entry.dto';
import { PatchEntryDto } from './dto/patch-entry.dto';
import { AddFeedbackDto } from './dto/add-feedback.dto';
import { CandidateEmailTemplatesService } from '../candidate-emails/candidate-email-templates.service';
import { CandidateEmailsService } from '../candidate-emails/candidate-emails.service';
import { IntegrationEventsService } from '../integrations/integration-events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalsService, ApprovalSummary, SubmitResult } from '../approvals/approvals.service';
import { computeCriteriaHash, validateRubricInput } from '../candidate-fit/candidate-fit.core';
import { PipelinesService } from './pipelines.service';

export interface FeedbackRow {
  id: string;
  authorUserId: string;
  authorName: string | null;
  note: string | null;
  rating: number | null;
  createdAt: Date;
}

export interface StageCounts {
  byStageId: Record<string, number>;
  byCategory: Record<StageCategory, number>;
}

export interface JobWithCounts extends Job {
  stageCounts: StageCounts;
  approval: ApprovalSummary | null;
}

export interface BoardRow {
  entryId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  statusId: string;
  stageId: string;
  category: StageCategory;
  enteredVia: string;
  rejectedReason: string | null;
  examResults: EntryExamResult[];
  avgRating: number | null;
  feedbackCount: number;
  fitScore: number | null;
  fitStatus: string | null;
  assignedUserId: string | null;
  assigneeName: string | null;
  fitStale: boolean;
}

export interface BoardStage {
  id: string;
  name: string;
  category: StageCategory;
  position: number;
  statuses: { id: string; name: string; position: number }[];
}

export interface Board {
  pipeline: { id: string; name: string; stages: BoardStage[] };
  columns: Record<string, BoardRow[]>;
}

// RFC-4180 CSV field encode + spreadsheet formula-injection guard: a leading =/+/-/@ (or tab/CR)
// can execute as a formula in Excel/Sheets, so prefix those with a quote before RFC-4180 quoting.
function csvEscape(value: string): string {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function emptyByCategory(): Record<StageCategory, number> {
  return Object.fromEntries(STAGE_CATEGORIES.map((c) => [c, 0])) as Record<StageCategory, number>;
}

// Every stage/status shape below (Prisma rows, plain fixtures, etc.) only needs id/category/statuses
// for counting purposes -- kept structural rather than importing Prisma's generated types here.
type CountableStage = { id: string; category: string; statuses: { id: string }[] };

function buildStatusToStageMap(stages: CountableStage[]): Map<string, { stageId: string; category: StageCategory }> {
  const map = new Map<string, { stageId: string; category: StageCategory }>();
  for (const s of stages) for (const st of s.statuses) map.set(st.id, { stageId: s.id, category: s.category as StageCategory });
  return map;
}

// Rolls up per-status entry counts (statusId -> count) into per-stage and per-category totals,
// using the job's pipeline stages to seed every stage at 0 (so an empty stage still shows up).
function rollUpStageCounts(
  stages: { id: string; category: string }[],
  countsByStatusId: Map<string, number>,
  statusToStage: Map<string, { stageId: string; category: StageCategory }>,
): StageCounts {
  const byStageId: Record<string, number> = Object.fromEntries(stages.map((s) => [s.id, 0]));
  const byCategory = emptyByCategory();
  for (const [statusId, n] of countsByStatusId) {
    const info = statusToStage.get(statusId);
    if (!info) continue;
    byStageId[info.stageId] = (byStageId[info.stageId] ?? 0) + n;
    byCategory[info.category] = (byCategory[info.category] ?? 0) + n;
  }
  return { byStageId, byCategory };
}

export interface PendingMessage {
  templateId: string | null;
  subject: string;
  body: string;
}

export interface PatchEntryResult {
  entry: PipelineEntry;
  pendingMessage?: PendingMessage;
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly templates: CandidateEmailTemplatesService,
    private readonly messages: CandidateEmailsService,
    private readonly integrationEvents: IntegrationEventsService,
    private readonly notifications: NotificationsService,
    private readonly approvals: ApprovalsService,
    private readonly pipelines: PipelinesService,
  ) {}

  async createJob(
    context: TenantContext,
    actorUserId: string,
    dto: {
      title: string;
      description?: string;
      location?: string;
      employmentType?: string;
      department?: string;
      hiringManagerId?: string;
      headcount?: number;
      salaryMin?: number;
      salaryMax?: number;
      salaryCurrency?: string;
      pipelineId?: string;
    },
  ): Promise<Job> {
    // Requisition gate: a job can't go live (status 'open') until its requisition is approved,
    // but only when the org has actually turned the gate on -- an org with no chain configured
    // keeps today's behavior of jobs opening immediately.
    const chains = await this.approvals.getChains(context);
    const status = chains.requisition.enabled ? 'draft' : 'open';
    const pipelineId = await this.resolvePipelineId(context, dto.pipelineId);

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const created = await tx.job.create({
        data: {
          organizationId: context.organizationId as string,
          title: dto.title,
          description: dto.description,
          location: dto.location,
          employmentType: dto.employmentType,
          department: dto.department,
          hiringManagerId: dto.hiringManagerId,
          headcount: dto.headcount,
          salaryMin: dto.salaryMin,
          salaryMax: dto.salaryMax,
          salaryCurrency: dto.salaryCurrency,
          createdById: actorUserId,
          status,
          pipelineId,
        },
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

  // Resolves the pipeline a new job should use: the caller's requested pipeline, but only if it
  // actually belongs to this org -- a stale/foreign id falls back to the org default rather than
  // 400ing, since picking a pipeline is a convenience, not something worth blocking job creation
  // over.
  private async resolvePipelineId(context: TenantContext, requestedId?: string): Promise<string> {
    if (requestedId) {
      const owned = await this.tenantPrisma.forTenant(context, (tx) =>
        tx.pipeline.findFirst({ where: { id: requestedId, organizationId: context.organizationId as string }, select: { id: true } }),
      );
      if (owned) return owned.id;
    }
    return (await this.pipelines.getDefaultPipeline(context)).id;
  }

  async listJobs(context: TenantContext, status?: 'open' | 'closed'): Promise<JobWithCounts[]> {
    const jobs = await this.tenantPrisma.forTenant(context, async (tx) => {
      const jobs = await tx.job.findMany({
        where: { organizationId: context.organizationId as string, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
      });

      // Batch-load every distinct pipeline the listed jobs use (usually just the org default) --
      // one query for the whole list, not one per job.
      const pipelineIds = [...new Set(jobs.map((j) => j.pipelineId).filter((id): id is string => Boolean(id)))];
      const pipelines = pipelineIds.length
        ? await tx.pipeline.findMany({
            where: { id: { in: pipelineIds } },
            include: { stages: { orderBy: { position: 'asc' }, include: { statuses: { orderBy: { position: 'asc' } } } } },
          })
        : [];
      const stagesByPipelineId = new Map(pipelines.map((p: { id: string; stages: CountableStage[] }) => [p.id, p.stages]));
      const statusToStage = buildStatusToStageMap(pipelines.flatMap((p: { stages: CountableStage[] }) => p.stages));

      const grouped = await tx.pipelineEntry.groupBy({
        by: ['jobId', 'statusId'],
        where: { organizationId: context.organizationId as string },
        _count: true,
      });
      const countsByJob = new Map<string, Map<string, number>>();
      for (const g of grouped) {
        if (!g.statusId) continue;
        if (!countsByJob.has(g.jobId)) countsByJob.set(g.jobId, new Map());
        countsByJob.get(g.jobId)!.set(g.statusId, g._count as unknown as number);
      }

      return jobs.map((job) => ({
        ...job,
        stageCounts: rollUpStageCounts(
          job.pipelineId ? (stagesByPipelineId.get(job.pipelineId) ?? []) : [],
          countsByJob.get(job.id) ?? new Map(),
          statusToStage,
        ),
      }));
    });

    // One batched call for the whole list, not one per job -- avoids N+1.
    const approvalByJobId = await this.approvals.getSummariesFor(context, 'job', jobs.map((j) => j.id));
    return jobs.map((job) => ({ ...job, approval: approvalByJobId.get(job.id) ?? null }));
  }

  // Single-job version of the counts rollup above (getJob's detail view, and standalone callers
  // that only need one job's counts without paying for the whole list's batched queries).
  async stageCountsFor(context: TenantContext, jobId: string): Promise<StageCounts> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({
        where: { id: jobId, organizationId: context.organizationId as string },
        include: { pipeline: { include: { stages: { orderBy: { position: 'asc' }, include: { statuses: { orderBy: { position: 'asc' } } } } } } },
      });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);
      const stages = job.pipeline?.stages ?? [];
      const statusToStage = buildStatusToStageMap(stages);

      const grouped = await tx.pipelineEntry.groupBy({ by: ['statusId'], where: { jobId }, _count: true });
      const countsByStatusId = new Map<string, number>();
      for (const g of grouped) {
        if (!g.statusId) continue;
        countsByStatusId.set(g.statusId, g._count as unknown as number);
      }
      return rollUpStageCounts(stages, countsByStatusId, statusToStage);
    });
  }

  async getJob(context: TenantContext, jobId: string): Promise<Job & { linkedExams: { examId: string; title: string }[]; approval: ApprovalSummary | null }> {
    const { job, linkedExams } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: context.organizationId as string } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);
      const links = await tx.jobExam.findMany({ where: { jobId }, include: { exam: { select: { title: true } } } });
      const linkedExams = links.map((l) => ({ examId: l.examId, title: l.exam.title }));
      return { job, linkedExams };
    });
    const approval = (await this.approvals.getSummariesFor(context, 'job', [jobId])).get(jobId) ?? null;
    return { ...job, linkedExams, approval };
  }

  async updateJob(
    context: TenantContext,
    actorUserId: string,
    jobId: string,
    dto: {
      title?: string;
      description?: string;
      status?: 'open' | 'closed';
      publicApplyEnabled?: boolean;
      fitCriteria?: string | null;
      fitRubric?: { label: string; weight: number }[] | null;
      location?: string;
      employmentType?: string;
      department?: string;
      hiringManagerId?: string;
      headcount?: number;
      salaryMin?: number;
      salaryMax?: number;
      salaryCurrency?: string;
    },
  ): Promise<Job> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: context.organizationId as string } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);

      // Gate bypass guard: a requisition becomes 'open' only through the approvals engine
      // (submitRequisition -> ApprovalsService.decide), never via a direct PATCH. closed<->open
      // stays a free status flip either way.
      if (dto.status === 'open' && (job.status === 'draft' || job.status === 'pending_approval')) {
        throw new ConflictException('A requisition becomes open through approval, not a direct status change');
      }

      // Field-locking (spec 3.1): while a requisition is pending approval, the fields the
      // approver is reviewing can't be changed out from under them -- cancel the pending
      // approval first. description (and any other field) stays freely editable.
      if (job.status === 'pending_approval') {
        const lockedFields = ['title', 'department', 'headcount', 'salaryMin', 'salaryMax', 'salaryCurrency', 'hiringManagerId'] as const;
        for (const field of lockedFields) {
          if (dto[field] !== undefined && dto[field] !== job[field]) {
            throw new ConflictException('Cancel the pending approval before editing requisition details');
          }
        }
      }

      const data: {
        title?: string;
        description?: string;
        status?: string;
        closedAt?: Date | null;
        publicApplyEnabled?: boolean;
        applyToken?: string;
        fitCriteria?: string | null;
        fitRubric?: string | null;
        location?: string;
        employmentType?: string;
        department?: string;
        hiringManagerId?: string;
        headcount?: number;
        salaryMin?: number;
        salaryMax?: number;
        salaryCurrency?: string;
      } = {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        employmentType: dto.employmentType,
        department: dto.department,
        hiringManagerId: dto.hiringManagerId,
        headcount: dto.headcount,
        salaryMin: dto.salaryMin,
        salaryMax: dto.salaryMax,
        salaryCurrency: dto.salaryCurrency,
      };
      if (dto.status) {
        data.status = dto.status;
        data.closedAt = dto.status === 'closed' ? new Date() : null;
      }
      if (dto.publicApplyEnabled !== undefined) {
        // Can't start collecting public applications while the requisition is gated (draft or
        // pending_approval); a closed job (gate off, or previously open+closed) may still
        // re-enable it, matching pre-gate behavior. Disabling it back off is always allowed.
        if (dto.publicApplyEnabled && (job.status === 'draft' || job.status === 'pending_approval')) {
          throw new ConflictException('Requisition not approved');
        }
        data.publicApplyEnabled = dto.publicApplyEnabled;
        // Mint once, on first enable; never rotate an existing token and never clear it on
        // toggle-off, so a re-enable reuses the same public URL recruiters may have already shared.
        if (dto.publicApplyEnabled && !job.applyToken) {
          data.applyToken = randomUUID();
        }
      }
      if (dto.fitCriteria !== undefined) {
        data.fitCriteria = dto.fitCriteria?.trim() || null;
      }
      if (dto.fitRubric !== undefined) {
        let dims;
        try {
          dims = validateRubricInput(dto.fitRubric ?? []);
        } catch (e) {
          throw new BadRequestException((e as Error).message);
        }
        data.fitRubric = dims.length ? JSON.stringify(dims) : null;
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

  // Org-scoped status flips for the requisition lifecycle. updateMany (not update) since the
  // caller has already resolved the job by id but these are also reachable standalone (Task 12
  // reuses both) -- the organizationId filter keeps them tenant-safe either way.
  async markRequisitionApproved(context: TenantContext, jobId: string): Promise<void> {
    await this.setJobStatus(context, jobId, 'open');
  }

  async markRequisitionDraft(context: TenantContext, jobId: string): Promise<void> {
    await this.setJobStatus(context, jobId, 'draft');
  }

  private async setJobStatus(context: TenantContext, jobId: string, status: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.job.updateMany({ where: { id: jobId, organizationId: context.organizationId as string }, data: { status } }),
    );
  }

  // Submits the job's requisition through the approvals engine. Only a draft job can be
  // submitted -- one already open, pending, or closed has either cleared this gate already or
  // isn't eligible for it. Mirrors the auto-pass/pending split ApprovalsService.submit returns.
  async submitRequisition(context: TenantContext, actorUserId: string, jobId: string): Promise<SubmitResult> {
    const job = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.job.findFirst({ where: { id: jobId, organizationId: context.organizationId as string } }),
    );
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    if (job.status !== 'draft') throw new ConflictException('Only a draft requisition can be submitted');

    const result = await this.approvals.submit(context, 'requisition', jobId, actorUserId);
    if (result.status === 'approved') {
      await this.markRequisitionApproved(context, jobId);
    } else {
      await this.setJobStatus(context, jobId, 'pending_approval');
    }
    return result;
  }

  // Cancels the job's open approval request (permission-checked by ApprovalsService.cancel via
  // isConfigurer) and puts the requisition back in draft so it can be edited and resubmitted.
  async cancelRequisitionApproval(context: TenantContext, actorUserId: string, jobId: string): Promise<void> {
    const isConfigurer = await this.approvals.isConfigurer(context, actorUserId);
    await this.approvals.cancelForSubject(context, 'job', jobId, actorUserId, isConfigurer);
    await this.markRequisitionDraft(context, jobId);
  }

  // Candidate/pipeline CSV export for ATS/HRIS interchange. Formula-injection-safe (candidate
  // name/email/phone come from the public apply form).
  async exportJobCandidatesCsv(context: TenantContext, jobId: string): Promise<string> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: context.organizationId as string } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);
      const entries = await tx.pipelineEntry.findMany({
        where: { jobId },
        select: {
          rejected: true,
          createdAt: true,
          status: { select: { stage: { select: { name: true } } } },
          candidate: { select: { name: true, email: true, phone: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      const header = ['Name', 'Email', 'Phone', 'Stage', 'Status', 'Applied At'];
      const rows = entries.map((e) => [
        e.candidate?.name ?? '',
        e.candidate?.email ?? '',
        e.candidate?.phone ?? '',
        e.status?.stage.name ?? '',
        e.rejected ? 'rejected' : 'active',
        e.createdAt.toISOString(),
      ]);
      return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
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

  async getBoard(context: TenantContext, jobId: string): Promise<Board> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({
        where: { id: jobId, organizationId: context.organizationId as string },
        include: { pipeline: { include: { stages: { orderBy: { position: 'asc' }, include: { statuses: { orderBy: { position: 'asc' } } } } } } },
      });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);
      const links = await tx.jobExam.findMany({ where: { jobId }, select: { examId: true } });
      const linkedExamIds = links.map((l) => l.examId);
      const entries = await tx.pipelineEntry.findMany({
        where: { jobId },
        include: {
          candidate: { include: { invitations: { include: { exam: { select: { title: true } }, attempt: { include: { result: true } } } } } },
          feedback: { select: { rating: true } },
          fitAssessment: true,
          status: { include: { stage: true } },
        },
      });
      const currentHash = computeCriteriaHash({
        title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric,
      });
      // Resolve assignee display names in one batched query.
      const assigneeIds = [...new Set(entries.map((e) => e.assignedUserId).filter((id): id is string => Boolean(id)))];
      const assignees = assigneeIds.length
        ? await tx.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
        : [];
      const assigneeName = new Map(assignees.map((a: { id: string; name: string | null }) => [a.id, a.name]));

      const stages = job.pipeline?.stages ?? [];
      const columns: Record<string, BoardRow[]> = Object.fromEntries(stages.map((s: { id: string }) => [s.id, [] as BoardRow[]]));
      for (const e of entries) {
        if (!e.status) continue; // no status resolved yet (pre-migration edge case) -- can't place on a dynamic column
        const row: BoardRow = {
          entryId: e.id,
          candidateId: e.candidateId,
          candidateName: e.candidate.name,
          candidateEmail: e.candidate.email,
          statusId: e.status.id,
          stageId: e.status.stage.id,
          category: e.status.stage.category as StageCategory,
          enteredVia: e.enteredVia,
          rejectedReason: e.rejectedReason,
          examResults: deriveEntryExamResults(e.candidate.invitations as any, linkedExamIds),
          avgRating: averageRating(e.feedback.map((f: { rating: number | null }) => f.rating)),
          feedbackCount: e.feedback.length,
          fitScore: e.fitAssessment?.overallScore ?? null,
          fitStatus: e.fitAssessment?.status ?? null,
          fitStale: e.fitAssessment?.status === 'done' && e.fitAssessment.criteriaHash !== currentHash,
          assignedUserId: e.assignedUserId,
          assigneeName: e.assignedUserId ? (assigneeName.get(e.assignedUserId) ?? null) : null,
        };
        (columns[row.stageId] ??= []).push(row);
      }

      return {
        pipeline: {
          id: job.pipeline?.id ?? '',
          name: job.pipeline?.name ?? '',
          stages: stages.map((s: { id: string; name: string; category: string; position: number; statuses: { id: string; name: string; position: number }[] }) => ({
            id: s.id,
            name: s.name,
            category: s.category as StageCategory,
            position: s.position,
            statuses: s.statuses.map((st) => ({ id: st.id, name: st.name, position: st.position })),
          })),
        },
        columns,
      };
    });
  }

  async addEntry(context: TenantContext, actorUserId: string, jobId: string, dto: AddEntryDto): Promise<PipelineEntry> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({
        where: { id: jobId, organizationId: context.organizationId as string },
        include: {
          pipeline: {
            include: { stages: { orderBy: { position: 'asc' }, include: { statuses: { orderBy: { position: 'asc' } } } } },
          },
        },
      });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);
      if (job.status === 'draft' || job.status === 'pending_approval') throw new ConflictException('Requisition not approved');

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

      // New entries land on the job's pipeline's first active-category stage's first status (by
      // position); falls back to the pipeline's first stage at all if none is category 'active',
      // and to no statusId if the job has no pipeline (pre-migration edge case -- shouldn't
      // happen post-seed, since every job gets pipelineId backfilled).
      const activeStage = job.pipeline?.stages.find((s) => s.category === 'active') ?? job.pipeline?.stages[0];
      const statusId = activeStage?.statuses[0]?.id;

      const entry = await tx.pipelineEntry.upsert({
        where: { jobId_candidateId: { jobId, candidateId } },
        create: { organizationId: context.organizationId as string, jobId, candidateId, enteredVia: 'manual', statusId },
        update: {}, // stamp-if-absent: never touch stage/enteredVia/statusId on re-add
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

  async patchEntry(context: TenantContext, actorUserId: string, entryId: string, dto: PatchEntryDto): Promise<PatchEntryResult> {
    let didHire = false;
    // The stage a template's triggerStageId is matched against for the post-commit comms hook.
    let commsStageId: string | null = null;

    const entry = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.pipelineEntry.findFirst({
        where: { id: entryId, organizationId: context.organizationId as string },
        include: { job: { select: { pipelineId: true } }, status: { include: { stage: true } } },
      });
      if (!existing) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      const previousCategory = existing.status?.stage.category;

      let data: { statusId?: string; rejected: boolean; rejectedReason: string | null; rejectedAt: Date | null; archivedAt: Date | null };
      let action: string;
      if (dto.statusId !== undefined) {
        const resolved = await this.pipelines.resolveStatus(context, dto.statusId);
        if (!resolved || resolved.stage.pipelineId !== existing.job.pipelineId) {
          throw new BadRequestException('status does not belong to the job pipeline');
        }
        const category = resolved.stage.category;
        data = {
          statusId: dto.statusId,
          rejected: category === 'rejected',
          rejectedReason: category === 'rejected' ? (dto.reason ?? null) : null,
          rejectedAt: category === 'rejected' ? new Date() : null,
          archivedAt: category === 'archived' ? new Date() : null,
        };
        action = 'entry.stage_changed';
        didHire = category === 'hired' && previousCategory !== 'hired';
        commsStageId = resolved.stage.id;
      } else if (dto.rejected === true) {
        // Back-compat: a caller sending only `rejected:true` (no statusId) still lands the entry
        // on the pipeline's first rejected-category status, so statusId and the rejected mirror
        // never disagree. Skips (leaves statusId untouched) if the job has no pipeline yet --
        // shouldn't happen post-migration, but keeps this branch safe rather than throwing.
        let rejectStatusId: string | undefined;
        let rejectStageId: string | undefined;
        if (existing.job.pipelineId) {
          const rejectStage = await tx.pipelineStage.findFirst({
            where: { pipelineId: existing.job.pipelineId, category: 'rejected' },
            orderBy: { position: 'asc' },
            include: { statuses: { orderBy: { position: 'asc' }, take: 1 } },
          });
          rejectStatusId = rejectStage?.statuses[0]?.id;
          rejectStageId = rejectStage?.id;
        }
        // Edge case: a pipeline with no rejected-category stage (or one with no statuses on it)
        // leaves rejectStatusId undefined -- statusId stays whatever it already was while
        // `rejected` still flips true, since the reject-mirror flag must not be lost.
        data = {
          ...(rejectStatusId ? { statusId: rejectStatusId } : {}),
          rejected: true,
          rejectedReason: dto.reason ?? null,
          rejectedAt: new Date(),
          archivedAt: null,
        };
        action = 'entry.rejected';
        commsStageId = rejectStageId ?? null;
      } else if (dto.rejected === false) {
        data = { rejected: false, rejectedReason: null, rejectedAt: null, archivedAt: null };
        action = 'entry.unrejected';
      } else {
        throw new BadRequestException('patchEntry requires a statusId or a rejected flag');
      }

      const updated = await tx.pipelineEntry.update({ where: { id: entryId }, data });
      await this.audit.record(context, { actorUserId, action, entityType: 'pipeline_entry', entityId: entryId, metadata: { ...dto } });
      return updated;
    });

    // Fan the hire out to integrations (webhook/chat/Zapier -> the org's HRIS for onboarding).
    // Post-commit, in its own guard so it fires regardless of the comms branch below and can never
    // affect the stage move that already persisted. emit() is itself never-throw. Gated on the
    // transition INTO a hired-category status (didHire, computed from the previous status's
    // category) so a re-save can't re-trigger onboarding.
    if (didHire) {
      try {
        const info = await this.tenantPrisma.forTenant(context, (tx) =>
          tx.pipelineEntry.findUnique({
            where: { id: entryId },
            select: { candidateId: true, candidate: { select: { name: true } }, job: { select: { title: true } } },
          }),
        );
        if (info) {
          await this.integrationEvents.emit(context.organizationId as string, 'candidate.hired', {
            subject: info.candidate?.name ?? '',
            roleTitle: info.job?.title ?? '',
            linkPath: `/candidates/${info.candidateId}`,
          });
        }
      } catch (e) {
        this.logger.error(`candidate.hired emit failed for entry ${entryId}`, e as Error);
      }
    }

    // Stage-move comms hook: runs AFTER the tx above has committed. Wrapped so a transient
    // failure here (e.g. resolveForStage hitting a starved pool) can never surface as an error
    // for a stage move that already persisted.
    try {
      if (commsStageId) {
        const tpl = await this.templates.resolveForStage(context, commsStageId);
        if (tpl?.triggerMode === 'auto') {
          // Fire-and-forget: the stage-move response must not block on email delivery.
          this.messages
            .sendMessage(context, null, entryId, { templateId: tpl.id, subject: tpl.subject, body: tpl.body, source: 'stage_auto' })
            .catch((e) => this.logger.error(`Auto-send candidate email failed for entry ${entryId}`, e));
        } else if (tpl?.triggerMode === 'prompt') {
          return { entry, pendingMessage: { templateId: tpl.id, subject: tpl.subject, body: tpl.body } };
        }
      }
    } catch (e) {
      this.logger.error(`Post-commit comms resolution failed for entry ${entryId}`, e as Error);
    }
    return { entry };
  }

  async linkExam(context: TenantContext, actorUserId: string, jobId: string, examId: string): Promise<{ success: true }> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: context.organizationId as string } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);

      await tx.jobExam.upsert({
        where: { jobId_examId: { jobId, examId } },
        create: { organizationId: context.organizationId as string, jobId, examId },
        update: {},
      });

      // Backfill: every candidate already invited to this exam gets a stamp-if-absent entry.
      const invitations = await tx.invitation.findMany({ where: { examId }, select: { candidateId: true } });
      const candidateIds = invitations.map((i) => i.candidateId);
      await this.syncEntriesForInvitations(tx, context, examId, candidateIds);

      await this.audit.record(context, {
        actorUserId,
        action: 'job.exam_linked',
        entityType: 'job',
        entityId: jobId,
        metadata: { examId },
      });
    });
    return { success: true };
  }

  async unlinkExam(context: TenantContext, actorUserId: string, jobId: string, examId: string): Promise<{ success: true }> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      // deleteMany, not delete: the link may already be gone (double-click, already
      // unlinked) and unlinking a non-existent link should be a no-op, not a 404/error.
      await tx.jobExam.deleteMany({ where: { jobId, examId } });
      await this.audit.record(context, {
        actorUserId,
        action: 'job.exam_unlinked',
        entityType: 'job',
        entityId: jobId,
        metadata: { examId },
      });
    });
    return { success: true };
  }

  /**
   * Stamps an `enteredVia='exam'` pipeline entry for every (job linked to `examId`) x
   * candidate pair. Runs inside the CALLER's transaction (e.g. invitations.bulkInvite's own
   * forTenant, or linkExam's) rather than opening its own -- so entry creation is atomic with
   * whatever triggered it (an invitation being sent, or a job being linked to an exam).
   * Stamp-if-absent (update:{}): never resets an existing entry's stage/enteredVia.
   */
  async syncEntriesForInvitations(tx: any, context: TenantContext, examId: string, candidateIds: string[]): Promise<void> {
    const links = await tx.jobExam.findMany({ where: { examId }, select: { jobId: true } });
    for (const { jobId } of links) {
      for (const candidateId of candidateIds) {
        await tx.pipelineEntry.upsert({
          where: { jobId_candidateId: { jobId, candidateId } },
          create: { organizationId: context.organizationId as string, jobId, candidateId, enteredVia: 'exam' },
          update: {},
        });
      }
    }
  }

  // Called from within an existing forTenant transaction (walk-in register, or setJob's backfill)
  // so entry creation is atomic with whatever triggered it. Stamp-if-absent: never resets an
  // existing entry's stage/enteredVia (a candidate already at 'interview' isn't yanked back).
  async upsertDriveEntry(tx: any, context: TenantContext, jobId: string, candidateId: string): Promise<void> {
    await tx.pipelineEntry.upsert({
      where: { jobId_candidateId: { jobId, candidateId } },
      create: { organizationId: context.organizationId as string, jobId, candidateId, enteredVia: 'drive' },
      update: {},
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

  async addFeedback(context: TenantContext, userId: string, entryId: string, dto: AddFeedbackDto): Promise<PipelineFeedback> {
    if (!dto.note?.trim() && dto.rating == null) throw new BadRequestException('note or rating required');
    const { created, candidateId, candidateName } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({
        where: { id: entryId, organizationId: context.organizationId as string },
        select: { id: true, candidateId: true, candidate: { select: { name: true } } },
      });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);

      const created = await tx.pipelineFeedback.create({
        data: { organizationId: context.organizationId as string, entryId, authorUserId: userId, note: dto.note ?? null, rating: dto.rating ?? null },
      });
      await this.audit.record(context, {
        actorUserId: userId,
        action: 'feedback.added',
        entityType: 'pipeline_entry',
        entityId: entryId,
        metadata: { rating: dto.rating ?? null },
      });
      return { created, candidateId: entry.candidateId, candidateName: entry.candidate?.name ?? null };
    });

    // Notify @mentioned teammates -- post-commit, own tx, never breaks the feedback write.
    if (dto.mentionedUserIds?.length) {
      try {
        await this.notifications.createMentions(context, userId, dto.mentionedUserIds, {
          entityType: 'pipeline_entry',
          entityId: entryId,
          contextText: candidateName,
          linkPath: `/candidates/${candidateId}`,
        });
      } catch (e) {
        this.logger.error(`mention notification failed for entry ${entryId}`, e as Error);
      }
    }
    return created;
  }

  // Assign (or unassign, with null) a candidate to a teammate. Notifies the new assignee.
  async assignEntry(context: TenantContext, actorUserId: string, entryId: string, assigneeUserId: string | null): Promise<{ success: true }> {
    const orgId = context.organizationId as string;
    const { candidateId, candidateName } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({
        where: { id: entryId, organizationId: orgId },
        select: { id: true, candidateId: true, candidate: { select: { name: true } } },
      });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      if (assigneeUserId) {
        const user = await tx.user.findFirst({ where: { id: assigneeUserId, organizationId: orgId }, select: { id: true } });
        if (!user) throw new BadRequestException('Assignee is not a member of this organization');
      }
      await tx.pipelineEntry.update({ where: { id: entryId }, data: { assignedUserId: assigneeUserId } });
      await this.audit.record(context, {
        actorUserId,
        action: 'entry.assigned',
        entityType: 'pipeline_entry',
        entityId: entryId,
        metadata: { assignedUserId: assigneeUserId },
      });
      return { candidateId: entry.candidateId, candidateName: entry.candidate?.name ?? null };
    });

    // Notify the new assignee (post-commit; notify drops the actor, so self-assign is silent).
    if (assigneeUserId) {
      try {
        await this.notifications.notify(context, actorUserId, [assigneeUserId], 'assigned', {
          entityType: 'pipeline_entry',
          entityId: entryId,
          contextText: candidateName,
          linkPath: `/candidates/${candidateId}`,
        });
      } catch (e) {
        this.logger.error(`assignment notification failed for entry ${entryId}`, e as Error);
      }
    }
    return { success: true };
  }

  async listFeedback(context: TenantContext, entryId: string): Promise<FeedbackRow[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: context.organizationId as string } });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);

      const feedback = await tx.pipelineFeedback.findMany({ where: { entryId }, orderBy: { createdAt: 'desc' } });
      const authorIds = [...new Set(feedback.map((f: PipelineFeedback) => f.authorUserId))];
      const authors = await tx.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } });
      const nameById = new Map(authors.map((a: { id: string; name: string | null }) => [a.id, a.name]));

      return feedback.map((f: PipelineFeedback) => ({
        id: f.id,
        authorUserId: f.authorUserId,
        authorName: nameById.get(f.authorUserId) ?? null,
        note: f.note,
        rating: f.rating,
        createdAt: f.createdAt,
      }));
    });
  }
}
