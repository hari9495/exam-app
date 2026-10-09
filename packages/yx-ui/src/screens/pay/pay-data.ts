// Fictional sample data for the Pay screens (Kaveri Foods Pvt Ltd). Deterministic; no Date.now / Math.random.
import type { PayslipData } from '../../components/print';
import { EMPLOYEES, ENTITIES, LOCATIONS, ME, PAYROLL_ADMIN, HR_ADMIN, PAY_CALENDAR, TODAY } from '../_kit/data';
import { SEPTEMBER } from '../time/time-data';
import type { DayKind, DueItem, ExplainedLine } from './pay-kit';
import { computeTax, emiAmount, emiSchedule, esiContribution, pfContribution, type EwaInput } from './pay-logic';

export const d = (day: number, month = 8, year = 2026) => new Date(year, month, day);

export const FIN_APPROVER = { name: 'Ramesh Krishnan', role: 'Finance Controller', email: 'ramesh.k@kaverifoods.in' };
export const HR_HEAD = { name: 'Anitha Gopal', role: 'Head of People', email: 'anitha.g@kaverifoods.in' };
export { PAYROLL_ADMIN, HR_ADMIN, ME };

export const LETTERHEAD = {
  name: 'Kaveri Foods Pvt Ltd',
  address: ['4th Floor, Prestige Meridian, MG Road', 'Bengaluru 560001, Karnataka'],
  registration: 'CIN U15400KA2011PTC058812 · TAN BLRK04512E',
};
export const LETTERHEAD_TN = {
  name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)',
  address: ['5th floor, Kaveri Towers, Taramani', 'Chennai 600113, Tamil Nadu'],
  registration: 'TAN CHEK07731B',
};

export const ENTITY_KA = ENTITIES[0];
export const ENTITY_TN = ENTITIES[1];
export const CONFIRM_PHRASE = 'KAVERI FOODS SEP 2026';

/** Employee code from the one employee list, so a name means one person on every screen. */
export const codeOf = (name: string, fallback: string) => EMPLOYEES.find((e) => e.name === name)?.code ?? fallback;

/* ------------------------------------------------------------------ Who is in the Karnataka run */

const inKarnataka = (location: string) => LOCATIONS.find((l) => l.name === location)?.state === ENTITY_KA.state;
/** People paid by the Karnataka entity (Bengaluru head office): everyone in the September run, so RUN.employees = entityHeadcount('kf-ka'). */
export const KA_PEOPLE = EMPLOYEES.filter((e) => inKarnataka(e.location));
const at = (e: (typeof EMPLOYEES)[number]) => EMPLOYEES.indexOf(e);
/** Ordinary staff for this run's exceptions: never a department head or a named persona (EMPLOYEES 1–9). */
const STAFF = KA_PEOPLE.filter((e) => at(e) >= 10 && at(e) < 48);
/** Karnataka people from EMPLOYEES 48 on: PAY-10 (payroll-inputs KA_OTHERS) picks its holds and bank exceptions from these. */
export const KA_LATER = KA_PEOPLE.filter((e) => at(e) >= 48);
const ARJUN = KA_PEOPLE.find((e) => e.name === 'Arjun Kulkarni')!;
/** Named exceptions in the run, so PAY-03, PAY-06, PAY-10 and the register show the same people. */
export const RUN_PICKS = {
  lop5: STAFF[0],
  failed: STAFF[1],
  advance: STAFF[2],
  night: STAFF[3],
  exit: STAFF[5],
  bankFailure: STAFF[6],
  disciplinary: STAFF[7],
  released: STAFF[8],
  absconding: KA_LATER[0],
  documents: KA_LATER[1],
};

/* ------------------------------------------------------------------ Loans (before the run: active EMIs are run deductions) */

