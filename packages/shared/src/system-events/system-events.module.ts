import { Global, Module } from '@nestjs/common';
import { SystemEventsService } from './system-events.service';

@Global()
@Module({
  providers: [SystemEventsService],
  exports: [SystemEventsService],
})
export class SystemEventsModule {}
