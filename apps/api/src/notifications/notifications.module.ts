import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDigestService } from './notification-digest.service';

@Module({
  imports: [EmailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDigestService],
  // PipelineModule injects NotificationsService; ScheduledSweepsModule dispatches the digest sweep.
  exports: [NotificationsService, NotificationDigestService],
})
export class NotificationsModule {}
