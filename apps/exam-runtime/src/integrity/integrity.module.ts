import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { IntegrityAnalysisService } from './integrity-analysis.service';
import { ClaudeIntegrityClient } from './claude-integrity.client';

@Module({
  imports: [CryptoModule],
  providers: [IntegrityAnalysisService, ClaudeIntegrityClient],
  exports: [IntegrityAnalysisService],
})
export class IntegrityModule {}
