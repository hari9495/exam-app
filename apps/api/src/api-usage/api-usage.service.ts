import { Injectable, Logger } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';

export type ApiUsageKind = 'request' | 'throttled';

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
}
