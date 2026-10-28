// Roles & access, the record by sensitivity class, identity / bank changes and "who accessed my data"
// (P02 §4.2–4.6, §7): the shapes the API returns and accepts.
export type { LoadState } from '../org/types';

export type ScopeType = 'tenant' | 'legal_entity' | 'location' | 'department_subtree' | 'all_reports' | 'direct_reports' | 'one_report';

export interface Choice {
  value: string;
  label: string;
}

/** A company role (permission profile). */
export interface AccessRole {
  id: string;
  name: string;
  permissions: string[];
  /** Opens Confidential or Special data: a grant waits for a second admin. */
  confidential: boolean;
  /** Keys that work only for the whole company. */
  companyWideOnly: string[];
  grants: number;
  assignedUsers: number;
}

export interface RoleTemplate {
  key: string;
  name: string;
  typicalScope: ScopeType;
  summary: string;
  cannot: string;
  permissions: string[];
  confidential: boolean;
}

export interface AccessUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  employeeId: string | null;
}

export type GrantStatus = 'pending' | 'active' | 'rejected' | 'revoked';

export interface Grant {
  id: string;
  userId: string;
  userName: string | null;
  role: { id: string; name: string | null; confidential: boolean };
  scope: { type: ScopeType; id: string | null; name: string | null };
  validFrom: string;
  validTo: string | null;
  /** When an admin ended it early (ISO time); the When column shows it as the end date. */
  revokedAt?: string | null;
  status: GrantStatus;
  reason: string;
  grantedBy: string | null;
  grantedById: string | null;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface EffectiveAccess {
  userId: string;
  hasEmployeeRecord: boolean;
  keys: { key: string; label: string; people: number; scopes: { type: ScopeType; id: string | null }[] }[];
}

export interface GrantInput {
  userId: string;
  permissionProfileId: string;
  scopeType: ScopeType;
  scopeId?: string;
  validFrom?: string;
  validTo?: string;
  reason: string;
  confirmRisk?: boolean;
}

/** Records a scope can name. */
export interface ScopeChoices {
  entities: Choice[];
  locations: Choice[];
  departments: Choice[];
}

// ---- the record by class ----

export interface PersonalDetails {
  dateOfBirth: string | null;
  gender: string | null;
  personalEmail: string | null;
  personalPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateCode: string | null;
  postalCode: string | null;
  country: string | null;
  hideBirthday: boolean;
  maritalStatus?: string | null;
}

export type RevealField = 'pan' | 'aadhaar' | 'uan' | 'esic' | 'passport' | 'bank_salary' | 'bank_reimbursement';
export type RequestKind = 'bank_salary' | 'bank_reimbursement' | 'pan' | 'aadhaar' | 'uan' | 'esic' | 'legal_name' | 'passport' | 'bank_international';

export interface IdentityView {
  legalName: string | null;
  pan: string | null;
  aadhaar: string | null;
  uan: string | null;
  esic: string | null;
  passport?: string | null;
  passportExpiresOn?: string | null;
  bankAccounts: { purpose: 'salary' | 'reimbursement'; holderName: string; ifsc: string; account: string | null; usableFrom: string }[];
  /** PPL-46: the salary account abroad (IBAN masked). */
  internationalAccount?: { country: string; iban: string; bic: string; currency: string; usableFrom: string } | null;
  pending: { requestId: string; kind: RequestKind }[];
}

export interface ProfileView {
  employeeId: string;
  name: string;
  self: boolean;
  employeeCode: string | null;
  joinedOn: string | null;
  classes: { internal: boolean; personal: boolean; identity: boolean; aadhaar: boolean; pay: boolean };
  personal: PersonalDetails | null;
  identity: IdentityView | null;
  /** Internal class: the work phone. */
  work?: { phone: string | null; email?: string | null } | null;
  /** Internal: the birthday as MM-DD (null when hidden or unknown). */
  birthday?: string | null;
  personId?: string;
  /** PPL-03 family, nominations and emergency contacts (Personal class; null without it). */
  family?: FamilyView | null;
  can: { editPersonal: boolean; requestChange: boolean; reveal: boolean; editWork?: boolean; editFamily?: boolean };
}

export interface FamilyView {
  members: { id: string; name: string; relation: string; dateOfBirth: string | null; dependant: boolean }[];
  nominations: { scheme: string; familyMemberId: string | null; name: string; relation: string; sharePercent: number }[];
  /** Schemes the person should name a nominee for. */
  expectedSchemes: string[];
  contacts: { name: string; relation: string; phone: string }[];
  maritalChangedAt: string | null;
  nominationsReviewedAt: string | null;
}

export interface ProfileRequestInput {
  kind: RequestKind;
  value: Partial<Record<'pan' | 'aadhaar' | 'uan' | 'esic' | 'legalName' | 'holderName' | 'accountNumber' | 'ifsc' | 'passport' | 'passportExpiresOn', string>>;
  reason?: string;
  /** PPL-32: the proof on the person's record, and the day a new legal name took effect. */
  proofDocumentId?: string;
  effectiveOn?: string;
}

/** PPL-32: my Change identity or bank details page (GET /people/me/change-form). */
export interface ChangeForm {
  employeeId: string;
  personId: string;
  proofRequired: boolean;
  /** The document type that proves each kind (none for UAN and ESIC). */
  proofTypes: Partial<Record<RequestKind, string>>;
  coolingHours: number;
  /** What is on file now, masked; null when nothing is. */
  current: Record<RequestKind, Record<string, string | null> | null>;
}

export interface ProfileRequest {
  id: string;
  employeeId: string;
  employeeName: string | null;
  kind: RequestKind;
  label: string;
  proposed: Record<string, string | null>;
  current: Record<string, string | null> | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requestedBy: string | null;
  requestedAt: string;
  mine: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  overrideReason: string | null;
  proofDocumentId: string | null;
  effectiveOn: string | null;
  /** An approved bank account: when pay starts going to it (after the cooling period). */
  usableFrom: string | null;
}

export interface AccessLog {
  enabled: boolean;
  /** The company's name, for the Privacy page heading (PPL-33). */
  company: string;
  /** role: who they are to me ("Your manager", their designation); context: where they saw it. */
  entries: { id: string; at: string; who: string; role: string | null; what: string; context: string; className: 'confidential' | 'special' }[];
}
