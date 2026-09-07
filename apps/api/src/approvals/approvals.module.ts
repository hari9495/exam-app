import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalsService } from './approvals.service';
import { ApprovalsConfigController } from './approvals-config.controller';
import { ApprovalsController } from './approvals.controller';
import { ApprovalEmailTemplatesService } from './approval-email-templates.service';
import { ApprovalEmailTemplatesController } from './approval-email-templates.controller';

@Module({
  imports: [NotificationsModule, AuditModule],
  providers: [ApprovalsService, ApprovalEmailTemplatesService],
  controllers: [ApprovalsConfigController, ApprovalsController, ApprovalEmailTemplatesController],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
