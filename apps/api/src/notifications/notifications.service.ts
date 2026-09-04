import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_BY_KEY } from './notification-types';
import { renderNotificationEmail } from './notification-email-render';
import { EmailService } from '../email/email.service';

export interface NotificationView {
  id: string;
  type: string;
  actorUserId: string | null;
  actorName: string | null;
  entityType: string;
  entityId: string;
  contextText: string | null;
  linkPath: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface MentionTarget {
  entityType: string;
  entityId: string;
  contextText?: string | null;
  linkPath: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly emailService: EmailService,
  ) {}

  // Core: notify teammates of some event. Validated: only users that actually belong to the same
  // org, never the actor themselves (you don't get notified for your own action).
  // Bell rows are created inside the tenant tx (must not be lost). Email is best-effort and runs
  // AFTER the tx commits -- an SMTP failure must never roll back or block the bell notification.
  async notify(
    context: TenantContext,
    actorUserId: string,
    recipientUserIds: string[],
    type: string,
    target: MentionTarget,
  ): Promise<void> {
    const ids = [...new Set(recipientUserIds)].filter((id) => id && id !== actorUserId);
    if (ids.length === 0) return;

    const { outbox, actorName } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const valid = await tx.user.findMany({
        where: { id: { in: ids }, organizationId: context.organizationId as string },
        select: { id: true, email: true, name: true },
      });
      const outbox: { to: string; prefMap: Map<string, boolean> }[] = [];
      let actorName: string | null = null;
      if (valid.length > 0) {
        const actor = await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true } });
        actorName = actor?.name ?? null;
      }
      for (const u of valid) {
        await tx.userNotification.create({
          data: {
            organizationId: context.organizationId as string,
            recipientUserId: u.id,
            actorUserId,
            type,
            entityType: target.entityType,
            entityId: target.entityId,
            contextText: target.contextText ?? null,
            linkPath: target.linkPath,
          },
        });
        if (u.email) {
          const prefMap = await this.resolveEmailEnabledByType(tx, u.id);
          outbox.push({ to: u.email, prefMap });
        }
      }
      return { outbox, actorName };
    });

    if (outbox.length === 0) return;

    // Best-effort, post-commit: never let an email failure surface out of notify().
    try {
      const appBaseUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      const typeDef = NOTIFICATION_TYPE_BY_KEY.get(type);
      const sends = outbox
        .filter((entry) => entry.prefMap.get(type) ?? true)
        .map((entry) => {
          const { subject, html } = renderNotificationEmail(typeDef, {
            actorName,
            contextText: target.contextText ?? null,
            linkPath: target.linkPath,
            appBaseUrl,
          });
          return this.emailService.send({ to: entry.to, subject, html, organizationId: context.organizationId as string });
        });
      await Promise.allSettled(sends);
    } catch (error) {
      this.logger.error('Failed to send notification email(s)', error as Error);
    }
  }

  // @mentions in candidate feedback.
  createMentions(context: TenantContext, actorUserId: string, mentionedUserIds: string[], target: MentionTarget): Promise<void> {
    return this.notify(context, actorUserId, mentionedUserIds, 'mention', target);
  }

  async list(context: TenantContext, userId: string): Promise<NotificationView[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const rows = await tx.userNotification.findMany({
        where: { recipientUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((id): id is string => Boolean(id)))];
      const actors = actorIds.length
        ? await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
        : [];
      const nameById = new Map(actors.map((a) => [a.id, a.name]));
      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        actorUserId: r.actorUserId,
        actorName: r.actorUserId ? (nameById.get(r.actorUserId) ?? null) : null,
        entityType: r.entityType,
        entityId: r.entityId,
        contextText: r.contextText,
        linkPath: r.linkPath,
        readAt: r.readAt,
        createdAt: r.createdAt,
      }));
    });
  }

  async unreadCount(context: TenantContext, userId: string): Promise<{ count: number }> {
    const count = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.userNotification.count({ where: { recipientUserId: userId, readAt: null } }),
    );
    return { count };
  }

  // recipientUserId in the WHERE is the per-recipient guard: a user can only mark their OWN
  // notifications read, never a colleague's (RLS scopes the org; this scopes the person).
  async markRead(context: TenantContext, userId: string, id: string): Promise<{ success: true }> {
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.userNotification.updateMany({ where: { id, recipientUserId: userId, readAt: null }, data: { readAt: new Date() } }),
    );
    return { success: true };
  }

  async markAllRead(context: TenantContext, userId: string): Promise<{ success: true }> {
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.userNotification.updateMany({ where: { recipientUserId: userId, readAt: null }, data: { readAt: new Date() } }),
    );
    return { success: true };
  }

  // Full catalog with effective per-type email preference: stored row wins, missing row = ON.
  async getPreferences(context: TenantContext, userId: string) {
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.userNotificationPreference.findMany({ where: { userId }, select: { type: true, emailEnabled: true } }),
    );
    const byType = new Map(rows.map((r) => [r.type, r.emailEnabled]));
    return NOTIFICATION_TYPES.map((t) => ({ type: t.type, group: t.group, label: t.label, emailEnabled: byType.get(t.type) ?? true }));
  }

  // Sparse storage: ON is represented by absence of a row, so opting back in deletes it.
  async setPreference(context: TenantContext, userId: string, type: string, emailEnabled: boolean): Promise<{ success: true }> {
    if (!NOTIFICATION_TYPE_BY_KEY.has(type)) throw new BadRequestException('Unknown notification type');
    await this.tenantPrisma.forTenant(context, async (tx) => {
      if (emailEnabled) {
        await tx.userNotificationPreference.deleteMany({ where: { userId, type } });
      } else {
        await tx.userNotificationPreference.upsert({
          where: { userId_type: { userId, type } },
          create: { organizationId: context.organizationId as string, userId, type, emailEnabled: false },
          update: { emailEnabled: false },
        });
      }
    });
    return { success: true };
  }

  // tx-scoped: returns ONLY the user's opt-out rows; caller treats a missing type as ON.
  async resolveEmailEnabledByType(tx: any, userId: string): Promise<Map<string, boolean>> {
    const rows = await tx.userNotificationPreference.findMany({ where: { userId }, select: { type: true, emailEnabled: true } });
    return new Map(rows.map((r: { type: string; emailEnabled: boolean }) => [r.type, r.emailEnabled]));
  }
}
