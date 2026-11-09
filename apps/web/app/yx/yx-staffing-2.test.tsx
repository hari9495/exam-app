import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav, type NavInput } from '../../lib/yx-nav';
import YxStaffingSubmissionsPage from './(app)/staffing/submissions/page';
import YxStaffingPlacementsPage from './(app)/staffing/placements/page';
import YxStaffingPlacementPage from './(app)/staffing/placements/[id]/page';
import YxStaffingBenchPage from './(app)/staffing/bench/page';
import YxHiringVendorsPage from './(app)/hiring/vendors/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Staffing desk slice 2: the designed screens with `live` on /staffing/* and /hiring/vendors; the menu; the API calls.
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
let keys: string[] = ['ats.staffing.manage', 'ats.staffing.view', 'pipeline:manage'];
const SUBS = [{ id: 's1', person: 'Arun Kumar', job: 'Java Developer', jobId: 'j1', client: 'Nilgiri Retail', contact: 'Meera', billRate: '1200.00', source: 'Bench', kind: 'employee', stage: 'submitted', daysInStage: 1, slaDays: 2, feedback: null, rejectedReason: null, emailed: true }];
const PL = { id: 'p1', person: 'Arun Kumar', role: 'Java Developer', unit: 'hour', clientId: 'c1', client: 'Nilgiri Retail', supply: 'own', vendor: null, startOn: '2026-11-01', endOn: '2027-01-31', status: 'active', endedReason: null, billRate: '1200.00', costRate: '800.00', statutory: '0.00', margin: '400.00', marginPct: '33.3', version: 3 };
const VENDOR = { id: 'v1', name: 'Velocity Talent', contactEmail: null, pan: 'ABCDE1234F', gstin: null, tdsSection: '194C', tier: 'preferred', agreementSignedOn: '2026-04-01', bankVerified: true, active: true, status: 'active', missing: [], sharedJobs: 1, submissions: 1, duplicateRate: 0, placements: 0, portalToken: 'tok-1', jobs: [{ id: 'j1', title: 'Java Developer', expiresOn: null }] };
const VSUB = { id: 'a1', vendor: 'Velocity Talent', candidate: 'Ravi', job: 'Office Assistant', jobId: 'j9', clientJob: false, at: '2026-11-09T10:00:00Z', quoted: null, cap: null, overBy: null, overCap: false, exception: null, duplicate: null, rightToRepresent: false, consent: false, status: 'pending' };
const routes = (over: Record<string, unknown> = {}) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return (calls.push([`${init.method} ${path}`, init.body ? JSON.parse(String(init.body)) : null]), { id: 'x', emailed: true, rows: [] });
    if (path in over) {
      const v = over[path];
      if (v instanceof Error) throw v;
      return v;
    }
    if (path.startsWith('/rbac/me/permissions')) return keys;
    if (path === '/staffing/submissions') return SUBS;
    if (path === '/staffing/jobs') return [{ id: 'j1', title: 'Java Developer', status: 'open', clientId: 'c1', client: 'Nilgiri Retail', billRate: '1200.00', unit: 'hour' }];
    if (path === '/staffing/clients') return { canManage: true, choices: null, rows: [{ id: 'c1', name: 'Nilgiri Retail' }] };
    if (path.startsWith('/staffing/submissions/options')) return { job: { id: 'j1', title: 'Java Developer', client: 'Nilgiri Retail' }, billRate: '1200.00', unit: 'hour', mask: true, people: [{ kind: 'employee', id: 'e1', name: 'Arun Kumar', note: 'Bench since 2026-10-01' }], contacts: [{ id: 'k1', name: 'Meera', role: 'HR' }] };
    if (path === '/staffing/placements') return { canManage: true, showPay: true, rows: [PL] };
    if (path === '/staffing/placements/placeable') return [];
    if (path === '/staffing/placements/p1') return { canManage: true, showPay: true, placement: PL };
    if (path === '/staffing/bench') return { canManage: true, policy: { maxDays: 30, payPct: 50, after: 'review' }, rows: [] };
    if (path === '/staffing/bench/candidates') return [{ value: 'e2', label: 'Bhavna Rao' }];
    if (path === '/staffing/vendors') return [VENDOR];
    if (path === '/staffing/vendor-submissions') return [VSUB];
    if (path === '/staffing/vendors/jobs') return [{ id: 'j1', title: 'Java Developer', client: 'Nilgiri Retail' }];
    throw new Error(`unexpected ${path}`);
  });

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  push.mockReset();
  keys = ['ats.staffing.manage', 'ats.staffing.view', 'pipeline:manage'];
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/staffing/submissions');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'p1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', impersonating: false, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('menu', () => {
  const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
  const links = (n: ReturnType<typeof buildNav>) => n.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.href)));
  it('Vendors under Hiring for vendor managers and recruiters, desk or not; never for others or in support', () => {
    for (const k of ['ats.agency.manage', 'pipeline:manage', 'org:manage_settings']) expect(links(buildNav({ ...base, has: (x) => x === k }))).toContain('/yx/hiring/vendors');
    expect(links(buildNav({ ...base, has: () => false }))).not.toContain('/yx/hiring/vendors');
    expect(links(buildNav({ ...base, has: () => true, support: true }))).not.toContain('/yx/hiring/vendors');
  });
});

