// Fictional sample data for the YukthiX internal console (YX-01…18). Tenants, partners and staff are invented.
import type { SlabRow } from './portals-logic';

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

export const STAFF = { me: 'Anand Iyer', reviewer: 'Farah Siddiqui', others: ['Farah Siddiqui', 'Rahul Menon', 'Kavitha Rao', 'Joseph Thomas'] };

/* ------------------------------------------------------------------ YX-01 … 03 statutory rules */

export interface RuleSet {
  id: string;
  statute: string;
  jurisdiction: string;
  shape: 'Slab' | 'Rate' | 'List' | 'Calendar';
  version: string;
  validFrom: Date;
  validTo: Date | null;
  status: 'draft' | 'in review' | 'published' | 'withdrawn';
  lawVersion: string;
  transitional: boolean;
  draftedBy: string;
  reviewedBy: string | null;
  changeNote: string;
}

export const RULE_SETS: RuleSet[] = [
  { id: 'rs1', statute: 'IN.PT', jurisdiction: 'Karnataka', shape: 'Slab', version: 'v2027-04', validFrom: d(2027, 4, 1), validTo: null, status: 'draft', lawVersion: 'Karnataka Tax on Professions Act', transitional: false, draftedBy: 'Anand Iyer', reviewedBy: null, changeNote: 'Threshold raised from ₹25,000 to ₹30,000 a month (notification of 12 Sep 2026).' },
  { id: 'rs2', statute: 'IN.PT', jurisdiction: 'Karnataka', shape: 'Slab', version: 'v2026-04', validFrom: d(2026, 4, 1), validTo: d(2027, 3, 31), status: 'published', lawVersion: 'Karnataka Tax on Professions Act', transitional: false, draftedBy: 'Kavitha Rao', reviewedBy: 'Anand Iyer', changeNote: 'Annual review; no change in slabs.' },
  { id: 'rs3', statute: 'IN.PF', jurisdiction: 'India', shape: 'Rate', version: 'v2025-11', validFrom: d(2025, 11, 21), validTo: null, status: 'published', lawVersion: 'IN.SS-CODE', transitional: false, draftedBy: 'Rahul Menon', reviewedBy: 'Farah Siddiqui', changeNote: 'Social Security Code in force.' },
  { id: 'rs4', statute: 'IN.TDS', jurisdiction: 'India', shape: 'Slab', version: 'v2026-04', validFrom: d(2026, 4, 1), validTo: null, status: 'published', lawVersion: 'IT-2025', transitional: false, draftedBy: 'Farah Siddiqui', reviewedBy: 'Anand Iyer', changeNote: 'Income-tax Act 2025 in force; form numbers 130 / 138.' },
  { id: 'rs5', statute: 'IN.LWF', jurisdiction: 'Tamil Nadu', shape: 'Calendar', version: 'v2026-01', validFrom: d(2026, 1, 1), validTo: null, status: 'in review', lawVersion: 'TN Labour Welfare Fund Act', transitional: true, draftedBy: 'Kavitha Rao', reviewedBy: null, changeNote: 'Due date moved to 31 January.' },
  { id: 'rs6', statute: 'IN.ESI', jurisdiction: 'India', shape: 'Rate', version: 'v2025-11', validFrom: d(2025, 11, 21), validTo: null, status: 'published', lawVersion: 'IN.SS-CODE', transitional: false, draftedBy: 'Rahul Menon', reviewedBy: 'Kavitha Rao', changeNote: 'Social Security Code in force.' },
];

export const PT_KA_DRAFT: SlabRow[] = [
  { from: 0, to: 29_999, amount: 0 },
  { from: 30_000, to: null, amount: 200 },
];
export const PT_KA_BROKEN: SlabRow[] = [
  { from: 0, to: 24_999, amount: 0 },
  { from: 25_000, to: 29_999, amount: 150 },
  { from: 29_000, to: null, amount: 250 },
];

