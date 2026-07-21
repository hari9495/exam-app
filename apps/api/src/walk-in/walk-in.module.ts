import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { WalkInController } from './walk-in.controller';
import { WalkInService } from './walk-in.service';

@Module({
  imports: [WebhooksModule],
  controllers: [WalkInController],
  providers: [WalkInService],
})
export class WalkInModule {}
