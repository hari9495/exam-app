import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { PayrollModule } from '../payroll/payroll.module';
import { AttendanceService } from './attendance.service';
import { DayEngine } from './day-engine.service';
import { LeaveService } from './leave.service';
import { NightWorkService } from './night-work.service';
import { OvertimeService } from './overtime.service';
import { PeriodsService } from './periods.service';
import { RosterService } from './roster.service';
import { TimeSetupService } from './setup.service';
import { TimeController } from './time.controller';
import { TimeOpsController } from './time-ops.controller';
import { TimeJobs } from './time-jobs';
import { TimesheetService } from './timesheet.service';

// M02 Time and leave (step 4, batches 1 and 2) on the shared P03 approvals engine and P19 conditions.
@Module({
  imports: [AuditModule, WorkflowModule, NotificationsModule, AuthModule, PayrollModule],
  controllers: [TimeController, TimeOpsController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, DayEngine, LeaveService, AttendanceService, TimeSetupService, TimeJobs, RosterService, OvertimeService, TimesheetService, PeriodsService, NightWorkService],
  // PeriodsService.feedRows / feed: the stable read of the frozen payroll feed for payroll (step 5).
  exports: [LeaveService, PeriodsService],
})
export class TimeModule {}