export interface GoldenCase {
  id: string;
  statute: string;
  name: string;
  input: string;
  expected: string;
  actual: string;
  pass: boolean;
}
export const GOLDEN_CASES: GoldenCase[] = [
  { id: 'g1', statute: 'IN.PT · Karnataka', name: 'Gross ₹24,000, April', input: 'gross 24000, month Apr', expected: '₹0', actual: '₹0', pass: true },
  { id: 'g2', statute: 'IN.PT · Karnataka', name: 'Gross ₹30,000, April', input: 'gross 30000, month Apr', expected: '₹200', actual: '₹200', pass: true },
  { id: 'g3', statute: 'IN.PT · Karnataka', name: 'Gross ₹30,000, February', input: 'gross 30000, month Feb', expected: '₹300', actual: '₹200', pass: false },
  { id: 'g4', statute: 'IN.PT · Karnataka', name: 'Gross ₹29,999, disability exemption', input: 'gross 29999, disability true', expected: '₹0', actual: '₹0', pass: true },
  { id: 'g5', statute: 'IN.PT · Karnataka', name: 'Annual total at top slab', input: '12 months at 45000', expected: '₹2,500', actual: '₹2,400', pass: false },
  { id: 'g6', statute: 'IN.PT · Karnataka', name: 'Gross ₹1,20,000, March', input: 'gross 120000, month Mar', expected: '₹200', actual: '₹200', pass: true },
];

export const REVIEW_QUEUE = [
  { id: 'q1', title: 'IN.PT · Karnataka v2027-04', maker: 'Anand Iyer', submitted: d(2026, 9, 28, 16, 10), golden: '4 of 6 passed', status: 'Waiting for review' },
  { id: 'q2', title: 'IN.LWF · Tamil Nadu v2026-01', maker: 'Kavitha Rao', submitted: d(2026, 9, 27, 11, 40), golden: '9 of 9 passed', status: 'Waiting for review' },
  { id: 'q3', title: 'IN.MW · Karnataka v2026-10 (VDA)', maker: 'Rahul Menon', submitted: d(2026, 9, 26, 9, 5), golden: '14 of 14 passed', status: 'Changes requested' },
];

/* ------------------------------------------------------------------ YX-04 customer success, tenants */

export interface TenantRow {
  id: string;
  name: string;
  products: string;
  employees: number;
  state: 'trial' | 'active' | 'past due' | 'restricted' | 'suspended' | 'cancelled';
  health: number;
  trend: number;
  churn: 'low' | 'medium' | 'high';
  factors: string;
  owner: string;
  region: string;
  signedUp: Date;
  mrr: number;
}

export const TENANTS: TenantRow[] = [
  { id: 't1', name: 'Kaveri Foods Pvt Ltd', products: 'HR, Hire', employees: 248, state: 'active', health: 82, trend: 3, churn: 'low', factors: 'Payroll on time, 91% monthly active', owner: 'Kavitha Rao', region: 'IN', signedUp: d(2025, 11, 4), mrr: 23_808 },
  { id: 't2', name: 'Tungabhadra Textiles', products: 'HR', employees: 1_420, state: 'active', health: 41, trend: -24, churn: 'high', factors: 'Score fell 24 points in 30 days; 6 open tickets', owner: 'Kavitha Rao', region: 'IN', signedUp: d(2024, 7, 19), mrr: 1_36_320 },
  { id: 't3', name: 'Konkan Cold Chain', products: 'HR, Assess', employees: 312, state: 'trial', health: 38, trend: -5, churn: 'high', factors: 'Set-up stalled 16 days in trial', owner: 'Joseph Thomas', region: 'IN', signedUp: d(2026, 9, 2), mrr: 0 },
  { id: 't4', name: 'Malabar Spices Exports', products: 'HR', employees: 96, state: 'past due', health: 58, trend: -8, churn: 'medium', factors: 'Invoice 12 days overdue', owner: 'Joseph Thomas', region: 'IN', signedUp: d(2025, 3, 10), mrr: 9_216 },
  { id: 't5', name: 'Sahyadri Schools Trust', products: 'HR, Hire, Assess', employees: 860, state: 'active', health: 77, trend: 6, churn: 'low', factors: 'Adopted Assess this quarter', owner: 'Kavitha Rao', region: 'IN', signedUp: d(2024, 12, 1), mrr: 94_560 },
  { id: 't6', name: 'Gulf Crest Trading LLC', products: 'HR', employees: 140, state: 'active', health: 64, trend: 0, churn: 'medium', factors: 'Admins inactive 21 days', owner: 'Joseph Thomas', region: 'ME-AE', signedUp: d(2026, 2, 14), mrr: 11_760 },
  { id: 't7', name: 'Vaigai Motors', products: 'HR', employees: 530, state: 'restricted', health: 29, trend: -11, churn: 'high', factors: 'Read-only since day 15 of dunning', owner: 'Kavitha Rao', region: 'IN', signedUp: d(2023, 10, 30), mrr: 50_880 },
  { id: 't8', name: 'Srishti Staffing Services', products: 'Hire', employees: 42, state: 'active', health: 71, trend: 2, churn: 'low', factors: '28 recruiter seats, steady', owner: 'Joseph Thomas', region: 'IN', signedUp: d(2025, 6, 9), mrr: 26_880 },
];

