import { Module } from '@nestjs/common';
import { SystemEventsController } from './system-events.controller';
import { SystemEventsQueryService } from './system-events-query.service';
import { SystemEventsRetentionService } from './system-events-retention.service';

@Module({
  controllers: [SystemEventsController],
  providers: [SystemEventsQueryService, SystemEventsRetentionService],
  exports: [SystemEventsRetentionService], // ScheduledSweepsModule dispatches the daily prune
})
export class SystemEventsQueryModule {}
