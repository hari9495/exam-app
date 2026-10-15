// Performance (M06), wired to the API (M06-BUILD-DESIGN §19 "Set-up"). Shapes the API returns and accepts.

export type { LoadState } from '../../org/types';

export interface Choice {
  value: string;
  label: string;
}

export interface RatingScale {
  id: string;
  name: string;
  min: number;
  max: number;
  step: number;
  status: 'active' | 'retired';
  starter: boolean;
  /** Used by a template: it keeps its meaning and cannot change. */
  inUse: boolean;
  levels: { id?: string; value: number; label: string; description: string | null }[];
  bands: { id?: string; fromScore: number; toScore: number; label: string }[];
  version: number;
}

export type ScaleInput = Pick<RatingScale, 'name' | 'min' | 'max' | 'step' | 'levels' | 'bands'> & { version?: number };

export type SectionKind = 'goals' | 'competencies' | 'values' | 'questions' | 'overall';
export type Who = 'self' | 'manager' | 'peer' | 'skip';
export type TemplateKind = 'annual' | 'half_yearly' | 'quarterly' | 'project' | 'probation';

export interface TemplateSection {
  kind: SectionKind;
  title: string;
  weight: number;
  rated: boolean;
  whoAnswers: Who[];
  questions: { text: string; answer: 'rating' | 'text' | 'both'; required?: boolean }[];
}

export interface ReviewTemplate {
  id: string;
  familyId: string;
  templateVersion: number;
  name: string;
  kind: TemplateKind;
  scaleId: string;
  scoring: 'weighted' | 'manager_overall';
  status: 'draft' | 'active' | 'retired';
  starter: boolean;
  activatedAt: string | null;
  sections: TemplateSection[];
  /** Why it cannot be activated yet (checked again on activation). */
  problem: string | null;
  version: number;
}

export type TemplateInput = Pick<ReviewTemplate, 'name' | 'kind' | 'scaleId' | 'scoring' | 'sections'> & { version?: number };

export interface Competency {
  id: string;
  skillId: string;
  name: string;
  group: 'core' | 'functional' | 'leadership';
  description: string | null;
  status: 'active' | 'retired';
  starter: boolean;
  levels: { level: number; label: string; behaviours: string | null }[];
  roles: { designationId: string; designation: string; level: number; validFrom: string }[];
  version: number;
}

export interface CompetencyInput {
  name: string;
  group: Competency['group'];
  description: string | null;
  levels: { label: string; behaviours: string | null }[];
  roles: { designationId: string; level: number; validFrom: string }[];
  version?: number;
}

export interface Skill {
  id: string;
  parentId: string | null;
  name: string;
  kind: 'domain' | 'skill' | 'sub_skill';
  status: 'active' | 'retired' | 'merged';
  mergedIntoId: string | null;
  starter: boolean;
  /** This skill is a competency. */
  competency: boolean;
}

// ------------------------------------------------------------------------------------------ PM2: goals and OKRs

export interface GoalPeriod {
  id: string;
  name: string;
  fromOn: string;
  toOn: string;
  status: 'open' | 'closed';
}

export type GoalStatus = 'draft' | 'submitted' | 'active' | 'done' | 'dropped';

export interface GoalSummary {
  id: string;
  periodId: string;
  ownerType: 'person' | 'team' | 'company';
  ownerEmployeeId: string | null;
  ownerDepartmentId: string | null;
  owner: string;
  parentGoalId: string | null;
  kind: 'okr' | 'kpi';
  title: string;
  weight: number;
  status: GoalStatus;
  progress: number;
  version: number;
}

export interface KeyResult {
  id: string;
  title: string;
  unit: string | null;
  direction: 'up' | 'down' | 'hit';
  start: number;
  target: number;
  current: number;
  weight: number;
  progress: number;
}

export interface GoalDetail extends GoalSummary {
  description: string | null;
  keyResults: KeyResult[];
  parent: { id: string; title: string; progress: number } | null;
  children: { id: string; title: string; progress: number; owner: string }[];
  checkins: { id: string; on: string; progress: number; confidence: 'on_track' | 'at_risk' | 'off_track'; note: string | null }[];
  pendingChange: unknown;
  decisionNote: string | null;
  can: { edit: boolean; checkIn: boolean; drop: boolean; cascade: boolean };
}

export interface GoalInput {
  periodId: string;
  ownerType: 'person' | 'team' | 'company';
  ownerDepartmentId?: string | null;
  parentGoalId: string | null;
  kind: 'okr' | 'kpi';
  title: string;
  description: string | null;
  weight: number;
  keyResults: { title: string; unit: string | null; direction: 'up' | 'down' | 'hit'; start: number; target: number; weight?: number }[];
  reason?: string;
  version?: number;
}

