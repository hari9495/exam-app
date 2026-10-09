import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxAppLayout from './(app)/layout';
import YxLegalEntitiesPage from './(app)/settings/legal-entities/page';
import YxLocationsPage from './(app)/settings/locations/page';
import YxStructurePage from './(app)/settings/structure/page';
import YxCompanyRulesPage from './(app)/settings/company-rules/page';
import YxAccessSettingsPage from './(app)/settings/access-settings/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { name: 'Arjun Kulkarni', email: 'arjun.k@kaverifoods.in' } }) }));

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const PERMS_PATH = '/rbac/me/permissions';
const ENTITY = {
  id: 'le-1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', country: 'IN', currency: 'INR', fyStartMonth: 4, dataRegion: 'IN', isDefault: true, archivedAt: null,
  registeredAddress: { lines: ['14 Residency Road'], city: 'Bengaluru', state: 'IN-KA', postalCode: '560025', country: 'IN' },
  statutory: { pan: true, tan: true, gstin: true, cin: false },
};
const REFERENCE = { states: [{ code: 'IN-KA', name: 'Karnataka', country: 'IN' }], regions: [{ code: 'IN', countries: ['IN'] }] };
const SETTINGS = { registry: { 'employee_code.scope': { default: 'legal_entity' }, 'org.master.default_ownership': { default: 'shared' } }, overrides: [] };
const LOCATION = {
  id: 'loc-1', legalEntityId: 'le-1', name: 'Bengaluru head office', code: 'BLR-HO', address: ENTITY.registeredAddress, state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: null,
  geofence: { lat: 12.9716, lng: 77.5946, radiusM: 150 }, ipRanges: ['203.0.113.0/24'], archivedAt: null,
};
const GRADE = { id: 'gr-1', name: 'M1 · Manager', code: 'M1', rank: 6, ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null };

const api = apiFetch as jest.Mock;
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    if (value instanceof Error) throw value;
    return typeof value === 'function' ? value(path, init) : value;
  });
}
const forbidden = () => Object.assign(new Error('You do not have access'), { status: 403 });

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/settings/legal-entities');
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx layout: organisation pages follow the grants, not the role', () => {
  it('a Payroll Admin profile on a non-admin role sees the organisation pages', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    route({ 'GET /auth/mfa': { factors: [], required: false, enrolmentDueAt: '2030-01-01T00:00:00Z' }, [`GET ${PERMS_PATH}`]: ['org.structure.view', 'pay.range.view'] });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    const nav = await screen.findByRole('navigation', { name: 'Menu' });
    await waitFor(() => expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Help centre', 'Service catalogue', 'Chat with us', 'Legal entities', 'Locations', 'Structure', 'Approvals', 'My security']));
    expect(api).toHaveBeenCalledWith(`${PERMS_PATH}?keys=org.structure.view,org.settings.manage,org.entity.statutory.manage,pay.range.view,pay.range.manage,employee.profile.view,employee.change.manage,employee.change.approve,employee.salary.manage,request.raise_on_behalf,access.role.manage,employee.identity.manage,employee.identity.approve,org.support_access.approve,notification.template.manage,desk.ticket.view,desk.desk.create,desk.settings.manage,desk.member.manage,desk.sla.manage,desk.report.view,desk.mailbox.manage,desk.portal.manage,desk.customer.manage,desk.ticket.work,desk.kb.view_internal,desk.kb.author,desk.kb.publish,desk.task.work,desk.report.manage,desk.survey.manage,org.yukthix_support.raise,desk.directory.manage,desk.catalog.manage,desk.rule.manage,desk.integration.manage,desk.lifecycle.manage,desk.channel.manage,desk.chat.work,desk.hr_summary.view,desk.ticket.move,leave.settings.manage,leave.view,leave.balance.adjust,attendance.view,roster.manage,attendance.lock,payroll.period.view,payroll.period.reopen,payroll.period.reopen.approve,payroll.document.view,payroll.file.view,audit.view,audit.export,lifecycle.onboarding.view,lifecycle.onboarding.manage,lifecycle.journey.template.manage,document.view,document.manage,lifecycle.bgv.manage,letter.template.manage,letter.issue,letter.signatory.manage`, {}, 'tok');
  });

  it('pay-range access alone shows the structure pages but not the settings it cannot read', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    route({ 'GET /auth/mfa': { factors: [], required: false, enrolmentDueAt: '2030-01-01T00:00:00Z' }, [`GET ${PERMS_PATH}`]: ['pay.range.view'] });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    const nav = await screen.findByRole('navigation', { name: 'Menu' });
    await waitFor(() => expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Help centre', 'Service catalogue', 'Chat with us', 'Legal entities', 'Locations', 'Structure', 'Approvals', 'My security']));
  });
});

