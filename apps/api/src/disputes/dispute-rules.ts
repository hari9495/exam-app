// HLP-13 collective disputes: the dispute's state read from its append-only steps, and its clocks (rules:
// docs/yukthix/helpdesk-design-map.md section 4h). Pure functions; the numbers of days come from IN.IR.DISPUTE.

export interface Step {
  id: string;
  kind: string;
  actorUserId: string;
  data: unknown;
  at: Date;
}
export type DemandStatus = 'open' | 'agreed' | 'withdrawn' | 'rejected';
export interface Demand {
  id: string;
  code: string;
  text: string;
  union: string;
  mgmt: string;
  status: DemandStatus;
  agreed: string | null;
}
export interface Meeting {
  id: string;
  kind: 'bipartite' | 'conciliation';
  on: string;
  officer: string | null;
  attended: string;
  minutes: string;
  paperId: string | null;
  nextOn: string | null;
  by: string;
}
export interface Rate {
  category: string;
  monthlyIncrease: string;
}
export interface Terms {
  kind: 'conciliation' | 'bipartite';
  signedOn: string;
  effectiveFrom: string;
  effectiveTo?: string;
  covered: string;
  terms: string;
  rates: Rate[];
  paperId: string;
}
export interface Settlement {
  status: 'none' | 'proposed' | 'approved';
  proposalId: string | null;
  proposedBy: string | null;
  proposedAt: Date | null;
  terms: Terms | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  wageSettlementId: string | null;
  sentBack: { reason: string; by: string; at: Date } | null;
}
export interface Folded {
  demands: Demand[];
  meetings: Meeting[];
  papers: { id: string; fileId: string; sha256: string; title: string; name: string; by: string; at: Date }[];
  settlement: Settlement;
  filed: { on: string; ref: string | null } | null;
  closed: { how: string; note: string; on: Date } | null;
}
export interface Clock {
  key: 'next' | 'report' | 'copy';
  label: string;
  due: string | null;
  doneOn: string | null;
}

const D = <T>(s: Step) => s.data as T;

export function fold(steps: Step[]): Folded {
  const out: Folded = {
    demands: [],
    meetings: [],
    papers: [],
    settlement: { status: 'none', proposalId: null, proposedBy: null, proposedAt: null, terms: null, approvedBy: null, approvedAt: null, wageSettlementId: null, sentBack: null },
    filed: null,
    closed: null,
  };
  for (const s of [...steps].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (s.kind === 'demand') {
      const d = D<{ code: string; text: string; union: string; mgmt: string }>(s);
      out.demands.push({ id: s.id, ...d, status: 'open', agreed: null });
    } else if (s.kind === 'demand_update') {
      const u = D<{ demandId: string; status: DemandStatus; agreed?: string; mgmt?: string }>(s);
      const d = out.demands.find((x) => x.id === u.demandId);
      if (d) Object.assign(d, { status: u.status, agreed: u.status === 'agreed' ? (u.agreed ?? null) : null }, u.mgmt ? { mgmt: u.mgmt } : {});
    } else if (s.kind === 'meeting') {
      const m = D<Omit<Meeting, 'id' | 'by'>>(s);
      out.meetings.push({ id: s.id, kind: m.kind, on: m.on, officer: m.officer ?? null, attended: m.attended, minutes: m.minutes, paperId: m.paperId ?? null, nextOn: m.nextOn ?? null, by: s.actorUserId });
    } else if (s.kind === 'paper') {
      const p = D<{ fileId: string; sha256: string; title: string; name: string }>(s);
      out.papers.push({ id: s.id, ...p, by: s.actorUserId, at: s.at });
    } else if (s.kind === 'settlement_proposed') {
      out.settlement = { ...out.settlement, status: 'proposed', proposalId: s.id, proposedBy: s.actorUserId, proposedAt: s.at, terms: D<Terms>(s), sentBack: null };
    } else if (s.kind === 'settlement_sent_back') {
      out.settlement = { ...out.settlement, status: 'none', proposalId: null, proposedBy: null, proposedAt: null, terms: null, sentBack: { reason: D<{ reason: string }>(s).reason, by: s.actorUserId, at: s.at } };
    } else if (s.kind === 'settlement_approved') {
      out.settlement = { ...out.settlement, status: 'approved', approvedBy: s.actorUserId, approvedAt: s.at, wageSettlementId: D<{ wageSettlementId: string }>(s).wageSettlementId };
    } else if (s.kind === 'filed') {
      const f = D<{ on: string; ref?: string }>(s);
      out.filed = { on: f.on, ref: f.ref ?? null };
    } else if (s.kind === 'closed') {
      const c = D<{ how: string; note: string }>(s);
      out.closed = { how: c.how, note: c.note, on: s.at };
    }
  }
  out.meetings.sort((a, b) => a.on.localeCompare(b.on));
  return out;
}

/** "YYYY-MM-DD" plus n days. */
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The day conciliation started: the first conciliation meeting held (null before one). */
export const conciliationStart = (f: Folded) => f.meetings.find((m) => m.kind === 'conciliation')?.on ?? null;

/** The next meeting fixed at the last one, unless a meeting was already held on or after that day. */
export function nextMeeting(f: Folded): { on: string; kind: Meeting['kind'] } | null {
  const last = f.meetings.at(-1);
  if (!last?.nextOn || f.meetings.some((m) => m.on >= last.nextOn!)) return null;
  return { on: last.nextOn, kind: last.kind };
}

/**
 * The dispute's dates: the next meeting (the team's own date), the conciliation officer's report (from the day
 * conciliation started) and the settlement copy to the authorities (from the day it was signed). The legal days come
 * from the rule set in force on each start day; without one that clock is left out.
 */
export function clocks(f: Folded, rules: { report: number | null; copy: number | null }): Clock[] {
  const out: Clock[] = [];
  const next = nextMeeting(f);
  const open = !f.closed && f.settlement.status !== 'approved';
  if (next && open) out.push({ key: 'next', label: next.kind === 'conciliation' ? 'Next conciliation meeting' : 'Next bipartite meeting', due: next.on, doneOn: null });
  const start = conciliationStart(f);
  if (start && rules.report !== null) {
    const ended = f.settlement.status === 'approved' ? f.settlement.terms!.signedOn : f.closed ? f.closed.on.toISOString().slice(0, 10) : null;
    out.push({ key: 'report', label: 'Conciliation officer’s report', due: addDays(start, rules.report), doneOn: ended });
  }
  if (f.settlement.status === 'approved' && rules.copy !== null) out.push({ key: 'copy', label: 'Settlement copy to the authorities', due: addDays(f.settlement.terms!.signedOn, rules.copy), doneOn: f.filed?.on ?? null });
  return out;
}

export const late = (c: Clock | undefined, today: string) => Boolean(c && !c.doneOn && c.due && c.due < today);

/** The stage words of the Cases list and the header. */
export function stage(f: Folded): string {
  if (f.closed) return f.closed.how === 'withdrawn' ? 'Closed (withdrawn)' : 'Closed (no settlement)';
  if (f.filed) return 'Settled, copy filed';
  if (f.settlement.status === 'approved') return 'Settled, file the copy';
  if (f.settlement.status === 'proposed') return 'Settlement to approve';
  if (f.meetings.some((m) => m.kind === 'conciliation')) return 'Conciliation';
  if (f.meetings.length) return 'Bipartite talks';
  return 'Charter received';
}

export const disputeNumber = (n: number) => `IRD-${String(n).padStart(4, '0')}`;
