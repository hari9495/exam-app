import { Module } from '@nestjs/common';
import { EmployeeHistoryController } from './employee-history.controller';
import { EmployeeHistoryService } from './employee-history.service';

// P01 §4.4 employee core with P06 effective-dated history. Exports the service for the daily sweep.
@Module({
  providers: [EmployeeHistoryService],
  controllers: [EmployeeHistoryController],
  exports: [EmployeeHistoryService],
})
export class EmployeeHistoryModule {}
