import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@exam-platform/shared';
import { CandidateAuthModule } from './candidate-auth/candidate-auth.module';
import { AttemptModule } from './attempts/attempt.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ProctoringAnalysisModule } from './proctoring-analysis/proctoring-analysis.module';
import { GradingModule } from './grading/grading.module';
import { LocalMonitoringBridgeModule } from './monitoring/local-monitoring-bridge.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CandidateAuthModule,
    AttemptModule,
    MonitoringModule,
    ProctoringAnalysisModule,
    GradingModule,
    LocalMonitoringBridgeModule,
  ],
})
export class AppModule {}
