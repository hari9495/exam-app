import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';

@Module({
  imports: [GradingModule, MonitoringModule],
  controllers: [AttemptController],
  providers: [AttemptService],
})
export class AttemptModule {}
