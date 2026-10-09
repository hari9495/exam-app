import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmployeeHistoryController } from './employee-history.controller';
import { EmployeeHistoryService } from './employee-history.service';

// P01 §4.4 employee core with P06 effective-dated history. Exports the service for the daily sweep.
@Module({
  // P04: approvers are told when an approved change is cancelled (P06 Q7).
  imports: [NotificationsModule],
  providers: [EmployeeHistoryService],
  controllers: [EmployeeHistoryController],
  exports: [EmployeeHistoryService],
})
export class EmployeeHistoryModule {}
