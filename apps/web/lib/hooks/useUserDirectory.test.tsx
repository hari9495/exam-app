import { renderHook, waitFor } from '@testing-library/react';
import { QueryProvider } from '../query-provider';
import { AuthProvider } from '../auth-context';
import { useUserDirectory } from './useUserDirectory';
import { fakeJwt } from '../test-utils/fake-jwt';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}

describe('useUserDirectory', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches the platform-wide user directory from GET /users/directory', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (String(url).includes('/users/directory')) {
        expect(String(url)).toContain('/users/directory?page=1');
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'u1',
                organizationId: 'org-1',
                organizationName: 'Acme Inc',
                email: 'a@acme.test',
                name: 'A',
                role: 'recruiter',
                status: 'active',
                lastLoginAt: null,
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useUserDirectory({ page: 1 }), { wrapper });

    await waitFor(() => expect(result.current.data?.data[0]?.email).toBe('a@acme.test'));
  });
});
