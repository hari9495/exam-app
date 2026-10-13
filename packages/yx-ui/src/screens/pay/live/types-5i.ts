// Batch 5i (PAY-9.01 … 9.12): what the special pay, EWA, equity, actuarial and country-pack APIs return.

export type SpecialKind = 'piece' | 'incentive' | 'tips' | 'oncall' | 'union' | 'settle' | 'layoff' | 'vrs';

export interface PostingLine {
  employeeId: string;
  componentCode: string;
  amount: string;
  label: string;
}

/** GET payroll/special/postings. */
export interface SpecialPosting {
  id: string;
  kind: SpecialKind;
  month: string;
  sourceRef: string;
  lines: PostingLine[];
  total: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  madeByMe: boolean;
  createdAt: string;
}

export interface RateCard {
  id: string;
  operationCode: string;
  name: string;
  unit: string;
  rate: string;
  validFrom: string;
  validTo: string | null;
}

export interface IncentivePlanView {
  id: string;
  name: string;
  kind: 'production' | 'attendance' | 'sales';
  metric: string;
  targetAmount: string;
  tiers: { from: number; multiplier: number }[];
  capPercent: string | null;
  clawbackDays: number;
  status: string;
}

export interface UnionsView {
  unions: { id: string; name: string; registrationNo: string | null; members: number }[];
  authorisations: { id: string; unionId: string; employeeId: string; duesKind: 'fixed' | 'percent'; duesValue: string; validFrom: string; revokedOn: string | null }[];
  settlements: { id: string; unionId: string | null; title: string; effectiveFrom: string; signedOn: string; rates: { category: string; monthlyIncrease: string }[] }[];
}

export interface OncallRuleView {
  id: string;
  name: string;
  standbyAmount: string;
  calloutMinHours: string;
  calloutRate: string;
  multiplier: string;
}

/** GET payroll/special/me/incentives. */
export interface MyIncentives {
  results: { id: string; plan: string | null; month: string; quota: string; actual: string; amount: string; sentToPayroll: boolean; workings: { attainment?: string } | null }[];
  clawbacks: { id: string; month: string; amount: string; reason: string }[];
}

// ------------------------------------------------------------------------------------------ EWA

export interface EwaPolicyView {
  id: string;
  validFrom: string;
  enabled: boolean;
  percentAvailable: string;
  minAmount: string;
  maxAmount: string;
  drawsPerMonth: number;
  blackoutDays: number;
  fee: string;
  feePayer: 'employee' | 'employer';
}

export interface EwaDrawView {
  id: string;
  employeeId: string;
  month: string;
  available: string;
  amount: string;
  fee: string;
  feePayer: 'employee' | 'employer';
  status: 'requested' | 'paid' | 'failed' | 'cancelled';
  paidRef: string | null;
  failureReason: string | null;
  createdAt: string;
}

/** GET payroll/me/ewa. */
export interface MyEwa {
  open: boolean;
  reasons: string[];
  policy: { minAmount: string; maxAmount: string; fee: string; feePayer: 'employee' | 'employer'; drawsPerMonth: number } | null;
  quote: { expectedNet: string; payableDays: string; monthDays: number; drawn: string; deductionsDue: string; earned: string; available: string } | null;
  draws: EwaDrawView[];
}

// ------------------------------------------------------------------------------------------ equity

export interface GrantView {
  id: string;
  planId: string;
  employeeId: string;
  grantedOn: string;
  units: number;
  exercisePrice: string;
  status: string;
  vested: number;
  unvested: number;
  lapsed: number;
  exercised: number;
  exercisable: number;
  events: { id: string; vestOn: string; units: number; kind: 'time' | 'milestone'; milestone: string | null; state: 'vested' | 'lapsed' | 'scheduled' }[];
  exercises: { id: string; exercisedOn: string; units: number; pricePayable: string; fmv: string | null; perquisite: string | null; status: string; paymentRef: string | null }[];
  plan?: { name: string; kind: string; exitWindowDays: number } | null;
  madeByMe?: boolean;
}

/** GET payroll/equity. */
export interface EquityOverview {
  plans: { id: string; name: string; kind: string; poolUnits: number; granted: number; available: number; exitWindowDays: number; status: string }[];
  valuations: { id: string; valuedOn: string; fmv: string; basis: string }[];
  grants: GrantView[];
}

// ------------------------------------------------------------------------------------------ actuarial and country packs

export interface ActuarialView {
  censuses: { id: string; asOf: string; standard: string; rows: number; fileId: string; createdAt: string }[];
  valuations: { id: string; valuedOn: string; standard: string; kind: 'gratuity' | 'leave'; opening: string; closing: string; delta: string; journal: { account: string; debit?: string; credit?: string }[]; status: 'recorded' | 'posted'; madeByMe: boolean }[];
}

/** GET payroll/country-packs. */
export interface PackStatus {
  country: string;
  needed: boolean;
  switchedOn: boolean;
  manifest: { version: string; currency: string; requires: string[]; settings: { key: string; label: string; pattern: string }[] } | null;
  missing: string[];
  settings: Record<string, string>;
}

/** GET payroll/1099-nec. */
export interface NecSummary {
  year: number;
  threshold: string;
  rows: { consultantId: string; name: string; paid: string; due: boolean; w9: boolean; tin: string | null }[];
}
