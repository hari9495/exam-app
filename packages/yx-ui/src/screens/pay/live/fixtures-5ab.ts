// Fictional, deterministic sample data for the payroll batch 5a / 5b screens' design stories. Kaveri Foods Pvt Ltd, 28 Oct 2026.
import type { AuditPage, ChainStatus, ExchangeFiles, PayDocuments, PayPeriods, PeriodHistory, ReopenRequest } from './types';
import type { Breakup, CompensationInForce, CoverageRow, GoLiveCheck, ImportBatch, LegalOption, PayCalendarMonth, PayComponent, PayGroup, PayGroupMember, PayslipLayouts, Registrations, RuleSetView, SalaryTemplate, SetupEntity, SetupState, StatutoryProfile } from './types-5b';

export const TODAY = '2026-10-28';

// ------------------------------------------------------------------ 5a: periods, reopen, audit, documents, files
export const PAY_PERIODS: PayPeriods = {
  year: '2026',
  today: TODAY,
  entities: [
    {
      id: 'le-kfpl',
      name: 'Kaveri Foods Pvt Ltd',
      shortName: 'KFPL',
      canRequestReopen: true,
      months: [
        { month: '2026-07', periodId: 'p7', stage: 'filed', lockedAt: '2026-08-02T05:00:00Z', lockedBy: 'Lakshmi Venkatesan', changedAt: '2026-08-12T05:00:00Z', changedBy: 'Lakshmi Venkatesan', reason: null, reopenRequestId: null, corrections: { pending: 0, approved: 0 } },
        { month: '2026-08', periodId: 'p8', stage: 'locked', lockedAt: '2026-09-02T05:00:00Z', lockedBy: 'Lakshmi Venkatesan', changedAt: '2026-09-02T05:00:00Z', changedBy: 'Lakshmi Venkatesan', reason: null, reopenRequestId: null, corrections: { pending: 0, approved: 1 } },
        { month: '2026-09', periodId: 'p9', stage: 'locked', lockedAt: '2026-10-02T05:00:00Z', lockedBy: 'Lakshmi Venkatesan', changedAt: '2026-10-02T05:00:00Z', changedBy: 'Lakshmi Venkatesan', reason: null, reopenRequestId: null, corrections: { pending: 1, approved: 2 } },
        { month: '2026-10', periodId: null, stage: 'open', lockedAt: null, lockedBy: null, changedAt: null, changedBy: null, reason: null, reopenRequestId: null, corrections: { pending: 0, approved: 0 } },
      ],
    },
    {
      id: 'le-tn',
      name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)',
      shortName: 'KFPL-TN',
      canRequestReopen: false,
      months: [
        { month: '2026-09', periodId: 'pt9', stage: 'locked', lockedAt: '2026-10-02T05:00:00Z', lockedBy: 'Lakshmi Venkatesan', changedAt: '2026-10-09T05:00:00Z', changedBy: 'Suresh Pillai', reason: null, reopenRequestId: 'r1', corrections: { pending: 0, approved: 0 } },
        { month: '2026-10', periodId: null, stage: 'open', lockedAt: null, lockedBy: null, changedAt: null, changedBy: null, reason: null, reopenRequestId: null, corrections: { pending: 0, approved: 0 } },
      ],
    },
  ],
};
export const PERIOD_HISTORY: PeriodHistory = {
  id: 'p9',
  month: '2026-09',
  stage: 'locked',
  events: [
    { at: '2026-10-02T05:00:00Z', from: 'open', to: 'frozen', by: 'Lakshmi Venkatesan', reason: null },
    { at: '2026-10-02T05:10:00Z', from: 'frozen', to: 'locked', by: 'Lakshmi Venkatesan', reason: null },
  ],
  reopenRequests: [],
  corrections: [
    { id: 'c1', person: 'Rekha Balan', on: '2026-09-18', kind: 'attendance', source: 'regularisation', change: { shouldBe: 'present' }, reason: 'Biometric reader was down at the Hosur gate', status: 'approved', paidIn: '2026-10' },
    { id: 'c2', person: 'Anil Kumar', on: '2026-09-27', kind: 'overtime', source: 'overtime claim', change: {}, reason: 'Boiler breakdown call-out approved late', status: 'pending', paidIn: null },
  ],
};
export const REOPEN_REQUESTS: ReopenRequest[] = [
  {
    id: 'r1',
    entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)',
    legalEntityId: 'le-tn',
    month: '2026-09',
    stage: 'locked',
    reason: 'A late overtime claim of Anil Kumar was approved after the lock',
    status: 'pending',
    requestedBy: 'Suresh Pillai',
    requestedByMe: false,
    at: '2026-10-09T05:00:00Z',
    decidedAt: null,
    steps: [
      { name: 'Payroll check', state: 'approved', approvers: ['Meena Raghavan'], decidedBy: [{ who: 'Meena Raghavan', action: 'approved', reason: null, at: '2026-10-09T06:00:00Z' }] },
      { name: 'Finance or System Admin', state: 'open', approvers: ['Neha Joshi'], decidedBy: [] },
    ],
    canDecide: true,
    phrase: 'REOPEN KFPL-TN 2026-09',
  },
  {
    id: 'r0',
    entity: 'Kaveri Foods Pvt Ltd',
    legalEntityId: 'le-kfpl',
    month: '2026-06',
    stage: 'locked',
    reason: 'Arrears for the June wage revision were missed',
    status: 'rejected',
    requestedBy: 'Neha Joshi',
    requestedByMe: true,
    at: '2026-07-10T05:00:00Z',
    decidedAt: '2026-07-10T09:00:00Z',
    steps: [{ name: 'Payroll check', state: 'rejected', approvers: ['Meena Raghavan'], decidedBy: [{ who: 'Meena Raghavan', action: 'rejected', reason: 'Pay the arrears as a correction in July', at: '2026-07-10T09:00:00Z' }] }],
    canDecide: false,
    phrase: null,
  },
];
export const AUDIT_PAGE: AuditPage = {
  entries: [
    { id: 'a3', seq: '1042', at: '2026-10-09T06:00:00Z', action: 'payroll.reopen.approved', entityType: 'reopen_request', entityId: 'r1', actor: 'Meena Raghavan', actorRole: 'Payroll lead', details: { step: 'Payroll check' } },
    { id: 'a2', seq: '1041', at: '2026-10-09T05:00:00Z', action: 'payroll.reopen.requested', entityType: 'reopen_request', entityId: 'r1', actor: 'Suresh Pillai', actorRole: 'Payroll executive', details: { month: '2026-09' } },
    { id: 'a1', seq: '1040', at: '2026-10-02T05:10:00Z', action: 'payroll.period.locked', entityType: 'pay_period', entityId: 'p9', actor: 'Lakshmi Venkatesan', actorRole: 'Payroll admin', details: { month: '2026-09' } },
  ],
  next: 'cursor-1040',
};
export const CHAIN_OK: ChainStatus = { canVerify: true, checks: [{ at: '2026-10-28T00:30:00Z', result: 'ok', lastSeq: '1042', rows: '1042', problem: null }] };
export const CHAIN_BROKEN: ChainStatus = { canVerify: true, checks: [{ at: '2026-10-28T00:30:00Z', result: 'broken', lastSeq: '1042', rows: '1042', problem: 'Row 1017 does not match the hash of row 1016.' }] };

