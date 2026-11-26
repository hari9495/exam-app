import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ClaimComposerScreen, ClaimReviewScreen, ExpensesHomeScreen } from './expenses';
import { claimQuery, parseClaimQuery, type LiveClaim, type LiveHome, type LiveMyClaims } from './expenses-live';
import { approvalSteps, cutText, lineChecks, money, moneyInput, paise, sumMoney, toLineInput } from './expenses-live-data';
import { CATEGORIES, DRAFT, FINANCE, HOME, LINES, OPEN_ADVANCE, READ_LINE, SUBMITTED, TO_PAY_DATA, TRIP_WAITING } from './expenses-live-samples';

// EXP-01 … 03 live (expenses round 1): the designed screens with `live`, positive and negative paths.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const home = (over: Partial<LiveHome> = {}): LiveHome => ({
  state: 'ready', onRetry: vi.fn(), home: { ...HOME, team: null, waitingForMe: 0, toReview: null }, today: '2026-09-20', approvals: null, openAdvance: null, finance: null,
  onNew: vi.fn(async () => ({})), onOpen: vi.fn(), onOpenTrip: vi.fn(), onOpenAdvance: vi.fn(), onRequestTrip: vi.fn(), onGo: vi.fn(), ...over,
});
const claim = (over: Partial<LiveClaim> = {}): LiveClaim => ({
  state: 'ready', onRetry: vi.fn(), claim: DRAFT, categories: CATEGORIES, today: '2026-09-20', onBack: vi.fn(),
  onUploadReceipt: vi.fn(async () => ({})), onSaveLine: vi.fn(async () => ({})), onRemoveLine: vi.fn(async () => ({})), onSubmit: vi.fn(async () => SUBMITTED), onWithdraw: vi.fn(async () => ({})),
  onOpenReceipt: vi.fn(async () => ({})), onApproveAmount: vi.fn(async () => ({})), onDecide: vi.fn(async () => ({})), onFlag: vi.fn(async () => ({})), ...over,
});

describe('live data rules', () => {
  it('money is exact paise: no float sums, negatives and one decimal', () => {
    expect(paise('0.10')).toBe(10);
    expect(paise('-12.5')).toBe(-1250);
    expect(sumMoney(['0.10', '0.20', '0.30'])).toBe('0.60');
    expect(sumMoney(['48500.50', '-20000.00'])).toBe('28500.50');
    expect(sumMoney([])).toBe('0.00');
    expect(moneyInput('7500.5')).toBe('7500.5');
    expect(moneyInput('7500.555')).toBeNull();
    expect(moneyInput('abc')).toBeNull();
    expect(money('AED', '1200')).toBe('AED 1,200.00');
  });
  it('a line says what its policy check and open flags found', () => {
    expect(lineChecks(LINES[1]!, 'INR').map((c) => c.short)).toEqual(['Over limit']);
    expect(lineChecks({ ...LINES[2]!, policy: { ...LINES[2]!.policy!, outcome: 'blocked', limit: { kind: 'per_line', amount: '500.00' } } }, 'INR')[0]).toMatchObject({ tone: 'danger', short: 'Over hard limit' });
    expect(lineChecks(LINES[2]!, 'INR').map((c) => c.short)).toEqual(['No receipt']);
    expect(lineChecks({ ...LINES[2]!, selfDeclared: true }, 'INR')).toEqual([]);
    expect(lineChecks(LINES[2]!, 'INR', FINANCE.flags).map((c) => c.short)).toEqual(['No receipt', 'Looks like another bill']);
  });
  it('a reduced line reads "approved X of Y"; nothing cut reads nothing', () => {
    expect(cutText('INR', '7500.00', '9200.00', 'hotel cap')).toBe('Approved ₹7,500.00 of ₹9,200.00 — hotel cap');
    expect(cutText('INR', '9200.00', '9200.00', null)).toBeNull();
    expect(cutText('INR', null, '9200.00', null)).toBeNull();
  });
  it('a saved line goes back as the same input (mileage keeps distance, never an amount)', () => {
    expect(toLineInput(LINES[4]!)).toMatchObject({ categoryCode: 'MILEAGE', mileage: { vehicle: 'car', km: 42 }, version: 1 });
    expect(toLineInput(LINES[4]!)).not.toHaveProperty('amount');
    expect(toLineInput(LINES[0]!, { justification: 'x' })).toMatchObject({ amount: '6840.00', justification: 'x' });
  });
  it('the approval timeline starts with the submission and names who holds each step', () => {
    expect(approvalSteps(FINANCE).map((s) => [s.label, s.status, s.approver])).toEqual([['Submitted', 'done', 'Vikram Rao'], ['Manager approval', 'done', 'Sana Nizami'], ['Department head (over-limit excess)', 'current', 'Harish Bhat']]);
    expect(approvalSteps(DRAFT)[0]!.status).toBe('current');
  });
});

