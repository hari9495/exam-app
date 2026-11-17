import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { companySetting } from '../asmt-rules';
import { EmailService } from '../../email/email.service';
import { buildCandidateEmailHtml } from '../../candidate-emails/candidate-email-render';
import { ExamRuntimeInternalClient } from '../../exam-runtime-client/exam-runtime-internal.client';

type Tx = Prisma.TransactionClient;
export type Verdict = 'cleared' | 'warning' | 'section' | 'attempt';
export const APPEAL_DAYS_KEY = 'asmt.appeal_days';
const REASON_MIN = 10;

const reasonOk = (reason: string) => {
  if (reason.trim().length < REASON_MIN) throw new BadRequestException(`Give a reason of at least ${REASON_MIN} characters.`);
  return reason.trim();
};
const nameOf = (u: { name: string | null; email: string } | null | undefined) => (u ? u.name?.trim() || u.email : null);

/**
 * AS-5 part 1 (answers 2006, 2008, 2012): integrity review. The analysis opens an incident for a flagged attempt (the
 * runtime); a reviewer gives a verdict with a reason; "attempt invalidated" waits for a second, different reviewer; a
 * candidate may appeal within the company's window; someone who did not give the verdict decides the appeal. Every
 * step is audited. The database enforces the same rules (integrity_incidents and integrity_appeals checks).
 */
@Injectable()
export class IntegrityReviewService {
  private readonly logger = new Logger(IntegrityReviewService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly email: EmailService,
    private readonly runtime: ExamRuntimeInternalClient,
  ) {}

  /**
   * Answers 2265, 2266: after a final decision, score the attempt again (a section voided, or restored on appeal) and
   * tell the candidate by email (their email opt-out holds). Both after the decision is saved; a failure is logged and
   * never undoes the decision (the result page shows it either way).
   */
  private async after(ctx: TenantContext, attemptId: string, opts: { rescore: boolean; email: 'verdict' | 'appeal' | null }) {
    if (opts.rescore) await this.runtime.rescore(attemptId).catch((e) => this.logger.error(`Rescore after an integrity decision failed for ${attemptId}`, e as Error));
    if (opts.email) await this.tell(ctx, attemptId, opts.email).catch((e) => this.logger.error(`Integrity email failed for ${attemptId}`, e as Error));
  }

  private async tell(ctx: TenantContext, attemptId: string, kind: 'verdict' | 'appeal') {
    const d = await this.in(ctx, async (tx) => {
      const r = await tx.integrityIncident.findUnique({
        where: { attemptId },
        select: { verdict: true, sectionTitle: true, reason: true, appealClosesAt: true, appeal: { select: { status: true, reason: true } }, attempt: { select: { invitation: { select: { candidate: { select: { name: true, email: true, emailOptedOutAt: true } }, exam: { select: { title: true } } } } } } },
      });
      const org = await tx.organization.findUnique({ where: { id: ctx.organizationId as string }, select: { name: true } });
      return { r, org };
    });
    const c = d.r?.attempt.invitation.candidate;
    if (!d.r || !c?.email || c.emailOptedOutAt) return;
    const test = d.r.attempt.invitation.exam.title;
    const label = { warning: 'a warning was noted on your test', section: `the ${d.r.sectionTitle ?? ''} section was not counted`, attempt: 'your test was not counted', cleared: 'no action' }[d.r.verdict ?? 'cleared'];
    const lines =
      kind === 'verdict'
        ? [`Hi ${c.name},`, '', `A reviewer looked at your session for "${test}". Decision: ${label}.`, '', `Why: ${d.r.reason ?? ''}`, '', d.r.appealClosesAt ? `You can appeal until ${d.r.appealClosesAt.toISOString().slice(0, 10)} from your result page.` : '']
        : [`Hi ${c.name},`, '', `Your appeal about "${test}" was ${d.r.appeal?.status === 'overturned' ? 'accepted: the decision was overturned' : 'decided: the decision stands'}.`, '', `Reason: ${d.r.appeal?.reason ?? ''}`, '', 'This decision is final.'];
    const html = buildCandidateEmailHtml({ logoUrl: null, orgName: d.org?.name ?? null, bodyText: lines.join('\n') });
    const res = await this.email.send({ to: c.email, subject: kind === 'verdict' ? `A decision about your test: ${test}` : `Your appeal: ${test}`, html, organizationId: ctx.organizationId as string });
    if (!res.success) this.logger.warn(`Integrity email to the candidate of ${attemptId} failed`);
  }

