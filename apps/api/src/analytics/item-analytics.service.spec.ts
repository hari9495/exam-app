import { ItemAnalyticsService } from './item-analytics.service';
import { TenantContext } from '@exam-platform/shared';

const context = { organizationId: 'org-1', isSuperAdmin: false } as TenantContext;

function serviceWith(aggregateRows: unknown[], optionRows: unknown[]) {
  const queryRaw = jest.fn()
    .mockResolvedValueOnce(aggregateRows)
    .mockResolvedValueOnce(optionRows);
  const tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) => fn({ $queryRaw: queryRaw })) };
  return { service: new ItemAnalyticsService(tenantPrisma as never), queryRaw };
}

describe('ItemAnalyticsService.forQuestion', () => {
  it('reports insufficient data without computing statistics', async () => {
    const { service } = serviceWith([{ question_id: 'q1', n: 7, p: 0.5, m1: 60, m0: 40, sd_rest: 10 }], []);
    const result = await service.forQuestion(context, 'q1');
    expect(result.hasEnoughData).toBe(false);
    expect(result.responses).toBe(7);
    expect(result.percentCorrect).toBeNull();
    expect(result.discrimination).toBeNull();
    expect(result.flags).toEqual([]);
  });

  it('computes statistics and flags once the threshold is met', async () => {
    const { service } = serviceWith(
      [{ question_id: 'q1', n: 40, p: 0.5, m1: 40, m0: 60, sd_rest: 10 }],
      [
        { option_id: 'a', is_correct: true, selections: 20 },
        { option_id: 'b', is_correct: false, selections: 20 },
      ],
    );
    const result = await service.forQuestion(context, 'q1');
    expect(result.hasEnoughData).toBe(true);
    expect(result.responses).toBe(40);
    expect(result.percentCorrect).toBeCloseTo(0.5, 5);
    expect(result.discrimination as number).toBeLessThan(0);
    expect(result.flags.map((f) => f.code)).toContain('miskeyed_suspect');
  });

  it('reports a question with no responses at all as insufficient', async () => {
    const { service } = serviceWith([], []);
    const result = await service.forQuestion(context, 'q1');
    expect(result.hasEnoughData).toBe(false);
    expect(result.responses).toBe(0);
  });

  it('runs inside forTenant so RLS scopes the query', async () => {
    const { service } = serviceWith([], []);
    const tenantPrisma = (service as unknown as { tenantPrisma: { forTenant: jest.Mock } }).tenantPrisma;
    await service.forQuestion(context, 'q1');
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });
});

describe('ItemAnalyticsService.flagged', () => {
  it('returns only flagged questions, most severe first', async () => {
    const { service } = serviceWith(
      [
        { question_id: 'healthy', n: 40, p: 0.6, m1: 62, m0: 40, sd_rest: 10 },
        { question_id: 'weak', n: 40, p: 0.5, m1: 51, m0: 49, sd_rest: 10 },
        { question_id: 'miskeyed', n: 40, p: 0.5, m1: 40, m0: 60, sd_rest: 10 },
      ],
      [],
    );
    const results = await service.flagged(context);
    expect(results.map((r) => r.questionId)).toEqual(['miskeyed', 'weak']);
  });

  it('carries the question text so a listing can render without a second fetch', async () => {
    const { service } = serviceWith(
      [{ question_id: 'q1', n: 40, p: 0.5, m1: 40, m0: 60, sd_rest: 10, text: 'Which of these is a monad?' }],
      [],
    );
    const result = await service.flagged(context);
    expect(result[0].text).toBe('Which of these is a monad?');
  });
});
