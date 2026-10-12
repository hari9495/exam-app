import type { SetupEntity } from './types-5b';
import type { AdvisoryView, CertificateRow, Disbursement, LoanView, MyDeclarations, PaymentModeRow, PayslipQueryView, ProofQueueLine, RegisterRow } from './types-ops';

// Sample data for the payroll operations screens (stories and tests). People are the 5j fixtures' p1 … p3.

export const ENTITIES: SetupEntity[] = [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' } as SetupEntity];

export const DISBURSEMENTS: Disbursement[] = [{ payslipId: 's3', employeeId: 'p3', mode: 'cash', net: '34240.00', held: false, paymentStatus: 'pending', chequeNo: null, paidOn: null, acknowledgement: null }];

export const MODES: PaymentModeRow[] = [
  { id: 'm1', employeeId: 'p3', mode: 'cash', validFrom: '2026-09-01', reason: 'No bank account at the plant yet', status: 'approved', requestId: 'w1' },
  { id: 'm2', employeeId: 'p2', mode: 'cheque', validFrom: '2026-10-01', reason: 'Account frozen by the bank', status: 'pending', requestId: 'w2' },
];

export const LOANS: LoanView[] = [
  { id: 'l1', employeeId: 'p1', loanType: 'advance', principal: '30000.00', emi: '10000.00', outstanding: '20000.00', firstMonth: '2026-09', status: 'active', pausedUntil: null, mine: false },
  { id: 'l2', employeeId: 'p2', loanType: 'loan', principal: '200000.00', emi: '8500.00', outstanding: '200000.00', firstMonth: '2026-11', status: 'requested', pausedUntil: null, mine: false },
  { id: 'l3', employeeId: 'p9', loanType: 'advance', principal: '15000.00', emi: '5000.00', outstanding: '5000.00', firstMonth: '2026-08', status: 'active', pausedUntil: null, mine: true },
];

export const QUERIES: PayslipQueryView[] = [
  {
    id: 'q1',
    payslipId: 's1',
    employeeId: 'p1',
    lineCode: 'hra',
    text: 'My HRA is lower than last month. Did something change?',
    status: 'open',
    assigneeUserId: null,
    replies: [],
    createdAt: '2026-10-05T09:12:00Z',
    updatedAt: '2026-10-05T09:12:00Z',
    mine: false,
  },
  {
    id: 'q2',
    payslipId: 's2',
    employeeId: 'p2',
    lineCode: null,
    text: 'Why was professional tax taken twice?',
    status: 'answered',
    assigneeUserId: null,
    replies: [{ by: 'u1', byName: 'Meera (Payroll)', side: 'payroll', at: '2026-10-06T11:00:00Z', text: 'February carries the extra ₹100 under Karnataka rules; it is not twice.' }],
    createdAt: '2026-10-05T10:00:00Z',
    updatedAt: '2026-10-06T11:00:00Z',
    mine: false,
  },
];

export const DECLARATIONS: MyDeclarations = {
  taxYear: '2026-27',
  form: 'Form 12BB successor (verify number)',
  proofCutoff: '2099-01-31',
  subjects: [
    { key: 'hra', section: null },
    { key: 'sec80c', section: '123' },
    { key: 'sec80d_self', section: '126' },
    { key: 'sec24b', section: '22' },
  ],
  lines: [
    { id: 'd1', subjectKey: 'hra', amount: '240000.00', landlordName: 'S. Rao', landlordPan: '••••••234K', rentFrom: '2026-04', rentTo: '2027-03', metro: false, proofStatus: 'pending', approvedAmount: null, comment: null, proofs: [{ n: 0, name: 'rent-receipts.pdf', size: 120000, at: '2026-10-01T10:00:00Z' }], section: null },
    { id: 'd2', subjectKey: 'sec80c', amount: '150000.00', landlordName: null, landlordPan: null, rentFrom: null, rentTo: null, metro: null, proofStatus: 'rejected', approvedAmount: null, comment: 'The ELSS statement is for last year. Send this year’s.', proofs: [{ n: 0, name: 'elss.pdf', size: 80000, at: '2026-10-01T10:00:00Z' }], section: '123' },
  ],
};

export const PROOFS: ProofQueueLine[] = DECLARATIONS.lines.map((l, i) => ({ ...l, proofStatus: 'pending', comment: null, workspaceId: 'w1', employeeId: i ? 'p2' : 'p1', employeeName: i ? 'Divya' : 'Arjun' }));

export const REGISTERS: RegisterRow[] = [
  { id: 'rg1', registerType: 'wages', month: '2026-09', locationId: null, formatVersion: '2026.1', version: 1, status: 'frozen', reason: null, rows: 3, sha256: 'a'.repeat(64), signatureRef: null, frozenAt: '2026-10-07T10:00:00Z', signedAt: null },
  { id: 'rg2', registerType: 'deductions', month: '2026-09', locationId: null, formatVersion: '2026.1', version: 1, status: 'generated', reason: null, rows: 3, sha256: 'b'.repeat(64), signatureRef: null, frozenAt: null, signedAt: null },
  { id: 'rg3', registerType: 'overtime', month: '2026-09', locationId: null, formatVersion: '2026.1', version: 2, status: 'signed', reason: 'Late OT approval', rows: 1, sha256: 'c'.repeat(64), signatureRef: 'CCA #12', frozenAt: '2026-10-07T10:00:00Z', signedAt: '2026-10-08T10:00:00Z' },
];

export const ADVISORIES: AdvisoryView[] = [
  {
    code: 'KA-MW-2026',
    jurisdiction: 'IN-KA',
    version: 1,
    title: 'Karnataka minimum wages revised',
    summary: 'The variable dearness allowance changes from 1 October 2026 for most scheduled employments.',
    action: 'Check that every Karnataka salary is at or above the new minimum before the October run.',
    link: 'https://labour.karnataka.gov.in/',
    effectiveFrom: '2026-10-01',
    verify: true,
    reviewed: null,
  },
  { code: 'IN-ECR-2', jurisdiction: 'IN', version: 1, title: 'New ECR file columns', summary: 'EPFO adds two columns to the ECR text file.', action: 'Nothing to do: YukthiX makes the new format.', link: null, effectiveFrom: '2026-09-01', verify: false, reviewed: { at: '2026-09-03T10:00:00Z', note: 'Checked the September ECR uploaded fine.' } },
];

export const CERTIFICATES: CertificateRow[] = [
  { id: 'c1', employeeId: 'p1', taxYear: '2025-26', form: 'form16', partA: true, issued: false },
  { id: 'c2', employeeId: 'p2', taxYear: '2025-26', form: 'form16', partA: false, issued: false },
  { id: 'c3', employeeId: 'p3', taxYear: '2025-26', form: 'form16', partA: true, issued: true },
];
