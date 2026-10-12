import type { GoLiveReadiness, ParallelRunView } from './golive';
import type { BankFileRow, FilingRow, FnfSettlementView, MyPayslip, PayRun, PayslipDetail, RunPayslip, RunPerson, RunReadiness, RunVariance, StatutoryHub, TdsReturnRow, Worksheet, Recovery } from './types-5j';

// Sample data for the batch 5j screens' stories and tests (Kaveri Foods, September 2026).

export const RUN: PayRun = {
  id: 'r1',
  legalEntityId: 'e1',
  payGroupId: 'g1',
  month: '2026-09',
  runType: 'regular',
  offcycleKind: null,
  status: 'calculated',
  calcVersion: 1,
  totals: { people: 3, gross: '182500.00', deductions: '21640.00', net: '160860.00', employerCost: '201310.00', failed: 0, skipped: 0 },
  approvedAt: null,
  publishedAt: null,
  voidReason: null,
  createdAt: '2026-10-01T05:00:00Z',
  entityName: 'Kaveri Foods Pvt Ltd',
  preparedByMe: true,
  approval: null,
};
export const PEOPLE: RunPerson[] = [
  { employeeId: 'p1', name: 'Arjun Kulkarni', employeeCode: 'KF-0142' },
  { employeeId: 'p2', name: 'Divya Raghunathan', employeeCode: 'KF-0117' },
  { employeeId: 'p3', name: 'Sridhar Fernandes', employeeCode: 'KF-0151' },
];
export const READINESS: RunReadiness = {
  run: RUN,
  people: 3,
  period: 'frozen',
  checks: [
    { id: 'c1', employeeId: 'p3', checkKey: 'bank_missing', severity: 'block', blocks: 'calculation', waivable: true, message: 'Sridhar Fernandes: no salary bank account. Waive it to hold their net pay instead.', waived: false, waiverReason: null },
    { id: 'c2', employeeId: 'p2', checkKey: 'uan_missing', severity: 'warn', blocks: 'calculation', waivable: true, message: 'Divya Raghunathan: no UAN on file.', waived: false, waiverReason: null },
  ],
};
export const PAYSLIPS: RunPayslip[] = [
  { id: 's1', runId: 'r1', employeeId: 'p1', month: '2026-09', status: 'draft', gross: '60500.00', deductions: '5120.00', net: '55380.00', employerCost: '66900.00', verify: false, held: false, paymentStatus: 'pending' },
  { id: 's2', runId: 'r1', employeeId: 'p2', month: '2026-09', status: 'draft', gross: '78000.00', deductions: '6760.00', net: '71240.00', employerCost: '86010.00', verify: true, held: false, paymentStatus: 'pending' },
  { id: 's3', runId: 'r1', employeeId: 'p3', month: '2026-09', status: 'draft', gross: '44000.00', deductions: '9760.00', net: '34240.00', employerCost: '48400.00', verify: false, held: true, paymentStatus: 'pending' },
];
export const DETAIL: PayslipDetail = {
  ...PAYSLIPS[0],
  lines: [
    { code: 'basic', name: 'Basic', kind: 'earning', amount: '30250.00', quantity: null, rate: null, explanation: '₹30,250.00 a month, the full month.', rule: null, verify: false },
    { code: 'hra', name: 'House rent allowance', kind: 'earning', amount: '15125.00', quantity: null, rate: null, explanation: '₹15,125.00 a month, the full month.', rule: null, verify: false },
    { code: 'special', name: 'Special allowance', kind: 'earning', amount: '15125.00', quantity: null, rate: null, explanation: '₹15,125.00 a month, the full month.', rule: null, verify: false },
    { code: 'pf_employee', name: 'Provident fund', kind: 'deduction', amount: '1800.00', quantity: null, rate: null, explanation: 'Employee PF on the PF wage ₹15,000.00 (up to the wage ceiling).', rule: { statute: 'IN.PF', jurisdiction: 'IN', version: '2014-v1' }, verify: false },
    { code: 'pt', name: 'Professional tax', kind: 'deduction', amount: '200.00', quantity: null, rate: null, explanation: 'IN-KA professional tax for this month.', rule: { statute: 'IN.PT', jurisdiction: 'IN-KA', version: '2025-v1' }, verify: true },
    { code: 'tds', name: 'Income tax (TDS)', kind: 'deduction', amount: '3120.00', quantity: null, rate: null, explanation: 'Tax for the year ₹37,440.00 (new regime) less ₹0.00 already deducted, over 12 pay periods.', rule: null, verify: false },
    { code: 'pf_employer', name: 'Provident fund (employer)', kind: 'employer', amount: '550.00', quantity: null, rate: null, explanation: 'Employer share to the provident fund (after the pension part).', rule: null, verify: false },
  ],
};
export const PREVIOUS: PayslipDetail = { ...DETAIL, id: 's0', month: '2026-08', net: '53240.00', lines: DETAIL.lines.map((l) => (l.code === 'special' ? { ...l, amount: '13125.00', explanation: '₹13,125.00 a month, the full month.' } : l.code === 'tds' ? { ...l, amount: '2980.00' } : l)) };
export const VARIANCES: RunVariance[] = [{ id: 'v1', employeeId: 'p2', payslipId: 's2', kind: 'net_change', size: '9100.00', detail: 'Net pay changed by 14.6% (from ₹62,140.00 to ₹71,240.00).', acknowledged: false, note: null }];
export const BANK_FILES: BankFileRow[] = [
  { id: 'b1', fileId: 'f1', generationNo: 1, reason: null, format: 'GENERIC BANKFMT-GENERIC-1', debitAccount: '•••• 5678', rows: 2, total: '126620.00', sha256: '9f2c1a7be41d0c3f5e6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920', status: 'generated', madeByMe: false, releasedAt: null, releasePhrase: 'RELEASE 2' },
];
export const MY_PAYSLIPS: MyPayslip[] = [
  { id: 's1', month: '2026-09', runType: 'regular', gross: '60500.00', deductions: '5120.00', net: '55380.00', paymentStatus: 'paid', verify: false },
  { id: 's0', month: '2026-08', runType: 'regular', gross: '58500.00', deductions: '5260.00', net: '53240.00', paymentStatus: 'paid', verify: false },
];
export const HUB: StatutoryHub = {
  entityId: 'e1',
  month: '2026-09',
  today: '2026-10-12',
  cards: [
    { statute: 'IN.PF', state: null, label: 'Provident fund', amount: '45210.00', dueOn: '2026-10-15', status: 'uploaded', filingId: 'fl1', late: false, penaltyEstimate: null, verifyDueDate: false },
    { statute: 'IN.ESI', state: null, label: 'ESI', amount: '3405.00', dueOn: '2026-10-15', status: 'not_generated', filingId: null, late: false, penaltyEstimate: null, verifyDueDate: false },
    { statute: 'IN.PT', state: 'IN-KA', label: 'Professional tax · IN-KA', amount: '600.00', dueOn: '2026-10-20', status: 'generated', filingId: 'fl2', late: false, penaltyEstimate: null, verifyDueDate: false },
  ],
  tds: { amount: '12840.00', dueOn: '2026-10-07', challanStatus: 'not_prepared', late: true },
};
export const FILINGS: FilingRow[] = [
  { id: 'fl1', statute: 'IN.PF', state: null, kind: 'original', status: 'uploaded', fileId: 'ff1', reference: 'TRRN-5554443' },
  { id: 'fl2', statute: 'IN.PT', state: 'IN-KA', kind: 'original', status: 'generated', fileId: 'ff2', reference: null },
];
export const RETURNS: TdsReturnRow[] = [
  { id: 't1', formCode: '138', taxYear: '2026-27', quarter: 2, kind: 'original', status: 'reconciled', tokenNo: null, fileId: 'ft1', rows: 6, tds: '38520.00', reconciliation: { difference: '0.00' }, validation: { validator: 'filer', ok: false, errors: ['Run the FVU on your computer on the downloaded return and upload the .fvu file it makes.'] } },
];
export const FNF: FnfSettlementView[] = [
  {
    id: 'n1',
    employeeId: 'p3',
    exitType: 'retrenchment',
    lwd: '2026-10-16',
    deadline: '2026-10-21',
    overdue: false,
    status: 'open',
    runId: 'r9',
    runStatus: 'draft',
    secondRunId: null,
    net: null,
    items: [
      { id: 'i1', componentCode: 'notice_pay', amount: '44000.00', label: 'Notice pay in lieu of notice.', held: "The establishment has 350 workers: the government's permission for retrenchment is needed first.", inRun: 'r9', byPayroll: false },
      { id: 'i2', componentCode: 'leave_encashment', amount: '12100.00', label: 'Earned leave: 12.00 days at ₹1,008.33 a day.', held: null, inRun: 'r9', byPayroll: false },
    ],
    payees: [],
    noticeWaived: null,
    version: 2,
  },
];
export const WORKSHEETS: Worksheet[] = [
  {
    id: 'w1',
    employeeId: 'p1',
    source: 'change',
    from: '2026-08',
    to: '2026-08',
    status: 'draft',
    total: '4000.00',
    employerCost: '0.00',
    reason: 'Raise approved late',
    missing: 0,
    createdBy: 'u-other',
    lines: [{ id: 'l1', period: '2026-08', componentCode: 'basic', kind: 'earning', asPaid: '20000.00', corrected: '24000.00', difference: '4000.00', base: 'payslip' }],
  },
];
export const RECOVERIES: Recovery[] = [{ id: 'o1', employeeId: 'p2', originTaxYear: '2025-26', crossYear: true, amount: '3000.00', recovered: '1000.00', balance: '2000.00', instalment: '1000.00', reason: 'Paid twice in March', status: 'active' }];
export const GO_LIVE: GoLiveReadiness = {
  entityId: 'e1',
  people: 7,
  ready: false,
  items: [
    { key: 'registrations', label: 'Statutory registrations recorded', ok: true, detail: 'IN.PF, IN.ESI, IN.PT, IN.TDS' },
    { key: 'banks', label: 'Everyone has a salary bank account', ok: true, detail: '7 of 7' },
    { key: 'uan', label: 'UAN on file', ok: false, detail: '5 of 7 (the PF file lists people by UAN)' },
    { key: 'parallel', label: 'A parallel run signed off', ok: false, detail: 'Pay one month in the old payroll too, upload its register on the run and have someone else sign it off.' },
    { key: 'rules', label: 'Statutory rules marked verify', ok: true, info: true, detail: '31 published rule sets are marked verify.' },
  ],
};
export const PARALLEL: ParallelRunView[] = [
  {
    id: 'pr1',
    runId: 'r1',
    status: 'compared',
    people: 7,
    matched: 6,
    differences: 1,
    rows: [{ employeeCode: 'KF-0117', name: 'Divya Raghunathan', field: 'deductions', ours: '2000.00', theirs: '2200.00', difference: '-200.00' }],
    reason: null,
    createdBy: 'u-other',
    createdAt: '2026-10-05T06:00:00Z',
  },
];
