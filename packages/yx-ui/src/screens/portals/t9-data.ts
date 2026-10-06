// Fictional sample data for the T9 external portals. Company: Kaveri Foods Pvt Ltd; clients, vendors and people are invented.
import { TODAY } from '../_kit/data';

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

/** Kaveri Foods accent, a deep green (hex without '#'; resolveTenantAccent checks 4.5:1 on white). */
export const KAVERI_ACCENT = '1F6F4A';
export const TENANT = 'Kaveri Foods';
export { TODAY };

/* ------------------------------------------------------------------ T9-01 Pre-boarding */

export type PreItemStatus = 'done' | 'todo' | 'in-review' | 'sent-back' | 'blocked';
export interface PreItem {
  id: string;
  section: 'Welcome' | 'Forms' | 'Documents' | 'E-sign' | 'Bank and tax' | 'Statutory (HR completes)';
  title: string;
  hint?: string;
  status: PreItemStatus;
  due?: Date;
  note?: string;
  hrOwned?: boolean;
}

export const JOINER = {
  name: 'Meenakshi Sundaram',
  email: 'meenakshi.s92@example.in',
  role: 'Quality Analyst',
  department: 'Quality',
  manager: 'Divya Raghunathan',
  location: 'Hosur plant',
  address: 'SIPCOT Phase II, Hosur 635109',
  joiningDate: d(2026, 10, 12),
  reportingTime: '09:30',
  buddy: 'Faisal Khan',
  batch: null as string | null,
};

export const PRE_ITEMS: PreItem[] = [
  { id: 'welcome', section: 'Welcome', title: 'Read your first-day information', status: 'done' },
  { id: 'personal', section: 'Forms', title: 'Personal details', status: 'done' },
  { id: 'family', section: 'Forms', title: 'Family and nominees', hint: 'PF, gratuity and group insurance nominations with shares', status: 'todo', due: d(2026, 10, 5) },
  { id: 'emergency', section: 'Forms', title: 'Emergency contact', status: 'done' },
  { id: 'education', section: 'Forms', title: 'Education', status: 'in-review' },
  { id: 'prev', section: 'Forms', title: 'Previous employment and income (Form 12B)', hint: 'Needed so TDS counts what your last employer already deducted', status: 'todo', due: d(2026, 10, 5) },
  { id: 'pan', section: 'Documents', title: 'PAN card', status: 'done' },
  { id: 'aadhaar', section: 'Documents', title: 'Aadhaar', status: 'in-review' },
  { id: 'photo', section: 'Documents', title: 'Passport-size photo', status: 'done' },
  { id: 'relieving', section: 'Documents', title: 'Relieving letter from last employer', status: 'sent-back', note: 'The page with the last working day is missing. Upload all pages.' },
  { id: 'edu-docs', section: 'Documents', title: 'Degree certificate and mark sheets', status: 'todo', due: d(2026, 10, 8) },
  { id: 'appointment', section: 'E-sign', title: 'Sign your appointment letter', status: 'todo', due: d(2026, 10, 2) },
  { id: 'policies', section: 'E-sign', title: 'Sign the code of conduct and POSH policy', status: 'todo', due: d(2026, 10, 8) },
  { id: 'bank', section: 'Bank and tax', title: 'Bank account for salary', status: 'todo', due: d(2026, 10, 5) },
  { id: 'regime', section: 'Bank and tax', title: 'Choose your tax regime', status: 'todo', due: d(2026, 10, 8) },
  { id: 'uan', section: 'Statutory (HR completes)', title: 'UAN link and Form 11', status: 'blocked', hrOwned: true, note: 'HR starts this after your PAN and Aadhaar are verified.' },
  { id: 'esic', section: 'Statutory (HR completes)', title: 'ESIC IP number', status: 'todo', hrOwned: true },
];

export interface Nominee {
  id: string;
  name: string;
  relation: string;
  dob: Date;
  pf: number;
  gratuity: number;
  insurance: number;
}
export const NOMINEES: Nominee[] = [
  { id: 'n1', name: 'Sundaram Rajagopal', relation: 'Father', dob: d(1961, 3, 14), pf: 50, gratuity: 50, insurance: 40 },
  { id: 'n2', name: 'Kamala Sundaram', relation: 'Mother', dob: d(1966, 8, 2), pf: 50, gratuity: 50, insurance: 40 },
];

