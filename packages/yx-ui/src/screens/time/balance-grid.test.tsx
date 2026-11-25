import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BalanceGrid, LeaveCardScreen, type BalanceGridPerson } from './leave';

// Batch A D10 (answer 2314): TIM-21 HR balance grid. Each cell opens a correction with a reason; never below the minimum.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const TYPES = [{ id: 'el', code: 'EL', name: 'Earned leave' }, { id: 'cl', code: 'CL', name: 'Casual leave' }, { id: 'lop', code: 'LOP', name: 'Loss of pay' }];
const PEOPLE: BalanceGridPerson[] = [
  { employeeId: 'e1', name: 'Arun Prakash', code: 'KF-0112', canAdjust: true, balances: [{ leaveTypeId: 'el', balance: 5, hasBalance: true, negativeLimit: 2 }, { leaveTypeId: 'cl', balance: 3, hasBalance: true, negativeLimit: 0 }, { leaveTypeId: 'lop', balance: 0, hasBalance: false, negativeLimit: 0 }] },
  { employeeId: 'e2', name: 'Meera Krishnan', code: null, canAdjust: false, balances: [{ leaveTypeId: 'el', balance: 8, hasBalance: true, negativeLimit: 0 }] },
];

describe('TIM-21 balance grid', () => {
  it('shows people by the types with a balance; only people HR may correct have buttons; a missing type is a dash', () => {
    render(<BalanceGrid types={TYPES} people={PEOPLE} onCorrect={vi.fn()} />);
    expect(screen.getByRole('columnheader', { name: /EL/ })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /LOP/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Correct Earned leave for Arun Prakash: 5 days' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /for Meera Krishnan/ })).toBeNull();
    expect(screen.getByLabelText("Casual leave: not in Meera Krishnan's policy")).toBeInTheDocument();
  });

  it('pressed early: same figure, below the minimum and no reason are field errors; a good one posts and toasts', async () => {
    const onCorrect = vi.fn(async () => ({}));
    render(<BalanceGrid types={TYPES} people={PEOPLE} onCorrect={onCorrect} />);
    await ue.click(screen.getByRole('button', { name: /Correct Earned leave for Arun/ }));
    const dlg = screen.getByRole('dialog', { name: 'Correct balance' });
    await ue.click(within(dlg).getByRole('button', { name: 'Post correction' }));
    expect(within(dlg).getAllByText('That is the balance now. Change it first.').length).toBeGreaterThan(0);
    expect(within(dlg).getAllByText('Say why (it goes on the ledger and the audit log).').length).toBeGreaterThan(0);
    const field = within(dlg).getByRole('textbox', { name: /Corrected balance/ });
    await ue.clear(field);
    await ue.type(field, '-3');
    await ue.click(within(dlg).getByRole('button', { name: 'Post correction' }));
    expect(within(dlg).getAllByText("It can't go below -2 days, the leave type's minimum balance.").length).toBeGreaterThan(0);
    expect(onCorrect).not.toHaveBeenCalled();
    await ue.clear(field);
    await ue.type(field, '7.5');
    await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'Old system was short');
    expect(within(dlg).getByText('Posts +2.5 days to the ledger.')).toBeInTheDocument();
    await ue.click(within(dlg).getByRole('button', { name: 'Post correction' }));
    await waitFor(() => expect(onCorrect).toHaveBeenCalledWith({ employeeId: 'e1', leaveTypeId: 'el', from: 5, to: 7.5, reason: 'Old system was short' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await screen.findAllByText('Earned leave for Arun Prakash is now 7.5 days')).length).toBeGreaterThan(0);
  });

  it('negative: the server refusing (a stale figure) keeps the dialog open with its reason', async () => {
    const onCorrect = vi.fn(async () => Promise.reject(new Error('The Earned leave balance is now 6, not 5: it changed since you loaded it. Reload and try again.')));
    render(<BalanceGrid types={TYPES} people={PEOPLE} onCorrect={onCorrect} />);
    await ue.click(screen.getByRole('button', { name: /Correct Earned leave for Arun/ }));
    const dlg = screen.getByRole('dialog', { name: 'Correct balance' });
    const field = within(dlg).getByRole('textbox', { name: /Corrected balance/ });
    await ue.clear(field);
    await ue.type(field, '4');
    await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'Took one day off the record');
    await ue.click(within(dlg).getByRole('button', { name: 'Post correction' }));
    expect(await within(dlg).findByText(/it changed since you loaded it/)).toBeInTheDocument();
  });

  it('the design stories render the grid and the open correction; the live card switches to the grid only with onCorrect', async () => {
    const { unmount } = render(<LeaveCardScreen persona="hr" view="grid" correctOpen />);
    expect(screen.getByRole('dialog', { name: 'Correct balance' })).toBeInTheDocument();
    unmount();
    const data = { types: TYPES.map((t) => ({ ...t, kind: 'casual' })), people: PEOPLE.map((p) => ({ ...p, balances: [] })) };
    const live = { state: 'ready' as const, data, onLedger: vi.fn(async () => []), onAdjust: vi.fn() };
    const { unmount: u2 } = render(<LeaveCardScreen live={live} />);
    expect(screen.queryByText('Balance grid')).toBeNull();
    u2();
    render(<LeaveCardScreen live={{ ...live, onCorrect: vi.fn(), view: 'grid' }} />);
    expect(screen.getByRole('heading', { name: 'Leave balances · everyone' })).toBeInTheDocument();
  });
});
