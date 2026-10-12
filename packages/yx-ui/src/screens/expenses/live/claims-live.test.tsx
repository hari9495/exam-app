import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClaimScreen, ExpensesHomeScreen, type ClaimScreenProps } from './claims';
import type { ClaimDetail, ClaimLine, ExpenseCategory } from './types';

// Expenses batch E2 screens (M05-BUILD-DESIGN §8, §9; EXP-01, EXP-02, EXP-03; XP-2.09).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const cat = (code: string, name: string, o: Partial<ExpenseCategory> = {}): ExpenseCategory => ({ id: `c-${code}`, code, name, kind: 'spend', receiptAbove: '500', gstEligible: true, itcBlockedReason: null, taxable: 'never', ledgerCode: '6100', active: true, version: 1, ...o });
const CATS = [cat('lodging', 'Hotel and lodging'), cat('meals', 'Meals'), cat('mileage', 'Mileage (own vehicle)', { kind: 'mileage', receiptAbove: null, gstEligible: false })];
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
  justification: null,
  policy: { outcome: 'ok', overBy: '0.00', limit: null, receipt: 'required', policy: 'Standard' },
  flags: [],
  mileage: null,
  perDiem: null,
  ocr: null,
  gst: { supplierGstin: null, invoiceNo: null, invoiceDate: null, placeOfSupply: null, taxableValue: null, cgst: null, sgst: null, igst: null, cess: null, billedToGstin: null, itcStatus: 'not_applicable', einvoiceVerified: false },
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
  claimedTotal: '5900.00',
  approvedTotal: null,
  advanceAdjusted: '0.00',
  netPayable: '5900.00',
  risk: 'none',
  submittedAt: null,
  decidedAt: null,
  version: 3,
  decisionNote: null,
  lines: [line()],
  changes: [],
  flags: [],
  route: null,
  can: { edit: true, withdraw: false, decide: false, changeAmounts: false, review: false },
  ...o,
});
const props = (o: Partial<ClaimScreenProps> = {}): ClaimScreenProps => ({
  state: 'ready',
  claim: claim(),
  categories: CATS,
  today: '2026-10-12',
  onBack: vi.fn(),
  onUploadReceipt: vi.fn(async () => ({})),
  onSaveLine: vi.fn(async () => ({})),
  onRemoveLine: vi.fn(async () => ({})),
  onSubmit: vi.fn(async () => ({})),
  onWithdraw: vi.fn(async () => ({})),
  onApproveAmount: vi.fn(async () => ({})),
  onDecide: vi.fn(async () => ({})),
  onFlag: vi.fn(async () => ({})),
  onOpenReceipt: vi.fn(async () => ({})),
  ...o,
});

describe('Expenses home (EXP-01)', () => {
  it('leads with what the person will receive, and shows claims waiting for them', async () => {
    const onOpen = vi.fn();
    render(<ExpensesHomeScreen state="ready" home={{ claims: [claim({ status: 'approved', paymentStatus: 'approved_unpaid', netPayable: '5714.00' })], waitingForMe: 1, toReview: null, toReceive: '5714.00' }} approvals={[claim({ id: 'c9', person: 'Sita Rao', status: 'submitted' })]} review={null} onNew={vi.fn()} onOpen={onOpen} />);
    expect(screen.getByText('You will receive ₹5,714.00 from claims approved but not yet paid.')).toBeInTheDocument();
    expect(screen.getByText('Waiting for payment')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Waiting for me (1)' }));
    expect(screen.getByText('Sita Rao')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledWith('c9');
  });
});

describe('Claim composer (EXP-02)', () => {
  it('a line read from a receipt asks to be checked; low-confidence fields are named; saving confirms it', async () => {
    const onSaveLine = vi.fn(async () => ({}));
    const read = line({ ocr: { adapter: 'dev-fake', confirmed: false, lowConfidence: ['merchant'], einvoice: null, fields: { amount: { value: '5900.00', confidence: 0.94 }, merchant: { value: 'Hotel Sea View', confidence: 0.6 } } } });
    render(<ClaimScreen {...props({ claim: claim({ lines: [read] }), onSaveLine })} />);
    expect(screen.getByText('Please check the merchant: not read clearly.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Check and confirm' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Please check: read with low confidence')).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Confirm' }));
    expect(onSaveLine).toHaveBeenCalledWith('l1', expect.objectContaining({ categoryCode: 'lodging', amount: '5900', merchant: 'Hotel Sea View', version: 1 }));
  });

  it('mileage asks for the distance, never an amount; what is missing shows after Save', async () => {
    const onSaveLine = vi.fn(async () => ({}));
    render(<ClaimScreen {...props({ onSaveLine })} />);
    await ue.click(screen.getByRole('button', { name: 'Add without a receipt' }));
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('combobox', { name: 'What is it for' }));
    await ue.click(screen.getByRole('option', { name: 'Mileage (own vehicle)' }));
    expect(within(sheet).queryByRole('textbox', { name: /Amount/ })).not.toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(onSaveLine).not.toHaveBeenCalled();
    expect(within(sheet).getAllByText('Enter the distance in km.').length).toBeGreaterThan(0);
  });

  it('sending lists every blocker the API found', async () => {
    const onSubmit = vi.fn(async () => {
      throw Object.assign(new Error('Line 1: a receipt is needed above 500.00.'), { body: { blockers: [{ text: 'Line 1: a receipt is needed above 500.00.' }, { text: 'Line 2: over the limit by 900.00; say why.' }] } });
    });
    render(<ClaimScreen {...props({ onSubmit })} />);
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(await screen.findByText('Line 2: over the limit by 900.00; say why.')).toBeInTheDocument();
  });
});

