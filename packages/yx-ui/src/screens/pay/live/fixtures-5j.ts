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
    workingDaysLeft: 3,
    status: 'open',
    runId: 'r9',
    runReference: 'FNF-2026-0040',
    runStatus: 'draft',
    secondRunId: null,
    net: null,
    items: [
      { id: 'i1', componentCode: 'notice_pay', kind: 'earning', amount: '44000.00', label: 'Notice pay in lieu of notice.', title: 'Notice pay', how: 'Notice pay in lieu of notice.', wage: true, auto: false, claim: false, held: "The establishment has 350 workers: the government's permission for retrenchment is needed first.", heldTag: 'permission needed', inRun: 'r9', byPayroll: false },
      { id: 'i2', componentCode: 'leave_encashment', kind: 'earning', amount: '12100.00', label: 'Earned leave: 12.00 days at ₹1,008.33 a day.', title: 'Leave encashment', how: 'Earned leave: 12.00 days at ₹1,008.33 a day.', wage: true, auto: false, claim: false, held: null, heldTag: null, inRun: 'r9', byPayroll: false },
    ],
    salary: null,
    totals: { earnings: '12100.00', wageLines: '12100.00', recoveries: '0.00', tds: null, statutory: null, rounding: null, net: null, held: '44000.00' },
    gratuity: { eligible: true, years: 5, months: 7, counted: 6, minYears: 5, dueBy: '2026-11-15' },
    payees: [],
    noticeWaived: null,
    version: 2,
  },
  {
    id: 'n2',
    employeeId: 'p1',
    exitType: 'resignation',
    lwd: '2026-10-19',
    deadline: '2026-10-21',
    overdue: false,
    workingDaysLeft: 2,
    status: 'open',
    runId: 'r11',
    runReference: 'FNF-2026-0041',
    runStatus: 'calculated',
    secondRunId: null,
    net: '33440.00',
    items: [
      { id: 'j1', componentCode: 'leave_encashment', kind: 'earning', amount: '8000.00', label: 'Earned leave: 7.50 days at ₹1,066.67 a day.', title: 'Leave encashment', how: 'Earned leave: 7.50 days at ₹1,066.67 a day.', wage: true, auto: false, claim: false, held: null, heldTag: null, inRun: 'r11', byPayroll: false },
      { id: 'j2', componentCode: 'exp_reimb', kind: 'earning', amount: '3450.00', label: null, title: 'Pending reimbursement: Travel to Mysuru', how: 'An approved expense claim not paid yet: it is paid with this settlement.', wage: false, auto: true, claim: true, held: null, heldTag: null, inRun: 'r11', byPayroll: false },
      { id: 'j3', componentCode: 'fnf_recovery', kind: 'deduction', amount: '5000.00', label: 'Expense advance: Delhi trip: Advance not settled by claims or a return', title: 'Expense advance: Delhi trip: Advance not settled by claims or a return', how: 'Recorded in the exit clearance; pulled automatically and refreshed until the run is approved.', wage: false, auto: true, claim: false, held: null, heldTag: null, inRun: 'r11', byPayroll: false },
    ],
    salary: [
      { code: 'basic', name: 'Basic', group: 'earning', amount: '25000.00', how: '₹40000.00 a month × 19 of 31 days.' },
      { code: 'hra', name: 'House rent allowance', group: 'earning', amount: '10000.00', how: '₹16315.79 a month × 19 of 31 days.' },
      { code: 'pf_employee', name: 'Provident fund', group: 'statutory', amount: '1800.00', how: 'Employee PF on the PF wage ₹15000.00.' },
      { code: 'tds', name: 'Income tax (TDS)', group: 'tds', amount: '6210.00', how: 'Tax for the year less tax already deducted, over 1 pay period.' },
    ],
    totals: { earnings: '46450.00', wageLines: '43000.00', recoveries: '5000.00', tds: '6210.00', statutory: '1800.00', rounding: '0.00', net: '33440.00', held: '0.00' },
    gratuity: { eligible: false, years: 2, months: 4, counted: 2, minYears: 5, dueBy: '2026-11-18' },
    payees: [],
    noticeWaived: null,
    version: 4,
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
