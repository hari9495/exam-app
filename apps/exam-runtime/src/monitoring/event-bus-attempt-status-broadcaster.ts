import { Injectable } from '@nestjs/common';
import { AttemptStatusBroadcaster } from './attempt-status-broadcaster';
import { monitoringEventBus } from './monitoring-event-bus';

@Injectable()
export class EventBusAttemptStatusBroadcaster implements AttemptStatusBroadcaster {
  async emitAttemptStatus(examId: string, payload: { attemptId: string; candidateId: string; status: string }): Promise<void> {
    monitoringEventBus.emitAttemptStatus({ examId, ...payload });
  }

  async emitMessageSent(examId: string, payload: { attemptId: string; candidateId: string; sentAt: Date }): Promise<void> {
    monitoringEventBus.emitMessageSent({ examId, ...payload });
  }

  async emitProctoringBypass(examId: string, payload: { attemptId: string; proctoringBypassed: boolean }): Promise<void> {
    monitoringEventBus.emitProctoringBypass({ examId, ...payload });
  }
}
