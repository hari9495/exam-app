import { BadRequestException, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ExamRuntimeInternalClient } from './exam-runtime-internal.client';

describe('ExamRuntimeInternalClient', () => {
  let client: ExamRuntimeInternalClient;

  beforeEach(() => {
    client = new ExamRuntimeInternalClient();
    process.env.EXAM_RUNTIME_INTERNAL_URL = 'http://localhost:3002';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
    delete process.env.EXAM_RUNTIME_INTERNAL_TIMEOUT_MS;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('forceSubmit', () => {
    it('POSTs to the internal force-submit endpoint with the shared secret and returns the parsed body', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ status: 'force_submitted' }) });

      const result = await client.forceSubmit('attempt-1');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/attempts/attempt-1/force-submit', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret' },
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual({ status: 'force_submitted' });
    });

    it('translates a 404 response into NotFoundException', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: 'Attempt attempt-1 not found' }) });

      await expect(client.forceSubmit('attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('translates a 400 response into BadRequestException', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'not in_progress' }) });

      await expect(client.forceSubmit('attempt-1')).rejects.toThrow(BadRequestException);
    });

    it('translates any other non-ok response into InternalServerErrorException', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => { throw new Error('no body'); } });

      await expect(client.forceSubmit('attempt-1')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('reanalyze', () => {
    it('POSTs to the internal reanalyze endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

      await client.reanalyze('attempt-1');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/attempts/attempt-1/reanalyze', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret' },
        signal: expect.any(AbortSignal),
      });
    });
  });

  describe('settleIfExpired', () => {
    it('POSTs to the internal settle-if-expired endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

      await client.settleIfExpired('attempt-1');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/attempts/attempt-1/settle-if-expired', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret' },
        signal: expect.any(AbortSignal),
      });
    });
  });

  describe('notifyMessageSent', () => {
    it('POSTs the payload as JSON to the internal message-sent endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
      const sentAt = new Date('2026-07-09T00:00:00.000Z');

      await client.notifyMessageSent({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/monitoring/message-sent', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt }),
        signal: expect.any(AbortSignal),
      });
    });
  });

  describe('timeout and network-error handling', () => {
    it('aborts and throws ServiceUnavailableException when the request exceeds the default timeout', async () => {
      jest.useFakeTimers();
      (global.fetch as jest.Mock).mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = client.reanalyze('attempt-1');
      // Attach the assertion's handler to `promise` before advancing timers — advancing first
      // would let the rejection fire while nothing observes it yet, which Jest/Node treats as
      // an unhandled rejection and fails the test even though the exception is correct.
      const assertion = expect(promise).rejects.toThrow(ServiceUnavailableException);
      await jest.advanceTimersByTimeAsync(5000);
      await assertion;
    });

    it('uses EXAM_RUNTIME_INTERNAL_TIMEOUT_MS when set instead of the 5000ms default', async () => {
      process.env.EXAM_RUNTIME_INTERNAL_TIMEOUT_MS = '100';
      jest.useFakeTimers();
      (global.fetch as jest.Mock).mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = client.reanalyze('attempt-1');
      const assertion = expect(promise).rejects.toThrow(ServiceUnavailableException);
      await jest.advanceTimersByTimeAsync(100);
      await assertion;
    });

    it('translates a connection error (fetch rejects without a response) into ServiceUnavailableException', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('fetch failed'));

      await expect(client.reanalyze('attempt-1')).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
