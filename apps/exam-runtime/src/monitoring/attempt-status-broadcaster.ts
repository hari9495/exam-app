export const ATTEMPT_STATUS_BROADCASTER = 'ATTEMPT_STATUS_BROADCASTER';

export interface AttemptStatusBroadcaster {
  emitAttemptStatus(examId: string, payload: { attemptId: string; candidateId: string; status: string }): Promise<void>;
  emitMessageSent(examId: string, payload: { attemptId: string; candidateId: string; sentAt: Date }): Promise<void>;
}