describe('Claim review (EXP-03)', () => {
  const review = claim({ status: 'submitted', person: 'Ravi Kumar', route: { status: 'pending', currentStep: 0, steps: [{ name: 'Manager', state: 'open' }, { name: 'Finance check', state: 'waiting' }] }, can: { edit: false, withdraw: false, decide: true, changeAmounts: true, review: true }, flags: [{ id: 'f1', lineId: 'l1', kind: 'over_limit', detail: 'Line 1 is 900.00 over the per line limit.', status: 'open', note: null }] });

  it('approving less needs a reason; the employee sees "approved X of Y"', async () => {
    const onApproveAmount = vi.fn(async () => ({}));
    render(<ClaimScreen {...props({ claim: review, onApproveAmount })} />);
    await ue.click(screen.getByRole('button', { name: 'Approve less' }));
    const dlg = screen.getByRole('dialog');
    const amount = within(dlg).getByRole('textbox', { name: /Approve/ });
    await ue.clear(amount);
    await ue.type(amount, '5000');
    expect(within(dlg).getByRole('button', { name: 'Save amount' })).toBeDisabled();
    await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'Hotel cap Tier 1');
    await ue.click(within(dlg).getByRole('button', { name: 'Save amount' }));
    expect(onApproveAmount).toHaveBeenCalledWith('l1', '5000.00', 'Hotel cap Tier 1');
    const { unmount } = render(<ClaimScreen {...props({ claim: claim({ status: 'partly_approved', lines: [line({ approved: '5000.00', reduceReason: 'Hotel cap Tier 1' })], can: { edit: false, withdraw: false, decide: false, changeAmounts: false, review: false } }) })} />);
    expect(screen.getByText('Approved ₹5,000.00 of ₹5,900.00')).toBeInTheDocument();
    unmount();
  });

  it('sending back needs a note; finance clears a flag with a note', async () => {
    const onDecide = vi.fn(async () => ({}));
    const onFlag = vi.fn(async () => ({}));
    render(<ClaimScreen {...props({ claim: review, onDecide, onFlag })} />);
    expect(screen.getByText('Manager')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send back' }));
    let dlg = screen.getByRole('dialog');
    expect(within(dlg).getByRole('button', { name: 'Send back' })).toBeDisabled();
    await ue.type(within(dlg).getByRole('textbox'), 'Add the hotel bill');
    await ue.click(within(dlg).getByRole('button', { name: 'Send back' }));
    expect(onDecide).toHaveBeenCalledWith('send_back', 'Add the hotel bill');
    await ue.click(screen.getByRole('button', { name: 'Clear' }));
    dlg = screen.getByRole('dialog');
    await ue.type(within(dlg).getByRole('textbox'), 'Client venue, agreed');
    await ue.click(within(dlg).getByRole('button', { name: 'Clear flag' }));
    expect(onFlag).toHaveBeenCalledWith('f1', 'clear', 'Client venue, agreed');
  });
});

describe('Other currencies and field days (E5)', () => {
  it('a bill in another currency sends its own amount and the card rate, never a typed pay amount', async () => {
    const onSaveLine = vi.fn(async () => ({}));
    render(<ClaimScreen {...props({ claim: claim({ lines: [line({ ocr: null })] }), onSaveLine })} />);
    await ue.click(screen.getByRole('button', { name: 'Edit' }));
    const sheet = screen.getByRole('dialog');
    const cur = within(sheet).getByRole('textbox', { name: /Currency of the bill/ });
    await ue.clear(cur);
    await ue.type(cur, 'aed');
    const amount = within(sheet).getByRole('textbox', { name: /Amount \(AED\)/ });
    await ue.clear(amount);
    await ue.type(amount, '300');
    await ue.type(within(sheet).getByRole('textbox', { name: /Rate on your card/ }), '23.66');
    await ue.click(within(sheet).getByRole('button', { name: 'Save' }));
    const sent = (onSaveLine.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(sent.fx).toEqual({ currency: 'AED', amount: '300', rate: '23.66' });
    expect(sent.amount).toBeUndefined();
  });

  it('a card rate shows how far it is from the company rate and asks for the statement; a field-day draft asks to be confirmed', () => {
    render(<ClaimScreen {...props({ onUploadFxProof: vi.fn(async () => ({})), claim: claim({ lines: [line({ ocr: null, fx: { currency: 'AED', amount: '300.00', rate: '23.66000000', source: 'manual', rateDate: '2026-10-07', variancePct: '4.00', hasProof: false } }), line({ id: 'l2', lineNo: 2, ocr: null, origin: 'field_day', confirmed: false })] }) })} />);
    expect(screen.getByText('Rate 4.00 % from the company rate')).toBeInTheDocument();
    expect(screen.getByText('Statement needed for the rate')).toBeInTheDocument();
    expect(screen.getByLabelText('Add the statement for the rate on line 1')).toBeInTheDocument();
    expect(screen.getByText('From your field day')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Check and confirm' })).toHaveLength(1);
  });
});
