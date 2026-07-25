import { EventEmitter } from 'events';

export interface AttemptStatusEvent {
  examId: string;
  attemptId: string;
  candidateId: string;
  status: string;
}

export interface MessageSentEvent {
  examId: string;
  attemptId: string;
  candidateId: string;
  sentAt: Date;
}

export interface ProctoringBypassEvent {
  examId: string;
  attemptId: string;
  proctoringBypassed: boolean;
}

// Both exam-runtime Nest apps (public + internal, see main.ts) run in the same
// Node process — importing this module from either app's DI container resolves
// to this same singleton via Node's module cache. This is what lets the internal
// app publish monitoring events without an HTTP call back into the public app.
class MonitoringEventBus extends EventEmitter {
  emitAttemptStatus(event: AttemptStatusEvent): void {
    this.emit('attempt-status', event);
  }

  onAttemptStatus(listener: (event: AttemptStatusEvent) => void): void {
    this.on('attempt-status', listener);
  }

  emitMessageSent(event: MessageSentEvent): void {
    this.emit('message-sent', event);
  }

  onMessageSent(listener: (event: MessageSentEvent) => void): void {
    this.on('message-sent', listener);
  }

  emitProctoringBypass(event: ProctoringBypassEvent): void {
    this.emit('proctoring-bypass', event);
  }

  onProctoringBypass(listener: (event: ProctoringBypassEvent) => void): void {
    this.on('proctoring-bypass', listener);
  }
}

export const monitoringEventBus = new MonitoringEventBus();
