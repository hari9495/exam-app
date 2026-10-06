// Fictional sample data for the People screens (Kaveri Foods Pvt Ltd). Deterministic: no random, no clock.
import { DEPARTMENT_HEADS, EMPLOYEES, HOLIDAYS_2026, ME, TODAY } from '../_kit/data';
import type { OrgPerson } from '../../components/orgchart';
import type { FieldClass, FnfLine, JourneyTask, PaySplit } from './people-logic';

export { EMPLOYEES, ME, TODAY };
export const HOLIDAYS = HOLIDAYS_2026.map((h) => h.date);
export const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

/* ------------------------------------------------------------------ workforce (PPL-01, YX-ORG-26) */

export type WorkforceKind = 'Employee' | 'Contract worker' | 'Consultant' | 'Placement';
export interface WorkforceRow {
  id: string;
  code: string;
  name: string;
  kind: WorkforceKind;
  role: string;
  department: string;
  location: string;
  manager: string;
  email: string;
  phone: string;
  joined: Date;
  status: string;
  /** Contractor firm, client or consulting firm. */
  via?: string;
}

/** Manager names from the org chart, so the directory and the chart agree. Filled lazily (ORG is defined below). */
let orgManagers: Map<string, string> | undefined;
const orgManagerOf = (id: string) => {
  if (!orgManagers) {
    const org = buildOrg();
    const name = new Map(org.map((p) => [p.id, p.name]));
    orgManagers = new Map(org.filter((p) => p.managerId).map((p) => [p.id, name.get(p.managerId!) ?? '']));
  }
  return orgManagers.get(id);
};

const CW_FIRST = ['Murugan', 'Selvi', 'Ravi', 'Anbu', 'Lakshmanan', 'Kannan', 'Vasanthi', 'Senthil', 'Pooja', 'Ganesh', 'Mani', 'Jaya'];
const CW_LAST = ['K', 'Perumal', 'Shankar', 'Durai', 'Ramasamy', 'Velu', 'Arumugam'];
const slug = (n: string) => n.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '');

export const WORKFORCE: WorkforceRow[] = [
  ...EMPLOYEES.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.name,
    kind: 'Employee' as const,
    role: e.role,
    department: e.department,
    location: e.location,
    manager: orgManagerOf(e.id) || e.manager,
    email: `${slug(e.name)}@kaverifoods.in`,
    phone: `+91 98450 ${String(10000 + Number(e.id.slice(1)) * 37).slice(-5)}`,
    joined: e.joined,
    status: e.status,
  })),
  ...Array.from({ length: 41 }, (_, i) => ({
    id: `cw${i + 1}`,
    code: `CW-${String(i + 1).padStart(4, '0')}`,
    name: `${CW_FIRST[i % CW_FIRST.length]} ${CW_LAST[(i * 3) % CW_LAST.length]}`,
    kind: 'Contract worker' as const,
    role: ['Loader', 'Packing helper', 'Housekeeping', 'Security guard'][i % 4],
    department: 'Operations',
    location: 'Hosur plant',
    manager: 'Prakash Menon',
    email: '',
    phone: `+91 94430 ${String(20000 + i * 53).slice(-5)}`,
    joined: d(2025, 1 + (i % 12), 1 + (i % 27)),
    status: i % 9 === 0 ? 'Deployment ending' : 'Deployed',
    via: i % 2 ? 'Sri Murugan Manpower Services' : 'Hosur Facility Staffing',
  })),
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `cn${i + 1}`,
    code: `CN-${String(i + 1).padStart(3, '0')}`,
    name: ['Farhan Ali', 'Nandini Rao', 'Sameer Joshi', 'Anita George', 'Hari Prasad', 'Zoya Merchant', 'Kiran Bhat', 'Revathi Iyer', 'Tarun Malhotra'][i],
    kind: 'Consultant' as const,
    role: ['Food safety auditor', 'Tax consultant', 'Plant automation', 'Brand strategist', 'Legal counsel', 'UX researcher', 'ERP advisor', 'Nutritionist', 'Cold-chain advisor'][i],
    department: ['Quality', 'Finance', 'Engineering', 'Sales', 'People', 'Engineering', 'Finance', 'Quality', 'Operations'][i],
    location: 'Bengaluru head office',
    manager: 'Lakshmi Venkatesan',
    email: `${slug(['Farhan Ali', 'Nandini Rao', 'Sameer Joshi', 'Anita George', 'Hari Prasad', 'Zoya Merchant', 'Kiran Bhat', 'Revathi Iyer', 'Tarun Malhotra'][i])}@consult.example`,
    phone: `+91 99000 ${String(30000 + i * 71).slice(-5)}`,
    joined: d(2026, 1 + i, 1),
    status: 'Active contract',
    via: 'Independent',
  })),
  ...Array.from({ length: 14 }, (_, i) => ({
    id: `pl${i + 1}`,
    code: `PL-${String(i + 1).padStart(3, '0')}`,
    name: ['Aditya Nair', 'Bhavana Shetty', 'Chetan Gowda', 'Divakar Rao', 'Esha Kapoor', 'Firoz Khan', 'Gayathri S', 'Harish Kumar', 'Indu Menon', 'Jatin Arora', 'Keerthana R', 'Lokesh B', 'Madhu Pillai', 'Nisha Thomas'][i],
    kind: 'Placement' as const,
    role: ['Data analyst', 'Java developer', 'QA engineer', 'Support engineer'][i % 4],
    department: 'Staffing',
    location: 'Client site',
    manager: 'Neha Joshi',
    email: '',
    phone: `+91 97400 ${String(40000 + i * 29).slice(-5)}`,
    joined: d(2026, 1 + (i % 9), 10),
    status: 'On assignment',
    via: ['Brindavan Retail Ltd', 'Nilgiri Logistics', 'Coromandel Textiles'][i % 3],
  })),
];

export const WORKFORCE_COUNTS = {
  Employee: WORKFORCE.filter((w) => w.kind === 'Employee').length,
  'Contract worker': WORKFORCE.filter((w) => w.kind === 'Contract worker').length,
  Consultant: WORKFORCE.filter((w) => w.kind === 'Consultant').length,
  Placement: WORKFORCE.filter((w) => w.kind === 'Placement').length,
};
/** Distinct persons: one person can hold two roles (e.g. a consultant who is also an alumnus). */
export const DISTINCT_PERSONS = WORKFORCE.length - 2;

/* ------------------------------------------------------------------ org chart (PPL-02) */

/**
 * The org chart is built from the same 248 employees as the directory (founder review 1 Oct 2026): the Managing
 * Director, the six department heads, then team leads (about one per eight people) and their teams.
 */
