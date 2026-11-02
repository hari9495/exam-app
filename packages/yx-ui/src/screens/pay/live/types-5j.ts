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
  /** F&F runs: "FNF-2026-0041". */
  reference?: string | null;
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
  /** PAY-09: the viewer is the only one who may publish these payslips, so a reason is asked for. */
  publishAlone?: boolean;
  /** PAY-29: the run's pay group (only on the single run). */
  payGroup?: { name: string; frequency: 'monthly' | 'weekly' | 'fortnightly' | string } | null;
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
  /** PAY-02: the run's people by location and attendance mode (company settings), open exceptions and manual LOP entered. */
  groups?: { group: string; mode: 'punch_block' | 'punch_warn' | 'assumed_present' | 'timesheet'; employees: number; exceptions: number; lopEntered: number; attendanceStage: string }[];
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
  /** PAY-10: "ifsc" = failed for an invalid IFSC and waiting for the employee's corrected account. */
  waitingFor?: 'ifsc' | null;
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
  /**
   * Founder answer 6 (PAY-21): the month's days from the attendance feed, with the frozen feed's totals. Null for
   * off-cycle and weekly payslips.
   */
  days?: { list: { day: number; kind: 'paid' | 'lop' | 'holiday' | 'off' | 'leave' | 'future' }[]; calendarDays: number | null; paidDays: string | null; lopDays: string | null } | null;
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
  /** CMP-12 (founder answer 22): supplementary filings and excess records of this card's month. */
  children?: HubChild[];
}

/** A supplementary filing or an excess record under the month's card (GET statutory/hub). */
export interface HubChild {
  id: string;
  kind: 'supplementary' | 'excess_adjustment' | 'excess_refund';
  status: string;
  amount: string | null;
  reason: string | null;
  people: number | null;
  employeeShare: string;
  employerShare: string;
  causedBy: string[];
  reference: string | null;
  fileId: string | null;
  correctsId: string | null;
  createdAt: string;
  penalties: { kind: string; daysLate: number; base: string; rate: string; amount: string; ruleVersion: string }[];
}

/** GET statutory/missing-ids (CMP-07, founder answer 22). */
export interface MissingIdView {
  id: string;
  employeeId: string;
  name: string;
  code: string;
  department: string | null;
  issue: 'pan_missing' | 'pan_inoperative' | 'uan_missing' | 'esi_missing' | 'bank_missing' | 'bank_waiting';
  blocks: boolean;
}
export interface MissingIds {
  entityId: string;
  people: number;
  counts: { pan: number; uan: number; esi: number; bank: number };
  rows: MissingIdView[];
}

export interface StatutoryHub {
  entityId: string;
  month: string;
  today: string;
  /** CMP-01: registrations the entity has not recorded ("IN.PF", "IN.PT IN-KA"). */
  setupMissing?: string[];
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
  /** CMP-05: rows per month and where they come from, and the PAN warnings (null once filed). */
  completeness?: ReturnCompleteness | null;
}

export interface ReturnCompleteness {
  months: { month: string; rows: number; source: 'payroll' | 'imported' | 'nil' | 'none'; missing: boolean; nil?: { id: string; version: number; reason: string; recordedAt: string } | null }[];
  panWarnings: { employeeId: string; employeeCode: string; name: string; issue: 'pan_missing' | 'pan_inoperative' }[];
  panWarningCount: number;
  panChecked: number;
}

export interface FnfItem {
  id: string;
  componentCode: string;
  /** A deduction (a recovery) is money the leaver owes; an employer line is paid by the company (not to the leaver). */
  kind: 'earning' | 'deduction' | 'employer';
  amount: string;
  label: string | null;
  /** What the line is, and how it is worked out. */
  title: string;
  how: string;
  /** Due within the 2-working-day deadline (Code on Wages). */
  wage: boolean;
  /** Pulled from another module (clearance recoveries, expense advances and claims). */
  auto: boolean;
  /** An approved expense claim paid with the settlement (held or changed in Expenses, not here). */
  claim: boolean;
  held: string | null;
  /** A short category for a hold the system made ("permission needed", "not returned yet"); the full reason is `held`. */
  heldTag: string | null;
  inRun: string | null;
  byPayroll: boolean;
}

/** A line of the F&F run's payslip that is not a settlement line: salary to the last day, statutory deductions, TDS, loans. */
export interface FnfSlipLine {
  code: string;
  name: string;
  group: 'earning' | 'recovery' | 'tds' | 'statutory';
  amount: string;
  how: string;
}

export interface FnfSettlementView {
  id: string;
  employeeId: string;
  exitType: string;
  lwd: string;
  deadline: string;
  overdue: boolean;
  /** PPL-22 absconding: recovery-only, the net payable held until the person claims it (no wage deadline runs). */
  heldForClaim?: boolean;
  status: string;
  runId: string | null;
  /** "FNF-2026-0041". */
  runReference: string | null;
  runStatus: string | null;
  secondRunId: string | null;
  net: string | null;
  /** Working days to the deadline on the person's holiday calendar (negative once overdue). */
  workingDaysLeft: number;
  items: FnfItem[];
  /** null until the run is calculated with the current lines. */
  salary: FnfSlipLine[] | null;
  /** tds, statutory, rounding and net are null until the run is calculated with the current lines; held lines are outside the totals. */
  totals: { earnings: string; wageLines: string; recoveries: string; tds: string | null; statutory: string | null; rounding: string | null; net: string | null; held: string };
  gratuity: { eligible: boolean; years: number; months: number; counted: number; minYears: number; dueBy: string } | null;
  payees: { kind: string; name: string; relation: string; sharePercent: string; accountLast4: string | null; ifsc: string | null; amount: string | null }[];
  noticeWaived: { by: string; reason: string } | null;
  taxNote?: string;
  /** PAY-11 Retrenchment: whether the government's permission is needed and the one recorded in People › Exits. */
  permission?: { needed: boolean; workers: number; granted: boolean; status: string | null; reference: string | null } | null;
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
