import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { CandidatesService } from '../candidates/candidates.service';
import { EmailService } from '../email/email.service';
import { retentionStep, type RetentionStep } from './talent-rules';

type Row = { id: string; merged: boolean; legal_hold_at: Date | null; retention_notice_at: Date | null; last_activity_at: Date; hired: boolean; open_process: boolean };
export type RetentionPlanItem = { candidateId: string; action: Exclude<RetentionStep, null> };
const COUNTER = { renewal_sent: 'renewalsSent', anonymised: 'anonymised', skipped_hold: 'skippedHold', skipped_open: 'skippedOpen', skipped_hired: 'skippedHired' } as const;

// Recruitment batch AT4 (M10-BUILD-DESIGN §13, rule YX-ATS-53, M10 Q6): the daily candidate retention sweep.
// Non-hired candidates with no activity for the company's period get one renewal email 30 days before the end, then
// are anonymised (the data-rights erase: personal data and free text go, funnel facts stay). Anyone under legal hold,
// hired, or in an open process is skipped and reported. Safe to re-run: a renewal is claimed before it is sent and an
// erased candidate is never touched again. A dry run reads the same facts and changes nothing.
@Injectable()
export class CandidateRetentionService {
  private readonly logger = new Logger(CandidateRetentionService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly candidates: CandidatesService,
    private readonly email: EmailService,
  ) {}