export interface LoanRow {
  id: string;
  employee: string;
  code: string;
  type: 'Salary advance' | 'Personal loan' | 'Vehicle loan' | 'Emergency loan' | 'EWA (employer-funded)';
  principal: number;
  rate: number;
  emis: number;
  emi: number;
  /** EMIs deducted up to the August run; September's is due on pay day. */
  paid: number;
  outstanding: number;
  start: string;
  status: 'Active' | 'Paused' | 'Closed' | 'Waiting for approval' | 'Pre-closure requested';
  perquisite: boolean;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Named one-time pay, loan and query lines: Karnataka staff from KA_LATER[10] on (PAY-10 uses the first few), so every code belongs to the person named. */
const OTHERS = KA_LATER.slice(10);
const named = (name: string) => EMPLOYEES.find((e) => e.name === name)!;
const person = (e: { name: string; code: string }) => ({ employee: e.name, code: e.code });
const THOMAS = OTHERS[2];
const LOAN_INPUT: Omit<LoanRow, 'emi' | 'outstanding' | 'perquisite'>[] = [
  { id: 'l1', employee: 'Arjun Kulkarni', code: ARJUN.code, type: 'Personal loan', principal: 2_00_000, rate: 6, emis: 24, paid: 8, start: 'Jan 2026', status: 'Active' },
  { id: 'l2', employee: RUN_PICKS.advance.name, code: RUN_PICKS.advance.code, type: 'Salary advance', principal: 30_000, rate: 0, emis: 3, paid: 1, start: 'Aug 2026', status: 'Active' },
  { id: 'l3', ...person(THOMAS), type: 'Vehicle loan', principal: 4_50_000, rate: 7.5, emis: 48, paid: 20, start: 'Jan 2025', status: 'Paused' },
  { id: 'l4', ...person(named('Neha Joshi')), type: 'Emergency loan', principal: 50_000, rate: 0, emis: 10, paid: 10, start: 'Nov 2025', status: 'Closed' },
  { id: 'l5', ...person(OTHERS[9]), type: 'Salary advance', principal: 40_000, rate: 0, emis: 4, paid: 0, start: 'Oct 2026', status: 'Waiting for approval' },
  { id: 'l6', ...person(OTHERS[10]), type: 'Personal loan', principal: 1_00_000, rate: 6, emis: 12, paid: 6, start: 'Mar 2026', status: 'Pre-closure requested' },
];
// Rule 3(7)(i) as amended in 2025: no perquisite when the employee's loans add up to ₹2,00,000 or less.
const loanTotal = (name: string) => LOAN_INPUT.filter((l) => l.employee === name && l.status !== 'Closed').reduce((a, l) => a + l.principal, 0);
/** Outstanding follows each loan's own EMI schedule (emiSchedule), never a typed figure. */
export const LOANS: LoanRow[] = LOAN_INPUT.map((l) => {
  const [mon, yr] = l.start.split(' ');
  const schedule = emiSchedule(l.principal, l.rate, l.emis, MON.indexOf(mon), Number(yr), l.paid);
  return { ...l, emi: emiAmount(l.principal, l.rate, l.emis), outstanding: l.paid ? schedule[l.paid - 1].balance : l.principal, perquisite: l.rate > 0 && loanTotal(l.employee) > 2_00_000 };
});
/** EMIs recovered in this run: active loans, and loans waiting to be pre-closed (their September EMI is still recovered). */
const activeEmi = (name: string) => LOANS.filter((l) => l.employee === name && (l.status === 'Active' || l.status === 'Pre-closure requested')).reduce((a, l) => a + l.emi, 0);

/* ------------------------------------------------------------------ One-time pay (before the run: approved September earnings are in Gross) */

export interface OneTimeRow {
  id: string;
  employee: string;
  code: string;
  type: 'Bonus' | 'Incentive' | 'Recovery' | 'Reimbursement' | 'Arrear' | 'Referral bonus' | 'Joining bonus clawback' | 'Reward payout' | 'Subsistence allowance';
  kind: 'Earning' | 'Deduction';
  amount: number;
  period: string;
  recurring?: string;
  source: 'Manual' | 'Upload' | 'Hiring' | 'Expenses' | 'Performance' | 'Engage' | 'Cases';
  status: 'Draft' | 'Waiting for approval' | 'Approved' | 'Paid' | 'Rejected';
  taxable: boolean;
}
export const ONE_TIME: OneTimeRow[] = [
  { id: 'o1', ...person(ARJUN), type: 'Referral bonus', kind: 'Earning', amount: 25_000, period: 'Sep 2026', source: 'Hiring', status: 'Approved', taxable: true },
  { id: 'o2', ...person(OTHERS[0]), type: 'Incentive', kind: 'Earning', amount: 18_400, period: 'Sep 2026', source: 'Performance', status: 'Approved', taxable: true },
  { id: 'o3', ...person(OTHERS[1]), type: 'Recovery', kind: 'Deduction', amount: 5_000, period: 'Sep 2026', recurring: '1 Jul 2026 – 30 Nov 2026', source: 'Manual', status: 'Approved', taxable: false },
  { id: 'o4', ...person(THOMAS), type: 'Reimbursement', kind: 'Earning', amount: 12_860, period: 'Sep 2026', source: 'Expenses', status: 'Approved', taxable: false },
  { id: 'o5', ...person(OTHERS[3]), type: 'Joining bonus clawback', kind: 'Deduction', amount: 40_000, period: 'Oct 2026', source: 'Hiring', status: 'Waiting for approval', taxable: false },
  { id: 'o6', ...person(named('Meera Iyer')), type: 'Reward payout', kind: 'Earning', amount: 3_000, period: 'Sep 2026', source: 'Engage', status: 'Approved', taxable: true },
  { id: 'o7', ...person(OTHERS[4]), type: 'Bonus', kind: 'Earning', amount: 50_000, period: 'Oct 2026', source: 'Upload', status: 'Draft', taxable: true },
  // Subsistence allowance for the person on the disciplinary hold (h5).
  { id: 'o8', ...person(RUN_PICKS.disciplinary), type: 'Subsistence allowance', kind: 'Earning', amount: 25_600, period: 'Sep 2026', source: 'Cases', status: 'Approved', taxable: true },
  { id: 'o9', ...person(RUN_PICKS.night), type: 'Arrear', kind: 'Earning', amount: 9_750, period: 'Sep 2026', source: 'Manual', status: 'Approved', taxable: true },
  { id: 'o10', ...person(OTHERS[5]), type: 'Incentive', kind: 'Earning', amount: 5_000, period: 'Sep 2026', recurring: '15 Apr 2026 – 15 Mar 2027', source: 'Manual', status: 'Approved', taxable: true },
];
/** Arjun Kulkarni's revision is effective 1 Aug and was approved after the August run, so the August arrear is paid in September. */
export const ARJUN_AUG_ARREAR = 12_350;
/** One-time earnings in the September run (approved, Sep 2026) plus Arjun's August arrear; `taxable` counts only taxable pay. */
const runOneTime = (name: string, taxableOnly = false) =>
  ONE_TIME.filter((o) => o.employee === name && o.kind === 'Earning' && o.period === 'Sep 2026' && o.status === 'Approved' && (!taxableOnly || o.taxable)).reduce((a, o) => a + o.amount, 0) +
  (name === ARJUN.name ? ARJUN_AUG_ARREAR : 0);

/* ------------------------------------------------------------------ Payslip rows for the run */

export type RowStatus = 'Calculated' | 'Flagged' | 'Held' | 'Failed' | 'Acknowledged';
export interface RunRow {
  id: string;
  code: string;
  name: string;
  department: string;
  location: string;
  payableDays: number;
  lop: number;
  /** Includes oneTime. */
  gross: number;
  /** One-time earnings and arrears paid in this run (in gross). The regular month is gross − oneTime. */
  oneTime: number;
  deductions: number;
  net: number;
  prevNet: number;
  employerCost: number;
  status: RowStatus;
  reason?: string;
  mode: 'Bank' | 'Cash' | 'Cheque';
}

const FLAGGED: Record<string, { jump: number; reason: string }> = {
  [ARJUN.id]: { jump: 1.24, reason: 'Revision from 1 Aug; August arrears paid in September' },
  [RUN_PICKS.lop5.id]: { jump: 0.82, reason: '5 days unpaid leave' },
  [RUN_PICKS.night.id]: { jump: 1.15, reason: 'New component: night shift allowance' },
};
const HELD: Record<string, string> = {
  [RUN_PICKS.absconding.id]: 'Absconding: no attendance since 2 Sep',
  [RUN_PICKS.documents.id]: 'Pending documents: bank proof',
  [RUN_PICKS.exit.id]: 'Exit clearance pending',
  [RUN_PICKS.bankFailure.id]: 'Bank failure: August payment returned',
  [RUN_PICKS.disciplinary.id]: 'Disciplinary inquiry open',
};

/**
 * Karnataka payslip lines (the same as payLine() in admin-tax-loans): basic 45 % of gross; PF 12 % of basic to the ₹15,000
 * ceiling; ESI 0.75 % to ₹21,000; PT ₹200 from ₹25,000; TDS from the new-regime projection plus the tax on one-time pay;
 * LOP = gross ÷ 30 × days; EMIs. Statutory lines are on the regular month; approved one-time pay is added to gross.
 */
const BASE_ROWS: RunRow[] = KA_PEOPLE.map((e, i) => {
  const monthly = Math.round(e.ctc / 10) * 10; // sample ctc is monthly
  const regular = Math.round((monthly * 0.92) / 10) * 10;
  const lop = e.id === RUN_PICKS.lop5.id ? 5 : i % 11 === 3 ? 2 : i % 17 === 5 ? 1 : 0;
  const basic = Math.round(regular * 0.45);
  const annualTax = computeTax(regular * 12, 'new').total;
  const regularDed =
    pfContribution(basic, { restrictToCeiling: true }).employee +
    esiContribution(regular).employee +
    (regular >= 25_000 ? 200 : 0) +
    Math.round(annualTax / 12) +
    Math.round((regular / 30) * lop) +
    activeEmi(e.name);
  const oneTime = runOneTime(e.name);
  const oneTimeTax = Math.round(computeTax(regular * 12 + runOneTime(e.name, true), 'new').total - annualTax);
  const gross = regular + oneTime;
  const deductions = regularDed + oneTimeTax;
  const net = gross - deductions;
  const jump = FLAGGED[e.id]?.jump ?? 1 + ((i % 5) - 2) * 0.004;
  const status: RowStatus = HELD[e.id] ? 'Held' : e.id === RUN_PICKS.failed.id ? 'Failed' : FLAGGED[e.id] ? 'Flagged' : 'Calculated';
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    department: e.department,
    location: e.location,
    payableDays: 30 - lop,
    lop,
    gross,
    oneTime,
    deductions,
    net,
    // August from the regular month, so one-time pay shows as part of the change.
    prevNet: Math.round((regular - regularDed) / jump),
    // The month's cost to company: CTC plus one-time pay and arrears (so employer contributions = cost − gross never go negative).
    employerCost: monthly + oneTime,
    status,
    reason: HELD[e.id] ?? (status === 'Failed' ? 'Compensation missing from 1 Sep' : FLAGGED[e.id]?.reason),
    mode: 'Bank',
  };
});
/** Cash: the lowest-paid ordinary staff member with a clean payslip. Cheque: PAY-10's pick (lowest net among KA_LATER from the fifth). */
const CASH_ID = BASE_ROWS.filter((r) => r.status === 'Calculated' && STAFF.some((e) => e.id === r.id)).sort((a, b) => a.gross - a.oneTime - (b.gross - b.oneTime))[0].id;
const CHEQUE_ID = BASE_ROWS.filter((r) => KA_LATER.slice(4).some((e) => e.id === r.id)).sort((a, b) => a.net - b.net)[0].id;

