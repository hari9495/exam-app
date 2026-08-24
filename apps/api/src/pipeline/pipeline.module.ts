import { Module } from '@nestjs/common';
import { CandidateEmailsModule } from '../candidate-emails/candidate-emails.module';
import { JobsModule } from '../jobs/jobs.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

@Module({
  // JobsModule provides+exports IntegrationEventsService (candidate.hired fan-out on stage->hired).
  imports: [CandidateEmailsModule, JobsModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
