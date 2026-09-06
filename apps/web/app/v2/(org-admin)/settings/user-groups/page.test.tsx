import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as authContext from '../../../../../lib/auth-context';
import * as useUserGroupsHooks from '../../../../../lib/hooks/useUserGroups';
import * as useUserDirectoryHooks from '../../../../../lib/hooks/useUserDirectory';
import V2UserGroupsSettingsPage from './page';

jest.mock('../../../../../lib/auth-context');
jest.mock('../../../../../lib/hooks/useUserGroups');
jest.mock('../../../../../lib/hooks/useUserDirectory');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedUseUserGroups = useUserGroupsHooks.useUserGroups as jest.Mock;
const mockedUseCreateUserGroup = useUserGroupsHooks.useCreateUserGroup as jest.Mock;
const mockedUseUpdateUserGroup = useUserGroupsHooks.useUpdateUserGroup as jest.Mock;
const mockedUseSetGroupMembers = useUserGroupsHooks.useSetGroupMembers as jest.Mock;
const mockedUseDeleteUserGroup = useUserGroupsHooks.useDeleteUserGroup as jest.Mock;
const mockedUseTeammates = useUserDirectoryHooks.useTeammates as jest.Mock;

const GROUPS = [
  { id: 'g1', name: 'Interviewers', description: 'Panel interviewers', members: [{ userId: 'u1', name: 'Ann', email: 'ann@x.com' }] },
];

const TEAMMATES = [
  { id: 'u1', email: 'ann@x.com', name: 'Ann', organizationId: 'org1', role: 'recruiter', status: 'active', managerId: null, lastLoginAt: null, createdAt: '', organizationName: 'Org' },
  { id: 'u2', email: 'bob@x.com', name: 'Bob', organizationId: 'org1', role: 'recruiter', status: 'active', managerId: null, lastLoginAt: null, createdAt: '', organizationName: 'Org' },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <V2UserGroupsSettingsPage />
    </QueryClientProvider>,
  );
}

describe('V2UserGroupsSettingsPage', () => {
  let createMutate: jest.Mock;
  let setMembersMutate: jest.Mock;

  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ role: 'org_admin', actingSuperAdmin: false });
    mockedUseUserGroups.mockReturnValue({ data: GROUPS, isLoading: false, isError: false });
    mockedUseTeammates.mockReturnValue({ data: TEAMMATES, isLoading: false });

    createMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseCreateUserGroup.mockReturnValue({ mutate: createMutate, isPending: false });

    setMembersMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseSetGroupMembers.mockReturnValue({ mutate: setMembersMutate, isPending: false });

    mockedUseUpdateUserGroup.mockReturnValue({ mutate: jest.fn(), isPending: false });
    mockedUseDeleteUserGroup.mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  it('denies access to non org_admin roles', () => {
    mockedUseAuth.mockReturnValue({ role: 'recruiter', actingSuperAdmin: false });
    renderPage();
    expect(screen.getByText(/don.t have access/i)).toBeInTheDocument();
    expect(screen.queryByText('Interviewers')).not.toBeInTheDocument();
  });

  it('lists groups returned by useUserGroups', () => {
    renderPage();
    expect(screen.getByDisplayValue('Interviewers')).toBeInTheDocument();
    expect(screen.getByText(/Panel interviewers/)).toBeInTheDocument();
    expect(screen.getByText(/1 member: Ann/)).toBeInTheDocument();
  });

  it('"Add group" opens the dialog and submitting calls the create mutation', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /add group/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Panelists' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledWith(
      { name: 'Panelists', description: undefined },
      expect.anything(),
    ));
  });

  it('editing members calls useSetGroupMembers with the toggled selection', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /edit members of interviewers/i }));

    // Ann is already a member (checked); toggle Bob on too.
    fireEvent.click(screen.getByLabelText(/bob@x.com/));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(setMembersMutate).toHaveBeenCalledWith(
      { groupId: 'g1', userIds: ['u1', 'u2'] },
      expect.anything(),
    ));
  });
});
