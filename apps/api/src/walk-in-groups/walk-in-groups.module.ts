import { Module } from '@nestjs/common';
import { WalkInGroupsController } from './walk-in-groups.controller';
import { WalkInGroupsService } from './walk-in-groups.service';

@Module({
  controllers: [WalkInGroupsController],
  providers: [WalkInGroupsService],
})
export class WalkInGroupsModule {}
