import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BrandingSettingsPage from './page';
import { AuthProvider } from '../../../../lib/auth-context';
import { QueryProvider } from '../../../../lib/query-provider';
import { ToastProvider } from '../../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('BrandingSettingsPage (org-admin)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    window.sessionStorage.removeItem('organizationSlug');
  });

  it('loads current branding and saves updated colors', async () => {
    // AuthProvider only populates organizationSlug from an explicit login() call or a
    // pre-existing sessionStorage entry (see lib/auth-context.tsx) -- it is never derived
    // from the JWT payload. Seed it here to simulate a returning session, since useBranding
    // is disabled (and never fires) while organizationSlug is null.
    window.sessionStorage.setItem('organizationSlug', 'acme');
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding') && options?.method === 'PATCH') {
        return new Response(JSON.stringify({ logoUrl: null, primaryColor: '#123456', accentColor: '#fbbc04' }), { status: 200 });
      }
      if (String(url).includes('/organizations/by-slug/')) {
        return new Response(JSON.stringify({ logoUrl: null, primaryColor: '#1a73e8', accentColor: '#fbbc04' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <BrandingSettingsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/organizations/by-slug/'))).toBe(true),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save colors' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/organizations/branding') && call[1]?.method === 'PATCH'),
      ).toBe(true),
    );
  });
});
