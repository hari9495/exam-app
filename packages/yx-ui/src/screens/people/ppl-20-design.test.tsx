import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClearanceSignoffs } from './exits';
import type { MyClearanceItem } from './live/types';

// PPL-20 HR view by leaver (live): every department of one leaver with the owner column, the open count, a leaver
// picker, and the owner's own list one switch away.
const item = (over: Partial<MyClearanceItem>): MyClearanceItem => ({ id: 'i', department: 'it', title: 'Collect laptop', owner: 'Rohit Bhat', status: 'open', note: null, recoveryAmount: null, recoveryReason: null, signedOffAt: null, version: 1, exitCaseId: 'k1', person: 'Meera Iyer', lastDay: '2026-11-30', ...over });
const HR_ROWS = [
  item({ id: 'a', department: 'manager_handover', title: 'Handover of lab SOPs', owner: 'Divya Raghunathan', status: 'cleared' }),
  item({ id: 'b' }),
  item({ id: 'c', department: 'finance', title: 'Advances and expense claims', owner: 'Deepa Rao' }),
  item({ id: 'd', exitCaseId: 'k2', person: 'Ravi Kumar', lastDay: '2026-12-15', title: 'Collect phone' }),
];

describe('PPL-20 HR view by leaver (live)', () => {
  it('shows the first leaver with every department, the owners and the open count; another leaver can be picked', async () => {
    const ue = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ClearanceSignoffs live={{ state: 'ready', onRetry: vi.fn(), rows: [], hrRows: HR_ROWS, onSignOff: vi.fn(), onOpenExit: vi.fn() }} />);
    expect(screen.getByRole('heading', { name: 'Clearance · Meera Iyer' })).toBeInTheDocument();
    expect(screen.getByText('2 of 3 sign-offs open.')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Clearance sign-offs/ });
    expect(within(table).getByText('Deepa Rao')).toBeInTheDocument();
    expect(within(table).queryByText('Collect phone')).toBeNull();
    await ue.click(screen.getByRole('combobox', { name: 'Leaver' }));
    await ue.click(await screen.findByRole('option', { name: /Ravi Kumar/ }));
    expect(await screen.findByRole('heading', { name: 'Clearance · Ravi Kumar' })).toBeInTheDocument();
  });

  it('no open clearance in scope: says so; Your sign-offs shows the owner list', async () => {
    const ue = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ClearanceSignoffs live={{ state: 'ready', onRetry: vi.fn(), rows: [item({ id: 'z', title: 'Revoke access' })], hrRows: [], onSignOff: vi.fn() }} />);
    expect(screen.getByText('No open clearance')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Your sign-offs' }));
    expect(await screen.findByText('Revoke access')).toBeInTheDocument();
  });

  it('an owner without HR keys sees only their own sign-offs, no By leaver switch', () => {
    render(<ClearanceSignoffs live={{ state: 'ready', onRetry: vi.fn(), rows: [item({ id: 'z' })], onSignOff: vi.fn() }} />);
    expect(screen.getByRole('heading', { name: 'Clearance: your sign-offs' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /By leaver/ })).toBeNull();
  });

  it('Blocked (FinanceOwner): an item with a reason shows Blocked with why; Mark blocked asks for the reason', async () => {
    const ue = userEvent.setup({ pointerEventsCheck: 0 });
    const onBlock = vi.fn().mockResolvedValue(undefined);
    render(<ClearanceSignoffs live={{ state: 'ready', onRetry: vi.fn(), rows: [item({ id: 'f', department: 'finance', title: 'Advances and expense claims', blockedReason: 'Unclaimed advance of ₹5,000' }), item({ id: 'g' })], onSignOff: vi.fn(), onBlock }} />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText(/blocked: Unclaimed advance of ₹5,000/)).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Collect laptop/ });
    await ue.click(within(row).getByRole('button', { name: /More actions/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Mark blocked' }));
    await ue.click(await screen.findByRole('button', { name: 'Mark blocked' }));
    expect((await screen.findAllByText('Say what is blocking it, at least 3 characters.')).length).toBeGreaterThan(0);
    expect(onBlock).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /What is blocking it/ }), 'Laptop is with the vendor');
    await ue.click(screen.getByRole('button', { name: 'Mark blocked' }));
    await vi.waitFor(() => expect(onBlock).toHaveBeenCalledWith(expect.objectContaining({ id: 'g' }), 'Laptop is with the vendor'));
  });

  it('HR by leaver names the blocked department in the open count', () => {
    render(<ClearanceSignoffs live={{ state: 'ready', onRetry: vi.fn(), rows: [], hrRows: [item({ id: 'f', department: 'finance', blockedReason: 'Unclaimed advance' }), item({ id: 'g' })], onSignOff: vi.fn() }} />);
    expect(screen.getByText('2 of 2 sign-offs open. Finance is blocked: Unclaimed advance')).toBeInTheDocument();
  });
});
