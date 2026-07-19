import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [JobsModule],
  exports: [WebhooksService],
})
export class WebhooksModule {}
