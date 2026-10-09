import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { WorkflowModule } from '../workflow/workflow.module';
import { AttendanceService } from './attendance.service';
import { DayEngine } from './day-engine.service';
import { LeaveService } from './leave.service';
import { TimeSetupService } from './setup.service';
import { TimeController } from './time.controller';
import { TimeJobs } from './time-jobs';

// M02 Time and leave (step 4, batch 1) on the shared P03 approvals engine and P19 conditions.
@Module({
  imports: [AuditModule, WorkflowModule],
  controllers: [TimeController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, DayEngine, LeaveService, AttendanceService, TimeSetupService, TimeJobs],
  exports: [LeaveService],
})
export class TimeModule {}
