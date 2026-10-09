import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { DocumentsService } from '../documents/documents.service';
import { FilesService } from '../documents/files.service';
import { LifecycleJourneysService } from './journeys.service';
import { LettersService } from '../documents/letters/letters.service';
import { PreboardingPortalService } from './portal.service';
import { LastDayService } from './last-day.service';
import { ExitExtrasService } from './exit-extras.service';

const QUEUE = 'lifecycle-jobs';

/** Lifecycle 6a jobs on BullMQ: checklist reminders and the virus-scan retry (hourly), document expiry (daily). */
@Injectable()
export class LifecycleJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LifecycleJobs.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly journeys: LifecycleJourneysService,
    private readonly documents: DocumentsService,
    private readonly files: FilesService,
    private readonly letters: LettersService,
    private readonly portal: PreboardingPortalService,
    private readonly lastDay: LastDayService,
    private readonly extras: ExitExtrasService,
  ) {
    this.queue = logBullErrors(new Queue(QUEUE, { connection }), QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(QUEUE, (job) => this.handle(job.name), { connection: this.connection }), QUEUE);
    await this.queue.upsertJobScheduler('lifecycle-hourly', { every: 3_600_000 }, { name: 'hourly', data: {} });
    await this.queue.upsertJobScheduler('lifecycle-daily', { every: 24 * 3_600_000 }, { name: 'daily', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  async handle(name: string): Promise<void> {
    try {
      if (name === 'hourly') {
        await this.files.sweep();
        await this.journeys.raisePending();
        await this.journeys.sweep();
        await this.letters.retryRendering();
        // Lifecycle 6d: last working days (the morning of, then T+0 once it is over in India) and their exit steps.
        await this.lastDay.sweep();
      }
      if (name === 'daily') {
        await this.documents.expirySweep();
        await this.portal.remind();
        // Lifecycle 6e: absconding timelines (and their start from unauthorised absence), retirements and contract ends.
        await this.extras.abscondingSweep();
        await this.extras.policySweep();
      }
    } catch (e) {
      this.logger.warn(`${name}: ${(e as Error).message}`);
    }
  }
}
