// Fictional expense, trip and advance data (M05). Deterministic.
const d = (day: number, month = 8, year = 2026) => new Date(year, month, day);

export type ApprovalStatus = 'Draft' | 'Submitted' | 'Approved' | 'Partly approved' | 'Rejected' | 'Sent back';
export type PaymentStatus = 'Not due' | 'Approved, unpaid' | 'In October payroll' | 'Paid' | 'Payment failed' | 'Direct payout queued';

export interface ExpenseLine {
  id: string;
  date: Date;
  category: string;
  merchant: string;
  city: string;
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'International';
  amount: number;
  approved?: number;
  reason?: string;
  receipt: boolean;
  ocr?: boolean;
  gst?: { gstin: string; invoice: string; taxable: number; cgst: number; sgst: number; igst: number };
  mode: 'Personal' | 'Company card' | 'Company paid';
  limit?: number;
  hardBlock?: boolean;
  duplicateOf?: string | null;
  kind?: 'receipt' | 'mileage' | 'per-diem' | 'fx' | 'field-draft';
  km?: number;
  rate?: number;
  days?: number;
  fx?: { currency: string; amount: number; rate: number; source: string; rateDate: Date; entered?: number };
  justification?: string;
}

export interface Claim {
  id: string;
  title: string;
  employee: string;
  role: string;
  submitted: Date;
  lines: ExpenseLine[];
  advanceAdjusted: number;
  status: ApprovalStatus;
  payment: PaymentStatus;
  trip?: string;
  route?: 'Next payroll' | 'Direct payout';
  utr?: string;
  flags?: number;
}

export const MUMBAI_LINES: ExpenseLine[] = [
  { id: 'l1', date: d(14), category: 'Air travel', merchant: 'SkyIndia Airlines', city: 'Mumbai', tier: 'Tier 1', amount: 6840, receipt: true, ocr: true, mode: 'Personal', limit: 12000, gst: { gstin: '27AABCS1429B1ZB', invoice: 'SI-4471-2026', taxable: 6514, cgst: 0, sgst: 0, igst: 326 } },
  { id: 'l2', date: d(14), category: 'Hotel', merchant: 'Harbour View Residency', city: 'Mumbai', tier: 'Tier 1', amount: 9200, receipt: true, ocr: true, mode: 'Personal', limit: 7500, justification: 'Conference hotel; the cheaper listed hotels were full.', gst: { gstin: '27AAFCH8842K1Z3', invoice: 'HVR/2026/1180', taxable: 8214, cgst: 493, sgst: 493, igst: 0 } },
  { id: 'l3', date: d(15), category: 'Local cab', merchant: 'CityRide', city: 'Mumbai', tier: 'Tier 1', amount: 640, receipt: false, mode: 'Personal', limit: 1500 },
  { id: 'l4', date: d(15), category: 'Per diem', merchant: '2 days × ₹1,200 (Tier 1)', city: 'Mumbai', tier: 'Tier 1', amount: 2400, receipt: false, mode: 'Personal', kind: 'per-diem', days: 2, rate: 1200 },
  { id: 'l5', date: d(16), category: 'Mileage', merchant: 'Home to Bengaluru airport, car', city: 'Bengaluru', tier: 'Tier 1', amount: 714, receipt: false, mode: 'Personal', kind: 'mileage', km: 42, rate: 17 },
];

