import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { AttemptsAdminController } from './attempts-admin.controller';
import { AttemptsAdminService } from './attempts-admin.service';
import { ExamRuntimeClientModule } from '../exam-runtime-client/exam-runtime-client.module';

@Module({
  imports: [ExamRuntimeClientModule, StorageModule],
  controllers: [AttemptsAdminController],
  providers: [AttemptsAdminService],
})
export class AttemptsAdminModule {}
