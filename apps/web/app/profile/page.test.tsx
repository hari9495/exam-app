import { render, screen, waitFor } from '@testing-library/react';
import ProfilePage from './page';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { ToastProvider } from '../../components/ui';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

function mockFetchWithToken(token: string | null) {
  global.fetch = jest.fn(async (url) => {
    if (String(url).endsWith('/auth/refresh')) {
      if (!token) {
        return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
      }
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (String(url).endsWith('/users/me')) {
      return new Response(JSON.stringify({ id: 'u1', email: 'a@b.com', name: null, role: 'recruiter' }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;
}

function renderPage() {
  return render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <ProfilePage />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
}

describe('ProfilePage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('redirects to /login when not authenticated', async () => {
    mockFetchWithToken(null);
    renderPage();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
  });

  it('renders the ProfileForm content when authenticated', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'recruiter' });
    mockFetchWithToken(token);
    renderPage();
    expect(await screen.findByText('My Profile')).toBeInTheDocument();
  });

  it('links Back to the recruiter home page', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'recruiter' });
    mockFetchWithToken(token);
    renderPage();
    const backLink = await screen.findByRole('link', { name: /Back/i });
    expect(backLink).toHaveAttribute('href', '/dashboard');
  });
});
