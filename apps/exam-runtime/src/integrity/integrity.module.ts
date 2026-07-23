import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { IntegrityAnalysisService } from './integrity-analysis.service';
import { IntegrityNarrativeClient } from './integrity-narrative.client';

@Module({
  imports: [CryptoModule],
  providers: [IntegrityAnalysisService, IntegrityNarrativeClient],
  exports: [IntegrityAnalysisService],
})
export class IntegrityModule {}
