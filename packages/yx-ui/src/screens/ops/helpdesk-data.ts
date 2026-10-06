// Fictional sample data for Helpdesk, cases and policies screens (M08). Deterministic.
import { TODAY } from '../_kit/data';

const at = (day: number, h: number, m = 0, month = 8) => new Date(2026, month, day, h, m);

export type TicketStatus = 'New' | 'In progress' | 'Waiting on employee' | 'Resolved' | 'Closed' | 'Reopened';
export type Priority = 'Urgent' | 'High' | 'Normal' | 'Low';

export interface Ticket {
  id: string;
  subject: string;
  requester: string;
  requesterRole: string;
  queue: 'HR' | 'Payroll' | 'IT' | 'Admin' | 'Finance';
  category: string;
  sensitive?: boolean;
  private?: boolean;
  priority: Priority;
  status: TicketStatus;
  assignee: string | null;
  createdAt: Date;
  /** Business minutes elapsed against each target. */
  firstResponse: { elapsed: number; target: number; met?: boolean };
  resolution: { elapsed: number; target: number };
  channel: 'App' | 'Email' | 'Assistant';
  rating?: number;
}

export const TICKETS: Ticket[] = [
  { id: 'HD-2291', subject: 'September payslip shows LOP for 2 days I was on approved leave', requester: 'Divya Raghunathan', requesterRole: 'Senior QA Engineer', queue: 'Payroll', category: 'Payslip query', sensitive: true, priority: 'High', status: 'In progress', assignee: 'Suresh Pillai', createdAt: at(28, 10, 12), firstResponse: { elapsed: 42, target: 240, met: true }, resolution: { elapsed: 1320, target: 1440 }, channel: 'App' },
  { id: 'HD-2290', subject: 'Laptop battery drains within an hour', requester: 'Arjun Kulkarni', requesterRole: 'Operations Analyst', queue: 'IT', category: 'Hardware', priority: 'Normal', status: 'New', assignee: null, createdAt: at(29, 8, 50), firstResponse: { elapsed: 52, target: 240 }, resolution: { elapsed: 52, target: 2880 }, channel: 'Email' },
  { id: 'HD-2288', subject: 'Address proof letter for passport application', requester: 'Meera Nair', requesterRole: 'Finance Executive', queue: 'HR', category: 'Letters', priority: 'Normal', status: 'Waiting on employee', assignee: 'Lakshmi Venkatesan', createdAt: at(26, 15, 5), firstResponse: { elapsed: 30, target: 240, met: true }, resolution: { elapsed: 960, target: 2880 }, channel: 'App' },
  { id: 'HD-2285', subject: 'Medical reimbursement for my father — which documents?', requester: 'Karthik Subramanian', requesterRole: 'QA Manager', queue: 'HR', category: 'Medical', sensitive: true, private: true, priority: 'Normal', status: 'In progress', assignee: 'Lakshmi Venkatesan', createdAt: at(25, 11, 40), firstResponse: { elapsed: 200, target: 240, met: true }, resolution: { elapsed: 2500, target: 2880 }, channel: 'App' },
  { id: 'HD-2281', subject: 'Canteen card not working at Hosur plant', requester: 'Ravi Shankar', requesterRole: 'Line Supervisor', queue: 'Admin', category: 'Facilities', priority: 'High', status: 'In progress', assignee: 'Farhan Qureshi', createdAt: at(24, 9, 0), firstResponse: { elapsed: 250, target: 240, met: false }, resolution: { elapsed: 1500, target: 1440 }, channel: 'App' },
  { id: 'HD-2279', subject: 'Form 16 for last year not visible in the app', requester: 'Sana Nizami', requesterRole: 'Sales Manager', queue: 'Payroll', category: 'Tax documents', sensitive: true, priority: 'Normal', status: 'Resolved', assignee: 'Suresh Pillai', createdAt: at(22, 14, 20), firstResponse: { elapsed: 35, target: 240, met: true }, resolution: { elapsed: 600, target: 2880 }, channel: 'Assistant', rating: 5 },
  { id: 'HD-2276', subject: 'VPN keeps disconnecting from home', requester: 'Priya Menon', requesterRole: 'Software Engineer', queue: 'IT', category: 'Network', priority: 'Urgent', status: 'In progress', assignee: 'Joseph Mathew', createdAt: at(29, 7, 55), firstResponse: { elapsed: 25, target: 60, met: true }, resolution: { elapsed: 105, target: 240 }, channel: 'App' },
  { id: 'HD-2270', subject: 'Travel advance not credited for Mumbai trip', requester: 'Vikram Rao', requesterRole: 'Area Sales Manager', queue: 'Finance', category: 'Advances', priority: 'High', status: 'Reopened', assignee: 'Anita Desai', createdAt: at(21, 16, 30), firstResponse: { elapsed: 60, target: 240, met: true }, resolution: { elapsed: 1250, target: 1440 }, channel: 'App' },
  { id: 'HD-2266', subject: 'Change nominee for gratuity', requester: 'Farzana Begum', requesterRole: 'Quality Inspector', queue: 'HR', category: 'Records', priority: 'Low', status: 'Closed', assignee: 'Lakshmi Venkatesan', createdAt: at(18, 10, 0), firstResponse: { elapsed: 90, target: 480, met: true }, resolution: { elapsed: 2000, target: 4320 }, channel: 'App', rating: 4 },
];