export const CS_ALERTS = [
  { id: 'a1', tenant: 'Tungabhadra Textiles', rule: 'Score dropped 20+ points in 30 days', before: 65, after: 41, assigned: 'Kavitha Rao', status: 'open' as const },
  { id: 'a2', tenant: 'Konkan Cold Chain', rule: 'Set-up stalled more than 14 days in trial', before: 43, after: 38, assigned: 'Joseph Thomas', status: 'contacted' as const },
  { id: 'a3', tenant: 'Malabar Spices Exports', rule: 'Payroll not run by day 5', before: 61, after: 58, assigned: 'Joseph Thomas', status: 'open' as const },
  { id: 'a4', tenant: 'Gulf Crest Trading LLC', rule: 'Admins inactive 30 days', before: 66, after: 64, assigned: 'Unassigned', status: 'open' as const },
];

export const FLAGS = [
  { key: 'payroll.weekly_runs', desc: 'Weekly and fortnightly pay runs', scope: 'Beta group (14 tenants)', state: 'beta' as const, killSwitch: false },
  { key: 'assess.ai_interview_scoring', desc: 'AI-scored video interviews', scope: 'All tenants outside EU', state: 'on' as const, killSwitch: false },
  { key: 'hr.ewa', desc: 'Earned wage access', scope: 'Off', state: 'off' as const, killSwitch: false },
  { key: 'hire.whatsapp_apply', desc: 'WhatsApp apply', scope: 'All tenants', state: 'on' as const, killSwitch: true },
];

export const PROBES = [
  { journey: 'OTP sign-in', region: 'IN', last: 'Passed 9:40 am', p95: '1.8 s', status: 'operational' as const },
  { journey: 'Payslip view', region: 'IN', last: 'Slow from 2 locations, 9:40 am', p95: '38.2 s', status: 'degraded' as const },
  { journey: 'Bank-file generation', region: 'IN', last: 'Passed 9:38 am', p95: '6.4 s', status: 'operational' as const },
  { journey: 'Test link and proctoring start', region: 'IN', last: 'Passed 9:41 am', p95: '3.1 s', status: 'operational' as const },
  { journey: 'Careers-page apply', region: 'IN', last: 'Passed 9:39 am', p95: '2.2 s', status: 'operational' as const },
  { journey: 'OTP sign-in', region: 'ME-AE', last: 'Failed from 1 location, not confirmed', p95: '2.4 s', status: 'operational' as const },
];

/* ------------------------------------------------------------------ YX-13 sales assist */

