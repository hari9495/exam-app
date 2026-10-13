// Batch 5h (PAY-8.01 … 8.04): what the consultants API returns.

export type ConsultantSection = '194C' | '194J_A' | '194J_B';

/** GET payroll/consultants: the register, PAN and bank masked. */
export interface ConsultantRow {
  id: string;
  legalEntityId: string;
  name: string;
  kind: 'individual' | 'firm';
  email: string;
  pan: string | null;
  panStatus: 'operative' | 'inoperative' | 'missing';
  gstin: string | null;
  defaultSection: ConsultantSection;
  bank: { holder: string | null; ifsc: string | null; account: string; verified: boolean; verifiedRef: string | null; usableFrom: string | null; usable: boolean } | null;
  status: 'active' | 'inactive';
  version: number;
  changedByMe?: boolean;
}

export interface ConsultantInput {
  legalEntityId: string;
  name: string;
  kind: 'individual' | 'firm';
  email: string;
  pan?: string;
  gstin?: string;
  defaultSection: ConsultantSection;
  bank?: { holder: string; ifsc: string; account: string };
}

export interface Certificate197Input {
  certificateNo: string;
  section: ConsultantSection;
  rate: string;
  validFrom: string;
  validTo: string;
  limit: string;
}

export type ConsultantInvoiceStatus = 'submitted' | 'approved' | 'rejected' | 'queued' | 'sent' | 'paid' | 'failed';

/** GET payroll/consultant-invoices (and the consultant's own list). */
export interface ConsultantInvoice {
  id: string;
  consultantId: string;
  consultant: string | null;
  invoiceNo: string;
  invoiceDate: string;
  period: string;
  section: ConsultantSection;
  taxableValue: string;
  gst: string;
  total: string;
  uploadedVia: 'staff' | 'consultant';
  hasFile: boolean;
  status: ConsultantInvoiceStatus;
  tds: { amount: string; base: string; rate: string | null; reason: string | null; certificateUsed: string } | null;
  netPayable: string | null;
  paidOn: string | null;
  paymentRef: string | null;
  paymentReason: string | null;
}

export interface InvoiceInput {
  invoiceNo: string;
  invoiceDate: string;
  period: string;
  taxableValue: string;
  cgst?: string;
  sgst?: string;
  igst?: string;
  section?: ConsultantSection;
}

/** GET payroll/consultant-payouts. */
export interface ConsultantBatch {
  id: string;
  fileName: string;
  rows: number;
  total: string;
  sha256: string;
  status: 'draft' | 'released' | 'confirmed' | 'cancelled';
  madeByMe: boolean;
  releasePhrase: string;
  createdAt: string;
}

/** GET payroll/consultant-returns: Form 140 (26Q before April 2026). */
export interface NonSalaryReturn {
  id: string;
  formCode: '26Q' | '140';
  taxYear: string;
  quarter: number;
  status: 'draft' | 'reconciled' | 'validated' | 'filed';
  tokenNo: string | null;
  reconciliation: { ok: boolean; lines: { month: string; section: string; deducted: string; deposited: string; difference: string }[] } | null;
  fileId: string | null;
  rows: number;
  tds: string;
}

/** GET public/consultant/:org/me. */
export interface ConsultantMe {
  me: { id: string; name: string; company: string; pan: string | null; panStatus: string; bank: { account: string; usable: boolean } | null };
  canUpload: boolean;
  invoices: ConsultantInvoice[];
  certificates: { id: string; taxYear: string; quarter: number; form: string }[];
}
