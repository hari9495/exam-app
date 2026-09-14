import { Module } from '@nestjs/common';
import { StorageModule, CryptoModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { JobsModule } from '../jobs/jobs.module';
import { BillingModule } from '../billing/billing.module';
import { CalendarSyncModule } from '../calendar-sync/calendar-sync.module';
import { InterviewsController } from './interviews.controller';
import { PublicInterviewsController } from './public-interviews.controller';
import { InterviewAiController } from './interview-ai.controller';
import { InterviewsService } from './interviews.service';
import { InterviewAiService } from './interview-ai.service';
import { InterviewQuestionsClient } from './interview-questions.client';
import { InterviewScorecardClient } from './interview-scorecard.client';
import { InterviewEmailTemplatesController } from './interview-email-templates.controller';
import { InterviewEmailTemplatesService } from './interview-email-templates.service';

@Module({
  // CalendarSyncModule exports CalendarSyncService, injected by InterviewsService to push/delete
  // calendar events + merge external busy times (all best-effort, inert when no OAuth app is set).
  // CryptoModule (AiApiKeyResolverService) + BillingModule (QuotaService) power the AI interview kit
  // -- both imported explicitly, mirroring JobsModule's AI processors.
  imports: [EmailModule, StorageModule, JobsModule, CalendarSyncModule, CryptoModule, BillingModule],
  controllers: [InterviewsController, PublicInterviewsController, InterviewAiController, InterviewEmailTemplatesController],
  providers: [InterviewsService, InterviewAiService, InterviewQuestionsClient, InterviewScorecardClient, InterviewEmailTemplatesService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