describe('EXP-01 home', () => {
  it('employee: claims with what they will receive, the open advance and the payroll month', async () => {
    const p = home({ openAdvance: OPEN_ADVANCE });
    show(<ExpensesHomeScreen live={p} />);
    expect(screen.getByText('You will receive')).toBeInTheDocument();
    expect(screen.getByText(/paid in the September 2026 payroll/)).toBeInTheDocument();
    expect(screen.getByText('Approved ₹1,200.00 of ₹2,000.00')).toBeInTheDocument();
    await ue.click(screen.getByRole('link', { name: 'Chennai quarterly review' }));
    expect(p.onOpen).toHaveBeenCalledWith('c1019');
    await ue.click(within(screen.getByText('Open advance').closest('section') ?? document.body).getByRole('button', { name: 'Open' }));
    expect(p.onOpenAdvance).toHaveBeenCalledWith('a0087');
    expect(screen.queryByRole('radiogroup', { name: 'Show' })).toBeNull();
  });
  it('new claim: pressed too early says why and keeps the dialog; a name starts the claim', async () => {
    const p = home();
    show(<ExpensesHomeScreen live={p} />);
    await ue.click(screen.getByRole('button', { name: 'New claim' }));
    await ue.click(screen.getByRole('button', { name: 'Start claim' }));
    expect(await screen.findByText('Say what the claim is for, in at least 2 characters.')).toBeInTheDocument();
    expect(p.onNew).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /What is it for/ }), 'Pune plant visit');
    await ue.click(screen.getByRole('button', { name: 'Start claim' }));
    await waitFor(() => expect(p.onNew).toHaveBeenCalledWith('Pune plant visit', undefined));
  });
  it('first use: no claims yet, and "Snap a receipt" starts a claim that opens on a receipt', async () => {
    const p = home({ home: { ...HOME, claims: [], team: null, waitingForMe: 0, toReview: null } });
    show(<ExpensesHomeScreen live={p} />);
    expect(screen.getByText('No claims yet.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Snap a receipt' }));
    await ue.type(screen.getByRole('textbox', { name: /What is it for/ }), 'Taxi');
    await ue.click(screen.getByRole('button', { name: 'Start claim' }));
    await waitFor(() => expect(p.onNew).toHaveBeenCalledWith('Taxi', 'receipt'));
  });
  it('loading and error with retry', async () => {
    const retry = vi.fn();
    const { rerender } = show(<ExpensesHomeScreen live={home({ state: 'loading', home: null })} />);
    expect(screen.getByRole('status', { name: 'Loading claims' })).toBeInTheDocument();
    rerender(<ToastProvider><ExpensesHomeScreen live={home({ state: 'error', home: null, onRetry: retry })} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: /Retry|Try again/ }));
    expect(retry).toHaveBeenCalled();
  });
  it('an approver switches to what waits for them: claims and trips, and the team figures', async () => {
    const p = home({ home: HOME, approvals: { claims: [{ ...HOME.claims[0]!, person: 'Vikram Rao' }], trips: [TRIP_WAITING], advances: [] } });
    show(<ExpensesHomeScreen live={p} />);
    await ue.click(screen.getByRole('radio', { name: 'Waiting for me' }));
    expect(screen.getByText('Team spend, September 2026')).toBeInTheDocument();
    expect(screen.getByText('Over-limit lines')).toBeInTheDocument();
    expect(screen.getByText(/Dubai trade show/)).toBeInTheDocument();
  });
  it('finance: to pay summed exactly, failed payments, flagged claims and the cut-off line', async () => {
    const p = home({ home: { ...HOME, team: null, waitingForMe: 0 }, finance: { toPay: TO_PAY_DATA, flagged: [{ ...HOME.claims[0]!, risk: 'high' }], advancesOverdue: 2 } });
    show(<ExpensesHomeScreen live={p} />);
    await ue.click(screen.getByRole('radio', { name: 'Finance' }));
    expect(screen.getByText('₹31,359.50')).toBeInTheDocument();
    expect(screen.getByText(/Claims approved by 23 Sept? 2026 are paid in the September 2026 payroll. 1 claim is queued for it./)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Check' }));
    expect(p.onOpen).toHaveBeenCalledWith('c1042');
    await ue.click(screen.getByRole('button', { name: 'Open to-pay queue' }));
    expect(p.onGo).toHaveBeenCalledWith('/yx/expenses/to-pay');
  });
});

