import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditOrganizationModal } from './EditOrganizationModal';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';
import { Organization } from '../../../lib/types';

const ACME: Organization = {
  id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  primaryAdminName: 'Ada', primaryAdminEmail: 'ada@acme.test', userCount: 12, examCount: 8,
};

const BETA: Organization = { ...ACME, id: 'org-2', name: 'Beta', slug: 'beta', region: 'eu' };

function renderModal({ organization = ACME as Organization | null, onClose = jest.fn(), patchResponse }: {
  organization?: Organization | null;
  onClose?: jest.Mock;
  patchResponse?: Response;
} = {}) {
  const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
  global.fetch = jest.fn(async (url: unknown, options?: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (options?.method === 'PATCH') {
      return patchResponse ?? new Response(JSON.stringify({ ...ACME, name: 'Acme Inc' }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  const view = render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <EditOrganizationModal organization={organization} onClose={onClose} />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
  return { onClose, view };
}

describe('EditOrganizationModal', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders nothing when no organization is selected', () => {
    renderModal({ organization: null });
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('prefills from the organization and shows the slug as read-only', () => {
    renderModal();
    expect(screen.getByLabelText('Name')).toHaveValue('Acme');
    expect(screen.getByText('acme')).toBeInTheDocument();
    // The slug is immutable -- it appears in invitation URLs and SAML entity IDs.
    expect(screen.queryByLabelText('Slug')).not.toBeInTheDocument();
  });

  it('patches only name and region, then closes', async () => {
    const { onClose } = renderModal();

    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Acme Inc');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const patch = (global.fetch as jest.Mock).mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(String(patch[0])).toContain('/organizations/org-1');
    expect(JSON.parse(patch[1].body)).toEqual({ name: 'Acme Inc', region: 'us' });
  });

  it('re-seeds the fields when a different organization is selected', async () => {
    // The modal stays mounted between row selections; without re-seeding, the
    // second row opened would show the first row's values and could save them
    // onto the wrong organization.
    const { view } = renderModal();
    expect(screen.getByLabelText('Name')).toHaveValue('Acme');

    view.rerender(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <EditOrganizationModal organization={BETA} onClose={jest.fn()} />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Beta'));
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('shows the server error and stays open on failure', async () => {
    const { onClose } = renderModal({
      patchResponse: new Response(JSON.stringify({ message: 'Name already in use' }), { status: 409 }),
    });

    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Acme Inc');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Name already in use'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveValue('Acme Inc');
  });
});
