import { Module } from '@nestjs/common';
import { CryptoModule, StorageModule } from '@exam-platform/shared';
import { CompanyDeletionService } from './company-deletion.service';
import { FileStore } from '../documents/file-store';
import { ConsoleOpsController } from './console-ops.controller';
import { ConsoleOpsService } from './console-ops.service';
import { AuditModule } from '@exam-platform/shared';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SmsChannelModule } from '../sms-channel/sms-channel.module';
import { PlatformController, SupportAccessController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformStaffGuard } from './platform-staff.guard';
import { SupportSessionsService } from './support-sessions.service';
import { CustomerSuccessController } from './customer-success.controller';
import { AvailabilityController, MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { CustomerSuccessService } from './customer-success.service';
import { CsFollowupService } from './cs-followup.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MyStaffRolesController, StaffRolesController } from './staff-roles.controller';
import { StaffRolesService } from './staff-roles.service';
import { EmailModule } from '../email/email.module';
import { PlatformSettingsController, PlatformSettingsService } from './platform-settings';
import { IncidentsController } from './incidents.controller';
import { MyNudgeController, NudgesController } from './nudges.controller';
import { NudgesService } from './nudges.service';
import { SalesAssistController } from './sales-assist.controller';
import { SalesAssistService } from './sales-assist.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { OrgScopeService } from '../access/org-scope.service';
import { IncidentsService } from './incidents.service';

// Step 3: the YukthiX platform console (P14) and support sessions (P02 Q8).
@Module({
  imports: [StorageModule, CryptoModule, AuditModule, EmailModule, AuthModule, OrganizationsModule, SmsChannelModule, NotificationsModule],
  providers: [CompanyDeletionService, FileStore, PlatformService, SupportSessionsService, PlatformStaffGuard, CustomerSuccessService, ConsoleOpsService, MaintenanceService, PlatformSettingsService, IncidentsService, StaffRolesService, CsFollowupService, NudgesService, OrgScopeService, SalesAssistService, AnalyticsService],
  controllers: [PlatformController, SupportAccessController, CustomerSuccessController, ConsoleOpsController, MaintenanceController, AvailabilityController, PlatformSettingsController, IncidentsController, StaffRolesController, MyStaffRolesController, NudgesController, MyNudgeController, SalesAssistController, AnalyticsController],
  // SD-1.31: "Request access" from a YukthiX Support ticket asks for a support session.
  exports: [SupportSessionsService, PlatformStaffGuard, IncidentsService, CsFollowupService, StaffRolesService, SalesAssistService, AnalyticsService],
})
export class PlatformModule {}
