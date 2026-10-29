import { Prisma } from '@prisma/client';

// PAY-24 statutory bonus (Payment of Bonus Act, 1965; M03 YX-PAY-16, Q8). Pure maths, exact decimals, no floats.
//   s.2(13) eligibility   bonus wage at most the eligibility limit a month (₹21,000); a month above it earns no bonus.
//   s.8                   at least 30 working days in the accounting year (s.14: paid days and lay-off days count).
//   s.12                  bonus is worked out on the wage up to the calculation ceiling: ₹7,000 or the minimum wage if higher.
//   s.10, s.11, s.13      at least 8.33 % (and at least ₹100, cut down for part of a year), at most 20 %, in proportion
//                         to the allocable surplus (s.2(4): 60 % of the available surplus, 67 % for some companies).
//   s.15                  set-on (surplus above the 20 % bonus, up to 20 % of the year's bonus wage) and set-off (a
//                         shortfall to pay the minimum) are carried forward, used oldest first, up to the fourth year.
//   s.17, s.18            puja or other customary bonus already paid, and a financial loss caused by misconduct, are
//                         deducted. s.9: someone dismissed for fraud, violence or theft gets no bonus.
//   s.19                  paid within 8 months of the year end.
// Every limit is a company setting (founder rule; the Act's values are the defaults), read into BonusRules.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const HUNDRED = D(100);
const rupee = (x: Prisma.Decimal) => x.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
const sum = (xs: Prisma.Decimal.Value[]) => xs.reduce<Prisma.Decimal>((t, x) => t.add(x), ZERO);

export interface BonusRules {
  /** Rupees a month; a month's bonus wage above it earns no bonus. */
  eligibilityWage: string;
  /** Rupees a month; bonus is worked out on the wage up to this or the minimum wage, whichever is higher. */
  calculationCeiling: string;
  /** Percent, e.g. "8.33". */
  minRate: string;
  /** Percent, e.g. "20". */
  maxRate: string;
  minWorkingDays: number;
  /** The least minimum bonus for a whole year (₹100), cut down by the months worked. */
  minAmount: string;
  /** Percent of the available surplus that is allocable (60 or 67). */
  allocablePercent: string;
  /** Set-on and set-off are carried for this many years. */
  carryYears: number;
  /** Months after the year end by which the bonus is paid. */
  dueMonths: number;
  /** 1 … 12, the month the accounting year starts. */
  yearStartMonth: number;
}

/** The Act's values: the defaults of the company settings. */
export const ACT_RULES: BonusRules = { eligibilityWage: '21000', calculationCeiling: '7000', minRate: '8.33', maxRate: '20', minWorkingDays: 30, minAmount: '100', allocablePercent: '60', carryYears: 4, dueMonths: 8, yearStartMonth: 4 };

// ------------------------------------------------------------------------------------------ the accounting year

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1 … 12
/** y-m plus n months, as [year, month]. */
const addMonths = (y: number, m: number, n: number): [number, number] => {
  const k = y * 12 + (m - 1) + n;
  return [Math.floor(k / 12), (k % 12) + 1];
};

export interface AccountingYear {
  start: string;
  end: string;
  /** "2025-26", or "2025" for a calendar year. */
  label: string;
  /** The last day to pay the bonus. */
  dueOn: string;
}

/** The accounting year that starts in `startYear` (start month from the rules). */
export function accountingYear(startYear: number, rules: Pick<BonusRules, 'yearStartMonth' | 'dueMonths'>): AccountingYear {
  const m = rules.yearStartMonth;
  const [ey, em] = addMonths(startYear, m, 11);
  const [dy, dm] = addMonths(ey, em, rules.dueMonths);
  return {
    start: `${startYear}-${pad(m)}-01`,
    end: `${ey}-${pad(em)}-${pad(lastDay(ey, em))}`,
    label: m === 1 ? String(startYear) : `${startYear}-${String(ey).slice(2)}`,
    dueOn: `${dy}-${pad(dm)}-${pad(lastDay(dy, dm))}`,
  };
}

/** The accounting year a day falls in. */
export function yearOf(day: string, rules: Pick<BonusRules, 'yearStartMonth' | 'dueMonths'>): AccountingYear {
  const [y, m] = day.split('-').map(Number);
  return accountingYear(m >= rules.yearStartMonth ? y : y - 1, rules);
}

/** The months of a year as yyyy-mm. */
export function yearMonths(year: AccountingYear): string[] {
  const [y, m] = year.start.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const [a, b] = addMonths(y, m, i);
    return `${a}-${pad(b)}`;
  });
}

// ------------------------------------------------------------------------------------------ one employee

