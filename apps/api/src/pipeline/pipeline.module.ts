import { Module } from '@nestjs/common';
import { CandidateEmailsModule } from '../candidate-emails/candidate-emails.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [CandidateEmailsModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