/* ------------------------------------------------------------------ T9-02 Alumni + nominee */

export interface PortalDoc {
  id: string;
  kind: 'Payslip' | 'Form 16' | 'Letter' | 'F&F statement' | 'Claim form' | 'Claim cover letter';
  title: string;
  period?: string;
  issuedOn: Date;
  size: string;
  status?: 'released' | 'pending' | 'submitted';
}

export const ALUMNUS = {
  name: 'Rohan Deshpande',
  email: 'rohan.deshpande@example.in',
  code: 'KF-0419',
  exitDate: d(2025, 6, 30),
  lastRole: 'Area Sales Manager',
};

export const ALUMNI_DOCS: PortalDoc[] = [
  { id: 'p1', kind: 'Payslip', title: 'Payslip · June 2025', period: 'FY 2025-26', issuedOn: d(2025, 7, 1), size: '84 KB' },
  { id: 'p2', kind: 'Payslip', title: 'Payslip · May 2025', period: 'FY 2025-26', issuedOn: d(2025, 5, 31), size: '82 KB' },
  { id: 'p3', kind: 'Payslip', title: 'Payslip · April 2025', period: 'FY 2025-26', issuedOn: d(2025, 4, 30), size: '82 KB' },
  { id: 'p4', kind: 'Payslip', title: 'Payslip · March 2025', period: 'FY 2024-25', issuedOn: d(2025, 3, 31), size: '81 KB' },
  { id: 'p5', kind: 'Payslip', title: 'Payslip · February 2025', period: 'FY 2024-25', issuedOn: d(2025, 2, 28), size: '81 KB' },
  { id: 'f1', kind: 'Form 16', title: 'Form 16 · FY 2025-26 (Part A and B)', period: 'FY 2025-26', issuedOn: d(2026, 6, 12), size: '212 KB' },
  { id: 'f2', kind: 'Form 16', title: 'Form 16 · FY 2024-25 (Part A and B)', period: 'FY 2024-25', issuedOn: d(2025, 6, 10), size: '208 KB' },
  { id: 'l1', kind: 'Letter', title: 'Relieving letter', issuedOn: d(2025, 6, 30), size: '64 KB' },
  { id: 'l2', kind: 'Letter', title: 'Experience certificate', issuedOn: d(2025, 6, 30), size: '61 KB' },
  { id: 'l3', kind: 'Letter', title: 'Full and final settlement statement', issuedOn: d(2025, 8, 14), size: '96 KB' },
];

export const NOMINEE_PERSON = { name: 'Lalitha Krishnan', relation: 'Spouse', email: 'lalitha.k@example.in' };
export const DECEASED = { name: 'Venkat Krishnan', code: 'KF-0133', role: 'Shift Supervisor', dateOfDeath: d(2026, 8, 3) };

export const NOMINEE_DOCS: PortalDoc[] = [
  { id: 'c1', kind: 'F&F statement', title: 'Full and final settlement statement', issuedOn: d(2026, 9, 18), size: '104 KB', status: 'released' },
  { id: 'c2', kind: 'Form 16', title: 'Form 16 · FY 2026-27 (up to August)', issuedOn: d(2026, 9, 18), size: '188 KB', status: 'released' },
  { id: 'c3', kind: 'Letter', title: 'Service certificate', issuedOn: d(2026, 9, 18), size: '58 KB', status: 'released' },
  { id: 'c4', kind: 'Claim cover letter', title: 'Cover letter for PF, pension and EDLI claims', issuedOn: d(2026, 9, 20), size: '44 KB', status: 'released' },
  { id: 'c5', kind: 'Claim form', title: 'EDLI · Form 5 IF (employer-attested)', issuedOn: d(2026, 9, 20), size: '120 KB', status: 'released' },
  { id: 'c6', kind: 'Claim form', title: 'EPS · Form 10D (employer-attested)', issuedOn: d(2026, 9, 20), size: '118 KB', status: 'released' },
  { id: 'c7', kind: 'Claim form', title: 'PF · Form 20 (employer-attested)', issuedOn: d(2026, 9, 20), size: '116 KB', status: 'released' },
  { id: 'c8', kind: 'Claim form', title: 'Gratuity · Form J (nominee claim)', issuedOn: d(2026, 9, 24), size: '72 KB', status: 'pending' },
];

