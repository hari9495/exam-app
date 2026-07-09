import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';

describe('InternalController', () => {
  let controller: InternalController;
  let tenantPrisma: { forTenant: jest.Mock };
  let attemptSettlement: { finalize: jest.Mock; settleIfExpired: jest.Mock };
  let attemptAnalysis: { analyze: jest.Mock };
  let monitoringGateway: { emitMessageSent: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    attemptSettlement = { finalize: jest.fn(), settleIfExpired: jest.fn() };
    attemptAnalysis = { analyze: jest.fn() };
    monitoringGateway = { emitMessageSent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: attemptSettlement },
        { provide: AttemptAnalysisService, useValue: attemptAnalysis },
        { provide: MonitoringGateway, useValue: monitoringGateway },
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

  describe('settleIfExpired', () => {
    it('throws NotFoundException when the attempt does not exist', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(controller.settleIfExpired('attempt-1')).rejects.toThrow(NotFoundException);
      expect(attemptSettlement.settleIfExpired).not.toHaveBeenCalled();
    });

    it('delegates to AttemptSettlementService.settleIfExpired with the tx, exam, and attempt', async () => {
      const exam = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 40 };
      const attempt = { id: 'attempt-1', status: 'in_progress', invitation: { exam } };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      attemptSettlement.settleIfExpired.mockResolvedValue(attempt);

      await controller.settleIfExpired('attempt-1');

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
      expect(attemptSettlement.settleIfExpired).toHaveBeenCalledWith(tx, exam, attempt);
    });
  });

  describe('notifyMessageSent', () => {
    it('delegates to MonitoringGateway.emitMessageSent', async () => {
      const dto = { examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt: '2026-07-09T00:00:00.000Z' };

      await controller.notifyMessageSent(dto);

      expect(monitoringGateway.emitMessageSent).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1',
        candidateId: 'cand-1',
        sentAt: new Date('2026-07-09T00:00:00.000Z'),
      });
    });
  });
});