export const SALES_QUEUE = [
  { id: 's1', tenant: 'Deccan Pharma Labs', band: '1,000–2,500', trigger: 'Trial with 1,840 employees', setup: 45, owner: 'Rahul Menon', due: d(2026, 9, 29, 17, 0), outcome: 'Open' },
  { id: 's2', tenant: 'Coromandel Logistics', band: '200–500', trigger: 'Asked for parallel-run help', setup: 20, owner: 'Unassigned', due: d(2026, 9, 29, 12, 0), outcome: 'Open' },
  { id: 's3', tenant: 'Hampi Hotels Group', band: '500–1,000', trigger: '3 legal entities', setup: 70, owner: 'Rahul Menon', due: d(2026, 9, 28, 15, 0), outcome: 'Demo booked' },
  { id: 's4', tenant: 'Pennar Engineering', band: '200–500', trigger: 'Asked for data migration', setup: 10, owner: 'Kavitha Rao', due: d(2026, 9, 25, 11, 0), outcome: 'Converted' },
];

/* ------------------------------------------------------------------ YX-17 cost per tenant */

export const COSTS = [
  { tenant: 'Tungabhadra Textiles', revenue: 1_36_320, storage: 4_210, egress: 1_880, ai: 3_950, compute: 12_400 },
  { tenant: 'Sahyadri Schools Trust', revenue: 94_560, storage: 6_900, egress: 5_120, ai: 18_400, compute: 14_800 },
  { tenant: 'Vaigai Motors', revenue: 50_880, storage: 2_100, egress: 700, ai: 900, compute: 6_300 },
  { tenant: 'Srishti Staffing Services', revenue: 26_880, storage: 1_300, egress: 2_900, ai: 6_450, compute: 3_100 },
  { tenant: 'Kaveri Foods Pvt Ltd', revenue: 23_808, storage: 820, egress: 310, ai: 1_240, compute: 2_150 },
  { tenant: 'Gulf Crest Trading LLC', revenue: 11_760, storage: 640, egress: 220, ai: 3_900, compute: 1_380 },
];

/* ------------------------------------------------------------------ YX-05 AI governance */

export const AI_REGISTRY = [
  { feature: 'helpdesk.answer', version: '3.2', provider: 'Provider A', model: 'Large text model, Mumbai region', region: 'IN', euClass: 'not high-risk', status: 'live' as const, evalResult: 'Pass · cited 97%, confidently wrong 1.4%' },
  { feature: 'assess.interview_scoring', version: '1.6', provider: 'Provider B', model: 'Rubric scorer', region: 'IN', euClass: 'high-risk (off in EU until 2 Dec 2027)', status: 'live' as const, evalResult: 'Pass · kappa 0.74, lowest criterion 0.63' },
  { feature: 'assess.interview_scoring', version: '1.7', provider: 'Provider B', model: 'Rubric scorer', region: 'IN', euClass: 'high-risk', status: 'draft' as const, evalResult: 'Fail · criterion "problem solving" kappa 0.54' },
  { feature: 'docs.ocr', version: '2.0', provider: 'Provider C', model: 'Document OCR', region: 'IN', euClass: 'not high-risk', status: 'approved' as const, evalResult: 'Pass · fields 96.8%, ID numbers 99.3%' },
  { feature: 'people.attrition_risk', version: '0.9', provider: 'In-house', model: 'Gradient-boosted trees', region: 'IN', euClass: 'depends on use', status: 'retired' as const, evalResult: 'Calibration error 7 points (limit 5)' },
];

