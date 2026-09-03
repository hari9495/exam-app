import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [NotificationsModule, AuditModule],
  providers: [ApprovalsService],
  controllers: [], // controllers land in Tasks 9-10
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
