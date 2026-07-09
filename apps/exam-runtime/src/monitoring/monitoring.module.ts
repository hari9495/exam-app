import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MonitoringGateway } from './monitoring.gateway';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [MonitoringGateway, MonitoringService],
  exports: [MonitoringGateway],
})
export class MonitoringModule {}