export const MY_CLAIMS: Claim[] = [
  { id: 'EXP-1042', title: 'Mumbai distributor meet', employee: 'Vikram Rao', role: 'Area Sales Manager', submitted: d(17), lines: MUMBAI_LINES, advanceAdjusted: 10000, status: 'Submitted', payment: 'Not due', trip: 'TRP-0211', flags: 2 },
  { id: 'EXP-1031', title: 'Client visits, Hosur and Krishnagiri', employee: 'Vikram Rao', role: 'Area Sales Manager', submitted: d(5), lines: [{ id: 'x1', date: d(3), category: 'Mileage', merchant: '126 km, car', city: 'Hosur', tier: 'Tier 3', amount: 2142, approved: 2142, receipt: false, mode: 'Personal', kind: 'mileage', km: 126, rate: 17 }], advanceAdjusted: 0, status: 'Approved', payment: 'In October payroll', route: 'Next payroll' },
  { id: 'EXP-1019', title: 'Chennai quarterly review', employee: 'Vikram Rao', role: 'Area Sales Manager', submitted: d(20, 7), lines: [{ id: 'y1', date: d(18, 7), category: 'Hotel', merchant: 'Marina Stay', city: 'Chennai', tier: 'Tier 1', amount: 2000, approved: 1200, reason: 'hotel cap Tier 2', receipt: true, mode: 'Personal' }], advanceAdjusted: 0, status: 'Partly approved', payment: 'Paid', route: 'Next payroll', utr: 'Paid in Aug 2026 payroll' },
  { id: 'EXP-1008', title: 'Team dinner, festive sales', employee: 'Vikram Rao', role: 'Area Sales Manager', submitted: d(2, 7), lines: [{ id: 'z1', date: d(1, 7), category: 'Client entertainment', merchant: 'Spice Route', city: 'Bengaluru', tier: 'Tier 1', amount: 5600, approved: 0, reason: 'Team meals are not client entertainment', receipt: true, mode: 'Personal' }], advanceAdjusted: 0, status: 'Rejected', payment: 'Not due' },
];

export const TO_PAY: Claim[] = [
  { ...MY_CLAIMS[1] },
  { id: 'EXP-1037', title: 'Plant audit travel', employee: 'Divya Raghunathan', role: 'Senior QA Engineer', submitted: d(12), lines: [{ id: 'p1', date: d(10), category: 'Rail', merchant: 'Rail ticket', city: 'Hosur', tier: 'Tier 3', amount: 1860, approved: 1860, receipt: true, mode: 'Personal' }], advanceAdjusted: 0, status: 'Approved', payment: 'Approved, unpaid' },
  { id: 'EXP-1035', title: 'Trade fair stall, Pune', employee: 'Sana Nizami', role: 'Sales Manager', submitted: d(9), lines: [{ id: 'p2', date: d(6), category: 'Event', merchant: 'Expo Pune', city: 'Pune', tier: 'Tier 1', amount: 48500, approved: 48500, receipt: true, mode: 'Personal' }], advanceAdjusted: 20000, status: 'Approved', payment: 'Approved, unpaid', route: 'Direct payout' },
  { id: 'EXP-1029', title: 'Internet, Aug', employee: 'Priya Menon', role: 'Software Engineer', submitted: d(2), lines: [{ id: 'p3', date: d(31, 7), category: 'Internet', merchant: 'FibreNet', city: 'Bengaluru', tier: 'Tier 1', amount: 999, approved: 999, receipt: true, mode: 'Personal' }], advanceAdjusted: 0, status: 'Approved', payment: 'Payment failed', route: 'Direct payout' },
  { id: 'EXP-1025', title: 'Supplier visit, Mysuru', employee: 'Arjun Kulkarni', role: 'Operations Analyst', submitted: d(28, 7), lines: [{ id: 'p4', date: d(26, 7), category: 'Mileage', merchant: '290 km, car', city: 'Mysuru', tier: 'Tier 2', amount: 4930, approved: 4930, receipt: false, mode: 'Personal' }], advanceAdjusted: 0, status: 'Approved', payment: 'Paid', route: 'Direct payout', utr: 'UTR KFB2608311204' },
];

export const TRIP = {
  id: 'TRP-0211',
  purpose: 'Mumbai distributor meet',
  traveller: 'Vikram Rao',
  from: d(14),
  to: d(16),
  estimate: 32000,
  advance: 10000,
  status: 'Completed' as const,
  legs: [
    { id: 'g1', from: 'Bengaluru', to: 'Mumbai', date: d(14), mode: 'Air', booking: 'Uploaded by employee', companyPaid: false },
    { id: 'g2', from: 'Mumbai', to: 'Bengaluru', date: d(16), mode: 'Air', booking: 'Booked by travel desk, company paid (₹5,920)', companyPaid: true },
  ],
  timeline: [
    { label: 'Requested', at: d(2) },
    { label: 'Approved', at: d(3) },
    { label: 'Advance paid', at: d(5) },
    { label: 'Travelled', at: d(16) },
    { label: 'Claim submitted', at: d(17) },
    { label: 'Settled' },
  ],
};

