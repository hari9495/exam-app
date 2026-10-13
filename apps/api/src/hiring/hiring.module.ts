import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
import { JobBoardsModule } from '../job-boards/job-boards.module';
import { HiringController } from './hiring.controller';
import { HiringRequisitionsService } from './requisitions.service';

// M10 recruitment (M10-BUILD-DESIGN §4). AT1: keys, support masking (app module). AT2: headcount plans and
// requisitions on P03.
@Module({
  imports: [AuthModule, WorkflowModule, RulesEngineModule, JobBoardsModule],
  controllers: [HiringController],
  providers: [HiringRequisitionsService],
  exports: [HiringRequisitionsService],
})
export class HiringModule {}
