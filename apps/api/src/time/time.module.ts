import { Module } from '@nestjs/common';
import { ContractLabourModule } from '../contract-labour/contract-labour.module';
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
import { LicencesService } from './licences.service';
import { LicenceJobs } from './licence-jobs';
import { RosterLicencesController } from './roster-licences.controller';
import { TimesheetService } from './timesheet.service';
import { LeaveV2Controller } from './leave-v2.controller';
import { LeaveV2Service } from './leave-v2.service';
import { DevFakeHolidayProvider, HOLIDAY_PROVIDER } from './holiday-feed.provider';
import { AttendanceOpsController } from './attendance-ops.controller';
import { AttendanceOpsService } from './attendance-ops.service';
import { DeviceBackfillService } from './device-backfill.service';
import { IndustrialActionService } from './industrial-action.service';
import { PresenceService } from './presence.service';
import { FieldController } from './field.controller';
import { FieldJobs } from './field-jobs';
import { FieldService } from './field.service';
import { MAPS, mapsFromEnv } from './providers/maps';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { KioskController } from './kiosk.controller';
import { KioskService } from './kiosk.service';
import { FACE_MATCH, faceMatchFromEnv } from './providers/face-match';
import { HybridPrefillController } from './hybrid-prefill.controller';
import { HybridService } from './hybrid.service';
import { PrefillService } from './prefill.service';
import { WORK_TOOLS, workToolsFromEnv } from './providers/work-tools';
import { RosterExtrasController } from './roster-extras.controller';
import { OpenShiftsService } from './open-shifts.service';
import { StandbyService } from './standby.service';
import { AutoRosterController } from './auto-roster.controller';
import { AutoRosterService } from './auto-roster.service';
import { OrgSettingsService } from '../org-structure/org-settings.service';

// M02 Time and leave (step 4, batches 1 and 2) on the shared P03 approvals engine and P19 conditions.
@Module({
  imports: [AuditModule, WorkflowModule, NotificationsModule, AuthModule, PayrollModule, CryptoModule, ContractLabourModule],
  controllers: [TimeController, TimeOpsController, LeaveV2Controller, AttendanceOpsController, DevicesController, KioskController, FieldController, HybridPrefillController, RosterExtrasController, AutoRosterController, RosterLicencesController],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, OrgSettingsService, DayEngine, LeaveService, AttendanceService, TimeSetupService, TimeJobs, RosterService, OvertimeService, TimesheetService, PeriodsService, NightWorkService, LeaveV2Service, { provide: HOLIDAY_PROVIDER, useClass: DevFakeHolidayProvider }, AttendanceOpsService, IndustrialActionService, PresenceService, DeviceBackfillService, DevicesService, KioskService, { provide: FACE_MATCH, useFactory: faceMatchFromEnv }, FieldService, FieldJobs, { provide: MAPS, useFactory: mapsFromEnv }, HybridService, PrefillService, { provide: WORK_TOOLS, useFactory: workToolsFromEnv }, OpenShiftsService, StandbyService, AutoRosterService, LicencesService, LicenceJobs],
  // PeriodsService.feedRows / feed: the stable read of the frozen payroll feed for payroll (step 5).
  // LeaveV2Service.creditCompOff: the one comp-off ledger, for overtime settled as comp-off (TIM-09).
  // KioskService: the visitor kiosk (Visitors slice 2) uses the same device token sign-in.
  exports: [LeaveService, PeriodsService, LeaveV2Service, KioskService],
})
export class TimeModule {}
