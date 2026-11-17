import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { ExamsModule } from '../exams/exams.module';
import { EmailModule } from '../email/email.module';
import { ExamRuntimeClientModule } from '../exam-runtime-client/exam-runtime-client.module';
import { AsmtTestsController } from './tests/asmt-tests.controller';
import { AsmtTestsService } from './tests/asmt-tests.service';
import { IntegrityReviewController } from './integrity/integrity-review.controller';
import { IntegrityReviewService } from './integrity/integrity-review.service';
import { IntegrityReportsService } from './integrity/integrity-reports.service';

// Assessments AS-2: the test builder's own routes (/asmt/tests); the engine stays in ExamsModule. AS-5: integrity review.
@Module({
  imports: [ExamsModule, EmailModule, ExamRuntimeClientModule, StorageModule],
  controllers: [AsmtTestsController, IntegrityReviewController],
  providers: [AsmtTestsService, IntegrityReviewService, IntegrityReportsService],
})
export class AssessmentsModule {}