export const RUN_ROWS: RunRow[] = BASE_ROWS.map((r) => ({ ...r, mode: r.id === CASH_ID ? 'Cash' : r.id === CHEQUE_ID ? 'Cheque' : 'Bank' }));

/* ------------------------------------------------------------------ Current run (Karnataka, monthly, Sep 2026) */

const sumOf = (rows: RunRow[], k: 'gross' | 'deductions' | 'net' | 'employerCost' | 'prevNet') => rows.reduce((a, r) => a + r[k], 0);
const BANK_FILE_ROWS = RUN_ROWS.filter((r) => r.mode === 'Bank' && r.status !== 'Held' && r.status !== 'Failed');
const SEP_GROSS = sumOf(RUN_ROWS, 'gross');
const SEP_NET = sumOf(RUN_ROWS, 'net');

/** Earlier months, scaled to this run's totals (the trend's shape is fixed; its last point is the run). */
const TREND = [
  { month: 'Apr', gross: 0.9501, net: 0.951, joinersSince: 6 },
  { month: 'May', gross: 0.9561, net: 0.9559, joinersSince: 5 },
  { month: 'Jun', gross: 0.9659, net: 0.9649, joinersSince: 4 },
  { month: 'Jul', gross: 0.9758, net: 0.9753, joinersSince: 2 },
  { month: 'Aug', gross: 0.9884, net: 0.9874, joinersSince: 1 },
  { month: 'Sep', gross: 1, net: 1, joinersSince: 0 },
];

export const RUN = {
  id: 'RUN-KA-2026-09',
  name: 'September 2026 · Monthly · Karnataka',
  period: 'September 2026',
  periodShort: 'Sep 2026',
  payGroup: 'Monthly · Kaveri Foods Pvt Ltd (Karnataka)',
  employees: RUN_ROWS.length,
  cutOff: PAY_CALENDAR.cutOff,
  payDate: PAY_CALENDAR.payDate,
  gross: SEP_GROSS,
  deductions: sumOf(RUN_ROWS, 'deductions'),
  net: SEP_NET,
  employerCost: sumOf(RUN_ROWS, 'employerCost'),
  lastEmployerCost: Math.round(sumOf(RUN_ROWS, 'employerCost') * 0.9884),
  lastNet: Math.round(SEP_NET * 0.9874),
  lastGross: Math.round(SEP_GROSS * 0.9884),
  /** Payslips on hold (the open holds on PAY-06). */
  withheld: RUN_ROWS.filter((r) => r.status === 'Held').length,
  heldNet: sumOf(
    RUN_ROWS.filter((r) => r.status === 'Held'),
    'net',
  ),
  /** Payslips that failed to calculate: left out of the bank file until fixed. */
  failed: RUN_ROWS.filter((r) => r.status === 'Failed').length,
  cashCheque: RUN_ROWS.filter((r) => r.mode !== 'Bank').length,
  /** Payments in the September bank file: employees − held − failed − cash or cheque. */
  inBankFile: BANK_FILE_ROWS.length,
  bankFileTotal: sumOf(BANK_FILE_ROWS, 'net'),
};