export interface CheckinInput {
  values: { keyResultId: string; value: number }[];
  progress?: number;
  confidence: 'on_track' | 'at_risk' | 'off_track';
  note: string | null;
}

export interface GoalMap {
  goals: GoalSummary[];
  unaligned: string[];
  offTrack: string[];
}

// ------------------------------------------------------------------------------------------ PM3: feedback and 1:1s (§19)

export interface FeedbackItem {
  id: string;
  from: string;
  fromEmployeeId: string;
  to: string;
  toEmployeeId: string;
  kind: 'praise' | 'suggestion';
  /** Null when HR sealed it: the people see that HR removed it. */
  text: string | null;
  visibility: 'private' | 'recipient_only';
  goalId: string | null;
  fromRequest: boolean;
  at: string;
  sealed: boolean;
  can: { withdraw: boolean; seal: boolean };
}

export interface FeedbackRequest {
  id: string;
  about: string;
  aboutEmployeeId: string;
  requestedBy: string;
  question: string;
  dueOn: string | null;
}

export interface FeedbackInput {
  toEmployeeId: string;
  kind: 'praise' | 'suggestion';
  text: string;
  visibility: 'private' | 'recipient_only';
  requestId?: string;
}

export interface OneOnOneSummary {
  id: string;
  with: string;
  on: string;
  status: 'planned' | 'held' | 'cancelled';
  role: 'manager' | 'employee';
}

export interface OneOnOne {
  id: string;
  employee: string;
  employeeId: string;
  manager: string;
  managerEmployeeId: string;
  role: 'manager' | 'employee';
  on: string;
  status: 'planned' | 'held' | 'cancelled';
  sharedNotes: string | null;
  agenda: { id: string; text: string; done: boolean; addedBy: string }[];
  actions: { id: string; text: string; owner: string; ownerEmployeeId: string; dueOn: string | null; goalId: string | null; done: boolean }[];
  /** Only the viewer's own note; the other person never sees it. */
  privateNote: string;
  version: number;
}

// ------------------------------------------------------------------------------------------ PM4: review cycles (§19)

export type StageKey = 'self' | 'manager' | 'skip';
export interface CycleStage {
  key: StageKey;
  dueOn: string;
  optional?: boolean;
}

export interface ReviewCycle {
  id: string;
  name: string;
  kind: TemplateKind;
  periodFrom: string;
  periodTo: string;
  templateId: string;
  scaleId: string;
  /** A P19 condition group; null = everyone in the company. */
  population: unknown;
  stages: CycleStage[];
  eligibilityRules: { cutoffMonths: number; rateLeavers: boolean };
  /** PM5: feedback from colleagues; null = off. */
  peerFeedback?: PeerConfig | null;
  status: 'draft' | 'launched' | 'calibrating' | 'released' | 'closed';
  launchedAt: string | null;
  version: number;
}

export interface CycleInput {
  name: string;
  kind: TemplateKind;
  periodFrom: string;
  periodTo: string;
  templateId: string;
  population: unknown;
  stages: CycleStage[];
  eligibilityRules: { cutoffMonths: number; rateLeavers: boolean };
  version?: number;
}

export interface Preflight {
  problems: { text: string; fix: string | null }[];
  reviewed: number;
  excluded: number;
  protectedLeave: number;
  leavers: number;
}

export interface EligibilityRow {
  id: string;
  employeeId: string;
  name: string;
  rule: 'included' | 'excluded_cutoff' | 'leaver' | 'transfer_split' | 'protected_leave' | 'override';
  eligibleMonths: number;
  proration: number;
  reviewed: boolean;
  overrideReason: string | null;
}

export interface NextStep {
  stage: string;
  label: string;
  owner: string | null;
  dueOn: string | null;
}

export interface ReviewSummary {
  id: string;
  cycle: string;
  cycleId: string;
  employee: string;
  employeeId: string;
  manager: string;
  status: 'open' | 'in_calibration' | 'ready' | 'released' | 'acknowledged' | 'closed';
  next: NextStep;
  /** Null for the employee before release. */
  finalScore: number | null;
  band: string | null;
}

export interface ReviewEntry {
  status: 'draft' | 'submitted';
  /** HR sealed its texts (§15.3); the ratings stay. */
  sealed?: boolean;
  answers: Record<string, { rating: number | null; text: string | null }>;
  overallRating: number | null;
  comment: string | null;
  submittedAt: string | null;
  version: number;
}

