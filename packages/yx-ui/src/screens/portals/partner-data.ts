// Fictional sample data for the partner portal (PTR-01 … 09). Partner firm: Sridhar & Rao Associates (CA firm and payroll bureau).
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

export const PARTNER = {
  firm: 'Sridhar & Rao Associates',
  accent: '5B3A8C',
  types: ['Accountant / CA firm', 'Payroll bureau'],
  gstin: '29AAKFS3321M1Z8',
  pan: 'AAKFS3321M',
  icai: 'FRN 012345S',
  region: 'Karnataka',
  verification: 'verified' as 'pending' | 'verified' | 'suspended',
  agreementVersion: 'G-34 v2',
  agreementCurrent: true,
  user: { name: 'Shalini Sridhar', email: 'shalini@sridharrao.in', role: 'Partner admin' },
};

export interface PartnerClient {
  id: string;
  name: string;
  employees: number;
  ownership: 'Client-owned' | 'Partner-owned';
  relationship: 'Operates' | 'Advises' | 'Resold only';
  health: number;
  payroll: 'Inputs pending' | 'Processing' | 'Awaiting client approval' | 'Paid' | 'Locked';
  blockers: string[];
  compliance: 'On track' | 'Due this week' | 'Late';
  link: 'Active' | 'Pending client approval' | 'Transfer requested' | 'Ended';
  contact: string;
  contactAccepted: boolean;
  billing: 'Direct' | 'Partner-billed';
  grant: string;
}

export const PARTNER_CLIENTS: PartnerClient[] = [
  { id: 'c1', name: 'Kaveri Foods Pvt Ltd', employees: 248, ownership: 'Client-owned', relationship: 'Operates', health: 82, payroll: 'Awaiting client approval', blockers: [], compliance: 'Due this week', link: 'Active', contact: 'Suresh Pillai', contactAccepted: true, billing: 'Direct', grant: 'Operates payroll' },
  { id: 'c2', name: 'Hosur Castings', employees: 380, ownership: 'Client-owned', relationship: 'Operates', health: 74, payroll: 'Processing', blockers: ['6 attendance exceptions'], compliance: 'On track', link: 'Active', contact: 'Ramya Krishnan', contactAccepted: true, billing: 'Direct', grant: 'Operates payroll' },
  { id: 'c3', name: 'Palar Beverages', employees: 190, ownership: 'Partner-owned', relationship: 'Operates', health: 61, payroll: 'Inputs pending', blockers: ['3 missing bank details', '1 unverified PAN'], compliance: 'Late', link: 'Active', contact: 'Imran Qadri', contactAccepted: true, billing: 'Partner-billed', grant: 'Operates payroll' },
  { id: 'c4', name: 'Nandi Hills Resorts', employees: 72, ownership: 'Client-owned', relationship: 'Advises', health: 88, payroll: 'Locked', blockers: [], compliance: 'On track', link: 'Active', contact: 'Asha Kumar', contactAccepted: true, billing: 'Partner-billed', grant: 'Advises compliance' },
  { id: 'c5', name: 'Tumkur Agro Mills', employees: 140, ownership: 'Partner-owned', relationship: 'Operates', health: 55, payroll: 'Paid', blockers: [], compliance: 'On track', link: 'Transfer requested', contact: 'Venkatesh Gowda', contactAccepted: true, billing: 'Partner-billed', grant: 'Operates payroll' },
  { id: 'c6', name: 'Mysuru Silk House', employees: 36, ownership: 'Partner-owned', relationship: 'Operates', health: 40, payroll: 'Inputs pending', blockers: ['Client contact has not accepted'], compliance: 'On track', link: 'Pending client approval', contact: 'Latha Rao', contactAccepted: false, billing: 'Partner-billed', grant: 'Operates payroll' },
];

export interface CalItem {
  id: string;
  client: string;
  statute: 'PF' | 'ESI' | 'PT' | 'LWF' | 'TDS' | '24Q / 138' | '26Q / 140' | 'Registers';
  state: string;
  due: Date;
  status: 'due' | 'late' | 'filed';
}

export const CAL_ITEMS: CalItem[] = [
  { id: 'k1', client: 'Palar Beverages', statute: 'PF', state: 'Tamil Nadu', due: d(2026, 9, 15), status: 'late' },
  { id: 'k2', client: 'Kaveri Foods Pvt Ltd', statute: 'PF', state: 'Karnataka', due: d(2026, 9, 15), status: 'filed' },
  { id: 'k3', client: 'Hosur Castings', statute: 'ESI', state: 'Tamil Nadu', due: d(2026, 9, 15), status: 'filed' },
  { id: 'k4', client: 'Kaveri Foods Pvt Ltd', statute: 'PT', state: 'Karnataka', due: d(2026, 9, 20), status: 'filed' },
  { id: 'k5', client: 'Palar Beverages', statute: 'TDS', state: 'Tamil Nadu', due: d(2026, 10, 7), status: 'due' },
  { id: 'k6', client: 'Kaveri Foods Pvt Ltd', statute: 'TDS', state: 'Karnataka', due: d(2026, 10, 7), status: 'due' },
  { id: 'k7', client: 'Hosur Castings', statute: 'TDS', state: 'Tamil Nadu', due: d(2026, 10, 7), status: 'due' },
  { id: 'k8', client: 'Nandi Hills Resorts', statute: 'Registers', state: 'Karnataka', due: d(2026, 9, 30), status: 'due' },
  { id: 'k9', client: 'Kaveri Foods Pvt Ltd', statute: '24Q / 138', state: 'Karnataka', due: d(2026, 10, 31), status: 'due' },
  { id: 'k10', client: 'Tumkur Agro Mills', statute: 'LWF', state: 'Karnataka', due: d(2027, 1, 15), status: 'due' },
  { id: 'k11', client: 'Hosur Castings', statute: 'PF', state: 'Tamil Nadu', due: d(2026, 9, 15), status: 'filed' },
];

