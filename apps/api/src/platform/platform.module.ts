import { Module } from '@nestjs/common';
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
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

// Step 3: the YukthiX platform console (P14) and support sessions (P02 Q8).
@Module({
  imports: [AuditModule, AuthModule, OrganizationsModule, SmsChannelModule, NotificationsModule, EmailModule],
  providers: [PlatformService, SupportSessionsService, PlatformStaffGuard, CustomerSuccessService, ConsoleOpsService, MaintenanceService, IncidentsService],
  controllers: [PlatformController, SupportAccessController, CustomerSuccessController, ConsoleOpsController, MaintenanceController, AvailabilityController, IncidentsController],
  // SD-1.31: "Request access" from a YukthiX Support ticket asks for a support session.
  exports: [SupportSessionsService, PlatformStaffGuard, IncidentsService],
})
export class PlatformModule {}
