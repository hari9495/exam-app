import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { DirectoryService } from './directory.service';
import { KbService } from './kb.service';
import { MeService } from './me.service';
import { PrivacyService } from './privacy.service';
import { ReportsService } from './reports.service';
import { SupportBridgeService } from './support-bridge.service';
import { SurveysService } from './surveys.service';
import { WorkService } from './work.service';

// The Service Desk's repeating jobs on BullMQ (M14 §8.5): auto-close every 15 minutes (YX-SD-10), reminders and snoozes
// every minute (US-G-009) and the daily sd_agents meter at 00:30 India time (§6.3). Batch 4: article publish / expiry /
// review and rating requests every 5 minutes, NPS surveys, scheduled reports and directory syncs hourly, queue alerts
// every 15 minutes, KPI snapshots at 00:45, retention and the recycle bin at 02:00, customer reports on the 1st, and
// the YukthiX support intake sweep every minute. Each run is idempotent, so a duplicate run or two API servers do no
// harm. The SLA milestone jobs and their sweep live in SlaService.

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
    private readonly kb: KbService,
    private readonly surveys: SurveysService,
    private readonly reports: ReportsService,
    private readonly directory: DirectoryService,
    private readonly privacy: PrivacyService,
    private readonly bridge: SupportBridgeService,
  ) {
    this.queue = logBullErrors(new Queue(DESK_JOBS_QUEUE, { connection }), DESK_JOBS_QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(DESK_JOBS_QUEUE, (job) => this.run(job), { connection: this.connection }), DESK_JOBS_QUEUE);
    await this.queue.upsertJobScheduler('sd-autoclose', { every: 15 * 60_000 }, { name: 'autoclose', data: {} });
    await this.queue.upsertJobScheduler('sd-reminders', { every: 60_000 }, { name: 'reminders', data: {} });
    await this.queue.upsertJobScheduler('sd-agents-meter', { pattern: '30 0 * * *', tz: 'Asia/Kolkata' }, { name: 'meter', data: {} });
    await this.queue.upsertJobScheduler('sd-five-minutes', { every: 5 * 60_000 }, { name: 'five', data: {} });
    await this.queue.upsertJobScheduler('sd-quarter-hour', { every: 15 * 60_000 }, { name: 'quarter', data: {} });
    await this.queue.upsertJobScheduler('sd-hourly', { every: 60 * 60_000 }, { name: 'hourly', data: {} });
    await this.queue.upsertJobScheduler('sd-kpi', { pattern: '45 0 * * *', tz: 'Asia/Kolkata' }, { name: 'kpi', data: {} });
    await this.queue.upsertJobScheduler('sd-nightly', { pattern: '0 2 * * *', tz: 'Asia/Kolkata' }, { name: 'nightly', data: {} });
    await this.queue.upsertJobScheduler('sd-monthly', { pattern: '0 8 1 * *', tz: 'Asia/Kolkata' }, { name: 'monthly', data: {} });
    await this.queue.upsertJobScheduler('sd-support-sweep', { every: 60_000 }, { name: 'support', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  private readonly jobs: Record<string, () => Promise<number>[]> = {
    autoclose: () => [this.work.autoClose()],
    reminders: () => [this.me.fireReminders()],
    meter: () => [this.me.meter()],
    five: () => [this.kb.schedule(), this.surveys.askRatings()],
    quarter: () => [this.reports.backlogAlerts()],
    hourly: () => [this.surveys.runSurveys(), this.reports.sendScheduled(), this.directory.scheduledSyncs()],
    kpi: () => [this.reports.snapshot()],
    nightly: () => [this.privacy.retention(), this.privacy.purgeBin()],
    monthly: () => [this.reports.monthlyCustomerReports()],
    support: () => [this.bridge.sweep()],
  };

  private async run(job: Job) {
    // One job's failure never stops the others of the same tick.
    const done = await Promise.allSettled(this.jobs[job.name]?.() ?? []);
    for (const r of done) if (r.status === 'rejected') this.logger.warn(`${job.name}: ${(r.reason as Error)?.message}`);
    const n = done.reduce((s, r) => s + (r.status === 'fulfilled' ? r.value : 0), 0);
    if (n) this.logger.log(`${job.name}: ${n}`);
  }
}
