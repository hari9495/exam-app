import { render, screen, waitFor } from '@testing-library/react';
import RecruiterLayout from './layout';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/dashboard' }));

describe('Recruiter layout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('renders the sidebar nav links', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
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
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exams' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Question Bank' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Candidates' })).toBeInTheDocument();
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
});
