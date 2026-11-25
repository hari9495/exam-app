// HLP-07/08/09 case rules as plain functions (docs/yukthix/helpdesk-design-map.md section 4f). A case's state is read
// from its append-only steps; nothing here touches the database.

export type Finding = 'proved' | 'proved-in-part' | 'not-proved' | 'false-or-malicious';
export const FINDINGS: readonly Finding[] = ['proved', 'proved-in-part', 'not-proved', 'false-or-malicious'];
/** 'suspension' (pending inquiry) only on a disciplinary case; like the rest it is an HR task, never a change in People or Pay. */
export const RELIEF_ACTIONS = ['transfer', 'leave', 'reporting', 'suspension', 'other'] as const;
/** Founder answer 34: what a disciplinary case can end in. An inquiry is recorded only (the inquiry itself: question 51). */
export const DECISIONS = ['dropped', 'warning', 'inquiry'] as const;
export type Decision = (typeof DECISIONS)[number];
export type ReliefAction = (typeof RELIEF_ACTIONS)[number];
export const MEMBER_ROLES = ['officer', 'investigator'] as const;

export type Severity = 'serious' | 'standard';
export const SEVERITIES: readonly Severity[] = ['serious', 'standard'];
/** Founder answer 35: Serious when the reporter fears retaliation, else Standard, until an ethics officer sets it. */
export const severityOf = (f: Pick<Folded, 'severity'>, retaliationWorry: boolean): Severity => f.severity ?? (retaliationWorry ? 'serious' : 'standard');

export interface Step {
  id: string;
  kind: string;
  actorUserId: string;
  data: Record<string, unknown>;
  at: Date;
}

const s = (v: unknown) => (typeof v === 'string' ? v : null);
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
/** The India day of a moment (steps are timestamps; legal days are counted in IST). */
export const isoDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export interface Folded {
  acknowledgedOn: string | null;
  notice: {
    status: 'not-sent' | 'delayed' | 'sent';
    delay: { reason: string; reviewOn: string; by: string; at: string } | null;
    sentOn: string | null;
    respondentUserId: string | null;
    allegations: string | null;
    fileIds: string[];
    /** The first reply date, and the one in force (a granted extension). */
    firstReplyBy: string | null;
    replyBy: string | null;
    source: string | null;
    replies: { at: string; text: string; fileIds: string[] }[];
    moreTime: { reason: string; askedOn: string; status: 'waiting' | 'granted' | 'refused'; newDue: string | null } | null;
  };
  outcome: {
    status: 'none' | 'proposed' | 'approved' | 'sent-back';
    proposalId: string | null;
    finding: Finding | null;
    /** Disciplinary cases. */
    decision: Decision | null;
    action: string | null;
    reasons: string | null;
    reporterSummary: string | null;
    proposedBy: string | null;
    proposedAt: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    sendBackNote: string | null;
  };
  ic: {
    status: 'none' | 'draft' | 'signed';
    draftId: string | null;
    finding: Finding | null;
    findings: string | null;
    recommendation: string | null;
    /** Views on the current draft only, by user. */
    votes: Map<string, { vote: 'agree' | 'disagree'; note: string | null; at: string }>;
    signedBy: string | null;
    signedOn: string | null;
  };
  relief: { id: string; action: ReliefAction; note: string; by: string; at: string; assigneeUserId: string; ref: string; done: boolean }[];
  recused: Map<string, { on: string; reason: string }>;
  added: Map<string, { role: string; overrideReason: string | null }>;
  routedToChair: { at: string; reason: string } | null;
  /** The latest severity an ethics officer set (null: never set, the default applies). */
  severity: Severity | null;
  fileIds: { fileId: string; by: string; at: string }[];
}

