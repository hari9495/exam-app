import { render, screen, fireEvent } from '@testing-library/react';
import type { FieldPermissionConfig } from '../../../../../lib/types';
import { useFieldPermissions, useUpdateFieldPermissions } from '../../../../../lib/hooks/useFieldPermissions';
import V2FieldPermissionsSettingsPage from './page';

jest.mock('../../../../../lib/hooks/useFieldPermissions', () => ({
  useFieldPermissions: jest.fn(),
  useUpdateFieldPermissions: jest.fn(),
}));

const SEEDED_CONFIG: FieldPermissionConfig = {
  candidate: { recruiter: ['email'] },
  job: { panel: ['salaryMin', 'salaryMax'] },
};

describe('V2FieldPermissionsSettingsPage', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    mutate.mockClear();
    (useUpdateFieldPermissions as jest.Mock).mockReturnValue({ mutate, isPending: false });
  });

  it('renders a checkbox for every (entity, field, role) triple', () => {
    (useFieldPermissions as jest.Mock).mockReturnValue({ data: {}, isLoading: false });

    render(<V2FieldPermissionsSettingsPage />);

    for (const field of ['email', 'phone']) {
      for (const role of ['recruiter', 'panel']) {
        expect(screen.getByLabelText(`candidate ${field} hidden from ${role}`)).toBeInTheDocument();
      }
    }
    for (const field of ['salaryMin', 'salaryMax', 'salaryCurrency', 'headcount']) {
      for (const role of ['recruiter', 'panel']) {
        expect(screen.getByLabelText(`job ${field} hidden from ${role}`)).toBeInTheDocument();
      }
    }
  });

  it('renders the seeded config as checked boxes and leaves the rest unchecked', () => {
    (useFieldPermissions as jest.Mock).mockReturnValue({ data: SEEDED_CONFIG, isLoading: false });

    render(<V2FieldPermissionsSettingsPage />);

    expect(screen.getByLabelText('candidate email hidden from recruiter')).toBeChecked();
    expect(screen.getByLabelText('candidate email hidden from panel')).not.toBeChecked();
    expect(screen.getByLabelText('candidate phone hidden from recruiter')).not.toBeChecked();
    expect(screen.getByLabelText('job salaryMin hidden from panel')).toBeChecked();
    expect(screen.getByLabelText('job salaryMax hidden from panel')).toBeChecked();
    expect(screen.getByLabelText('job salaryMin hidden from recruiter')).not.toBeChecked();
  });

  it('toggling a checkbox and Save calls the mutation with the assembled config', () => {
    (useFieldPermissions as jest.Mock).mockReturnValue({ data: SEEDED_CONFIG, isLoading: false });

    render(<V2FieldPermissionsSettingsPage />);
    fireEvent.click(screen.getByLabelText('candidate phone hidden from panel'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0] as FieldPermissionConfig;
    expect(payload.candidate?.recruiter).toEqual(['email']);
    expect(payload.candidate?.panel).toEqual(['phone']);
    expect(payload.job?.panel?.sort()).toEqual(['salaryMax', 'salaryMin']);
    expect(payload.job?.recruiter).toBeUndefined();
  });

  it('unchecking the only field for a role omits that role (and entity if now empty) from the payload', () => {
    (useFieldPermissions as jest.Mock).mockReturnValue({ data: SEEDED_CONFIG, isLoading: false });

    render(<V2FieldPermissionsSettingsPage />);
    fireEvent.click(screen.getByLabelText('candidate email hidden from recruiter'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const payload = mutate.mock.calls[0][0] as FieldPermissionConfig;
    expect(payload.candidate).toBeUndefined();
  });
});
