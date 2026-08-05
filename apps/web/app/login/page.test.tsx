import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
// usePathname is needed because the page applies organisation branding to the
// browser tab (useDocumentBranding), which re-asserts the title on route change.
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/login' }));

describe('LoginPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('submits organization slug, email, and password to the login endpoint', async () => {
    const fetchMock = jest.fn(async (url, options?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).endsWith('/auth/staff/login')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'demo-org');
    await userEvent.type(screen.getByLabelText(/email/i), 'recruiter@demo-org.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'Passw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    const loginCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/auth/staff/login'));
    expect(loginCall).toBeDefined();
    expect(JSON.parse((loginCall![1] as RequestInit).body as string)).toEqual({
      organizationSlug: 'demo-org',
      email: 'recruiter@demo-org.test',
      password: 'Passw0rd!',
    });
  });

  it('redirects org_admin to /users after login', async () => {
    const orgAdminToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).endsWith('/auth/staff/login')) {
        return new Response(JSON.stringify({ accessToken: orgAdminToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'demo-org');
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@demo-org.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'DevAdmin123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/users'));
  });

  it('redirects super_admin to /organizations after login', async () => {
    const superAdminToken = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).endsWith('/auth/staff/login')) {
        return new Response(JSON.stringify({ accessToken: superAdminToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/email/i), 'super@platform.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'DevSuperAdmin123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/organizations'));
  });

  it('shows an error banner when login fails', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).endsWith('/auth/staff/login')) {
        return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'demo-org');
    await userEvent.type(screen.getByLabelText(/email/i), 'recruiter@demo-org.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });

  it('toggles password visibility when the show/hide button is clicked', async () => {
    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: /show characters/i }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: /hide characters/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('links to the forgot-password page', async () => {
    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
  });

  it('shows a "Log in with SSO" button once the org slug resolves to an SSO-enabled org', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).includes('/auth/saml/')) {
        return new Response(JSON.stringify({ enabled: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'acme');
    await userEvent.tab();

    expect(await screen.findByRole('link', { name: /log in with sso/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/auth/saml/acme/login'),
    );
  });

  it('hides the password form once the org resolves to an SSO-enabled org', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).includes('/auth/saml/')) {
        return new Response(JSON.stringify({ enabled: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'acme');
    await userEvent.tab();

    await screen.findByRole('link', { name: /log in with sso/i });
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('stashes the org slug in sessionStorage before following the SSO link', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).includes('/auth/saml/')) {
        return new Response(JSON.stringify({ enabled: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'acme');
    await userEvent.tab();

    const ssoLink = await screen.findByRole('link', { name: /log in with sso/i });
    expect(window.sessionStorage.getItem('ssoPendingOrganizationSlug')).toBeNull();

    await userEvent.click(ssoLink);

    expect(window.sessionStorage.getItem('ssoPendingOrganizationSlug')).toBe('acme');
  });

  it('offers no password fallback when the org is SSO-enabled', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).includes('/auth/saml/')) {
        return new Response(JSON.stringify({ enabled: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'acme');
    await userEvent.tab();

    await screen.findByRole('link', { name: /log in with sso/i });
    // SSO orgs are SSO-only: no password escape hatch, no password fields.
    expect(screen.queryByRole('button', { name: /log in with password instead/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
  });

  it('does not show the SSO button when the org has no SSO configured', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).includes('/auth/saml/')) {
        return new Response(JSON.stringify({ enabled: false }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'acme');
    await userEvent.tab();

    expect(screen.queryByRole('link', { name: /log in with sso/i })).not.toBeInTheDocument();
  });
});
