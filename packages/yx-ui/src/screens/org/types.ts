// Settings › Organisation (P01 §8, APX-D 1.2–1.4): the shapes the API returns and accepts.

export type LoadState = 'ready' | 'loading' | 'error' | 'no-access';

/** Structured address (YX-ORG-28): ISO 3166-2 state, ISO 3166-1 country. */
export interface Address {
  lines: string[];
  city: string;
  state: string;
  postalCode: string | null;
  country: string;
}

export interface StateOption {
  code: string;
  name: string;
}

export interface LegalEntity {
  id: string;
  name: string;
  shortName: string;
  country: string;
  currency: string;
  fyStartMonth: number;
  /** Codes made for new people start with this (KF-0001); null or missing means E0001. */
  employeeCodePrefix?: string | null;
  registeredAddress: Address | null;
  dataRegion: string;
  isDefault: boolean;
  archivedAt: string | null;
  /** Whether each Confidential identifier is on file; the values are read separately (recorded). */
  statutory: { pan: boolean; tan: boolean; gstin: boolean; cin: boolean };
  /** The GSTIN itself, only for people who may read this entity's identifiers. */
  gstin?: string;
}

export interface LegalEntityInput {
  name: string;
  shortName: string;
  currency: string;
  fyStartMonth: number;
  employeeCodePrefix: string | null;
  registeredAddress: Address | null;
}

export interface StatutoryIds {
  pan: string | null;
  tan: string | null;
  gstin: string | null;
  cin: string | null;
}

export interface Geofence {
  lat: number;
  lng: number;
  radiusM: number;
}

export interface OrgLocation {
  id: string;
  legalEntityId: string;
  name: string;
  code: string;
  address: Address;
  state: string;
  timezone: string;
  minWageZone: string | null;
  geofence: Geofence | null;
  ipRanges: string[];
  /** HLP-14 answer 132: a registered factory (Time adds the factory leave minimum there). */
  registeredFactory?: boolean;
  /** Answer 151: this location's own attendance.factories_act value in force today (null: none). */
  factoriesActSetting?: string | null;
  archivedAt: string | null;
}

export interface LocationInput {
  legalEntityId: string;
  name: string;
  code?: string;
  address: Address;
  timezone: string;
  minWageZone: string | null;
  geofence: Geofence | null;
  ipRanges: string[];
  registeredFactory: boolean;
}

/** T2-G 2903: 'tags' is the company's person tag list (HR puts tags on a person; rule groups may match them). */
export type MasterKind = 'departments' | 'designations' | 'grades' | 'employment-types' | 'cost-centres' | 'tags';

export const EMPLOYMENT_CATEGORIES = ['permanent', 'probation', 'fixed_term', 'intern', 'apprentice', 'consultant', 'deployed_contractor', 'retired_reemployed'] as const;
export type EmploymentCategory = (typeof EMPLOYMENT_CATEGORIES)[number];

export interface MasterRecord {
  id: string;
  name: string;
  code: string;
  archivedAt: string | null;
  /** Departments, designations, grades, employment types: set = entity-only (YX-ORG-15). */
  ownerLegalEntityId?: string | null;
  /** A shared master limited to these entities; empty = all. */
  appliesToEntities?: string[];
  /** Departments and cost centres. */
  parentId?: string | null;
  isDivision?: boolean;
  jobFamily?: string | null;
  rank?: number;
  category?: EmploymentCategory;
  /** Cost centres. */
  legalEntityId?: string;
}

export type MasterInput = Omit<MasterRecord, 'id' | 'archivedAt' | 'code'> & { code?: string };

export type MasterLists = Record<MasterKind, MasterRecord[]>;

/** A grade's pay range (pay data, founder rule R1). Amounts as decimal strings. */
export interface PayRange {
  id: string;
  gradeId: string;
  legalEntityId: string;
  currency: string;
  min: string;
  mid: string;
  max: string;
  validFrom: string;
  validTo: string | null;
}

export interface PayRangeInput {
  legalEntityId: string;
  currency: string;
  min: number;
  mid: number;
  max: number;
  validFrom: string;
}

export type PayAmounts = Pick<PayRangeInput, 'min' | 'mid' | 'max'>;

/** A company-wide rule and where its value comes from (YX-ORG-12). */
export interface CompanyRule<V extends string> {
  value: V;
  source: 'default' | 'company';
}

export interface CompanyRules {
  employeeCodeScope: CompanyRule<'legal_entity' | 'tenant'>;
  defaultOwnership: CompanyRule<'shared' | 'entity_only'>;
}

/* ---------- scoped settings (P01 §4.6; YX-ORG-12/18) ---------- */

/** Most specific first; pay groups arrive with payroll. */
export type SettingScope = 'employee' | 'designation' | 'grade' | 'employment_type' | 'department' | 'location' | 'pay_group' | 'legal_entity' | 'tenant';

/** One registered key, as GET /org/settings returns it. */
export interface SettingDef {
  label: string;
  scopes: SettingScope[];
  /** Dated keys carry the date they apply from; values in force cannot change (YX-HIS-07). */
  dated: boolean;
  values: string[];
  /** The YukthiX starter value (D17). */
  default: string;
  /** A second key needed to change it (access and fraud guards). */
  guard?: string;
  /** The value is a comma list of any of `values` (none: empty), e.g. which fields are required. */
  multi?: true;
  /** The value is short text HR writes (one thing a line), up to this many characters; `values` is empty. */
  text?: { maxLength: number };
  /** Labels of the values when the list is the platform's (HLP-14: the industries). */
  labels?: Record<string, string>;
}

export interface SettingOverride {
  id: string;
  key: string;
  scopeType: SettingScope;
  /** The company id for scope 'tenant'. */
  scopeId: string;
  value: unknown;
  /** YYYY-MM-DD, dated keys only. */
  validFrom: string | null;
  /** Answer 151: a location's Factories Act value is no longer needed (the location is a registered factory). */
  noLongerNeeded?: 'registered_factory';
}

export interface SettingInput {
  key: string;
  scopeType: SettingScope;
  scopeId?: string;
  value: string;
  validFrom?: string;
}

/** The records each scope can name, by scope. */
export type SettingScopeChoices = Partial<Record<SettingScope, { value: string; label: string }[]>>;

/** GET people/privacy-erasure: what the nightly Special data erasure would delete today and from whom, and its last run (counts only). */
export interface ErasureCounts {
  people: number;
  aadhaar: number;
  documents: number;
  backgroundChecks: number;
  /** Disability declarations whose details and certificate go (the yes/no answer stays). */
  disability: number;
}
/** One person in the dry run: never a value, only who. */
export interface ErasurePerson {
  name: string;
  /** Null for an offer that never joined. */
  employeeCode: string | null;
  /** YYYY-MM-DD: the last day, or the day the joining was cancelled. */
  day: string;
  neverJoined: boolean;
}
export interface ErasureReport {
  enabled: boolean;
  due: ErasureCounts;
  who: ErasurePerson[];
  lastRun: (ErasureCounts & { at: string; failed: number }) | null;
}