export const AI_DRIFT = { weeks: ['4 Aug', '11 Aug', '18 Aug', '25 Aug', '1 Sep', '8 Sep', '15 Sep', '22 Sep'], helpdesk: [0.12, 0.11, 0.13, 0.12, 0.14, 0.15, 0.19, 0.24], scoring: [0.08, 0.09, 0.08, 0.07, 0.09, 0.08, 0.08, 0.09] };
export const AI_BIAS = [
  { group: 'Women vs men', ratio: 0.93 },
  { group: 'Age 40+ vs under 40', ratio: 0.86 },
  { group: 'Tier-2/3 college vs tier-1', ratio: 0.77 },
  { group: 'Regional language answers vs English', ratio: 0.82 },
];
export const RED_TEAM = [
  { date: d(2026, 9, 12), test: 'Indirect prompt injection via uploaded résumé', result: 'Blocked', feature: 'hire.resume_parse' },
  { date: d(2026, 9, 12), test: 'Canary token exfiltration in helpdesk answer', result: 'Blocked', feature: 'helpdesk.answer' },
  { date: d(2026, 9, 11), test: 'Jailbreak to reveal another employee salary', result: 'Blocked', feature: 'employee.assistant' },
  { date: d(2026, 6, 20), test: 'Scoring manipulation by keyword stuffing', result: 'Partly passed · fixed in 1.6', feature: 'assess.interview_scoring' },
];

/* ------------------------------------------------------------------ YX-09 product analytics */

export const FUNNEL = [
  { step: 'Signed up', n: 1_240 },
  { step: 'First value', n: 812 },
  { step: 'Activated', n: 540 },
  { step: 'Paid', n: 214 },
];
export const COHORTS = [
  { cohort: 'Apr 2026', m: [100, 81, 74, 70, 68, 66] },
  { cohort: 'May 2026', m: [100, 84, 77, 73, 71] },
  { cohort: 'Jun 2026', m: [100, 79, 72, 69] },
  { cohort: 'Jul 2026', m: [100, 86, 80] },
  { cohort: 'Aug 2026', m: [100, 88] },
  { cohort: 'Sep 2026', m: [100] },
];
export const ADOPTION = { modules: ['Leave', 'Attendance', 'Payroll', 'Expenses', 'Performance', 'Hiring', 'Tests'], small: [92, 81, 88, 46, 22, 35, 12], mid: [95, 90, 93, 61, 48, 52, 30] };
export const QUICKSTART = [
  { step: 'Add company details', done: 96 },
  { step: 'Import employees', done: 78 },
  { step: 'Set up leave types', done: 66 },
  { step: 'Connect bank', done: 41 },
  { step: 'Run first payroll', done: 33 },
];

/* ------------------------------------------------------------------ YX-10 incidents, YX-11 help, YX-12 nudges */

export const INCIDENTS_ADMIN = [
  { id: 'INC-2026-044', title: 'Payslip PDFs slow to open', severity: 'Sev-2', stage: 'Identified', products: 'HR', regions: 'IN', started: d(2026, 9, 29, 8, 51), postedBy: 'Anand Iyer', approvedBy: 'Farah Siddiqui' },
  { id: 'MNT-2026-019', title: 'Database upgrade, Singapore', severity: 'Maintenance', stage: 'Scheduled', products: 'All', regions: 'SG', started: d(2026, 10, 11, 1, 0), postedBy: 'Joseph Thomas', approvedBy: 'Anand Iyer' },
  { id: 'INC-2026-041', title: 'Careers-page apply failed for some candidates', severity: 'Sev-2', stage: 'Post-incident', products: 'Hire', regions: 'IN', started: d(2026, 9, 14, 13, 2), postedBy: 'Rahul Menon', approvedBy: 'Kavitha Rao' },
];

export const HELP_ARTICLES_ADMIN = [
  { key: 'PAY-07.approve-run', title: 'Approve and lock a payroll run', product: 'HR', audience: 'Admin', locales: 'en, hi, ta', status: 'published', reviewed: d(2026, 8, 30), owner: 'Kavitha Rao' },
  { key: 'TIM-01.today', title: 'Use the Today board', product: 'HR', audience: 'Admin', locales: 'en', status: 'in review', reviewed: d(2026, 9, 26), owner: 'Joseph Thomas' },
  { key: 'MOB-01.first-run', title: 'Sign in to the app for the first time', product: 'HR', audience: 'Employee', locales: 'en, hi, ta, te', status: 'published', reviewed: d(2025, 8, 12), owner: 'Kavitha Rao' },
  { key: 'PRC-21.take-test', title: 'Take a proctored test', product: 'Assess', audience: 'Candidate', locales: 'en, hi', status: 'draft', reviewed: d(2026, 9, 20), owner: 'Rahul Menon' },
];
export const NO_RESULT_SEARCHES = [
  { term: 'gratuity trust', count: 41 },
  { term: 'arrears for VDA', count: 29 },
  { term: 'labour code wage definition', count: 26 },
  { term: 'night shift allowance', count: 18 },
];

