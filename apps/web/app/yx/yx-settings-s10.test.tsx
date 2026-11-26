import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav, type NavInput } from '../../lib/yx-nav';
import { YxNavContext } from '../../lib/yx-shell';
import YxIntegrationSettingsPage from './(app)/settings/integrations/[page]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn(), redirect: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Settings S-10 (answer 1327): group 7 live on the checked routes; the /v2 Integrations and Calendar pages redirect.
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
const ADMIN = buildNav({ ...base, has: () => true, role: 'org_admin' });
const calls: [string, unknown][] = [];
const STATE = {
  smtpConfigured: false, smtpHost: null, smtpPort: null, emailFromAddress: null,
  aiKeyConfigured: false, aiProvider: 'anthropic', aiBaseUrl: null, aiModelFast: null, aiModelStandard: null,
  embeddingConfigured: false, embeddingBaseUrl: null, embeddingModel: null,
  apiKeyConfigured: false, apiKeyPrefix: null, apiKeyCreatedAt: null,
  webhookConfigured: true, webhookUrl: 'https://hooks.example.com/…a1b2',
  hrisExportConfigured: false, hrisExportEnabled: false, hrisProvider: 'generic', hrisTargetUrl: null,
};
const routes = (refuse = false) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      calls.push([`${init.method} ${path}`, init.body ? JSON.parse(String(init.body)) : null]);
      return path.endsWith('/api-key') && init.method === 'POST' ? { apiKey: 'pk_live_once_only', apiKeyPrefix: 'pk_live_once' } : {};
    }
    if (refuse && path.startsWith('/organizations')) throw Object.assign(new Error('Missing required permission(s): org:manage_settings'), { status: 403 });
    if (path === '/organizations/integrations') return STATE;
    if (path === '/organizations/integrations/connected-apps') return [{ id: 'a1', type: 'slack', label: 'Hiring alerts', events: ['candidate.hired'], status: 'active', lastDeliveryAt: null, lastError: null }];
    if (path === '/organizations/sms-config') return { smsEnabled: false, smsProvider: 'twilio', configured: false, config: {} };
    if (path === '/organizations/whatsapp-config') return { whatsappEnabled: false, whatsappProvider: 'twilio', configured: false, config: {} };
    if (path === '/organizations/sms-providers' || path === '/organizations/whatsapp-providers') return [{ id: 'twilio', label: 'Twilio', configFields: [{ key: 'authToken', label: 'Auth token', secret: true, required: true }] }];
    if (path === '/organizations/integrations/webhook-deliveries') return [];
    if (path.startsWith('/organizations/api-usage')) return { totals: { requests: 0, throttled: 0 }, byEndpoint: [] };
    if (path === '/calendar/connections') return [{ provider: 'google', connected: false, connectedEmail: null }];
    throw new Error(`unexpected ${path}`);
  });
const show = (slug: string) => {
  (useParams as jest.Mock).mockReturnValue({ page: slug });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxNavContext.Provider value={{ nav: ADMIN, ready: true }}>
          <YxIntegrationSettingsPage />
        </YxNavContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't', role: 'org_admin', impersonating: false, actingSuperAdmin: false });
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
});

describe('Settings S-10: Integrations & Developers', () => {
  it('7.7: a new API key is shown once in a drawer; the webhook only masked', async () => {
    routes();
    show('developers');
    expect(await screen.findByText('https://hooks.example.com/…a1b2')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Create API key/ }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByDisplayValue('pk_live_once_only')).toBeInTheDocument();
    expect(calls).toEqual([['POST /organizations/integrations/api-key', null]]);
  });

  it('7.1: adding a connected app sends its address once (refused first without one); the list never shows it', async () => {
    routes();
    show('integrations');
    expect(within(await screen.findByRole('table', { name: 'Connected apps' })).getByText('Hiring alerts')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add connected app' }));
    const drawer = await screen.findByRole('dialog');
    await ue.click(within(drawer).getByRole('button', { name: 'Add connected app' }));
    expect(within(drawer).getByText('Enter the name.')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('7.6: an OpenAI-compatible key needs a public https base address first', async () => {
    routes();
    show('ai');
    await ue.click(await screen.findByRole('button', { name: /Use your own AI key/ }));
    const drawer = await screen.findByRole('dialog');
    await ue.click(within(drawer).getByRole('radio', { name: 'OpenAI-compatible' }));
    await ue.type(within(drawer).getByLabelText(/API key/), 'sk-test');
    await ue.type(within(drawer).getByRole('textbox', { name: /Base address/ }), 'http://10.0.0.5');
    await ue.click(within(drawer).getByRole('button', { name: 'Check and save' }));
    expect(within(drawer).getByText('Give a full https address.')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('negative: someone who is not a System Admin is told there is no access; 7.5 is for those who book interviews (their own calendar)', async () => {
    routes(true);
    const { unmount } = show('developers');
    expect(await screen.findByText(/You don't have access/)).toBeInTheDocument();
    unmount();
    show('calendar-and-chat');
    expect(await screen.findByRole('button', { name: /Connect Google Calendar/ })).toBeInTheDocument();
    const items = (keys: string[]) => buildNav({ ...base, has: (k) => keys.includes(k) }).flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.label)));
    expect(items(['org:manage_settings'])).toEqual(expect.arrayContaining(['Integrations', 'AI', 'Developers', 'Calendar & chat']));
    expect(items([])).not.toContain('Developers');
    // Answer 1901: IT staff with integration.manage see Integrations, AI and Developers.
    expect(items(['integration.manage'])).toEqual(expect.arrayContaining(['Integrations', 'AI', 'Developers']));
    expect(items([])).not.toContain('Calendar & chat');
    expect(items(['pipeline:manage'])).toContain('Calendar & chat');
  });

  it('negative: nothing changes while acting for someone else', async () => {
    routes();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 't', role: 'org_admin', impersonating: true, actingSuperAdmin: false });
    show('developers');
    await ue.click(await screen.findByRole('button', { name: /Create API key/ }));
    expect((await screen.findAllByText('Not available while acting for someone else.')).length).toBeGreaterThan(0);
    expect(calls).toEqual([]);
  });

  // The retired /v2 Integrations and Calendar addresses redirect in next.config.js (next.config.test.ts).
});
