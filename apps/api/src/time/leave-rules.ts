import { addDays, daysBetween } from './time-maths';

// Leave v2 rules as plain functions (unit-tested in leave-rules.spec.ts). Sources: company settings (settings-registry
// "leave.*"), the Factories Act 1948 s.79 for earned leave in factories, the Maternity Benefit Act 1961.

/** A comp-off credit in the ledger, with what has already lapsed from it. */
export interface CompOffCredit {
  key: string;
  on: string;
  days: number;
  lapsed: number;
}

/**
 * Comp-off expiry (TIM-22). Days used are taken from the oldest credit first; whatever is left of a credit whose
 * use-by date (work date + expiryDays) is before `today` lapses once. `used` is the days taken net of cancellations.
 */
export function compOffExpiries(credits: readonly CompOffCredit[], used: number, expiryDays: number | null, today: string): { key: string; on: string; days: number }[] {
  if (expiryDays === null) return [];
  let left = Math.max(0, used);
  const out: { key: string; on: string; days: number }[] = [];
  for (const c of [...credits].sort((a, b) => a.on.localeCompare(b.on) || a.key.localeCompare(b.key))) {
    const capacity = Math.max(0, c.days - c.lapsed);
    const taken = Math.min(capacity, left);
    left -= taken;
    const rest = Math.round((capacity - taken) * 100) / 100;
    if (c.lapsed === 0 && rest > 0 && addDays(c.on, expiryDays) < today) out.push({ key: c.key, on: c.on, days: rest });
  }
  return out;
}

/** The last day a comp-off credit for work on `workedOn` can be used (null: never expires). */
export const compOffUseBy = (workedOn: string, expiryDays: number | null) => (expiryDays === null ? null : addDays(workedOn, expiryDays));

/**
 * TIM-24: the most days one can cash in now: the yearly cap less what was cashed in this leave year, and never so
 * many that fewer than `minLeft` days stay available. Half days, never below 0.
 */
export function encashMax(o: { available: number; maxPerYear: number; minLeft: number; encashedThisYear: number }): number {
  const n = Math.min(o.maxPerYear - o.encashedThisYear, o.available - o.minLeft);
  return n <= 0 ? 0 : Math.floor(n * 2) / 2;
}

/** TIM-24: whether the in-service window is open in `month` (1-12) for the setting value. */
export const encashWindowOpen = (setting: string, month: number) => setting === 'any_month' || setting === String(month);

/** Amount for days at a monthly wage over a divisor, to the rupee paisa. */
export function encashAmount(monthly: number, divisor: number, days: number): { dailyRate: number; amount: number } {
  const dailyRate = Math.round((monthly / divisor) * 100) / 100;
  return { dailyRate, amount: Math.round(dailyRate * days * 100) / 100 };
}

/** Leave kinds a probation setting allows (lop and the per-event kinds are always allowed). */
export function probationAllows(mode: string, kind: string): boolean {
  if (['lop', 'maternity', 'paternity'].includes(kind)) return true;
  if (mode === 'unpaid_only') return false;
  if (mode === 'casual_sick_unpaid') return kind === 'casual' || kind === 'sick';
  return true;
}

/**
 * Leave during the notice period: the last working day after this leave. With "extends_last_day" it moves by the
 * calendar days the leave counts, rounded up (a half day moves it a whole day).
 */
export function lastDayAfterLeave(mode: string, lastDay: string, leaveDays: number): string {
  return mode === 'extends_last_day' && leaveDays > 0 ? addDays(lastDay, Math.ceil(leaveDays)) : lastDay;
}

/** Kinds that company block dates never stop (illness and per-event leave cannot be planned around a date). */
export const BLOCK_DATE_EXEMPT = ['sick', 'maternity', 'paternity', 'lop'];

/**
 * TIM-23: the optional-holiday limit for someone who moved to this calendar's office on `movedOn` during the leave
 * year: the yearly limit times the whole months left (the month of the move counts), rounded to the nearest day.
 */
