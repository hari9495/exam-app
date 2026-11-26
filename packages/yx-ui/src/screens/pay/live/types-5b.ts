// What the payroll batch-5b API returns (apps/api/src/payroll: setup, structures, imports). Amounts are decimal text.

export type SetupKey = 'payroll.setup.manage' | 'payroll.statutory.setup' | 'payroll.template.manage' | 'payroll.import.run';
export interface SetupEntity {
  id: string;
  name: string;
  shortName: string;
  keys: SetupKey[];
}

export interface SetupState {
  steps: {
    key: 'registrations' | 'pay_groups' | 'components' | 'templates' | 'payslip_layout';
    done: boolean;
    missing?: string[];
  }[];
  ready: boolean;
}

export type RegistrationStatus = 'on' | 'applied_awaited' | 'off';
export interface Registration {
  id?: string;
  statute: 'IN.PF' | 'IN.ESI' | 'IN.PT' | 'IN.LWF' | 'IN.TDS';
  state: string | null;
  status: RegistrationStatus;
  registrationNo: string | null;
  startOn: string | null;
  appliedOn: string | null;
  responsiblePerson: string | null;
  responsibleDesignation: string | null;
  version?: number;
}
export interface Registrations {
  registrations: Registration[];
  completeness: { complete: boolean; missing: string[] };
}

export type LegalOptionKey = 'pf.on_actual_wage' | 'bonus.rate' | 'bonus.payment' | 'gratuity.provisioning';
export interface LegalOption {
  id: string;
  optionKey: LegalOptionKey;
  value: string;
  validFrom: string;
  validTo: string | null;
}

export interface RuleSetView {
  id: string;
  statute: string;
  jurisdiction: string;
  version: string;
  validFrom: string;
  validTo: string | null;
  lawVersion: string | null;
  verify: boolean;
  source: string;
  values: Record<string, unknown>;
}

export interface CoverageRow {
  legalEntityId: string;
  statute: string;
  headcount: number;
  threshold: number;
  /** crossed: covered by law but neither switched on nor applied for (PAY-30; blocks run approval). */
  status: 'not_covered' | 'approaching' | 'covered' | 'crossed';
  registration?: 'on' | 'applied_awaited' | null;
  crossedOn: string | null;
  ruleVersion: string;
  evaluatedAt: string;
}

export interface PayGroup {
  id: string;
  legalEntityId: string;
  name: string;
  frequency: string;
  /** PAY-9.01: the first day of one of a weekly or fortnightly group's periods. */
  anchorDate?: string | null;
  currency: string;
  dayBasis: 'calendar' | '30' | '26';
  cutOffDay: number;
  payDay: number;
  /** Enterprise E5 (O17): payslips are shown this many days after the period ends (0: when published). */
  releaseDay?: number;
  bankFormat: string | null;
  status: string;
  version: number;
}
export interface PayGroupMember {
  employeeId: string;
  employmentId: string;
  employeeCode: string;
  name: string;
  validFrom: string;
  validTo: string | null;
}
export interface PayCalendarMonth {
  month: string;
  periodStart: string;
  periodEnd: string;
  cutOff: string;
  /** Enterprise E5 (O17): the payslip release date (null: when published) and the month's own dates, if changed. */
  release?: string | null;
  changed?: { reason: string; changedAt: string; version: number } | null;
  payDate: string;
}

export type ComponentKind = 'earning' | 'deduction' | 'employer' | 'reimbursement' | 'info';
export interface PayComponent {
  id: string;
  code: string;
  name: string;
  kind: ComponentKind;
  taxable: boolean;
  pfWage: boolean;
  /** B2: with pfWage, counts only while the month's other PF wage is below the PF ceiling. */
  pfBelowCeiling?: boolean;
  esiWage: boolean;
  ptWage: boolean;
  gratuityWage: boolean;
  bonusWage: boolean;
  codeWagePart: boolean;
  codeExclusion: boolean;
  prorated: boolean;
  onPayslip: boolean;
  inCtc: boolean;
  /** E3 (answer 2651): recalculate back-dated pay when a salary change or a joining date reaches a paid month. */
  arrearsOnSalaryChange?: boolean;
  arrearsOnJoining?: boolean;
  prorationText: string | null;
  rounding: 'none' | 'rupee' | 'up_rupee';
  ledger: string | null;
  statutory: string | null;
  status: 'active' | 'retired';
  usedAt: string | null;
  version: number;
}
export type ComponentInput = Omit<PayComponent, 'id' | 'statutory' | 'usedAt' | 'version'> & { version?: number };

