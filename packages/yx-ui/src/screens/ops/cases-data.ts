// Fictional sample data for cases (grievance, disciplinary, whistleblower, accident, collective dispute) and POSH.
import type { CaseMember } from './ops-kit';

const d = (day: number, month = 8, year = 2026) => new Date(year, month, day);
const at = (day: number, h: number, m = 0, month = 8) => new Date(2026, month, day, h, m);

export const GRIEVANCE_MEMBERS: CaseMember[] = [
  { name: 'Farzana Begum', role: 'Complainant', access: 'own messages and outcome' },
  { name: 'Lakshmi Venkatesan', role: 'Case owner (HR)', access: 'full' },
  { name: 'Mohan Das', role: 'Grievance Redressal Committee, worker side', access: 'full' },
  { name: 'Geetha Ramesh', role: 'Grievance Redressal Committee, employer side (chair)', access: 'full' },
  { name: 'Ravi Shankar', role: 'Line supervisor (respondent’s manager)', blocked: 'Conflict of interest: excluded' },
];

export const ANON_MEMBERS: CaseMember[] = [
  { name: 'Anonymous reporter', role: 'Reporter', access: 'through access code only' },
  { name: 'Rekha Iyengar', role: 'Ethics officer (owner)', access: 'full' },
  { name: 'Justice (retd.) S. Narayanan', role: 'Audit committee chair', access: 'reports and outcome', external: true },
];

export const DISC_MEMBERS: CaseMember[] = [
  { name: 'Manoj Kumar', role: 'Employee (respondent)', access: 'notices and own replies' },
  { name: 'Lakshmi Venkatesan', role: 'Case owner (HR)', access: 'full' },
  { name: 'Harish Bhat', role: 'Inquiry officer', access: 'full' },
  { name: 'Ravi Shankar', role: 'Raised by (manager)', access: 'incident and outcome' },
];

export const CASE_TIMELINE = [
  { id: 't1', at: at(12, 9, 20), who: 'Farzana Begum', text: 'Filed the grievance (named, confidential)' },
  { id: 't2', at: at(12, 9, 21), who: 'YukthiX', text: 'Routed to the Grievance Redressal Committee, Hosur plant (212 workers). Disposal clock started.' },
  { id: 't3', at: at(13, 11, 0), who: 'Geetha Ramesh', text: 'Acknowledged the grievance' },
  { id: 't4', at: at(16, 15, 30), who: 'Mohan Das', text: 'Met the transport vendor; statement uploaded' },
  { id: 't5', at: at(22, 10, 0), who: 'Lakshmi Venkatesan', text: 'Added gate register extracts for 3, 9 and 17 Sep' },
];

export const CASE_DOCUMENTS = [
  { name: 'Complaint statement.pdf', by: 'Farzana Begum', at: d(12), size: '184 KB' },
  { name: 'Transport vendor statement.pdf', by: 'Mohan Das', at: d(16), size: '96 KB' },
  { name: 'Gate register extracts Sep.xlsx', by: 'Lakshmi Venkatesan', at: d(22), size: '41 KB' },
];

export const MY_CASES = [
  { id: 'GRV-0142', type: 'Grievance', role: 'Complainant', stage: 'Investigation', next: 'Finding due', due: d(2, 9), status: 'Open' as const },
  { id: 'DSC-0031', type: 'Disciplinary', role: 'Respondent', stage: 'Show-cause issued', next: 'Your reply due', due: d(30), status: 'Action needed' as const },
  { id: 'GRV-0098', type: 'Grievance', role: 'Witness', stage: 'Closed with actions', next: '—', due: null, status: 'Closed' as const },
];

export const SHOW_CAUSE = {
  caseId: 'DSC-0031',
  issuedOn: d(23),
  issuedBy: 'Lakshmi Venkatesan, HR Business Partner',
  misconduct: 'Absence without leave for more than 4 consecutive days',
  clause: 'Standing orders (certified, v3 from 1 Apr 2026), clause 14(2)(c)',
  facts: 'You were absent from 8 Sep 2026 to 12 Sep 2026 (5 working days) without applying for leave or informing your supervisor.',
};

