import { Prisma } from '@prisma/client';
import { AttemptSettlementService } from './attempt-settlement.service';
import { AttemptStatusBroadcaster } from '../monitoring/attempt-status-broadcaster';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { AttemptInsightService } from '../attempt-insight/attempt-insight.service';
import { IntegrityAnalysisService } from '../integrity/integrity-analysis.service';

describe('AttemptSettlementService', () => {
  let service: AttemptSettlementService;
  let broadcaster: { emitAttemptStatus: jest.Mock; emitMessageSent: jest.Mock };
  let attemptAnalysis: { analyze: jest.Mock };
  let attemptInsight: { analyze: jest.Mock };
  let integrityAnalysis: { analyze: jest.Mock };
  const exam = { id: 'exam-1', organizationId: 'org-1', durationMinutes: 30, passCriteriaPercent: 50 };

  beforeEach(() => {
    broadcaster = { emitAttemptStatus: jest.fn().mockResolvedValue(undefined), emitMessageSent: jest.fn().mockResolvedValue(undefined) };
    attemptAnalysis = { analyze: jest.fn().mockResolvedValue(undefined) };
    attemptInsight = { analyze: jest.fn().mockResolvedValue(undefined) };
    integrityAnalysis = { analyze: jest.fn().mockResolvedValue(undefined) };
    service = new AttemptSettlementService(
      broadcaster as unknown as AttemptStatusBroadcaster,
      attemptAnalysis as unknown as AttemptAnalysisService,
      attemptInsight as unknown as AttemptInsightService,
      integrityAnalysis as unknown as IntegrityAnalysisService,
    );
  });

  describe('remainingSeconds', () => {
    it('returns a positive value before the exam duration has elapsed', () => {
      const startedAt = new Date(Date.now() - 5 * 60_000);
      const seconds = service.remainingSeconds(exam, { startedAt, pausedDurationMs: 0, pausedAt: null, status: 'in_progress' });
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(25 * 60);
    });

    it('returns zero (not negative) once the duration has elapsed', () => {
      const startedAt = new Date(Date.now() - 60 * 60_000);
      expect(service.remainingSeconds(exam, { startedAt, pausedDurationMs: 0, pausedAt: null, status: 'in_progress' })).toBe(0);
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

    it('triggers integrity analysis for the finalized attempt without awaiting it', async () => {
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

      expect(integrityAnalysis.analyze).toHaveBeenCalledWith('attempt-1');
    });

    it('triggers integrity analysis even when the attempt is pending_manual_grade (unlike insight, which is skipped)', async () => {
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1', 'q2']) };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] },
            { id: 'q2', type: 'code', marks: 10, negativeMarks: 0, options: [] },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']) },
            { id: 'answer-2', questionId: 'q2', selectedOptionIdsJson: JSON.stringify([]), answerText: 'print("hi")', marksAwarded: null },
          ]),
          update: jest.fn(),
          create: jest.fn(),
        },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'pending_manual_grade' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');
      await new Promise((resolve) => setImmediate(resolve));

      expect(integrityAnalysis.analyze).toHaveBeenCalledWith('attempt-1');
      expect(attemptInsight.analyze).not.toHaveBeenCalled();
    });

    it('does not let a rejected integrity analysis trigger propagate out of finalize', async () => {
      integrityAnalysis.analyze.mockRejectedValue(new Error('should never surface'));
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
      await new Promise((resolve) => setImmediate(resolve));
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

    it('sets Attempt.status to pending_manual_grade when the attempt contains a code question, leaving its marksAwarded null', async () => {
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1', 'q2']) };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }, { id: 'opt-b', isCorrect: false }] },
            { id: 'q2', type: 'code', marks: 10, negativeMarks: 0, options: [] },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']) },
            { id: 'answer-2', questionId: 'q2', selectedOptionIdsJson: JSON.stringify([]), answerText: 'print("hi")', marksAwarded: null },
          ]),
          update: jest.fn(),
        },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'pending_manual_grade' }) },
        auditLog: { create: jest.fn() },
      };

      const result = await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      // Only the MCQ answer was graded — the code answer's row was left untouched (still null marksAwarded).
      expect(tx.answer.update).toHaveBeenCalledTimes(1);
      expect(tx.answer.update).toHaveBeenCalledWith({ where: { id: 'answer-1' }, data: { isCorrect: true, marksAwarded: 5 } });
      expect(tx.result.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', score: 5, maxScore: 5, percentage: 100, passFail: null },
      });
      expect(tx.attempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { status: 'pending_manual_grade', submittedAt: expect.any(Date) },
      });
      expect(result.status).toBe('pending_manual_grade');
    });

    it('creates a blank Answer row for a code question the candidate never answered, so it surfaces in the grading queue', async () => {
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1', 'q2']) };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }, { id: 'opt-b', isCorrect: false }] },
            { id: 'q2', type: 'code', marks: 10, negativeMarks: 0, options: [] },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']) },
            // No answer row for q2 — the candidate never submitted anything for it.
          ]),
          update: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'answer-2', questionId: 'q2' }),
        },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'pending_manual_grade' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(tx.answer.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', questionId: 'q2', selectedOptionIdsJson: '[]', answerText: null },
      });
    });

    it('does not create an Answer row for a code question that already has one', async () => {
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q2']) };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([{ id: 'q2', type: 'code', marks: 10, negativeMarks: 0, options: [] }]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-2', questionId: 'q2', selectedOptionIdsJson: JSON.stringify([]), answerText: 'print("hi")', marksAwarded: null },
          ]),
          update: jest.fn(),
          create: jest.fn(),
        },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'pending_manual_grade' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(tx.answer.create).not.toHaveBeenCalled();
    });

    it('does not trigger insight generation when the attempt has code questions (data is incomplete until manual grading)', async () => {
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1', 'q2']) };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] },
            { id: 'q2', type: 'code', marks: 10, negativeMarks: 0, options: [] },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']) },
            { id: 'answer-2', questionId: 'q2', selectedOptionIdsJson: JSON.stringify([]), answerText: 'print("hi")', marksAwarded: null },
          ]),
          update: jest.fn(),
          create: jest.fn(),
        },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'pending_manual_grade' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(attemptInsight.analyze).not.toHaveBeenCalled();
    });

    it('settles normally (no pending_manual_grade) when the attempt has no code questions', async () => {
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      const result = await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(tx.result.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', score: 0, maxScore: 5, percentage: 0, passFail: 'fail' },
      });
      expect(tx.attempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { status: 'submitted', submittedAt: expect.any(Date) },
      });
      expect(result.status).toBe('submitted');
    });
  });

  describe('finalizeManualGrade', () => {
    it('throws when a code question still has no marksAwarded', async () => {
      const attempt = { id: 'attempt-1', status: 'pending_manual_grade', questionOrderJson: JSON.stringify(['q1', 'q2']) };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'single_mcq', marks: 5 },
            { id: 'q2', type: 'code', marks: 10 },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', marksAwarded: 5 },
            { id: 'answer-2', questionId: 'q2', marksAwarded: null },
          ]),
        },
        result: { update: jest.fn() },
        attempt: { update: jest.fn() },
        auditLog: { create: jest.fn() },
      };

      await expect(
        service.finalizeManualGrade(tx as unknown as Prisma.TransactionClient, exam, attempt as any),
      ).rejects.toThrow(/still need grading/);
      expect(tx.result.update).not.toHaveBeenCalled();
      expect(tx.attempt.update).not.toHaveBeenCalled();
    });

    it('recomputes the Result and settles the attempt once every code question is graded', async () => {
      const attempt = {
        id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', status: 'pending_manual_grade',
        questionOrderJson: JSON.stringify(['q1', 'q2']),
      };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'single_mcq', marks: 5 },
            { id: 'q2', type: 'code', marks: 10 },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', marksAwarded: 5 },
            { id: 'answer-2', questionId: 'q2', marksAwarded: 8 },
          ]),
        },
        result: { update: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      const finalized = await service.finalizeManualGrade(tx as unknown as Prisma.TransactionClient, exam, attempt as any);

      expect(finalized.status).toBe('submitted');
      expect(tx.result.update).toHaveBeenCalledWith({
        where: { attemptId: 'attempt-1' },
        data: { score: 13, maxScore: 15, percentage: expect.closeTo((13 / 15) * 100, 5), passFail: 'pass' },
      });
      expect(tx.attempt.update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: { status: 'submitted' } });
    });

    it('still rejects finalization when the code question only has the blank Answer row finalize() created for it (no marks entered yet)', async () => {
      const attempt = {
        id: 'attempt-1', status: 'pending_manual_grade', questionOrderJson: JSON.stringify(['q1', 'q2']),
      };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'single_mcq', marks: 5 },
            { id: 'q2', type: 'code', marks: 10 },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', marksAwarded: 5 },
            // The blank Answer row finalize() creates for an unanswered code question — no marks yet.
            { id: 'answer-2', questionId: 'q2', selectedOptionIdsJson: '[]', answerText: null, marksAwarded: null },
          ]),
        },
        result: { update: jest.fn() },
        attempt: { update: jest.fn() },
        auditLog: { create: jest.fn() },
      };

      await expect(
        service.finalizeManualGrade(tx as unknown as Prisma.TransactionClient, exam, attempt as any),
      ).rejects.toThrow(/still need grading/);
      expect(tx.result.update).not.toHaveBeenCalled();
      expect(tx.attempt.update).not.toHaveBeenCalled();
    });

    it('succeeds once the recruiter explicitly grades the blank submission as zero', async () => {
      const attempt = {
        id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', status: 'pending_manual_grade',
        questionOrderJson: JSON.stringify(['q1', 'q2']),
      };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'single_mcq', marks: 5 },
            { id: 'q2', type: 'code', marks: 10 },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', marksAwarded: 5 },
            { id: 'answer-2', questionId: 'q2', selectedOptionIdsJson: '[]', answerText: null, marksAwarded: 0 },
          ]),
        },
        result: { update: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      const finalized = await service.finalizeManualGrade(tx as unknown as Prisma.TransactionClient, exam, attempt as any);

      expect(finalized.status).toBe('submitted');
      expect(tx.result.update).toHaveBeenCalledWith({
        where: { attemptId: 'attempt-1' },
        data: { score: 5, maxScore: 15, percentage: expect.closeTo((5 / 15) * 100, 5), passFail: 'fail' },
      });
    });

    it('triggers insight generation once the final grade is known', async () => {
      const attempt = {
        id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', status: 'pending_manual_grade',
        questionOrderJson: JSON.stringify(['q1', 'q2']),
      };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'single_mcq', marks: 5 },
            { id: 'q2', type: 'code', marks: 10 },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', marksAwarded: 5 },
            { id: 'answer-2', questionId: 'q2', marksAwarded: 8 },
          ]),
        },
        result: { update: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalizeManualGrade(tx as unknown as Prisma.TransactionClient, exam, attempt as any);
      await new Promise((resolve) => setImmediate(resolve));

      expect(attemptInsight.analyze).toHaveBeenCalledWith('attempt-1');
    });

    it('re-runs integrity analysis once the final grade is known, so no_iteration can be evaluated with real marksAwarded', async () => {
      const attempt = {
        id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', status: 'pending_manual_grade',
        questionOrderJson: JSON.stringify(['q1', 'q2']),
      };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'single_mcq', marks: 5 },
            { id: 'q2', type: 'code', marks: 10 },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', marksAwarded: 5 },
            { id: 'answer-2', questionId: 'q2', marksAwarded: 8 },
          ]),
        },
        result: { update: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      };

      await service.finalizeManualGrade(tx as unknown as Prisma.TransactionClient, exam, attempt as any);
      await new Promise((resolve) => setImmediate(resolve));

      expect(integrityAnalysis.analyze).toHaveBeenCalledWith('attempt-1');
    });
  });

  describe('registerWebcamViolation', () => {
    it('pauses the attempt and logs a medium-severity event on strike 1', async () => {
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', webcamViolationCount: 0 } as any;
      const tx = {
        proctoringEvent: { create: jest.fn().mockResolvedValue({}) },
        attempt: { update: jest.fn().mockResolvedValue({ ...attempt, status: 'paused', webcamViolationCount: 1 }) },
      } as any;

      const { attempt: updated, strike } = await service.registerWebcamViolation(tx, attempt, 'no_face', 'data:image/jpeg;base64,abc');

      expect(strike).toBe(1);
      expect(updated.status).toBe('paused');
      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', eventType: 'webcam_no_face', severity: 'medium', metadataJson: JSON.stringify({ snapshot: 'data:image/jpeg;base64,abc', strike: 1 }) },
      });
      expect(tx.attempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { webcamViolationCount: 1, status: 'paused', pausedAt: expect.any(Date) },
      });
    });

    it('blocks the attempt with high severity on strike 3', async () => {
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', webcamViolationCount: 2 } as any;
      const tx = {
        proctoringEvent: { create: jest.fn().mockResolvedValue({}) },
        attempt: { update: jest.fn().mockResolvedValue({ ...attempt, status: 'blocked', webcamViolationCount: 3 }) },
      } as any;

      const { attempt: updated, strike } = await service.registerWebcamViolation(tx, attempt, 'head_turned', 'snap');

      expect(strike).toBe(3);
      expect(updated.status).toBe('blocked');
      expect(tx.proctoringEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'webcam_head_turned', severity: 'high' }) }));
      expect(tx.attempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'blocked' }) }));
    });
  });

  describe('resumeFromPause', () => {
    it('accumulates the elapsed pause time into pausedDurationMs and clears pausedAt', async () => {
      const pausedAt = new Date(Date.now() - 10_000); // paused 10s ago
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', pausedAt, pausedDurationMs: 5_000 } as any;
      const tx = { attempt: { update: jest.fn().mockResolvedValue({ ...attempt, status: 'in_progress', pausedAt: null, pausedDurationMs: 15_000 }) } } as any;

      const updated = await service.resumeFromPause(tx, attempt);

      expect(updated.status).toBe('in_progress');
      const call = tx.attempt.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'attempt-1' });
      expect(call.data.status).toBe('in_progress');
      expect(call.data.pausedAt).toBeNull();
      expect(call.data.pausedDurationMs).toBeGreaterThanOrEqual(5_000 + 9_000); // >= previous 5s + ~10s just elapsed, with slack
    });
  });
});
