import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { AS_OF, HISTORY } from '../../../../packages/yx-ui/src/screens/history/data';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxRolesAccessPage from './(app)/settings/access/page';
import YxProfilePage from './(app)/people/profile/page';
import YxProfileRequestsPage from './(app)/people/profile-requests/page';
import YxPrivacyPage from './(app)/me/privacy/page';
import YxPayAccessPage from './(app)/people/pay-access/page';
import { PersonRecord } from './(app)/people/person-record';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Access and privacy pages wired to the /access and /people APIs (P02 §4.2–4.5, §7).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const PERMS_PATH = '/rbac/me/permissions';
const ue = userEvent.setup({ pointerEventsCheck: 0 });
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
const replace = jest.fn();

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  replace.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const GRANT = {
  id: 'g-2',
  userId: 'u-lakshmi',
  userName: 'Lakshmi Venkatesan',
  role: { id: 'r-pay', name: 'Payroll Admin', confidential: true },
  scope: { type: 'legal_entity', id: 'le-2', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
  validFrom: '2026-10-08',
  validTo: null,
  status: 'pending',
  reason: 'Cover',
  grantedBy: 'Arjun Kulkarni',
  grantedById: 'u-other-admin',
  createdAt: '2026-10-07T09:00:00Z',
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
};

describe('/yx/settings/access', () => {
  it("previews a person's access and approves a grant another admin asked for", async () => {
    const posted: string[] = [];
    route({
      'GET /users/me': { id: 'u-admin', email: 'admin@demo-org.test', name: 'Admin', role: 'org_admin' },
      'GET /access/users': [{ id: 'u-lakshmi', name: 'Lakshmi Venkatesan', email: 'hr@demo-org.test', role: 'panel', status: 'active', employeeId: 'p-lakshmi' }],
      'GET /access/roles': [{ id: 'r-pay', name: 'Payroll Admin', permissions: ['employee.salary.view'], confidential: true, companyWideOnly: [], grants: 1, assignedUsers: 0 }],
      'GET /access/role-templates': [],
      'GET /access/grants': [GRANT],
      'GET /org/legal-entities': [],
      'GET /org/locations': [],
      'GET /org/masters/departments': [],
      'GET /access/users/u-lakshmi/effective': { userId: 'u-lakshmi', hasEmployeeRecord: true, keys: [{ key: 'employee.salary.view', label: 'See salary', people: 0, scopes: [] }] },
      'POST /access/grants/g-2/approve': (path: string) => (posted.push(path), { ...GRANT, status: 'active' }),
    });
    wrap(<YxRolesAccessPage />);
    expect(await screen.findByText('See salary')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: /Waiting/ }));
    await ue.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(posted).toEqual(['/access/grants/g-2/approve']));
  });

  it('makes a person a System Admin through the access API, with the reason', async () => {
    const posted: unknown[] = [];
    route({
      'GET /users/me': { id: 'u-admin', email: 'admin@demo-org.test', name: 'Admin', role: 'org_admin' },
      'GET /access/users': [{ id: 'u-lakshmi', name: 'Lakshmi Venkatesan', email: 'hr@demo-org.test', role: 'panel', status: 'active', employeeId: 'p-lakshmi' }],
      'GET /access/roles': [],
      'GET /access/role-templates': [],
      'GET /access/grants': [],
      'GET /org/legal-entities': [],
      'GET /org/locations': [],
      'GET /org/masters/departments': [],
      'GET /access/users/u-lakshmi/effective': { userId: 'u-lakshmi', hasEmployeeRecord: true, keys: [] },
      'POST /access/users/u-lakshmi/system-admin': (path: string, init: RequestInit) => (posted.push([path, JSON.parse(String(init.body))]), { id: 'u-lakshmi', role: 'org_admin' }),
    });
    wrap(<YxRolesAccessPage />);
    await ue.click(await screen.findByRole('button', { name: 'Make System Admin' }));
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'HR head');
    await ue.click(within(dialog).getByRole('button', { name: 'Make System Admin' }));
    await waitFor(() => expect(posted).toEqual([['/access/users/u-lakshmi/system-admin', { reason: 'HR head' }]]));
  });
});

const PROFILE = {
  employeeId: 'p-divya',
  name: 'Divya Raghunathan',
  self: true,
  employeeCode: 'KF-0001',
  joinedOn: '2021-01-11',
  classes: { internal: true, personal: true, identity: true, aadhaar: false, pay: true },
  personal: { dateOfBirth: '1992-03-14', gender: 'female', personalEmail: 'divya.r.home@mail.test', personalPhone: '+919845011122', addressLine1: null, addressLine2: null, city: 'Bengaluru', stateCode: 'IN-KA', postalCode: '560011', country: 'IN', hideBirthday: false },
  identity: { legalName: 'Divya Raghunathan', pan: '•••• 821K', aadhaar: '•••• 0248', uan: null, esic: null, bankAccounts: [], pending: [] },
  can: { editPersonal: true, requestChange: true, reveal: true },
};

