import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { AttemptInsightService } from '../attempt-insight/attempt-insight.service';
import { CodeReviewService } from '../code-review/code-review.service';
import { PistonRuntimesService } from '../code-execution/piston-runtimes.service';
import { ATTEMPT_STATUS_BROADCASTER } from '../monitoring/attempt-status-broadcaster';

describe('InternalController', () => {
  let controller: InternalController;
  let tenantPrisma: { forTenant: jest.Mock };
  let attemptSettlement: { finalize: jest.Mock; settleIfExpired: jest.Mock; finalizeManualGrade: jest.Mock; resumeFromPause: jest.Mock };
  let attemptAnalysis: { analyze: jest.Mock };
  let attemptInsight: { analyze: jest.Mock };
  let codeReviewService: { analyze: jest.Mock };
  let pistonRuntimes: { getAvailableLanguages: jest.Mock };
  let broadcaster: { emitMessageSent: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    attemptSettlement = { finalize: jest.fn(), settleIfExpired: jest.fn(), finalizeManualGrade: jest.fn(), resumeFromPause: jest.fn() };
    attemptAnalysis = { analyze: jest.fn() };
    attemptInsight = { analyze: jest.fn() };
    codeReviewService = { analyze: jest.fn() };
    pistonRuntimes = { getAvailableLanguages: jest.fn() };
    broadcaster = { emitMessageSent: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: attemptSettlement },
        { provide: AttemptAnalysisService, useValue: attemptAnalysis },
        { provide: AttemptInsightService, useValue: attemptInsight },
        { provide: CodeReviewService, useValue: codeReviewService },
        { provide: PistonRuntimesService, useValue: pistonRuntimes },
        { provide: ATTEMPT_STATUS_BROADCASTER, useValue: broadcaster },
      ],
    }).compile();
    controller = moduleRef.get(InternalController);
  });

  describe('forceSubmit', () => {
    it('throws NotFoundException when the attempt does not exist', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(controller.forceSubmit('attempt-1')).rejects.toThrow(NotFoundException);
      expect(attemptSettlement.finalize).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the attempt is not in_progress', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted', invitation: { exam: {} } }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(controller.forceSubmit('attempt-1')).rejects.toThrow(BadRequestException);
      expect(attemptSettlement.finalize).not.toHaveBeenCalled();
    });

    it('finalizes an in_progress attempt and returns its new status', async () => {
      const exam = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 40 };
      const attempt = { id: 'attempt-1', status: 'in_progress', invitation: { exam } };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      attemptSettlement.finalize.mockResolvedValue({ status: 'force_submitted' });

      const result = await controller.forceSubmit('attempt-1');

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
      expect(attemptSettlement.finalize).toHaveBeenCalledWith(tx, exam, attempt, 'force_submitted');
      expect(result).toEqual({ status: 'force_submitted' });
    });
  });

  describe('unblock', () => {
    it('throws BadRequestException when the attempt is not blocked', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) } }));

      await expect(controller.unblock('attempt-1')).rejects.toThrow(BadRequestException);
    });

    it('resumes a blocked attempt via AttemptSettlementService.resumeFromPause', async () => {
      const attempt = { id: 'attempt-1', status: 'blocked' };
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn({ attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } }));
      attemptSettlement.resumeFromPause = jest.fn().mockResolvedValue({ ...attempt, status: 'in_progress' });

      const result = await controller.unblock('attempt-1');

      expect(result).toEqual({ status: 'in_progress' });
    });

    it('asks for the violation counters to be reset, so the next event does not immediately re-block', async () => {
      const attempt = { id: 'a1', status: 'blocked' };
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn({ attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } }));
      attemptSettlement.resumeFromPause.mockResolvedValue({ ...attempt, status: 'in_progress' });

      await controller.unblock('a1');

      expect(attemptSettlement.resumeFromPause).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'a1' }),
        { resetViolationCounters: true },
      );
    });
  });

  describe('gradeCodeAnswer', () => {
    it('grades a code answer and caps marksAwarded at the question marks', async () => {
      const answer = { id: 'answer-1', attemptId: 'attempt-1', questionId: 'question-1', question: { type: 'code', marks: 10 } };
      const tx = {
        answer: {
          findFirst: jest.fn().mockResolvedValue(answer),
          update: jest.fn().mockResolvedValue({ id: 'answer-1', marksAwarded: 8, gradingFeedback: 'Good approach' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await controller.gradeCodeAnswer('attempt-1', 'question-1', { marksAwarded: 8, feedback: 'Good approach' });

      expect(tx.answer.findFirst).toHaveBeenCalledWith({
        where: { attemptId: 'attempt-1', questionId: 'question-1' },
        include: { question: true },
      });
      expect(tx.answer.update).toHaveBeenCalledWith({
        where: { id: 'answer-1' },
        data: { marksAwarded: 8, gradingFeedback: 'Good approach' },
      });
      expect(result).toEqual({ questionId: 'question-1', marksAwarded: 8, gradingFeedback: 'Good approach' });
    });

    it('rejects grading a code answer with marksAwarded exceeding the question marks', async () => {
      const answer = { id: 'answer-1', attemptId: 'attempt-1', questionId: 'question-1', question: { type: 'code', marks: 10 } };
      const tx = { answer: { findFirst: jest.fn().mockResolvedValue(answer), update: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(controller.gradeCodeAnswer('attempt-1', 'question-1', { marksAwarded: 15 })).rejects.toThrow(BadRequestException);
      expect(tx.answer.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when no answer exists for the attempt/question', async () => {
      const tx = { answer: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(controller.gradeCodeAnswer('attempt-1', 'question-1', { marksAwarded: 5 })).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the question is not a code question', async () => {
      const answer = { id: 'answer-1', attemptId: 'attempt-1', questionId: 'question-1', question: { type: 'single_mcq', marks: 10 } };
      const tx = { answer: { findFirst: jest.fn().mockResolvedValue(answer), update: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(controller.gradeCodeAnswer('attempt-1', 'question-1', { marksAwarded: 5 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('finalizeManualGrade', () => {
    it('finalizes manual grading via AttemptSettlementService.finalizeManualGrade', async () => {
      const exam = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 40 };
      const attempt = { id: 'attempt-1', status: 'pending_manual_grade', invitation: { exam } };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      attemptSettlement.finalizeManualGrade.mockResolvedValue({ status: 'submitted' });

      const result = await controller.finalizeManualGrade('attempt-1');

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
      expect(attemptSettlement.finalizeManualGrade).toHaveBeenCalledWith(tx, exam, attempt);
      expect(result).toEqual({ status: 'submitted' });
    });

    it('throws NotFoundException when the attempt does not exist', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(controller.finalizeManualGrade('attempt-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reanalyze', () => {
    it('delegates to AttemptAnalysisService.analyze', async () => {
      await controller.reanalyze('attempt-1');

      expect(attemptAnalysis.analyze).toHaveBeenCalledWith('attempt-1');
    });
  });

  describe('regenerateInsight', () => {
    it('delegates to AttemptInsightService.analyze', async () => {
      await controller.regenerateInsight('attempt-1');

      expect(attemptInsight.analyze).toHaveBeenCalledWith('attempt-1');
    });
  });

  describe('generateCodeReview', () => {
    it('delegates to CodeReviewService.analyze', async () => {
      await controller.generateCodeReview('answer-1');

      expect(codeReviewService.analyze).toHaveBeenCalledWith('answer-1');
    });
  });

  describe('settleIfExpiredBatch', () => {
    it('settles every attempt found for the given ids, applying each invitation\'s extra-time accommodation', async () => {
      const exam1 = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 40 };
      const attempt1 = { id: 'attempt-1', status: 'in_progress', invitation: { exam: exam1, extraTimePercent: 0 } };
      const attempt2 = { id: 'attempt-2', status: 'in_progress', invitation: { exam: exam1, extraTimePercent: 50 } };
      const tx = { attempt: { findMany: jest.fn().mockResolvedValue([attempt1, attempt2]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await controller.settleIfExpiredBatch({ attemptIds: ['attempt-1', 'attempt-2'] });

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
      expect(tx.attempt.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['attempt-1', 'attempt-2'] } },
        include: { invitation: { include: { exam: true } } },
      });
      expect(attemptSettlement.settleIfExpired).toHaveBeenCalledTimes(2);
      expect(attemptSettlement.settleIfExpired).toHaveBeenNthCalledWith(1, tx, { ...exam1, durationMinutes: 30 }, attempt1);
      expect(attemptSettlement.settleIfExpired).toHaveBeenNthCalledWith(2, tx, { ...exam1, durationMinutes: 45 }, attempt2);
    });

    it('settles nothing when no matching attempts are found', async () => {
      const tx = { attempt: { findMany: jest.fn().mockResolvedValue([]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await controller.settleIfExpiredBatch({ attemptIds: ['missing-1'] });

      expect(attemptSettlement.settleIfExpired).not.toHaveBeenCalled();
    });
  });

  describe('listCodeLanguages', () => {
    it('lists available code-execution languages from PistonRuntimesService', async () => {
      pistonRuntimes.getAvailableLanguages.mockResolvedValue([{ language: 'python', version: '3.10.0' }]);

      const result = await controller.listCodeLanguages();

      expect(result).toEqual({ languages: [{ language: 'python', version: '3.10.0' }] });
    });
  });

  describe('notifyMessageSent', () => {
    it('delegates to the broadcaster', async () => {
      const dto = { examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt: '2026-07-09T00:00:00.000Z' };

      await controller.notifyMessageSent(dto);

      expect(broadcaster.emitMessageSent).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1',
        candidateId: 'cand-1',
        sentAt: new Date('2026-07-09T00:00:00.000Z'),
      });
    });

    it('does not let a rejected broadcast propagate — the message is already persisted by the caller', async () => {
      broadcaster.emitMessageSent.mockRejectedValue(new Error('relay unreachable, should never surface'));
      const dto = { examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt: '2026-07-09T00:00:00.000Z' };

      await expect(controller.notifyMessageSent(dto)).resolves.toBeUndefined();
    });
  });
});