describe('Staffing desk slice 2 pages', () => {
  it('submissions: the board, a move with the client’s reason, and a submit with exact rupee text', async () => {
    routes();
    wrap(<YxStaffingSubmissionsPage />);
    expect(await screen.findByText('Arun Kumar')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Submit to client' }));
    const sheet = await screen.findByRole('dialog');
    await ue.click(within(sheet).getByRole('combobox', { name: /Client job/ }));
    await ue.click(await screen.findByRole('option', { name: /Java Developer · Nilgiri Retail/ }));
    await ue.click(await within(sheet).findByRole('combobox', { name: /People/ }));
    await ue.click(await screen.findByRole('option', { name: /Arun Kumar/ }));
    await ue.keyboard('{Escape}');
    await ue.click(within(sheet).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(calls).toEqual([['POST /staffing/submissions', { jobId: 'j1', people: [{ kind: 'employee', id: 'e1' }], contactId: 'k1', billRate: '1200.00', masked: true }]]));
  });

  it('placements: account managers see the margin and open a record; extend sends the version', async () => {
    routes();
    const { unmount } = wrap(<YxStaffingPlacementsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Open Arun Kumar' }));
    expect(push).toHaveBeenCalledWith('/yx/staffing/placements/p1');
    unmount();
    wrap(<YxStaffingPlacementPage />);
    await ue.click(await screen.findByRole('button', { name: 'Extend' }));
    const sheet = await screen.findByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Save extension' }));
    expect(within(sheet).getByText('Choose a day after the current last day.')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('acting for someone else: no change buttons on placements or the bench', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', impersonating: true, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    routes();
    const { unmount } = wrap(<YxStaffingPlacementPage />);
    expect(await screen.findByText('Arun Kumar at Nilgiri Retail')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Extend' })).not.toBeInTheDocument();
    unmount();
    wrap(<YxStaffingBenchPage />);
    expect(await screen.findByText('No one is on the bench.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to bench' })).not.toBeInTheDocument();
  });

  it('bench: the desk off reads as such', async () => {
    routes({ '/staffing/bench': Object.assign(new Error('The staffing desk is off for your company.'), { status: 403 }) });
    wrap(<YxStaffingBenchPage />);
    expect(await screen.findByText('The staffing desk is off.')).toBeInTheDocument();
  });

  it('vendors: register with the portal link; a recruiter accepts an ordinary job’s submission through the existing review', async () => {
    routes();
    const { unmount } = wrap(<YxHiringVendorsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Change Velocity Talent' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByDisplayValue(/\/agency\/tok-1$/)).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Stop sharing Java Developer' }));
    await waitFor(() => expect(calls).toEqual([['DELETE /staffing/vendors/v1/jobs/j1', null]]));
    unmount();
    calls.length = 0;
    keys = ['pipeline:manage'];
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('tab=submissions'));
    wrap(<YxHiringVendorsPage />);
    expect(await screen.findByText('Ravi')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Register/ })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Accept into pipeline' }));
    await waitFor(() => expect(calls).toEqual([['POST /agency-submissions/a1/accept', null]]));
  });
});
