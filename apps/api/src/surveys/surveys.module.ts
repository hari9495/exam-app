import { Module } from '@nestjs/common';
import { CandidateEmailsModule } from '../candidate-emails/candidate-emails.module';
import { SurveysService } from './surveys.service';
import { SurveysController } from './surveys.controller';
import { PublicSurveysController } from './public-surveys.controller';
import { PublicApplicationsThrottlerGuard } from '../public-applications/public-applications.throttler.guard';

// Candidate-experience surveys. Reuses CandidateEmailsService.sendMessage for the invite (branding +
// opt-out handling); pipeline patchEntry calls triggerOnStageChange to auto-fire on a stage move.
// The public response controller is guard-exempt (token-authed), reusing the applications throttler.
@Module({
  imports: [CandidateEmailsModule],
  controllers: [SurveysController, PublicSurveysController],
  providers: [SurveysService, PublicApplicationsThrottlerGuard],
  exports: [SurveysService],
})
export class SurveysModule {}
