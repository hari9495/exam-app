import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { PistonClient } from '../code-execution/piston-client';
import { RunLimiter } from '../code-execution/run-limiter';

@Module({
  imports: [GradingModule, MonitoringModule],
  controllers: [AttemptController],
  providers: [AttemptService, PistonClient, RunLimiter],
})
export class AttemptModule {}
