import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PlatformModule } from '../../platform/platform.module';
import { ServiceDeskModule } from '../../service-desk/service-desk.module';
import { HelpModule } from '../help.module';
import { ASK_CLIENT, askClientFromEnv } from './assistant-client';
import { AssistantController, AssistantStaffController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { FeatureRequestsService } from './feature-requests.service';

// Ask YukthiX (answers 2101 to 2108): the help assistant, its hand-overs and the staff Feature requests list.
@Module({
  imports: [AuthModule, PlatformModule, ServiceDeskModule, HelpModule],
  providers: [AssistantService, FeatureRequestsService, { provide: ASK_CLIENT, useFactory: () => askClientFromEnv() }],
  controllers: [AssistantController, AssistantStaffController],
  exports: [AssistantService],
})
export class AssistantModule {}