export interface ReviewDetail {
  id: string;
  cycle: { id: string; name: string; periodFrom: string; periodTo: string; stages: CycleStage[] };
  employee: string;
  employeeId: string;
  manager: string;
  /** 'other': a former manager added by HR as a named reviewer; they see only their own input. */
  role: 'employee' | 'manager' | 'viewer' | 'other';
  status: ReviewSummary['status'];
  next: NextStep;
  template: {
    name: string;
    scoring: 'weighted' | 'manager_overall';
    sections: { id: string; kind: SectionKind; title: string; weight: number; rated: boolean; whoAnswers: string[]; questions: { id: string; text: string; answer: 'rating' | 'text' | 'both'; required: boolean; maxChars: number; wholeSection: boolean }[] }[];
    levels: { value: number; label: string }[];
  };
  goals: { id: string; title: string; progress: number; weight: number; status: string }[];
  self: ReviewEntry | null;
  selfSubmitted: boolean;
  managerEntry: ReviewEntry | null;
  finalScore: number | null;
  band: string | null;
  excludedSections: string[];
  trail: { stage: string; event: string; reason: string | null; at: string }[];
  /** The skip-level's comment when they agreed (not shown to the employee before release). */
  skipComment?: string | null;
  /** Named other reviewers' input: advisory, never in the score, never shown to the employee. */
  others?: { name: string; status: 'draft' | 'submitted'; answers: ReviewEntry['answers'] | null; comment: string | null }[];
  otherEntry?: ReviewEntry | null;
  /** Former managers HR can add as other reviewers. */
  formerManagers?: Choice[];
  released?: { at: string; acknowledgedAt: string | null; acknowledgeComment: string | null; disagreeBy: string | null } | null;
  disagreements?: { id: string; text: string; status: 'open' | 'answered' | 'upheld' | 'not_upheld'; hrNote: string | null }[];
  can: { self: boolean; manager: boolean; skip?: boolean; acknowledge?: boolean; disagree?: boolean; reopen?: boolean; other?: boolean; addOther?: boolean };
  version: number;
}

export interface EntryInput {
  answers: { questionId: string; rating?: number | null; text?: string | null }[];
  overallRating?: number | null;
  comment?: string | null;
}

export interface Disagreement {
  id: string;
  reviewId: string;
  employee: string;
  text: string;
  status: 'open' | 'answered' | 'upheld' | 'not_upheld';
  hrNote: string | null;
  at: string;
}

export interface Handover {
  id: string;
  employee: string;
  from: string;
  to: string;
  direction: 'to_me' | 'from_me';
  artefactType: 'review' | 'goal_parent' | string;
  artefactId: string;
  effectiveOn: string;
  decisionNeeded: boolean;
}

// ------------------------------------------------------------------------------------------ PM5: peer and 360° (§19)

export interface PeerConfig {
  minNominees: number;
  maxNominees: number;
  dueOn: string;
}

export interface Nomination {
  id: string;
  reviewer: string;
  reviewerEmployeeId: string;
  relationship: 'peer' | 'report' | 'other';
  proposedBy: 'employee' | 'manager' | 'hr';
  status: 'proposed' | 'approved' | 'declined' | 'withdrawn' | 'submitted';
}

export interface Nominations {
  peer: PeerConfig | null;
  nominations: Nomination[];
  can: { propose: boolean; decide: boolean; add: boolean };
}

export interface PeerGroups {
  advisory: true;
  peer: PeerConfig | null;
  released: boolean;
  responses: number;
  shown: { group: 'peer' | 'report' | 'others'; responses: number; ratings: Record<string, { average: number; low: number; high: number; count: number }>; texts: string[] }[];
  heldBack: number;
}

export interface FeedbackTask {
  id: string;
  reviewId: string;
  employee: string;
  cycle: string;
  dueOn: string | null;
  done: boolean;
  open: boolean;
}

export interface PeerForm {
  reviewId: string;
  employee: string;
  cycle: string;
  dueOn: string | null;
  anonymous: boolean;
  sections: { id: string; title: string; questions: { id: string; text: string; answer: 'rating' | 'text' | 'both'; required: boolean; maxChars: number; wholeSection: boolean }[] }[];
  levels: { value: number; label: string }[];
  entry: { status: 'draft' | 'submitted'; answers: Record<string, { rating: number | null; text: string | null }>; comment: string | null } | null;
  can: { answer: boolean };
}

export interface ReviewerBlock {
  id: string;
  a: string;
  b: string;
  employeeA: string;
  employeeB: string;
  reasonCode: 'conflict' | 'confidential_matter';
  untilOn: string | null;
}

// ------------------------------------------------------------------------------------------ PM6: calibration and reports (§19)

export interface CalibrationSession {
  id: string;
  name: string;
  facilitator: string;
  status: 'open' | 'signed_off';
  people: number;
}

export interface CalibrationRow {
  reviewId: string;
  employee: string;
  manager: string;
  managerScore: number | null;
  score: number | null;
  band: string | null;
  moved: boolean;
  selfIndication: number | null;
  skipAgreed: boolean;
  protectedLeave: boolean;
}