describe('/yx/settings/legal-entities', () => {
  it('lists entities with identifiers only as on file; the System Admin has no way to open them', async () => {
    route({ 'GET /org/legal-entities': [ENTITY], 'GET /org/reference': REFERENCE, 'GET /org/settings': SETTINGS, [`GET ${PERMS_PATH}`]: ['org.structure.view', 'org.settings.manage'] });
    wrap(<YxLegalEntitiesPage />);
    const table = await screen.findByRole('table', { name: 'Legal entities' });
    expect(within(table).getByText('Missing CIN')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Add legal entity' });
    expect(screen.queryByRole('button', { name: /Identifiers of/ })).toBeNull();
  });

  it('opens identifiers through the recorded read and saves company rules as tenant settings', async () => {
    const calls: string[] = [];
    route({
      'GET /org/legal-entities': [ENTITY],
      'GET /org/reference': REFERENCE,
      'GET /org/settings': SETTINGS,
      [`GET ${PERMS_PATH}`]: ['org.structure.view', 'org.settings.manage', 'org.entity.statutory.manage'],
      'GET /org/legal-entities/le-1/statutory': (path: string) => (calls.push(path), { pan: 'AABCK1234M', tan: null, gstin: null, cin: null }),
      'PUT /org/settings': (_p: string, init: RequestInit) => (calls.push(String(init.body)), {}),
    });
    wrap(<YxLegalEntitiesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Identifiers of Kaveri Foods Pvt Ltd' }));
    expect(await screen.findByDisplayValue('AABCK1234M')).toBeInTheDocument();
    expect(calls).toEqual(['/org/legal-entities/le-1/statutory']);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Across the company' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    await waitFor(() => expect(calls).toContain(JSON.stringify({ key: 'employee_code.scope', scopeType: 'tenant', value: 'tenant' })));
  });

  it('a plain 403 is "no access"', async () => {
    route({ 'GET /org/legal-entities': forbidden(), 'GET /org/reference': forbidden(), 'GET /org/settings': forbidden(), [`GET ${PERMS_PATH}`]: [] });
    wrap(<YxLegalEntitiesPage />);
    expect(await screen.findByText(/a System Admin/)).toBeInTheDocument();
  });
});

describe('/yx/settings/locations', () => {
  it('archives a site through the confirmed row menu', async () => {
    const archive = jest.fn().mockResolvedValue({});
    route({ 'GET /org/locations': [LOCATION], 'GET /org/legal-entities': [ENTITY], 'GET /org/reference': REFERENCE, [`GET ${PERMS_PATH}`]: ['org.settings.manage'], 'POST /org/locations/loc-1/archive': archive });
    wrap(<YxLocationsPage />);
    const table = await screen.findByRole('table', { name: 'Locations' });
    await userEvent.click(await within(table).findByRole('button', { name: /More actions|Actions/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(archive).toHaveBeenCalled());
  });
});

describe('/yx/settings/structure', () => {
  const lists = (grades: unknown[]) => ({
    'GET /org/masters/departments': [],
    'GET /org/masters/designations': [],
    'GET /org/masters/grades': grades,
    'GET /org/masters/employment-types': [],
    'GET /org/masters/cost-centres': [],
    'GET /org/legal-entities': [ENTITY],
    'GET /org/settings': SETTINGS,
  });

  it('R1: without pay access there is no "Show pay" and no pay request', async () => {
    route({ ...lists([GRADE]), [`GET ${PERMS_PATH}`]: ['org.settings.manage'] });
    wrap(<YxStructurePage />);
    await userEvent.click(await screen.findByRole('tab', { name: /Grades/ }));
    expect(await screen.findByText('M1 · Manager')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show pay/ })).toBeNull();
    expect(api.mock.calls.some(([path]) => String(path).includes('pay-ranges'))).toBe(false);
  });

  it('with pay access the ranges load only when asked for', async () => {
    const ranges = jest.fn().mockResolvedValue([{ id: 'pr-1', gradeId: 'gr-1', legalEntityId: 'le-1', currency: 'INR', min: '1000000', mid: '1400000', max: '1800000', validFrom: '2026-04-01', validTo: null }]);
    route({ ...lists([GRADE]), [`GET ${PERMS_PATH}`]: ['org.structure.view', 'pay.range.view'], 'GET /org/grades/gr-1/pay-ranges': ranges });
    wrap(<YxStructurePage />);
    await userEvent.click(await screen.findByRole('tab', { name: /Grades/ }));
    expect(ranges).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Show pay for M1 · Manager' }));
    expect(await screen.findByRole('table', { name: 'Pay ranges for M1 · Manager' })).toBeInTheDocument();
    expect(ranges).toHaveBeenCalledTimes(1);
  });
});

describe('/yx/settings/company-rules and /yx/settings/access-settings (P01 §4.6, P02 §4.2)', () => {
  const REGISTRY = {
    'probation.default_months': { label: 'Probation lasts (months)', scopes: ['tenant', 'legal_entity'], dated: false, values: ['3', '6'], default: '6' },
    'privacy.who_accessed': { label: 'Show "Who accessed my data" to employees', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on', guard: 'access.role.manage' },
  };
  const lists = { 'GET /org/legal-entities': [ENTITY], 'GET /org/locations': [LOCATION], 'GET /org/masters/departments': [], 'GET /org/masters/employment-types': [], 'GET /org/masters/grades': [GRADE] };

  it('shows each value with its source and entity overrides by name; Remove sends DELETE after confirming', async () => {
    const del = jest.fn().mockResolvedValue(undefined);
    route({ ...lists, 'GET /org/settings': { registry: REGISTRY, overrides: [{ id: 's-1', key: 'probation.default_months', scopeType: 'legal_entity', scopeId: 'le-1', value: '3', validFrom: null }] }, 'DELETE /org/settings/s-1': del, [`GET ${PERMS_PATH}`]: ['org.structure.view', 'org.settings.manage'] });
    wrap(<YxCompanyRulesPage />);
    expect(await screen.findByText('6 · YukthiX starter, not changed yet')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Probation lasts/ });
    expect(within(table).getByText('Kaveri Foods Pvt Ltd')).toBeInTheDocument();
    await userEvent.click(within(table).getAllByRole('button').at(-1)!);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(del).toHaveBeenCalled());
  });

  it('YX-SEC-02: guarded settings stay disabled without access.role.manage; view-only readers get no buttons', async () => {
    route({ ...lists, 'GET /org/settings': { registry: REGISTRY, overrides: [] }, [`GET ${PERMS_PATH}`]: ['org.structure.view', 'org.settings.manage'] });
    const { unmount } = wrap(<YxAccessSettingsPage />);
    expect(await screen.findByText(/Only an admin who manages roles and access changes this/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeDisabled();
    unmount();
    route({ ...lists, 'GET /org/settings': { registry: REGISTRY, overrides: [] }, [`GET ${PERMS_PATH}`]: ['org.structure.view'] });
    wrap(<YxCompanyRulesPage />);
    await screen.findByText('6 · YukthiX starter, not changed yet');
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });

  it('a 403 on the settings shows no access', async () => {
    route({ ...lists, 'GET /org/settings': forbidden(), [`GET ${PERMS_PATH}`]: [] });
    wrap(<YxCompanyRulesPage />);
    expect(await screen.findByText("You don't have access to the company rules")).toBeInTheDocument();
  });
});

describe('/yx layout: support access (P02 Q8, step 3)', () => {
  it('a System Admin finds Support access under Security', async () => {
    route({ 'GET /auth/mfa': { factors: [], required: false, enrolmentDueAt: '2030-01-01T00:00:00Z' }, [`GET ${PERMS_PATH}`]: ['org.support_access.approve'] });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    const nav = await screen.findByRole('navigation', { name: 'Menu' });
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Support access' })).toHaveAttribute('href', '/yx/settings/support-access'));
  });

  it('a System Admin finds Emails (P04 Q5) under Security; without the key there is no link', async () => {
    route({ 'GET /auth/mfa': { factors: [], required: false, enrolmentDueAt: '2030-01-01T00:00:00Z' }, [`GET ${PERMS_PATH}`]: ['notification.template.manage'] });
    const { unmount } = wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    const nav = await screen.findByRole('navigation', { name: 'Menu' });
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Emails' })).toHaveAttribute('href', '/yx/settings/emails'));
    unmount();
    route({ 'GET /auth/mfa': { factors: [], required: false, enrolmentDueAt: '2030-01-01T00:00:00Z' }, [`GET ${PERMS_PATH}`]: [] });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    const plain = await screen.findByRole('navigation', { name: 'Menu' });
    expect(within(plain).queryByRole('link', { name: 'Emails' })).not.toBeInTheDocument();
  });

  it('YukthiX staff on a support session see the company pages read-only, with a banner to leave', async () => {
    const claims = Buffer.from(JSON.stringify({ role: 'super_admin', actingSuperAdmin: true, supportEndsAt: '2026-10-08T14:00:00Z' })).toString('base64url');
    const push = jest.fn();
    const switchOutOfOrg = jest.fn().mockResolvedValue(undefined);
    (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({ accessToken: `h.${claims}.s`, role: 'super_admin', actingSuperAdmin: true, actingOrgName: 'Kaveri Foods', isLoading: false, logout: jest.fn(), switchOutOfOrg });
    route({ 'GET /auth/mfa': { factors: [{ type: 'passkey' }], required: true, enrolmentDueAt: '2030-01-01T00:00:00Z' }, [`GET ${PERMS_PATH}`]: [] });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    expect(await screen.findByText(/Support session in Kaveri Foods until/)).toBeInTheDocument();
    const nav = await screen.findByRole('navigation', { name: 'Menu' });
    expect(within(nav).getByRole('link', { name: 'Legal entities' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Support access' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave the company' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/staff/support'));
    expect(switchOutOfOrg).toHaveBeenCalled();
  });
});
