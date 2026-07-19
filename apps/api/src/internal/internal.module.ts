import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { InternalController } from './internal.controller';

@Module({
  imports: [WebhooksModule],
  controllers: [InternalController],
})
export class InternalModule {}
