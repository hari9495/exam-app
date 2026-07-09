import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ExamRuntimeInternalClient } from './exam-runtime-internal.client';

describe('ExamRuntimeInternalClient', () => {
  let client: ExamRuntimeInternalClient;

  beforeEach(() => {
    client = new ExamRuntimeInternalClient();
    process.env.EXAM_RUNTIME_INTERNAL_URL = 'http://localhost:3002';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
    global.fetch = jest.fn();
  });

  describe('forceSubmit', () => {
    it('POSTs to the internal force-submit endpoint with the shared secret and returns the parsed body', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ status: 'force_submitted' }) });

      const result = await client.forceSubmit('attempt-1');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/attempts/attempt-1/force-submit', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret' },
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
      });
    });
  });
});
