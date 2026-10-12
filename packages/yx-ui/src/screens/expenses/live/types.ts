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

// ------------------------------------------------------------------------------------------ batch E2: claims

export type ClaimStatus = 'draft' | 'submitted' | 'sent_back' | 'approved' | 'partly_approved' | 'rejected' | 'withdrawn';
export type PaymentStatus = 'not_due' | 'approved_unpaid' | 'in_payroll' | 'payout_queued' | 'paid' | 'payment_failed';

export interface ClaimSummary {
  id: string;
  title: string;
  person: string;
  currency: string;
  status: ClaimStatus;
  paymentStatus: PaymentStatus;
  claimedTotal: string;
  approvedTotal: string | null;
  advanceAdjusted: string;
  /** YX-EXP-06: the headline figure. */
  netPayable: string;
  risk: 'none' | 'low' | 'high';
  submittedAt: string | null;
  decidedAt: string | null;
  version: number;
}

export interface ExpenseHome {
  claims: ClaimSummary[];
  waitingForMe: number;
  toReview: number | null;
  toReceive: string;
}

export interface Suggested {
  value: string;
  confidence: number;
}

export interface ClaimLine {
  id: string;
  lineNo: number;
  categoryCode: string;
  spentOn: string;
  merchant: string | null;
  city: string | null;
  country: string;
  tierId: string | null;
  payMode: 'personal' | 'company_card' | 'company_paid';
  description: string | null;
  hasReceipt: boolean;
  selfDeclared: boolean;
  claimed: string;
  approved: string | null;
  reduceReason: string | null;
  justification: string | null;
  policy: { outcome: 'ok' | 'over_justify' | 'blocked' | 'not_allowed'; overBy: string; limit: { kind: string; amount: string } | null; receipt: 'required' | 'declaration' | 'none'; policy: string | null; reason?: string } | null;
  flags: string[];
  mileage: { vehicle: string; km: number; from: string | null; to: string | null; ratePerKm: string } | null;
  perDiem: { fullDays: number; partialDays: number; meals: Record<string, number>; ratePerDay: string } | null;
  ocr: { adapter: string | null; fields: Partial<Record<'amount' | 'date' | 'merchant' | 'gstin' | 'invoiceNo' | 'taxableValue' | 'cgst' | 'sgst' | 'igst', Suggested>>; lowConfidence: string[]; confirmed: boolean; einvoice: string | null } | null;
  gst: { supplierGstin: string | null; invoiceNo: string | null; invoiceDate: string | null; placeOfSupply: string | null; taxableValue: string | null; cgst: string | null; sgst: string | null; igst: string | null; cess: string | null; billedToGstin: string | null; itcStatus: string | null; einvoiceVerified: boolean } | null;
  /** E5: a bill in another currency, and how it became the pay-currency amount. */
  fx?: { currency: string; amount: string | null; rate: string; source: string | null; rateDate: string | null; variancePct: string | null; hasProof: boolean } | null;
  /** E5: 'field_day' lines are drafts from a field-force duty day, paid only once confirmed. */
  origin?: 'employee' | 'field_day';
  confirmed?: boolean;
  version: number;
}

export interface ClaimFlag {
  id: string;
  lineId: string | null;
  kind: string;
  detail: string;
  status: 'open' | 'cleared' | 'confirmed';
  note: string | null;
}

export interface ClaimDetail extends ClaimSummary {
  decisionNote: string | null;
  lines: ClaimLine[];
  changes: { lineId: string; from: string; to: string; reason: string; at: string }[];
  flags: ClaimFlag[];
  route: { status: string; currentStep: number; steps: { name: string; state: string }[] } | null;
  can: { edit: boolean; withdraw: boolean; decide: boolean; changeAmounts: boolean; review: boolean };
}

