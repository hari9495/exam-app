import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CONNECTION, logBullErrors, bullOpts } from '../jobs/redis-connection';
import { PerformanceFeedbackService } from './feedback.service';
import { PerformanceGoalsService } from './goals.service';
import { PerformanceReviewsService } from './reviews.service';

const QUEUE = 'performance-jobs';

/** M06 jobs on BullMQ (§18.3): daily goal check-in reminders (PM2), 1:1 reminders (PM3), review stage reminders (PM4). */
@Injectable()
export class PerformanceJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PerformanceJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly goals: PerformanceGoalsService,
    private readonly feedback: PerformanceFeedbackService,
    private readonly reviews: PerformanceReviewsService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, (job) => this.handle(job.name), bullOpts(this.connection)), QUEUE);
    await this.queue.upsertJobScheduler('performance-daily', { every: 24 * 3_600_000 }, { name: 'daily', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async handle(name: string): Promise<void> {
    try {
      if (name === 'daily') {
        await this.goals.sweep();
        await this.feedback.sweep();
        await this.reviews.handOverAll();
        await this.reviews.sweep();
      }
    } catch (e) {
      this.logger.warn(`${name}: ${(e as Error).message}`);
    }
  }
}
