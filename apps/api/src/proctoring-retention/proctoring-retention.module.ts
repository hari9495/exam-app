import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { ProctoringRetentionService } from './proctoring-retention.service';

@Module({
  imports: [StorageModule],
  providers: [ProctoringRetentionService],
  exports: [ProctoringRetentionService],
})
export class ProctoringRetentionModule {}
