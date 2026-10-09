// Fictional sample data for the Hiring & staffing desk screens (M10). Deterministic; no real companies.
import type { PlanLine, IdCheckpoint, Panelist, CrmMember, OfferCondition, AuditCategory } from './hiring-logic';
import type { Posting } from './hiring-kit';

export const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);

/* ---------------- plan and requisitions ---------------- */

export const PLAN_FY = 'FY 2026–27';
export const PLAN_LINES: PlanLine[] = [
  { id: 'pl1', department: 'Engineering', designation: 'Senior QA Engineer', grade: 'G6', location: 'Chennai office', approved: 4, filled: 2, open: 1, budget: 64_00_000, committed: 31_50_000 },
  { id: 'pl2', department: 'Engineering', designation: 'Software Engineer', grade: 'G5', location: 'Bengaluru head office', approved: 6, filled: 5, open: 1, budget: 72_00_000, committed: 61_20_000 },
  { id: 'pl3', department: 'Operations', designation: 'Shift Lead', grade: 'G4', location: 'Hosur plant', approved: 5, filled: 1, open: 2, budget: 36_00_000, committed: 7_40_000 },
  { id: 'pl4', department: 'Sales', designation: 'Account Executive', grade: 'G4', location: 'Chennai office', approved: 3, filled: 3, open: 0, budget: 24_00_000, committed: 23_10_000 },
  { id: 'pl5', department: 'Finance', designation: 'Accountant', grade: 'G4', location: 'Bengaluru head office', approved: 2, filled: 0, open: 1, budget: 14_00_000, committed: 0 },
  { id: 'pl6', department: 'Quality', designation: 'Quality Inspector', grade: 'G3', location: 'Hosur plant', approved: 6, filled: 4, open: 1, budget: 30_00_000, committed: 19_80_000 },
];

export interface Requisition {
  id: string;
  code: string;
  title: string;
  department: string;
  location: string;
  grade: string;
  hiringManager: string;
  recruiter: string;
  planLineId: string | null;
  replacementFor?: string | null;
  proposedMax: number;
  positions: number;
  status: 'Draft' | 'Pending approval' | 'Approved' | 'Sent back' | 'Filled' | 'Closed';
  raised: Date;
  waitingOn?: string;
}

export const REQUISITIONS: Requisition[] = [
  { id: 'r1', code: 'REQ-0142', title: 'Senior QA Engineer', department: 'Engineering', location: 'Chennai office', grade: 'G6', hiringManager: 'Karthik Subramanian', recruiter: 'Neha Joshi', planLineId: 'pl1', proposedMax: 18_00_000, positions: 1, status: 'Approved', raised: D(2026, 9, 2) },
  { id: 'r2', code: 'REQ-0145', title: 'Shift Lead, Line 3', department: 'Operations', location: 'Hosur plant', grade: 'G4', hiringManager: 'Prakash Menon', recruiter: 'Imran Qureshi', planLineId: 'pl3', proposedMax: 8_40_000, positions: 2, status: 'Pending approval', raised: D(2026, 9, 21), waitingOn: 'Finance' },
  { id: 'r3', code: 'REQ-0147', title: 'Data Engineer', department: 'Engineering', location: 'Bengaluru head office', grade: 'G6', hiringManager: 'Karthik Subramanian', recruiter: 'Neha Joshi', planLineId: null, proposedMax: 22_00_000, positions: 1, status: 'Pending approval', raised: D(2026, 9, 24), waitingOn: 'CFO' },
  { id: 'r4', code: 'REQ-0148', title: 'Account Executive, Madurai', department: 'Sales', location: 'Chennai office', grade: 'G4', hiringManager: 'Sneha Rao', recruiter: 'Imran Qureshi', planLineId: 'pl4', proposedMax: 8_00_000, positions: 1, status: 'Sent back', raised: D(2026, 9, 18), waitingOn: 'Hiring manager' },
  { id: 'r5', code: 'REQ-0139', title: 'Accountant', department: 'Finance', location: 'Bengaluru head office', grade: 'G4', hiringManager: 'Suresh Pillai', recruiter: 'Neha Joshi', planLineId: 'pl5', replacementFor: 'Rohit Bhat (exit 30 Sep 2026)', proposedMax: 7_20_000, positions: 1, status: 'Approved', raised: D(2026, 9, 10) },
  { id: 'r6', code: 'REQ-0133', title: 'Quality Inspector', department: 'Quality', location: 'Hosur plant', grade: 'G3', hiringManager: 'Deepa Das', recruiter: 'Imran Qureshi', planLineId: 'pl6', proposedMax: 5_40_000, positions: 1, status: 'Filled', raised: D(2026, 8, 12) },
  { id: 'r7', code: 'REQ-0149', title: 'Software Engineer', department: 'Engineering', location: 'Bengaluru head office', grade: 'G5', hiringManager: 'Karthik Subramanian', recruiter: 'Neha Joshi', planLineId: 'pl2', proposedMax: 16_00_000, positions: 1, status: 'Draft', raised: D(2026, 9, 28) },
];

/* ---------------- jobs ---------------- */

export interface Job {
  id: string;
  code: string;
  title: string;
  department: string;
  location: string;
  type: 'Full time' | 'Contract' | 'Campus';
  recruiter: string;
  hiringManager: string;
  status: 'Open' | 'Draft' | 'On hold' | 'Closed';
  applicants: number;
  inPipeline: number;
  posted: Date | null;
  slug: string;
  internal: boolean;
  client?: string;
}

