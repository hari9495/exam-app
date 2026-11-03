// HLP-07 My cases, HLP-08 Cases (case team), HLP-09 Ethics desk: the shapes the screens need from the server.
// Phase A (3 Nov 2026): written before the server. HLP-06 builds the case record; phase B maps it onto these shapes
// (or changes them here with the screens). Dates are ISO strings in India time; every legal date comes from the server
// (the statutory rule set or a company setting), never from the screen. Rules: helpdesk-design-map.md section 4f.

/** The HLP-06 case kinds (disciplinary cases have no record yet: question 34). */
export type CaseKind = 'grievance' | 'whistleblower' | 'posh' | 'disciplinary';
/** Disciplinary cases (founder answer 34): an inquiry is recorded only (question 51). */
export type CaseDecision = 'dropped' | 'warning' | 'inquiry';
export type CaseStatus = 'open' | 'action' | 'on-hold' | 'closed';
export type Severity = 'serious' | 'standard';

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

/** Witnesses come after counsel (founder answer 37). */
export type MyCaseRole = 'reporter' | 'respondent';

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
  /** Disciplinary: the standing orders clause. */
  rule?: string | null;
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

/** GET my/cases/:id. */
export type MyCaseDetail = MyCaseAsReporter | MyCaseAsRespondent;

export interface MyReplyInput {
  text: string;
  fileIds: string[];
}

/* ---------------- HLP-08 · Cases (case team) ---------------- */

/** GET cases → cases[] (only the cases the person is a member of). */
export interface CaseListRow {
  id: string;
  ref: string;
  /** HLP-12: accident cases join the list for the safety team and the case's handler. */
  kind: CaseKind | 'accident';
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
  /** Disciplinary cases. */
  decision: CaseDecision | null;
  action: string | null;
  reasons: string | null;
  /** What the reporter (and the respondent) are told once it is approved. */
  reporterSummary: string | null;
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

/** 'suspension' only on a disciplinary case; every relief is an HR task, never a change in People or Pay. */
export type ReliefAction = 'transfer' | 'leave' | 'reporting' | 'suspension' | 'other';
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
    /** An ethics officer on a fraud or ethics report (founder answer 35). */
    canSetSeverity: boolean;
  };
  /** Fraud and ethics reports only: Serious or Standard (the default follows the retaliation worry). */
  severity: Severity | null;
  /** Outcome or IC report may be recorded: the reply came or its date passed (natural justice). */
  canDecide: { ok: boolean; reason: string | null };
  members: CaseTeamMember[];
  /** People who may be added (case officers, investigators, IC members, HR), from the server. */
  /** Active people of the company not on the case: the respondent, the HR person for a relief task, a new member. */
  people: { id: string; name: string; email: string }[];
  /** Disciplinary: the standing orders clause (the misconduct is report.category, the facts report.summary). */
  rule: string | null;
  /** What the reporter filed (HLP-06). */
  report: { summary: string; category: string | null; happenedOn: string | null; involved: string | null; witnesses: string | null; outside: string | null; retaliationWorry: boolean; late: boolean };
  timeline: { id: string; at: string; who: string; text: string }[];
  files: CaseFile[];
  accessLog: AccessEntry[];
  /** With the reporter (anonymous ones through the reply code). */
  messages: CaseMessage[];
  notice: NoticeState | null;
  /** Grievance and ethics cases. */
  outcome: OutcomeState | null;
  /** POSH. */
  icReport: IcReportState | null;
  relief: ReliefRecord[];
}

export interface ProposeInput {
  /** Grievance and ethics cases. */
  finding?: CaseFinding;
  /** Disciplinary cases. */
  decision?: CaseDecision;
  action: string;
  reasons: string;
  reporterSummary: string;
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
  assigneeUserId: string;
}
export interface AddMemberInput {
  personId: string;
  role: 'officer' | 'investigator';
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
  /** Set by an ethics officer; until then Serious when the reporter fears retaliation, else Standard (answer 35). */
  severity: Severity;
  routed: boolean;
  stage: string;
  clock: { label: string; on: string } | null;
  /** The report names a case officer: it went to the next person in the routing, not to that officer (s.177). */
  aboutOfficer: boolean;
}

export interface NoticeInput {
  /** Required when the case has no respondent yet. */
  respondentUserId?: string;
  allegations: string;
  /** Case files shared with the respondent. */
  fileIds: string[];
}

/** HLP-08: HR opens a disciplinary show-cause case about an employee. */
export interface RaiseInput {
  employeeUserId: string;
  misconduct: string;
  facts: string;
  rule?: string;
}
