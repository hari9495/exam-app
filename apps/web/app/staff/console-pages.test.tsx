import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import ConsoleLayout from './(console)/layout';
import ConsoleCompaniesPage from './(console)/companies/page';
import ConsoleNewCompanyPage from './(console)/companies/new/page';
import ConsoleMaintenancePage from './(console)/maintenance/page';
import ConsoleCompanyPage from './(console)/companies/[id]/page';
import ConsolePlansPage from './(console)/plans/page';
import ConsoleSupportPage from './(console)/support/page';
import ConsoleAuditPage from './(console)/audit/page';
import ConsoleChannelsPage from './(console)/channels/page';
import ConsoleWhatsNewPage from './(console)/whats-new/page';
import ConsoleSupportDeskPage from './(console)/support-desk/page';
import ConsoleContainPage from './(console)/companies/[id]/contain/page';
import ConsoleFeatureFlagsPage from './(console)/feature-flags/page';
import ConsoleHelpCentrePage from './(console)/help-centre/page';
import ConsoleFeatureRequestsPage from './(console)/feature-requests/page';
import ConsolePlatformSettingsPage from './(console)/platform-settings/page';
import ConsoleCustomersPage from './(console)/customers/page';
import ConsoleIncidentsPage from './(console)/incidents/page';
import ConsoleNudgesPage from './(console)/nudges/page';
import ConsoleSalesPage from './(console)/sales/page';
import ConsoleAnalyticsPage from './(console)/analytics/page';
import YxSupportAccessPage from '../yx/(app)/settings/support-access/page';
import { ToastProvider } from '@yukthix/ui';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useParams: jest.fn(), useSearchParams: jest.fn(() => new URLSearchParams('')) }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), STAFF_SIGN_IN: '/staff/sign-in' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// The platform console (step 3) wired to /platform/*, and the company's Support access page to /support-access.
// The console layout gives every page a toast host (the SMS screen says "done" with toasts).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
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
  it('lists companies; New company opens the company wizard (answer 1053)', async () => {
    route({ 'GET /platform/companies': [COMPANY], 'GET /platform/products': PRODUCTS, 'GET /rbac/me/permissions': STAFF_KEYS });
    wrap(<ConsoleCompaniesPage />);
    expect(await screen.findByText('Godavari Agro')).toBeInTheDocument();
    await ue.click(await screen.findByRole('button', { name: 'New company' }));
    expect(push).toHaveBeenCalledWith('/staff/companies/new');
  });

  it('the wizard creates the company with its legal entity, then opens it', async () => {
    route({ 'GET /platform/products': PRODUCTS, 'GET /rbac/me/permissions': STAFF_KEYS, 'POST /platform/companies': { id: 'c9' } });
    wrap(<ConsoleNewCompanyPage />);
    await ue.type(await screen.findByRole('textbox', { name: /Company name/ }), 'Tunga Textiles');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.type(screen.getByRole('textbox', { name: /^PAN/ }), 'AAECT1234F');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.type(screen.getByRole('textbox', { name: /^Name/ }), 'Meena Pillai');
    await ue.type(screen.getByRole('textbox', { name: /Work email/ }), 'meena@tunga.test');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Continue' })); // the only product is ticked already
    await ue.click(await screen.findByRole('button', { name: 'Create company' }));
    await waitFor(() => expect(calls).toContain(`POST /platform/companies ${JSON.stringify({ name: 'Tunga Textiles', slug: 'tunga-textiles', legalEntity: { name: 'Tunga Textiles', pan: 'AAECT1234F' }, adminName: 'Meena Pillai', adminEmail: 'meena@tunga.test', products: ['hrms'] })}`));
    await ue.click(await screen.findByRole('button', { name: 'Open the company' }));
    expect(push).toHaveBeenCalledWith('/staff/companies/c9');
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

// Help H-4 (answer 943): staff write the entries people see in Help › What's new.
describe('/staff/whats-new', () => {
  const ENTRY = { id: 'n1', title: 'Press ? for shortcuts', body: 'Every page lists them.', products: ['hrms'], audiences: ['everyone'], publishOn: '2026-11-12', state: 'published', version: 1 };
  const LIST = { today: '2026-11-12', products: [{ code: 'hrms', name: 'YukthiX HR' }], entries: [ENTRY] };
  it('lists the entries; withdrawing calls the console API', async () => {
    route({ 'GET /platform/whats-new': LIST, 'GET /rbac/me/permissions': [...STAFF_KEYS, 'platform.news.manage'], 'POST /platform/whats-new/n1/withdraw': { ...LIST, entries: [{ ...ENTRY, state: 'withdrawn' }] } });
    wrap(<ConsoleWhatsNewPage />);
    expect(await screen.findByText('Press ? for shortcuts')).toBeInTheDocument();
    await ue.click(await screen.findByRole('button', { name: 'More actions for Press ? for shortcuts' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Withdraw entry' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Withdraw entry' }));
    await waitFor(() => expect(calls).toContain('POST /platform/whats-new/n1/withdraw'));
  });
  it('without the key: no New entry', async () => {
    route({ 'GET /platform/whats-new': LIST, 'GET /rbac/me/permissions': STAFF_KEYS });
    wrap(<ConsoleWhatsNewPage />);
    expect(await screen.findByText('Press ? for shortcuts')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New entry' })).toBeNull();
  });
});

// C-5 (answers 948, 1053): planned maintenance.
describe('/staff/maintenance', () => {
  const OVERVIEW = { now: '2026-11-12T04:30:00.000Z', current: null, windows: [], settings: { numbers: [{ key: 'maintenance.notice_hours', label: 'Notice before a window (hours)', value: 72, default: 72, min: 24, max: 720 }], blockDates: [7, 15, 20] } };
  it('loads the windows and rules from the console API', async () => {
    route({ 'GET /platform/maintenance': OVERVIEW, 'GET /rbac/me/permissions': STAFF_KEYS });
    wrap(<ConsoleMaintenancePage />);
    expect(await screen.findByText('No maintenance windows.')).toBeInTheDocument();
    expect(screen.getByText('Nothing: no window is close.')).toBeInTheDocument();
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

// Answer 1051: Support desk › Look up a reference asks /platform/support-desk/references/<code>.
describe('Support desk look-up', () => {
  it('sends the typed code and lists each company', async () => {
    route({
      'GET /platform/support-desk/tickets': [],
      'GET /platform/support-desk/references/NF-7KQ2MP': [{ code: 'NF-7KQ2MP', company: 'Godavari Agro', at: '2026-11-11T05:42:00.000Z', path: '/yx/no-such-page' }],
    });
    wrap(<ConsoleSupportDeskPage />);
    await ue.click(await screen.findByRole('button', { name: 'Look up a reference' }));
    await ue.type(screen.getByRole('textbox', { name: /Reference/ }), 'NF-7KQ2MP');
    await ue.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('Godavari Agro')).toBeInTheDocument();
    expect(calls).toContain('GET /platform/support-desk/references/NF-7KQ2MP');
  });
});

// Console C-4 (answers 1049, 1050): the live Feature flags and Contain company pages call the console API.
describe('Feature flags and Contain company', () => {
  it('feature flags list from /platform/feature-flags', async () => {
    route({
      'GET /platform/feature-flags': [{ key: 'help.tours', label: 'First-run tours', description: 'Tours on first sign-in', defaultOn: true, killed: null, overrides: [] }],
      'GET /platform/companies': [],
      'GET /users/me': { id: 'me', email: 'anand@yukthix.test' },
    });
    wrap(<ConsoleFeatureFlagsPage />);
    expect(await screen.findByText('help.tours')).toBeInTheDocument();
  });

  it('contain sends the reason to /platform/companies/<id>/contain', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'c2' });
    route({
      'GET /platform/companies/c2/containment': { company: { id: 'c2', name: 'Godavari Agro' }, users: 4, apps: 0, breach: { certinHours: 6, dpdpHours: 72 }, containment: null },
      'POST /platform/companies/c2/contain': {},
    });
    wrap(<ConsoleContainPage />);
    await ue.type(await screen.findByRole('textbox', { name: /Reason/ }), 'Admin signed in from three countries');
    await ue.click(screen.getByRole('button', { name: 'Contain company' }));
    await ue.type(within(await screen.findByRole('dialog')).getByRole('textbox'), 'CONTAIN GODAVARI AGRO');
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Contain company' }));
    await waitFor(() => expect(calls).toContain('POST /platform/companies/c2/contain {"reason":"Admin signed in from three countries"}'));
  });
});

// Ask YukthiX (answer 2105): the staff Feature requests list and the assistant review.
describe('/staff/feature-requests', () => {
  const ROWS = [{ id: 'fr1', number: 12, title: 'Half days for shift workers', details: '', status: 'new', company: 'Kaveri Foods', requestedBy: 'Divya', createdAt: '2026-11-10T09:00:00Z', companies: 2, duplicates: [], staffNote: null, version: 4 }];
  const REVIEW = { days: 30, answers: 3, byOutcome: { answered: 2, not_covered: 1 }, thumbsUp: 1, thumbsDown: 0, unanswered: [], tickets: [] };
  it('lists the requests from /platform/feature-requests and marks one Planned with its version', async () => {
    route({ 'GET /platform/feature-requests': ROWS, 'GET /platform/assistant/review?days=30': REVIEW, 'PUT /platform/feature-requests/fr1': { status: 'planned', told: 0 } });
    wrap(<ConsoleFeatureRequestsPage />);
    expect(await screen.findByText('Half days for shift workers')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /actions/i }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Mark Planned' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Mark Planned' }));
    await waitFor(() => expect(calls).toContain('PUT /platform/feature-requests/fr1 {"status":"planned","version":4}'));
  });

  it('negative: without the key the page says so', async () => {
    api.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    wrap(<ConsoleFeatureRequestsPage />);
    expect(await screen.findByText("You don't have access to feature requests")).toBeInTheDocument();
  });
});

