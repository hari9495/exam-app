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
  role: 'employee' | 'manager' | 'viewer';
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
  released?: { at: string; acknowledgedAt: string | null; acknowledgeComment: string | null; disagreeBy: string | null } | null;
  disagreements?: { id: string; text: string; status: 'open' | 'answered' | 'upheld' | 'not_upheld'; hrNote: string | null }[];
  can: { self: boolean; manager: boolean; skip?: boolean; acknowledge?: boolean; disagree?: boolean; reopen?: boolean };
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
