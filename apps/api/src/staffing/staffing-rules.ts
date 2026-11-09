// Staffing desk slice 1: the pure rules (money in paise, dated rate changes, financial years). No database here.

/** Rupees as text ("1200", "1200.5", "1200.50") to whole paise, exactly (no floating point). Null when not a valid amount. */
export function toPaise(rupees: string): bigint | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(rupees.trim());
  if (!m) return null;
  return BigInt(m[1]!) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0');
}

/** Paise to rupees text with two decimals ("1200.00"). */
export function toRupees(paise: bigint): string {
  const neg = paise < 0n;
  const a = neg ? -paise : paise;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
}

/** Gross margin in per cent of the bill rate, one decimal, as text; exact integer arithmetic then rounded half up. */
export function marginPct(billPaise: bigint, payPaise: bigint): string {
  if (billPaise <= 0n) return '0.0';
  const tenths = ((billPaise - payPaise) * 1000n * 2n + billPaise) / (2n * billPaise); // round half up
  return `${tenths / 10n}.${tenths % 10n}`;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * A dated change of a rate-card line: it starts after the current version started, and no earlier than the company
 * allows (setting staffing.rate_change.backdate_days, 0 = from today). Returns the reason it is refused, or null; the
 * current version then ends the day before.
 */
export function rateChangeProblem(currentFrom: string, newFrom: string, today: string, backdateDays: number): string | null {
  if (newFrom <= currentFrom) return `The new rate must start after ${currentFrom}, when the current rate started.`;
  const earliest = addDays(today, -backdateDays);
  if (newFrom < earliest) return backdateDays ? `A new rate can start at most ${backdateDays} days back (from ${earliest}).` : 'A new rate starts today or later.';
  return null;
}
export const dayBefore = (iso: string) => addDays(iso, -1);

/** The Indian financial year a day falls in, e.g. 2026-11-14 → 2026-27. */
export function financialYear(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
