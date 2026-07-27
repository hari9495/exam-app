import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { PrismaModule, AuditModule } from '@exam-platform/shared';
import { CandidateAuthModule } from './candidate-auth/candidate-auth.module';
import { AttemptModule } from './attempts/attempt.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ProctoringAnalysisModule } from './proctoring-analysis/proctoring-analysis.module';
import { GradingModule } from './grading/grading.module';
import { LocalMonitoringBridgeModule } from './monitoring/local-monitoring-bridge.module';
import { DEFAULT_THROTTLE_LIMIT } from './rate-limit-tiers';
import { FailOpenThrottlerGuard } from './fail-open-throttler.guard';
import { ServerBusyRetryAfterFilter } from './server-busy-retry-after.filter';

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
    PrismaModule,
    AuditModule,
    CandidateAuthModule,
    AttemptModule,
    MonitoringModule,
    ProctoringAnalysisModule,
    GradingModule,
    LocalMonitoringBridgeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: FailOpenThrottlerGuard },
    { provide: APP_FILTER, useClass: ServerBusyRetryAfterFilter },
  ],
})
export class AppModule {}
