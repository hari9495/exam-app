import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CONNECTION, bullOpts, logBullErrors } from '../jobs/redis-connection';
import { InterviewDaysService } from './interview-days.service';

// Answer 421: every 5 minutes, the WhatsApp reminders due (2 hours before each sent interview-day slot).
const QUEUE = 'interview-day-reminders';

@Injectable()
export class InterviewReminderJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InterviewReminderJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly days: InterviewDaysService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, bullOpts(connection)), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, () => this.run(), bullOpts(this.connection)), QUEUE);
    await this.queue.upsertJobScheduler('reminders', { every: 5 * 60_000 }, { name: 'reminders', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async run() {
    const n = await this.days.remindersDue().catch((e: Error) => (this.logger.warn(`interview reminders: ${e.message}`), 0));
    if (n) this.logger.log(`interview reminders sent: ${n}`);
  }
}
