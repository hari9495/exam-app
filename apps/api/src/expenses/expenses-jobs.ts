import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CONNECTION, logBullErrors, bullOpts } from '../jobs/redis-connection';
import { ExpenseTripsService } from './trips.service';

const QUEUE = 'expenses-jobs';

/** M05 jobs on BullMQ (§17.3): daily advance settlement reminders and overdue flags (SCH-43). */
@Injectable()
export class ExpensesJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpensesJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly trips: ExpenseTripsService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, (job) => this.handle(job.name), bullOpts(this.connection)), QUEUE);
    await this.queue.upsertJobScheduler('expenses-daily', { every: 24 * 3_600_000 }, { name: 'daily', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async handle(name: string): Promise<void> {
    try {
      if (name === 'daily') await this.trips.sweep();
    } catch (e) {
      this.logger.warn(`${name}: ${(e as Error).message}`);
    }
  }
}