export const NUDGES = [
  { key: 'day0.welcome', day: 0, product: 'HR', condition: 'Always', channels: 'In-app, email', version: 'v4', approvedBy: 'Farah Siddiqui' },
  { key: 'day1.import', day: 1, product: 'HR', condition: 'Employees imported = 0', channels: 'Email', version: 'v3', approvedBy: 'Farah Siddiqui' },
  { key: 'day3.leave', day: 3, product: 'HR', condition: 'Leave types = 0', channels: 'In-app', version: 'v2', approvedBy: 'Kavitha Rao' },
  { key: 'day7.payroll', day: 7, product: 'HR', condition: 'Payroll run = none', channels: 'In-app, email', version: 'v5', approvedBy: null },
  { key: 'day14.trial', day: 14, product: 'HR', condition: 'Trial ends in 7 days', channels: 'Email', version: 'v2', approvedBy: 'Farah Siddiqui' },
];

/* ------------------------------------------------------------------ YX-15 regions, YX-16 e-invoice, YX-14 LUT */

export const REGIONS = [
  { code: 'IN', hosting: 'Mumbai', countries: 'India', inCountry: true, dr: 'Hyderabad', status: 'live' as const, gates: [{ item: 'Hosting', live: d(2024, 1, 10) }, { item: 'Statutory pack IN', live: d(2024, 1, 10) }] },
  { code: 'ME-AE', hosting: 'Dubai', countries: 'UAE', inCountry: true, dr: 'Abu Dhabi', status: 'live' as const, gates: [{ item: 'Hosting', live: d(2026, 1, 15) }, { item: 'WPS payroll file', live: d(2026, 2, 1) }] },
  { code: 'ME-SA', hosting: 'Riyadh', countries: 'Saudi Arabia', inCountry: true, dr: 'Jeddah', status: 'planned' as const, gates: [{ item: 'Hosting', live: null }, { item: 'ZATCA e-invoicing', live: d(2026, 8, 1) }, { item: 'Mudad payroll file', live: null }] },
  { code: 'EU', hosting: 'Frankfurt', countries: 'Germany, Netherlands, Ireland', inCountry: false, dr: 'Dublin', status: 'planned' as const, gates: [{ item: 'Hosting', live: d(2026, 6, 1) }, { item: 'Peppol e-invoicing', live: null }] },
  { code: 'US', hosting: 'Virginia', countries: 'United States', inCountry: false, dr: 'Oregon', status: 'planned' as const, gates: [{ item: 'Hosting', live: null }] },
  { code: 'SG', hosting: 'Singapore', countries: 'Singapore, Malaysia', inCountry: true, dr: 'Singapore zone 2', status: 'live' as const, gates: [{ item: 'Hosting', live: d(2025, 9, 1) }] },
];

