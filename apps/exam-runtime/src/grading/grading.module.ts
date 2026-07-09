import { Module } from '@nestjs/common';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { AttemptSettlementService } from './attempt-settlement.service';

// No MonitoringModule import — AttemptSettlementService depends on the
// ATTEMPT_STATUS_BROADCASTER token instead, supplied globally by whichever
// app boots this module (LocalMonitoringBridgeModule for the public app,
// RemoteMonitoringBridgeModule for the internal app).
@Module({
  imports: [ProctoringAnalysisModule],
  providers: [AttemptSettlementService],
  exports: [AttemptSettlementService],
})
export class GradingModule {}
