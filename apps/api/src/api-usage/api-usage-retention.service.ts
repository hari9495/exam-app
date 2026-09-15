import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { utcDay } from './api-usage.service';

export const API_USAGE_RETENTION_DAYS = 365;

// Deletes api_usage_daily rows older than 365 days. Scheduled as a nightly BullMQ job scheduler by
// ScheduledSweepsModule. api_usage_daily has no FK pointing at it, so a single deleteMany is safe.
@Injectable()
export class ApiUsageRetentionService {
  private readonly logger = new Logger(ApiUsageRetentionService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

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
