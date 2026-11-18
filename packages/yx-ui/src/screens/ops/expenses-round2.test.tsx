import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AdvanceScreen, ClaimComposerScreen, ExpensesHomeScreen, TeamClaimsScreen } from './expenses';
import { EXP_LINKS, type LiveClaim, type LiveHome } from './expenses-live';
import type { LiveAdvance } from './expenses-travel-live';
import type { LiveTeam } from './expenses-team-live';
import { forexRows, instalmentsText, prevMonthOf, teamSpend } from './expenses-live-data';
import { ADVANCE_DETAIL, CATEGORIES, DRAFT, HOME, LINES, SUBMITTED, TEAM } from './expenses-live-samples';
import type { AdvanceDetail } from '../expenses/live/types';

// Expenses round 2: team claims (founder answer 1), the real receipt thumbnail, the advance's recovery instalments and
// the forex card. Positive and negative paths.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const team = (over: Partial<LiveTeam> = {}): LiveTeam => ({ state: 'ready', onRetry: vi.fn(), team: TEAM, today: '2026-09-29', month: '2026-09', onMonth: vi.fn(), over: false, onOver: vi.fn(), onOpen: vi.fn(), ...over });
const advance = (a: AdvanceDetail): LiveAdvance => ({
  view: 'record', state: 'ready', onRetry: vi.fn(), advance: a, today: '2026-09-20', onBack: vi.fn(), onChangeAmount: vi.fn(async () => ({})), onDecide: vi.fn(async () => ({})), onPay: vi.fn(async () => ({})), onReturn: vi.fn(async () => ({})),
  onNewClaim: vi.fn(async () => ({})), onOpenTrip: vi.fn(), onOpenClaim: vi.fn(),
});
const RECOVERY: AdvanceDetail['recovery'] = { scheduled: false, total: '6600.00', instalments: [{ month: '2026-10', amount: '2200.00', status: 'scheduled' }, { month: '2026-11', amount: '2200.00', status: 'scheduled' }, { month: '2026-12', amount: '2200.00', status: 'scheduled' }] };

describe('round 2 rules', () => {
  it('the month before, across the year end', () => {
    expect(prevMonthOf('2026-11')).toBe('2026-10');
    expect(prevMonthOf('2026-01')).toBe('2025-12');
  });
  it('team spend matches the home card: sent claims, the approved amount once decided; sent back and rejected do not count', () => {
    expect(teamSpend(TEAM.claims)).toBe('39444.00'); // 19,794 + 8,450 + 11,200 (approved of 12,600); the sent-back 3,120 is out
    expect(teamSpend([{ status: 'rejected', claimedTotal: '500.00', approvedTotal: null }])).toBe('0.00');
    expect(teamSpend([])).toBe('0.00');
  });
  it('instalments read as amounts with their payroll months, the year only when it changes', () => {
    expect(instalmentsText('INR', [{ month: '2026-12', amount: '334.00', status: 'scheduled' }, { month: '2027-01', amount: '334.00', status: 'scheduled' }, { month: '2027-02', amount: '332.00', status: 'scheduled' }])).toBe('₹334.00 (Dec 2026), ₹334.00 (Jan 2027), ₹332.00 (Feb)');
    expect(instalmentsText('INR', [{ month: '2026-10', amount: '500.00', status: 'recovered' }, { month: '2026-11', amount: '0.00', status: 'paused' }])).toBe('₹500.00 (Oct 2026, recovered)');
  });
  it('the forex card adds up from the ledger exactly; an advance in the pay currency has none', () => {
    const fx = { fxRate: '83.00000000', ledger: [
      { id: 'p', on: '2026-09-01', kind: 'paid', text: 'Advance paid at 83.0000', amount: '500.00', amountPay: '41500.00', claimId: null },
      { id: 'c', on: '2026-09-10', kind: 'claim', text: 'Settled by claim: Singapore', amount: '-420.00', amountPay: '-34860.00', claimId: 'c1' },
      { id: 'r', on: '2026-09-12', kind: 'return', text: 'Returned by bank (UTR-1) at 84.5000', amount: '-80.00', amountPay: '-6760.00', claimId: null },
      { id: 'x', on: '2026-09-12', kind: 'exchange_difference', text: 'Exchange difference', amount: '0.00', amountPay: '120.00', claimId: null },
    ] };
    expect(forexRows(fx).map((r) => [r.id, r.fc, r.pay])).toEqual([['loaded', '500.00', '41500.00'], ['spent', '-420.00', '-34860.00'], ['r', '-80.00', '-6760.00'], ['diff', '0.00', '120.00']]);
    expect(forexRows({ fxRate: null, ledger: fx.ledger })).toEqual([]);
  });
});