// C-8 (YX-11, answer 1057): the help-centre editor.
describe('/staff/help-centre', () => {
  const OVERVIEW = { articles: [{ id: 'h1', number: 12, title: 'Approve and lock a payroll run', state: 'published', pages: ['/yx/payroll/runs'], publishedAt: '2026-11-02T09:00:00Z', updatedAt: '2026-11-02T09:00:00Z' }], gaps: [], settings: [] };
  const DETAIL = { id: 'h1', title: 'Approve and lock a payroll run', summary: null, pages: ['/yx/payroll/runs'], state: 'published', publicUrl: null, versions: [{ version: 3, title: 'Approve and lock a payroll run', summary: null, bodyHtml: '<p>x</p>', author: 'Joseph Thomas', mine: false, reviewNote: null, state: 'published' }] };
  it('lists the articles and opens one from /platform/help-centre', async () => {
    route({ 'GET /platform/help-centre': OVERVIEW, 'GET /platform/help-centre/articles/h1': DETAIL });
    wrap(<ConsoleHelpCentrePage />);
    expect(await screen.findByText('Approve and lock a payroll run')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(calls).toContain('GET /platform/help-centre/articles/h1');
  });

  it('negative: without the help-centre key the page says so', async () => {
    api.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    wrap(<ConsoleHelpCentrePage />);
    expect(await screen.findByText("You don't have access to the help articles")).toBeInTheDocument();
  });

  // Answers 1261 and 1263: the rules link to Platform settings; the person who asked withdraws a retire request.
  it('the rules link to Platform settings; the requester withdraws a retire request', async () => {
    const settings = [{ key: 'helpcentre.gaps_min_companies', label: 'Show a no-result search once this many companies searched it', value: 5, default: 5, min: 5, max: 100 }];
    const mine = { ...DETAIL, retire: { requestedBy: 'You', mine: true, reason: 'Old', at: '2026-11-12T08:00:00Z' } };
    route({ 'GET /platform/help-centre': { ...OVERVIEW, settings }, 'GET /platform/help-centre/articles/h1': mine, 'POST /platform/help-centre/articles/h1/retire/withdraw': { ...DETAIL, retire: null }, 'GET /rbac/me/permissions': [...STAFF_KEYS, 'platform.settings.manage'] });
    wrap(<ConsoleHelpCentrePage />);
    await ue.click(await screen.findByRole('button', { name: 'Change in Platform settings' }));
    expect(push).toHaveBeenCalledWith('/staff/platform-settings');
    await ue.click(screen.getByRole('button', { name: 'Open' }));
    await ue.click(await screen.findByRole('button', { name: 'Withdraw request' }));
    await waitFor(() => expect(calls).toContain('POST /platform/help-centre/articles/h1/retire/withdraw {}'));
  });
});

// Console follow-ups: the company card shows the feature switches (C-5 hook); Platform settings (1125).
describe('Console follow-ups', () => {
  it("the company's Products and features card shows a killed switch as off, with why", async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'c2' });
    route({
      'GET /platform/companies/c2': { ...COMPANY, trialExtended: false, lifecycleChangedAt: '2026-10-08T09:00:00Z', admins: [], history: [] },
      'GET /platform/support-sessions': [],
      'GET /rbac/me/permissions': STAFF_KEYS,
      'GET /platform/products': PRODUCTS,
      'GET /platform/companies/c2/settings': { company: { id: 'c2', name: 'Godavari Agro' }, settings: [] },
      'GET /platform/companies/c2/feature-switches': [{ key: 'help.tours', label: 'First-run tours', on: false, why: 'Killed for everyone' }],
    });
    wrap(<ConsoleCompanyPage />);
    const card = await screen.findByRole('list', { name: 'Products and features' });
    const tours = (await within(card).findByText('First-run tours')).closest('li') as HTMLElement;
    expect(within(tours).getByText('Killed for everyone')).toBeInTheDocument();
  });

  it('platform settings list and save with a reason', async () => {
    route({
      'GET /platform/settings': [{ key: 'breach.certin_hours', label: 'CERT-In: report within (hours)', value: '6', default: '6', allowed: 'a whole number from 1 to 24', verify: false, editable: true }],
      'GET /rbac/me/permissions': [...STAFF_KEYS, 'platform.settings.manage'],
      'PUT /platform/settings/breach.certin_hours': [],
    });
    wrap(<ConsolePlatformSettingsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Change' }));
    const dialog = await screen.findByRole('dialog');
    const value = within(dialog).getByRole('textbox', { name: /Value/ });
    await ue.clear(value);
    await ue.type(value, '8');
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Counsel confirmed');
    await ue.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toContain('PUT /platform/settings/breach.certin_hours {"value":"8","reason":"Counsel confirmed"}'));
  });
});