export const MY_TICKETS = TICKETS.filter((t) => ['Divya Raghunathan'].includes(t.requester)).concat([
  { ...TICKETS[5], id: 'HD-2203', requester: 'Divya Raghunathan', subject: 'Update my bank account for salary', status: 'Closed', rating: 5, queue: 'Payroll', category: 'Bank details' },
  { ...TICKETS[5], id: 'HD-2248', requester: 'Divya Raghunathan', subject: 'Leave balance for comp-off earned on 6 Sep', status: 'Resolved', queue: 'HR', category: 'Leave', sensitive: false, rating: undefined },
]);

export interface KbArticle {
  id: string;
  title: string;
  summary: string;
  category: string;
  views: number;
  deflected: number;
  updated: Date;
  status: 'Published' | 'Draft' | 'Review due';
  author: string;
}
export const ARTICLES: KbArticle[] = [
  { id: 'KB-104', title: 'Why does my payslip show loss of pay?', summary: 'How LOP days are counted, and how to fix a missed leave or punch before the payroll cut-off.', category: 'Payroll', views: 1240, deflected: 312, updated: new Date(2026, 8, 2), status: 'Published', author: 'Suresh Pillai' },
  { id: 'KB-118', title: 'Correct a missed punch (regularise attendance)', summary: 'Raise a regularisation from Time › Attendance within 7 days; your manager approves.', category: 'Attendance', views: 980, deflected: 290, updated: new Date(2026, 7, 20), status: 'Published', author: 'Lakshmi Venkatesan' },
  { id: 'KB-121', title: 'Download Form 16 and Form 130', summary: 'Certificates for tax year 2026-27 are Form 130; Form 16 remains for FY 2025-26 and earlier.', category: 'Tax', views: 760, deflected: 205, updated: new Date(2026, 5, 18), status: 'Published', author: 'Suresh Pillai' },
  { id: 'KB-130', title: 'Request an address proof or employment letter', summary: 'Letters are issued from Me › Documents & letters within 2 working days.', category: 'Letters', views: 410, deflected: 96, updated: new Date(2026, 3, 11), status: 'Review due', author: 'Lakshmi Venkatesan' },
  { id: 'KB-133', title: 'Travel advance: when is it credited?', summary: 'Approved trip advances are paid in the next payout batch (Tuesdays and Fridays).', category: 'Expenses', views: 305, deflected: 71, updated: new Date(2026, 8, 14), status: 'Published', author: 'Anita Desai' },
  { id: 'KB-140', title: 'Set up VPN on a home network', summary: 'Install the client, sign in with your work account and allow the connection.', category: 'IT', views: 0, deflected: 0, updated: new Date(2026, 8, 28), status: 'Draft', author: 'Joseph Mathew' },
];

