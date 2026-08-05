import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [EmailModule, WebhooksModule, StorageModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
