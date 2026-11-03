// HLP-07 My cases, HLP-08 Cases (case team), HLP-09 Ethics desk: the shapes the screens need from the server.
// Phase A (3 Nov 2026): written before the server. HLP-06 builds the case record; phase B maps it onto these shapes
// (or changes them here with the screens). Dates are ISO strings in India time; every legal date comes from the server
// (the statutory rule set or a company setting), never from the screen. Rules: helpdesk-design-map.md section 4f.

export type CaseKind = 'grievance' | 'ethics' | 'posh' | 'disciplinary';
export type CaseStatus = 'open' | 'action' | 'on-hold' | 'closed';

/** A dated step of the case. `source` names where the date came from (rule set and version, or company setting). */
export interface CaseDate {
  key: string;
  label: string;
  due: string | null;
  doneOn: string | null;
  /** Shown while the step has not started ("Starts after the notice"), or why it is held ("Notice delayed: …"). */
  note?: string | null;
}

/** A file on the case. Never changed or deleted: a new file is added instead (evidence rule, 4f). */
export interface CaseFile {
  id: string;
  name: string;
  size: number;
  type: string;
  scan: 'pending' | 'clean' | 'infected';
  addedBy: string;
  addedAt: string;
  /** SHA-256 of the stored bytes, hex. */
  sha256: string;
  /** How many times it was opened or downloaded (the access log has each one). */
  opens: number;
}

export interface CaseMessage {
  id: string;
  at: string;
  /** "me" = the person viewing; "team" = the case team (the reporter never sees which member wrote). */
  from: 'me' | 'team' | 'reporter';
  who: string | null;
  text: string;
}

/* ---------------- HLP-07 · My cases (the person's own part only, founder decision 4) ---------------- */

export type MyCaseRole = 'reporter' | 'respondent' | 'witness';

/** GET my/cases → cases[]. */
export interface MyCaseRow {
  id: string;
  ref: string;
  kind: CaseKind;
  role: MyCaseRole;
  stage: string;
  status: CaseStatus;
  next: { label: string; on: string | null } | null;
  unread: number;
}

interface MyCaseBase {
  id: string;
  ref: string;
  kind: CaseKind;
  stage: string;
  status: CaseStatus;
  openedOn: string;
  /** Only the dates that concern this person. */
  dates: CaseDate[];
  datesSource: string;
  /** Between this person and the case team only. */
  messages: CaseMessage[];
}

/** The reporter sees status, dates and messages, and the outcome summary the case team chose to send. Nothing else:
 * this shape has no place for notes, witnesses or the respondent's reply. */
export interface MyCaseAsReporter extends MyCaseBase {
  role: 'reporter';
  outcome: string | null;
  appealUntil: string | null;
}

export interface MoreTimeAsk {
  reason: string;
  askedOn: string;
  status: 'waiting' | 'granted' | 'refused';
  newDue: string | null;
}

export interface MyReply {
  at: string;
  text: string;
  files: CaseFile[];
}

/** The respondent's notice: the copy of the complaint (or the allegations), the reply date and its source. */
export interface RespondentNotice {
  sentOn: string;
  replyBy: string;
  /** e.g. "POSH rules 2013, rule 7(4) · company rule set v2013-12". */
  replySource: string;
  allegations: string;
  files: CaseFile[];
  moreTime: MoreTimeAsk | null;
  /** True once the person has asked (they may ask once). */
  askedMoreTime: boolean;
  replies: MyReply[];
}

export interface MyCaseAsRespondent extends MyCaseBase {
  role: 'respondent';
  notice: RespondentNotice;
  outcome: string | null;
  appealUntil: string | null;
}

export interface MyCaseAsWitness extends MyCaseBase {
  role: 'witness';
}

/** GET my/cases/:id. */
export type MyCaseDetail = MyCaseAsReporter | MyCaseAsRespondent | MyCaseAsWitness;

export interface MyReplyInput {
  text: string;
  fileIds: string[];
}

/* ---------------- HLP-08 · Cases (case team) ---------------- */

/** GET cases → cases[] (only the cases the person is a member of). */
export interface CaseListRow {
  id: string;
  ref: string;
  kind: CaseKind;
  subject: string;
  location: string;
  stage: string;
  /** null when anonymous, or withheld from this member. */
  raisedBy: string | null;
  anonymous: boolean;
  owner: string;
  next: { label: string; on: string | null } | null;
  overdue: boolean;
  status: CaseStatus;
}

