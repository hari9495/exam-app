import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { BillingModule } from '../billing/billing.module';
import { IntegrityAnalysisService } from './integrity-analysis.service';
import { IntegrityNarrativeClient } from './integrity-narrative.client';

@Module({
  imports: [CryptoModule, BillingModule],
  providers: [IntegrityAnalysisService, IntegrityNarrativeClient],
  exports: [IntegrityAnalysisService],
})
export class IntegrityModule {}
