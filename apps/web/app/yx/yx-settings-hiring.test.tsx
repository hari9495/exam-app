import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHiringSettingsPage from './(app)/settings/hiring/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Settings 6.1 Hiring: the designed settings page with `live`, on GET/PUT /hiring/settings; stage targets (answer 302).
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const SETTINGS = {
  canEdit: true,
  people: [{ id: 'u1', name: 'Neha Joshi' }],
  values: { 'ats.retention_months': '12', 'hiring.reject.email_candidate': 'off', 'ats.referral.bonus_inr': '25000', 'ats.referral.qualify_days': '90', 'hiring.requisition.default_recruiter': 'none' },
  defaults: { 'ats.retention_months': '12', 'hiring.reject.email_candidate': 'off', 'ats.referral.bonus_inr': '25000', 'ats.referral.qualify_days': '90', 'hiring.requisition.default_recruiter': 'none' },
  choices: { 'ats.retention_months': ['6', '12', '18'], 'hiring.reject.email_candidate': ['off', 'on'], 'ats.referral.bonus_inr': ['25000', '50000'], 'ats.referral.qualify_days': ['60', '90'], 'hiring.requisition.default_recruiter': ['none'] },
  lastChange: { by: 'Neha Joshi', at: '2026-11-08T10:00:00Z', what: 'Changed referral bonus' },
  pipelines: [{ id: 'p1', name: 'Standard', isDefault: true, jobs: 2, stages: [{ id: 's1', name: 'Applied', category: 'active', daysTarget: null, limit: null }] }],
  scorecards: [],
};
const calls: [string, unknown][] = [];
const routes = (perms: string[], settings: object = SETTINGS) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return (calls.push([`${init.method} ${path}`, JSON.parse(String(init.body))]), {});
    if (path.startsWith('/rbac/me/permissions')) return perms;
    if (path === '/hiring/settings') return settings;
    throw new Error(`unexpected ${path}`);
  });

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/settings/hiring');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', organizationSlug: 'kaveri', role: 'org_admin', impersonating: false, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Settings › Hiring (6.1, live)', () => {
  it('saves a change as a company setting with a toast; the last change shows who', async () => {
    routes(['ats.settings.manage']);
    wrap(<YxHiringSettingsPage />);
    expect(await screen.findByText('Default recruiter for new requisitions')).toBeInTheDocument();
    expect(screen.getByText(/Neha Joshi/)).toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: /Tell candidates when they are not selected/ }));
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(calls).toEqual([['PUT /hiring/settings', { changes: [{ key: 'hiring.reject.email_candidate', value: 'on' }] }]]));
    expect((await screen.findAllByText('Hiring settings saved')).length).toBeGreaterThan(0);
  });

  it('read-only without the key, and while acting for someone else', async () => {
    routes(['pipeline:manage'], { ...SETTINGS, canEdit: false });
    const { unmount } = wrap(<YxHiringSettingsPage />);
    expect(await screen.findByText('You can view these settings but not change them')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    unmount();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', impersonating: true, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    routes(['ats.settings.manage']);
    wrap(<YxHiringSettingsPage />);
    expect(await screen.findByText('You can view these settings but not change them')).toBeInTheDocument();
  });

  it('stage targets of a pipeline: the pipelines key edits them in a sheet; a bad value is refused before saving', async () => {
    routes(['pipelines:configure']);
    wrap(<YxHiringSettingsPage />);
    const table = await screen.findByRole('table', { name: 'Pipeline templates' });
    await ue.click(within(table).getByRole('button', { name: /Stage targets/ }));
    const sheet = await screen.findByRole('dialog');
    await ue.type(within(sheet).getByLabelText(/^Applied: days target/), '0');
    await ue.click(within(sheet).getByRole('button', { name: 'Save stage targets' }));
    expect((await within(sheet).findAllByText(/1 to 365 days|between 1 and 365/)).length).toBeGreaterThan(0);
    expect(calls).toEqual([]);
    await ue.clear(within(sheet).getByLabelText(/^Applied: days target/));
    await ue.type(within(sheet).getByLabelText(/^Applied: days target/), '5');
    await ue.click(within(sheet).getByRole('button', { name: 'Save stage targets' }));
    await waitFor(() => expect(calls).toEqual([['PATCH /pipelines/stages/s1', { daysTarget: 5, limit: null }]]));
  });

  it('no access: the API refusal shows the error state', async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/rbac/me/permissions')) return [];
      throw Object.assign(new Error('Missing any of required permission(s)'), { status: 403 });
    });
    wrap(<YxHiringSettingsPage />);
    expect(await screen.findByText(/We couldn't load Hiring/)).toBeInTheDocument();
  });
});
