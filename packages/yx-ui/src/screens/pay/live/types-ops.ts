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
  loanType: 'advance' | 'loan' | 'expense';
  principal: string;
  /** The company's yearly rate, kept on the loan when it was asked for (founder answer 1). */
  interestRate?: string;
  emi: string;
  outstanding: string;
  firstMonth: string;
  status: string;
  pausedUntil: string | null;
  mine: boolean;
}

/** GET payroll/loans/:id/repayments (founder answer 5): month by month, and what a pre-closure today comes to. */
export interface LoanRepayments {
  loanId: string;
  interestRate: string;
  recovered: string;
  rows: { no: number; month: string; emi: string; interest: string; principal: string; balance: string; status: 'recovered' | 'paused' | 'scheduled' }[];
  closing: { on: string; interestFrom: string; days: number; principal: string; interest: string; total: string } | null;
}

/** The interest rate is the company's per loan type (founder answer 1); a request never carries one. */
export interface LoanRequestInput {
  employeeId?: string;
  loanType: 'advance' | 'loan';
  principal: string;
  instalments: number;
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
  /** Proofs are sent from this day to the cut-off. */
  proofWindowOpens: string;
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

/** GET statutory/registers/:kind/rows (CMP-03). */
export type RegisterKindKey = 'epf' | 'esic' | 'pt' | 'lwf';
export interface RegisterPersonRow {
  employeeId: string;
  name: string;
  code: string;
  location: string | null;
  state: string | null;
  uanLast4: string | null;
  ipLast4: string | null;
  gross: string;
  pfWage: string | null;
  employee: string;
  employer: string;
  eps: string | null;
  epfEmployer: string | null;
  coverage: 'covered' | 'not_covered' | 'not_due';
  reason: string | null;
}
export interface RegisterRowsView {
  kind: RegisterKindKey;
  month: string;
  rows: RegisterPersonRow[];
  trend: { month: string; employee: string; employer: string }[];
}

/** GET statutory/form16-status (CMP-06). */
export interface Form16Linked {
  returnId: string;
  formCode: string;
  taxYear: string;
  quarter: number;
  status: string;
  kind: string;
  tokenNo: string | null;
}
export interface Form16Status {
  taxYear: string;
  link: (Form16Linked & { version: number; problem: string | null }) | null;
  q4: Form16Linked | null;
  /** The Q4 return's due date; certificates can be made after it is filed. */
  availableAfter: string | null;
}

/** GET statutory/advisories/task-desks (CMP-08). */
export interface TaskDesk {
  id: string;
  name: string;
}
