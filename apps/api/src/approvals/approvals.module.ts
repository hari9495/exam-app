import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalsService } from './approvals.service';
import { ApprovalsConfigController } from './approvals-config.controller';

@Module({
  imports: [NotificationsModule, AuditModule],
  providers: [ApprovalsService],
  controllers: [ApprovalsConfigController], // remaining submit/decide/cancel controller lands in Task 10
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
