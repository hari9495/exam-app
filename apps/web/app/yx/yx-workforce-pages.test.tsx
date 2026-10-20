import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDirectoryPage from './(app)/people/directory/page';
import { ScopeProvider } from '../../lib/yx-shell';
import YxTeamPage from './(app)/people/team/page';
import YxProbationPage from './(app)/people/probation/page';
import YxBulkChangesPage from './(app)/people/bulk-changes/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// People core pages wired to the /people API (P01 §4.4–4.5a; M01 §3.2–3.4, §3.10).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
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

describe('/yx/people/directory (PPL-01 live)', () => {
  const ref = (id: string, name: string) => ({ id, name });
  const row = (over: Record<string, unknown>) => ({ kind: 'employee', designation: 'Quality Analyst', department: ref('d-qa', 'Quality'), location: ref('loc-1', 'Bengaluru'), legalEntity: ref('le-1', 'Kaveri Foods'), manager: ref('p-divya', 'Divya Raghunathan'), workEmail: 'x@kaverifoods.test', ...over });
  const WF = {
    me: { id: 'p-arjun', managerId: 'p-divya', departmentId: 'd-qa', locationId: 'loc-1' },
    rows: [row({ id: 'p-arjun', name: 'Arjun Kulkarni' }), row({ id: 'p-meera', name: 'Meera Iyer', department: ref('d-lab', 'Lab'), location: ref('loc-2', 'Hosur') })],
    cards: { employees: { count: 2, previous: null }, consultants: null, persons: { roles: 2, people: 2, previous: null } },
    previousMonth: null,
  };
  const HR_WF = {
    ...WF,
    me: null,
    rows: [row({ id: 'p-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142', status: 'Probation', joinedOn: '2024-07-01', phone: '+919845012345' }), row({ id: 'k-1', kind: 'consultant', name: 'Lexicon Advisory', designation: 'Consulting firm', department: null, location: null, manager: null, via: 'Lexicon Advisory' })],
    cards: { employees: { count: 1, previous: 0 }, consultants: { count: 1, previous: 1 }, persons: { roles: 2, people: 2, previous: 1 } },
    previousMonth: '2026-09',
  };

  it('opens at the name a search result gave (?q=) and lists only the company chosen in the top bar', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('q=Arjun'));
    window.localStorage.setItem('yx-scope', JSON.stringify({ entity: 'le-1', period: '2026-10' }));
    try {
      route({ [`GET ${PERMS_PATH}`]: [], 'GET /people/workforce': WF, 'GET /people/workforce/views': [] });
      wrap(
        <ScopeProvider>
          <YxDirectoryPage />
        </ScopeProvider>,
      );
      await waitFor(() => expect(api).toHaveBeenCalledWith('/people/workforce?legalEntityId=le-1', {}, 'tok'));
      expect(await screen.findByRole('textbox', { name: 'Search name or email' })).toHaveValue('Arjun');
    } finally {
      window.localStorage.removeItem('yx-scope');
    }
  });

  it('a colleague: Public columns only, no cards, and the quick chips from their own record', async () => {
    route({ [`GET ${PERMS_PATH}`]: [], 'GET /people/workforce': WF, 'GET /people/workforce/views': [] });
    wrap(<YxDirectoryPage />);
    expect((await screen.findAllByText('Meera Iyer')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('tablist', { name: 'Workforce' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /^ID/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /^Status/ })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'My department' }));
    await waitFor(() => expect(screen.queryAllByText('Meera Iyer')).toHaveLength(0));
    expect(screen.getAllByText('Arjun Kulkarni').length).toBeGreaterThan(0);
  });

  it('HR: cards with the change since last month, ID and status, Open record and the hire form', async () => {
    route({
      [`GET ${PERMS_PATH}`]: ['employee.profile.view', 'employee.change.manage'],
      'GET /people/workforce': HR_WF,
      'GET /people/workforce/views': [],
      'GET /people/org-chart': { asOf: '2026-10-15', truncated: false, nodes: [] },
      'GET /org/legal-entities': [{ id: 'le-1', name: 'Kaveri Foods Pvt Ltd', archivedAt: null }],
      'GET /org/masters/departments': [],
      'GET /org/masters/designations': [],
      'GET /org/masters/grades': [],
      'GET /org/masters/employment-types': [],
      'GET /org/masters/cost-centres': [],
      'GET /org/locations': [],
    });
    wrap(<YxDirectoryPage />);
    const tabs = await screen.findByRole('tablist', { name: 'Workforce' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.querySelector('.yx-ppl__wf-label')?.textContent)).toEqual(['Employees', 'Consultants', 'All persons']);
    expect(tabs).toHaveTextContent('1 more than September');
    expect(screen.getByRole('columnheader', { name: /^Status/ })).toBeInTheDocument();
    // Import opens People › Import (PPL-07).
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(push).toHaveBeenCalledWith('/yx/people/import');
    await userEvent.click((await screen.findAllByText('Arjun Kulkarni'))[0]);
    await userEvent.click(await screen.findByRole('button', { name: 'Open record' }));
    expect(push).toHaveBeenCalledWith('/yx/people/directory/p-arjun');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: 'Add employee' }));
    const drawer = await screen.findByRole('dialog', { name: /Add person/ });
    await waitFor(() => expect(api).toHaveBeenCalledWith('/org/legal-entities', {}, 'tok'));
    expect(within(drawer).getByRole('combobox', { name: 'Legal entity' })).toBeInTheDocument();
    expect(within(drawer).queryByLabelText(/Annual CTC/)).toBeNull();
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
      'GET /lifecycle/joining-soon': [],
      'GET /lifecycle/my-tasks': { today: '2026-10-07', tasks: [] },
    });
    // The designed team page (PPL-08): a row opens the person's record; Start a change opens the change drawer.
    wrap(<YxTeamPage />);
    await userEvent.click(await screen.findByText('Arjun Kulkarni'));
    expect(push).toHaveBeenCalledWith('/yx/people/directory/p-arjun');
    await userEvent.click(await screen.findByRole('button', { name: 'Start a change' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('combobox', { name: 'Change type' })).toBeInTheDocument();
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
    // The designed queue (PPL-16): HR decides; extending sends the months and the reason.
    wrap(<YxProbationPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Decide' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Extend/ }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Extend by/ }), '3');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Reason|Comments/ }), 'More time on audits');
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