export const ADVANCE = {
  id: 'ADV-0087',
  purpose: 'Trip TRP-0211 · Mumbai distributor meet',
  issued: d(5),
  amount: 10000,
  windowEnds: d(16, 9),
  ledger: [
    { id: 'a1', date: d(5), text: 'Advance paid (bank transfer, UTR KFB2609051177)', amount: 10000 },
    { id: 'a2', date: d(17), text: 'Adjusted against claim EXP-1042 (awaiting approval)', amount: -10000 },
  ],
};
export const OLD_ADVANCE = {
  id: 'ADV-0061',
  purpose: 'Imprest, Hosur plant petty expenses',
  issued: d(12, 5),
  amount: 15000,
  windowEnds: d(31, 6),
  ledger: [
    { id: 'b1', date: d(12, 5), text: 'Advance paid', amount: 15000 },
    { id: 'b2', date: d(28, 6), text: 'Adjusted against claim EXP-0977', amount: -8400 },
    { id: 'b3', date: d(20, 7), text: 'Reminder sent: settlement window ended 31 Jul', amount: 0 },
  ],
};
export const FOREX_ADVANCE = {
  id: 'ADV-0090',
  purpose: 'Trip TRP-0219 · Dubai trade show (forex card)',
  issued: d(2, 10),
  amount: 500,
  currency: 'USD',
  spent: 420,
  issueRate: 83.1,
  returnRate: 84.25,
  returnedOn: d(30, 10),
};

export const POLICY_MATRIX = {
  categories: ['Hotel (per night)', 'Meals (per day)', 'Local cab (per day)', 'Air travel (per trip)', 'Client entertainment (per line)'],
  grades: ['G1–G3', 'G4–G6', 'G7+'],
  tiers: ['Tier 1', 'Tier 2', 'Tier 3'],
  // [category][grade][tier]
  limits: [
    [[4500, 3500, 2500], [7500, 5500, 4000], [12000, 9000, 6500]],
    [[800, 650, 500], [1200, 1000, 800], [2000, 1600, 1200]],
    [[1000, 700, 500], [1500, 1100, 800], [2500, 1800, 1200]],
    [[8000, 8000, 8000], [12000, 12000, 12000], [0, 0, 0]],
    [[0, 0, 0], [3000, 3000, 3000], [8000, 8000, 8000]],
  ],
};

export const CARD_LINES = [
  { id: 'c1', date: d(14), merchant: 'SKYINDIA AIRLINES BOM', amount: 6840, employee: 'Vikram Rao', match: 'Matched' as const, to: 'EXP-1042 line 1' },
  { id: 'c2', date: d(14), merchant: 'HARBOUR VIEW RESIDENCY', amount: 9200, employee: 'Vikram Rao', match: 'Matched' as const, to: 'EXP-1042 line 2' },
  { id: 'c3', date: d(19), merchant: 'FUELPOINT KORAMANGALA', amount: 2100, employee: 'Vikram Rao', match: 'Suggested' as const, to: 'Mileage 21 Sep? (amount differs)' },
  { id: 'c4', date: d(21), merchant: 'BOOKNOOK MG ROAD', amount: 1450, employee: 'Vikram Rao', match: 'Unmatched' as const, to: '' },
  { id: 'c5', date: d(22), merchant: 'CLOUDSOFT SUBSCRIPTION', amount: 3999, employee: 'Sana Nizami', match: 'Unmatched' as const, to: '' },
  { id: 'c6', date: d(23), merchant: 'SPICE ROUTE', amount: 5600, employee: 'Sana Nizami', match: 'Matched' as const, to: 'EXP-1044 line 3' },
];

export const AGEING = [
  { bucket: '0–30 days', count: 9, amount: 142000 },
  { bucket: '31–60 days', count: 4, amount: 51500 },
  { bucket: '61–90 days', count: 2, amount: 21600 },
  { bucket: 'Over 90 days', count: 1, amount: 6600 },
];