/** Past runs for the home trend and run list. */
export const RUN_HISTORY = TREND.map((t) => ({
  month: t.month,
  gross: Math.round(SEP_GROSS * t.gross),
  net: Math.round(SEP_NET * t.net),
  employees: RUN.employees - t.joinersSince,
}));

/** Compliance stories the due items open (DueDateStrip links them with target="_top"). */
const STORY_HREF = {
  statutoryHub: '/?path=/story/screens-compliance-cmp-01-·-statutory-hub--cards',
  registers: '/?path=/story/screens-compliance-cmp-03-·-statutory-registers--epf',
};
export const DUE_ITEMS: DueItem[] = [
  { id: 'tds', statute: 'TDS', what: 'TDS challan for August salaries', due: d(7), status: 'done' },
  { id: 'pf', statute: 'PF', what: 'PF return and payment for August', due: d(15), status: 'done' },
  { id: 'esi', statute: 'ESI', what: 'ESI contribution for August', due: d(15), status: 'done' },
  { id: 'pt', statute: 'Professional tax (Karnataka)', what: 'Professional tax return for August', due: d(20), status: 'overdue', penalty: 1_250, action: { label: 'File PT return', href: STORY_HREF.statutoryHub } },
  { id: 'reg', statute: 'Registers', what: 'Sign off August registers, Bengaluru head office', due: d(30), status: 'due', action: { label: 'Sign off registers', href: STORY_HREF.registers } },
  { id: 'tds2', statute: 'TDS', what: 'TDS challan for September salaries', due: d(7, 9), status: 'not-due' },
  { id: 'f138', statute: 'Form 138', what: 'Q2 salary TDS return (Jul–Sep)', due: d(31, 9), status: 'not-due' },
];

/* ------------------------------------------------------------------ My payslip (Divya, Tamil Nadu entity) */

/** Divya's one unpaid day in September: 15 Sep, a working day with no attendance (Time marks it absent). */
export const MY_LOP_DAY = 15;

export const MY_PAYSLIP: PayslipData = {
  company: LETTERHEAD_TN,
  period: 'September 2026',
  payDate: PAY_CALENDAR.payDate,
  employee: {
    name: ME.name,
    code: ME.code,
    designation: ME.role,
    department: ME.department,
    location: ME.location,
    joinedOn: new Date(2021, 5, 14),
    pan: 'AKRPD4821K',
    uan: '100934561278',
    bankName: 'Cauvery Co-operative Bank',
    accountNumber: '004521000018834',
  },
  paidDays: 29,
  lopDays: 1,
  earnings: [
    { label: 'Basic', amount: 60_000, ytd: 3_60_000 },
    { label: 'House rent allowance', amount: 30_000, ytd: 1_80_000 },
    { label: 'Special allowance', amount: 44_915, ytd: 2_69_490 },
    { label: 'Leave travel allowance', amount: 5_000, ytd: 30_000 },
  ],
  deductions: [
    { label: 'Provident fund (employee)', amount: 7_200, ytd: 43_200 },
    { label: 'Professional tax (Tamil Nadu, half-yearly)', amount: 1_250, ytd: 1_250 },
    { label: 'Income tax (TDS)', amount: 10_105, ytd: 79_349 },
    { label: `Unpaid leave, 1 day (${MY_LOP_DAY} Sep)`, amount: 4_664, ytd: 4_664 },
  ],
  employer: [
    { label: 'Provident fund (company)', amount: 7_200 },
    { label: 'Gratuity provision', amount: 3_363 },
  ],
  // 11 × ₹1,39,915 + May ₹2,13,579 (with the referral bonus) − 1 unpaid day ₹4,664 = ₹17,47,980; computeTax (new regime) ₹1,39,980.
  tax: { regime: 'new regime', projectedIncome: 17_47_980, projectedTax: 1_39_980, deductedToDate: 79_349 },
};

export const MY_NET = 1_16_696;
export const MY_GROSS = 1_39_915;
export const MY_DEDUCTIONS = 23_219;
export const MY_PREV_NET = 1_21_315;
/** TDS deducted April–August; the sum is MY_TAX.deducted (₹69,244). May includes tax on the referral bonus. */
export const MY_TDS_BY_MONTH = [12_160, 21_364, 12_160, 12_160, 11_400];
/** May 2026 referral bonus: the one-off income that takes MY_TAX.projectedGross above 12 months of salary. */
export const MY_MAY_REFERRAL_BONUS = 73_664;

