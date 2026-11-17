import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { EmailModule } from '../email/email.module';
import { ExamRuntimeClientModule } from '../exam-runtime-client/exam-runtime-client.module';
import { AsmtTestsController } from './tests/asmt-tests.controller';
import { AsmtTestsService } from './tests/asmt-tests.service';
import { IntegrityReviewController } from './integrity/integrity-review.controller';
import { IntegrityReviewService } from './integrity/integrity-review.service';

// Assessments AS-2: the test builder's own routes (/asmt/tests); the engine stays in ExamsModule. AS-5: integrity review.
@Module({
  imports: [ExamsModule, EmailModule, ExamRuntimeClientModule],
  controllers: [AsmtTestsController, IntegrityReviewController],
  providers: [AsmtTestsService, IntegrityReviewService],
})
export class AssessmentsModule {}
