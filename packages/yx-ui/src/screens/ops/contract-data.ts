// Fictional contract-labour data (M13). Principal employer: Kaveri Foods Pvt Ltd; contractors are fictional firms.
const d = (day: number, month = 8, year = 2026) => new Date(year, month, day);

export interface Licence {
  no: string;
  establishment: string;
  scope: string;
  states: string[];
  max: number;
  active: number;
  validTo: Date;
}
export interface Contractor {
  id: string;
  name: string;
  work: string;
  pan: string;
  panVerified: boolean;
  gstin: string;
  pfCode: string;
  esicCode: string;
  lin: string;
  contact: string;
  loginInvited: boolean;
  licences: Licence[];
  status: 'Active' | 'Payment held' | 'Inactive';
}
export const CONTRACTORS: Contractor[] = [
  { id: 'c1', name: 'Sri Lakshmi Facility Services', work: 'Housekeeping', pan: 'AAKFS4471L', panVerified: true, gstin: '33AAKFS4471L1Z2', pfCode: 'TNMAS0077120000', esicCode: '51000771200001001', lin: '1-2345-6789-0', contact: 'Lakshmi Narayanan', loginInvited: true, licences: [{ no: 'TN/OSH/CL/2026/1180', establishment: 'Hosur plant', scope: 'Single licence, Tamil Nadu and Karnataka', states: ['Tamil Nadu', 'Karnataka'], max: 30, active: 30, validTo: d(31, 11) }], status: 'Active' },
  { id: 'c2', name: 'Vetri Security Agency', work: 'Security', pan: 'AAHFV2210K', panVerified: true, gstin: '33AAHFV2210K1ZA', pfCode: 'TNMAS0081230000', esicCode: '51000812300001001', lin: '1-3456-7890-1', contact: 'Selvam K.', loginInvited: true, licences: [{ no: 'TN/CLRA/2024/0442', establishment: 'Hosur plant', scope: 'Establishment', states: ['Tamil Nadu'], max: 20, active: 14, validTo: d(20, 9) }], status: 'Active' },
  { id: 'c3', name: 'Kaveri Loaders Co-op', work: 'Loading and unloading', pan: 'AAJCK9981M', panVerified: false, gstin: '—', pfCode: 'TNMAS0090010000', esicCode: '51000900100001001', lin: '—', contact: 'Rajan M.', loginInvited: false, licences: [{ no: 'TN/CLRA/2023/0198', establishment: 'Hosur plant', scope: 'Establishment', states: ['Tamil Nadu'], max: 25, active: 22, validTo: d(15, 8) }], status: 'Payment held' },
  { id: 'c4', name: 'Annapoorna Canteen Services', work: 'Canteen', pan: 'AAMFA5512P', panVerified: true, gstin: '29AAMFA5512P1ZQ', pfCode: 'KNBNG0066120000', esicCode: '53000661200001001', lin: '1-4567-8901-2', contact: 'Geetha P.', loginInvited: true, licences: [{ no: 'KA/OSH/CL/2026/0341', establishment: 'Bengaluru head office', scope: 'Establishment', states: ['Karnataka'], max: 12, active: 8, validTo: d(31, 2, 2028) }], status: 'Active' },
];

export const ESTABLISHMENTS = [
  { name: 'Hosur plant', state: 'Tamil Nadu', rc: 'TN/OSH/REG/2025/88120', family: 'OSH Code', workers: 66, threshold: 50, validTo: d(31, 11, 2030) },
  { name: 'Bengaluru head office', state: 'Karnataka', rc: '—', family: 'OSH Code', workers: 8, threshold: 50, validTo: null as Date | null },
];

export interface ContractWorker {
  id: string;
  name: string;
  contractor: string;
  site: string;
  skill: 'Unskilled' | 'Semi-skilled' | 'Skilled';
  wage: number;
  from: Date;
  to: Date | null;
  gatePass: string;
  gateValidTo: Date;
  uan: string;
  ip: string;
  idMasked: string;
  status: 'Deployed' | 'Pending approval' | 'Released';
}
const W = (i: number, name: string, contractor: string, skill: ContractWorker['skill'], wage: number, status: ContractWorker['status'] = 'Deployed'): ContractWorker => ({
  id: `w${i}`,
  name,
  contractor,
  site: contractor.startsWith('Annapoorna') ? 'Bengaluru head office' : 'Hosur plant',
  skill,
  wage,
  from: d(1 + (i % 20), 3 + (i % 4)),
  to: status === 'Released' ? d(15) : null,
  gatePass: `GP-HSR-${String(4100 + i)}`,
  gateValidTo: d(31, 11),
  uan: `1013${String(55000000 + i * 1371)}`,
  ip: `31-00-7712${String(10 + i)}-000-0001`,
  idMasked: `XXXX XXXX ${String(1000 + i * 73).slice(-4)}`,
  status,
});
export const WORKERS: ContractWorker[] = [
  W(1, 'Murugan P.', 'Sri Lakshmi Facility Services', 'Unskilled', 14820),
  W(2, 'Selvi R.', 'Sri Lakshmi Facility Services', 'Unskilled', 14820),
  W(3, 'Anbu Selvan', 'Vetri Security Agency', 'Semi-skilled', 16240),
  W(4, 'Karthika M.', 'Vetri Security Agency', 'Semi-skilled', 16240),
  W(5, 'Palani K.', 'Kaveri Loaders Co-op', 'Unskilled', 13900),
  W(6, 'Ramesh Babu', 'Kaveri Loaders Co-op', 'Unskilled', 14820, 'Pending approval'),
  W(7, 'Shanthi V.', 'Annapoorna Canteen Services', 'Skilled', 19200),
  W(8, 'Ilango T.', 'Sri Lakshmi Facility Services', 'Unskilled', 14820, 'Released'),
];

