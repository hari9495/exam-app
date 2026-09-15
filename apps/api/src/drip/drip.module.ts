import { Module } from '@nestjs/common';
import { CandidateEmailsModule } from '../candidate-emails/candidate-emails.module';
import { DripService } from './drip.service';
import { DripController } from './drip.controller';

// Candidate nurture / drip campaigns. Reuses CandidateEmailsService.sendMessage for each step send;
// the recurring 'drip-steps' sweep that drives it is owned by ScheduledSweepsModule (which injects
// DripService), and pipeline patchEntry calls the enrol/exit hooks. Exports DripService for both.
@Module({
  imports: [CandidateEmailsModule],
  controllers: [DripController],
  providers: [DripService],
  exports: [DripService],
})
export class DripModule {}
