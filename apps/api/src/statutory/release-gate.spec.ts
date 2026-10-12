import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { checkShape, runGolden, type GoldenCase, type RuleSet } from './evaluator';

// PAY-10.08 release gate (US-E-212), run in CI with the unit tests: every rule-set version in every pack carries at least
// one golden case, every golden case passes and every set is well formed; a version cannot ship without its check.
// The calculation's regression pack (payroll/regression/pack.json) is checked by calc.spec.ts against the same packs.
const dir = join(__dirname, 'packs');
const packs = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, sets: (JSON.parse(readFileSync(join(dir, f), 'utf8')) as { ruleSets: (RuleSet & { golden?: GoldenCase[] })[] }).ruleSets }));

describe('release gate: every rule-set version is checked', () => {
  it.each(packs.map((p) => [p.file, p.sets] as const))('%s: each version has a golden case, all pass, all well formed', (_file, sets) => {
    const problems = sets.flatMap((rs) => {
      const id = `${rs.statute} ${rs.jurisdiction} ${rs.version}`;
      if (!rs.golden?.length) return [`${id}: no golden case`];
      return [...checkShape(rs).map((x) => `${id}: ${x}`), ...rs.golden.flatMap((g) => runGolden(rs, g).map((x) => `${id}: ${x}`))];
    });
    expect(problems).toEqual([]);
  });

  it('no version appears twice for the same statute and jurisdiction', () => {
    const keys = packs.flatMap((p) => p.sets.map((rs) => `${rs.statute}|${rs.jurisdiction}|${rs.version}`));
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });
});
