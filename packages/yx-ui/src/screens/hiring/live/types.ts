// Recruitment (M10), wired to the hiring API (M10-BUILD-DESIGN §3). Shapes the screens show and send.

export type { LoadState } from '../../org/types';

export interface Choice {
  value: string;
  label: string;
}

export type HiringJobStatus = 'draft' | 'pending_approval' | 'open' | 'closed';

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

export interface HeadcountPlan {
  id: string;
  departmentId: string;
  department: string;
  legalEntityId: string | null;
  fyStart: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  note: string | null;
  version: number;
  lines: PlanLine[];
}

export interface PlanInput {
  departmentId: string;
  legalEntityId: string | null;
  fyStart: number;
  note: string | null;
  lines: { designationId: string; gradeId: string | null; locationId: string | null; count: number; budget: number | null }[];
  version?: number;
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

export interface CareersEntityPage {
  slug: string;
  headline: string | null;
  intro: string | null;
  primaryColor: string | null;
}

/** A legal entity and its own careers page, if it has one. */
export interface CareersEntity {
  id: string;
  name: string;
  page: CareersEntityPage | null;
}

export type ConsentPurpose = 'application' | 'talent_pool';

export interface ConsentNotice {
  id: string;
  purpose: ConsentPurpose;
  version: number;
  text: string;
  publishedAt: string;
}

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

export interface RecruitingCostRow {
  id: string;
  source: string;
  jobTitle: string | null;
  amount: number;
  currency: string;
  createdAt: string;
}

export interface CostInput {
  jobBoardId: string;
  jobId: string | null;
  amount: number;
  currency: string;
  note: string | null;
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

export interface CandidateProfileView {
  candidate: { id: string; name: string; email: string; phone: string | null; phoneE164: string | null; status: string; globalStage: GlobalStage; createdAt: string; erasedAt: string | null; emailOptedOut: boolean; smsOptedOut?: boolean; whatsappOptedOut?: boolean };
  legalHold: { at: string; reason: string | null } | null;
  retention: { months: number; lastActivityAt: string; until: string | null; noticeAt: string | null };
  resume: { hasFile: boolean; scan: string; parseStatus: string; title: string | null; summary: string | null; skills: string | null; years: number | null } | null;
  applications: { id: string; jobId: string; jobTitle: string; jobStatus: string; stage: string | null; status: string | null; appliedAt: string; closed: boolean; closedReason: string | null; source: string | null }[];
  assessments: { id: string; exam: string; status: string; invitedAt: string }[];
  interviews: { id: string; status: string; createdAt: string }[];
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
  checklist: { id: string; label: string; done: boolean }[];
  assignee: string | null;
  interviews: { id: string; status: string; when: string | null; panel: string[]; location: string; meetingUrl: string | null; scorecards: ScorecardSummary | null }[];
  emails: { id: string; subject: string; status: string; at: string }[];
  sms: { id: string; body: string; status: string; at: string }[];
  whatsapp: { id: string; body: string; status: string; at: string }[];
  smsOptedOut: boolean;
  whatsappOptedOut: boolean;
  notes: { id: string; author: string; note: string | null; rating: number | null; at: string }[];
  offers: { id: string; status: string; compensation: string; startDate: string; expiresAt: string }[];
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

export interface OfferInput {
  compensation: string;
  startDate: string;
  expiresAt: string;
  templateId: string | null;
  subject: string;
  body: string;
  then: 'save' | 'send' | 'approval';
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

export interface InterviewView {
  interview: { id: string; status: string; location: string; timeZone: string; meetingUrl: string | null; slots: { startsAt: string; endsAt: string; confirmed: boolean }[]; jobId: string; jobTitle: string; candidateId: string; candidateName: string };
  panel: { userId: string; name: string; submitted: boolean }[];
  resume: { title: string | null; summary: string | null; skills: string | null; hasFile: boolean } | null;
  template: { id: string; name: string; scaleMax: number; passBar: number; items: { id: string; label: string; guidance: string | null; weight: number }[] } | null;
  viewer: { isPanelist: boolean; isOverseer: boolean };
  scorecards: { id: string; panelistUserId: string; panelistName: string; mine: boolean; status: 'draft' | 'submitted'; recommendation: Recommendation | null; summary: string | null; weightedScore: number | null; passes: boolean | null; submittedAt: string | null; ratings: { itemId: string; rating: number | null; notes: string | null }[] }[];
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
}
