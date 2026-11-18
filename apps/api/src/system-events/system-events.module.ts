import { Module } from '@nestjs/common';
import { SystemEventsRetentionService } from './system-events-retention.service';

// The company-side /system-events list is retired (answer 2421): system logs are read in the staff console only
// (GET /platform/system-logs). This module keeps the daily prune.
@Module({
  providers: [SystemEventsRetentionService],
  exports: [SystemEventsRetentionService], // ScheduledSweepsModule dispatches the daily prune
})
export class SystemEventsQueryModule {}