export interface EmployeeInput {
  /** The bonus wage earned each month of the year (bonusWage components). */
  months: { month: string; wage: Prisma.Decimal.Value }[];
  /** Working days in the year (paid and lay-off days). */
  days: Prisma.Decimal.Value;
  /** The scheduled minimum wage a month at their place of work (0 when none applies). */
  minimumWage: Prisma.Decimal.Value;
  disqualified?: boolean;
  /** Puja or other customary bonus, or an interim bonus, already paid for the year (s.17). */
  pujaPaid?: Prisma.Decimal.Value;
  /** Financial loss the employee caused by misconduct (s.18). */
  misconductLoss?: Prisma.Decimal.Value;
}

export interface EmployeeBonus {
  eligible: boolean;
  /** Why someone gets no bonus (plain English), else null. */
  reason: string | null;
  eligibleMonths: number;
  ceiling: Prisma.Decimal;
  /** The year's wage the bonus is worked out on (each month up to the ceiling). */
  bonusSalary: Prisma.Decimal;
  bonus: Prisma.Decimal;
  deductions: Prisma.Decimal;
  payable: Prisma.Decimal;
}

const inr = (x: Prisma.Decimal.Value) => `₹${Number(x).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** One employee's bonus at `rate` percent. */
export function employeeBonus(i: EmployeeInput, rules: BonusRules, rate: Prisma.Decimal.Value): EmployeeBonus {
  const limit = D(rules.eligibilityWage);
  const ceiling = Prisma.Decimal.max(D(rules.calculationCeiling), D(i.minimumWage));
  const paid = i.months.filter((x) => D(x.wage).gt(0));
  const ok = paid.filter((x) => D(x.wage).lte(limit));
  const bonusSalary = sum(ok.map((x) => Prisma.Decimal.min(D(x.wage), ceiling)));
  const none = (reason: string): EmployeeBonus => ({ eligible: false, reason, eligibleMonths: ok.length, ceiling, bonusSalary, bonus: ZERO, deductions: ZERO, payable: ZERO });
  if (i.disqualified) return none('Dismissed for fraud, violence or theft (section 9): no bonus.');
  if (!paid.length) return none('No bonus wage paid in the year.');
  if (!ok.length) return none(`Wage above ${inr(limit)} a month all year.`);
  if (D(i.days).lt(rules.minWorkingDays)) return none(`Worked ${D(i.days).toString()} days; at least ${rules.minWorkingDays} are needed.`);
  // s.10 / s.13: at least the minimum amount, cut down by the months the person was eligible.
  const floor = rupee(D(rules.minAmount).mul(ok.length).div(12));
  const bonus = Prisma.Decimal.max(rupee(bonusSalary.mul(rate).div(HUNDRED)), floor);
  const deductions = Prisma.Decimal.min(bonus, D(i.pujaPaid ?? 0).add(i.misconductLoss ?? 0));
  return { eligible: true, reason: null, eligibleMonths: ok.length, ceiling, bonusSalary, bonus, deductions, payable: bonus.sub(deductions) };
}

/** Checks a rate against the rules; returns the refusal, else null. */
export function rateProblem(rate: Prisma.Decimal.Value, rules: Pick<BonusRules, 'minRate' | 'maxRate'>, supported?: Prisma.Decimal.Value): string | null {
  const r = D(rate);
  const lo = Prisma.Decimal.max(D(rules.minRate), D(supported ?? rules.minRate));
  if (D(rules.minRate).gt(rules.maxRate)) return `The company's lowest bonus rate (${rules.minRate}%) is above its highest (${rules.maxRate}%). Ask HR to fix the bonus settings.`;
  if (r.gte(lo) && r.lte(rules.maxRate)) return null;
  const range = `between ${lo.toString()}% and ${D(rules.maxRate).toString()}%`;
  return lo.gt(rules.minRate) ? `The surplus supports ${lo.toString()}%, so the bonus rate must be ${range}.` : `The bonus rate must be ${range}.`;
}

// ------------------------------------------------------------------------------------------ surplus, set-on and set-off

/** An amount carried forward, by the accounting year it came from (the year's start date). */
export interface Carry {
  year: string;
  amount: string;
}

/** Takes up to `want` from the carries, oldest first. */
function take(carries: readonly Carry[], want: Prisma.Decimal): Carry[] {
  const out: Carry[] = [];
  let left = want;
  for (const c of [...carries].sort((a, b) => a.year.localeCompare(b.year))) {
    if (left.lte(0)) break;
    const x = Prisma.Decimal.min(left, D(c.amount));
    if (x.lte(0)) continue;
    out.push({ year: c.year, amount: x.toFixed(2) });
    left = left.sub(x);
  }
  return out;
}

export const carryTotal = (xs: readonly Carry[]) => sum(xs.map((x) => x.amount));

