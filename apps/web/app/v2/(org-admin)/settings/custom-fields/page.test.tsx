import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import V2CustomFieldsSettingsPage from './page';
import { QueryProvider } from '../../../../../lib/query-provider';
import type { CustomFieldDefinition } from '../../../../../lib/types';

jest.mock('../../../../../lib/auth-context', () => ({
  useAuth: () => ({ role: 'org_admin', actingSuperAdmin: false, accessToken: 'test-token' }),
}));

const createMutate = jest.fn();
const updateMutate = jest.fn();
const archiveMutate = jest.fn();

const CANDIDATE_FIELDS: CustomFieldDefinition[] = [
  {
    id: 'cf-1', organizationId: 'org-1', entityType: 'candidate', key: 't_shirt_size', label: 'T-Shirt Size',
    fieldType: 'select', options: ['S', 'M', 'L'], required: false, showOnApply: true, position: 0,
    archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const JOB_FIELDS: CustomFieldDefinition[] = [
  {
    id: 'cf-2', organizationId: 'org-1', entityType: 'job', key: 'cost_center', label: 'Cost Center',
    fieldType: 'text', options: null, required: true, showOnApply: false, position: 0,
    archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  },
];

jest.mock('../../../../../lib/hooks/useCustomFields', () => ({
  useCustomFields: (entityType: 'candidate' | 'job') => ({
    data: entityType === 'candidate' ? CANDIDATE_FIELDS : JOB_FIELDS,
    isLoading: false,
    isError: false,
  }),
  useCreateCustomField: () => ({ mutate: createMutate, isPending: false }),
  useUpdateCustomField: () => ({ mutate: updateMutate, isPending: false }),
  useArchiveCustomField: () => ({ mutate: archiveMutate, isPending: false }),
}));

function renderPage() {
  return render(
    <QueryProvider>
      <V2CustomFieldsSettingsPage />
    </QueryProvider>,
  );
}

describe('V2CustomFieldsSettingsPage', () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
    archiveMutate.mockClear();
  });

  it('lists fields for both the Candidate and Job toggles', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText('T-Shirt Size')).toBeInTheDocument();
    expect(screen.queryByText('Cost Center')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Job' }));

    expect(screen.getByText('Cost Center')).toBeInTheDocument();
    expect(screen.queryByText('T-Shirt Size')).not.toBeInTheDocument();
  });

  it('opens the add-field dialog and triggers the create mutation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Add field/ }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Label'), 'Referral Source');
    await user.click(within(dialog).getByRole('button', { name: 'Add field' }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      entityType: 'candidate',
      label: 'Referral Source',
      fieldType: 'text',
    });
  });
});
