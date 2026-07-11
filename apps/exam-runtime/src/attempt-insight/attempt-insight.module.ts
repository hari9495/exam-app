import { Module } from '@nestjs/common';
import { AttemptInsightService } from './attempt-insight.service';
import { ClaudeInsightClient } from './claude-insight.client';

@Module({
  providers: [AttemptInsightService, ClaudeInsightClient],
  exports: [AttemptInsightService],
})
export class AttemptInsightModule {}