/** s.2(4): the allocable surplus from the available surplus in the accounts. */
export const allocableSurplus = (available: Prisma.Decimal.Value, rules: Pick<BonusRules, 'allocablePercent'>) => D(available).mul(rules.allocablePercent).div(HUNDRED).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/**
 * The rate the surplus supports: what is left of the allocable surplus after this year's set-off is settled, plus the
 * set-on brought in, as a share of the year's bonus wage, kept between the lowest and highest rate (2 decimals, cut down).
 * No surplus entered yet: the lowest rate.
 */
export function supportedRate(i: { allocable: Prisma.Decimal.Value | null; setOn: readonly Carry[]; setOff: readonly Carry[]; salaryTotal: Prisma.Decimal.Value }, rules: Pick<BonusRules, 'minRate' | 'maxRate'>): Prisma.Decimal {
  const lo = D(rules.minRate);
  const hi = D(rules.maxRate);
  if (i.allocable === null || D(i.salaryTotal).lte(0)) return lo;
  const left = Prisma.Decimal.max(ZERO, D(i.allocable).sub(carryTotal(i.setOff)));
  const r = left.add(carryTotal(i.setOn)).mul(HUNDRED).div(i.salaryTotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  return Prisma.Decimal.min(hi, Prisma.Decimal.max(lo, r));
}

export interface Settlement {
  setOffSettled: Carry[];
  setOnUsed: Carry[];
  /** Surplus above the bonus paid, up to the highest rate of the year's bonus wage, carried to later years. */
  setOnCreated: Prisma.Decimal;
  /** The shortfall to pay the minimum bonus, carried to later years. */
  setOffCreated: Prisma.Decimal;
}

/**
 * s.15 for one year: the allocable surplus first settles the set-off brought in (oldest first); what is left pays the
 * bonus, helped by the set-on brought in (oldest first). Left over: new set-on (capped). Short of the minimum bonus:
 * new set-off. Paying above what the surplus supports is the company's choice and makes no set-off.
 */
export function settleYear(i: { allocable: Prisma.Decimal.Value | null; setOn: readonly Carry[]; setOff: readonly Carry[]; totalBonus: Prisma.Decimal.Value; minTotal: Prisma.Decimal.Value; salaryTotal: Prisma.Decimal.Value }, rules: Pick<BonusRules, 'maxRate'>): Settlement {
  if (i.allocable === null) return { setOffSettled: [], setOnUsed: [], setOnCreated: ZERO, setOffCreated: ZERO };
  const setOffSettled = take(i.setOff, D(i.allocable));
  const left = D(i.allocable).sub(carryTotal(setOffSettled));
  const total = D(i.totalBonus);
  if (left.gte(total)) return { setOffSettled, setOnUsed: [], setOnCreated: Prisma.Decimal.min(left.sub(total), D(i.salaryTotal).mul(rules.maxRate).div(HUNDRED)).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN), setOffCreated: ZERO };
  const setOnUsed = take(i.setOn, total.sub(left));
  const short = D(i.minTotal).sub(left).sub(carryTotal(setOnUsed));
  return { setOffSettled, setOnUsed, setOnCreated: ZERO, setOffCreated: Prisma.Decimal.max(ZERO, short) };
}

/** One earlier year's computation, for the carries into a later year. */
export interface EarlierYear {
  year: string;
  /** Set-on and set-off made in that year (with any opening amounts from before, dated the year before). */
  setOnMade: Carry[];
  setOffMade: Carry[];
  setOnUsed: Carry[];
  setOffSettled: Carry[];
}

/** What is still carried into `year`: made in the last `carryYears` years, less what later years used. */
export function carriesInto(year: string, earlier: readonly EarlierYear[], rules: Pick<BonusRules, 'carryYears'>): { setOn: Carry[]; setOff: Carry[] } {
  const from = `${Number(year.slice(0, 4)) - rules.carryYears}${year.slice(4)}`;
  const left = (made: (e: EarlierYear) => Carry[], used: (e: EarlierYear) => Carry[]) => {
    const by = new Map<string, Prisma.Decimal>();
    for (const e of earlier) for (const c of made(e)) by.set(c.year, (by.get(c.year) ?? ZERO).add(c.amount));
    for (const e of earlier) for (const c of used(e)) by.set(c.year, (by.get(c.year) ?? ZERO).sub(c.amount));
    return [...by.entries()]
      .filter(([y, a]) => y >= from && y < year && a.gt(0))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([y, a]) => ({ year: y, amount: a.toFixed(2) }));
  };
  return { setOn: left((e) => e.setOnMade, (e) => e.setOnUsed), setOff: left((e) => e.setOffMade, (e) => e.setOffSettled) };
}
