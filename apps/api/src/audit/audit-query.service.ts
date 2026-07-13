import { Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';

export interface AuditLogFilters {
  entityType?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(context: TenantContext, filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.auditLog.findMany({
        where: {
          ...(context.organizationId ? { organizationId: context.organizationId } : {}),
          ...(filters.entityType ? { entityType: filters.entityType } : {}),
          ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
          ...(filters.action ? { action: filters.action } : {}),
          ...(filters.from || filters.to
            ? {
                createdAt: {
                  ...(filters.from ? { gte: new Date(filters.from) } : {}),
                  ...(filters.to ? { lte: new Date(filters.to) } : {}),
                },
              }
            : {}),
        },
        include: { actor: { select: { email: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      }),
    );

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorUserId: row.actorUserId,
      actorEmail: row.actor?.email ?? null,
      metadata: row.metadataJson ? JSON.parse(row.metadataJson) : null,
      createdAt: row.createdAt,
    }));
  }
}
