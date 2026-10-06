import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDirectoryPage from './(app)/people/directory/page';
import YxTeamPage from './(app)/people/team/page';
import YxProbationPage from './(app)/people/probation/page';
import YxBulkChangesPage from './(app)/people/bulk-changes/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// People core pages wired to the /people API (P01 §4.4–4.5a; M01 §3.2–3.4, §3.10).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const PERMS_PATH = '/rbac/me/permissions';
const ref = (id: string, name: string) => ({ id, name });
const ARJUN = { id: 'p-arjun', name: 'Arjun Kulkarni', workEmail: 'arjun.kulkarni@kaverifoods.test', designation: ref('des-1', 'Quality Analyst'), department: ref('d-qa', 'Quality'), location: ref('loc-1', 'Bengaluru head office'), legalEntity: ref('le-1', 'Kaveri Foods Pvt Ltd'), manager: ref('p-divya', 'Divya Raghunathan') };
const CHART = {
  asOf: '2026-10-07',
  truncated: false,
  nodes: [
    { ...ARJUN, managerId: 'p-divya', dottedLineManagerIds: [], directReports: 0 },
    { id: 'p-divya', name: 'Divya Raghunathan', designation: ref('des-2', 'Senior QA Engineer'), department: ref('d-qa', 'Quality'), location: ARJUN.location, legalEntity: ARJUN.legalEntity, managerId: null, dottedLineManagerIds: [], directReports: 1 },
  ],
};

const api = apiFetch as jest.Mock;
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}
const push = jest.fn();

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx/people/directory', () => {
  it('searches on the server and filters from the org chart; colleagues see no codes', async () => {
    route({ [`GET ${PERMS_PATH}`]: [], 'GET /people/directory': { total: 1, limit: 50, offset: 0, people: [ARJUN] }, 'GET /people/org-chart': CHART });
    wrap(<YxDirectoryPage />);
    expect((await screen.findAllByText('Arjun Kulkarni')).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search people' }), 'arj');
    await waitFor(() => expect(api).toHaveBeenCalledWith('/people/directory?limit=50&offset=0&q=arj', {}, 'tok'));
    expect(screen.queryByText('Code')).toBeNull();
  });
});

describe('/yx/people/team', () => {
  it("opens a member's job history; a manager raising on behalf raises a change for a report", async () => {
    route({
      [`GET ${PERMS_PATH}`]: ['request.raise_on_behalf'],
      'GET /people/team': { managerId: 'p-divya', members: [{ ...ARJUN, employeeCode: 'KF-0142', relation: 'direct', joinedOn: '2024-07-01', status: 'confirmed', probationEndsOn: null }] },
      'GET /people/org-chart': CHART,
      'GET /org/masters/departments': [],
      'GET /org/masters/designations': [],
      'GET /org/masters/grades': [],
      'GET /org/masters/employment-types': [],
      'GET /org/masters/cost-centres': [],
      'GET /org/locations': [],
    });
    wrap(<YxTeamPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Job history' }));
    expect(push).toHaveBeenCalledWith('/yx/people/history?person=p-arjun');
    await userEvent.click(await screen.findByRole('button', { name: 'Raise change' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Change for Arjun Kulkarni')).toBeInTheDocument();
    expect(within(drawer).getByRole('combobox', { name: 'Kind of change' })).toBeInTheDocument();
  });
});

describe('/yx/people/probation', () => {
  it('extends with a reason through the API', async () => {
    const posted: unknown[] = [];
    route({
      [`GET ${PERMS_PATH}`]: ['employee.profile.view', 'employee.change.manage'],
      'GET /people/probations': { today: '2026-10-07', rows: [{ employeeId: 'p-kiran', name: 'Kiran Joshi', employeeCode: 'KF-0151', startOn: '2026-04-15', originalEndOn: '2026-10-14', plannedEndOn: '2026-10-14', extendedMonths: 0, reviewDueOn: '2026-09-29', escalatedOn: null, confirmedFrom: null, pendingConfirmationId: null, stage: 'review_due', maxTotalMonths: 12 }] },
      'POST /people/employees/p-kiran/probation/extend': (_: string, init: RequestInit) => {
        posted.push(JSON.parse(String(init.body)));
        return { plannedEndOn: '2027-01-14', extendedMonths: 3 };
      },
    });
    wrap(<YxProbationPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Extend' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'More time on audits');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Extend probation' }));
    await waitFor(() => expect(posted).toEqual([{ months: 3, reason: 'More time on audits' }]));
  });
});

describe('/yx/people/bulk-changes', () => {
  it('opens a batch from a link and approves it as a whole', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('batch=b-1'));
    const posted: unknown[] = [];
    const batch = { id: 'b-1', status: 'pending', source: 'csv', fileName: 'q3-reorg.csv', reason: 'Quality team moves', rowCount: 1, requestedBy: 'u-1', requestedAt: '2026-10-06T10:00:00Z', decidedAt: null, decisionNote: null, touchesPay: false };
    route({
      [`GET ${PERMS_PATH}`]: ['employee.profile.view', 'employee.change.approve'],
      'GET /people/change-batches': [batch],
      'GET /people/change-batches/b-1': { ...batch, changes: [] },
      'POST /people/change-batches/b-1/approve': (_: string, init: RequestInit) => {
        posted.push(JSON.parse(String(init.body)));
        return { ...batch, status: 'approved', changes: [] };
      },
    });
    wrap(<YxBulkChangesPage />);
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('Quality team moves')).toBeInTheDocument();
    expect(screen.queryByText('From a file')).toBeNull(); // approvers without manage rights cannot upload
    await userEvent.click(within(drawer).getByRole('button', { name: 'Approve all' }));
    await waitFor(() => expect(posted).toEqual([{ confirmRebase: false }]));
  });
});