export const JOBS: Job[] = [
  { id: 'j1', code: 'JOB-0311', title: 'Senior QA Engineer', department: 'Engineering', location: 'Chennai office', type: 'Full time', recruiter: 'Neha Joshi', hiringManager: 'Karthik Subramanian', status: 'Open', applicants: 86, inPipeline: 14, posted: D(2026, 9, 4), slug: 'senior-qa-engineer-chennai', internal: true },
  { id: 'j2', code: 'JOB-0312', title: 'Shift Lead, Line 3', department: 'Operations', location: 'Hosur plant', type: 'Full time', recruiter: 'Imran Qureshi', hiringManager: 'Prakash Menon', status: 'Draft', applicants: 0, inPipeline: 0, posted: null, slug: 'shift-lead-line-3-hosur', internal: true },
  { id: 'j3', code: 'JOB-0305', title: 'Accountant', department: 'Finance', location: 'Bengaluru head office', type: 'Full time', recruiter: 'Neha Joshi', hiringManager: 'Suresh Pillai', status: 'Open', applicants: 142, inPipeline: 9, posted: D(2026, 9, 12), slug: 'accountant-bengaluru', internal: true },
  { id: 'j4', code: 'JOB-0298', title: 'Graduate Engineer Trainee 2027', department: 'Engineering', location: 'Hosur plant', type: 'Campus', recruiter: 'Imran Qureshi', hiringManager: 'Prakash Menon', status: 'Open', applicants: 412, inPipeline: 64, posted: D(2026, 8, 20), slug: 'graduate-engineer-trainee-2027-hosur', internal: false },
  { id: 'j5', code: 'JOB-0287', title: 'Quality Inspector', department: 'Quality', location: 'Hosur plant', type: 'Full time', recruiter: 'Imran Qureshi', hiringManager: 'Deepa Das', status: 'Closed', applicants: 58, inPipeline: 0, posted: D(2026, 8, 14), slug: 'quality-inspector-hosur', internal: true },
  { id: 'j6', code: 'JOB-0315', title: 'Java Developer (client)', department: 'Staffing desk', location: 'Chennai (client site)', type: 'Contract', recruiter: 'Neha Joshi', hiringManager: 'Anita Kurian', status: 'Open', applicants: 23, inPipeline: 7, posted: D(2026, 9, 15), slug: 'java-developer-chennai', internal: false, client: 'Nilgiri Retail Pvt Ltd' },
  { id: 'j7', code: 'JOB-0309', title: 'Sales Manager, South', department: 'Sales', location: 'Chennai office', type: 'Full time', recruiter: 'Neha Joshi', hiringManager: 'Sneha Rao', status: 'On hold', applicants: 37, inPipeline: 4, posted: D(2026, 9, 1), slug: 'sales-manager-south-chennai', internal: true },
];

export const POSTINGS: Posting[] = [
  { board: 'Naukri', status: 'live', expires: D(2026, 10, 19), applicants: 48, cost: 12_500 },
  { board: 'LinkedIn', status: 'live', expires: D(2026, 10, 4), applicants: 21, cost: 18_000 },
  { board: 'Indeed', status: 'refreshed', expires: D(2026, 10, 28), applicants: 11, cost: 0 },
  { board: 'Foundit', status: 'failed', error: 'Board rejected the post: job slots used up on the company account. Buy slots with the board, then retry.' },
  { board: 'Shine', status: 'not posted' },
];

/* ---------------- candidates and pipeline ---------------- */

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  current: string;
  experience: string;
  location: string;
  source: string;
  stage: string;
  daysInStage: number;
  assessment?: number;
  aiInterview?: number;
  panel?: number;
  next: string;
  exEmployee?: boolean;
  minor?: boolean;
  idFlag?: boolean;
  expected: number;
}

export const CANDIDATES: Candidate[] = [
  { id: 'c1', name: 'Ananya Iyer', email: 'ananya.iyer@mailbox.in', phone: '+91 98450 11223', current: 'QA Lead, Sundaram Softlabs', experience: '7 yrs', location: 'Chennai', source: 'Naukri', stage: 'Panel', daysInStage: 3, assessment: 82, aiInterview: 74, panel: 4.2, next: 'Panel 2 on 1 Oct, 11:00 am', expected: 17_50_000 },
  { id: 'c2', name: 'Vikram Reddy', email: 'vikram.r@postbox.in', phone: '+91 99001 44556', current: 'Senior Tester, Pallava Systems', experience: '6 yrs', location: 'Chennai', source: 'Referral', stage: 'Panel', daysInStage: 9, assessment: 71, aiInterview: 68, next: 'Scorecard overdue from Joseph Mathew', expected: 16_00_000 },
  { id: 'c3', name: 'Fatima Shaikh', email: 'fatima.s@mailbox.in', phone: '+91 97890 22334', current: 'QA Engineer, Kaveri Foods (2019–2024)', experience: '6 yrs', location: 'Bengaluru', source: 'Careers site', stage: 'Screening', daysInStage: 2, assessment: 88, next: 'Recruiter screen call', exEmployee: true, expected: 15_00_000 },
  { id: 'c4', name: 'Rahul Ghosh', email: 'rahul.g@postbox.in', phone: '+91 90030 55667', current: 'Automation Engineer', experience: '5 yrs', location: 'Coimbatore', source: 'LinkedIn', stage: 'AI round – review', daysInStage: 1, assessment: 64, aiInterview: 38, next: 'Review AI interview', idFlag: true, expected: 14_00_000 },
  { id: 'c5', name: 'Meera Nair', email: 'meera.n@mailbox.in', phone: '+91 98860 77889', current: 'QA Engineer II', experience: '4 yrs', location: 'Chennai', source: 'Vendor: Sahyadri Staffing', stage: 'Assessment', daysInStage: 4, next: 'Test link sent 25 Sep', expected: 12_00_000 },
  { id: 'c6', name: 'Joseph George', email: 'joseph.g@postbox.in', phone: '+91 94440 99001', current: 'SDET, Marina Tech', experience: '8 yrs', location: 'Chennai', source: 'Naukri', stage: 'Offer', daysInStage: 5, assessment: 90, aiInterview: 81, panel: 4.6, next: 'Offer v2 waiting for CFO', expected: 21_00_000 },
  { id: 'c7', name: 'Kavya Pillai', email: 'kavya.p@mailbox.in', phone: '+91 96000 12121', current: 'Test Analyst', experience: '3 yrs', location: 'Madurai', source: 'Indeed', stage: 'Applied', daysInStage: 0, next: 'Screen résumé', expected: 9_00_000 },
  { id: 'c8', name: 'Arjun Kulkarni', email: 'arjun.k@postbox.in', phone: '+91 98800 34343', current: 'QA Engineer', experience: '4 yrs', location: 'Pune', source: 'Talent pool', stage: 'Applied', daysInStage: 6, next: 'Screen résumé', expected: 11_00_000 },
  { id: 'c9', name: 'Gurpreet Kaur', email: 'gurpreet.k@mailbox.in', phone: '+91 98140 56565', current: 'Performance Tester', experience: '6 yrs', location: 'Chennai', source: 'Referral', stage: 'Screening', daysInStage: 8, assessment: 76, next: 'Send assessment', expected: 15_50_000 },
  { id: 'c10', name: 'Imran Khan', email: 'imran.k@postbox.in', phone: '+91 90000 78787', current: 'QA Engineer', experience: '5 yrs', location: 'Hyderabad', source: 'Naukri', stage: 'Rejected', daysInStage: 12, assessment: 52, next: 'Not selected notice sent', expected: 13_00_000 },
];

