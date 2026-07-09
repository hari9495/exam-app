import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MonitoringGateway } from './monitoring.gateway';
import { MonitoringService } from './monitoring.service';
import { MonitoringEventBusBridge } from './monitoring-event-bus-bridge';

@Module({
  imports: [JwtModule.register({})],
  providers: [MonitoringGateway, MonitoringService, MonitoringEventBusBridge],
  exports: [MonitoringGateway],
})
export class MonitoringModule {}
