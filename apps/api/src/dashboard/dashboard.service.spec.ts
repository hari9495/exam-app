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
    // Shared shape for getAnalytics' tx; individual tests override only what they exercise.
    function buildAnalyticsTx(overrides: Partial<Record<string, any>> = {}) {
      return {
        exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round', durationMinutes: 60 }]) },
        result: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
        invitation: { count: jest.fn().mockResolvedValue(0) },
        proctoringEvent: { groupBy: jest.fn().mockResolvedValue([]) },
        integrityAnalysis: { groupBy: jest.fn().mockResolvedValue([]) },
        answer: { groupBy: jest.fn().mockResolvedValue([]) },
        question: { findMany: jest.fn().mockResolvedValue([]) },
        ...overrides,
      };
    }

    it('computes scores, integrity, timing, exam quality, and question difficulty', async () => {
      const submittedAt = new Date('2026-07-20T10:00:00Z');
      const startedAt = new Date('2026-07-20T09:30:00Z'); // 30 minutes
      const results = [
        { percentage: 80, passFail: 'pass', attempt: { examId: 'exam-1', candidateId: 'c1', startedAt, submittedAt } },
        { percentage: 30, passFail: 'fail', attempt: { examId: 'exam-1', candidateId: 'c2', startedAt, submittedAt } },
      ];
      const tx = buildAnalyticsTx({
        result: { findMany: jest.fn().mockResolvedValue(results), count: jest.fn().mockResolvedValue(1) },
        attempt: { count: jest.fn().mockResolvedValue(2) },
        invitation: { count: jest.fn().mockResolvedValue(4) },
        proctoringEvent: { groupBy: jest.fn().mockResolvedValue([{ eventType: 'tab_switch', _count: { _all: 3 } }]) },
        // Deliberately removed: these asserted the counter-derived integrity flag
        // (violations > 0 => flagged) -- the logic PR #29 removed from the verdict
        // path, which survived here and showed recruiters 85% flagged while the
        // stored verdicts said 9%. The dashboard now reads integrity_analyses.level.
        integrityAnalysis: {
          groupBy: jest.fn().mockResolvedValue([
            { level: 'high_concern', _count: { _all: 1 } },
            { level: 'review', _count: { _all: 1 } },
          ]),
        },
        answer: {
          groupBy: jest
            .fn()
            .mockResolvedValueOnce([{ questionId: 'q1', _count: { _all: 10 } }])
            .mockResolvedValueOnce([{ questionId: 'q1', _count: { _all: 2 } }]),
        },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Hardest question' }]) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await service.getAnalytics(context, { window: 'all' });

      expect(result.scores.count).toBe(2);
      expect(result.scores.avg).toBe(55);
      expect(result.scores.passRate).toBe(50);
      expect(result.integrity).toMatchObject({
        submittedAttempts: 2,
        highConcern: 1,
        review: 1,
        clear: 0,
        unanalyzed: 0,
        highConcernRate: 50,
      });
      expect(result.integrity.byType[0]).toEqual({ type: 'tab_switch', count: 3 });
      expect(result.timing.avgMinutes).toBe(30);
      expect(result.examQuality[0]).toMatchObject({ examTitle: 'Backend Round', avgScore: 55, passRate: 50, candidateCount: 2, allottedMinutes: 60 });
      expect(result.questionDifficulty[0]).toMatchObject({ text: 'Hardest question', correctRate: 20, answered: 10 });
    });

    it('counts attempts with no analysis row toward unanalyzed, not clean', async () => {
      const tx = buildAnalyticsTx({
        attempt: { count: jest.fn().mockResolvedValue(3) },
        integrityAnalysis: { groupBy: jest.fn().mockResolvedValue([{ level: 'clear', _count: { _all: 2 } }]) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await service.getAnalytics(context, { window: 'all' });

      expect(result.integrity).toMatchObject({ submittedAttempts: 3, clear: 2, unanalyzed: 1, highConcernRate: 0 });
    });

    it('treats a null level as unanalyzed rather than any verdict bucket', async () => {
      const tx = buildAnalyticsTx({
        attempt: { count: jest.fn().mockResolvedValue(1) },
        integrityAnalysis: { groupBy: jest.fn().mockResolvedValue([{ level: null, _count: { _all: 1 } }]) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await service.getAnalytics(context, { window: 'all' });

      expect(result.integrity).toMatchObject({ highConcern: 0, review: 0, clear: 0, unanalyzed: 1 });
    });

    it('computes highConcernRate over analyzed attempts, not submitted', async () => {
      const tx = buildAnalyticsTx({
        attempt: { count: jest.fn().mockResolvedValue(4) },
        integrityAnalysis: { groupBy: jest.fn().mockResolvedValue([{ level: 'high_concern', _count: { _all: 1 } }]) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await service.getAnalytics(context, { window: 'all' });

      expect(result.integrity).toMatchObject({ submittedAttempts: 4, highConcernRate: 100, unanalyzed: 3 });
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

  describe('getToday', () => {
    const userId = 'user-1';
    const now = new Date('2026-09-08T12:00:00.000Z'); // Tuesday, noon UTC
    const DAY_MS = 24 * 60 * 60 * 1000;

    function snapshot(steps: string[][]) {
      return JSON.stringify(steps.map((approverUserIds) => ({ approverUserIds })));
    }

    // Every getToday query hits one of these tables inside the single forTenant call;
    // defaults keep tests that don't care about a given table from having to stub it.
    function buildTodayTx(overrides: Partial<Record<string, any>> = {}) {
      return {
        user: { findUnique: jest.fn().mockResolvedValue({ timeZone: 'UTC' }) },
        interview: { findMany: jest.fn().mockResolvedValue([]) },
        pipelineFeedback: { findMany: jest.fn().mockResolvedValue([]) },
        offer: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
        approvalRequest: { findMany: jest.fn().mockResolvedValue([]) },
        job: { findUnique: jest.fn().mockResolvedValue(null) },
        exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1' }]) },
        invitation: { count: jest.fn().mockResolvedValue(0) },
        proctoringEvent: { count: jest.fn().mockResolvedValue(0) },
        driveSession: { findFirst: jest.fn().mockResolvedValue(null) },
        ...overrides,
      };
    }

    function mockWeek() {
      jest.spyOn(service, 'getSummary').mockResolvedValue({
        stats: { totalCandidates: 12, invitationsSent: 8, attemptsInProgress: 1, pendingGradingCount: 3 },
        attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
        activity: [],
        upcomingExams: [],
      } as any);
      jest.spyOn(service, 'getAnalytics').mockResolvedValue({ scores: { passRate: 66.6 } } as any);
    }

    it('finds today\'s confirmed interviews for this user, excludes other days, and sorts by start time', async () => {
      const early = {
        id: 'iv-early',
        confirmedSlotId: 'slot-early',
        pipelineEntryId: 'pe-early',
        candidateId: 'cand-early',
        // Not yet ended (now is 12:00) -- still belongs in interviewsToday, not feedbackOwed.
        slots: [{ id: 'slot-early', startsAt: new Date('2026-09-08T13:00:00.000Z'), endsAt: new Date('2026-09-08T13:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-early', job: { title: 'Backend Engineer' }, candidate: { name: 'Alice' } },
      };
      const late = {
        id: 'iv-late',
        confirmedSlotId: 'slot-late',
        pipelineEntryId: 'pe-late',
        candidateId: 'cand-late',
        slots: [{ id: 'slot-late', startsAt: new Date('2026-09-08T15:00:00.000Z'), endsAt: new Date('2026-09-08T15:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-late', job: { title: 'Frontend Engineer' }, candidate: { name: 'Zed' } },
      };
      const yesterday = {
        id: 'iv-yesterday',
        confirmedSlotId: 'slot-yesterday',
        pipelineEntryId: 'pe-yesterday',
        candidateId: 'cand-yesterday',
        slots: [{ id: 'slot-yesterday', startsAt: new Date('2026-09-07T09:00:00.000Z'), endsAt: new Date('2026-09-07T09:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-yesterday', job: { title: 'Old Round' }, candidate: { name: 'Yesterday' } },
      };
      // Present them out of order so a passing test proves the service sorts, not the fixture.
      const tx = buildTodayTx({ interview: { findMany: jest.fn().mockResolvedValue([late, yesterday, early]) } });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, now);

      expect(tx.interview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            status: 'confirmed',
            confirmedSlotId: { not: null },
            panelists: { some: { userId } },
            pipelineEntry: { candidate: { erasedAt: null } },
          },
        }),
      );
      expect(result.needsYou.interviewsToday).toEqual([
        {
          id: 'iv-early',
          candidateId: 'cand-early',
          candidateName: 'Alice',
          subtitle: 'Backend Engineer · 13:00 with panel',
          at: '2026-09-08T13:00:00.000Z',
          actionLabel: 'Open brief',
          actionHref: '/v2/jobs/job-early',
        },
        {
          id: 'iv-late',
          candidateId: 'cand-late',
          candidateName: 'Zed',
          subtitle: 'Frontend Engineer · 15:00 with panel',
          at: '2026-09-08T15:00:00.000Z',
          actionLabel: 'Open brief',
          actionHref: '/v2/jobs/job-late',
        },
      ]);
    });

    it('owes feedback for an unrated ended interview, excludes one rated by this user, includes one rated only by someone else, and excludes one older than 14 days', async () => {
      const owedByOther = {
        id: 'iv-owed-other',
        confirmedSlotId: 'slot-o',
        pipelineEntryId: 'pe-owed-other',
        candidateId: 'cand-o',
        slots: [{ id: 'slot-o', startsAt: new Date('2026-09-06T09:00:00.000Z'), endsAt: new Date('2026-09-06T09:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-o', job: { title: 'DevOps Engineer' }, candidate: { name: 'Dave' } },
      };
      const owedUnrated = {
        id: 'iv-owed-unrated',
        confirmedSlotId: 'slot-u',
        pipelineEntryId: 'pe-owed-unrated',
        candidateId: 'cand-u',
        slots: [{ id: 'slot-u', startsAt: new Date('2026-09-05T09:00:00.000Z'), endsAt: new Date('2026-09-05T09:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-u', job: { title: 'QA Engineer' }, candidate: { name: 'Carol' } },
      };
      const ratedBySelf = {
        id: 'iv-rated-self',
        confirmedSlotId: 'slot-s',
        pipelineEntryId: 'pe-rated-self',
        candidateId: 'cand-s',
        slots: [{ id: 'slot-s', startsAt: new Date('2026-09-07T09:00:00.000Z'), endsAt: new Date('2026-09-07T09:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-s', job: { title: 'Support Engineer' }, candidate: { name: 'Sam' } },
      };
      const tooOld = {
        id: 'iv-too-old',
        confirmedSlotId: 'slot-t',
        pipelineEntryId: 'pe-too-old',
        candidateId: 'cand-t',
        slots: [{ id: 'slot-t', startsAt: new Date('2026-08-20T09:00:00.000Z'), endsAt: new Date('2026-08-20T09:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-t', job: { title: 'Old Round' }, candidate: { name: 'Tia' } },
      };
      const tx = buildTodayTx({
        interview: { findMany: jest.fn().mockResolvedValue([owedByOther, owedUnrated, ratedBySelf, tooOld]) },
        // Query filters by authorUserId: userId, so a row authored by someone else never
        // comes back here -- that's exactly what leaves `owedByOther` still "unrated".
        pipelineFeedback: { findMany: jest.fn().mockResolvedValue([{ entryId: 'pe-rated-self' }]) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, now);

      expect(tx.pipelineFeedback.findMany).toHaveBeenCalledWith({
        where: { authorUserId: userId, entryId: { in: ['pe-owed-other', 'pe-owed-unrated', 'pe-rated-self'] } },
        select: { entryId: true },
      });
      expect(result.needsYou.feedbackOwed.map((i) => i.id)).toEqual(['iv-owed-unrated', 'iv-owed-other']);
      expect(result.needsYou.feedbackOwed[0]).toEqual({
        id: 'iv-owed-unrated',
        candidateId: 'cand-u',
        candidateName: 'Carol',
        subtitle: 'QA Engineer · interviewed 3 days ago · scorecard due',
        at: '2026-09-05T09:30:00.000Z',
        actionLabel: 'Add feedback',
        actionHref: '/v2/jobs/job-u',
      });
    });

    it('keeps an interview in exactly one group: ended+unrated -> feedbackOwed only, ended+rated -> neither, in-progress -> interviewsToday only', async () => {
      const endedUnrated = {
        id: 'iv-ended-unrated',
        confirmedSlotId: 'slot-ended-unrated',
        pipelineEntryId: 'pe-ended-unrated',
        candidateId: 'cand-ended-unrated',
        slots: [{ id: 'slot-ended-unrated', startsAt: new Date('2026-09-08T08:00:00.000Z'), endsAt: new Date('2026-09-08T08:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-ended-unrated', job: { title: 'Backend Engineer' }, candidate: { name: 'Uma' } },
      };
      const endedRated = {
        id: 'iv-ended-rated',
        confirmedSlotId: 'slot-ended-rated',
        pipelineEntryId: 'pe-ended-rated',
        candidateId: 'cand-ended-rated',
        slots: [{ id: 'slot-ended-rated', startsAt: new Date('2026-09-08T09:00:00.000Z'), endsAt: new Date('2026-09-08T09:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-ended-rated', job: { title: 'Frontend Engineer' }, candidate: { name: 'Raj' } },
      };
      const inProgress = {
        id: 'iv-in-progress',
        confirmedSlotId: 'slot-in-progress',
        pipelineEntryId: 'pe-in-progress',
        candidateId: 'cand-in-progress',
        // now is 12:00; started 11:45, ends 12:15 -- ongoing, not yet ended.
        slots: [{ id: 'slot-in-progress', startsAt: new Date('2026-09-08T11:45:00.000Z'), endsAt: new Date('2026-09-08T12:15:00.000Z') }],
        pipelineEntry: { jobId: 'job-in-progress', job: { title: 'QA Engineer' }, candidate: { name: 'Ivy' } },
      };
      const tx = buildTodayTx({
        interview: { findMany: jest.fn().mockResolvedValue([endedUnrated, endedRated, inProgress]) },
        pipelineFeedback: { findMany: jest.fn().mockResolvedValue([{ entryId: 'pe-ended-rated' }]) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, now);

      expect(result.needsYou.interviewsToday.map((i) => i.id)).toEqual(['iv-in-progress']);
      expect(result.needsYou.feedbackOwed.map((i) => i.id)).toEqual(['iv-ended-unrated']);
      expect(result.needsYou.total).toBe(2);
    });

    it('reads a relative day off local day boundaries, not raw elapsed hours, and honours the user timezone', async () => {
      // 08:30 local (IST) on 2026-09-08; the interview ended 20:00 local (IST) the day
      // before -- only 12.5h ago, so a naive 24h-block diff would floor to "today".
      const nowIst = new Date('2026-09-08T03:00:00.000Z');
      const endedYesterdayLocal = {
        id: 'iv-ist-owed',
        confirmedSlotId: 'slot-ist-owed',
        pipelineEntryId: 'pe-ist-owed',
        candidateId: 'cand-ist-owed',
        slots: [{ id: 'slot-ist-owed', startsAt: new Date('2026-09-07T13:30:00.000Z'), endsAt: new Date('2026-09-07T14:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-ist-owed', job: { title: 'Ops Engineer' }, candidate: { name: 'Priya' } },
      };
      const tx = buildTodayTx({
        user: { findUnique: jest.fn().mockResolvedValue({ timeZone: 'Asia/Kolkata' }) },
        interview: { findMany: jest.fn().mockResolvedValue([endedYesterdayLocal]) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, nowIst);

      expect(result.needsYou.feedbackOwed).toHaveLength(1);
      expect(result.needsYou.feedbackOwed[0].subtitle).toBe('Ops Engineer · interviewed yesterday · scorecard due');
    });

    it('filters interviewsToday on the LOCAL day boundary, not UTC midnight', async () => {
      const now3 = new Date('2026-09-08T03:00:00.000Z'); // 08:30 IST
      const justAfterMidnightLocal = {
        id: 'iv-boundary-in',
        confirmedSlotId: 'slot-boundary-in',
        pipelineEntryId: 'pe-boundary-in',
        candidateId: 'cand-boundary-in',
        // 00:30 IST on 2026-09-08 -- inside today's local window; still running past `now3`.
        slots: [{ id: 'slot-boundary-in', startsAt: new Date('2026-09-07T19:00:00.000Z'), endsAt: new Date('2026-09-08T03:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-boundary-in', job: { title: 'Site Reliability Engineer' }, candidate: { name: 'Nina' } },
      };
      const justBeforeMidnightLocal = {
        id: 'iv-boundary-out',
        confirmedSlotId: 'slot-boundary-out',
        pipelineEntryId: 'pe-boundary-out',
        candidateId: 'cand-boundary-out',
        // 23:30 IST on 2026-09-07 -- yesterday's local window; a UTC-midnight filter would wrongly include it.
        slots: [{ id: 'slot-boundary-out', startsAt: new Date('2026-09-07T18:00:00.000Z'), endsAt: new Date('2026-09-07T18:30:00.000Z') }],
        pipelineEntry: { jobId: 'job-boundary-out', job: { title: 'Data Engineer' }, candidate: { name: 'Omar' } },
      };
      const tx = buildTodayTx({
        user: { findUnique: jest.fn().mockResolvedValue({ timeZone: 'Asia/Kolkata' }) },
        interview: { findMany: jest.fn().mockResolvedValue([justAfterMidnightLocal, justBeforeMidnightLocal]) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, now3);

      expect(result.needsYou.interviewsToday.map((i) => i.id)).toEqual(['iv-boundary-in']);
    });

    it('lists offers expiring within the horizon with the queried where/orderBy shape', async () => {
      const offer = {
        id: 'offer-1',
        candidateId: 'cand-off',
        expiresAt: new Date('2026-09-10T00:00:00.000Z'),
        sentAt: new Date('2026-09-07T00:00:00.000Z'),
        pipelineEntry: { jobId: 'job-off', job: { title: 'Sales Rep' }, candidate: { name: 'Oscar' } },
      };
      const tx = buildTodayTx({ offer: { findMany: jest.fn().mockResolvedValue([offer]), findUnique: jest.fn().mockResolvedValue(null) } });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, now);

      expect(tx.offer.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: 'sent',
          respondedAt: null,
          expiresAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY_MS) },
          pipelineEntry: { candidate: { erasedAt: null } },
        },
        select: expect.any(Object),
        orderBy: { expiresAt: 'asc' },
      });
      expect(result.needsYou.offersExpiring).toEqual([
        {
          id: 'offer-1',
          candidateId: 'cand-off',
          candidateName: 'Oscar',
          subtitle: 'Sales Rep · offer sent yesterday · expires Thursday',
          at: '2026-09-10T00:00:00.000Z',
          actionLabel: 'Nudge',
          actionHref: '/v2/jobs/job-off',
        },
      ]);
    });

    it('resolves approvalsPending to job/offer subject labels, excludes a request pending on another approver, and tolerates a malformed snapshot', async () => {
      const jobApproval = {
        id: 'ar-job',
        subjectType: 'job',
        subjectId: 'job-x',
        status: 'pending_approval',
        chainSnapshotJson: snapshot([[userId]]),
        currentStepPosition: 0,
        submittedAt: new Date('2026-09-06T00:00:00.000Z'),
      };
      const offerApproval = {
        id: 'ar-offer',
        subjectType: 'offer',
        subjectId: 'offer-x',
        status: 'pending_approval',
        chainSnapshotJson: snapshot([[userId]]),
        currentStepPosition: 0,
        submittedAt: new Date('2026-09-07T00:00:00.000Z'),
      };
      const otherApprover = {
        id: 'ar-other',
        subjectType: 'job',
        subjectId: 'job-z',
        status: 'pending_approval',
        chainSnapshotJson: snapshot([['user-2']]),
        currentStepPosition: 0,
        submittedAt: new Date('2026-09-05T00:00:00.000Z'),
      };
      const malformed = {
        id: 'ar-malformed',
        subjectType: 'job',
        subjectId: 'job-bad',
        status: 'pending_approval',
        chainSnapshotJson: '{not json',
        currentStepPosition: 0,
        submittedAt: new Date('2026-09-04T00:00:00.000Z'),
      };
      const tx = buildTodayTx({
        approvalRequest: { findMany: jest.fn().mockResolvedValue([jobApproval, offerApproval, otherApprover, malformed]) },
        job: { findUnique: jest.fn().mockResolvedValue({ title: 'Support Engineer' }) },
        offer: {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockResolvedValue({ candidateId: 'cand-y', pipelineEntry: { candidate: { name: 'Yara' } } }),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, now);

      expect(tx.job.findUnique).toHaveBeenCalledTimes(1);
      expect(tx.offer.findUnique).toHaveBeenCalledTimes(1);
      expect(result.needsYou.approvalsPending).toEqual([
        {
          id: 'ar-job',
          candidateId: null,
          candidateName: 'Support Engineer',
          subtitle: 'Requisition · waiting for your decision',
          at: '2026-09-06T00:00:00.000Z',
          actionLabel: 'Review',
          actionHref: '/v2/approvals',
        },
        {
          id: 'ar-offer',
          candidateId: 'cand-y',
          candidateName: 'Yara',
          subtitle: 'Offer · waiting for your decision',
          at: '2026-09-07T00:00:00.000Z',
          actionLabel: 'Review',
          actionHref: '/v2/approvals',
        },
      ]);
    });

    it('sums the four needsYou groups into total', async () => {
      const tx = buildTodayTx({
        interview: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'iv-1',
              confirmedSlotId: 's1',
              pipelineEntryId: 'pe-1',
              candidateId: 'c1',
              slots: [{ id: 's1', startsAt: new Date('2026-09-08T15:00:00.000Z'), endsAt: new Date('2026-09-08T15:30:00.000Z') }],
              pipelineEntry: { jobId: 'j1', job: { title: 'Job 1' }, candidate: { name: 'A' } },
            },
          ]),
        },
        offer: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'of-1',
              candidateId: 'c2',
              expiresAt: new Date('2026-09-09T00:00:00.000Z'),
              sentAt: new Date('2026-09-07T00:00:00.000Z'),
              pipelineEntry: { jobId: 'j2', job: { title: 'Job 2' }, candidate: { name: 'B' } },
            },
          ]),
          findUnique: jest.fn().mockResolvedValue(null),
        },
        approvalRequest: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'ar-1',
              subjectType: 'job',
              subjectId: 'j3',
              status: 'pending_approval',
              chainSnapshotJson: snapshot([[userId]]),
              currentStepPosition: 0,
              submittedAt: new Date('2026-09-06T00:00:00.000Z'),
            },
          ]),
        },
        job: { findUnique: jest.fn().mockResolvedValue({ title: 'Job 3' }) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, now);

      expect(result.needsYou.interviewsToday).toHaveLength(1);
      expect(result.needsYou.offersExpiring).toHaveLength(1);
      expect(result.needsYou.approvalsPending).toHaveLength(1);
      expect(result.needsYou.feedbackOwed).toHaveLength(0);
      expect(result.needsYou.total).toBe(3);
    });

    it('counts proctoring flags only within the last 7 days', async () => {
      const tx = buildTodayTx({ exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1' }, { id: 'exam-2' }]) } });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      await service.getToday(context, userId, now);

      expect(tx.proctoringEvent.count).toHaveBeenCalledWith({
        where: {
          attempt: { examId: { in: ['exam-1', 'exam-2'] } },
          occurredAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
        },
      });
    });

    it('reports the stale invitation count using the same rule as getSummary', async () => {
      const tx = buildTodayTx({
        exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1' }]) },
        invitation: { count: jest.fn().mockResolvedValue(9) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, now);

      expect(tx.invitation.count).toHaveBeenCalledWith({
        where: { examId: { in: ['exam-1'] }, status: 'invited', invitedAt: { lte: new Date(now.getTime() - 5 * DAY_MS) }, attempt: null },
      });
      expect(result.watch.staleInvitations).toBe(9);
    });

    it('reports the next upcoming drive session with its registered count, or null when none is scheduled', async () => {
      const tx = buildTodayTx({
        driveSession: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'drive-1',
            name: 'September Walk-in',
            startsAt: new Date('2026-09-09T09:00:00.000Z'),
            walkInGroup: { name: 'Campus A' },
          }),
        },
        invitation: { count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(14) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, now);

      expect(tx.driveSession.findFirst).toHaveBeenCalledWith({
        where: { walkInGroup: { organizationId: 'org-1' }, endsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
        select: expect.any(Object),
      });
      expect(result.watch.nextDrive).toEqual({
        id: 'drive-1',
        name: 'September Walk-in',
        groupName: 'Campus A',
        startsAt: '2026-09-09T09:00:00.000Z',
        registered: 14,
      });

      const txNoDrive = buildTodayTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(txNoDrive));
      const noDriveResult = await service.getToday(context, userId, now);
      expect(noDriveResult.watch.nextDrive).toBeNull();
    });

    it('maps the week from getSummary/getAnalytics and rounds passRate', async () => {
      const tx = buildTodayTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, now);

      expect(service.getSummary).toHaveBeenCalledWith(context, '7d');
      expect(service.getAnalytics).toHaveBeenCalledWith(context, { window: '7d' });
      expect(result.week).toEqual({ newApplicants: 12, invited: 8, awaitingGrading: 3, passRate: 67 });
    });

    it('falls back to a null passRate and logs a warning when getAnalytics rejects', async () => {
      const tx = buildTodayTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      jest.spyOn(service, 'getSummary').mockResolvedValue({
        stats: { totalCandidates: 1, invitationsSent: 1, attemptsInProgress: 0, pendingGradingCount: 0 },
        attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
        activity: [],
        upcomingExams: [],
      } as any);
      jest.spyOn(service, 'getAnalytics').mockRejectedValue(new Error('boom'));
      const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

      const result = await service.getToday(context, userId, now);

      expect(result.week.passRate).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('resolves today from the user\'s timezone, falling back to UTC for an invalid one', async () => {
      const tx = buildTodayTx({ user: { findUnique: jest.fn().mockResolvedValue({ timeZone: 'Asia/Kolkata' }) } });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      mockWeek();

      const result = await service.getToday(context, userId, now);

      expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { id: userId }, select: { timeZone: true } });
      expect(result.today).toEqual({ iso: '2026-09-08', timeZone: 'Asia/Kolkata' });

      const txInvalid = buildTodayTx({ user: { findUnique: jest.fn().mockResolvedValue({ timeZone: 'Not/AZone' }) } });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(txInvalid));
      const invalidResult = await service.getToday(context, userId, now);
      expect(invalidResult.today.timeZone).toBe('UTC');
    });
  });
});
