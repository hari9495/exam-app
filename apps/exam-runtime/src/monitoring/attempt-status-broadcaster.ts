// Bound by exactly one of LocalMonitoringBridgeModule (public app) or
// RemoteMonitoringBridgeModule (internal app) — both are @Global() and bind
// this same token. Never import both into the same app's module graph; Nest
// would silently resolve to whichever provider compiles last, with no
// compile-time warning.
export const ATTEMPT_STATUS_BROADCASTER = 'ATTEMPT_STATUS_BROADCASTER';

export interface AttemptStatusBroadcaster {
  emitAttemptStatus(examId: string, payload: { attemptId: string; candidateId: string; status: string }): Promise<void>;
  emitMessageSent(examId: string, payload: { attemptId: string; candidateId: string; sentAt: Date }): Promise<void>;
  emitProctoringBypass(examId: string, payload: { attemptId: string; proctoringBypassed: boolean }): Promise<void>;
}
