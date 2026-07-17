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

  function mockTx(questions: unknown[], attempts: unknown[]) {
    return {
      attempt: { findMany: jest.fn().mockResolvedValue(attempts) },
      question: { findMany: jest.fn().mockResolvedValue(questions) },
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
});
