// Fictional sample data for business-facing T9 portals: client, staffing vendor, contract-labour vendor and visitor.
const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

/** A staffing firm tenant (runs the M10 staffing desk). Accent: deep teal, hex without '#'. */
export const STAFFING_TENANT = 'Srishti Staffing Services';
export const STAFFING_ACCENT = '0B5E6B';

/* ------------------------------------------------------------------ T9-06 Client portal */

export const CLIENT = { name: 'Kaveri Foods Pvt Ltd', contact: 'Neha Joshi', email: 'neha.j@kaverifoods.in', contractEnds: d(2027, 3, 31) };

export interface ClientJob {
  id: string;
  title: string;
  location: string;
  openings: number;
  submissions: number;
  interviews: number;
  status: 'Open' | 'On hold' | 'Filled';
  type: 'Permanent' | 'Contract';
  band: string;
}
export const CLIENT_JOBS: ClientJob[] = [
  { id: 'J-2291', title: 'Production Supervisor', location: 'Hosur plant', openings: 3, submissions: 9, interviews: 4, status: 'Open', type: 'Permanent', band: '₹6–8 L a year' },
  { id: 'J-2294', title: 'QA Chemist', location: 'Hosur plant', openings: 2, submissions: 5, interviews: 2, status: 'Open', type: 'Permanent', band: '₹4.5–6 L a year' },
  { id: 'J-2302', title: 'Warehouse Associate (contract)', location: 'Hosur plant', openings: 12, submissions: 18, interviews: 0, status: 'Open', type: 'Contract', band: '₹180 an hour' },
  { id: 'J-2270', title: 'Area Sales Officer', location: 'Madurai', openings: 1, submissions: 6, interviews: 3, status: 'On hold', type: 'Permanent', band: '₹5–6.5 L a year' },
  { id: 'J-2231', title: 'Payroll Executive', location: 'Bengaluru head office', openings: 1, submissions: 7, interviews: 3, status: 'Filled', type: 'Permanent', band: '₹5–7 L a year' },
];

export interface ClientSubmission {
  id: string;
  candidate: string;
  jobId: string;
  current: string;
  experience: string;
  expected: number;
  notice: string;
  submittedOn: Date;
  status: 'New' | 'Shortlisted' | 'Interview' | 'Rejected' | 'Offered';
}
export const CLIENT_SUBMISSIONS: ClientSubmission[] = [
  { id: 'S-8812', candidate: 'Karthikeyan Murugan', jobId: 'J-2291', current: 'Shift In-charge, Cauvery Dairy', experience: '7 years', expected: 7_60_000, notice: '30 days', submittedOn: d(2026, 9, 26), status: 'New' },
  { id: 'S-8810', candidate: 'Bhavana Rao', jobId: 'J-2291', current: 'Production Executive, Tungabhadra Snacks', experience: '5 years', expected: 6_90_000, notice: '60 days', submittedOn: d(2026, 9, 25), status: 'New' },
  { id: 'S-8801', candidate: 'Imran Sheikh', jobId: 'J-2291', current: 'Line Supervisor, Palar Beverages', experience: '6 years', expected: 7_20_000, notice: 'Serving, 20 days left', submittedOn: d(2026, 9, 22), status: 'Shortlisted' },
  { id: 'S-8796', candidate: 'Revathi Natarajan', jobId: 'J-2294', current: 'QC Analyst, Vellore Pharma Labs', experience: '3 years', expected: 5_40_000, notice: '30 days', submittedOn: d(2026, 9, 20), status: 'Interview' },
  { id: 'S-8790', candidate: 'Suresh Babu', jobId: 'J-2294', current: 'Lab Assistant, Kolar Foods', experience: '2 years', expected: 4_20_000, notice: 'Immediate', submittedOn: d(2026, 9, 18), status: 'Rejected' },
];

export const CLIENT_INTERVIEWS = [
  { id: 'I-1', candidate: 'Imran Sheikh', job: 'Production Supervisor', at: d(2026, 9, 30, 11, 0), mode: 'Video call', panel: 'Divya Raghunathan, Karthik Subramanian', status: 'Confirmed' },
  { id: 'I-2', candidate: 'Revathi Natarajan', job: 'QA Chemist', at: d(2026, 10, 1, 15, 30), mode: 'At Hosur plant', panel: 'Divya Raghunathan', status: 'Waiting for candidate' },
];

