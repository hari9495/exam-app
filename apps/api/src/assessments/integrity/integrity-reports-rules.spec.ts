import { collusionClusters, isoWeek, timingText, weightedKappa, type WrongAnswers } from './integrity-reports-rules';

const at = (min: number) => new Date(Date.UTC(2026, 10, 17, 9, min));
const wa = (attemptId: string, wrong: Record<string, string>, start: Date | null = at(0)): WrongAnswers => ({ attemptId, startedAt: start, wrong: new Map(Object.entries(wrong)) });

describe('integrity reports rules (PRC-20)', () => {
  it('links attempts sharing at least the minimum identical wrong answers into one cluster', () => {
    const same = { q1: 'b', q2: 'c', q3: 'a' };
    const out = collusionClusters([wa('a1', same, at(0)), wa('a2', same, at(5)), wa('a3', { ...same, q4: 'd' }, at(12)), wa('a4', { q1: 'c' })], 3);
    expect(out).toEqual([{ attemptIds: ['a1', 'a2', 'a3'], same: 3, startSpreadMinutes: 12 }]);
  });

  it('negative: below the minimum, different wrong options, or one attempt alone is no cluster', () => {
    expect(collusionClusters([wa('a1', { q1: 'b', q2: 'c' }), wa('a2', { q1: 'b', q2: 'c' })], 3)).toEqual([]);
    expect(collusionClusters([wa('a1', { q1: 'b', q2: 'c', q3: 'a' }), wa('a2', { q1: 'c', q2: 'b', q3: 'd' })], 3)).toEqual([]);
    expect(collusionClusters([wa('a1', { q1: 'b' })], 1)).toEqual([]);
  });

  it('negative: a wrong answer most people chose is a common mistake, not a sign', () => {
    const many = Array.from({ length: 12 }, (_, i) => wa(`a${i}`, { q1: 'b', q2: 'c' }));
    expect(collusionClusters(many, 2)).toEqual([]);
  });

  it('an unknown start gives no spread', () => {
    const same = { q1: 'b', q2: 'c' };
    expect(collusionClusters([wa('a1', same, null), wa('a2', same)], 2)[0]!.startSpreadMinutes).toBeNull();
    expect([timingText(null), timingText(20), timingText(180)]).toEqual(['Start time unknown', 'Started within 20 min', 'Started 3 h apart']);
  });

  it('weighted kappa: 1 when two markers always agree; lower as they drift; null with too few answers', () => {
    expect(weightedKappa([{ a: 2, b: 2, max: 4 }, { a: 4, b: 4, max: 4 }])).toBe(1);
    const k = weightedKappa([{ a: 0, b: 1, max: 4 }, { a: 2, b: 2, max: 4 }, { a: 4, b: 3, max: 4 }, { a: 1, b: 1, max: 4 }])!;
    expect(k).toBeGreaterThan(0.7);
    expect(k).toBeLessThan(1);
    expect(weightedKappa([{ a: 0, b: 4, max: 4 }, { a: 4, b: 0, max: 4 }])!).toBeLessThan(0);
    expect(weightedKappa([{ a: 1, b: 1, max: 4 }])).toBeNull();
  });

  it('ISO week labels', () => {
    expect(isoWeek(new Date(Date.UTC(2026, 10, 17)))).toBe('W47');
    expect(isoWeek(new Date(Date.UTC(2026, 0, 1)))).toBe('W1');
  });
});