function buildOrg(): OrgPerson[] {
  const md: OrgPerson = { id: 'md', name: 'Ramesh Iyer', role: 'Managing Director', department: 'Leadership', managerId: null };
  const out: OrgPerson[] = [md];
  const headId = new Map<string, string>();
  for (const [dept, h] of Object.entries(DEPARTMENT_HEADS)) {
    const e = EMPLOYEES.find((x) => x.name === h.name);
    if (!e) continue;
    headId.set(dept, e.id);
    out.push({ id: e.id, name: e.name, role: h.role, department: dept, managerId: md.id });
  }
  for (const [dept, hid] of headId) {
    const members = EMPLOYEES.filter((e) => e.department === dept && e.id !== hid && ![...headId.values()].includes(e.id));
    // The signed-in person leads a small team in their department, so the employee view has a team to show.
    const leads = [...members.filter((m) => m.id === ME.id), ...members.filter((m) => m.id !== ME.id && m.status === 'Active')].slice(0, Math.max(1, Math.ceil(members.length / 8)));
    const leadIds = new Set(leads.map((l) => l.id));
    leads.forEach((l) => out.push({ id: l.id, name: l.name, role: l.role, department: dept, managerId: hid }));
    members.filter((m) => !leadIds.has(m.id)).forEach((m, i) => out.push({ id: m.id, name: m.name, role: m.role, department: dept, managerId: leads[i % leads.length].id }));
  }
  // A few secondary (dotted-line) managers: plant quality inspectors also answer to the Head of Operations.
  const opsHead = headId.get('Operations');
  let dotted = 0;
  for (const p of out) if (dotted < 3 && p.department === 'Quality' && p.role === 'Quality Inspector' && opsHead) { p.dottedManagerId = opsHead; dotted++; }
  // Open positions (shown in the Position view).
  out.push(
    { id: 'v1', name: 'Vacant', role: 'Quality Manager, Chennai', department: 'Quality', managerId: headId.get('Quality'), vacant: true },
    { id: 'v2', name: 'Vacant', role: 'Shift Lead, night', department: 'Operations', managerId: headId.get('Operations'), vacant: true },
    { id: 'v3', name: 'Vacant', role: 'Payroll Executive', department: 'Finance', managerId: headId.get('Finance'), vacant: true },
  );
  return out;
}
export const ORG: OrgPerson[] = buildOrg();
/** A lead due for promotion on 1 Oct 2026 (the "as on" future story). */
export const ORG_PROMOTED = ORG.find((p) => p.department === 'Quality' && p.id !== ME.id && p.managerId !== 'md' && ORG.some((c) => c.managerId === p.id))!;
const ORG_OLD: OrgPerson[] = [
  { id: 'o1', name: 'Ramesh Iyengar', role: 'Managing Director', department: 'Leadership', managerId: null },
  { id: 'o2', name: 'Lakshmi Venkatesan', role: 'Head of People', department: 'People', managerId: 'o1' },
  { id: 'o3', name: 'Karthik Subramanian', role: 'Head of Quality', department: 'Quality', managerId: 'o1' },
  { id: 'o4', name: 'Suresh Pillai', role: 'Finance Controller', department: 'Finance', managerId: 'o1' },
  { id: 'o5', name: 'Prakash Menon', role: 'Plant Head, Hosur', department: 'Operations', managerId: 'o1' },
  { id: 'o6', name: 'Sana Nizami', role: 'Head of Sales', department: 'Sales', managerId: 'o1' },
  { id: 'o7', name: 'Divya Raghunathan', role: 'Senior QA Engineer', department: 'Quality', managerId: 'o3' },
  { id: 'o8', name: 'Arjun Kulkarni', role: 'Senior Quality Inspector', department: 'Quality', managerId: 'o7' },
  { id: 'o9', name: 'Kavya Reddy', role: 'Quality Inspector', department: 'Quality', managerId: 'o7' },
  { id: 'o10', name: 'Imran Qureshi', role: 'Quality Inspector', department: 'Quality', managerId: 'o7', dottedManagerId: 'o5' },
  { id: 'o11', name: 'Meera Iyer', role: 'Lab Analyst', department: 'Quality', managerId: 'o7' },
  { id: 'o12', name: 'Vacant', role: 'Quality Manager, Chennai', department: 'Quality', managerId: 'o3', vacant: true },
  { id: 'o13', name: 'Neha Joshi', role: 'Talent Acquisition Lead', department: 'People', managerId: 'o2' },
  { id: 'o14', name: 'Fatima Shaikh', role: 'HR Executive', department: 'People', managerId: 'o2' },
  { id: 'o15', name: 'Rohit Bhat', role: 'Payroll Executive', department: 'Finance', managerId: 'o4' },
  { id: 'o16', name: 'Deepa Rao', role: 'Accountant', department: 'Finance', managerId: 'o4' },
  { id: 'o17', name: 'Manoj Patil', role: 'Shift Lead', department: 'Operations', managerId: 'o5' },
  { id: 'o18', name: 'Gurpreet Kaur', role: 'Maintenance Technician', department: 'Operations', managerId: 'o17' },
  { id: 'o19', name: 'Thomas George', role: 'Warehouse Associate', department: 'Operations', managerId: 'o17' },
  { id: 'o20', name: 'Vacant', role: 'Shift Lead, night', department: 'Operations', managerId: 'o5', vacant: true },
  { id: 'o21', name: 'Priya Nair', role: 'Sales Manager, South', department: 'Sales', managerId: 'o6' },
  { id: 'o22', name: 'Rahul Sharma', role: 'Account Executive', department: 'Sales', managerId: 'o21' },
  { id: 'o23', name: 'Joseph Mathew', role: 'Account Executive', department: 'Sales', managerId: 'o21' },
  { id: 'o24', name: 'Aisha Khan', role: 'Sales Associate', department: 'Sales', managerId: 'o21' },
];
void ORG_OLD;
/** As on 1 Jul 2026: before the Chennai quality role was opened and before the last few joiners. */
export const ORG_JUL = ORG.filter((p) => p.id !== 'v1' && !['e240', 'e241', 'e242', 'e243', 'e244', 'e245'].includes(p.id));

/* ------------------------------------------------------------------ the person record (PPL-03) */

export interface FieldRow {
  label: string;
  value: string;
  cls: FieldClass;
  /** Masked form when the viewer may only see it masked. */
  masked?: string;
  mono?: boolean;
}

