import { Prisma } from '@prisma/client';

// Founder decision 8 (29 Oct 2026): a loan or advance is at most `payroll.loan.max_gross_months` of monthly gross pay,
// less what the person still owes on open loans; 'none' means no limit. Money stays Decimal end to end.

const ZERO = new Prisma.Decimal(0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The setting's text as a number of months, or null for no limit. */
export const maxMonthsOf = (setting: string): number | null => (setting === 'none' ? null : Number(setting));

/** limit = gross × months; available = max(0, limit − outstanding). Both null when there is no limit. */
export function loanRoom(monthlyGross: Prisma.Decimal, months: number | null, outstanding: Prisma.Decimal) {
  if (months === null) return { limit: null, available: null };
  const limit = monthlyGross.mul(months).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { limit, available: Prisma.Decimal.max(ZERO, limit.sub(outstanding)) };
}

/** "2026-12-14" as "14 Dec 2026" (the web's formatDate). */
export const dayMonYear = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
