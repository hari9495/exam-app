import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { utcDay } from './api-usage.service';

export const API_USAGE_RETENTION_DAYS = 365;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Deletes api_usage_daily rows older than 365 days -- on boot then daily. Mirrors
// RecycleBinRetentionService (plain setInterval; @nestjs/schedule is not a dependency).
// api_usage_daily has no FK pointing at it, so a single deleteMany is safe (no per-row dance).
// ponytail: single-process interval; move to a repeatable queue job if api scales out.
@Injectable()
export class ApiUsageRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApiUsageRetentionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  onModuleInit(): void {
    void this.prune();
    this.timer = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async prune(now = new Date()): Promise<number> {
    const cutoff = utcDay(new Date(now.getTime() - API_USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000));
    try {
      const { count } = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.apiUsageDaily.deleteMany({ where: { day: { lt: cutoff } } }),
      );
      if (count > 0) this.logger.log(`api-usage retention: purged ${count} rows older than ${API_USAGE_RETENTION_DAYS} days`);
      return count;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`api-usage retention: prune failed: ${detail}`);
      return 0;
    }
  }
}