export interface FormulaCheck {
  ok: boolean;
  message?: string;
  type?: 'number' | 'boolean';
  uses?: string[];
  statutory?: string[];
}

export interface BreakupLine {
  code: string;
  name: string;
  kind: ComponentKind;
  monthly: string;
  annual: string;
  citation: {
    statute: string;
    jurisdiction: string;
    version: string;
    verify: boolean;
  } | null;
}
export interface Breakup {
  lines: BreakupLine[];
  monthlyGross: string;
  monthlyCtc: string;
  annualCtc: string;
  codeWageAddBack: string;
  esiCovered: boolean;
  rounds: number;
  minWage: {
    monthly: string;
    checked: string;
    below: boolean;
    floorApplied: boolean;
  } | null;
  verify: boolean;
  warnings?: string[];
  /** PAY-12: a back-dated revision's arrears for months already paid (the first month prorated). */
  arrears?: { month: string; days: number; of: number; amount: string }[];
}

export interface SalaryTemplate {
  id: string;
  name: string;
  legalEntityId: string | null;
  status: string;
  versions: {
    id: string;
    version: number;
    validFrom: string;
    codeWageFlag: boolean;
    validatedAt: string;
  }[];
}
export interface TemplateVersionInput {
  validFrom: string;
  lines: { code: string; formula: string }[];
  balancing: string;
  employerPfInCtc: boolean;
  employerEsiInCtc: boolean;
  gratuityInCtc: boolean;
  sample: { annualCtc: string; state: string; age: number };
}

export interface EmployeeHit {
  id: string;
  name: string;
  employeeCode?: string;
}

export interface CompensationInForce {
  validFrom: string;
  validTo: string | null;
  currency: string;
  annualCtc: string;
  changeId: string;
  package: {
    entryMode: 'ctc' | 'fixed';
    payBasis: string;
    rate: string | null;
    monthlyGross: string;
    codeWageAddBack: string;
    letterDocumentId: string | null;
  } | null;
  lines: {
    code?: string;
    name?: string;
    kind?: string;
    monthly: string;
    annual: string;
  }[];
}
export interface CompensationInput {
  effectiveDate: string;
  templateVersionId: string;
  entryMode: 'ctc' | 'fixed';
  annualCtc?: string;
  fixed?: Record<string, string>;
  /** PAY-12 Hourly: paid by the month (default), or by an hourly or daily rate from approved timesheets or days. */
  payBasis?: 'monthly' | 'hourly' | 'daily';
  rate?: string;
}

export interface StatutoryProfileRow {
  id: string;
  validFrom: string;
  validTo: string | null;
  pf: 'yes' | 'no';
  eps: boolean;
  vpfPercent: string;
  pfOnActualWage: boolean | null;
  esi: 'yes' | 'no' | 'by_wage';
  ptState: string | null;
  reason: string | null;
}
export interface StatutoryProfile {
  defaults: Record<string, 'mandatory' | 'optional' | 'excluded' | 'by_wage'>;
  history: StatutoryProfileRow[];
}

export interface LayoutBlock {
  key: string;
  shown: boolean;
}
export interface PayslipLayouts {
  mandatory: string[];
  layouts: {
    id: string;
    version: number;
    blocks: LayoutBlock[];
    languages: string[];
    status: 'draft' | 'active' | 'retired';
    previewedAt: string | null;
    activatedAt: string | null;
  }[];
}

export type ImportKind = 'opening_balances' | 'as_paid_lines' | 'form12b';
export interface ImportBatch {
  id: string;
  kind: ImportKind;
  rows: number;
  valid: number;
  errors: { row: number; message: string }[];
  status: string;
}
export interface GoLiveCheck {
  fyStart: string;
  goLiveMonth: string;
  ready: boolean;
  missing: { employeeCode: string; month: string }[];
}
