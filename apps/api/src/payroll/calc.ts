import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { projectTax, type TaxInputs, type TaxProjection } from './tax';
import { Citation, RuleSet, cite, StatutoryError, bonus, codeWage, deductionCap, esi, gratuity, inForce, injury, lwf, maternity, minWage, minWageTableFor, pf, pt, subsistence } from '../statutory/evaluator';

// The payroll calculation (M03-BUILD-DESIGN §9.4, PAY-3.04 … 3.16): a pure function of one person's month snapshot and the
// rule sets. It reads no database and no clock, so a payslip can be reproduced from its snapshot with the rule versions it
// used (§3.5), and golden and property tests call the same function. Money is Decimal; every line explains itself and
// cites the rule it came from. TDS (batch 5e, §8.5) comes from the same pure tax function as the employee's tax sheet.

export const ENGINE_VERSION = '5e.1';
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const r2 = (x: Prisma.Decimal) => x.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const roundFor = (x: Prisma.Decimal, how: string) => (how === 'none' ? r2(x) : how === 'up_rupee' ? x.ceil() : x.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP));
const rupees = (x: Prisma.Decimal.Value) => `₹${D(x).toFixed(2)}`;

export interface CalcComponent {
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
  prorated: boolean;
  rounding: 'none' | 'rupee' | 'up_rupee';
  statutory: string | null;
  /** Batch 5e: counts as salary income for tax (absent = taxable). */
  taxable?: boolean;
}

/** One stretch of the month with the same compensation and place (P06 segments). */
export interface Segment {
  from: string;
  to: string;
  days: number;
  /** Monthly amounts of the package in force (plain earnings only are used; statutory lines are worked out here). */
  lines: { code: string; monthly: string }[];
  payBasis: 'monthly' | 'hourly' | 'daily';
  rate: string | null;
  otMultiplier: string | null;
  holidayMultiplier: string | null;
  state: string;
  zone: string | null;
  /** 5c-D2: the job's skill class (minimum-wage tables); absent or null means the lowest class with a warning. */
  skill?: string | null;
  changeId: string | null;
}

export interface Snapshot {
  employeeId: string;
  employmentId: string;
  legalEntityId: string;
  period: { start: string; end: string; days: number };
  dayBasis: 'calendar' | '30' | '26';
  segments: Segment[];
  components: CalcComponent[];
  /** Attendance (the frozen M02 feed) and manual LOP (assumed-present groups) as used. */
  attendance: { lopDays: string; source: 'feed' | 'manual' | 'none'; otMinutes: { normal: number; weeklyOff: number; holiday: number }; timesheetMinutes: number };
  profile: { pf: boolean; eps: boolean; vpfPercent: string; pfOnActualWage: boolean; esi: 'yes' | 'no' | 'by_wage'; esiCoveredThisPeriod: boolean; pwd: boolean; ptState: string; lwfState: string | null; gender: string | null; age: number };
  ytd: { pt: string };
  oneTime: { id: string; code: string; amount: string; days: number | null }[];
  special: { kind: 'suspension' | 'maternity' | 'injury'; days: string; daysBefore: number }[];
  averageDailyWage: string | null;
  recoveries: {
    courtOrders: { id: string; ref: string; amount: string | null; percent: string | null; priorityDate: string; remaining: string | null }[];
    loans: { id: string; emi: string; outstanding: string }[];
    carryForwards: { id: string; balance: string }[];
  };
  options: { bonusRate: string | null; bonusPayment: 'annual' | 'monthly'; protectedNetPercent: string; netRounding: 'none' | 'rupee'; standardDailyHours: string };
  held: boolean;
  /** Batch 5e: the tax inputs (absent before 5e; then no TDS line). */
  tax?: TaxInputs | null;
}

export interface CalcLine {
  code: string;
  name: string;
  kind: CalcComponent['kind'];
  segmentNo: number;
  amount: string;
  quantity?: string;
  rate?: string;
  explanation: string;
  rule?: Citation;
  verify?: boolean;
  sourceRef?: string;
}

