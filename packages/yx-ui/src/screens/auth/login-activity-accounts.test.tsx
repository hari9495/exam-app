import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginActivityScreen, NO_FILTERS, type AccountRow, type LoginActivityScreenProps } from './login-activity';
import { ORG_EVENTS, ORG_SESSIONS, PEOPLE } from './data';

const ROWS: AccountRow[] = [
  { id: 'me', name: 'Lakshmi V', email: 'l@k.in', roleLabel: 'System Admin', status: 'active', lastLoginAt: '2026-11-17T09:00:00+05:30', twoStep: true, self: true },
  { id: 'r', name: 'Ravi Kumar', email: 'r@k.in', roleLabel: 'Employee', status: 'active', lastLoginAt: '2026-11-16T09:00:00+05:30', twoStep: false },
  { id: 'm', name: 'Meena Iyer', email: 'm@k.in', roleLabel: 'HR', status: 'invited', lastLoginAt: null, twoStep: false },
  { id: 'k', name: 'Kavya Reddy', email: 'k@k.in', roleLabel: 'Manager', status: 'off', lastLoginAt: '2026-10-10T09:00:00+05:30', twoStep: true },
];

function Screen(over: Partial<LoginActivityScreenProps>) {
  return (
    <LoginActivityScreen
      tab="accounts"
      onTabChange={vi.fn()}
      events={ORG_EVENTS}
      eventsState="ready"
      filters={NO_FILTERS}
      onFiltersChange={vi.fn()}
      onEventsPage={vi.fn()}
      failedLast24h={0}
      people={PEOPLE}
      sessions={ORG_SESSIONS}
      sessionsState="ready"
      onSessionsPage={vi.fn()}
      onRevokeSession={vi.fn()}
      accounts={{ data: ROWS, total: ROWS.length, page: 1, pageSize: 25 }}
      accountsState="ready"
      {...over}
    />
  );
}

describe('Login activity › Accounts (admin A6)', () => {
  it('lists each account with its sign-in state, last sign-in and two-step', () => {
    render(<Screen />);
    const table = screen.getByRole('table', { name: 'Accounts' });
    expect(within(table).getAllByText('Never signed in').length).toBeGreaterThan(0);
    expect(within(table).getByText('Turned off')).toBeInTheDocument();
    expect(within(table).getByText('Never')).toBeInTheDocument();
  });

  it('the filter is a single-choice Segment', async () => {
    const onAccountFilter = vi.fn();
    render(<Screen onAccountFilter={onAccountFilter} accountFilter="all" />);
    const group = screen.getByRole('radiogroup', { name: 'Show' });
    await userEvent.setup().click(within(group).getByRole('radio', { name: 'Turned off' }));
    expect(onAccountFilter).toHaveBeenCalledWith('off');
  });

  it('turns sign-in off after a confirm, offers Turn on and Send link again where they apply, never on your own row', async () => {
    const u = userEvent.setup();
    const onSetSignIn = vi.fn(async () => {});
    render(<Screen onSetSignIn={onSetSignIn} onResendLink={vi.fn(async () => {})} />);
    expect(screen.queryByRole('button', { name: 'Turn off sign-in for Lakshmi V' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn sign-in back on for Kavya Reddy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send a new sign-in link to Meena Iyer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send a new sign-in link to Ravi Kumar' })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Turn off sign-in for Ravi Kumar' }));
    await u.click(await screen.findByRole('button', { name: 'Turn off sign-in' }));
    expect(onSetSignIn).toHaveBeenCalledWith(expect.objectContaining({ id: 'r' }), false);
  });

  it('no Accounts tab when the host leaves it out', () => {
    render(<Screen tab="events" accounts={undefined} />);
    expect(screen.queryByRole('tab', { name: /Accounts/ })).not.toBeInTheDocument();
  });
});