export interface PartnerTask {
  id: string;
  client: string;
  type: string;
  due: Date;
  owner: string;
  sla: string;
  status: 'To do' | 'In progress' | 'Waiting for client' | 'Done';
  link: string;
}
export const PARTNER_TASKS: PartnerTask[] = [
  { id: 't1', client: 'Palar Beverages', type: 'File PF (late)', due: d(2026, 9, 30), owner: 'Arjun Hegde', sla: 'Overdue 14 days', status: 'In progress', link: 'PF · Sep 2026' },
  { id: 't2', client: 'Kaveri Foods Pvt Ltd', type: 'Payroll approval follow-up', due: d(2026, 9, 29), owner: 'Deepa Nair', sla: 'Due today', status: 'Waiting for client', link: 'Payroll run Sep 2026' },
  { id: 't3', client: 'Hosur Castings', type: 'Clear attendance exceptions', due: d(2026, 9, 30), owner: 'Deepa Nair', sla: '1 day left', status: 'To do', link: 'Payroll run Sep 2026' },
  { id: 't4', client: 'Kaveri Foods Pvt Ltd', type: 'Deposit TDS', due: d(2026, 10, 7), owner: 'Arjun Hegde', sla: '8 days left', status: 'To do', link: 'TDS · Sep 2026' },
  { id: 't5', client: 'Nandi Hills Resorts', type: 'Update registers', due: d(2026, 9, 30), owner: 'Meghana Joshi', sla: '1 day left', status: 'In progress', link: 'Registers Q2' },
  { id: 't6', client: 'Tumkur Agro Mills', type: 'Hand over open runs before transfer', due: d(2026, 10, 20), owner: 'Shalini Sridhar', sla: '21 days left', status: 'To do', link: 'Transfer to client' },
];

export const PARTNER_REQUESTS = [
  { id: 'r1', client: 'Palar Beverages', what: 'September payroll inputs (attendance, overtime)', sent: d(2026, 9, 22), due: d(2026, 9, 26), status: 'Overdue' },
  { id: 'r2', client: 'Hosur Castings', what: 'Investment proofs for 42 employees', sent: d(2026, 9, 15), due: d(2026, 10, 15), status: 'Partly received · 18 of 42' },
  { id: 'r3', client: 'Kaveri Foods Pvt Ltd', what: 'Bonus sheet for Deepavali advance', sent: d(2026, 9, 25), due: d(2026, 10, 5), status: 'Received' },
  { id: 'r4', client: 'Mysuru Silk House', what: 'Employee master and bank details', sent: d(2026, 9, 27), due: d(2026, 10, 3), status: 'Waiting' },
];

export const PARTNER_TEMPLATES = [
  { id: 'tp1', kind: 'Salary structure', name: 'Manufacturing staff · Karnataka', version: 'v3', updated: d(2026, 8, 12), usedBy: 4 },
  { id: 'tp2', kind: 'Salary structure', name: 'Hospitality · with service charge', version: 'v1', updated: d(2026, 6, 1), usedBy: 1 },
  { id: 'tp3', kind: 'Letter template', name: 'Appointment letter · factory worker (Kannada and English)', version: 'v2', updated: d(2026, 7, 20), usedBy: 3 },
  { id: 'tp4', kind: 'Import mapping', name: 'Attendance from Kaval biometric export', version: 'v4', updated: d(2026, 9, 2), usedBy: 5 },
];

export const PARTNER_TEAM = [
  { id: 'u1', name: 'Shalini Sridhar', email: 'shalini@sridharrao.in', roles: 'Partner admin, Reviewer', clients: 'All 6', mfa: 'Passkey', status: 'Active' },
  { id: 'u2', name: 'Arjun Hegde', email: 'arjun@sridharrao.in', roles: 'Compliance / filing operator', clients: 'Kaveri Foods, Palar Beverages, Hosur Castings', mfa: 'Authenticator app', status: 'Active' },
  { id: 'u3', name: 'Deepa Nair', email: 'deepa@sridharrao.in', roles: 'Payroll bureau operator', clients: 'Kaveri Foods, Hosur Castings', mfa: 'Authenticator app', status: 'Active' },
  { id: 'u4', name: 'Meghana Joshi', email: 'meghana@sridharrao.in', roles: 'Read-only auditor', clients: 'Nandi Hills Resorts', mfa: 'Not set up', status: 'Invited' },
  { id: 'u5', name: 'Prakash Shetty', email: 'prakash@sridharrao.in', roles: 'Sales / onboarding', clients: 'None (no HR data)', mfa: 'Authenticator app', status: 'Active' },
];

export const PARTNER_COMMISSION = [
  { client: 'Kaveri Foods Pvt Ltd', billed: 23_808, ratePct: 15, status: 'accrued' as const, month: 'Sep 2026', invoice: 'YX/26-27/4402', payout: '' },
  { client: 'Hosur Castings', billed: 36_480, ratePct: 15, status: 'approved' as const, month: 'Sep 2026', invoice: 'YX/26-27/4398', payout: '' },
  { client: 'Kaveri Foods Pvt Ltd', billed: 23_712, ratePct: 15, status: 'paid' as const, month: 'Aug 2026', invoice: 'YX/26-27/4101', payout: 'NEFT UTR 2609120031' },
];
