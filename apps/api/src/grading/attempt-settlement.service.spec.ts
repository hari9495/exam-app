import { Prisma } from '@prisma/client';
import { AttemptSettlementService } from './attempt-settlement.service';

describe('AttemptSettlementService', () => {
  let service: AttemptSettlementService;
  const exam = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 50 };

  beforeEach(() => {
    service = new AttemptSettlementService();
  });

  describe('remainingSeconds', () => {
    it('returns a positive value before the exam duration has elapsed', () => {
      const startedAt = new Date(Date.now() - 5 * 60_000);
      const seconds = service.remainingSeconds(exam, { startedAt });
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(25 * 60);
    });

    it('returns zero (not negative) once the duration has elapsed', () => {
      const startedAt = new Date(Date.now() - 60 * 60_000);
      expect(service.remainingSeconds(exam, { startedAt })).toBe(0);
    });
  });

  describe('settleIfExpired', () => {
    it('leaves an in-progress attempt untouched if the duration has not elapsed', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', startedAt: new Date(), questionOrderJson: '[]' };
      const tx = {
        question: { findMany: jest.fn() },
        answer: { findMany: jest.fn() },
        result: { create: jest.fn() },
        attempt: { update: jest.fn() },
      };

      const result = await service.settleIfExpired(tx as unknown as Prisma.TransactionClient, exam, attempt as any);

      expect(result).toBe(attempt);
      expect(tx.attempt.update).not.toHaveBeenCalled();
    });

    it('leaves an already-submitted attempt untouched even if the duration has elapsed', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(Date.now() - 60 * 60_000), questionOrderJson: '[]',
      };
      const tx = {
        question: { findMany: jest.fn() },
        answer: { findMany: jest.fn() },
        result: { create: jest.fn() },
        attempt: { update: jest.fn() },
      };

      const result = await service.settleIfExpired(tx as unknown as Prisma.TransactionClient, exam, attempt as any);

      expect(result).toBe(attempt);
      expect(tx.question.findMany).not.toHaveBeenCalled();
    });

    it('grades and transitions an expired in-progress attempt to auto_submitted', async () => {
      const attempt = {
        id: 'attempt-1',
        status: 'in_progress',
        startedAt: new Date(Date.now() - 60 * 60_000),
        questionOrderJson: JSON.stringify(['q1']),
      };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', marks: 5, options: [{ id: 'opt-a', isCorrect: true }, { id: 'opt-b', isCorrect: false }] },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']) },
          ]),
          update: jest.fn(),
        },
        result: { create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'auto_submitted' }) },
      };

      const result = await service.settleIfExpired(tx as unknown as Prisma.TransactionClient, exam, attempt as any);

      expect(tx.answer.update).toHaveBeenCalledWith({ where: { id: 'answer-1' }, data: { isCorrect: true, marksAwarded: 5 } });
      expect(tx.result.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', score: 5, maxScore: 5, percentage: 100, passFail: 'pass' },
      });
      expect(tx.attempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { status: 'auto_submitted', submittedAt: expect.any(Date) },
      });
      expect(result.status).toBe('auto_submitted');
    });
  });

  describe('finalize', () => {
    it('grades an unanswered question as zero marks without creating an answer row', async () => {
      const attempt = { id: 'attempt-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(tx.answer.update).not.toHaveBeenCalled();
      expect(tx.result.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', score: 0, maxScore: 5, percentage: 0, passFail: 'fail' },
      });
      expect(tx.attempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { status: 'submitted', submittedAt: expect.any(Date) },
      });
    });
  });
});
