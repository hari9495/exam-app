import { Prisma } from '@prisma/client';
import { RuleError } from '../rules-engine/conditions';
import { Node, StatutoryFn, dependencyOrder, evaluate } from '../rules-engine/expressions';
import { Citation, RuleSet, bonus, codeWage, esi, esiCovered, gratuity, inForce, lwf, minWage, minWageTableFor, pf, pt } from '../statutory/evaluator';

// Salary structures (M03-BUILD-DESIGN §7, PAY-2.07 / 2.08 / 2.09): a template's lines worked out for one person and
// month, CTC-first (the balancing component takes what is left of the CTC after every other line and the employer costs
// inside it, by bounded iteration) or from fixed amounts. Pure: no database, no clock; statutory amounts only from the
// pack (statutory/evaluator.ts), with their citations. Money is Decimal.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const MAX_ROUNDS = 20;
const PAISA = D('0.01');

export interface ComponentDef {
  id: string;
  code: string;
  name: string;
  kind: 'earning' | 'deduction' | 'employer' | 'reimbursement' | 'info';
  pfWage: boolean;
  esiWage: boolean;
  ptWage: boolean;
  gratuityWage: boolean;
  bonusWage: boolean;
  codeWagePart: boolean;
  codeExclusion: boolean;
  inCtc: boolean;
  rounding: 'none' | 'rupee' | 'up_rupee';
  statutory: string | null;
}
export interface Line {
  code: string;
  ast: Node;
  uses: string[];
  statutory: StatutoryFn[];
}
export interface Facts {
  /** The date the breakup is for (rules in force then). */
  on: string;
  /** Month number (1–12) for PT / LWF months. */
  month: number;
  state: string;
  gender?: string | null;
  age: number;
  pf: boolean;
  pfOnActualWage: boolean;
  esi: 'yes' | 'no' | 'by_wage';
  pwd: boolean;
  bonusRate?: string | null;
  /** Minimum-wage zone of the place of work and the person's skill class, when known (state tables, 5b-D1). */
  zone?: string | null;
  skill?: string | null;
  /** The scheduled employment whose state table applies (else the state's only table in force). */
  mwEmployment?: string | null;
}
export interface Options {
  balancingCode: string;
  employerPfInCtc: boolean;
  employerEsiInCtc: boolean;
  gratuityInCtc: boolean;
}
export interface BreakupLine {
  code: string;
  name: string;
  kind: ComponentDef['kind'];
  monthly: Prisma.Decimal;
  annual: Prisma.Decimal;
  citation: Citation | null;
}
export interface Breakup {
  lines: BreakupLine[];
  monthlyGross: Prisma.Decimal;
  monthlyCtc: Prisma.Decimal;
  annualCtc: Prisma.Decimal;
  codeWageAddBack: Prisma.Decimal;
  esiCovered: boolean;
  rounds: number;
  minWage: { monthly: Prisma.Decimal; checked: Prisma.Decimal; below: boolean; floorApplied: boolean; daMissing: boolean; zone: string | null; skill: string | null; citation: Citation } | null;
  verify: boolean;
}

const roundFor = (x: Prisma.Decimal, r: ComponentDef['rounding']) => (r === 'none' ? x.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : r === 'up_rupee' ? x.ceil() : x.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP));

/** Lines in the order they must be worked out; a line using a statutory amount comes after every plain earning. */
export function lineOrder(lines: Line[], components: Map<string, ComponentDef>): string[] {
  const plainEarnings = lines.filter((l) => !l.statutory.length && components.get(l.code)?.kind === 'earning').map((l) => l.code);
  return dependencyOrder(lines.map((l) => ({ code: l.code, uses: l.statutory.length ? [...new Set([...l.uses, ...plainEarnings])] : l.uses })));
}

/**
 * Works out a template for one person and month. `ctc`: the annual CTC (CTC-first); `fixed`: monthly amounts of the
 * plain lines (fixed entry). Throws RuleError with a plain message when no stable answer exists.
 */
