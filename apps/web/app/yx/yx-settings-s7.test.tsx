import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav, type NavInput } from '../../lib/yx-nav';
import { YxNavContext } from '../../lib/yx-shell';
import YxOrgSettingsPage from './(app)/settings/org/[page]/page';
import YxDocumentsSettingsPage from './(app)/settings/documents/[page]/page';
import YxAccountSettingsPage from './(app)/settings/account/[page]/page';
import YxPayrollSettingsPage from './(app)/settings/payroll/[page]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Settings S-7 (answers 1321, 1484, 1521): the settings from the three retired pages on their own drawn pages.
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
const ADMIN = buildNav({ ...base, has: () => true, role: 'org_admin' });
const REGISTRY = {
  'work.normal_week_hours': { label: 'Normal working week (hours)', scopes: ['tenant', 'legal_entity', 'location'], dated: false, values: ['pack', '40', '48'], default: 'pack' },
  'people.language': { label: 'People: language', scopes: ['tenant'], dated: false, values: ['en', 'hi'], default: 'en' },
  'policy.ack.due_days': { label: 'Policies: days to acknowledge a policy', scopes: ['tenant'], dated: false, values: ['7', '14', '30'], default: '14' },
  'help.tours.show': { label: 'Help: first-run tours', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on' },
  'payroll.settings.second_person': { label: 'Payroll setting changes need a second person', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on', guard: 'access.role.manage' },
  'payroll.loan.max_gross_months': { label: 'A loan or advance may be at most (months of gross pay)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['none', '2', '3'], default: '2' },
};
const calls: [string, unknown][] = [];
const routes = (perms: string[]) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.body instanceof FormData) return (calls.push([`${init.method} ${path}`, (init.body.get('file') as File).name]), {});
    if (init?.method === 'PUT' || init?.method === 'POST' || init?.method === 'PATCH') return (calls.push([`${init.method} ${path}`, JSON.parse(String(init.body))]), { pending: true });
    if (path === '/organizations/branding') return { logoUrl: null, primaryColor: '#0053E2' };
    if (path.startsWith('/rbac/me/permissions')) return perms;
    if (path === '/org/settings') return { registry: REGISTRY, limits: {}, pending: [], overrides: [] };
    if (path === '/org/legal-entities') return [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' }];
    if (path === '/org/locations') return [{ id: 'l1', name: 'Hosur plant' }];
    if (path.startsWith('/org/masters/')) return [];
    throw new Error(`unexpected ${path}`);
  });
const show = (Page: () => JSX.Element, slug: string) => {
  (useParams as jest.Mock).mockReturnValue({ page: slug });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxNavContext.Provider value={{ nav: ADMIN, ready: true }}>
          <Page />
        </YxNavContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
});

describe('Settings S-7: the new homes of the retired pages', () => {
  it('Company & branding shows the working week, and "Different for" offers the company entity', async () => {
    routes(['org.settings.manage']);
    show(YxOrgSettingsPage, 'company-and-branding');
    expect(await screen.findByRole('combobox', { name: /Normal working week/ })).toBeInTheDocument();
    await ue.click(await screen.findByRole('combobox', { name: /Apply changes to/ }));
    expect(await screen.findByRole('option', { name: 'Kaveri Foods Pvt Ltd' })).toBeInTheDocument();
  });

  it('1.1 logo and brand colour (answer 2422): the logo uploads at once with a toast; a light colour is refused, a dark one saves', async () => {
    routes(['org.settings.manage', 'org:manage_settings']);
    const { container } = show(YxOrgSettingsPage, 'company-and-branding');
    expect(await screen.findByText('Logo and brand colour')).toBeInTheDocument();
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });
    await ue.upload(container.querySelector('input[type=file]') as HTMLInputElement, file);
    await waitFor(() => expect(calls).toEqual([['POST /organizations/branding/logo', 'logo.png']]));
    expect((await screen.findAllByText('Logo saved')).length).toBeGreaterThan(0);
    calls.length = 0;
    const colour = screen.getByDisplayValue('#0053E2');
    await ue.clear(colour);
    await ue.type(colour, '#FFEE00');
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    expect((await screen.findAllByText('White button text is hard to read on this colour. Choose a darker one.')).length).toBeGreaterThan(0);
    expect(calls).toEqual([]);
    await ue.clear(colour);
    await ue.type(colour, '#1f6f5c');
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(calls).toEqual([['PATCH /organizations/branding', { primaryColor: '#1F6F5C' }]]));
  });

  it('negative (1.1): without the company settings key, or while acting, the logo and colour are view only', async () => {
    routes(['org.settings.manage']);
    const { container, unmount } = show(YxOrgSettingsPage, 'company-and-branding');
    expect(await screen.findByText('Logo and brand colour')).toBeInTheDocument();
    expect(container.querySelector('input[type=file]')).toBeNull();
    expect(screen.queryByDisplayValue('#0053E2')).toBeNull();
    unmount();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 't', impersonating: true });
    routes(['org.settings.manage', 'org:manage_settings']);
    const again = show(YxOrgSettingsPage, 'company-and-branding');
    expect(await screen.findByText('Logo and brand colour')).toBeInTheDocument();
    expect(again.container.querySelector('input[type=file]')).toBeNull();
  });

  it('Policies and Help and tips open their drawn pages', async () => {
    routes(['org.settings.manage']);
    const { unmount } = show(YxDocumentsSettingsPage, 'policies');
    expect(await screen.findByText(/days to acknowledge a policy/)).toBeInTheDocument();
    unmount();
    show(YxAccountSettingsPage, 'analytics-status-and-tips');
    expect(await screen.findByText(/first-run tours/)).toBeInTheDocument();
  });

  it('negative: without HR\'s settings key the Policies page is view only', async () => {
    routes(['org.structure.view']);
    show(YxDocumentsSettingsPage, 'policies');
    expect(await screen.findByText(/days to acknowledge a policy/)).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('Bonus & loan rules (4.6) sends a loan limit change for a second person, not saved at once (answer 1521)', async () => {
    routes(['org.settings.manage']);
    show(YxPayrollSettingsPage, 'loans-and-advances');
    await ue.click(await screen.findByRole('combobox', { name: /A loan or advance may be at most/ }));
    await ue.click(screen.getByRole('option', { name: /^3/ }));
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    await ue.click(screen.getAllByRole('button', { name: 'Send for approval' })[0]!);
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(calls).toEqual([['PUT /org/settings', { key: 'payroll.loan.max_gross_months', value: '3', scopeType: 'tenant' }]]));
  });
});
