// Sample data for YukthiX-hosted public pages: developer portal, help centre, status page, roadmap, calculators,
// integrations directory and academy. Partner and integration names are fictional.
import type { ComponentStatus } from './portals-logic';

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

/* ------------------------------------------------------------------ T9-10 Developer portal */

export const ENDPOINTS = [
  { method: 'GET', path: '/v1/employees', summary: 'List employees', scope: 'employees:read' },
  { method: 'GET', path: '/v1/employees/{id}', summary: 'Get one employee', scope: 'employees:read' },
  { method: 'POST', path: '/v1/leave-requests', summary: 'Create a leave request', scope: 'leave:write' },
  { method: 'GET', path: '/v1/payroll-runs/{id}/payslips', summary: 'List payslips in a run', scope: 'payroll:read' },
  { method: 'POST', path: '/v1/webhooks', summary: 'Register a webhook endpoint', scope: 'webhooks:write' },
];

export const CHANGELOG = [
  { date: d(2026, 9, 24), version: 'v1.14', kind: 'Added', text: 'GET /v1/employees supports ?updated_since= for incremental sync.' },
  { date: d(2026, 9, 10), version: 'v1.13', kind: 'Changed', text: 'Leave requests return half_day_session as "first_half" or "second_half".' },
  { date: d(2026, 8, 28), version: 'v1.12', kind: 'Deprecated', text: 'GET /v1/attendance/daily is deprecated. Sunset on 28 Aug 2027. Use GET /v1/attendance/days.' },
  { date: d(2026, 8, 2), version: 'v1.11', kind: 'Fixed', text: 'Idempotency-Key reuse with a different body now returns 409 instead of 422.' },
];

/* ------------------------------------------------------------------ T9-16 Help centre */

export const HELP_PRODUCTS = [
  { id: 'hr', name: 'YukthiX HR', articles: 214, text: 'Employees, leave, attendance, payroll and statutory filing' },
  { id: 'hire', name: 'YukthiX Hire', articles: 96, text: 'Jobs, careers site, candidates, interviews and offers' },
  { id: 'assess', name: 'YukthiX Assess', articles: 71, text: 'Question banks, tests, proctoring and results' },
  { id: 'partners', name: 'Partners', articles: 22, text: 'Client links, partner billing and the partner portal' },
  { id: 'dev', name: 'Developers', articles: 38, text: 'API keys, webhooks and SDKs' },
];

export const HELP_ARTICLE = {
  title: 'Run payroll for the first time',
  product: 'YukthiX HR',
  module: 'Payroll',
  appliesFrom: 'Release 3.2 (wave 3)',
  lastReviewed: d(2026, 8, 18),
  steps: [
    'Open Pay › Payroll and select Start September run.',
    'Fix everything the readiness check lists: missing bank details, unverified PAN, attendance not locked.',
    'Review the variance against last month. Lines that moved more than 10% are highlighted.',
    'Send the run for approval. The approver types the entity and month to confirm.',
    'Release the bank file, then publish payslips.',
  ],
  video: { title: 'Your first payroll run (4 min)', captions: 'English, Hindi, Tamil, Telugu captions' },
};

export const HELP_RESULTS = [
  { title: 'Run payroll for the first time', product: 'YukthiX HR', snippet: 'Start a run, fix readiness items, review variance, approve and publish.' },
  { title: 'Lock a payroll period', product: 'YukthiX HR', snippet: 'Locking stops changes; later changes go to next month as arrears.' },
  { title: 'Why is a payslip different from last month?', product: 'YukthiX HR', snippet: 'Each changed line shows its cause and a link to the source.' },
];

/* ------------------------------------------------------------------ T9-17 Status page */

export const STATUS_REGIONS = ['IN', 'ME-AE', 'ME-SA', 'EU', 'US', 'SG'];
export const REGION_LABEL: Record<string, string> = { IN: 'India', 'ME-AE': 'UAE', 'ME-SA': 'Saudi Arabia', EU: 'Europe', US: 'United States', SG: 'Singapore' };

export interface StatusComponentRow {
  product: 'YukthiX HR' | 'YukthiX Hire' | 'YukthiX Assess' | 'Platform';
  name: string;
  status: ComponentStatus;
}

export const STATUS_COMPONENTS: StatusComponentRow[] = [
  { product: 'Platform', name: 'Sign-in (OTP and SSO)', status: 'operational' },
  { product: 'Platform', name: 'API', status: 'operational' },
  { product: 'YukthiX HR', name: 'Payslips', status: 'operational' },
  { product: 'YukthiX HR', name: 'Bank files', status: 'operational' },
  { product: 'YukthiX Hire', name: 'Careers pages', status: 'operational' },
  { product: 'YukthiX Assess', name: 'Test delivery', status: 'operational' },
  { product: 'YukthiX Assess', name: 'Proctoring', status: 'operational' },
];

/** 90 days of history, oldest first; deterministic. */
export function statusHistory(end: Date, bad: { daysAgo: number; status: ComponentStatus; note: string }[] = []) {
  return Array.from({ length: 90 }, (_, i) => {
    const daysAgo = 89 - i;
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - daysAgo);
    const hit = bad.find((b) => b.daysAgo === daysAgo);
    return { date, status: hit?.status ?? ('operational' as ComponentStatus), note: hit?.note };
  });
}

