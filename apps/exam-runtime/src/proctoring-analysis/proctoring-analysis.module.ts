import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { AttemptAnalysisService } from './attempt-analysis.service';
import { ClaudeProctoringClient } from './claude-proctoring.client';

@Module({
  imports: [CryptoModule],
  providers: [AttemptAnalysisService, ClaudeProctoringClient],
  exports: [AttemptAnalysisService],
})
export class ProctoringAnalysisModule {}
