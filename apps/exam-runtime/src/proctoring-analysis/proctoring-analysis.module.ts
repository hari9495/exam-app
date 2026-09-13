import { Module } from '@nestjs/common';
import { CryptoModule, StorageModule } from '@exam-platform/shared';
import { BillingModule } from '../billing/billing.module';
import { AttemptAnalysisService } from './attempt-analysis.service';
import { ProctoringRiskClient } from './proctoring-risk.client';
import { WebcamVisionService } from './webcam-vision.service';
import { WebcamVisionClient } from './webcam-vision.client';

@Module({
  // StorageModule -> BlobStorageService (download the stored webcam snapshots for the vision call).
  imports: [CryptoModule, BillingModule, StorageModule],
  providers: [AttemptAnalysisService, ProctoringRiskClient, WebcamVisionService, WebcamVisionClient],
  exports: [AttemptAnalysisService, WebcamVisionService],
})
export class ProctoringAnalysisModule {}
