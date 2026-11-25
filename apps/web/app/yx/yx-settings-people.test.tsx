import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { PEOPLE_SETTINGS, TIME_REGISTRY_SAMPLE } from '@yukthix/ui/hiring';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav, PEOPLE_SETTINGS_PAGES, type NavInput } from '../../lib/yx-nav';
import { YxNavContext } from '../../lib/yx-shell';
import { todayIst } from '../../lib/yx-org';
import YxPeopleSettingsPage from './(app)/settings/people/[page]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Settings S-4 (answers 1323, 1324): /yx/settings/people/<page> reads GET /org/settings and saves PUT /org/settings; a
// dated setting is sent with today as its start day.
const api = apiFetch as jest.Mock;
const push = jest.fn();
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
const ADMIN = buildNav({ ...base, has: () => true, role: 'org_admin' });
const calls: [string, unknown][] = [];
const CATS = [{ id: 'c1', name: 'Laptop', trackedBy: 'Serial number', defaultRecovery: '45000.00', usefulLifeYears: 3, assets: 4, version: 2 }];
const routes = (perms: string[], overrides: object[] = [], canEditCats = true) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT' || init?.method === 'POST') return (calls.push([`${init.method} ${path}`, JSON.parse(String(init.body ?? '{}'))]), {});
    if (path === '/lifecycle/asset-categories') return { canEdit: canEditCats, rows: CATS };
    if (path.startsWith('/rbac/me/permissions')) return perms;
    if (path === '/org/settings') return { registry: TIME_REGISTRY_SAMPLE, limits: {}, pending: [], overrides };
    throw new Error(`unexpected ${path}`);
  });
const show = (slug: string) => {
  (useParams as jest.Mock).mockReturnValue({ page: slug });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxNavContext.Provider value={{ nav: ADMIN, ready: true }}>
          <YxPeopleSettingsPage />
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

describe('Settings S-4: People pages', () => {
  it('every People settings page in the menu has its drawn page; only HR\'s settings key sees them', () => {
    expect(PEOPLE_SETTINGS_PAGES.map((p) => p[0]).sort()).toEqual(Object.keys(PEOPLE_SETTINGS).sort());
    const labels = (keys: string[]) => buildNav({ ...base, has: (k) => keys.includes(k) }).flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.label)));
    expect(labels(['org.settings.manage'])).toEqual(expect.arrayContaining(['Exit & lifecycle policies', 'Audit & data retention']));
    expect(labels(['employee.profile.view'])).not.toContain('Exit & lifecycle policies');
  });

  it('a dated notice period in force today is shown; a change is sent with today as its start day', async () => {
    routes(['org.settings.manage'], [{ key: 'exit.notice.confirmed', scopeType: 'tenant', validFrom: '2026-01-01', value: '45d' }, { key: 'exit.notice.confirmed', scopeType: 'tenant', validFrom: '2099-01-01', value: '3m' }]);
    show('exit-and-lifecycle-policies');
    const field = await screen.findByRole('combobox', { name: /Notice period once confirmed/ });
    expect(field).toHaveTextContent('45 days');
    await ue.click(field);
    await ue.click(screen.getByRole('option', { name: '2 months' }));
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(calls).toEqual([['PUT /org/settings', { key: 'exit.notice.confirmed', value: '2m', scopeType: 'tenant', validFrom: todayIst() }]]));
  });

  it('negative (S-7): the page no longer points to the retired Company rules page; its contract settings live here', async () => {
    routes(['org.settings.manage']);
    show('exit-and-lifecycle-policies');
    expect(await screen.findByRole('combobox', { name: /Notice period once confirmed/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Company rules/ })).toBeNull();
    expect(PEOPLE_SETTINGS['2.7']!.settings.map((s) => s.key)).toEqual(expect.arrayContaining(['contract.max_years', 'contract_end.action']));
  });

  it('IT assets part 1 (2712): 2.8 lists the company categories; a row opens its drawer and a change is saved with its version', async () => {
    routes(['org.settings.manage']);
    show('assets');
    await ue.click(await screen.findByRole('button', { name: 'Edit Laptop' }));
    const d = await screen.findByRole('dialog');
    const name = within(d).getByRole('textbox', { name: /Name/ });
    await ue.clear(name);
    await ue.type(name, 'Laptops');
    await ue.click(within(d).getByRole('button', { name: 'Save category' }));
    await waitFor(() => expect(calls).toContainEqual(['PUT /lifecycle/asset-categories/c1', { name: 'Laptops', trackedBy: 'Serial number', defaultRecovery: '45000.00', usefulLifeYears: 3, version: 2 }]));
    expect(screen.getByRole('radio', { name: 'Click to accept' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'E-sign' })).toBeNull();
  });

  it('negative (2712): without the company-wide settings key the categories cannot be opened or added', async () => {
    routes(['org.structure.view'], [], false);
    show('assets');
    expect(await screen.findByText('Laptop')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Laptop' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add asset category' })).toBeNull();
  });

  it('negative: without HR\'s settings key the page is view only', async () => {
    routes(['org.structure.view']);
    show('audit-and-data-retention');
    expect(await screen.findByText('Keep the audit log for (years)')).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });
});
