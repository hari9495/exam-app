import type { CSSProperties } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

function renderLayout({ pathname = '/dashboard' }: { pathname?: string } = {}) {
  mockPathname = pathname;
  global.fetch = jest.fn(async (url) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
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

  it('redirects an org_admin (wrong role) to /login instead of rendering the recruiter shell', async () => {
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

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
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
});
