import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrgAdminLayout from './layout';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/users' }));

describe('Org admin layout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('renders the org-admin sidebar nav links for an org_admin', async () => {
    const orgAdminToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: orgAdminToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <OrgAdminLayout>
            <p>Page content</p>
          </OrgAdminLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Staff Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Org Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit Log' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Candidate Data Rights' })).toBeInTheDocument();
  });

  it('redirects a recruiter (wrong role) to /login instead of rendering the org-admin shell', async () => {
    const recruiterToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'recruiter' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: recruiterToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <OrgAdminLayout>
            <p>Page content</p>
          </OrgAdminLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    expect(screen.queryByRole('link', { name: 'Staff Users' })).not.toBeInTheDocument();
  });

  it('renders each nav item with an icon and marks the active route via text-primary', async () => {
    const orgAdminToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: orgAdminToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <OrgAdminLayout>
            <p>Page content</p>
          </OrgAdminLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    const usersLink = await screen.findByRole('link', { name: 'Staff Users' });
    expect(usersLink.className).toContain('text-primary');
    const auditLink = screen.getByRole('link', { name: 'Audit Log' });
    expect(auditLink.className).not.toContain('text-primary');
  });

  it('logs out and redirects to /login when the logout button is clicked', async () => {
    const orgAdminToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: orgAdminToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <OrgAdminLayout>
            <p>Page content</p>
          </OrgAdminLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    const logoutButton = await screen.findByRole('button', { name: 'Log out' });
    await userEvent.click(logoutButton);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    const logoutCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).endsWith('/auth/logout'));
    expect(logoutCall).toBeDefined();
  });
});
