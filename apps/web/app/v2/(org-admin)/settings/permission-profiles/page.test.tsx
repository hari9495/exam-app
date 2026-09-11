import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as authContext from '../../../../../lib/auth-context';
import * as usePermissionProfilesHooks from '../../../../../lib/hooks/usePermissionProfiles';
import V2PermissionProfilesSettingsPage from './page';

jest.mock('../../../../../lib/auth-context');
jest.mock('../../../../../lib/hooks/usePermissionProfiles');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedUsePermissionProfiles = usePermissionProfilesHooks.usePermissionProfiles as jest.Mock;
const mockedUseAssignablePermissions = usePermissionProfilesHooks.useAssignablePermissions as jest.Mock;
const mockedUseCreatePermissionProfile = usePermissionProfilesHooks.useCreatePermissionProfile as jest.Mock;
const mockedUseUpdatePermissionProfile = usePermissionProfilesHooks.useUpdatePermissionProfile as jest.Mock;
const mockedUseDeletePermissionProfile = usePermissionProfilesHooks.useDeletePermissionProfile as jest.Mock;

const PROFILES = [
  { id: 'p1', name: 'Recruiter Lite', permissions: ['jobs:view'], assignedUserCount: 2 },
];

const ASSIGNABLE = [
  { key: 'jobs:view', description: 'View job postings' },
  { key: 'jobs:edit', description: 'Edit job postings' },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <V2PermissionProfilesSettingsPage />
    </QueryClientProvider>,
  );
}

describe('V2PermissionProfilesSettingsPage', () => {
  let createMutate: jest.Mock;
  let updateMutate: jest.Mock;
  let deleteMutate: jest.Mock;

  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ role: 'org_admin', actingSuperAdmin: false });
    mockedUsePermissionProfiles.mockReturnValue({ data: PROFILES, isLoading: false, isError: false });
    mockedUseAssignablePermissions.mockReturnValue({ data: ASSIGNABLE, isLoading: false });

    createMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseCreatePermissionProfile.mockReturnValue({ mutate: createMutate, isPending: false });

    updateMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseUpdatePermissionProfile.mockReturnValue({ mutate: updateMutate, isPending: false });

    deleteMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseDeletePermissionProfile.mockReturnValue({ mutate: deleteMutate, isPending: false });
  });

  it('denies access to non org_admin roles', () => {
    mockedUseAuth.mockReturnValue({ role: 'recruiter', actingSuperAdmin: false });
    renderPage();
    expect(screen.getByText(/don.t have access/i)).toBeInTheDocument();
    expect(screen.queryByText('Recruiter Lite')).not.toBeInTheDocument();
  });

  it('lists profiles returned by usePermissionProfiles', () => {
    renderPage();
    expect(screen.getByDisplayValue('Recruiter Lite')).toBeInTheDocument();
    expect(screen.getByText(/2 users assigned/)).toBeInTheDocument();
  });

  it('"Add profile" opens a dialog with assignable-permission checkboxes and descriptions', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /add profile/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('jobs:view')).toBeInTheDocument();
    expect(within(dialog).getByText('View job postings')).toBeInTheDocument();
    expect(within(dialog).getByText('jobs:edit')).toBeInTheDocument();
    expect(within(dialog).getByText('Edit job postings')).toBeInTheDocument();
  });

  it('creating a profile checks boxes and calls the create mutation with name + permissions', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /add profile/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Panel Basic' } });
    fireEvent.click(within(dialog).getByLabelText(/jobs:edit/));
    fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledWith(
      { name: 'Panel Basic', permissions: ['jobs:edit'] },
      expect.anything(),
    ));
  });

  it('editing an existing profile\'s permissions calls the update mutation', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /edit permissions of recruiter lite/i }));

    const dialog = screen.getByRole('dialog');
    // jobs:view starts checked (existing permission); toggle jobs:edit on too.
    fireEvent.click(within(dialog).getByLabelText(/jobs:edit/));
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledWith(
      { id: 'p1', permissions: ['jobs:view', 'jobs:edit'] },
      expect.anything(),
    ));
  });

  it('deleting a profile that still has assignees surfaces the 409 message', async () => {
    deleteMutate = jest.fn((_id, opts) => opts?.onError?.(Object.assign(new Error('Cannot delete: 2 user(s) are assigned to this profile'), { status: 409 })));
    mockedUseDeletePermissionProfile.mockReturnValue({ mutate: deleteMutate, isPending: false });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete recruiter lite/i }));

    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith('p1', expect.anything()));
    expect(await screen.findByText(/Cannot delete: 2 user\(s\) are assigned to this profile/)).toBeInTheDocument();
  });
});