describe('/yx/people/profile', () => {
  it('opens my own record and shows a masked value only after Show (the API records the look)', async () => {
    const reveals: unknown[] = [];
    route({
      [`GET ${PERMS_PATH}`]: [],
      'GET /people/me': { employeeId: 'p-divya', name: 'Divya Raghunathan' },
      'GET /people/employees/p-divya/profile': PROFILE,
      'GET /people/profile-requests': { rows: [] },
      'GET /org/reference': { states: [{ code: 'IN-KA', name: 'Karnataka', country: 'IN' }], regions: [] },
      'POST /people/employees/p-divya/identity/reveal': (_: string, init: RequestInit) => (reveals.push(JSON.parse(String(init.body))), { field: 'pan', value: 'BQRPR4821K' }),
      'GET /people/employees/p-divya/as-of': { ...AS_OF, employee: { ...AS_OF.employee, id: 'p-divya' } },
      'GET /people/employees/p-divya/history': HISTORY,
      'GET /people/employees/p-divya/person': { id: 'per-divya', roles: [] },
      'GET /people/profile-requests?status=pending': { rows: [] },
      'GET /me/leave': { balances: [] },
    });
    // The designed person record (PPL-03): identity values masked until Show, and the look is recorded by the API.
    wrap(<YxProfilePage />);
    expect(await screen.findByText('XXXXXX821K')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /^Show PAN/ }));
    expect(await screen.findByText('BQRPR4821K')).toBeInTheDocument();
    expect(reveals).toEqual([{ field: 'pan' }]);
  });
});

describe('/yx/people/profile-requests', () => {
  it('approves a change with the duplicate-value reason when the API asks for one', async () => {
    const bodies: unknown[] = [];
    let first = true;
    route({
      [`GET ${PERMS_PATH}`]: ['employee.identity.approve'],
      'GET /people/profile-requests': {
        rows: [{ id: 'pr-1', employeeId: 'p-kavya', employeeName: 'Kavya Reddy', kind: 'pan', label: 'PAN', proposed: { value: '•••• 234F' }, current: null, reason: 'Joining form', status: 'pending', requestedBy: 'Lakshmi Venkatesan', requestedAt: '2026-10-06T10:00:00Z', mine: false, decidedBy: null, decidedAt: null, decisionNote: null, overrideReason: null }],
      },
      'POST /people/profile-requests/pr-1/approve': (_: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        if (first) {
          first = false;
          throw Object.assign(new Error('Imran (KFT-0002) already has this PAN. Check it, or give a reason to approve anyway.'), { status: 409, code: 'DUPLICATE_IDENTIFIER' });
        }
        return { id: 'pr-1', status: 'approved' };
      },
    });
    wrap(<YxProfileRequestsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await within(dialog).findByText(/already has this PAN/)).toBeInTheDocument();
    await ue.type(within(dialog).getByRole('textbox'), 'Checked with payroll');
    await ue.click(within(dialog).getByRole('button', { name: 'Approve anyway' }));
    await waitFor(() => expect(bodies).toEqual([{}, { overrideReason: 'Checked with payroll' }]));
  });
});

// PPL-50 Team pay access (founder 28 Oct 2026): the manager asks from the Pay tab; HR decides on People › Team pay access.
const PAY_ASK = { id: 'pa-1', manager: { id: 'p-divya', name: 'Divya Raghunathan' }, scope: 'person', person: { id: 'p-arjun', name: 'Arjun Kulkarni' }, covers: 'Arjun Kulkarni', reason: 'Retention case', days: 30, state: 'first', askedAt: '2026-10-27T09:40:00Z', first: null, decided: null, validTo: null };

describe('/yx/people/pay-access', () => {
  it('HR approves the first step with a shorter length; the API gets the choice', async () => {
    const bodies: unknown[] = [];
    route({
      [`GET ${PERMS_PATH}`]: ['employee.pay_access.approve'],
      'GET /people/pay-access': { days: 30, scope: 'team', rows: [{ ...PAY_ASK, canDecide: true, team: [{ id: 'p-arjun', name: 'Arjun Kulkarni' }, { id: 'p-kavya', name: 'Kavya Reddy' }] }] },
      'POST /people/pay-access/pa-1/decision': (_: string, init: RequestInit) => (bodies.push(JSON.parse(String(init.body))), { ...PAY_ASK, state: 'second' }),
    });
    wrap(<YxPayAccessPage />);
    await ue.click(await screen.findByRole('button', { name: 'Decide' }));
    const drawer = await screen.findByRole('dialog', { name: /Team pay access for Divya Raghunathan/ });
    await ue.click(within(drawer).getByRole('combobox', { name: 'How long' }));
    await ue.click(await screen.findByRole('option', { name: '7 days' }));
    await ue.click(within(drawer).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(bodies).toEqual([{ decision: 'approve', days: '7', scope: 'person', employeeId: 'p-arjun' }]));
  });

  it('someone without the key gets the no-access state', async () => {
    route({ [`GET ${PERMS_PATH}`]: [], 'GET /people/pay-access': () => Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 })) });
    wrap(<YxPayAccessPage />);
    expect(await screen.findByText(/You don't have access to team pay access requests/)).toBeInTheDocument();
  });
});

