// Recruitment (M10), wired to the hiring API (M10-BUILD-DESIGN §3). Shapes the screens show and send.

export type { LoadState } from '../../org/types';

export interface Choice {
  value: string;
  label: string;
}

export type HiringJobStatus = 'draft' | 'pending_approval' | 'open' | 'on_hold' | 'closed';

export interface HiringJob {
  id: string;
  title: string;
  status: HiringJobStatus;
  createdAt: string;
  /** "3 Applied · 1 Interview", or "No candidates yet". */
  stageSummary: string;
}

export interface JobCustomField {
  id: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'select';
  options: string[] | null;
  required: boolean;
}

export interface NewJobInput {
  title: string;
  description?: string;
  departmentId?: string;
  department?: string;
  locationId?: string;
  location?: string;
  designationId?: string;
  hiringManagerId?: string;
  headcount?: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  /** AT3: show the salary range on the careers site and to Google for Jobs. */
  showSalary?: boolean;
  pipelineId?: string;
  customFields?: Record<string, string | number | null>;
  /** AT2: the requisition's plan facts. */
  headcountPlanLineId?: string;
  outsidePlan?: boolean;
  outsidePlanReason?: string;
  requisitionReason?: 'new' | 'replacement';
  replacementOfEmployeeId?: string;
  budgetAmount?: number;
  targetStart?: string;
}

// ------------------------------------------------------------------------------------------ AT2: plans and routes

export interface PlanLine {
  id: string;
  designationId: string;
  designation: string;
  gradeId: string | null;
  grade: string | null;
  locationId: string | null;
  location: string | null;
  count: number;
  budget: number | null;
  committed: number;
  committedBudget: number;
  filled: number;
}

/** A line of an approved plan a requisition can draw on. */
export interface OpenPlanLine extends PlanLine {
  planId: string;
  departmentId: string;
  department: string;
  fyStart: number;
  left: number;
}

export type ApproverType = 'users' | 'reporting_manager' | 'hiring_manager' | 'group';
export interface RouteStep {
  name: string;
  approverType: ApproverType;
  approverUserIds: string[];
  managerLevel: number | null;
  groupId: string | null;
}
export interface ApprovalRoute {
  enabled: boolean;
  steps: RouteStep[];
}

// ------------------------------------------------------------------------------------------ AT3: careers site, job boards

export interface CareersSettings {
  enabled: boolean;
  assistantEnabled: boolean;
  headline: string | null;
  intro: string | null;
  bannerUrl: string | null;
}

// Company pages and privacy notices are Surfaces/Careers kit parts now (components/careers-admin).
export type { CareersEntity, CareersEntityPage, ConsentNotice, ConsentPurpose } from '../../../components/careers-admin';

export interface JobBoardRow {
  id: string;
  name: string;
  provider: string;
  configured: boolean;
  publishedJobCount: number;
  feedUrl: string;
}

export interface BoardProvider {
  id: string;
  configFields: { key: string; label: string; required: boolean; secret: boolean; placeholder?: string }[];
}

export interface BoardSettings {
  name: string;
  provider: string;
  /** Only the fields typed in; blank secrets keep what is stored. */
  config?: Record<string, string>;
}

// ------------------------------------------------------------------------------------------ AT4: candidates

export type GlobalStage = 'new' | 'in_review' | 'engaged' | 'available' | 'offered' | 'hired' | 'rejected';

export interface CandidateRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'inactive';
  globalStage: GlobalStage;
  createdAt: string;
  /** Only a candidate never invited to an assessment can be deleted (otherwise erase it). */
  neverInvited: boolean;
  customFields?: Record<string, string | number | null>;
}

export interface CandidateInput {
  name: string;
  email: string;
  phone?: string;
  customFields?: Record<string, string | number | null>;
}

export interface EmailTemplateChoice {
  value: string;
  label: string;
  subject: string;
  body: string;
}

export interface EmailCompose {
  templateId: string | null;
  subject: string;
  body: string;
  senderAddressId?: string;
}

