import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { PAY_SETTINGS, TIME_REGISTRY_SAMPLE } from '@yukthix/ui/hiring';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav, PAY_SETTINGS_PAGES, type NavInput } from '../../lib/yx-nav';
import { YxNavContext } from '../../lib/yx-shell';
import YxPayrollSettingsPage from './(app)/settings/payroll/[page]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Settings S-3 (answers 1323 to 1325): /yx/settings/payroll/<page> reads GET /org/settings and saves PUT /org/settings;
// a change waits for a second person, approved or rejected through /org/settings/requests/:id.
const api = apiFetch as jest.Mock;
const push = jest.fn();
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
const ADMIN = buildNav({ ...base, has: () => true, role: 'org_admin' });
const calls: [string, unknown][] = [];
const PENDING = [{ id: 'r1', key: 'payroll.net_rounding', scopeType: 'tenant', scopeId: 'o1', from: null, to: 'none', by: 'Lakshmi Venkatesan', at: '2026-11-12T09:30:00.000Z', mine: false }];
const routes = (perms: string[], pending: object[] = [], overrides: object[] = []) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT' || init?.method === 'POST') return (calls.push([`${init.method} ${path}`, JSON.parse(String(init.body))]), { pending: true });
    if (path.startsWith('/rbac/me/permissions')) return perms;
    if (path === '/org/settings') return { registry: TIME_REGISTRY_SAMPLE, limits: { 'payroll.document_retention_years': { min: 8, act: 'Companies Act, 2013 s.128(5)' } }, pending, overrides };
    throw new Error(`unexpected ${path}`);
  });
const show = (slug: string) => {
  (useParams as jest.Mock).mockReturnValue({ page: slug });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxNavContext.Provider value={{ nav: ADMIN, ready: true }}>
          <YxPayrollSettingsPage />
        </YxNavContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  calls.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
});

describe('Settings S-3: Payroll pages', () => {
  it('every payroll settings page in the menu has its drawn page; payroll set-up sees them, others do not', () => {
    expect(PAY_SETTINGS_PAGES.map((p) => p[0]).sort()).toEqual(Object.keys(PAY_SETTINGS).sort());
    const labels = (keys: string[]) => buildNav({ ...base, has: (k) => keys.includes(k) }).flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.label)));
    expect(labels(['payroll.setup.manage'])).toEqual(expect.arrayContaining(['Payroll policies', 'Payslip settings', 'Tax']));
    expect(labels(['leave.settings.manage'])).not.toContain('Payroll policies');
  });

  it('with the switch on (the default), a change is sent for approval through PUT /org/settings', async () => {
    routes(['org.settings.manage']);
    show('tax');
    await ue.click(await screen.findByRole('combobox', { name: /Tax proof cut-off/ }));
    await ue.click(screen.getByRole('option', { name: '15 Mar' }));
    await ue.click(screen.getAllByRole('button', { name: 'Send for approval' })[0]!);
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(calls).toEqual([['PUT /org/settings', { key: 'tax.proof_cutoff', value: '03-15', scopeType: 'tenant' }]]));
    expect((await screen.findAllByText('Sent for approval')).length).toBeGreaterThan(0);
  });

  it('a waiting change shows with who asked; another HR person approves it', async () => {
    routes(['org.settings.manage'], PENDING);
    show('payroll-policies');
    const card = await screen.findByRole('region', { name: 'Waiting for a second person' });
    expect(within(card).getByText(/Asked by Lakshmi Venkatesan/)).toBeInTheDocument();
    await ue.click(within(card).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls).toEqual([['POST /org/settings/requests/r1/approve', {}]]));
  });

  it('with the switch off, Save changes saves at once', async () => {
    routes(['org.settings.manage'], [], [{ key: 'payroll.settings.second_person', scopeType: 'tenant', validFrom: null, value: 'off' }]);
    show('tax');
    await ue.click(await screen.findByRole('combobox', { name: /Tax proof cut-off/ }));
    await ue.click(screen.getByRole('option', { name: '15 Mar' }));
    expect(screen.queryByRole('button', { name: 'Send for approval' })).toBeNull();
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(calls).toHaveLength(1));
  });

  // Walk of S-3: someone without a second factor yet is told to add one, never "couldn't load"; real failures still are.
  it('the MFA floor shows "add a passkey" with Set it up; a real failure still says it could not load', async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/rbac/me/permissions')) return ['payroll.setup.manage'];
      throw Object.assign(new Error('Set up two-step verification to continue.'), { status: 403, code: 'MFA_REQUIRED' });
    });
    const { unmount } = show('payroll-policies');
    expect(await screen.findByText('Add a passkey or an authenticator app to open this page')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/)).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Set it up' }));
    expect(push).toHaveBeenCalledWith('/yx/me/security');
    unmount();
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/rbac/me/permissions')) return ['payroll.setup.manage'];
      throw Object.assign(new Error('Server error'), { status: 500 });
    });
    show('payroll-policies');
    expect(await screen.findByText("We couldn't load Payroll policies.")).toBeInTheDocument();
    expect(screen.queryByText('Add a passkey or an authenticator app to open this page')).toBeNull();
  });

  it('negative: payroll set-up reads the page (view only, no Approve); the layout editor link still opens', async () => {
    routes(['payroll.setup.manage'], PENDING);
    show('payslip-layout');
    expect(await screen.findByText('Keep issued pay documents for (years)')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Keep issued pay documents/ })).toBeNull();
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    await ue.click(await screen.findByRole('button', { name: /Edit payslip layout/ }));
    expect(push).toHaveBeenCalledWith('/yx/payroll/payslip-layout');
  });
});
