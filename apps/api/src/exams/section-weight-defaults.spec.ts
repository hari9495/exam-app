import { computeDefaultWeights } from './section-weight-defaults';

describe('computeDefaultWeights', () => {
  it('returns an empty map for no sections', () => {
    expect(computeDefaultWeights([])).toEqual(new Map());
  });

  it('gives a lone section 100%, regardless of its marks', () => {
    const result = computeDefaultWeights([{ id: 's1', selectionMode: 'fixed', totalMarks: 37 }]);
    expect(result).toEqual(new Map([['s1', 100]]));
  });

  it('splits two fixed sections proportionally to their marks', () => {
    const result = computeDefaultWeights([
      { id: 's1', selectionMode: 'fixed', totalMarks: 30 },
      { id: 's2', selectionMode: 'fixed', totalMarks: 70 },
    ]);
    expect(result).toEqual(new Map([['s1', 30], ['s2', 70]]));
  });

  it('rounds three equal-marks fixed sections to integers summing to exactly 100', () => {
    const result = computeDefaultWeights([
      { id: 's1', selectionMode: 'fixed', totalMarks: 10 },
      { id: 's2', selectionMode: 'fixed', totalMarks: 10 },
      { id: 's3', selectionMode: 'fixed', totalMarks: 10 },
    ]);
    const values = [...result.values()];
    expect(values.reduce((sum, v) => sum + v, 0)).toBe(100);
    // 33.33/33.33/33.33 -- exactly one of them absorbs the rounding remainder to 34.
    expect(values.sort()).toEqual([33, 33, 34]);
  });

  it('splits an all-pool exam equally among its pool sections', () => {
    const result = computeDefaultWeights([
      { id: 's1', selectionMode: 'pool', totalMarks: 0 },
      { id: 's2', selectionMode: 'pool', totalMarks: 0 },
    ]);
    expect(result).toEqual(new Map([['s1', 50], ['s2', 50]]));
  });

  it('reserves pool sections a one-section-equivalent share and splits the rest by marks among fixed sections', () => {
    // 3 sections total (2 fixed + 1 pool) -- the pool section gets 100/3 = 33.33%, same as if
    // it were "one vote" among three; the remaining 66.67% splits 30/70 between the fixed pair.
    const result = computeDefaultWeights([
      { id: 'fixed-a', selectionMode: 'fixed', totalMarks: 30 },
      { id: 'fixed-b', selectionMode: 'fixed', totalMarks: 70 },
      { id: 'pool-a', selectionMode: 'pool', totalMarks: 0 },
    ]);
    const values = [...result.values()];
    expect(values.reduce((sum, v) => sum + v, 0)).toBe(100);
    // 66.67 * 0.3 = 20.0, 66.67 * 0.7 = 46.67, 33.33 -- floors [20, 46, 33] = 99, so the largest
    // fractional remainder (fixed-b's 0.67) absorbs the +1.
    expect(result.get('fixed-a')).toBe(20);
    expect(result.get('fixed-b')).toBe(47);
    expect(result.get('pool-a')).toBe(33);
  });

  it('falls back to an equal split among fixed sections when their combined marks are zero (no questions yet)', () => {
    const result = computeDefaultWeights([
      { id: 's1', selectionMode: 'fixed', totalMarks: 0 },
      { id: 's2', selectionMode: 'fixed', totalMarks: 0 },
    ]);
    expect(result).toEqual(new Map([['s1', 50], ['s2', 50]]));
  });
});
