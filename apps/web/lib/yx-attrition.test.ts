import { attritionPeriods } from './yx-attrition';

describe('attrition periods (T2-G 47)', () => {
  it('complete months up to last month, and this year so far; across a year end', () => {
    expect(attritionPeriods('2026-11-27')).toEqual([
      { value: '2025-11|2026-10', label: 'Last 12 months' },
      { value: '2026-05|2026-10', label: 'Last 6 months' },
      { value: '2024-11|2026-10', label: 'Last 24 months' },
      { value: '2026-01|2026-11', label: 'This year so far' },
    ]);
    expect(attritionPeriods('2027-01-05')[0]!.value).toBe('2026-01|2026-12');
  });
});
