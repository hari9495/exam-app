// Batch 5j (M03 §15, PAY-10.01 … 10.04): what the payroll API returns to the run, input, employee and compliance screens.

export type RunStatus = 'draft' | 'calculating' | 'calculated' | 'in_review' | 'submitted' | 'approved' | 'reopened' | 'paid' | 'void';
export type OffcycleKind = 'bonus' | 'arrears' | 'correction' | 'payment' | 'fnf';

export interface PayRun {
  id: string;
  legalEntityId: string;
  payGroupId: string;
  month: string;
  runType: 'regular' | 'offcycle';
  offcycleKind: OffcycleKind | null;
  status: RunStatus;
  calcVersion: number;
  totals: { people: number; gross: string; deductions: string; net: string; employerCost: string; failed: number; skipped: number } | null;
  approvedAt: string | null;
  publishedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  /** Only on the single run. */
  entityName?: string;
  preparedByMe?: boolean;
  approval?: { canDecide: boolean; phrase: string; step: number; steps: number } | null;
  /** PAY-9.01: a weekly or fortnightly group's run pays one period of the month. */
  subPeriod?: number | null;
  range?: { from: string; to: string } | null;
}

export interface PayGroupRef {
  id: string;
  name: string;
  legalEntityId: string;
  frequency?: 'monthly' | 'weekly' | 'fortnightly';
  anchorDate?: string | null;
}

/** The month's periods of a weekly or fortnightly group (the API's calendar: from the anchor, cut at month ends). */
export function periodsOf(frequency: 'weekly' | 'fortnightly', anchor: string, month: string): { k: number; from: string; to: string }[] {
  const len = frequency === 'weekly' ? 7 : 14;
  const DAY = 86_400_000;
  const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const first = at(`${month}-01`);
  const [y, m] = month.split('-').map(Number);
  const last = Date.UTC(y, m, 0);
  let start = at(anchor) + Math.floor((first - at(anchor)) / DAY / len) * len * DAY;
  const out: { k: number; from: string; to: string }[] = [];
  for (; start <= last; start += len * DAY) out.push({ k: out.length + 1, from: iso(Math.max(start, first)), to: iso(Math.min(start + (len - 1) * DAY, last)) });
  return out;
}

export interface RunPerson {
  employeeId: string;
  name: string;
  employeeCode: string | null;
}

export interface RunCheck {
  id: string;
  employeeId: string | null;
  checkKey: string;
  severity: 'block' | 'warn' | 'info';
  blocks: 'calculation' | 'approval';
  waivable: boolean;
  message: string;
  waived: boolean;
  waiverReason: string | null;
}

export interface RunReadiness {
  run: PayRun;
  people: number;
  period: string;
  checks: RunCheck[];
}

export interface RunProgressData {
  status: RunStatus;
  calcVersion: number;
  total: number;
  ok: number;
  failed: number;
  skipped: number;
  queued: number;
  failures: { employeeId: string; field: string | null; message: string }[];
}

export interface RunPayslip {
  id: string;
  runId: string | null;
  employeeId: string;
  month: string;
  status: string;
  gross: string;
  deductions: string;
  net: string;
  employerCost: string;
  verify: boolean;
  held: boolean;
  paymentStatus: string;
}

export interface PayslipLine {
  code: string;
  name: string;
  kind: 'earning' | 'deduction' | 'employer' | 'reimbursement' | 'info';
  amount: string;
  quantity: string | null;
  rate: string | null;
  explanation: string;
  rule: { statute: string; jurisdiction: string; version: string; verify?: boolean } | null;
  verify: boolean;
}

export interface PayslipDetail extends RunPayslip {
  lines: PayslipLine[];
}

export interface RunVariance {
  id: string;
  employeeId: string;
  payslipId: string;
  kind: string;
  size: string | null;
  detail: string;
  acknowledged: boolean;
  note: string | null;
}

export interface BankFileRow {
  id: string;
  fileId: string;
  generationNo: number;
  reason: string | null;
  format: string;
  debitAccount: string;
  rows: number;
  total: string;
  sha256: string;
  status: string;
  madeByMe: boolean;
  releasedAt: string | null;
  releasePhrase: string;
}

export interface BankFileMade {
  id: string;
  fileId: string;
  rows: number;
  total: string;
  excluded: { employeeId: string; reason: string }[];
}

export interface OneTimeItem {
  id: string;
  employeeId: string;
  componentCode: string;
  amount: string;
  month: string;
  endOn: string | null;
  source: string;
  reason: string;
  status: string;
}

export interface PayHold {
  id: string;
  employeeId: string;
  reason: string;
  heldAt?: string;
  releasedAt?: string | null;
}

export interface MyPayslip {
  id: string;
  month: string;
  runType: 'regular' | 'offcycle';
  gross: string;
  deductions: string;
  net: string;
  paymentStatus: string;
  verify: boolean;
}

// ---- compliance (5f, 5g)

export interface HubCard {
  statute: string;
  state: string | null;
  label: string;
  amount: string;
  dueOn: string | null;
  status: string;
  filingId: string | null;
  late: boolean;
  penaltyEstimate: string | null;
  verifyDueDate: boolean;
}

export interface StatutoryHub {
  entityId: string;
  month: string;
  today: string;
  cards: HubCard[];
  tds: { amount: string; dueOn: string | null; challanStatus: string; late: boolean };
}

export interface FilingRow {
  id: string;
  statute: string;
  state: string | null;
  kind: string;
  status: string;
  fileId: string | null;
  rows?: number;
  reference?: string | null;
}

export interface TdsReturnRow {
  id: string;
  formCode: string;
  taxYear: string;
  quarter: number;
  kind: string;
  status: string;
  tokenNo: string | null;
  fileId: string | null;
  rows: number;
  tds: string;
  reconciliation: { difference?: string } | null;
  validation: { validator: string; ok: boolean; errors: string[]; version?: string | null } | null;
}

export interface FnfItem {
  id: string;
  componentCode: string;
  amount: string;
  label: string | null;
  held: string | null;
  inRun: string | null;
  byPayroll: boolean;
}

export interface FnfSettlementView {
  id: string;
  employeeId: string;
  exitType: string;
  lwd: string;
  deadline: string;
  overdue: boolean;
  status: string;
  runId: string | null;
  runStatus: string | null;
  secondRunId: string | null;
  net: string | null;
  items: FnfItem[];
  payees: { kind: string; name: string; relation: string; sharePercent: string; accountLast4: string | null; ifsc: string | null; amount: string | null }[];
  noticeWaived: { by: string; reason: string } | null;
  taxNote?: string;
  version: number;
}

export interface WorksheetLine {
  id: string;
  period: string;
  componentCode: string;
  kind: 'earning' | 'deduction' | 'employer';
  asPaid: string | null;
  corrected: string;
  difference: string | null;
  base: 'payslip' | 'import' | 'confirmed' | 'missing';
}

export interface Worksheet {
  id: string;
  employeeId: string;
  source: string;
  from: string;
  to: string;
  status: string;
  total: string;
  employerCost: string;
  reason: string;
  missing: number;
  createdBy: string;
  lines: WorksheetLine[];
}

export interface Recovery {
  id: string;
  employeeId: string;
  originTaxYear: string;
  crossYear: boolean;
  amount: string;
  recovered: string;
  balance: string;
  instalment: string;
  reason: string;
  status: string;
}
