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

  function mockTx(questions: unknown[], attempts: unknown[], candidates: unknown[] = [], invitations: unknown[] = []) {
    return {
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
        {
          id: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
            { questionId: 'q2', selectedOptionIdsJson: JSON.stringify(['q2-correct']), answeredAt: new Date('2026-01-01T00:00:02Z') },
          ],
        },
        {
          id: 'attempt-2', invitationId: 'inv-2', candidateId: 'cand-2',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
          ],
        },
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1, q2], attempts)));

      const result = await service.compute(context, 'exam-1');

      expect(result).toEqual([
        { attemptId: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1', correctCount: 2, rank: 1 },
        { attemptId: 'attempt-2', invitationId: 'inv-2', candidateId: 'cand-2', correctCount: 1, rank: 2 },
      ]);
    });

    it('breaks ties by whoever reached the count first', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = [
        {
          id: 'attempt-slow', invitationId: 'inv-slow', candidateId: 'cand-slow',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:10Z') }],
        },
        {
          id: 'attempt-fast', invitationId: 'inv-fast', candidateId: 'cand-fast',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') }],
        },
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const result = await service.compute(context, 'exam-1');

      expect(result.map((r) => r.attemptId)).toEqual(['attempt-fast', 'attempt-slow']);
    });

    it('excludes code questions from the correct count', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      // A code question never appears in the `question.findMany` result because the service
      // filters by type in the query itself — simulate that by simply not including it.
      const attempts = [
        {
          id: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1',
          questionOrderJson: JSON.stringify(['q1', 'code-q']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
            { questionId: 'code-q', selectedOptionIdsJson: JSON.stringify([]), answeredAt: new Date('2026-01-01T00:00:02Z') },
          ],
        },
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const result = await service.compute(context, 'exam-1');

      expect(result).toEqual([{ attemptId: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1', correctCount: 1, rank: 1 }]);
    });

    it('ranks an attempt with zero correct answers last, not omitted', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = [
        {
          id: 'attempt-none', invitationId: 'inv-none', candidateId: 'cand-none',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [],
        },
        {
          id: 'attempt-one', invitationId: 'inv-one', candidateId: 'cand-one',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') }],
        },
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
  });

  describe('computeRecruiterView', () => {
    it('returns only the top 30 of more than 30 ranked attempts, with resolved candidate names', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = Array.from({ length: 35 }, (_, i) => ({
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
      }));
      const candidates = Array.from({ length: 35 }, (_, i) => ({ id: `cand-${i}`, name: `Candidate Name ${i}` }));
      const tx = mockTx([q1], attempts, candidates);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.computeRecruiterView(context, 'exam-1');

      expect(result).toHaveLength(30);
      expect(result[0]).toEqual({ rank: 1, candidateId: 'cand-0', candidateName: 'Candidate Name 0', correctCount: 1 });
      expect(result[29]).toEqual({ rank: 30, candidateId: 'cand-29', candidateName: 'Candidate Name 29', correctCount: 1 });
      expect(result.map((r) => r.candidateId)).not.toContain('cand-30');
    });

    it('returns an empty array and skips the candidate lookup when no attempts have started', async () => {
      const tx = mockTx([], []);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.computeRecruiterView(context, 'exam-1');

      expect(result).toEqual([]);
      expect(tx.candidate.findMany).not.toHaveBeenCalled();
    });
  });

  describe('computeCandidateView', () => {
    it("labels the viewer's row 'You' and labels others by invitedAt order rather than rank or leaderboard order", async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const q2 = mcqQuestion('q2', 'q2-correct');
      const attempts = [
        {
          id: 'attempt-A', invitationId: 'inv-A', candidateId: 'cand-A',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
            { questionId: 'q2', selectedOptionIdsJson: JSON.stringify(['q2-correct']), answeredAt: new Date('2026-01-01T00:00:02Z') },
          ],
        },
        {
          id: 'attempt-B', invitationId: 'inv-B', candidateId: 'cand-B',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
          ],
        },
        {
          id: 'attempt-C', invitationId: 'inv-C', candidateId: 'cand-C',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [],
        },
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
      const attempts = Array.from({ length: 50 }, (_, i) => ({
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
      }));
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
});