export const STAGES = ['Applied', 'Screening', 'Assessment', 'AI round – review', 'Panel', 'Offer', 'Hired', 'Rejected'];

export const ID_POINTS: IdCheckpoint[] = [
  { id: 'i1', label: 'Application verification', result: 'match', at: D(2026, 9, 18), deepfake: 'off' },
  { id: 'i2', label: 'Assessment ID check', result: 'match', at: D(2026, 9, 21), deepfake: 'off' },
  { id: 'i3', label: 'AI interview', result: 'mismatch', at: D(2026, 9, 27), deepfake: 'suspected' },
  { id: 'i4', label: 'Panel interview', result: 'not-run' },
];
export const ID_POINTS_CLEAR: IdCheckpoint[] = [
  { id: 'i1', label: 'Application verification', result: 'match', at: D(2026, 9, 18), deepfake: 'off' },
  { id: 'i2', label: 'AI interview', result: 'match', at: D(2026, 9, 22), deepfake: 'clear' },
  { id: 'i3', label: 'Panel interview (external video)', result: 'attested', at: D(2026, 9, 26) },
];

/* ---------------- interviews ---------------- */

export const PANEL: Panelist[] = [
  { id: 'p1', name: 'Karthik Subramanian', required: true, busy: [{ start: 600, end: 660 }, { start: 840, end: 930 }], interviewsToday: 1 },
  { id: 'p2', name: 'Joseph Mathew', required: true, busy: [{ start: 690, end: 750 }], interviewsToday: 2 },
  { id: 'p3', name: 'Divya Raghunathan', required: false, busy: [{ start: 780, end: 840 }], interviewsToday: 0 },
  { id: 'p4', name: 'Thomas George', required: false, busy: null, interviewsToday: 0 },
];

export const SCORECARD_SKILLS = [
  { skill: 'Test design and strategy', weight: 30, passBar: 3, hint: 'Derives cases from requirements; risk-based coverage.' },
  { skill: 'Automation (Selenium / Playwright)', weight: 30, passBar: 3, hint: 'Writes maintainable page objects; CI integration.' },
  { skill: 'API and data testing', weight: 20, passBar: 3, hint: 'Postman or code-based API checks; SQL for data validation.' },
  { skill: 'Communication (M06 competency)', weight: 20, passBar: 3, hint: 'Clear defect reports; explains trade-offs.' },
];

/* ---------------- talent CRM ---------------- */

export interface Pool {
  id: string;
  name: string;
  kind: 'Static' | 'Dynamic' | 'Hotlist';
  owner: string;
  members: number;
  emailConsent: number;
  whatsappConsent: number;
  purpose: string;
  updated: Date;
}
export const POOLS: Pool[] = [
  { id: 'po1', name: 'Java 2027 campus', kind: 'Dynamic', owner: 'Imran Qureshi', members: 184, emailConsent: 172, whatsappConsent: 160, purpose: 'Campus joiners for 2027', updated: D(2026, 9, 29) },
  { id: 'po2', name: 'QA silver medallists', kind: 'Static', owner: 'Neha Joshi', members: 38, emailConsent: 31, whatsappConsent: 12, purpose: 'Strong finalists from past QA jobs', updated: D(2026, 9, 20) },
  { id: 'po3', name: 'Plant supervisors, Hosur', kind: 'Static', owner: 'Imran Qureshi', members: 56, emailConsent: 40, whatsappConsent: 44, purpose: 'Shift lead pipeline', updated: D(2026, 9, 11) },
  { id: 'po4', name: 'Data Engineer hotlist', kind: 'Hotlist', owner: 'Neha Joshi', members: 9, emailConsent: 9, whatsappConsent: 5, purpose: 'REQ-0147 shortlist', updated: D(2026, 9, 27) },
];

