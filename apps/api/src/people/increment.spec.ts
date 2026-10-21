import { percentFor, raisedCtc } from './increment';

describe('annual increment maths (PPL-06)', () => {
  it('rounds the new CTC to whole rupees, half up', () => {
    expect(raisedCtc('540000.00', '8')).toBe('583200.00');
    expect(raisedCtc('333333.00', '7.5')).toBe('358333.00'); // 358332.975 → 358333
    expect(raisedCtc('100001.00', '0.5')).toBe('100501.00'); // 100501.005 → 100501
    expect(raisedCtc('250000.00', '2.25')).toBe('255625.00');
    expect(raisedCtc('199999.00', '0.25')).toBe('200499.00'); // 200498.9975 → 200499
  });

  it('a person’s own raise wins over the rule; no rating means no raise by rating', () => {
    const byRating = { mode: 'rating' as const, byRating: [{ band: 'Exceeds', percent: '12' }, { band: 'Meets', percent: '8' }] };
    expect(percentFor(byRating, 'Meets')).toBe('8');
    expect(percentFor(byRating, 'Below')).toBeNull();
    expect(percentFor(byRating, null)).toBeNull();
    expect(percentFor(byRating, null, '5')).toBe('5');
    expect(percentFor({ mode: 'percent', percent: '6' }, null)).toBe('6');
  });
});
