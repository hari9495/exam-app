// What the expenses batch-E1 API returns (apps/api/src/expenses). The screens stay presentational; the API checks
// every call (M05-BUILD-DESIGN §18 "Setup").

export type { LoadState } from '../../org/types';

export type CategoryKind = 'spend' | 'mileage' | 'per_diem' | 'company_paid_only';
export type Taxable = 'never' | 'always' | 'above_limit';
export type OverLimit = 'justify_and_approve' | 'block';

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  /** The reader's own-language name when the company translated it (G1). */
  shownName?: string;
  kind: CategoryKind;
  receiptAbove: string | null;
  gstEligible: boolean;
  itcBlockedReason: string | null;
  taxable: Taxable;
  ledgerCode: string | null;
  active: boolean;
  version: number;
}

export interface CityTier {
  id: string;
  name: string;
  rank: number;
  country: string | null;
  cities: string[];
  active: boolean;
  version: number;
}

export interface PolicyRule {
  categoryCode: string;
  tierId: string | null;
  perLine: string | null;
  perDay: string | null;
  perTrip: string | null;
  perMonth: string | null;
  overLimit: OverLimit;
}

/** A P19 condition group as the API stores it. */
export interface ServerGroup {
  id: string;
  join: 'and' | 'or';
  items: unknown[];
}

export interface ExpensePolicy {
  id: string;
  name: string;
  appliesIf: ServerGroup | null;
  priority: number;
  validFrom: string;
  validTo: string | null;
  status: 'active' | 'retired';
  version: number;
  rules: PolicyRule[];
}

export interface AppliesField {
  key: string;
  label: string;
  type: 'choice';
  options: { value: string; label: string }[];
}

export interface Policies {
  policies: ExpensePolicy[];
  fields: AppliesField[];
  today: string;
}

export interface MileageRate {
  id: string;
  vehicle: string;
  ratePerKm: string;
  currency: string;
  monthlyKmCap: number | null;
  validFrom: string;
  validTo: string | null;
}

export interface PerDiemRate {
  id: string;
  tierId: string | null;
  country: string | null;
  ratePerDay: string;
  currency: string;
  partialDayRule: 'full' | 'half_after_hours';
  validFrom: string;
  validTo: string | null;
}

export interface Rates {
  mileage: MileageRate[];
  perDiem: PerDiemRate[];
}

export interface GstRegistration {
  id: string;
  legalEntityId: string;
  state: string;
  gstin: string;
  validFrom: string;
  validTo: string | null;
}

export interface SetupCheck {
  ready: boolean;
  problems: { key: string; text: string; count?: number }[];
}

export interface Choice {
  value: string;
  label: string;
}

/** What a policy save sends: in place (not in force yet) or a new version from a date (already in force). */
export type PolicySave = { mode: 'update'; policy: ExpensePolicy } | { mode: 'version'; policy: ExpensePolicy; from: string } | { mode: 'create'; policy: Omit<ExpensePolicy, 'id' | 'version'> };
