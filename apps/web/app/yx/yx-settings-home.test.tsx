import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api-client';
import userEvent from '@testing-library/user-event';
import { useParams, useRouter } from 'next/navigation';
import { SETTINGS_GROUPS } from '@yukthix/ui/hiring';
import { buildNav, SETTINGS_PAGE_EDITORS, type NavInput } from '../../lib/yx-nav';
import { YxNavContext } from '../../lib/yx-shell';
import { groupSlug, settingsForViewer } from '../../lib/yx-settings-home';
import YxSettingsHomePage from './(app)/settings/page';
import YxSettingsGroupPage from './(app)/settings/[group]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn(() => ({ accessToken: 't' })) }));

// Settings S-1 (answers 1321, 1322): the drawn Settings home and group pages, live. A page shows only when the viewer's
// menu holds one of its live editors; each leads to that editor (never a second copy).
const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
const navOf = (keys: string[], over: Partial<NavInput> = {}) => buildNav({ ...base, has: (k) => keys.includes(k), ...over });
const ADMIN = navOf([], { has: () => true, role: 'org_admin' });
const EMPLOYEE = navOf([], { employee: true });
const PAYROLL_ONLY = navOf(['payroll.setup.manage', 'payroll.component.manage', 'payroll.template.manage', 'payroll.loan.manage', 'payroll.run.view']);
const push = jest.fn();
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement, nav: ReturnType<typeof buildNav>, ready = true) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><YxNavContext.Provider value={{ nav, ready }}>{ui}</YxNavContext.Provider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
// Settings S-5: the home asks for its recent changes and the viewer's keys; by default none.
const serve = (history: unknown[] = [], keys: string[] = []) => api.mockImplementation(async (path: string) => (path.startsWith('/rbac/me/permissions') ? keys : path.startsWith('/org/settings/history') ? history : []));
const pages = (nav: ReturnType<typeof buildNav>) => settingsForViewer(nav).groups.flatMap((g) => g.pages.map((p) => p.id));

beforeEach(() => {
  push.mockReset();
  api.mockReset();
  serve();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
});

