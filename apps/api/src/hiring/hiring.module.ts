import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
import { JobBoardsModule } from '../job-boards/job-boards.module';
import { HiringController } from './hiring.controller';
import { HiringRequisitionsService } from './requisitions.service';
import { CareersAdminService } from './careers-admin.service';
import { RediscoveryService } from './rediscovery.service';
import { CryptoModule } from '@exam-platform/shared';
import { AiModule } from '../ai/ai.module';
import { FieldPermissionsModule } from '../field-permissions/field-permissions.module';

// M10 recruitment (M10-BUILD-DESIGN §4). AT1: keys, support masking (app module). AT2: headcount plans and
// requisitions on P03. AT3: careers site settings (consent notices, entity pages).
@Module({
  imports: [AuthModule, WorkflowModule, RulesEngineModule, JobBoardsModule, CryptoModule, AiModule, FieldPermissionsModule],
  controllers: [HiringController],
  providers: [HiringRequisitionsService, CareersAdminService, RediscoveryService],
  exports: [HiringRequisitionsService],
})
export class HiringModule {}
