import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRolePermissionMatrix, useSetRolePermissions, useResetRolePermissions } from '../../../../../lib/hooks/useRolePermissions';
import V2RolesPage from './page';

jest.mock('../../../../../lib/hooks/useRolePermissions', () => ({
  useRolePermissionMatrix: jest.fn(),
  useSetRolePermissions: jest.fn(),
  useResetRolePermissions: jest.fn(),
}));

const MATRIX = {
  assignablePermissions: [
    { key: 'org:view', description: 'View org' },
    { key: 'results:view', description: 'View results' },
  ],
  roles: [
    { role: 'hiring_manager', permissions: ['org:view'], customized: false },
    { role: 'recruiter', permissions: ['org:view', 'results:view'], customized: false },
    { role: 'panel', permissions: ['org:view'], customized: true },
  ],
};

describe('V2RolesPage', () => {
  const setMutateAsync = jest.fn().mockResolvedValue(MATRIX);
  const resetMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRolePermissionMatrix as jest.Mock).mockReturnValue({ data: MATRIX });
    (useSetRolePermissions as jest.Mock).mockReturnValue({ mutateAsync: setMutateAsync, isPending: false });
    (useResetRolePermissions as jest.Mock).mockReturnValue({ mutate: resetMutate, isPending: false });
  });

  it('renders a column per editable role and reflects the current grants', () => {
    render(<V2RolesPage />);
    expect(screen.getByText('Hiring Manager')).toBeInTheDocument();
    expect(screen.getByText('Recruiter')).toBeInTheDocument();
    expect(screen.getByText('Interview Panel')).toBeInTheDocument();
    // recruiter has results:view, hiring_manager does not
    expect(screen.getByLabelText('Recruiter: View results')).toBeChecked();
    expect(screen.getByLabelText('Hiring Manager: View results')).not.toBeChecked();
  });

  it('shows Reset only for a customized role', () => {
    render(<V2RolesPage />);
    // panel is customized -> a reset control exists; there is exactly one
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(resetMutate).toHaveBeenCalledWith('panel');
  });

  it('Save is disabled until a checkbox changes, then saves only the changed role', async () => {
    render(<V2RolesPage />);
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Hiring Manager: View results')); // grant it
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(setMutateAsync).toHaveBeenCalledTimes(1));
    expect(setMutateAsync).toHaveBeenCalledWith({ role: 'hiring_manager', permissions: ['org:view', 'results:view'] });
  });
});
