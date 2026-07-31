import { Test } from '@nestjs/testing';
import { TenantPrismaService } from '@exam-platform/shared';
import { LeaderboardService } from './leaderboard.service';

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [LeaderboardService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(LeaderboardService);
  });

  const mcqQuestion = (id: string, correctOptionId: string) => ({
    id,
    type: 'single_mcq',
    options: [
      { id: correctOptionId, isCorrect: true },
      { id: `${correctOptionId}-wrong`, isCorrect: false },
    ],
  });

  // Every field an attempt fixture needs for the service to run at all, with
  // sensible defaults a test can override piecemeal. Defaults to a finished,
  // never-paused, no-extra-time attempt started an hour ago.
  function baseAttempt(overrides: Record<string, unknown>) {
    return {
      status: 'submitted',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      submittedAt: new Date('2026-01-01T01:00:00Z'),
      pausedAt: null,
      pausedDurationMs: 0,
      result: null,
      invitation: { extraTimePercent: 0 },
      ...overrides,
    };
  }

  function mockTx(
    questions: unknown[],
    attempts: unknown[],
    candidates: unknown[] = [],
    invitations: unknown[] = [],
    exam: unknown = { durationMinutes: 60 },
  ) {
    return {
      exam: { findFirst: jest.fn().mockResolvedValue(exam) },
      attempt: { findMany: jest.fn().mockResolvedValue(attempts) },
      question: { findMany: jest.fn().mockResolvedValue(questions) },
      candidate: { findMany: jest.fn().mockResolvedValue(candidates) },
      invitation: { findMany: jest.fn().mockResolvedValue(invitations) },
    };
  }

  describe('compute', () => {
    it('ranks attempts by correct-answer count, descending', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const q2 = mcqQuestion('q2', 'q2-correct');
      const attempts = [
        baseAttempt({
          id: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
            { questionId: 'q2', selectedOptionIdsJson: JSON.stringify(['q2-correct']), answeredAt: new Date('2026-01-01T00:00:02Z') },
          ],
        }),
        baseAttempt({
          id: 'attempt-2', invitationId: 'inv-2', candidateId: 'cand-2',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
          ],
        }),
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1, q2], attempts)));

      const result = await service.compute(context, 'exam-1');

      expect(result.map((r) => ({ attemptId: r.attemptId, correctCount: r.correctCount, rank: r.rank }))).toEqual([
        { attemptId: 'attempt-1', correctCount: 2, rank: 1 },
        { attemptId: 'attempt-2', correctCount: 1, rank: 2 },
      ]);
    });

    it('breaks ties by whoever reached the count first', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = [
        baseAttempt({
          id: 'attempt-slow', invitationId: 'inv-slow', candidateId: 'cand-slow',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:10Z') }],
        }),
        baseAttempt({
          id: 'attempt-fast', invitationId: 'inv-fast', candidateId: 'cand-fast',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') }],
        }),
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const result = await service.compute(context, 'exam-1');

      expect(result.map((r) => r.attemptId)).toEqual(['attempt-fast', 'attempt-slow']);
    });

    it('excludes code questions from the correct count and the auto-gradable total', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      // A code question never appears in the `question.findMany` result because the service
      // filters by type in the query itself — simulate that by simply not including it.
      const attempts = [
        baseAttempt({
          id: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1',
          questionOrderJson: JSON.stringify(['q1', 'code-q']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
            { questionId: 'code-q', selectedOptionIdsJson: JSON.stringify([]), answeredAt: new Date('2026-01-01T00:00:02Z') },
          ],
        }),
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const result = await service.compute(context, 'exam-1');

      expect(result[0].correctCount).toBe(1);
      expect(result[0].totalAutoGradableQuestions).toBe(1);
    });

    it('ranks an attempt with zero correct answers last, not omitted', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = [
        baseAttempt({
          id: 'attempt-none', invitationId: 'inv-none', candidateId: 'cand-none',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [],
        }),
        baseAttempt({
          id: 'attempt-one', invitationId: 'inv-one', candidateId: 'cand-one',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') }],
        }),
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const result = await service.compute(context, 'exam-1');

      expect(result.map((r) => r.attemptId)).toEqual(['attempt-one', 'attempt-none']);
      expect(result[1].correctCount).toBe(0);
    });

    it('returns an empty array when no attempts have started', async () => {
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([], [])));

      const result = await service.compute(context, 'exam-1');

      expect(result).toEqual([]);
    });

    it('reports timeTakenSeconds as wall-clock elapsed for a finished attempt, minus banked pause grace', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = [
        baseAttempt({
          id: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1',
          questionOrderJson: JSON.stringify(['q1']), answers: [],
          startedAt: new Date('2026-01-01T00:00:00Z'),
          submittedAt: new Date('2026-01-01T00:50:00Z'), // 50 minutes wall-clock
          pausedDurationMs: 5 * 60_000, // 5 minutes banked from an earlier pause
        }),
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const [row] = await service.compute(context, 'exam-1');

      // 50 minutes elapsed minus 5 minutes of banked (non-working) pause time = 45 min = 2700s.
      expect(row.timeTakenSeconds).toBe(2700);
      expect(row.remainingSeconds).toBeNull();
    });

    it('freezes timeTakenSeconds and reports remainingSeconds for a paused attempt', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const startedAt = new Date(Date.now() - 40 * 60_000);
      const pausedAt = new Date(Date.now() - 10 * 60_000);
      const attempts = [
        baseAttempt({
          id: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1',
          questionOrderJson: JSON.stringify(['q1']), answers: [],
          status: 'paused', startedAt, submittedAt: null, pausedAt, pausedDurationMs: 0,
        }),
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const [row] = await service.compute(context, 'exam-1');

      // 30 minutes had elapsed by the time it was paused 10 minutes ago.
      expect(row.timeTakenSeconds).toBe(1800);
      // 60-minute exam, 30 elapsed at the freeze point -> 30 minutes (1800s) left.
      expect(row.remainingSeconds).toBe(1800);
    });

    it("applies the invitation's extra-time accommodation to remainingSeconds for an in-progress attempt", async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const startedAt = new Date(Date.now() - 60 * 60_000);
      const attempts = [
        baseAttempt({
          id: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1',
          questionOrderJson: JSON.stringify(['q1']), answers: [],
          status: 'in_progress', startedAt, submittedAt: null,
          invitation: { extraTimePercent: 50 },
        }),
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const [row] = await service.compute(context, 'exam-1');

      // exam.durationMinutes is 60; +50% = 90 effective minutes, 60 elapsed -> ~30 min (1800s) left.
      expect(row.remainingSeconds).toBeGreaterThan(1750);
      expect(row.remainingSeconds).toBeLessThanOrEqual(1800);
    });

    it("carries the attempt's Result (score/maxScore/percentage/passFail) when one exists", async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = [
        baseAttempt({
          id: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1',
          questionOrderJson: JSON.stringify(['q1']), answers: [],
          result: { score: 8, maxScore: 10, percentage: 80, passFail: 'pass' },
        }),
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const [row] = await service.compute(context, 'exam-1');

      expect(row.score).toBe(8);
      expect(row.maxScore).toBe(10);
      expect(row.percentage).toBe(80);
      expect(row.passFail).toBe('pass');
    });

    it('reports null score/maxScore/percentage/passFail when no Result exists yet', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = [
        baseAttempt({
          id: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1',
          questionOrderJson: JSON.stringify(['q1']), answers: [],
          status: 'in_progress', submittedAt: null, result: null,
        }),
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const [row] = await service.compute(context, 'exam-1');

      expect(row.score).toBeNull();
      expect(row.maxScore).toBeNull();
      expect(row.percentage).toBeNull();
      expect(row.passFail).toBeNull();
    });
  });

  describe('computeRecruiterView', () => {
    it('returns only the top 30 of more than 30 ranked attempts, with resolved candidate names', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = Array.from({ length: 35 }, (_, i) =>
        baseAttempt({
          id: `attempt-${i}`,
          invitationId: `inv-${i}`,
          candidateId: `cand-${i}`,
          questionOrderJson: JSON.stringify(['q1']),
          answers: [
            {
              questionId: 'q1',
              selectedOptionIdsJson: JSON.stringify(['q1-correct']),
              answeredAt: new Date(2026, 0, 1, 0, 0, i),
            },
          ],
        }),
      );
      const candidates = Array.from({ length: 35 }, (_, i) => ({ id: `cand-${i}`, name: `Candidate Name ${i}` }));
      const tx = mockTx([q1], attempts, candidates);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.computeRecruiterView(context, 'exam-1');

      expect(result).toHaveLength(30);
      expect(result[0]).toMatchObject({ rank: 1, candidateId: 'cand-0', candidateName: 'Candidate Name 0', correctCount: 1 });
      expect(result[29]).toMatchObject({ rank: 30, candidateId: 'cand-29', candidateName: 'Candidate Name 29', correctCount: 1 });
      expect(result.map((r) => r.candidateId)).not.toContain('cand-30');
    });

    it('returns an empty array and skips the candidate lookup when no attempts have started', async () => {
      const tx = mockTx([], []);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.computeRecruiterView(context, 'exam-1');

      expect(result).toEqual([]);
      expect(tx.candidate.findMany).not.toHaveBeenCalled();
    });

    it('computes percentile from rank among ALL participants, not just the top-30 slice', async () => {
      // Three questions, all with the same correct option, so a candidate's correctCount
      // is exactly how many of them they answered (in order).
      const questions = ['q1', 'q2', 'q3'].map((id) => mcqQuestion(id, 'the-correct-option'));
      // 4 participants, ranked 1..4 by descending correct count -- rank 1 beats 3 of 4 (75%),
      // rank 4 beats none (0%).
      const attempts = [3, 2, 1, 0].map((correct, i) =>
        baseAttempt({
          id: `attempt-${i}`, invitationId: `inv-${i}`, candidateId: `cand-${i}`,
          questionOrderJson: JSON.stringify(['q1', 'q2', 'q3']),
          answers: ['q1', 'q2', 'q3'].slice(0, correct).map((questionId) => ({
            questionId, selectedOptionIdsJson: JSON.stringify(['the-correct-option']), answeredAt: new Date(2026, 0, 1, 0, 0, i),
          })),
        }),
      );
      const tx = mockTx(questions, attempts, [
        { id: 'cand-0', name: 'A' }, { id: 'cand-1', name: 'B' }, { id: 'cand-2', name: 'C' }, { id: 'cand-3', name: 'D' },
      ]);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.computeRecruiterView(context, 'exam-1');

      const byCandidate = new Map(result.map((r) => [r.candidateId, r]));
      expect(byCandidate.get('cand-0')).toMatchObject({ rank: 1, percentile: 75 });
      expect(byCandidate.get('cand-3')).toMatchObject({ rank: 4, percentile: 0 });
    });
  });

  describe('computeCandidateView', () => {
    it("labels the viewer's row 'You' and labels others by invitedAt order rather than rank or leaderboard order", async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const q2 = mcqQuestion('q2', 'q2-correct');
      const attempts = [
        baseAttempt({
          id: 'attempt-A', invitationId: 'inv-A', candidateId: 'cand-A',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
            { questionId: 'q2', selectedOptionIdsJson: JSON.stringify(['q2-correct']), answeredAt: new Date('2026-01-01T00:00:02Z') },
          ],
        }),
        baseAttempt({
          id: 'attempt-B', invitationId: 'inv-B', candidateId: 'cand-B',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
          ],
        }),
        baseAttempt({
          id: 'attempt-C', invitationId: 'inv-C', candidateId: 'cand-C',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [],
        }),
      ];
      // Invited in the order C, A, B — deliberately different from both rank order (A, B, C)
      // and leaderboard/array order, to prove label numbering tracks invitedAt, not rank.
      const invitations = [
        { id: 'inv-C', invitedAt: new Date('2026-01-01T00:00:00Z') },
        { id: 'inv-A', invitedAt: new Date('2026-01-01T00:00:01Z') },
        { id: 'inv-B', invitedAt: new Date('2026-01-01T00:00:02Z') },
      ];
      const tx = mockTx([q1, q2], attempts, [], invitations);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.computeCandidateView(context, 'exam-1', 'inv-A');

      expect(result.you).toEqual({ rank: 1, correctCount: 2 });
      expect(result.top).toEqual([
        { rank: 1, correctCount: 2, isYou: true, label: 'You' },
        { rank: 2, correctCount: 1, isYou: false, label: 'Candidate 3' },
        { rank: 3, correctCount: 0, isYou: false, label: 'Candidate 1' },
      ]);
    });

    it('reports the true rank of a viewer outside the top 30, without including them in top', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = Array.from({ length: 50 }, (_, i) =>
        baseAttempt({
          id: `attempt-${i}`,
          invitationId: `inv-${i}`,
          candidateId: `cand-${i}`,
          questionOrderJson: JSON.stringify(['q1']),
          answers: [
            {
              questionId: 'q1',
              selectedOptionIdsJson: JSON.stringify(['q1-correct']),
              answeredAt: new Date(2026, 0, 1, 0, 0, i),
            },
          ],
        }),
      );
      const invitations = Array.from({ length: 50 }, (_, i) => ({
        id: `inv-${i}`,
        invitedAt: new Date(2026, 0, 1, 0, 0, i),
      }));
      const tx = mockTx([q1], attempts, [], invitations);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      // attempt-44 sorts to rank 45 (earliest-answered attempt is rank 1).
      const result = await service.computeCandidateView(context, 'exam-1', 'inv-44');

      expect(result.you).toEqual({ rank: 45, correctCount: 1 });
      expect(result.top).toHaveLength(30);
      expect(result.top.some((row) => row.isYou)).toBe(false);
    });

    it('returns you: null and top: [] when no attempts have started', async () => {
      const tx = mockTx([], []);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.computeCandidateView(context, 'exam-1', 'inv-1');

      expect(result).toEqual({ you: null, top: [] });
    });
  });

  describe('caching', () => {
    const q1 = mcqQuestion('q1', 'q1-correct');
    const attempts = [baseAttempt({ id: 'a1', invitationId: 'inv-1', candidateId: 'c1', questionOrderJson: JSON.stringify(['q1']), answers: [] })];

    it('recomputes once per exam within the TTL, no matter how many polls arrive', async () => {
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      await service.compute(context, 'exam-hot');
      await service.compute(context, 'exam-hot');
      await service.compute(context, 'exam-hot');

      // The whole point: 1000 candidates polling must not be 1000 recomputes.
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    });

    it('shares one in-flight computation across concurrent pollers (single-flight)', async () => {
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      await Promise.all([service.compute(context, 'exam-hot'), service.compute(context, 'exam-hot'), service.compute(context, 'exam-hot')]);

      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    });

    it('keeps different exams isolated', async () => {
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([], [])));

      await service.compute(context, 'exam-a');
      await service.compute(context, 'exam-b');

      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failed computation', async () => {
      tenantPrisma.forTenant.mockRejectedValueOnce(new Error('db down'));
      await expect(service.compute(context, 'exam-x')).rejects.toThrow('db down');

      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([], [])));
      await expect(service.compute(context, 'exam-x')).resolves.toEqual([]);
    });
  });
});
