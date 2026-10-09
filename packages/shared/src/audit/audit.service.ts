import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';

export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async record(context: TenantContext, entry: AuditEntry): Promise<void> {
    await this.tenantPrisma.forTenant(context, (tx) => AuditService.recordIn(tx, context, entry));
  }

  /**
   * The same entry, written inside the caller's own forTenant transaction so it commits or rolls back
   * with the change it describes (P08: no change without its audit row).
   */
  static async recordIn(tx: Prisma.TransactionClient, context: TenantContext, entry: AuditEntry): Promise<void> {
    // Snapshot the actor's identity now, under the actor's own request context
    // (where their user row is visible), rather than resolving it via a join at
    // read time -- an org-admin reading the log later cannot see a super-admin
    // actor's out-of-org row through RLS, which is why those events showed
    // "System". Best-effort: a missing user (e.g. already deleted) just leaves
    // the snapshot null. This lookup never fails the audit write -- the record
    // must be created even if identity can't be captured.
    let actorEmail: string | null = null;
    let actorName: string | null = null;
    let actorRole: string | null = null;
    if (entry.actorUserId) {
      try {
        const actor = await tx.user.findUnique({
          where: { id: entry.actorUserId },
          select: { email: true, name: true, role: true },
        });
        if (actor) {
          actorEmail = actor.email;
          actorName = actor.name;
          actorRole = actor.role;
        }
      } catch {
        // leave snapshot null -- never block the audit write on identity lookup
      }
    }

    await tx.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: entry.actorUserId,
        actorEmail,
        actorName,
        actorRole,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null,
      },
    });
  }
}
