import { Module } from '@nestjs/common';
import { AuditModule, CryptoModule } from '@exam-platform/shared';
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
import { LeaveV2Controller } from './leave-v2.controller';
import { LeaveV2Service } from './leave-v2.service';
import { DevFakeHolidayProvider, HOLIDAY_PROVIDER } from './holiday-feed.provider';
import { AttendanceOpsController } from './attendance-ops.controller';
import { AttendanceOpsService } from './attendance-ops.service';
import { DeviceBackfillService } from './device-backfill.service';
import { IndustrialActionService } from './industrial-action.service';
import { PresenceService } from './presence.service';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { KioskController } from './kiosk.controller';
import { KioskService } from './kiosk.service';
import { FACE_MATCH, faceMatchFromEnv } from './providers/face-match';

// M02 Time and leave (step 4, batches 1 and 2) on the shared P03 approvals engine and P19 conditions.
@Module({
  imports: [AuditModule, WorkflowModule, NotificationsModule, AuthModule, PayrollModule, CryptoModule],
  controllers: [TimeController, TimeOpsController, LeaveV2Controller, AttendanceOpsController, DevicesController, KioskController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, DayEngine, LeaveService, AttendanceService, TimeSetupService, TimeJobs, RosterService, OvertimeService, TimesheetService, PeriodsService, NightWorkService, LeaveV2Service, { provide: HOLIDAY_PROVIDER, useClass: DevFakeHolidayProvider }, AttendanceOpsService, IndustrialActionService, PresenceService, DeviceBackfillService, DevicesService, KioskService, { provide: FACE_MATCH, useFactory: faceMatchFromEnv }],
  // PeriodsService.feedRows / feed: the stable read of the frozen payroll feed for payroll (step 5).
  // LeaveV2Service.creditCompOff: the one comp-off ledger, for overtime settled as comp-off (TIM-09).
  exports: [LeaveService, PeriodsService, LeaveV2Service],
})
export class TimeModule {}
