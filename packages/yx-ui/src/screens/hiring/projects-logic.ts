// Pure rules behind the Projects screens (M12, P23). Screens call these; hiring.test.tsx covers them.
import { daysBetween } from './hiring-logic';

/* ---------------- burn and budget (YX-PRJ-07) ---------------- */

export type BurnState = 'ok' | 'alert' | 'over';
/** Starter alert thresholds 80 % and 100 % of hours, cost and fee. */
export function burnState(used: number, budget: number, thresholds: [number, number] = [80, 100]): { pct: number; state: BurnState } {
  const pct = budget > 0 ? Math.round((used / budget) * 100) : 0;
  return { pct, state: pct >= thresholds[1] ? 'over' : pct >= thresholds[0] ? 'alert' : 'ok' };
}

export const marginPct = (revenue: number, cost: number) => (revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0);

/** YX-PRJ-08: a cost that would reveal one person's rate is hidden from PMs and account managers. */
export const costVisible = (peopleInCell: number, viewer: 'finance' | 'pm' | 'hr') => viewer === 'finance' || peopleInCell > 1;

/* ---------------- utilisation and capacity (YX-PRJ-06) ---------------- */

export const utilisation = (billable: number, available: number) => (available > 0 ? Math.round((billable / available) * 1000) / 10 : 0);
export const capacity = (available: number, allocated: number) => available - allocated;
/** Small-group suppression for non-HR viewers (P02); starter minimum group 5. */
export const suppressGroup = (size: number, viewer: 'hr' | 'pm' | 'finance', min = 5) => viewer !== 'hr' && size < min;

/* ---------------- time & material billing (YX-PRJ-09) ---------------- */

export interface RateCardEntry {
  role?: string;
  personId?: string;
  rate: number;
  from: Date;
  to?: Date | null;
}

export function billRateFor(card: RateCardEntry[], personId: string, role: string, on: Date): number | null {
  const valid = card.filter((c) => daysBetween(c.from, on) >= 0 && (!c.to || daysBetween(on, c.to) >= 0));
  return (valid.find((c) => c.personId === personId) ?? valid.find((c) => c.role === role && !c.personId) ?? valid.find((c) => !c.role && !c.personId))?.rate ?? null;
}

export interface WipLine {
  id: string;
  personId: string;
  role: string;
  date: Date;
  hours: number;
  billable: boolean;
  approved: boolean;
  /** Needed only when the project has client approval. */
  clientApproved: boolean | null;
  invoiced: boolean;
}

export function tmBilling(lines: WipLine[], card: RateCardEntry[]) {
  let amount = 0;
  let billHours = 0;
  let heldHours = 0;
  const billed: string[] = [];
  for (const l of lines) {
    if (!l.billable || !l.approved || l.invoiced) continue;
    if (l.clientApproved === false) {
      heldHours += l.hours;
      continue;
    }
    const rate = billRateFor(card, l.personId, l.role, l.date) ?? 0;
    amount += Math.round(l.hours * rate);
    billHours += l.hours;
    billed.push(l.id);
  }
  return { amount, billHours, heldHours, billed };
}

/* ---------------- fixed fee (YX-PRJ-10) ---------------- */

export interface Milestone {
  id: string;
  name: string;
  pct: number;
  due: Date;
  status: 'planned' | 'completed' | 'accepted' | 'invoiced';
  needsClientAcceptance: boolean;
}

export function milestoneSummary(ms: Milestone[], contractValue: number) {
  const totalPct = ms.reduce((s, m) => s + m.pct, 0);
  const billable = ms.filter((m) => m.status === 'accepted' || (m.status === 'completed' && !m.needsClientAcceptance));
  return {
    totalPct,
    warning: totalPct !== 100 ? `Milestones add up to ${totalPct}% of the contract value, not 100%.` : null,
    billableAmount: billable.reduce((s, m) => s + Math.round((contractValue * m.pct) / 100), 0),
    billableIds: billable.map((m) => m.id),
  };
}

/* ---------------- approvals: bulk within allocation (M12 §7) ---------------- */

export interface WeekSubmission {
  id: string;
  hours: number;
  allocatedHours: number;
  notesMissing?: boolean;
}
export const bulkEligible = (s: WeekSubmission) => s.hours <= s.allocatedHours && !s.notesMissing;

/* ---------------- corrections after invoice (YX-PRJ-15) ---------------- */

export function correctionEffect(opts: { invoicedHours: number; correctedHours: number; rate: number; gstPct?: number; recoveryPolicy: 'recovery' | 'none'; costRate: number }) {
  const diff = opts.correctedHours - opts.invoicedHours;
  const net = Math.round(Math.abs(diff) * opts.rate);
  const gst = Math.round((net * (opts.gstPct ?? 18)) / 100);
  const kind = diff < 0 ? ('credit-note' as const) : diff > 0 ? ('supplementary' as const) : ('none' as const);
  return {
    kind,
    hours: diff,
    net,
    gst,
    total: net + gst,
    revenueChange: diff * opts.rate,
    recovery: kind === 'credit-note' && opts.recoveryPolicy === 'recovery' ? Math.round(Math.abs(diff) * opts.costRate) : 0,
  };
}

/* ---------------- bench and resource requests (YX-PRJ-17) ---------------- */

export type BenchStatus = 'allocated' | 'partly allocated' | 'bench';
export const benchStatus = (allocatedPct: number): BenchStatus => (allocatedPct >= 100 ? 'allocated' : allocatedPct > 0 ? 'partly allocated' : 'bench');

export interface ResourcePerson {
  id: string;
  name: string;
  skills: { name: string; confirmed: boolean }[];
  /** % already allocated over the requested dates. */
  allocatedPct: number;
  benchSince?: Date | null;
}

export function matchResource(req: { skill: string; pct: number }, people: ResourcePerson[], today: Date) {
  return people
    .filter((p) => p.skills.some((s) => s.name === req.skill) && 100 - p.allocatedPct >= req.pct)
    .map((p) => ({
      ...p,
      status: benchStatus(p.allocatedPct),
      confirmed: p.skills.some((s) => s.name === req.skill && s.confirmed),
      benchDays: p.benchSince ? daysBetween(p.benchSince, today) : 0,
    }))
    .sort((a, b) => Number(b.status === 'bench') - Number(a.status === 'bench') || Number(b.confirmed) - Number(a.confirmed) || b.benchDays - a.benchDays);
}

/* ---------------- timesheet mapping rules (PRJ-08, P23 YX-AST-09 / 18) ---------------- */

export interface MappingRule {
  id: string;
  source: 'calendar' | 'jira' | 'github';
  /** Case-insensitive; `*` matches anything. */
  pattern: string;
  project: string;
  task: string;
  priority: number;
  enabled: boolean;
}
export interface SourceItem {
  id: string;
  source: MappingRule['source'];
  text: string;
  hours: number;
}

const toRegex = (p: string) => new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');

export function applyMappingRules(rules: MappingRule[], items: SourceItem[]) {
  const ordered = rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  return items.map((it) => {
    const rule = ordered.find((r) => r.source === it.source && toRegex(r.pattern).test(it.text));
    return { item: it, rule: rule ?? null };
  });
}
