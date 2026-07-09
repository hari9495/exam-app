import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttemptsAdminService } from './attempts-admin.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AuditService } from '@exam-platform/shared';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';

describe('AttemptsAdminService', () => {
  let service: AttemptsAdminService;
  let tenantPrisma: { forTenant: jest.Mock };
  let attemptSettlement: { finalize: jest.Mock };
  let audit: { record: jest.Mock };
  let monitoringGateway: { emitAttemptStatus: jest.Mock; emitMessageSent: jest.Mock };
  let attemptAnalysisService: { analyze: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    attemptSettlement = { finalize: jest.fn() };
    audit = { record: jest.fn() };
    monitoringGateway = { emitAttemptStatus: jest.fn(), emitMessageSent: jest.fn() };
    attemptAnalysisService = { analyze: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptsAdminService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: attemptSettlement },
        { provide: AuditService, useValue: audit },
        { provide: MonitoringGateway, useValue: monitoringGateway },
        { provide: AttemptAnalysisService, useValue: attemptAnalysisService },
      ],
    }).compile();
    service = moduleRef.get(AttemptsAdminService);
  });

  describe('listProctoringEvents', () => {
    it('returns proctoring events for an attempt owned by the caller organization', async () => {
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue([{ id: 'evt-1' }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listProctoringEvents(context, 'attempt-1');

      expect(result).toEqual([{ id: 'evt-1' }]);
      expect(tx.attempt.findFirst).toHaveBeenCalledWith({
        where: { id: 'attempt-1', invitation: { exam: { organizationId: 'org-1' } } },
      });
      expect(tx.proctoringEvent.findMany).toHaveBeenCalledWith({
        where: { attemptId: 'attempt-1' },
        orderBy: { occurredAt: 'asc' },
      });
    });

    it('throws NotFoundException when the attempt does not belong to the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.listProctoringEvents(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('forceSubmit', () => {
    const exam = { id: 'exam-1', durationMinutes: 60, passCriteriaPercent: 40 };
    const attempt = { id: 'attempt-1', candidateId: 'cand-1', status: 'in_progress', invitation: { exam } };

    it('finalizes an in-progress attempt as force_submitted and writes an audit log', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(attempt) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      attemptSettlement.finalize.mockResolvedValue({
        id: 'attempt-1',
        candidateId: 'cand-1',
        examId: 'exam-1',
        status: 'force_submitted',
      });

      const result = await service.forceSubmit(context, 'attempt-1', 'user-1');

      expect(result).toEqual({ status: 'force_submitted' });
      expect(attemptSettlement.finalize).toHaveBeenCalledWith(tx, exam, attempt, 'force_submitted');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'attempt.force_submit',
        entityType: 'attempt',
        entityId: 'attempt-1',
      });
    });

    it('throws BadRequestException when the attempt is not in_progress', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue({ ...attempt, status: 'submitted' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.forceSubmit(context, 'attempt-1', 'user-1')).rejects.toThrow(BadRequestException);
      expect(attemptSettlement.finalize).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the attempt does not belong to the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.forceSubmit(context, 'attempt-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendMessage', () => {
    it('creates a message and emits message:sent', async () => {
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1' }) },
        candidateMessage: { create: jest.fn().mockResolvedValue({ id: 'msg-1', sentAt: new Date('2026-07-09T00:00:00Z') }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.sendMessage(context, 'attempt-1', 'user-1', 'Please stay on the exam tab');

      expect(result).toEqual({ id: 'msg-1', sentAt: new Date('2026-07-09T00:00:00Z') });
      expect(tx.candidateMessage.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', sentByUserId: 'user-1', body: 'Please stay on the exam tab' },
      });
      expect(monitoringGateway.emitMessageSent).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1', candidateId: 'cand-1', sentAt: new Date('2026-07-09T00:00:00Z'),
      });
    });

    it('throws NotFoundException when the attempt does not belong to the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.sendMessage(context, 'attempt-1', 'user-1', 'hello')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listMessages', () => {
    it('returns the message history for an attempt owned by the caller organization', async () => {
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([{ id: 'msg-1' }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listMessages(context, 'attempt-1');

      expect(result).toEqual([{ id: 'msg-1' }]);
      expect(tx.candidateMessage.findMany).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1' }, orderBy: { sentAt: 'asc' } });
    });

    it('throws NotFoundException when the attempt does not belong to the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.listMessages(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reanalyze', () => {
    it('re-invokes analysis and returns the fresh row', async () => {
      const ownershipTx = { attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } };
      const fetchTx = {
        proctoringAnalysis: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'analysis-1', attemptId: 'attempt-1', status: 'completed', riskLevel: 'low', summary: 'ok' }),
        },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce((_ctx, fn) => fn(ownershipTx))
        .mockImplementationOnce((_ctx, fn) => fn(fetchTx));

      const result = await service.reanalyze(context, 'attempt-1');

      expect(attemptAnalysisService.analyze).toHaveBeenCalledWith('attempt-1');
      expect(fetchTx.proctoringAnalysis.findUniqueOrThrow).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1' } });
      expect(result).toEqual({ id: 'analysis-1', attemptId: 'attempt-1', status: 'completed', riskLevel: 'low', summary: 'ok' });
    });

    it('throws NotFoundException when the attempt does not belong to the caller organization, without triggering analysis', async () => {
      const ownershipTx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(ownershipTx));

      await expect(service.reanalyze(context, 'attempt-1')).rejects.toThrow(NotFoundException);
      expect(attemptAnalysisService.analyze).not.toHaveBeenCalled();
    });
  });
});
