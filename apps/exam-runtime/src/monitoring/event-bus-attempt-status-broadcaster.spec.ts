import { EventBusAttemptStatusBroadcaster } from './event-bus-attempt-status-broadcaster';
import { monitoringEventBus } from './monitoring-event-bus';

describe('EventBusAttemptStatusBroadcaster', () => {
  let broadcaster: EventBusAttemptStatusBroadcaster;

  beforeEach(() => {
    broadcaster = new EventBusAttemptStatusBroadcaster();
  });

  afterEach(() => {
    monitoringEventBus.removeAllListeners();
  });

  describe('emitAttemptStatus', () => {
    it('publishes the payload on monitoringEventBus', async () => {
      const listener = jest.fn();
      monitoringEventBus.onAttemptStatus(listener);

      await broadcaster.emitAttemptStatus('exam-1', { attemptId: 'attempt-1', candidateId: 'cand-1', status: 'force_submitted' });

      expect(listener).toHaveBeenCalledWith({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', status: 'force_submitted' });
    });
  });

  describe('emitMessageSent', () => {
    it('publishes the payload on monitoringEventBus with sentAt kept as a Date instance', async () => {
      const listener = jest.fn();
      monitoringEventBus.onMessageSent(listener);
      const sentAt = new Date('2026-07-09T00:00:00.000Z');

      await broadcaster.emitMessageSent('exam-1', { attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });

      expect(listener).toHaveBeenCalledWith({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });
      expect(listener.mock.calls[0][0].sentAt).toBeInstanceOf(Date);
    });
  });
});
