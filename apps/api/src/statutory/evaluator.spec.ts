import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { checkShape, due, esi, inForce, minWage, minWageTableFor, noPt, pf, pt, runGolden, tds, type GoldenCase, type RuleSet } from './evaluator';

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
      // The database column is varchar(500): a longer source fails the migration that loads it.
      expect({ rs: `${rs.statute} ${rs.jurisdiction} ${rs.version}`, long: (rs as unknown as { source: string }).source.length > 500 }).toEqual({ rs: `${rs.statute} ${rs.jurisdiction} ${rs.version}`, long: false });
      expect(rs.golden.length).toBeGreaterThan(0);
    }
  });

  it('the migrations load every rule set of the pack (no drift between the pack and the database)', () => {
    // The pack loaded with payroll 5b; later versions (a new ceiling, a state's new months) come in their own migration.
    const dir = join(__dirname, '..', '..', 'prisma', 'migrations');
    const sql = readdirSync(dir).map((m) => (existsSync(join(dir, m, 'migration.sql')) ? readFileSync(join(dir, m, 'migration.sql'), 'utf8') : '')).join('\n');
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

describe('batch H: state PT rule data', () => {
  it('H8: the no-PT states have an explicit none set (verify, CA item 23); a charging or unmodelled state is not "none"', () => {
    for (const j of ['IN-DL', 'IN-HR', 'IN-UP', 'IN-RJ', 'IN-UK', 'IN-HP', 'IN-AR', 'IN-JK', 'IN-CH']) expect({ j, none: noPt(sets, j, '2026-11-17') }).toEqual({ j, none: true });
    for (const j of ['IN-HR', 'IN-UP', 'IN-RJ', 'IN-UK', 'IN-HP', 'IN-AR', 'IN-JK', 'IN-CH']) expect(one('IN.PT', j)).toMatchObject({ verify: true, source: expect.stringMatching(/CA checklist item 23/) });
    expect(noPt(sets, 'IN-KA', '2026-11-17')).toBe(false);
    expect(noPt(sets, 'IN-ML', '2026-11-17')).toBe(false);
    // Before the set's start there is no rule, so no "none" either.
    expect(noPt(sets, 'IN-HR', '2025-03-31')).toBe(false);
  });

  it('H4: Odisha charges no PT from 1 Apr 2026; before that there is no rule loaded (question 2381)', () => {
    expect(noPt(sets, 'IN-OD', '2026-04-01')).toBe(true);
    expect(noPt(sets, 'IN-OD', '2026-03-31')).toBe(false);
    expect(inForce(sets, 'IN.PT', ['IN-OD'], '2026-03-31')).toBeNull();
    expect(one('IN.PT', 'IN-OD').source).toMatch(/CA checklist item 20/);
  });

  it('H3: West Bengal switches schedule on 1 Oct 2026 (the old one ends 30 Sep); a 25,000 wage is 130 in September, 100 in October', () => {
    const sep = inForce(sets, 'IN.PT', ['IN-WB'], '2026-09-30')!;
    const oct = inForce(sets, 'IN.PT', ['IN-WB'], '2026-10-01')!;
    expect([sep.version, oct.version]).toEqual(['2014-v1', '2026-v2']);
    expect([pt(sep, { ptWage: '25000', month: 9 }).amount.toFixed(0), pt(oct, { ptWage: '25000', month: 10 }).amount.toFixed(0)]).toEqual(['130', '100']);
    // The new top band: 208 x 12 = 2,496, inside the 2,500 cap with no special month.
    expect(pt(oct, { ptWage: '150000', month: 3 }).amount.mul(12).toFixed(0)).toBe('2496');
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

  it('5c-D2: the skill class on the job picks its rate; a missing or unknown class falls back to the lowest, flagged', () => {
    const [ka, tn] = file.ruleSets;
    expect(minWage(floor, { table: ka, zone: '1', skill: 'skilled' })).toMatchObject({ state: { skill: 'skilled', skillFallback: false } });
    expect(minWage(floor, { table: ka, zone: '1', skill: 'skilled' }).monthly.toFixed(2)).toBe('18570.47');
    expect(minWage(floor, { table: ka, zone: '1', skill: null })).toMatchObject({ state: { skill: 'unskilled', skillFallback: true } });
    expect(minWage(floor, { table: tn, zone: 'A', skill: 'skilled' })).toMatchObject({ state: { skill: 'class_5', skillFallback: true } });
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

describe('run rules (batch 5c pack)', () => {
  it('subsistence, maternity and injury rule sets pass their checks and golden cases and are marked verify', () => {
    const run = (JSON.parse(readFileSync(join(__dirname, 'packs', 'in-run.json'), 'utf8')) as { ruleSets: (RuleSet & { golden: GoldenCase[] })[] }).ruleSets;
    for (const rs of run) {
      expect({ v: rs.statute, problems: [...checkShape(rs), ...rs.golden.flatMap((g) => runGolden(rs, g))] }).toEqual({ v: rs.statute, problems: [] });
      expect(rs.verify).toBe(true);
    }
  });
});

describe('state due dates for PT and LWF (founder item 12, packs/in-dues.json)', () => {
  const dues = (JSON.parse(readFileSync(join(__dirname, 'packs', 'in-dues.json'), 'utf8')) as { ruleSets: (RuleSet & { golden: GoldenCase[] })[] }).ruleSets;
  it('every state calendar passes its checks and golden cases, is marked verify, and covers each state the India pack taxes', () => {
    for (const rs of dues) {
      expect({ j: rs.jurisdiction, problems: [...checkShape(rs), ...rs.golden.flatMap((g) => runGolden(rs, g))] }).toEqual({ j: rs.jurisdiction, problems: [] });
      expect([rs.statute, rs.verify]).toEqual(['IN.CALENDAR', true]);
    }
    const covered = (key: string) => new Set(dues.filter((rs) => (rs.values.items as { key: string }[]).some((x) => x.key === key)).map((rs) => rs.jurisdiction));
    for (const s of sets.filter((x) => x.statute === 'IN.PT' && x.values.kind === 'pt' && (x.values.slabs as unknown[]).length)) expect({ pt: s.jurisdiction, dated: covered('pt').has(s.jurisdiction) }).toEqual({ pt: s.jurisdiction, dated: true });
    for (const s of sets.filter((x) => x.statute === 'IN.LWF')) expect({ lwf: s.jurisdiction, dated: covered('lwf').has(s.jurisdiction) }).toEqual({ lwf: s.jurisdiction, dated: true });
  });
  it('a state calendar is found by the state, never as the national one', () => {
    const all = [...sets, ...dues];
    expect(inForce(all, 'IN.CALENDAR', ['IN-KA'], '2026-09-01')?.version).toBe('KA-2025-v1');
    expect(inForce(all, 'IN.CALENDAR', ['IN'], '2026-09-01')?.jurisdiction).toBe('IN');
    expect(inForce(all, 'IN.CALENDAR', ['IN-ML'], '2026-09-01')).toBeNull();
  });
  it('a due day past the month end is the last day (leap year too); the national dates do not move', () => {
    const mh = dues.find((x) => x.jurisdiction === 'IN-MH')!;
    expect(due(mh, { key: 'pt', month: '2028-02' }).due).toBe('2028-02-29');
    expect(due(mh, { key: 'pt', month: '2026-04' }).due).toBe('2026-04-30');
    expect(due(mh, { key: 'pt', month: '2026-12' }).due).toBe('2026-12-31');
    const national = sets.find((x) => x.statute === 'IN.CALENDAR' && x.jurisdiction === 'IN')!;
    expect(due(national, { key: 'tds_deposit', month: '2026-03' }).due).toBe('2026-04-30');
    expect(due(national, { key: 'pf_ecr', month: '2026-01' }).due).toBe('2026-02-15');
    expect(() => due(dues.find((x) => x.jurisdiction === 'IN-DL')!, { key: 'pt', month: '2026-09' })).toThrow(/No due date for pt/);
  });
});
