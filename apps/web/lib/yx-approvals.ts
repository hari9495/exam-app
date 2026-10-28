import type { ApprovalRow } from '@yukthix/ui/frame';
import type { ApprovalHistory, ApprovalTask } from '@yukthix/ui/desk';
import { formatDate } from '@yukthix/ui';

// PLT-04 Approvals on the P03 engine: the engine's rows as the designed inbox shows them.

/** GET /workflow/approvals/team-history: a decision on a request the person holds or held a task for. */
export interface TeamDecision {
  id: string;
  requestId: string;
  title: string;
  type: string;
  requester: string;
  decision: 'approved' | 'rejected';
  by: string | null;
  byMe: boolean;
  onBehalfOf: string | null;
  reason: string | null;
  step: number | null;
  at: string;
  submittedAt: string;
  requestStatus: string;
}

const STATUS: Record<string, ApprovalRow['status']> = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn', cancelled: 'Withdrawn' };
/** A request's plain dates (2026-11-22) read as everywhere else: 22 Nov 2026. */
const shown = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(new Date(`${v}T00:00:00`)) : v);
const ref = (id: string) => id.slice(0, 8).toUpperCase();
const day = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/** A task waiting for me (the row id is the task id). */
export function waitingRow(t: ApprovalTask): ApprovalRow {
  const steps = `step ${t.step.index} of ${t.step.of}: ${t.step.name}`;
  const quorum = t.step.approvers > 1 ? ` (${t.step.need === t.step.approvers ? 'all' : t.step.need} of ${t.step.approvers} approve)` : '';
  return {
    id: t.taskId,
    ref: ref(t.requestId),
    type: t.type,
    requester: t.requester || t.person || '',
    requesterRole: '',
    summary: t.title,
    detail: `${steps[0]!.toUpperCase()}${steps.slice(1)}${quorum}`,
    submitted: new Date(t.submittedAt),
    due: t.dueAt ? day(t.dueAt) : null,
    step: t.step.name,
    // Anything decided in the inbox can be approved in one click, alone or with others of its type.
    lowRisk: !t.decideAt,
    policy: { ok: true },
    ...(t.onBehalfOf ? { onBehalfOf: t.onBehalfOf } : {}),
    ...(t.raisedBy ? { raisedBy: t.raisedBy } : {}),
    status: 'Waiting',
    context: t.summary.map((s) => `${s.label}: ${shown(s.value)}`),
    decideAt: t.decideAt ?? null,
    timeline: [
      { id: 's', label: t.raisedBy ? `Submitted by ${t.raisedBy} for ${t.requester}` : 'Submitted', status: 'done', approver: t.raisedBy ?? t.requester, at: new Date(t.submittedAt) },
      { id: 'c', label: `${t.step.name} (step ${t.step.index} of ${t.step.of})`, status: 'current', approver: t.onBehalfOf ? `You (for ${t.onBehalfOf})` : 'You' },
      ...(t.step.index < t.step.of ? [{ id: 'n', label: `${t.step.of - t.step.index} more step${t.step.of - t.step.index === 1 ? '' : 's'} after this`, status: 'pending' as const }] : []),
    ],
  };
}

/** A request I sent (row id is the request id). */
export function sentRow(r: ApprovalHistory['sent'][number]): ApprovalRow {
  return {
    id: r.requestId,
    ref: ref(r.requestId),
    type: r.type,
    requester: 'You',
    requesterRole: '',
    summary: r.title,
    detail: r.decidedAt ? `Decided ${formatDate(new Date(r.decidedAt))}` : `Sent ${formatDate(new Date(r.submittedAt))}`,
    submitted: new Date(r.submittedAt),
    due: null,
    step: '',
    lowRisk: false,
    policy: { ok: true },
    status: STATUS[r.status] ?? 'Waiting',
    context: [],
    timeline: [{ id: 's', label: 'Submitted', status: 'done', approver: 'You', at: new Date(r.submittedAt) }],
  };
}

/** One decision in Team history (row id is the decision id). */
export function teamRow(h: TeamDecision): ApprovalRow {
  const who = h.byMe ? 'you' : (h.by ?? 'someone');
  const verb = h.decision === 'approved' ? 'Approved' : 'Not approved';
  return {
    id: h.id,
    ref: ref(h.requestId),
    type: h.type,
    requester: h.requester,
    requesterRole: '',
    summary: h.title,
    detail: `${verb} by ${who}${h.onBehalfOf ? ` for ${h.onBehalfOf}` : ''} on ${formatDate(new Date(h.at))}${h.step ? ` (step ${h.step})` : ''}`,
    submitted: new Date(h.submittedAt),
    due: null,
    step: '',
    lowRisk: false,
    policy: { ok: true },
    status: h.decision === 'approved' ? 'Approved' : 'Rejected',
    context: h.reason ? [`Reason: ${h.reason}`] : [],
    timeline: [
      { id: 's', label: 'Submitted', status: 'done', approver: h.requester, at: new Date(h.submittedAt) },
      { id: 'd', label: verb, status: h.decision === 'approved' ? 'done' : 'rejected', approver: h.by ?? '', at: new Date(h.at), ...(h.reason ? { comment: h.reason } : {}) },
    ],
  };
}
