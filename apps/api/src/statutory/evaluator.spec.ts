import { readFileSync } from 'fs';
import { join } from 'path';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { checkShape, esi, inForce, minWage, minWageTableFor, pf, pt, runGolden, tds, type GoldenCase, type RuleSet } from './evaluator';

// PAY-2.02 / 2.03: every golden case of the India pack passes; the migration that loads the pack carries every rule set
// of the JSON (no drift); shape checks; property tests over the statutory maths (§16.3).

const pack = JSON.parse(readFileSync(join(__dirname, 'packs', 'in.json'), 'utf8')) as { ruleSets: (RuleSet & { golden: GoldenCase[] })[] };
const sets = pack.ruleSets;
const one = (statute: string, jur = 'IN') => sets.find((s) => s.statute === statute && s.jurisdiction === jur)!;

describe('India pack (P07)', () => {
  it('every golden case passes', () => {
    const failures = sets.flatMap((rs) => rs.golden.flatMap((g) => runGolden(rs, g)));
    expect(failures).toEqual([]);
    expect(sets.reduce((n, rs) => n + rs.golden.length, 0)).toBeGreaterThanOrEqual(35);
  });

  it('every rule set passes its shape checks, has a source and golden cases', () => {
    const ptAnnualMax = String(one('IN.PT').values.annualMax);
    for (const rs of sets) {
      expect({ rs: `${rs.statute} ${rs.jurisdiction}`, problems: checkShape(rs, { ptAnnualMax }) }).toEqual({ rs: `${rs.statute} ${rs.jurisdiction}`, problems: [] });
      expect((rs as unknown as { source: string }).source.length).toBeGreaterThan(20);
      expect(rs.golden.length).toBeGreaterThan(0);
    }
  });

  it('the payroll 5b migration loads exactly these rule sets (no drift between the pack and the database)', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'prisma', 'migrations', '20261027000000_payroll_5b', 'migration.sql'), 'utf8');
    for (const rs of sets) expect(sql).toContain(`'${rs.statute}', '${rs.jurisdiction}', '${rs.version}'`);
  });

  it('shape checks refuse overlapping or gapped slabs and a PT cap above the law', () => {
    const bad: RuleSet = { ...one('IN.PT', 'IN-KA'), values: { kind: 'pt', basis: 'monthly', annualCap: '3000', slabs: [{ from: '0', to: '1000', amount: '0' }, { from: '900', to: null, amount: '200' }] } };
    expect(checkShape(bad, { ptAnnualMax: String(one('IN.PT').values.annualMax) })).toEqual(expect.arrayContaining([expect.stringMatching(/start just after/), expect.stringMatching(/2500 a year/)]));
  });

  it('picks the rule set in force on a date, by law version', () => {
    expect(inForce(sets, 'IN.TDS', ['IN'], '2026-03-31')!.version).toBe('FY2025-26');
    expect(inForce(sets, 'IN.TDS', ['IN'], '2026-04-01')!.version).toBe('TY2026-27');
    expect(inForce(sets, 'IN.PT', ['IN-KA', 'IN'], '2026-10-01')!.jurisdiction).toBe('IN-KA');
  });
});

describe('statutory maths, properties (§16.3)', () => {
  const amount = fc.integer({ min: 0, max: 50_000_000 }).map((p) => (p / 100).toFixed(2));

  it('PT never exceeds the state cap over a year, in every state', () => {
    for (const rs of sets.filter((s) => s.statute === 'IN.PT' && s.values.kind === 'pt')) {
      fc.assert(
        fc.property(fc.array(amount, { minLength: 12, maxLength: 12 }), fc.constantFrom('male', 'female'), (wages, gender) => {
          const year = wages.reduce((s, w, i) => s.add(pt(rs, { ptWage: w, month: i + 1, gender }).amount), new Prisma.Decimal(0));
          return year.lte(new Prisma.Decimal(String(rs.values.annualCap)));
        }),
        { numRuns: 200 },
      );
    }
  });

  it('ESI is a whole rupee, rounded up, and zero when not covered', () => {
    fc.assert(
      fc.property(amount, fc.boolean(), (w, covered) => {
        const r = esi(one('IN.ESI'), { esiWage: w, covered });
        return r.employee.isInteger() && r.employer.isInteger() && (covered || (r.employee.isZero() && r.employer.isZero())) && (!covered || r.employee.gte(new Prisma.Decimal(w).mul('0.0075')));
      }),
    );
  });

  it('PF: employee ≤ 12% of the ceiling wage; EPF + EPS is the employer share', () => {
    fc.assert(
      fc.property(amount, fc.integer({ min: 18, max: 70 }), (w, age) => {
        const r = pf(one('IN.PF'), { pfWage: w, onActualWage: false, age });
        const base = Prisma.Decimal.min(new Prisma.Decimal(w), 15000);
        return r.employee.lte(base.mul('0.12').add('0.5')) && r.epf.add(r.eps).eq(r.employee) && r.eps.gte(0) && r.epf.gte(0);
      }),
    );
  });

  it('TDS: more income never means less tax, beyond the rebate band', () => {
    const rs = one('IN.TDS');
    fc.assert(
      fc.property(fc.integer({ min: 1_300_000, max: 90_000_000 }), fc.integer({ min: 1, max: 500_000 }), fc.constantFrom('new' as const, 'old' as const), (a, extra, regime) => {
        return tds(rs, { taxable: a + extra, regime, age: 30 }).tax.gte(tds(rs, { taxable: a, regime, age: 30 }).tax.sub(1));
      }),
      { numRuns: 300 },
    );
  });
});

describe('state minimum-wage tables (5b-D1)', () => {
  const file = JSON.parse(readFileSync(join(__dirname, 'packs', 'in-min-wages.json'), 'utf8')) as { ruleSets: (RuleSet & { golden: GoldenCase[]; source: string })[]; missing: { state: string }[] };
  const floor = one('IN.MW');

  it('every table passes its checks (printed totals add up) and golden cases, names its notification, and is marked verify', () => {
    for (const rs of file.ruleSets) {
      expect({ v: rs.version, problems: [...checkShape(rs), ...rs.golden.flatMap((g) => runGolden(rs, g))] }).toEqual({ v: rs.version, problems: [] });
      expect(rs.verify).toBe(true);
      expect(String((rs.values.notification as { url: string }).url)).toMatch(/^https:\/\/[a-z.]+\.gov\.in\//);
    }
    expect(file.missing.map((m) => m.state)).toContain('IN-UP');
  });

  it('a mistyped amount is caught: basic and VDA must add up to the printed total', () => {
    const ka = structuredClone(file.ruleSets[0]);
    (ka.values.rates as { totalMonthly: string }[])[0].totalMonthly = '19972.06';
    expect(checkShape(ka).join()).toMatch(/do not add up/);
  });

  it('the check uses the state rate for the place, else the national floor; a table without its DA says so', () => {
    const [ka, tn] = file.ruleSets;
    expect(minWage(floor, { table: ka, zone: '1' })).toMatchObject({ floorApplied: false, daMissing: false });
    expect(minWage(floor, { table: ka, zone: '1' }).monthly.toFixed(2)).toBe('16137.03');
    expect(minWage(floor, { table: tn, zone: 'A' })).toMatchObject({ floorApplied: false, daMissing: true });
    expect(minWage(floor).floorApplied).toBe(true);
    expect(minWageTableFor(file.ruleSets, 'IN-KA', '2026-10-09')?.version).toBe('KA-SHOPS-2026-27');
    expect(minWageTableFor(file.ruleSets, 'IN-KA', '2027-04-01')).toBeNull();
  });
});