// Batch E A4 / A7 (answers 2551, 2553, 2556): who a claim waits on, and the past-claim filters.
describe('EXP-01 batch E: waiting on and past-claim filters', () => {
  const page = (claims = HOME.claims, total = claims.length) => ({ claims, total, page: 1, pageSize: 25 });
  const my = (over: Partial<LiveMyClaims> = {}): LiveMyClaims => ({ filters: [], q: '', page: 1, onChange: vi.fn(), state: 'ready', data: page(), ...over });

  it('each claim tile says who it waits on; none for a claim waiting on no one', () => {
    const claims = [{ ...HOME.claims[0]!, waitingOn: 'Asha Rao and 2 more' }, { ...HOME.claims[1]!, waitingOn: null }];
    show(<ExpensesHomeScreen live={home({ home: { ...HOME, claims, team: null, waitingForMe: 0, toReview: null } })} />);
    expect(screen.getByText('Waiting on Asha Rao and 2 more')).toBeInTheDocument();
    expect(screen.getAllByText(/^Waiting on/)).toHaveLength(1);
  });

  it('filters: adding a Status filter asks for page 1 with it; the list and its pages come from the filtered reply', async () => {
    const onChange = vi.fn();
    show(<ExpensesHomeScreen live={home({ myClaims: my({ onChange, data: page([{ ...HOME.claims[0]!, waitingOn: 'Finance (payment)' }], 60), page: 1 }) })} />);
    expect(screen.getByText('Waiting on Finance (payment)')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Filter' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Status' }));
    // Controlled by the page: the new Status filter goes up with page 1 (the page puts it in the address).
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ page: 1, filters: [expect.objectContaining({ key: 'status', type: 'multi' })] })));
  });

  it('negative: nothing matching says so (not "no claims yet"); an error offers a retry; the query round-trips through the address', () => {
    const a = show(<ExpensesHomeScreen live={home({ myClaims: my({ q: 'zzz', data: page([]) }) })} />);
    expect(screen.getByText('No claims match these filters.')).toBeInTheDocument();
    a.unmount();
    show(<ExpensesHomeScreen live={home({ myClaims: my({ state: 'error', data: null }) })} />);
    expect(screen.getByText("We couldn't load your claims.")).toBeInTheDocument();
    const f = { filters: [{ key: 'status', type: 'multi' as const, values: ['approved', 'rejected'] }, { key: 'sent', type: 'date' as const, from: '2026-09-01', to: null }], q: 'Lunch', page: 2 };
    expect(claimQuery(f)).toBe('?status=approved%2Crejected&sentFrom=2026-09-01&q=Lunch&page=2');
    expect(parseClaimQuery(new URLSearchParams(claimQuery(f).slice(1)))).toEqual(f);
    // Junk in the address is dropped, never sent.
    expect(parseClaimQuery(new URLSearchParams('status=paid,approved&sentFrom=1-1&page=-3&q=x'))).toEqual({ filters: [{ key: 'status', type: 'multi', values: ['approved'] }], q: 'x', page: 1 });
  });
});

