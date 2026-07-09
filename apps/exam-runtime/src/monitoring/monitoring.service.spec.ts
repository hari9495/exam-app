import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('MonitoringService', () => {
  let service: MonitoringService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const exam = { id: 'exam-1', organizationId: 'org-1', durationMinutes: 60, passCriteriaPercent: 40 };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [MonitoringService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(MonitoringService);
  });

  describe('isOnline', () => {
    it('returns true when lastSeenAt is within the last 30 seconds', () => {
      expect(service.isOnline(new Date(Date.now() - 5_000))).toBe(true);
    });

    it('returns false when lastSeenAt is older than 30 seconds', () => {
      expect(service.isOnline(new Date(Date.now() - 45_000))).toBe(false);
    });

    it('returns false when lastSeenAt is null', () => {
      expect(service.isOnline(null)).toBe(false);
    });
  });

  describe('getRosterSnapshot', () => {
    it('throws NotFoundException when the exam does not belong to the caller organization', async () => {
      const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getRosterSnapshot(context, 'exam-1')).rejects.toThrow(NotFoundException);
    });

    it('returns one row per invitation, with nulls for a candidate who has not started', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt: null },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getRosterSnapshot(context, 'exam-1');

      expect(result).toEqual([
        {
          candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: null,
          status: 'invited', online: false, remainingSeconds: null, answeredCount: null, totalQuestions: null,
        },
      ]);
    });

    it('returns full progress/presence/remaining-time data for an in-progress attempt', async () => {
      const recentLastSeen = new Date(Date.now() - 5_000);
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(Date.now() - 5 * 60_000),
        lastSeenAt: recentLastSeen, questionOrderJson: JSON.stringify(['q1', 'q2', 'q3']),
      };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt },
          ]),
        },
        answer: { count: jest.fn().mockResolvedValue(2) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getRosterSnapshot(context, 'exam-1');

      expect(result[0]).toEqual({
        candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'attempt-1',
        status: 'in_progress', online: true, remainingSeconds: expect.any(Number), answeredCount: 2, totalQuestions: 3,
      });
    });

    it('reports offline and no remainingSeconds for a submitted attempt', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(Date.now() - 65 * 60_000),
        lastSeenAt: new Date(Date.now() - 60 * 60_000), questionOrderJson: JSON.stringify(['q1']),
      };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt },
          ]),
        },
        answer: { count: jest.fn().mockResolvedValue(1) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getRosterSnapshot(context, 'exam-1');

      expect(result[0].online).toBe(false);
      expect(result[0].remainingSeconds).toBeNull();
    });
  });
});
