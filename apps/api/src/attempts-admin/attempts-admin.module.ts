import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { AttemptsAdminController } from './attempts-admin.controller';
import { AttemptsAdminService } from './attempts-admin.service';

@Module({
  imports: [GradingModule, MonitoringModule, ProctoringAnalysisModule],
  controllers: [AttemptsAdminController],
  providers: [AttemptsAdminService],
})
export class AttemptsAdminModule {}
