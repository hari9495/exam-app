import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('LoginPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('submits organization slug, email, and password to the login endpoint', async () => {
    const fetchMock = jest.fn(async (url) => {
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
});
