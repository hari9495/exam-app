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
    window.sessionStorage.clear();
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

  it('re-runs the silent refresh when the tab becomes visible again, picking up a role change made while the tab was away', async () => {
    const staleToken = fakeJwt({ sub: 'userA', organizationId: 'org1', role: 'recruiter' });
    const promotedToken = fakeJwt({ sub: 'userA', organizationId: 'org1', role: 'org_admin' });

    let refreshCallCount = 0;
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshCallCount += 1;
        const token = refreshCallCount === 1 ? staleToken : promotedToken;
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    let auth: ReturnType<typeof useAuth> | undefined;
    function Consumer() {
      auth = useAuth();
      return null;
    }

    renderWithQueryClient(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(auth?.role).toBe('recruiter'));

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    await waitFor(() => expect(auth?.role).toBe('org_admin'));
    expect(refreshCallCount).toBe(2);
  });

  it('does not refresh on window focus alone, since visibilitychange already fires on the same "back to this tab" moment and /auth/refresh is strictly rate-limited', async () => {
    let refreshCallCount = 0;
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshCallCount += 1;
        return new Response(
          JSON.stringify({ accessToken: fakeJwt({ sub: 'userA', organizationId: 'org1', role: 'recruiter' }) }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    let auth: ReturnType<typeof useAuth> | undefined;
    function Consumer() {
      auth = useAuth();
      return null;
    }

    renderWithQueryClient(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(auth?.role).toBe('recruiter'));
    expect(refreshCallCount).toBe(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    expect(refreshCallCount).toBe(1);
  });

  it('collapses concurrent refresh triggers into a single in-flight /auth/refresh call, since refresh tokens rotate on every use', async () => {
    const initialToken = fakeJwt({ sub: 'userA', organizationId: 'org1', role: 'recruiter' });
    let refreshCallCount = 0;
    let resolveRefresh: (() => void) | undefined;

    // First call (mount) resolves immediately so accessToken is set -- the visibilitychange
    // triggers below are no-ops without one. Every call after that hangs until resolved, so
    // both triggers fired back-to-back land while the same refresh is still in flight.
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshCallCount += 1;
        if (refreshCallCount === 1) {
          return new Response(JSON.stringify({ accessToken: initialToken }), { status: 200 });
        }
        await new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        });
        return new Response(JSON.stringify({ accessToken: initialToken }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    let auth: ReturnType<typeof useAuth> | undefined;
    function Consumer() {
      auth = useAuth();
      return null;
    }

    renderWithQueryClient(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(auth?.role).toBe('recruiter'));
    expect(refreshCallCount).toBe(1);

    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(refreshCallCount).toBe(2));
    // A third trigger would show up as a call count of 3 -- it doesn't.
    expect(refreshCallCount).toBe(2);

    await act(async () => {
      resolveRefresh?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(auth?.role).toBe('recruiter'));
    expect(refreshCallCount).toBe(2);
  });

  it('keeps the existing session on a rate-limited (429) refresh instead of logging the user out, since the failure is transient not an invalid session', async () => {
    const initialToken = fakeJwt({ sub: 'userA', organizationId: 'org1', role: 'recruiter' });
    let refreshCallCount = 0;
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshCallCount += 1;
        if (refreshCallCount === 1) {
          return new Response(JSON.stringify({ accessToken: initialToken }), { status: 200 });
        }
        return new Response(JSON.stringify({ message: 'ThrottlerException: Too Many Requests' }), { status: 429 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    let auth: ReturnType<typeof useAuth> | undefined;
    function Consumer() {
      auth = useAuth();
      return null;
    }

    renderWithQueryClient(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(auth?.accessToken).toBe(initialToken));

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshCallCount).toBe(2);
    // Still signed in, still the same token -- a 429 must not be treated as a dead session.
    expect(auth?.accessToken).toBe(initialToken);
    expect(auth?.role).toBe('recruiter');
  });

  describe('cross-tab token sharing (F3, ADO #6981)', () => {
    // jsdom has no BroadcastChannel. A minimal in-process stub: every instance on the same
    // name receives every other instance's postMessage, which is exactly the contract that
    // matters here and lets the test play "the other tab".
    class StubChannel {
      static byName = new Map<string, Set<StubChannel>>();
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor(public name: string) {
        if (!StubChannel.byName.has(name)) StubChannel.byName.set(name, new Set());
        StubChannel.byName.get(name)!.add(this);
      }
      postMessage(data: unknown) {
        for (const peer of StubChannel.byName.get(this.name)!) {
          if (peer !== this) peer.onmessage?.({ data } as MessageEvent);
        }
      }
      close() {
        StubChannel.byName.get(this.name)?.delete(this);
      }
    }
    const originalBC = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    beforeEach(() => {
      StubChannel.byName.clear();
      (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = StubChannel;
    });
    afterEach(() => {
      (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = originalBC;
    });

    it('adopts a token broadcast by another tab instead of refreshing for itself', async () => {
      let refreshCalls = 0;
      global.fetch = jest.fn(async (url) => {
        if (String(url).endsWith('/auth/refresh')) {
          refreshCalls += 1;
          return new Response(JSON.stringify({ accessToken: fakeJwt({ role: 'recruiter' }) }), { status: 200 });
        }
        throw new Error(`Unexpected fetch to ${url}`);
      }) as unknown as typeof fetch;

      renderWithQueryClient(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
      // The mount refresh is expected: exactly one call.
      await waitFor(() => expect(refreshCalls).toBe(1));

      // "Another tab" completes a refresh and broadcasts its result.
      const otherTab = new StubChannel('exam-platform-staff-auth');
      const fromOtherTab = fakeJwt({ role: 'org_admin' });
      await act(async () => {
        otherTab.postMessage({ type: 'token', accessToken: fromOtherTab });
      });

      // This tab adopted it -- the exposed access token IS the other tab's token...
      await waitFor(() => expect(screen.getByText(`token:${fromOtherTab} slug:none`)).toBeInTheDocument());
      // ...and crucially did NOT go to the server for its own rotation. That second call is
      // the one that used to arrive with a just-rotated token and log everyone out.
      expect(refreshCalls).toBe(1);
    });

    it('broadcasts its own successful refresh so other tabs can adopt it', async () => {
      global.fetch = jest.fn(async (url) => {
        if (String(url).endsWith('/auth/refresh')) {
          return new Response(JSON.stringify({ accessToken: fakeJwt({ role: 'recruiter' }) }), { status: 200 });
        }
        throw new Error(`Unexpected fetch to ${url}`);
      }) as unknown as typeof fetch;
      const received: unknown[] = [];
      const listener = new StubChannel('exam-platform-staff-auth');
      listener.onmessage = (e) => received.push(e.data);

      renderWithQueryClient(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );

      await waitFor(() => expect(received.length).toBeGreaterThan(0));
      expect(received[0]).toMatchObject({ type: 'token' });
    });

    it('signs out when another tab reports the session is gone', async () => {
      global.fetch = jest.fn(async (url) => {
        if (String(url).endsWith('/auth/refresh')) {
          return new Response(JSON.stringify({ accessToken: fakeJwt({ role: 'recruiter' }) }), { status: 200 });
        }
        throw new Error(`Unexpected fetch to ${url}`);
      }) as unknown as typeof fetch;

      renderWithQueryClient(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
      await waitFor(() => expect(screen.getByText(/^token:/)).toBeInTheDocument());

      const otherTab = new StubChannel('exam-platform-staff-auth');
      await act(async () => {
        otherTab.postMessage({ type: 'signed-out' });
      });

      await waitFor(() => expect(screen.getByText(/no-token/)).toBeInTheDocument());
    });
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

  it('decodes actingSuperAdmin, actingOrgName, and actingOrgSlug off the access token after switchIntoOrg', async () => {
    const tokenA = fakeJwt({ sub: 'userA', organizationId: 'org1', role: 'super_admin' });
    const actingToken = fakeJwt({
      sub: 'userA',
      organizationId: 'org2',
      role: 'super_admin',
      actingSuperAdmin: true,
      actingOrgName: 'Acme Inc',
      actingOrgSlug: 'acme',
    });

    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: tokenA }), { status: 200 });
      }
      if (u.endsWith('/auth/super-admin/switch-into/org2')) {
        return new Response(JSON.stringify({ accessToken: actingToken }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${u}`);
    }) as unknown as typeof fetch;

    let auth: ReturnType<typeof useAuth> | undefined;
    function Consumer() {
      auth = useAuth();
      return null;
    }

    renderWithQueryClient(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(auth?.accessToken).toBe(tokenA));

    await act(async () => {
      await auth!.switchIntoOrg('org2');
    });

    expect(auth?.actingSuperAdmin).toBe(true);
    expect(auth?.actingOrgName).toBe('Acme Inc');
    // Regression for ADO #6849: without this, organizationSlug stayed at the super_admin's own
    // (empty) value while acting into an org, silently disabling useSsoStatus()'s per-org check.
    expect(auth?.organizationSlug).toBe('acme');
  });

  it('switchOutOfOrg calls the switch-out endpoint and restores a non-acting token via silent refresh', async () => {
    const actingToken = fakeJwt({
      sub: 'userA',
      organizationId: 'org2',
      role: 'super_admin',
      actingSuperAdmin: true,
      actingOrgName: 'Acme Inc',
      actingOrgSlug: 'acme',
    });
    const restoredToken = fakeJwt({ sub: 'userA', organizationId: 'org1', role: 'super_admin' });

    let refreshCallCount = 0;
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) {
        refreshCallCount += 1;
        const token = refreshCallCount === 1 ? actingToken : restoredToken;
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (u.endsWith('/auth/super-admin/switch-out')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${u}`);
    }) as unknown as typeof fetch;

    let auth: ReturnType<typeof useAuth> | undefined;
    function Consumer() {
      auth = useAuth();
      return null;
    }

    renderWithQueryClient(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(auth?.actingSuperAdmin).toBe(true));
    expect(auth?.organizationSlug).toBe('acme');

    await act(async () => {
      await auth!.switchOutOfOrg();
    });

    expect(auth?.actingSuperAdmin).toBe(false);
    expect(auth?.accessToken).toBe(restoredToken);
    // Regression for ADO #6849: the acting org's slug must not linger after switching out, or
    // the super_admin's base (org-less) session would keep evaluating SSO status for the org
    // they just left.
    expect(auth?.organizationSlug).toBeNull();
  });

  it('decodes impersonating and impersonatorEmail off the access token after impersonate', async () => {
    const tokenA = fakeJwt({ sub: 'adminA', organizationId: 'org1', role: 'org_admin' });
    const impersonatedToken = fakeJwt({
      sub: 'userB',
      organizationId: 'org1',
      role: 'recruiter',
      impersonatorUserId: 'adminA',
      impersonatorEmail: 'admin@example.com',
    });

    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: tokenA }), { status: 200 });
      }
      if (u.endsWith('/auth/impersonate/userB')) {
        return new Response(JSON.stringify({ accessToken: impersonatedToken }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${u}`);
    }) as unknown as typeof fetch;

    let auth: ReturnType<typeof useAuth> | undefined;
    function Consumer() {
      auth = useAuth();
      return null;
    }

    renderWithQueryClient(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(auth?.accessToken).toBe(tokenA));

    await act(async () => {
      await auth!.impersonate('userB');
    });

    expect(auth?.impersonating).toBe(true);
    expect(auth?.impersonatorEmail).toBe('admin@example.com');
  });

  it('stopImpersonating calls the stop endpoint and restores the original token via silent refresh', async () => {
    const impersonatedToken = fakeJwt({
      sub: 'userB',
      organizationId: 'org1',
      role: 'recruiter',
      impersonatorUserId: 'adminA',
      impersonatorEmail: 'admin@example.com',
    });
    const restoredToken = fakeJwt({ sub: 'adminA', organizationId: 'org1', role: 'org_admin' });

    let refreshCallCount = 0;
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) {
        refreshCallCount += 1;
        const token = refreshCallCount === 1 ? impersonatedToken : restoredToken;
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (u.endsWith('/auth/impersonate/stop')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${u}`);
    }) as unknown as typeof fetch;

    let auth: ReturnType<typeof useAuth> | undefined;
    function Consumer() {
      auth = useAuth();
      return null;
    }

    renderWithQueryClient(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(auth?.impersonating).toBe(true));

    await act(async () => {
      await auth!.stopImpersonating();
    });

    expect(auth?.impersonating).toBe(false);
    expect(auth?.accessToken).toBe(restoredToken);
  });

  it('re-enters the acting org on refresh so an acting super_admin session survives a reload', async () => {
    // A stored acting org id (set by switchIntoOrg) means the session was acting into org2. The
    // refresh returns the BASE super_admin token; the provider must re-enter org2 to restore acting.
    window.sessionStorage.setItem('actingOrgId', 'org2');
    const baseToken = fakeJwt({ sub: 'userA', organizationId: 'org1', role: 'super_admin' });
    const actingToken = fakeJwt({
      sub: 'userA',
      organizationId: 'org2',
      role: 'super_admin',
      actingSuperAdmin: true,
      actingOrgName: 'Acme Inc',
    });

    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: baseToken }), { status: 200 });
      }
      if (u.endsWith('/auth/super-admin/switch-into/org2')) {
        return new Response(JSON.stringify({ accessToken: actingToken }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${u}`);
    }) as unknown as typeof fetch;

    let auth: ReturnType<typeof useAuth> | undefined;
    function Consumer() {
      auth = useAuth();
      return null;
    }

    renderWithQueryClient(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(auth?.actingSuperAdmin).toBe(true));
    expect(auth?.accessToken).toBe(actingToken);
    expect(auth?.actingOrgName).toBe('Acme Inc');
  });
});
