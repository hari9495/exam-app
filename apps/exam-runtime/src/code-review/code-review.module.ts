import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { CodeReviewService } from './code-review.service';
import { ClaudeCodeReviewClient } from './claude-code-review.client';

@Module({
  imports: [CryptoModule],
  providers: [CodeReviewService, ClaudeCodeReviewClient],
  exports: [CodeReviewService],
})
export class CodeReviewModule {}
