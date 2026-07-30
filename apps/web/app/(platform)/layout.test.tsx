import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlatformLayout from './layout';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/organizations',
}));

describe('Platform layout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  function renderLayout(role = 'super_admin') {
    const token = fakeJwt({ sub: 'u1', organizationId: null, role });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    return render(
      <QueryProvider>
        <AuthProvider>
          <PlatformLayout>
            <p>Page content</p>
          </PlatformLayout>
        </AuthProvider>
      </QueryProvider>,
    );
  }

  it('renders children for a super_admin', async () => {
    renderLayout();
    expect(await screen.findByText('Page content')).toBeInTheDocument();
  });

  it('sends an authenticated org_admin (wrong console) to their own console, not to /login', async () => {
    renderLayout('org_admin');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/users'));
    expect(mockPush).not.toHaveBeenCalledWith('/login');
    expect(screen.queryByText('Page content')).not.toBeInTheDocument();
  });

  it('logs out and redirects to /login when the logout button is clicked', async () => {
    renderLayout();
    const logoutButton = await screen.findByRole('button', { name: 'Log out' });

    await userEvent.click(logoutButton);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    const logoutCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).endsWith('/auth/logout'));
    expect(logoutCall).toBeDefined();
  });
});
