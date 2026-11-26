import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav, type NavInput } from '../../lib/yx-nav';
import { YxNavContext } from '../../lib/yx-shell';
import YxAccountSettingsPage from './(app)/settings/account/[page]/page';
import YxTimeSettingsPage from './(app)/settings/time/[page]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn(), redirect: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Settings S-9 (answers 1328, 1332): group 8 live. Billing read-only for the billing key; export and closure for System Admins.
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
const ADMIN = buildNav({ ...base, has: () => true, role: 'org_admin' });
const calls: [string, unknown][] = [];
const BILLING = {
  plan: { name: 'Growth', priceLabel: '₹99 a person a month', billingInterval: 'month' },
  lifecycle: 'active',
  trialEndsAt: null,
  products: [{ code: 'hrms', name: 'YukthiX HR', since: '2026-04-01' }],
  usage: { seats: { used: 412, limit: 500 }, candidates: { used: 3, limit: 50 }, aiCredits: { used: 0, limit: 100 }, proctoringMinutes: { used: 0, limit: 60 }, periodStart: '2026-11-01' },
  invoices: [],
};
const DATA = { companyName: 'Kaveri Foods', linkHours: 24, keepDays: 30, exports: [], closure: null };
const routes = (opts: { refuse?: boolean } = {}) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST') return (calls.push([`POST ${path}`, init.body ? JSON.parse(String(init.body)) : null]), { id: 'x1' });
    if (opts.refuse) throw Object.assign(new Error('Missing required permission(s): org:manage_billing'), { status: 403 });
    if (path === '/account/billing') return BILLING;
    if (path === '/account/data') return DATA;
    throw new Error(`unexpected ${path}`);
  });
const show = (slug: string, role = 'org_admin') => {
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't', role, impersonating: false, actingSuperAdmin: false });
  (useParams as jest.Mock).mockReturnValue({ page: slug });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxNavContext.Provider value={{ nav: ADMIN, ready: true }}>
          <YxAccountSettingsPage />
        </YxNavContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
});

describe('Settings S-9: Billing & Account', () => {
  it('8.1 shows the plan and products read only; 8.2 the usage; nothing to save or pay', async () => {
    routes();
    const { unmount } = show('plan-and-add-ons');
    expect(await screen.findByText('Growth · ₹99 a person a month · billed monthly')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Products' })).getByText('YukthiX HR')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Save changes|Pay now|Checkout)$/ })).toBeNull();
    unmount();
    show('usage-and-caps');
    expect(within(await screen.findByRole('table', { name: 'Usage meters' })).getByText('412')).toBeInTheDocument();
  });

  it('negative: without the billing key the page says there is no access', async () => {
    routes({ refuse: true });
    show('invoices-and-payment', 'panel');
    expect(await screen.findByText(/You don't have access/)).toBeInTheDocument();
  });

  it('8.5: a System Admin starts an export and asks to close (the company name is checked first)', async () => {
    routes();
    show('data-export-and-closure');
    await ue.click(await screen.findByRole('button', { name: /Start full export/ }));
    await waitFor(() => expect(calls).toEqual([['POST /account/exports', null]]));
    await ue.click(screen.getByRole('button', { name: /Ask YukthiX to close the account/ }));
    const drawer = await screen.findByRole('dialog');
    await ue.type(within(drawer).getByRole('textbox', { name: /Company name/ }), 'Someone else');
    await ue.click(within(drawer).getByRole('button', { name: 'Ask to close' }));
    expect(within(drawer).getAllByText('Type Kaveri Foods to confirm.').length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    await ue.clear(within(drawer).getByRole('textbox', { name: /Company name/ }));
    await ue.type(within(drawer).getByRole('textbox', { name: /Company name/ }), 'Kaveri Foods');
    await ue.type(within(drawer).getByRole('textbox', { name: /Why/ }), 'Moving to another tool');
    await ue.click(within(drawer).getByRole('button', { name: 'Ask to close' }));
    await waitFor(() => expect(calls[1]).toEqual(['POST /account/closure', { companyName: 'Kaveri Foods', reason: 'Moving to another tool' }]));
  });

  it('negative: someone who is not a System Admin is told so and nothing is sent; the menu shows 8.5 to System Admins only', async () => {
    routes();
    show('data-export-and-closure', 'panel');
    await ue.click(await screen.findByRole('button', { name: /Start full export/ }));
    expect((await screen.findAllByText('Only a System Admin can export all data.')).length).toBeGreaterThan(0);
    expect(calls).toEqual([]);
    const items = (role: string) => buildNav({ ...base, has: (k) => k === 'org:manage_billing', role }).flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.label)));
    expect(items('panel')).toEqual(expect.arrayContaining(['Plan & add-ons', 'Usage & caps', 'Invoices']));
    expect(items('panel')).not.toContain('Data export & closure');
    expect(items('org_admin')).toContain('Data export & closure');
    // Answer 1884: billing.view shows the three billing pages, never the data page.
    const finance = buildNav({ ...base, has: (k) => k === 'billing.view', role: 'panel' }).flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.label)));
    expect(finance).toEqual(expect.arrayContaining(['Plan & add-ons', 'Usage & caps', 'Invoices']));
    expect(finance).not.toContain('Data export & closure');
  });

  // Answer 1821: the registered-factory hint on 3.1, from the API's flag on a location's own value.
  it("1821: a location's own Factories Act value says it is no longer needed once the location is a registered factory; negative: not without the flag", async () => {
    const FA = { label: 'Factories Act applies', scopes: ['tenant', 'location'], dated: true, values: ['covered', 'not_covered'], default: 'not_covered' };
    const time = (flag: boolean) =>
      api.mockImplementation(async (path: string) => {
        if (path.startsWith('/rbac/me/permissions')) return ['org.settings.manage', 'leave.settings.manage'];
        if (path === '/org/settings') return { registry: { 'attendance.factories_act': FA }, limits: {}, pending: [], overrides: [{ key: 'attendance.factories_act', scopeType: 'location', scopeId: 'l1', validFrom: '2026-01-01', value: 'covered', ...(flag ? { noLongerNeeded: 'registered_factory' } : {}) }] };
        if (path === '/org/locations') return [{ id: 'l1', name: 'Hosur plant' }];
        if (path.startsWith('/org/')) return [];
        throw new Error(`unexpected ${path}`);
      });
    time(true);
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 't', role: 'org_admin', impersonating: false, actingSuperAdmin: false });
    (useParams as jest.Mock).mockReturnValue({ page: 'attendance-modes' });
    const view = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <YxNavContext.Provider value={{ nav: ADMIN, ready: true }}>
            <YxTimeSettingsPage />
          </YxNavContext.Provider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/No longer needed: the location is a registered factory/)).toBeInTheDocument();
    view.unmount();
    time(false);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <YxNavContext.Provider value={{ nav: ADMIN, ready: true }}>
            <YxTimeSettingsPage />
          </YxNavContext.Provider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Hosur plant \(location\)/)).toBeInTheDocument();
    expect(screen.queryByText(/No longer needed/)).toBeNull();
  });

  // Answer 1885: the /v2 billing page is retired; bookmarks and payment return links land on Plan & add-ons.
  // 1885: /v2/settings/billing redirects to Plan & add-ons in next.config.js (next.config.test.ts; the page is deleted).
});
