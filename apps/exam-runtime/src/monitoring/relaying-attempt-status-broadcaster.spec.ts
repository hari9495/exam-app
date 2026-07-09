import { RelayingAttemptStatusBroadcaster } from './relaying-attempt-status-broadcaster';

describe('RelayingAttemptStatusBroadcaster', () => {
  let broadcaster: RelayingAttemptStatusBroadcaster;

  beforeEach(() => {
    broadcaster = new RelayingAttemptStatusBroadcaster();
    process.env.EXAM_RUNTIME_PUBLIC_URL = 'http://127.0.0.1:3002';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
    global.fetch = jest.fn();
  });

  describe('emitAttemptStatus', () => {
    it('POSTs the payload as JSON to the relay endpoint with the shared secret', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await broadcaster.emitAttemptStatus('exam-1', { attemptId: 'attempt-1', candidateId: 'cand-1', status: 'force_submitted' });

      expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:3002/api/v1/monitoring-relay/attempt-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'test-internal-secret' },
        body: JSON.stringify({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', status: 'force_submitted' }),
      });
    });

    it('throws when the relay endpoint responds with a non-ok status', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

      await expect(
        broadcaster.emitAttemptStatus('exam-1', { attemptId: 'attempt-1', candidateId: 'cand-1', status: 'force_submitted' }),
      ).rejects.toThrow('Broadcast relay call to /api/v1/monitoring-relay/attempt-status failed with status 500');
    });
  });

  describe('emitMessageSent', () => {
    it('POSTs the payload as JSON, serializing sentAt to an ISO string', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const sentAt = new Date('2026-07-09T00:00:00.000Z');

      await broadcaster.emitMessageSent('exam-1', { attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });

      expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:3002/api/v1/monitoring-relay/message-sent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'test-internal-secret' },
        body: JSON.stringify({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt: '2026-07-09T00:00:00.000Z' }),
      });
    });

    it('throws when the relay endpoint responds with a non-ok status', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

      await expect(
        broadcaster.emitMessageSent('exam-1', { attemptId: 'attempt-1', candidateId: 'cand-1', sentAt: new Date() }),
      ).rejects.toThrow('Broadcast relay call to /api/v1/monitoring-relay/message-sent failed with status 401');
    });
  });
});
