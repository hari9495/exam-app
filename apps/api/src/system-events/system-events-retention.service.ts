import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';

export const RETENTION_DAYS = 30;

// Deletes system_events older than 30 days. Scheduled as a nightly BullMQ job scheduler by
// ScheduledSweepsModule so it fires once per cluster (the DELETE is idempotent anyway).
@Injectable()
export class SystemEventsRetentionService {
  private readonly logger = new Logger(SystemEventsRetentionService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async prune(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      const { count } = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.systemEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } }),
      );
      if (count > 0) this.logger.log(`Pruned ${count} system events older than ${RETENTION_DAYS} days`);
      return count;
    } catch (error) {
      // Retention is housekeeping -- never let it crash the app or spam on a DB blip.
      this.logger.warn(`System-event prune failed: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
}
