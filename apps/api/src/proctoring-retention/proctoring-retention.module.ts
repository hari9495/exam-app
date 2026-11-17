import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { ProctoringRetentionService } from './proctoring-retention.service';

@Module({
  imports: [StorageModule, EmailModule],
  providers: [ProctoringRetentionService],
  exports: [ProctoringRetentionService],
})
export class ProctoringRetentionModule {}
