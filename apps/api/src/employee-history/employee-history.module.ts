import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { EmployeeHistoryController } from './employee-history.controller';
import { EmployeeHistoryService } from './employee-history.service';

// P01 §4.4 employee core with P06 effective-dated history. Exports the service for the daily sweep.
@Module({
  // P04: approvers are told when a change waits for them and when an approved one is cancelled (P06 Q7); waiting
  // changes join the shared Approvals inbox (P03).
  imports: [NotificationsModule, WorkflowModule],
  providers: [EmployeeHistoryService],
  controllers: [EmployeeHistoryController],
  exports: [EmployeeHistoryService],
})
export class EmployeeHistoryModule {}
