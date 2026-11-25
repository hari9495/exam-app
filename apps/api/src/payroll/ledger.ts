import { Prisma } from '@prisma/client';

// Ledger mapping (founder decision GP-PAY-1, 10 Oct 2026; M03 §19.7): every pay line goes to a ledger account found by
// the most specific mapping — the cost centre's, else the legal entity's, else the company default. Earnings and employer
// costs are expenses (debit); deductions, employer contributions payable and net pay are payables (credit). A payslip's
// amounts are split across the job's cost centres by their percentages. Anything without an account goes to "Unmapped",
// which blocks export and posting until it is empty. Pure, so it is tested directly.
// Enterprise E4 (O20-O22): with a suspense account the unmapped amounts post there instead (still listed for fixing);
// department, location and project are dimensions on every line; a company may split costs by project hours.

export const NET_PAY = '_net_pay';
/** Enterprise E4 (O20): the suspense account is a mapping of this line (company or legal entity, side payable). */
export const SUSPENSE = '_suspense';
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
  /** O22: the department and location of the person's job, dimensions on every line. */
  departmentId?: string | null;
  locationId?: string | null;
  /** O21: the month's share per project (approved timesheet hours, else allocations), in percent. */
  projects?: { id: string; percent: string }[];
  lines: { code: string; kind: string; amount: string }[];
}
export interface JournalLine {
  accountCode: string;
  accountName: string;
  costCentreId: string | null;
  departmentId: string | null;
  locationId: string | null;
  projectId: string | null;
  debit: string;
  credit: string;
}
export interface Journal {
  lines: JournalLine[];
  unmapped: { componentCode: string; side: 'expense' | 'payable'; costCentreId: string | null; amount: string }[];
  balanced: boolean;
  /** O20: what went to the suspense account (the unmapped amounts, when a suspense account is used). */
  inSuspense: string;
}
export interface JournalOptions {
  /** O21: split each person's cost by cost centre (default) or by project hours (falls back to cost centres). */
  split?: 'cost_centre' | 'project_hours';
  /** O20: unmapped amounts post here instead of "Unmapped" (still listed for fixing). */
  suspense?: { accountCode: string; accountName: string } | null;
}

type Dims = { cc: string | null; dept: string | null; loc: string | null; project: string | null };

