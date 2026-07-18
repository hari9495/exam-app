import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth-context';
import { useCurrentUser } from './hooks/useCurrentUser';
import { fakeJwt } from './test-utils/fake-jwt';

function Probe() {
  const { accessToken, organizationSlug, isLoading } = useAuth();
  if (isLoading) return <p>Loading</p>;
  return <p>{accessToken ? `token:${accessToken}` : 'no-token'} slug:{organizationSlug ?? 'none'}</p>;
}

function renderWithQueryClient(ui: React.ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })) {
  const result = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...result, client };
}

describe('AuthProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('silently refreshes on mount and exposes the resulting access token', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'refreshed-token' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    renderWithQueryClient(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/token:refreshed-token/)).toBeInTheDocument());
  });

  it('leaves accessToken null when the silent refresh fails (no prior session)', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Refresh token required' }), { status: 401 })) as unknown as typeof fetch;

    renderWithQueryClient(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('no-token slug:none')).toBeInTheDocument());
  });

  it('clears the currentUser query cache on logout, so a second user never sees the first user\'s stale profile data', async () => {
    const tokenA = fakeJwt({ sub: 'userA', organizationId: 'org1', role: 'recruiter' });

    global.fetch = jest.fn(async (url, init) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: tokenA }), { status: 200 });
      }
      if (u.endsWith('/users/me')) {
        return new Response(JSON.stringify({ id: 'userA', email: 'a@example.com', name: 'User A', role: 'recruiter' }), { status: 200 });
      }
      if (u.endsWith('/auth/logout')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${u} (${init?.method ?? 'GET'})`);
    }) as unknown as typeof fetch;

    let auth: ReturnType<typeof useAuth> | undefined;
    function Consumer() {
      auth = useAuth();
      const { data } = useCurrentUser();
      return <p>{data ? `user:${data.name}` : 'no-user'}</p>;
    }

    const { client } = renderWithQueryClient(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('user:User A')).toBeInTheDocument());
    expect(client.getQueryData(['currentUser'])).toBeTruthy();

    await act(async () => {
      await auth!.logout();
    });

    expect(client.getQueryData(['currentUser'])).toBeUndefined();
  });
});
