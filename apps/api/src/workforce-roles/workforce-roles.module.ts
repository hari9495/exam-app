import { Module } from '@nestjs/common';
import { WorkforceRolesController } from './workforce-roles.controller';
import { WorkforceRolesService } from './workforce-roles.service';

// Contract workers and placements: roles on the person record that the People Directory counts.
@Module({
  providers: [WorkforceRolesService],
  controllers: [WorkforceRolesController],
  exports: [WorkforceRolesService],
})
export class WorkforceRolesModule {}