describe('/yx/people/directory/[id] (a manager, PPL-50)', () => {
  it('the Pay tab offers Request access; the request goes to HR', async () => {
    const asks: unknown[] = [];
    route({
      [`GET ${PERMS_PATH}`]: [],
      'GET /people/me': { employeeId: 'p-divya', name: 'Divya Raghunathan' },
      'GET /people/employees/p-arjun/profile': { ...PROFILE, employeeId: 'p-arjun', name: 'Arjun Kulkarni', self: false, classes: { internal: true, personal: false, identity: false, aadhaar: false, pay: false }, personal: null, identity: null, can: { editPersonal: false, requestChange: false, reveal: false } },
      'GET /people/employees/p-arjun/as-of': { ...AS_OF, employee: { ...AS_OF.employee, id: 'p-arjun' }, payAccess: false },
      'GET /people/employees/p-arjun/history': HISTORY,
      'GET /people/employees/p-arjun/person': { id: 'per-arjun', roles: [] },
      'GET /people/profile-requests': { rows: [] },
      'GET /people/pay-access/mine': { days: 30, scope: 'team', team: [{ id: 'p-arjun', name: 'Arjun Kulkarni' }, { id: 'p-kavya', name: 'Kavya Reddy' }], requests: [] },
      'POST /people/pay-access': (_: string, init: RequestInit) => (asks.push(JSON.parse(String(init.body))), { ...PAY_ASK, canDecide: false }),
    });
    wrap(<PersonRecord personParam="p-arjun" path="/yx/people/directory/p-arjun" />);
    await ue.click(await screen.findByRole('tab', { name: 'Pay' }));
    await ue.click(await screen.findByRole('button', { name: 'Request access' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ask HR for access to pay' });
    expect(within(dialog).getByRole('radio', { name: 'My whole team (2)' })).toBeChecked();
    await ue.click(within(dialog).getByRole('radio', { name: 'Only Arjun' }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Why you need it/ }), 'Retention case');
    await ue.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(asks).toEqual([{ scope: 'person', employeeId: 'p-arjun', reason: 'Retention case' }]));
  });
});

describe('/yx/me/privacy', () => {
  it('lists who looked at my sensitive data', async () => {
    route({ 'GET /people/me/access-log': { enabled: true, company: 'Kaveri Foods', entries: [{ id: 'a-1', at: '2026-10-06T10:12:00Z', who: 'Suresh Pillai', role: 'Payroll Manager', what: 'Pay', context: 'Your pay history', className: 'confidential' }] } });
    wrap(<YxPrivacyPage />);
    expect(await screen.findByText(/What Kaveri Foods holds about you/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Who accessed my data/ }));
    expect((await screen.findAllByText('Suresh Pillai')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Your pay history').length).toBeGreaterThan(0);
  });
});

describe('/yx layout: access and privacy links follow the grants', () => {
  it('Roles & access for access.role.manage; the identity queue for those who raise or decide', async () => {
    const { usePathname } = jest.requireMock('next/navigation') as { usePathname: jest.Mock };
    usePathname.mockReturnValue('/yx/settings/access');
    const { default: YxAppLayout } = await import('./(app)/layout');
    route({
      'GET /auth/mfa': { factors: [], required: false, enrolmentDueAt: '2030-01-01T00:00:00Z' },
      [`GET ${PERMS_PATH}`]: ['access.role.manage', 'employee.identity.approve'],
      'GET /people/employees': [],
      'GET /people/team': { managerId: null, members: [] },
      'GET /users/me': { id: 'u-admin', email: 'admin@demo-org.test', name: 'Admin', role: 'org_admin' },
    });
    wrap(
      <YxAppLayout>
        <p>page</p>
      </YxAppLayout>,
    );
    // The designed frame: Settings is the open area with Roles & access current; People holds the identity queue.
    const panel = await screen.findByRole('navigation', { name: 'Settings' });
    await waitFor(() => expect(within(panel).getByRole('link', { name: 'Roles & access' })).toHaveAttribute('aria-current', 'page'));
    expect(within(screen.getByRole('navigation', { name: 'Areas' })).getByRole('link', { name: 'People' })).toHaveAttribute('href', '/yx/people/profile-requests');
    expect(screen.queryByRole('link', { name: 'My data' })).toBeNull();
  });
});
