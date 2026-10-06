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
  registeredAddress: Address | null;
  dataRegion: string;
  isDefault: boolean;
  archivedAt: string | null;
  /** Whether each Confidential identifier is on file; the values are read separately (recorded). */
  statutory: { pan: boolean; tan: boolean; gstin: boolean; cin: boolean };
}

export interface LegalEntityInput {
  name: string;
  shortName: string;
  currency: string;
  fyStartMonth: number;
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
}

export type MasterKind = 'departments' | 'designations' | 'grades' | 'employment-types' | 'cost-centres';

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
