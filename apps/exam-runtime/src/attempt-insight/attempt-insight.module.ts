import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { BillingModule } from '../billing/billing.module';
import { AttemptInsightService } from './attempt-insight.service';
import { InsightClient } from './insight.client';

@Module({
  imports: [CryptoModule, BillingModule],
  providers: [AttemptInsightService, InsightClient],
  exports: [AttemptInsightService],
})
export class AttemptInsightModule {}
