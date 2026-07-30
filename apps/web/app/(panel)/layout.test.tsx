import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PanelLayout from './layout';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/reports' }));

describe('Panel layout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  function renderLayout(role = 'panel') {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    return render(
      <QueryProvider>
        <AuthProvider>
          <PanelLayout>
            <p>Page content</p>
          </PanelLayout>
        </AuthProvider>
      </QueryProvider>,
    );
  }

  it('renders the top bar nav link for a panel user', async () => {
    renderLayout();
    expect(await screen.findByRole('link', { name: 'Exams' })).toBeInTheDocument();
  });

  // The /reports routes live in this route group and a URL can only be served by one
  // group, so recruiters are admitted here rather than duplicating every reports page.
  // They hold results:view already; redirecting them was what left recruiters with no
  // way to see scores, pass/fail, or the results export at all.
  it('admits a recruiter and offers links back to their own console', async () => {
    renderLayout('recruiter');
    // For a recruiter the /reports link reads "Results", so it doesn't collide with the
    // "Exams" link back to their own console.
    expect(await screen.findByRole('link', { name: 'Results' })).toHaveAttribute('href', '/reports');
    expect(mockPush).not.toHaveBeenCalledWith('/login');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exams' })).toHaveAttribute('href', '/exams');
    expect(screen.getByRole('link', { name: 'Candidates' })).toBeInTheDocument();
  });

  it('sends an unrelated authenticated role (org_admin) to their own console, not to /login', async () => {
    renderLayout('org_admin');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/users'));
    expect(mockPush).not.toHaveBeenCalledWith('/login');
    expect(screen.queryByRole('link', { name: 'Exams' })).not.toBeInTheDocument();
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
          <PanelLayout>
            <p>Page content</p>
          </PanelLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Exams' })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalledWith('/login');
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Question Bank/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Candidates/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Staff Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit Log' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Candidate Data Rights' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Org Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Single Sign-On' })).toBeInTheDocument();
  });

  it('does not show cross-shell nav links for a normal (non-acting) panel user', async () => {
    renderLayout();
    await screen.findByRole('link', { name: 'Exams' });
    expect(screen.queryByRole('link', { name: 'Staff Users' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Dashboard/i })).not.toBeInTheDocument();
  });

  it('logs out and redirects to /login when the logout button is clicked', async () => {
    renderLayout();
    const logoutButton = await screen.findByRole('button', { name: 'Log out' });

    await userEvent.click(logoutButton);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    const logoutCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).endsWith('/auth/logout'));
    expect(logoutCall).toBeDefined();
  });

  it('renders the real name from /users/me when one is set', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'panel' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (String(url).endsWith('/users/me')) {
        return new Response(JSON.stringify({ id: 'u1', email: 'a@b.com', name: 'Jane Panel', role: 'panel' }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <PanelLayout>
            <p>Page content</p>
          </PanelLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    expect(await screen.findByText('Jane Panel')).toBeInTheDocument();
  });

  it('links the avatar/name block to /profile', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'panel' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <PanelLayout>
            <p>Page content</p>
          </PanelLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    const profileLink = await screen.findByRole('link', { name: /Panel/i });
    expect(profileLink).toHaveAttribute('href', '/profile');
  });
});
