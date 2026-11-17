import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LeaveCardScreen, type LiveLeaveCard } from './leave';

// Answer 2325: HR's leave card lists the person's approved leave; Cancel some days opens the drawer in HR mode.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const PERSON = { employeeId: 'e1', name: 'Arjun Kulkarni', code: 'KF-0101', canAdjust: true, balances: [] };
const REQ = { id: 'r1', employeeId: 'e1', type: { id: 't', code: 'EL', name: 'Earned leave', colour: 'blue', medical: false }, from: '2026-12-07', to: '2026-12-09', fromHalf: 'full', toHalf: 'full', days: 3, status: 'approved', certificate: 'none', reason: null, leaveDays: [{ on: '2026-12-07', portion: 1 }, { on: '2026-12-08', portion: 1 }, { on: '2026-12-09', portion: 1 }], changeWaiting: null };
const live = (x: Partial<LiveLeaveCard> = {}): LiveLeaveCard => ({ state: 'ready', data: { types: [], people: [PERSON] }, onLedger: vi.fn(async () => []), onAdjust: vi.fn(), ...x });

describe('TIM-21 HR · approved leave', () => {
  it('lists approved leave; Cancel some days sends the picked day and the reason, then reloads', async () => {
    const onApproved = vi.fn(async () => [REQ] as never);
    const onHrCancelDays = vi.fn(async () => ({}));
    render(<LeaveCardScreen live={live({ onApproved, onHrCancelDays })} />);
    const list = await screen.findByRole('list', { name: 'Approved leave' });
    await ue.click(within(list).getByRole('button', { name: 'Cancel some days' }));
    const dlg = screen.getByRole('dialog', { name: 'Cancel some days' });
    await ue.click(within(dlg).getByRole('checkbox', { name: /9 Dec 2026/ }));
    await ue.type(within(dlg).getByRole('textbox', { name: /Why/ }), 'Came in for the audit that day');
    await ue.click(within(dlg).getByRole('button', { name: 'Cancel these days' }));
    await waitFor(() => expect(onHrCancelDays).toHaveBeenCalledWith('e1', 'r1', { days: ['2026-12-09'], reason: 'Came in for the audit that day' }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(2));
  });
  it('negative: no button when HR cannot adjust the person, or a change is waiting', async () => {
    const onApproved = vi.fn(async () => [{ ...REQ, changeWaiting: ['2026-12-09'] }] as never);
    const { unmount } = render(<LeaveCardScreen live={live({ onApproved, onHrCancelDays: vi.fn() })} />);
    expect(await screen.findByText('A change is waiting for approval')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel some days' })).toBeNull();
    unmount();
    render(<LeaveCardScreen live={live({ data: { types: [], people: [{ ...PERSON, canAdjust: false }] }, onApproved, onHrCancelDays: vi.fn() })} />);
    expect(screen.queryByRole('list', { name: 'Approved leave' })).toBeNull();
  });
  it('the design story opens the drawer in HR mode', () => {
    render(<LeaveCardScreen persona="hr" person="Sanjay Rao" cancelDaysOpen />);
    expect(screen.getByRole('dialog', { name: 'Cancel some days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel these days' })).toBeInTheDocument();
  });
});
