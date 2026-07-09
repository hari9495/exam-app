import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { ATTEMPT_STATUS_BROADCASTER } from '../monitoring/attempt-status-broadcaster';

describe('InternalController', () => {
  let controller: InternalController;
  let tenantPrisma: { forTenant: jest.Mock };
  let attemptSettlement: { finalize: jest.Mock; settleIfExpired: jest.Mock };
  let attemptAnalysis: { analyze: jest.Mock };
  let broadcaster: { emitMessageSent: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    attemptSettlement = { finalize: jest.fn(), settleIfExpired: jest.fn() };
    attemptAnalysis = { analyze: jest.fn() };
    broadcaster = { emitMessageSent: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: attemptSettlement },
        { provide: AttemptAnalysisService, useValue: attemptAnalysis },
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

  describe('reanalyze', () => {
    it('delegates to AttemptAnalysisService.analyze', async () => {
      await controller.reanalyze('attempt-1');

      expect(attemptAnalysis.analyze).toHaveBeenCalledWith('attempt-1');
    });
  });

  describe('settleIfExpiredBatch', () => {
    it('settles every attempt found for the given ids', async () => {
      const exam1 = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 40 };
      const attempt1 = { id: 'attempt-1', status: 'in_progress', invitation: { exam: exam1 } };
      const attempt2 = { id: 'attempt-2', status: 'in_progress', invitation: { exam: exam1 } };
      const tx = { attempt: { findMany: jest.fn().mockResolvedValue([attempt1, attempt2]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await controller.settleIfExpiredBatch({ attemptIds: ['attempt-1', 'attempt-2'] });

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
      expect(tx.attempt.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['attempt-1', 'attempt-2'] } },
        include: { invitation: { include: { exam: true } } },
      });
      expect(attemptSettlement.settleIfExpired).toHaveBeenCalledTimes(2);
      expect(attemptSettlement.settleIfExpired).toHaveBeenNthCalledWith(1, tx, exam1, attempt1);
      expect(attemptSettlement.settleIfExpired).toHaveBeenNthCalledWith(2, tx, exam1, attempt2);
    });

    it('settles nothing when no matching attempts are found', async () => {
      const tx = { attempt: { findMany: jest.fn().mockResolvedValue([]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await controller.settleIfExpiredBatch({ attemptIds: ['missing-1'] });

      expect(attemptSettlement.settleIfExpired).not.toHaveBeenCalled();
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