export const POOL_MEMBERS: CrmMember[] = [
  { id: 'm1', name: 'Arjun Kulkarni', consent: { email: 'opted-in', whatsapp: 'opted-in' } },
  { id: 'm2', name: 'Sana Nizami', consent: { email: 'opted-in', whatsapp: 'none' } },
  { id: 'm3', name: 'Thomas Bhat', consent: { email: 'opted-out', whatsapp: 'opted-out' } },
  { id: 'm4', name: 'Aisha Khan', consent: { email: 'opted-in', whatsapp: 'opted-in' } },
  { id: 'm5', name: 'Rohit Das', consent: {}, sourcedPending: true },
  { id: 'm6', name: 'Priya Sharma', minor: true, consent: { email: 'opted-in' } },
  { id: 'm7', name: 'Manoj Patil', consent: { email: 'opted-in', whatsapp: 'opted-in' } },
];

/* ---------------- offers ---------------- */

export const OFFER_CONDITIONS: OfferCondition[] = [
  { id: 'oc1', name: 'Background check clear', due: D(2026, 10, 10), status: 'open' },
  { id: 'oc2', name: 'Degree certificate uploaded', due: D(2026, 9, 25), status: 'open' },
  { id: 'oc3', name: 'Relieving letter from current employer', due: D(2026, 10, 30), status: 'waived' },
  { id: 'oc4', name: 'Signed offer letter', due: D(2026, 10, 3), status: 'met' },
];

/* ---------------- bias audit ---------------- */

export const AUDIT_SEX: AuditCategory[] = [
  { label: 'Female', assessed: 412, selected: 118 },
  { label: 'Male', assessed: 538, selected: 171 },
  { label: 'Unknown / not given', assessed: 14, selected: 3 },
];
export const AUDIT_RACE: AuditCategory[] = [
  { label: 'Asian', assessed: 610, selected: 190 },
  { label: 'White', assessed: 180, selected: 52 },
  { label: 'Hispanic or Latino', assessed: 96, selected: 25 },
  { label: 'Black or African American', assessed: 64, selected: 19 },
  { label: 'Two or more races', assessed: 14, selected: 6 },
];

/* ---------------- staffing desk ---------------- */

export interface Client {
  id: string;
  name: string;
  gstin: string;
  state: string;
  accountManager: string;
  openJobs: number;
  activePlacements: number;
  receivable: number;
  overdue: number;
  contractEnds: Date;
  status: 'Active' | 'Onboarding' | 'On hold';
}
export const CLIENTS: Client[] = [
  { id: 'cl1', name: 'Nilgiri Retail Pvt Ltd', gstin: '33AAFCN4521K1Z2', state: 'Tamil Nadu', accountManager: 'Anita Kurian', openJobs: 4, activePlacements: 18, receivable: 24_60_000, overdue: 6_12_000, contractEnds: D(2027, 3, 31), status: 'Active' },
  { id: 'cl2', name: 'Coromandel Logistics Ltd', gstin: '29AABCC7788M1Z6', state: 'Karnataka', accountManager: 'Anita Kurian', openJobs: 2, activePlacements: 9, receivable: 11_80_000, overdue: 0, contractEnds: D(2026, 12, 31), status: 'Active' },
  { id: 'cl3', name: 'Deccan Pharma Pvt Ltd', gstin: '36AADCD1122P1Z9', state: 'Telangana', accountManager: 'Vikram Singh', openJobs: 1, activePlacements: 4, receivable: 3_40_000, overdue: 3_40_000, contractEnds: D(2026, 11, 15), status: 'On hold' },
  { id: 'cl4', name: 'Tungabhadra Motors', gstin: '29AAGCT3344Q1Z1', state: 'Karnataka', accountManager: 'Vikram Singh', openJobs: 0, activePlacements: 0, receivable: 0, overdue: 0, contractEnds: D(2027, 9, 30), status: 'Onboarding' },
];

export interface RateCardRow {
  id: string;
  role: string;
  skill: string;
  location: string;
  billRate: number;
  payRate: number;
  unit: 'hour' | 'day';
  ot: number;
  holiday: number;
  from: Date;
  to: Date | null;
}
export const RATE_CARD: RateCardRow[] = [
  { id: 'rc1', role: 'Java Developer', skill: 'Java, Spring', location: 'Chennai', billRate: 1_200, payRate: 800, unit: 'hour', ot: 1.5, holiday: 2, from: D(2026, 4, 1), to: null },
  { id: 'rc2', role: 'Senior Java Developer', skill: 'Java, microservices', location: 'Chennai', billRate: 1_650, payRate: 1_100, unit: 'hour', ot: 1.5, holiday: 2, from: D(2026, 4, 1), to: null },
  { id: 'rc3', role: 'QA Engineer', skill: 'Manual, API', location: 'Chennai', billRate: 900, payRate: 580, unit: 'hour', ot: 1.5, holiday: 2, from: D(2026, 4, 1), to: null },
  { id: 'rc4', role: 'Warehouse Supervisor', skill: 'WMS', location: 'Bengaluru', billRate: 5_200, payRate: 3_600, unit: 'day', ot: 1.25, holiday: 2, from: D(2026, 4, 1), to: null },
  { id: 'rc5', role: 'Java Developer', skill: 'Java, Spring', location: 'Chennai', billRate: 1_100, payRate: 760, unit: 'hour', ot: 1.5, holiday: 2, from: D(2025, 4, 1), to: D(2026, 3, 31) },
];

