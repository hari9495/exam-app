import { Module } from '@nestjs/common';
import { CodeReviewService } from './code-review.service';
import { ClaudeCodeReviewClient } from './claude-code-review.client';

@Module({
  providers: [CodeReviewService, ClaudeCodeReviewClient],
  exports: [CodeReviewService],
})
export class CodeReviewModule {}
