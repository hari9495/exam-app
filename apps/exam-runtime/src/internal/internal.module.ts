import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { AttemptInsightModule } from '../attempt-insight/attempt-insight.module';
import { InternalController } from './internal.controller';

// No MonitoringModule import — this app has no real MonitoringGateway/WebSocket
// connections of its own. ATTEMPT_STATUS_BROADCASTER (used by InternalController
// and, transitively, AttemptSettlementService inside GradingModule) is supplied
// globally by RemoteMonitoringBridgeModule at the InternalAppModule level.
@Module({
  imports: [GradingModule, ProctoringAnalysisModule, AttemptInsightModule],
  controllers: [InternalController],
})
export class InternalModule {}
