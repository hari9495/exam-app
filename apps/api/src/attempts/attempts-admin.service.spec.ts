import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttemptsAdminService } from './attempts-admin.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AuditService } from '../audit/audit.service';

describe('AttemptsAdminService', () => {
  let service: AttemptsAdminService;
  let tenantPrisma: { forTenant: jest.Mock };
  let attemptSettlement: { finalize: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    attemptSettlement = { finalize: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptsAdminService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: attemptSettlement },
        { provide: AuditService, useValue: audit },
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
    const attempt = { id: 'attempt-1', status: 'in_progress', invitation: { exam } };

    it('finalizes an in-progress attempt as force_submitted and writes an audit log', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(attempt) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      attemptSettlement.finalize.mockResolvedValue({ id: 'attempt-1', status: 'force_submitted' });

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
});