export interface CaseTeamMember {
  id: string;
  name: string;
  role: string;
  access: string;
  presiding?: boolean;
  external?: boolean;
  recused: { on: string; reason: string } | null;
}

export interface NoticeState {
  status: 'not-sent' | 'delayed' | 'sent';
  delay: { reason: string; reviewOn: string; by: string; at: string } | null;
  sentOn: string | null;
  replyBy: string | null;
  replySource: string;
  /** The respondent's replies (case team only). */
  replies: MyReply[];
  moreTime: MoreTimeAsk | null;
}

export type CaseFinding = 'proved' | 'proved-in-part' | 'not-proved' | 'false-or-malicious';

export interface OutcomeState {
  status: 'none' | 'proposed' | 'approved' | 'sent-back';
  finding: CaseFinding | null;
  action: string | null;
  reasons: string | null;
  proposedBy: string | null;
  proposedByMe: boolean;
  proposedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  sendBackNote: string | null;
}

export interface IcVote {
  memberId: string;
  name: string;
  presiding: boolean;
  vote: 'agree' | 'disagree' | null;
  note: string | null;
  at: string | null;
}

/** POSH only: the Internal Committee's report (findings, recommendation, members' votes, the presiding officer's signature). */
export interface IcReportState {
  status: 'none' | 'draft' | 'signed';
  finding: CaseFinding | null;
  findings: string | null;
  recommendation: string | null;
  votes: IcVote[];
  signedBy: string | null;
  signedOn: string | null;
}

export type ReliefAction = 'transfer' | 'leave' | 'reporting' | 'other';
export interface ReliefRecord {
  id: string;
  action: ReliefAction;
  note: string;
  by: string;
  at: string;
  task: { ref: string; status: 'open' | 'done'; assignee: string };
}

export interface AccessEntry {
  id: string;
  at: string;
  who: string;
  what: string;
}

/** GET cases/:id. */
export interface CaseDetail {
  id: string;
  ref: string;
  kind: CaseKind;
  subject: string;
  location: string;
  openedOn: string;
  stage: string;
  stages: string[];
  stageIndex: number;
  status: CaseStatus;
  /** Optimistic version: every change sends it; a stale one is 409. */
  version: number;
  owner: string;
  /** null when anonymous, or withheld from this member. */
  reporter: string | null;
  anonymous: boolean;
  respondent: string | null;
  dates: CaseDate[];
  datesSource: string;
  me: {
    memberId: string;
    /** May record steps (notice, relief, outcome proposal, files, messages). */
    canWork: boolean;
    /** May approve an outcome another officer proposed (second officer). */
    canApprove: boolean;
    /** Internal Committee member on a POSH case. */
    ic: boolean;
    presiding: boolean;
    recused: boolean;
  };
  /** Outcome or IC report may be recorded: the reply came or its date passed (natural justice). */
  canDecide: { ok: boolean; reason: string | null };
  members: CaseTeamMember[];
  /** People who may be added (case officers, investigators, IC members, HR), from the server. */
  addable: { id: string; name: string; role: string }[];
  timeline: { id: string; at: string; who: string; text: string }[];
  files: CaseFile[];
  accessLog: AccessEntry[];
  /** With the reporter (anonymous ones through the reply code). */
  messages: CaseMessage[];
  notice: NoticeState | null;
  /** Ethics, grievance, disciplinary. */
  outcome: OutcomeState | null;
  /** POSH. */
  icReport: IcReportState | null;
  relief: ReliefRecord[];
}

export interface ProposeInput {
  finding: CaseFinding;
  action: string;
  reasons: string;
  version: number;
}
export interface IcReportInput {
  finding: CaseFinding;
  findings: string;
  recommendation: string;
  version: number;
}
export interface ReliefInput {
  action: ReliefAction;
  note: string;
}
export interface AddMemberInput {
  personId: string;
  role: string;
  overrideReason?: string;
}

/* ---------------- HLP-09 · Ethics desk ---------------- */

/** GET ethics/reports → reports[]. */
export interface EthicsRow {
  id: string;
  ref: string;
  subject: string;
  receivedOn: string;
  entity: string;
  anonymous: boolean;
  severity: 'serious' | 'standard';
  routed: boolean;
  stage: string;
  clock: { label: string; on: string } | null;
  /** The report names a case officer: it went to the next person in the routing, not to that officer (s.177). */
  aboutOfficer: boolean;
}
