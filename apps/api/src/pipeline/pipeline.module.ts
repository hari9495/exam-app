import { Module } from '@nestjs/common';
import { CandidateEmailsModule } from '../candidate-emails/candidate-emails.module';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { FieldPermissionsModule } from '../field-permissions/field-permissions.module';
import { PipelineController } from './pipeline.controller';
import { PipelinesConfigController } from './pipelines-config.controller';
import { PipelineService } from './pipeline.service';
import { PipelinesService } from './pipelines.service';

@Module({
  // JobsModule -> IntegrationEventsService (candidate.hired fan-out); NotificationsModule -> the
  // in-app @mention notifications created from candidate feedback; ApprovalsModule -> the
  // requisition gate (getChains/submit/isConfigurer/cancelForSubject); FieldPermissionsModule ->
  // getHiddenFields for board/job/csv field-hiding.
  imports: [CandidateEmailsModule, JobsModule, NotificationsModule, ApprovalsModule, FieldPermissionsModule],
  controllers: [PipelineController, PipelinesConfigController],
  providers: [PipelineService, PipelinesService],
  exports: [PipelineService, PipelinesService],
})
export class PipelineModule {}
