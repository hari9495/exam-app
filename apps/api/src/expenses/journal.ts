import { Prisma } from '@prisma/client';

// The expense journal (M05-BUILD-DESIGN §12, XP-3.07): one legal entity's month, every amount to a ledger account found
// through ledger_mappings by its "exp." code (the entity's mapping, else the company's). Anything without an account goes
// to "Unmapped", which blocks the export (GP-PAY-1). Pure, so it is tested directly.
//   accrual        an approved claim: Dr the category head (exp.<category>), or GST input for its credit part; Cr payable
//   company-paid   Dr the category head, Cr the company card clearing (exp._card)
//   advance used   Dr payable, Cr employee advances, for what an advance covered
//   payout         Dr payable, Cr bank (exp._bank)
//   advance paid   Dr employee advances, Cr bank; returned: the reverse
// Paid in payroll: the payroll journal carries it (exp_reimb / exp_taxable map to the payable clearing there).

export const UNMAPPED = 'UNMAPPED';
export const EXP = {
  payable: 'exp._payable',
  bank: 'exp._bank',
  advances: 'exp._advances',
  card: 'exp._card',
  cgst: 'exp._gst_in_cgst',
  sgst: 'exp._gst_in_sgst',
  igst: 'exp._gst_in_igst',
} as const;
export const FIXED_CODES: readonly string[] = Object.values(EXP);
export const categoryCode = (category: string) => `exp.${category}`;

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);

export interface ExpenseMapping {
  scopeType: string;
  scopeId: string | null;
  componentCode: string;
  accountCode: string;
  accountName: string;
}
export interface JournalClaim {
  lines: { category: string; amount: string; companyPaid: boolean; gst?: { cgst?: string | null; sgst?: string | null; igst?: string | null } | null }[];
  advanceAdjusted: string;
}
export interface JournalInput {
  legalEntityId: string;
  claims: JournalClaim[];
  payouts: string[];
  advancesPaid: string[];
  advanceReturns: string[];
}
export interface ExpenseJournal {
  lines: { accountCode: string; accountName: string; debit: string; credit: string }[];
  unmapped: { componentCode: string; amount: string }[];
  balanced: boolean;
}

export function buildExpenseJournal(input: JournalInput, mappings: ExpenseMapping[]): ExpenseJournal {
  const find = (code: string) =>
    mappings.find((m) => m.componentCode === code && m.scopeType === 'legal_entity' && m.scopeId === input.legalEntityId) ?? mappings.find((m) => m.componentCode === code && m.scopeType === 'company');
  const acc = new Map<string, { accountName: string; debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  const missing = new Map<string, Prisma.Decimal>();
  const post = (code: string, debit: Prisma.Decimal, credit: Prisma.Decimal) => {
    if (debit.isZero() && credit.isZero()) return;
    const m = find(code);
    if (!m) missing.set(code, (missing.get(code) ?? D(0)).add(debit).add(credit));
    const key = m?.accountCode ?? UNMAPPED;
    const a = acc.get(key) ?? { accountName: m?.accountName ?? 'Unmapped', debit: D(0), credit: D(0) };
    acc.set(key, { ...a, debit: a.debit.add(debit), credit: a.credit.add(credit) });
  };
  const dr = (code: string, x: Prisma.Decimal) => post(code, x, D(0));
  const cr = (code: string, x: Prisma.Decimal) => post(code, D(0), x);

  for (const c of input.claims) {
    for (const l of c.lines) {
      const amount = D(l.amount);
      if (amount.lte(0)) continue;
      const gst = [
        [EXP.cgst, D(l.gst?.cgst ?? 0)],
        [EXP.sgst, D(l.gst?.sgst ?? 0)],
        [EXP.igst, D(l.gst?.igst ?? 0)],
      ] as const;
      const credit = gst.reduce((t, [, x]) => t.add(x), D(0));
      // Input credit only up to the line's amount; the rest of the line is the expense.
      const usable = credit.gt(amount) ? D(0) : credit;
      for (const [code, x] of gst) if (usable.gt(0)) dr(code, x);
      dr(categoryCode(l.category), amount.sub(usable));
      cr(l.companyPaid ? EXP.card : EXP.payable, amount);
    }
    const adjusted = D(c.advanceAdjusted);
    if (adjusted.gt(0)) {
      dr(EXP.payable, adjusted);
      cr(EXP.advances, adjusted);
    }
  }
  for (const p of input.payouts) {
    dr(EXP.payable, D(p));
    cr(EXP.bank, D(p));
  }
  for (const p of input.advancesPaid) {
    dr(EXP.advances, D(p));
    cr(EXP.bank, D(p));
  }
  for (const p of input.advanceReturns) {
    dr(EXP.bank, D(p));
    cr(EXP.advances, D(p));
  }
  const lines = [...acc.entries()].map(([accountCode, a]) => ({ accountCode, accountName: a.accountName, debit: a.debit.toFixed(2), credit: a.credit.toFixed(2) }));
  const debits = lines.reduce((t, l) => t.add(l.debit), D(0));
  const credits = lines.reduce((t, l) => t.add(l.credit), D(0));
  return { lines, unmapped: [...missing.entries()].map(([componentCode, amount]) => ({ componentCode, amount: amount.toFixed(2) })), balanced: debits.eq(credits) };
}

/** The journal as CSV for the accounts system (one row per account). */
export function journalCsv(j: ExpenseJournal, period: string): string {
  const cell = (x: string) => (/[",\n]/.test(x) || /^[=+\-@]/.test(x) ? `"${x.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : x);
  return ['Period,Account code,Account name,Debit,Credit', ...j.lines.map((l) => [period, l.accountCode, l.accountName, l.debit, l.credit].map(cell).join(','))].join('\n') + '\n';
}
