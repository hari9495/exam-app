import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { CodeExecutionModule } from '../code-execution/code-execution.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';

@Module({
  imports: [GradingModule, MonitoringModule, LeaderboardModule, AuditModule, CodeExecutionModule],
  controllers: [AttemptController],
  providers: [AttemptService],
})
export class AttemptModule {}
