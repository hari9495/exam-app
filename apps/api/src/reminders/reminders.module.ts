import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersService } from './reminders.service';

// Daily staff-reminder sweep. CryptoModule provides TenantPrismaService; NotificationsModule
// provides NotificationsService (bell + per-user-preference email). Opt-in per org.
@Module({
  imports: [CryptoModule, NotificationsModule],
  providers: [RemindersService],
})
export class RemindersModule {}