describe('Team claims (EXP-01 drill)', () => {
  it('lists the team’s claims read only: Open only where the manager may open it, and the team spend', async () => {
    const p = team();
    show(<TeamClaimsScreen live={p} />);
    expect(screen.getByRole('heading', { name: 'Team claims' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Team claims' });
    expect(within(table).getByText('Pune plant audit')).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: 'Open' })).toHaveLength(3); // the sent-back claim is not the manager's to open
    // Batch E A4 (2552): who each claim waits on, the claimant for one sent back.
    expect(within(table).getByRole('columnheader', { name: /Waiting on/ })).toBeInTheDocument();
    expect(within(table).getByText('Asha Rao and 1 more')).toBeInTheDocument();
    expect(within(table).getAllByText('Finance (payment)')).toHaveLength(2);
    expect(screen.getByText('₹39,444.00')).toBeInTheDocument();
    await ue.click(within(table).getAllByRole('button', { name: 'Open' })[0]!);
    expect(p.onOpen).toHaveBeenCalledWith(TEAM.claims[0]!.id);
    await ue.click(screen.getByRole('radio', { name: 'August 2026' }));
    expect(p.onMonth).toHaveBeenCalledWith('2026-08');
    await ue.click(screen.getByRole('radio', { name: /With over-limit lines \(2\)/ }));
    expect(p.onOver).toHaveBeenCalledWith(true);
  });
  it('over-limit only shows just those claims; an empty month says so', () => {
    const { unmount } = show(<TeamClaimsScreen live={team({ over: true })} />);
    expect(within(screen.getByRole('table', { name: 'Team claims' })).queryByText('Pune plant audit')).toBeNull();
    unmount();
    show(<TeamClaimsScreen live={team({ team: { ...TEAM, claims: [] } })} />);
    expect(screen.getByText('No claims sent in September 2026.')).toBeInTheDocument();
  });
  it('someone with no one reporting to them sees the no-access state, never "check your connection"', () => {
    show(<TeamClaimsScreen live={team({ state: 'no-access', team: null })} />);
    expect(screen.getByText('You don\'t have access to team claims')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/)).toBeNull();
  });
  it('the manager’s home cards drill into team claims (all, and over-limit only)', async () => {
    const p: LiveHome = { state: 'ready', onRetry: vi.fn(), home: { ...HOME, waitingForMe: 0, toReview: null }, today: '2026-09-20', approvals: { claims: [], trips: [], advances: [] }, openAdvance: null, finance: null, onNew: vi.fn(async () => ({})), onOpen: vi.fn(), onOpenTrip: vi.fn(), onOpenAdvance: vi.fn(), onRequestTrip: vi.fn(), onGo: vi.fn() };
    show(<ExpensesHomeScreen live={p} />);
    await ue.click(screen.getByRole('radio', { name: 'Waiting for me' }));
    await ue.click(screen.getByRole('link', { name: /View team claims/ }));
    expect(p.onGo).toHaveBeenCalledWith(EXP_LINKS.team);
    await ue.click(screen.getByRole('link', { name: /View over-limit lines/ }));
    expect(p.onGo).toHaveBeenCalledWith(EXP_LINKS.teamOver);
  });
});

