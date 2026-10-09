import { readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { PAY_VARIABLES, checkFormula } from '../rules-engine/expressions';
import type { RuleSet } from '../statutory/evaluator';
import { breakup, type ComponentDef, type Facts, type Line } from './structure';
import { STARTER_COMPONENTS, STARTER_TEMPLATE } from './starter';

// PAY-2.07 / 2.08 / 2.09: the starter template worked out CTC-first and from fixed amounts; the CTC always adds up;
// statutory lines come from the pack with citations; ESI near its limit picks the consistent answer; Code wage add-back.

const rules = (JSON.parse(readFileSync(join(__dirname, '..', 'statutory', 'packs', 'in.json'), 'utf8')) as { ruleSets: RuleSet[] }).ruleSets;
const components: ComponentDef[] = STARTER_COMPONENTS.map((c, i) => ({ id: `c${i}`, code: c.code, name: c.name, kind: c.kind, pfWage: !!c.pfWage, esiWage: !!c.esiWage, ptWage: !!c.ptWage, gratuityWage: !!c.gratuityWage, bonusWage: !!c.bonusWage, codeWagePart: !!c.codeWagePart, codeExclusion: !!c.codeExclusion, inCtc: c.inCtc ?? true, rounding: c.rounding ?? 'rupee', statutory: c.statutory ?? null }));
const names = new Set<string>([...PAY_VARIABLES, ...components.map((c) => c.code)]);
const linesOf = (spec: { code: string; formula: string }[]): Line[] => spec.map((l) => ({ code: l.code, ...checkFormula(l.formula, names) }));
const starter = linesOf(STARTER_TEMPLATE.lines);
const options = { balancingCode: 'special', employerPfInCtc: true, employerEsiInCtc: true, gratuityInCtc: false };
const facts = (over: Partial<Facts> = {}): Facts => ({ on: '2026-10-01', month: 5, state: 'IN-KA', gender: 'male', age: 30, pf: true, pfOnActualWage: false, esi: 'by_wage', pwd: false, ...over });
const m = (b: ReturnType<typeof breakup>, code: string) => b.lines.find((l) => l.code === code)!.monthly.toFixed(2);
const ctcAddsUp = (b: ReturnType<typeof breakup>) => {
  const inCtc = b.lines.filter((l) => (l.kind === 'earning' && l.code !== 'bonus' && l.code !== 'ot' && l.code !== 'arrears') || l.code === 'pf_employer' || l.code === 'esi_employer');
  return inCtc.reduce((s, l) => s.add(l.monthly), new Prisma.Decimal(0)).sub(b.monthlyCtc).abs().lte('0.01');
};

describe('salary structures (§7.3–7.4)', () => {
  it('CTC-first: ₹7,26,000 in Karnataka adds up, PF on the ceiling, no ESI above its limit, PT 200', () => {
    const b = breakup({ lines: starter, components, options, facts: facts(), rules, ctc: '726000' });
    expect(b.monthlyCtc.toFixed(2)).toBe('60500.00');
    expect(m(b, 'basic')).toBe('24200.00');
    expect(m(b, 'hra')).toBe('12100.00');
    expect(m(b, 'pf_employee')).toBe('1800.00');
    expect(m(b, 'pf_employer')).toBe('1800.00');
    expect(m(b, 'esi_employee')).toBe('0.00');
    expect(m(b, 'pt')).toBe('200.00');
    expect(b.esiCovered).toBe(false);
    expect(ctcAddsUp(b)).toBe(true);
    expect(b.lines.find((l) => l.code === 'pf_employee')!.citation).toMatchObject({ statute: 'IN.PF', verify: true });
    expect(b.minWage).toMatchObject({ below: false, floorApplied: true });
  });

  it('CTC-first with employer ESI inside the CTC: a low CTC is covered and still adds up (bounded iteration)', () => {
    const b = breakup({ lines: starter, components, options, facts: facts(), rules, ctc: '240000' });
    expect(b.esiCovered).toBe(true);
    expect(Number(m(b, 'esi_employee'))).toBeGreaterThan(0);
    expect(ctcAddsUp(b)).toBe(true);
    expect(b.rounds).toBeLessThanOrEqual(20);
  });

  it('every CTC from ₹2.4 L to ₹3.6 L gives a consistent ESI answer and adds up', () => {
    for (let ctc = 240000; ctc <= 360000; ctc += 3000) {
      const b = breakup({ lines: starter, components, options, facts: facts(), rules, ctc: String(ctc) });
      const esiWage = b.lines.filter((l) => components.find((c) => c.code === l.code)!.esiWage).reduce((s, l) => s.add(l.monthly), new Prisma.Decimal(0));
      expect({ ctc, ok: ctcAddsUp(b) && b.esiCovered === esiWage.lte(21000) }).toEqual({ ctc, ok: true });
    }
  });

  it('fixed entry: the amounts given, with the statutory lines added; Tamil Nadu has no PT in May', () => {
    const b = breakup({ lines: starter, components, options, facts: facts({ state: 'IN-TN' }), rules, fixed: { basic: '30000', hra: '15000', conveyance: '1600', special: '13400' } });
    expect(b.monthlyGross.toFixed(2)).toBe('60000.00');
    expect(m(b, 'pt')).toBe('0.00');
    expect(b.monthlyCtc.toFixed(2)).toBe('61800.00');
  });

  it('flags the Code wage add-back when exclusions pass half of pay (YX-PAY-47)', () => {
    const heavy = linesOf([{ code: 'basic', formula: 'round(monthly_ctc * 0.2)' }, { code: 'hra', formula: 'round(monthly_ctc * 0.6)' }, { code: 'special', formula: '0' }, { code: 'pf_employee', formula: 'pf_employee()' }]);
    const b = breakup({ lines: heavy, components, options: { ...options, employerPfInCtc: false, employerEsiInCtc: false }, facts: facts({ esi: 'no' }), rules, ctc: '600000' });
    expect(b.codeWageAddBack.toFixed(2)).toBe('5000.00');
    // PF reads the Code wage: basic 10,000 + 5,000 added back.
    expect(m(b, 'pf_employee')).toBe('1800.00');
  });

  it('refuses a CTC too low for the fixed parts, and a template without its balancing line', () => {
    const fixedHeavy = linesOf([{ code: 'basic', formula: '50000' }, { code: 'special', formula: '0' }]);
    expect(() => breakup({ lines: fixedHeavy, components, options, facts: facts({ esi: 'no' }), rules, ctc: '120000' })).toThrow(/too low/);
    expect(() => breakup({ lines: linesOf([{ code: 'basic', formula: '1' }]), components, options, facts: facts(), rules, ctc: '120000' })).toThrow(/balancing component/);
  });
});