export const ARJUN = {
  id: 'o8',
  code: 'KF-0142',
  name: 'Arjun Kulkarni',
  role: 'Senior Quality Inspector',
  department: 'Quality',
  location: 'Hosur plant',
  entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)',
  manager: 'Divya Raghunathan',
  dottedManager: 'Prakash Menon (plant oversight)',
  grade: 'G5',
  type: 'Permanent',
  joined: d(2021, 3, 12),
  workEmail: 'arjun.kulkarni@kaverifoods.in',
  workPhone: '+91 44 4012 3142',
  ctcAnnual: 690000,
  personal: [
    { label: 'Date of birth', value: '14 Jun 1992', cls: 'Personal' },
    { label: 'Gender', value: 'Man', cls: 'Personal' },
    { label: 'Marital status', value: 'Married', cls: 'Personal' },
    { label: 'Personal email', value: 'arjun.k92@mailbox.example', cls: 'Personal' },
    { label: 'Personal phone', value: '+91 98450 22871', cls: 'Personal' },
    { label: 'Home address', value: '12, 3rd Cross, Mathigiri, Hosur 635110, Tamil Nadu', cls: 'Personal' },
    { label: 'Birthday (shown in directory)', value: '14 Jun', cls: 'Internal' },
  ] as FieldRow[],
  identity: [
    { label: 'PAN', value: 'AKDPK4821M', masked: 'XXXXXX821M', cls: 'Confidential', mono: true },
    { label: 'Aadhaar', value: '4821 7730 1942', masked: 'XXXX XXXX 1942', cls: 'Special', mono: true },
    { label: 'UAN', value: '100934821775', masked: 'XXXXXXXX1775', cls: 'Confidential', mono: true },
    { label: 'ESIC IP number', value: 'Not covered (wage above ceiling)', cls: 'Confidential' },
    { label: 'Salary account', value: 'Canara Bank · 1122 0045 6789 · CNRB0001234', masked: 'Canara Bank · XXXX XXXX 6789', cls: 'Confidential', mono: true },
    { label: 'Passport', value: 'Z4417728 · expires 08 Feb 2031', masked: 'XXXX7728 · expires 08 Feb 2031', cls: 'Confidential', mono: true },
  ] as FieldRow[],
  family: [
    { name: 'Shalini Kulkarni', relation: 'Spouse', dob: '02 Nov 1994', dependent: true },
    { name: 'Aarav Kulkarni', relation: 'Son', dob: '19 Jan 2022', dependent: true },
    { name: 'Suman Kulkarni', relation: 'Mother', dob: '07 Aug 1963', dependent: true },
  ],
  nominations: [
    { scheme: 'PF', name: 'Shalini Kulkarni', share: 100 },
    { scheme: 'Gratuity', name: 'Shalini Kulkarni', share: 60 },
    { scheme: 'Gratuity', name: 'Suman Kulkarni', share: 40 },
    { scheme: 'Group term insurance', name: 'Shalini Kulkarni', share: 100 },
  ],
  emergency: [
    { name: 'Shalini Kulkarni', relation: 'Spouse', phone: '+91 98450 22872' },
    { name: 'Vinod Kulkarni', relation: 'Brother', phone: '+91 99001 44120' },
  ],
  custom: [
    { label: 'Forklift licence number', value: 'TN70 2019 0004412', cls: 'Internal' as FieldClass, selfEdit: false },
    { label: 'T-shirt size', value: 'L', cls: 'Public' as FieldClass, selfEdit: true },
    { label: 'Blood group', value: 'B positive', cls: 'Personal' as FieldClass, selfEdit: true },
  ],
};

/** Dated job history (P06), newest first, with a scheduled promotion and a correction. */
export interface JobChange {
  id: string;
  effective: Date;
  type: string;
  summary: string;
  by: string;
  state: 'scheduled' | 'current' | 'past' | 'correction';
  letter?: string;
}
export const ARJUN_HISTORY: JobChange[] = [
  { id: 'c5', effective: d(2026, 10, 1), type: 'Promotion', summary: 'Senior Quality Inspector → Quality Lead · G5 → G6 · CTC ₹6,90,000 → ₹7,80,000', by: 'Divya Raghunathan', state: 'scheduled', letter: 'KF/HR/2026/0418' },
  { id: 'c4', effective: d(2025, 4, 1), type: 'Salary revision', summary: 'Annual increment 8% · CTC ₹6,39,000 → ₹6,90,000', by: 'Lakshmi Venkatesan', state: 'current', letter: 'KF/HR/2025/0211' },
  { id: 'c3', effective: d(2024, 8, 1), type: 'Correction', summary: 'Designation corrected: was Quality Inspector, should have been Senior Quality Inspector from 1 Aug 2024 (promotion letter issued, record missed)', by: 'Lakshmi Venkatesan', state: 'correction' },
  { id: 'c2', effective: d(2023, 6, 15), type: 'Transfer', summary: 'Chennai office → Hosur plant · PT state unchanged (Tamil Nadu) · shift General → Rotational', by: 'Karthik Subramanian', state: 'past', letter: 'KF/HR/2023/0097' },
  { id: 'c1', effective: d(2021, 3, 12), type: 'Joining', summary: 'Quality Inspector · G4 · Chennai office · probation 6 months', by: 'Lakshmi Venkatesan', state: 'past', letter: 'KF/HR/2021/0031' },
];

export const ARJUN_ROLES = [
  { role: 'Candidate', from: d(2021, 1, 18), to: d(2021, 2, 20), link: 'Application APP-2021-0412 · Quality Inspector' },
  { role: 'Test-taker', from: d(2021, 1, 25), to: d(2021, 1, 25), link: 'Aptitude test ATT-88213 · 78%' },
  { role: 'Contract worker', from: d(2020, 6, 1), to: d(2021, 3, 11), link: 'Hosur Facility Staffing · deployment DEP-0192' },
  { role: 'Employee', from: d(2021, 3, 12), to: null as Date | null, link: 'Employment EMP-0142 · Kaveri Foods Pvt Ltd (Tamil Nadu)' },
  { role: 'Nominee', from: d(2023, 2, 1), to: null as Date | null, link: 'Gratuity nominee for Suman Kulkarni (retired 2023)' },
];

export const ARJUN_DOCS = [
  { type: 'PAN card', cls: 'Confidential' as FieldClass, status: 'Verified', by: 'Auto: PAN verification', on: d(2021, 3, 10), versions: 1 },
  { type: 'Aadhaar', cls: 'Special' as FieldClass, status: 'Verified', by: 'Lakshmi Venkatesan', on: d(2021, 3, 10), versions: 1 },
  { type: 'Bank proof', cls: 'Confidential' as FieldClass, status: 'Verified', by: 'Auto: penny drop', on: d(2021, 3, 11), versions: 2 },
  { type: 'Degree certificate', cls: 'Internal' as FieldClass, status: 'Verified', by: 'Fatima Shaikh', on: d(2021, 3, 15), versions: 1 },
  { type: 'Experience letter', cls: 'Internal' as FieldClass, status: 'Pending verification', by: '', on: d(2026, 9, 21), versions: 1 },
  { type: 'Forklift licence', cls: 'Internal' as FieldClass, status: 'Expiring', by: 'Fatima Shaikh', on: d(2021, 11, 2), versions: 1, expires: d(2026, 10, 24) },
  { type: 'Passport', cls: 'Confidential' as FieldClass, status: 'Missing', by: '', on: null, versions: 0 },
];

export const ARJUN_ASSETS = [
  { tag: 'KF-LAP-0231', name: 'Laptop, 14 inch', issued: d(2023, 6, 15), condition: 'Good', ack: 'Acknowledged' },
  { tag: 'KF-PPE-1190', name: 'Safety shoes and helmet', issued: d(2023, 6, 15), condition: 'Good', ack: 'Acknowledged' },
  { tag: 'KF-TAB-0044', name: 'Inspection tablet', issued: d(2026, 9, 22), condition: 'New', ack: 'Waiting' },
];

