import { impactRows, surveySummary } from './fairness-rules';

describe('AS-6 fairness rules (answers 2019, 2165)', () => {
  it('pass rates per group with the four-fifths rule against the best-shown group', () => {
    const { rows, finding } = impactRows([{ group: 'Men', attempts: 100, passed: 60 }, { group: 'Women', attempts: 80, passed: 36 }], 30);
    expect(rows.map((r) => [r.group, r.rate, Number(r.ratio?.toFixed(2)), r.status])).toEqual([['Men', 0.6, 1, 'ok'], ['Women', 0.45, 0.75, 'flagged']]);
    expect(finding).toEqual({ group: 'Women', ratio: 0.75 });
  });

  it('negative: a small group is hidden and never compared; one group alone has no finding', () => {
    const { rows, finding } = impactRows([{ group: 'Men', attempts: 100, passed: 60 }, { group: 'Another way', attempts: 7, passed: 1 }], 30);
    expect(rows[1]).toEqual({ group: 'Another way', attempts: null, rate: null, ratio: null, status: 'hidden' });
    expect(finding).toBeNull();
  });

  it('the survey shows only from 5 answers, and the instructions share only from 5 answers to it', () => {
    expect(surveySummary([{ rating: 4, clearInstructions: true }])).toBeNull();
    const five = [5, 4, 4, 3, 5].map((rating, i) => ({ rating, clearInstructions: i < 4 ? true : null }));
    expect(surveySummary(five)).toEqual({ responses: 5, averageRating: 4.2, clearPercent: null });
    expect(surveySummary(five.map((r) => ({ ...r, clearInstructions: true })))!.clearPercent).toBe(100);
  });
});
