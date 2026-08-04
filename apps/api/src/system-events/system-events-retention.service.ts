import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';

export const RETENTION_DAYS = 30;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Deletes system_events older than 30 days -- on boot and then daily. A plain interval
// rather than a BullMQ repeatable job on purpose: this codebase's queues are all
// event-driven, the api runs as a single pm2 process, and a DELETE is idempotent, so
// queue infrastructure would be pure ceremony for one daily statement.
// ponytail: single-process interval; move to a repeatable queue job if api ever scales out.
@Injectable()
export class SystemEventsRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemEventsRetentionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  onModuleInit(): void {
    void this.prune();
    this.timer = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS);
    // Never keep the process alive just to prune logs (matters for test teardown too).
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

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
