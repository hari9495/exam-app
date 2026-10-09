import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SmsChannelModule } from '../sms-channel/sms-channel.module';
import { PlatformController, SupportAccessController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformStaffGuard } from './platform-staff.guard';
import { SupportSessionsService } from './support-sessions.service';

// Step 3: the YukthiX platform console (P14) and support sessions (P02 Q8).
@Module({
  imports: [AuditModule, AuthModule, OrganizationsModule, SmsChannelModule],
  providers: [PlatformService, SupportSessionsService, PlatformStaffGuard],
  controllers: [PlatformController, SupportAccessController],
})
export class PlatformModule {}
