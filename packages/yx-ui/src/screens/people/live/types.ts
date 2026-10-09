// What the lifecycle batch-6a API returns (apps/api/src/lifecycle, apps/api/src/documents). The screens stay
// presentational; the API checks every call.

export type { LoadState } from '../../org/types';

export type TaskStatus = 'waiting' | 'open' | 'done' | 'skipped' | 'cancelled';
export type TaskKind = 'tick' | 'form' | 'document' | 'letter' | 'desk_request';
export type OwnerType = 'hr' | 'it' | 'admin' | 'finance' | 'payroll' | 'manager' | 'person' | 'user' | 'group';

export interface FormFieldDef {
  key: string;
  type: string;
  label: string;
  help?: string;
  required?: boolean;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
}
export interface FormDef {
  sections: { id: string; title?: string; fields: FormFieldDef[] }[];
  rules: unknown[];
}

export interface JourneyTask {
  id: string;
  key: string;
  title: string;
  kind: TaskKind;
  ownerType: OwnerType;
  ownerLabel: string;
  assignee: string | null;
  dueOn: string;
  dueOffsetDays: number;
  status: TaskStatus;
  overdue: boolean;
  required: boolean;
  locked: boolean;
  form: FormDef | null;
  /** Document tasks: the document type asked for. */
  documentType: string | null;
  answers: Record<string, unknown> | null;
  link: { type: string; id: string } | null;
  completedAt: string | null;
  completedBy: string | null;
  skipReason: string | null;
  canComplete: boolean;
  canSkip: boolean;
  version: number;
  /** My tasks only. */
  journeyId?: string;
  journeyKind?: 'onboarding' | 'offboarding';
  person?: string;
  anchorOn?: string;
}

export interface Journey {
  id: string;
  kind: 'onboarding' | 'offboarding';
  person: string;
  personId: string;
  subjectType: string;
  subjectId: string;
  anchorOn: string;
  status: 'active' | 'done' | 'cancelled';
  progress: number;
  template: string;
  owner: string | null;
  canManage: boolean;
  today: string;
  tasks: JourneyTask[];
}

export interface MyTasks {
  today: string;
  tasks: JourneyTask[];
}

export interface Joiner {
  id: string;
  personId: string;
  name: string;
  email: string | null;
  joiningOn: string;
  status: 'invited' | 'joined' | 'cancelled';
  source: 'direct' | 'import' | 'offer';
  location: string;
  department: string | null;
  designation: string | null;
  manager: string | null;
  journeyId: string | null;
  progress: number;
  openTasks: number;
  overdueTasks: number;
  version: number;
}

export interface JoinerBoard {
  today: string;
  canAdd: boolean;
  joiners: Joiner[];
}

export interface Choice {
  value: string;
  label: string;
}
/** Where a joiner can be placed: entities, their locations, and the structure masters. */
export interface JoinerPlaces {
  entities: Choice[];
  locations: (Choice & { entityId: string })[];
  departments: Choice[];
  designations: Choice[];
  employmentTypes: Choice[];
  managers: Choice[];
}

export interface JoinerInput {
  givenName: string;
  familyName: string | null;
  email: string | null;
  phone: string | null;
  joiningOn: string;
  legalEntityId: string;
  locationId: string;
  departmentId: string | null;
  designationId: string | null;
  employmentTypeId: string | null;
  managerEmployeeId: string | null;
}

export interface ImportResult {
  committed: boolean;
  added: number;
  rows: { line: number; name: string; joiningOn: string | null; ok: boolean; problem: string | null }[];
}

export interface QueueDocument {
  id: string;
  personId: string;
  person?: string;
  typeKey: string;
  typeName: string;
  sensitivity: string;
  status: 'requested' | 'uploaded' | 'verified' | 'rejected' | 'expired';
  expiresOn: string | null;
  rejectReason: string | null;
  file: { name: string; scanStatus: 'pending' | 'clean' | 'infected'; size: number } | null;
  uploadedAt?: string;
  version: number;
}

export interface TemplateTask {
  key: string;
  title: string;
  ownerType: OwnerType;
  ownerLabel?: string;
  ownerUserId: string | null;
  ownerGroupId: string | null;
  kind: TaskKind;
  config: Record<string, unknown>;
  dueOffsetDays: number;
  dependsOn: string[];
  required: boolean;
  locked: boolean;
}
export interface JourneyTemplate {
  id: string;
  kind: 'onboarding' | 'offboarding';
  name: string;
  legalEntityId: string | null;
  locationId: string | null;
  departmentId: string | null;
  starterKey: string | null;
  active: boolean;
  version: number;
  tasks: TemplateTask[];
}
export interface JourneyTemplates {
  templates: JourneyTemplate[];
  starters: { key: string; kind: 'onboarding' | 'offboarding'; name: string; summary: string; tasks: number; copied: boolean }[];
}
