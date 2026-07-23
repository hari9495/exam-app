import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { EmailModule } from '../email/email.module';
import { WalkInController } from './walk-in.controller';
import { WalkInService } from './walk-in.service';

@Module({
  imports: [WebhooksModule, EmailModule],
  controllers: [WalkInController],
  providers: [WalkInService],
})
export class WalkInModule {}
