import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_TYPE_BY_KEY } from './notification-types';
import { escapeHtml, buildNotificationEmailFooter } from './notification-email-render';

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Send at most once per ~day: a user is due when their last digest is older than this (slightly under
// 24h so a daily sweep never skips a day on minor drift). First-ever digest (null anchor) is due.
const DIGEST_DUE_MS = 23 * 60 * 60 * 1000;
const SUPER_ADMIN = { organizationId: null, isSuperAdmin: true };
const MAX_ITEMS = 100;

// Daily notification-digest sweep. Users on notificationDigest='daily' get one email batching the
// unread notifications created since their last digest, instead of an email per event (notify() /
// notifySystem suppress the immediate send for them). Opt-in per user; the in-app bell is unaffected.
// Mirrors the retention/reminders services' scheduling shape (OnModuleInit + unref'd setInterval,
// not a queue job) -- single-process, best-effort.
@Injectable()
export class NotificationDigestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDigestService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly emailService: EmailService,
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
        tx.organization.findMany({ where: { status: 'active' }, select: { id: true } }),
      );
    } catch (e) {
      this.logger.warn(`Digest sweep: failed to list orgs: ${msg(e)}`);
      return;
    }
    for (const { id: organizationId } of orgs) {
      const ctx: TenantContext = { organizationId, isSuperAdmin: false };
      try {
        await this.sweepOrg(ctx, now);
      } catch (e) {
        this.logger.warn(`Digest sweep failed for org ${organizationId}: ${msg(e)}`);
      }
    }
  }

  private async sweepOrg(ctx: TenantContext, now: Date): Promise<void> {
    const dueBefore = new Date(now.getTime() - DIGEST_DUE_MS);
    const users = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.user.findMany({
        where: {
          notificationDigest: 'daily',
          email: { not: '' },
          OR: [{ lastDigestSentAt: null }, { lastDigestSentAt: { lte: dueBefore } }],
        },
        select: { id: true, email: true, lastDigestSentAt: true },
      }),
    );
    for (const user of users) {
      try {
        await this.digestUser(ctx, user, now);
      } catch (e) {
        this.logger.warn(`Digest for user ${user.id} failed: ${msg(e)}`);
      }
    }
  }

  private async digestUser(
    ctx: TenantContext,
    user: { id: string; email: string; lastDigestSentAt: Date | null },
    now: Date,
  ): Promise<void> {
    // First digest looks back one day; subsequent ones cover everything since the last send.
    const since = user.lastDigestSentAt ?? new Date(now.getTime() - SWEEP_INTERVAL_MS);
    const { items, actorNameById, prefMap } = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const rows = await tx.userNotification.findMany({
        where: { recipientUserId: user.id, readAt: null, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
      });
      const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((id): id is string => Boolean(id)))];
      const actors = actorIds.length
        ? await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
        : [];
      const prefMap = await this.notifications.resolveEmailEnabledByType(tx, user.id);
      return { items: rows, actorNameById: new Map(actors.map((a) => [a.id, a.name])), prefMap };
    });

    // Respect the per-type opt-out (a 'daily' user can still mute individual types).
    const visible = items.filter((r) => prefMap.get(r.type) ?? true);

    if (visible.length > 0) {
      const html = this.renderDigest(visible, actorNameById);
      const subject = `Your Workfox digest — ${visible.length} update${visible.length === 1 ? '' : 's'}`;
      const res = await this.emailService.send({ to: user.email, subject, html, organizationId: ctx.organizationId as string });
      if (!res.success) this.logger.warn(`Digest email to ${user.email} failed to send`);
    }

    // Advance the anchor even when nothing was sent, so a digest always covers "new since yesterday".
    await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.user.update({ where: { id: user.id }, data: { lastDigestSentAt: now } }),
    );
  }

  private renderDigest(
    items: { type: string; actorUserId: string | null; contextText: string | null; linkPath: string }[],
    actorNameById: Map<string, string | null>,
  ): string {
    const appBaseUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const lis = items
      .map((r) => {
        const label = NOTIFICATION_TYPE_BY_KEY.get(r.type)?.label ?? 'Notification';
        const actorName = r.actorUserId ? (actorNameById.get(r.actorUserId) ?? 'Someone') : 'Workfox';
        const context = r.contextText ? ` — ${escapeHtml(r.contextText)}` : '';
        const link = `${appBaseUrl}${r.linkPath}`;
        return `<li style="margin-bottom:8px;">${escapeHtml(actorName)} — ${escapeHtml(label)}${context} · <a href="${escapeHtml(link)}">View</a></li>`;
      })
      .join('');
    return (
      `<div><p>Here's what happened since your last digest:</p>` +
      `<ul style="padding-left:18px;">${lis}</ul></div>` +
      buildNotificationEmailFooter(appBaseUrl)
    );
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
