import { Module } from '@nestjs/common';
import { REDIS_CONNECTION, createRedisConnection } from './redis-connection';
import { SCHEDULED_SWEEPS_QUEUE, createScheduledSweepsQueue } from './scheduled-sweeps.queue';
import { ScheduledSweepsWorkerService } from './scheduled-sweeps.worker.service';
import { RemindersModule } from '../reminders/reminders.module';
import { ScheduledReportsModule } from '../scheduled-reports/scheduled-reports.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SystemEventsQueryModule } from '../system-events/system-events.module';
import { RecycleBinModule } from '../recycle-bin/recycle-bin.module';
import { ApiUsageModule } from '../api-usage/api-usage.module';
import { FaceEnrolmentModule } from '../face-enrolment/face-enrolment.module';
import { ProctoringRetentionModule } from '../proctoring-retention/proctoring-retention.module';
import { DripModule } from '../drip/drip.module';

// Runs every recurring housekeeping sweep as a cron-driven BullMQ job scheduler (one dispatcher
// worker), replacing the per-service unref'd setInterval timers. Imports each owning module for its
// sweep/prune service; owns its own queue + worker reusing the shared Redis-connection factory
// (mirrors HrisModule / BulkCandidateEmailModule).
@Module({
  imports: [
    RemindersModule,
    ScheduledReportsModule,
    NotificationsModule,
    SystemEventsQueryModule,
    RecycleBinModule,
    ApiUsageModule,
    FaceEnrolmentModule,
    ProctoringRetentionModule,
    DripModule,
  ],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    { provide: SCHEDULED_SWEEPS_QUEUE, useFactory: createScheduledSweepsQueue, inject: [REDIS_CONNECTION] },
    ScheduledSweepsWorkerService,
  ],
})
export class ScheduledSweepsModule {}
