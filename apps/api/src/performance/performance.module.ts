import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { PerformanceFeedbackController } from './feedback.controller';
import { PerformanceFeedbackService } from './feedback.service';
import { PerformanceGoalsController } from './goals.controller';
import { PerformanceGoalsService } from './goals.service';
import { PerformanceJobs } from './perf-jobs';
import { PerformanceSetupController } from './setup.controller';
import { PerformanceSetupService } from './setup.service';

// M06 performance (M06-BUILD-DESIGN §4). PM1: set-up (rating scales, review templates, skills library, competencies).
// PM2: goals and OKRs (periods, alignment, key results, approval, check-ins and reminders).
// PM3: feedback, requests for feedback, 1:1s and HR sealing of concerns.
@Module({
  imports: [AuthModule, WorkflowModule, NotificationsModule],
  controllers: [PerformanceSetupController, PerformanceGoalsController, PerformanceFeedbackController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, PerformanceSetupService, PerformanceGoalsService, PerformanceFeedbackService, PerformanceJobs],
  exports: [PerformanceSetupService, PerformanceGoalsService],
})
export class PerformanceModule {}
