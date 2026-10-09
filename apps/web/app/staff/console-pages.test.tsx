import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import ConsoleLayout from './(console)/layout';
import ConsoleCompaniesPage from './(console)/companies/page';
import ConsoleCompanyPage from './(console)/companies/[id]/page';
import ConsolePlansPage from './(console)/plans/page';
import ConsoleSupportPage from './(console)/support/page';
import ConsoleAuditPage from './(console)/audit/page';
import ConsoleChannelsPage from './(console)/channels/page';
import YxSupportAccessPage from '../yx/(app)/settings/support-access/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useParams: jest.fn(), useSearchParams: jest.fn(() => new URLSearchParams('')) }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), STAFF_SIGN_IN: '/staff/sign-in' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// The platform console (step 3) wired to /platform/*, and the company's Support access page to /support-access.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const api = apiFetch as jest.Mock;
const calls: string[] = [];
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    calls.push(`${key}${init?.body ? ` ${init.body}` : ''}`);
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}
const push = jest.fn();
const replace = jest.fn();
const switchIntoOrg = jest.fn().mockResolvedValue(undefined);
const STAFF_KEYS = ['platform.companies.view', 'platform.companies.manage', 'platform.plans.manage', 'platform.channels.manage', 'platform.support.request', 'platform.audit.view'];

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  replace.mockReset();
  switchIntoOrg.mockClear();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push, replace });
  (usePathname as jest.Mock).mockReturnValue('/staff/companies');
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'super_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn(), switchIntoOrg, switchOutOfOrg: jest.fn() });
});

const COMPANY = { id: 'c2', name: 'Godavari Agro', slug: 'godavari-agro', lifecycle: 'trial', signInAllowed: true, trialEndsAt: '2026-11-07T00:00:00Z', createdAt: '2026-10-08T09:00:00Z', products: ['hrms'], employees: 0 };
const PRODUCTS = [{ code: 'hrms', name: 'YukthiX HR', unit: 'employee', prices: [{ id: 'p1', currency: 'INR', unitPrice: 99, minimumMonthly: 499, validFrom: '2026-10-01', reason: 'Launch price', createdAt: '2026-10-01T00:00:00Z', state: 'current' }] }];
const SESSION = { id: 's1', organizationId: 'c2', company: 'Godavari Agro', mine: true, requestedBy: 'Anand Iyer', requestedByEmail: 'anand@yukthix.test', reason: 'Payroll stuck at readiness', ticket: null, hours: 4, status: 'approved', decidedBy: 'Sunita Rao', decidedAt: '2026-10-08T09:00:00Z', decisionNote: null, startsAt: '2026-10-08T09:00:00Z', endsAt: '2099-01-01T00:00:00Z', endedBy: null, endedAt: null, createdAt: '2026-10-08T08:00:00Z' };

describe('console layout', () => {
  it('a staff account without its security key is told to add one before using the console', async () => {
    route({ 'GET /users/me': { email: 'anand@yukthix.test', name: 'Anand Iyer' }, 'GET /auth/mfa': { required: true, factors: [], enrolmentDueAt: '2026-10-20T00:00:00Z' } });
    wrap(
      <ConsoleLayout>
        <p>companies</p>
      </ConsoleLayout>,
    );
    expect(await screen.findByText('Add your security key first')).toBeInTheDocument();
    expect(screen.queryByText('companies')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a security key' })).toHaveAttribute('href', '/staff/security');
  });

  it('a company account is sent away; a signed-out tab goes to the staff sign-in', async () => {
    route({ 'GET /users/me': {}, 'GET /auth/mfa': { required: false, factors: [] } });
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false });
    const { unmount } = wrap(
      <ConsoleLayout>
        <p>x</p>
      </ConsoleLayout>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/yx/me/security'));
    unmount();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: null, role: null, isLoading: false, signedOut: true });
    wrap(
      <ConsoleLayout>
        <p>x</p>
      </ConsoleLayout>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/staff/sign-in'));
  });
});