export interface ClientTimesheet {
  id: string;
  worker: string;
  role: string;
  week: string;
  hours: number;
  overtime: number;
  vendor?: string;
  status: 'Waiting for you' | 'Approved' | 'Sent back';
}
export const CLIENT_TIMESHEETS: ClientTimesheet[] = [
  { id: 'T-51', worker: 'Ravi Chandran', role: 'Warehouse Associate', week: '21–27 Sep 2026', hours: 48, overtime: 0, status: 'Waiting for you' },
  { id: 'T-52', worker: 'Pooja Iyer', role: 'Warehouse Associate', week: '21–27 Sep 2026', hours: 52, overtime: 4, status: 'Waiting for you' },
  { id: 'T-53', worker: 'Manoj Kumar', role: 'Warehouse Associate', week: '21–27 Sep 2026', hours: 48, overtime: 0, vendor: 'Coromandel Talent Partners', status: 'Waiting for you' },
  { id: 'T-48', worker: 'Ravi Chandran', role: 'Warehouse Associate', week: '14–20 Sep 2026', hours: 48, overtime: 0, status: 'Approved' },
];

export interface ClientInvoice {
  no: string;
  period: string;
  kind: 'Placement fee' | 'Contract staffing';
  amount: number;
  gst: number;
  issuedOn: Date;
  dueOn: Date;
  status: 'Paid' | 'Due' | 'Overdue';
}
export const CLIENT_INVOICES: ClientInvoice[] = [
  { no: 'SSS/26-27/0418', period: 'Sep 2026', kind: 'Contract staffing', amount: 3_45_600, gst: 62_208, issuedOn: d(2026, 9, 28), dueOn: d(2026, 10, 28), status: 'Due' },
  { no: 'SSS/26-27/0391', period: 'Aug 2026', kind: 'Placement fee', amount: 1_12_500, gst: 20_250, issuedOn: d(2026, 8, 30), dueOn: d(2026, 9, 29), status: 'Due' },
  { no: 'SSS/26-27/0355', period: 'Aug 2026', kind: 'Contract staffing', amount: 3_31_200, gst: 59_616, issuedOn: d(2026, 8, 31), dueOn: d(2026, 9, 20), status: 'Overdue' },
  { no: 'SSS/26-27/0302', period: 'Jul 2026', kind: 'Contract staffing', amount: 3_24_000, gst: 58_320, issuedOn: d(2026, 7, 31), dueOn: d(2026, 8, 30), status: 'Paid' },
];

export const CLIENT_TICKETS = [
  { id: 'TKT-3310', subject: 'Replacement needed: warehouse associate left on day 4', category: 'Replacement', priority: 'High', raisedOn: d(2026, 9, 26), sla: 'Response within 4 business hours', status: 'In progress' },
  { id: 'TKT-3297', subject: 'GST number wrong on invoice SSS/26-27/0355', category: 'Billing', priority: 'Medium', raisedOn: d(2026, 9, 22), sla: 'Response within 1 business day', status: 'Waiting for you' },
  { id: 'TKT-3251', subject: 'Add a second approver for timesheets', category: 'Access', priority: 'Low', raisedOn: d(2026, 9, 2), sla: 'Response within 2 business days', status: 'Resolved' },
];

/* ------------------------------------------------------------------ T9-12 Staffing vendor */

export const VENDOR = { name: 'Coromandel Talent Partners', contact: 'Sameer Kulkarni', email: 'sameer@coromandeltalent.in', agreementEnds: d(2027, 6, 30), tdsSection: '194J' };

export interface SharedJob {
  id: string;
  title: string;
  client: string;
  location: string;
  rateCap: number;
  maxSubmissions: number;
  mySubmissions: number;
  expiresOn: Date;
  state: 'shared' | 'expired' | 'withdrawn';
}
export const SHARED_JOBS: SharedJob[] = [
  { id: 'J-2302', title: 'Warehouse Associate (contract)', client: 'FMCG client, Hosur', location: 'Hosur', rateCap: 180, maxSubmissions: 8, mySubmissions: 5, expiresOn: d(2026, 10, 10), state: 'shared' },
  { id: 'J-2317', title: 'SAP FICO Consultant (contract)', client: 'Kaveri Foods Pvt Ltd', location: 'Bengaluru, hybrid', rateCap: 900, maxSubmissions: 4, mySubmissions: 1, expiresOn: d(2026, 10, 3), state: 'shared' },
  { id: 'J-2288', title: 'Forklift Operator (contract)', client: 'FMCG client, Hosur', location: 'Hosur', rateCap: 200, maxSubmissions: 5, mySubmissions: 5, expiresOn: d(2026, 10, 20), state: 'shared' },
  { id: 'J-2240', title: 'Data Entry Operator', client: 'Retail client, Chennai', location: 'Chennai', rateCap: 150, maxSubmissions: 6, mySubmissions: 2, expiresOn: d(2026, 9, 20), state: 'expired' },
];

