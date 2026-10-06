import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalsInboxScreen, MyRequestsScreen, NotificationsInboxScreen, RequestSheetScreen } from './inbox';
import { APPROVALS, MY_REQUESTS, NOTIFICATIONS, SENT_BY_ME } from './platform-data';

const HISTORY = APPROVALS.slice(0, 2).map((a, i) => ({ ...a, id: `h${i}`, status: 'Approved' as const }));

describe('Notifications inbox (founder review 30 Sep 2026)', () => {
  it('expands grouped claims and bulk-approves the selected ones', async () => {
    const u = userEvent.setup();
    render(<NotificationsInboxScreen items={NOTIFICATIONS} />);
    await u.click(screen.getByRole('button', { name: 'Show 2 more like this' }));
    await u.click(screen.getByRole('checkbox', { name: /Vikram Rao/ }));
    await u.click(screen.getByRole('checkbox', { name: /Sanjay Gupta/ }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Approve 2' }));
    expect(screen.getByText(/₹1,240 for local travel · approved by you/)).toBeInTheDocument();
    expect(screen.getByText(/₹2,100 for a team lunch · approved by you/)).toBeInTheDocument();
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('shows only the selected category panel, with no hidden panels taking space', async () => {
    const u = userEvent.setup();
    render(<NotificationsInboxScreen items={NOTIFICATIONS} />);
    await u.click(screen.getByRole('tab', { name: /From YukthiX/ }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByText(/Planned maintenance/)).toBeInTheDocument();
  });
});

describe('Approvals inbox (founder review 30 Sep 2026)', () => {
  const screenWith = (openId?: string) => render(<ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} openId={openId} />);

  it('shows one count everywhere and marks only truly overdue requests', () => {
    screenWith();
    expect(screen.getByText('8 waiting · 1 overdue')).toBeInTheDocument();
    expect(screen.getByText('Overdue 1 day')).toBeInTheDocument();
    expect(screen.getAllByText('Due today')).toHaveLength(2);
    expect(screen.queryByRole('columnheader', { name: /Status/ })).not.toBeInTheDocument();
  });

  it('asks for a reason before approving outside policy, then moves to the next request', async () => {
    const u = userEvent.setup();
    screenWith('a4');
    expect(screen.getByText('3 nights × ₹6,066 = ₹18,198')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Approve' }));
    await u.click(screen.getByRole('button', { name: 'Approve with exception' }));
    expect(screen.getByText(/Say why this is fine/)).toBeInTheDocument();
    await u.type(screen.getByRole('textbox', { name: /Why this exception is fine/ }), 'Client meeting ran late, no cheaper hotel');
    await u.click(screen.getByRole('button', { name: 'Approve with exception' }));
    expect(screen.getByText('7 waiting')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent(/of 6/);
  });

  it('shows who else is off for a leave request', () => {
    screenWith('a1');
    expect(screen.getByText('Team on these days')).toBeInTheDocument();
    expect(screen.getByText('Kavya Reddy')).toBeInTheDocument();
  });
});

describe('Request sheet (founder review 30 Sep 2026)', () => {
  const d = (day: number, m = 9) => new Date(2026, m, day);
  it('splits leave over the balance into paid + unpaid in one click, and shows who else is off on those dates', async () => {
    const u = userEvent.setup();
    render(<RequestSheetScreen defaultType="leave" defaultFrom={d(5)} defaultTo={d(16)} />);
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    expect(screen.getByText('Meera Krishnan off on 12 Oct')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /Split into 4 days casual leave \+ 6 days unpaid/ }));
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
    expect(screen.getByText(/4 paid \+ 6 unpaid/)).toBeInTheDocument();
  });
  it('asks for a medical certificate on sick leave over 2 days', async () => {
    const u = userEvent.setup();
    render(<RequestSheetScreen defaultType="leave" defaultLeaveType="sick" defaultFrom={d(5)} defaultTo={d(7)} />);
    await u.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByText(/needs a certificate/)).toBeInTheDocument();
  });
  it('needs a date and a receipt for an expense', async () => {
    const u = userEvent.setup();
    render(<RequestSheetScreen defaultType="expense" />);
    expect(screen.getByRole('heading', { name: 'Claim an expense' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByText('Choose the date on the receipt.')).toBeInTheDocument();
    expect(screen.getByText(/Add a photo or PDF of the receipt/)).toBeInTheDocument();
  });
});

describe('My requests (founder review 30 Sep 2026)', () => {
  it('puts sent-back first and drops the empty button column on the Completed tab', async () => {
    const u = userEvent.setup();
    const { container } = render(<MyRequestsScreen rows={MY_REQUESTS} />);
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Missed check-in');
    expect(screen.getByRole('button', { name: 'Cancel leave' })).toBeInTheDocument();
    await u.click(screen.getByRole('tab', { name: /Completed/ }));
    expect(container.querySelector('th.yx-table__actions')).toBeNull();
  });
});
