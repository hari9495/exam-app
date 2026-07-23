import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrganizationsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

function renderPage() {
  const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
  const actingToken = fakeJwt({ sub: 'u1', organizationId: 'org-1', role: 'super_admin', actingSuperAdmin: true, actingOrgName: 'Acme' });
  global.fetch = jest.fn(async (url, options) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (String(url).includes('/organizations') && (!options || options.method === undefined)) {
      return new Response(
        JSON.stringify({
          data: [{ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', createdAt: '2026-01-01T00:00:00.000Z' }],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        }),
        { status: 200 },
      );
    }
    if (String(url).endsWith('/organizations') && options?.method === 'POST') {
      return new Response(
        JSON.stringify({ id: 'org-2', name: 'Beta', slug: 'beta', region: 'us', createdAt: '2026-01-02T00:00:00.000Z' }),
        { status: 200 },
      );
    }
    if (String(url).endsWith('/auth/super-admin/switch-into/org-1') && options?.method === 'POST') {
      return new Response(JSON.stringify({ accessToken: actingToken }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  return render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <OrganizationsPage />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
}

describe('OrganizationsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('lists existing organizations', async () => {
    renderPage();
    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('acme')).toBeInTheDocument();
  });

  it('submits the create-organization form with the entered fields', async () => {
    renderPage();
    await screen.findByText('Acme');
    await userEvent.type(screen.getByLabelText('Name'), 'Beta');
    await userEvent.type(screen.getByLabelText('Slug'), 'beta');
    await userEvent.type(screen.getByLabelText('Admin email'), 'admin@beta.test');
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => {
      const postCall = (global.fetch as jest.Mock).mock.calls.find(
        ([url, options]) => String(url).endsWith('/organizations') && options?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(postCall[1].body)).toEqual({
        name: 'Beta',
        slug: 'beta',
        region: 'us',
        adminEmail: 'admin@beta.test',
      });
    });
  });

  it('switches into an organization when "Switch into" is clicked', async () => {
    renderPage();
    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: /switch into/i }));

    await waitFor(() => {
      const switchCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
        String(url).endsWith('/auth/super-admin/switch-into/org-1'),
      );
      expect(switchCall).toBeDefined();
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });
});
