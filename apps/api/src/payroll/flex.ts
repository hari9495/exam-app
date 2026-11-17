import { Prisma } from '@prisma/client';

// B8/E5 flexible benefits (founder answers 2406, 2407): the pure money rules, shared by the ledger, the claim check and
// the year-end and exit settlement. Money is Decimal; every amount is to the paisa.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const r2 = (x: Prisma.Decimal) => x.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** The tax year a month falls in ("2026-11" → "2026-27"). */
export const flexYearOf = (month: string) => {
  const y = Number(month.slice(0, 4)) - (Number(month.slice(5, 7)) < 4 ? 1 : 0);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};
/** The tax year's first and last month ("2026-27" → "2026-04", "2027-03"). */
export const flexYearMonths = (taxYear: string) => ({ first: `${taxYear.slice(0, 4)}-04`, last: `${Number(taxYear.slice(0, 4)) + 1}-03` });
const index = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;

/**
 * The months of the tax year a person is entitled for, up to and including `through`: every month they are employed on
 * any day of it, from the later of April and the joining month to the earliest of March, the exit month and `through`.
 * shortcut: a part month counts in full (no proration by days); question 2457 asks whether to prorate.
 */
export function entitledMonths(taxYear: string, joinedOn: string, exitedOn: string | null, through: string): number {
  const y = flexYearMonths(taxYear);
  const from = Math.max(index(y.first), index(joinedOn.slice(0, 7)));
  const to = Math.min(index(y.last), index(through), exitedOn ? index(exitedOn.slice(0, 7)) : Infinity);
  return Math.max(0, to - from + 1);
}

/** The ledger of one person's component for a year: entitled = monthly × months; available = entitled + carried in − claimed − pending. */
export function flexBalance(x: { monthly: Prisma.Decimal.Value; months: number; carriedIn: Prisma.Decimal.Value; claimed: Prisma.Decimal.Value; pending?: Prisma.Decimal.Value }) {
  const entitled = r2(D(x.monthly).mul(x.months));
  const available = r2(entitled.add(x.carriedIn).sub(x.claimed).sub(x.pending ?? 0));
  return { entitled, available };
}

/**
 * The settlement of what is left (answer 2406): at exit it is always paid; at year end it is carried into the next year
 * when the company carries forward, else paid. Paid means taxable salary when the component is "taxable if unclaimed";
 * otherwise it lapses. Nothing is ever negative: claims over the balance are refused before they reach here.
 */
export function flexSettle(x: { entitled: Prisma.Decimal.Value; carriedIn: Prisma.Decimal.Value; claimed: Prisma.Decimal.Value; kind: 'year_end' | 'exit'; carryForward: boolean; taxableIfUnclaimed: boolean }) {
  const left = Prisma.Decimal.max(ZERO, r2(D(x.entitled).add(x.carriedIn).sub(x.claimed)));
  if (x.kind === 'year_end' && x.carryForward) return { paidTaxable: ZERO, carriedOut: left, lapsed: ZERO };
  return x.taxableIfUnclaimed ? { paidTaxable: left, carriedOut: ZERO, lapsed: ZERO } : { paidTaxable: ZERO, carriedOut: ZERO, lapsed: left };
}