  /** Scheduled: every company with candidates, each in its own context. */
  async sweep(now = new Date()): Promise<number> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM candidates WHERE erased_at IS NULL`);
    let changed = 0;
    for (const { id } of orgs) {
      try {
        const r = await this.run({ organizationId: id, isSuperAdmin: false, userId: null }, { dryRun: false, now });
        changed += r.renewalsSent + r.anonymised;
      } catch (e) {
        this.logger.error(`Candidate retention failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return changed;
  }

  async run(ctx: TenantContext, opts: { dryRun: boolean; now?: Date }) {
    const now = opts.now ?? new Date();
    const { months, rows } = await inCompany(this.tenantPrisma, ctx, async (tx, c) => ({
      months: Number(await settingFor(tx, c, 'ats.retention_months', { legalEntityId: '' })),
      // Last activity: created, renewed, any application change, any consent given.
      rows: await tx.$queryRaw<Row[]>`
        SELECT c.id::text AS id, c.merged_into_id IS NOT NULL AS merged, c.legal_hold_at, c.retention_notice_at,
          GREATEST(c.created_at, COALESCE(c.retention_renewed_at, c.created_at),
            COALESCE((SELECT max(pe.updated_at) FROM pipeline_entries pe WHERE pe.candidate_id = c.id), c.created_at),
            COALESCE((SELECT max(cc.given_at) FROM candidate_consents cc WHERE cc.candidate_id = c.id), c.created_at)) AS last_activity_at,
          (c.global_stage = 'hired' OR EXISTS (SELECT 1 FROM offers o WHERE o.candidate_id = c.id AND o.status = 'accepted')) AS hired,
          (EXISTS (SELECT 1 FROM pipeline_entries pe JOIN jobs j ON j.id = pe.job_id
                     LEFT JOIN pipeline_statuses ps ON ps.id = pe.status_id LEFT JOIN pipeline_stages st ON st.id = ps.stage_id
                   WHERE pe.candidate_id = c.id AND pe.archived_at IS NULL AND NOT pe.rejected AND j.status <> 'closed' AND j.deleted_at IS NULL
                     AND COALESCE(st.category, 'active') IN ('active', 'offer'))
           OR EXISTS (SELECT 1 FROM offers o WHERE o.candidate_id = c.id AND o.status IN ('draft', 'pending_approval', 'sent'))) AS open_process
        FROM candidates c
        WHERE c.organization_id = ${c.organizationId}::uuid AND c.erased_at IS NULL`,
    }));
    const plan: RetentionPlanItem[] = [];
    for (const r of rows) {
      const action = retentionStep({ lastActivityAt: r.last_activity_at, noticeAt: r.retention_notice_at, onHold: Boolean(r.legal_hold_at), hired: r.hired, openProcess: r.open_process }, now, months);
      // A merged-away tombstone has no address to write to; it is simply anonymised when its time comes.
      if (action && !(r.merged && action === 'renewal_sent')) plan.push({ candidateId: r.id, action });
    }
    const counts = { renewalsSent: 0, anonymised: 0, skippedHold: 0, skippedOpen: 0, skippedHired: 0 };
    if (opts.dryRun) {
      for (const p of plan) counts[COUNTER[p.action]]++;
      return { dryRun: true, runId: null, periodMonths: months, ...counts, plan };
    }

    const org = ctx.organizationId as string;
    const run = await this.tenantPrisma.forTenant(ctx, (tx) => tx.candidateRetentionRun.create({ data: { organizationId: org, triggeredBy: ctx.userId ?? null, periodMonths: months } }));
    const done: RetentionPlanItem[] = [];
    for (const p of plan) {
      try {
        if (p.action === 'renewal_sent' && !(await this.sendRenewal(ctx, p.candidateId, now))) continue;
        if (p.action === 'anonymised') await this.candidates.erase(ctx, ctx.userId ?? null, p.candidateId, 'retention');
        await this.tenantPrisma.forTenant(ctx, (tx) => tx.candidateRetentionAction.create({ data: { organizationId: org, runId: run.id, candidateId: p.candidateId, action: p.action } }));
        counts[COUNTER[p.action]]++;
        done.push(p);
      } catch (e) {
        // One candidate must not stop the rest; it is retried tomorrow (both actions are idempotent).
        this.logger.error(`Retention ${p.action} failed for candidate ${p.candidateId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await this.tenantPrisma.forTenant(ctx, (tx) => tx.candidateRetentionRun.update({ where: { id: run.id }, data: counts }));
    return { dryRun: false, runId: run.id, periodMonths: months, ...counts, plan: done };
  }

  /** Claims the notice first (so a second sweep can never send it twice), then emails the candidate's own link. */
  private async sendRenewal(ctx: TenantContext, candidateId: string, now: Date): Promise<boolean> {
    const claimed = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const c = await tx.candidate.findFirst({ where: { id: candidateId, organizationId: ctx.organizationId as string, erasedAt: null }, select: { email: true, name: true, portalToken: true, retentionNoticeAt: true } });
      if (!c) return null;
      const { count } = await tx.candidate.updateMany({ where: { id: candidateId, retentionNoticeAt: c.retentionNoticeAt }, data: { retentionNoticeAt: now, ...(c.portalToken ? {} : { portalToken: randomUUID() }) } });
      if (!count) return null;
      return tx.candidate.findUniqueOrThrow({ where: { id: candidateId }, select: { email: true, name: true, portalToken: true } });
    });
    if (!claimed) return false;
    const org = await this.prisma.organization.findUnique({ where: { id: ctx.organizationId as string }, select: { name: true } });
    const name = org?.name ?? 'the company';
    const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/portal/${encodeURIComponent(claimed.portalToken!)}`;
    const sent = await this.email.send({
      to: claimed.email,
      organizationId: ctx.organizationId as string,
      subject: `Shall ${name} keep your details?`,
      html: `<p>Hello ${esc(claimed.name)},</p><p>${esc(name)} has kept your application details. In 30 days they will be deleted.</p><p><a href="${link}">Keep my details for other roles</a></p><p>If you do nothing, your details are deleted and you will not hear from us again.</p>`,
      text: `${name} has kept your application details. In 30 days they will be deleted.\nKeep them for other roles: ${link}\nIf you do nothing, your details are deleted.`,
    });
    if (sent.success) return true;
    // Not delivered: release the claim so tomorrow's sweep tries again.
    await this.tenantPrisma.forTenant(ctx, (tx) => tx.candidate.updateMany({ where: { id: candidateId, retentionNoticeAt: now }, data: { retentionNoticeAt: null } }));
    return false;
  }

  runs(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, (tx, c) => tx.candidateRetentionRun.findMany({ where: { organizationId: c.organizationId }, orderBy: { runAt: 'desc' }, take: 60 }));
  }
}
