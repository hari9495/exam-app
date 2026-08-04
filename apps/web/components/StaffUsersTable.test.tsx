import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './ui';
import { StaffUsersTable } from './StaffUsersTable';

const users = [
  { id: 't1', organizationId: 'o1', email: 'rec@x.com', name: 'Rec One', role: 'recruiter', status: 'active', lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z' },
];

const mockImpersonate = jest.fn();
const mockPush = jest.fn();
const mockResetPasswordMutate = jest.fn();
let mockSsoStatus: { enabled: boolean } | undefined = { enabled: false };
jest.mock('../lib/auth-context', () => ({ useAuth: () => ({ impersonate: mockImpersonate }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../lib/hooks/useUsers', () => ({
  useUpdateUser: () => ({ mutate: jest.fn(), isPending: false }),
  useDeactivateUser: () => ({ mutate: jest.fn(), isPending: false }),
  useReactivateUser: () => ({ mutate: jest.fn(), isPending: false }),
  useResetUserPassword: () => ({ mutate: mockResetPasswordMutate, isPending: false }),
}));
jest.mock('../lib/hooks/useSso', () => ({
  useSsoStatus: () => ({ data: mockSsoStatus }),
}));

// ListView persists column visibility in localStorage; clear it so one test's
// hidden column does not leak into the next.
beforeEach(() => {
  localStorage.clear();
  mockImpersonate.mockReset();
  mockImpersonate.mockResolvedValue(undefined);
  mockPush.mockReset();
  mockResetPasswordMutate.mockReset();
  mockSsoStatus = { enabled: false };
});

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

it('navigates to the impersonated user\'s console after Login as, instead of being left on /users', async () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  renderTable({ users, currentUserRole: 'org_admin', isActingSuperAdmin: false, currentUserId: 'admin1' });
  await userEvent.click(screen.getByRole('button', { name: /login as/i }));
  expect(mockImpersonate).toHaveBeenCalledWith('t1');
  // The target is a recruiter, so we must land in the recruiter console -- otherwise the
  // (org-admin) route guard ejects the now-recruiter session straight to /login.
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  confirmSpy.mockRestore();
});

it('shows no row menu for a user the current user cannot manage', () => {
  const selfRow = [{ ...users[0], id: 'admin1', email: 'admin@x.com', role: 'org_admin' }];
  renderTable({ users: selfRow, currentUserRole: 'org_admin', isActingSuperAdmin: false, currentUserId: 'admin1' });
  // RowActions renders null for an empty action list, so gating produces no menu.
  expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
});

it('offers Reset password in the row menu when the org does not have SSO enabled', async () => {
  renderTable({ users, currentUserRole: 'org_admin', isActingSuperAdmin: false, currentUserId: 'admin1' });
  await userEvent.click(screen.getByRole('button', { name: /actions for rec@x.com/i }));
  expect(screen.getByText('Reset password')).toBeInTheDocument();
});

it('hides Reset password from the row menu when the org has SSO enabled', async () => {
  mockSsoStatus = { enabled: true };
  renderTable({ users, currentUserRole: 'org_admin', isActingSuperAdmin: false, currentUserId: 'admin1' });
  await userEvent.click(screen.getByRole('button', { name: /actions for rec@x.com/i }));
  expect(screen.queryByText('Reset password')).not.toBeInTheDocument();
  // The rest of the menu is unaffected.
  expect(screen.getByText('Edit')).toBeInTheDocument();
  expect(screen.getByText('Deactivate')).toBeInTheDocument();
});

it('shows a success toast when the reset email actually sends', async () => {
  mockResetPasswordMutate.mockImplementation((_id, { onSuccess }) => onSuccess({ success: true, emailSent: true }));
  renderTable({ users, currentUserRole: 'org_admin', isActingSuperAdmin: false, currentUserId: 'admin1' });
  await userEvent.click(screen.getByRole('button', { name: /actions for rec@x.com/i }));
  await userEvent.click(screen.getByText('Reset password'));
  expect(await screen.findByText('Password reset email sent to rec@x.com.')).toBeInTheDocument();
});

// Regression for ADO #6850: the request can succeed (token created) while the email itself
// fails to send -- this must surface as an error, not the same success toast as a real send.
it('shows an error toast when the reset request succeeds but the email fails to send', async () => {
  mockResetPasswordMutate.mockImplementation((_id, { onSuccess }) => onSuccess({ success: true, emailSent: false }));
  renderTable({ users, currentUserRole: 'org_admin', isActingSuperAdmin: false, currentUserId: 'admin1' });
  await userEvent.click(screen.getByRole('button', { name: /actions for rec@x.com/i }));
  await userEvent.click(screen.getByText('Reset password'));
  expect(await screen.findByText('Reset link created for rec@x.com, but the email failed to send.')).toBeInTheDocument();
});

it('filters rows by role and the item count follows', async () => {
  const mixed = [
    { ...users[0] },
    { ...users[0], id: 't2', email: 'admin@x.com', name: 'Admin Two', role: 'org_admin' },
  ];
  renderTable({ users: mixed, currentUserRole: 'org_admin', isActingSuperAdmin: false, currentUserId: 'admin1' });
  expect(screen.getByText(/2 items/)).toBeInTheDocument();

  // The role filter now lives in the Role column header (FilterableHeader), not a
  // separate toolbar Select.
  await userEvent.click(screen.getByRole('button', { name: 'Filter by Role' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Recruiter' }));

  expect(screen.getByText('rec@x.com')).toBeInTheDocument();
  expect(screen.queryByText('admin@x.com')).not.toBeInTheDocument();
  expect(screen.getByText(/1 item(?!s)/)).toBeInTheDocument();
});
