import { Module } from '@nestjs/common';
import { AttemptAnalysisService } from './attempt-analysis.service';
import { ClaudeProctoringClient } from './claude-proctoring.client';

@Module({
  providers: [AttemptAnalysisService, ClaudeProctoringClient],
  exports: [AttemptAnalysisService],
})
export class ProctoringAnalysisModule {}
