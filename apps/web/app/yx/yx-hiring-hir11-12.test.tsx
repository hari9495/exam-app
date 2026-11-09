import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav } from '../../lib/yx-nav';
import { costMonths, costRow, quarterOf, referralRow, todayInIndia } from '../../lib/yx-hiring-costs';
import YxHiringCostsPage from './(app)/hiring/costs/page';
import YxReferralsPage from './(app)/hiring/referrals/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// HIR-11 Recruiting costs and HIR-12 Referrals: the designed screens with `live`, on the API.
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/costs');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', organizationSlug: 'kaveri', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('HIR-11 / HIR-12 glue (India time, rupees)', () => {
  it('months and the quarter are India time; amounts stay rupees with paise', () => {
    // 31 Oct 2026 19:00 UTC is 1 Nov 00:30 in India.
    expect(costMonths(new Date('2026-10-31T19:00:00Z'))).toEqual([{ value: '2026-10', label: 'Oct' }, { value: '2026-11', label: 'Nov' }]);
    expect(costMonths(new Date('2027-01-05T06:00:00Z'))).toEqual([{ value: '2026-12', label: 'Dec' }, { value: '2027-01', label: 'Jan' }]);
    expect(quarterOf('2026-10-01', '2026-12-31')).toEqual({ label: 'Oct–Dec 2026', months: ['2026-10', '2026-11', '2026-12'] });
    const row = costRow({ id: 'c1', source: 'Naukri', costType: 'posting', jobId: null, jobTitle: null, amount: '4500.50', period: null, origin: 'manual', note: null, enteredByName: null, createdAt: '2026-10-31T19:00:00Z' });
    expect(row).toMatchObject({ amount: 4500.5, type: 'Job board', month: '2026-11', period: 'Nov 2026', origin: 'Manual' });
    expect(costRow({ ...{ id: 'c2', source: 'Referral: Kiran', costType: 'referral_bonus', jobId: null, jobTitle: null, amount: 15000, period: '2026-10-01', origin: 'payroll', note: null, enteredByName: null, createdAt: '2026-10-02T00:00:00Z' } })).toMatchObject({ origin: 'Payroll one-time pay', enteredBy: 'System', type: 'Referral bonus' });
    expect(todayInIndia(new Date('2026-11-08T19:00:00Z')).getDate()).toBe(9);
    expect(referralRow({ id: 'r', candidateName: 'A', jobTitle: 'J', stage: 'Hired', joinedOn: '2026-12-01', bonusInr: 20000, rewardStatus: 'paid', createdAt: '2026-11-08T19:00:00Z' })).toMatchObject({ paid: true, bonus: 20000, joined: new Date(2026, 11, 1), referred: new Date(2026, 10, 9) });
  });

  it('menu: Referrals for employees and hiring people; Recruiting costs only with the settings key; nothing in a support session', () => {
    const base = { role: 'panel', support: false, employee: true, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
    const hire = (has: (k: string) => boolean, support = false) => buildNav({ ...base, has, support }).find((a) => a.id === 'hire')!;
    const hireArea = (support: boolean) => buildNav({ ...base, has: () => true, support }).find((a) => a.id === 'hire');
    const links = (a: ReturnType<typeof hire>) => a.sections.flatMap((s) => s.items.map((i) => i.href));
    expect(links(hire(() => false))).toEqual(['/yx/hiring/referrals']); // an employee with no keys
    expect(buildNav({ ...base, employee: false, has: () => false }).find((a) => a.id === 'hire')).toBeUndefined();
    const hr = hire((k) => k === 'org:manage_settings');
    expect(links(hr)).toContain('/yx/hiring/costs');
    expect(hr.sections.find((s) => s.label === 'Reports & compliance')?.items.map((i) => i.label)).toEqual(['Recruiting costs']);
    expect(links(hire((k) => k === 'pipeline:manage'))).not.toContain('/yx/hiring/costs');
    expect(hireArea(true)).toBeUndefined(); // a support session has no Hiring at all
  });
});

describe('Hiring › Recruiting costs (HIR-11)', () => {
  const costs = [{ id: 'c1', source: 'Sahyadri Staffing', costType: 'agency_fee', jobId: 'j1', jobTitle: 'Senior QA Engineer', amount: 64000.75, period: '2026-10-01', origin: 'manual', note: null, enteredByName: 'Neha Joshi', createdAt: '2026-10-11T00:00:00.000Z' }];
  const routes = (writes: { method: string; path: string; body: unknown }[], fail?: string) =>
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method) {
        if (fail) throw Object.assign(new Error(fail), { status: 400 });
        writes.push({ method: init.method, path, body: init.body ? JSON.parse(String(init.body)) : undefined });
        return {};
      }
      if (path === '/hiring/costs') return costs;
      if (path === '/hiring/costs/overview') return { from: '2026-10-01', to: '2026-12-31', hires: 2, jobs: [{ id: 'j1', title: 'Senior QA Engineer' }] };
      throw new Error(`unexpected GET ${path}`);
    });

  it('shows the quarter, cost per hire, and edits a cost in rupees with a toast', async () => {
    const writes: { method: string; path: string; body: unknown }[] = [];
    routes(writes);
    wrap(<YxHiringCostsPage />);
    expect(await screen.findByRole('region', { name: 'Cost summary, Oct–Dec 2026' })).toBeInTheDocument();
    expect(screen.getByText('₹32,000')).toBeInTheDocument(); // 64,000.75 / 2, rounded
    await ue.click(screen.getByRole('button', { name: /Row actions|Actions|More/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const d = screen.getByRole('dialog');
    const amount = within(d).getByRole('textbox', { name: /Amount/ });
    await ue.clear(amount);
    await ue.type(amount, '60000.5');
    await ue.click(within(d).getByRole('button', { name: 'Save cost' }));
    await waitFor(() => expect(writes).toEqual([{ method: 'PUT', path: '/hiring/costs/c1', body: { costType: 'agency_fee', source: 'Sahyadri Staffing', jobId: 'j1', amount: 60000.5, currency: 'INR', period: '2026-10-01', note: null } }]));
    expect(await screen.findByText('Cost saved')).toBeInTheDocument();
  });

  it('a refusal from the API stays in the sheet', async () => {
    routes([], 'That job is not in your organisation.');
    wrap(<YxHiringCostsPage />);
    await screen.findByRole('region', { name: 'Cost summary, Oct–Dec 2026' });
    await ue.click(screen.getAllByRole('button', { name: 'Add cost' })[0]!);
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Source/ }), 'Naukri');
    await ue.type(within(d).getByRole('textbox', { name: /Amount/ }), '4500');
    await ue.click(within(d).getByRole('button', { name: 'Add cost' }));
    expect(await within(d).findByText('That job is not in your organisation.')).toBeInTheDocument();
  });

  it('no key (403) shows the error state, not a blank page', async () => {
    api.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    wrap(<YxHiringCostsPage />);
    expect(await screen.findByRole('button', { name: /Try again|Retry/ })).toBeInTheDocument();
  });
});