export const EINVOICES = [
  { invoice: 'YX/EXP/26-27/0112', scheme: 'ZATCA', tenant: 'Najd Retail Co.', hash: '9f2c…a71e', clearance: 'ZT-8843120', status: 'accepted' as const, errors: '', retries: 0, at: d(2026, 9, 28, 14, 2) },
  { invoice: 'YX/EXP/26-27/0113', scheme: 'UAE', tenant: 'Gulf Crest Trading LLC', hash: 'b41d…07c2', clearance: '', status: 'rejected' as const, errors: 'Buyer TRN format is wrong (15 digits expected)', retries: 2, at: d(2026, 9, 28, 14, 5) },
  { invoice: 'YX/EXP/26-27/0114', scheme: 'Peppol', tenant: 'Rijn Logistics BV', hash: 'c07a…fe19', clearance: '', status: 'pending' as const, errors: '', retries: 1, at: d(2026, 9, 29, 9, 12) },
  { invoice: 'YX/26-27/4410', scheme: 'IN GST (IRN)', tenant: 'Tungabhadra Textiles', hash: '11ee…9a0b', clearance: 'IRN 5b1…c9d', status: 'accepted' as const, errors: '', retries: 0, at: d(2026, 9, 27, 10, 0) },
  { invoice: 'YX/26-27/4371', scheme: 'IN GST (IRN)', tenant: 'Malabar Spices Exports', hash: '72af…3310', clearance: '', status: 'pending' as const, errors: 'Day 26 since invoice date: IRN missing', retries: 3, at: d(2026, 9, 3, 10, 0) },
];

export const LUTS = [
  { arn: 'AD2903260012345', filedOn: d(2026, 3, 28), from: d(2026, 4, 1), to: d(2027, 3, 31), filedBy: 'CA Ramesh Iyer', current: true },
  { arn: 'AD2903250098761', filedOn: d(2025, 3, 25), from: d(2025, 4, 1), to: d(2026, 3, 31), filedBy: 'CA Ramesh Iyer', current: false },
];
export const EXPORT_INVOICES = [
  { id: 'YX/EXP/26-27/0108', customer: 'Gulf Crest Trading LLC', country: 'UAE', currency: 'AED', amount: 8_420, rate: 22.71, inr: 1_91_218, lut: 'AD2903260012345' },
  { id: 'YX/EXP/26-27/0109', customer: 'Najd Retail Co.', country: 'Saudi Arabia', currency: 'SAR', amount: 12_600, rate: 22.18, inr: 2_79_468, lut: 'AD2903260012345' },
  { id: 'YX/EXP/26-27/0110', customer: 'Lion City Clinics Pte Ltd', country: 'Singapore', currency: 'SGD', amount: 3_150, rate: 64.02, inr: 2_01_663, lut: 'AD2903260012345' },
];
export const RECEIPTS = [
  { id: 'FR-311', ref: 'SWIFT 4471-AE', currency: 'AED', amount: 8_420, remitter: 'Gulf Crest Trading LLC', inr: 1_91_050, firc: 'e-BRC 0998213', status: 'matched' as const },
  { id: 'FR-312', ref: 'SWIFT 8820-SA', currency: 'SAR', amount: 12_540, remitter: 'Najd Retail Co.', inr: 2_77_900, firc: '', status: 'awaiting' as const },
  { id: 'FR-313', ref: 'Gateway py_7Q2', currency: 'SGD', amount: 2_900, remitter: 'Lion City Clinics Pte Ltd', inr: 1_85_600, firc: '', status: 'exception' as const },
];

/* ------------------------------------------------------------------ YX-06 … 08 partners */

export const PARTNER_APPS = [
  { id: 'p1', firm: 'Sridhar & Rao Associates', types: 'CA firm, Payroll bureau', gstin: '29AAKFS3321M1Z8', pan: 'AAKFS3321M', icai: 'FRN 012345S', agreement: 'G-34 v2 accepted 26 Sep 2026 by S. Sridhar (partner)', identity: 'verified' as const, tax: 'verified' as const, icaiCheck: 'pending' as const, applied: d(2026, 9, 26) },
  { id: 'p2', firm: 'Payroll Bridge Services LLP', types: 'Payroll bureau', gstin: '33AAQFP8812K1Z1', pan: 'AAQFP8812K', icai: '—', agreement: 'Not accepted', identity: 'verified' as const, tax: 'failed' as const, icaiCheck: 'n/a' as const, applied: d(2026, 9, 24) },
  { id: 'p3', firm: 'Nimbus Implementations', types: 'Implementation partner', gstin: '27AAHCN4410D1Z6', pan: 'AAHCN4410D', icai: '—', agreement: 'G-34 v2 accepted 20 Sep 2026', identity: 'verified' as const, tax: 'verified' as const, icaiCheck: 'n/a' as const, applied: d(2026, 9, 20) },
];

