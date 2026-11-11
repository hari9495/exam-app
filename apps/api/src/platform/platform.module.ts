import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SmsChannelModule } from '../sms-channel/sms-channel.module';
import { PlatformController, SupportAccessController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformStaffGuard } from './platform-staff.guard';
import { SupportSessionsService } from './support-sessions.service';
import { CustomerSuccessController } from './customer-success.controller';
import { CustomerSuccessService } from './customer-success.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffRolesController } from './staff-roles.controller';
import { StaffRolesService } from './staff-roles.service';

// Step 3: the YukthiX platform console (P14) and support sessions (P02 Q8).
@Module({
  imports: [AuditModule, AuthModule, OrganizationsModule, SmsChannelModule, NotificationsModule],
  providers: [PlatformService, SupportSessionsService, PlatformStaffGuard, CustomerSuccessService, StaffRolesService],
  controllers: [PlatformController, SupportAccessController, CustomerSuccessController, StaffRolesController],
  // SD-1.31: "Request access" from a YukthiX Support ticket asks for a support session.
  exports: [SupportSessionsService, PlatformStaffGuard],
})
export class PlatformModule {}
