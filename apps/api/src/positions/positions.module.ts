import { Module } from '@nestjs/common';
import { EmployeeHistoryModule } from '../employee-history/employee-history.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';

@Module({
  imports: [EmployeeHistoryModule, WorkflowModule],
  controllers: [PositionsController],
  providers: [PositionsService],
  exports: [PositionsService],
})
export class PositionsModule {}
