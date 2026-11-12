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
    throw new Error(`unexpected ${path}`);
  });
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
