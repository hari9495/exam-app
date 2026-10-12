import { changeProblem, csvCell, distribution, guideProblem, suppress, toCsv } from './calibration-rules';

// PM-6.01 / 6.02 / 6.03 (§11, §13; Q5, YX-PERF-08).
const LABELS = ['Needs improvement', 'Meets', 'Exceeds'];
const guide = { bands: [{ label: 'Needs improvement', share: 10 }, { label: 'Meets', share: 70 }, { label: 'Exceeds', share: 20 }], tolerance: 10 };
const row = (band: string, protectedLeave = false) => ({ band, protectedLeave });

describe('distribution (§11.2)', () => {
  it('a group of 4 shows no chart, only the list', () => {
    expect(distribution([row('Meets'), row('Meets'), row('Exceeds'), row('Meets')], LABELS, guide, 5)).toEqual({ bands: null, counted: 4, notes: [] });
  });

  it('people on protected leave are not counted', () => {
    const d = distribution([row('Meets'), row('Meets'), row('Meets'), row('Meets'), row('Exceeds'), row('Needs improvement', true)], LABELS, guide, 5);
    expect(d.counted).toBe(5);
    expect(d.bands!.find((b) => b.label === 'Needs improvement')).toMatchObject({ count: 0, share: 0 });
  });

  it('notes a band outside the tolerance, softly', () => {
    const d = distribution([row('Exceeds'), row('Exceeds'), row('Exceeds'), row('Meets'), row('Meets')], LABELS, guide, 5);
    expect(d.notes).toEqual(['Meets: 40% against a guide of 70%.', 'Exceeds: 60% against a guide of 20%.']);
  });

  it('works without a guide', () => {
    expect(distribution([row('Meets'), row('Meets'), row('Meets'), row('Meets'), row('Meets')], LABELS, null, 5).notes).toEqual([]);
  });
});

describe('guide and changes', () => {
  it('a guide adds up to 100 over the scale’s bands', () => {
    expect(guideProblem(guide, LABELS)).toBeNull();
    expect(guideProblem({ ...guide, bands: [{ label: 'Meets', share: 90 }] }, LABELS)).toMatch(/90, not 100/);
    expect(guideProblem({ ...guide, bands: [{ label: 'Stellar', share: 100 }] }, LABELS)).toMatch(/not a band/);
  });

  it('a change needs a reason and a new score on the scale (YX-PERF-08)', () => {
    expect(changeProblem({ from: 4, to: 3, min: 1, max: 5, reason: '' })).toMatch(/reason/);
    expect(changeProblem({ from: 4, to: 4, min: 1, max: 5, reason: 'Same' })).toMatch(/already has/);
    expect(changeProblem({ from: 4, to: 6, min: 1, max: 5, reason: 'Too high' })).toMatch(/between 1 and 5/);
    expect(changeProblem({ from: 4, to: 3, min: 1, max: 5, reason: 'Compared with the plant leads' })).toBeNull();
  });
});

describe('reports', () => {
  it('suppresses small cells', () => {
    expect(suppress([{ k: 'a', count: 2 }, { k: 'b', count: 7 }, { k: 'c', count: 0 }], 5)).toEqual([{ k: 'a', count: null, suppressed: true }, { k: 'b', count: 7 }, { k: 'c', count: 0 }]);
  });

  it('writes CSV safely', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('a, "b"')).toBe('"a, ""b"""');
    expect(toCsv(['x', 'y'], [[1, null]])).toBe('x,y\r\n1,\r\n');
  });
});
