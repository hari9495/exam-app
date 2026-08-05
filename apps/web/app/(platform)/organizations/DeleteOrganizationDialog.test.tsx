import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteOrganizationDialog } from './DeleteOrganizationDialog';
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

function renderDialog({ organization = ACME as Organization | null, onClose = jest.fn(), deleteResponse }: {
  organization?: Organization | null;
  onClose?: jest.Mock;
  deleteResponse?: Response;
} = {}) {
  const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
  global.fetch = jest.fn(async (url: unknown, options?: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (options?.method === 'DELETE') {
      return deleteResponse ?? new Response(JSON.stringify({ id: 'org-1', status: 'deleted' }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <DeleteOrganizationDialog organization={organization} onClose={onClose} />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
  return onClose;
}

describe('DeleteOrganizationDialog', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders nothing when no organization is selected', () => {
    renderDialog({ organization: null });
    expect(screen.queryByRole('button', { name: 'Delete organization' })).not.toBeInTheDocument();
  });

  it('keeps Delete disabled until the slug is typed exactly', async () => {
    renderDialog();
    const confirm = screen.getByRole('button', { name: 'Delete organization' });
    const field = screen.getByLabelText(/Type acme To Confirm/);

    expect(confirm).toBeDisabled();

    await userEvent.type(field, 'acm');
    expect(confirm).toBeDisabled();

    await userEvent.type(field, 'e');
    expect(confirm).toBeEnabled();
  });

  it('does not accept a near-miss such as different casing', async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText(/Type acme To Confirm/), 'ACME');

    expect(screen.getByRole('button', { name: 'Delete organization' })).toBeDisabled();
  });

  it('states what will happen, including the row counts', () => {
    renderDialog();
    expect(screen.getByText(/12 users/)).toBeInTheDocument();
    expect(screen.getByText(/8 exams/)).toBeInTheDocument();
    expect(screen.getByText(/retained, not erased/)).toBeInTheDocument();
  });

  it('sends the delete and closes', async () => {
    const onClose = renderDialog();

    await userEvent.type(screen.getByLabelText(/Type acme To Confirm/), 'acme');
    await userEvent.click(screen.getByRole('button', { name: 'Delete organization' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const del = (global.fetch as jest.Mock).mock.calls.find(([, o]) => o?.method === 'DELETE');
    expect(String(del[0])).toContain('/organizations/org-1');
  });

  it('surfaces the live-exam conflict and stays open', async () => {
    // The 409 is the whole point of the server-side guard; dropping the operator
    // back to the list would hide why nothing happened.
    const onClose = renderDialog({
      deleteResponse: new Response(
        JSON.stringify({ message: 'Cannot delete this organization while 2 exams are in progress' }),
        { status: 409 },
      ),
    });

    await userEvent.type(screen.getByLabelText(/Type acme To Confirm/), 'acme');
    await userEvent.click(screen.getByRole('button', { name: 'Delete organization' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('2 exams are in progress'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
