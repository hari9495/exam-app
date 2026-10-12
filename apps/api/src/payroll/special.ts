import { Prisma } from '@prisma/client';

// Batch 5i calculators (M03 YX-PAY-59 … 63): pure functions over values, no database and no legal figures (minimum
// wages, the lay-off share and the VRS limit come in from the P07 rules). Money is Decimal, rounded to the paisa.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const r2 = (x: Prisma.Decimal) => x.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export class SpecialPayError extends Error {}

/** Days from `from` to `to`, both included (ISO dates). */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

// ------------------------------------------------------------------------------------------ piece-rate (YX-PAY-59)

export interface RateCard {
  operationCode: string;
  rate: string;
  validFrom: string;
  validTo: string | null;
}
export interface Output {
  workDate: string;
  operationCode: string;
  quantity: string;
}

/**
 * Σ(output × the card's rate on the output date); below the time-rate minimum wage for the days worked, a named
 * top-up makes up the difference. An output with no card in force is an error (never paid at a guess).
 */
export function pieceRate(cards: RateCard[], outputs: Output[], minimumDaily: string) {
  let earnings = ZERO;
  const missing: string[] = [];
  for (const o of outputs) {
    const card = cards.filter((c) => c.operationCode === o.operationCode && c.validFrom <= o.workDate && (!c.validTo || c.validTo >= o.workDate)).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
    if (!card) missing.push(`${o.operationCode} on ${o.workDate}`);
    else earnings = earnings.add(D(o.quantity).mul(card.rate));
  }
  if (missing.length) throw new SpecialPayError(`No piece rate in force for ${missing.slice(0, 5).join(', ')}.`);
  const daysWorked = new Set(outputs.map((o) => o.workDate)).size;
  const floor = D(minimumDaily).mul(daysWorked);
  const pay = r2(earnings);
  return { earnings: pay, daysWorked, minimum: r2(floor), topUp: floor.gt(pay) ? r2(floor.sub(pay)) : ZERO };
}

// ------------------------------------------------------------------------------------------ incentives (YX-PAY-60)

export interface Tier {
  /** Attainment (% of quota) where the band starts. */
  from: number;
  /** Paid per point of attainment in the band, as a multiple of the target (1 = on-target pay; 1.5 an accelerator). */
  multiplier: number;
}

/**
 * Tiered pay on attainment: each band pays target × (its width in % of quota ÷ 100) × its multiplier, so a band from 0
 * with multiplier 0 is a threshold and a band from 100 with 1.5 is an accelerator; the cap is a % of the target.
 */
export function incentive(plan: { targetAmount: string; tiers: Tier[]; capPercent: string | null }, quota: string, actual: string) {
  if (D(quota).lte(0)) throw new SpecialPayError('The quota is above zero.');
  const tiers = [...plan.tiers].sort((a, b) => a.from - b.from);
  if (!tiers.length || tiers[0].from !== 0) throw new SpecialPayError('The first tier starts at 0 % of quota.');
  const attainment = D(actual).div(quota).mul(100);
  let pay = ZERO;
  const bands: { from: number; to: number | null; points: string; amount: string }[] = [];
  tiers.forEach((t, i) => {
    const to = tiers[i + 1]?.from ?? null;
    const top = to === null ? attainment : Prisma.Decimal.min(attainment, to);
    const points = Prisma.Decimal.max(ZERO, top.sub(t.from));
    const amount = D(plan.targetAmount).mul(points).div(100).mul(t.multiplier);
    if (points.gt(0)) bands.push({ from: t.from, to, points: points.toFixed(2), amount: r2(amount).toFixed(2) });
    pay = pay.add(amount);
  });
  const cap = plan.capPercent ? D(plan.targetAmount).mul(plan.capPercent).div(100) : null;
  const capped = cap !== null && pay.gt(cap);
  return { attainment: attainment.toDecimalPlaces(2).toFixed(2), amount: r2(capped ? cap! : pay), capped, bands };
}

// ------------------------------------------------------------------------------------------ tips (YX-PAY-61)

/** A pool shared by each person's basis (points, hours or shifts); the paise left by rounding go to the largest basis. */
export function tipShares(amount: string, bases: { employmentId: string; basis: string }[]) {
  const total = bases.reduce((t, b) => t.add(b.basis), ZERO);
  if (!bases.length || total.lte(0)) throw new SpecialPayError('Give everyone’s share basis (points, hours or shifts).');
  const shares = bases.map((b) => ({ employmentId: b.employmentId, basis: b.basis, amount: D(amount).mul(b.basis).div(total).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN) }));
  const left = D(amount).sub(shares.reduce((t, s) => t.add(s.amount), ZERO));
  const top = shares.reduce((a, b) => (D(b.basis).gt(a.basis) ? b : a));
  top.amount = top.amount.add(left);
  return shares;
}

// ------------------------------------------------------------------------------------------ on-call (YX-PAY-62)

/** A standby allowance per slot; a call-out pays max(hours, the minimum) × rate × multiplier. */
export function oncall(rule: { standbyAmount: string; calloutMinHours: string; calloutRate: string; multiplier: string }, slots: { calloutHours: string | null }[]) {
  const standby = D(rule.standbyAmount).mul(slots.length);
  const callout = slots.filter((s) => s.calloutHours).reduce((t, s) => t.add(Prisma.Decimal.max(D(s.calloutHours!), D(rule.calloutMinHours)).mul(rule.calloutRate).mul(rule.multiplier)), ZERO);
  return { standby: r2(standby), callout: r2(callout), callouts: slots.filter((s) => s.calloutHours).length };
}

// ------------------------------------------------------------------------------------------ industrial relations (YX-PAY-63)

/** Union dues: a fixed amount, or a per cent of the month's basic and DA. */
export function unionDues(a: { duesKind: string; duesValue: string }, basicDaMonthly: string) {
  return r2(a.duesKind === 'fixed' ? D(a.duesValue) : D(basicDaMonthly).mul(a.duesValue).div(100));
}

/** Lay-off compensation: the rule's share of the basic and DA for the lay-off days (of the month's days). */
export function layoffComp(share: string, basicDaMonthly: string, days: string, monthDays: number) {
  return r2(D(basicDaMonthly).div(monthDays).mul(days).mul(share));
}

/**
 * Settlement arrears from the effective date to the end of the month before `until` (a pay month): the monthly increase
 * for each month covered, part months by their days.
 */
export function settlementArrears(monthlyIncrease: string, effectiveFrom: string, until: string) {
  const months: { month: string; days: number; of: number; amount: string }[] = [];
  let m = effectiveFrom.slice(0, 7);
  while (m < until) {
    const [y, mo] = m.split('-').map(Number);
    const of = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const first = effectiveFrom > `${m}-01` ? effectiveFrom : `${m}-01`;
    const days = daysBetween(first, `${m}-${String(of).padStart(2, '0')}`);
    months.push({ month: m, days, of, amount: r2(D(monthlyIncrease).mul(days).div(of)).toFixed(2) });
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  }
  return { months, total: months.reduce((t, x) => t.add(x.amount), ZERO) };
}

/** VRS: exempt up to what is left of the lifetime limit after an earlier claim; the rest is taxed as salary. */
export function vrsSplit(amount: string, limit: string, priorExemption: string) {
  const left = Prisma.Decimal.max(ZERO, D(limit).sub(priorExemption));
  const exempt = Prisma.Decimal.min(left, D(amount));
  return { exempt: r2(exempt), taxable: r2(D(amount).sub(exempt)) };
}
