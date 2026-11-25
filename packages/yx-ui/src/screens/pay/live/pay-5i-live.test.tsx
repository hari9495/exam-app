import { describe, expect, it } from 'vitest';
import { periodsOf } from './types-5j';


describe('batch 5i screens', () => {
  it('weekly periods match the API calendar: from the anchor, cut at month ends', () => {
    expect(periodsOf('weekly', '2026-09-28', '2026-10').map((x) => [x.from, x.to])).toEqual([
      ['2026-10-01', '2026-10-04'],
      ['2026-10-05', '2026-10-11'],
      ['2026-10-12', '2026-10-18'],
      ['2026-10-19', '2026-10-25'],
      ['2026-10-26', '2026-10-31'],
    ]);
  });
});
