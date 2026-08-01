import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { ExamRuntimeClientModule } from '../exam-runtime-client/exam-runtime-client.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  imports: [ExamRuntimeClientModule, StorageModule],
  controllers: [ExamsController],
  providers: [ExamsService],
  exports: [ExamsService],
})
export class ExamsModule {}
