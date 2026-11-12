import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { TIME_REGISTRY_SAMPLE, TIME_SETTINGS } from '@yukthix/ui/hiring';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav, TIME_SETTINGS_PAGES, type NavInput } from '../../lib/yx-nav';
import { YxNavContext } from '../../lib/yx-shell';
import YxTimeSettingsPage from './(app)/settings/time/[page]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Settings S-2 (answers 1323, 1324): /yx/settings/time/<page> reads GET /org/settings and saves PUT /org/settings.
const api = apiFetch as jest.Mock;
const push = jest.fn();
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
const ADMIN = buildNav({ ...base, has: () => true, role: 'org_admin' });
const LIMITS = { 'roster.max_weekly_hours': { max: 48, act: 'Factories Act, 1948 s.51' } };
const calls: [string, unknown][] = [];
const routes = (perms: string[], refuse?: string) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      calls.push([`PUT ${path}`, JSON.parse(String(init.body))]);
      if (refuse) throw Object.assign(new Error(refuse), { status: 400 });
      return {};
    }
    if (path.startsWith('/rbac/me/permissions')) return perms;
    if (path === '/org/settings') return { registry: TIME_REGISTRY_SAMPLE, limits: LIMITS, overrides: [{ key: 'attendance.wfh_monthly_limit', scopeType: 'tenant', validFrom: null, value: '6' }] };
    // Settings S-5 (1326): the page's own history.
    if (path.startsWith('/org/settings/history?keys=')) return HISTORY;
    throw new Error(`unexpected ${path}`);
  });
let HISTORY: unknown[] = [];
const show = (slug: string) => {
  (useParams as jest.Mock).mockReturnValue({ page: slug });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxNavContext.Provider value={{ nav: ADMIN, ready: true }}>
          <YxTimeSettingsPage />
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

describe('Settings S-2: Time & Leave pages', () => {
  it('every Time & Leave page in the menu has its drawn settings page', () => {
    expect(TIME_SETTINGS_PAGES.map((p) => p[0]).sort()).toEqual(Object.keys(TIME_SETTINGS).sort());
  });

  it('shows the company value and Starter default; a more generous value is saved company-wide', async () => {
    routes(['org.settings.manage']);
    show('shifts-and-patterns');
    expect(await screen.findByText('Legal maximum: 48 (Factories Act, 1948 s.51)')).toBeInTheDocument();
    expect(screen.getAllByText('Starter default').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('combobox', { name: /Most hours of shifts in a week/ }));
    await ue.click(screen.getByRole('option', { name: '45' }));
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(calls).toEqual([['PUT /org/settings', { key: 'roster.max_weekly_hours', value: '45', scopeType: 'tenant' }]]));
  });

  it('negative: the API refusal stays on the page, edits kept', async () => {
    routes(['org.settings.manage'], 'Most hours of shifts in a week can be at most 48 by law (Factories Act, 1948 s.51). Choose 48 or less.');
    show('shifts-and-patterns');
    await ue.click(await screen.findByRole('combobox', { name: /Most hours of shifts in a week/ }));
    await ue.click(screen.getByRole('option', { name: '40' }));
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    expect((await screen.findAllByText(/Factories Act, 1948 s\.51\)\. Choose 48 or less/)).length).toBeGreaterThan(0);
  });

  it('the drawn link opens the live editor', async () => {
    routes(['org.settings.manage']);
    show('shifts-and-patterns');
    await ue.click(await screen.findByRole('button', { name: /Open shift editor/ }));
    expect(push).toHaveBeenCalledWith('/yx/time/shifts-setup');
  });

  // Answer 1485: a leave admin changes Leave year but only reads Weekly offs; answer 1333: the menu offers it, read-only.
  it('a leave admin saves Leave year; Weekly offs is in their menu and view only', async () => {
    routes(['leave.settings.manage']);
    const LEAVE = buildNav({ ...base, has: (k) => k === 'leave.settings.manage' });
    expect(LEAVE.find((a) => a.id === 'settings')?.sections.flatMap((s) => s.items.map((l) => l.label))).toEqual(expect.arrayContaining(['Leave types', 'Holiday calendars', 'Leave year']));
    expect(LEAVE.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.label)))).toContain('Weekly offs');
    const { unmount } = show('leave-year');
    await ue.click(await screen.findByRole('combobox', { name: /Leave year starts in/ }));
    await ue.click(screen.getByRole('option', { name: 'April' }));
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(calls).toEqual([['PUT /org/settings', { key: 'leave.year_start_month', value: '4', scopeType: 'tenant' }]]));
    unmount();
    show('weekly-offs');
    expect(await screen.findByText('View only')).toBeInTheDocument();
  });

  it('negative: without the settings key the page is view only; an unknown page says no access', async () => {
    routes(['org.structure.view']);
    const { unmount } = show('late-and-regularisation');
    expect(await screen.findByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    unmount();
    show('canteen');
    expect(screen.getByText(/You don't have access to/)).toBeInTheDocument();
  });
});

// Settings S-5 (answer 1326): each page shows its last changes, asking only for its own settings.
describe('Settings S-5: change history', () => {
  beforeEach(() => {
    HISTORY = [];
  });
  it('the last change under the title and the rest in View history; only the page settings are asked for', async () => {
    HISTORY = [
      { id: 'h2', at: '2026-11-12T10:05:00.000Z', by: 'Lakshmi Venkatesan', role: 'org_admin', key: 'roster.max_weekly_hours', label: 'Most hours', scope: 'Company', from: '48', to: '45' },
      { id: 'h1', at: '2026-11-10T10:05:00.000Z', by: 'Suresh Pillai', role: null, key: 'roster.max_weekly_hours', label: 'Most hours', scope: 'Company', from: null, to: '48' },
    ];
    routes(['org.settings.manage']);
    show('shifts-and-patterns');
    expect(await screen.findByText(/Last changed by Lakshmi Venkatesan/)).toBeInTheDocument();
    const asked = api.mock.calls.map(([p]) => decodeURIComponent(String(p))).find((p) => p.startsWith('/org/settings/history'))!;
    expect(asked).toContain('roster.max_weekly_hours');
    expect(asked).not.toContain('leave.year_start_month');
    await ue.click(screen.getByRole('button', { name: 'View history' }));
    expect(await screen.findByText(/from Starter default to 48/)).toBeInTheDocument();
  });

  it('negative: nothing changed yet shows no history line', async () => {
    routes(['org.settings.manage']);
    show('shifts-and-patterns');
    await screen.findAllByText('Starter default');
    expect(screen.queryByText(/Last changed by/)).toBeNull();
  });
});