export interface Submission {
  id: string;
  candidate: string;
  job: string;
  client: string;
  contact: string;
  billRate: number;
  source: string;
  stage: 'Submitted' | 'Client review' | 'Interview' | 'Selected' | 'Rejected by client';
  days: number;
  feedback?: string;
}
export const SUBMISSIONS: Submission[] = [
  { id: 's1', candidate: 'Suresh Menon', job: 'Java Developer', client: 'Nilgiri Retail', contact: 'Rekha Balan', billRate: 1_200, source: 'Bench', stage: 'Submitted', days: 1 },
  { id: 's2', candidate: 'Priya Nair', job: 'Java Developer', client: 'Nilgiri Retail', contact: 'Rekha Balan', billRate: 1_200, source: 'Vendor: Sahyadri Staffing', stage: 'Client review', days: 3 },
  { id: 's3', candidate: 'Deepak Rao', job: 'Senior Java Developer', client: 'Nilgiri Retail', contact: 'Rekha Balan', billRate: 1_650, source: 'Talent pool', stage: 'Client review', days: 6, feedback: 'Strong on Spring; check notice period' },
  { id: 's4', candidate: 'Lakshmi Iyer', job: 'QA Engineer', client: 'Coromandel Logistics', contact: 'Harish Gowda', billRate: 900, source: 'Naukri', stage: 'Interview', days: 2 },
  { id: 's5', candidate: 'Manoj Das', job: 'Warehouse Supervisor', client: 'Coromandel Logistics', contact: 'Harish Gowda', billRate: 5_200, source: 'Bench', stage: 'Selected', days: 1 },
  { id: 's6', candidate: 'Sneha Kulkarni', job: 'QA Engineer', client: 'Coromandel Logistics', contact: 'Harish Gowda', billRate: 900, source: 'Referral', stage: 'Rejected by client', days: 4, feedback: 'Needs more API testing experience' },
];

export interface Placement {
  id: string;
  person: string;
  client: string;
  role: string;
  start: Date;
  end: Date;
  billRate: number;
  payRate: number;
  statutoryPerHour: number;
  supply: 'Own payroll' | 'Vendor supplied';
  vendor?: string;
  status: 'Active' | 'Ending soon' | 'Bench' | 'Ended';
  benchSince?: Date;
  hoursThisMonth: number;
}
export const PLACEMENTS: Placement[] = [
  { id: 'pc1', person: 'Aravind Kumar', client: 'Nilgiri Retail', role: 'Java Developer', start: D(2026, 1, 5), end: D(2026, 12, 31), billRate: 1_200, payRate: 800, statutoryPerHour: 96, supply: 'Own payroll', status: 'Active', hoursThisMonth: 160 },
  { id: 'pc2', person: 'Sowmya Ramesh', client: 'Nilgiri Retail', role: 'Senior Java Developer', start: D(2025, 11, 1), end: D(2026, 10, 15), billRate: 1_650, payRate: 1_100, statutoryPerHour: 132, supply: 'Own payroll', status: 'Ending soon', hoursThisMonth: 152 },
  { id: 'pc3', person: 'Farhan Ali', client: 'Coromandel Logistics', role: 'Warehouse Supervisor', start: D(2026, 6, 1), end: D(2027, 5, 31), billRate: 5_200, payRate: 3_600, statutoryPerHour: 0, supply: 'Own payroll', status: 'Active', hoursThisMonth: 176 },
  { id: 'pc4', person: 'Priya Nair', client: 'Nilgiri Retail', role: 'Java Developer', start: D(2026, 8, 1), end: D(2027, 1, 31), billRate: 1_200, payRate: 900, statutoryPerHour: 0, supply: 'Vendor supplied', vendor: 'Sahyadri Staffing', status: 'Active', hoursThisMonth: 160 },
  { id: 'pc5', person: 'Suresh Menon', client: '—', role: 'Java Developer', start: D(2025, 7, 1), end: D(2026, 8, 31), billRate: 0, payRate: 800, statutoryPerHour: 96, supply: 'Own payroll', status: 'Bench', benchSince: D(2026, 9, 1), hoursThisMonth: 0 },
  { id: 'pc6', person: 'Kiran Joshi', client: '—', role: 'QA Engineer', start: D(2025, 4, 1), end: D(2026, 7, 31), billRate: 0, payRate: 580, statutoryPerHour: 70, supply: 'Own payroll', status: 'Bench', benchSince: D(2026, 8, 5), hoursThisMonth: 0 },
];

export interface ClientInvoice {
  id: string;
  number: string;
  client: string;
  clientState: string;
  date: Date;
  period: string;
  subtotal: number;
  gst: number;
  status: 'Draft' | 'Approved' | 'Issued' | 'Part paid' | 'Paid' | 'Cancelled';
  irn: 'Not needed' | 'Pending' | 'Generated' | 'Blocked';
  po?: string;
  source: 'Staffing' | 'Project' | 'Credit note';
}
export const INVOICES: ClientInvoice[] = [
  { id: 'iv1', number: 'KF/TN/26-27/0184', client: 'Nilgiri Retail Pvt Ltd', clientState: 'Tamil Nadu', date: D(2026, 9, 1), period: 'Aug 2026', subtotal: 9_52_400, gst: 1_71_432, status: 'Issued', irn: 'Pending', po: 'NRPL/PO/7781', source: 'Staffing' },
  { id: 'iv2', number: 'KF/TN/26-27/0179', client: 'Nilgiri Retail Pvt Ltd', clientState: 'Tamil Nadu', date: D(2026, 8, 27), period: 'Aug 2026', subtotal: 1_92_000, gst: 34_560, status: 'Issued', irn: 'Blocked', source: 'Staffing' },
  { id: 'iv3', number: 'KF/KA/26-27/0096', client: 'Coromandel Logistics Ltd', clientState: 'Karnataka', date: D(2026, 9, 3), period: 'Aug 2026', subtotal: 9_15_200, gst: 1_64_736, status: 'Part paid', irn: 'Generated', source: 'Staffing' },
  { id: 'iv4', number: 'KF/TN/26-27/0165', client: 'Deccan Pharma Pvt Ltd', clientState: 'Telangana', date: D(2026, 6, 30), period: 'Jun 2026', subtotal: 2_88_136, gst: 51_864, status: 'Issued', irn: 'Generated', source: 'Staffing' },
  { id: 'iv5', number: 'Draft', client: 'Nilgiri Retail Pvt Ltd', clientState: 'Tamil Nadu', date: D(2026, 9, 29), period: 'Sep 2026', subtotal: 9_88_800, gst: 1_77_984, status: 'Draft', irn: 'Pending', source: 'Staffing' },
  { id: 'iv6', number: 'KF/TN/26-27/CN-012', client: 'Nilgiri Retail Pvt Ltd', clientState: 'Tamil Nadu', date: D(2026, 9, 20), period: 'Aug 2026', subtotal: -9_600, gst: -1_728, status: 'Issued', irn: 'Generated', source: 'Credit note' },
];

