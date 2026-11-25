// The API's shapes, filled with the design's fictional people, for the live-state stories and the unit tests.
import type { AdvanceSummary, ClaimDetail, ClaimLine, ClaimSummary, ExpenseCategory, ExpenseHome, TeamClaims, ToPayData, TripSummary } from '../expenses/live/types';

export const CATEGORIES: ExpenseCategory[] = [
  { id: 'k1', code: 'AIR', name: 'Air travel', kind: 'spend', receiptAbove: '0', gstEligible: true, itcBlockedReason: null, taxable: 'never', ledgerCode: null, active: true, version: 1 },
  { id: 'k2', code: 'HOTEL', name: 'Hotel', kind: 'spend', receiptAbove: '0', gstEligible: true, itcBlockedReason: null, taxable: 'never', ledgerCode: null, active: true, version: 1 },
  { id: 'k3', code: 'CAB', name: 'Local cab', kind: 'spend', receiptAbove: '500', gstEligible: false, itcBlockedReason: null, taxable: 'never', ledgerCode: null, active: true, version: 1 },
  { id: 'k4', code: 'MILEAGE', name: 'Mileage', kind: 'mileage', receiptAbove: null, gstEligible: false, itcBlockedReason: null, taxable: 'above_limit', ledgerCode: null, active: true, version: 1 },
  { id: 'k5', code: 'PERDIEM', name: 'Per diem', kind: 'per_diem', receiptAbove: null, gstEligible: false, itcBlockedReason: null, taxable: 'above_limit', ledgerCode: null, active: true, version: 1 },
];

const base: Omit<ClaimLine, 'id' | 'lineNo' | 'categoryCode' | 'claimed'> = {
  spentOn: '2026-09-14', merchant: null, city: 'Mumbai', country: 'IN', tierId: 't1', payMode: 'personal', description: null, hasReceipt: false, selfDeclared: false,
  approved: null, reduceReason: null, justification: null, policy: { outcome: 'ok', overBy: '0.00', limit: null, receipt: 'none', policy: 'Standard' }, flags: [], mileage: null, perDiem: null, ocr: null, gst: null, fx: null, origin: 'employee', confirmed: true, version: 1,
};

export const LINES: ClaimLine[] = [
  { ...base, id: 'l1', lineNo: 1, categoryCode: 'AIR', merchant: 'SkyIndia Airlines', claimed: '6840.00', hasReceipt: true, ocr: { adapter: 'dev-fake', fields: {}, lowConfidence: [], confirmed: true, einvoice: null }, gst: { supplierGstin: '27AABCS1429B1ZB', invoiceNo: 'SI-4471-2026', invoiceDate: null, placeOfSupply: null, taxableValue: '6514.00', cgst: null, sgst: null, igst: '326.00', cess: null, billedToGstin: null, itcStatus: 'eligible', einvoiceVerified: false } },
  { ...base, id: 'l2', lineNo: 2, categoryCode: 'HOTEL', merchant: 'Harbour View Residency', claimed: '9200.00', hasReceipt: true, justification: 'Conference hotel; the cheaper listed hotels were full.', policy: { outcome: 'over_justify', overBy: '1700.00', limit: { kind: 'per_line', amount: '7500.00' }, receipt: 'required', policy: 'Standard' } },
  { ...base, id: 'l3', lineNo: 3, categoryCode: 'CAB', merchant: 'CityRide', spentOn: '2026-09-15', claimed: '640.00', policy: { outcome: 'ok', overBy: '0.00', limit: { kind: 'per_day', amount: '1500.00' }, receipt: 'required', policy: 'Standard' } },
  { ...base, id: 'l4', lineNo: 4, categoryCode: 'PERDIEM', spentOn: '2026-09-15', claimed: '2400.00', perDiem: { fullDays: 2, partialDays: 0, meals: {}, ratePerDay: '1200.00' } },
  { ...base, id: 'l5', lineNo: 5, categoryCode: 'MILEAGE', merchant: 'Home to Bengaluru airport', city: 'Bengaluru', spentOn: '2026-09-16', claimed: '714.00', mileage: { vehicle: 'car', km: 42, from: null, to: null, ratePerKm: '17.00' } },
];