describe('receipt thumbnail', () => {
  const claim = (over: Partial<LiveClaim> = {}): LiveClaim => ({
    state: 'ready', onRetry: vi.fn(), claim: { ...DRAFT, lines: [{ ...LINES[0]!, receiptType: 'image' }, { ...LINES[1]!, receiptType: 'pdf' }] }, categories: CATEGORIES, today: '2026-09-20', onBack: vi.fn(),
    onUploadReceipt: vi.fn(async () => ({})), onSaveLine: vi.fn(async () => ({})), onRemoveLine: vi.fn(async () => ({})), onSubmit: vi.fn(async () => SUBMITTED), onWithdraw: vi.fn(async () => ({})),
    onOpenReceipt: vi.fn(async () => ({})), onApproveAmount: vi.fn(async () => ({})), onDecide: vi.fn(async () => ({})), onFlag: vi.fn(async () => ({})), ...over,
  });
  it('a photo shows the stored picture (fetched once); a PDF shows a PDF tile and is not fetched', async () => {
    const load = vi.fn(async () => 'blob:receipt-1');
    const { container } = show(<ClaimComposerScreen live={claim({ onReceiptUrl: load })} />);
    await waitFor(() => expect(container.querySelector('img.yx-ops-receipt__img')?.getAttribute('src')).toBe('blob:receipt-1'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(LINES[0]!.id);
    expect(screen.getByLabelText(/Receipt from Harbour View Residency.*a PDF/)).toBeInTheDocument();
  });
  it('when the file cannot be shown (not yet virus-checked) the drawn receipt stays', async () => {
    const load = vi.fn(async () => {
      throw new Error('409');
    });
    const { container } = show(<ClaimComposerScreen live={claim({ onReceiptUrl: load })} />);
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(container.querySelector('img.yx-ops-receipt__img')).toBeNull();
    expect(container.querySelector('svg.yx-ops-receipt__svg')).not.toBeNull();
  });
});

describe('EXP-05 recovery and forex', () => {
  it('finance sees the instalment amounts and months', () => {
    show(<AdvanceScreen live={advance({ ...ADVANCE_DETAIL, recovery: RECOVERY, can: { ...ADVANCE_DETAIL.can, claim: false, recordReturn: true } })} />);
    expect(screen.getByText(/Recover ₹6,600.00 from salary in 3 instalments: ₹2,200.00 \(Oct 2026\), ₹2,200.00 \(Nov\), ₹2,200.00 \(Dec\)\. Protected net pay applies/)).toBeInTheDocument();
  });
  it('the employee is told what will be recovered unless they settle; with no figures the setting’s count is said', () => {
    const { unmount } = show(<AdvanceScreen live={advance({ ...ADVANCE_DETAIL, recovery: RECOVERY })} />);
    expect(screen.getByText(/Submit claims or return ₹6,600.00\. Otherwise it is recovered from salary in 3 instalments: ₹2,200.00 \(Oct 2026\)/)).toBeInTheDocument();
    unmount();
    show(<AdvanceScreen live={advance({ ...ADVANCE_DETAIL, recovery: null })} />);
    expect(screen.getByText('Submit claims or return ₹6,600.00. Otherwise it is recovered from salary in 3 instalments.')).toBeInTheDocument();
  });
  it('a forex advance has its own settlement card; a rupee advance has none', () => {
    const fx: AdvanceDetail = { ...ADVANCE_DETAIL, currency: 'USD', fxRate: '83.00000000', overdue: false, ledger: [{ id: 'p', on: '2026-09-01', kind: 'paid', text: 'Advance paid at 83.0000', amount: '500.00', amountPay: '41500.00', claimId: null }, { id: 'x', on: '2026-09-12', kind: 'exchange_difference', text: 'Exchange difference', amount: '0.00', amountPay: '120.00', claimId: null }] };
    const { unmount } = show(<AdvanceScreen live={advance(fx)} />);
    const card = screen.getByRole('table', { name: 'Forex settlement' });
    expect(within(card).getByText('Advance loaded at 83')).toBeInTheDocument();
    expect(within(card).getByText('₹120.00')).toBeInTheDocument();
    unmount();
    show(<AdvanceScreen live={advance(ADVANCE_DETAIL)} />);
    expect(screen.queryByRole('table', { name: 'Forex settlement' })).toBeNull();
  });
});
