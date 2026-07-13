import { Prisma } from '@prisma/client';
import { AttemptSettlementService } from './attempt-settlement.service';
import { AttemptStatusBroadcaster } from '../monitoring/attempt-status-broadcaster';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { AttemptInsightService } from '../attempt-insight/attempt-insight.service';

describe('AttemptSettlementService', () => {
  let service: AttemptSettlementService;
  let broadcaster: { emitAttemptStatus: jest.Mock; emitMessageSent: jest.Mock };
  let attemptAnalysis: { analyze: jest.Mock };
  let attemptInsight: { analyze: jest.Mock };
  const exam = { id: 'exam-1', organizationId: 'org-1', durationMinutes: 30, passCriteriaPercent: 50 };

  beforeEach(() => {
    broadcaster = { emitAttemptStatus: jest.fn().mockResolvedValue(undefined), emitMessageSent: jest.fn().mockResolvedValue(undefined) };
    attemptAnalysis = { analyze: jest.fn().mockResolvedValue(undefined) };
    attemptInsight = { analyze: jest.fn().mockResolvedValue(undefined) };
    service = new AttemptSettlementService(
      broadcaster as unknown as AttemptStatusBroadcaster,
      attemptAnalysis as unknown as AttemptAnalysisService,
      attemptInsight as unknown as AttemptInsightService,
    );
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
            { id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }, { id: 'opt-b', isCorrect: false }] },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']) },
          ]),
          update: jest.fn(),
        },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'auto_submitted' }) },
        auditLog: { create: jest.fn() },
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
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
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

    it('writes an atomic attempt.settled audit entry alongside the grading transaction', async () => {
      const attempt = { id: 'attempt-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorUserId: null,
          action: 'attempt.settled',
          entityType: 'attempt',
          entityId: 'attempt-1',
          metadataJson: JSON.stringify({ status: 'submitted', score: 0, maxScore: 5, percentage: 0, passFail: 'fail' }),
        },
      });
    });

    it('deducts negativeMarks for a wrong selected answer through the full settlement path', async () => {
      const attempt = { id: 'attempt-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', marks: 5, negativeMarks: 2, options: [{ id: 'opt-a', isCorrect: true }, { id: 'opt-b', isCorrect: false }] },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-b']) },
          ]),
          update: jest.fn(),
        },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(tx.answer.update).toHaveBeenCalledWith({ where: { id: 'answer-1' }, data: { isCorrect: false, marksAwarded: -2 } });
      expect(tx.result.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', score: 0, maxScore: 5, percentage: 0, passFail: 'fail' },
      });
    });

    it('emits attempt:status to the monitoring gateway after finalizing', async () => {
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(broadcaster.emitAttemptStatus).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1', candidateId: 'cand-1', status: 'submitted',
      });
    });

    it('is idempotent against a concurrent settlement race: skips grading/create if a Result already exists', async () => {
      const attempt = { id: 'attempt-1', questionOrderJson: JSON.stringify(['q1']) };
      const alreadyFinalized = { id: 'attempt-1', status: 'auto_submitted' };
      const tx = {
        question: { findMany: jest.fn() },
        answer: { findMany: jest.fn(), update: jest.fn() },
        result: {
          findUnique: jest.fn().mockResolvedValue({ id: 'result-1', attemptId: 'attempt-1' }),
          create: jest.fn(),
        },
        attempt: {
          update: jest.fn(),
          findUniqueOrThrow: jest.fn().mockResolvedValue(alreadyFinalized),
        },
      };

      const result = await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(tx.result.findUnique).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1' } });
      expect(tx.question.findMany).not.toHaveBeenCalled();
      expect(tx.result.create).not.toHaveBeenCalled();
      expect(tx.attempt.update).not.toHaveBeenCalled();
      expect(tx.attempt.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'attempt-1' } });
      expect(result).toBe(alreadyFinalized);
    });

    it('triggers proctoring analysis for the finalized attempt without awaiting it', async () => {
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(attemptAnalysis.analyze).toHaveBeenCalledWith('attempt-1');
    });

    it('does not let a rejected analysis trigger propagate out of finalize', async () => {
      attemptAnalysis.analyze.mockRejectedValue(new Error('should never surface'));
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      await expect(
        service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted'),
      ).resolves.toBeDefined();
    });

    it('triggers insight generation only after proctoring analysis completes, not concurrently with it', async () => {
      let resolveProctoringAnalysis: () => void;
      const proctoringAnalysisPromise = new Promise<void>((resolve) => {
        resolveProctoringAnalysis = resolve;
      });
      attemptAnalysis.analyze.mockReturnValue(proctoringAnalysisPromise);
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');
      await new Promise((resolve) => setImmediate(resolve));

      // Proctoring analysis is still pending — insight generation must not have started yet.
      expect(attemptInsight.analyze).not.toHaveBeenCalled();

      resolveProctoringAnalysis!();
      await new Promise((resolve) => setImmediate(resolve));

      // Now that proctoring analysis has resolved, insight generation should have started.
      expect(attemptInsight.analyze).toHaveBeenCalledWith('attempt-1');
    });

    it('still triggers insight generation even when proctoring analysis rejects', async () => {
      attemptAnalysis.analyze.mockRejectedValue(new Error('proctoring analysis unavailable'));
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');
      await new Promise((resolve) => setImmediate(resolve));

      expect(attemptInsight.analyze).toHaveBeenCalledWith('attempt-1');
    });

    it('does not let a rejected insight generation trigger propagate out of finalize', async () => {
      attemptInsight.analyze.mockRejectedValue(new Error('should never surface'));
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      await expect(
        service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted'),
      ).resolves.toBeDefined();
    });

    it('does not let a rejected broadcast propagate out of finalize', async () => {
      broadcaster.emitAttemptStatus.mockRejectedValue(new Error('relay unreachable, should never surface'));
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      await expect(
        service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted'),
      ).resolves.toBeDefined();
    });
  });
});