export const DRAFT: ClaimDetail = {
  id: 'c1042', title: 'Mumbai distributor meet', person: 'Vikram Rao', currency: 'INR', status: 'draft', paymentStatus: 'not_due', claimedTotal: '19794.00', approvedTotal: null, advanceAdjusted: '10000.00', netPayable: '9794.00', risk: 'low', tripId: 't0211', submittedAt: null, decidedAt: null, version: 3,
  decisionNote: null, lines: LINES, changes: [], flags: [], route: null, payment: null, can: { own: true, edit: true, withdraw: false, decide: false, changeAmounts: false, review: false },
};

/** A line just read from a receipt, waiting for the person to check it. */
export const READ_LINE: ClaimLine = { ...base, id: 'l6', lineNo: 6, categoryCode: 'HOTEL', merchant: 'Creek Side Hotel', claimed: '4720.00', hasReceipt: true, ocr: { adapter: 'dev-fake', fields: { amount: { value: '4720.00', confidence: 0.92 }, merchant: { value: 'Creek Side Hotel', confidence: 0.55 } }, lowConfidence: ['merchant'], confirmed: false, einvoice: null } };

export const SUBMITTED: ClaimDetail = {
  ...DRAFT, status: 'submitted', submittedAt: '2026-09-17T06:30:00Z', can: { own: false, edit: false, withdraw: false, decide: true, changeAmounts: true, review: false },
  route: { status: 'pending', currentStep: 0, steps: [{ name: 'Manager approval', state: 'open', approvers: ['Sana Nizami'], decidedAt: null }, { name: 'Department head (over-limit excess)', state: 'pending', approvers: [], decidedAt: null }] },
};

export const FINANCE: ClaimDetail = {
  ...SUBMITTED, can: { own: false, edit: false, withdraw: false, decide: false, changeAmounts: false, review: true },
  route: { status: 'pending', currentStep: 1, steps: [{ name: 'Manager approval', state: 'approved', approvers: ['Sana Nizami'], decidedAt: '2026-09-18T05:00:00Z' }, { name: 'Department head (over-limit excess)', state: 'open', approvers: ['Harish Bhat'], decidedAt: null }] },
  flags: [{ id: 'f1', lineId: 'l3', kind: 'look_alike', detail: 'Looks like a bill on claim EXP-1036.', status: 'open', note: null }],
};

const summary = (c: ClaimDetail): ClaimSummary => ({ id: c.id, title: c.title, person: c.person, currency: c.currency, status: c.status, paymentStatus: c.paymentStatus, claimedTotal: c.claimedTotal, approvedTotal: c.approvedTotal, advanceAdjusted: c.advanceAdjusted, netPayable: c.netPayable, risk: c.risk, submittedAt: c.submittedAt, decidedAt: c.decidedAt, version: c.version });

export const HOME: ExpenseHome = {
  claims: [
    { ...summary(SUBMITTED), status: 'submitted' },
    { ...summary(DRAFT), id: 'c1031', title: 'Client visits, Hosur and Krishnagiri', status: 'approved', paymentStatus: 'in_payroll', claimedTotal: '2142.00', approvedTotal: '2142.00', advanceAdjusted: '0.00', netPayable: '2142.00', submittedAt: '2026-09-05T06:00:00Z' },
    { ...summary(DRAFT), id: 'c1019', title: 'Chennai quarterly review', status: 'partly_approved', paymentStatus: 'paid', claimedTotal: '2000.00', approvedTotal: '1200.00', advanceAdjusted: '0.00', netPayable: '1200.00', submittedAt: '2026-08-20T06:00:00Z' },
  ],
  waitingForMe: 1,
  toReview: 1,
  toReceive: '2142.00',
  team: { people: 6, month: '2026-09', spend: '184320.00', previous: '162400.00', trend: ['140200.00', '151900.00', '170300.00', '162400.00', '184320.00'], overLimit: 3, overLimitPrevious: 5 },
  payroll: { cutoffDay: 23, month: '2026-09' },
};

