import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionProfilesModule } from '../permission-profiles/permission-profiles.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { AccessController } from './access.controller';
import { AccessRequestsController } from './access-requests.controller';
import { AccessRequestsService } from './access-requests.service';
import { AccessService } from './access.service';
import { TemplateSyncService } from './template-sync.service';

// P02 §4.2–4.3, §4.6: role templates, scoped role grants with second-admin approval, effective-access preview.
@Module({
  imports: [PermissionProfilesModule, NotificationsModule, EmailModule, WorkflowModule],
  providers: [AccessService, AccessRequestsService, TemplateSyncService],
  exports: [TemplateSyncService],
  controllers: [AccessController, AccessRequestsController],
})
export class AccessModule {}
