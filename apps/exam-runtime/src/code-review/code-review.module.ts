import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { BillingModule } from '../billing/billing.module';
import { CodeReviewService } from './code-review.service';
import { CodeReviewClient } from './code-review.client';

@Module({
  imports: [CryptoModule, BillingModule],
  providers: [CodeReviewService, CodeReviewClient],
  exports: [CodeReviewService],
})
export class CodeReviewModule {}
