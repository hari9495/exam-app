import { bandPosition, belowMedian, budgetUse, cellFor, compaRatio, matrixProblem, meritFor, outOfRange, payGap, splitPool, type Cell } from './comp-rules';

// PM-7.01 … 7.07 (§12; Q6, YX-PERF-10, YX-PERF-18, PAY-39).
const cell = (band: string, compaFrom: number | null, compaTo: number | null, minPct: number, targetPct: number, maxPct: number): Cell => ({ band, compaFrom, compaTo, minPct, targetPct, maxPct });
const EXCEEDS = [cell('Exceeds', null, 0.9, 10, 12, 14), cell('Exceeds', 0.9, 1.1, 7, 9, 11), cell('Exceeds', 1.1, null, 4, 6, 8)];

describe('matrix (PM-7.01)', () => {
  it('cells tile the compa-ratio axis', () => {
    expect(matrixProblem('compa_ratio', ['Exceeds'], EXCEEDS)).toBeNull();
    expect(matrixProblem('compa_ratio', ['Exceeds'], [EXCEEDS[0], EXCEEDS[2]])).toMatch(/gap or overlap/);
    expect(matrixProblem('compa_ratio', ['Exceeds', 'Meets'], EXCEEDS)).toMatch(/Meets has no cell/);
    expect(matrixProblem('compa_ratio', ['Exceeds'], [cell('Exceeds', null, null, 9, 8, 10)])).toMatch(/minimum ≤ target ≤ maximum/);
    expect(matrixProblem('rating_only', ['Exceeds'], [cell('Exceeds', null, null, 5, 6, 8)])).toBeNull();
  });
});

describe('proposals (PM-7.02)', () => {
  it('"Exceeds" with compa 0.85 suggests 10–14 %, target 12 %', () => {
    const ratio = compaRatio(850_000, 1_000_000);
    expect(ratio).toBe(0.85);
    expect(cellFor(EXCEEDS, 'Exceeds', ratio)).toMatchObject({ minPct: 10, targetPct: 12, maxPct: 14 });
    expect(meritFor(850_000, cellFor(EXCEEDS, 'Exceeds', ratio), 1)).toEqual({ pct: 12, amount: 102_000 });
  });

  it('without a range the middle cell is used (Q6)', () => {
    expect(cellFor(EXCEEDS, 'Exceeds', compaRatio(900_000, null))).toMatchObject({ targetPct: 9 });
  });

  it('20 % is out of range and needs a justification; a promotion always does (YX-PERF-10)', () => {
    const c = cellFor(EXCEEDS, 'Exceeds', 0.85);
    expect(outOfRange(20, c, 1, false)).toBe(true);
    expect(outOfRange(13, c, 1, false)).toBe(false);
    expect(outOfRange(13, c, 1, true)).toBe(true);
  });

  it('a July joiner’s merit is prorated 9/12', () => {
    expect(meritFor(1_000_000, cellFor(EXCEEDS, 'Exceeds', 0.85), 0.75)).toEqual({ pct: 9, amount: 90_000 });
    expect(outOfRange(9, cellFor(EXCEEDS, 'Exceeds', 0.85), 0.75, false)).toBe(false);
  });
});

describe('budgets and bonus (PM-7.03, 7.04)', () => {
  it('counts used and remaining, and over-budget', () => {
    expect(budgetUse(100_000, [40_000.5, 59_999.5])).toEqual({ used: 100_000, remaining: 0, over: false });
    expect(budgetUse(100_000, [60_000, 50_000])).toMatchObject({ remaining: -10_000, over: true });
  });

  it('splits a pool by target × multiplier, adding up to the pool exactly', () => {
    const s = splitPool(100_000, [{ id: 'a', target: 50_000, multiplier: 1.5 }, { id: 'b', target: 50_000, multiplier: 1 }, { id: 'c', target: 50_000, multiplier: 0.5 }]);
    expect([...s.values()].reduce((a, b) => a + b, 0)).toBe(100_000);
    expect(s.get('a')).toBe(50_000);
    expect(s.get('c')).toBeCloseTo(16_666.66, 1);
    const odd = splitPool(100, [{ id: 'a', target: 1, multiplier: 1 }, { id: 'b', target: 1, multiplier: 1 }, { id: 'c', target: 1, multiplier: 1 }]);
    expect([...odd.values()].reduce((x, y) => Math.round((x + y) * 100) / 100, 0)).toBe(100);
  });
});

describe('pay band and pay equity (PM-7.07)', () => {
  it('places a person in their band', () => {
    expect(bandPosition(500_000, { min: 600_000, mid: 800_000, max: 1_000_000 })).toEqual({ position: 'below', quartile: null });
    expect(bandPosition(850_000, { min: 600_000, mid: 800_000, max: 1_000_000 })).toEqual({ position: 'within', quartile: 3 });
  });

  it('suppresses a small group and computes the gaps', () => {
    const rows = [
      ...[100, 110, 120].map((pay) => ({ group: 'women', grade: 'G1', pay })),
      ...[120, 130, 140].map((pay) => ({ group: 'men', grade: 'G1', pay })),
      { group: 'other', grade: 'G1', pay: 125 },
    ];
    const g = payGap(rows, 3);
    expect(g.find((x) => x.group === 'other')).toEqual({ group: 'other', count: null, suppressed: true });
    expect(g.find((x) => x.group === 'women')).toMatchObject({ count: 3, suppressed: false });
    expect((g.find((x) => x.group === 'women') as { meanGapPct: number }).meanGapPct).toBeLessThan(0);
  });

  it('flags people more than 10 % below their grade-and-role median', () => {
    expect(belowMedian([{ id: 'a', grade: 'G1', role: 'r', pay: 80 }, { id: 'b', grade: 'G1', role: 'r', pay: 100 }, { id: 'c', grade: 'G1', role: 'r', pay: 100 }], 10)).toEqual(['a']);
  });
});
