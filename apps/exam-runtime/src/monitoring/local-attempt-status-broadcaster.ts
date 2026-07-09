import { Injectable } from '@nestjs/common';
import { MonitoringGateway } from './monitoring.gateway';
import { AttemptStatusBroadcaster } from './attempt-status-broadcaster';

@Injectable()
export class LocalAttemptStatusBroadcaster implements AttemptStatusBroadcaster {
  constructor(private readonly monitoringGateway: MonitoringGateway) {}

  async emitAttemptStatus(examId: string, payload: { attemptId: string; candidateId: string; status: string }): Promise<void> {
    this.monitoringGateway.emitAttemptStatus(examId, payload);
  }

  async emitMessageSent(examId: string, payload: { attemptId: string; candidateId: string; sentAt: Date }): Promise<void> {
    this.monitoringGateway.emitMessageSent(examId, payload);
  }
}
