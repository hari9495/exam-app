import { Prisma } from '@prisma/client';
import { evaluate, fieldsUsed, type FieldDef, type Group, type RecordValues } from '../rules-engine/conditions';

// Expense rules as pure functions (M05-BUILD-DESIGN §7, §13.4): which policy applies, the limit check, computed
// mileage and per-diem amounts, and the GSTIN check. No Nest, no Prisma client: the services load the data.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const r2 = (x: Prisma.Decimal) => x.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

// ------------------------------------------------------------------------------------------ which policy (§7.1)

export interface PolicyLike {
  id: string;
  appliesIf: Group | null;
  priority: number;
  validFrom: string;
  validTo: string | null;
  status: string;
}

/**
 * The employee's policy on a day: active and in force, its "applies to" condition passing for the employee's record;
 * the most specific (most fields in the condition) wins, then the lowest priority number, then the latest start.
 */
export function pickPolicy<P extends PolicyLike>(policies: readonly P[], record: RecordValues, fields: readonly FieldDef[], on: string): P | null {
  const fits = policies.filter((p) => p.status === 'active' && p.validFrom <= on && (!p.validTo || p.validTo >= on) && (!p.appliesIf || evaluate(p.appliesIf, record, fields).pass));
  const specific = (p: P) => (p.appliesIf ? fieldsUsed(p.appliesIf).length : 0);
  return [...fits].sort((a, b) => specific(b) - specific(a) || a.priority - b.priority || b.validFrom.localeCompare(a.validFrom))[0] ?? null;
}

// ------------------------------------------------------------------------------------------ limits (§7.2, §7.3)

export interface RuleLike {
  categoryCode: string;
  tierId: string | null;
  perLine: string | null;
  perDay: string | null;
  perTrip: string | null;
  perMonth: string | null;
  overLimit: 'justify_and_approve' | 'block';
}

/** The rule for a category in a tier: the tier's own row, else the "any tier" row; none means not allowed. */
export function ruleFor<R extends RuleLike>(rules: readonly R[], categoryCode: string, tierId: string | null): R | null {
  return rules.find((r) => r.categoryCode === categoryCode && r.tierId === tierId) ?? rules.find((r) => r.categoryCode === categoryCode && r.tierId === null) ?? null;
}

export type LimitKind = 'per_line' | 'per_day' | 'per_trip' | 'per_month';
export interface LimitResult {
  outcome: 'ok' | 'over_justify' | 'blocked' | 'not_allowed';
  /** The tightest limit this line breaks (or the first that applies when within all). */
  limit: { kind: LimitKind; amount: string; used: string; remaining: string } | null;
  overBy: string;
}

/**
 * One line against its rule. `used` holds what the employee already has in the same day / trip / month for the
 * category (approved and pending lines), without this line. The biggest excess decides.
 */
export function checkLimit(rule: RuleLike | null, amount: string, used: { day: string; trip: string | null; month: string }): LimitResult {
  if (!rule) return { outcome: 'not_allowed', limit: null, overBy: '0.00' };
  const a = D(amount);
  const windows: [LimitKind, string | null, Prisma.Decimal][] = [
    ['per_line', rule.perLine, D(0)],
    ['per_day', rule.perDay, D(used.day)],
    ['per_trip', used.trip === null ? null : rule.perTrip, D(used.trip ?? 0)],
    ['per_month', rule.perMonth, D(used.month)],
  ];
  let worst: LimitResult['limit'] = null;
  let worstOver = D(0);
  for (const [kind, cap, before] of windows) {
    if (cap === null) continue;
    const over = before.add(a).sub(D(cap));
    const view = { kind, amount: r2(D(cap)).toFixed(2), used: r2(before).toFixed(2), remaining: r2(Prisma.Decimal.max(D(cap).sub(before), 0)).toFixed(2) };
    if (!worst || over.gt(worstOver)) {
      worst = view;
      worstOver = over;
    }
  }
  if (worstOver.lte(0)) return { outcome: 'ok', limit: worst, overBy: '0.00' };
  return { outcome: rule.overLimit === 'block' ? 'blocked' : 'over_justify', limit: worst, overBy: r2(worstOver).toFixed(2) };
}

/** YX-EXP-03: a receipt above the category's threshold (null threshold = always; computed kinds never). */
export function receiptNeed(kind: string, receiptAbove: string | null, amount: string): 'required' | 'declaration' | 'none' {
  if (kind === 'mileage' || kind === 'per_diem') return 'none';
  if (receiptAbove === null) return 'required';
  return D(amount).gt(D(receiptAbove)) ? 'required' : 'declaration';
}

// ------------------------------------------------------------------------------------------ computed amounts (YX-EXP-03)

/** km × rate, refusing what passes the monthly cap (km already claimed this month given). */
export function mileageAmount(km: number, ratePerKm: string, cap: number | null, kmThisMonth: number): { amount: string } | { problem: string } {
  if (!(km > 0) || km > 5000 || Math.round(km * 10) !== km * 10) return { problem: 'Enter the distance in km (up to one decimal place).' };
  if (cap !== null && kmThisMonth + km > cap) return { problem: `This passes the monthly limit of ${cap} km (${kmThisMonth} km claimed already).` };
  return { amount: r2(D(km).mul(D(ratePerKm))).toFixed(2) };
}

export type Meal = 'breakfast' | 'lunch' | 'dinner';
/**
 * days × rate. Partial days (the first and last day of a trip that starts late or ends early) count in full or at half
 * by the company's rule; each meal the company provided takes its share of the day's rate off. Never below zero.
 */
export function perDiemAmount(ratePerDay: string, days: { full: number; partial: number }, rule: 'full' | 'half_after_hours', mealsProvided: Partial<Record<Meal, number>>, mealsDeduction: Partial<Record<Meal, number>>): string {
  const rate = D(ratePerDay);
  const dayCount = D(days.full).add(D(days.partial).mul(rule === 'full' ? 1 : 0.5));
  let total = rate.mul(dayCount);
  for (const m of ['breakfast', 'lunch', 'dinner'] as const) total = total.sub(rate.mul(D(mealsDeduction[m] ?? 0)).mul(D(mealsProvided[m] ?? 0)));
  return r2(Prisma.Decimal.max(total, 0)).toFixed(2);
}

// ------------------------------------------------------------------------------------------ GSTIN (§13.4)

/** GST state codes (two digits) as published for GST registration: the states and union territories, and 97. */
export const GST_STATE_CODES: readonly string[] = [...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')), '97'];
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The 15th character of a GSTIN from the first 14 (factors 1, 2 alternating, base 36). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = B36.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return B36[(36 - (sum % 36)) % 36];
}

/** Shape, state code and check character; null when valid, else the problem in plain words. */
export function gstinProblem(gstin: string): string | null {
  const g = gstin.trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return 'A GSTIN has 15 characters: state code, PAN, entity number, Z and a check character.';
  if (!GST_STATE_CODES.includes(g.slice(0, 2))) return `${g.slice(0, 2)} is not a GST state code.`;
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return 'The GSTIN check character does not match; check for a typing mistake.';
  return null;
}
