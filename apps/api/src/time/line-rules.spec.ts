import { allocationMinutes, bulkOk, lineApproved, noteProblem, reduceMinutes, weekOutcome, wordCount } from './line-rules';

describe('line-by-line approval rules (PRJ-02, answers 1406, 1407, 1442)', () => {
  it('approved minutes follow the decision', () => {
    const minutes = [480, 240, 0, 0, 0, 0, 0];
    expect(lineApproved({ minutes, status: 'approved', approvedMinutes: [] })).toEqual(minutes);
    expect(lineApproved({ minutes, status: null, approvedMinutes: [] })).toEqual(minutes); // a week decided as a whole
    expect(lineApproved({ minutes, status: 'rejected', approvedMinutes: [] })).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(lineApproved({ minutes, status: 'reduced', approvedMinutes: [400, 200, 0, 0, 0, 0, 0] })).toEqual([400, 200, 0, 0, 0, 0, 0]);
  });

  it('a reduction spreads over the booked days, whole minutes, never above a day, never as much as booked', () => {
    expect(reduceMinutes([480, 240, 0, 0, 0, 0, 0], 600)).toEqual([400, 200, 0, 0, 0, 0, 0]);
    const r = reduceMinutes([100, 100, 100, 0, 0, 0, 0], 200);
    expect(r.reduce((a, b) => a + b, 0)).toBe(200);
    expect(r.every((m, k) => m <= [100, 100, 100][k]! || m === 0)).toBe(true);
    expect(reduceMinutes([60, 0, 0, 0, 0, 0, 0], 0)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(() => reduceMinutes([60, 0, 0, 0, 0, 0, 0], 60)).toThrow(RangeError);
    expect(() => reduceMinutes([60, 0, 0, 0, 0, 0, 0], -1)).toThrow(RangeError);
  });

  it('bulk: within the allocation share only, never an unallocated line; the company may lift the share check', () => {
    expect(allocationMinutes(50)).toBe(1200);
    expect(bulkOk({ unallocated: false, weekMinutesOnProject: 1200, allocationPercent: 50, withinAllocation: true })).toBe(true);
    expect(bulkOk({ unallocated: false, weekMinutesOnProject: 1201, allocationPercent: 50, withinAllocation: true })).toBe(false);
    expect(bulkOk({ unallocated: false, weekMinutesOnProject: 60, allocationPercent: null, withinAllocation: true })).toBe(false);
    expect(bulkOk({ unallocated: false, weekMinutesOnProject: 9999, allocationPercent: 10, withinAllocation: false })).toBe(true);
    expect(bulkOk({ unallocated: true, weekMinutesOnProject: 60, allocationPercent: 100, withinAllocation: false })).toBe(false);
  });

  it('the week is decided only when every line is', () => {
    const m = [60, 0, 0, 0, 0, 0, 0];
    expect(weekOutcome([{ status: 'approved', minutes: m, approvedMinutes: [] }, { status: 'pending', minutes: m, approvedMinutes: [] }])).toBeNull();
    expect(weekOutcome([{ status: 'approved', minutes: m, approvedMinutes: [] }, { status: 'rejected', minutes: m, approvedMinutes: [] }])).toBe('approved');
    expect(weekOutcome([{ status: 'rejected', minutes: m, approvedMinutes: [] }])).toBe('rejected');
  });
});

describe('the timesheet note (answers 1731 to 1733)', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
  it('counts words, not characters or spaces', () => {
    expect(wordCount('  Built the  checkout\npage. ')).toBe(4);
    expect(wordCount('')).toBe(0);
    expect(wordCount(null)).toBe(0);
  });
  it('a row with hours needs at least N words when required; 199 is refused, 200 accepted', () => {
    const rule = { required: true, minWords: 200 };
    expect(noteProblem(rule, [480, 0, 0, 0, 0, 0, 0], words(199))).toBe('write at least 200 words about the work (199 so far)');
    expect(noteProblem(rule, [480, 0, 0, 0, 0, 0, 0], words(200))).toBeNull();
    expect(noteProblem(rule, [0, 0, 0, 0, 0, 0, 0], '')).toBeNull(); // no hours, no note needed
    expect(noteProblem({ required: false, minWords: 200 }, [480, 0, 0, 0, 0, 0, 0], '')).toBeNull();
  });
});
