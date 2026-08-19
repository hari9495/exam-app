import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BrandingSettingsPage from './page';
import { AuthProvider } from '../../../../lib/auth-context';
import { QueryProvider } from '../../../../lib/query-provider';
import { ToastProvider } from '../../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const BRANDING = { logoUrl: null, primaryColor: '#1a73e8', accentColor: '#fbbc04' };

function renderPage() {
  render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <BrandingSettingsPage />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
}

function pngFile() {
  return new File(['not-really-a-png'], 'logo.png', { type: 'image/png' });
}

const called = (mock: jest.Mock, match: (url: string, init?: RequestInit) => boolean) =>
  mock.mock.calls.some((call) => match(String(call[0]), call[1] as RequestInit | undefined));

describe('BrandingSettingsPage (org-admin)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    window.sessionStorage.removeItem('organizationSlug');
  });

  it('loads branding from the token-scoped endpoint, not the slug one', async () => {
    // The slug is only ever populated from the login form's optional field, so the page
    // must not depend on it. Note sessionStorage is deliberately NOT seeded here.
    const fetchMock = jest.fn(async (url: string, options?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding') && !options?.method) {
        return new Response(JSON.stringify(BRANDING), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save colors' })).toBeEnabled());
    expect(called(fetchMock, (u) => u.includes('/organizations/by-slug/'))).toBe(false);
  });

  it('uploads a logo with no organizationSlug in the session', async () => {
    // The reported bug: an org_admin who signed in with just an email, or a super_admin who
    // reached the org via "switch into", has no slug -- and the upload button was disabled
    // behind the branding fetch, so the POST never even left the browser.
    const fetchMock = jest.fn(async (url: string, options?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding/logo')) {
        return new Response(JSON.stringify({ ...BRANDING, logoUrl: 'https://blob.test/logo.png' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding')) {
        return new Response(JSON.stringify(BRANDING), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderPage();

    await userEvent.upload(screen.getByLabelText(/logo \(png/i), pngFile());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload logo' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Upload logo' }));

    await waitFor(() =>
      expect(called(fetchMock, (u, o) => u.endsWith('/organizations/branding/logo') && o?.method === 'POST')).toBe(true),
    );
  });

  it('keeps the logo upload usable when the branding fetch fails', async () => {
    // A failed GET must not take the upload down with it, and the page must say what went
    // wrong instead of sitting on "Loading current branding..." forever.
    const fetchMock = jest.fn(async (url: string) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding/logo')) {
        return new Response(JSON.stringify({ ...BRANDING, logoUrl: 'https://blob.test/logo.png' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding')) {
        return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderPage();

    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      /Couldn't load your current branding/i,
    );
    expect(screen.queryByText(/Loading current branding/i)).not.toBeInTheDocument();

    await userEvent.upload(screen.getByLabelText(/logo \(png/i), pngFile());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload logo' })).toBeEnabled());
  });

  it('still refuses to save colors before the current values load', async () => {
    // Unchanged guard: saving while `branding` is undefined would write this component's
    // #0057f0/#fbbc04 defaults over the org's real colours.
    const fetchMock = jest.fn(async (url: string) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding')) {
        return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderPage();

    await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(screen.getByRole('button', { name: 'Save colors' })).toBeDisabled();
  });

  it('saves updated colors once branding has loaded', async () => {
    const fetchMock = jest.fn(async (url: string, options?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding') && options?.method === 'PATCH') {
        return new Response(JSON.stringify({ ...BRANDING, primaryColor: '#123456' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding')) {
        return new Response(JSON.stringify(BRANDING), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save colors' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Save colors' }));

    await waitFor(() =>
      expect(called(fetchMock, (u, o) => u.endsWith('/organizations/branding') && o?.method === 'PATCH')).toBe(true),
    );
  });

  it('toggles the login watermark, PATCHing loginWatermarkEnabled', async () => {
    const withLogo = { ...BRANDING, logoUrl: 'https://blob.test/logo.png', loginWatermarkEnabled: false };
    const fetchMock = jest.fn(async (url: string, options?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding') && options?.method === 'PATCH') {
        return new Response(JSON.stringify({ ...withLogo, loginWatermarkEnabled: true }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding')) {
        return new Response(JSON.stringify(withLogo), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderPage();

    const toggle = await screen.findByRole('checkbox', { name: /watermark on the login page/i });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(
        called(
          fetchMock,
          (u, o) =>
            u.endsWith('/organizations/branding') &&
            o?.method === 'PATCH' &&
            String(o?.body).includes('"loginWatermarkEnabled":true'),
        ),
      ).toBe(true),
    );
  });
});