export interface Vendor {
  id: string;
  name: string;
  pan: string;
  gstin: string;
  tds: '194C' | '194J';
  tier: 'Preferred' | 'Standard' | 'Probation';
  status: 'Active' | 'Pending documents' | 'Inactive';
  missing?: string;
  sharedJobs: number;
  submissions: number;
  duplicateRate: number;
  placements: number;
}
export const VENDORS: Vendor[] = [
  { id: 'v1', name: 'Sahyadri Staffing LLP', pan: 'ABKFS1234L', gstin: '33ABKFS1234L1Z3', tds: '194C', tier: 'Preferred', status: 'Active', sharedJobs: 3, submissions: 41, duplicateRate: 7, placements: 6 },
  { id: 'v2', name: 'Vindhya Talent Partners', pan: 'AAHFV5566Q', gstin: '29AAHFV5566Q1Z8', tds: '194J', tier: 'Standard', status: 'Active', sharedJobs: 2, submissions: 18, duplicateRate: 22, placements: 1 },
  { id: 'v3', name: 'Konkan Workforce Solutions', pan: 'AAKCK9087D', gstin: '27AAKCK9087D1Z4', tds: '194C', tier: 'Probation', status: 'Pending documents', missing: 'Bank account not verified; agreement unsigned', sharedJobs: 0, submissions: 0, duplicateRate: 0, placements: 0 },
];

/* ---------------- rediscovery, referrals, costs, activity ---------------- */

import type { RediscoveryMatch, Referral, CostEntry, InternalApplication } from './hiring-plan';
import type { TimelineItem } from '../../components/timeline';
import type { ApprovalStep } from '../../components/timeline';

export const REDISCOVERY: RediscoveryMatch[] = [
  { id: 'rd1', name: 'Sana Nizami', lastRole: 'Senior QA Engineer (JOB-0244)', lastStage: 'Final panel', reasons: ['Selenium', 'API testing', 'Chennai'], consent: { email: 'opted-in', whatsapp: 'opted-in' }, retentionUntil: D(2027, 2, 14), pool: 'QA silver medallists' },
  { id: 'rd2', name: 'Thomas Mathew', lastRole: 'QA Engineer (JOB-0260)', lastStage: 'Offer declined', reasons: ['Playwright', 'Performance testing'], consent: { email: 'opted-in', whatsapp: 'none' }, retentionUntil: D(2026, 12, 2) },
  { id: 'rd3', name: 'Deepa Ghosh', lastRole: 'Test Lead (JOB-0199)', lastStage: 'Panel 2', reasons: ['Test strategy', 'Chennai'], consent: { email: 'none', whatsapp: 'none' }, retentionUntil: D(2026, 10, 30), pool: 'QA silver medallists' },
];

export const REFERRALS: Referral[] = [
  { id: 'rf1', name: 'Vikram Reddy', job: 'Senior QA Engineer', referred: D(2026, 9, 8), stage: 'In process', joined: null, bonus: 25_000 },
  { id: 'rf2', name: 'Kiran Rao', job: 'Accountant', referred: D(2026, 5, 2), stage: 'Hired', joined: D(2026, 7, 1), bonus: 15_000 },
  { id: 'rf3', name: 'Neha Das', job: 'Shift Lead', referred: D(2026, 3, 11), stage: 'Hired', joined: D(2026, 4, 20), bonus: 15_000, paid: true },
  { id: 'rf4', name: 'Ajay Menon', job: 'Sales Manager, South', referred: D(2026, 8, 30), stage: 'Not selected', joined: null, bonus: 0 },
];

export const INTERNAL_APPS: InternalApplication[] = [
  { id: 'ia1', job: 'Quality Manager, Hosur', applied: D(2026, 9, 14), status: 'Assessment' },
  { id: 'ia2', job: 'Test Lead, Bengaluru', applied: D(2026, 6, 2), status: 'Not selected' },
];

export const COSTS: CostEntry[] = [
  { id: 'k1', period: 'Sep 2026', job: 'Senior QA Engineer', source: 'Naukri', type: 'Job board', amount: 12_500, origin: 'Manual', enteredBy: 'Neha Joshi' },
  { id: 'k2', period: 'Sep 2026', job: 'Senior QA Engineer', source: 'LinkedIn', type: 'Job board', amount: 18_000, origin: 'Manual', enteredBy: 'Neha Joshi' },
  { id: 'k3', period: 'Sep 2026', job: 'Shift Lead', source: 'Sahyadri Staffing', type: 'Agency fee', amount: 64_000, origin: 'Manual', enteredBy: 'Imran Qureshi', note: '8.33% of first-year CTC' },
  { id: 'k4', period: 'Sep 2026', job: 'Accountant', source: 'Referral: Kiran Rao', type: 'Referral bonus', amount: 15_000, origin: 'Payroll one-time pay', enteredBy: 'System' },
  { id: 'k5', period: 'Aug 2026', job: 'Graduate Engineer Trainee 2027', source: 'Campus fair, Hosur', type: 'Event', amount: 42_000, origin: 'Manual', enteredBy: 'Imran Qureshi' },
  { id: 'k6', period: 'Aug 2026', job: 'Graduate Engineer Trainee 2027', source: 'Aptitude test, 412 candidates', type: 'Assessment', amount: 20_600, origin: 'Assessment cost', enteredBy: 'System' },
  { id: 'k7', period: 'Jul 2026', job: null, source: 'Employer branding video', type: 'Other', amount: 35_000, origin: 'Manual', enteredBy: 'Neha Joshi' },
];

