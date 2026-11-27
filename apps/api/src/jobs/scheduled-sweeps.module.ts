import { Module } from '@nestjs/common';
import { OrgStructureModule } from '../org-structure/org-structure.module';
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
import { EmployeeHistoryModule } from '../employee-history/employee-history.module';
import { PeopleModule } from '../people/people.module';
import { LearningModule } from '../learning/learning.module';
import { SpeakupModule } from '../speakup/speakup.module';
import { LibraryModule } from '../library/library.module';
import { AuthModule } from '../auth/auth.module';
import { TalentModule } from '../talent/talent.module';
import { TalentCrmModule } from '../talent-crm/talent-crm.module';
import { InterviewingModule } from '../interviewing/interviewing.module';
import { HiringModule } from '../hiring/hiring.module';
import { VisitorsModule } from '../visitors/visitors.module';
import { AccessModule } from '../access/access.module';
import { HelpModule } from '../help/help.module';
import { AssistantModule } from '../help/assistant/assistant.module';
import { PlatformModule } from '../platform/platform.module';
import { AssetAlertsService } from '../lifecycle/asset-alerts.service';
import { UserGroupsModule } from '../user-groups/user-groups.module';

// Runs every recurring housekeeping sweep as a cron-driven BullMQ job scheduler (one dispatcher
// worker), replacing the per-service unref'd setInterval timers. Imports each owning module for its
// sweep/prune service; owns its own queue + worker reusing the shared Redis-connection factory
// (mirrors HrisModule / BulkCandidateEmailModule).
import { ProjectsModule } from '../projects/projects.module';
import { QuestionsModule } from '../questions/questions.module';
import { InternalApplicationsModule } from '../internal-applications/internal-applications.module';

@Module({
  imports: [
    ProjectsModule,
    QuestionsModule,
    RemindersModule,
    ScheduledReportsModule,
    NotificationsModule,
    SystemEventsQueryModule,
    RecycleBinModule,
    ApiUsageModule,
    FaceEnrolmentModule,
    ProctoringRetentionModule,
    DripModule,
    LearningModule,
    SpeakupModule,
    LibraryModule,
    EmployeeHistoryModule,
    PeopleModule,
    AuthModule,
    TalentModule,
    TalentCrmModule,
    InterviewingModule,
    HiringModule,
    VisitorsModule,
    AccessModule,
    HelpModule,
    AssistantModule,
    PlatformModule,
    OrgStructureModule,
    InternalApplicationsModule,
    UserGroupsModule,
  ],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    { provide: SCHEDULED_SWEEPS_QUEUE, useFactory: createScheduledSweepsQueue, inject: [REDIS_CONNECTION] },
    ScheduledSweepsWorkerService,
    // IT assets answer 2714 (only the tenant Prisma and notifications, so provided here rather than via LifecycleModule).
    AssetAlertsService,
  ],
  exports: [AssetAlertsService],
})
export class ScheduledSweepsModule {}
