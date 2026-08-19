import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, HttpAdapterHost } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import {
  PrismaModule,
  AuditModule,
  SystemEventsModule,
  SystemEventsService,
  SystemEventsExceptionFilter,
  PrismaService,
  HealthService,
  SentryReporter,
} from '@exam-platform/shared';
import { HealthController } from './health/health.controller';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { SetupModule } from './setup/setup.module';
import { LeadsModule } from './leads/leads.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { StaticUploadsModule } from './organizations/static-uploads.module';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { CandidatesModule } from './candidates/candidates.module';
import { InvitationsModule } from './invitations/invitations.module';
import { WalkInModule } from './walk-in/walk-in.module';
import { WalkInGroupsModule } from './walk-in-groups/walk-in-groups.module';
import { DrivesModule } from './drives/drives.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { CandidateEmailsModule } from './candidate-emails/candidate-emails.module';
import { AttemptsAdminModule } from './attempts-admin/attempts-admin.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { JobsModule } from './jobs/jobs.module';
import { PublicApplicationsModule } from './public-applications/public-applications.module';
import { AuditQueryModule } from './audit/audit-query.module';
import { SystemEventsQueryModule } from './system-events/system-events.module';
import { PublicApiModule } from './public-api/public-api.module';
import { FaceEnrolmentModule } from './face-enrolment/face-enrolment.module';
import { ItemAnalyticsModule } from './analytics/item-analytics.module';
import { PipelineAnalyticsModule } from './analytics/pipeline-analytics.module';
import { OffersModule } from './offers/offers.module';
import { InterviewsModule } from './interviews/interviews.module';
import { CandidateFitModule } from './candidate-fit/candidate-fit.module';
import { BillingModule } from './billing/billing.module';
import { DEFAULT_THROTTLE_LIMIT } from './rate-limit-tiers';
import { FailOpenThrottlerGuard } from './fail-open-throttler.guard';
import { SentryShutdownFlush } from './sentry-shutdown.provider';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ name: 'default', ttl: seconds(60), limit: DEFAULT_THROTTLE_LIMIT }],
        // Fast-fail options: ioredis defaults (offline queue + 20 retries/request) would
        // stall every request ~10s during a Redis outage before FailOpenThrottlerGuard's
        // fail-open path engages -- reject immediately instead.
        storage: new ThrottlerStorageRedisService(process.env.REDIS_URL ?? 'redis://localhost:6379', {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        }),
      }),
    }),
    StaticUploadsModule,
    PrismaModule,
    RbacModule,
    AuditModule,
    SystemEventsModule,
    AuditQueryModule,
    SystemEventsQueryModule,
    AuthModule,
    SetupModule,
    LeadsModule,
    OrganizationsModule,
    UsersModule,
    QuestionsModule,
    ExamsModule,
    CandidatesModule,
    InvitationsModule,
    WalkInModule,
    WalkInGroupsModule,
    DrivesModule,
    PipelineModule,
    CandidateEmailsModule,
    AttemptsAdminModule,
    ReportsModule,
    DashboardModule,
    JobsModule,
    PublicApplicationsModule,
    PublicApiModule,
    FaceEnrolmentModule,
    ItemAnalyticsModule,
    PipelineAnalyticsModule,
    OffersModule,
    InterviewsModule,
    CandidateFitModule,
    BillingModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: FailOpenThrottlerGuard },
    {
      provide: SentryReporter,
      useFactory: () => {
        const reporter = new SentryReporter('api');
        reporter.init();
        return reporter;
      },
    },
    {
      provide: APP_FILTER,
      useFactory: (adapterHost: HttpAdapterHost, systemEvents: SystemEventsService, reporter: SentryReporter) =>
        new SystemEventsExceptionFilter(adapterHost, systemEvents, 'api', reporter),
      inject: [HttpAdapterHost, SystemEventsService, SentryReporter],
    },
    {
      provide: HealthService,
      useFactory: (prisma: PrismaService) => {
        // Created ONCE here, not inside checkRedis. Constructing a client per check
        // would open a new socket on every health poll -- a connection leak driven by the
        // monitor itself, at 3 monitors x every 5 minutes, forever.
        //
        // Deliberately NOT createRedisConnection() (jobs/redis-connection.ts): that factory
        // sets maxRetriesPerRequest: null for BullMQ's blocking commands, which is wrong here
        // -- it means ping() never rejects during an outage, just parks in ioredis's offline
        // queue forever. A plain client rejects instead, so a Redis outage is reported as
        // down rather than accumulating one more permanently-pending ping() per poll.
        const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
        // The health check reports failure through its own timeout/rejection, not through this
        // listener -- it exists only to stop ioredis printing a full stack per reconnect attempt
        // during an outage (this VM has no log rotation installed yet, so that noise fills disk).
        redis.on('error', () => {});
        return new HealthService({
          checkDb: () => prisma.$queryRaw`SELECT 1`,
          checkRedis: () => redis.ping(),
        });
      },
      inject: [PrismaService],
    },
    SentryShutdownFlush,
  ],
})
export class AppModule {}