export interface VendorSubmission {
  id: string;
  candidate: string;
  jobId: string;
  job: string;
  rate: number;
  submittedOn: Date;
  dup: 'unique' | 'duplicate' | 'held';
  status: 'Submitted' | 'Shortlisted' | 'Interview' | 'Offered' | 'Placed' | 'Rejected' | 'Not accepted';
}
export const VENDOR_SUBMISSIONS: VendorSubmission[] = [
  { id: 'V-501', candidate: 'Manoj Kumar', jobId: 'J-2302', job: 'Warehouse Associate', rate: 175, submittedOn: d(2026, 9, 8), dup: 'unique', status: 'Placed' },
  { id: 'V-507', candidate: 'Salma Begum', jobId: 'J-2302', job: 'Warehouse Associate', rate: 180, submittedOn: d(2026, 9, 21), dup: 'unique', status: 'Interview' },
  { id: 'V-509', candidate: 'Vignesh Pandian', jobId: 'J-2302', job: 'Warehouse Associate', rate: 170, submittedOn: d(2026, 9, 24), dup: 'duplicate', status: 'Not accepted' },
  { id: 'V-512', candidate: 'Aarav Mehta', jobId: 'J-2317', job: 'SAP FICO Consultant', rate: 880, submittedOn: d(2026, 9, 27), dup: 'unique', status: 'Submitted' },
  { id: 'V-498', candidate: 'Nandini Gowda', jobId: 'J-2288', job: 'Forklift Operator', rate: 195, submittedOn: d(2026, 9, 2), dup: 'unique', status: 'Rejected' },
];

export const VENDOR_SCORECARD = [
  { label: 'Submissions (90 days)', value: '41' },
  { label: 'Duplicate rate', value: '7%' },
  { label: 'Submission → interview', value: '38%' },
  { label: 'Interview → offer', value: '29%' },
  { label: 'Placements', value: '6' },
  { label: 'Time to first submission', value: '1.8 days' },
  { label: 'Early exits (90 days)', value: '1' },
  { label: 'Rate-cap exceptions', value: '2' },
  { label: 'Invoice disputes', value: '0' },
  { label: 'Documents valid', value: '100%' },
];

/* ------------------------------------------------------------------ T9-13 Contract-labour vendor */

export const CONTRACTOR = { name: 'Sri Lakshmi Manpower Services', contact: 'Ganesh Moorthy', email: 'ganesh@srilakshmimanpower.in', contractEnds: d(2027, 3, 31) };

export interface ClEstablishment {
  id: string;
  name: string;
  licenceNo: string;
  authority: string;
  maxWorkers: number;
  deployed: number;
  validTo: Date;
  nature: string;
}
export const CL_ESTABLISHMENTS: ClEstablishment[] = [
  { id: 'hsr', name: 'Hosur plant · packing', licenceNo: 'TN/CLRA/HSR/2025/0441', authority: 'Assistant Commissioner of Labour, Hosur', maxWorkers: 50, deployed: 48, validTo: d(2026, 11, 20), nature: 'Packing and loading' },
  { id: 'hsr-hk', name: 'Hosur plant · housekeeping', licenceNo: 'TN/CLRA/HSR/2025/0442', authority: 'Assistant Commissioner of Labour, Hosur', maxWorkers: 20, deployed: 14, validTo: d(2027, 4, 30), nature: 'Housekeeping' },
  { id: 'maa', name: 'Chennai office · facility', licenceNo: 'TN/CLRA/CHN/2026/0107', authority: 'Deputy Commissioner of Labour, Chennai', maxWorkers: 10, deployed: 6, validTo: d(2026, 10, 6), nature: 'Facility services' },
];