export const PROOF_TYPES = ['PF ECR + challan', 'ESI challan', 'Wage register', 'Wage payment proof', 'PT / LWF'];
export type ProofStatus = 'Verified' | 'Submitted' | 'Discrepancy' | 'Overdue' | 'Not required' | 'Open';
export const PACK_MATRIX: { contractor: string; statuses: ProofStatus[] }[] = [
  { contractor: 'Sri Lakshmi Facility Services', statuses: ['Verified', 'Verified', 'Verified', 'Verified', 'Verified'] },
  { contractor: 'Vetri Security Agency', statuses: ['Verified', 'Discrepancy', 'Submitted', 'Submitted', 'Not required'] },
  { contractor: 'Kaveri Loaders Co-op', statuses: ['Overdue', 'Overdue', 'Submitted', 'Overdue', 'Not required'] },
  { contractor: 'Annapoorna Canteen Services', statuses: ['Submitted', 'Submitted', 'Open', 'Open', 'Open'] },
];

export const LIABILITY_ALERTS = [
  { id: 'la1', type: 'Short ESI challan', contractor: 'Vetri Security Agency', month: 'Aug 2026', detail: 'Challan covers 12 workers; 14 had site attendance', liability: 5420, raised: d(18), severity: 'High' },
  { id: 'la2', type: 'Wages not paid by the wage date', contractor: 'Kaveri Loaders Co-op', month: 'Aug 2026', detail: 'No payment proof by 7 Sep 2026', liability: 305800, raised: d(8), severity: 'High' },
  { id: 'la3', type: 'Licence expired', contractor: 'Kaveri Loaders Co-op', month: '—', detail: 'Licence TN/CLRA/2023/0198 expired 15 Sep 2026; 22 workers still deployed', liability: 0, raised: d(15), severity: 'High' },
  { id: 'la4', type: 'Wage below minimum', contractor: 'Kaveri Loaders Co-op', month: 'Aug 2026', detail: 'Palani K.: ₹13,900 vs ₹14,820 minimum (Tamil Nadu, zone B, unskilled; IN.MW 2026-04)', liability: 920, raised: d(18), severity: 'Medium' },
];

export const CLIENTS = [
  { id: 'cl1', client: 'Nilgiri Pharma Ltd', site: 'Ambattur unit, Chennai', principal: 'Nilgiri Pharma Ltd', rc: 'TN/OSH/REG/2025/77410', deployed: 50, max: 50, portal: 'Client vendor portal', state: 'Tamil Nadu' },
  { id: 'cl2', client: 'Deccan Textiles Pvt Ltd', site: 'Peenya, Bengaluru', principal: 'Deccan Textiles Pvt Ltd', rc: 'KA/OSH/REG/2025/31207', deployed: 18, max: 25, portal: 'Email to HR', state: 'Karnataka' },
  { id: 'cl3', client: 'Coastal Logistics Park', site: 'Kochi warehouse', principal: 'Coastal Logistics Park LLP', rc: 'KL/OSH/REG/2026/1102', deployed: 0, max: 0, portal: '—', state: 'Kerala' },
];

export const OWN_LICENCES = [
  { no: 'TN/OSH/CL/2026/2211', scope: 'Nilgiri Pharma Ltd, Ambattur', states: 'Tamil Nadu', max: 50, deployed: 50, validTo: d(31, 2, 2027), authority: 'Joint Commissioner of Labour, Chennai' },
  { no: 'KA/OSH/CL/2026/0908', scope: 'Single licence, Karnataka establishments', states: 'Karnataka', max: 60, deployed: 18, validTo: d(20, 10), authority: 'Deputy Labour Commissioner, Bengaluru' },
];

export const CLIENT_PACKS = [
  { client: 'Nilgiri Pharma Ltd', month: 'Aug 2026', items: ['Wage register', 'Muster', 'PF ECR / TRRN', 'ESI challan', 'Wage payment proof', 'PT'], status: 'Accepted' as const, due: d(10), uploaded: d(8), ref: 'NPL/VEND/0826/118' },
  { client: 'Deccan Textiles Pvt Ltd', month: 'Aug 2026', items: ['Wage register', 'Muster', 'PF ECR / TRRN', 'ESI challan', 'Wage payment proof'], status: 'Uploaded' as const, due: d(15), uploaded: d(14), ref: 'Email 14 Sep' },
  { client: 'Nilgiri Pharma Ltd', month: 'Sep 2026', items: ['Wage register', 'Muster', 'PF ECR / TRRN', 'ESI challan', 'Wage payment proof', 'PT'], status: 'Generated' as const, due: d(10, 9), uploaded: null as Date | null, ref: '' },
  { client: 'Deccan Textiles Pvt Ltd', month: 'Jul 2026', items: ['Wage register', 'Muster', 'PF ECR / TRRN', 'ESI challan', 'Wage payment proof'], status: 'Overdue' as const, due: d(15, 7), uploaded: null as Date | null, ref: '' },
];