export const MY_LINES: ExplainedLine[] = [
  { id: 'basic', label: 'Basic', amount: 60_000, kind: 'earning', formula: 'ctc × 40% ÷ 12', inputs: 'CTC ₹18,00,000 from 1 Apr 2026', rule: 'Template India standard CTC v3', ytd: 3_60_000 },
  { id: 'hra', label: 'House rent allowance', amount: 30_000, kind: 'earning', formula: 'basic × 50%', inputs: 'Basic ₹60,000; metro city (Chennai)', rule: 'Template India standard CTC v3', ytd: 1_80_000 },
  { id: 'spl', label: 'Special allowance', amount: 44_915, kind: 'earning', formula: 'ctc ÷ 12 − other components − employer PF − gratuity', inputs: '₹1,50,000 − ₹95,000 − ₹7,200 − ₹2,885 (gratuity as set in the CTC template, on basic)', rule: 'Template India standard CTC v3', ytd: 2_69_490 },
  { id: 'lta', label: 'Leave travel allowance', amount: 5_000, kind: 'earning', formula: 'fixed ₹5,000 a month', rule: 'Template India standard CTC v3', ytd: 30_000 },
  { id: 'pf', label: 'Provident fund (employee)', amount: 7_200, kind: 'deduction', formula: 'pf_employee(pf_wage) = 12% × ₹60,000', inputs: 'PF wage ₹60,000 (basic pay)', rule: 'IN.PF v2025-11', ytd: 43_200 },
  { id: 'pt', label: 'Professional tax', amount: 1_250, kind: 'deduction', formula: 'Half-yearly slab, deducted in September', inputs: 'Work state Tamil Nadu; half-year income above ₹75,000', rule: 'IN.PT Tamil Nadu v2024-10', source: 'Work location history', ytd: 1_250 },
  { id: 'tds', label: 'Income tax (TDS)', amount: 10_105, kind: 'deduction', formula: '(projected tax ₹1,39,980 − deducted ₹69,244) ÷ 7 remaining months', inputs: 'New regime; projected income ₹17,47,980, including the May referral bonus ₹73,664 and after 1 unpaid day (standard deduction ₹75,000)', rule: 'IN.TDS 2025 Act · v2026-04', source: 'Tax workspace', ytd: 79_349 },
  { id: 'lop', label: 'Unpaid leave, 1 day', amount: 4_664, kind: 'deduction', segment: `${MY_LOP_DAY} Sep`, formula: 'gross ₹1,39,915 × 1 ÷ 30', inputs: `1 unpaid day on ${MY_LOP_DAY} Sep (absent, no leave applied)`, rule: 'Day basis: calendar days (company policy)', source: `Attendance ${MY_LOP_DAY} Sep, confirmed by ${ME.manager}`, ytd: 4_664 },
  { id: 'epf', label: 'Provident fund (company)', amount: 7_200, kind: 'employer', formula: '12% × PF wage; EPS ₹1,250 on the ₹15,000 ceiling, EPF ₹5,950', rule: 'IN.PF v2025-11' },
  { id: 'grat', label: 'Gratuity provision', amount: 3_363, kind: 'employer', formula: 'gratuity wage × 15 ÷ 26 ÷ 12', inputs: 'Gratuity wage ₹69,957: basic ₹60,000 is below half of gross ₹1,39,915, so the Code adds back ₹9,957', rule: 'IN.SS-CODE gratuity v2025-11' },
];

/** Days strip for September (Divya), from Time's September attendance; payroll pays the days after the cut-off in full. */
const DAY_KIND: Partial<Record<string, DayKind>> = { WO: 'off', H: 'holiday', CL: 'leave', HD: 'leave', EL: 'leave', SL: 'leave', LWP: 'lop', A: 'lop' };
export const MY_DAYS: { day: number; kind: DayKind }[] = SEPTEMBER.map((x) => {
  const day = x.date.getDate();
  return { day, kind: day === MY_LOP_DAY ? 'lop' : (DAY_KIND[x.code] ?? 'paid') };
});

const paidBy = (date: Date) => (date.getTime() <= TODAY.getTime() ? 'Paid' : `Pays on ${date.getDate()} ${MON[date.getMonth()]}`);
export const PAYSLIP_HISTORY = [
  { id: 'sep', period: 'September 2026', net: MY_NET, gross: MY_GROSS, paidOn: PAY_CALENDAR.payDate, status: paidBy(PAY_CALENDAR.payDate) },
  { id: 'aug', period: 'August 2026', net: MY_PREV_NET, gross: 1_39_915, paidOn: d(31, 7), status: 'Published' },
  { id: 'jul', period: 'July 2026', net: 1_20_555, gross: 1_39_915, paidOn: d(31, 6), status: 'Published' },
  { id: 'jun', period: 'June 2026', net: 1_20_555, gross: 1_39_915, paidOn: d(30, 5), status: 'Published' },
  { id: 'may', period: 'May 2026', net: 1_85_015, gross: 2_13_579, paidOn: d(29, 4), status: 'Published' },
  { id: 'apr', period: 'April 2026', net: 1_20_555, gross: 1_39_915, paidOn: d(30, 3), status: 'Published' },
];

/* ------------------------------------------------------------------ Tax workspace (Divya) */

export const MY_TAX = {
  taxYear: 'Tax year 2026-27',
  projectedGross: 17_47_980,
  deducted: MY_TDS_BY_MONTH.reduce((a, x) => a + x, 0),
  remaining: 7,
  regime: 'new' as const,
  regimeCutOff: d(31, 9),
  proofWindow: { from: d(1, 8), to: d(28, 1, 2027) },
  residential: 'Resident',
};

export interface DeclLine {
  id: string;
  section: string;
  item: string;
  declared: number;
  proof: 'Not due' | 'Uploaded' | 'Approved' | 'Rejected' | 'Partly approved';
  approved?: number;
  comment?: string;
}
export const MY_DECLARATIONS: DeclLine[] = [
  { id: 'd1', section: '80C-equivalent', item: 'Public provident fund', declared: 60_000, proof: 'Not due' },
  { id: 'd2', section: '80C-equivalent', item: 'ELSS mutual fund', declared: 50_000, proof: 'Not due' },
  { id: 'd3', section: '80C-equivalent', item: 'Life insurance premium', declared: 40_000, proof: 'Not due' },
  { id: 'd4', section: '80D-equivalent', item: 'Health insurance, self and family', declared: 25_000, proof: 'Not due' },
  { id: 'd5', section: '80D-equivalent', item: 'Health insurance, parents (senior citizens)', declared: 30_000, proof: 'Not due' },
  { id: 'd6', section: 'NPS (own)', item: 'NPS Tier I', declared: 50_000, proof: 'Not due' },
  { id: 'd7', section: 'HRA', item: 'Rent, Adyar, Chennai (₹32,000 a month; landlord PAN given)', declared: 3_84_000, proof: 'Not due' },
];

