import { selectCountedAnswers } from './select-counted-answers';

const q = (questionId: string, marks: number, marksAwarded: number) => ({ questionId, marks, marksAwarded });

describe('selectCountedAnswers', () => {
  it('counts every question when requiredCount is null (today\'s behaviour)', () => {
    const result = selectCountedAnswers([q('a', 5, 5), q('b', 5, 0)], null);
    expect(result).toEqual({ countedQuestionIds: ['a', 'b'], score: 5, maxScore: 10 });
  });

  it('counts every question when requiredCount is undefined (legacy snapshot with no key)', () => {
    const result = selectCountedAnswers([q('a', 5, 5), q('b', 5, 0)], undefined);
    expect(result).toEqual({ countedQuestionIds: ['a', 'b'], score: 5, maxScore: 10 });
  });

  it('keeps only the best N when more than N were attempted', () => {
    // Best 3 of 5, all worth 10. Awarded 10/0/10/7/0 -> keep a (10), c (10), d (7) = 27 of 30.
    const result = selectCountedAnswers(
      [q('a', 10, 10), q('b', 10, 0), q('c', 10, 10), q('d', 10, 7), q('e', 10, 0)],
      3,
    );
    expect(result.countedQuestionIds.sort()).toEqual(['a', 'c', 'd']);
    expect(result.score).toBe(27);
    expect(result.maxScore).toBe(30);
  });

  it('breaks ties by question order, not by object key order', () => {
    // All tied at 5. The first three in the supplied order must win, deterministically.
    const result = selectCountedAnswers(
      [q('a', 10, 5), q('b', 10, 5), q('c', 10, 5), q('d', 10, 5)],
      3,
    );
    expect(result.countedQuestionIds).toEqual(['a', 'b', 'c']);
  });

  it('still scores out of N when FEWER than N were answered', () => {
    // Required 3, only 2 attempted. The empty slot contributes 0 but still counts toward max.
    const result = selectCountedAnswers(
      [q('a', 10, 10), q('b', 10, 8), q('c', 10, 0), q('d', 10, 0), q('e', 10, 0)],
      3,
    );
    expect(result.score).toBe(18);
    expect(result.maxScore).toBe(30);
  });

  it('takes the top N MARKS for the denominator, even when the bank drifted to unequal marks', () => {
    // Publish validation normally forbids this, but a pool's eligible bank can change after
    // publish. Denominator must be the best achievable (20+20+10 = 50), never throw.
    const result = selectCountedAnswers(
      [q('a', 10, 10), q('b', 10, 0), q('c', 10, 0), q('d', 20, 0), q('e', 20, 0)],
      3,
    );
    expect(result.maxScore).toBe(50);
    expect(result.score).toBe(10);
  });

  it('never returns a negative score -- a section floored at zero under negative marking', () => {
    const result = selectCountedAnswers([q('a', 5, -3), q('b', 5, -2), q('c', 5, -1)], 2);
    expect(result.score).toBe(0);
  });

  it('returns an empty selection for a section with no questions', () => {
    expect(selectCountedAnswers([], 3)).toEqual({ countedQuestionIds: [], score: 0, maxScore: 0 });
  });

  it('clamps a requiredCount larger than the question count', () => {
    const result = selectCountedAnswers([q('a', 10, 10), q('b', 10, 4)], 5);
    expect(result.score).toBe(14);
    expect(result.maxScore).toBe(20);
  });
});