describe('/staff/companies', () => {
  it('lists companies and creates one, then opens it', async () => {
    route({
      'GET /platform/companies': [COMPANY],
      'GET /platform/products': PRODUCTS,
      'GET /rbac/me/permissions': STAFF_KEYS,
      'POST /platform/companies': { id: 'c9' },
    });
    wrap(<ConsoleCompaniesPage />);
    expect(await screen.findByText('Godavari Agro')).toBeInTheDocument();
    await ue.click(await screen.findByRole('button', { name: 'New company' }));
    const drawer = await screen.findByRole('dialog');
    await ue.type(within(drawer).getByRole('textbox', { name: /Company name/ }), 'Tunga Textiles');
    await ue.click(within(drawer).getByRole('checkbox', { name: /YukthiX HR/ }));
    await ue.type(within(drawer).getByRole('textbox', { name: /^Name/ }), 'Meena Pillai');
    await ue.type(within(drawer).getByRole('textbox', { name: /Work email/ }), 'meena@tunga.test');
    await ue.click(within(drawer).getByRole('button', { name: 'Create company' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/staff/companies/c9'));
    expect(calls).toContain(`POST /platform/companies ${JSON.stringify({ name: 'Tunga Textiles', slug: 'tunga-textiles', adminName: 'Meena Pillai', adminEmail: 'meena@tunga.test', products: ['hrms'] })}`);
  });

  it('a 403 is shown as no access', async () => {
    route({ 'GET /platform/products': [], 'GET /rbac/me/permissions': [] });
    api.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    });
    wrap(<ConsoleCompaniesPage />);
    expect(await screen.findByText(/a YukthiX console owner/)).toBeInTheDocument();
  });
});

describe('/staff/companies/[id]', () => {
  it('suspends with a reason and opens the company inside my approved support session', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'c2' });
    route({
      'GET /platform/companies/c2': { ...COMPANY, trialExtended: false, lifecycleChangedAt: '2026-10-08T09:00:00Z', admins: [], history: [] },
      'GET /platform/support-sessions': [SESSION],
      'GET /rbac/me/permissions': STAFF_KEYS,
      'POST /platform/companies/c2/lifecycle': {},
    });
    wrap(<ConsoleCompanyPage />);
    await ue.click(await screen.findByRole('button', { name: 'Open company' }));
    expect(switchIntoOrg).toHaveBeenCalledWith('c2');
    expect(push).toHaveBeenCalledWith('/yx/settings/legal-entities');

    await ue.click(screen.getByRole('button', { name: /More actions/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Suspend company' }));
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox'), 'Payment fraud check');
    await ue.click(within(dialog).getByRole('button', { name: 'Suspend company' }));
    await waitFor(() => expect(calls).toContain(`POST /platform/companies/c2/lifecycle ${JSON.stringify({ action: 'suspend', reason: 'Payment fraud check' })}`));
  });
});

describe('other console pages', () => {
  it('plans, support sessions, the audit log and the shared SMS account load from the console API', async () => {
    route({
      'GET /platform/products': PRODUCTS,
      'GET /rbac/me/permissions': STAFF_KEYS,
      'GET /platform/support-sessions': [SESSION],
      'GET /platform/audit': { data: [{ id: 'e1', at: '2026-10-08T09:00:00Z', action: 'platform.company.lifecycle', entityType: 'organization', entityId: 'c2', actor: 'Anand Iyer', actorIsStaff: true, company: 'Godavari Agro', companyId: 'c2', details: { from: 'trial', to: 'suspended', reason: 'Payment fraud check' } }], nextCursor: null },
      'GET /platform/channels/sms': { scope: 'platform', accounts: [], policy: null, usage: null, sharedAccountAvailable: false, templateVariables: ['code', 'purpose', 'minutes'] },
      'GET /platform/channels/sms/deliveries': { data: [], nextCursor: null },
      'GET /auth/mfa': { required: true, factors: [{ type: 'passkey' }], mobileNumber: null },
      'POST /platform/support-sessions/s1/end': {},
    });
    const plans = wrap(<ConsolePlansPage />);
    expect(await screen.findByText('YukthiX HR')).toBeInTheDocument();
    plans.unmount();
    const support = wrap(<ConsoleSupportPage />);
    await ue.click(await screen.findByRole('button', { name: 'End' }));
    await waitFor(() => expect(calls).toContain('POST /platform/support-sessions/s1/end'));
    support.unmount();
    const audit = wrap(<ConsoleAuditPage />);
    expect(await screen.findByText('Changed the company from Trial to Suspended')).toBeInTheDocument();
    audit.unmount();
    wrap(<ConsoleChannelsPage />);
    expect(await screen.findByRole('heading', { name: 'YukthiX shared SMS account' })).toBeInTheDocument();
  });
});

describe('/yx/settings/support-access (the company)', () => {
  it('approves a request for the hours asked, then shows what was done', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false });
    const request = { ...SESSION, id: 's4', status: 'requested', startsAt: null, endsAt: null, decidedBy: null, decidedAt: null, mine: undefined, company: undefined };
    route({
      'GET /support-access': [request],
      'POST /support-access/s4/approve': { ...request, status: 'approved' },
    });
    wrap(<YxSupportAccessPage />);
    await ue.click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Approve for 4 hours' }));
    await waitFor(() => expect(calls).toContain(`POST /support-access/s4/approve ${JSON.stringify({ hours: 4 })}`));
  });
});
