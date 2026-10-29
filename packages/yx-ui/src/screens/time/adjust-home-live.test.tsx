import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { LeaveHomeScreen, type LiveAdjust } from './leave';
import type { HrLeaveHome, LeaveBalanceRow } from './live/types';

// Founder-approved (29 Oct 2026): the live HR leave home gains "Adjust balance", as in the design. The same dialog as
// the leave card; with no fixed person it finds someone in scope, loads their balances, and posts. Pressed too early
// shows the errors (never a disabled Post); a server refusal stays in the dialog; success is a toast naming the person.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const HR: HrLeaveHome = { today: '2026-10-29', pending: { total: 0, rows: [] }, away: [], negative: 0, certificates: [], yearEnd: { on: '2025-12-31', posted: true, nextOn: '2026-12-31' } };
const hrefs = { approvals: '/a', calendar: '/c', negative: '/n', yearEnd: '/y', request: () => '/a' };
const EL: LeaveBalanceRow = { leaveTypeId: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', colour: 'blue', paid: true, hasBalance: true, balance: 12, pending: 0, available: 12, takenThisYear: 0, entitlement: 18, negativeLimit: 0 };
const LOP: LeaveBalanceRow = { ...EL, leaveTypeId: 'lop', code: 'LOP', name: 'Loss of pay', kind: 'unpaid', paid: false, hasBalance: false, balance: 0 };

const live = (over: Partial<LiveAdjust> = {}): LiveAdjust => ({
  onFindPeople: vi.fn(async () => [{ id: 'e1', label: 'Arjun Kumar', detail: 'DEMO-0012' }]),
  onLoad: vi.fn(async () => [EL, LOP]),
  onAdjust: vi.fn(async () => ({})),
  ...over,
});
const home = (adjust?: LiveAdjust) => render(<ToastProvider><LeaveHomeScreen hrLive={{ state: 'ready', data: HR, onRemind: vi.fn(), onNavigate: vi.fn(), hrefs, adjust, record: { onFindPeople: vi.fn(async () => []), onCheck: vi.fn(), onRecord: vi.fn() }, applyFor: { onFindPeople: vi.fn(async () => []), onLoad: vi.fn(), onPreview: vi.fn(), onApply: vi.fn() } }} /></ToastProvider>);
const open = async (a: LiveAdjust) => {
  home(a);
  await ue.click(screen.getByRole('button', { name: 'Adjust balance' }));
  return screen.getByRole('dialog', { name: 'Adjust balance' });
};
const pick = async (dlg: HTMLElement) => {
  await ue.type(within(dlg).getByLabelText('Search employee'), 'Arj');
  await ue.click(await within(dlg).findByRole('combobox', { name: 'Employee' }));
  await ue.click(await screen.findByRole('option', { name: /Arjun Kumar/ }));
  await within(dlg).findByText(/Earned leave · 12 days available/);
};
const fill = async (dlg: HTMLElement) => {
  await ue.type(within(dlg).getByRole('textbox', { name: /Days/ }), '2');
  await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'Opening balance');
};

describe('Adjust balance on the HR leave home (TIM-17 HR, live)', () => {
  it('sits between Record long absence and Apply for someone, as in the design', () => {
    home(live());
    const names = screen.getAllByRole('button').map((b) => b.textContent).filter((t) => ['Record long absence', 'Adjust balance', 'Apply for someone'].includes(t ?? ''));
    expect(names).toEqual(['Record long absence', 'Adjust balance', 'Apply for someone']);
  });

  it('someone without leave.balance.adjust sees no button', () => {
    render(<ToastProvider><LeaveHomeScreen hrLive={{ state: 'ready', data: HR, onRemind: vi.fn(), onNavigate: vi.fn(), hrefs }} /></ToastProvider>);
    expect(screen.queryByRole('button', { name: 'Adjust balance' })).toBeNull();
  });

  it('finds the person, loads their balances (days empty), posts, closes and names them in a toast', async () => {
    const a = live();
    const dlg = await open(a);
    await pick(dlg);
    expect(a.onLoad).toHaveBeenCalledWith('e1');
    expect(within(dlg).getByRole('textbox', { name: /Days/ })).toHaveValue('');
    await fill(dlg);
    await ue.click(within(dlg).getByRole('button', { name: 'Post adjustment' }));
    await waitFor(() => expect(a.onAdjust).toHaveBeenCalledWith('e1', { leaveTypeId: 'el', days: 2, reason: 'Opening balance' }));
    expect((await screen.findAllByText('Posted +2 Earned leave for Arjun Kumar')).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Adjust balance' })).toBeNull());
  });

  it('Post too early shows the errors and focuses the first field; never disabled', async () => {
    const a = live();
    const dlg = await open(a);
    const post = within(dlg).getByRole('button', { name: 'Post adjustment' });
    expect(post).toBeEnabled();
    await ue.click(post);
    expect(within(dlg).getByText('Choose the person.')).toBeInTheDocument();
    expect(within(dlg).getByText('Enter the days.')).toBeInTheDocument();
    expect(within(dlg).getByText(/Say why/)).toBeInTheDocument();
    expect(document.activeElement).toBe(document.getElementById('adj-person'));
    expect(a.onAdjust).not.toHaveBeenCalled();
  });

  it("shows the server's refusal in the dialog and stays open", async () => {
    const a = live({ onAdjust: vi.fn(async () => { throw new Error('You cannot adjust your own balance. Ask another HR admin.'); }) });
    const dlg = await open(a);
    await pick(dlg);
    await fill(dlg);
    await ue.click(within(dlg).getByRole('button', { name: 'Post adjustment' }));
    expect(await within(dlg).findByText('You cannot adjust your own balance. Ask another HR admin.')).toBeInTheDocument();
    expect(within(dlg).getByText('Not posted')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Adjust balance' })).toBeInTheDocument();
  });
});
