import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxRolesAccessPage from './(app)/settings/access/page';
import YxProfilePage from './(app)/people/profile/page';
import YxProfileRequestsPage from './(app)/people/profile-requests/page';
import YxPrivacyPage from './(app)/me/privacy/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Access and privacy pages wired to the /access and /people APIs (P02 §4.2–4.5, §7).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
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
    });
    wrap(<YxProfilePage />);
    expect(await screen.findByText('•••• 821K')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Show' }));
    expect(await screen.findByText('BQRPR4821K')).toBeInTheDocument();
    expect(reveals).toEqual([{ field: 'pan' }]);
    await ue.click(screen.getByRole('button', { name: 'Open job history' }));
    expect(push).toHaveBeenCalledWith('/yx/people/history?person=p-divya');
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

describe('/yx/me/privacy', () => {
  it('lists who looked at my sensitive data', async () => {
    route({ 'GET /people/me/access-log': { enabled: true, entries: [{ id: 'a-1', at: '2026-10-06T10:12:00Z', who: 'Suresh Pillai', what: 'Pay', className: 'confidential' }] } });
    wrap(<YxPrivacyPage />);
    expect((await screen.findAllByText('Suresh Pillai')).length).toBeGreaterThan(0);
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
    const nav = await screen.findByRole('navigation', { name: 'Settings' });
    await waitFor(() => expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(expect.arrayContaining(['Identity and bank changes', 'Roles & access'])));
    expect(within(nav).queryByRole('link', { name: 'Who accessed my data' })).toBeNull();
  });
});
