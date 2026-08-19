import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { BillingModule } from '../billing/billing.module';
import { AttemptAnalysisService } from './attempt-analysis.service';
import { ProctoringRiskClient } from './proctoring-risk.client';

@Module({
  imports: [CryptoModule, BillingModule],
  providers: [AttemptAnalysisService, ProctoringRiskClient],
  exports: [AttemptAnalysisService],
})
export class ProctoringAnalysisModule {}
