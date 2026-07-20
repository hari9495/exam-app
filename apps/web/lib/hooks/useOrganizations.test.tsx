import { renderHook, waitFor } from '@testing-library/react';
import { QueryProvider } from '../query-provider';
import { AuthProvider } from '../auth-context';
import { useOrganizations } from './useOrganizations';
import { fakeJwt } from '../test-utils/fake-jwt';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}

describe('useOrganizations', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches the organization list from GET /organizations', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (String(url).includes('/organizations')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', createdAt: '2026-01-01T00:00:00.000Z' }],
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

    const { result } = renderHook(() => useOrganizations(), { wrapper });

    await waitFor(() => expect(result.current.data?.data[0]?.name).toBe('Acme'));
  });
});
