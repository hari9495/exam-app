import { renderHook, waitFor } from '@testing-library/react';
import { QueryProvider } from '../query-provider';
import { AuthProvider } from '../auth-context';
import { useCurrentUser } from './useCurrentUser';
import { fakeJwt } from '../test-utils/fake-jwt';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}

describe('useCurrentUser', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches the current user from /users/me', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'recruiter' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (String(url).endsWith('/users/me')) {
        return new Response(
          JSON.stringify({ id: 'u1', email: 'a@b.com', name: 'Jane Recruiter', role: 'recruiter' }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.data?.name).toBe('Jane Recruiter'));
  });
});
