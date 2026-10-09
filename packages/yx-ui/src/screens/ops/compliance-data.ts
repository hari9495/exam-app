// Fictional statutory data for Compliance screens (M03 statutory, P07). Kaveri Foods Pvt Ltd, period Sep 2026.
const d = (day: number, month = 8, year = 2026) => new Date(year, month, day);

export type FilingMode = 'self' | 'partner';
export type FilingStep = 'due' | 'generated' | 'uploaded' | 'acknowledged' | 'filed' | 'transmitted' | 'filed-by-partner' | 'rejected';

export interface StatuteItem {
  id: string;
  statute: 'PF' | 'ESI' | 'PT' | 'LWF' | 'TDS challan' | 'Form 138' | 'Form 140' | 'Registers' | 'IW-1';
  title: string;
  period: string;
  entity: string;
  state?: string;
  due: Date;
  amount: number;
  employees?: number;
  excluded?: string;
  problems?: string;
  mode: FilingMode;
  step: FilingStep;
  reference?: string;
  estimatedPenalty?: number;
  penaltyRule?: string;
  children?: SupplementaryFiling[];
}

export interface PenaltyLine {
  kind: string;
  daysLate: number;
  base: number;
  rate: string;
  amount: number;
  ruleVersion: string;
}
export interface SupplementaryFiling {
  id: string;
  kind: 'Supplementary ECR' | 'ESI past-period contribution' | 'Excess remittance refund request';
  originMonth: string;
  reason: string;
  employees: number;
  employeeShare: number;
  employerShare: number;
  step: FilingStep;
  trrn?: string;
  payslipLines: string[];
  penalties: PenaltyLine[];
  originalRef: string;
}