export const MACROS = [
  { id: 'm1', name: 'LOP correction: leave approved after cut-off', body: 'Hi {first_name}, thanks for flagging this. Your leave was approved after the September cut-off, so the 2 days show as loss of pay. We have added them back as arrears in the October run. You will see them on your October payslip.' },
  { id: 'm2', name: 'Ask for a document', body: 'Hi {first_name}, could you attach {document} to this ticket? We will pick it up as soon as it arrives.' },
  { id: 'm3', name: 'Resolved: point to article', body: 'Hi {first_name}, the steps are in this article: {article_link}. I am marking this as resolved; reply here within 7 days if you need more help.' },
];

/* ---------------- Cases ---------------- */

export type CaseType = 'Grievance' | 'Disciplinary' | 'Whistleblower' | 'Workplace accident' | 'Collective dispute' | 'POSH';
export interface CaseRow {
  id: string;
  type: CaseType;
  subject: string;
  stage: string;
  status: 'Open' | 'On hold' | 'Closed';
  raisedBy: string;
  respondent?: string;
  owner: string;
  opened: Date;
  nextDue: Date;
  nextStep: string;
  anonymous?: boolean;
  location: string;
}
export const CASES: CaseRow[] = [
  { id: 'GRV-0142', type: 'Grievance', subject: 'Night-shift transport not provided on 3 occasions', stage: 'Investigation', status: 'Open', raisedBy: 'Farzana Begum', owner: 'Lakshmi Venkatesan', opened: new Date(2026, 8, 12), nextDue: new Date(2026, 9, 2), nextStep: 'Finding', location: 'Hosur plant' },
  { id: 'GRV-0145', type: 'Grievance', subject: 'Overtime for August not paid', stage: 'Acknowledged', status: 'Open', raisedBy: 'Anonymous', anonymous: true, owner: 'Grievance Redressal Committee, Hosur', opened: new Date(2026, 8, 24), nextDue: new Date(2026, 9, 8), nextStep: 'Owner assigned', location: 'Hosur plant' },
  { id: 'DSC-0031', type: 'Disciplinary', subject: 'Unauthorised absence, 5 consecutive days', stage: 'Show-cause reply', status: 'Open', raisedBy: 'Ravi Shankar', respondent: 'Manoj Kumar', owner: 'Lakshmi Venkatesan', opened: new Date(2026, 8, 18), nextDue: new Date(2026, 8, 30), nextStep: 'Reply due from employee', location: 'Hosur plant' },
  { id: 'WB-0009', type: 'Whistleblower', subject: 'Vendor invoices approved without delivery', stage: 'Investigation', status: 'Open', raisedBy: 'Anonymous', anonymous: true, owner: 'Rekha Iyengar (Ethics officer)', opened: new Date(2026, 8, 3), nextDue: new Date(2026, 9, 15), nextStep: 'Interim report to audit committee', location: 'Bengaluru head office' },
  { id: 'ACC-0004', type: 'Workplace accident', subject: 'Hand injury at packing line 2', stage: 'Statutory reports', status: 'Open', raisedBy: 'Ravi Shankar', owner: 'Gopal Krishnan (Safety officer)', opened: new Date(2026, 8, 28), nextDue: new Date(2026, 8, 30), nextStep: 'ESIC accident report', location: 'Hosur plant' },
  { id: 'IRD-0002', type: 'Collective dispute', subject: 'Charter of demands 2026, Kaveri Foods Workers Union', stage: 'Conciliation', status: 'Open', raisedBy: 'Kaveri Foods Workers Union', owner: 'Harish Bhat (IR lead)', opened: new Date(2026, 5, 2), nextDue: new Date(2026, 9, 6), nextStep: 'Conciliation meeting 3', location: 'Hosur plant' },
  { id: 'GRV-0121', type: 'Grievance', subject: 'Seating near furnace area', stage: 'Closed with actions', status: 'Closed', raisedBy: 'Sathish Kumar', owner: 'Lakshmi Venkatesan', opened: new Date(2026, 6, 2), nextDue: new Date(2026, 7, 2), nextStep: '—', location: 'Hosur plant' },
];

