import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { CodeReviewService } from './code-review.service';
import { CodeReviewClient } from './code-review.client';

@Module({
  imports: [CryptoModule],
  providers: [CodeReviewService, CodeReviewClient],
  exports: [CodeReviewService],
})
export class CodeReviewModule {}