/* ------------------------------------------------------------------ Proof verification queue (PAY-23) */

export interface ProofRow {
  id: string;
  employee: string;
  code: string;
  section: string;
  item: string;
  declared: number;
  proofAmount: number;
  files: number;
  status: 'Waiting' | 'Approved' | 'Rejected' | 'Partly approved';
  submitted: Date;
  approved?: number;
  comment?: string;
}
const PROOF_ITEMS = [
  ['80C-equivalent', 'Public provident fund', 1_50_000],
  ['HRA', 'Rent receipts, Apr–Sep', 1_80_000],
  ['80D-equivalent', 'Health insurance, parents', 50_000],
  ['Home loan interest', 'Interest certificate, self-occupied', 1_85_000],
  ['NPS (own)', 'NPS Tier I statement', 50_000],
  ['80C-equivalent', 'Children tuition fees', 72_000],
] as const;
/** Submitted inside the proof window (from 1 Sep 2026) and on or before today; the last line is the payroll admin's own (PAY-23 own-proof story). */
export const PROOF_ROWS: ProofRow[] = [
  ...EMPLOYEES.slice(10, 34).map((e, i): ProofRow => {
  const [section, item, declared] = PROOF_ITEMS[i % PROOF_ITEMS.length];
  const status: ProofRow['status'] = i % 7 === 2 ? 'Approved' : i % 9 === 4 ? 'Rejected' : i % 8 === 5 ? 'Partly approved' : 'Waiting';
  return {
    id: `pr${i}`,
    employee: e.name,
    code: e.code,
    section,
    item,
    declared,
    proofAmount: i % 4 === 1 ? declared - 12_000 : declared,
    files: 1 + (i % 3),
    status,
    submitted: d(1 + ((i * 3) % 28)),
    approved: status === 'Partly approved' ? declared - 12_000 : status === 'Approved' ? declared : undefined,
    comment: status === 'Rejected' ? 'Receipt is not signed by the landlord' : status === 'Partly approved' ? 'Two months of receipts missing' : undefined,
  };
  }),
  { id: 'pr-own', ...person(named(PAYROLL_ADMIN.name)), section: '80C-equivalent', item: 'Public provident fund', declared: 1_50_000, proofAmount: 1_50_000, files: 1, status: 'Waiting', submitted: d(24) },
];

/* ------------------------------------------------------------------ Holds, one-time pay, LOP */

export interface HoldRow {
  id: string;
  employee: string;
  code: string;
  reason: 'Absconding' | 'Pending documents' | 'Disciplinary' | 'Bank failure' | 'Exit clearance' | 'Other';
  trigger: 'Automatic' | 'Manual';
  since: Date;
  ageDays: number;
  amount: number;
  runs: number;
  status: 'On hold' | 'Release requested' | 'Released';
  note: string;
}
const rowOf = (e: { id: string }) => RUN_ROWS.find((r) => r.id === e.id)!;
const ageOf = (since: Date) => Math.round((TODAY.getTime() - since.getTime()) / 86_400_000);
const hold = (id: string, e: { id: string }, rest: Omit<HoldRow, 'id' | 'employee' | 'code' | 'amount' | 'ageDays'> & { amount?: number }): HoldRow => {
  const r = rowOf(e);
  return { id, employee: r.name, code: r.code, ageDays: ageOf(rest.since), ...rest, amount: rest.amount ?? r.net };
};
/** Open holds are exactly the Held payslips of the September run (RUN.withheld); h6 was released and is paid in this run. */
export const HOLDS: HoldRow[] = [
  hold('h1', RUN_PICKS.absconding, { reason: 'Absconding', trigger: 'Automatic', since: d(2), runs: 1, status: 'On hold', note: 'Absconding timeline started 2 Sep (M01)' }),
  hold('h2', RUN_PICKS.documents, { reason: 'Pending documents', trigger: 'Manual', since: d(18), runs: 1, status: 'Release requested', note: 'Bank proof uploaded 28 Sep, waiting for verification' }),
  hold('h3', RUN_PICKS.exit, { reason: 'Exit clearance', trigger: 'Automatic', since: d(26), runs: 1, status: 'On hold', note: 'Laptop not returned' }),
  hold('h4', RUN_PICKS.bankFailure, { reason: 'Bank failure', trigger: 'Automatic', since: d(1, 7), runs: 2, status: 'On hold', note: 'August payment returned: account closed' }),
  hold('h5', RUN_PICKS.disciplinary, { reason: 'Disciplinary', trigger: 'Manual', since: d(4, 6), runs: 3, status: 'On hold', note: 'Inquiry open; subsistence allowance paid monthly' }),
  hold('h6', RUN_PICKS.released, { reason: 'Other', trigger: 'Manual', since: d(3, 7), runs: 2, status: 'Released', note: 'Released in September run' }),
];

export interface LopRow {
  id: string;
  employee: string;
  code: string;
  group: string;
  lop: number;
  payable: number;
  reason: string;
  source: 'Manual' | 'Upload';
  enteredBy: string;
  error?: string;
}
export const LOP_ROWS: LopRow[] = EMPLOYEES.slice(60, 78).map((e, i) => {
  const lop = [0, 1, 0, 2, 0, 0, 3, 0, 1, 0, 0, 0.5, 0, 0, 4, 0, 1, 0][i];
  return {
    id: e.id,
    employee: e.name,
    code: e.code,
    group: 'Sales field staff (Assumed present)',
    lop,
    payable: 30 - lop,
    reason: lop ? ['Absent, informed manager', 'Unapproved absence', 'Half day, personal work', 'Absent after leave balance ran out'][i % 4] : '',
    source: i % 3 === 0 ? 'Upload' : 'Manual',
    enteredBy: HR_ADMIN.name,
    error: i === 14 ? 'LOP days (4) include 3 Sep, before the joining date 5 Sep. Enter 3 or fewer.' : undefined,
  };
});

