import type { ApprovalRow } from '@yukthix/ui/frame';
import type { ApprovalHistory, ApprovalTask } from '@yukthix/ui/desk';
import type { ProfileRequest } from '@yukthix/ui/access';
import { formatDate } from '@yukthix/ui';

// PLT-04 Approvals on the P03 engine: the engine's rows as the designed inbox shows them.

/** GET /workflow/approvals/team-history: a decision on a request the person holds or held a task for. */
export interface TeamDecision {
  id: string;
  requestId: string;
  title: string;
  type: string;
  requester: string;
  decision: 'approved' | 'rejected' | 'sent_back';
  by: string | null;
  byMe: boolean;
  onBehalfOf: string | null;
  reason: string | null;
  step: number | null;
  at: string;
  submittedAt: string;
  requestStatus: string;
  /** T2-E 49: the requester is in my direct or whole team. */
  requesterTeam?: 'direct' | 'whole' | null;
}

const STATUS: Record<string, ApprovalRow['status']> = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn', cancelled: 'Withdrawn', sent_back: 'Sent back' };
/** A request's plain dates (2026-11-22) read as everywhere else: 22 Nov 2026. */
const shown = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(new Date(`${v}T00:00:00`)) : v);
const ref = (id: string) => id.slice(0, 8).toUpperCase();
const day = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/** A task waiting for me (the row id is the task id). */
/** A task row; `mine` false for HR's "Everyone's pending" (the step names who holds it, not "You"). */
export function waitingRow(t: ApprovalTask, mine = true): ApprovalRow {
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
    canSendBack: Boolean(t.canSendBack),
    ...(t.approver ? { approver: t.approver } : {}),
    requesterTeam: t.requesterTeam ?? null,
    timeline: [
      { id: 's', label: t.raisedBy ? `Submitted by ${t.raisedBy} for ${t.requester}` : 'Submitted', status: 'done', approver: t.raisedBy ?? t.requester, at: new Date(t.submittedAt) },
      { id: 'c', label: `${t.step.name} (step ${t.step.index} of ${t.step.of})`, status: 'current', approver: mine ? (t.onBehalfOf ? `You (for ${t.onBehalfOf})` : 'You') : t.approver || '' },
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
  const verb = h.decision === 'approved' ? 'Approved' : h.decision === 'sent_back' ? 'Sent back for changes' : 'Not approved';
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
    status: h.decision === 'approved' ? 'Approved' : h.decision === 'sent_back' ? 'Sent back' : 'Rejected',
    // T2-E 49 (2872): Status filters on where the request is now; Asked by on my team.
    requestStatus: STATUS[h.requestStatus] ?? 'Waiting',
    requesterTeam: h.requesterTeam ?? null,
    context: h.reason ? [`Reason: ${h.reason}`] : [],
    timeline: [
      { id: 's', label: 'Submitted', status: 'done', approver: h.requester, at: new Date(h.submittedAt) },
      { id: 'd', label: verb, status: h.decision === 'rejected' ? 'rejected' : 'done', approver: h.by ?? '', at: new Date(h.at), ...(h.reason ? { comment: h.reason } : {}) },
    ],
  };
}

/** The kind the approvals inbox files identity, bank and legal-name changes under (PPL-32). */
export const PROFILE_CHANGE = 'Profile change';

/**
 * Keka ideas (2026-11): an identity, bank or legal-name change waiting for HR shows in the approvals inbox under its own
 * kind. It is decided on its own page (a fresh second factor, the proof, the cooling period), so the row only opens it.
 * Only pending requests someone else raised: nobody approves their own change (the API refuses it too).
 */
export function profileRows(rows: ProfileRequest[]): ApprovalRow[] {
  return rows
    .filter((r) => r.status === 'pending' && !r.mine)
    .map((r) => ({
      id: `profile:${r.id}`,
      ref: ref(r.id),
      type: PROFILE_CHANGE,
      requester: r.employeeName ?? '',
      requesterRole: '',
      summary: `${r.label} change`,
      detail: r.requestedBy && r.requestedBy !== r.employeeName ? `Raised by ${r.requestedBy}` : 'Raised by the employee',
      submitted: new Date(r.requestedAt),
      due: null,
      step: 'HR approval',
      lowRisk: false,
      policy: { ok: true },
      status: 'Waiting',
      context: [...(r.reason ? [`Reason: ${r.reason}`] : []), 'Decided on the change page: it asks for a fresh second factor and shows the proof.'],
      decideAt: '/yx/people/profile-requests',
      canSendBack: false,
    }));
}

/** T2-E 50 (answer 2873): one of my decisions in "Decided by me" (row id is the task id), with where the request is now. */
export function decidedRow(d: ApprovalHistory['decided'][number]): ApprovalRow {
  const verb = d.decision === 'approved' ? 'You approved' : d.decision === 'sent_back' ? 'You sent it back' : 'You did not approve';
  const status = STATUS[d.requestStatus] ?? 'Waiting';
  return {
    id: `decided:${d.taskId ?? d.requestId}`,
    ref: ref(d.requestId),
    type: d.type,
    requester: d.requester ?? '',
    requesterRole: '',
    summary: d.title,
    detail: `${verb} on ${formatDate(new Date(d.at))}${d.onBehalfOf ? ` · for ${d.onBehalfOf}` : ''} · now ${status === 'Rejected' ? 'not approved' : status.toLowerCase()}`,
    submitted: new Date(d.submittedAt ?? d.at),
    due: null,
    step: '',
    lowRisk: false,
    policy: { ok: true },
    status,
    requestStatus: status,
    requesterTeam: d.requesterTeam ?? null,
    ...(d.onBehalfOf ? { onBehalfOf: d.onBehalfOf } : {}),
    context: [],
    timeline: [
      ...(d.submittedAt ? [{ id: 's', label: 'Submitted', status: 'done' as const, approver: d.requester ?? '', at: new Date(d.submittedAt) }] : []),
      { id: 'd', label: d.onBehalfOf ? `${verb} (for ${d.onBehalfOf})` : verb, status: d.decision === 'rejected' ? ('rejected' as const) : ('done' as const), approver: 'You', at: new Date(d.at) },
    ],
  };
}
