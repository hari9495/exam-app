import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { JobsModule } from '../jobs/jobs.module';
import { InterviewsController } from './interviews.controller';
import { PublicInterviewsController } from './public-interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [EmailModule, StorageModule, JobsModule],
  controllers: [InterviewsController, PublicInterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
