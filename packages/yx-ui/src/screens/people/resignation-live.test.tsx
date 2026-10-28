import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResignationSheet, type LiveResignation } from './exits';
import type { MyResignation } from './live/types';

// PPL-18 live: Me › Resign is the designed sheet with the API's notice, my resignation and its withdrawal.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const DATA: MyResignation = { today: '2026-10-09', notice: { period: '30d', label: '30 days', standardLwd: '2026-11-08', onProbation: false }, reasons: ['better_opportunity', 'family'], current: null, last: null };
const CURRENT: NonNullable<MyResignation['current']> = { id: 'k', employeeId: 'e', exitType: 'resignation', typeLabel: 'Resignation', initiatedBy: 'employee', reasonCode: 'family', reasonText: 'x', submittedOn: '2026-10-01', requestedLwd: null, noticePeriod: '30d', noticeLabel: '30 days', standardLwd: '2026-10-31', approvedLwd: '2026-10-31', lastDay: '2026-10-31', noticeArrangement: null, status: 'accepted', pendingChange: null, lettersHeld: false, version: 2, interview: null };

function page(over: Partial<LiveResignation> = {}) {
  const live: LiveResignation = { state: 'ready', onRetry: vi.fn(), data: DATA, onResign: vi.fn(async () => ({})), onWithdraw: vi.fn(async () => ({})), interviewHref: '/i', ...over };
  render(<ResignationSheet live={live} />);
  return live;
}
const dialog = () => within(screen.getByRole('dialog'));

describe('Me › Resign (PPL-18)', () => {
  it('shows the notice and the last day; Send explains what is missing, then sends after the confirmation', async () => {
    const live = page();
    expect(screen.getByText(/Your notice is 30 days, counted from today/)).toBeInTheDocument();
    expect(screen.getAllByText('8 Nov 2026')).toHaveLength(2);
    await ue.click(screen.getByRole('button', { name: 'Send resignation' }));
    expect(screen.getByText('Choose the main reason.')).toBeInTheDocument();
    expect(screen.getByText('Enter at least 3 characters.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('combobox', { name: 'Reason' }));
    await ue.click(screen.getByRole('option', { name: 'Family reasons' }));
    await ue.type(screen.getByRole('textbox', { name: /Anything you want your manager and HR to know/ }), 'Moving home');
    await ue.click(screen.getByRole('button', { name: 'Send resignation' }));
    expect(dialog().getByText(/Your last working day would be 8 Nov 2026/)).toBeInTheDocument();
    await ue.click(dialog().getByRole('button', { name: 'Send resignation' }));
    expect(live.onResign).toHaveBeenCalledWith({ reasonCode: 'family', reasonText: 'Moving home', requestedLwd: null });
  });

  it('an earlier day shows the shortfall; Cancel clears the form', async () => {
    page();
    await ue.type(screen.getByLabelText(/Proposed last working day/), '01/11/2026');
    await ue.click(screen.getByText('What this means'));
    expect(screen.getByText(/7 days · recovered in your F&F/)).toBeInTheDocument();
    expect(screen.getByText("An early release needs your manager's and HR's approval.")).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('a voluntary retirement scheme shows above the form; nothing to resign from says so', () => {
    const { unmount } = render(<ResignationSheet live={{ state: 'ready', onRetry: vi.fn(), data: DATA, onResign: vi.fn(), onWithdraw: vi.fn(), interviewHref: '/i', vrs: { schemes: [{ id: 'v', name: 'VRS 2026', closesOn: '2026-12-31', minAge: 50, minServiceYears: 10, eligible: true }], onApply: vi.fn() } }} />);
    expect(screen.getByText('VRS 2026: open until 31 Dec 2026')).toBeInTheDocument();
    unmount();
    page({ data: { ...DATA, notice: null } });
    expect(screen.getByText('You have no open employment to resign from.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send resignation' })).not.toBeInTheDocument();
  });

  it('accepted: withdrawing needs a reason and asks the manager and HR', async () => {
    const live = page({ data: { ...DATA, current: CURRENT } });
    expect(screen.getByText('Serving notice')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Withdraw resignation' }));
    expect(dialog().getByText(/must approve the withdrawal/)).toBeInTheDocument();
    await ue.click(dialog().getByRole('button', { name: 'Ask to withdraw' }));
    expect(dialog().getByText('Enter a reason of at least 3 characters.')).toBeInTheDocument();
    expect(live.onWithdraw).not.toHaveBeenCalled();
    await ue.type(dialog().getByRole('textbox'), 'Staying on');
    await ue.click(dialog().getByRole('button', { name: 'Ask to withdraw' }));
    expect(live.onWithdraw).toHaveBeenCalledWith('Staying on');
  });

  it('a hold shows only the neutral message; the interview link and a pending withdrawal show; no second withdraw', () => {
    page({ data: { ...DATA, current: { ...CURRENT, lettersHeld: true, interview: 'sent', pendingChange: { kind: 'withdrawal' } } } });
    expect(screen.getByText('Your relieving letter is on hold')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Answer the exit interview' })).toHaveAttribute('href', '/i');
    expect(screen.getByText('Withdrawal asked for')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw resignation' })).not.toBeInTheDocument();
  });

  it('a failed load offers to try again', async () => {
    const live = page({ state: 'error', data: null });
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(live.onRetry).toHaveBeenCalled();
  });
});
