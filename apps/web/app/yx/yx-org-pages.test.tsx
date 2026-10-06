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

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn(), YX_SSO_RETURN_KEY: 'yxSsoReturn' }));
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
    const nav = await screen.findByRole('navigation', { name: 'Settings' });
    await waitFor(() => expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['My security', 'Legal entities', 'Locations', 'Structure']));
    expect(api).toHaveBeenCalledWith(`${PERMS_PATH}?keys=org.structure.view,org.settings.manage,org.entity.statutory.manage,pay.range.view,pay.range.manage,employee.profile.view,employee.change.manage,employee.change.approve,employee.salary.manage,request.raise_on_behalf`, {}, 'tok');
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