export const WB_QUEUE = [
  { id: 'WB-0011', subject: 'Supplier gifts above the ₹2,000 limit', received: d(27), entity: 'Kaveri Foods Pvt Ltd', anonymous: true, severity: 'Serious', routed: false, stage: 'Received', ackBy: null as Date | null, feedbackBy: null as Date | null },
  { id: 'WB-0010', subject: 'Overtime register altered at Hosur', received: d(19), entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', anonymous: false, severity: 'Standard', routed: false, stage: 'Investigation', ackBy: null, feedbackBy: null },
  { id: 'WB-0009', subject: 'Vendor invoices approved without delivery', received: d(3), entity: 'Kaveri Foods Pvt Ltd', anonymous: true, severity: 'Serious', routed: true, stage: 'Investigation', ackBy: null, feedbackBy: null },
  { id: 'WB-0008', subject: 'Distributor discount outside approved scheme', received: d(24), entity: 'Kaveri Foods Ireland Ltd (Dublin, 60 staff)', anonymous: true, severity: 'Serious', routed: true, stage: 'Acknowledged', ackBy: d(1, 9), feedbackBy: d(24, 11) },
];

/* Accident */
export const ACCIDENT = {
  id: 'ACC-0004',
  occurredAt: at(28, 14, 35),
  place: 'Hosur plant, packing line 2',
  description: 'The carton sealing machine jammed. While clearing it, the operator’s left hand was caught under the sealing head.',
  person: { name: 'Sathish Kumar', kind: 'Employee', role: 'Machine operator', age: 34, monthlyWage: 18500, esiCovered: true, uan: '1012 4471 8820', ip: '31-00-445521-000-0001' },
  injuryType: 'Crush injury',
  bodyPart: 'Left hand, two fingers',
  firstAid: 'Given at the plant first-aid room by Meena S. (trained first-aider)',
  hospital: 'Hosur Government Hospital, then ESI dispensary',
  daysUnable: 5,
  witnesses: ['Kumar Velu (operator, line 2)', 'Priya D. (quality inspector)'],
  reportedBy: 'Ravi Shankar (line supervisor)',
};

export const ACCIDENT_MEMBERS: CaseMember[] = [
  { name: 'Gopal Krishnan', role: 'Safety officer, Hosur (owner)', access: 'full, with medical' },
  { name: 'Lakshmi Venkatesan', role: 'HR', access: 'full, with medical' },
  { name: 'Ravi Shankar', role: 'Reporter', access: 'incident record, no medical' },
  { name: 'Kumar Velu', role: 'Witness', access: 'own statement' },
];

/* Collective dispute */
export const DEMANDS = [
  { id: 'D1', demand: 'Basic pay increase of 18 % for all categories', union: '18 %', mgmt: '9 %', status: 'Agreed at 11 %' },
  { id: 'D2', demand: 'Night-shift allowance from ₹75 to ₹150 per shift', union: '₹150', mgmt: '₹110', status: 'Agreed at ₹120' },
  { id: 'D3', demand: 'Transport for all shifts ending after 10 pm', union: 'All shifts', mgmt: 'Women workers only', status: 'Agreed for all' },
  { id: 'D4', demand: 'Two additional festival holidays', union: '2 days', mgmt: '0', status: 'Open' },
  { id: 'D5', demand: 'Canteen subsidy review', union: 'Full subsidy', mgmt: 'Current', status: 'Withdrawn' },
];

export const CONCILIATION = [
  { label: 'Charter received', at: d(2, 5) },
  { label: 'Bipartite talks (4 rounds)', at: d(30, 6) },
  { label: 'Conciliation meeting 1', at: d(4, 8) },
  { label: 'Conciliation meeting 2', at: d(18, 8) },
  { label: 'Conciliation meeting 3', note: 'Scheduled 6 Oct' },
  { label: 'Settlement signed', note: '—' },
  { label: 'Filed with the authority', note: '—' },
];

/* POSH */
export const IC_MEMBERS = [
  { name: 'Dr. Anuradha Menon', role: 'presiding' as const, woman: true, senior: true, tenureFrom: d(1, 3, 2025), tenureTo: d(31, 2, 2028) },
  { name: 'Kavitha Srinivasan', role: 'member' as const, woman: true, tenureFrom: d(1, 3, 2025), tenureTo: d(31, 2, 2028) },
  { name: 'Joseph Mathew', role: 'member' as const, woman: false, tenureFrom: d(1, 3, 2025), tenureTo: d(31, 2, 2028) },
  { name: 'Adv. Shobha Rao', role: 'external' as const, woman: true, tenureFrom: d(1, 3, 2025), tenureTo: d(31, 2, 2028) },
];

export const POSH_CASES = [
  { id: 'POSH-0007', filed: d(21), stage: 'Notice to respondent', workplace: 'Bengaluru head office', conciliation: 'Not requested', nextDue: d(28), status: 'Open' },
  { id: 'POSH-0006', filed: d(10, 7), stage: 'Inquiry hearings', workplace: 'Hosur plant', conciliation: 'Not requested', nextDue: d(8, 10), status: 'Open' },
  { id: 'POSH-0005', filed: d(2, 4), stage: 'Employer action', workplace: 'Chennai office', conciliation: 'Not requested', nextDue: d(14, 9), status: 'Open' },
  { id: 'POSH-0004', filed: d(15, 1), stage: 'Closed', workplace: 'Hosur plant', conciliation: 'Settled by conciliation', nextDue: null, status: 'Closed' },
];

export const AWARENESS_LOG = [
  { id: 'aw1', date: d(12, 7), title: 'POSH awareness for new joiners', audience: 'Joiners Jun to Aug', attended: 24 },
  { id: 'aw2', date: d(5, 5), title: 'Internal Committee orientation', audience: 'IC members', attended: 4 },
  { id: 'aw3', date: d(18, 2), title: 'Plant-floor session in Tamil', audience: 'Hosur plant', attended: 118 },
];

export const POSH_TIMELINE = [
  { id: 'p1', at: at(21, 18, 5), who: 'Complainant', text: 'Filed the complaint' },
  { id: 'p2', at: at(22, 10, 0), who: 'Dr. Anuradha Menon', text: 'Acknowledged; complainant did not request conciliation' },
  { id: 'p3', at: at(24, 16, 30), who: 'Adv. Shobha Rao', text: 'Reviewed the complaint and witness list' },
];
