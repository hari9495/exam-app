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
          status: 'invited', online: false, remainingSeconds: null, answeredCount: null, totalQuestions: null, proctoringBypassed: false,
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
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, extraTimePercent: 0, attempt },
          ]),
        },
        answer: { groupBy: jest.fn().mockResolvedValue([{ attemptId: 'attempt-1', _count: { _all: 2 } }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getRosterSnapshot(context, 'exam-1');

      expect(result[0]).toEqual({
        candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'attempt-1',
        status: 'in_progress', online: true, remainingSeconds: expect.any(Number), answeredCount: 2, totalQuestions: 3, proctoringBypassed: false,
      });
    });

    it('applies the invitation\'s extra-time accommodation to remainingSeconds for an in-progress attempt', async () => {
      const startedAt = new Date(Date.now() - 60 * 60_000);
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, extraTimePercent: 50,
              attempt: { id: 'attempt-1', status: 'in_progress', startedAt, lastSeenAt: new Date(), questionOrderJson: '["q1"]' },
            },
          ]),
        },
        answer: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const [row] = await service.getRosterSnapshot(context, 'exam-1');

      // exam.durationMinutes is 60; +50% = 90 effective minutes, 60 elapsed -> ~30 min (1800s) left.
      expect(row.remainingSeconds).toBeGreaterThan(1750);
      expect(row.remainingSeconds).toBeLessThanOrEqual(1800);
    });

    it('freezes remainingSeconds at pausedAt for a paused attempt instead of returning null', async () => {
      const startedAt = new Date(Date.now() - 40 * 60_000);
      const pausedAt = new Date(Date.now() - 10 * 60_000);
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, extraTimePercent: 0,
              attempt: {
                id: 'attempt-1', status: 'paused', startedAt, pausedAt, pausedDurationMs: 0,
                lastSeenAt: new Date(), questionOrderJson: '["q1"]',
              },
            },
          ]),
        },
        answer: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const [row] = await service.getRosterSnapshot(context, 'exam-1');

      // 60-minute exam, 30 minutes elapsed by the time it was paused 10 minutes ago ->
      // 30 minutes (1800s) frozen, not the null the recruiter used to see.
      expect(row.remainingSeconds).toBe(1800);
    });

    it('freezes remainingSeconds at pausedAt for a blocked attempt, same as paused', async () => {
      const startedAt = new Date(Date.now() - 40 * 60_000);
      const pausedAt = new Date(Date.now() - 10 * 60_000);
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, extraTimePercent: 0,
              attempt: {
                id: 'attempt-1', status: 'blocked', startedAt, pausedAt, pausedDurationMs: 0,
                lastSeenAt: new Date(), questionOrderJson: '["q1"]',
              },
            },
          ]),
        },
        answer: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const [row] = await service.getRosterSnapshot(context, 'exam-1');

      expect(row.remainingSeconds).toBe(1800);
    });

    it('includes grace already banked from an earlier pause-resume cycle for a resumed in-progress attempt', async () => {
      const startedAt = new Date(Date.now() - 50 * 60_000);
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, extraTimePercent: 0,
              attempt: {
                id: 'attempt-1', status: 'in_progress', startedAt, pausedAt: null, pausedDurationMs: 10 * 60_000,
                lastSeenAt: new Date(), questionOrderJson: '["q1"]',
              },
            },
          ]),
        },
        answer: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const [row] = await service.getRosterSnapshot(context, 'exam-1');

      // 60-minute exam + 10 minutes banked from the earlier pause, 50 minutes elapsed ->
      // ~20 minutes (1200s) left. Without pausedDurationMs this under-reported by 10 min.
      expect(row.remainingSeconds).toBeGreaterThan(1150);
      expect(row.remainingSeconds).toBeLessThanOrEqual(1200);
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
        answer: { groupBy: jest.fn().mockResolvedValue([{ attemptId: 'attempt-1', _count: { _all: 1 } }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getRosterSnapshot(context, 'exam-1');

      expect(result[0].online).toBe(false);
      expect(result[0].remainingSeconds).toBeNull();
    });

    it('reports proctoringBypassed true only for a bypassed attempt', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', durationMinutes: 60 }) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              candidateId: 'c1', id: 'i1', extraTimePercent: 0, status: 'invited', candidate: { name: 'Bypassed' },
              attempt: {
                id: 'a1', status: 'in_progress', questionOrderJson: '["q1"]', startedAt: new Date(),
                lastSeenAt: new Date(), proctoringBypassedAt: new Date(),
              },
            },
            {
              candidateId: 'c2', id: 'i2', extraTimePercent: 0, status: 'invited', candidate: { name: 'Normal' },
              attempt: {
                id: 'a2', status: 'in_progress', questionOrderJson: '["q1"]', startedAt: new Date(),
                lastSeenAt: new Date(), proctoringBypassedAt: null,
              },
            },
            {
              candidateId: 'c3', id: 'i3', extraTimePercent: 0, status: 'invited', candidate: { name: 'Not started' },
              attempt: null,
            },
            {
              candidateId: 'c4', id: 'i4', extraTimePercent: 0, status: 'invited', candidate: { name: 'Revoked' },
              attempt: {
                id: 'a4', status: 'in_progress', questionOrderJson: '["q1"]', startedAt: new Date(),
                lastSeenAt: new Date(), proctoringBypassedAt: new Date(), proctoringBypassRevokedAt: new Date(),
              },
            },
          ]),
        },
        answer: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

      const rows = await service.getRosterSnapshot(context, 'exam-1');

      expect(rows[0].proctoringBypassed).toBe(true);
      expect(rows[1].proctoringBypassed).toBe(false);
      expect(rows[2].proctoringBypassed).toBe(false);
      // A revoked bypass is history, not current state -- the badge must clear.
      expect(rows[3].proctoringBypassed).toBe(false);
    });

    it('counts answers for the whole roster in one grouped query, not one per attempt', async () => {
      // The presence tick re-runs this snapshot every 15s per open exam page, so an
      // N+1 here scales with exam size and never stops.
      const invitations = Array.from({ length: 20 }, (_, i) => ({
        id: `inv-${i}`, candidateId: `cand-${i}`, status: 'invited', candidate: { name: `Cand ${i}` }, extraTimePercent: 0,
        attempt: {
          id: `attempt-${i}`, status: 'in_progress', startedAt: new Date(), lastSeenAt: new Date(),
          questionOrderJson: '["q1","q2"]',
        },
      }));
      const groupBy = jest.fn().mockResolvedValue([{ attemptId: 'attempt-3', _count: { _all: 2 } }]);
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: { findMany: jest.fn().mockResolvedValue(invitations) },
        answer: { groupBy },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

      const rows = await service.getRosterSnapshot(context, 'exam-1');

      expect(groupBy).toHaveBeenCalledTimes(1);
      expect(groupBy.mock.calls[0][0].where).toEqual({ attemptId: { in: invitations.map((i) => i.attempt.id) } });
      // Meaning preserved: each row still reports its own answered count, zero included.
      expect(rows[3].answeredCount).toBe(2);
      expect(rows[0].answeredCount).toBe(0);
    });
  });

  describe('getRecentAlerts', () => {
    it('returns only medium and high severity events within the window, newest first, capped', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
        proctoringEvent: {
          findMany: jest.fn().mockResolvedValue([
            { attemptId: 'a1', eventType: 'tab_switch', severity: 'high', occurredAt: new Date('2026-07-25T10:00:00Z'), attempt: { candidateId: 'c1' } },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

      const alerts = await service.getRecentAlerts(context, 'exam-1');

      expect(alerts).toEqual([
        { attemptId: 'a1', candidateId: 'c1', eventType: 'tab_switch', severity: 'high', occurredAt: new Date('2026-07-25T10:00:00Z') },
      ]);
      const args = tx.proctoringEvent.findMany.mock.calls[0][0];
      expect(args.where.severity).toEqual({ in: ['medium', 'high'] });
      expect(args.where.attempt).toEqual({ examId: 'exam-1' });
      expect(args.where.occurredAt.gt).toBeInstanceOf(Date);
      expect(args.orderBy).toEqual({ occurredAt: 'desc' });
      // A memory ceiling, not a detection policy: low enough to bound the payload, high
      // enough that a fleet-wide misfire still seeds every candidate's burst.
      expect(args.take).toBe(2000);
    });

    it('throws NotFoundException when the exam does not belong to the caller organization', async () => {
      const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) }, proctoringEvent: { findMany: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

      await expect(service.getRecentAlerts(context, 'exam-1')).rejects.toThrow(NotFoundException);
      expect(tx.proctoringEvent.findMany).not.toHaveBeenCalled();
    });
  });
});