export const HUB_ITEMS: StatuteItem[] = [
  {
    id: 'pf-aug',
    statute: 'PF',
    title: 'PF ECR',
    period: 'Aug 2026',
    entity: 'Kaveri Foods Pvt Ltd',
    due: d(15),
    amount: 612480,
    employees: 231,
    excluded: '17 not covered: international worker 1, above wage ceiling and opted out 16',
    mode: 'self',
    step: 'filed',
    reference: 'TRRN 3162609015432',
    children: [
      {
        id: 'sup-jul',
        kind: 'Supplementary ECR',
        originMonth: 'Jul 2026',
        reason: 'Missed member: Farzana Begum joined 21 Jul, UAN linked after the July ECR was filed',
        employees: 1,
        employeeShare: 1320,
        employerShare: 1320,
        step: 'uploaded',
        trrn: 'TRRN 3162609020117',
        payslipLines: ['Jul 2026 payslip, Farzana Begum: PF employee 1,320', 'Jul 2026 employer PF 1,320'],
        originalRef: 'TRRN 3162607014411 (Jul 2026, filed 14 Aug)',
        penalties: [
          { kind: 'EPF interest (s.7Q)', daysLate: 44, base: 2640, rate: '12 % a year', amount: 38, ruleVersion: 'IN.PF 2025-11' },
          { kind: 'EPF damages (s.14B)', daysLate: 44, base: 2640, rate: 'Up to 2 months, 5 % a year', amount: 16, ruleVersion: 'IN.PF 2025-11' },
        ],
      },
    ],
  },
  { id: 'esi-aug', statute: 'ESI', title: 'ESI contribution', period: 'Aug 2026', entity: 'Kaveri Foods Pvt Ltd', due: d(15), amount: 118940, employees: 164, excluded: '84 not covered: wages above ₹21,000 at the start of the contribution period', mode: 'partner', step: 'filed-by-partner', reference: 'Challan 26081544718' },
  { id: 'pt-ka', statute: 'PT', title: 'Professional tax, Karnataka', period: 'Sep 2026', entity: 'Kaveri Foods Pvt Ltd', state: 'Karnataka', due: d(20, 9), amount: 27600, employees: 138, mode: 'self', step: 'generated' },
  { id: 'pt-tn', statute: 'PT', title: 'Professional tax, Tamil Nadu (half-year)', period: 'Apr–Sep 2026', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', state: 'Tamil Nadu', due: d(30), amount: 136250, employees: 110, problems: '2 employees with work location missing', mode: 'self', step: 'due' },
  { id: 'lwf-ka', statute: 'LWF', title: 'Labour welfare fund, Karnataka', period: 'Jan–Dec 2025', entity: 'Kaveri Foods Pvt Ltd', state: 'Karnataka', due: d(15, 0), amount: 23460, employees: 136, mode: 'self', step: 'due', estimatedPenalty: 5160, penaltyRule: 'IN.LWF.KA 2024-01, 18 % a year interest' },
  { id: 'tds-sep', statute: 'TDS challan', title: 'TDS challan, salary and consultants', period: 'Sep 2026', entity: 'Kaveri Foods Pvt Ltd', due: d(7, 9), amount: 541870, employees: 196, mode: 'self', step: 'due' },
  { id: 'f138-q2', statute: 'Form 138', title: 'Form 138, salary return', period: 'Q2 tax year 2026-27', entity: 'Kaveri Foods Pvt Ltd', due: d(31, 9), amount: 1604520, employees: 214, mode: 'partner', step: 'due' },
  { id: 'f140-q2', statute: 'Form 140', title: 'Form 140, non-salary return', period: 'Q2 tax year 2026-27', entity: 'Kaveri Foods Pvt Ltd', due: d(31, 9), amount: 88400, employees: 6, mode: 'partner', step: 'due' },
  { id: 'reg-aug', statute: 'Registers', title: 'Registers, Hosur plant', period: 'Aug 2026', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', state: 'Tamil Nadu', due: d(10), amount: 0, mode: 'self', step: 'filed', reference: 'Signed with DSC, version 1' },
];

export const ESI_SUPPLEMENTARY: SupplementaryFiling = {
  id: 'sup-esi',
  kind: 'ESI past-period contribution',
  originMonth: 'Jun 2026',
  reason: 'Arrears for the wage settlement paid in September',
  employees: 42,
  employeeShare: 3150,
  employerShare: 13650,
  step: 'generated',
  payslipLines: ['Sep 2026 arrears lines for 42 employees (settlement IRD-0001)'],
  originalRef: 'Challan 26061529001 (Jun 2026)',
  penalties: [{ kind: 'ESI interest', daysLate: 92, base: 16800, rate: '12 % a year', amount: 508, ruleVersion: 'IN.ESI 2025-11' }],
};
export const REFUND_REQUEST: SupplementaryFiling = {
  id: 'sup-ref',
  kind: 'Excess remittance refund request',
  originMonth: 'May 2026',
  reason: 'PF on a one-time bonus paid twice by mistake',
  employees: 3,
  employeeShare: 2880,
  employerShare: 2880,
  step: 'transmitted',
  payslipLines: ['May 2026 payslips, 3 employees: PF on bonus'],
  originalRef: 'TRRN 3162605011907 (May 2026)',
  penalties: [],
};

export const REGISTRATIONS = [
  { statute: 'PF', fields: [['Establishment code', 'KNBNG0012345000'], ['Establishment name', 'Kaveri Foods Pvt Ltd'], ['Coverage date', '01 Apr 2012']], missing: [] as string[], mode: 'Portal-ready ECR file, you upload' },
  { statute: 'ESI', fields: [['Employer code', '53000123450001001'], ['ESI office', 'Bengaluru (Peenya)']], missing: [], mode: 'Compliance partner files' },
  { statute: 'PT', fields: [['Karnataka enrolment', 'PTEC 1234567890'], ['Karnataka registration', 'PTRC 0987654321']], missing: [], mode: 'Portal-ready file, you upload' },
  { statute: 'LWF', fields: [['Karnataka registration', 'KA/LWF/BLR/2231']], missing: [], mode: 'You upload' },
  { statute: 'TDS', fields: [['TAN', 'BLRK01234E'], ['Deductor PAN', 'AAECK1234F'], ['Deductor type', 'Company'], ['Responsible person', 'Suresh Pillai, Payroll Manager']], missing: [], mode: 'Filing partner files Form 138 and Form 140' },
];
export const REGISTRATIONS_TN = [
  { statute: 'PF', fields: [['Establishment code', 'TNMAS0098765000']], missing: [], mode: 'Portal-ready ECR file, you upload' },
  { statute: 'ESI', fields: [['Employer code', '51000987650001001']], missing: [], mode: 'You upload' },
  { statute: 'PT', fields: [['Chennai Corporation', 'PT/CHN/44871'], ['Hosur Municipality', '']], missing: ['Hosur Municipality registration number'], mode: 'You upload' },
  { statute: 'LWF', fields: [], missing: ['Tamil Nadu LWF registration'], mode: 'Off' },
  { statute: 'TDS', fields: [['TAN', 'CHEK09876F'], ['Deductor PAN', 'AAECK1234F'], ['Responsible person', 'Suresh Pillai']], missing: ["Responsible person's address", 'Deductor address PIN code'], mode: 'Self-file with FVU' },
];

export interface RegisterRow {
  id: string;
  name: string;
  code: string;
  uan: string;
  ip?: string;
  location: string;
  gross: number;
  pfWage: number;
  ee: number;
  er: number;
  eps: number;
  coverage: 'Covered' | 'Not covered' | 'Not due';
  reason?: string;
}
const NAMES = ['Divya Raghunathan', 'Karthik Subramanian', 'Meera Nair', 'Arjun Kulkarni', 'Farzana Begum', 'Ravi Shankar', 'Sathish Kumar', 'Priya Menon', 'Vikram Rao', 'Sana Nizami', 'Manoj Kumar', 'Kavitha Srinivasan'];
export const REGISTER_ROWS: RegisterRow[] = NAMES.map((name, i) => {
  const gross = [58000, 96000, 41000, 36500, 19800, 27400, 18500, 72000, 64000, 88000, 17800, 45000][i];
  const pfWage = Math.min(15000, Math.round(gross * 0.5));
  const covered = !(i === 1 || i === 9);
  return {
    id: `r${i}`,
    name,
    code: `KF-${String(i + 1).padStart(4, '0')}`,
    uan: covered ? `10124471${String(1000 + i * 37)}` : '—',
    ip: gross <= 21000 ? `31-00-4455${String(10 + i)}-000-0001` : undefined,
    location: i % 3 === 0 ? 'Chennai office' : i % 3 === 1 ? 'Bengaluru head office' : 'Hosur plant',
    gross,
    pfWage: covered ? pfWage : 0,
    ee: covered ? Math.round(pfWage * 0.12) : 0,
    er: covered ? Math.round(pfWage * 0.0367) : 0,
    eps: covered ? Math.round(pfWage * 0.0833) : 0,
    coverage: covered ? 'Covered' : 'Not covered',
    reason: covered ? undefined : 'Joined above wage ceiling, opted out (Form 11)',
  };
});

export const MISSING_IDS = [
  { id: 'm1', name: 'Manoj Kumar', code: 'KF-0011', dept: 'Operations', issue: 'UAN missing', detail: 'PF-eligible from 1 Sep; the next ECR will reject the row', severity: 'Blocks filing' },
  { id: 'm2', name: 'Sathish Kumar', code: 'KF-0007', dept: 'Operations', issue: 'ESI IP number missing', detail: 'Covered for ESI; needed for the ESIC accident report', severity: 'Blocks filing' },
  { id: 'm3', name: 'Rohan Das', code: 'KF-0142', dept: 'Sales', issue: 'PAN inoperative', detail: 'Not linked with Aadhaar; TDS at the higher of 20 % or slab (s.206AA)', severity: 'Higher TDS' },
  { id: 'm4', name: 'Nisha Thomas', code: 'KF-0188', dept: 'Engineering', issue: 'PAN missing', detail: 'TDS at 20 %; the return row carries the no-PAN flag', severity: 'Higher TDS' },
  { id: 'm5', name: 'Farzana Begum', code: 'KF-0005', dept: 'Quality', issue: 'Name differs from UAN', detail: 'Payroll: Farzana Begum · UAN: Farjana Begam', severity: 'Portal may reject' },
  { id: 'm6', name: 'Arjun Kulkarni', code: 'KF-0004', dept: 'Operations', issue: 'Bank account not verified', detail: 'Penny-drop failed: account closed', severity: 'Blocks payment' },
  { id: 'm7', name: 'Kiran Gowda', code: 'KF-0231', dept: 'Engineering', issue: 'UAN missing', detail: 'Joined 22 Sep; PF-eligible', severity: 'Blocks filing' },
];

export interface RuleSetRow {
  id: string;
  statute: string;
  jurisdiction: string;
  name: string;
  version: string;
  validFrom: Date;
  status: 'In force' | 'Upcoming' | 'Superseded';
  source: string;
  transitional?: boolean;
}
export const RULE_SETS: RuleSetRow[] = [
  { id: 'rs1', statute: 'IN.PT', jurisdiction: 'Karnataka', name: 'Professional tax slabs', version: '2026-10', validFrom: d(1, 9), status: 'Upcoming', source: 'Karnataka Gazette notification FD 44 CSL 2026' },
  { id: 'rs2', statute: 'IN.PT', jurisdiction: 'Karnataka', name: 'Professional tax slabs', version: '2023-04', validFrom: d(1, 3, 2023), status: 'In force', source: 'Karnataka Tax on Professions Act, amendment 2023' },
  { id: 'rs3', statute: 'IN.PF', jurisdiction: 'All India', name: 'EPF rates, ceiling and penalties', version: '2025-11', validFrom: d(21, 10, 2025), status: 'In force', source: 'Code on Social Security, 2020 and EPF Scheme' },
  { id: 'rs4', statute: 'IN.ESI', jurisdiction: 'All India', name: 'ESI rates and wage ceiling', version: '2025-11', validFrom: d(21, 10, 2025), status: 'In force', source: 'Code on Social Security, 2020' },
  { id: 'rs5', statute: 'IN.TDS', jurisdiction: 'All India', name: 'Income-tax Act 2025: slabs, forms, cross-walk', version: '2026-04', validFrom: d(1, 3), status: 'In force', source: 'Income-tax Act, 2025' },
  { id: 'rs6', statute: 'IN.MW', jurisdiction: 'Tamil Nadu', name: 'Minimum wages, zone and skill', version: '2026-04', validFrom: d(1, 3), status: 'In force', source: 'G.O. (2D) Labour dept, Apr 2026' },
  { id: 'rs7', statute: 'IN.OSH', jurisdiction: 'Tamil Nadu', name: 'OSH Code rules (contract labour, registers)', version: '2025-11-T', validFrom: d(21, 10, 2025), status: 'In force', source: 'CLRA 1970 rules as transitional values', transitional: true },
  { id: 'rs8', statute: 'IN.LWF', jurisdiction: 'Karnataka', name: 'Labour welfare fund', version: '2024-01', validFrom: d(1, 0, 2024), status: 'In force', source: 'Karnataka LWF Act, 2024 amendment' },
];

export const ADVISORIES = [
  { id: 'adv1', title: 'Karnataka professional tax: new slab from 1 Oct 2026', statutes: 'IN.PT', states: 'Karnataka', published: d(24), effective: d(1, 9), severity: 'action' as const, status: 'Notified', impact: '138 employees in Karnataka. The ₹200 slab now starts at ₹25,000 gross. Payroll uses it from the October run; nothing to do unless you override locations.', reviewed: false },
  { id: 'adv2', title: 'Tamil Nadu notifies OSH Code contract-labour rules', statutes: 'IN.OSH, IN.CLRA', states: 'Tamil Nadu', published: d(18), effective: d(1, 10), severity: 'urgent' as const, status: 'Notified', impact: 'Hosur plant contractors move from transitional CLRA values. Check contractor licence scope before 1 Nov.', reviewed: false },
  { id: 'adv3', title: 'EPFO portal: supplementary ECR upload moved to a new menu', statutes: 'IN.PF', states: 'All India', published: d(9), effective: d(9), severity: 'info' as const, status: 'In force', impact: 'No change to files. The upload guide in the statutory hub is updated.', reviewed: true },
];

export const CHALLAN = {
  section: '192 (salary) · 2025 Act cross-walk',
  tan: 'BLRK01234E',
  deductionMonth: 'Sep 2026',
  tds: 482340,
  surcharge: 0,
  cess: 0,
  deductedOn: d(30),
  dueOn: d(7, 9),
};

export const F16_ROWS = [
  { id: 'f1', name: 'Divya Raghunathan', pan: 'ABCPR1234K', partA: 'Imported', partB: 'Generated', signed: true, published: true },
  { id: 'f2', name: 'Karthik Subramanian', pan: 'AKLPS5521L', partA: 'Imported', partB: 'Generated', signed: true, published: true },
  { id: 'f3', name: 'Meera Nair', pan: 'BNRPM8812Q', partA: 'Imported', partB: 'Generated', signed: true, published: false },
  { id: 'f4', name: 'Nisha Thomas', pan: '—', partA: 'Not in TRACES file', partB: 'Generated', signed: false, published: false },
  { id: 'f5', name: 'Vikram Rao', pan: 'CVRPR4410M', partA: 'Imported', partB: 'Generated', signed: false, published: false },
  { id: 'f6', name: 'Anand Mohan (left 31 Jan)', pan: 'DAMPM7719J', partA: 'Imported', partB: 'Generated', signed: false, published: false },
];

export const DEDUCTEE_GAPS = [
  { month: 'Jul 2026', rows: 214, status: 'Imported from YTD' },
  { month: 'Aug 2026', rows: 216, status: 'Imported from YTD' },
  { month: 'Sep 2026', rows: 218, status: 'From payroll' },
];
