import { Module } from '@nestjs/common';
import { ExamRuntimeInternalClient } from './exam-runtime-internal.client';

@Module({
  providers: [ExamRuntimeInternalClient],
  exports: [ExamRuntimeInternalClient],
})
export class ExamRuntimeClientModule {}
