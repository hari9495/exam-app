import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION, logBullErrors, bullOpts } from '../jobs/redis-connection';
import { WorkforceService } from './workforce.service';

const QUEUE = 'people-jobs';

/** Daily: this month's head counts per company and entity (the last run in a month stands for that month). */
@Injectable()
export class WorkforceJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkforceJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly workforce: WorkforceService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, () => this.snapshotAll(), bullOpts(this.connection)), QUEUE);
    await this.queue.upsertJobScheduler('workforce-snapshot', { every: 24 * 3_600_000 }, { name: 'snapshot', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async snapshotAll(): Promise<number> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM employments WHERE exited_on IS NULL`);
    let n = 0;
    for (const { id } of orgs) {
      try {
        n += await this.workforce.snapshot(id);
      } catch (e) {
        this.logger.warn(`snapshot ${id}: ${(e as Error).message}`);
      }
    }
    return n;
  }
}
