import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';

export interface SystemEventFilters {
  service?: string;
  severity?: string;
  from?: string;
  to?: string;
  // Matches events whose contextJson mentions this attempt -- context is a JSON blob, so
  // this is a contains match, which is exact enough for UUIDs.
  attemptId?: string;
  limit?: number;
  cursor?: string;
}

export interface SystemEventEntry {
  id: string;
  organizationId: string | null;
  service: string;
  severity: string;
  message: string;
  context: Record<string, unknown> | null;
  occurredAt: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class SystemEventsQueryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(tenant: TenantContext, filters: SystemEventFilters): Promise<SystemEventEntry[]> {
    const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const rows = await this.tenantPrisma.forTenant(tenant, (tx) =>
      tx.systemEvent.findMany({
        where: this.buildWhere(filters),
        orderBy: { occurredAt: 'desc' },
        take: limit,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      }),
    );
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      service: row.service,
      severity: row.severity,
      message: row.message,
      context: parseContext(row.contextJson),
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  async count(tenant: TenantContext, filters: SystemEventFilters): Promise<number> {
    return this.tenantPrisma.forTenant(tenant, (tx) => tx.systemEvent.count({ where: this.buildWhere(filters) }));
  }

  private buildWhere(filters: SystemEventFilters): Prisma.SystemEventWhereInput {
    return {
      ...(filters.service ? { service: filters.service } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.attemptId ? { contextJson: { contains: filters.attemptId } } : {}),
      ...(filters.from || filters.to
        ? {
            occurredAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };
  }
}

function parseContext(contextJson: string | null): Record<string, unknown> | null {
  if (!contextJson) return null;
  try {
    const parsed = JSON.parse(contextJson);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
