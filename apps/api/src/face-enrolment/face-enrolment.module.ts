import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { FaceRetentionService } from './face-retention.service';

@Module({
  imports: [StorageModule],
  providers: [FaceRetentionService],
  exports: [FaceRetentionService],
})
export class FaceEnrolmentModule {}
