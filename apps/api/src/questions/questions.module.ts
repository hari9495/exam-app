import { Module } from '@nestjs/common';
import { StorageModule, CryptoModule } from '@exam-platform/shared';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { QuestionBankController } from './bank/question-bank.controller';
import { QuestionBankService } from './bank/question-bank.service';
import { QuestionReviewNudgesService } from './bank/review-nudges.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { JobsModule } from '../jobs/jobs.module';
import { ExamRuntimeClientModule } from '../exam-runtime-client/exam-runtime-client.module';

@Module({
  imports: [JobsModule, ExamRuntimeClientModule, StorageModule, CryptoModule, NotificationsModule],
  controllers: [QuestionsController, TagsController, QuestionBankController],
  providers: [QuestionsService, TagsService, QuestionBankService, QuestionReviewNudgesService],
  exports: [QuestionsService, QuestionReviewNudgesService],
})
export class QuestionsModule {}
