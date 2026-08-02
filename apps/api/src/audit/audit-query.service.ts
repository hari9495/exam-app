import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';

export interface AuditLogFilters {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
  // 'access' events are view/session activity with no data change (opening an
  // org as super-admin, logging in, starting/stopping impersonation) -- they
  // dominate the raw feed (see ACCESS_ACTIONS) without representing a change
  // anyone audits for. Default is 'all'; 'change' hides them.
  category?: 'all' | 'change' | 'access';
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

// View/session events, not data changes. Kept in sync with the frontend's copy
// in apps/web/lib/audit-display.ts (ACCESS_ACTIONS) -- both are short, stable
// lists of action *keys*, not a shared runtime dependency, so duplicating them
// is simpler and safer than threading a browser-unsafe backend package into
// the web bundle for five string literals.
export const ACCESS_ACTIONS = [
  'super_admin.org_switch_in',
  'super_admin.org_switch_out',
  'login.success',
  'user.impersonate_start',
  'user.impersonate_stop',
];

// A server-side safety cap on a full (non-paginated) export -- large enough for
// any realistic audit review, small enough that a runaway filter (e.g. no date
// range on a long-lived org) can't turn the export into an unbounded query.
export const MAX_EXPORT_ROWS = 5000;

@Injectable()
export class AuditQueryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private buildWhere(context: TenantContext, filters: AuditLogFilters): Prisma.AuditLogWhereInput {
    return {
      ...(context.organizationId ? { organizationId: context.organizationId } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.category === 'access' ? { action: { in: ACCESS_ACTIONS } } : {}),
      ...(filters.category === 'change' ? { action: { notIn: ACCESS_ACTIONS } } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };
  }

  async list(context: TenantContext, filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;
    const where = this.buildWhere(context, filters);

    const rows = await this.tenantPrisma.forTenant(context, async (tx) => {
      const logRows = await tx.auditLog.findMany({
        where,
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

    return this.toEntries(rows.logRows, rows.entityNames);
  }

  // Total matching count for the current filters, independent of the cursor
  // page -- lets the UI say "showing 20 of 340" instead of just "20 items".
  async count(context: TenantContext, filters: AuditLogFilters): Promise<number> {
    const where = this.buildWhere(context, filters);
    return this.tenantPrisma.forTenant(context, (tx) => tx.auditLog.count({ where }));
  }

  // Full (non-paginated, capped) export honoring the same filters as list(),
  // used for the server-side "export everything matching these filters" CSV --
  // as opposed to the frontend's export of just the rows currently loaded.
  async listForExport(context: TenantContext, filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    const where = this.buildWhere(context, filters);
    const rows = await this.tenantPrisma.forTenant(context, async (tx) => {
      const logRows = await tx.auditLog.findMany({
        where,
        include: { actor: { select: { email: true, name: true, role: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_EXPORT_ROWS,
      });
      const entityNames = await this.resolveEntityNames(tx, logRows);
      return { logRows, entityNames };
    });
    return this.toEntries(rows.logRows, rows.entityNames);
  }

  private toEntries(
    logRows: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      actorUserId: string | null;
      actorEmail: string | null;
      actorName: string | null;
      actorRole: string | null;
      actor: { email: string | null; name: string | null; role: string | null } | null;
      metadataJson: string | null;
      createdAt: Date;
    }>,
    entityNames: Map<string, string>,
  ): AuditLogEntry[] {
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
      if (!['exam', 'candidate', 'user', 'organization', 'question'].includes(row.entityType)) continue;
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
    const questions = idsByType.get('question');
    if (questions?.size) {
      const found = await tx.question.findMany({ where: { id: { in: [...questions] } }, select: { id: true, text: true } });
      found.forEach((q) => put('question', q.id, q.text.length > 60 ? `${q.text.slice(0, 60)}…` : q.text));
    }
    return names;
  }
}
