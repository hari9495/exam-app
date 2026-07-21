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

  it('redirects a recruiter (wrong role) to /login instead of rendering the panel shell', async () => {
    renderLayout('recruiter');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    expect(screen.queryByRole('link', { name: 'Exams' })).not.toBeInTheDocument();
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
