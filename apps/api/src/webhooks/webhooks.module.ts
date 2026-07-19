import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  // JobsModule already provides + exports a fully-wired WebhooksService (it needs
  // WEBHOOK_DELIVERIES_QUEUE from the same module to construct it). Re-declaring
  // WebhooksService as a local provider here would create a second, broken instance
  // missing that queue token -- re-exporting JobsModule itself is what actually makes
  // Nest's DI graph resolve (a bare `exports: [WebhooksService]` without importing the
  // module that provides it fails at compile time: "Nest cannot export a provider/module
  // that is not a part of the currently processed module").
  imports: [JobsModule],
  exports: [JobsModule],
})
export class WebhooksModule {}
