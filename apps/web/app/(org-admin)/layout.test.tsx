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
    expect(screen.getByRole('link', { name: 'Brand Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit Log' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Candidate Data Rights' })).toBeInTheDocument();
  });

  it('sends an authenticated recruiter (wrong console) to their own console, not to /login', async () => {
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

    // A logged-in recruiter who lands here (e.g. mid Login-as/return) goes to /dashboard, not /login.
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(mockPush).not.toHaveBeenCalledWith('/login');
    expect(screen.queryByRole('link', { name: 'Staff Users' })).not.toBeInTheDocument();
  });

  it('admits an acting super_admin (role=super_admin, actingSuperAdmin=true) without redirecting, and shows cross-shell nav links', async () => {
    const actingToken = fakeJwt({
      sub: 'u1',
      organizationId: 'org1',
      role: 'super_admin',
      actingSuperAdmin: true,
      actingOrgName: 'Acme Inc',
    });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: actingToken }), { status: 200 });
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
    expect(mockPush).not.toHaveBeenCalledWith('/login');
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Exams/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Question Bank/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Candidates/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Results' })).toBeInTheDocument();
  });

  it('shows the full feature nav (recruiter/panel features included) for a normal org_admin', async () => {
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

    // org_admin is a full org superuser: it now sees the recruiter/panel features too.
    await screen.findByRole('link', { name: 'Staff Users' });
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Exams/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Results' })).toBeInTheDocument();
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

    const logoutButton = await screen.findByRole('button', { name: 'Log Out' });
    await userEvent.click(logoutButton);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    const logoutCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).endsWith('/auth/logout'));
    expect(logoutCall).toBeDefined();
  });

  it('renders the real name from /users/me when one is set', async () => {
    const orgAdminToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: orgAdminToken }), { status: 200 });
      }
      if (String(url).endsWith('/users/me')) {
        return new Response(JSON.stringify({ id: 'u1', email: 'a@b.com', name: 'Jane Admin', role: 'org_admin' }), {
          status: 200,
        });
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

    expect(await screen.findByText('Jane Admin')).toBeInTheDocument();
  });

  it('links the avatar/name block to /profile', async () => {
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

    const profileLink = await screen.findByRole('link', { name: /Org Admin/i });
    expect(profileLink).toHaveAttribute('href', '/profile');
  });
});
