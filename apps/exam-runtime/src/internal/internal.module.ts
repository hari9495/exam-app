import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { InternalController } from './internal.controller';

@Module({
  imports: [GradingModule, MonitoringModule, ProctoringAnalysisModule],
  controllers: [InternalController],
})
export class InternalModule {}