// C-8 (YX-10, answer 1124): incidents.
describe('/staff/incidents', () => {
  const OVERVIEW = { incidents: [], containments: [], products: [{ code: 'hrms', name: 'YukthiX HR' }], settings: { leadHours: 1, leadHoursDefault: 1 } };
  it('loads from /platform/incidents', async () => {
    route({ 'GET /platform/incidents': OVERVIEW, 'POST /platform/incidents': OVERVIEW });
    wrap(<ConsoleIncidentsPage />);
    expect(await screen.findByText('No incidents.')).toBeInTheDocument();
    expect(screen.getByText('Nothing: no open incident has an approved update.')).toBeInTheDocument();
  });

  it('negative: without the incidents key the page says so', async () => {
    api.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    wrap(<ConsoleIncidentsPage />);
    expect(await screen.findByText("You don't have access to incidents")).toBeInTheDocument();
  });

  // Answer 1261: the lead time links to Platform settings, only for someone who may change it.
  it('the lead time links to Platform settings only with the settings key', async () => {
    route({ 'GET /platform/incidents': OVERVIEW, 'GET /rbac/me/permissions': [...STAFF_KEYS, 'platform.settings.manage'] });
    const first = wrap(<ConsoleIncidentsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Change in Platform settings' }));
    expect(push).toHaveBeenCalledWith('/staff/platform-settings');
    first.unmount();
    route({ 'GET /platform/incidents': OVERVIEW, 'GET /rbac/me/permissions': STAFF_KEYS });
    wrap(<ConsoleIncidentsPage />);
    expect(await screen.findByText('1 (the default)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change in Platform settings' })).toBeNull();
  });
});

