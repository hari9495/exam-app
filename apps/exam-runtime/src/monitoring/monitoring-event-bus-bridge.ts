import { Injectable, OnModuleInit } from '@nestjs/common';
import { MonitoringGateway } from './monitoring.gateway';
import { monitoringEventBus } from './monitoring-event-bus';

@Injectable()
export class MonitoringEventBusBridge implements OnModuleInit {
  constructor(private readonly monitoringGateway: MonitoringGateway) {}

  onModuleInit(): void {
    monitoringEventBus.onAttemptStatus(({ examId, ...payload }) => this.monitoringGateway.emitAttemptStatus(examId, payload));
    monitoringEventBus.onMessageSent(({ examId, ...payload }) => this.monitoringGateway.emitMessageSent(examId, payload));
  }
}
