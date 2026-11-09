import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav, type NavInput } from '../../lib/yx-nav';
import YxStaffingClientsPage from './(app)/staffing/clients/page';
import YxStaffingRateCardsPage from './(app)/staffing/rate-cards/page';
import YxStaffingSettingsPage from './(app)/settings/staffing/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Staffing desk slice 1: the designed screens with `live` on /staffing/*, and the menu group behind the desk switch.
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const push = jest.fn();
const calls: [string, unknown][] = [];
const ROWS = [{ id: 'c1', name: 'Nilgiri Retail', gstin: null, stateName: 'Tamil Nadu', status: 'active', accountManager: '', contractEnd: null, contacts: 0 }];
const CARD = { client: { id: 'c1', name: 'Nilgiri Retail' }, canManage: true, showPay: true, defaults: { ot: '1.5', holiday: '2', backdateDays: 0, today: '2026-11-14' }, rows: [{ id: 'r1', role: 'Java Developer', skill: 'Java', location: 'Chennai', unit: 'hour', billRate: '1200.00', payRate: '800.00', marginPct: '33.3', ot: '1.5', holiday: '2', validFrom: '2026-04-01', validTo: null }] };
const SETTINGS = {
  canEdit: true,
  values: { 'staffing.desk.enabled': 'off', 'staffing.ot_multiplier': '1.5', 'staffing.holiday_multiplier': '2', 'staffing.payment_terms_days': '30', 'staffing.rate_change.backdate_days': '0' },
  defaults: { 'staffing.desk.enabled': 'off', 'staffing.ot_multiplier': '1.5', 'staffing.holiday_multiplier': '2', 'staffing.payment_terms_days': '30', 'staffing.rate_change.backdate_days': '0' },
  choices: { 'staffing.ot_multiplier': ['1.5', '2'], 'staffing.holiday_multiplier': ['2'], 'staffing.payment_terms_days': ['30'], 'staffing.rate_change.backdate_days': ['0'] },
  lastChange: null, financialYear: '2026-27', entities: [], series: [],
};
const routes = (over: Record<string, unknown> = {}) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return (calls.push([`${init.method} ${path}`, init.body ? JSON.parse(String(init.body)) : null]), { id: 'x' });
    if (path in over) {
      const v = over[path];
      if (v instanceof Error) throw v;
      return v;
    }
    if (path.startsWith('/rbac/me/permissions')) return ['ats.staffing.manage', 'ats.staffing.view'];
    if (path === '/staffing/clients') return { canManage: true, choices: { states: [{ value: 'IN-TN', label: 'Tamil Nadu' }], people: [] }, rows: ROWS };
    if (path === '/staffing/clients/c1/rates') return CARD;
    if (path === '/staffing/settings') return SETTINGS;
    throw new Error(`unexpected ${path}`);
  });

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/staffing/clients');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({});
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', impersonating: false, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Staffing desk menu', () => {
  const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
  const links = (n: ReturnType<typeof buildNav>) => n.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.href)));
  it('its own group only when the company turned the desk on, for staffing key holders; the 6.2 settings link even while off', () => {
    const am = (k: string) => k === 'ats.staffing.manage' || k === 'ats.staffing.view';
    expect(links(buildNav({ ...base, has: am }))).not.toContain('/yx/staffing/clients');
    expect(links(buildNav({ ...base, has: am }))).toContain('/yx/settings/staffing');
    const on = buildNav({ ...base, has: am, staffing: true });
    expect(on.find((a) => a.id === 'hire')!.sections.find((s) => s.label === 'Staffing desk')!.items.map((l) => l.label)).toEqual(['Clients', 'Rate cards']);
    expect(links(buildNav({ ...base, has: () => false, staffing: true }))).not.toContain('/yx/staffing/clients');
    expect(links(buildNav({ ...base, has: am, staffing: true, support: true }))).not.toContain('/yx/staffing/clients');
  });
});

describe('Staffing desk pages', () => {
  it('clients: lists, opens one, and adds a client through the sheet', async () => {
    routes();
    wrap(<YxStaffingClientsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Open Nilgiri Retail' }));
    expect(push).toHaveBeenCalledWith('/yx/staffing/clients/c1');
    await ue.click(screen.getByRole('button', { name: 'Add client' }));
    const sheet = await screen.findByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Add client' }));
    expect(within(sheet).getByText('Enter the client’s name.')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('the desk off reads as such, not as an error', async () => {
    routes({ '/staffing/clients': Object.assign(new Error('The staffing desk is off for your company. An admin turns it on in Settings › Staffing desk.'), { status: 403 }) });
    wrap(<YxStaffingClientsPage />);
    expect(await screen.findByText('The staffing desk is off.')).toBeInTheDocument();
  });

  it('rate card: a dated change goes to the API as exact rupee text', async () => {
    routes();
    wrap(<YxStaffingRateCardsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Change rate' }));
    const sheet = screen.getByRole('dialog');
    await ue.type(within(sheet).getByLabelText(/^Reason/), 'Annual revision');
    await ue.click(within(sheet).getByRole('button', { name: 'Save dated change' }));
    await waitFor(() => expect(calls).toEqual([['POST /staffing/rates/r1/change', { validFrom: '2026-11-14', billRate: '1200.00', payRate: '800.00', reason: 'Annual revision' }]]));
  });

  it('6.2: turning the desk on saves the company setting; acting for someone else is view-only', async () => {
    routes();
    const { unmount } = wrap(<YxStaffingSettingsPage />);
    await ue.click(await screen.findByRole('checkbox', { name: /Turn on the staffing desk/ }));
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(calls).toEqual([['PUT /staffing/settings', { changes: [{ key: 'staffing.desk.enabled', value: 'on' }] }]]));
    unmount();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', impersonating: true, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    wrap(<YxStaffingSettingsPage />);
    expect(await screen.findByText('You can view these settings but not change them')).toBeInTheDocument();
  });
});
