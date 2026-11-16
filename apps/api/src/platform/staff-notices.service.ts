import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';

type Tx = Prisma.TransactionClient;
export type StaffNoticeKind = 'kept_records_removed' | 'board_notice_due';
export interface StaffNoticeInput {
  kind: StaffNoticeKind;
  title: string;
  body: string;
  linkPath?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * Answer 2093: the notice list for YukthiX staff (the console header bell). A notice is for one staff member; the
 * database lets only that person read it or mark it read (staff_notices RLS), so every read runs as the person, never
 * with platform access. The console's sweeps write them in their own transaction, next to the email they already send.
 */
@Injectable()
export class StaffNoticesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Inside a platform transaction: one notice per staff member. createMany: the writer may not read the rows back.
   *  skipDuplicates: a repeat Board nudge while the last one is unread adds nothing (partial unique index, migration 322). */
  static async notify(tx: Tx, recipientUserIds: string[], n: StaffNoticeInput): Promise<number> {
    const to = [...new Set(recipientUserIds)];
    if (!to.length) return 0;
    const res = await tx.staffNotice.createMany({
      data: to.map((recipientUserId) => ({ recipientUserId, kind: n.kind, title: n.title.slice(0, 200), body: n.body.slice(0, 1000), linkPath: n.linkPath ?? null, entityType: n.entityType ?? null, entityId: n.entityId ?? null })),
      skipDuplicates: true,
    });
    return res.count;
  }

  private asMe<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: false, userId }, fn);
  }

  /** The person's latest notices and how many are unread. */
  async list(userId: string) {
    return this.asMe(userId, async (tx) => {
      const [rows, unread] = await Promise.all([
        tx.staffNotice.findMany({ where: { recipientUserId: userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
        tx.staffNotice.count({ where: { recipientUserId: userId, readAt: null } }),
      ]);
      return { unread, items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, linkPath: r.linkPath, at: r.createdAt.toISOString(), read: Boolean(r.readAt) })) };
    });
  }

  async markRead(userId: string, id: string) {
    return this.asMe(userId, async (tx) => {
      const n = await tx.staffNotice.findFirst({ where: { id, recipientUserId: userId }, select: { readAt: true } });
      if (!n) throw new NotFoundException('No such notice.');
      if (!n.readAt) await tx.staffNotice.updateMany({ where: { id, recipientUserId: userId, readAt: null }, data: { readAt: new Date() } });
      return { unread: await tx.staffNotice.count({ where: { recipientUserId: userId, readAt: null } }) };
    });
  }

  async markAllRead(userId: string) {
    return this.asMe(userId, async (tx) => {
      await tx.staffNotice.updateMany({ where: { recipientUserId: userId, readAt: null }, data: { readAt: new Date() } });
      return { unread: 0 };
    });
  }
}