export const FNF_LINES = [
  { label: 'Salary for 1–3 Aug 2026', amount: 6_450 },
  { label: 'Leave encashment (18 days)', amount: 38_700 },
  { label: 'Gratuity (11 years)', amount: 3_28_846 },
  { label: 'Group insurance claim (insurer pays directly)', amount: 0 },
  { label: 'Less: salary advance outstanding', amount: -12_000 },
];

/* ------------------------------------------------------------------ T9-03 Trainer */

export interface TrainerSession {
  id: string;
  course: string;
  date: Date;
  time: string;
  venue: string;
  seats: number;
  status: 'upcoming' | 'today' | 'completed';
  attendees: { id: string; name: string; present: boolean | null; score: number | null }[];
  feedback?: { responses: number; avg: number; comments: string[] };
  passMark: number;
}

const ATTENDEES = [
  'Arjun Kulkarni', 'Sana Nizami', 'Faisal Khan', 'Priya Menon', 'Gopal Reddy', 'Anjali Nair',
  'Harpreet Kaur', 'Mohammed Irfan', 'Revathi Balan', 'Tenzing Dorje', 'Kavya Shetty', 'Joseph Mathew',
];

export const TRAINER = { name: 'Ramya Iyengar', firm: 'Saptagiri Safety Trainers', email: 'ramya@saptagiri-safety.in' };

export const TRAINER_SESSIONS: TrainerSession[] = [
  {
    id: 's1', course: 'Food safety and HACCP basics', date: d(2026, 9, 29), time: '10:00', venue: 'Hosur plant · Training room 2', seats: 12, status: 'today', passMark: 60,
    attendees: ATTENDEES.map((n, i) => ({ id: `a${i}`, name: n, present: i < 9 ? true : null, score: null })),
  },
  {
    id: 's2', course: 'Forklift safety refresher', date: d(2026, 9, 22), time: '14:00', venue: 'Hosur plant · Warehouse bay', seats: 10, status: 'completed', passMark: 70,
    attendees: ATTENDEES.slice(0, 10).map((n, i) => ({ id: `b${i}`, name: n, present: i !== 3, score: i === 3 ? null : [82, 74, 91, null, 66, 88, 79, 71, 95, 69][i] })),
    feedback: { responses: 8, avg: 4.4, comments: ['Practical and clear', 'More time on the pre-use checklist', 'Good use of the real forklift'] },
  },
  {
    id: 's3', course: 'Fire warden training', date: d(2026, 10, 14), time: '09:30', venue: 'Chennai office · Board room', seats: 15, status: 'upcoming', passMark: 60,
    attendees: ATTENDEES.slice(2, 11).map((n, i) => ({ id: `c${i}`, name: n, present: null, score: null })),
  },
];

/* ------------------------------------------------------------------ T9-04 POSH IC external + external party */

export interface IcCase {
  ref: string;
  receivedOn: Date;
  stage: 'Acknowledged' | 'Notice sent' | 'Hearing scheduled' | 'Inquiry' | 'Findings drafted' | 'Decision' | 'Appeal window';
  inquiryDue: Date;
  nextHearing?: Date;
  complainantType: 'Employee' | 'External party';
  conflict?: boolean;
}

export const IC_MEMBER = { name: 'Adv. Shobha Narayanan', org: 'Nyaya Legal Aid Trust', tenureEnds: d(2027, 12, 31) };

export const IC_CASES: IcCase[] = [
  { ref: 'POSH-2026-007', receivedOn: d(2026, 8, 18), stage: 'Hearing scheduled', inquiryDue: d(2026, 11, 16), nextHearing: d(2026, 10, 1, 15, 0), complainantType: 'Employee' },
  { ref: 'POSH-2026-009', receivedOn: d(2026, 9, 9), stage: 'Notice sent', inquiryDue: d(2026, 12, 8), complainantType: 'External party' },
  { ref: 'POSH-2026-004', receivedOn: d(2026, 6, 2), stage: 'Findings drafted', inquiryDue: d(2026, 8, 31), complainantType: 'Employee' },
  { ref: 'POSH-2026-010', receivedOn: d(2026, 9, 21), stage: 'Acknowledged', inquiryDue: d(2026, 12, 20), complainantType: 'Employee', conflict: true },
];