const SHA = 'f3a9c2e17b4d5a8e9f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a';
export const PAY_DOCUMENTS: PayDocuments = {
  entities: [{ id: 'le-kfpl', name: 'Kaveri Foods Pvt Ltd', canIssue: true }, { id: 'le-tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', canIssue: false }],
  documents: [
    { id: 'd3', kind: 'payslip', kindLabel: 'Payslip', title: 'Payslip, September 2026', referenceNo: 'KF/PS/2026-09/0142', status: 'issued', signature: 'signed', issuedAt: '2026-10-01T10:00:00Z', verifyCode: 'KF7Q2M9XPA', sha256: SHA, month: '2026-09', supersedesId: 'd2', supersededById: null, purged: false, employeeId: 'e-arjun', person: 'Arjun Kulkarni', legalEntityId: 'le-kfpl' },
    { id: 'd2', kind: 'payslip', kindLabel: 'Payslip', title: 'Payslip, September 2026', referenceNo: 'KF/PS/2026-09/0142', status: 'superseded', signature: 'signed', issuedAt: '2026-09-30T10:00:00Z', verifyCode: 'KF3H8R2LWB', sha256: SHA, month: '2026-09', supersedesId: null, supersededById: 'd3', purged: false, employeeId: 'e-arjun', person: 'Arjun Kulkarni', legalEntityId: 'le-kfpl' },
    { id: 'd1', kind: 'form16', kindLabel: 'Form 16', title: 'Form 16, 2025-26', referenceNo: 'KF/F16/2025-26/0177', status: 'awaiting_signature', signature: 'awaiting', issuedAt: '2026-06-14T10:00:00Z', verifyCode: null, sha256: SHA, month: null, supersedesId: null, supersededById: null, purged: false, employeeId: 'e-kavitha', person: 'Kavitha Sundaram', legalEntityId: 'le-tn' },
  ],
};
export const EXCHANGE_FILES: ExchangeFiles = {
  entities: [{ id: 'le-kfpl', name: 'Kaveri Foods Pvt Ltd' }, { id: 'le-tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }],
  files: [
    { id: 'f2', legalEntityId: 'le-kfpl', kind: 'bank', kindLabel: 'Bank file', month: '2026-10', fileName: 'KFPL-salary-2026-10.csv', sha256: SHA, sizeBytes: 18_420, rows: 214, totals: { amount: '9842630.00' }, status: 'generated', generatedBy: 'Suresh Pillai', generatedAt: '2026-10-28T05:00:00Z', releasedBy: null, releasedAt: null, madeByMe: false, canRelease: true },
    { id: 'f1', legalEntityId: 'le-kfpl', kind: 'ecr', kindLabel: 'PF return (ECR)', month: '2026-09', fileName: 'KFPL-ECR-2026-09.txt', sha256: SHA, sizeBytes: 9_310, rows: 198, totals: { amount: '1184200.00' }, status: 'released', generatedBy: 'Suresh Pillai', generatedAt: '2026-10-10T05:00:00Z', releasedBy: 'Meena Raghavan', releasedAt: '2026-10-11T05:00:00Z', madeByMe: false, canRelease: false },
  ],
};

// ------------------------------------------------------------------ 5b: set-up, groups, layout, rules, coverage, imports
export const SETUP_ENTITIES: SetupEntity[] = [
  { id: 'le-kfpl', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: ['payroll.setup.manage', 'payroll.statutory.setup', 'payroll.template.manage', 'payroll.import.run'] },
  { id: 'le-tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', shortName: 'KFPL-TN', keys: ['payroll.setup.manage', 'payroll.template.manage'] },
];
export const SETUP_STATE: SetupState = {
  ready: false,
  steps: [
    { key: 'registrations', done: false, missing: ['IN.TDS: the entity TAN'] },
    { key: 'pay_groups', done: true },
    { key: 'components', done: true },
    { key: 'templates', done: true },
    { key: 'payslip_layout', done: false },
  ],
};
export const REGISTRATIONS: Registrations = {
  registrations: [
    { id: 'rg1', statute: 'IN.PF', state: null, status: 'on', registrationNo: 'KNBNG0045123000', startOn: '2014-04-01', appliedOn: null, responsiblePerson: 'Lakshmi Venkatesan', responsibleDesignation: 'Payroll admin', version: 3 },
    { id: 'rg2', statute: 'IN.ESI', state: null, status: 'on', registrationNo: '53000123450001001', startOn: '2014-04-01', appliedOn: null, responsiblePerson: 'Lakshmi Venkatesan', responsibleDesignation: 'Payroll admin', version: 2 },
    { id: 'rg3', statute: 'IN.PT', state: 'IN-KA', status: 'on', registrationNo: 'PTEC 1234567', startOn: '2014-04-01', appliedOn: null, responsiblePerson: null, responsibleDesignation: null, version: 1 },
    { id: 'rg4', statute: 'IN.TDS', state: null, status: 'applied_awaited', registrationNo: null, startOn: null, appliedOn: '2026-10-20', responsiblePerson: null, responsibleDesignation: null, version: 1 },
  ],
  completeness: { complete: false, missing: ['IN.TDS: the entity TAN'] },
};
export const LEGAL_OPTIONS: LegalOption[] = [
  { id: 'o1', optionKey: 'pf.on_actual_wage', value: 'no', validFrom: '2024-04-01', validTo: null },
  { id: 'o2', optionKey: 'bonus.rate', value: '0.0833', validFrom: '2024-04-01', validTo: null },
];
export const PAY_GROUPS: PayGroup[] = [
  { id: 'g1', legalEntityId: 'le-kfpl', name: 'Head office monthly', frequency: 'monthly', currency: 'INR', dayBasis: 'calendar', cutOffDay: 20, payDay: 0, bankFormat: 'hdfc', status: 'active', version: 2 },
  { id: 'g2', legalEntityId: 'le-tn', name: 'Hosur plant workers', frequency: 'monthly', currency: 'INR', dayBasis: '26', cutOffDay: 22, payDay: 7, bankFormat: 'sbi', status: 'active', version: 1 },
  { id: 'g3', legalEntityId: 'le-tn', name: 'Hosur contract loaders', frequency: 'weekly', anchorDate: '2026-04-06', currency: 'INR', dayBasis: 'calendar', cutOffDay: 1, payDay: 0, bankFormat: null, status: 'active', version: 1 },
];
export const GROUP_MEMBERS: PayGroupMember[] = [
  { employeeId: 'e-kavitha', employmentId: 'm1', employeeCode: 'KF-0177', name: 'Kavitha Sundaram', validFrom: '2024-04-01', validTo: null },
  { employeeId: 'e-rekha', employmentId: 'm2', employeeCode: 'KF-0182', name: 'Rekha Balan', validFrom: '2025-01-15', validTo: null },
];
export const PAY_CALENDAR: PayCalendarMonth[] = ['2026-09', '2026-10', '2026-11'].map((m) => ({ month: m, periodStart: `${m}-01`, periodEnd: `${m}-${m === '2026-11' || m === '2026-09' ? '30' : '31'}`, cutOff: `${m}-22`, payDate: `${m === '2026-09' ? '2026-10' : m === '2026-10' ? '2026-11' : '2026-12'}-07` }));
export const PAYSLIP_LAYOUTS: PayslipLayouts = {
  mandatory: ['netPay', 'earnings', 'deductions', 'wagePeriod'],
  layouts: [
    { id: 'l2', version: 2, blocks: [{ key: 'netPay', shown: true }, { key: 'earnings', shown: true }, { key: 'deductions', shown: true }, { key: 'wagePeriod', shown: true }, { key: 'department', shown: true }], languages: ['en', 'kn'], status: 'draft', previewedAt: null, activatedAt: null },
    { id: 'l1', version: 1, blocks: [{ key: 'netPay', shown: true }, { key: 'earnings', shown: true }, { key: 'deductions', shown: true }, { key: 'wagePeriod', shown: true }], languages: ['en'], status: 'active', previewedAt: '2026-04-01T05:00:00Z', activatedAt: '2026-04-01T06:00:00Z' },
  ],
};
export const RULE_SETS: RuleSetView[] = [
  { id: 'rs1', statute: 'IN.PF', jurisdiction: 'IN', version: '2025-v1', validFrom: '2025-04-01', validTo: null, lawVersion: 'EPF Scheme 1952 (amended 2024)', verify: false, source: 'EPFO circular', values: { wageCeiling: 15000, employeeRate: 0.12, employerRate: 0.12 } },
  { id: 'rs2', statute: 'IN.ESI', jurisdiction: 'IN', version: '2025-v1', validFrom: '2025-04-01', validTo: null, lawVersion: 'ESI Act 1948', verify: false, source: 'ESIC notification', values: { wageCeiling: 21000, employeeRate: 0.0075, employerRate: 0.0325 } },
  { id: 'rs3', statute: 'IN.PT', jurisdiction: 'IN-KA', version: '2026-v1', validFrom: '2026-04-01', validTo: null, lawVersion: 'Karnataka PT Act 1976', verify: true, source: 'Karnataka Finance Act 2026', values: { slabs: [{ above: 25000, monthly: 200 }] } },
];
export const COVERAGE: CoverageRow[] = [
  { legalEntityId: 'le-kfpl', statute: 'IN.PF', headcount: 214, threshold: 20, status: 'covered', crossedOn: '2014-04-01', ruleVersion: '2025-v1', evaluatedAt: '2026-10-28T00:30:00Z' },
  { legalEntityId: 'le-kfpl', statute: 'IN.ESI', headcount: 214, threshold: 10, status: 'covered', crossedOn: '2014-04-01', ruleVersion: '2025-v1', evaluatedAt: '2026-10-28T00:30:00Z' },
  { legalEntityId: 'le-tn', statute: 'IN.LWF', headcount: 46, threshold: 50, status: 'approaching', crossedOn: null, ruleVersion: '2026-v1', evaluatedAt: '2026-10-28T00:30:00Z' },
  { legalEntityId: 'le-tn', statute: 'IN.PF', headcount: 46, threshold: 20, status: 'covered', crossedOn: '2019-07-01', ruleVersion: '2025-v1', evaluatedAt: '2026-10-28T00:30:00Z' },
];
export const IMPORT_OK: ImportBatch = { id: 'b1', kind: 'as_paid_lines', rows: 3, valid: 3, errors: [], status: 'staged' };
export const IMPORT_ERRORS: ImportBatch = { id: 'b2', kind: 'as_paid_lines', rows: 3, valid: 2, errors: [{ row: 3, message: 'No employee with the code KF-9999 in this legal entity.' }], status: 'staged' };
export const IMPORT_ROWS = 'employeeCode,month,componentCode,amount\nKF-0142,2026-03,basic,24200\nKF-0142,2026-03,special,18300\nKF-0177,2026-03,basic,16800';
export const GO_LIVE_READY: GoLiveCheck = { fyStart: '2026-04-01', goLiveMonth: '2026-11', ready: true, missing: [] };
export const GO_LIVE_MISSING: GoLiveCheck = { fyStart: '2026-04-01', goLiveMonth: '2026-11', ready: false, missing: [{ employeeCode: 'KF-0177', month: '2026-04' }, { employeeCode: 'KF-0182', month: '2026-04' }] };

// ------------------------------------------------------------------ 5b: components, templates, compensation
const comp = (over: Partial<PayComponent> & { code: string; name: string }): PayComponent => ({
  id: over.code, kind: 'earning', taxable: true, pfWage: true, esiWage: true, ptWage: true, gratuityWage: true, bonusWage: true, codeWagePart: true, codeExclusion: false, prorated: true, onPayslip: true, inCtc: true, prorationText: null, rounding: 'rupee', ledger: null, statutory: null, status: 'active', usedAt: '2026-09-30', version: 1, ...over,
});
export const COMPONENTS: PayComponent[] = [
  comp({ code: 'basic', name: 'Basic', ledger: '5101' }),
  comp({ code: 'hra', name: 'House rent allowance', pfWage: false, codeWagePart: false, codeExclusion: true, ledger: '5102' }),
  comp({ code: 'special', name: 'Special allowance', pfWage: false, ledger: '5103' }),
  comp({ code: 'night_allowance', name: 'Night shift allowance', pfWage: false, usedAt: null }),
  comp({ code: 'pf_employee', name: 'Provident fund (employee)', kind: 'deduction', statutory: 'pf_employee', pfWage: false }),
  comp({ code: 'pt', name: 'Professional tax', kind: 'deduction', statutory: 'pt' }),
  comp({ code: 'pf_employer', name: 'Provident fund (employer)', kind: 'employer', statutory: 'pf_employer' }),
  comp({ code: 'fuel', name: 'Fuel reimbursement', kind: 'reimbursement', taxable: false, pfWage: false, esiWage: false, codeWagePart: false }),
];
export const TEMPLATES: SalaryTemplate[] = [
  { id: 't1', name: 'Staff standard', legalEntityId: null, status: 'active', versions: [{ id: 'v1', version: 1, validFrom: '2025-04-01', codeWageFlag: false, validatedAt: '2025-03-20T05:00:00Z' }, { id: 'v2', version: 2, validFrom: '2026-04-01', codeWageFlag: false, validatedAt: '2026-03-18T05:00:00Z' }] },
  { id: 't2', name: 'Hosur plant workers', legalEntityId: 'le-tn', status: 'active', versions: [{ id: 'v3', version: 1, validFrom: '2026-04-01', codeWageFlag: true, validatedAt: '2026-03-18T05:00:00Z' }] },
];
export const BREAKUP: Breakup = {
  lines: [
    { code: 'basic', name: 'Basic', kind: 'earning', monthly: '24200.00', annual: '290400.00', citation: null },
    { code: 'hra', name: 'House rent allowance', kind: 'earning', monthly: '12100.00', annual: '145200.00', citation: null },
    { code: 'special', name: 'Special allowance', kind: 'earning', monthly: '22400.00', annual: '268800.00', citation: null },
    { code: 'pf_employee', name: 'Provident fund (employee)', kind: 'deduction', monthly: '1800.00', annual: '21600.00', citation: { statute: 'IN.PF', jurisdiction: 'IN', version: '2025-v1', verify: false } },
    { code: 'pt', name: 'Professional tax', kind: 'deduction', monthly: '200.00', annual: '2400.00', citation: { statute: 'IN.PT', jurisdiction: 'IN-KA', version: '2026-v1', verify: true } },
    { code: 'pf_employer', name: 'Provident fund (employer)', kind: 'employer', monthly: '1800.00', annual: '21600.00', citation: { statute: 'IN.PF', jurisdiction: 'IN', version: '2025-v1', verify: false } },
  ],
  monthlyGross: '58700.00',
  monthlyCtc: '60500.00',
  annualCtc: '726000.00',
  codeWageAddBack: '0.00',
  esiCovered: false,
  rounds: 1,
  minWage: { monthly: '14250.00', checked: 'Karnataka, skilled, Bengaluru zone 1', below: false, floorApplied: false },
  verify: true,
};
export const BREAKUP_BELOW: Breakup = { ...BREAKUP, minWage: { monthly: '14250.00', checked: 'Tamil Nadu, unskilled, Hosur', below: true, floorApplied: false }, warnings: ['The pay is below the minimum or floor wage for this place (YX-PAY-22).'] };
export const IN_FORCE: CompensationInForce = {
  validFrom: '2026-04-01',
  validTo: null,
  currency: 'INR',
  annualCtc: '660000.00',
  changeId: 'ch1',
  package: { entryMode: 'ctc', payBasis: 'monthly', rate: null, monthlyGross: '53400.00', codeWageAddBack: '0.00', letterDocumentId: null },
  lines: [
    { code: 'basic', name: 'Basic', kind: 'earning', monthly: '22000.00', annual: '264000.00' },
    { code: 'hra', name: 'House rent allowance', kind: 'earning', monthly: '11000.00', annual: '132000.00' },
    { code: 'special', name: 'Special allowance', kind: 'earning', monthly: '20400.00', annual: '244800.00' },
  ],
};
export const STAT_PROFILE: StatutoryProfile = {
  defaults: { 'IN.PF': 'mandatory', 'IN.ESI': 'by_wage' },
  history: [{ id: 'sp1', validFrom: '2024-04-01', validTo: null, pf: 'yes', eps: true, vpfPercent: '0', pfOnActualWage: false, esi: 'by_wage', ptState: 'IN-KA', reason: 'Joined' }],
};
export const PEOPLE_HITS = [
  { id: 'e-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142' },
  { id: 'e-kavitha', name: 'Kavitha Sundaram', employeeCode: 'KF-0177' },
  { id: 'e-rekha', name: 'Rekha Balan', employeeCode: 'KF-0182' },
];
