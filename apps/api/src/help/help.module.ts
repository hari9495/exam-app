import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { HelpController, SetupHubController } from './help.controller';
import { SetupHubService } from './setup-hub.service';
import { WhatsNewController, WhatsNewStaffController } from './whats-new.controller';
import { WhatsNewService } from './whats-new.service';

// Help and onboarding: What's new (H-4, answer 943) Not found references (H-2, answer 947) and the set-up hub (H-6, answer 952).
@Module({
  imports: [AuthModule, PlatformModule],
  providers: [WhatsNewService, SetupHubService],
  controllers: [WhatsNewController, WhatsNewStaffController, HelpController, SetupHubController],
})
export class HelpModule {}