describe('Settings S-1: which pages', () => {
  it('every front door names a drawn page and leads to a page the full menu has', () => {
    const all = new Set(ADMIN.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.href))));
    const drawn = new Set(SETTINGS_GROUPS.flatMap((g) => g.pages.map((p) => p.id)));
    for (const [id, hrefs] of Object.entries(SETTINGS_PAGE_EDITORS)) {
      expect(drawn.has(id)).toBe(true);
      for (const h of hrefs) expect([id, all.has(h)]).toEqual([id, true]);
    }
    expect(pages(ADMIN)).toEqual(Object.keys(SETTINGS_PAGE_EDITORS));
  });

  it('negative: an employee opens no settings page, so there is no Settings menu and the home says no access', () => {
    expect(pages(EMPLOYEE)).toEqual([]);
    expect(EMPLOYEE.map((a) => a.id)).not.toContain('settings');
    show(<YxSettingsHomePage />, EMPLOYEE);
    expect(screen.getByText("You don't have access to any settings page")).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('a payroll-only admin sees Payroll & Statutory pages and no People & Access page; Settings opens the home', () => {
    const ids = pages(PAYROLL_ONLY);
    expect(ids).toEqual(expect.arrayContaining(['4.1', '4.2', '4.4', '4.6', '4.7']));
    expect(ids.filter((id) => id.startsWith('2.'))).toEqual([]);
    expect(PAYROLL_ONLY.find((a) => a.id === 'settings')?.sections[0]?.items[0]).toMatchObject({ label: 'All settings', href: '/yx/settings' });
    show(<YxSettingsHomePage />, PAYROLL_ONLY);
    expect(screen.getByRole('heading', { name: 'Payroll & Statutory' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'People & Access' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Roles & access' })).toBeNull();
  });

  it('while the menu loads the home waits (no flash of no access)', () => {
    show(<YxSettingsHomePage />, [], false);
    expect(screen.getByRole('status', { name: 'Loading settings' })).toBeInTheDocument();
    expect(screen.queryByText(/You don't have access/)).toBeNull();
  });
});

describe('Settings S-1: home and search', () => {
  it('each link opens the live editor', async () => {
    show(<YxSettingsHomePage />, ADMIN);
    const card = screen.getByRole('heading', { name: 'Organisation' }).closest('section') as HTMLElement;
    const entities = within(card).getByRole('link', { name: 'Legal entities' });
    expect(entities).toHaveAttribute('href', '/yx/settings/legal-entities');
    await ue.click(entities);
    expect(push).toHaveBeenCalledWith('/yx/settings/legal-entities');
    await ue.click(within(card).getByRole('link', { name: /All 6 pages in Organisation/ }));
    expect(push).toHaveBeenCalledWith('/yx/settings/organisation');
  });

  it('search finds a setting by its words and opens its page\'s live editor; a page the viewer may not open never shows', async () => {
    show(<YxSettingsHomePage />, ADMIN);
    await ue.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'probation');
    const results = screen.getByRole('region', { name: 'Search results' });
    const hit = within(results).getAllByRole('link').find((a) => a.textContent?.includes('Onboarding & probation'))!;
    expect(hit).toHaveAttribute('href', '/yx/settings/company-rules');
    await ue.click(hit);
    expect(push).toHaveBeenCalledWith('/yx/settings/company-rules');
  });

  it('negative: search shows nothing from pages the viewer may not open', async () => {
    show(<YxSettingsHomePage />, PAYROLL_ONLY);
    await ue.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'probation');
    expect(screen.getByText('No settings match "probation"')).toBeInTheDocument();
  });
});

describe('Settings S-1: group pages', () => {
  it('a group page lists the pages the viewer may open, each opening its live editor', async () => {
    (useParams as jest.Mock).mockReturnValue({ group: groupSlug('Time & Leave') });
    show(<YxSettingsGroupPage />, ADMIN);
    expect(screen.getByRole('heading', { name: 'Time & Leave', level: 1 })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Shifts & patterns' });
    expect(link).toHaveAttribute('href', '/yx/settings/time/shifts-and-patterns'); // S-2: the settings page first
    await ue.click(link);
    expect(push).toHaveBeenCalledWith('/yx/settings/time/shifts-and-patterns');
    expect(screen.getByRole('link', { name: 'Late & regularisation' })).toHaveAttribute('href', '/yx/settings/time/late-and-regularisation');
  });

  it('negative: a payroll-only admin opening People & Access, or an unknown group, gets no access', () => {
    (useParams as jest.Mock).mockReturnValue({ group: 'people-and-access' });
    const { unmount } = show(<YxSettingsGroupPage />, PAYROLL_ONLY);
    expect(screen.getByText("You don't have access to the pages of this settings group")).toBeInTheDocument();
    unmount();
    (useParams as jest.Mock).mockReturnValue({ group: 'canteen' });
    show(<YxSettingsGroupPage />, ADMIN);
    expect(screen.getByText("You don't have access to the pages of this settings group")).toBeInTheDocument();
  });
});

// Settings S-5 (answers 1461, 1563): Recently changed on the home, only for pages the person may open.
describe('Settings S-5: Recently changed', () => {
  const ROW = { id: 'h1', at: '2026-11-12T10:05:00.000Z', by: 'Lakshmi Venkatesan', role: 'org_admin', key: 'roster.min_weekly_offs', label: 'Weekly offs', scope: 'Company', from: '1', to: '2' };
  it('the latest change links to its page; the audit log link shows with audit.view', async () => {
    serve([ROW], ['audit.view']);
    show(<YxSettingsHomePage />, ADMIN);
    const card = (await screen.findByText('Recently changed')).closest('section, div')!.parentElement as HTMLElement;
    expect(within(card).getByRole('link', { name: /1 → 2/ })).toHaveAttribute('href', '/yx/settings/time/weekly-offs');
    expect(within(card).getByRole('link', { name: 'Audit log' })).toHaveAttribute('href', '/yx/settings/audit-log');
    expect(api.mock.calls.some(([p]) => String(p).startsWith('/org/settings/history?keys=') && String(p).includes('roster.min_weekly_offs'))).toBe(true);
  });

  it('negative: a payroll-only admin never asks for the Time & Leave history; no audit link without audit.view', async () => {
    serve([]);
    show(<YxSettingsHomePage />, PAYROLL_ONLY);
    await waitFor(() => expect(api.mock.calls.some(([p]) => String(p).startsWith('/org/settings/history'))).toBe(true));
    const asked = api.mock.calls.map(([p]) => decodeURIComponent(String(p))).filter((p) => p.startsWith('/org/settings/history'));
    expect(asked.every((p) => !p.includes('roster.min_weekly_offs'))).toBe(true);
    expect(screen.queryByRole('link', { name: 'Audit log' })).toBeNull();
  });
});