export function optionalLimitAfterMove(limit: number, yearStart: string, movedOn: string | null): number {
  if (!movedOn || movedOn <= yearStart) return limit;
  const [ys, ms] = [Number(yearStart.slice(0, 4)), Number(yearStart.slice(5, 7))];
  const [ym, mm] = [Number(movedOn.slice(0, 4)), Number(movedOn.slice(5, 7))];
  const monthsBefore = (ym - ys) * 12 + (mm - ms);
  if (monthsBefore >= 12) return limit;
  return Math.round((limit * (12 - monthsBefore)) / 12);
}

/**
 * Factories Act 1948 s.79(1): earned leave in a year needs 240 days worked in the year before; someone who joined
 * during that year needs two thirds of its days from joining. Someone who joined this year earns it from next year.
 */
export function factoriesElEligible(o: { worked: number; joinedOn: string; prevYearStart: string; prevYearEnd: string }): { ok: boolean; needed: number } {
  if (o.joinedOn > o.prevYearEnd) return { ok: false, needed: 240 };
  const needed = o.joinedOn <= o.prevYearStart ? 240 : Math.ceil(((daysBetween(o.joinedOn, o.prevYearEnd) + 1) * 2) / 3);
  return { ok: o.worked >= needed, needed };
}

/** Consecutive working days in the longest run of leave days (`off` days inside a run neither break nor count). */
export function longestRun(leaveDays: ReadonlySet<string>, from: string, to: string, isOff: (d: string) => boolean): number {
  let best = 0;
  let run = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (leaveDays.has(d)) run += 1;
    else if (!isOff(d)) run = 0;
    best = Math.max(best, run);
  }
  return best;
}

/** CSV with every cell quoted; a leading = + - @ is neutralised so a spreadsheet never runs it (CWE-1236). */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return `"${(/^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/**
 * Founder decision 2 (29 Oct 2026): the notice a leave type asks for. Its own number when set; otherwise sick leave
 * asks for none and every other type for the company default (leave.notice_days.default).
 */
export const noticeDaysFor = (own: number | null | undefined, kind: string, companyDefault: number) => own ?? (kind === 'sick' ? 0 : companyDefault);

/** "1 day's" / "7 days'" (notice). */
export const noticeText = (n: number) => (n === 1 ? "1 day's" : `${n} days'`);

/**
 * Founder decision 3: daily pay for the leave liability, to the paisa: monthly pay ÷ 26, ÷ 30, or ÷ the days in the
 * month of `on` (yyyy-mm-dd) for "calendar".
 */
export function dailyPay(monthly: number, divisor: string, on: string): number {
  const [y, m] = on.split('-').map(Number);
  const n = divisor === 'calendar' ? new Date(Date.UTC(y!, m!, 0)).getUTCDate() : Number(divisor);
  return Math.round((monthly / n) * 100) / 100;
}

/** Founder decision 1: does a company block date stop this leave type? HR's chosen types; none chosen: planned leave only. */
export const blockDateStops = (types: readonly string[], typeId: string, kind: string) => (types.length ? types.includes(typeId) : !BLOCK_DATE_EXEMPT.includes(kind));

/**
 * TIM-28: the leave policy for a person on a date. `rows` are the policy assignments (value = policy id), `fallback`
 * the most-specific-scope answer (YX-ORG-18). With a saved policy order, the person's current assignment highest in
 * the order wins instead; a per-person assignment (an override) always wins; policies left out of the order follow it.
 */
export function pickPolicy(rows: readonly { scopeType: string; scopeId: string; value: string; validFrom: string | null }[], ctx: Readonly<Record<string, string | undefined>>, on: string, fallback: { value: string; scopeType: string }, order: readonly string[] | null): string | null {
  if (!order?.length || fallback.scopeType === 'employee') return fallback.value || null;
  const current: string[] = [];
  for (const [t, id] of Object.entries(ctx)) {
    if (!id || t === 'employee') continue;
    const at = rows.filter((r) => r.scopeType === t && r.scopeId === id && r.validFrom !== null && r.validFrom <= on);
    if (at.length) current.push(at.reduce((a, b) => (a.validFrom! >= b.validFrom! ? a : b)).value);
  }
  const ranked = current.filter((p) => order.includes(p)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return ranked[0] ?? (fallback.value || null);
}
