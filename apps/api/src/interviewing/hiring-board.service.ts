import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { InvitationsService } from '../invitations/invitations.service';
import { CandidateEmailsService } from '../candidate-emails/candidate-emails.service';
import { ScorecardsService } from './scorecards.service';
import type { RejectDto } from './interviewing-dto';

export const REJECT_DELAY_HOURS = [0, 24] as const;

// Recruitment batch AT5 (M10-BUILD-DESIGN §8.1, §9): the YukthiX pipeline board on the existing pipeline. Cards add
// the stage age, the latest interview's scorecard result and the next interview. Moving a card can send a linked
// test automatically (job_exams.send_on_stage_id). A rejection message waits (default 24 h) so a mistaken rejection
// can be undone before the candidate hears; undo puts the application back where it was.
@Injectable()
export class HiringBoardService {
  private readonly logger = new Logger(HiringBoardService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly pipeline: PipelineService,
    private readonly invitations: InvitationsService,
    private readonly emails: CandidateEmailsService,
    private readonly scorecards: ScorecardsService,
  ) {}

  async board(ctx: TenantContext, jobId: string, role: string, userId: string) {
    const b = await this.pipeline.getBoard(ctx, jobId, role, userId);
    const entryIds = Object.values(b.columns).flat().map((r) => r.entryId);
    const extra = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const results = await this.scorecards.entryResults(tx, c.organizationId, entryIds);
      const now = new Date();
      const next = await tx.interviewSlot.findMany({
        where: { organizationId: c.organizationId, startsAt: { gte: now }, interview: { pipelineEntryId: { in: entryIds }, status: { not: 'cancelled' } } },
        orderBy: { startsAt: 'asc' },
        select: { startsAt: true, id: true, interview: { select: { pipelineEntryId: true, confirmedSlotId: true } } },
      });
      const pending = await tx.pendingRejection.findMany({ where: { organizationId: c.organizationId, entryId: { in: entryIds }, sentAt: null, undoneAt: null }, select: { entryId: true, sendAt: true } });
      return { results, next, pending };
    });
    const columns = Object.fromEntries(
      Object.entries(b.columns).map(([stageId, rows]) => [
        stageId,
        rows.map((r) => {
          const res = extra.results.get(r.entryId);
          const slot = extra.next.find((s) => s.interview.pipelineEntryId === r.entryId && (!s.interview.confirmedSlotId || s.interview.confirmedSlotId === s.id));
          const p = extra.pending.find((x) => x.entryId === r.entryId);
          return { ...r, scorecards: res ?? null, nextInterviewAt: slot?.startsAt ?? null, rejectionPendingUntil: p?.sendAt ?? null };
        }),
      ]),
    );
    return { pipeline: b.pipeline, columns };
  }

  /** Moves an application to a status; entering a stage with an attached test sends that test once. */
  async move(ctx: TenantContext, userId: string, entryId: string, statusId: string) {
    const r = await this.pipeline.patchEntry(ctx, userId, entryId, { statusId });
    await this.autoSendTests(ctx, entryId).catch((e) => this.logger.error(`Auto-send test failed for ${entryId}: ${e instanceof Error ? e.message : String(e)}`));
    return r;
  }

  private async autoSendTests(ctx: TenantContext, entryId: string) {
    const info = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const e = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: ctx.organizationId as string }, select: { candidateId: true, jobId: true, status: { select: { stageId: true } } } });
      if (!e?.status) return null;
      const exams = await tx.jobExam.findMany({ where: { jobId: e.jobId, sendOnStageId: e.status.stageId }, select: { examId: true } });
      const already = await tx.invitation.findMany({ where: { candidateId: e.candidateId, examId: { in: exams.map((x) => x.examId) } }, select: { examId: true } });
      return { candidateId: e.candidateId, examIds: exams.map((x) => x.examId).filter((id) => !already.some((a) => a.examId === id)) };
    });
    for (const examId of info?.examIds ?? []) await this.invitations.bulkInvite(ctx, examId, [info!.candidateId]);
  }

  /** Rejects with a reason; the optional message is sent now or after the delay (undo is possible until then). */
  async reject(ctx: TenantContext, userId: string, entryId: string, dto: RejectDto) {
    const prev = await this.tenantPrisma.forTenant(ctx, (tx) => tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: ctx.organizationId as string }, select: { statusId: true, rejected: true } }));
    if (!prev) throw new NotFoundException('Application not found.');
    if (prev.rejected) throw new ConflictException('This application is already rejected.');
    await this.pipeline.patchEntry(ctx, userId, entryId, { rejected: true, reason: dto.reason }, { skipComms: true });
    const delay = dto.delayHours ?? 24;
    if (dto.message && delay === 0) {
      await this.emails.sendMessage(ctx, userId, entryId, { templateId: dto.message.templateId ?? null, subject: dto.message.subject, body: dto.message.body, source: 'manual' });
      return { rejected: true, messageSentAt: new Date(), undoUntil: null };
    }
    const sendAt = new Date(Date.now() + delay * 3_600_000);
    await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.pendingRejection.create({ data: { organizationId: ctx.organizationId as string, entryId, previousStatusId: prev.statusId, templateId: dto.message?.templateId ?? null, subject: dto.message?.subject ?? null, body: dto.message?.body ?? null, sendAt, createdBy: userId } }),
    );
    return { rejected: true, messageSentAt: null, undoUntil: sendAt };
  }

  /** Undo a rejection while its message is still waiting: the application goes back to where it was. */
  async undo(ctx: TenantContext, userId: string, entryId: string) {
    const pending = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await tx.pendingRejection.findFirst({ where: { organizationId: c.organizationId, entryId, sentAt: null, undoneAt: null } });
      if (!p) throw new ConflictException('Too late to undo: the rejection message has gone, or there is nothing to undo.');
      const { count } = await tx.pendingRejection.updateMany({ where: { id: p.id, sentAt: null, undoneAt: null }, data: { undoneAt: new Date() } });
      if (!count) throw new ConflictException('Too late to undo: the rejection message has gone.');
      await audit(tx, c, 'ats.rejection.undone', 'pipeline_entry', entryId);
      return p;
    });
    if (pending.previousStatusId) await this.pipeline.patchEntry(ctx, userId, entryId, { statusId: pending.previousStatusId }, { skipComms: true });
    else await this.pipeline.patchEntry(ctx, userId, entryId, { rejected: false }, { skipComms: true });
    return { undone: true };
  }

  async bulk(ctx: TenantContext, userId: string, dto: { entryIds: string[]; action: 'move' | 'reject' | 'assessment'; statusId?: string; examId?: string } & RejectDto) {
    if (dto.action === 'move' && !dto.statusId) throw new BadRequestException('Choose where to move them.');
    if (dto.action === 'assessment' && !dto.examId) throw new BadRequestException('Choose the test.');
    if (dto.action === 'assessment') {
      const entries = await this.tenantPrisma.forTenant(ctx, (tx) => tx.pipelineEntry.findMany({ where: { id: { in: dto.entryIds }, organizationId: ctx.organizationId as string }, select: { candidateId: true } }));
      const r = await this.invitations.bulkInvite(ctx, dto.examId!, entries.map((e) => e.candidateId));
      return { succeeded: r.created.length, skipped: r.skipped.map((s) => ({ id: s.candidateId, reason: s.reason })) };
    }
    let succeeded = 0;
    const skipped: { id: string; reason: string }[] = [];
    for (const id of dto.entryIds) {
      try {
        if (dto.action === 'move') await this.move(ctx, userId, id, dto.statusId!);
        else await this.reject(ctx, userId, id, dto);
        succeeded++;
      } catch (e) {
        skipped.push({ id, reason: e instanceof Error ? e.message : 'Not done' });
      }
    }
    return { succeeded, skipped };
  }

  /** The job's interview and test settings: its default scorecard and, per linked test, the stage that sends it. */
  jobSettings(ctx: TenantContext, jobId: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: c.organizationId }, select: { scorecardTemplateId: true } });
      if (!job) throw new NotFoundException('Job not found.');
      const exams = await tx.jobExam.findMany({ where: { jobId, organizationId: c.organizationId }, select: { examId: true, sendOnStageId: true, exam: { select: { title: true } } } });
      return { scorecardTemplateId: job.scorecardTemplateId, exams: exams.map((e) => ({ examId: e.examId, title: e.exam.title, sendOnStageId: e.sendOnStageId })) };
    });
  }

  setJobScorecard(ctx: TenantContext, jobId: string, templateId: string | null) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (templateId && !(await tx.scorecardTemplate.findFirst({ where: { id: templateId, organizationId: c.organizationId, archivedAt: null }, select: { id: true } }))) throw new BadRequestException('That scorecard is not available.');
      const { count } = await tx.job.updateMany({ where: { id: jobId, organizationId: c.organizationId }, data: { scorecardTemplateId: templateId } });
      if (!count) throw new NotFoundException('Job not found.');
      await audit(tx, c, 'ats.job.scorecard_set', 'job', jobId, { templateId });
      return { scorecardTemplateId: templateId };
    });
  }

  setSendOn(ctx: TenantContext, jobId: string, examId: string, stageId: string | null) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: c.organizationId }, select: { pipelineId: true } });
      if (!job) throw new NotFoundException('Job not found.');
      if (stageId && !(await tx.pipelineStage.findFirst({ where: { id: stageId, pipelineId: job.pipelineId ?? undefined }, select: { id: true } }))) throw new BadRequestException('That stage is not in this job’s pipeline.');
      const { count } = await tx.jobExam.updateMany({ where: { jobId, examId, organizationId: c.organizationId }, data: { sendOnStageId: stageId } });
      if (!count) throw new NotFoundException('That test is not linked to this job.');
      await audit(tx, c, 'ats.job.test_send_on_set', 'job', jobId, { examId, stageId });
      return { sendOnStageId: stageId };
    });
  }

  /** Every few minutes: sends rejection messages whose delay has passed (claimed first, so never twice). */
  async sendDue(now = new Date()): Promise<number> {
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.pendingRejection.findMany({ where: { sentAt: null, undoneAt: null, sendAt: { lte: now } }, take: 200 }));
    let sent = 0;
    for (const p of due) {
      const ctx = { organizationId: p.organizationId, isSuperAdmin: false };
      try {
        const { count } = await this.tenantPrisma.forTenant(ctx, (tx) => tx.pendingRejection.updateMany({ where: { id: p.id, sentAt: null, undoneAt: null }, data: { sentAt: now } }));
        if (!count || !p.body || !p.subject) continue;
        await this.emails.sendMessage(ctx, p.createdBy, p.entryId, { templateId: p.templateId, subject: p.subject, body: p.body, source: 'manual' });
        sent++;
      } catch (e) {
        this.logger.error(`Rejection message ${p.id} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return sent;
  }
}