export interface CaseEvent {
  id: string;
  at: Date;
  who: string;
  text: string;
}
export interface AnonMessage {
  id: string;
  from: 'reporter' | 'team';
  who?: string;
  at: Date;
  text: string;
}
export const ANON_MESSAGES: AnonMessage[] = [
  { id: 'a1', from: 'reporter', at: at(3, 22, 10), text: 'Three invoices from the packaging vendor in July were approved though the goods never reached the Hosur store. I can share the GRN numbers.' },
  { id: 'a2', from: 'team', who: 'Rekha Iyengar', at: at(4, 10, 30), text: 'Thank you. We have acknowledged your report. Please share the GRN numbers here; nobody on the team can see who you are.' },
  { id: 'a3', from: 'reporter', at: at(5, 21, 0), text: 'GRN 4471, 4472 and 4480. The invoices are dated 12, 14 and 19 July.' },
  { id: 'a4', from: 'team', who: 'Rekha Iyengar', at: at(22, 11, 15), text: 'We have matched two of the three. Do you know who received the goods at the store for GRN 4480?' },
];

/* ---------------- Policies ---------------- */

export interface PolicyRow {
  id: string;
  title: string;
  category: string;
  version: string;
  effective: Date;
  method: 'Click' | 'OTP' | 'Quiz';
  critical?: boolean;
  due?: Date;
  myStatus: 'Pending' | 'Acknowledged' | 'Overdue' | 'Not required';
  acknowledgedOn?: Date;
  audience: number;
  acknowledged: number;
  owner: string;
  changeSummary: string;
}
export const POLICIES: PolicyRow[] = [
  { id: 'POL-01', title: 'Code of conduct', category: 'Conduct', version: 'v4', effective: new Date(2026, 8, 15), method: 'OTP', critical: true, due: new Date(2026, 9, 5), myStatus: 'Pending', audience: 248, acknowledged: 171, owner: 'Lakshmi Venkatesan', changeSummary: 'Adds social-media conduct and gifts limit of ₹2,000.' },
  { id: 'POL-02', title: 'Prevention of sexual harassment (POSH)', category: 'Conduct', version: 'v3', effective: new Date(2026, 3, 1), method: 'Quiz', critical: true, due: new Date(2026, 8, 25), myStatus: 'Overdue', audience: 248, acknowledged: 219, owner: 'Lakshmi Venkatesan', changeSummary: 'New Internal Committee members; complaint route in the app.' },
  { id: 'POL-03', title: 'Leave policy 2026', category: 'Time off', version: 'v2', effective: new Date(2026, 0, 1), method: 'Click', myStatus: 'Acknowledged', acknowledgedOn: new Date(2026, 0, 6), audience: 248, acknowledged: 246, owner: 'Lakshmi Venkatesan', changeSummary: 'Earned leave carry-forward limit raised to 45 days.' },
  { id: 'POL-04', title: 'Travel and expenses', category: 'Money', version: 'v5', effective: new Date(2026, 6, 1), method: 'Click', due: new Date(2026, 9, 10), myStatus: 'Pending', audience: 132, acknowledged: 88, owner: 'Anita Desai', changeSummary: 'Hotel caps by city tier; receipts above ₹500.' },
  { id: 'POL-05', title: 'Information security', category: 'IT', version: 'v3', effective: new Date(2026, 4, 1), method: 'Quiz', myStatus: 'Acknowledged', acknowledgedOn: new Date(2026, 4, 9), audience: 248, acknowledged: 240, owner: 'Joseph Mathew', changeSummary: 'Password manager required; USB storage blocked.' },
  { id: 'POL-06', title: 'Whistleblower (vigil mechanism)', category: 'Conduct', version: 'v2', effective: new Date(2026, 1, 1), method: 'Click', myStatus: 'Acknowledged', acknowledgedOn: new Date(2026, 1, 3), audience: 248, acknowledged: 244, owner: 'Rekha Iyengar', changeSummary: 'Anonymous reports with an access code.' },
];

export const ACK_BY_DEPT = [
  { dept: 'Engineering', audience: 58, acknowledged: 44 },
  { dept: 'Operations', audience: 92, acknowledged: 51 },
  { dept: 'Finance', audience: 18, acknowledged: 17 },
  { dept: 'People', audience: 9, acknowledged: 9 },
  { dept: 'Sales', audience: 41, acknowledged: 25 },
  { dept: 'Quality', audience: 30, acknowledged: 25 },
];

export const HELPDESK_TODAY = TODAY;

/* ---------------- Ticket workspace, KB, assistant, policy admin ---------------- */

