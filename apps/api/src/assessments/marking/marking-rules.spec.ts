import { farApart, markState, nextRound } from './marking-rules';

describe('AS-6 marking rules (PRC-19)', () => {
  const one = { double: false, gapPercent: 25, max: 12 };
  const two = { double: true, gapPercent: 25, max: 12 };
  const m = (round: number, marks: number, markerUserId: string) => ({ round, marks, markerUserId });

  it('one marker: the first mark is final', () => {
    expect(markState([], one)).toEqual({ status: 'needs_first' });
    expect(markState([m(1, 7, 'a')], one)).toEqual({ status: 'final', marks: 7, moderated: false });
  });

  it('two markers: close marks average (half up); far marks go to a moderator whose mark is final', () => {
    expect(markState([m(1, 7, 'a')], two)).toEqual({ status: 'needs_second' });
    expect(markState([m(1, 7, 'a'), m(2, 8, 'b')], two)).toEqual({ status: 'final', marks: 8, moderated: false });
    expect(markState([m(1, 2, 'a'), m(2, 9, 'b')], two)).toEqual({ status: 'needs_moderation', a: 2, b: 9 });
    expect(markState([m(1, 2, 'a'), m(2, 9, 'b'), m(3, 6, 'c')], two)).toEqual({ status: 'final', marks: 6, moderated: true });
    expect(farApart(5, 8, 25, 12)).toBe(false);
    expect(farApart(5, 9, 25, 12)).toBe(true);
  });

  it('negative: nobody marks twice; the moderator is neither marker; a final answer takes no more marks', () => {
    const rows = [m(1, 2, 'a'), m(2, 9, 'b')];
    const s = markState(rows, two);
    expect(nextRound(s, rows, 'a')).toEqual({ refused: 'You have already marked this answer.' });
    expect(nextRound(s, rows, 'c')).toEqual({ round: 3 });
    const fin = [m(1, 7, 'a')];
    expect(nextRound(markState(fin, one), fin, 'b')).toEqual({ refused: 'This answer already has its final mark.' });
  });
});