/** What a line save sends (the API works out mileage and per diem). */
export interface LineInput {
  categoryCode: string;
  spentOn: string;
  merchant: string | null;
  city: string | null;
  payMode: 'personal' | 'company_card' | 'company_paid';
  description: string | null;
  amount?: string;
  selfDeclared?: boolean;
  justification: string | null;
  mileage?: { vehicle: string; km: number; from?: string; to?: string };
  perDiem?: { fullDays: number; partialDays: number; meals?: { breakfast?: number; lunch?: number; dinner?: number } };
  gst?: { supplierGstin: string | null; invoiceNo: string | null; taxableValue: string | null; cgst: string | null; sgst: string | null; igst: string | null; billedToGstin: string | null };
  fx?: { currency: string; amount: string; rate?: string };
  version?: number;
}

// ------------------------------------------------------------------------------------------ E4: trips and advances

export type TripStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'closed';
export type AdvanceStatus = 'requested' | 'approved' | 'rejected' | 'paid' | 'settled' | 'to_fnf' | 'cancelled';
export type TravelMode = 'air' | 'rail' | 'road' | 'other';
export type Route = { status: string; currentStep: number; steps: { name: string; state: string }[] } | null;

export interface TripSummary {
  id: string;
  purpose: string;
  person: string;
  fromOn: string;
  toOn: string;
  currency: string;
  estimate: string;
  advanceRequested: string;
  advanceCurrency?: string;
  bookingNeeded: boolean;
  status: TripStatus;
  version: number;
}

export interface AdvanceSummary {
  id: string;
  kind: 'trip' | 'imprest';
  tripId: string | null;
  purpose: string;
  currency: string;
  requested: string;
  amount: string | null;
  /** E5: a forex advance's loading rate (pay currency per unit). */
  fxRate?: string | null;
  changeReason: string | null;
  status: AdvanceStatus;
  paidOn: string | null;
  settleBy: string | null;
  balance: string;
  overdue: boolean;
  version: number;
  person?: string;
}

export interface TripDetail extends TripSummary {
  decisionNote: string | null;
  closedAt?: string | null;
  closeReason?: string | null;
  legs: { seq: number; fromCity: string; toCity: string; country: string; departOn: string; mode: TravelMode; stayNights: number }[];
  bookings: { id: string; kind: string; title: string; amount: string; paidBy: 'company' | 'employee'; provider: string | null; providerRef: string | null; hasFile: boolean }[];
  /** Hidden from the travel desk (it books; it does not see the money). */
  budget: { estimate: string; companyPaid: string; claimed: string; used: string; left: string } | null;
  claims: { id: string; title: string; status: ClaimStatus; claimedTotal: string; approvedTotal: string | null; advanceAdjusted: string }[];
  advance: AdvanceSummary | null;
  route: Route;
  can: { edit: boolean; submit: boolean; cancel: boolean; book: boolean; partner: boolean; decide: string | null; claim: boolean; close?: boolean };
}

export interface TripInput {
  purpose: string;
  fromOn: string;
  toOn: string;
  estimate: string;
  advanceRequested: string;
  advanceCurrency?: string;
  bookingNeeded: boolean;
  legs: { fromCity: string; toCity: string; departOn: string; mode: TravelMode; stayNights: number }[];
}

export interface BookingInput {
  kind: 'ticket' | 'hotel' | 'cab' | 'visa' | 'other';
  title: string;
  amount: string;
  paidBy: 'company' | 'employee';
  file: File | null;
}

export interface AdvanceDetail extends AdvanceSummary {
  person: string;
  payCurrency?: string;
  ledger: { id: string; on: string; kind: string; text: string; amount: string; amountPay?: string; claimId: string | null }[];
  can: { changeAmount: boolean; decide: string | null; pay: boolean; recordReturn: boolean; claim: boolean };
}

// ------------------------------------------------------------------------------------------ E5: rates and reports

export interface FxRateRow {
  id: string;
  source: 'company' | 'fbil' | 'ecb';
  base: string;
  quote: string;
  rateDate: string;
  rate: string;
}

export type ReportKind = 'summary' | 'unpaid' | 'advance-ageing' | 'over-limit' | 'gst-input' | 'approver-patterns';

export interface ExpenseReport {
  kind: ReportKind;
  from: string;
  to: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
}