/** Reads the case state from its steps, oldest first. */
export function fold(steps: Step[]): Folded {
  const f: Folded = {
    acknowledgedOn: null,
    notice: { status: 'not-sent', delay: null, sentOn: null, respondentUserId: null, allegations: null, fileIds: [], firstReplyBy: null, replyBy: null, source: null, replies: [], moreTime: null },
    outcome: { status: 'none', proposalId: null, finding: null, decision: null, action: null, reasons: null, reporterSummary: null, proposedBy: null, proposedAt: null, approvedBy: null, approvedAt: null, sendBackNote: null },
    ic: { status: 'none', draftId: null, finding: null, findings: null, recommendation: null, votes: new Map(), signedBy: null, signedOn: null },
    relief: [],
    recused: new Map(),
    added: new Map(),
    routedToChair: null,
    severity: null,
    fileIds: [],
  };
  for (const st of [...steps].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const d = st.data;
    const at = st.at.toISOString();
    switch (st.kind) {
      case 'acknowledged':
        f.acknowledgedOn ??= isoDay(st.at);
        break;
      case 'notice_delayed':
        if (f.notice.status !== 'sent') f.notice = { ...f.notice, status: 'delayed', delay: { reason: s(d.reason) ?? '', reviewOn: s(d.reviewOn) ?? '', by: st.actorUserId, at } };
        break;
      case 'notice_sent':
        f.notice = { ...f.notice, status: 'sent', sentOn: isoDay(st.at), respondentUserId: s(d.respondentUserId), allegations: s(d.allegations), fileIds: arr(d.fileIds), firstReplyBy: s(d.replyBy), replyBy: s(d.replyBy), source: s(d.source) };
        break;
      case 'more_time_asked':
        if (!f.notice.moreTime) f.notice.moreTime = { reason: s(d.reason) ?? '', askedOn: isoDay(st.at), status: 'waiting', newDue: null };
        break;
      case 'more_time_decided':
        if (f.notice.moreTime?.status === 'waiting') {
          const grant = d.grant === true;
          f.notice.moreTime = { ...f.notice.moreTime, status: grant ? 'granted' : 'refused', newDue: grant ? s(d.newDue) : null };
          if (grant && s(d.newDue)) f.notice.replyBy = s(d.newDue);
        }
        break;
      case 'replied':
        f.notice.replies.push({ at, text: s(d.text) ?? '', fileIds: arr(d.fileIds) });
        break;
      case 'proposed':
        f.outcome = { ...f.outcome, status: 'proposed', proposalId: st.id, finding: s(d.finding) as Finding, decision: s(d.decision) as Decision | null, action: s(d.action), reasons: s(d.reasons), reporterSummary: s(d.reporterSummary), proposedBy: st.actorUserId, proposedAt: isoDay(st.at), approvedBy: null, approvedAt: null, sendBackNote: null };
        break;
      case 'approved':
        if (f.outcome.status === 'proposed' && d.proposalId === f.outcome.proposalId) f.outcome = { ...f.outcome, status: 'approved', approvedBy: st.actorUserId, approvedAt: isoDay(st.at) };
        break;
      case 'sent_back':
        if (f.outcome.status === 'proposed' && d.proposalId === f.outcome.proposalId) f.outcome = { ...f.outcome, status: 'sent-back', sendBackNote: s(d.note) };
        break;
      case 'ic_draft':
        if (f.ic.status !== 'signed') f.ic = { ...f.ic, status: 'draft', draftId: st.id, finding: s(d.finding) as Finding, findings: s(d.findings), recommendation: s(d.recommendation), votes: new Map() };
        break;
      case 'ic_vote':
        if (f.ic.status === 'draft' && d.draftId === f.ic.draftId) f.ic.votes.set(st.actorUserId, { vote: d.vote === 'agree' ? 'agree' : 'disagree', note: s(d.note), at: isoDay(st.at) });
        break;
      case 'ic_signed':
        if (f.ic.status === 'draft' && d.draftId === f.ic.draftId) f.ic = { ...f.ic, status: 'signed', signedBy: st.actorUserId, signedOn: isoDay(st.at) };
        break;
      case 'relief':
        f.relief.push({ id: st.id, action: s(d.action) as ReliefAction, note: s(d.note) ?? '', by: st.actorUserId, at: isoDay(st.at), assigneeUserId: s(d.assigneeUserId) ?? '', ref: s(d.ref) ?? '', done: false });
        break;
      case 'relief_done': {
        const r = f.relief.find((x) => x.id === d.reliefId);
        if (r) r.done = true;
        break;
      }
      case 'recused':
        f.recused.set(st.actorUserId, { on: isoDay(st.at), reason: s(d.reason) ?? '' });
        break;
      case 'member_added':
        if (s(d.userId)) f.added.set(s(d.userId)!, { role: s(d.role) ?? 'officer', overrideReason: s(d.overrideReason) });
        break;
      case 'routed_to_chair':
        f.routedToChair ??= { at, reason: s(d.reason) ?? '' };
        break;
      case 'severity_set':
        if (d.to === 'serious' || d.to === 'standard') f.severity = d.to;
        break;
      case 'file_added':
        if (s(d.fileId)) f.fileIds.push({ fileId: s(d.fileId)!, by: st.actorUserId, at });
        break;
    }
  }
  return f;
}

/**
 * Natural justice: no outcome or IC report before the respondent's reply came or its date passed. A POSH case always
 * needs the notice first; a grievance or ethics case with nobody accused may be decided without one (the reason says so).
 */
export function canDecide(kind: string, f: Folded, today: string): { ok: boolean; reason: string | null } {
  if (f.notice.status !== 'sent')
    return kind === 'posh'
      ? { ok: false, reason: 'The Internal Committee reports after the respondent has the notice and a chance to reply. Send the notice first.' }
      : kind === 'disciplinary'
        ? { ok: false, reason: 'No decision before the employee has the show-cause notice and a chance to reply. Send the notice first.' }
        : f.notice.status === 'delayed' ? { ok: false, reason: 'The notice is delayed. Send it and wait for the reply, or its date, before the outcome.' } : { ok: true, reason: null };
  if (f.notice.replies.length || (f.notice.replyBy && f.notice.replyBy < today)) return { ok: true, reason: null };
  return { ok: false, reason: `No outcome yet: wait for the respondent's reply or the reply date (${f.notice.replyBy}).` };
}

/** More than half of the members on the case who have not stepped aside agree. */
export function majority(agree: number, voters: number): boolean {
  return voters > 0 && agree * 2 > voters;
}

/** "2026-11-03" + n days. */
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Conflict of interest: the reporter, the respondent, the person it is about, and the managers above any of them. */
export function conflictWith(candidate: string, parties: (string | null)[], managersOf: Map<string, string | null>): string | null {
  const people = parties.filter((p): p is string => Boolean(p));
  if (people.includes(candidate)) return 'is a party to this case';
  for (const p of people) {
    const seen = new Set<string>();
    for (let m = managersOf.get(p) ?? null; m && !seen.has(m); m = managersOf.get(m) ?? null) {
      if (m === candidate) return 'is in the reporting line of someone in this case';
      seen.add(m);
    }
  }
  return null;
}