const person = (name: string) => ({ name });
export const JOB_ACTIVITY: TimelineItem[] = [
  { id: 'a1', actor: person('Neha Joshi'), action: 'refreshed the Indeed posting', at: D(2026, 9, 28) },
  { id: 'a2', actor: person('System'), action: 'pulled 6 applicants from Naukri', at: D(2026, 9, 27) },
  { id: 'a3', actor: person('Karthik Subramanian'), action: 'moved Joseph George to Offer', at: D(2026, 9, 24) },
  { id: 'a4', actor: person('Neha Joshi'), action: 'published the job to Naukri, LinkedIn and Indeed', at: D(2026, 9, 4) },
];

export const PLAN_REVISION_STEPS: ApprovalStep[] = [
  { id: 's1', label: 'Submitted', status: 'done', approver: 'Lakshmi Venkatesan', at: D(2026, 9, 25) },
  { id: 's2', label: 'HR head approval', status: 'done', approver: 'Anjali Menon', at: D(2026, 9, 26) },
  { id: 's3', label: 'Finance approval', status: 'current', approver: 'Ravi Shankar' },
];

/* ---------------- AI interview answers ---------------- */

import type { AiAnswer } from './hiring-pipeline';

export const AI_ANSWERS: AiAnswer[] = [
  { q: 'How do you decide what to automate first?', score: 42, evidence: 'I automate whatever the manager asks for.', transcript: 'I automate whatever the manager asks for. Mostly login and the main screens. Sometimes we skip it when there is no time.' },
  { q: 'Tell us about a defect that reached production.', score: 36, evidence: 'We did not have a test for that.', transcript: 'There was a pricing bug. We did not have a test for that. After that we added one manual check.' },
  { q: 'How would you test an order API?', score: 40, evidence: 'Check the status code is 200.', transcript: 'Check the status code is 200 and the response has an id. Then maybe check the database.' },
  { q: 'How do you handle flaky tests?', score: 34, evidence: 'Run it again.', transcript: 'Run it again until it passes, or comment it out for the release.' },
];


/* ---------------- offers, BGV, CRM extras ---------------- */

import type { BgvRow, BulkOfferRow, Capture, SequenceStep } from './hiring-offers';

export const OFFER_ACTIVITY: TimelineItem[] = [
  { id: 'o1', actor: person('Joseph George'), action: 'accepted offer version 2 with OTP', at: D(2026, 9, 28) },
  { id: 'o2', actor: person('Meenakshi Sundaram'), action: 'approved the out-of-range CTC', at: D(2026, 9, 26) },
  { id: 'o3', actor: person('Neha Joshi'), action: 'revised the offer to version 2 after a counter-offer', at: D(2026, 9, 25) },
  { id: 'o4', actor: person('Neha Joshi'), action: 'sent offer version 1', at: D(2026, 9, 22) },
];

export const BULK_OFFERS: BulkOfferRow[] = [
  { id: 'b1', name: 'Aditi Rao', college: 'Adhiyamaan College, Hosur', ctc: 4_80_000, joining: D(2027, 7, 5), planOk: true },
  { id: 'b2', name: 'Farhan Sheikh', college: 'Adhiyamaan College, Hosur', ctc: 4_80_000, joining: D(2027, 7, 5), planOk: true },
  { id: 'b3', name: 'Gayathri Murugan', college: 'PSG Tech, Coimbatore', ctc: 5_40_000, joining: D(2027, 7, 5), planOk: true },
  { id: 'b4', name: 'Harsha Vardhan', college: 'Adhiyamaan College, Hosur', ctc: 4_80_000, joining: D(2027, 7, 5), planOk: true },
  { id: 'b5', name: 'Ishita Bose', college: 'Sona College, Salem', ctc: 4_80_000, joining: D(2027, 7, 5), planOk: false },
];

export const BGV_ROWS: BgvRow[] = [
  { id: 'g1', candidate: 'Joseph George', job: 'Senior QA Engineer', package: 'Standard + criminal', consent: 'Given', started: D(2026, 9, 28), mode: 'Partner', checks: { Identity: 'Clear', Address: 'In progress', Education: 'Clear', Employment: 'Discrepancy', Criminal: 'In progress' } },
  { id: 'g2', candidate: 'Kiran Rao', job: 'Accountant', package: 'Standard', consent: 'Given', started: D(2026, 6, 20), mode: 'Partner', checks: { Identity: 'Clear', Address: 'Clear', Education: 'Clear', Employment: 'Clear', Criminal: 'Clear' } },
  { id: 'g3', candidate: 'Aditi Rao', job: 'Graduate Engineer Trainee', package: 'Campus basic', consent: 'Pending', started: null, mode: 'Partner', checks: { Identity: 'Not started', Address: 'Not started', Education: 'Not started', Employment: 'Not started', Criminal: 'Not started' } },
  { id: 'g4', candidate: 'Neha Das', job: 'Shift Lead', package: 'Standard', consent: 'Given', started: D(2026, 9, 15), mode: 'Partner', checks: { Identity: 'Clear', Address: 'Insufficient', Education: 'Clear', Employment: 'In progress', Criminal: 'Clear' } },
];