/* ------------------------------------------------------------------ T9-05 Audit-committee chair */

export interface WbCase {
  ref: string;
  category: 'Financial fraud' | 'Bribery' | 'Data misuse' | 'Retaliation' | 'Conflict of interest' | 'Safety';
  severity: 'Serious' | 'High';
  receivedOn: Date;
  ackDue: Date;
  feedbackDue: Date;
  status: 'Awaiting acknowledgement' | 'Investigation' | 'Outcome ready' | 'Closed';
  retaliation: boolean;
  investigator: string;
}

export const ACC_CHAIR = { name: 'Dr. Usha Ramachandran', role: 'Chair, audit committee' };

export const WB_CASES: WbCase[] = [
  { ref: 'WB-2026-015', category: 'Financial fraud', severity: 'Serious', receivedOn: d(2026, 9, 24), ackDue: d(2026, 10, 1), feedbackDue: d(2026, 12, 24), status: 'Awaiting acknowledgement', retaliation: false, investigator: 'Ethics officer' },
  { ref: 'WB-2026-011', category: 'Bribery', severity: 'Serious', receivedOn: d(2026, 7, 30), ackDue: d(2026, 8, 6), feedbackDue: d(2026, 10, 30), status: 'Outcome ready', retaliation: true, investigator: 'External forensic auditor' },
  { ref: 'WB-2026-008', category: 'Conflict of interest', severity: 'High', receivedOn: d(2026, 6, 11), ackDue: d(2026, 6, 18), feedbackDue: d(2026, 9, 11), status: 'Investigation', retaliation: false, investigator: 'Ethics officer' },
  { ref: 'WB-2026-003', category: 'Data misuse', severity: 'High', receivedOn: d(2026, 3, 2), ackDue: d(2026, 3, 9), feedbackDue: d(2026, 6, 2), status: 'Closed', retaliation: false, investigator: 'Ethics officer' },
];

/* ------------------------------------------------------------------ T9-07 Anonymous reporter */

export const ANON_CASE = {
  ref: 'SPK-2026-0231',
  code: 'K7QM-4TZ8-XR2P-9HDW',
  category: 'Unsafe work practice',
  filedOn: d(2026, 9, 12, 21, 14),
  status: 'Under review' as 'Received' | 'Under review' | 'Action taken' | 'Closed',
  messages: [
    { id: 'm1', from: 'me' as const, at: d(2026, 9, 12, 21, 14), text: 'Night-shift loaders at Hosur plant are asked to skip the forklift pre-use check to meet dispatch targets. This has happened on most nights in September.' },
    { id: 'm2', from: 'desk' as const, at: d(2026, 9, 14, 11, 2), text: 'Thank you for reporting this. We have opened a review. Can you tell us which bay or dock this happens at? You do not need to share your name.' },
    { id: 'm3', from: 'me' as const, at: d(2026, 9, 15, 22, 40), text: 'Mostly dock 3 and dock 4, between 1 am and 4 am.' },
    { id: 'm4', from: 'desk' as const, at: d(2026, 9, 25, 16, 30), text: 'Update: the safety team has started unannounced checks on docks 3 and 4. We will share the outcome when the review closes.' },
  ],
};

/* ------------------------------------------------------------------ T9-08 Verify */

export const VERIFY_DOCS = [
  { code: 'KF-VRF-8Q2M-41TZ', company: 'Kaveri Foods Pvt Ltd', type: 'Experience certificate', name: 'Rohan Deshpande', issuedOn: d(2025, 6, 30), status: 'issued' as const },
  { code: 'KF-VRF-3N7P-90KD', company: 'Kaveri Foods Pvt Ltd', type: 'Salary certificate', name: 'Anjali Nair', issuedOn: d(2026, 4, 10), status: 'superseded' as const, supersededOn: d(2026, 5, 2) },
  { code: 'KF-VRF-7H1C-22WX', company: 'Kaveri Foods Pvt Ltd', type: 'Offer letter', name: 'Gopal Reddy', issuedOn: d(2026, 2, 3), status: 'withdrawn' as const },
];