export const PARTNERS = [
  { id: 'pp1', firm: 'Sridhar & Rao Associates', types: 'CA firm, Payroll bureau', parent: '—', status: 'verified' as const, clients: 14, users: 11, region: 'IN' },
  { id: 'pp2', firm: 'Kaveri Payroll Bureau', types: 'Payroll bureau', parent: 'Sridhar & Rao Associates', status: 'verified' as const, clients: 6, users: 4, region: 'IN' },
  { id: 'pp3', firm: 'Deccan HR Resellers', types: 'Reseller', parent: '—', status: 'suspended' as const, clients: 9, users: 3, region: 'IN' },
  { id: 'pp4', firm: 'Nimbus Implementations', types: 'Implementation partner', parent: '—', status: 'pending' as const, clients: 0, users: 2, region: 'IN' },
];

export const COMMISSIONS = [
  { id: 'c1', partner: 'Sridhar & Rao Associates', client: 'Kaveri Foods Pvt Ltd', month: 'Sep 2026', billed: 23_808, basis: 'Direct · subscription only', ratePct: 15, status: 'accrued' as const, invoice: 'YX/26-27/4402', payout: '' },
  { id: 'c2', partner: 'Sridhar & Rao Associates', client: 'Hosur Castings', month: 'Sep 2026', billed: 36_480, basis: 'Direct · subscription only', ratePct: 15, status: 'approved' as const, invoice: 'YX/26-27/4398', payout: '' },
  { id: 'c3', partner: 'Kaveri Payroll Bureau', client: 'Palar Beverages', month: 'Aug 2026', billed: 18_240, basis: 'Direct · subscription only', ratePct: 15, status: 'paid' as const, invoice: 'YX/26-27/4102', payout: 'NEFT UTR 2608310045' },
  { id: 'c4', partner: 'Deccan HR Resellers', client: 'Vaigai Motors', month: 'Aug 2026', billed: 50_880, basis: 'Clawback: credit note CN-0231', ratePct: -15, status: 'approved' as const, invoice: 'CN-0231', payout: '' },
];

export const LISTINGS = [
  { id: 'l1', firm: 'Sridhar & Rao Associates', services: 'Payroll, PF / ESI filing, TDS', states: 'Karnataka, Tamil Nadu', languages: 'English, Kannada, Tamil', band: '50–500 employees', fee: '₹60–120 per employee a month', reviews: 18, rating: 4.6, status: 'listed' as const },
  { id: 'l2', firm: 'Deccan HR Resellers', services: 'Implementation, training', states: 'Telangana', languages: 'English, Telugu', band: '10–200 employees', fee: 'Fixed ₹40,000 set-up', reviews: 6, rating: 3.1, status: 'delisted' as const },
  { id: 'l3', firm: 'Nimbus Implementations', services: 'Implementation, data migration', states: 'Maharashtra', languages: 'English, Marathi, Hindi', band: '200–2,000 employees', fee: 'From ₹1,50,000', reviews: 0, rating: 0, status: 'pending' as const },
];
export const REVIEWS_FLAGGED = [
  { id: 'rv1', firm: 'Sridhar & Rao Associates', reviewer: 'HR admin, Hosur Castings (linked client)', rating: 5, text: 'Payroll has been on time every month since we moved.', flag: 'None', status: 'published' },
  { id: 'rv2', firm: 'Deccan HR Resellers', reviewer: 'Account not linked to this partner', rating: 5, text: 'Best partner ever, highly recommended!!', flag: 'Reviewer is not a linked client', status: 'held' },
  { id: 'rv3', firm: 'Deccan HR Resellers', reviewer: 'Admin, Vaigai Motors (linked client)', rating: 1, text: 'Our PF returns were filed late two months in a row.', flag: 'Partner replied', status: 'published' },
];
