import { render, screen, fireEvent } from '@testing-library/react';
import type { FieldPermissionConfig } from '../../../../../lib/types';
import { useFieldPermissions, useUpdateFieldPermissions } from '../../../../../lib/hooks/useFieldPermissions';
import V2FieldPermissionsSettingsPage from './page';

jest.mock('../../../../../lib/hooks/useFieldPermissions', () => ({
  useFieldPermissions: jest.fn(),
  useUpdateFieldPermissions: jest.fn(),
}));

const SEEDED_CONFIG: FieldPermissionConfig = {
  candidate: { recruiter: { email: 'hidden' } },
  job: { panel: { salaryMin: 'readonly', salaryMax: 'hidden' } },
};

const cell = (entity: string, field: string, role: string) => screen.getByLabelText(`${entity} ${field} access for ${role}`);

describe('V2FieldPermissionsSettingsPage', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    mutate.mockClear();
    (useUpdateFieldPermissions as jest.Mock).mockReturnValue({ mutate, isPending: false });
  });

  it('renders a 3-way access selector for every (entity, field, role) triple, defaulting to Editable', () => {
    (useFieldPermissions as jest.Mock).mockReturnValue({ data: {}, isLoading: false });

    render(<V2FieldPermissionsSettingsPage />);

    for (const field of ['email', 'phone']) {
      for (const role of ['recruiter', 'panel', 'hiring_manager']) {
        expect(cell('candidate', field, role)).toHaveValue('');
      }
    }
    for (const field of ['salaryMin', 'department', 'fitRubric']) {
      expect(cell('job', field, 'hiring_manager')).toHaveValue('');
    }
  });

  it('reflects the seeded config (readonly / hidden / editable) in the selectors', () => {
    (useFieldPermissions as jest.Mock).mockReturnValue({ data: SEEDED_CONFIG, isLoading: false });

    render(<V2FieldPermissionsSettingsPage />);

    expect(cell('candidate', 'email', 'recruiter')).toHaveValue('hidden');
    expect(cell('candidate', 'email', 'panel')).toHaveValue('');
    expect(cell('job', 'salaryMin', 'panel')).toHaveValue('readonly');
    expect(cell('job', 'salaryMax', 'panel')).toHaveValue('hidden');
    expect(cell('job', 'salaryMin', 'recruiter')).toHaveValue('');
  });

  it('changing a selector and Save calls the mutation with the assembled level map', () => {
    (useFieldPermissions as jest.Mock).mockReturnValue({ data: SEEDED_CONFIG, isLoading: false });

    render(<V2FieldPermissionsSettingsPage />);
    fireEvent.change(cell('candidate', 'phone', 'panel'), { target: { value: 'readonly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0] as FieldPermissionConfig;
    expect(payload.candidate?.recruiter).toEqual({ email: 'hidden' });
    expect(payload.candidate?.panel).toEqual({ phone: 'readonly' });
    expect(payload.job?.panel).toEqual({ salaryMin: 'readonly', salaryMax: 'hidden' });
    expect(payload.job?.recruiter).toBeUndefined();
  });

  it('setting the only governed field of a role back to Editable omits that role (and entity if now empty)', () => {
    (useFieldPermissions as jest.Mock).mockReturnValue({ data: SEEDED_CONFIG, isLoading: false });

    render(<V2FieldPermissionsSettingsPage />);
    fireEvent.change(cell('candidate', 'email', 'recruiter'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const payload = mutate.mock.calls[0][0] as FieldPermissionConfig;
    expect(payload.candidate).toBeUndefined();
  });

  it('governs the hiring_manager role and the new job fields, with friendly labels', () => {
    (useFieldPermissions as jest.Mock).mockReturnValue({ data: {}, isLoading: false });
    render(<V2FieldPermissionsSettingsPage />);
    expect(cell('candidate', 'email', 'hiring_manager')).toBeInTheDocument();
    for (const field of ['department', 'fitCriteria', 'fitRubric']) {
      expect(cell('job', field, 'hiring_manager')).toBeInTheDocument();
    }
    expect(screen.getAllByText('Hiring Manager').length).toBeGreaterThan(0);
    expect(screen.getByText('Fit rubric')).toBeInTheDocument();
    // the Read-only option exists on a selector
    expect(screen.getAllByRole('option', { name: 'Read-only' }).length).toBeGreaterThan(0);
  });
});
