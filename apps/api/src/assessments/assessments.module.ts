import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { AsmtTestsController } from './tests/asmt-tests.controller';
import { AsmtTestsService } from './tests/asmt-tests.service';

// Assessments AS-2: the test builder's own routes (/asmt/tests); the engine stays in ExamsModule.
@Module({
  imports: [ExamsModule],
  controllers: [AsmtTestsController],
  providers: [AsmtTestsService],
})
export class AssessmentsModule {}
