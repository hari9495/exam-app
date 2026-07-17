import { renderHook, waitFor } from '@testing-library/react';
import { useUpdateBranding, useUpdateBrandingLogo } from './useBranding';
import { AuthProvider } from '../auth-context';
import { QueryProvider } from '../query-provider';
import { fakeJwt } from '../test-utils/fake-jwt';
import { ReactNode } from 'react';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}

describe('useUpdateBranding / useUpdateBrandingLogo', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('PATCHes /organizations/branding and invalidates the branding query on success', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding') && options?.method === 'PATCH') {
        return new Response(JSON.stringify({ logoUrl: null, primaryColor: '#123456', accentColor: '#fbbc04' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useUpdateBranding(), { wrapper });
    result.current.mutate({ primaryColor: '#123456', accentColor: '#fbbc04' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const patchCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith('/organizations/branding') && call[1]?.method === 'PATCH',
    );
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      primaryColor: '#123456',
      accentColor: '#fbbc04',
    });
  });

  it('POSTs a FormData logo file to /organizations/branding/logo', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding/logo') && options?.method === 'POST') {
        return new Response(JSON.stringify({ logoUrl: 'https://cdn.test/logo.png', primaryColor: null, accentColor: null }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useUpdateBrandingLogo(), { wrapper });
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    result.current.mutate(file);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith('/organizations/branding/logo') && call[1]?.method === 'POST',
    );
    expect(uploadCall![1]?.body).toBeInstanceOf(FormData);
  });
});
