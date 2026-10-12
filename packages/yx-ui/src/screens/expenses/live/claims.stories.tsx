import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClaimScreen, ExpensesHomeScreen, type ClaimScreenProps } from './claims';
import type { ClaimDetail, ClaimLine, ExpenseCategory } from './types';

// Expenses claims, wired (batch E2). In the affordance guard set ('screens-expenses-live').
const meta: Meta = { title: 'Screens/Expenses/Live · Claims', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const cat = (code: string, name: string, o: Partial<ExpenseCategory> = {}): ExpenseCategory => ({ id: `c-${code}`, code, name, kind: 'spend', receiptAbove: '500', gstEligible: true, itcBlockedReason: null, taxable: 'never', ledgerCode: '6100', active: true, version: 1, ...o });
const line = (o: Partial<ClaimLine> = {}): ClaimLine => ({
  id: 'l1',
  lineNo: 1,
  categoryCode: 'lodging',
  spentOn: '2026-10-09',
  merchant: 'Hotel Sea View',
  city: 'Mumbai',
  country: 'IN',
  tierId: 't1',
  payMode: 'personal',
  description: null,
  hasReceipt: true,
  selfDeclared: false,
  claimed: '5900.00',
  approved: null,
  reduceReason: null,
  justification: 'Client asked us to stay at the venue',
  policy: { outcome: 'over_justify', overBy: '900.00', limit: { kind: 'per_line', amount: '5000.00' }, receipt: 'required', policy: 'Standard' },
  flags: [],
  mileage: null,
  perDiem: null,
  ocr: { adapter: 'dev-fake', confirmed: false, lowConfidence: ['merchant'], einvoice: null, fields: { amount: { value: '5900.00', confidence: 0.94 }, merchant: { value: 'Hotel Sea View', confidence: 0.6 } } },
  gst: { supplierGstin: '27BBBBB2222B1Z5', invoiceNo: 'SV-1182', invoiceDate: null, placeOfSupply: null, taxableValue: '5000.00', cgst: '450.00', sgst: '450.00', igst: null, cess: null, billedToGstin: null, itcStatus: 'eligible', einvoiceVerified: false },
  version: 1,
  ...o,
});
const claim = (o: Partial<ClaimDetail> = {}): ClaimDetail => ({
  id: 'c1',
  title: 'Mumbai client visit',
  person: 'Ravi Kumar',
  currency: 'INR',
  status: 'draft',
  paymentStatus: 'not_due',
  claimedTotal: '6614.00',
  approvedTotal: null,
  advanceAdjusted: '0.00',
  netPayable: '6614.00',
  risk: 'none',
  submittedAt: null,
  decidedAt: null,
  version: 3,
  decisionNote: null,
  lines: [line(), line({ id: 'l2', lineNo: 2, categoryCode: 'mileage', merchant: null, hasReceipt: false, claimed: '714.00', policy: { outcome: 'ok', overBy: '0.00', limit: null, receipt: 'none', policy: 'Standard' }, ocr: null, gst: null, mileage: { vehicle: 'car', km: 42, from: 'Office', to: 'Client', ratePerKm: '17.00' } })],
  changes: [],
  flags: [],
  route: null,
  can: { edit: true, withdraw: false, decide: false, changeAmounts: false, review: false },
  ...o,
});
const BASE: ClaimScreenProps = {
  state: 'ready',
  claim: claim(),
  categories: [cat('lodging', 'Hotel and lodging'), cat('mileage', 'Mileage (own vehicle)', { kind: 'mileage', receiptAbove: null, gstEligible: false })],
  today: '2026-10-12',
  onBack: () => undefined,
  onUploadReceipt: ok,
  onSaveLine: ok,
  onRemoveLine: ok,
  onSubmit: ok,
  onWithdraw: ok,
  onApproveAmount: ok,
  onDecide: ok,
  onFlag: ok,
  onOpenReceipt: ok,
};

export const Home: S = { name: 'Home', render: () => <ExpensesHomeScreen state="ready" home={{ claims: [claim({ status: 'approved', paymentStatus: 'approved_unpaid', netPayable: '5714.00' })], waitingForMe: 2, toReview: 1, toReceive: '5714.00' }} approvals={[]} review={[]} onNew={ok} onOpen={() => undefined} /> };
export const Composer: S = { name: 'Composer (a read receipt to confirm)', render: () => <ClaimScreen {...BASE} /> };
export const Review: S = {
  name: 'Review (approver and finance)',
  render: () => (
    <ClaimScreen
      {...BASE}
      claim={claim({ status: 'submitted', lines: [line({ ocr: { adapter: 'dev-fake', confirmed: true, lowConfidence: [], einvoice: 'verified', fields: {} } })], route: { status: 'pending', currentStep: 0, steps: [{ name: 'Manager', state: 'open' }, { name: 'Over the limit', state: 'waiting' }, { name: 'Finance check', state: 'waiting' }] }, flags: [{ id: 'f1', lineId: 'l1', kind: 'over_limit', detail: 'Line 1 is 900.00 over the per line limit.', status: 'open', note: null }], can: { edit: false, withdraw: false, decide: true, changeAmounts: true, review: true } })}
    />
  ),
};
