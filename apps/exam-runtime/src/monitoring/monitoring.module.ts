import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MonitoringGateway } from './monitoring.gateway';
import { MonitoringService } from './monitoring.service';
import { MonitoringEventBusBridge } from './monitoring-event-bus-bridge';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [JwtModule.register({}), LeaderboardModule],
  providers: [MonitoringGateway, MonitoringService, MonitoringEventBusBridge],
  exports: [MonitoringGateway],
})
export class MonitoringModule {}
