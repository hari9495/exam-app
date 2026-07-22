import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { PistonClient } from '../code-execution/piston-client';
import { RunLimiter } from '../code-execution/run-limiter';

@Module({
  imports: [GradingModule, MonitoringModule, LeaderboardModule, AuditModule],
  controllers: [AttemptController],
  providers: [AttemptService, PistonClient, RunLimiter],
})
export class AttemptModule {}
