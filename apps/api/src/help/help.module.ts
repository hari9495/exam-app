import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { ToursController, WhatsNewController, WhatsNewStaffController } from './whats-new.controller';
import { ToursService } from './tours.service';
import { WhatsNewService } from './whats-new.service';

// Help and onboarding: What's new (H-4, answer 943) and first-run tours (H-5, answer 944).
@Module({
  imports: [AuthModule, PlatformModule],
  providers: [WhatsNewService, ToursService],
  controllers: [WhatsNewController, WhatsNewStaffController, ToursController],
})
export class HelpModule {}
