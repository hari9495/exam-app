import type { ExpenseJournalView, ToPayData } from './types';

// Sample data for the To pay screen (stories and tests).
export const TO_PAY: ToPayData = {
  entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' }],
  claims: [
    { id: 'c1', employeeId: 'p1', employeeName: 'Arjun Kulkarni', legalEntityId: 'e1', title: 'Client visit, Mysuru', approvedTotal: '1114.00', advanceAdjusted: '0.00', netPayable: '1114.00', route: 'payout', paymentStatus: 'approved_unpaid', payMonth: null, ref: null, reason: null, batchId: null, paidOn: null },
    { id: 'c2', employeeId: 'p2', employeeName: 'Divya Raghunathan', legalEntityId: 'e1', title: 'Dealer meet', approvedTotal: '6200.00', advanceAdjusted: '2000.00', netPayable: '4200.00', route: 'payout', paymentStatus: 'payment_failed', payMonth: null, ref: null, reason: 'Account closed', batchId: 'b0', paidOn: null },
    { id: 'c3', employeeId: 'p3', employeeName: 'Sridhar Fernandes', legalEntityId: 'e1', title: 'Field days, September', approvedTotal: '2856.00', advanceAdjusted: '0.00', netPayable: '2856.00', route: 'payroll', paymentStatus: 'in_payroll', payMonth: '2026-10', ref: null, reason: null, batchId: null, paidOn: null },
    { id: 'c4', employeeId: 'p1', employeeName: 'Arjun Kulkarni', legalEntityId: 'e1', title: 'Training, Pune', approvedTotal: '3400.00', advanceAdjusted: '0.00', netPayable: '3400.00', route: 'payout', paymentStatus: 'payout_queued', payMonth: null, ref: null, reason: null, batchId: 'b1', paidOn: null },
    { id: 'c5', employeeId: 'p2', employeeName: 'Divya Raghunathan', legalEntityId: 'e1', title: 'Phone, September', approvedTotal: '400.00', advanceAdjusted: '0.00', netPayable: '400.00', route: 'payout', paymentStatus: 'payout_queued', payMonth: null, ref: null, reason: null, batchId: 'b2', paidOn: null },
  ],
  batches: [
    { id: 'b1', legalEntityId: 'e1', rows: 1, total: '3400.00', status: 'draft', sha256: 'a'.repeat(64), madeByMe: false, createdAt: '2026-10-11T10:00:00Z', releasedAt: null },
    { id: 'b2', legalEntityId: 'e1', rows: 1, total: '400.00', status: 'released', sha256: 'b'.repeat(64), madeByMe: true, createdAt: '2026-10-10T10:00:00Z', releasedAt: '2026-10-10T12:00:00Z' },
  ],
};

export const JOURNAL: ExpenseJournalView = {
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