  private in<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(ctx, fn);
  }

  private async names(tx: Tx, ids: (string | null)[]) {
    const want = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const users = want.length ? await tx.user.findMany({ where: { id: { in: want } }, select: { id: true, name: true, email: true } }) : [];
    return new Map(users.map((u) => [u.id, nameOf(u)!]));
  }

  /** PRC-16: incidents waiting first (high concern first, oldest first), then the latest decided. */
  async queue(ctx: TenantContext) {
    return this.in(ctx, async (tx) => {
      const rows = await tx.integrityIncident.findMany({
        orderBy: [{ createdAt: 'asc' }],
        take: 500,
        include: {
          appeal: { select: { status: true } },
          attempt: { select: { submittedAt: true, invitation: { select: { candidate: { select: { name: true } }, exam: { select: { title: true } } } }, integrityAnalysis: { select: { flagsJson: true } } } },
        },
      });
      const who = await this.names(tx, rows.flatMap((r) => [r.reviewerId, r.decidedBy]));
      const rank = (r: (typeof rows)[number]) => (r.status === 'decided' ? 2 : r.level === 'high_concern' ? 0 : 1);
      return rows
        .sort((a, b) => rank(a) - rank(b))
        .map((r) => ({
          id: r.id,
          attemptId: r.attemptId,
          candidate: r.attempt.invitation.candidate.name,
          test: r.attempt.invitation.exam.title,
          level: r.level,
          flags: flagTypes(r.attempt.integrityAnalysis?.flagsJson),
          status: r.status,
          reviewer: r.reviewerId ? who.get(r.reviewerId) ?? null : null,
          verdict: r.verdict,
          decidedBy: r.decidedBy ? who.get(r.decidedBy) ?? null : null,
          appeal: r.appeal?.status ?? null,
          openedAt: r.createdAt.toISOString(),
          submittedAt: r.attempt.submittedAt?.toISOString() ?? null,
        }));
    });
  }

  /** PRC-17: one incident with what the analysis found, the attempt's events and the decision so far. */
  async get(ctx: TenantContext, id: string) {
    return this.in(ctx, async (tx) => {
      const r = await tx.integrityIncident.findUnique({
        where: { id },
        include: {
          appeal: true,
          attempt: {
            select: {
              id: true,
              startedAt: true,
              submittedAt: true,
              invitation: { select: { candidate: { select: { name: true, email: true } }, exam: { select: { id: true, title: true } } } },
              integrityAnalysis: { select: { level: true, flagsJson: true, narrative: true, analyzedAt: true } },
              proctoringEvents: { orderBy: { occurredAt: 'asc' }, take: 500, select: { id: true, eventType: true, severity: true, occurredAt: true } },
            },
          },
        },
      });
      if (!r) throw new NotFoundException('Incident not found');
      const who = await this.names(tx, [r.reviewerId, r.decidedBy, r.confirmedBy, r.secondReviewerId, r.appeal?.decidedBy ?? null]);
      const sections = await tx.attempt.findUnique({ where: { id: r.attemptId }, select: { sectionSnapshotJson: true } });
      return {
        id: r.id,
        status: r.status,
        level: r.level,
        candidate: { name: r.attempt.invitation.candidate.name, email: r.attempt.invitation.candidate.email },
        test: { id: r.attempt.invitation.exam.id, title: r.attempt.invitation.exam.title },
        attemptId: r.attemptId,
        startedAt: r.attempt.startedAt?.toISOString() ?? null,
        submittedAt: r.attempt.submittedAt?.toISOString() ?? null,
        sections: sectionTitles(sections?.sectionSnapshotJson ?? null),
        analysis: r.attempt.integrityAnalysis
          ? { level: r.attempt.integrityAnalysis.level, flags: parseFlags(r.attempt.integrityAnalysis.flagsJson), narrative: r.attempt.integrityAnalysis.narrative, analyzedAt: r.attempt.integrityAnalysis.analyzedAt?.toISOString() ?? null }
          : null,
        events: r.attempt.proctoringEvents.map((e) => ({ id: e.id, type: e.eventType, severity: e.severity, at: e.occurredAt.toISOString() })),
        reviewer: r.reviewerId ? { id: r.reviewerId, name: who.get(r.reviewerId) ?? null } : null,
        verdict: r.verdict,
        sectionTitle: r.sectionTitle,
        reason: r.reason,
        decidedBy: r.decidedBy ? { id: r.decidedBy, name: who.get(r.decidedBy) ?? null } : null,
        decidedAt: r.decidedAt?.toISOString() ?? null,
        secondReviewer: r.secondReviewerId ? { id: r.secondReviewerId, name: who.get(r.secondReviewerId) ?? null } : null,
        confirmedBy: r.confirmedBy ? { id: r.confirmedBy, name: who.get(r.confirmedBy) ?? null } : null,
        confirmedAt: r.confirmedAt?.toISOString() ?? null,
        appealClosesAt: r.appealClosesAt?.toISOString() ?? null,
        appeal: r.appeal
          ? { id: r.appeal.id, text: r.appeal.text, status: r.appeal.status, reason: r.appeal.reason, decidedBy: r.appeal.decidedBy ? who.get(r.appeal.decidedBy) ?? null : null, decidedAt: r.appeal.decidedAt?.toISOString() ?? null, createdAt: r.appeal.createdAt.toISOString() }
          : null,
      };
    });
  }

  /** A person opens an incident on an attempt the analysis did not flag (from the candidate report). */
  async open(ctx: TenantContext, userId: string, attemptId: string) {
    return this.in(ctx, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id: attemptId }, select: { id: true } });
      if (!attempt) throw new NotFoundException('Attempt not found');
      if (await tx.integrityIncident.findUnique({ where: { attemptId }, select: { id: true } })) throw new ConflictException('This attempt already has an incident.');
      const r = await tx.integrityIncident.create({ data: { attemptId, level: 'manual', reviewerId: userId } });
      await AuditService.recordIn(tx, ctx, { actorUserId: userId, action: 'asmt.incident.opened', entityType: 'integrity_incident', entityId: r.id, metadata: { attemptId } });
      return { id: r.id };
    });
  }

  /** Take the incident to review (the queue's owner). */
  async take(ctx: TenantContext, userId: string, id: string) {
    return this.in(ctx, async (tx) => {
      const r = await tx.integrityIncident.findUnique({ where: { id }, select: { status: true } });
      if (!r) throw new NotFoundException('Incident not found');
      if (r.status === 'decided') throw new ConflictException('This incident is decided.');
      await tx.integrityIncident.update({ where: { id }, data: { reviewerId: userId, updatedAt: new Date() } });
      await AuditService.recordIn(tx, ctx, { actorUserId: userId, action: 'asmt.incident.taken', entityType: 'integrity_incident', entityId: id });
      return { ok: true };
    });
  }

  /**
   * A verdict with a reason. "Cleared", "warning" and "section" are final at once (anything but cleared opens the appeal
   * window). "Attempt" (invalidating the attempt) waits for a second reviewer and asks for the second factor (route).
   */
  /** Who may review here (the keys of this page, or a System Admin), not counting the one asking. */
  async reviewers(ctx: TenantContext, userId: string) {
    return this.in(ctx, async (tx) => {
      const ids = (await reviewerIds(tx, ctx.organizationId as string)).filter((x) => x !== userId);
      const who = await this.names(tx, ids);
      return ids.map((id) => ({ id, name: who.get(id) ?? '' })).sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async verdict(ctx: TenantContext, userId: string, id: string, input: { verdict: Verdict; reason: string; sectionTitle?: string | null; secondReviewerId?: string | null }) {
    const out = await this.verdictIn(ctx, userId, id, input);
    if (out.status === 'decided') await this.after(ctx, out.attemptId, { rescore: input.verdict === 'section', email: input.verdict === 'cleared' ? null : 'verdict' });
    return { status: out.status, appealClosesAt: out.appealClosesAt };
  }

  private async verdictIn(ctx: TenantContext, userId: string, id: string, input: { verdict: Verdict; reason: string; sectionTitle?: string | null; secondReviewerId?: string | null }) {
    const reason = reasonOk(input.reason);
    return this.in(ctx, async (tx) => {
      const r = await tx.integrityIncident.findUnique({ where: { id }, select: { status: true, attemptId: true, organizationId: true } });
      if (!r) throw new NotFoundException('Incident not found');
      if (r.status !== 'open') throw new ConflictException(r.status === 'decided' ? 'This incident is decided.' : 'This incident waits for a second reviewer.');
      const sectionTitle = input.verdict === 'section' ? input.sectionTitle?.trim() : null;
      if (input.verdict === 'section') {
        const snap = await tx.attempt.findUnique({ where: { id: r.attemptId }, select: { sectionSnapshotJson: true } });
        if (!sectionTitle || !sectionTitles(snap?.sectionSnapshotJson ?? null).includes(sectionTitle)) throw new BadRequestException('Choose a section of this attempt to invalidate.');
      }
      const final = input.verdict !== 'attempt';
      const second = final ? null : input.secondReviewerId ?? null;
      if (!final && (!second || second === userId || !(await reviewerIds(tx, r.organizationId!)).includes(second)))
        throw new BadRequestException('Choose a second reviewer: someone else who reviews integrity here.');
      const now = new Date();
      const closes = final && input.verdict !== 'cleared' ? await appealCloses(tx, r.organizationId!, now) : null;
      await tx.integrityIncident.update({
        where: { id },
        data: { status: final ? 'decided' : 'second_review', verdict: input.verdict, sectionTitle, reason, decidedBy: userId, decidedAt: now, secondReviewerId: second, appealClosesAt: closes, updatedAt: now },
      });
      await AuditService.recordIn(tx, ctx, { actorUserId: userId, action: final ? 'asmt.incident.decided' : 'asmt.incident.invalidation_proposed', entityType: 'integrity_incident', entityId: id, metadata: { verdict: input.verdict, attemptId: r.attemptId } });
      return { status: final ? 'decided' : 'second_review', appealClosesAt: closes?.toISOString() ?? null, attemptId: r.attemptId };
    });
  }

  /** YX-EVAL-01: a second reviewer (never the first) confirms or sends back an attempt invalidation, with a reason. */
  async secondReview(ctx: TenantContext, userId: string, id: string, input: { confirm: boolean; reason: string }) {
    const out = await this.secondReviewIn(ctx, userId, id, input);
    if (out.status === 'decided') await this.after(ctx, out.attemptId, { rescore: false, email: 'verdict' });
    return { status: out.status };
  }

  private async secondReviewIn(ctx: TenantContext, userId: string, id: string, input: { confirm: boolean; reason: string }) {
    const reason = reasonOk(input.reason);
    return this.in(ctx, async (tx) => {
      const r = await tx.integrityIncident.findUnique({ where: { id }, select: { status: true, decidedBy: true, secondReviewerId: true, organizationId: true, attemptId: true } });
      if (!r) throw new NotFoundException('Incident not found');
      if (r.status !== 'second_review') throw new ConflictException('Nothing waits for a second reviewer here.');
      if (r.secondReviewerId !== userId) throw new ForbiddenException('Only the second reviewer the first reviewer chose confirms this invalidation.');
      const now = new Date();
      if (input.confirm) {
        const closes = await appealCloses(tx, r.organizationId!, now);
        await tx.integrityIncident.update({ where: { id }, data: { status: 'decided', confirmedBy: userId, confirmedAt: now, appealClosesAt: closes, updatedAt: now } });
      } else {
        // Sent back: the incident is open again for a verdict.
        await tx.integrityIncident.update({ where: { id }, data: { status: 'open', verdict: null, sectionTitle: null, reason: null, decidedBy: null, decidedAt: null, secondReviewerId: null, updatedAt: now } });
      }
      await AuditService.recordIn(tx, ctx, { actorUserId: userId, action: input.confirm ? 'asmt.incident.invalidation_confirmed' : 'asmt.incident.invalidation_sent_back', entityType: 'integrity_incident', entityId: id, metadata: { reason, attemptId: r.attemptId } });
      return { status: input.confirm ? 'decided' : 'open', attemptId: r.attemptId };
    });
  }

  /** PRC-18: appeals, open first. */
  async appeals(ctx: TenantContext) {
    return this.in(ctx, async (tx) => {
      const rows = await tx.integrityAppeal.findMany({
        orderBy: { createdAt: 'asc' },
        take: 500,
        include: { incident: { select: { id: true, verdict: true, sectionTitle: true, reason: true, decidedBy: true, confirmedBy: true, attempt: { select: { invitation: { select: { candidate: { select: { name: true } }, exam: { select: { title: true } } } } } } } } },
      });
      const who = await this.names(tx, rows.flatMap((a) => [a.decidedBy, a.incident.decidedBy, a.incident.confirmedBy]));
      return rows
        .sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open'))
        .map((a) => ({
          id: a.id,
          incidentId: a.incident.id,
          candidate: a.incident.attempt.invitation.candidate.name,
          test: a.incident.attempt.invitation.exam.title,
          verdict: a.incident.verdict,
          sectionTitle: a.incident.sectionTitle,
          verdictReason: a.incident.reason,
          verdictBy: [a.incident.decidedBy, a.incident.confirmedBy].filter(Boolean).map((x) => who.get(x!) ?? null),
          // The people who may not decide it (they gave the verdict).
          excluded: [a.incident.decidedBy, a.incident.confirmedBy].filter((x): x is string => Boolean(x)),
          text: a.text,
          status: a.status,
          reason: a.reason,
          decidedBy: a.decidedBy ? who.get(a.decidedBy) ?? null : null,
          decidedAt: a.decidedAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
        }));
    });
  }

  /**
   * Uphold or overturn, with a reason, by someone who did not give the verdict (also a database trigger). Overturning
   * asks for the second factor (route); the verdict record stays, the appeal says it was overturned.
   */
  async decideAppeal(ctx: TenantContext, userId: string, id: string, input: { decision: 'upheld' | 'overturned'; reason: string }) {
    const out = await this.decideAppealIn(ctx, userId, id, input);
    await this.after(ctx, out.attemptId, { rescore: input.decision === 'overturned' && out.verdict === 'section', email: 'appeal' });
    return { status: out.status };
  }

  private async decideAppealIn(ctx: TenantContext, userId: string, id: string, input: { decision: 'upheld' | 'overturned'; reason: string }) {
    const reason = reasonOk(input.reason);
    return this.in(ctx, async (tx) => {
      const a = await tx.integrityAppeal.findUnique({ where: { id }, select: { status: true, attemptId: true, incident: { select: { decidedBy: true, confirmedBy: true, verdict: true } } } });
      if (!a) throw new NotFoundException('Appeal not found');
      if (a.status !== 'open') throw new ConflictException('This appeal is decided.');
      if (a.incident.decidedBy === userId || a.incident.confirmedBy === userId) throw new ForbiddenException('An appeal is decided by someone who did not give the verdict.');
      const now = new Date();
      await tx.integrityAppeal.update({ where: { id }, data: { status: input.decision, reason, decidedBy: userId, decidedAt: now } });
      await AuditService.recordIn(tx, ctx, { actorUserId: userId, action: input.decision === 'overturned' ? 'asmt.appeal.overturned' : 'asmt.appeal.upheld', entityType: 'integrity_appeal', entityId: id, metadata: { attemptId: a.attemptId } });
      return { status: input.decision, attemptId: a.attemptId, verdict: a.incident.verdict };
    });
  }
}

async function appealCloses(tx: Tx, org: string, now: Date) {
  const days = Number(await companySetting(tx, org, APPEAL_DAYS_KEY));
  return new Date(now.getTime() + days * 86_400_000);
}

export interface Flag {
  type: string;
  severity: string;
  detail: string;
}
function parseFlags(json: string | null | undefined): Flag[] {
  try {
    const v = JSON.parse(json ?? '[]') as unknown;
    return Array.isArray(v) ? (v as Flag[]).map((f) => ({ type: String(f.type), severity: String(f.severity), detail: String(f.detail ?? '') })) : [];
  } catch {
    return [];
  }
}
const flagTypes = (json: string | null | undefined) => [...new Set(parseFlags(json).map((f) => f.type))];
function sectionTitles(json: string | null): string[] {
  try {
    const v = JSON.parse(json ?? '[]') as { title?: string }[];
    return Array.isArray(v) ? v.map((s) => s.title ?? '').filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * The people who may review integrity in a company: active users whose profile or an active company grant carries one
 * of the review keys, and its System Admins. shortcut: reads the role JSON with LIKE, as holdersOf does; index it if a
 * company has thousands of roles.
 */
export async function reviewerIds(tx: Tx, org: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT u.id::text FROM users u
    LEFT JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
    WHERE u.organization_id = ${org}::uuid AND u.status = 'active'
      AND (u.role = 'org_admin' OR p.permissions_json LIKE '%"asmt.proctor"%' OR p.permissions_json LIKE '%"asmt.evaluate"%' OR p.permissions_json LIKE '%"exam:manage"%' OR p.permissions_json LIKE '%"asmt.test.manage"%')
    UNION
    SELECT g.user_id::text FROM role_grants g
    JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
    JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
    WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND g.valid_from <= CURRENT_DATE AND (g.valid_to IS NULL OR g.valid_to >= CURRENT_DATE)
      AND (p.permissions_json LIKE '%"asmt.proctor"%' OR p.permissions_json LIKE '%"asmt.evaluate"%' OR p.permissions_json LIKE '%"exam:manage"%' OR p.permissions_json LIKE '%"asmt.test.manage"%')
    LIMIT 200`;
  return rows.map((r) => r.id);
}
