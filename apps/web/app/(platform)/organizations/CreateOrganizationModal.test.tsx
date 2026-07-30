import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateOrganizationModal } from './CreateOrganizationModal';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';

function renderModal({ open = true, onClose = jest.fn(), createResponse }: {
  open?: boolean;
  onClose?: jest.Mock;
  createResponse?: Response;
} = {}) {
  const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
  global.fetch = jest.fn(async (url: unknown, options?: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (String(url).endsWith('/organizations') && options?.method === 'POST') {
      return (
        createResponse ??
        new Response(JSON.stringify({ id: 'org-2', name: 'Beta', slug: 'beta' }), { status: 200 })
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <CreateOrganizationModal open={open} onClose={onClose} />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
  return onClose;
}

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText('Name'), 'Beta');
  await userEvent.type(screen.getByLabelText('Slug'), 'beta');
  await userEvent.type(screen.getByLabelText('Admin email'), 'admin@beta.test');
  await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));
}

describe('CreateOrganizationModal', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders nothing when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('posts the entered fields and closes on success', async () => {
    const onClose = renderModal();

    await fillAndSubmit();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const post = (global.fetch as jest.Mock).mock.calls.find(
      ([url, options]) => String(url).endsWith('/organizations') && options?.method === 'POST',
    );
    expect(JSON.parse(post[1].body)).toEqual({
      name: 'Beta',
      slug: 'beta',
      region: 'us',
      adminEmail: 'admin@beta.test',
    });
  });

  it('shows the server error and stays open on failure', async () => {
    // A slug clash is the common case here, and closing the modal would throw
    // away everything the operator typed.
    const onClose = renderModal({
      createResponse: new Response(JSON.stringify({ message: 'Slug already taken' }), { status: 409 }),
    });

    await fillAndSubmit();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Slug already taken'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveValue('Beta');
  });
});
