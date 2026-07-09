import { Global, Module } from '@nestjs/common';
import { RelayingAttemptStatusBroadcaster } from './relaying-attempt-status-broadcaster';
import { ATTEMPT_STATUS_BROADCASTER } from './attempt-status-broadcaster';

// Internal-app-only: binds ATTEMPT_STATUS_BROADCASTER to the HTTP-relay
// implementation, since this app has no MonitoringGateway/WebSocket
// connections of its own (see broadcast-relay.controller.ts on the public
// app for the receiving end). @Global() for the same reason as
// LocalMonitoringBridgeModule.
@Global()
@Module({
  providers: [{ provide: ATTEMPT_STATUS_BROADCASTER, useClass: RelayingAttemptStatusBroadcaster }],
  exports: [ATTEMPT_STATUS_BROADCASTER],
})
export class RemoteMonitoringBridgeModule {}
