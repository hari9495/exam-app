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
  /** Letter tasks: the letter type HR issues (6b: the task closes from the issued letter). */
  letterType?: string | null;
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
  departmentId: string | null;
  designationId: string | null;
  employmentTypeId: string | null;
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

// ------------------------------------------------------------------------------------------ batch 6b

export type SectionKey = 'personal' | 'identity' | 'bank' | 'emergency' | 'nominees' | 'tax';

export interface PortalAnswers {
  personal: { dateOfBirth: string; gender: string; addressLine1: string; addressLine2?: string; city: string; stateCode: string; postalCode: string } | null;
  identity: { legalName: string; pan: string; aadhaar: string | null; uan: string | null } | null;
  bank: { holderName: string; account: string; ifsc: string } | null;
  emergency: { name: string; relation: string; phone: string } | null;
  nominees: { name: string; relation: string; sharePercent: number }[] | null;
  tax: { regime: 'new' | 'old' } | null;
}

export interface Letter {
  id: string;
  title: string;
  letterType: string;
  personId: string;
  person?: string;
  referenceNo: string | null;
  verifyCode: string | null;
  status: 'pending_approval' | 'rejected' | 'rendering' | 'awaiting_signature' | 'issued' | 'superseded' | 'withdrawn';
  renderError: string | null;
  issuedAt: string | null;
  personSigns: boolean;
  acceptedAt: string | null;
  signature: { status: 'open' | 'signed' | 'declined' | 'cancelled'; signedAt: string | null } | null;
  supersededById: string | null;
}

export interface PortalMe {
  company: string;
  employer: string;
  name: string;
  joiningOn: string;
  location: string;
  designation: string | null;
  manager: string | null;
  completion: number;
  sections: Record<SectionKey, 'done' | 'to_do'>;
  answers: PortalAnswers;
  steppedUp: boolean;
  documents: { typeKey: string; name: string; status: string; rejectReason: string | null; personUploads: boolean }[];
  bgv: { notice: string; items: string[]; consented: boolean; consentedAt: string | null } | null;
  letters: Letter[];
  esignAccepted: boolean;
}

export interface JoinerForms {
  id: string;
  status: 'invited' | 'joined' | 'cancelled';
  outcome: string | null;
  completion: number;
  sections: Record<SectionKey, 'done' | 'to_do'>;
  answers: PortalAnswers;
  identityAttested: boolean;
  bgv: {
    requested: boolean;
    consent: { givenAt: string; withdrawnAt: string | null } | null;
    checks: { id: string; checkType: string; status: string; gate: string; note: string | null; resultDocumentId: string | null; version: number }[];
  } | null;
  version: number;
}

export interface LetterTemplate {
  id: string;
  letterType: string;
  name: string;
  legalEntityId: string | null;
  language: string;
  source: 'upload' | 'starter';
  fields: string[];
  requiresApproval: boolean;
  personSigns: boolean;
  companyDsc: boolean;
  version: number;
  status: 'draft' | 'active' | 'retired';
  previewViewed: boolean;
  createdAt: string;
}

export interface LetterTemplates {
  templates: LetterTemplate[];
  starters: { letterType: string; name: string; added: boolean }[];
  fields: { key: string; label: string; personal: boolean; flag: boolean }[];
}

export interface Signatory {
  id: string;
  legalEntityId: string;
  userId: string;
  name: string;
  title: string;
  hasSignatureImage: boolean;
}

export interface ReadyOffer {
  offerId: string;
  name: string;
  email: string;
  phone: string | null;
  startDate: string;
  jobTitle: string;
  personType: 'new' | 'ex_employee' | 'internal';
}
