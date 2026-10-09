import { readFileSync } from 'fs';
import { join } from 'path';
import type { RuleSet } from '../../statutory/evaluator';
import { STARTER_COMPONENTS } from '../starter';
import type { CalcComponent, Snapshot } from '../calc';

// Shared fixtures of the payroll calculation tests and the regression pack (PAY-3.18): the published packs and a
// Karnataka month for one person on the starter components.

const pack = (f: string) => (JSON.parse(readFileSync(join(__dirname, '..', '..', 'statutory', 'packs', f), 'utf8')) as { ruleSets: RuleSet[] }).ruleSets;
export const RULES: RuleSet[] = [...pack('in.json'), ...pack('in-run.json')];
export const COMPONENTS: CalcComponent[] = STARTER_COMPONENTS.map((c) => ({ code: c.code, name: c.name, kind: c.kind, pfWage: !!c.pfWage, esiWage: !!c.esiWage, ptWage: !!c.ptWage, gratuityWage: !!c.gratuityWage, bonusWage: !!c.bonusWage, codeWagePart: !!c.codeWagePart, codeExclusion: !!c.codeExclusion, prorated: c.prorated ?? true, rounding: c.rounding ?? 'rupee', statutory: c.statutory ?? null }));
export const PACKAGE = [
  { code: 'basic', monthly: '24200' },
  { code: 'hra', monthly: '12100' },
  { code: 'conveyance', monthly: '1600' },
  { code: 'special', monthly: '21000' },
];

export function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    employeeId: 'e1',
    employmentId: 'm1',
    legalEntityId: 'le1',
    period: { start: '2026-10-01', end: '2026-10-31', days: 31 },
    dayBasis: 'calendar',
    segments: [{ from: '2026-10-01', to: '2026-10-31', days: 31, lines: PACKAGE, payBasis: 'monthly', rate: null, otMultiplier: null, holidayMultiplier: null, state: 'IN-KA', zone: '1', changeId: 'c1' }],
    components: COMPONENTS,
    attendance: { lopDays: '0', source: 'feed', otMinutes: { normal: 0, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 0 },
    profile: { pf: true, eps: true, vpfPercent: '0', pfOnActualWage: false, esi: 'by_wage', esiCoveredThisPeriod: false, pwd: false, ptState: 'IN-KA', lwfState: null, gender: 'male', age: 30 },
    ytd: { pt: '0' },
    oneTime: [],
    special: [],
    averageDailyWage: null,
    recoveries: { courtOrders: [], loans: [], carryForwards: [] },
    options: { bonusRate: null, bonusPayment: 'annual', protectedNetPercent: '0', netRounding: 'rupee', standardDailyHours: '8' },
    held: false,
    ...over,
  };
}
