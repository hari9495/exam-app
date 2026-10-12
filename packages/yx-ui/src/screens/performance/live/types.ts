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
