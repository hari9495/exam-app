import type { CSSProperties } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecruiterLayout from './layout';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
let mockPathname = '/dashboard';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => mockPathname }));

// jsdom's cssstyle parser drops unsupported style values (e.g. color-mix()) instead of
// keeping them, so assertions on the parsed DOM style attribute can't see them. Read the
// raw style object React attached to the fiber instead.
function getReactStyleProp(el: Element): CSSProperties | undefined {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  return key ? (el as unknown as Record<string, { style?: CSSProperties }>)[key].style : undefined;
}

function renderLayout({ pathname = '/dashboard', userName = null }: { pathname?: string; userName?: string | null } = {}) {
  mockPathname = pathname;
  global.fetch = jest.fn(async (url) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
    }
    if (String(url).endsWith('/users/me')) {
      return new Response(JSON.stringify({ id: 'u1', email: 'a@b.com', name: userName, role: 'recruiter' }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  return render(
    <QueryProvider>
      <AuthProvider>
        <RecruiterLayout>
          <p>Page content</p>
        </RecruiterLayout>
      </AuthProvider>
    </QueryProvider>,
  );
}

describe('Recruiter layout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
    mockPathname = '/dashboard';
  });

  it('renders the sidebar nav links', async () => {
    renderLayout();
    expect(await screen.findByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Exams/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Question Bank/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Candidates/i })).toBeInTheDocument();
  });

  it('admits an org_admin (full org superuser) into the recruiter console with the full feature nav', async () => {
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
          <RecruiterLayout>
            <p>Page content</p>
          </RecruiterLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    // org_admin is a full org superuser: admitted here (not bounced), seeing the complete union
    // including admin-only links like Staff Users.
    expect(await screen.findByRole('link', { name: 'Staff Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalledWith('/login');
    expect(mockPush).not.toHaveBeenCalledWith('/users');
    // Regression: this shell hardcoded "Recruiter" in the profile footer regardless of the
    // real role, so an org_admin using the recruiter console (Exams, Dashboard, etc.) saw
    // their own label say "Recruiter" even with the full admin nav showing beside it.
    // getAllByText, not getByText: this mock never resolves a /users/me name, so displayName
    // also falls back to the same roleLabel string, matching a second element.
    expect(screen.getAllByText('Org Admin').length).toBeGreaterThan(0);
    expect(screen.queryByText('Recruiter')).not.toBeInTheDocument();
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
          <RecruiterLayout>
            <p>Page content</p>
          </RecruiterLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    expect(await screen.findByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalledWith('/login');
    expect(screen.getByRole('link', { name: 'Staff Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit Log' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Candidate Data Rights' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Org Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Single Sign-On' })).toBeInTheDocument();
    // Same mislabel regression as the org_admin case above -- an acting super_admin is
    // presented as an org admin (matching the (org-admin) shell's own convention), not "Recruiter".
    expect(screen.getAllByText('Org Admin').length).toBeGreaterThan(0);
  });

  it('does not show cross-shell nav links for a normal (non-acting) recruiter', async () => {
    renderLayout();
    await screen.findByRole('link', { name: /Dashboard/i });
    expect(screen.queryByRole('link', { name: 'Staff Users' })).not.toBeInTheDocument();
  });

  // Regression: Results sat in the acting-super-admin-only group, so a plain recruiter had
  // no route to scores, pass/fail, or the CSV/XLSX/PDF export -- even though the recruiter
  // role already carries results:view.
  it('shows the Results link to a normal recruiter', async () => {
    renderLayout();
    expect(await screen.findByRole('link', { name: 'Results' })).toHaveAttribute('href', '/reports');
  });

  it('shows the Walk-in Groups link to a normal recruiter', async () => {
    renderLayout();
    expect(await screen.findByRole('link', { name: 'Walk-in Groups' })).toHaveAttribute('href', '/walk-in-groups');
  });

  it('renders each nav item with an icon and marks the active route', async () => {
    renderLayout({ pathname: '/exams' });
    const examsLink = await screen.findByRole('link', { name: /Exams/i });
    expect(examsLink.className).toContain('text-primary');
    // jsdom's CSS parser silently drops unsupported functions like color-mix() from
    // the DOM style attribute, so read the raw style prop React attached instead.
    expect(getReactStyleProp(examsLink)?.backgroundColor).toContain('color-mix');
    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    expect(dashboardLink.className).not.toContain('text-primary');
    expect(getReactStyleProp(dashboardLink)).toBeUndefined();
  });

  it('renders a user footer with the current user name and role', async () => {
    renderLayout({ pathname: '/dashboard' });
    // useAuth() has no userName field yet, so both the name and role fall back to 'Recruiter'.
    const matches = await screen.findAllByText(/Recruiter/i);
    expect(matches.length).toBeGreaterThan(0);
    const avatar = document.querySelector('.rounded-full');
    expect(avatar?.className).toContain('h-7');
    expect(avatar?.className).toContain('w-7');
  });

  it('logs out and redirects to /login when the logout button is clicked', async () => {
    renderLayout();
    const logoutButton = await screen.findByRole('button', { name: 'Log Out' });

    await userEvent.click(logoutButton);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    const logoutCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).endsWith('/auth/logout'));
    expect(logoutCall).toBeDefined();
  });

  it('renders the real name from /users/me when one is set', async () => {
    renderLayout({ userName: 'Jane Recruiter' });
    expect(await screen.findByText('Jane Recruiter')).toBeInTheDocument();
  });

  it('links the avatar/name block to /profile', async () => {
    renderLayout();
    const profileLink = await screen.findByRole('link', { name: /Recruiter/i });
    expect(profileLink).toHaveAttribute('href', '/profile');
  });
});