/** Team claims (round 2): a manager with six direct reports, September 2026. */
export const TEAM: TeamClaims = {
  month: '2026-09',
  people: 6,
  claims: [
    { ...summary(SUBMITTED), overLimit: 1, canOpen: true },
    { ...summary(DRAFT), id: 'c1038', title: 'Pune plant audit', person: 'Sana Nizami', status: 'approved', paymentStatus: 'in_payroll', claimedTotal: '8450.00', approvedTotal: '8450.00', netPayable: '8450.00', advanceAdjusted: '0.00', submittedAt: '2026-09-12T05:00:00Z', overLimit: 0, canOpen: true },
    { ...summary(DRAFT), id: 'c1035', title: 'Hyderabad dealer visits', person: 'Arjun Kulkarni', status: 'partly_approved', paymentStatus: 'approved_unpaid', claimedTotal: '12600.00', approvedTotal: '11200.00', netPayable: '11200.00', advanceAdjusted: '0.00', submittedAt: '2026-09-08T05:00:00Z', overLimit: 2, canOpen: true },
    { ...summary(DRAFT), id: 'c1033', title: 'Team offsite supplies', person: 'Meera Iyer', status: 'sent_back', paymentStatus: 'not_due', claimedTotal: '3120.00', approvedTotal: null, netPayable: '3120.00', advanceAdjusted: '0.00', submittedAt: '2026-09-04T05:00:00Z', overLimit: 0, canOpen: false },
  ],
};

export const TRIP_WAITING: TripSummary = { id: 't0219', purpose: 'Dubai trade show', person: 'Sana Nizami', fromOn: '2026-11-02', toOn: '2026-11-06', currency: 'INR', estimate: '145000.00', advanceRequested: '500.00', advanceCurrency: 'USD', bookingNeeded: true, status: 'submitted', version: 1 };
export const OPEN_ADVANCE: AdvanceSummary = { id: 'a0087', kind: 'trip', tripId: 't0211', purpose: 'Mumbai distributor meet', currency: 'INR', requested: '10000.00', amount: '10000.00', changeReason: null, status: 'paid', paidOn: '2026-09-05', settleBy: '2026-10-16', balance: '10000.00', overdue: false, version: 2 };

export const TO_PAY_DATA: ToPayData = {
  entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' }],
  claims: [
    { id: 'c1037', employeeId: 'p2', employeeName: 'Divya Raghunathan', legalEntityId: 'e1', title: 'Plant audit travel', approvedTotal: '1860.00', advanceAdjusted: '0.00', netPayable: '1860.00', route: 'payroll', paymentStatus: 'in_payroll', payMonth: '2026-09', ref: null, reason: null, batchId: null, paidOn: null },
    { id: 'c1029', employeeId: 'p3', employeeName: 'Priya Menon', legalEntityId: 'e1', title: 'Internet, Aug', approvedTotal: '999.00', advanceAdjusted: '0.00', netPayable: '999.00', route: 'payout', paymentStatus: 'payment_failed', payMonth: null, ref: null, reason: 'Account closed', batchId: null, paidOn: null },
    { id: 'c1035', employeeId: 'p4', employeeName: 'Sana Nizami', legalEntityId: 'e1', title: 'Trade fair stall, Pune', approvedTotal: '48500.50', advanceAdjusted: '20000.00', netPayable: '28500.50', route: 'payout', paymentStatus: 'approved_unpaid', payMonth: null, ref: null, reason: null, batchId: null, paidOn: null },
  ],
  batches: [],
};

