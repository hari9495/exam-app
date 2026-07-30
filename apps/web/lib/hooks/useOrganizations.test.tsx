import { renderHook, waitFor } from '@testing-library/react';
import { QueryProvider } from '../query-provider';
import { AuthProvider } from '../auth-context';
import { useOrganizations, ORGANIZATION_PAGE_SIZE } from './useOrganizations';
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

  function mockFetch() {
    const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
    const fetchMock = jest.fn(async (url: unknown) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 200, totalPages: 1 }), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  async function listCallUrl(fetchMock: jest.Mock): Promise<string> {
    let url = '';
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]: [unknown]) => String(u).includes('/organizations'));
      expect(call).toBeDefined();
      url = String(call[0]);
    });
    return url;
  }

  it('requests every organization in one page by default', async () => {
    // Sorting and filtering happen in the browser over the whole list. Fetching a
    // 20-row page would mean sorting only the visible page, which reads as a
    // broken sort rather than as a pagination limit.
    const fetchMock = mockFetch();

    renderHook(() => useOrganizations(), { wrapper });

    expect(await listCallUrl(fetchMock)).toContain(`pageSize=${ORGANIZATION_PAGE_SIZE}`);
    // Must not exceed the server's MAX_PAGE_SIZE in
    // apps/api/src/common/paginated-response.ts -- above it the request is
    // silently clamped and this constant would misdescribe what actually happens.
    expect(ORGANIZATION_PAGE_SIZE).toBe(100);
  });

  it('lets an explicit pageSize override the default', async () => {
    const fetchMock = mockFetch();

    renderHook(() => useOrganizations({ pageSize: 5 }), { wrapper });

    expect(await listCallUrl(fetchMock)).toContain('pageSize=5');
  });

  it('passes a search term through alongside the default page size', async () => {
    const fetchMock = mockFetch();

    renderHook(() => useOrganizations({ search: 'acme' }), { wrapper });

    const url = await listCallUrl(fetchMock);
    expect(url).toContain('search=acme');
    expect(url).toContain(`pageSize=${ORGANIZATION_PAGE_SIZE}`);
  });
});