export const TICKET_MESSAGES = [
  { id: 'm1', kind: 'employee' as const, who: 'Divya Raghunathan', at: at(28, 10, 12), text: 'My September payslip shows 2 days loss of pay for 21 and 22 Sep. I was on casual leave; Karthik approved it on 24 Sep.' },
  { id: 'm2', kind: 'system' as const, who: 'YukthiX', at: at(28, 10, 12), text: 'Routed to the Payroll queue (category: Payslip query). First response due by 2:12 pm.' },
  { id: 'm3', kind: 'agent' as const, who: 'Suresh Pillai', at: at(28, 10, 54), text: 'Thanks Divya, checking with the attendance records now.' },
  { id: 'm4', kind: 'note' as const, who: 'Suresh Pillai', at: at(28, 11, 20), text: 'Leave approved on 24 Sep, after the 23 Sep attendance cut-off. Needs arrears of 2 days in October; no change to the locked September run.' },
];

export const TICKET_ACTIVITY = [
  { id: 'e1', kind: 'change' as const, actor: null, at: at(28, 10, 12), text: 'Ticket created from the app and routed to Payroll', changes: [] },
  { id: 'e2', kind: 'change' as const, actor: { name: 'Suresh Pillai' }, at: at(28, 10, 50), text: 'assigned the ticket to themselves' },
  { id: 'e3', kind: 'change' as const, actor: { name: 'Suresh Pillai' }, at: at(28, 11, 21), text: 'changed priority', changes: [{ field: 'Priority', from: 'Normal', to: 'High' }] },
];

export const KB_HTML = '<h2>Why you see loss of pay</h2><p>Loss of pay (LOP) is counted when a working day has no punch, no approved leave and no approved regularisation by the attendance cut-off (23rd of the month).</p><h2>How to fix it</h2><ol><li>Open <strong>Time › Attendance</strong> and find the day.</li><li>Choose <strong>Fix</strong> and apply leave or regularise.</li><li>If the month is already locked, the days are paid back as arrears next month.</li></ol>';

export const KB_VERSIONS = [
  { v: 'v3', at: new Date(2026, 8, 2), by: 'Suresh Pillai', note: 'Added the arrears step for locked months' },
  { v: 'v2', at: new Date(2026, 5, 10), by: 'Suresh Pillai', note: 'New cut-off date (23rd)' },
  { v: 'v1', at: new Date(2026, 1, 4), by: 'Lakshmi Venkatesan', note: 'First version' },
];

export const ASSISTANT_THREAD = [
  { id: 'q1', role: 'user' as const, text: 'How many earned leave days can I carry forward to next year?' },
  {
    id: 'r1',
    role: 'assistant' as const,
    text: 'You can carry forward up to 45 earned leave days into 2027. Days above 45 lapse on 31 Dec unless you encash them in the year-end window.',
    sources: [
      { label: 'Leave policy 2026, section 4.2', href: '#POL-03' },
      { label: 'Help article: Year-end leave', href: '#KB-150' },
    ],
  },
];

export const PENDING_PEOPLE = [
  { name: 'Manoj Kumar', dept: 'Operations', manager: 'Ravi Shankar', daysOverdue: 9 },
  { name: 'Sathish Kumar', dept: 'Operations', manager: 'Ravi Shankar', daysOverdue: 4 },
  { name: 'Arjun Kulkarni', dept: 'Operations', manager: 'Ravi Shankar', daysOverdue: 0 },
  { name: 'Priya Menon', dept: 'Engineering', manager: 'Karthik Subramanian', daysOverdue: 0 },
  { name: 'Vikram Rao', dept: 'Sales', manager: 'Sana Nizami', daysOverdue: 2 },
];

export const POLICY_VERSIONS = [
  { v: 'v4', effective: new Date(2026, 8, 15), summary: 'Adds social-media conduct and gifts limit of ₹2,000.', reack: true, acked: 171, audience: 248 },
  { v: 'v3', effective: new Date(2025, 9, 1), summary: 'Conflict of interest declaration yearly.', reack: true, acked: 231, audience: 236 },
  { v: 'v2', effective: new Date(2024, 3, 1), summary: 'Typo fixes and new contact for ethics officer.', reack: false, acked: 220, audience: 229 },
];
