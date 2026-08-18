import { Module } from '@nestjs/common';
import { WalkInGroupsController } from './walk-in-groups.controller';
import { WalkInGroupsService } from './walk-in-groups.service';
import { PipelineModule } from '../pipeline/pipeline.module';

@Module({
  imports: [PipelineModule],
  controllers: [WalkInGroupsController],
  providers: [WalkInGroupsService],
})
export class WalkInGroupsModule {}
