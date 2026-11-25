import { Prisma } from '@prisma/client';

// Expenses home (EXP-01, round 1 of the design wiring): the manager's team figures and the payroll cut-off line.
//   team spend   claims of my direct reports today, by the IST month they were sent; the approved amount once decided,
//                else the amount claimed; drafts, withdrawn and not-approved claims do not count
//   over limit   lines on those claims whose policy check said over the limit (needs a reason, or blocked)
//   pay month    a claim approved on or before the company's cut-off day (setting expense.payroll_cutoff_day) is paid
//                in this month's payroll, after it in the next month's

const IST_MS = 330 * 60_000;
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);

/** "2026-11" for the IST calendar month of an instant. */
export const istMonth = (at: Date) => new Date(at.getTime() + IST_MS).toISOString().slice(0, 7);

/** The month before "2026-01" is "2025-12". */
export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** The last n months ending with the one `today` (yyyy-mm-dd) is in, oldest first. */
export function lastMonths(today: string, n: number): string[] {
  const out = [today.slice(0, 7)];
  while (out.length < n) out.unshift(prevMonth(out[0]));
  return out;
}

/** The payroll month a claim approved today goes to (before the next payroll's lock is checked). */
export function payMonthFor(today: string, cutoffDay: number): string {
  if (Number(today.slice(8, 10)) <= cutoffDay) return today.slice(0, 7);
  const [y, m] = today.slice(0, 7).split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export interface TeamClaim {
  id: string;
  status: string;
  submittedAt: Date | null;
  claimedTotal: Prisma.Decimal;
  approvedTotal: Prisma.Decimal | null;
}

const COUNTS = new Set(['submitted', 'approved', 'partly_approved']);
const OVER = new Set(['over_justify', 'blocked']);
/** A line whose policy check said over the limit (needs a reason, or blocked). */
export const isOverLimit = (policyResult: unknown) => OVER.has((policyResult as { outcome?: string } | null)?.outcome ?? '');
/** Team claims list (round 2): the claims a manager sees: sent to approvers (drafts and withdrawn stay private). */
export const TEAM_LIST_STATUSES = ['submitted', 'sent_back', 'approved', 'partly_approved', 'rejected'];
/** The instants an IST calendar month (yyyy-mm) starts and ends at, for a submitted_at range. */
export function istMonthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { from: new Date(Date.parse(`${month}-01T00:00:00Z`) - IST_MS), to: new Date(Date.parse(`${next}-01T00:00:00Z`) - IST_MS) };
}

/** Spend and over-limit lines per month (exact decimals, as strings), for the months asked. */
export function teamFigures(months: string[], claims: TeamClaim[], lines: { claimId: string; policyResult: unknown }[]) {
  const spend = new Map(months.map((m) => [m, D(0)]));
  const over = new Map(months.map((m) => [m, 0]));
  const monthOf = new Map<string, string>();
  for (const c of claims) {
    if (!COUNTS.has(c.status) || !c.submittedAt) continue;
    const m = istMonth(c.submittedAt);
    if (!spend.has(m)) continue;
    monthOf.set(c.id, m);
    spend.set(m, spend.get(m)!.add(c.approvedTotal ?? c.claimedTotal));
  }
  for (const l of lines) {
    const m = monthOf.get(l.claimId);
    if (m && isOverLimit(l.policyResult)) over.set(m, over.get(m)! + 1);
  }
  const last = months[months.length - 1];
  const before = months[months.length - 2] ?? null;
  return {
    month: last,
    spend: spend.get(last)!.toFixed(2),
    previous: before ? spend.get(before)!.toFixed(2) : null,
    trend: months.map((m) => spend.get(m)!.toFixed(2)),
    overLimit: over.get(last)!,
    overLimitPrevious: before ? over.get(before)! : null,
  };
}
