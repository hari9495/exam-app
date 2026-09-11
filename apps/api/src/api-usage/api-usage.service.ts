import { Injectable, Logger } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';

export type ApiUsageKind = 'request' | 'throttled';

export interface ApiUsageReport {
  window: number;
  totals: { requests: number; throttled: number };
  byEndpoint: { endpoint: string; requests: number; throttled: number }[];
  byDay: { day: string; requests: number; throttled: number }[];
}

// UTC-midnight of the given instant, as a Date -- the @db.Date column stores date-only,
// so the time component is irrelevant, but normalizing keeps the unique key stable within a day.
export function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class ApiUsageService {
  private readonly logger = new Logger(ApiUsageService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // Fire-and-forget safe: callers do `void apiUsage.record(...)` and never await it in the
  // request path. This method therefore NEVER throws -- any failure is logged and swallowed,
  // because a metering write must not break or delay a real API request.
  async record(context: TenantContext, endpoint: string, kind: ApiUsageKind, now = new Date()): Promise<void> {
    const day = utcDay(now);
    const col = kind === 'throttled' ? 'throttledCount' : 'requestCount';
    try {
      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.apiUsageDaily.upsert({
          where: { organizationId_day_endpoint: { organizationId: context.organizationId as string, day, endpoint } },
          create: {
            organizationId: context.organizationId as string,
            day,
            endpoint,
            requestCount: kind === 'request' ? 1 : 0,
            throttledCount: kind === 'throttled' ? 1 : 0,
          },
          update: { [col]: { increment: 1 } },
        }),
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`api-usage: failed to record ${kind} for ${endpoint}: ${detail}`);
    }
  }

  // window is validated to 30 | 90 at the controller; inclusive of today (gte today-(window-1)).
  async report(context: TenantContext, window: number, now = new Date()): Promise<ApiUsageReport> {
    const since = utcDay(new Date(now.getTime() - (window - 1) * 24 * 60 * 60 * 1000));
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.apiUsageDaily.findMany({ where: { day: { gte: since } }, orderBy: [{ day: 'asc' }, { endpoint: 'asc' }] }),
    );
    const totals = { requests: 0, throttled: 0 };
    const byEndpoint = new Map<string, { endpoint: string; requests: number; throttled: number }>();
    const byDay = new Map<string, { day: string; requests: number; throttled: number }>();
    for (const r of rows) {
      totals.requests += r.requestCount;
      totals.throttled += r.throttledCount;
      const e = byEndpoint.get(r.endpoint) ?? { endpoint: r.endpoint, requests: 0, throttled: 0 };
      e.requests += r.requestCount;
      e.throttled += r.throttledCount;
      byEndpoint.set(r.endpoint, e);
      const key = r.day.toISOString().slice(0, 10);
      const d = byDay.get(key) ?? { day: key, requests: 0, throttled: 0 };
      d.requests += r.requestCount;
      d.throttled += r.throttledCount;
      byDay.set(key, d);
    }
    return {
      window,
      totals,
      byEndpoint: [...byEndpoint.values()].sort((a, b) => b.requests - a.requests),
      byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    };
  }
}
