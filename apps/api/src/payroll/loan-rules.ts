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

/** Founder answer 1 (30 Oct 2026): the yearly interest rate is the company's per loan type; an expense recovery is interest-free. */
export const rateKeyOf = (loanType: string) => (loanType === 'loan' ? 'payroll.loan.interest_rate.loan' : loanType === 'advance' ? 'payroll.loan.interest_rate.advance' : null);

const addMonth = (month: string, n: number) => {
  const i = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
};
const monthInterest = (balance: Prisma.Decimal, ratePct: Prisma.Decimal) => balance.mul(ratePct).div(1200).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface ScheduleRow {
  no: number;
  month: string;
  emi: string;
  interest: string;
  principal: string;
  balance: string;
  status: 'recovered' | 'paused' | 'scheduled';
}

/**
 * PAY-17 (founder answer 5): the loan's months. Recovered rows are what payroll took (interest on the balance first, as
 * the run books it with `principalPart`); then the months still to come from the balance left: paused through
 * `pausedUntil` (instalments resume the month after), then one instalment a month until the balance is repaid.
 */
export function loanSchedule(l: {
  principal: Prisma.Decimal;
  ratePct: Prisma.Decimal;
  emi: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  firstMonth: string;
  pausedUntil: string | null;
  open: boolean;
  repayments: { month: string; amount: Prisma.Decimal }[];
}): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let bal = l.principal;
  for (const r of l.repayments) {
    const interest = monthInterest(bal, l.ratePct);
    const princ = Prisma.Decimal.max(ZERO, r.amount.sub(interest));
    bal = Prisma.Decimal.max(ZERO, bal.sub(princ));
    rows.push({ no: rows.length + 1, month: r.month, emi: r.amount.toFixed(2), interest: interest.toFixed(2), principal: princ.toFixed(2), balance: bal.toFixed(2), status: 'recovered' });
  }
  if (!l.open || l.outstanding.lte(0) || l.emi.lte(0)) return rows;
  const last = l.repayments.length ? l.repayments[l.repayments.length - 1].month : null;
  let month = last && addMonth(last, 1) > l.firstMonth ? addMonth(last, 1) : l.firstMonth;
  bal = l.outstanding;
  // shortcut: at most 240 future rows; an instalment too small to ever repay stops there (a reschedule changes it).
  for (let guard = 0; bal.gt(0) && guard < 240; guard++, month = addMonth(month, 1)) {
    if (l.pausedUntil && month <= l.pausedUntil) {
      rows.push({ no: rows.length + 1, month, emi: '0.00', interest: '0.00', principal: '0.00', balance: bal.toFixed(2), status: 'paused' });
      continue;
    }
    const interest = monthInterest(bal, l.ratePct);
    const pay = Prisma.Decimal.min(l.emi, bal.add(interest));
    const princ = Prisma.Decimal.max(ZERO, pay.sub(interest));
    bal = Prisma.Decimal.max(ZERO, bal.sub(princ));
    rows.push({ no: rows.length + 1, month, emi: pay.toFixed(2), interest: interest.toFixed(2), principal: princ.toFixed(2), balance: bal.toFixed(2), status: 'scheduled' });
  }
  return rows;
}

/**
 * Pre-closure interest (PAY-17): simple interest on the balance at the yearly rate for each day from `fromDay` up to and
 * including the closing day, on a 365-day year. Interest-free or not yet due: zero.
 */
export function closingInterest(outstanding: Prisma.Decimal, ratePct: Prisma.Decimal, fromDay: string, closingDay: string) {
  const days = Math.max(0, Math.round((Date.parse(`${closingDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000) + 1);
  if (!days || ratePct.isZero()) return { days, interest: new Prisma.Decimal('0.00') };
  return { days, interest: outstanding.mul(ratePct).mul(days).div(36500).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) };
}

/** The first day interest runs from: the month after the last month recovered, else the first instalment month. */
export const interestFrom = (firstMonth: string, lastRecovered: string | null) => `${lastRecovered && addMonth(lastRecovered, 1) > firstMonth ? addMonth(lastRecovered, 1) : firstMonth}-01`;