/* ------------------------------------------------------------------ Payments & files */

export interface PaymentRow {
  id: string;
  employee: string;
  code: string;
  bank: string;
  account: string;
  ifsc: string;
  amount: number;
  mode: 'Bank' | 'Cash' | 'Cheque';
  status: 'Pending' | 'Paid' | 'Failed' | 'Returned' | 'Held';
  reason?: string;
  reference?: string;
}
const BANKS = [
  { name: 'Cauvery Co-operative Bank', ifsc: 'CCOB0000452' },
  { name: 'Deccan Gramin Bank', ifsc: 'DGBK0001187' },
  { name: 'Malabar Commercial Bank', ifsc: 'MCBL0000093' },
];
/** Every run row's payment, before pay day (30 Sep): bank details match PAY-10 (same order, same accounts); nothing is paid yet. */
export const PAYMENTS: PaymentRow[] = RUN_ROWS.map((r, i) => ({
  id: r.id,
  employee: r.name,
  code: r.code,
  bank: BANKS[i % 3].name,
  account: `00${4512 + i * 37}0000${1880 + i}`,
  ifsc: BANKS[i % 3].ifsc,
  amount: r.net,
  mode: r.mode,
  status: r.status === 'Held' || r.status === 'Failed' ? 'Held' : 'Pending',
  reason: r.status === 'Held' ? r.reason : r.status === 'Failed' ? `Not paid · calculation failed: ${r.reason}` : undefined,
}));

/* ------------------------------------------------------------------ Queries */

export interface QueryRow {
  id: string;
  employee: string;
  code: string;
  payslip: string;
  line: string;
  text: string;
  raised: Date;
  status: 'New' | 'In progress' | 'Waiting for employee' | 'Resolved';
  assignee: string;
}
/** Raised at a time of day (the queue shows when). The SLA due date is worked out from `raised` by the screen. */
const raisedAt = (day: number, h: number, min: number, month = 8) => new Date(2026, month, day, h, min);
export const QUERIES: QueryRow[] = [
  { id: 'q1', employee: ME.name, code: ME.code, payslip: 'Sep 2026', line: 'Unpaid leave, 1 day', text: `Why is ${MY_LOP_DAY} Sep unpaid? I forgot to apply leave that day.`, raised: raisedAt(29, 8, 52), status: 'New', assignee: 'Unassigned' },
  { id: 'q2', ...person(ARJUN), payslip: 'Sep 2026', line: 'Income tax (TDS)', text: 'TDS went up by ₹2,100 this month. I did not change anything.', raised: raisedAt(28, 11, 5), status: 'In progress', assignee: PAYROLL_ADMIN.name },
  { id: 'q3', ...person(OTHERS[6]), payslip: 'Aug 2026', line: 'Whole payslip', text: 'My August salary has not reached my account.', raised: raisedAt(2, 10, 18), status: 'Waiting for employee', assignee: PAYROLL_ADMIN.name },
  { id: 'q4', ...person(RUN_PICKS.night), payslip: 'Sep 2026', line: 'Night shift allowance', text: 'Night shift allowance is for 8 nights, I worked 11.', raised: raisedAt(29, 7, 40), status: 'New', assignee: 'Unassigned' },
  { id: 'q5', ...person(OTHERS[7]), payslip: 'Jul 2026', line: 'Provident fund', text: 'PF is on full basic; I opted for the ₹15,000 ceiling.', raised: raisedAt(8, 15, 30, 7), status: 'Resolved', assignee: PAYROLL_ADMIN.name },
  { id: 'q6', ...person(OTHERS[8]), payslip: 'Sep 2026', line: 'Professional tax', text: 'PT deducted twice after my transfer to Chennai?', raised: raisedAt(27, 16, 12), status: 'In progress', assignee: 'Priya Nair' },
];
/** Open queries: the Queries badge in the Pay panel. */
export const OPEN_QUERIES = QUERIES.filter((q) => q.status !== 'Resolved').length;
/** Proof lines waiting for review: the Tax centre badge in the Pay panel. */
export const PROOFS_WAITING = PROOF_ROWS.filter((r) => r.status === 'Waiting').length;

/* ------------------------------------------------------------------ EWA draws */

export interface EwaDraw {
  id: string;
  employee: string;
  code: string;
  requested: Date;
  amount: number;
  fee: number;
  feePayer: 'Employee' | 'Company';
  earnedToDate: number;
  status: 'Disbursed' | 'Failed' | 'Recovered' | 'Requested';
  recovery: string;
  remittance: 'Not due' | 'In bank file' | 'Remitted' | 'Shortfall';
}
/** Fee payer follows the EWA policy (EWA_STARTER: the employee pays the fee). */
export const EWA_DRAWS: EwaDraw[] = EMPLOYEES.slice(90, 104).map((e, i) => ({
  id: `ew${i}`,
  employee: e.name,
  code: e.code,
  requested: d(3 + i, 8),
  amount: [5_000, 3_000, 6_500, 2_000, 4_000, 8_000, 1_500, 5_000, 2_500, 3_500, 6_000, 1_000, 4_500, 7_000][i],
  fee: 49,
  feePayer: 'Employee',
  earnedToDate: [12_400, 9_800, 15_200, 6_100, 10_900, 19_700, 4_300, 12_000, 7_800, 9_100, 14_600, 3_500, 11_200, 16_900][i],
  status: i === 6 ? 'Failed' : i === 13 ? 'Requested' : 'Disbursed',
  recovery: 'September 2026 run',
  remittance: i === 13 || i === 6 ? 'Not due' : 'In bank file',
}));
/** The signed-in employee's earned wage access position today: one source for PAY-26 and the mobile home card (ewaAvailable(EWA_STARTER, EWA_INPUT)). */
export const EWA_INPUT: EwaInput = { expectedNet: 30_000, periodDays: 30, daysEarned: 12, drawnThisPeriod: 0, drawsThisPeriod: 0, dueDeductions: 0, daysToCutOff: 13, confirmed: true };
/** Partner remittance in the September bank file: disbursed draws only. */
export const EWA_REMITTANCE = EWA_DRAWS.filter((x) => x.status === 'Disbursed').reduce((a, x) => a + x.amount, 0);

