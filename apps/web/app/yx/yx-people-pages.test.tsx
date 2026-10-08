import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxAppLayout from './(app)/layout';
import YxJobHistoryPage from './(app)/people/history/page';
import YxJobChangesPage from './(app)/people/changes/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { name: 'Divya Raghunathan', email: 'divya.r@kaverifoods.in' } }) }));

// People › Job history and Job changes wired to the /people API (P06).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const PERMS_PATH = '/rbac/me/permissions';
const PERSON = { id: 'p-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142', legalEntityId: 'le-1', designation: 'Quality Analyst', department: 'Quality', location: 'Bengaluru head office' };
const HEADER = { id: 'p-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142', legalEntity: { id: 'le-1', name: 'Kaveri Foods Pvt Ltd' }, joinedOn: '2024-07-01', exitedOn: null };
const FACTS = {
  location: { id: 'loc-1', name: 'Bengaluru head office', state: 'IN-KA', timezone: 'Asia/Kolkata' },
  department: { id: 'd-1', name: 'Quality' },
  designation: { id: 'des-1', name: 'Quality Analyst' },
  grade: { id: 'g-1', name: 'G2 · Executive' },
  employmentType: { id: 'et-1', name: 'Permanent' },
  manager: { id: 'p-divya', name: 'Divya Raghunathan' },
  costCentres: [],
};
const asOf = (pay: boolean) => ({ employee: HEADER, asOf: '2026-10-06', assignment: { ...FACTS, validFrom: '2024-07-01', validTo: null }, status: { status: 'confirmed', validFrom: '2024-07-01', validTo: null }, payAccess: true, compensation: pay ? { currency: 'INR', annualCtc: '583200.00', validFrom: '2026-04-01', validTo: null } : null });
const HISTORY = { employee: HEADER, payAccess: true, changes: [], assignment: [], status: [], compensation: [] };
const CHANGE = {
  id: 'c-1', employeeId: 'p-arjun', employeeName: 'Arjun Kulkarni', changeType: 'promotion', effectiveDate: '2026-11-01', status: 'pending', reason: 'Promotion after the review', overrideReason: null,
  retro: false, requestedAt: '2026-10-01T10:00:00Z', decidedAt: null, decisionNote: null, touchesPay: false, payload: {}, impact: null,
};
const IMPACT = { effectiveDate: '2026-11-01', facts: [{ fact: 'Designation', from: 'Quality Analyst', to: 'Senior QA Engineer' }], pay: [], rebased: [], retro: null };

const api = apiFetch as jest.Mock;
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/people/history');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx layout: the People group follows grants and the employee record', () => {
  const MFA = { factors: [], required: false, enrolmentDueAt: '2030-01-01T00:00:00Z' };
  const links = async () => within(await screen.findByRole('navigation', { name: 'Menu' })).getAllByRole('link').map((a) => a.textContent);

  const NO_TEAM = { managerId: null, members: [] };
  const MEMBER = { id: 'p-arjun', name: 'Arjun Kulkarni', relation: 'direct' };

  it('HR sees the whole People group', async () => {
    route({ 'GET /auth/mfa': MFA, [`GET ${PERMS_PATH}`]: ['employee.profile.view', 'employee.change.manage'], 'GET /people/employees': [PERSON], 'GET /people/team': NO_TEAM });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    await waitFor(async () => expect(await links()).toEqual(['Profile', 'Directory', 'Org chart', 'Job history', 'Job changes', 'Probation', 'Bulk changes', 'Help centre', 'My security']));
  });

  it('a manager sees the directory, their team, history and probations; raising on behalf adds Job changes', async () => {
    route({ 'GET /auth/mfa': MFA, [`GET ${PERMS_PATH}`]: ['request.raise_on_behalf'], 'GET /people/employees': [PERSON], 'GET /people/team': { managerId: 'p-divya', members: [MEMBER] } });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    await waitFor(async () => expect(await links()).toEqual(['Profile', 'Directory', 'Org chart', 'My team', 'Job history', 'Job changes', 'Probation', 'Help centre', 'My security', 'Who accessed my data']));
  });

  it('an employee without reports sees the directory and their history; someone with no record sees no People group', async () => {
    route({ 'GET /auth/mfa': MFA, [`GET ${PERMS_PATH}`]: [], 'GET /people/employees': [PERSON], 'GET /people/team': { managerId: 'p-arjun', members: [] } });
    const { unmount } = wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    await waitFor(async () => expect(await links()).toEqual(['Profile', 'Directory', 'Org chart', 'Job history', 'Help centre', 'My security', 'Who accessed my data']));
    unmount();
    route({ 'GET /auth/mfa': MFA, [`GET ${PERMS_PATH}`]: [], 'GET /people/employees': [], 'GET /people/team': NO_TEAM });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    await screen.findByText('page');
    await waitFor(() => expect(api).toHaveBeenCalledWith('/people/employees', {}, 'tok'));
    expect(screen.queryByRole('link', { name: 'Job history' })).toBeNull();
  });
});

describe('/yx/people/history', () => {
  it('shows the chosen person; pay is asked for only after Show pay (R1)', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('person=p-arjun'));
    route({
      [`GET ${PERMS_PATH}`]: [],
      'GET /people/employees': [PERSON],
      'GET /people/employees/p-arjun/as-of': (path: string) => asOf(path.includes('pay=true')),
      'GET /people/employees/p-arjun/history': HISTORY,
    });
    wrap(<YxJobHistoryPage />);
    expect(await screen.findByText('Divya Raghunathan')).toBeInTheDocument();
    expect(api.mock.calls.map((c) => c[0]).filter((p: string) => p.includes('pay=true'))).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show pay' }));
    expect(await screen.findByText('₹5,83,200')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(expect.stringMatching(/as-of\?date=\d{4}-\d{2}-\d{2}&pay=true$/), {}, 'tok');
  });

  it('no person chosen: a picker and what to do', async () => {
    route({ [`GET ${PERMS_PATH}`]: [], 'GET /people/employees': [PERSON] });
    wrap(<YxJobHistoryPage />);
    expect(await screen.findByText('Choose a person to see their job history.')).toBeInTheDocument();
  });
});

describe('/yx/people/changes', () => {
  it('Review previews the impact, then Approve posts the approval', async () => {
    const posted: unknown[] = [];
    route({
      [`GET ${PERMS_PATH}`]: ['employee.profile.view', 'employee.change.approve'],
      'GET /people/changes': [CHANGE],
      'GET /people/changes/c-1/preview': IMPACT,
      'POST /people/changes/c-1/approve': (_: string, init: RequestInit) => {
        posted.push(JSON.parse(String(init.body)));
        return { ...CHANGE, status: 'scheduled' };
      },
    });
    wrap(<YxJobChangesPage />);
    const table = await screen.findByRole('table', { name: 'Job changes' });
    expect(within(table).getByRole('link', { name: 'Arjun Kulkarni' }).getAttribute('href')).toBe('/yx/people/history?person=p-arjun');
    expect(screen.queryByRole('button', { name: 'New change' })).toBeNull();
    await userEvent.click(await within(table).findByRole('button', { name: 'Review' }));
    expect(await screen.findByText('Senior QA Engineer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(posted).toEqual([{ confirmRebase: false }]));
  });
});
