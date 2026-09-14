import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDigestService } from './notification-digest.service';

@Module({
  imports: [EmailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDigestService],
  exports: [NotificationsService], // PipelineModule injects this to create @mention notifications
})
export class NotificationsModule {}
