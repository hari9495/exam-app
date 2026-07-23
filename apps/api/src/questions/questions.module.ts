import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { JobsModule } from '../jobs/jobs.module';
import { ExamRuntimeClientModule } from '../exam-runtime-client/exam-runtime-client.module';

@Module({
  imports: [JobsModule, ExamRuntimeClientModule, StorageModule],
  controllers: [QuestionsController, TagsController],
  providers: [QuestionsService, TagsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