describe('EXP-02 composer', () => {
  it('shows each line with its check, and what the person will receive after the advance', () => {
    show(<ClaimComposerScreen live={claim()} />);
    expect(screen.getByText('₹9,794')).toBeInTheDocument();
    expect(screen.getByText(/Over the ₹7,500.00 limit by ₹1,700.00/)).toBeInTheDocument();
    expect(screen.getByText(/42 km × ₹17.00 per km/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit claim' })).toBeEnabled();
  });
  it('submit: the toast names the approver; a refusal lists what to fix', async () => {
    const p = claim();
    show(<ClaimComposerScreen live={p} />);
    await ue.click(screen.getByRole('button', { name: 'Submit claim' }));
    expect(await screen.findByText('Mumbai distributor meet went to Sana Nizami for approval.')).toBeInTheDocument();
    const refused = claim({ onSubmit: vi.fn(async () => Promise.reject(Object.assign(new Error('Fix the lines first.'), { body: { blockers: [{ text: 'Line 2: add why it is over the limit.' }] } }))) });
    show(<ClaimComposerScreen live={refused} />);
    await ue.click(screen.getAllByRole('button', { name: 'Submit claim' })[1]!);
    expect(await screen.findByText('Line 2: add why it is over the limit.')).toBeInTheDocument();
  });
  it('an empty claim cannot be submitted: it says to add a line', async () => {
    const p = claim({ claim: { ...DRAFT, lines: [] } });
    show(<ClaimComposerScreen live={p} />);
    expect(screen.getByText('No lines yet.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Submit claim' }));
    expect((await screen.findAllByText('Add a line first: a receipt, mileage or per diem.')).length).toBeGreaterThan(0);
    expect(p.onSubmit).not.toHaveBeenCalled();
  });
  it('add mileage: pressed too early shows the field error; a distance saves the line', async () => {
    const p = claim();
    show(<ClaimComposerScreen live={{ ...p, startAdd: 'mileage' }} />);
    await ue.click(screen.getByRole('button', { name: 'Add line' }));
    expect((await screen.findAllByText('Enter the distance in km.')).length).toBeGreaterThan(0);
    expect(p.onSaveLine).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Distance/ }), '42');
    await ue.click(screen.getByRole('button', { name: 'Add line' }));
    await waitFor(() => expect(p.onSaveLine).toHaveBeenCalledWith(null, expect.objectContaining({ categoryCode: 'MILEAGE', mileage: { vehicle: 'car', km: 42 } })));
  });
  it('T2-B 66: Save and add another saves the line and opens a fresh form of the same kind', async () => {
    const p = claim();
    show(<ClaimComposerScreen live={{ ...p, startAdd: 'mileage' }} />);
    await ue.type(screen.getByRole('textbox', { name: /Distance/ }), '42');
    await ue.click(screen.getByRole('button', { name: 'Save and add another' }));
    await waitFor(() => expect(p.onSaveLine).toHaveBeenCalledWith(null, expect.objectContaining({ mileage: { vehicle: 'car', km: 42 } })));
    // The drawer stays open with an empty distance, still on mileage.
    expect(await screen.findByRole('dialog', { name: 'Add a line' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Distance/ })).toHaveValue('');
    await ue.type(screen.getByRole('textbox', { name: /Distance/ }), '18');
    await ue.click(screen.getByRole('button', { name: 'Add line' }));
    await waitFor(() => expect(p.onSaveLine).toHaveBeenLastCalledWith(null, expect.objectContaining({ mileage: { vehicle: 'car', km: 18 } })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a line' })).toBeNull());
  });
  it('negative T2-B 66: Save and add another with a field missing sends nothing; editing a line has no Save and add another', async () => {
    const p = claim();
    const { unmount } = show(<ClaimComposerScreen live={{ ...p, startAdd: 'mileage' }} />);
    await ue.click(screen.getByRole('button', { name: 'Save and add another' }));
    expect((await screen.findAllByText('Enter the distance in km.')).length).toBeGreaterThan(0);
    expect(p.onSaveLine).not.toHaveBeenCalled();
    unmount();
    const q = claim({ onSaveLine: vi.fn(async () => Promise.reject(new Error('The claim was changed by someone else.'))) });
    show(<ClaimComposerScreen live={{ ...q, startAdd: 'mileage' }} />);
    await ue.type(screen.getByRole('textbox', { name: /Distance/ }), '42');
    await ue.click(screen.getByRole('button', { name: 'Save and add another' }));
    // A refused save keeps what was typed and shows why.
    expect(await screen.findByText('The claim was changed by someone else.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Distance/ })).toHaveValue('42');
    await ue.keyboard('{Escape}');
    // Editing a saved line has no Save and add another.
    await ue.click(screen.getAllByRole('button', { name: /Edit line|Edit distance|Check and confirm/ })[0]!);
    expect(await screen.findByRole('dialog', { name: /^Line \d+$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save and add another' })).toBeNull();
  });
  it('a line read from a receipt asks to be checked; the over-limit reason is required before saving', async () => {
    const p = claim({ claim: { ...DRAFT, lines: [LINES[1]!, READ_LINE].map((l) => (l.id === 'l2' ? { ...l, justification: null } : l)) } });
    show(<ClaimComposerScreen live={p} />);
    expect(screen.getByText('Check the values read from the receipt')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save reason' }));
    expect(await screen.findByText('Add a reason so your approver can decide on the excess.')).toBeInTheDocument();
    expect(p.onSaveLine).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Why it's over the limit/ }), 'Conference hotel');
    await ue.click(screen.getByRole('button', { name: 'Save reason' }));
    await waitFor(() => expect(p.onSaveLine).toHaveBeenCalledWith('l2', expect.objectContaining({ justification: 'Conference hotel' })));
  });
  it('submitted: no editing, withdraw is offered, and the approval timeline shows', async () => {
    const p = claim({ claim: { ...SUBMITTED, can: { own: true, edit: false, withdraw: true, decide: false, changeAmounts: false, review: false } } });
    show(<ClaimComposerScreen live={p} />);
    expect(screen.queryByRole('button', { name: 'Submit claim' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove line/ })).toBeNull();
    expect(screen.getByText('Approvals')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Withdraw to change it' }));
    expect(p.onWithdraw).toHaveBeenCalled();
  });
});

describe('EXP-03 review', () => {
  it('reduce: reason missing is said and nothing is sent; with a reason the amount is saved exactly', async () => {
    const p = claim({ claim: SUBMITTED });
    show(<ClaimReviewScreen live={p} />);
    const row = screen.getByRole('row', { name: /Hotel/ });
    await ue.click(within(row).getByRole('button', { name: 'Reduce' }));
    await ue.click(screen.getByRole('button', { name: 'Save reduction' }));
    expect((await screen.findAllByText('Enter a reason. The employee sees it next to the amount.')).length).toBeGreaterThan(0);
    expect(p.onApproveAmount).not.toHaveBeenCalled();
    const amount = screen.getByRole('textbox', { name: /Approve/ });
    await ue.clear(amount);
    await ue.type(amount, '7500');
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Hotel cap Tier 1');
    await ue.click(screen.getByRole('button', { name: 'Save reduction' }));
    await waitFor(() => expect(p.onApproveAmount).toHaveBeenCalledWith('l2', '7500.00', 'Hotel cap Tier 1'));
  });
  it('approve all, and reject needs a reason', async () => {
    const p = claim({ claim: SUBMITTED });
    show(<ClaimReviewScreen live={p} />);
    await ue.click(screen.getByRole('button', { name: 'Approve all' }));
    await waitFor(() => expect(p.onDecide).toHaveBeenCalledWith('approve', ''));
    await ue.click(screen.getByRole('button', { name: 'Reject' }));
    await ue.click(screen.getByRole('button', { name: 'Reject claim' }));
    expect(await screen.findByText('Enter a reason of at least 3 characters. The employee sees it.')).toBeInTheDocument();
    expect(p.onDecide).toHaveBeenCalledTimes(1);
  });
  it('finance: the audit step, flags to clear or confirm, and no approve buttons', async () => {
    const p = claim({ claim: FINANCE });
    show(<ClaimReviewScreen live={p} />);
    expect(screen.getByText('Finance audit step')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve all' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reduce' })).toBeNull();
    await ue.click(screen.getByRole('row', { name: /Local cab/ }));
    await ue.click(screen.getByRole('button', { name: 'Clear' }));
    await ue.type(screen.getByRole('textbox', { name: /Note/ }), 'Different trip, checked');
    await ue.click(screen.getByRole('button', { name: 'Clear flag' }));
    await waitFor(() => expect(p.onFlag).toHaveBeenCalledWith('f1', 'clear', 'Different trip, checked'));
  });
});

// Answer 2251: "Add saved expenses" in the add-a-line sheet of my own claim.
describe('add saved expenses from the claim', () => {
  const SAVED = [
    { id: 's1', spentOn: '2026-09-14', amount: '640.00', categoryCode: null, merchant: 'Cab to airport', description: null, receipt: true, createdAt: '2026-09-14T03:00:00.000Z' },
    { id: 's2', spentOn: '2026-09-12', amount: '120.00', categoryCode: null, merchant: 'Auto to client', description: null, receipt: false, createdAt: '2026-09-12T03:00:00.000Z' },
  ];
  it('the ticked saved expenses become lines of this claim', async () => {
    const onAdd = vi.fn(async () => ({}));
    show(<ClaimComposerScreen live={claim({ startAdd: 'bill', saved: { items: SAVED, onAdd } })} />);
    expect(screen.getByText('You have 2 saved expenses not yet claimed.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add saved expenses' }));
    const dialog = screen.getByRole('dialog', { name: 'Add saved expenses' });
    await ue.click(within(dialog).getByRole('checkbox', { name: /Cab to airport/ }));
    await ue.click(within(dialog).getByRole('button', { name: 'Add 1 expense' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(['s1']));
  });
  it('negative: nothing ticked adds nothing; no saved expenses or not my claim shows no button', async () => {
    const onAdd = vi.fn(async () => ({}));
    const { unmount } = show(<ClaimComposerScreen live={claim({ startAdd: 'bill', saved: { items: SAVED, onAdd } })} />);
    await ue.click(screen.getByRole('button', { name: 'Add saved expenses' }));
    const dialog = screen.getByRole('dialog', { name: 'Add saved expenses' });
    await ue.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('Tick the saved expenses to add.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    unmount();
    const r2 = show(<ClaimComposerScreen live={claim({ startAdd: 'bill', saved: { items: [], onAdd } })} />);
    expect(screen.queryByRole('button', { name: 'Add saved expenses' })).toBeNull();
    r2.unmount();
    show(<ClaimComposerScreen live={claim({ startAdd: 'bill', saved: null })} />);
    expect(screen.queryByRole('button', { name: 'Add saved expenses' })).toBeNull();
  });
});
