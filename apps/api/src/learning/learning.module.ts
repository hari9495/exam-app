import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { LearningAssignService } from './learning-assign.service';
import { LearningReportsService } from './learning-reports.service';
import { LearningSessionsService } from './learning-sessions.service';

// Learning, the core (LRN-01 My learning and catalogue, LRN-02 player, LRN-03 course builder, LRN-07 assignment
// rules, LRN-08 compliance, the manager's team view and the PPL-03 Learning tab). The daily check (rules, renewals,
// reminders and escalation) runs on the scheduled sweeps.
@Module({
  imports: [AuthModule, CryptoModule, DocumentsModule, NotificationsModule, WorkflowModule],
  controllers: [LearningController],
  providers: [LearningService, LearningAssignService, LearningReportsService, LearningSessionsService],
  exports: [LearningAssignService],
})
export class LearningModule {}