export function breakup(a: { lines: Line[]; components: ComponentDef[]; options: Options; facts: Facts; rules: RuleSet[]; ctc?: Prisma.Decimal.Value; fixed?: Record<string, Prisma.Decimal.Value> }): Breakup {
  const comps = new Map(a.components.map((c) => [c.code, c]));
  for (const l of a.lines) if (!comps.has(l.code)) throw new RuleError(`The template uses ${l.code}, which is not in the component library.`);
  if (!a.lines.some((l) => l.code === a.options.balancingCode)) throw new RuleError('The balancing component must be a line of the template.');
  const order = lineOrder(a.lines, comps);
  const byCode = new Map(a.lines.map((l) => [l.code, l]));
  const rule = (statute: string, jur: string[] = ['IN']) => inForce(a.rules, statute, jur, a.facts.on);
  const pfRs = rule('IN.PF');
  const esiRs = rule('IN.ESI');
  const ptRs = rule('IN.PT', [a.facts.state]);
  const lwfRs = rule('IN.LWF', [a.facts.state]);
  const codeRs = rule('IN.WAGES-CODE');
  const gratRs = rule('IN.SS-CODE') ?? rule('IN.GRATUITY');
  const bonusRs = rule('IN.BONUS');
  const mwRs = rule('IN.MW');
  const mwTable = minWageTableFor(a.rules, a.facts.state, a.facts.on, a.facts.mwEmployment);
  const mwFacts = { table: mwTable, zone: a.facts.zone, skill: a.facts.skill };
  const used: RuleSet[] = [];

  /** What counts inside the CTC: earnings marked so, and the employer costs the template puts inside it. */
  const inCtc = (code: string) => {
    const c = comps.get(code)!;
    if (c.kind === 'earning') return c.inCtc;
    if (c.kind !== 'employer') return false;
    if (c.statutory === 'pf_employer') return a.options.employerPfInCtc;
    if (c.statutory === 'esi_employer') return a.options.employerEsiInCtc;
    if (c.statutory === 'gratuity_provision') return a.options.gratuityInCtc;
    return c.inCtc;
  };

  const solve = (esiAssumed: boolean | null) => {
    const monthlyCtc = a.ctc !== undefined ? D(a.ctc).div(12) : null;
    let balance = ZERO;
    let values = new Map<string, Prisma.Decimal>();
    const cites = new Map<string, Citation>();
    let addBack = ZERO;
    let covered = false;
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      values = new Map();
      const sum = (flag: keyof ComponentDef) => [...values.entries()].filter(([c]) => comps.get(c)!.kind === 'earning' && comps.get(c)![flag] === true).reduce((s, [, v]) => s.add(v), ZERO);
      const statutory = (fn: StatutoryFn): Prisma.Decimal => {
        const need = <T>(rs: T | null, name: string): T => {
          if (!rs) throw new RuleError(`No ${name} rules are in force on ${a.facts.on}.`);
          used.push(rs as unknown as RuleSet);
          return rs;
        };
        const cw = codeRs ? codeWage(codeRs, { wageParts: sum('codeWagePart'), exclusions: sum('codeExclusion') }) : null;
        addBack = cw ? D(cw.codeWage).sub(sum('codeWagePart')) : ZERO;
        const pfWage = sum('pfWage').add(addBack);
        if (fn === 'code_wage') return cw ? D(cw.codeWage) : sum('codeWagePart');
        if (fn === 'pf_employee' || fn === 'pf_employer') {
          if (!a.facts.pf) return ZERO;
          const r = pf(need(pfRs, 'PF'), { pfWage, onActualWage: a.facts.pfOnActualWage, age: a.facts.age });
          cites.set(fn, r.citation);
          return fn === 'pf_employee' ? r.employee : r.epf.add(r.eps);
        }
        if (fn === 'esi_employee' || fn === 'esi_employer') {
          const rs = need(esiRs, 'ESI');
          const w = sum('esiWage');
          covered = a.facts.esi === 'yes' || (a.facts.esi === 'by_wage' && (esiAssumed ?? esiCovered(rs, w, a.facts.pwd)));
          const r = esi(rs, { esiWage: w, covered });
          cites.set(fn, r.citation);
          return fn === 'esi_employee' ? r.employee : r.employer;
        }
        if (fn === 'pt') {
          if (!ptRs) return ZERO; // no PT in the state
          used.push(ptRs);
          const halfYear = (ptRs.values as { basis?: string }).basis === 'half_yearly';
          const r = pt(ptRs, { ptWage: halfYear ? sum('ptWage').mul(6) : sum('ptWage'), month: a.facts.month, gender: a.facts.gender });
          cites.set(fn, r.citation);
          return r.amount;
        }
        if (fn === 'lwf_employee' || fn === 'lwf_employer') {
          if (!lwfRs) return ZERO;
          used.push(lwfRs);
          const r = lwf(lwfRs, { month: a.facts.month });
          cites.set(fn, r.citation);
          return fn === 'lwf_employee' ? r.employee : r.employer;
        }
        if (fn === 'gratuity_provision') {
          const r = gratuity(need(gratRs, 'gratuity'), { gratuityWage: sum('gratuityWage').add(addBack) });
          cites.set(fn, r.citation);
          return r.monthly;
        }
        // bonus_provision
        const mw = mwRs ? minWage(mwRs, mwFacts).monthly : ZERO;
        const r = bonus(need(bonusRs, 'bonus'), { bonusWage: sum('bonusWage').add(addBack), rate: a.facts.bonusRate ?? String(bonusRs!.values.minRate), minWageMonthly: mw });
        cites.set(fn, r.citation);
        return r.monthly;
      };
      const vars: Record<string, Prisma.Decimal> = { ctc: monthlyCtc ? monthlyCtc.mul(12) : ZERO, monthly_ctc: monthlyCtc ?? ZERO, payable_days: D(30), period_days: D(30), lop_days: ZERO, worked_days: D(30), ot_hours_normal: ZERO, ot_hours_weekoff: ZERO, ot_hours_holiday: ZERO, rate: ZERO, age: D(a.facts.age), service_years: ZERO };
      for (const code of order) {
        const c = comps.get(code)!;
        const l = byCode.get(code)!;
        let v: Prisma.Decimal;
        if (code === a.options.balancingCode && monthlyCtc) v = balance;
        else if (a.fixed && !l.statutory.length && c.kind === 'earning') v = D(a.fixed[code] ?? 0);
        else v = evaluate(l.ast, { vars: { ...vars, ...Object.fromEntries(values) }, statutory }) as Prisma.Decimal;
        if (!Prisma.Decimal.isDecimal(v)) throw new RuleError(`${code} must work out to an amount, not yes or no.`);
        if (v.isNegative()) throw new RuleError(`${c.name} works out below zero.`);
        values.set(code, roundFor(v, c.rounding));
      }
      if (!monthlyCtc) return { values, cites, addBack, covered, round, monthlyCtc: null };
      const next = monthlyCtc.sub([...values.entries()].filter(([c]) => c !== a.options.balancingCode && inCtc(c)).reduce((s, [, v]) => s.add(v), ZERO)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      if (next.isNegative()) throw new RuleError('The CTC is too low for the fixed parts of this template.');
      if (next.sub(balance).abs().lt(PAISA)) return { values, cites, addBack, covered, round, monthlyCtc };
      balance = next;
    }
    throw new RuleError('This CTC has no stable breakup with this template (it keeps moving across a statutory limit). Change the CTC or the template.');
  };

  // §7.4: where ESI depends on the wage, try both answers and keep the one that agrees with itself.
  let r: ReturnType<typeof solve>;
  if (a.facts.esi === 'by_wage' && esiRs) {
    const tries = [true, false].map((assume) => {
      try {
        const s = solve(assume);
        const wage = [...s.values.entries()].filter(([c]) => comps.get(c)!.kind === 'earning' && comps.get(c)!.esiWage).reduce((t, [, v]) => t.add(v), ZERO);
        return esiCovered(esiRs, wage, a.facts.pwd) === assume ? s : null;
      } catch (e) {
        if (e instanceof RuleError) return null;
        throw e;
      }
    });
    const ok = tries.find((t) => t);
    if (!ok) throw new RuleError('This CTC sits on the ESI wage limit with no consistent breakup. Move the CTC a little above or below it.');
    r = ok;
  } else r = solve(null);

  const lines: BreakupLine[] = a.lines.map((l) => {
    const c = comps.get(l.code)!;
    const m = r.values.get(l.code)!;
    return { code: l.code, name: c.name, kind: c.kind, monthly: m, annual: m.mul(12), citation: l.statutory.length ? (r.cites.get(l.statutory[0]) ?? null) : null };
  });
  const gross = lines.filter((l) => l.kind === 'earning').reduce((s, l) => s.add(l.monthly), ZERO);
  const monthlyCtc = r.monthlyCtc ?? lines.filter((l) => inCtc(l.code)).reduce((s, l) => s.add(l.monthly), ZERO);
  let minW: Breakup['minWage'] = null;
  if (mwRs) {
    const m = minWage(mwRs, mwFacts);
    used.push(mwRs);
    if (mwTable && !m.floorApplied) used.push(mwTable);
    minW = { monthly: m.monthly, checked: gross, below: gross.lt(m.monthly), floorApplied: m.floorApplied, daMissing: m.daMissing, zone: m.state?.zone ?? null, skill: m.state?.skill ?? null, citation: m.citation };
  }
  return { lines, monthlyGross: gross, monthlyCtc: monthlyCtc.toDecimalPlaces(2), annualCtc: monthlyCtc.mul(12).toDecimalPlaces(2), codeWageAddBack: r.addBack, esiCovered: r.covered, rounds: r.round, minWage: minW, verify: used.some((x) => x.verify) };
}

/** Plain JSON of a breakup (amounts as text). */
export const breakupJson = (b: Breakup) => ({
  lines: b.lines.map((l) => ({ code: l.code, name: l.name, kind: l.kind, monthly: l.monthly.toFixed(2), annual: l.annual.toFixed(2), citation: l.citation })),
  monthlyGross: b.monthlyGross.toFixed(2),
  monthlyCtc: b.monthlyCtc.toFixed(2),
  annualCtc: b.annualCtc.toFixed(2),
  codeWageAddBack: b.codeWageAddBack.toFixed(2),
  esiCovered: b.esiCovered,
  rounds: b.rounds,
  minWage: b.minWage ? { monthly: b.minWage.monthly.toFixed(2), checked: b.minWage.checked.toFixed(2), below: b.minWage.below, floorApplied: b.minWage.floorApplied, daMissing: b.minWage.daMissing, zone: b.minWage.zone, skill: b.minWage.skill, citation: b.minWage.citation } : null,
  verify: b.verify,
});