/* ------------------------------------------------------------------ Component library */

export interface ComponentRow {
  id: string;
  name: string;
  code: string;
  type: 'Earning' | 'Deduction' | 'Employer contribution' | 'Reimbursement' | 'Informational';
  taxable: boolean;
  pf: boolean;
  esi: boolean;
  pt: boolean;
  gratuity: boolean;
  bonus: boolean;
  codeWage: boolean;
  prorated: boolean;
  onPayslip: boolean;
  usedIn: number;
  statutory?: boolean;
}
export const COMPONENTS: ComponentRow[] = [
  { id: 'c1', name: 'Basic', code: 'BASIC', type: 'Earning', taxable: true, pf: true, esi: true, pt: true, gratuity: true, bonus: true, codeWage: true, prorated: true, onPayslip: true, usedIn: 4 },
  { id: 'c2', name: 'Dearness allowance', code: 'DA', type: 'Earning', taxable: true, pf: true, esi: true, pt: true, gratuity: true, bonus: true, codeWage: true, prorated: true, onPayslip: true, usedIn: 1 },
  { id: 'c3', name: 'House rent allowance', code: 'HRA', type: 'Earning', taxable: true, pf: false, esi: true, pt: true, gratuity: false, bonus: false, codeWage: false, prorated: true, onPayslip: true, usedIn: 4 },
  { id: 'c4', name: 'Special allowance', code: 'SPL', type: 'Earning', taxable: true, pf: false, esi: true, pt: true, gratuity: false, bonus: false, codeWage: false, prorated: true, onPayslip: true, usedIn: 4 },
  { id: 'c5', name: 'Leave travel allowance', code: 'LTA', type: 'Earning', taxable: true, pf: false, esi: true, pt: true, gratuity: false, bonus: false, codeWage: false, prorated: true, onPayslip: true, usedIn: 2 },
  { id: 'c6', name: 'Night shift allowance', code: 'NSA', type: 'Earning', taxable: true, pf: false, esi: true, pt: true, gratuity: false, bonus: false, codeWage: false, prorated: false, onPayslip: true, usedIn: 1 },
  { id: 'c7', name: 'Meal card', code: 'MEAL', type: 'Reimbursement', taxable: false, pf: false, esi: false, pt: false, gratuity: false, bonus: false, codeWage: false, prorated: false, onPayslip: true, usedIn: 2 },
  { id: 'c8', name: 'Provident fund (employee)', code: 'PF_EE', type: 'Deduction', taxable: false, pf: false, esi: false, pt: false, gratuity: false, bonus: false, codeWage: false, prorated: false, onPayslip: true, usedIn: 4, statutory: true },
  { id: 'c9', name: 'ESI (employee)', code: 'ESI_EE', type: 'Deduction', taxable: false, pf: false, esi: false, pt: false, gratuity: false, bonus: false, codeWage: false, prorated: false, onPayslip: true, usedIn: 3, statutory: true },
  { id: 'c10', name: 'Professional tax', code: 'PT', type: 'Deduction', taxable: false, pf: false, esi: false, pt: false, gratuity: false, bonus: false, codeWage: false, prorated: false, onPayslip: true, usedIn: 4, statutory: true },
  { id: 'c11', name: 'Provident fund (company)', code: 'PF_ER', type: 'Employer contribution', taxable: false, pf: false, esi: false, pt: false, gratuity: false, bonus: false, codeWage: false, prorated: false, onPayslip: true, usedIn: 4, statutory: true },
  { id: 'c12', name: 'Gratuity provision', code: 'GRAT', type: 'Employer contribution', taxable: false, pf: false, esi: false, pt: false, gratuity: false, bonus: false, codeWage: false, prorated: false, onPayslip: false, usedIn: 4 },
  { id: 'c13', name: 'Court attachment', code: 'COURT', type: 'Deduction', taxable: false, pf: false, esi: false, pt: false, gratuity: false, bonus: false, codeWage: false, prorated: false, onPayslip: true, usedIn: 0 },
  { id: 'c14', name: 'Earned wage access recovery', code: 'EWA_REC', type: 'Deduction', taxable: false, pf: false, esi: false, pt: false, gratuity: false, bonus: false, codeWage: false, prorated: false, onPayslip: true, usedIn: 1 },
  { id: 'c15', name: 'Union dues (check-off)', code: 'UNION', type: 'Deduction', taxable: false, pf: false, esi: false, pt: false, gratuity: false, bonus: false, codeWage: false, prorated: false, onPayslip: true, usedIn: 1 },
  { id: 'c16', name: 'Perquisite: concessional loan', code: 'PERQ_LOAN', type: 'Informational', taxable: true, pf: false, esi: false, pt: false, gratuity: false, bonus: false, codeWage: false, prorated: false, onPayslip: true, usedIn: 1 },
];

/* ------------------------------------------------------------------ On-call (Hosur maintenance standby; PAY-35 and TIM-38) */

/** One source for the standby rules that Pay (PAY-35) and Time (TIM-38) both show. */
export const ON_CALL_RULES = { standbyPerSlot: 300, hourlyRate: 420, minimumHours: 2, weekdayMultiplier: 1.5, holidayMultiplier: 2 };

/** One source for the sales commission plan that PAY-32 (plan builder) and PAY-33 (my incentive statement) both show. */
export const SALES_COMMISSION_PLAN = {
  name: 'Sales commission South 2026-27',
  quota: 24_00_000,
  cap: 1_50_000,
  clawbackDays: 90,
  tiers: [
    { fromPct: 0, ratePct: 0 },
    { fromPct: 80, ratePct: 1.5 },
    { fromPct: 100, ratePct: 2.5 },
    { fromPct: 125, ratePct: 3 },
  ],
};

export const PANEL_TODAY = d(29);
export const TODAY_LABEL = 'Tue 29 Sep 2026';
