import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { AttemptsController } from './attempts.controller';
import { AttemptsAdminService } from './attempts-admin.service';

@Module({
  imports: [GradingModule, MonitoringModule, ProctoringAnalysisModule],
  controllers: [AttemptController, AttemptsController],
  providers: [AttemptService, AttemptsAdminService],
})
export class AttemptModule {}
