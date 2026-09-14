import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService, MentionTarget } from '../notifications/notifications.service';

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUPER_ADMIN = { organizationId: null, isSuperAdmin: true };

// Day-windows are deliberately narrow (a ~1-day band around the threshold) so a daily sweep nudges
// each item roughly ONCE as it crosses the line, rather than re-nagging every day until resolved --
// achieved without any per-item "already reminded" state.
// ponytail: no per-item reminded-flag; the narrow window is the dedup. If cadence ever needs to be
// configurable or exactly-once guaranteed, add a lastRemindedAt column keyed per (type, entityId).
const PENDING_GRADING_DAYS = 3; // pending for 3-4 days
const STALE_INVITATION_DAYS = 5; // invited 5-6 days ago, never started
const OFFER_EXPIRING_DAYS = 3; // expires within the next 2-3 days
const FEEDBACK_OWED_DAYS = 1; // interview ended 1-2 days ago
const INTERVIEW_UPCOMING_MS = DAY_MS; // starts within the next 24h

// Daily staff-reminder sweep. Opt-in per org (Organization.remindersEnabled); per-user email
// opt-out via userNotificationPreference (NotificationsService.notifySystem honors it). Mirrors the
// retention services' scheduling shape (OnModuleInit + unref'd setInterval, not a queue job).
@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now = new Date()): Promise<void> {
    let orgs: { id: string }[] = [];
    try {
      orgs = await this.tenantPrisma.forTenant(SUPER_ADMIN, (tx) =>
        tx.organization.findMany({ where: { remindersEnabled: true, status: 'active' }, select: { id: true } }),
      );
    } catch (e) {
      this.logger.warn(`Reminder sweep: failed to list orgs: ${msg(e)}`);
      return;
    }
    for (const { id: organizationId } of orgs) {
      const ctx: TenantContext = { organizationId, isSuperAdmin: false };
      // Each reminder category is isolated so one failing query never skips the others or the next org.
      await this.safe('pending-grading', organizationId, () => this.remindPendingGrading(ctx, now));
      await this.safe('stale-invitations', organizationId, () => this.remindStaleInvitations(ctx, now));
      await this.safe('expiring-offers', organizationId, () => this.remindExpiringOffers(ctx, now));
      await this.safe('upcoming-interviews', organizationId, () => this.remindUpcomingInterviews(ctx, now));
      await this.safe('feedback-owed', organizationId, () => this.remindFeedbackOwed(ctx, now));
    }
  }

  private async safe(label: string, orgId: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.logger.warn(`Reminder sweep [${label}] failed for org ${orgId}: ${msg(e)}`);
    }
  }

  // The pipeline-entry assignee for a candidate on a given exam's job(s) — the natural owner for
  // grading/stale-invite nudges. Null when the exam isn't linked to a job or the entry is unassigned
  // (we skip rather than spray the whole org).
  private async assigneeFor(tx: any, examId: string, candidateId: string): Promise<string | null> {
    const links = await tx.jobExam.findMany({ where: { examId }, select: { jobId: true } });
    if (!links.length) return null;
    const entry = await tx.pipelineEntry.findFirst({
      where: { jobId: { in: links.map((l: { jobId: string }) => l.jobId) }, candidateId, assignedUserId: { not: null } },
      select: { assignedUserId: true },
    });
    return entry?.assignedUserId ?? null;
  }

  // Attempt/Offer/Interview carry only candidateId (no candidate relation), so names are looked up
  // in one batch per reminder.
  private async candidateNames(tx: any, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await tx.candidate.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
    return new Map(rows.map((r: { id: string; name: string }) => [r.id, r.name]));
  }

  private async remindPendingGrading(ctx: TenantContext, now: Date): Promise<void> {
    const [from, to] = pastWindow(now, PENDING_GRADING_DAYS);
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const attempts = await tx.attempt.findMany({
        where: { status: 'pending_manual_grade', submittedAt: { gte: from, lt: to } },
        select: { candidateId: true, examId: true },
      });
      const names = await this.candidateNames(tx, attempts.map((a: { candidateId: string }) => a.candidateId));
      for (const a of attempts) {
        const assignee = await this.assigneeFor(tx, a.examId, a.candidateId);
        if (!assignee) continue;
        const name = names.get(a.candidateId) ?? 'A candidate';
        await this.send(ctx, [assignee], 'reminder.pending_grading', a.candidateId, name, `${name}'s attempt is waiting for manual grading.`);
      }
    });
  }

  private async remindStaleInvitations(ctx: TenantContext, now: Date): Promise<void> {
    const [from, to] = pastWindow(now, STALE_INVITATION_DAYS);
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const invites = await tx.invitation.findMany({
        where: { status: 'invited', invitedAt: { gte: from, lt: to }, attempt: null },
        select: { candidateId: true, examId: true, candidate: { select: { name: true } }, exam: { select: { title: true } } },
      });
      for (const inv of invites) {
        const assignee = await this.assigneeFor(tx, inv.examId, inv.candidateId);
        if (!assignee) continue;
        await this.send(ctx, [assignee], 'reminder.stale_invitation', inv.candidateId, inv.candidate?.name ?? 'A candidate',
          `${inv.candidate?.name ?? 'A candidate'} was invited to "${inv.exam?.title ?? 'an exam'}" ${STALE_INVITATION_DAYS}+ days ago and hasn't started.`);
      }
    });
  }

  private async remindExpiringOffers(ctx: TenantContext, now: Date): Promise<void> {
    const from = new Date(now.getTime() + (OFFER_EXPIRING_DAYS - 1) * DAY_MS);
    const to = new Date(now.getTime() + OFFER_EXPIRING_DAYS * DAY_MS);
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const offers = await tx.offer.findMany({
        where: { sentAt: { not: null }, respondedAt: null, expiresAt: { gte: from, lt: to } },
        select: { candidateId: true, sentByUserId: true },
      });
      const names = await this.candidateNames(tx, offers.map((o: { candidateId: string }) => o.candidateId));
      for (const o of offers) {
        if (!o.sentByUserId) continue;
        const name = names.get(o.candidateId) ?? 'a candidate';
        await this.send(ctx, [o.sentByUserId], 'reminder.offer_expiring', o.candidateId, name,
          `The offer to ${name} expires within ${OFFER_EXPIRING_DAYS} days and hasn't been accepted.`);
      }
    });
  }

  private async remindUpcomingInterviews(ctx: TenantContext, now: Date): Promise<void> {
    const soon = new Date(now.getTime() + INTERVIEW_UPCOMING_MS);
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const interviews = await tx.interview.findMany({
        where: { confirmedSlotId: { not: null } },
        select: { candidateId: true, confirmedSlotId: true, slots: { select: { id: true, startsAt: true } }, panelists: { select: { userId: true } } },
      });
      const names = await this.candidateNames(tx, interviews.map((iv: { candidateId: string }) => iv.candidateId));
      for (const iv of interviews) {
        const slot = iv.slots.find((s: { id: string }) => s.id === iv.confirmedSlotId);
        if (!slot || slot.startsAt <= now || slot.startsAt > soon) continue;
        const recipients = iv.panelists.map((p: { userId: string }) => p.userId);
        if (!recipients.length) continue;
        const name = names.get(iv.candidateId) ?? 'a candidate';
        await this.send(ctx, recipients, 'reminder.interview_upcoming', iv.candidateId, name, `Your interview with ${name} is within the next 24 hours.`);
      }
    });
  }

  private async remindFeedbackOwed(ctx: TenantContext, now: Date): Promise<void> {
    const [from, to] = pastWindow(now, FEEDBACK_OWED_DAYS);
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const interviews = await tx.interview.findMany({
        where: { confirmedSlotId: { not: null } },
        select: {
          candidateId: true,
          confirmedSlotId: true,
          pipelineEntryId: true,
          slots: { select: { id: true, endsAt: true } },
          panelists: { select: { userId: true } },
        },
      });
      const names = await this.candidateNames(tx, interviews.map((iv: { candidateId: string }) => iv.candidateId));
      for (const iv of interviews) {
        const slot = iv.slots.find((s: { id: string }) => s.id === iv.confirmedSlotId);
        if (!slot || slot.endsAt < from || slot.endsAt >= to) continue; // ended in the [1,2)-days-ago window
        const feedback = await tx.pipelineFeedback.findMany({ where: { entryId: iv.pipelineEntryId }, select: { authorUserId: true } });
        const authored = new Set(feedback.map((f: { authorUserId: string }) => f.authorUserId));
        const owe = iv.panelists.map((p: { userId: string }) => p.userId).filter((uid: string) => !authored.has(uid));
        if (!owe.length) continue;
        const name = names.get(iv.candidateId) ?? 'a candidate';
        await this.send(ctx, owe, 'reminder.feedback_owed', iv.candidateId, name, `You interviewed ${name} but haven't left feedback yet.`);
      }
    });
  }

  private send(ctx: TenantContext, recipientUserIds: string[], type: string, candidateId: string, candidateName: string, line: string): Promise<void> {
    const target: MentionTarget = { entityType: 'reminder', entityId: candidateId, contextText: candidateName, linkPath: `/candidates/${candidateId}` };
    const base = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const html = `<p>${escapeHtml(line)}</p><p><a href="${escapeHtml(base)}/candidates/${escapeHtml(candidateId)}">Open in Workfox</a></p>`;
    return this.notifications.notifySystem(ctx, recipientUserIds, type, target, { subject: line, html });
  }
}

function pastWindow(now: Date, minDays: number): [Date, Date] {
  // [now - (minDays+1)d, now - minDays d) — the ~1-day band that just crossed the threshold.
  return [new Date(now.getTime() - (minDays + 1) * DAY_MS), new Date(now.getTime() - minDays * DAY_MS)];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
