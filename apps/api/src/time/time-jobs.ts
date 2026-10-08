import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { AttendanceService } from './attendance.service';
import { LeaveService } from './leave.service';

const QUEUE = 'time-jobs';

/**
 * M02 jobs on BullMQ: leave accruals (every 6 hours, idempotent by period key), the day engine for yesterday and today
 * (hourly) and year-end postings (on demand, after HR previewed and confirmed them, YX-LV-07).
 */
@Injectable()
export class TimeJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimeJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly leave: LeaveService,
    private readonly attendance: AttendanceService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, { connection }), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, (job) => this.handle(job.name, job.data as Record<string, string>), { connection: this.connection }), QUEUE);
    await this.queue.upsertJobScheduler('time-accrue', { every: 6 * 3_600_000 }, { name: 'accrue', data: {} });
    await this.queue.upsertJobScheduler('time-evaluate', { every: 3_600_000 }, { name: 'evaluate', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  /** Year end for one company, queued by HR from the set-up screen. */
  async queueYearEnd(organizationId: string, yearEnd: string, userId: string | null) {
    await this.queue.add('year-end', { organizationId, yearEnd, userId: userId ?? '' }, { jobId: `year-end-${organizationId}-${yearEnd}`, removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 10_000 } });
  }

  /** Companies with employees (the platform view, names only; each company then runs in its own tenant context). */
  private async companies(): Promise<string[]> {
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM employments WHERE exited_on IS NULL`);
    return rows.map((r) => r.id);
  }

  async handle(name: string, data: Record<string, string>): Promise<number> {
    if (name === 'year-end') return this.leave.yearEndPost(data.organizationId, data.yearEnd, data.userId || null);
    let n = 0;
    for (const org of await this.companies()) {
      try {
        n += name === 'accrue' ? await this.leave.accrue(org) : await this.attendance.evaluateCompany(org);
      } catch (e) {
        this.logger.warn(`${name} ${org}: ${(e as Error).message}`);
      }
    }
    if (n) this.logger.log(`${name}: ${n}`);
    return n;
  }
}
