import { Module } from '@nestjs/common';
import { SystemEventsController } from './system-events.controller';
import { SystemEventsQueryService } from './system-events-query.service';

@Module({
  controllers: [SystemEventsController],
  providers: [SystemEventsQueryService],
})
export class SystemEventsQueryModule {}
