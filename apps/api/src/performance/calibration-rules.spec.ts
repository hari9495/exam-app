import { changeProblem, csvCell, distribution, guideForScale, guideProblem, parseGuideShares, suppress, toCsv } from './calibration-rules';

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

describe('company guide (answer 2845)', () => {
  it('reads rating and share pairs that add up to 100', () => {
    expect(parseGuideShares('Needs improvement:10, Meets:70,Exceeds:20')).toEqual({ bands: guide.bands });
    expect(parseGuideShares('Meets:62.5,Exceeds:37.5')).toEqual({ bands: [{ label: 'Meets', share: 62.5 }, { label: 'Exceeds', share: 37.5 }] });
  });

  it('refuses a bad guide with the reason', () => {
    expect(parseGuideShares('Meets:70,Exceeds:20')).toEqual({ problem: 'The shares add up to 90, not 100.' });
    expect(parseGuideShares('Meets 70,Exceeds:30')).toMatchObject({ problem: expect.stringMatching(/like "Meets:55"/) });
    expect(parseGuideShares('Meets:120,Exceeds:-20')).toMatchObject({ problem: expect.stringMatching(/between 0 and 100/) });
    expect(parseGuideShares('Meets:50,meets:50')).toMatchObject({ problem: expect.stringMatching(/twice/) });
    expect(parseGuideShares(' , ')).toMatchObject({ problem: expect.stringMatching(/at least one/) });
  });

  it('fills a scale only when the guide names exactly its bands, in the scale’s order and spelling', () => {
    const g = guideForScale([{ label: 'exceeds', share: 20 }, { label: 'Meets', share: 70 }, { label: 'Needs improvement', share: 10 }], LABELS, 5);
    expect(g).toEqual({ bands: [{ label: 'Needs improvement', share: 10 }, { label: 'Meets', share: 70 }, { label: 'Exceeds', share: 20 }], tolerance: 5 });
    expect(guideProblem(g!, LABELS)).toBeNull();
    expect(guideForScale([{ label: 'Meets', share: 100 }], LABELS, 5)).toBeNull();
    expect(guideForScale([...guide.bands, { label: 'Stellar', share: 0 }], LABELS, 5)).toBeNull();
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
