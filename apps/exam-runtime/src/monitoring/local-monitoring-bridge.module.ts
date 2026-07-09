import { Global, Module } from '@nestjs/common';
import { MonitoringModule } from './monitoring.module';
import { LocalAttemptStatusBroadcaster } from './local-attempt-status-broadcaster';
import { ATTEMPT_STATUS_BROADCASTER } from './attempt-status-broadcaster';

// Public-app-only: binds ATTEMPT_STATUS_BROADCASTER to the real MonitoringGateway,
// since this is the app that actually holds recruiter WebSocket connections.
// @Global() so GradingModule's AttemptSettlementService (a module this doesn't
// import directly) can resolve the token without every intermediate module
// needing to re-export it.
@Global()
@Module({
  imports: [MonitoringModule],
  providers: [{ provide: ATTEMPT_STATUS_BROADCASTER, useClass: LocalAttemptStatusBroadcaster }],
  exports: [ATTEMPT_STATUS_BROADCASTER],
})
export class LocalMonitoringBridgeModule {}
