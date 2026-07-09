import { Module } from '@nestjs/common';
import { ExamRuntimeClientModule } from '../exam-runtime-client/exam-runtime-client.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  imports: [ExamRuntimeClientModule],
  controllers: [ExamsController],
  providers: [ExamsService],
  exports: [ExamsService],
})
export class ExamsModule {}