export const INCIDENT = {
  title: 'Payslip PDFs slow to open',
  severity: 'Sev-2',
  products: 'YukthiX HR',
  regions: 'India',
  components: 'Payslips',
  impact: 'Payslip PDFs take up to 40 seconds to open. Payslip figures in the app are correct and load normally.',
  whatToDo: 'No action needed. If you are publishing payslips today, publishing still works; employees may see a delay opening the PDF.',
  nextUpdate: d(2026, 9, 29, 10, 30),
  payrollNote: true,
  updates: [
    { stage: 'Identified', at: d(2026, 9, 29, 9, 20), text: 'A storage node serving PDFs in Mumbai is slow. We are moving traffic to a healthy node.' },
    { stage: 'Investigating', at: d(2026, 9, 29, 8, 58), text: 'We are looking into slow payslip PDF downloads in India.' },
  ],
};

export const MAINTENANCE = {
  title: 'Database upgrade, Singapore region',
  window: { from: d(2026, 10, 11, 1, 0), to: d(2026, 10, 11, 3, 0) },
  regions: 'Singapore',
  impact: 'Sign-in and all products in the Singapore region are read-only for up to 20 minutes within the window.',
  scheduledOn: d(2026, 9, 27, 11, 0),
};

export const STATUS_HISTORY = [
  { date: d(2026, 9, 14), title: 'Careers-page apply failed for some candidates', duration: '38 minutes', status: 'Resolved' },
  { date: d(2026, 8, 30), title: 'Scheduled maintenance, India region', duration: '1 hour 10 minutes', status: 'Completed' },
  { date: d(2026, 8, 5), title: 'Proctoring video uploads delayed', duration: '2 hours 5 minutes', status: 'Resolved' },
];

/* ------------------------------------------------------------------ T9-22 Roadmap */

export type RoadmapStatus = 'Under review' | 'Planned' | 'In progress' | 'Shipped' | 'Not planned';
export interface RoadmapItem {
  id: string;
  title: string;
  product: string;
  status: RoadmapStatus;
  votes: number;
  note?: string;
}
export const ROADMAP: RoadmapItem[] = [
  { id: 'r1', title: 'Shift swap approvals on WhatsApp', product: 'HR', status: 'Under review', votes: 184 },
  { id: 'r2', title: 'Kannada and Malayalam in the employee app', product: 'HR', status: 'Planned', votes: 412 },
  { id: 'r3', title: 'Bulk offer letters for campus hiring', product: 'Hire', status: 'In progress', votes: 236 },
  { id: 'r4', title: 'Tamil Nadu LWF half-yearly return', product: 'HR', status: 'Shipped', votes: 97, note: 'Shipped 12 Sep 2026' },
  { id: 'r5', title: 'Offline test delivery for low-bandwidth centres', product: 'Assess', status: 'Planned', votes: 158 },
  { id: 'r6', title: 'Custom fonts on payslips', product: 'HR', status: 'Not planned', votes: 31, note: 'Payslips keep one accessible font' },
  { id: 'r7', title: 'Interview panel availability from calendars', product: 'Hire', status: 'Under review', votes: 122 },
];

/* ------------------------------------------------------------------ T9-24 Integrations directory */

export interface Integration {
  id: string;
  partner: string;
  category: string;
  data: string;
  direction: 'Into YukthiX' | 'Out of YukthiX' | 'Both ways';
  status: 'Live' | 'Beta' | 'Coming';
}
export const INTEGRATIONS: Integration[] = [
  { id: 'i1', partner: 'LedgerLine Accounting', category: 'Accounting', data: 'Payroll journal, expense postings', direction: 'Out of YukthiX', status: 'Live' },
  { id: 'i2', partner: 'Samvad Chat', category: 'Chat', data: 'Approvals, leave requests, announcements', direction: 'Both ways', status: 'Live' },
  { id: 'i3', partner: 'Sethu Bank bulk payments', category: 'Banking', data: 'Salary bank files, payment status', direction: 'Both ways', status: 'Live' },
  { id: 'i4', partner: 'Kaval Biometrics', category: 'Attendance devices', data: 'Punches from biometric devices', direction: 'Into YukthiX', status: 'Live' },
  { id: 'i5', partner: 'Mudrika eSign', category: 'E-signature', data: 'Letters for signature, signed PDFs', direction: 'Both ways', status: 'Beta' },
  { id: 'i6', partner: 'Nirikshan BGV', category: 'Background checks', data: 'Candidate details, check results', direction: 'Both ways', status: 'Beta' },
  { id: 'i7', partner: 'Pathik Travel Desk', category: 'Travel', data: 'Trip requests, bookings, invoices', direction: 'Both ways', status: 'Coming' },
  { id: 'i8', partner: 'Karya Projects', category: 'Projects', data: 'Projects, tasks, logged hours', direction: 'Into YukthiX', status: 'Coming' },
];

/* ------------------------------------------------------------------ T9-25 Academy */

export const COURSES = [
  { id: 'c1', title: 'YukthiX HR admin essentials', audience: 'Admins', lessons: 12, hours: 3, certificate: false, progress: 100 },
  { id: 'c2', title: 'Payroll administrator certification', audience: 'Admins', lessons: 18, hours: 6, certificate: true, progress: 55 },
  { id: 'c3', title: 'Partner implementation certification', audience: 'Partners', lessons: 22, hours: 8, certificate: true, progress: 0, required: 'Required before a partner implements for customers' },
  { id: 'c4', title: 'Hiring on YukthiX Hire', audience: 'Admins', lessons: 9, hours: 2, certificate: false, progress: 0 },
];

export const CERTIFICATE = {
  id: 'YXA-PAY-2026-01842',
  name: 'Suresh Pillai',
  course: 'Payroll administrator certification',
  issuedOn: d(2025, 11, 14),
  expiresOn: d(2027, 11, 14),
};
