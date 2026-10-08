import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { MeService } from './me.service';
import { WorkService } from './work.service';

// The Service Desk's repeating jobs on BullMQ (M14 §8.5): auto-close every 15 minutes (YX-SD-10), reminders and snoozes
// every minute (US-G-009) and the daily sd_agents meter at 00:30 India time (§6.3). Each run is idempotent, so a
// duplicate run or two API servers do no harm. The SLA milestone jobs and their sweep live in SlaService.

export const DESK_JOBS_QUEUE = 'sd-jobs';

@Injectable()
export class DeskJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeskJobsService.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly work: WorkService,
    private readonly me: MeService,
  ) {
    this.queue = logBullErrors(new Queue(DESK_JOBS_QUEUE, { connection }), DESK_JOBS_QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(DESK_JOBS_QUEUE, (job) => this.run(job), { connection: this.connection }), DESK_JOBS_QUEUE);
    await this.queue.upsertJobScheduler('sd-autoclose', { every: 15 * 60_000 }, { name: 'autoclose', data: {} });
    await this.queue.upsertJobScheduler('sd-reminders', { every: 60_000 }, { name: 'reminders', data: {} });
    await this.queue.upsertJobScheduler('sd-agents-meter', { pattern: '30 0 * * *', tz: 'Asia/Kolkata' }, { name: 'meter', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  private async run(job: Job) {
    const n = job.name === 'autoclose' ? await this.work.autoClose() : job.name === 'reminders' ? await this.me.fireReminders() : job.name === 'meter' ? await this.me.meter() : 0;
    if (n) this.logger.log(`${job.name}: ${n}`);
  }
}
