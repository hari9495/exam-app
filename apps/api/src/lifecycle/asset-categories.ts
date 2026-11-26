import { Prisma } from '@prisma/client';

// IT assets part 1 (founder answer 2712): the company's asset categories (Settings 2.8) and the F&F recovery of an
// asset that is not returned.

/** The drawn starter list (Settings 2.8); migration 801 added it for every company that existed then. */
export const STARTER_CATEGORIES: { name: string; trackedBy: string; defaultRecovery: string | null; usefulLifeYears: number | null }[] = [
  { name: 'Laptop', trackedBy: 'Serial number', defaultRecovery: '45000.00', usefulLifeYears: 3 },
  { name: 'Phone', trackedBy: 'IMEI', defaultRecovery: '15000.00', usefulLifeYears: 3 },
  { name: 'SIM', trackedBy: 'Number', defaultRecovery: '500.00', usefulLifeYears: null },
  { name: 'ID / access card', trackedBy: 'Card number', defaultRecovery: '300.00', usefulLifeYears: null },
  { name: 'Safety shoes and PPE kit', trackedBy: 'Tag', defaultRecovery: '2500.00', usefulLifeYears: null },
  { name: 'Tools', trackedBy: 'Tag', defaultRecovery: null, usefulLifeYears: null },
];

/** Answer 2720: a category's tag pattern (no prefix: no pattern). */
export interface TagPattern {
  tagPrefix: string | null;
  tagYear: boolean;
  tagDigits: number;
}

/** What every tag of the pattern starts with this year ("LAP-2026-"), or null without a pattern. */
export const tagHead = (p: TagPattern, year: string): string | null => (p.tagPrefix ? `${p.tagPrefix}-${p.tagYear ? `${year}-` : ''}` : null);

/**
 * The next tag of the pattern: one more than the highest counter among the tags already made with it (typed tags that
 * do not follow it are ignored), padded to the digits; null without a pattern. Tags compare without case.
 */
export function nextTag(p: TagPattern, year: string, tags: string[]): string | null {
  const head = tagHead(p, year);
  if (!head) return null;
  let max = 0;
  for (const t of tags) {
    const rest = t.toUpperCase().startsWith(head.toUpperCase()) ? t.slice(head.length) : '';
    if (/^\d{1,9}$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return `${head}${String(max + 1).padStart(p.tagDigits, '0')}`;
}

export type RecoveryBasis = 'category_default' | 'written_down' | 'hr_decides';

/**
 * The amount payroll sees for an asset not returned (a possible recovery), or null when HR decides it. "Category
 * default" uses the category's amount, else the asset's cost (as before categories). "Written-down value" (answer 2713)
 * is the asset's net book value on the day; without one (no cost, purchase date or depreciation) HR decides.
 */
export function recoveryAmount(basis: string, categoryDefault: Prisma.Decimal | null | undefined, cost: Prisma.Decimal | null | undefined, writtenDown: string | null = null): string | null {
  if (basis === 'written_down') return writtenDown;
  if (basis !== 'category_default') return null;
  return (categoryDefault ?? cost)?.toFixed(2) ?? null;
}

/** A day plus whole months; the 31st becomes the month's last day (warranty ends, useful lives). */
export function addMonthsIso(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

/** A day plus n days (n may be negative). */
export const addDaysIso = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Answer 2717: a contract's last day: start + length x (renewals + 1), less a day (12 months from 1 Jan ends 31 Dec). */
export const contractEndsOn = (startsOn: string, months: number, renewals = 0) => addDaysIso(addMonthsIso(startsOn, months * (renewals + 1)), -1);

/** Answer 2714: the day notice must be given by: the end date less the notice period. */
export const contractNoticeOn = (endsOn: string, noticeDays: number) => addDaysIso(endsOn, -noticeDays);

/** Answer 2713: how a category depreciates (straight line over its useful life by default, or declining at a yearly rate). */
export interface DepreciationRule {
  depreciationMethod: string;
  usefulLifeYears: number | null;
  depreciationRate: Prisma.Decimal | null;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Answer 2713: the net book value on `asOf`, a management figure (not the tax books). Straight line (Companies Act
 * Schedule II style): the cost falls evenly, day by day, to 0 at the end of the useful life. Declining balance: the value
 * falls by the yearly rate on what is left, pro rata by day. No residual value (the plan names none): never below 0.
 * Null when it cannot be worked out: no cost, no purchase date, no useful life (straight line) or no rate (declining).
 */
export function netBookValue(cost: Prisma.Decimal | null | undefined, purchasedOn: string | null, asOf: string, rule: DepreciationRule): string | null {
  if (!cost || !purchasedOn) return null;
  const elapsed = Math.max(0, daysBetween(purchasedOn, asOf));
  let value: Prisma.Decimal;
  if (rule.depreciationMethod === 'declining') {
    const rate = rule.depreciationRate;
    if (!rate || rate.lte(0) || rate.gte(100)) return null;
    value = cost.mul(new Prisma.Decimal(1).minus(rate.div(100)).pow(new Prisma.Decimal(elapsed).div(365)));
  } else {
    if (!rule.usefulLifeYears || rule.usefulLifeYears <= 0) return null;
    const life = daysBetween(purchasedOn, addMonthsIso(purchasedOn, rule.usefulLifeYears * 12));
    value = elapsed >= life ? new Prisma.Decimal(0) : cost.mul(life - elapsed).div(life);
  }
  return Prisma.Decimal.max(value, 0).toFixed(2);
}

/** Answer 2715: daily or weekly repeats of a booking. */
export type BookingRepeat = 'none' | 'daily' | 'weekly';

/**
 * Answer 2715: the occurrences of a booking (the first, then every day or week starting up to `until`, at most 3 months
 * after the first day), or why it is refused: a start in the past, more days than the company allows, or a repeat
 * longer than its step (a daily repeat books single days; a weekly one at most 7 days).
 */
export function bookingDates(b: { startsOn: string; endsOn: string; repeat: BookingRepeat; until?: string | null }, today: string, maxDays: number): { dates: { startsOn: string; endsOn: string }[] } | { error: string } {
  if (b.startsOn < today) return { error: 'A booking cannot start in the past.' };
  if (b.endsOn < b.startsOn) return { error: 'The last day is on or after the first day.' };
  const days = Math.round((Date.parse(b.endsOn) - Date.parse(b.startsOn)) / 86_400_000) + 1;
  if (days > maxDays) return { error: `A booking is at most ${maxDays} ${maxDays === 1 ? 'day' : 'days'}.` };
  if (b.repeat === 'none') return { dates: [{ startsOn: b.startsOn, endsOn: b.endsOn }] };
  const step = b.repeat === 'daily' ? 1 : 7;
  if (days > step) return { error: b.repeat === 'daily' ? 'A daily repeat books one day at a time.' : 'A weekly repeat books at most 7 days at a time.' };
  if (!b.until || b.until <= b.startsOn) return { error: 'Choose the day the repeats end, after the first day.' };
  if (b.until > addMonthsIso(b.startsOn, 3)) return { error: 'Repeats go up to 3 months ahead.' };
  const dates: { startsOn: string; endsOn: string }[] = [];
  for (let s = b.startsOn; s <= b.until; s = addDaysIso(s, step)) dates.push({ startsOn: s, endsOn: addDaysIso(s, days - 1) });
  return { dates };
}
