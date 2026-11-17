import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CancelSomeDaysDrawer, ExtendLeaveDrawer, LeaveRequestDetail } from './leave';

// Batch A D12 (answer 2311): TIM-19 "Cancel some days" and "Extend", design and the shared drawers the app uses.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const DAYS = [{ on: '2026-10-19', portion: 1 }, { on: '2026-10-20', portion: 1 }, { on: '2026-10-21', portion: 0.5 }];

describe('TIM-19 design', () => {
  it('approved leave offers Cancel some days and Extend; each opens its drawer', async () => {
    render(<LeaveRequestDetail id="lr6" action="cancel_days" />);
    expect(await screen.findByRole('dialog', { name: 'Cancel some days' })).toBeInTheDocument();
  });
  it('the extend story opens Extend leave', async () => {
    render(<LeaveRequestDetail id="lr6" action="extend" />);
    expect(await screen.findByRole('dialog', { name: 'Extend leave' })).toBeInTheDocument();
  });
});

describe('Cancel some days', () => {
  it('pressed early it says pick a day; every day is refused; taken days are disabled; a good pick is sent with a toast', async () => {
    const onSend = vi.fn(async () => ({}));
    render(<CancelSomeDaysDrawer days={DAYS} today="2026-10-20" onSend={onSend} onClose={vi.fn()} />);
    const dlg = screen.getByRole('dialog', { name: 'Cancel some days' });
    expect(within(dlg).getByRole('checkbox', { name: /19 Oct 2026/ })).toBeDisabled();
    await ue.click(within(dlg).getByRole('button', { name: 'Send to approver' }));
    expect(within(dlg).getAllByText('Pick at least one day to cancel.').length).toBeGreaterThan(0);
    await ue.click(within(dlg).getByRole('checkbox', { name: /21 Oct 2026 · half day/ }));
    await ue.type(within(dlg).getByRole('textbox', { name: /Why/ }), 'Back early');
    expect(within(dlg).getByText('0.5 days back to the balance once approved.')).toBeInTheDocument();
    await ue.click(within(dlg).getByRole('button', { name: 'Send to approver' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ days: ['2026-10-21'], reason: 'Back early' }));
    expect(await screen.findByText('Sent to your manager')).toBeInTheDocument();
  });
  it('HR may pick a past day but needs a reason in a sentence; picking every day is refused', async () => {
    const onSend = vi.fn(async () => ({}));
    render(<CancelSomeDaysDrawer hr days={DAYS} today="2026-10-20" onSend={onSend} onClose={vi.fn()} />);
    const dlg = screen.getByRole('dialog', { name: 'Cancel some days' });
    for (const n of [/19 Oct/, /20 Oct/, /21 Oct/]) await ue.click(within(dlg).getByRole('checkbox', { name: n }));
    await ue.type(within(dlg).getByRole('textbox', { name: /Why/ }), 'short');
    await ue.click(within(dlg).getByRole('button', { name: 'Cancel these days' }));
    expect(within(dlg).getAllByText('That is every day of this leave. Use Ask to cancel instead.').length).toBeGreaterThan(0);
    expect(within(dlg).getAllByText('Give the reason in a sentence (at least 10 letters).').length).toBeGreaterThan(0);
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('Extend leave', () => {
  it('needs a new last day after the end; sends the day, half and reason', async () => {
    const onSend = vi.fn(async () => ({}));
    render(<ExtendLeaveDrawer lastDay="2026-10-21" typeName="Earned leave" onSend={onSend} onClose={vi.fn()} />);
    const dlg = screen.getByRole('dialog', { name: 'Extend leave' });
    await ue.click(within(dlg).getByRole('button', { name: 'Send request' }));
    expect(within(dlg).getAllByText('Choose the new last day.').length).toBeGreaterThan(0);
    const f = within(dlg).getByRole('textbox', { name: 'New last day' });
    await ue.type(f, '23 Oct 2026');
    fireEvent.blur(f);
    await ue.click(within(dlg).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ to: '2026-10-23', toHalf: 'full' }));
    expect(await screen.findByText('Extension sent to your manager')).toBeInTheDocument();
  });
});
