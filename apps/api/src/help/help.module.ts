import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { ContainmentBannerController, HelpController, SetupHubController } from './help.controller';
import { SetupHubService } from './setup-hub.service';
import { ToursController, WhatsNewController, WhatsNewStaffController } from './whats-new.controller';
import { ToursService } from './tours.service';
import { WhatsNewService } from './whats-new.service';
import { NotFoundRetentionService } from './not-found-retention.service';
import { TalkToUsController } from './talk-to-us.controller';

// Help and onboarding: What's new (H-4, answer 943), Not found references (H-2, answer 947), first-run tours (H-5,
// answer 944) and the set-up hub (H-6, answer 952).
@Module({
  imports: [AuthModule, PlatformModule],
  providers: [WhatsNewService, ToursService, SetupHubService, NotFoundRetentionService],
  exports: [NotFoundRetentionService, WhatsNewService],
  controllers: [WhatsNewController, WhatsNewStaffController, HelpController, ToursController, SetupHubController, ContainmentBannerController, TalkToUsController],
})
export class HelpModule {}