export interface CalcResult {
  lines: CalcLine[];
  gross: string;
  deductions: string;
  net: string;
  employerCost: string;
  verify: boolean;
  ruleVersions: Record<string, string>;
  recoveries: { courtOrders: { id: string; amount: string }[]; loans: { id: string; amount: string }[]; carryForwards: { id: string; amount: string }[] };
  deferred: { kind: string; ref: string; amount: string }[];
  carryForward: string;
  minWage: { monthly: string; below: boolean; floorApplied: boolean; skillFallback: boolean } | null;
  /** Batch 5e: the projection behind the TDS line (the tax sheet shows this, YX-TAX-06). */
  tax: TaxProjection | null;
  resultHash: string;
}

/** A stable SHA-256 of any JSON value (keys sorted), for snapshot and result hashes. */
export function hashOf(v: unknown): string {
  const canon = (x: unknown): unknown => (Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])])) : x);
  return createHash('sha256').update(JSON.stringify(canon(v))).digest('hex');
}

/** The rule set of `statute` the calculation used (statute × jurisdiction → version, recorded on the payslip). */
export function calculatePayslip(s: Snapshot, rules: RuleSet[]): CalcResult {
  const on = s.period.end;
  const month = Number(on.slice(5, 7));
  const monthDays = s.period.days;
  const basis = s.dayBasis === 'calendar' ? monthDays : Number(s.dayBasis);
  const comps = new Map(s.components.map((c) => [c.code, c]));
  const used = new Map<string, RuleSet>();
  const rule = (statute: string, jur: string[] = ['IN']) => {
    const rs = inForce(rules, statute, jur, on);
    if (rs) used.set(`${rs.statute}|${rs.jurisdiction}`, rs);
    return rs;
  };
  const need = (rs: RuleSet | null, what: string) => {
    if (!rs) throw new StatutoryError(`No ${what} rules are in force on ${on}.`);
    return rs;
  };
  const lines: CalcLine[] = [];
  const add = (l: Omit<CalcLine, 'amount'> & { amount: Prisma.Decimal }) => {
    if (l.amount.isZero() && l.kind !== 'info') return;
    lines.push({ ...l, amount: l.amount.toFixed(2), ...(l.rule ? { verify: l.rule.verify } : {}) });
  };
  const nameOf = (code: string, fallback: string) => comps.get(code)?.name ?? fallback;
  const statCode = (key: string) => s.components.find((c) => c.statutory === key)?.code ?? key;

  // 1–2. Days: LOP from the feed or the manual entry, plus days paid as a benefit instead of salary; split by segment.
  const special = (k: string) => s.special.filter((x) => x.kind === k).reduce((t, x) => t.add(x.days), ZERO);
  const unpaid = D(s.attendance.lopDays).add(special('suspension')).add(special('maternity')).add(special('injury'));
  if (unpaid.gt(monthDays)) throw new StatutoryError(`Unpaid days (${unpaid.toFixed(2)}) are more than the days in the month.`);
  const segDays = s.segments.reduce((t, g) => t + g.days, 0);
  const lopOf = (g: Segment) => (segDays ? unpaid.mul(g.days).div(segDays) : ZERO);

  // 2. Earnings per segment: proration once (YX-PAY-02); rate-based pay (YX-PAY-24); OT.
  s.segments.forEach((g, i) => {
    const lop = lopOf(g);
    if (g.payBasis !== 'monthly') {
      const rate = D(g.rate ?? 0);
      const qty = g.payBasis === 'hourly' ? D(s.attendance.timesheetMinutes).div(60).mul(g.days).div(segDays || 1) : D(g.days).sub(lop);
      add({ code: 'basic', name: nameOf('basic', 'Basic'), kind: 'earning', segmentNo: i, amount: r2(qty.mul(rate)), quantity: qty.toFixed(2), rate: rate.toFixed(4), explanation: `${qty.toFixed(2)} ${g.payBasis === 'hourly' ? 'hours' : 'days'} at ${rupees(rate)} (${g.payBasis} rate).` });
      return;
    }
    for (const pl of g.lines) {
      const c = comps.get(pl.code);
      if (!c || c.kind !== 'earning' || c.statutory) continue;
      const m = D(pl.monthly);
      const share = m.mul(g.days).div(monthDays);
      const cut = c.prorated ? m.div(basis).mul(lop) : ZERO;
      const amount = roundFor(Prisma.Decimal.max(ZERO, share.sub(cut)), c.rounding);
      const why = c.prorated && (g.days !== monthDays || !lop.isZero()) ? `${rupees(m)} a month × ${g.days} of ${monthDays} days${lop.isZero() ? '' : `, less ${lop.toFixed(2)} unpaid days at ${rupees(m)} ÷ ${basis}`}.` : g.days !== monthDays ? `${rupees(m)} a month × ${g.days} of ${monthDays} days (not reduced for unpaid days).` : `${rupees(m)} a month, the full month.`;
      add({ code: c.code, name: c.name, kind: 'earning', segmentNo: i, amount, explanation: why, sourceRef: g.changeId ?? undefined });
    }
  });
  const last = s.segments[s.segments.length - 1];
  // The ordinary rate of wages for overtime: basic and allowances of the package (not bonus, overtime or arrears, which
  // are never in the package), per day of the month and standard hour.
  const ordinaryMonthly = last ? last.lines.filter((l) => comps.get(l.code)?.kind === 'earning' && !comps.get(l.code)?.statutory).reduce((t, l) => t.add(l.monthly), ZERO) : ZERO;
  if (last && (s.attendance.otMinutes.normal || s.attendance.otMinutes.weeklyOff || s.attendance.otMinutes.holiday) && last.otMultiplier) {
    const hourly = last.payBasis === 'hourly' ? D(last.rate ?? 0) : ordinaryMonthly.div(D(monthDays).mul(s.options.standardDailyHours));
    for (const [k, mins, mult] of [['normal', s.attendance.otMinutes.normal, last.otMultiplier], ['weekly off', s.attendance.otMinutes.weeklyOff, last.otMultiplier], ['holiday', s.attendance.otMinutes.holiday, last.holidayMultiplier ?? last.otMultiplier]] as const) {
      if (!mins) continue;
      const hours = D(mins).div(60);
      add({ code: 'ot', name: nameOf('ot', 'Overtime'), kind: 'earning', segmentNo: s.segments.length - 1, amount: r2(hours.mul(hourly).mul(mult)), quantity: hours.toFixed(2), rate: hourly.mul(mult).toFixed(4), explanation: `${hours.toFixed(2)} ${k} overtime hours at ${mult} × the ordinary hourly rate ${rupees(hourly)}.` });
    }
  }
  // One-time pay (recurring items prorated in their last month, YX-PAY: fixes C-D9).
  for (const o of s.oneTime) {
    const c = comps.get(o.code);
    const amount = o.days === null ? D(o.amount) : D(o.amount).mul(o.days).div(monthDays);
    add({ code: o.code, name: c?.name ?? o.code, kind: c?.kind === 'deduction' ? 'deduction' : 'earning', segmentNo: 0, amount: r2(amount), explanation: o.days === null ? 'One-time pay for this month.' : `Recurring pay ${rupees(o.amount)} for ${o.days} of ${monthDays} days (its last month).`, sourceRef: o.id });
  }

  // 3. Wage bases from flags; the Code wage add-back (YX-PAY-47).
  const earned = (flag: keyof CalcComponent, seg?: number) => lines.filter((l) => l.kind === 'earning' && (seg === undefined || l.segmentNo === seg) && comps.get(l.code)?.[flag] === true).reduce((t, l) => t.add(l.amount), ZERO);
  const codeRs = rule('IN.WAGES-CODE');
  const cw = codeRs ? codeWage(codeRs, { wageParts: earned('codeWagePart'), exclusions: earned('codeExclusion') }) : null;
  const addBack = cw ? D(cw.addBack) : ZERO;
  if (cw && addBack.gt(0)) add({ code: 'code_wage_add_back', name: 'Code wage add-back', kind: 'info', segmentNo: 0, amount: addBack, explanation: `Allowances excluded from wages pass the limit; ${rupees(addBack)} is added back to the wage for PF, ESI, gratuity and bonus.`, rule: cw.citation });

  // Benefits paid instead of salary for special days (PAY-3.13 / 3.14).
  const dailyWage = ordinaryMonthly.div(monthDays);
  for (const x of s.special) {
    if (x.kind === 'suspension') {
      const r = subsistence(need(rule('IN.SUBSISTENCE'), 'subsistence allowance'), { dailyWage, days: Number(x.days), daysBefore: x.daysBefore });
      add({ code: 'subsistence', name: 'Subsistence allowance', kind: 'earning', segmentNo: 0, amount: r.amount, quantity: x.days, explanation: `${x.days} days of suspension: ${r.firstDays} at the first rate and ${r.laterDays} at the later rate of the daily wage ${rupees(dailyWage)}.`, rule: r.citation });
    } else if (x.kind === 'maternity') {
      const r = maternity(need(rule('IN.MATERNITY'), 'maternity benefit'), { averageDailyWage: s.averageDailyWage ?? dailyWage, days: Number(x.days), esiCovered: s.profile.esiCoveredThisPeriod });
      add({ code: 'maternity_benefit', name: 'Maternity benefit', kind: r.payer === 'esi' ? 'info' : 'earning', segmentNo: 0, amount: r.amount, quantity: x.days, explanation: r.payer === 'esi' ? `${x.days} days of maternity leave: ESI pays the benefit.` : `${x.days} days at the average daily wage ${rupees(s.averageDailyWage ?? dailyWage)}.`, rule: r.citation });
    } else {
      const r = injury(need(rule('IN.EC'), 'injury pay'), { monthlyWage: dailyWage.mul(monthDays), days: Number(x.days), monthDays, esiCovered: s.profile.esiCoveredThisPeriod });
      add({ code: 'injury_pay', name: 'Injury pay', kind: r.payer === 'esi' ? 'info' : 'earning', segmentNo: 0, amount: r.amount, quantity: x.days, explanation: r.payer === 'esi' ? `${x.days} days of injury leave: ESI pays the disablement benefit.` : `${x.days} days of temporary disablement at the half-monthly rate of monthly wages.`, rule: r.citation });
    }
  }

  // 4. Statutory: PF with its ceiling per segment (YX-PAY-17), ESI per contribution period, PT by work state with the
  //    annual cap, LWF, gratuity and bonus provisions.
  if (s.profile.pf) {
    const pfRs = need(rule('IN.PF'), 'PF');
    let emp = ZERO;
    let epf = ZERO;
    let eps = ZERO;
    let edli = ZERO;
    let base = ZERO;
    s.segments.forEach((g, i) => {
      const f = D(g.days).div(monthDays);
      const v = pfRs.values as Record<string, string>;
      const scaled: RuleSet = { ...pfRs, values: { ...pfRs.values, wageCeiling: D(v.wageCeiling).mul(f).toFixed(2), epsCeiling: D(v.epsCeiling).mul(f).toFixed(2), edliCeiling: D(v.edliCeiling).mul(f).toFixed(2) } };
      const wage = earned('pfWage', i).add(addBack.mul(g.days).div(segDays || 1));
      const r = pf(scaled, { pfWage: wage, onActualWage: s.profile.pfOnActualWage, age: s.profile.age });
      emp = emp.add(r.employee);
      edli = edli.add(r.edli);
      base = base.add(wage);
      if (s.profile.eps) {
        epf = epf.add(r.epf);
        eps = eps.add(r.eps);
      } else epf = epf.add(r.epf).add(r.eps);
    });
    const c = pfRs ? { statute: pfRs.statute, jurisdiction: pfRs.jurisdiction, version: pfRs.version, verify: pfRs.verify } : undefined;
    const ceil = s.profile.pfOnActualWage ? 'on actual wage' : 'up to the wage ceiling for the days in each part of the month';
    add({ code: statCode('pf_employee'), name: nameOf(statCode('pf_employee'), 'Provident fund'), kind: 'deduction', segmentNo: 0, amount: emp, explanation: `Employee PF on the PF wage ${rupees(base)} (${ceil}).`, rule: c });
    if (D(s.profile.vpfPercent).gt(0)) add({ code: 'vpf', name: nameOf('vpf', 'Voluntary provident fund'), kind: 'deduction', segmentNo: 0, amount: roundFor(base.mul(s.profile.vpfPercent).div(100), 'rupee'), explanation: `Voluntary PF at ${s.profile.vpfPercent}% of the PF wage, as the employee chose.` });
    add({ code: statCode('pf_employer'), name: nameOf(statCode('pf_employer'), 'Provident fund (employer)'), kind: 'employer', segmentNo: 0, amount: epf, explanation: s.profile.eps ? 'Employer share to the provident fund (after the pension part).' : 'Employer share, all to the provident fund (not a pension member).', rule: c });
    add({ code: 'eps_employer', name: 'Pension fund (employer)', kind: 'employer', segmentNo: 0, amount: eps, explanation: `Employer share to the pension fund (capped; none from age ${String(pfRs.values.epsStopAge)}).`, rule: c });
    add({ code: 'edli_employer', name: 'EDLI (employer)', kind: 'employer', segmentNo: 0, amount: edli, explanation: 'Deposit-linked insurance on the PF wage up to its ceiling.', rule: c });
    add({ code: 'pf_admin', name: 'PF admin charges (employer)', kind: 'employer', segmentNo: 0, amount: roundFor(base.mul(String(pfRs.values.adminRate)), 'rupee'), explanation: 'PF administration charges on this wage (the establishment minimum is settled on the challan).', rule: c });
  }
  const esiRs = rule('IN.ESI');
  if (esiRs && s.profile.esi !== 'no') {
    const covered = s.profile.esi === 'yes' || s.profile.esiCoveredThisPeriod;
    const r = esi(esiRs, { esiWage: earned('esiWage').add(addBack), covered });
    add({ code: statCode('esi_employee'), name: nameOf(statCode('esi_employee'), 'ESI'), kind: 'deduction', segmentNo: 0, amount: r.employee, explanation: covered ? `ESI on the ESI wage ${rupees(earned('esiWage').add(addBack))}, rounded up to the rupee (covered for this contribution period).` : 'Not covered by ESI this contribution period.', rule: r.citation });
    add({ code: statCode('esi_employer'), name: nameOf(statCode('esi_employer'), 'ESI (employer)'), kind: 'employer', segmentNo: 0, amount: r.employer, explanation: 'Employer ESI on the same wage, rounded up.', rule: r.citation });
  }
  const ptRs = rule('IN.PT', [s.profile.ptState]);
  if (ptRs) {
    const halfYear = (ptRs.values as { basis?: string }).basis === 'half_yearly';
    const r = pt(ptRs, { ptWage: halfYear ? earned('ptWage').mul(6) : earned('ptWage'), month, gender: s.profile.gender });
    const capRs = rule('IN.PT');
    const room = capRs && capRs.values.kind === 'pt_limit' ? Prisma.Decimal.max(ZERO, D(String(capRs.values.annualMax)).sub(s.ytd.pt)) : r.amount;
    const amount = Prisma.Decimal.min(r.amount, room);
    add({ code: statCode('pt'), name: nameOf(statCode('pt'), 'Professional tax'), kind: 'deduction', segmentNo: 0, amount, explanation: `${s.profile.ptState} professional tax for this month on the PT wage ${rupees(earned('ptWage'))}${amount.lt(r.amount) ? ', limited by the yearly ceiling' : ''}.`, rule: r.citation });
  }
  const lwfRs = s.profile.lwfState ? rule('IN.LWF', [s.profile.lwfState]) : null;
  if (lwfRs) {
    const r = lwf(lwfRs, { month });
    add({ code: statCode('lwf_employee'), name: nameOf(statCode('lwf_employee'), 'Labour welfare fund'), kind: 'deduction', segmentNo: 0, amount: r.employee, explanation: `${s.profile.lwfState} labour welfare fund for this month.`, rule: r.citation });
    add({ code: statCode('lwf_employer'), name: nameOf(statCode('lwf_employer'), 'Labour welfare fund (employer)'), kind: 'employer', segmentNo: 0, amount: r.employer, explanation: 'Employer labour welfare fund for this month.', rule: r.citation });
  }
  const gratRs = rule('IN.SS-CODE') ?? rule('IN.GRATUITY');
  if (gratRs && gratRs.values.kind === 'gratuity') {
    const r = gratuity(gratRs, { gratuityWage: earned('gratuityWage').add(addBack) });
    add({ code: statCode('gratuity_provision'), name: nameOf(statCode('gratuity_provision'), 'Gratuity provision'), kind: 'employer', segmentNo: 0, amount: r.monthly, explanation: 'Monthly gratuity provision on the gratuity wage (paid on exit by eligibility).', rule: r.citation });
  }
  const bonusRs = rule('IN.BONUS');
  const mwRs = rule('IN.MW');
  const gross0 = lines.filter((l) => l.kind === 'earning').reduce((t, l) => t.add(l.amount), ZERO);
  const mwTable = last ? minWageTableFor(rules, last.state, on) : null;
  if (mwTable) used.set(`${mwTable.statute}|${mwTable.jurisdiction}`, mwTable);
  const mw = mwRs ? minWage(mwRs, { table: mwTable, zone: last?.zone, skill: last?.skill ?? null }) : null;
  if (bonusRs) {
    const r = bonus(bonusRs, { bonusWage: earned('bonusWage').add(addBack), rate: s.options.bonusRate ?? String(bonusRs.values.minRate), minWageMonthly: mw?.monthly ?? ZERO });
    if (r.eligible) {
      if (s.options.bonusPayment === 'monthly') add({ code: 'bonus', name: nameOf('bonus', 'Bonus'), kind: 'earning', segmentNo: 0, amount: r.monthly, explanation: 'Statutory bonus paid monthly, as the company chose.', rule: r.citation });
      else add({ code: statCode('bonus_provision'), name: nameOf(statCode('bonus_provision'), 'Statutory bonus provision'), kind: 'employer', segmentNo: 0, amount: r.monthly, explanation: 'Monthly provision for the statutory bonus (paid once a year).', rule: r.citation });
    }
  }

  // 5b. Income tax: the year's projection spread over the periods left (PAY-5.02); the same function makes the tax sheet.
  let tax: TaxProjection | null = null;
  if (s.tax) {
    rule('IN.TDS');
    rule('IN.TAXDED');
    const sumOf = (pick: (l: CalcLine) => boolean) => lines.filter(pick).reduce((t, l) => t.add(l.amount), ZERO).toFixed(2);
    tax = projectTax(s.tax, rules, { month: on.slice(0, 7), gross: sumOf((l) => l.kind === 'earning' && comps.get(l.code)?.taxable !== false), basic: sumOf((l) => l.code === 'basic'), hra: sumOf((l) => l.code === 'hra'), pt: sumOf((l) => l.code === statCode('pt')) });
    const tdsRs = rule('IN.TDS');
    add({ code: statCode('tds'), name: nameOf(statCode('tds'), 'Income tax (TDS)'), kind: 'deduction', segmentNo: 0, amount: D(tax.monthTds), explanation: `Tax for the year ${rupees(tax.tax.total)} (${tax.regime} regime) less ${rupees(tax.alreadyDeducted)} already deducted, over ${tax.remainingPeriods} pay ${tax.remainingPeriods === 1 ? 'period' : 'periods'}.`, rule: tdsRs ? cite(tdsRs) : undefined });
  }

  // 6. Recoveries in legal order within the protected net and the deduction cap (§8.4); a negative net is carried forward.
  const gross = lines.filter((l) => l.kind === 'earning').reduce((t, l) => t.add(l.amount), ZERO);
  const statutoryDed = lines.filter((l) => l.kind === 'deduction').reduce((t, l) => t.add(l.amount), ZERO);
  const capRs = rule('IN.WAGES');
  const cap = capRs && capRs.values.kind === 'deduction_cap' ? D(deductionCap(capRs, { wages: gross, coop: false }).cap) : gross;
  const protectedNet = gross.mul(s.options.protectedNetPercent).div(100);
  let room = Prisma.Decimal.max(ZERO, Prisma.Decimal.min(cap.sub(statutoryDed), gross.sub(statutoryDed).sub(protectedNet)));
  const out: CalcResult['recoveries'] = { courtOrders: [], loans: [], carryForwards: [] };
  const deferred: CalcResult['deferred'] = [];
  const take = (want: Prisma.Decimal, kind: string, ref: string) => {
    const got = Prisma.Decimal.min(want, room);
    room = room.sub(got);
    if (got.lt(want)) deferred.push({ kind, ref, amount: want.sub(got).toFixed(2) });
    return got;
  };
  for (const o of [...s.recoveries.courtOrders].sort((a, b) => a.priorityDate.localeCompare(b.priorityDate))) {
    let want = o.amount !== null ? D(o.amount) : r2(gross.sub(statutoryDed).mul(o.percent ?? 0).div(100));
    if (o.remaining !== null) want = Prisma.Decimal.min(want, o.remaining);
    const got = take(want, 'court_order', o.ref);
    out.courtOrders.push({ id: o.id, amount: got.toFixed(2) });
    add({ code: 'court_attachment', name: nameOf('court_attachment', 'Court attachment'), kind: 'deduction', segmentNo: 0, amount: got, explanation: `Court order ${o.ref} (dated ${o.priorityDate}), recovered in order of date${got.lt(want) ? `; ${rupees(want.sub(got))} deferred (cap or protected net)` : ''}.`, sourceRef: o.id });
  }
  for (const l of s.recoveries.loans) {
    const got = take(Prisma.Decimal.min(D(l.emi), D(l.outstanding)), 'loan', l.id);
    out.loans.push({ id: l.id, amount: got.toFixed(2) });
    add({ code: 'loan_emi', name: nameOf('loan_emi', 'Loan instalment'), kind: 'deduction', segmentNo: 0, amount: got, explanation: `Instalment of ${rupees(l.emi)} on a balance of ${rupees(l.outstanding)}.`, sourceRef: l.id });
  }
  for (const c of s.recoveries.carryForwards) {
    const got = take(D(c.balance), 'carry_forward', c.id);
    out.carryForwards.push({ id: c.id, amount: got.toFixed(2) });
    add({ code: 'carry_forward_recovery', name: 'Recovery of earlier negative pay', kind: 'deduction', segmentNo: 0, amount: got, explanation: `Recovers ${rupees(got)} of ${rupees(c.balance)} carried from an earlier month.`, sourceRef: c.id });
  }

  // 7. Net, rounding, employer cost.
  const deductions = lines.filter((l) => l.kind === 'deduction').reduce((t, l) => t.add(l.amount), ZERO);
  let net = gross.sub(deductions);
  let carryForward = ZERO;
  if (net.isNegative()) {
    carryForward = net.neg();
    add({ code: 'negative_net', name: 'Carried to next month', kind: 'info', segmentNo: 0, amount: carryForward, explanation: `Deductions exceed pay by ${rupees(carryForward)}; net is zero and the rest is recovered later.` });
    net = ZERO;
  }
  if (s.options.netRounding === 'rupee') {
    const rounded = net.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    if (!rounded.eq(net)) add({ code: 'net_rounding', name: 'Net pay rounding', kind: 'info', segmentNo: 0, amount: rounded.sub(net), explanation: 'Net pay rounded to the rupee (company rule).' });
    net = rounded;
  }
  const employerCost = gross.add(lines.filter((l) => l.kind === 'employer').reduce((t, l) => t.add(l.amount), ZERO));
  if (s.held) add({ code: 'held', name: 'Net pay held', kind: 'info', segmentNo: 0, amount: net, explanation: 'Net pay is held; statutory deductions are made as usual and the pay is released later.' });
  const minW = mw ? { monthly: mw.monthly.toFixed(2), below: gross0.lt(mw.monthly) && unpaid.isZero(), floorApplied: mw.floorApplied, skillFallback: !!mw.state?.skillFallback } : null;
  const ruleVersions = Object.fromEntries([...used.entries()].map(([k, v]) => [k, v.version]));
  const result = { lines, gross: gross.toFixed(2), deductions: deductions.toFixed(2), net: net.toFixed(2), employerCost: employerCost.toFixed(2), verify: lines.some((l) => l.verify), ruleVersions, recoveries: out, deferred, carryForward: carryForward.toFixed(2), minWage: minW, tax };
  return { ...result, resultHash: hashOf({ lines, gross: result.gross, deductions: result.deductions, net: result.net, employerCost: result.employerCost }) };
}
