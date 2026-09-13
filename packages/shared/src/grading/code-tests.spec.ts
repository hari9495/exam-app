import { normalizeOutput, outputsMatch, parseCodeTests, validateCodeTests, scoreCodeTests } from './code-tests';

describe('normalizeOutput / outputsMatch', () => {
  it('ignores trailing whitespace + trailing newlines', () => {
    expect(outputsMatch('42\n', '42')).toBe(true);
    expect(outputsMatch('a \nb\t\n', 'a\nb')).toBe(true);
    expect(outputsMatch('a\r\nb', 'a\nb')).toBe(true);
  });
  it('is sensitive to in-line spacing and content', () => {
    expect(outputsMatch('a  b', 'a b')).toBe(false);
    expect(outputsMatch('43', '42')).toBe(false);
  });
});

describe('parseCodeTests', () => {
  it('returns [] for null / non-array / bad json', () => {
    expect(parseCodeTests(null)).toEqual([]);
    expect(parseCodeTests('{bad')).toEqual([]);
    expect(parseCodeTests('{"a":1}')).toEqual([]);
  });
  it('keeps well-formed entries, defaults weight/hidden, drops entries with no expected output', () => {
    const json = JSON.stringify([
      { stdin: '2 3', expectedStdout: '5', weight: 2, hidden: false },
      { expectedStdout: 'x' },
      { stdin: 'y' }, // no expectedStdout -> dropped
    ]);
    expect(parseCodeTests(json)).toEqual([
      { stdin: '2 3', expectedStdout: '5', weight: 2, hidden: false },
      { stdin: '', expectedStdout: 'x', weight: 1, hidden: true },
    ]);
  });
});

describe('validateCodeTests', () => {
  it('normalizes valid input', () => {
    expect(validateCodeTests([{ stdin: '1', expectedStdout: '1' }])).toEqual([{ stdin: '1', expectedStdout: '1', weight: 1, hidden: true }]);
    expect(validateCodeTests(undefined)).toEqual([]);
  });
  it('rejects bad shapes', () => {
    expect(() => validateCodeTests('nope')).toThrow();
    expect(() => validateCodeTests([{ stdin: 'x' }])).toThrow(); // no expected output
    expect(() => validateCodeTests([{ expectedStdout: 'x', weight: 0 }])).toThrow();
    expect(() => validateCodeTests(Array.from({ length: 31 }, () => ({ expectedStdout: 'x' })))).toThrow();
  });
});

describe('scoreCodeTests', () => {
  it('awards partial marks by passed weight', () => {
    // 10 marks, tests weighted 1/1/2, first two pass (weight 2 of 4) -> 5
    expect(scoreCodeTests([{ weight: 1, passed: true }, { weight: 1, passed: true }, { weight: 2, passed: false }], 10))
      .toEqual({ marksAwarded: 5, passed: 2, total: 3, allPassed: false });
  });
  it('full marks when all pass; zero when none', () => {
    expect(scoreCodeTests([{ weight: 1, passed: true }, { weight: 3, passed: true }], 8)).toMatchObject({ marksAwarded: 8, allPassed: true });
    expect(scoreCodeTests([{ weight: 1, passed: false }], 8)).toMatchObject({ marksAwarded: 0, allPassed: false });
  });
  it('handles the empty case', () => {
    expect(scoreCodeTests([], 5)).toEqual({ marksAwarded: 0, passed: 0, total: 0, allPassed: false });
  });
});
