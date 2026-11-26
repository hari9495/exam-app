import { BadRequestException } from '@nestjs/common';
import { joinedRun } from './leave-rules';
import { parseRules } from './time-core';

// Answers 2756 (most days in a row) and 2758 (types that cannot touch), positive and negative.
const T = 'type-el';
const O = 'type-cl';
const day = (on: string, type = T, portion = 1) => ({ on, portion, type });
// Monday 2026-12-07 to Friday 2026-12-11; weekend 12-13; Monday 14.
const weekend = new Set(['2026-12-05', '2026-12-06', '2026-12-12', '2026-12-13']);
const base = { typeId: T, off: weekend, lo: '2026-11-01', hi: '2027-01-31' };

describe('joinedRun (2756, 2758)', () => {
  it('a request alone is its own run; the edges are the working days just outside it', () => {
    expect(joinedRun({ ...base, from: '2026-12-09', to: '2026-12-10', total: 2, around: [] })).toMatchObject({ run: 2, before: '2026-12-08', after: '2026-12-11', edges: [] });
  });

  it('leave of the same type across a weekend joins the run (Thu-Fri, weekend, then Mon-Tue = 4)', () => {
    const r = joinedRun({ ...base, from: '2026-12-14', to: '2026-12-15', total: 2, around: [day('2026-12-10'), day('2026-12-11')] });
    expect(r.run).toBe(4);
    expect(r.before).toBe('2026-12-09');
  });

  it('half days count as half; a working day between breaks the run', () => {
    expect(joinedRun({ ...base, from: '2026-12-14', to: '2026-12-14', total: 1, around: [day('2026-12-11', T, 0.5)] }).run).toBe(1.5);
    expect(joinedRun({ ...base, from: '2026-12-14', to: '2026-12-14', total: 1, around: [day('2026-12-10')] }).run).toBe(1);
  });

  it('another type touching across the weekend is an edge; one a working day away is not', () => {
    expect(joinedRun({ ...base, from: '2026-12-14', to: '2026-12-14', total: 1, around: [day('2026-12-11', O)] }).edges).toEqual([expect.objectContaining({ type: O, on: '2026-12-11' })]);
    expect(joinedRun({ ...base, from: '2026-12-14', to: '2026-12-14', total: 1, around: [day('2026-12-10', O)] }).edges).toEqual([]);
  });

  it('the rules check the new values (positive and negative)', () => {
    const id = '0b8a4c3e-6a1e-4c55-9a51-1f8f3c3a2b10';
    expect(parseRules({ maxConsecutiveDays: 5, notWithTypes: [id, id] })).toMatchObject({ maxConsecutiveDays: 5, notWithTypes: [id] });
    expect(() => parseRules({ maxConsecutiveDays: 0 })).toThrow(BadRequestException);
    expect(() => parseRules({ maxConsecutiveDays: 3, maxDays: 4 })).toThrow('in a row of 3');
    expect(() => parseRules({ notWithTypes: [] })).toThrow(BadRequestException);
    expect(() => parseRules({ notWithTypes: ['CL'] })).toThrow(BadRequestException);
  });
});
