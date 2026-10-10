import { Prisma } from '@prisma/client';

// Ledger mapping (founder decision GP-PAY-1, 10 Oct 2026; M03 §19.7): every pay line goes to a ledger account found by
// the most specific mapping — the cost centre's, else the legal entity's, else the company default. Earnings and employer
// costs are expenses (debit); deductions, employer contributions payable and net pay are payables (credit). A payslip's
// amounts are split across the job's cost centres by their percentages. Anything without an account goes to "Unmapped",
// which blocks export and posting until it is empty. Pure, so it is tested directly.

export const NET_PAY = '_net_pay';
export const UNMAPPED = 'UNMAPPED';
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);

export interface Mapping {
  scopeType: 'company' | 'legal_entity' | 'cost_centre';
  scopeId: string | null;
  componentCode: string;
  side: 'expense' | 'payable';
  accountCode: string;
  accountName: string;
}
export interface JournalSlip {
  legalEntityId: string;
  costCentres: { id: string; percent: string }[];
  lines: { code: string; kind: string; amount: string }[];
}
export interface JournalLine {
  accountCode: string;
  accountName: string;
  costCentreId: string | null;
  debit: string;
  credit: string;
}
export interface Journal {
  lines: JournalLine[];
  unmapped: { componentCode: string; side: 'expense' | 'payable'; costCentreId: string | null; amount: string }[];
  balanced: boolean;
}

export function buildJournal(slips: JournalSlip[], mappings: Mapping[]): Journal {
  const find = (scopeType: Mapping['scopeType'], scopeId: string | null, code: string, side: Mapping['side']) =>
    mappings.find((m) => m.scopeType === scopeType && m.scopeId === scopeId && m.componentCode === code && m.side === side);
  const resolve = (code: string, side: Mapping['side'], entity: string, cc: string | null) =>
    (cc ? find('cost_centre', cc, code, side) : undefined) ?? find('legal_entity', entity, code, side) ?? find('company', null, code, side);
  const acc = new Map<string, { accountCode: string; accountName: string; costCentreId: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  const missing = new Map<string, { componentCode: string; side: Mapping['side']; costCentreId: string | null; amount: Prisma.Decimal }>();
  const post = (code: string, side: Mapping['side'], entity: string, cc: string | null, amount: Prisma.Decimal) => {
    if (amount.isZero()) return;
    const m = resolve(code, side, entity, cc);
    const [debit, credit] = side === 'expense' ? [amount, D(0)] : [D(0), amount];
    if (!m) {
      const k = `${code}|${side}|${cc ?? ''}`;
      const x = missing.get(k) ?? { componentCode: code, side, costCentreId: cc, amount: D(0) };
      missing.set(k, { ...x, amount: x.amount.add(amount) });
    }
    const accountCode = m?.accountCode ?? UNMAPPED;
    const k = `${accountCode}|${cc ?? ''}`;
    const a = acc.get(k) ?? { accountCode, accountName: m?.accountName ?? 'Unmapped', costCentreId: cc, debit: D(0), credit: D(0) };
    acc.set(k, { ...a, debit: a.debit.add(debit), credit: a.credit.add(credit) });
  };
  for (const s of slips) {
    // Split by cost centre percentages; the last one takes the rounding remainder so nothing is lost.
    const ccs: { id: string | null; share: Prisma.Decimal }[] = s.costCentres.length ? s.costCentres.map((c) => ({ id: c.id, share: D(c.percent).div(100) })) : [{ id: null, share: D(1) }];
    const split = (amount: Prisma.Decimal) => {
      let left = amount;
      return ccs.map((c, i) => {
        const part = i === ccs.length - 1 ? left : amount.mul(c.share).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        left = left.sub(part);
        return { cc: c.id, amount: part };
      });
    };
    let net = D(0);
    for (const l of s.lines) {
      const amount = D(l.amount);
      if (l.kind === 'earning') net = net.add(amount);
      if (l.kind === 'deduction') net = net.sub(amount);
      for (const p of split(amount)) {
        if (l.kind === 'earning') post(l.code, 'expense', s.legalEntityId, p.cc, p.amount);
        else if (l.kind === 'deduction') post(l.code, 'payable', s.legalEntityId, p.cc, p.amount);
        else if (l.kind === 'employer') {
          post(l.code, 'expense', s.legalEntityId, p.cc, p.amount);
          post(l.code, 'payable', s.legalEntityId, p.cc, p.amount);
        }
      }
    }
    for (const p of split(Prisma.Decimal.max(net, D(0)))) post(NET_PAY, 'payable', s.legalEntityId, p.cc, p.amount);
  }
  const lines = [...acc.values()]
    .sort((x, y) => x.accountCode.localeCompare(y.accountCode) || (x.costCentreId ?? '').localeCompare(y.costCentreId ?? ''))
    .map((a) => ({ accountCode: a.accountCode, accountName: a.accountName, costCentreId: a.costCentreId, debit: a.debit.toFixed(2), credit: a.credit.toFixed(2) }));
  const totals = lines.reduce((t, l) => ({ d: t.d.add(l.debit), c: t.c.add(l.credit) }), { d: D(0), c: D(0) });
  return { lines, unmapped: [...missing.values()].map((m) => ({ ...m, amount: m.amount.toFixed(2) })), balanced: totals.d.eq(totals.c) };
}
