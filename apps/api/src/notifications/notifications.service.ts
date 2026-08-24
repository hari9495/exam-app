import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';

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
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // Create 'mention' notifications for teammates. Validated: only users that actually belong to the
  // same org, never the actor themselves (you don't get notified for mentioning yourself).
  async createMentions(
    context: TenantContext,
    actorUserId: string,
    mentionedUserIds: string[],
    target: MentionTarget,
  ): Promise<void> {
    const ids = [...new Set(mentionedUserIds)].filter((id) => id && id !== actorUserId);
    if (ids.length === 0) return;
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const valid = await tx.user.findMany({
        where: { id: { in: ids }, organizationId: context.organizationId as string },
        select: { id: true },
      });
      for (const u of valid) {
        await tx.userNotification.create({
          data: {
            organizationId: context.organizationId as string,
            recipientUserId: u.id,
            actorUserId,
            type: 'mention',
            entityType: target.entityType,
            entityId: target.entityId,
            contextText: target.contextText ?? null,
            linkPath: target.linkPath,
          },
        });
      }
    });
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
}
