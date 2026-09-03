import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalsService } from './approvals.service';
import { ApprovalsConfigController } from './approvals-config.controller';
import { ApprovalsController } from './approvals.controller';

@Module({
  imports: [NotificationsModule, AuditModule],
  providers: [ApprovalsService],
  controllers: [ApprovalsConfigController, ApprovalsController],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
