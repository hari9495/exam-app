import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionProfilesModule } from '../permission-profiles/permission-profiles.module';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';

// P02 §4.2–4.3, §4.6: role templates, scoped role grants with second-admin approval, effective-access preview.
@Module({
  imports: [PermissionProfilesModule, NotificationsModule, EmailModule],
  providers: [AccessService],
  controllers: [AccessController],
})
export class AccessModule {}