export interface UploadInviteResult {
  invited: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/**
 * HIR-05 ex-employee match (YX-ATS-33), as the API gives it to this viewer: 'flag' (may see the employee, no exit key),
 * 'exit' (exit date and type) or 'rehire' (also rehire eligibility). exitCaseId and version only when they may clear it.
 */
export interface ExEmployeeView {
  level: 'flag' | 'exit' | 'rehire';
  exitDate: string | null;
  exitType: string | null;
  rehireEligible: boolean | null;
  rehireReason: string | null;
  exitCaseId: string | null;
  version: number | null;
}

/** GET hiring/candidates/:id. A view-only holder (hiring manager) gets no contact details, messages, consents or retention. */
export interface CandidateProfileView {
  candidate: { id: string; name: string; email: string | null; phone: string | null; phoneE164: string | null; status: string; globalStage: GlobalStage; createdAt: string; erasedAt: string | null; emailOptedOut: boolean; smsOptedOut?: boolean; whatsappOptedOut?: boolean };
  legalHold: { at: string; reason: string | null } | null;
  retention: { months: number; lastActivityAt: string; until: string | null; noticeAt: string | null } | null;
  exEmployee?: ExEmployeeView | null;
  /** HIR-05 under 18 (rule set HIR.MINOR): the date of birth only for candidate key holders; null when not a minor. */
  minor?: { dob: string | null; guardian: 'none' | 'pending' | 'given' | 'declined'; minAge: number } | null;
  resume: { hasFile: boolean; scan: string; parseStatus: string; title: string | null; summary: string | null; skills: string | null; years: number | null } | null;
  applications: { id: string; jobId: string; jobTitle: string; jobStatus: string; stage: string | null; status: string | null; appliedAt: string; closed: boolean; closedReason: string | null; source: string | null }[];
  assessments: { id: string; exam: string; status: string; invitedAt: string }[];
  interviews: { id: string; status: string; createdAt: string; entryId?: string; jobTitle?: string; when?: string | null }[];
  messages: { emails: { id: string; subject: string; status: string; createdAt: string }[]; sms: number; whatsapp: number };
  consents: { id: string; purpose: string; version: number; source: string; givenAt: string; withdrawnAt: string | null }[];
  lists: { id: string; name: string; kind: 'pool' | 'hotlist'; addedAt: string }[];
  merges: { id: string; keptId: string; mergedId: string; mergedAt: string; choices: Record<string, string> }[];
}

export type MergeField = 'name' | 'phone' | 'resume';
export type MergeChoices = Record<MergeField, 'kept' | 'merged'>;

export interface DuplicatePairView {
  a: { id: string; name: string; email: string; phone: string | null };
  b: { id: string; name: string; email: string; phone: string | null };
  reasons: ('phone' | 'name_phone' | 'resume')[];
  score: number | null;
}

export interface TalentList {
  id: string;
  name: string;
  kind: 'pool' | 'hotlist';
  description: string | null;
  members: number;
}

export interface TalentListMember {
  candidateId: string;
  addedAt: string;
  candidate: { id: string; name: string; email: string; globalStage: GlobalStage } | null;
}

export interface RetentionRunRow {
  id: string;
  runAt: string;
  periodMonths: number;
  renewalsSent: number;
  anonymised: number;
  skippedHold: number;
  skippedOpen: number;
  skippedHired: number;
  triggeredBy: string | null;
}

export interface RetentionPreview {
  periodMonths: number;
  renewalsSent: number;
  anonymised: number;
  skippedHold: number;
  skippedOpen: number;
  skippedHired: number;
}

// ------------------------------------------------------------------------------------------ AT5: job workspace, interviews

export type StageCategory = 'active' | 'offer' | 'hired' | 'rejected' | 'archived';

export interface BoardStageView {
  id: string;
  name: string;
  category: StageCategory;
  statuses: { id: string; name: string }[];
}

export interface ScorecardSummary {
  complete: boolean;
  submitted: number;
  expected: number;
  score: number | null;
  passes: boolean | null;
}

export interface BoardRowView {
  entryId: string;
  candidateId: string;
  name: string;
  email: string | null;
  stageId: string;
  statusId: string;
  statusName: string;
  category: StageCategory;
  daysInStage: number;
  /** "Plant aptitude 72% · passed", or null. */
  testSummary: string | null;
  scorecards: ScorecardSummary | null;
  nextInterviewAt: string | null;
  rejectionPendingUntil: string | null;
  assignee: string | null;
  fitScore: number | null;
  internal: boolean;
}

export interface RejectInput {
  reason: string;
  message: { templateId: string | null; subject: string; body: string } | null;
  delayHours: 0 | 24;
}

export interface JobView {
  id: string;
  title: string;
  status: HiringJobStatus;
  summary: string;
  description: string | null;
  publicApplyEnabled: boolean;
  listOnCareers: boolean;
  applyUrl: string | null;
  fitCriteria: string | null;
  fitRubric: { label: string; weight: number }[];
  customFields: { label: string; value: string }[];
  boardIds: string[];
}

export interface JobSettingsView {
  scorecardTemplateId: string | null;
  exams: { examId: string; title: string; sendOnStageId: string | null }[];
}

export interface ApplicationView {
  entryId: string;
  candidateId: string;
  name: string;
  email: string | null;
  phone: string | null;
  statusId: string;
  stageName: string;
  category: StageCategory;
  rejectedReason: string | null;
  rejectionPendingUntil: string | null;
  resume: { title: string | null; summary: string | null; skills: string[]; hasFile: boolean; status: string } | null;
  fit: { status: string | null; score: number | null; summary: string | null; stale: boolean } | null;
  tests: { examId: string; title: string; score: number | null; passFail: string | null; status: string }[];
  customFields: { label: string; value: string }[];
  /** Careers answer 355: the pay the applicant gave when asked (rupees a year); only for holders of the offer-pay key. */
  currentPay?: number | null;
  /** Answer 474: a New York City applicant asked for another process than the automated tool (ISO time). */
  alternativeRequestedAt?: string | null;
  /** Answer 502: the New York City notice applies to this job (the recruiter may record a request for another process). */
  toolNotice?: boolean;
  checklist: { id: string; label: string; done: boolean }[];
  assignee: string | null;
  emails: { id: string; subject: string; status: string; at: string }[];
  sms: { id: string; body: string; status: string; at: string }[];
  whatsapp: { id: string; body: string; status: string; at: string }[];
  smsOptedOut: boolean;
  whatsappOptedOut: boolean;
  notes: { id: string; author: string; note: string | null; rating: number | null; at: string }[];
  /** HIR-09: the pay text only with the offer-pay key (null otherwise). */
  offers: { id: string; status: string; compensation: string | null; startDate: string; expiresAt: string }[];
}

export interface ScheduleInput {
  mode: 'proposed' | 'self_book';
  slots: { startsAt: string; endsAt: string }[];
  windowStart: string | null;
  windowEnd: string | null;
  slotMinutes: 15 | 30 | 45 | 60 | null;
  panelistUserIds: string[];
  location: string;
  timeZone: string;
  note: string | null;
  scorecardTemplateId: string | null;
}

export interface ScorecardTemplateView {
  id: string;
  name: string;
  scaleMax: number;
  passBar: number;
  inUse: boolean;
  items: { id: string; label: string; guidance: string | null; weight: number; competencyId: string | null }[];
}

export interface ScorecardTemplateInput {
  name: string;
  scaleMax: number;
  passBar: number;
  items: { label: string; guidance: string | null; weight: number; competencyId: string | null }[];
}

export type Recommendation = 'strong_no' | 'no' | 'yes' | 'strong_yes';

/** HIR-07 answer 322: one append-only comment under a submitted scorecard. */
export interface ScorecardCommentView {
  id: string;
  authorUserId: string;
  author: string;
  body: string;
  at: string;
  redacted: boolean;
}

export interface InterviewView {
  interview: { id: string; status: string; location: string; timeZone: string; meetingUrl: string | null; slots: { startsAt: string; endsAt: string; confirmed: boolean }[]; jobId: string; jobTitle: string; candidateId: string; candidateName: string };
  panel: { userId: string; name: string; submitted: boolean }[];
  resume: { title: string | null; summary: string | null; skills: string | null; hasFile: boolean } | null;
  template: { id: string; name: string; scaleMax: number; passBar: number; items: { id: string; label: string; guidance: string | null; weight: number }[] } | null;
  viewer: { isPanelist: boolean; isOverseer: boolean };
  scorecards: { id: string; panelistUserId: string; panelistName: string; mine: boolean; status: 'draft' | 'submitted'; recommendation: Recommendation | null; summary: string | null; weightedScore: number | null; passes: boolean | null; submittedAt: string | null; ratings: { itemId: string; rating: number | null; notes: string | null }[]; comments?: ScorecardCommentView[] }[];
  result: (ScorecardSummary & { score: number | null }) | null;
  earlier: { interviewId: string; panelistName: string; recommendation: string | null; weightedScore: number; passes: boolean | null; summary: string | null }[];
}

export interface ScorecardInput {
  ratings: { itemId: string; rating: number | null; notes: string | null }[];
  recommendation: Recommendation | null;
  summary: string | null;
}

export interface MyInterviewRow {
  id: string;
  candidateName: string;
  jobTitle: string;
  when: string | null;
  status: string;
  scorecard: 'not_started' | 'draft' | 'submitted' | 'none';
  /** HIR-06: still missing the company's overdue hours after the interview ended. */
  overdue?: boolean;
}

/** HIR-06: one interview on the calendar (GET hiring/interviews?from=&to=). */
export interface InterviewRangeRow {
  id: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  startsAt: string;
  endsAt: string;
  confirmed: boolean;
  status: string;
  /** The viewer is on the panel. */
  mine: boolean;
}

/* ---------------- HIR-09 offer builder and HIR-29 conditions (live) ---------------- */

/** One line of an offer's CTC, as the kit's CTC breakup table shows it (rupees a year and a month). */
export interface OfferCtcLine {
  key: string;
  label: string;
  kind: 'earning' | 'employer' | 'variable' | 'one-time';
  annual: number;
  monthly: number;
}

/** What the builder needs for one application (GET hiring/offers/setup). */
export interface OfferSetupView {
  entryId: string;
  candidate: { id: string; name: string };
  job: { id: string; title: string; locationId: string | null };
  company: string;
  grade: { id: string | null; name: string } | null;
  band: { min: number; max: number } | null;
  /** The company's salary structures the job's legal entity can use (value: the structure version). */
  structures: Choice[];
  locations: Choice[];
  letters: { value: string; label: string; esign: boolean; subject: string; body: string }[];
  defaultConditions: string[];
  /** Offers answer 404: a new offer expires this many days after today unless changed (Settings › Hiring). */
  expiryDays?: number;
  /** The company's offer route for this sender (the sender is never an approver) and the step above the range. */
  route: { steps: { name: string; approvers: string[] }[]; bandStep: { name: string; approvers: string[] } };
}

export interface OfferDraftInput {
  templateVersionId: string;
  annualCtc: number;
  variablePay: number;
  joiningBonus: number;
  clawbackMonths: number | null;
  locationId: string;
  /** ISO dates. */
  startDate: string;
  expiresAt: string;
  letterKind: 'offer' | 'loi';
  templateId: string | null;
  addConditions: boolean;
}

export interface OfferPreview {
  lines: OfferCtcLine[];
  monthlyGross: number;
  bandPosition: 'within' | 'above' | 'below' | 'none';
  bandText: string;
  extraApproval: boolean;
  warnings: string[];
}

export interface LiveOfferBuilder {
  state: 'loading' | 'ready' | 'error' | 'denied' | 'not-found';
  onRetry: () => void;
  setup: OfferSetupView | null;
  /** A revision: the version it starts from (its pay and terms fill the form). */
  previous?: { version: number; ctc: number; grade: string; input: OfferDraftInput } | null;
  /** The CTC lines from the company's salary structure (Pay's breakup); nothing is kept. */
  onPreview: (input: Pick<OfferDraftInput, 'templateVersionId' | 'annualCtc' | 'variablePay' | 'joiningBonus' | 'clawbackMonths' | 'locationId'>) => Promise<OfferPreview>;
  /** Saves the version and sends it on (for approval, or to the candidate); resolves with the toast text. */
  onFinish: (input: OfferDraftInput) => Promise<string>;
  /** Saves the version as a draft and leaves. */
  onSaveDraft: (input: OfferDraftInput) => Promise<void>;
  now: Date;
}

export type OfferApiStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'accepted' | 'declined' | 'withdrawn';

/** One offer as the record shows it (GET hiring/offers/:id). Pay fields only with the offer-pay key. */
export interface OfferRecordView {
  id: string;
  status: OfferApiStatus;
  entryId: string;
  candidate: { id: string; name: string };
  job: { id: string; title: string };
  grade: string | null;
  location: string | null;
  currentVersion: number;
  startDate: string;
  expiresAt: string;
  esign: boolean;
  canSeePay: boolean;
  templateId: string | null;
  current: { version: number; letterKind: 'offer' | 'loi'; templateVersionId: string; locationId: string | null; bandPosition: string; bandText: string; extraApproval: boolean; annualCtc?: number; variablePay?: number; joiningBonus?: number; clawbackMonths?: number | null; lines?: OfferCtcLine[] } | null;
  versions: { version: number; current: boolean; at: string; by: string | null; note: string | null; needsApproval: boolean; annualCtc: number | null; text?: string | null }[];
  conditions: { id: string; name: string; dueOn: string; status: 'open' | 'met' | 'waived'; reason: string | null }[];
  approval: { requestId: string; status: string; steps: { name: string; state: string; approvers: string[] }[]; myTaskId: string | null } | null;
  activity: { id: string; actor: string; action: string; at: string }[];
  joiner: { id: string; status: string } | null;
}

export interface LiveOfferRecord {
  state: 'loading' | 'ready' | 'error' | 'denied' | 'not-found';
  onRetry: () => void;
  offer: OfferRecordView | null;
  now: Date;
  onBack: () => void;
  onRevise: () => void;
  /** Each resolves when done; the screen shows the toast. */
  onSubmit: () => Promise<string>;
  onSend: () => Promise<void>;
  onWithdraw: () => Promise<void>;
  onCancelApproval: () => Promise<void>;
  onLetter: () => Promise<void>;
  /** Answer 336: the company's reminder email (answer the offer, or what is still due); resolves with the toast text. */
  onRemind: () => Promise<string>;
  /** People › Ready to onboard, where HR adds the joiner from the accepted offer (PPL-12, unchanged). */
  onCreateEmployee: () => void;
  onAddCondition: (name: string, dueOn: string) => Promise<void>;
  onMet: (conditionId: string) => Promise<void>;
  onWaive: (conditionId: string, reason: string) => Promise<void>;
}

/* ---------------- HIR-28 bulk offers (live) ---------------- */

/** GET hiring/offer-batches/setup: the job's facts for a batch, and the candidates who can get an offer now. */
export interface BulkOfferSetup {
  job: { id: string; title: string; locationId: string | null };
  company: string;
  grade: string | null;
  band: { min: number; max: number } | null;
  structures: Choice[];
  locations: Choice[];
  letters: { value: string; label: string; esign: boolean; subject: string; body: string }[];
  defaultConditions: string[];
  expiryDays: number;
  /** Rows beyond the free places on the job's plan line are held ('hold'), or the check is off. free: null = not checked. */
  plan: { check: 'hold' | 'off'; linked: boolean; free: number | null };
  route: { steps: { name: string; approvers: string[] }[]; bandStep: { name: string; approvers: string[] } };
  candidates: { entryId: string; name: string; email: string }[];
}

export interface BulkOfferInput {
  templateVersionId: string;
  templateId: string | null;
  letterKind: 'offer' | 'loi';
  /** ISO date. */
  startDate: string;
  locationId: string;
  addConditions: boolean;
  rows: { entryId: string; annualCtc: number }[];
}

export type BulkRowStatus = 'sent' | 'pending_approval' | 'approved' | 'draft' | 'held' | 'skipped' | 'failed';

/** GET hiring/offer-batches/:id: each row's result and its offer's status now (amounts only with the offer-pay key). */
export interface BulkBatchView {
  id: string;
  status: 'running' | 'done';
  job: { id: string; title: string };
  startDate: string;
  expiresAt: string;
  canSeePay: boolean;
  rows: { entryId: string; name: string; annualCtc: number | null; status: BulkRowStatus; offerId: string | null; reason: string | null; offerStatus: string | null; esign: boolean; band: string | null }[];
}

export interface LiveBulkOffers {
  state: 'loading' | 'ready' | 'error' | 'denied' | 'not-found';
  onRetry: () => void;
  /** The batch builder; null on the sent page. */
  setup: BulkOfferSetup | null;
  /** The sent page: the batch and each row's result. */
  batch?: BulkBatchView | null;
  /** Makes and sends the batch; resolves when every row has its result (the page then opens the batch). */
  onSend: (input: BulkOfferInput) => Promise<void>;
  onOpenOffer: (offerId: string) => void;
  now: Date;
  /** Offers answer 402: the candidates ticked on the pipeline board's Bulk actions (the rest start unticked). */
  selected?: string[];
}