// Answers 1082, 1083 (1165): Customer success follow-up calls the console API.
describe('Customer success follow-up', () => {
  it('Log outreach posts the note for the alert', async () => {
    route({
      'GET /platform/customers/health': { settings: {}, rows: [] },
      'GET /platform/customers/messages': [],
      'GET /platform/customers/settings': [],
      'GET /platform/customers/owners': [{ id: 'u1', name: 'Kavitha Rao' }],
      'GET /platform/customers/alerts': [{ id: 'a1', organizationId: 'c2', company: 'Godavari Agro', rule: 'admin_idle', text: 'No System Admin has ever signed in', status: 'open', owner: null, openedAt: '2026-11-11T20:00:00Z', resolvedAt: null, autoResolved: false, version: 1, notes: [] }],
      'GET /rbac/me/permissions': [...STAFF_KEYS, 'platform.customers.success'],
      'POST /platform/customers/alerts/a1/outreach': [],
    });
    wrap(<ConsoleCustomersPage />);
    await ue.click(await screen.findByRole('tab', { name: /Churn-risk alerts/ }));
    await ue.click(await screen.findByRole('button', { name: 'Log outreach' }));
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox', { name: /Note/ }), 'Called them');
    await ue.click(within(dialog).getByRole('button', { name: 'Log outreach' }));
    await waitFor(() => expect(calls).toContain('POST /platform/customers/alerts/a1/outreach {"note":"Called them"}'));
  });
});

