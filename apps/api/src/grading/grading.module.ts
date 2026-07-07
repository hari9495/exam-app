import { Module } from '@nestjs/common';
import { AttemptSettlementService } from './attempt-settlement.service';

@Module({
  providers: [AttemptSettlementService],
  exports: [AttemptSettlementService],
})
export class GradingModule {}
