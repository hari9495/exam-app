import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { JobsModule } from '../jobs/jobs.module';
import { CalendarSyncModule } from '../calendar-sync/calendar-sync.module';
import { InterviewsController } from './interviews.controller';
import { PublicInterviewsController } from './public-interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  // CalendarSyncModule exports CalendarSyncService, injected by InterviewsService to push/delete
  // calendar events + merge external busy times (all best-effort, inert when no OAuth app is set).
  imports: [EmailModule, StorageModule, JobsModule, CalendarSyncModule],
  controllers: [InterviewsController, PublicInterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
