import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { HelpController } from './help.controller';
import { WhatsNewController, WhatsNewStaffController } from './whats-new.controller';
import { WhatsNewService } from './whats-new.service';

// Help and onboarding: What's new (H-4, answer 943) and Not found references (H-2, answer 947).
@Module({
  imports: [AuthModule, PlatformModule],
  providers: [WhatsNewService],
  controllers: [WhatsNewController, WhatsNewStaffController, HelpController],
})
export class HelpModule {}