export const CAPTURES: Capture[] = [
  { id: 'sc1', name: 'Rohit Das', site: 'LinkedIn', headline: 'Data Engineer, Spark and Airflow', capturedBy: 'Neha Joshi', capturedAt: D(2026, 9, 3), consent: 'Pending' },
  { id: 'sc2', name: 'Swathi Krishnan', site: 'Naukri', headline: 'Senior QA, 8 yrs', capturedBy: 'Neha Joshi', capturedAt: D(2026, 9, 22), consent: 'Pending', existing: true },
  { id: 'sc3', name: 'Mohammed Asif', site: 'LinkedIn', headline: 'Plant supervisor, food processing', capturedBy: 'Imran Qureshi', capturedAt: D(2026, 9, 10), consent: 'Given' },
];

export const SEQ_STEPS: SequenceStep[] = [
  { id: 'q1', kind: 'message', channel: 'whatsapp', template: 'Campus 2027 · hello and what we build at Hosur' },
  { id: 'q2', kind: 'wait', days: 7 },
  { id: 'q3', kind: 'message', channel: 'whatsapp', template: 'Plant tour video and FAQ' },
  { id: 'q4', kind: 'wait', days: 14 },
  { id: 'q5', kind: 'message', channel: 'email', template: 'Applications open for GET 2027' },
];

export const ENGAGEMENT: TimelineItem[] = [
  { id: 'n1', actor: person('Arjun Kulkarni'), action: 'applied to Graduate Engineer Trainee 2027 (sequence stopped)', at: D(2026, 9, 26) },
  { id: 'n2', actor: person('System'), action: 'sent WhatsApp step 3: plant tour video (read)', at: D(2026, 9, 18) },
  { id: 'n3', actor: person('System'), action: 'sent WhatsApp step 1 (delivered, read)', at: D(2026, 9, 4) },
];

/* ---------------- staffing extras ---------------- */

import type { ClientContact, LedgerRow, VendorSubmission } from './hiring-staffing';
import type { PriorSubmission } from './hiring-logic';

export const CLIENT_CONTACTS: ClientContact[] = [
  { name: 'Rekha Balan', role: 'Engineering manager', email: 'rekha.b@nilgiriretail.in', portal: 'Active' },
  { name: 'Srinivas Iyengar', role: 'Accounts payable', email: 'ap@nilgiriretail.in', portal: 'Active', billing: true },
  { name: 'Mary Thomas', role: 'HR manager', email: 'mary.t@nilgiriretail.in', portal: 'Invited' },
  { name: 'Ganesh Pai', role: 'Procurement', email: 'ganesh.p@nilgiriretail.in', portal: 'No access' },
];

export const LEDGER: LedgerRow[] = [
  { client: 'Nilgiri Retail Pvt Ltd', invoice: 'KF/TN/26-27/0184', date: D(2026, 9, 1), outstanding: 11_23_832, tdsDeducted: 0, tds26as: 0, nextReminder: D(2026, 10, 2) },
  { client: 'Nilgiri Retail Pvt Ltd', invoice: 'KF/TN/26-27/0179', date: D(2026, 8, 27), outstanding: 2_26_560, tdsDeducted: 3_840, tds26as: 3_840, nextReminder: D(2026, 10, 2) },
  { client: 'Nilgiri Retail Pvt Ltd', invoice: 'KF/TN/26-27/0151', date: D(2026, 7, 2), outstanding: 6_12_000, tdsDeducted: 12_000, tds26as: null, dispute: '8 h billed twice for 14 Jun (line 3)', nextReminder: D(2026, 9, 30) },
  { client: 'Coromandel Logistics Ltd', invoice: 'KF/KA/26-27/0096', date: D(2026, 9, 3), outstanding: 5_79_936, tdsDeducted: 18_304, tds26as: 18_304 },
  { client: 'Deccan Pharma Pvt Ltd', invoice: 'KF/TN/26-27/0165', date: D(2026, 6, 30), outstanding: 3_40_000, tdsDeducted: 5_763, tds26as: 4_800, nextReminder: D(2026, 9, 29) },
];

export const PRIOR_SUBMISSIONS: PriorSubmission[] = [
  { candidateKey: 'priya.sharma@mailbox.in', jobId: 'j6', source: 'Sahyadri Staffing LLP', at: D(2026, 9, 9) },
  { candidateKey: 'deepak.rao@postbox.in', jobId: 'j6', source: 'own recruiter', at: D(2026, 5, 1) },
];

export const VENDOR_SUBMISSIONS: VendorSubmission[] = [
  { id: 'vs1', vendor: 'Vindhya Talent Partners', candidate: 'Priya Sharma', candidateKey: 'priya.sharma@mailbox.in', job: 'Java Developer', jobId: 'j6', quoted: 880, cap: 900, at: D(2026, 9, 29), rtr: true, consent: true },
  { id: 'vs2', vendor: 'Vindhya Talent Partners', candidate: 'Anand Pillai', candidateKey: 'anand.p@mailbox.in', job: 'Java Developer', jobId: 'j6', quoted: 950, cap: 900, at: D(2026, 9, 28), rtr: true, consent: true },
  { id: 'vs3', vendor: 'Sahyadri Staffing LLP', candidate: 'Deepak Rao', candidateKey: 'deepak.rao@postbox.in', job: 'Java Developer', jobId: 'j6', quoted: 860, cap: 900, at: D(2026, 9, 27), rtr: true, consent: true },
  { id: 'vs4', vendor: 'Sahyadri Staffing LLP', candidate: 'Yamini Reddy', candidateKey: 'yamini.r@postbox.in', job: 'Java Developer', jobId: 'j6', quoted: 840, cap: 900, at: D(2026, 9, 26), rtr: true, consent: false },
];