export interface CalibrationBoard {
  id: string;
  name: string;
  cycle: string;
  status: 'open' | 'signed_off';
  guide: { bands: { label: string; share: number }[]; tolerance: number } | null;
  scale: { min: number; max: number; bands: { fromScore: number; toScore: number; label: string }[] };
  rows: CalibrationRow[];
  distribution: { bands: { label: string; count: number; share: number; target: number | null; outside: boolean }[] | null; counted: number; notes: string[] };
  changes: { reviewId: string; employee: string; from: number | null; to: number; fromBand: string | null; toBand: string | null; reason: string; at: string }[];
  can: { change: boolean; signOff: boolean };
}

export interface PerfReport {
  kind: string;
  cycle: string;
  header: string[];
  rows: (string | number | null)[][];
  total?: number;
  min?: number;
}

// ------------------------------------------------------------------------------------------ PM7: ratings to pay (§19)

export interface CompMatrix {
  id: string;
  name: string;
  axis: 'compa_ratio' | 'rating_only';
  status: 'active' | 'retired';
  starter: boolean;
  version: number;
  cells: { band: string; compaFrom: number | null; compaTo: number | null; minPct: number; targetPct: number; maxPct: number }[];
}

export interface CompCycle {
  id: string;
  name: string;
  reviewCycleId: string | null;
  legalEntityId: string;
  currency: string;
  effectiveOn: string;
  matrixId: string;
  bonus: { month: string; targetPct: number; multipliers: Record<string, number> } | null;
  status: 'draft' | 'open' | 'approved' | 'applied' | 'closed';
  appliedAt: string | null;
  version: number;
}

export interface CompProposal {
  id: string;
  employee: string;
  employeeId: string;
  departmentId: string;
  manager: string;
  band: string | null;
  currentCtc: number | null;
  compaRatio: number | null;
  proration: number | null;
  cell: { band: string; minPct: number; targetPct: number; maxPct: number } | null;
  meritPct: number | null;
  meritAmount: number | null;
  promotionToGradeId: string | null;
  promotionToDesignationId: string | null;
  promotionAmount: number | null;
  bonusAmount: number | null;
  newCtc: number | null;
  outOfRange: boolean;
  justification: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'applied';
  version: number;
}

export interface CompSheet {
  cycle: CompCycle;
  role: 'hr' | 'finance' | 'manager';
  proposals: CompProposal[];
  budgets: { departmentId: string; department: string; kind: 'merit' | 'bonus'; amount: number; used: number; remaining: number; over: boolean }[];
  overrun: string;
  can: { edit: boolean; submit: boolean; apply: boolean };
}

export interface MyPayBand {
  visible: boolean;
  currency?: string;
  range?: { min: number; mid: number; max: number } | null;
  position?: 'below' | 'within' | 'above';
  quartile?: 1 | 2 | 3 | 4 | null;
}

type Gap = { group: string; count: null; suppressed: true } | { group: string; count: number; suppressed: false; meanGapPct: number; medianGapPct: number; adjustedGapPct: number };
export interface PayEquity {
  dimension: string;
  before: Gap[];
  after: Gap[];
  flagged: { employeeId: string; employee: string }[];
  threshold: number;
  min: number;
}

// ------------------------------------------------------------------------------------------ PM8: improvement plans (§13)

export type PipStatus = 'proposed' | 'declined' | 'active' | 'extended' | 'met' | 'not_met' | 'withdrawn';
export type PipsView = 'mine' | 'team' | 'scope';

export interface PipSummary {
  id: string;
  employee: string;
  manager: string;
  status: PipStatus;
  startsOn: string;
  endsOn: string;
  nextCheckin: string | null;
}

export interface Pip {
  id: string;
  employee: string;
  employeeId: string;
  manager: string;
  reason: string;
  expectations: string;
  support: string;
  startsOn: string;
  plannedEndsOn: string;
  endsOn: string;
  pausedDays: number;
  pausedNow: boolean;
  checkinEveryDays: number;
  status: PipStatus;
  acknowledgedAt: string | null;
  employeeComment: string | null;
  extendedFrom: string | null;
  extendReason: string | null;
  outcomeNote: string | null;
  outcomeAt: string | null;
  letterId: string | null;
  exitCaseId: string | null;
  goals: { id: string; text: string; measure: string; status: string }[];
  checkins: { id: string; dueOn: string; heldOn: string | null; managerNote: string | null; employeeNote: string | null; status: 'due' | 'held' | 'missed' | 'cancelled' }[];
  warning: boolean;
  role: 'employee' | 'manager' | 'hr';
  can: { acknowledge: boolean; checkin: boolean; employeeNote: boolean; outcome: boolean; extend: boolean; letter: boolean; startExit: boolean };
  version: number;
}