export function buildJournal(slips: JournalSlip[], mappings: Mapping[], opts: JournalOptions = {}): Journal {
  const find = (scopeType: Mapping['scopeType'], scopeId: string | null, code: string, side: Mapping['side']) =>
    mappings.find((m) => m.scopeType === scopeType && m.scopeId === scopeId && m.componentCode === code && m.side === side);
  const resolve = (code: string, side: Mapping['side'], entity: string, cc: string | null) =>
    (cc ? find('cost_centre', cc, code, side) : undefined) ?? find('legal_entity', entity, code, side) ?? find('company', null, code, side);
  const acc = new Map<string, Omit<JournalLine, 'debit' | 'credit'> & { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  const missing = new Map<string, { componentCode: string; side: Mapping['side']; costCentreId: string | null; amount: Prisma.Decimal }>();
  let suspended = D(0);
  const post = (code: string, side: Mapping['side'], entity: string, d: Dims, amount: Prisma.Decimal) => {
    if (amount.isZero()) return;
    const found = resolve(code, side, entity, d.cc);
    const m = found ?? opts.suspense ?? undefined;
    const [debit, credit] = side === 'expense' ? [amount, D(0)] : [D(0), amount];
    if (!found) {
      if (opts.suspense) suspended = suspended.add(amount);
      const k = `${code}|${side}|${d.cc ?? ''}`;
      const x = missing.get(k) ?? { componentCode: code, side, costCentreId: d.cc, amount: D(0) };
      missing.set(k, { ...x, amount: x.amount.add(amount) });
    }
    const accountCode = m?.accountCode ?? UNMAPPED;
    const k = [accountCode, d.cc, d.dept, d.loc, d.project].map((x) => x ?? '').join('|');
    const a = acc.get(k) ?? { accountCode, accountName: m?.accountName ?? 'Unmapped', costCentreId: d.cc, departmentId: d.dept, locationId: d.loc, projectId: d.project, debit: D(0), credit: D(0) };
    acc.set(k, { ...a, debit: a.debit.add(debit), credit: a.credit.add(credit) });
  };
  for (const s of slips) {
    // Split by cost centre percentages (or, O21, by project hours: each project share keeps the person's main cost
    // centre); the last share takes the rounding remainder so nothing is lost.
    const base = { dept: s.departmentId ?? null, loc: s.locationId ?? null };
    const main = s.costCentres.length ? [...s.costCentres].sort((a, b) => Number(b.percent) - Number(a.percent))[0].id : null;
    const shares: { d: Dims; share: Prisma.Decimal }[] =
      opts.split === 'project_hours' && s.projects?.length
        ? s.projects.map((p) => ({ d: { ...base, cc: main, project: p.id }, share: D(p.percent).div(100) }))
        : s.costCentres.length
          ? s.costCentres.map((c) => ({ d: { ...base, cc: c.id, project: null }, share: D(c.percent).div(100) }))
          : [{ d: { ...base, cc: null, project: null }, share: D(1) }];
    const split = (amount: Prisma.Decimal) => {
      let left = amount;
      return shares.map((c, i) => {
        const part = i === shares.length - 1 ? left : amount.mul(c.share).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        left = left.sub(part);
        return { d: c.d, amount: part };
      });
    };
    let net = D(0);
    for (const l of s.lines) {
      const amount = D(l.amount);
      if (l.kind === 'earning' || l.kind === 'reimbursement') net = net.add(amount);
      if (l.kind === 'deduction') net = net.sub(amount);
      for (const p of split(amount)) {
        if (l.kind === 'earning' || l.kind === 'reimbursement') post(l.code, 'expense', s.legalEntityId, p.d, p.amount);
        else if (l.kind === 'deduction') post(l.code, 'payable', s.legalEntityId, p.d, p.amount);
        else if (l.kind === 'employer') {
          post(l.code, 'expense', s.legalEntityId, p.d, p.amount);
          post(l.code, 'payable', s.legalEntityId, p.d, p.amount);
        }
      }
    }
    for (const p of split(Prisma.Decimal.max(net, D(0)))) post(NET_PAY, 'payable', s.legalEntityId, p.d, p.amount);
  }
  const by = (x: string | null, y: string | null) => (x ?? '').localeCompare(y ?? '');
  const lines = [...acc.values()]
    .sort((x, y) => x.accountCode.localeCompare(y.accountCode) || by(x.costCentreId, y.costCentreId) || by(x.departmentId, y.departmentId) || by(x.locationId, y.locationId) || by(x.projectId, y.projectId))
    .map((a) => ({ ...a, debit: a.debit.toFixed(2), credit: a.credit.toFixed(2) }));
  const totals = lines.reduce((t, l) => ({ d: t.d.add(l.debit), c: t.c.add(l.credit) }), { d: D(0), c: D(0) });
  return { lines, unmapped: [...missing.values()].map((m) => ({ ...m, amount: m.amount.toFixed(2) })), balanced: totals.d.eq(totals.c), inSuspense: suspended.toFixed(2) };
}

/** O22: the reversing journal of one already exported (a voided or reopened run): every debit becomes a credit and back. */
export function reverseLines<L extends { debit: string; credit: string }>(lines: L[]): L[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}

/**
 * O21: each person's share per project from approved minutes in the month (minutes per project, any order). Percent with
 * two decimals; the last project takes the remainder so the shares add up to 100. Empty when there are no minutes.
 */
export function projectShares(minutes: Map<string, number>): { id: string; percent: string }[] {
  const rows = [...minutes.entries()].filter(([, m]) => m > 0).sort(([a], [b]) => a.localeCompare(b));
  const total = rows.reduce((t, [, m]) => t + m, 0);
  if (!total) return [];
  let left = D(100);
  return rows.map(([id, m], i) => {
    const pct = i === rows.length - 1 ? left : D(m).mul(100).div(total).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    left = left.sub(pct);
    return { id, percent: pct.toFixed(2) };
  });
}
