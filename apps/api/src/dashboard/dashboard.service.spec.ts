import { Test } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('DashboardService', () => {
  let service: DashboardService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [DashboardService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(DashboardService);
  });

  function stubTx(overrides: Partial<Record<string, any>> = {}) {
    return {
      exam: {
        findMany: jest.fn().mockResolvedValueOnce([{ id: 'exam-1', title: 'Backend Round' }]).mockResolvedValue([]),
      },
      candidate: { count: jest.fn().mockResolvedValue(0) },
      invitation: { count: jest.fn().mockResolvedValue(0) },
      attempt: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      result: { count: jest.fn().mockResolvedValue(0) },
      proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
  }

  it('aggregates stats, attention items, and activity into one summary', async () => {
    const tx = stubTx({
      candidate: { count: jest.fn().mockResolvedValue(248) },
      invitation: {
        count: jest.fn().mockResolvedValue(312),
      },
      attempt: {
        count: jest.fn().mockResolvedValue(17),
        groupBy: jest.fn().mockResolvedValue([{ examId: 'exam-1', _count: { _all: 4 } }]),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'log-1', action: 'exam.published', entityType: 'exam', entityId: 'exam-1', metadataJson: null, createdAt: new Date('2026-07-17T10:00:00Z') },
        ]),
      },
    });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context);

    expect(result.stats).toEqual({
      totalCandidates: 248,
      invitationsSent: 312,
      attemptsInProgress: 17,
      pendingGradingCount: 4,
    });
    expect(result.attention.pendingGrading).toEqual([{ examId: 'exam-1', examTitle: 'Backend Round', count: 4 }]);
    expect(result.activity).toEqual([
      { id: 'log-1', description: 'Backend Round was published', occurredAt: '2026-07-17T10:00:00.000Z' },
    ]);
  });

  it('counts an invitation as stale when invited 5+ days ago with no attempt', async () => {
    const tx = stubTx({ invitation: { count: jest.fn().mockResolvedValue(6) } });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context);

    expect(tx.invitation.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'invited', attempt: null }),
      }),
    );
    expect(result.attention.staleInvitationCount).toBe(6);
  });

  it('computes the candidate funnel from invitation/attempt/result counts', async () => {
    const tx = stubTx({
      invitation: { count: jest.fn().mockResolvedValue(100) },
      attempt: {
        count: jest.fn().mockResolvedValue(60),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      result: { count: jest.fn().mockResolvedValue(22) },
    });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context);

    expect(result.funnel).toEqual({ invited: 100, started: 60, submitted: 60, passed: 22 });
    expect(tx.attempt.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ submittedAt: { not: null } }) }),
    );
    expect(tx.result.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ passFail: 'pass' }) }),
    );
  });

  it('lists upcoming scheduled exams soonest-first, excluding exams without a future window', async () => {
    const tx = stubTx({
      exam: {
        findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round' }]),
      },
    });
    // The exam.findMany mock above satisfies the method's first (org-wide exam list) call;
    // upcomingExams uses a second, differently-filtered exam.findMany call — mockResolvedValueOnce
    // lets the two calls return different data.
    tx.exam.findMany
      .mockResolvedValueOnce([{ id: 'exam-1', title: 'Backend Round' }])
      .mockResolvedValueOnce([
        { id: 'exam-2', title: 'Scheduled Round', availabilityWindowStart: new Date('2026-08-01T09:00:00Z') },
      ]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context);

    expect(result.upcomingExams).toEqual([
      { examId: 'exam-2', examTitle: 'Scheduled Round', availabilityWindowStart: '2026-08-01T09:00:00.000Z' },
    ]);
  });

  it('returns an empty funnel and upcoming-exams list for an org with no data', async () => {
    const tx = stubTx({ invitation: { count: jest.fn().mockResolvedValue(0) }, result: { count: jest.fn().mockResolvedValue(0) } });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context);

    expect(result.funnel).toEqual({ invited: 0, started: 0, submitted: 0, passed: 0 });
    expect(result.upcomingExams).toEqual([]);
  });
});
