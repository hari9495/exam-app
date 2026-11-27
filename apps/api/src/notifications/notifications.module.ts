import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDigestService } from './notification-digest.service';
import { HomeRemindersController } from './home-reminders.controller';
import { HomeRemindersService } from './home-reminders.service';
import { PushService } from './push.service';

@Module({
  imports: [EmailModule],
  controllers: [NotificationsController, HomeRemindersController],
  providers: [NotificationsService, NotificationDigestService, HomeRemindersService, PushService],
  // PipelineModule injects NotificationsService; ScheduledSweepsModule dispatches the digest sweep.
  exports: [NotificationsService, NotificationDigestService],
})
export class NotificationsModule {}