export const TRIP_DETAIL: import('../expenses/live/types').TripDetail = {
  id: 't0211', purpose: 'Mumbai distributor meet', person: 'Vikram Rao', fromOn: '2026-09-14', toOn: '2026-09-16', currency: 'INR', estimate: '32000.00', advanceRequested: '10000.00', bookingNeeded: false, status: 'approved', version: 4,
  decisionNote: null, closedAt: null, closeReason: null,
  legs: [{ seq: 1, fromCity: 'Bengaluru', toCity: 'Mumbai', country: 'IN', departOn: '2026-09-14', mode: 'air', stayNights: 2 }, { seq: 2, fromCity: 'Mumbai', toCity: 'Bengaluru', country: 'IN', departOn: '2026-09-16', mode: 'air', stayNights: 0 }],
  bookings: [{ id: 'b1', kind: 'ticket', title: 'Mumbai → Bengaluru (air)', amount: '5920.00', paidBy: 'company', provider: null, providerRef: null, hasFile: true }],
  budget: { estimate: '32000.00', companyPaid: '5920.00', claimed: '7000.00', used: '12920.00', left: '19080.00' },
  claims: [{ id: 'c1042', title: 'Mumbai distributor meet', status: 'submitted', claimedTotal: '7000.00', approvedTotal: null, advanceAdjusted: '7000.00' }],
  advance: { ...OPEN_ADVANCE, balance: '3000.00' },
  route: null,
  can: { edit: false, submit: false, cancel: false, book: true, partner: false, decide: null, claim: true, close: false },
};

export const ADVANCE_DETAIL: import('../expenses/live/types').AdvanceDetail = {
  ...OPEN_ADVANCE, id: 'a0061', kind: 'imprest', tripId: null, purpose: 'Imprest, Hosur plant petty expenses', requested: '15000.00', amount: '15000.00', settleBy: '2026-07-31', balance: '6600.00', overdue: true, person: 'Vikram Rao', payCurrency: 'INR',
  policy: { settleDays: 15, recoveryInstalments: 3 },
  ledger: [{ id: 'x1', on: '2026-06-12', kind: 'paid', text: 'Advance paid', amount: '15000.00', amountPay: '15000.00', claimId: null }, { id: 'x2', on: '2026-07-28', kind: 'claim', text: 'Settled by claim: Hosur plant visit', amount: '-8400.00', amountPay: '-8400.00', claimId: 'c0977' }],
  can: { changeAmount: false, decide: null, pay: false, recordReturn: false, claim: true },
};

