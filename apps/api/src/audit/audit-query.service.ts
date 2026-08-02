import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  entityName: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(context: TenantContext, filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

    const rows = await this.tenantPrisma.forTenant(context, async (tx) => {
      const logRows = await tx.auditLog.findMany({
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
        include: { actor: { select: { email: true, name: true, role: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      });

      // Resolve entity ids to human names for the common entity types, so the log
      // reads "exam 'Backend Round'" rather than a bare UUID. Batched one query
      // per type. RLS scopes these to what the viewer may see; anything it can't
      // resolve (or an uncommon type) just falls back to the id on the client.
      const entityNames = await this.resolveEntityNames(tx, logRows);
      return { logRows, entityNames };
    });

    const { logRows, entityNames } = rows;
    return logRows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      entityName: row.entityId ? (entityNames.get(`${row.entityType}:${row.entityId}`) ?? null) : null,
      actorUserId: row.actorUserId,
      // Prefer the write-time snapshot; fall back to the live join for rows
      // created before the snapshot columns existed.
      actorEmail: row.actorEmail ?? row.actor?.email ?? null,
      actorName: row.actorName ?? row.actor?.name ?? null,
      actorRole: row.actorRole ?? row.actor?.role ?? null,
      metadata: row.metadataJson ? JSON.parse(row.metadataJson) : null,
      createdAt: row.createdAt,
    }));
  }

  // Batch-resolve entity display names for the entity types that have an obvious
  // human label. Returns a map keyed by "<entityType>:<entityId>".
  private async resolveEntityNames(
    tx: Prisma.TransactionClient,
    rows: { entityType: string; entityId: string | null }[],
  ): Promise<Map<string, string>> {
    const idsByType = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.entityId) continue;
      if (!['exam', 'candidate', 'user', 'organization'].includes(row.entityType)) continue;
      const set = idsByType.get(row.entityType) ?? new Set<string>();
      set.add(row.entityId);
      idsByType.set(row.entityType, set);
    }

    const names = new Map<string, string>();
    const put = (type: string, id: string, name: string | null | undefined) => {
      if (name) names.set(`${type}:${id}`, name);
    };

    const exams = idsByType.get('exam');
    if (exams?.size) {
      const found = await tx.exam.findMany({ where: { id: { in: [...exams] } }, select: { id: true, title: true } });
      found.forEach((e) => put('exam', e.id, e.title));
    }
    const candidates = idsByType.get('candidate');
    if (candidates?.size) {
      const found = await tx.candidate.findMany({ where: { id: { in: [...candidates] } }, select: { id: true, name: true } });
      found.forEach((c) => put('candidate', c.id, c.name));
    }
    const users = idsByType.get('user');
    if (users?.size) {
      const found = await tx.user.findMany({ where: { id: { in: [...users] } }, select: { id: true, email: true } });
      found.forEach((u) => put('user', u.id, u.email));
    }
    const orgs = idsByType.get('organization');
    if (orgs?.size) {
      const found = await tx.organization.findMany({ where: { id: { in: [...orgs] } }, select: { id: true, name: true } });
      found.forEach((o) => put('organization', o.id, o.name));
    }
    return names;
  }
}
