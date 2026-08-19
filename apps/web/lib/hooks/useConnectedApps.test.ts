import { createElement, ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryProvider } from '../query-provider';
import { AuthProvider } from '../auth-context';
import {
  useConnectedApps,
  useCreateConnectedApp,
  useUpdateConnectedApp,
  useDeleteConnectedApp,
  useTestConnectedApp,
  useConnectedAppDeliveries,
} from './useConnectedApps';
import { fakeJwt } from '../test-utils/fake-jwt';

// This file stays .ts (not .tsx) per the sibling hook tests -- the wrapper below uses
// createElement instead of JSX so ts-jest (which only enables JSX parsing for .tsx) can
// compile it.
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryProvider, null, createElement(AuthProvider, null, children));
}

const ROW = {
  id: 'ca-1',
  type: 'slack',
  label: 'Recruiting channel',
  events: ['invitation.created'],
  status: 'active',
  lastDeliveryAt: null,
  lastError: null,
  urlHint: '****',
};

describe('useConnectedApps hooks', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(impl: (path: string, options?: RequestInit) => unknown) {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org-1', role: 'org_admin' });
    const fetchMock = jest.fn(async (url: unknown, options?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      const path = String(url).replace(/^https?:\/\/[^/]+\/api\/v1/, '').replace(/^.*\/api\/v1/, '');
      const body = impl(path, options);
      return new Response(JSON.stringify(body ?? {}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('useConnectedApps GETs /organizations/integrations/connected-apps', async () => {
    const fetchMock = mockFetch((path) => (path.endsWith('/organizations/integrations/connected-apps') ? [ROW] : {}));

    const { result } = renderHook(() => useConnectedApps(), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.label).toBe('Recruiting channel'));
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/organizations/integrations/connected-apps'));
    expect(call).toBeDefined();
    expect(String(call![0])).toMatch(/\/organizations\/integrations\/connected-apps$/);
    expect((call![1] as RequestInit | undefined)?.method ?? 'GET').toBe('GET');
  });

  it('useCreateConnectedApp POSTs the body to /organizations/integrations/connected-apps', async () => {
    const fetchMock = mockFetch(() => ROW);
    const { result } = renderHook(() => useCreateConnectedApp(), { wrapper });

    const input = { type: 'slack' as const, label: 'Recruiting channel', targetUrl: 'https://hooks.slack.com/services/x', events: ['invitation.created'] };
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const call = fetchMock.mock.calls.find(
      ([u, opts]) => String(u).endsWith('/organizations/integrations/connected-apps') && (opts as RequestInit)?.method === 'POST',
    );
    expect(call).toBeDefined();
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual(input);
  });

  it('useUpdateConnectedApp PATCHes /organizations/integrations/connected-apps/:id', async () => {
    const fetchMock = mockFetch(() => ROW);
    const { result } = renderHook(() => useUpdateConnectedApp(), { wrapper });

    result.current.mutate({ id: 'ca-1', label: 'Renamed channel' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const call = fetchMock.mock.calls.find(
      ([u, opts]) => String(u).endsWith('/organizations/integrations/connected-apps/ca-1') && (opts as RequestInit)?.method === 'PATCH',
    );
    expect(call).toBeDefined();
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ label: 'Renamed channel' });
  });

  it('useDeleteConnectedApp DELETEs /organizations/integrations/connected-apps/:id', async () => {
    const fetchMock = mockFetch(() => ({ ok: true }));
    const { result } = renderHook(() => useDeleteConnectedApp(), { wrapper });

    result.current.mutate('ca-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const call = fetchMock.mock.calls.find(
      ([u, opts]) => String(u).endsWith('/organizations/integrations/connected-apps/ca-1') && (opts as RequestInit)?.method === 'DELETE',
    );
    expect(call).toBeDefined();
  });

  it('useTestConnectedApp POSTs to /organizations/integrations/connected-apps/:id/test', async () => {
    const fetchMock = mockFetch(() => ({ queued: true }));
    const { result } = renderHook(() => useTestConnectedApp(), { wrapper });

    result.current.mutate('ca-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const call = fetchMock.mock.calls.find(
      ([u, opts]) => String(u).endsWith('/organizations/integrations/connected-apps/ca-1/test') && (opts as RequestInit)?.method === 'POST',
    );
    expect(call).toBeDefined();
  });

  it('useConnectedAppDeliveries GETs /organizations/integrations/connected-apps/:id/deliveries', async () => {
    const delivery = { id: 'd-1', eventType: 'invitation.created', status: 'delivered', httpStatusCode: 200, createdAt: '2026-08-01T00:00:00.000Z', lastAttemptAt: null };
    const fetchMock = mockFetch((path) => (path.endsWith('/deliveries') ? [delivery] : {}));

    const { result } = renderHook(() => useConnectedAppDeliveries('ca-1'), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('d-1'));
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/organizations/integrations/connected-apps/ca-1/deliveries'));
    expect(call).toBeDefined();
  });
});
