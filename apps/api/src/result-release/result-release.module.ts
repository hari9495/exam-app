import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { ResultReleaseController } from './result-release.controller';
import { ResultReleaseService } from './result-release.service';

// Candidate result release: per-exam mode (Exam.resultsReleaseMode) + per-attempt override
// (Result.releaseOverride), with optional candidate notification email. EmailModule for the notify
// send, StorageModule for signing the org logo in that email. TenantPrisma/Audit are global.
@Module({
  imports: [EmailModule, StorageModule],
  controllers: [ResultReleaseController],
  providers: [ResultReleaseService],
  exports: [ResultReleaseService],
})
export class ResultReleaseModule {}
