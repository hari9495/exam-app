import { allocationMinutes, bulkOk, commentsText, dayCommentProblems, lineApproved, reduceMinutes, sevenComments, weekOutcome, wordCount } from './line-rules';

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

describe('the timesheet comment per day (answer 1787)', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
  it('counts words, not characters or spaces', () => {
    expect(wordCount('  Built the  checkout\npage. ')).toBe(4);
    expect(wordCount('')).toBe(0);
    expect(wordCount(null)).toBe(0);
  });
  it('each day with hours needs N words; 19 is refused, 20 accepted; days with no hours need none', () => {
    const rule = { required: true, minWords: 20 };
    const mins = [480, 240, 0, 0, 0, 0, 0];
    expect(dayCommentProblems(rule, mins, [words(20), words(19)])).toEqual([{ day: 1, words: 19 }]);
    expect(dayCommentProblems(rule, mins, [words(20), ''])).toEqual([{ day: 1, words: 0 }]);
    expect(dayCommentProblems(rule, mins, [words(20), words(20)])).toEqual([]);
    expect(dayCommentProblems(rule, [0, 0, 0, 0, 0, 0, 0], [])).toEqual([]);
    expect(dayCommentProblems({ required: false, minWords: 20 }, mins, [])).toEqual([]);
  });
  it('seven comments, trimmed; one text for readers outside the timesheet', () => {
    expect(sevenComments([' a ', null])).toEqual(['a', '', '', '', '', '', '']);
    expect(commentsText(['Fixed the build', '', 'Client call'])).toBe('Mon: Fixed the build\nWed: Client call');
    expect(commentsText([])).toBe('');
  });
});
