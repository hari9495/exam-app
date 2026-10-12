// Payroll operations screens (PAY-10.09 … 10.16): what the payroll, tax and statutory APIs return for payments, loans,
// payslip queries, tax declarations and proof checking, registers, advisories and year-end certificates.

/** GET payroll/runs/:id/disbursements: the people paid by cash or cheque, and any already recorded. */
export interface Disbursement {
  payslipId: string;
  employeeId: string;
  mode: 'bank' | 'cash' | 'cheque';
  net: string;
  held: boolean;
  paymentStatus: string;
  chequeNo: string | null;
  paidOn: string | null;
  acknowledgement: string | null;
}

export interface PaymentResultRow {
  payslipId: string;
  status: 'paid' | 'failed' | 'returned';
  bankReference?: string;
  reason?: string;
}

export interface DisbursementInput {
  payslipId: string;
  mode: 'cash' | 'cheque';
  chequeNo?: string;
  paidOn: string;
  acknowledgement?: string;
}

/** GET payroll/payment-modes. */
export interface PaymentModeRow {
  id: string;
  employeeId: string;
  mode: 'bank' | 'cash' | 'cheque';
  validFrom: string;
  reason: string;
  status: string;
  requestId: string | null;
}

/** GET payroll/loans. */
export interface LoanView {
  id: string;
  employeeId: string;
  loanType: 'advance' | 'loan';
  principal: string;
  emi: string;
  outstanding: string;
  firstMonth: string;
  status: string;
  pausedUntil: string | null;
  mine: boolean;
}

export interface LoanRequestInput {
  employeeId?: string;
  loanType: 'advance' | 'loan';
  principal: string;
  instalments: number;
  interestRate?: string;
  firstMonth: string;
  reason: string;
}

export interface LoanChangeInput {
  kind: 'pause' | 'preclose' | 'reschedule';
  pauseUntil?: string;
  emi?: string;
  reason: string;
}

/** GET payroll/queries. */
export interface PayslipQueryView {
  id: string;
  payslipId: string;
  employeeId: string;
  lineCode: string | null;
  text: string;
  status: 'open' | 'answered' | 'closed';
  assigneeUserId: string | null;
  replies: { by: string; byName: string; side: 'employee' | 'payroll'; at: string; text: string }[] | null;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
}

/** A declaration line (GET tax/me/declarations and the proof queue). */
export interface DeclarationLine {
  id: string;
  subjectKey: string;
  amount: string;
  landlordName: string | null;
  landlordPan: string | null;
  rentFrom: string | null;
  rentTo: string | null;
  metro: boolean | null;
  proofStatus: string;
  approvedAmount: string | null;
  comment: string | null;
  proofs: { n: number; name: string; size: number; at: string }[];
  section?: string | null;
}

/** GET tax/me/declarations. */
export interface MyDeclarations {
  taxYear: string;
  form: string;
  proofCutoff: string;
  subjects: { key: string; section: string | null }[];
  lines: DeclarationLine[];
}

export interface DeclarationInput {
  subjectKey: string;
  amount: string;
  landlordName?: string;
  landlordPan?: string;
  rentFrom?: string;
  rentTo?: string;
  metro?: boolean;
}

/** GET tax/proofs. */
export interface ProofQueueLine extends DeclarationLine {
  workspaceId: string;
  employeeId: string;
  employeeName: string;
}

export interface ProofDecision {
  decision: 'approve' | 'partly' | 'reject';
  amount?: string;
  comment?: string;
}

/** GET tax/me/certificates. */
export interface MyCertificate {
  id: string;
  taxYear: string;
  form: string;
  payDocumentId: string | null;
}

/** GET tax/certificates. */
export interface CertificateRow {
  id: string;
  employeeId: string;
  taxYear: string;
  form: string;
  partA: boolean;
  issued: boolean;
}

/** POST statutory/tds-returns/part-a. */
export interface PartAImport {
  files: number;
  matched: number;
  unmatched: string[];
}

/** GET statutory/registers. */
export interface RegisterRow {
  id: string;
  registerType: string;
  month: string;
  locationId: string | null;
  formatVersion: string;
  version: number;
  status: 'generated' | 'frozen' | 'signed' | string;
  reason: string | null;
  rows: number;
  sha256: string;
  signatureRef: string | null;
  frozenAt: string | null;
  signedAt: string | null;
}

/** GET statutory/advisories. */
export interface AdvisoryView {
  code: string;
  jurisdiction: string;
  version: number;
  title: string;
  summary: string;
  action: string;
  link: string | null;
  effectiveFrom: string;
  verify: boolean;
  reviewed: { at: string; note: string } | null;
}
