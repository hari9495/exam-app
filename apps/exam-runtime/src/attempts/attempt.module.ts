import { Module } from '@nestjs/common';
import { AuditModule, StorageModule, CryptoModule } from '@exam-platform/shared';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { CodeExecutionModule } from '../code-execution/code-execution.module';
import { FaceModule } from '../face/face.module';
import { BillingModule } from '../billing/billing.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';

@Module({
  imports: [GradingModule, MonitoringModule, LeaderboardModule, AuditModule, CodeExecutionModule, StorageModule, CryptoModule, FaceModule, BillingModule],
  controllers: [AttemptController],
  providers: [AttemptService],
})
export class AttemptModule {}
