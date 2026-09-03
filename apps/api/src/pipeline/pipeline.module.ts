import { Module } from '@nestjs/common';
import { CandidateEmailsModule } from '../candidate-emails/candidate-emails.module';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

@Module({
  // JobsModule -> IntegrationEventsService (candidate.hired fan-out); NotificationsModule -> the
  // in-app @mention notifications created from candidate feedback; ApprovalsModule -> the
  // requisition gate (getChains/submit/isConfigurer/cancelForSubject).
  imports: [CandidateEmailsModule, JobsModule, NotificationsModule, ApprovalsModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
