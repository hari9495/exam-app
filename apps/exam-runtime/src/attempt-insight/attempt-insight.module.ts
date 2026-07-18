import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { AttemptInsightService } from './attempt-insight.service';
import { ClaudeInsightClient } from './claude-insight.client';

@Module({
  imports: [CryptoModule],
  providers: [AttemptInsightService, ClaudeInsightClient],
  exports: [AttemptInsightService],
})
export class AttemptInsightModule {}
