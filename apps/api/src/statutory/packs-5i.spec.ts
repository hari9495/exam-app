import { readFileSync } from 'fs';
import { join } from 'path';
import { checkShape, runGolden, type GoldenCase, type RuleSet } from './evaluator';

// Batch 5i rule data: the UAE and US country packs and the IR Code lay-off share pass their golden cases and shape
// checks, the same gate a publisher meets (YX-STAT-04), and a wrong figure is caught.
const load = (file: string) => (JSON.parse(readFileSync(join(__dirname, 'packs', file), 'utf8')) as { ruleSets: (RuleSet & { golden: GoldenCase[] })[] }).ruleSets;

describe('5i packs (AE, US, IN.LAYOFF)', () => {
  const sets = [...load('ae.json'), ...load('us.json'), ...load('in-exit.json').filter((s) => s.statute === 'IN.LAYOFF')];

  it.each(sets.map((s) => [`${s.statute} ${s.version}`, s] as const))('%s passes its golden cases and shape check', (_n, s) => {
    expect(s.golden.length).toBeGreaterThan(0);
    expect(s.golden.flatMap((g) => runGolden(s, g))).toEqual([]);
    expect(checkShape(s)).toEqual([]);
  });

  it('a wrong figure fails the gate', () => {
    const eosg = sets.find((s) => s.statute === 'AE.EOSG')!;
    expect(eosg.golden.flatMap((g) => runGolden({ ...eosg, values: { ...eosg.values, daysFirst: 15 } }, g)).length).toBeGreaterThan(0);
    const nec = sets.find((s) => s.version === 'TY2026')!;
    expect(nec.golden.flatMap((g) => runGolden({ ...nec, values: { ...nec.values, threshold: '600' } }, g)).length).toBeGreaterThan(0);
  });
});
