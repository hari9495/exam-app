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
      candidate: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      invitation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      attempt: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      result: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
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

    const result = await service.getSummary(context, 'all');

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

    const result = await service.getSummary(context, 'all');

    expect(tx.invitation.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'invited', attempt: null }),
      }),
    );
    expect(result.attention.staleInvitationCount).toBe(6);
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

    const result = await service.getSummary(context, 'all');

    expect(result.upcomingExams).toEqual([
      { examId: 'exam-2', examTitle: 'Scheduled Round', availabilityWindowStart: '2026-08-01T09:00:00.000Z' },
    ]);
  });

  it('returns an empty upcoming-exams list for an org with no data', async () => {
    const tx = stubTx({ invitation: { count: jest.fn().mockResolvedValue(0) }, result: { count: jest.fn().mockResolvedValue(0) } });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context, 'all');

    expect(result.upcomingExams).toEqual([]);
  });

  describe('getTrend', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-23T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('buckets candidate counts by day over the requested window', async () => {
      const tx = stubTx({
        candidate: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([
            { createdAt: new Date('2026-07-22T09:00:00Z') },
            { createdAt: new Date('2026-07-22T15:00:00Z') },
            { createdAt: new Date('2026-07-20T09:00:00Z') },
          ]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getTrend(context, 'candidates', 7);

      expect(result.points).toHaveLength(7);
      expect(result.points[result.points.length - 1]).toEqual({ date: '2026-07-23', value: 0 });
      expect(result.points.find((p) => p.date === '2026-07-22')).toEqual({ date: '2026-07-22', value: 2 });
      expect(result.points.find((p) => p.date === '2026-07-20')).toEqual({ date: '2026-07-20', value: 1 });
      expect(tx.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1', erasedAt: null, createdAt: { gte: new Date('2026-07-16T12:00:00Z') } }),
        }),
      );
    });

    it('buckets invitation counts by invitedAt for the invitations metric', async () => {
      const tx = stubTx({
        invitation: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([{ invitedAt: new Date('2026-07-23T08:00:00Z') }]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getTrend(context, 'invitations', 14);

      expect(result.points).toHaveLength(14);
      expect(result.points[result.points.length - 1]).toEqual({ date: '2026-07-23', value: 1 });
    });

    it('buckets attempt-started counts by startedAt for the attempts metric', async () => {
      const tx = stubTx({
        attempt: {
          count: jest.fn().mockResolvedValue(0),
          groupBy: jest.fn().mockResolvedValue([]),
          findMany: jest.fn().mockResolvedValue([{ startedAt: new Date('2026-07-21T08:00:00Z') }]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getTrend(context, 'attempts', 30);

      expect(result.points).toHaveLength(30);
      expect(result.points.find((p) => p.date === '2026-07-21')).toEqual({ date: '2026-07-21', value: 1 });
    });

    it('buckets pending-grading counts by submittedAt for attempts still awaiting manual grading', async () => {
      const tx = stubTx({
        attempt: {
          count: jest.fn().mockResolvedValue(0),
          groupBy: jest.fn().mockResolvedValue([]),
          findMany: jest.fn().mockResolvedValue([{ submittedAt: new Date('2026-07-23T08:00:00Z') }]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getTrend(context, 'pendingGrading', 7);

      expect(tx.attempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'pending_manual_grade' }) }),
      );
      expect(result.points[result.points.length - 1]).toEqual({ date: '2026-07-23', value: 1 });
    });

    it('returns all-zero points for a metric with no matching rows', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getTrend(context, 'candidates', 7);

      expect(result.points.every((p) => p.value === 0)).toBe(true);
    });
  });

  describe('getExamPerformance', () => {
    it('aggregates pass rate, average score, and candidate count per exam from Result rows', async () => {
      const tx = stubTx({
        exam: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              { id: 'exam-1', title: 'Backend Round' },
              { id: 'exam-2', title: 'Frontend Round' },
            ])
            .mockResolvedValue([]),
        },
        result: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([
            { passFail: 'pass', percentage: 80, attempt: { examId: 'exam-1', candidateId: 'cand-1' } },
            { passFail: 'fail', percentage: 40, attempt: { examId: 'exam-1', candidateId: 'cand-2' } },
            { passFail: 'pass', percentage: 90, attempt: { examId: 'exam-2', candidateId: 'cand-3' } },
          ]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getExamPerformance(context, 10, 'all');

      expect(result.exams).toEqual([
        { examId: 'exam-1', examTitle: 'Backend Round', passRate: 50, avgScore: 60, candidateCount: 2 },
        { examId: 'exam-2', examTitle: 'Frontend Round', passRate: 100, avgScore: 90, candidateCount: 1 },
      ]);
    });

    it('sorts by candidate count descending and truncates to the given limit', async () => {
      const tx = stubTx({
        exam: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              { id: 'exam-1', title: 'Small' },
              { id: 'exam-2', title: 'Big' },
            ])
            .mockResolvedValue([]),
        },
        result: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([
            { passFail: 'pass', percentage: 70, attempt: { examId: 'exam-1', candidateId: 'cand-1' } },
            { passFail: 'pass', percentage: 70, attempt: { examId: 'exam-2', candidateId: 'cand-2' } },
            { passFail: 'pass', percentage: 70, attempt: { examId: 'exam-2', candidateId: 'cand-3' } },
          ]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getExamPerformance(context, 1, 'all');

      expect(result.exams).toEqual([{ examId: 'exam-2', examTitle: 'Big', passRate: 100, avgScore: 70, candidateCount: 2 }]);
    });

    it('filters settled attempts by window using the underlying attempt submittedAt', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getExamPerformance(context, 'all', '30d');

      expect(tx.result.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            attempt: expect.objectContaining({ submittedAt: expect.objectContaining({ gte: expect.any(Date) }) }),
          }),
        }),
      );
    });

    it('returns an empty exams list for an org with no settled attempts', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getExamPerformance(context, 5, 'all');

      expect(result.exams).toEqual([]);
    });

    it('accepts a 7-day window', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getExamPerformance(context, 'all', '7d');

      expect(tx.result.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ attempt: expect.objectContaining({ submittedAt: expect.objectContaining({ gte: expect.any(Date) }) }) }),
        }),
      );
    });
  });

  describe('getFunnel', () => {
    it('computes invited/started/submitted/passed across all of the org exams by default', async () => {
      const tx = stubTx({
        exam: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              { id: 'exam-1', title: 'Backend Round' },
              { id: 'exam-2', title: 'Frontend Round' },
            ])
            .mockResolvedValue([]),
        },
        invitation: { count: jest.fn().mockResolvedValue(100) },
        attempt: { count: jest.fn().mockResolvedValue(60), groupBy: jest.fn().mockResolvedValue([]) },
        result: { count: jest.fn().mockResolvedValue(22) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getFunnel(context, 'all', 'all');

      expect(result).toEqual({ invited: 100, started: 60, submitted: 60, passed: 22 });
      expect(tx.invitation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ examId: { in: ['exam-1', 'exam-2'] } }) }),
      );
    });

    it('scopes to a single exam when examId is not "all"', async () => {
      const tx = stubTx({
        exam: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              { id: 'exam-1', title: 'Backend Round' },
              { id: 'exam-2', title: 'Frontend Round' },
            ])
            .mockResolvedValue([]),
        },
        invitation: { count: jest.fn().mockResolvedValue(40) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getFunnel(context, 'exam-1', 'all');

      expect(tx.invitation.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ examId: { in: ['exam-1'] } }) }));
    });

    it('scopes to zero results when examId does not belong to the organization', async () => {
      const tx = stubTx({
        exam: {
          findMany: jest.fn().mockResolvedValueOnce([{ id: 'exam-1', title: 'Backend Round' }]).mockResolvedValue([]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getFunnel(context, 'someone-elses-exam', 'all');

      expect(result).toEqual({ invited: 0, started: 0, submitted: 0, passed: 0 });
    });

    it('filters by invitation invitedAt when a window is given', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getFunnel(context, 'all', '30d');

      expect(tx.invitation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ invitedAt: expect.objectContaining({ gte: expect.any(Date) }) }) }),
      );
      expect(tx.attempt.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ invitation: expect.objectContaining({ invitedAt: expect.objectContaining({ gte: expect.any(Date) }) }) }) }),
      );
    });

    it('accepts a 14-day window', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getFunnel(context, 'all', '14d');

      expect(tx.invitation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ invitedAt: expect.objectContaining({ gte: expect.any(Date) }) }) }),
      );
    });
  });

  describe('getSummary window filtering', () => {
    it('filters totalCandidates by createdAt when a window is given', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getSummary(context, '30d');

      expect(tx.candidate.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdAt: expect.objectContaining({ gte: expect.any(Date) }) }) }),
      );
    });

    it('filters invitationsSent by invitedAt when a window is given', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getSummary(context, '30d');

      expect(tx.invitation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ invitedAt: expect.objectContaining({ gte: expect.any(Date) }) }) }),
      );
    });

    it('filters attemptsInProgress by startedAt when a window is given', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getSummary(context, '30d');

      expect(tx.attempt.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'in_progress', startedAt: expect.objectContaining({ gte: expect.any(Date) }) }),
        }),
      );
    });

    it('applies no date filter to any stat when window is "all"', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getSummary(context, 'all');

      const candidateCountArgs = tx.candidate.count.mock.calls[0][0];
      expect(candidateCountArgs.where.createdAt).toBeUndefined();
      const invitationCountArgs = tx.invitation.count.mock.calls[0][0];
      expect(invitationCountArgs.where.invitedAt).toBeUndefined();
      const attemptCountArgs = tx.attempt.count.mock.calls[0][0];
      expect(attemptCountArgs.where.startedAt).toBeUndefined();
    });

    it('computes stats.pendingGradingCount from a window-filtered query, independent of the unfiltered attention.pendingGrading list', async () => {
      const tx = stubTx({
        attempt: {
          count: jest.fn().mockResolvedValue(0),
          groupBy: jest
            .fn()
            .mockResolvedValueOnce([{ examId: 'exam-1', _count: { _all: 2 } }])
            .mockResolvedValueOnce([{ examId: 'exam-1', _count: { _all: 9 } }]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getSummary(context, '7d');

      expect(result.stats.pendingGradingCount).toBe(2);
      expect(result.attention.pendingGrading).toEqual([{ examId: 'exam-1', examTitle: 'Backend Round', count: 9 }]);
    });
  });

  describe('getAnalytics', () => {
    it('computes scores, integrity, timing, exam quality, and question difficulty', async () => {
      const submittedAt = new Date('2026-07-20T10:00:00Z');
      const startedAt = new Date('2026-07-20T09:30:00Z'); // 30 minutes
      const results = [
        { percentage: 80, passFail: 'pass', attempt: { examId: 'exam-1', candidateId: 'c1', startedAt, submittedAt } },
        { percentage: 30, passFail: 'fail', attempt: { examId: 'exam-1', candidateId: 'c2', startedAt, submittedAt } },
      ];
      const tx = {
        exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round', durationMinutes: 60 }]) },
        result: { findMany: jest.fn().mockResolvedValue(results), count: jest.fn().mockResolvedValue(1) },
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { webcamViolationCount: 2, browserActivityViolationCount: 0 },
            { webcamViolationCount: 0, browserActivityViolationCount: 0 },
          ]),
          count: jest.fn().mockResolvedValue(2),
        },
        invitation: { count: jest.fn().mockResolvedValue(4) },
        proctoringEvent: {
          groupBy: jest
            .fn()
            .mockResolvedValueOnce([{ eventType: 'tab_switch', _count: { _all: 3 } }])
            .mockResolvedValueOnce([{ severity: 'high', _count: { _all: 1 } }]),
        },
        answer: {
          groupBy: jest
            .fn()
            .mockResolvedValueOnce([{ questionId: 'q1', _count: { _all: 10 } }])
            .mockResolvedValueOnce([{ questionId: 'q1', _count: { _all: 2 } }]),
        },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Hardest question' }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await service.getAnalytics(context, { window: 'all' });

      expect(result.scores.count).toBe(2);
      expect(result.scores.avg).toBe(55);
      expect(result.scores.passRate).toBe(50);
      expect(result.integrity.flaggedAttempts).toBe(1);
      expect(result.integrity.flaggedRate).toBe(50);
      expect(result.integrity.byType[0]).toEqual({ type: 'tab_switch', count: 3 });
      expect(result.timing.avgMinutes).toBe(30);
      expect(result.examQuality[0]).toMatchObject({ examTitle: 'Backend Round', avgScore: 55, passRate: 50, candidateCount: 2, allottedMinutes: 60 });
      expect(result.questionDifficulty[0]).toMatchObject({ text: 'Hardest question', correctRate: 20, answered: 10 });
    });

    it('returns empty analytics when the org has no exams', async () => {
      const tx = { exam: { findMany: jest.fn().mockResolvedValue([]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await service.getAnalytics(context, { window: 'all' });

      expect(result.scores.count).toBe(0);
      expect(result.examQuality).toEqual([]);
      expect(result.questionDifficulty).toEqual([]);
    });
  });
});
