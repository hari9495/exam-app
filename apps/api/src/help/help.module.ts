import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { WhatsNewController, WhatsNewStaffController } from './whats-new.controller';
import { WhatsNewService } from './whats-new.service';

// Help and onboarding (H-4, answer 943): What's new.
@Module({
  imports: [AuthModule, PlatformModule],
  providers: [WhatsNewService],
  controllers: [WhatsNewController, WhatsNewStaffController],
})
export class HelpModule {}
