import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@exam-platform/shared';
import { InternalModule } from './internal/internal.module';
import { RemoteMonitoringBridgeModule } from './monitoring/remote-monitoring-bridge.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, RemoteMonitoringBridgeModule, InternalModule],
})
export class InternalAppModule {}