export const ARJUN_WORK_AUTH = [
  { country: 'United Arab Emirates', type: 'Employment visa', number: 'XXXX-7731', sponsor: 'Kaveri Foods FZE', occupation: 'Quality Inspector', issued: d(2025, 11, 2), expires: d(2026, 11, 1), status: 'Expiring' },
  { country: 'United Arab Emirates', type: 'Emirates ID', number: 'XXX-XXXX-XXXXXXX-4', sponsor: 'Kaveri Foods FZE', occupation: '—', issued: d(2025, 11, 20), expires: d(2027, 11, 19), status: 'Valid' },
  { country: 'India', type: 'Passport', number: 'XXXX7728', sponsor: '—', occupation: '—', issued: d(2021, 2, 9), expires: d(2031, 2, 8), status: 'Valid' },
];

export const SPLITS: PaySplit[] = [
  { id: 'a1', label: 'Emirates Crescent Bank · AE07 0331 2345 6789 0123 456', rule: 'remainder', value: 0 },
  { id: 'a2', label: 'Canara Bank (NRE) · XXXX 6789', rule: 'fixed', value: 2500 },
  { id: 'a3', label: 'Gulf Savings Bank · AE45 0260 0010 1523 4567 801', rule: 'percent', value: 10 },
];

/* ------------------------------------------------------------------ changes (PPL-04..06) */

/** Pay amounts sit in `pay`, apart from the summary, so the list can hide them (pay is private). */
export const SCHEDULED: { id: string; name: string; code: string; type: string; effective: Date; summary: string; pay?: string; raisedBy: string; status: 'Scheduled' | 'Pending approval'; waitingFor?: string }[] = [
  { id: 's1', name: 'Arjun Kulkarni', code: 'KF-0142', type: 'Promotion', effective: d(2026, 10, 1), summary: 'Quality Lead · G6', pay: '₹6,90,000 → ₹7,80,000', raisedBy: 'Divya Raghunathan', status: 'Scheduled' },
  { id: 's2', name: 'Rahul Sharma', code: 'KF-0088', type: 'Transfer', effective: d(2026, 10, 5), summary: 'Bengaluru head office → Chennai office', raisedBy: 'Priya Nair', status: 'Scheduled' },
  { id: 's3', name: 'Aisha Khan', code: 'KF-0203', type: 'Manager change', effective: d(2026, 10, 12), summary: 'Priya Nair → Joseph Mathew', raisedBy: 'Sana Nizami', status: 'Pending approval', waitingFor: 'Lakshmi Venkatesan' },
  { id: 's4', name: 'Imran Qureshi', code: 'KF-0167', type: 'Contract extension', effective: d(2026, 10, 31), summary: 'Contract end 31 Oct 2026 → 30 Apr 2027', raisedBy: 'Lakshmi Venkatesan', status: 'Scheduled' },
  { id: 's7', name: 'Thomas George', code: 'KF-0231', type: 'Promotion', effective: d(2026, 11, 1), summary: 'Shift Supervisor · G4', pay: '₹2,94,000 → ₹3,12,000', raisedBy: 'Ramesh Gowda', status: 'Scheduled' },
  { id: 's5', name: 'Gurpreet Kaur', code: 'KF-0119', type: 'Absence return', effective: d(2026, 11, 16), summary: 'Maternity leave ends · return-to-work tasks', raisedBy: 'Fatima Shaikh', status: 'Scheduled' },
  { id: 's6', name: 'Thomas George', code: 'KF-0231', type: 'Salary revision', effective: d(2026, 12, 1), summary: 'Market correction 6%', pay: '₹3,12,000 → ₹3,30,700', raisedBy: 'Prakash Menon', status: 'Scheduled' },
];

/** Grade bands (annual CTC). Sample pay sits inside each band so only real exceptions get flagged. */
export const GRADE_BANDS: Record<string, { min: number; max: number }> = {
  G3: { min: 320000, max: 480000 },
  G4: { min: 480000, max: 700000 },
  G5: { min: 700000, max: 900000 },
  G6: { min: 900000, max: 1200000 },
};
export const INCREMENT_ROWS = EMPLOYEES.slice(10, 50).map((e, i) => {
  const grade = ['G3', 'G4', 'G5', 'G6'][i % 4];
  const { min, max } = GRADE_BANDS[grade];
  return {
    id: e.id,
    name: e.name,
    code: e.code,
    grade,
    department: e.department,
    ctc: Math.round((min + (((i * 29) % 86) / 100) * (max - min)) / 100) * 100,
    rating: ['Exceeds', 'Meets', 'Meets', 'Below', 'Exceeds'][i % 5],
  };
});
/** Confirmed employees on notice: left out of the increment. */
export const INCREMENT_LEFT_OUT = [
  { name: 'Meera Iyer', why: 'Resigned · last day 19 Oct 2026' },
  { name: 'Ravi Kumar', why: 'Resigned · last day 30 Oct 2026' },
  { name: 'Sathish Kumar', why: 'Resigned · last day 14 Nov 2026' },
];
export const INCREMENT_PCT: Record<string, number> = { Exceeds: 12, Meets: 8, Below: 3 };

/* ------------------------------------------------------------------ onboarding (PPL-11..17) */

export const KAVYA_JOIN = d(2026, 10, 5);
export const ONBOARDING_TASKS: JourneyTask[] = [
  { id: 't1', title: 'Collect PAN', owner: 'New hire', offset: -7, status: 'done' },
  { id: 't2', title: 'Upload education and experience proofs', owner: 'New hire', offset: -7, status: 'todo' },
  { id: 't3', title: 'Bank details (auto-verified)', owner: 'New hire', offset: -5, status: 'done' },
  { id: 't4', title: 'Issue appointment letter', owner: 'HR', offset: -3, status: 'todo', locked: true },
  { id: 't5', title: 'UAN generation or link', owner: 'Payroll', offset: -2, status: 'done' },
  { id: 't6', title: 'Form 11 and Form 2 (PF declaration and nomination)', owner: 'New hire', offset: -2, status: 'todo' },
  { id: 't7', title: 'Laptop and inspection tablet', owner: 'IT', offset: -1, status: 'todo' },
  { id: 't8', title: 'Email, SSO and plant badge', owner: 'IT', offset: -1, status: 'blocked', waitsFor: 't7' },
  { id: 't9', title: 'Safety shoes and helmet', owner: 'Admin', offset: 0, status: 'done' },
  { id: 't10', title: 'Day-1 identity check', owner: 'HR', offset: 0, status: 'todo' },
  { id: 't11', title: 'Welcome call and day-1 lunch', owner: 'Buddy', offset: 0, status: 'done' },
  { id: 't12', title: 'Manager check-in', owner: 'Manager', offset: 7, status: 'todo' },
  { id: 't13', title: '30-day check-in', owner: 'Buddy', offset: 30, status: 'todo' },
];

/**
 * Accepted offers whose employee is not created yet: exactly the Onboarding board's "Offer accepted" column
 * (founder review 1 Oct 2026). Anyone in Pre-boarding or later already has an employee record.
 */
