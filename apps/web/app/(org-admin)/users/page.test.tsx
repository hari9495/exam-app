import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('UsersPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists staff users and adds a new one', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/users') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'user-2', organizationId: 'org-1', email: 'new@demo-org.test', role: 'recruiter',
            status: 'active', lastLoginAt: null, createdAt: '2026-07-14T00:00:00.000Z',
          }),
          { status: 201 },
        );
      }
      if (String(url).endsWith('/users')) {
        return new Response(
          JSON.stringify([
            {
              id: 'user-1', organizationId: 'org-1', email: 'admin@demo-org.test', role: 'org_admin',
              status: 'active', lastLoginAt: '2026-07-10T00:00:00.000Z', createdAt: '2026-07-01T00:00:00.000Z',
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <UsersPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('admin@demo-org.test')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Email'), 'new@demo-org.test');
    await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd!2026');
    await userEvent.click(screen.getByRole('button', { name: 'Add staff member' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/users') && call[1]?.method === 'POST')).toBe(true),
    );
    const createCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/users') && call[1]?.method === 'POST');
    expect(JSON.parse((createCall![1] as RequestInit).body as string)).toEqual({
      email: 'new@demo-org.test',
      password: 'Passw0rd!2026',
      role: 'recruiter',
    });
  });

  it('shows error state when the user list fails to load', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/users')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <UsersPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Failed to load users.')).toBeInTheDocument();
  });

  it(
    'shows error message when adding a user fails',
    async () => {
      const fetchMock = jest.fn(async (url, options) => {
        if (String(url).endsWith('/auth/refresh')) {
          return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
        }
        if (String(url).endsWith('/users') && options?.method === 'POST') {
          return new Response(
            JSON.stringify({ message: 'A user with this email already exists' }),
            { status: 409 },
          );
        }
        if (String(url).endsWith('/users')) {
          return new Response(
            JSON.stringify([
              {
                id: 'user-1', organizationId: 'org-1', email: 'admin@demo-org.test', role: 'org_admin',
                status: 'active', lastLoginAt: '2026-07-10T00:00:00.000Z', createdAt: '2026-07-01T00:00:00.000Z',
              },
            ]),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      render(
        <QueryProvider>
          <ToastProvider>
            <AuthProvider>
              <UsersPage />
            </AuthProvider>
          </ToastProvider>
        </QueryProvider>,
      );

      await waitFor(() => expect(screen.getByText('admin@demo-org.test')).toBeInTheDocument());

      await userEvent.type(screen.getByLabelText('Email'), 'duplicate@demo-org.test');
      await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd!2026');
      await userEvent.click(screen.getByRole('button', { name: 'Add staff member' }));

      await waitFor(() =>
        expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/users') && call[1]?.method === 'POST')).toBe(true),
      );

      await waitFor(() =>
        expect(screen.getByRole('alert')).toBeInTheDocument(),
      );
      expect(screen.getByText('A user with this email already exists')).toBeInTheDocument();
    },
    10000,
  );

  it('shows role and status as StatusBadge tags', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/users')) {
        return new Response(
          JSON.stringify([
            {
              id: 'user-1', organizationId: 'org-1', email: 'admin@demo-org.test', role: 'org_admin',
              status: 'active', lastLoginAt: null, createdAt: '2026-07-01T00:00:00.000Z',
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <UsersPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('admin@demo-org.test')).toBeInTheDocument());
    expect(screen.queryAllByText('Org Admin')).not.toHaveLength(0);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
