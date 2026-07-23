import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { AttemptInsightService } from './attempt-insight.service';
import { InsightClient } from './insight.client';

@Module({
  imports: [CryptoModule],
  providers: [AttemptInsightService, InsightClient],
  exports: [AttemptInsightService],
})
export class AttemptInsightModule {}
