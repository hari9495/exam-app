import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, HttpAdapterHost } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { PrismaModule, AuditModule, SystemEventsModule, SystemEventsService, SystemEventsExceptionFilter } from '@exam-platform/shared';
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
    SystemEventsModule,
    CandidateAuthModule,
    AttemptModule,
    MonitoringModule,
    ProctoringAnalysisModule,
    GradingModule,
    LocalMonitoringBridgeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: FailOpenThrottlerGuard },
    // Registered before ServerBusyRetryAfterFilter on purpose: Nest matches global filters
    // in reverse registration order, so the specific @Catch(HttpException) filter below
    // keeps handling HttpExceptions (and its Retry-After header) while this catch-all
    // records only the unhandled-crash class it doesn't match.
    {
      provide: APP_FILTER,
      useFactory: (adapterHost: HttpAdapterHost, systemEvents: SystemEventsService) =>
        new SystemEventsExceptionFilter(adapterHost, systemEvents, 'exam-runtime'),
      inject: [HttpAdapterHost, SystemEventsService],
    },
    { provide: APP_FILTER, useClass: ServerBusyRetryAfterFilter },
  ],
})
export class AppModule {}
