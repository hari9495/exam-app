import { Global, Module } from '@nestjs/common';
import { EventBusAttemptStatusBroadcaster } from './event-bus-attempt-status-broadcaster';
import { ATTEMPT_STATUS_BROADCASTER } from './attempt-status-broadcaster';

// Internal-app-only: binds ATTEMPT_STATUS_BROADCASTER to the in-process
// event-bus implementation, since this app has no MonitoringGateway/WebSocket
// connections of its own (see monitoring-event-bus-bridge.ts on the public
// app for the receiving end — both apps run in the same Node process, see
// main.ts). @Global() for the same reason as LocalMonitoringBridgeModule.
@Global()
@Module({
  providers: [{ provide: ATTEMPT_STATUS_BROADCASTER, useClass: EventBusAttemptStatusBroadcaster }],
  exports: [ATTEMPT_STATUS_BROADCASTER],
})
export class RemoteMonitoringBridgeModule {}