// C-8 (YX-12): nudges per feature switch.
describe('/staff/nudges', () => {
  const OVERVIEW = { features: [{ key: 'access.requests', label: 'Access requests', killed: false }], nudges: [{ id: 'n1', featureKey: 'access.requests', kind: 'switch_on', heading: 'Let people ask for access', body: 'Switch on access requests.', status: 'live', writtenBy: 'Joseph Thomas', mine: false, reviewedBy: 'Anand Iyer', reviewNote: null, createdAt: '2026-11-10T00:00:00Z' }], weeklyLimit: 2 };
  it('loads from /platform/nudges and takes a live one down', async () => {
    route({ 'GET /platform/nudges': OVERVIEW, 'POST /platform/nudges/n1/retire': OVERVIEW });
    wrap(<ConsoleNudgesPage />);
    expect(await screen.findByText('Let people ask for access')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Take down' }));
    await waitFor(() => expect(calls).toContain('POST /platform/nudges/n1/retire {}'));
  });

  it('negative: without the nudges key the page says so', async () => {
    api.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    wrap(<ConsoleNudgesPage />);
    expect(await screen.findByText("You don't have access to the nudges")).toBeInTheDocument();
  });
});

// C-8 (YX-13, answer 1210): the sales-assist queue.
describe('/staff/sales', () => {
  const ROW = { id: 'r1', ref: 'SA-012', company: 'Coromandel Logistics', band: '200–500', why: 'Talk to us: Access requests', setupPct: 40, owner: null, mine: false, dueAt: '2099-01-01T10:00:00Z', status: 'open', requestedBy: 'Meena Pillai', phone: '9845012345', note: null, outcomeNote: null, createdAt: '2026-11-12T10:00:00Z', version: 1 };
  it('loads the queue from /platform/sales and takes a request', async () => {
    route({ 'GET /platform/sales': { now: '2026-11-13T04:30:00Z', rows: [ROW] }, 'POST /platform/sales/r1/take': { now: '2026-11-13T04:30:00Z', rows: [{ ...ROW, owner: 'You', mine: true }] } });
    wrap(<ConsoleSalesPage />);
    expect(await screen.findByText('Coromandel Logistics')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Take' }));
    await waitFor(() => expect(calls).toContain('POST /platform/sales/r1/take {}'));
  });

  it('negative: without the sales key the page says so', async () => {
    api.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    wrap(<ConsoleSalesPage />);
    expect(await screen.findByText("You don't have access to the sales-assist queue")).toBeInTheDocument();
  });
});

// C-8 (YX-09): product analytics, counts only.
describe('/staff/analytics', () => {
  it('loads from /platform/analytics; a small group says it is hidden', async () => {
    route({ 'GET /platform/analytics': { windowDays: 30, minCompanies: 5, totalCompanies: 12, areas: [{ key: 'time', label: 'Time and leave' }], byFeature: [{ area: 'time', label: 'Time and leave', companies: null, actions: null }], bySize: { bands: [], adoption: [] }, byCompany: [] } });
    wrap(<ConsoleAnalyticsPage />);
    expect(await screen.findByText('Fewer than 5')).toBeInTheDocument();
  });

  it('negative: without the analytics key the page says so', async () => {
    api.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    wrap(<ConsoleAnalyticsPage />);
    expect(await screen.findByText("You don't have access to product analytics")).toBeInTheDocument();
  });
});
