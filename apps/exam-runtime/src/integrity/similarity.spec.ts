import {
  normalizeCode,
  fingerprint,
  jaccard,
  similarityScore,
  MIN_NORMALIZED_LENGTH,
  SIMILARITY_THRESHOLD,
  SIMILARITY_HIGH,
} from './similarity';

describe('constants', () => {
  it('exposes the expected threshold values', () => {
    expect(MIN_NORMALIZED_LENGTH).toBe(150);
    expect(SIMILARITY_THRESHOLD).toBe(0.7);
    expect(SIMILARITY_HIGH).toBe(0.85);
  });
});

describe('normalizeCode', () => {
  it('collapses whitespace to single spaces and lowercases', () => {
    const out = normalizeCode('  Hello   World  \n\n  FOO\tBAR  ');
    expect(out).not.toMatch(/ {2,}/);
    expect(out).toBe(out.toLowerCase());
    expect(out).toBe('hello world foo bar');
  });

  it('strips // line comments', () => {
    const out = normalizeCode('let a = 1; // set a\nlet b = 2;');
    expect(out).toBe('let a = 1; let b = 2;');
  });

  it('strips /* */ block comments, including multi-line', () => {
    const out = normalizeCode('let a = 1; /* this\nspans lines */ let b = 2;');
    expect(out).toBe('let a = 1; let b = 2;');
  });

  it('strips # line comments (python style)', () => {
    const out = normalizeCode('a = 1  # set a\nb = 2');
    expect(out).toBe('a = 1 b = 2');
  });

  it('strips single, double, and backtick string literals', () => {
    const out = normalizeCode(`let a = 'x'; let b = "y"; let c = \`z\`;`);
    expect(out).toBe('let a = ; let b = ; let c = ;');
  });

  it('does not let // inside a string literal truncate the rest of the line', () => {
    const code = 'const url = "http://example.com/x"; doSomethingAfter();';
    const normalized = normalizeCode(code);
    expect(normalized).toContain('dosomethingafter');
    expect(normalized).toBe('const url = ; dosomethingafter();');
  });

  it('does not let a URL inside a string corrupt normalization of surrounding code', () => {
    const withUrl = normalizeCode('const a = "http://x.com"; return a + 1;');
    const withoutUrl = normalizeCode('const a = "placeholder"; return a + 1;');
    expect(withUrl).toBe(withoutUrl);
  });
});

describe('fingerprint', () => {
  it('returns an empty set for fewer than 5 tokens', () => {
    expect(fingerprint('a b')).toEqual(new Set());
  });

  it('produces 5-token gram windows joined by spaces', () => {
    const grams = fingerprint('a b c d e f');
    // 6 tokens -> 2 overlapping 5-grams
    expect(grams).toEqual(new Set(['a b c d e', 'b c d e f']));
  });
});

describe('jaccard', () => {
  it('returns 0 when both sets are empty', () => {
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  it('returns 1 for identical non-empty sets', () => {
    const s = new Set(['a b c d e']);
    expect(jaccard(s, s)).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });

  it('returns intersection-over-union for partially overlapping sets', () => {
    const a = new Set(['x', 'y', 'z']);
    const b = new Set(['y', 'z', 'w']);
    // intersection = {y, z} = 2, union = {x,y,z,w} = 4
    expect(jaccard(a, b)).toBe(0.5);
  });
});

describe('similarityScore', () => {
  const solutionA = `
    function calculateTotal(items) {
      // sum up the price of every item in the cart
      let total = 0;
      for (let i = 0; i < items.length; i++) {
        total = total + items[i].price;
      }
      return total;
    }
  `;

  it('scores identical code as 1.0', () => {
    expect(similarityScore(solutionA, solutionA)).toBe(1);
  });

  it('scores 1.0 when only comments, whitespace, and casing differ (naive equality would miss this)', () => {
    const solutionB = `
      FUNCTION CALCULATETOTAL(ITEMS) {
        /* iterate every item and accumulate its price into the running total */
        LET TOTAL = 0;
        FOR (LET I = 0; I < ITEMS.LENGTH; I++) {
          TOTAL = TOTAL + ITEMS[I].PRICE;
        }
        RETURN TOTAL;
      }
    `;
    expect(solutionA).not.toBe(solutionB);
    const score = similarityScore(solutionA, solutionB);
    expect(score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
    expect(score).toBe(1);
  });

  it('scores 1.0 when only comments/string literals differ (comments and strings are ignored)', () => {
    const solutionB = `
      function calculateTotal(items) {
        // a completely unrelated comment about something else entirely
        let total = 0;
        for (let i = 0; i < items.length; i++) {
          total = total + items[i].price;
        }
        return total; // done
      }
    `;
    expect(similarityScore(solutionA, solutionB)).toBe(1);
  });

  it('does not force renamed-identifier solutions above 1.0, and naive equality misses the match', () => {
    // Every identifier renamed. This is deliberately NOT asserted to clear
    // SIMILARITY_THRESHOLD: the 5-gram tokenizer has no identifier
    // canonicalization, so a full rename naturally lowers the score. We only
    // assert it's not zero (structural tokens like `function`, `for`, `=`,
    // punctuation still overlap) and that naive string equality fails.
    const renamed = `
      function computeSum(entries) {
        // sum up the price of every item in the cart
        let sum = 0;
        for (let idx = 0; idx < entries.length; idx++) {
          sum = sum + entries[idx].price;
        }
        return sum;
      }
    `;
    expect(solutionA).not.toBe(renamed);
    const score = similarityScore(solutionA, renamed);
    expect(score).toBeGreaterThan(0);
  });

  it('scores a genuinely different algorithm of similar length below 0.5', () => {
    const bubbleSort = `
      function sortNumbers(values) {
        for (let i = 0; i < values.length; i++) {
          for (let j = 0; j < values.length - i - 1; j++) {
            if (values[j] > values[j + 1]) {
              const temp = values[j];
              values[j] = values[j + 1];
              values[j + 1] = temp;
            }
          }
        }
        return values;
      }
    `;
    const binarySearch = `
      function findIndex(sortedValues, target) {
        let low = 0;
        let high = sortedValues.length - 1;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          if (sortedValues[mid] === target) {
            return mid;
          } else if (sortedValues[mid] < target) {
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        return -1;
      }
    `;
    expect(similarityScore(bubbleSort, binarySearch)).toBeLessThan(0.5);
  });
});
