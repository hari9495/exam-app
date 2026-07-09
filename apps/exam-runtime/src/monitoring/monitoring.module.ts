import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MonitoringGateway } from './monitoring.gateway';
import { MonitoringService } from './monitoring.service';
import { BroadcastRelayController } from './broadcast-relay.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [BroadcastRelayController],
  providers: [MonitoringGateway, MonitoringService],
  exports: [MonitoringGateway],
})
export class MonitoringModule {}
