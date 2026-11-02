import { Prisma } from '@prisma/client';
import type { Tx } from '../org-structure/org-structure.service';

// PPL-46 split pay: net pay over up to three of the person's accounts on file (the salary and reimbursement accounts in
// India, the account abroad). Fixed amounts are taken first, then percentages of what is left, and one account gets the
// remainder (the design's rule, as `splitNetPay` in the kit). Amounts in rupees and paise.

export const SPLIT_ACCOUNTS = ['salary', 'reimbursement', 'abroad'] as const;
export type SplitAccount = (typeof SPLIT_ACCOUNTS)[number];
export const SPLIT_RULES = ['remainder', 'fixed', 'percent'] as const;
export type SplitLine = { account: SplitAccount; rule: (typeof SPLIT_RULES)[number]; value: number };

export const SPLIT_LABEL: Record<SplitAccount, string> = { salary: 'Salary account', reimbursement: 'Reimbursement account', abroad: 'Account abroad' };
/** The designed message (PPL-46 OverSplit). */
export const OVER_SPLIT = 'Fixed amounts and percentages are more than the net pay.';

/** What is wrong with the shape of a split, or null. */
export function splitProblem(lines: SplitLine[]): string | null {
  if (!lines.length || lines.length > 3) return 'You can split pay across 1 to 3 accounts.';
  if (new Set(lines.map((l) => l.account)).size !== lines.length) return 'Each account is in the split once.';
  if (lines.filter((l) => l.rule === 'remainder').length !== 1) return 'Mark exactly one account to receive the remainder.';
  for (const l of lines) {
    if (l.rule === 'fixed' && !(l.value > 0)) return `Give the fixed amount for the ${SPLIT_LABEL[l.account].toLowerCase()}.`;
    if (l.rule === 'percent' && !(l.value > 0 && l.value < 100)) return `A percentage is more than 0 and less than 100 (${SPLIT_LABEL[l.account].toLowerCase()}).`;
  }
  return null;
}

/**
 * Each account's amount from a net pay. `strict` (saving a split): more than the net pay is refused with the designed
 * message. Not strict (payroll on pay day): the net pay is never refused; fixed amounts are paid in order as far as the
 * net goes, then percentages, and the remainder gets what is left (an account left with nothing is not paid).
 */
export function splitAmounts(net: Prisma.Decimal.Value, lines: SplitLine[], strict: boolean): { ok: true; amounts: { account: SplitAccount; amount: Prisma.Decimal }[] } | { ok: false; error: string } {
  const shape = splitProblem(lines);
  if (shape) return { ok: false, error: shape };
  const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
  let left = D(net);
  const out = new Map<SplitAccount, Prisma.Decimal>();
  for (const l of lines.filter((x) => x.rule === 'fixed')) {
    const want = D(l.value).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    if (strict && want.gt(left)) return { ok: false, error: OVER_SPLIT };
    const take = Prisma.Decimal.min(want, left);
    out.set(l.account, take);
    left = left.sub(take);
  }
  const base = left;
  for (const l of lines.filter((x) => x.rule === 'percent')) {
    const want = base.mul(l.value).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (strict && want.gt(left)) return { ok: false, error: OVER_SPLIT };
    const take = Prisma.Decimal.min(want, left);
    out.set(l.account, take);
    left = left.sub(take);
  }
  out.set(lines.find((l) => l.rule === 'remainder')!.account, left);
  return { ok: true, amounts: lines.map((l) => ({ account: l.account, amount: out.get(l.account)! })) };
}

/** The split paid at `at` for each person: the newest split past its cooling period and not replaced by then. */
export async function splitsAt(tx: Tx, org: string, employeeIds: string[], at: Date): Promise<Map<string, SplitLine[]>> {
  const rows = await tx.employeePaySplit.findMany({ where: { organizationId: org, employeeId: { in: employeeIds }, usableFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gt: at } }] }, orderBy: { usableFrom: 'asc' } });
  return new Map(rows.map((r) => [r.employeeId, r.lines as unknown as SplitLine[]]));
}

/** A split that is only "everything to the salary account" pays as if there were none. */
export const plainSalary = (lines: SplitLine[] | undefined) => !lines || (lines.length === 1 && lines[0].account === 'salary');

/** One line in words, for lists ("Account abroad: ₹2,500"). */
export function splitText(lines: SplitLine[]): string {
  const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return lines.map((l) => `${SPLIT_LABEL[l.account]}: ${l.rule === 'remainder' ? 'the rest' : l.rule === 'fixed' ? inr(l.value) : `${l.value}%`}`).join('; ');
}