describe('Hiring › Referrals (HIR-12)', () => {
  it('lists my referrals with the company bonus and refers a friend', async () => {
    const posted: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/referrals' && init?.method === 'POST') return (posted.push(JSON.parse(String(init.body))), { id: 'r9' });
      if (path === '/referrals/mine') return [{ id: 'r1', candidateName: 'Kiran Rao', jobTitle: 'Accountant', stage: 'Hired', joinedOn: '2026-01-01', bonusInr: 20000, rewardStatus: 'pending', createdAt: '2025-12-01T00:00:00Z' }];
      if (path === '/referrals/jobs') return [{ id: 'j1', title: 'Senior QA Engineer', location: 'Chennai', department: null }];
      if (path === '/referrals/policy') return { bonusInr: 20000, qualifyDays: 60 };
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    wrap(<YxReferralsPage />);
    expect(await screen.findByText('₹20,000 eligible · paid in the next payroll')).toBeInTheDocument();
    expect(screen.getByText(/once they complete 60 days/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Refer someone' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /full name/ }), 'Ananya Iyer');
    await ue.type(within(d).getByRole('textbox', { name: /Email/ }), 'ananya@mailbox.in');
    await ue.type(within(d).getByRole('textbox', { name: /Mobile/ }), '9876543210');
    await ue.click(within(d).getByRole('checkbox', { name: /My friend agreed/ }));
    await ue.click(within(d).getByRole('button', { name: 'Send referral' }));
    await waitFor(() => expect(posted).toEqual([{ jobId: 'j1', name: 'Ananya Iyer', email: 'ananya@mailbox.in', phone: '+919876543210', consentGiven: true }]));
    expect(await screen.findByText('Ananya Iyer referred')).toBeInTheDocument();
  });

  it('acting for someone else: the refusal shows in the sheet', async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') throw Object.assign(new Error('Not available while acting for someone else'), { status: 403 });
      if (path === '/referrals/mine') return [];
      if (path === '/referrals/jobs') return [{ id: 'j1', title: 'Senior QA Engineer', location: 'Chennai', department: null }];
      return { bonusInr: 25000, qualifyDays: 90 };
    });
    wrap(<YxReferralsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Refer someone' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /full name/ }), 'Ananya Iyer');
    await ue.type(within(d).getByRole('textbox', { name: /Email/ }), 'ananya@mailbox.in');
    await ue.type(within(d).getByRole('textbox', { name: /Mobile/ }), '9876543210');
    await ue.click(within(d).getByRole('checkbox', { name: /My friend agreed/ }));
    await ue.click(within(d).getByRole('button', { name: 'Send referral' }));
    expect(await within(d).findByText('Not available while acting for someone else')).toBeInTheDocument();
  });
});