export interface ClWorker {
  id: string;
  name: string;
  idMasked: string;
  dob: Date;
  gender: 'Male' | 'Female' | 'Other';
  uan: string;
  esic: string;
  skill: 'Unskilled' | 'Semi-skilled' | 'Skilled';
  wage: number;
  site: string;
  from: Date;
  gatePass: string;
  gateValidTo: Date;
}
export const CL_WORKERS: ClWorker[] = [
  { id: 'w1', name: 'Murugan Selvam', idMasked: 'Aadhaar XXXX XXXX 4417', dob: d(1990, 4, 12), gender: 'Male', uan: '101922344871', esic: '5102338841', skill: 'Semi-skilled', wage: 612, site: 'Hosur plant · packing', from: d(2025, 12, 1), gatePass: 'GP-HSR-0931', gateValidTo: d(2026, 12, 31) },
  { id: 'w2', name: 'Lakshmi Devi', idMasked: 'Aadhaar XXXX XXXX 0921', dob: d(1995, 7, 30), gender: 'Female', uan: '101922344902', esic: '5102338877', skill: 'Unskilled', wage: 568, site: 'Hosur plant · packing', from: d(2026, 1, 15), gatePass: 'GP-HSR-0944', gateValidTo: d(2026, 12, 31) },
  { id: 'w3', name: 'Siddharth Naik', idMasked: 'Voter ID XXXXXX2210', dob: d(1987, 1, 5), gender: 'Male', uan: '101922345013', esic: '5102338902', skill: 'Skilled', wage: 698, site: 'Hosur plant · packing', from: d(2025, 11, 3), gatePass: 'GP-HSR-0902', gateValidTo: d(2026, 10, 15) },
  { id: 'w4', name: 'Chitra Arumugam', idMasked: 'Aadhaar XXXX XXXX 7710', dob: d(1999, 11, 22), gender: 'Female', uan: 'Not linked', esic: '5102339011', skill: 'Unskilled', wage: 568, site: 'Hosur plant · housekeeping', from: d(2026, 9, 1), gatePass: 'GP-HSR-1011', gateValidTo: d(2026, 12, 31) },
];

export type PackItemState = 'pending' | 'verified' | 'discrepancy' | 'missing';
export const CL_PACK = {
  establishment: 'Hosur plant · packing',
  month: 'August 2026',
  due: d(2026, 9, 15),
  status: 'discrepancy' as 'open' | 'submitted' | 'verified' | 'discrepancy' | 'overdue',
  items: [
    { id: 'ecr', label: 'PF ECR and challan (TRRN)', state: 'discrepancy' as PackItemState, note: 'Challan covers 40 workers; 52 had site attendance in August. Short challan.' },
    { id: 'esi', label: 'ESI challan', state: 'verified' as PackItemState },
    { id: 'wage', label: 'Wage register (Form XVII)', state: 'verified' as PackItemState },
    { id: 'proof', label: 'Wage payment proof (bank statement)', state: 'pending' as PackItemState },
    { id: 'pt', label: 'Professional tax challan', state: 'verified' as PackItemState },
    { id: 'muster', label: 'Muster roll (Form XVI)', state: 'missing' as PackItemState },
  ],
  checks: [
    { label: 'Challan period and establishment code match', ok: true },
    { label: 'Workers covered ≥ workers on site (40 of 52)', ok: false },
    { label: 'Wages at or above Tamil Nadu minimum wage', ok: true },
    { label: 'Days paid ≥ days on site', ok: true },
  ],
};

export const CL_BILLS = [
  { no: 'SLMS/2026/088', month: 'August 2026', amount: 8_46_200, tds: 16_924, status: 'On hold' as const, reason: 'August pack has a discrepancy' },
  { no: 'SLMS/2026/079', month: 'July 2026', amount: 8_12_400, tds: 16_248, status: 'Paid' as const, reason: 'Paid 18 Aug 2026' },
  { no: 'SLMS/2026/071', month: 'June 2026', amount: 7_98_900, tds: 15_978, status: 'Paid' as const, reason: 'Paid 17 Jul 2026' },
];

/* ------------------------------------------------------------------ T9-14 Visitor invite */

export const VISIT = {
  visitor: 'Anand Kumar',
  mobile: '9845012345',
  company: 'Deccan Packaging Industries',
  purpose: 'Supplier audit of packing line 2',
  host: 'Divya',
  location: 'Hosur plant',
  address: 'SIPCOT Phase II, Hosur 635109',
  window: { from: d(2026, 9, 30, 10, 0), to: d(2026, 9, 30, 13, 0) },
  passCode: 'KF-VIS-30SEP-0417',
  rules: { idRequired: true, photoRequired: true, safetyInduction: true, nda: true, escort: true, hours: '9:00 am to 6:00 pm' },
};