export const READY_TO_ONBOARD = [
  { id: 'r2', name: 'Suresh Nair', role: 'Maintenance Technician', dept: 'Operations', location: 'Hosur plant', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', manager: 'Ramesh Gowda', joining: d(2026, 10, 12), offerAccepted: d(2026, 9, 24), personType: 'Ex-employee rehire', source: 'OFR-2026-0241', note: 'Left Feb 2025 · old code KF-0077' },
  { id: 'r3', name: 'Selvi Perumal', role: 'Warehouse Associate', dept: 'Operations', location: 'Hosur plant', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', manager: 'Ramesh Gowda', joining: d(2026, 10, 6), offerAccepted: d(2026, 9, 26), personType: 'Contract worker conversion', source: 'CW-0004', note: 'Deployed since Apr 2025' },
  { id: 'r4', name: 'Ananya Das', role: 'Account Executive', dept: 'Sales', location: 'Chennai office', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', manager: 'Vikram Rao', joining: d(2026, 11, 2), offerAccepted: d(2026, 9, 27), personType: 'New person', source: 'OFR-2026-0247', note: '' },
];

export const BATCHES = [
  { id: 'b1', name: 'Campus 2027 · Food technology', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', location: 'Hosur plant', joining: d(2027, 7, 1), members: 18, completion: 34, loi: 18, offers: 12 },
  { id: 'b2', name: 'Campus 2027 · Mechanical', entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', location: 'Hosur plant', joining: d(2027, 7, 1), members: 9, completion: 21, loi: 9, offers: 4 },
  { id: 'b3', name: 'Campus 2026 · Sales trainees', entity: 'Kaveri Foods Pvt Ltd', location: 'Bengaluru head office', joining: d(2026, 10, 19), members: 12, completion: 88, loi: 12, offers: 12 },
];

export const PROBATIONS = [
  { id: 'p1', name: 'Kiran Joshi', role: 'Account Executive', manager: 'Priya Nair', start: d(2026, 4, 6), end: d(2026, 10, 5), extended: 0, reviewDone: false },
  { id: 'p2', name: 'Deepa Ghosh', role: 'Accountant', manager: 'Suresh Pillai', start: d(2026, 3, 30), end: d(2026, 9, 29), extended: 0, reviewDone: false },
  { id: 'p3', name: 'Vikram Singh', role: 'Shift Lead', manager: 'Prakash Menon', start: d(2026, 3, 16), end: d(2026, 9, 15), extended: 0, reviewDone: false },
  { id: 'p4', name: 'Sneha Patil', role: 'HR Executive', manager: 'Lakshmi Venkatesan', start: d(2026, 1, 12), end: d(2026, 10, 11), extended: 3, reviewDone: false },
  { id: 'p5', name: 'Arjun Pillai', role: 'Production Supervisor', manager: 'Ramesh Gowda', start: d(2026, 8, 3), end: d(2027, 2, 2), extended: 0, reviewDone: false },
  { id: 'p6', name: 'Rohit Menon', role: 'QA Engineer', manager: 'Divya Raghunathan', start: d(2026, 4, 13), end: d(2026, 10, 12), extended: 0, reviewDone: false },
  { id: 'p7', name: 'Nisha Rao', role: 'QA Engineer', manager: 'Divya Raghunathan', start: d(2026, 7, 6), end: d(2027, 1, 5), extended: 0, reviewDone: false },
];

/** Buddy pool: who each buddy is looking after now (founder review 1 Oct 2026: names, not only a count). */
export const BUDDIES = [
  { id: 'bd1', name: 'Lakshmi Gowda', team: 'Quality', location: 'Hosur plant', cap: 2, joiners: [{ name: 'Kavya Reddy', joins: d(2026, 10, 5) }] },
  { id: 'bd2', name: 'Imran Qureshi', team: 'Quality', location: 'Hosur plant', cap: 2, joiners: [] as { name: string; joins: Date }[] },
  { id: 'bd3', name: 'Joseph Mathew', team: 'Sales', location: 'Chennai office', cap: 2, joiners: [{ name: 'Kiran Joshi', joins: d(2026, 9, 3) }, { name: 'Ananya Das', joins: d(2026, 11, 2) }] },
  { id: 'bd4', name: 'Thomas George', team: 'Operations', location: 'Hosur plant', cap: 2, joiners: [{ name: 'Arjun Pillai', joins: d(2026, 8, 3) }] },
  { id: 'bd5', name: 'Farzana Begum', team: 'People', location: 'Bengaluru head office', cap: 2, joiners: [{ name: 'Sneha Patil', joins: d(2026, 8, 26) }] },
];
/** Joiners on the onboarding board who don't have a buddy yet. */
export const NEEDS_BUDDY = [
  { id: 'k3', name: 'Murugan K', role: 'Warehouse Associate', team: 'Operations', location: 'Hosur plant', manager: 'Ramesh Gowda', joins: d(2026, 10, 1) },
  { id: 'k9', name: 'Selvi Perumal', role: 'Warehouse Associate', team: 'Operations', location: 'Hosur plant', manager: 'Ramesh Gowda', joins: d(2026, 10, 6) },
];

/* ------------------------------------------------------------------ exits (PPL-18..24) */

export const MEERA = { name: 'Meera Iyer', code: 'KF-0118', role: 'Lab Analyst', manager: 'Divya Raghunathan', submitted: d(2026, 8, 20), lwd: d(2026, 10, 19), noticeDays: 60, basic: 32000, serviceMonths: 67 };

export const MEERA_FNF: FnfLine[] = [
  { id: 'f1', kind: 'earning', label: 'Salary for 1–19 Oct 2026', amount: 42300, how: 'Monthly gross ₹66,800 × 19 of 30 days (attendance locked, no exceptions).', wage: true },
  { id: 'f2', kind: 'earning', label: 'Leave encashment: 7.5 days earned leave', amount: 8000, how: 'Basic ₹32,000 ÷ 30 × 7.5 days (leave type formula, Leave decision 5a).', wage: true },
  { id: 'f3', kind: 'earning', label: 'Statutory bonus (pro-rata Apr–Oct)', amount: 9800, how: '8.33% × bonus wage ₹21,000 ceiling × 7 months (P07 IN.BONUS).', wage: true },
  { id: 'f4', kind: 'earning', label: 'Gratuity', amount: 110769, how: '15 ÷ 26 × basic ₹32,000 × 6 completed years (5 years 7 months rounds up). Due within 30 days under IN.SS-CODE.' },
  { id: 'f5', kind: 'earning', label: 'Pending reimbursement: travel claim EXP-2026-0913', amount: 3450, how: 'Approved claim not yet paid (M05).', auto: true },
  { id: 'f6', kind: 'recovery', label: 'Unclaimed travel advance ADV-2026-0077', amount: 5000, how: 'Advance given 2 Sep 2026 with no settling claim (M05 Q6). Refreshed until approval.', auto: true },
  { id: 'f7', kind: 'recovery', label: 'Notice shortfall: none (60 days served)', amount: 0, how: 'No shortfall: last working day 19 Oct 2026 matches the 60-day notice.' },
  { id: 'f8', kind: 'tax', label: 'TDS on final income', amount: 6210, how: 'Recomputed for FY 2026–27 on the new regime with final income (Form 16 at year end).' },
];

/** `flagTone`: warning for real risks, neutral for information (founder review 1 Oct 2026). */
export const EXIT_CASES: { id: string; name: string; code: string; type: string; lwd: Date; stage: string; manager: string; flags: string; flagTone?: 'warning' | 'neutral' }[] = [
  { id: 'x1', name: 'Meera Iyer', code: 'KF-0118', type: 'Resignation', lwd: d(2026, 10, 19), stage: 'Clearance', manager: 'Divya Raghunathan', flags: '' },
  { id: 'x2', name: 'Joseph Mathew', code: 'KF-0071', type: 'Resignation', lwd: d(2026, 11, 28), stage: 'Approval and notice', manager: 'Priya Nair', flags: '' },
  { id: 'x3', name: 'Manoj Patil', code: 'KF-0054', type: 'Retirement', lwd: d(2026, 10, 31), stage: 'Clearance', manager: 'Prakash Menon', flags: '' },
  { id: 'x4', name: 'Rohit Das', code: 'KF-0196', type: 'Absconding', lwd: d(2026, 9, 19), stage: 'F&F', manager: 'Manoj Patil', flags: 'Recovery-only F&F', flagTone: 'warning' },
  { id: 'x5', name: 'Neha Ghosh', code: 'KF-0133', type: 'Termination', lwd: d(2026, 9, 22), stage: 'Documents', manager: 'Sana Nizami', flags: 'Open case: letters held', flagTone: 'warning' },
  { id: 'x6', name: 'Ravi Shankar', code: 'KF-0012', type: 'Death in service', lwd: d(2026, 9, 14), stage: 'F&F', manager: 'Prakash Menon', flags: 'Payees: nominees', flagTone: 'neutral' },
];

export const CLEARANCE = [
  { id: 'cl1', dept: 'Manager handover', owner: 'Divya Raghunathan', item: 'Handover of lab SOPs and open batches', status: 'Done', recovery: 0 },
  { id: 'cl2', dept: 'IT', owner: 'Rohit Bhat', item: 'Revoke access; collect laptop KF-LAP-0187', status: 'Pending', recovery: 0 },
  { id: 'cl3', dept: 'Admin and assets', owner: 'Fatima Shaikh', item: 'Lab coat, locker key, ID card', status: 'Pending', recovery: 450 },
  { id: 'cl4', dept: 'Finance', owner: 'Deepa Rao', item: 'Advances and expense claims', status: 'Blocked', recovery: 5000 },
  { id: 'cl5', dept: 'HR documents', owner: 'Lakshmi Venkatesan', item: 'Exit interview, NDA reminder', status: 'Pending', recovery: 0 },
  { id: 'cl6', dept: 'Payroll (statutory)', owner: 'Suresh Pillai', item: 'EPFO date of exit, Form L within 15 days', status: 'Pending', recovery: 0 },
];

export const DEPROVISIONING = [
  { module: 'Sign-in and grants', action: 'Convert to alumni; end grants', timing: 'On last working day', status: 'Pending' },
  { module: 'Mobile devices', action: 'Revoke devices, push tokens, kiosk PIN', timing: 'On last working day', status: 'Pending' },
  { module: 'Biometric devices', action: 'Remove from 3 devices', timing: 'On last working day', status: 'Failed', note: 'Hosur gate 2 device offline' },
  { module: 'Approvals', action: 'Reassign 2 pending approvals', timing: 'After last working day', status: 'Done' },
  { module: 'Helpdesk', action: 'Reassign 1 ticket to queue lead', timing: 'After last working day', status: 'Done' },
  { module: 'Learning', action: 'Cancel 1 enrolment; release seat', timing: 'After last working day', status: 'Pending' },
  { module: 'Headcount plan', action: 'Backfill requested: replacement requisition REQ-2026-0319', timing: 'On last working day', status: 'Done' },
  { module: 'Assets', action: 'Unreturned assets to clearance and F&F', timing: 'After last working day', status: 'Pending' },
];

export const DEATH_PAYEES = [
  { name: 'Kamala Shankar', relation: 'Spouse', scheme: 'Gratuity', share: 70, bank: 'Indian Bank · XXXX 3321', verified: true },
  { name: 'Divakar Shankar', relation: 'Son', scheme: 'Gratuity', share: 30, bank: 'Canara Bank · XXXX 9087', verified: false },
  { name: 'Kamala Shankar', relation: 'Spouse', scheme: 'PF', share: 100, bank: 'Indian Bank · XXXX 3321', verified: true },
];

/* ------------------------------------------------------------------ assets and succession (PPL-25, 26) */

export const ASSETS = [
  { id: 'a1', tag: 'KF-LAP-0231', type: 'Laptop', name: '14 inch laptop, 16 GB', serial: 'SN-5CD3219XK', location: 'Hosur plant', status: 'Assigned', holder: 'Arjun Kulkarni', cost: 68500, purchased: d(2023, 5, 30) },
  { id: 'a2', tag: 'KF-LAP-0187', type: 'Laptop', name: '14 inch laptop, 8 GB', serial: 'SN-5CD2208AA', location: 'Hosur plant', status: 'Assigned', holder: 'Meera Iyer', cost: 54200, purchased: d(2022, 8, 11) },
  { id: 'a3', tag: 'KF-TAB-0044', type: 'Tablet', name: 'Inspection tablet', serial: 'SN-TB44-0192', location: 'Hosur plant', status: 'Assigned', holder: 'Arjun Kulkarni', cost: 24900, purchased: d(2026, 9, 1) },
  { id: 'a4', tag: 'KF-TAB-0045', type: 'Tablet', name: 'Inspection tablet', serial: 'SN-TB44-0193', location: 'Hosur plant', status: 'In stock', holder: '', cost: 24900, purchased: d(2026, 9, 1) },
  { id: 'a5', tag: 'KF-PHN-0102', type: 'Phone', name: 'Field sales phone', serial: 'IMEI-XXXX-2231', location: 'Chennai office', status: 'In repair', holder: '', cost: 18900, purchased: d(2024, 2, 14) },
  { id: 'a6', tag: 'KF-VEH-0007', type: 'Two-wheeler', name: 'Sales two-wheeler', serial: 'TN09 BX 4412', location: 'Chennai office', status: 'Assigned', holder: 'Rahul Sharma', cost: 92000, purchased: d(2023, 1, 20) },
  { id: 'a7', tag: 'KF-LAP-0099', type: 'Laptop', name: '13 inch laptop', serial: 'SN-5CD1107ZZ', location: 'Bengaluru head office', status: 'Lost', holder: '', cost: 61000, purchased: d(2021, 7, 2) },
  { id: 'a8', tag: 'KF-LAP-0012', type: 'Laptop', name: '15 inch laptop', serial: 'SN-5CD0002QQ', location: 'Bengaluru head office', status: 'Retired', holder: '', cost: 72000, purchased: d(2019, 3, 15) },
];

export const SUCCESSION = [
  { id: 'sp1', position: 'Plant Head, Hosur', incumbent: 'Prakash Menon', band: 'Exceeds', successors: [{ name: 'Manoj Patil', readiness: '1–2 years' as const, band: 'Meets' }, { name: 'Vikram Singh', readiness: '3+ years' as const, band: 'Exceeds' }] },
  { id: 'sp2', position: 'Head of Quality', incumbent: 'Divya Menon', band: 'Exceeds', successors: [{ name: 'Divya Raghunathan', readiness: 'Ready now' as const, band: 'Exceeds' }, { name: 'Arjun Kulkarni', readiness: '3+ years' as const, band: 'Meets' }] },
  { id: 'sp3', position: 'Finance Controller', incumbent: 'Suresh Pillai', band: 'Meets', successors: [] },
  { id: 'sp4', position: 'Head of Sales', incumbent: 'Sana Nizami', band: 'Exceeds', successors: [{ name: 'Priya Nair', readiness: 'Ready now' as const, band: 'Exceeds' }] },
  { id: 'sp5', position: 'Head of People', incumbent: 'Lakshmi Venkatesan', band: 'Meets', successors: [{ name: 'Neha Joshi', readiness: '1–2 years' as const, band: 'Meets' }] },
];

/* ------------------------------------------------------------------ documents and letters (PPL-27..31) */

export const VERIFY_QUEUE = [
  { id: 'v1', name: 'Kavya Reddy', type: 'PAN card', uploaded: d(2026, 9, 27), auto: 'PAN verification passed; name matches', status: 'Auto-verified', cls: 'Confidential' as FieldClass },
  { id: 'v2', name: 'Kavya Reddy', type: 'Bank proof', uploaded: d(2026, 9, 27), auto: 'Penny drop failed: account holder name differs (K Reddy)', status: 'Needs review', cls: 'Confidential' as FieldClass },
  { id: 'v3', name: 'Arjun Kulkarni', type: 'Experience letter', uploaded: d(2026, 9, 21), auto: 'No automated check for this type', status: 'Needs review', cls: 'Internal' as FieldClass },
  { id: 'v4', name: 'Ananya Das', type: 'Degree certificate', uploaded: d(2026, 9, 28), auto: 'No automated check for this type', status: 'Needs review', cls: 'Internal' as FieldClass },
  { id: 'v5', name: 'Suresh Nair', type: 'Aadhaar', uploaded: d(2026, 9, 28), auto: 'Checksum valid; stored masked', status: 'Needs review', cls: 'Special' as FieldClass },
  { id: 'v6', name: 'Murugan K', type: 'Education proof', uploaded: d(2026, 9, 29), auto: 'Scan in progress', status: 'Scanning', cls: 'Internal' as FieldClass },
];

export const ISSUED_LETTERS = [
  { id: 'l1', ref: 'KF/HR/2026/0418', type: 'Promotion', to: 'Arjun Kulkarni', issued: d(2026, 9, 24), status: 'Issued', esign: 'Accepted with OTP' },
  { id: 'l2', ref: 'KF/HR/2026/0417', type: 'Appointment', to: 'Kavya Reddy', issued: d(2026, 9, 23), status: 'Issued', esign: 'Waiting for acceptance' },
  { id: 'l3', ref: 'KF/HR/2026/0416', type: 'Relieving', to: 'Neha Ghosh', issued: null as Date | null, status: 'Held', esign: '—' },
  { id: 'l4', ref: 'KF/HR/2026/0412', type: 'Increment', to: 'Thomas George', issued: d(2026, 9, 18), status: 'Superseded', esign: 'Accepted with OTP' },
  { id: 'l5', ref: 'KF/HR/2026/0413', type: 'Increment', to: 'Thomas George', issued: d(2026, 9, 19), status: 'Issued', esign: 'Accepted with OTP' },
  { id: 'l6', ref: 'KF/HR/2026/0420', type: 'Transfer', to: 'Rahul Sharma', issued: null as Date | null, status: 'Pending approval', esign: '—' },
  { id: 'l7', ref: 'KF/HR/2026/0409', type: 'Salary certificate', to: 'Divya Raghunathan', issued: d(2026, 9, 12), status: 'Issued', esign: 'Company DSC' },
];

export const TEMPLATES = [
  { id: 'tp1', type: 'Appointment', name: 'Appointment letter, plant staff', source: 'Uploaded Word', languages: 'English, Tamil', version: 4, status: 'Active', approval: true },
  { id: 'tp2', type: 'Promotion', name: 'Promotion with pay change', source: 'In-app editor', languages: 'English', version: 2, status: 'Active', approval: true },
  { id: 'tp3', type: 'Salary certificate', name: 'Salary certificate (instant)', source: 'In-app editor', languages: 'English, Hindi', version: 3, status: 'Active', approval: false },
  { id: 'tp4', type: 'Relieving', name: 'Relieving and experience', source: 'Uploaded Word', languages: 'English', version: 1, status: 'Draft', approval: true },
  { id: 'tp5', type: 'Absconding notice 1', name: 'Absconding notice 1 (starter)', source: 'Starter template', languages: 'English, Tamil', version: 1, status: 'Active', approval: false },
];

export const MY_DOCS = [
  { id: 'm1', name: 'PAN card', kind: 'Upload', status: 'Verified', date: d(2021, 3, 10), size: 214000 },
  { id: 'm2', name: 'Experience letter, previous employer', kind: 'Upload', status: 'Pending verification', date: d(2026, 9, 21), size: 488000 },
  { id: 'm3', name: 'Forklift licence', kind: 'Upload', status: 'Expiring 24 Oct 2026', date: d(2021, 11, 2), size: 301000 },
  { id: 'm4', name: 'Promotion letter KF/HR/2026/0418', kind: 'Letter', status: 'Accepted', date: d(2026, 9, 24), size: 96000 },
  { id: 'm5', name: 'Payslip, August 2026', kind: 'Payslip', status: 'Published', date: d(2026, 8, 31), size: 72000 },
  { id: 'm6', name: 'Form 16, FY 2025–26', kind: 'Tax form', status: 'Published', date: d(2026, 6, 12), size: 158000 },
  { id: 'm7', name: 'Food safety training certificate', kind: 'Certificate', status: 'Valid to 10 Mar 2027', date: d(2026, 3, 10), size: 120000 },
  { id: 'm8', name: 'Code of conduct 2026', kind: 'Policy', status: 'Acknowledged', date: d(2026, 4, 2), size: 402000 },
];

/* ------------------------------------------------------------------ privacy (PPL-33) */

export const ACCESS_LOG = [
  { id: 'al1', who: 'Lakshmi Venkatesan', role: 'Head of People', what: 'Bank account', why: 'Bank change request PCR-2026-0081', at: new Date(2026, 8, 28, 16, 12) },
  { id: 'al2', who: 'Suresh Pillai', role: 'Payroll Manager', what: 'Salary and CTC', why: 'Revision letter check', at: new Date(2026, 8, 24, 11, 40) },
  { id: 'al3', who: 'Fatima Shaikh', role: 'HR Executive', what: 'PAN', why: 'Document verification', at: new Date(2026, 8, 21, 10, 5) },
  { id: 'al4', who: 'Divya Raghunathan', role: 'Your manager', what: 'Salary and CTC', why: 'Promotion proposal (salary grant)', at: new Date(2026, 8, 15, 14, 30) },
  { id: 'al5', who: 'Lakshmi Venkatesan', role: 'Head of People', what: 'Aadhaar (masked)', why: 'Re-verification cycle', at: new Date(2026, 7, 2, 9, 55) },
];

/* ------------------------------------------------------------------ relations (PPL-39, 40, 42) */

export const UNIONS = [
  { id: 'u1', name: 'Hosur Food Workers Union', reg: 'TN/HSR/TU/1187', establishment: 'Hosur plant', recognised: 'Recognised', basis: 'Sole negotiating union: 58% of workers', from: d(2025, 4, 1), to: d(2028, 3, 31), members: 96, bearers: 'President Murugesan V · Secretary Selvi R · Treasurer Anbu K' },
  { id: 'u2', name: 'Kaveri Staff Association', reg: 'KA/BLR/TU/0421', establishment: 'Bengaluru head office', recognised: 'Not recognised', basis: 'Below 20% of workers', from: null as Date | null, to: null as Date | null, members: 14, bearers: 'President Nandakumar S · Secretary Leela P' },
];

export const VRS = {
  name: 'VRS 2026, Hosur plant',
  window: [d(2026, 10, 1), d(2026, 10, 31)] as [Date, Date],
  eligibility: 'Age 50+ and 10+ years of service at Hosur plant',
  benefit: '45 days of last-drawn basic + DA per completed year, or basic + DA × months left to retirement, whichever is lower',
  eligible: 38,
  applications: [
    { id: 'va1', name: 'Manoj Patil', age: 57, service: 24, benefit: 1296000, status: 'Pending HR approval' },
    { id: 'va2', name: 'Gurpreet Kaur', age: 51, service: 12, benefit: 684000, status: 'Pending manager approval' },
    { id: 'va3', name: 'Lakshmanan Durai', age: 55, service: 19, benefit: 952000, status: 'Approved: letter issued' },
    { id: 'va4', name: 'Selvi Perumal', age: 53, service: 11, benefit: 598000, status: 'Withdrawn' },
  ],
};

export const REVERIFY = [
  { id: 'rv1', name: 'Arjun Kulkarni', trigger: 'Periodic, every 3 years', last: d(2023, 10, 20), due: d(2026, 10, 20), consent: 'Given 22 Sep 2026', result: 'In progress', partner: 'BGV-8812' },
  { id: 'rv2', name: 'Priya Nair', trigger: 'Client mandate: Brindavan Retail Ltd', last: d(2024, 1, 5), due: d(2026, 10, 1), consent: 'Not yet asked', result: 'Not started', partner: '' },
  { id: 'rv3', name: 'Rohit Bhat', trigger: 'Role change into Payroll (sensitive)', last: d(2022, 6, 2), due: d(2026, 9, 1), consent: 'Refused 3 Sep 2026', result: 'HR review', partner: '' },
  { id: 'rv4', name: 'Deepa Rao', trigger: 'Periodic, every 3 years', last: d(2023, 8, 14), due: d(2026, 8, 14), consent: 'Given 1 Aug 2026', result: 'Adverse: HR review', partner: 'BGV-8790' },
  { id: 'rv5', name: 'Imran Qureshi', trigger: 'Periodic, every 3 years', last: d(2024, 2, 1), due: d(2027, 2, 1), consent: '—', result: 'Clear (last cycle)', partner: 'BGV-7104' },
];

/* ------------------------------------------------------------------ identity (PPL-34, 36, 37) */

export const MATCHES = [
  {
    id: 'mt1',
    left: { name: 'Suresh Nair', dob: '1990-02-11', email: 'suresh.nair90@mailbox.example', phone: '+91 98860 11223', pan: '', uan: '', role: 'Candidate · APP-2026-1188' },
    right: { name: 'Suresh K Nair', dob: '1990-02-11', email: 'suresh.n@kaverifoods.in', phone: '+91 98860 11224', pan: 'BKNPN7712Q', uan: '100911223344', role: 'Alumnus · left 14 Feb 2025' },
    face: false,
  },
  {
    id: 'mt2',
    left: { name: 'Anbu Durai', dob: '1996-07-30', email: '', phone: '+91 94430 55120', pan: '', uan: '100877001122', role: 'Contract worker · CW-0012' },
    right: { name: 'Anbu D', dob: '1996-07-30', email: 'anbu.d@mailbox.example', phone: '+91 94430 55121', pan: '', uan: '', role: 'Candidate · APP-2026-1201' },
    face: true,
  },
  {
    id: 'mt3',
    left: { name: 'Priya Nair', dob: '1991-05-04', email: '', phone: '', pan: '', uan: '', role: 'Test-taker · ATT-90112' },
    right: { name: 'Priya Nair', dob: '1988-12-19', email: 'priya.nair@kaverifoods.in', phone: '', pan: '', uan: '', role: 'Employee · KF-0061' },
    face: false,
  },
];

export const IDENTITY = {
  consent: [
    { jurisdiction: 'India (DPDP)', status: 'Given', on: d(2021, 1, 20), point: 'Application verification' },
    { jurisdiction: 'United Arab Emirates (PDPL)', status: 'Given', on: d(2025, 10, 28), point: 'Deputation pre-boarding' },
  ],
  checks: [
    { at: d(2021, 1, 20), point: 'Application verification', result: 'Captured (ID + selfie)', by: 'System' },
    { at: d(2021, 1, 25), point: 'Test ID check', result: 'Match', by: 'System' },
    { at: d(2021, 2, 4), point: 'Live interview', result: 'Match', by: 'Interviewer: Karthik Subramanian' },
    { at: d(2021, 3, 12), point: 'Day-1 identity check', result: 'Match', by: 'HR: Lakshmi Venkatesan' },
  ],
};

export const TEAM_TODAY = [
  { id: 'o8', name: 'Arjun Kulkarni', role: 'Senior Quality Inspector', today: 'Present · in 8:52 am', upcoming: 'Promotion effective 1 Oct' },
  { id: 'o9', name: 'Kavya Reddy', role: 'Quality Inspector', today: 'Joins 5 Oct', upcoming: 'Onboarding 62% done' },
  { id: 'o10', name: 'Imran Qureshi', role: 'Quality Inspector', today: 'On leave (casual)', upcoming: 'Contract ends 31 Oct' },
  { id: 'o11', name: 'Meera Iyer', role: 'Lab Analyst', today: 'Present · in 9:05 am', upcoming: 'Last working day 19 Oct' },
  { id: 'o25', name: 'Sana Menon', role: 'Quality Inspector', today: 'Late · not checked in', upcoming: 'Work anniversary 2 Oct' },
];

export const CUSTOM_FIELDS_NOTE = 'Custom fields come from the employee field set (P18); each has a class and a self-edit flag.';
