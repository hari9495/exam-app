import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CONNECTION } from './redis-connection';
import { SCHEDULED_SWEEPS_QUEUE, SCHEDULED_SWEEPS_QUEUE_NAME, SWEEP_SCHEDULE } from './scheduled-sweeps.queue';
import { RemindersService } from '../reminders/reminders.service';
import { ScheduledReportsService } from '../scheduled-reports/scheduled-reports.service';
import { NotificationDigestService } from '../notifications/notification-digest.service';
import { SystemEventsRetentionService } from '../system-events/system-events-retention.service';
import { RecycleBinRetentionService } from '../recycle-bin/recycle-bin-retention.service';
import { ApiUsageRetentionService } from '../api-usage/api-usage-retention.service';
import { FaceRetentionService } from '../face-enrolment/face-retention.service';
import { ProctoringRetentionService } from '../proctoring-retention/proctoring-retention.service';

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Owns the single Worker that runs every recurring housekeeping sweep, and registers the cron job
// schedulers on boot. Dispatches by job name to the owning service's sweep/prune method — the
// methods themselves are unchanged from the old setInterval versions; only what triggers them moved.
@Injectable()
export class ScheduledSweepsWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledSweepsWorkerService.name);
  private readonly worker: Worker;
  private readonly handlers: Record<string, () => Promise<unknown>>;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    @Inject(SCHEDULED_SWEEPS_QUEUE) private readonly queue: Queue,
    reminders: RemindersService,
    scheduledReports: ScheduledReportsService,
    notificationDigest: NotificationDigestService,
    systemEventsRetention: SystemEventsRetentionService,
    recycleBinRetention: RecycleBinRetentionService,
    apiUsageRetention: ApiUsageRetentionService,
    faceRetention: FaceRetentionService,
    proctoringRetention: ProctoringRetentionService,
  ) {
    // Keys MUST match SWEEP_SCHEDULE ids.
    this.handlers = {
      'notification-digests': () => notificationDigest.sweep(),
      'staff-reminders': () => reminders.sweep(),
      'scheduled-reports': () => scheduledReports.sweep(),
      'system-events-retention': () => systemEventsRetention.prune(),
      'recycle-bin-retention': () => recycleBinRetention.prune(),
      'api-usage-retention': () => apiUsageRetention.prune(),
      'face-retention': () => faceRetention.prune(),
      'proctoring-retention': () => proctoringRetention.prune(),
    };
    this.worker = new Worker(SCHEDULED_SWEEPS_QUEUE_NAME, (job) => this.dispatch(job), { connection: this.connection });
    this.worker.on('failed', (job, err) => this.logger.error(`Sweep "${job?.name}" failed: ${msg(err)}`));
  }

  onModuleInit(): void {
    // Fire-and-forget: upserting a scheduler talks to Redis, which may be unavailable at boot (the
    // whole app is designed to start without it). The command buffers and resolves once Redis is up;
    // never block startup on it.
    void this.registerSchedulers().catch((e) => this.logger.error(`Failed to register sweep schedulers: ${msg(e)}`));
  }

  private async registerSchedulers(): Promise<void> {
    for (const { id, cron } of SWEEP_SCHEDULE) {
      if (!this.handlers[id]) {
        this.logger.error(`Sweep schedule "${id}" has no handler — skipping registration`);
        continue;
      }
      // upsert = idempotent by id, so re-running on every deploy just refreshes the cron.
      await this.queue.upsertJobScheduler(id, { pattern: cron, tz: 'UTC' }, { name: id });
    }
    this.logger.log(`Registered ${SWEEP_SCHEDULE.length} scheduled sweeps`);
  }

  private async dispatch(job: Job): Promise<unknown> {
    const handler = this.handlers[job.name];
    if (!handler) {
      this.logger.warn(`No handler for sweep "${job.name}" — ignoring`);
      return undefined;
    }
    this.logger.log(`Running scheduled sweep "${job.name}"`);
    return handler();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
