import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { PrismaModule, AuditModule } from '@exam-platform/shared';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { SetupModule } from './setup/setup.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { StaticUploadsModule } from './organizations/static-uploads.module';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { CandidatesModule } from './candidates/candidates.module';
import { InvitationsModule } from './invitations/invitations.module';
import { WalkInModule } from './walk-in/walk-in.module';
import { AttemptsAdminModule } from './attempts-admin/attempts-admin.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { JobsModule } from './jobs/jobs.module';
import { AuditQueryModule } from './audit/audit-query.module';
import { PublicApiModule } from './public-api/public-api.module';
import { DEFAULT_THROTTLE_LIMIT } from './rate-limit-tiers';
import { FailOpenThrottlerGuard } from './fail-open-throttler.guard';

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
    AuditQueryModule,
    AuthModule,
    SetupModule,
    OrganizationsModule,
    UsersModule,
    QuestionsModule,
    ExamsModule,
    CandidatesModule,
    InvitationsModule,
    WalkInModule,
    AttemptsAdminModule,
    ReportsModule,
    DashboardModule,
    JobsModule,
    PublicApiModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: FailOpenThrottlerGuard }],
})
export class AppModule {}