// EXP-06 to pay and EXP-09 reports (round 2).
export const TO_PAY_FULL: ToPayData = {
  payroll: { cutoffDay: 23, month: '2026-10' },
  entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' }],
  claims: [
    { id: 'c1', employeeId: 'p1', employeeName: 'Arjun Kulkarni', legalEntityId: 'e1', title: 'Client visit, Mysuru', approvedTotal: '1114.00', advanceAdjusted: '0.00', netPayable: '1114.00', route: 'payout', paymentStatus: 'approved_unpaid', payMonth: null, ref: null, reason: null, batchId: null, paidOn: null },
    { id: 'c2', employeeId: 'p2', employeeName: 'Divya Raghunathan', legalEntityId: 'e1', title: 'Dealer meet', approvedTotal: '6200.00', advanceAdjusted: '2000.00', netPayable: '4200.00', route: 'payout', paymentStatus: 'payment_failed', payMonth: null, ref: null, reason: 'Account closed', batchId: 'b0', paidOn: null },
    { id: 'c3', employeeId: 'p3', employeeName: 'Sridhar Fernandes', legalEntityId: 'e1', title: 'Field days, September', approvedTotal: '2856.00', advanceAdjusted: '0.00', netPayable: '2856.00', route: 'payroll', paymentStatus: 'in_payroll', payMonth: '2026-10', ref: null, reason: null, batchId: null, paidOn: null },
    { id: 'c4', employeeId: 'p1', employeeName: 'Arjun Kulkarni', legalEntityId: 'e1', title: 'Training, Pune', approvedTotal: '3400.00', advanceAdjusted: '0.00', netPayable: '3400.00', route: 'payout', paymentStatus: 'payout_queued', payMonth: null, ref: null, reason: null, batchId: 'b1', paidOn: null },
    { id: 'c5', employeeId: 'p2', employeeName: 'Divya Raghunathan', legalEntityId: 'e1', title: 'Phone, September', approvedTotal: '400.00', advanceAdjusted: '0.00', netPayable: '400.00', route: 'payout', paymentStatus: 'payout_queued', payMonth: null, ref: null, reason: null, batchId: 'b2', paidOn: null },
    { id: 'c6', employeeId: 'p4', employeeName: 'Priya Menon', legalEntityId: 'e1', title: 'Internet, Aug', approvedTotal: '999.00', advanceAdjusted: '0.00', netPayable: '999.00', route: 'payout', paymentStatus: 'paid', payMonth: null, ref: 'UTR KFB2608311204', reason: null, batchId: 'b9', paidOn: '2026-09-02' },
  ],
  batches: [
    { id: 'b1', legalEntityId: 'e1', rows: 1, total: '3400.00', status: 'draft', sha256: 'a'.repeat(64), madeByMe: false, createdAt: '2026-10-11T10:00:00Z', releasedAt: null },
    { id: 'b2', legalEntityId: 'e1', rows: 1, total: '400.00', status: 'released', sha256: 'b'.repeat(64), madeByMe: true, createdAt: '2026-10-10T10:00:00Z', releasedAt: '2026-10-10T12:00:00Z' },
  ],
};
export const JOURNAL_VIEW: import('../expenses/live/types').ExpenseJournalView = {
  month: '2026-10',
  lines: [
    { accountCode: '6100', accountName: 'Travel', debit: '7400.00', credit: '0.00' },
    { accountCode: '2400', accountName: 'Reimbursements payable', debit: '3400.00', credit: '7400.00' },
    { accountCode: 'UNMAPPED', accountName: 'Unmapped', debit: '0.00', credit: '3400.00' },
  ],
  unmapped: [{ componentCode: 'exp._bank', amount: '3400.00' }],
  balanced: true,
  exports: [],
};
export const SUMMARY_REPORT: import('../expenses/live/types').ExpenseReport = {
  kind: 'summary', from: '2026-09-01', to: '2026-09-30',
  columns: [{ key: 'category', label: 'Category' }, { key: 'claims', label: 'Claims' }, { key: 'lines', label: 'Bills' }, { key: 'claimed', label: 'Claimed' }, { key: 'approved', label: 'Approved' }],
  rows: [{ category: 'Air travel', claims: 9, lines: 12, claimed: '182400.00', approved: '182400.00' }, { category: 'Hotel', claims: 8, lines: 15, claimed: '151900.00', approved: '146200.50' }, { category: 'Mileage', claims: 21, lines: 40, claimed: '64300.00', approved: '64300.00' }],
  charts: { byCategory: [{ label: 'Air travel', amount: '182400.00' }, { label: 'Hotel', amount: '146200.50' }, { label: 'Mileage', amount: '64300.00' }], paidThrough: [{ label: 'Payroll', amount: '318400.00' }, { label: 'Direct payout', amount: '112600.00' }, { label: 'Company paid', amount: '50700.00' }] },
  departments: [{ id: 'd1', name: 'Sales' }, { id: 'd2', name: 'Operations' }],
};
export const PATTERNS_REPORT: import('../expenses/live/types').ExpenseReport = {
  kind: 'approver-patterns', from: '2026-07-03', to: '2026-09-30',
  columns: [{ key: 'approver', label: 'Approver' }, { key: 'person', label: 'Person' }, { key: 'claims', label: 'Flagged or over-limit claims approved (90 days)' }],
  rows: [{ approver: 'Sana Nizami', person: 'Vikram Rao', claims: 4 }],
  departments: [{ id: 'd1', name: 'Sales' }],
};
