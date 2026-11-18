import { Module } from '@nestjs/common';
import { CandidateEmailsModule } from '../candidate-emails/candidate-emails.module';
import { DripService } from './drip.service';
import { DripMigration } from './drip-migration';

// Candidate nurture / drip campaigns. Reuses CandidateEmailsService.sendMessage for each step send;
// the recurring 'drip-steps' sweep that drives it is owned by ScheduledSweepsModule (which injects
// DripService), and pipeline patchEntry calls the enrol/exit hooks. Exports DripService for both.
@Module({
  imports: [CandidateEmailsModule],
  // Retire /v2 (answers 2433, 2512): no drip routes any more; DripMigration moves each drip into a draft HIR-20 campaign.
  providers: [DripService, DripMigration],
  exports: [DripService],
})
export class DripModule {}
