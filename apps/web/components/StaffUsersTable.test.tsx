import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './ui';
import { StaffUsersTable } from './StaffUsersTable';

const users = [
  { id: 't1', organizationId: 'o1', email: 'rec@x.com', name: 'Rec One', role: 'recruiter', status: 'active', lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z' },
];

jest.mock('../lib/auth-context', () => ({ useAuth: () => ({ impersonate: jest.fn() }) }));
jest.mock('../lib/hooks/useUsers', () => ({
  useUpdateUser: () => ({ mutate: jest.fn(), isPending: false }),
  useDeactivateUser: () => ({ mutate: jest.fn(), isPending: false }),
  useReactivateUser: () => ({ mutate: jest.fn(), isPending: false }),
  useResetUserPassword: () => ({ mutate: jest.fn(), isPending: false }),
}));

// ListView persists column visibility in localStorage; clear it so one test's
// hidden column does not leak into the next.
beforeEach(() => localStorage.clear());

// useToast() throws outside a ToastProvider (a mutation success path calls it), so
// every render here needs the provider even though most tests never fire a mutation.
function renderTable(props: React.ComponentProps<typeof StaffUsersTable>) {
  return render(
    <ToastProvider>
      <StaffUsersTable {...props} />
    </ToastProvider>,
  );
}

it('renders a staff user row with a Login-as action for an org_admin', () => {
  renderTable({ users, currentUserRole: 'org_admin', isActingSuperAdmin: false, currentUserId: 'admin1' });
  expect(screen.getByText('rec@x.com')).toBeInTheDocument();
  expect(screen.getByText('Rec One')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /login as/i })).toBeInTheDocument();
});

it('shows no row menu for a user the current user cannot manage', () => {
  const selfRow = [{ ...users[0], id: 'admin1', email: 'admin@x.com', role: 'org_admin' }];
  renderTable({ users: selfRow, currentUserRole: 'org_admin', isActingSuperAdmin: false, currentUserId: 'admin1' });
  // RowActions renders null for an empty action list, so gating produces no menu.
  expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
});

it('filters rows by role and the item count follows', async () => {
  const mixed = [
    { ...users[0] },
    { ...users[0], id: 't2', email: 'admin@x.com', name: 'Admin Two', role: 'org_admin' },
  ];
  renderTable({ users: mixed, currentUserRole: 'org_admin', isActingSuperAdmin: false, currentUserId: 'admin1' });
  expect(screen.getByText(/2 items/)).toBeInTheDocument();

  // The role filter is a Radix Select, not a native <select> -- userEvent.selectOptions
  // only supports <select> or role="listbox" targets, so it can't drive this control.
  // Open + click, matching the pattern in ui/Select.test.tsx.
  await userEvent.click(screen.getAllByRole('combobox')[0]);
  await userEvent.click(screen.getByRole('option', { name: 'Recruiter' }));

  expect(screen.getByText('rec@x.com')).toBeInTheDocument();
  expect(screen.queryByText('admin@x.com')).not.toBeInTheDocument();
  expect(screen.getByText(/1 item(?!s)/)).toBeInTheDocument();
});
