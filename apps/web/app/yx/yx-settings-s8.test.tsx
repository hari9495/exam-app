import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav, type NavInput } from '../../lib/yx-nav';
import { YxNavContext } from '../../lib/yx-shell';
import YxFinanceSettingsPage from './(app)/settings/finance/[page]/page';
import YxTalentSettingsPage from './(app)/settings/talent/[page]/page';
import YxDocumentsSettingsPage from './(app)/settings/documents/[page]/page';
import YxDocumentTypesPage from './(app)/settings/documents/document-types/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Settings S-8 (answer 1323): 4.8 Expenses & travel and 6.3 Performance with the company choices that had no screen.
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
const ADMIN = buildNav({ ...base, has: () => true, role: 'org_admin' });
const REGISTRY = {
  'expense.gst.capture': { label: 'Expenses: capture GST for input credit', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', 'on'], default: 'off' },
  'expense.finance_audit': { label: 'Expenses: finance check of claims', scopes: ['tenant', 'legal_entity'], dated: false, values: ['off', 'flagged_only', 'all'], default: 'flagged_only' },
  'notify.email.enabled': { label: 'Notifications: also send them by email (the in-app bell always shows them)', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on' },
  'perf.goal.approval': { label: 'Performance: the manager approves a person’s goals', scopes: ['tenant'], dated: false, values: ['manager', 'none'], default: 'manager' },
  'payroll.settings.second_person': { label: 'Payroll setting changes need a second person', scopes: ['tenant'], dated: false, values: ['on', 'off'], default: 'on' },
};
const calls: [string, unknown][] = [];
// Batch T2-C: 6.3's live editors (the old set-up copy's review templates, rating scales and skills library).
const SCALE = { id: 's1', name: 'Five-point scale', min: 1, max: 5, step: 1, status: 'active', starter: true, inUse: true, levels: ['A', 'B', 'C', 'D', 'E'].map((label, i) => ({ value: i + 1, label, description: null })), bands: [{ fromScore: 1, toScore: 5, label: 'All' }], version: 1 };
const ANNUAL = { id: 't1', familyId: 'f1', templateVersion: 1, name: 'Annual review', kind: 'annual', scaleId: 's1', scoring: 'weighted', status: 'active', starter: true, activatedAt: null, sections: [{ kind: 'goals', title: 'Goals', weight: 100, rated: true, whoAnswers: ['self', 'manager'], questions: [] }], problem: null, version: 1 };
const perfSetup: { templates: unknown[]; scales: unknown[]; skills: unknown[]; agenda: unknown[]; goals: unknown[] } = { templates: [], scales: [], skills: [], agenda: [], goals: [] };
const DOC_TYPES = [
  { key: 'passport', name: 'Passport', sensitivity: 'confidential', requiresVerification: false, expiryTracked: true, reminderDays: [60, 30, 7], uploadBy: ['person', 'hr'], system: true },
  { key: 'c_gate_pass', name: 'Gate pass', sensitivity: 'internal', requiresVerification: true, expiryTracked: false, reminderDays: [], uploadBy: ['hr'], system: false },
];
const routes = (perms: string[]) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT' || init?.method === 'POST' || init?.method === 'PATCH' || init?.method === 'DELETE') return (calls.push([`${init.method} ${path}`, init.body === undefined ? undefined : JSON.parse(String(init.body))]), { pending: true });
    if (path.startsWith('/rbac/me/permissions')) return perms;
    if (path === '/documents/types') return DOC_TYPES;
    if (path === '/org-sender-addresses') return [{ id: 's1', label: 'Kaveri Careers', address: 'careers@kaveri.test', isDefault: true }];
    if (path === '/interview-email-templates') return [{ eventType: 'invite', subject: null, body: null, enabled: true, defaultSubject: 'Interview invitation', defaultBody: 'Hi {{candidateName}}' }];
    if (path === '/approval-email-templates') return [{ eventType: 'approval.requested', subject: null, body: null, enabled: true }];
    if (path === '/certificate-template') return { title: 'Certificate of Achievement', bodyText: 'This is to certify that {{candidateName}} passed.', signatoryName: null, enabled: true, isDefault: true };
    if (path === '/org/settings') return { registry: REGISTRY, limits: {}, pending: [], overrides: [] };
    if (path === '/org/legal-entities') return [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' }];
    if (path === '/org/locations') return [{ id: 'l1', name: 'Hosur plant' }];
    if (path.startsWith('/org/masters/')) return [];
    if (path === '/performance/templates') return perfSetup.templates;
    if (path === '/performance/scales') return perfSetup.scales;
    if (path === '/performance/skills') return perfSetup.skills;
    if (path === '/performance/one-on-one-templates') return perfSetup.agenda;
    if (path === '/performance/goal-templates') return perfSetup.goals;
    throw new Error(`unexpected ${path}`);
  });
const show = (Page: () => JSX.Element, slug: string) => {
  (useParams as jest.Mock).mockReturnValue({ page: slug });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxNavContext.Provider value={{ nav: ADMIN, ready: true }}>
          <Page />
        </YxNavContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  Object.assign(perfSetup, { templates: [ANNUAL], scales: [SCALE], skills: [], agenda: [], goals: [] });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
});

describe('Settings S-8: Expenses & travel (4.8) and Performance (6.3)', () => {
  it('expense set-up changes a setting on 4.8 at once (no second person), with the link to the policy matrix', async () => {
    routes(['expense.policy.manage']);
    show(YxFinanceSettingsPage, 'expenses-and-travel');
    expect(await screen.findByRole('combobox', { name: /finance check of claims/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open policy matrix/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: /capture GST/ }));
    expect(screen.queryByRole('button', { name: 'Send for approval' })).toBeNull();
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(calls).toEqual([['PUT /org/settings', { key: 'expense.gst.capture', value: 'on', scopeType: 'tenant' }]]));
  });

  it('negative: an expense policy viewer sees 4.8 view only', async () => {
    routes(['expense.policy.view']);
    show(YxFinanceSettingsPage, 'expenses-and-travel');
    expect(await screen.findByText(/finance check of claims/)).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('performance set-up opens 6.3 with its settings; negative: an address for another page under it shows no access, never another page', async () => {
    routes(['perf.setup.manage']);
    const { unmount } = show(YxTalentSettingsPage, 'performance');
    // The set-up lists arrive after the settings and re-draw the page: wait until it settles.
    await waitFor(() => expect(screen.getByText(/the manager approves a person/)).toBeInTheDocument());
    unmount();
    show(YxTalentSettingsPage, 'expenses-and-travel');
    expect(await screen.findByText(/You don't have access to/)).toBeInTheDocument();
    expect(screen.queryByText(/finance check of claims/)).toBeNull();
  });

  it('6.3 (batch T2-C): performance set-up lists the review templates and makes a new version of an active one in its sheet, with a toast', async () => {
    routes(['perf.setup.manage']);
    show(YxTalentSettingsPage, 'performance');
    expect(await screen.findByText('Annual review · version 1')).toBeInTheDocument();
    expect(screen.getAllByText('Five-point scale')).toHaveLength(2);
    await ue.click(screen.getByRole('button', { name: 'Edit Annual review · version 1' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).queryByRole('button', { name: 'Save draft' })).toBeNull();
    await ue.click(within(sheet).getByRole('button', { name: 'New version' }));
    await waitFor(() => expect(calls).toEqual([['POST /performance/templates/t1/new-version', undefined]]));
    expect((await screen.findAllByText('New version made as a draft')).length).toBeGreaterThan(0);
  });

  it('6.3 (T2-C item 70): performance set-up lists the company 1:1 templates (not a manager’s own), adds one and deletes one, with toasts', async () => {
    perfSetup.agenda = [
      { id: 'a1', name: 'Weekly check-in', items: ['Wins', 'Blockers'], company: true, mine: false, updatedAt: '2026-11-27T10:00:00Z' },
      { id: 'a2', name: 'My own talk', items: ['Career'], company: false, mine: true, updatedAt: '2026-11-27T10:00:00Z' },
    ];
    routes(['perf.setup.manage']);
    show(YxTalentSettingsPage, 'performance');
    expect(await screen.findByText('Weekly check-in')).toBeInTheDocument();
    expect(screen.queryByText('My own talk')).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Add a 1:1 template' }));
    let sheet = await screen.findByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(calls).toEqual([]);
    await ue.type(within(sheet).getByRole('textbox', { name: /^Name/ }), 'Monthly');
    await ue.type(within(sheet).getByRole('textbox', { name: /Agenda lines/ }), 'Goals{enter}Learning');
    await ue.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toEqual([['POST /performance/one-on-one-templates', { name: 'Monthly', items: ['Goals', 'Learning'], company: true }]]));
    expect((await screen.findAllByText('1:1 template saved')).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Edit Weekly check-in' }));
    sheet = await screen.findByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Delete' }));
    await ue.click(await screen.findByRole('button', { name: 'Delete template' }));
    await waitFor(() => expect(calls.at(-1)).toEqual(['DELETE /performance/one-on-one-templates/a1', undefined]));
  });

  it('6.3 (T2-C item 71): performance set-up adds a goal template for a department; negative: an objective needs key results', async () => {
    perfSetup.goals = [{ id: 'g1', title: 'Learn one new skill', description: null, kind: 'kpi', keyResults: [], departmentId: null, department: null, designationId: null, designation: null }];
    routes(['perf.setup.manage']);
    show(YxTalentSettingsPage, 'performance');
    expect(await screen.findByText('Learn one new skill')).toBeInTheDocument();
    expect(screen.getByText('Everyone')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add a goal template' }));
    const sheet = await screen.findByRole('dialog');
    await ue.type(within(sheet).getByRole('textbox', { name: /^Goal/ }), 'Grow my accounts');
    await ue.click(within(sheet).getByRole('radio', { name: 'Objective with key results' }));
    await ue.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(calls).toEqual([]);
    await ue.type(within(sheet).getByRole('textbox', { name: /Key results/ }), 'New accounts');
    await ue.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toEqual([['POST /performance/goal-templates', { title: 'Grow my accounts', description: null, kind: 'okr', keyResults: ['New accounts'], departmentId: null, designationId: null }]]));
  });

  it('6.3 (batch T2-C): a new company copies the YukthiX starters', async () => {
    routes(['perf.setup.manage']);
    Object.assign(perfSetup, { templates: [], scales: [] });
    show(YxTalentSettingsPage, 'performance');
    await ue.click(await screen.findByRole('button', { name: 'Use the starters' }));
    await waitFor(() => expect(calls.map((c) => c[0])).toEqual(['POST /performance/setup/from-starter']));
  });

  it('negative (6.3, batch T2-C): HR with only the settings key sees the company choices but no set-up lists, and nothing is asked of /performance', async () => {
    routes(['org.settings.manage']);
    show(YxTalentSettingsPage, 'performance');
    expect(await screen.findByText(/the manager approves a person/)).toBeInTheDocument();
    expect(screen.queryByText('Annual review · version 1')).toBeNull();
    expect(api.mock.calls.some(([p]) => String(p).startsWith('/performance'))).toBe(false);
  });

  it('6.5 Pass certificate (answer 2424): the assessments key edits the wording in a sheet, saved through its API with a toast', async () => {
    routes(['assessments.settings.manage']);
    show(YxTalentSettingsPage, 'assessments');
    expect(await screen.findByText('Pass certificate')).toBeInTheDocument();
    expect(screen.getByText('Standard wording')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Edit certificate' }));
    const sheet = await screen.findByRole('dialog');
    await ue.clear(within(sheet).getByLabelText(/^Title/));
    await ue.click(within(sheet).getByRole('button', { name: 'Save certificate' }));
    expect(within(sheet).getByText('Enter the title.')).toBeInTheDocument();
    expect(calls).toEqual([]);
    await ue.type(within(sheet).getByLabelText(/^Title/), 'Certificate of Merit');
    await ue.type(within(sheet).getByLabelText(/^Signed by/), 'Meenakshi Sundaram');
    await ue.click(within(sheet).getByRole('button', { name: 'Save certificate' }));
    await waitFor(() => expect(calls).toEqual([['PUT /certificate-template', { title: 'Certificate of Merit', bodyText: 'This is to certify that {{candidateName}} passed.', signatoryName: 'Meenakshi Sundaram', enabled: true }]]));
    expect((await screen.findAllByText('Certificate saved')).length).toBeGreaterThan(0);
  });

  it('negative (6.5): without an assessments key there is no certificate section; while acting it is view only', async () => {
    routes(['org.settings.manage']);
    const { unmount } = show(YxTalentSettingsPage, 'assessments');
    expect(await screen.findAllByText(/Assessments/)).not.toHaveLength(0);
    expect(screen.queryByText('Pass certificate')).toBeNull();
    unmount();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 't', impersonating: true });
    routes(['assessments.settings.manage']);
    show(YxTalentSettingsPage, 'assessments');
    expect(await screen.findByText('Pass certificate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit certificate' })).toBeNull();
  });

  it('5.4 hiring emails (answer 2429): sender addresses, interview and approval emails are listed and changed in their sheets', async () => {
    routes(['org.settings.manage', 'org:manage_settings', 'pipeline:manage', 'approvals:configure']);
    show(YxDocumentsSettingsPage, 'notifications');
    expect(await screen.findByText('Kaveri Careers')).toBeInTheDocument();
    expect(await screen.findByText('Invitation to the candidate')).toBeInTheDocument();
    expect(await screen.findByText('Approval requested')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Edit Invitation to the candidate' }));
    let sheet = await screen.findByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Save wording' }));
    await waitFor(() => expect(calls).toEqual([['PUT /interview-email-templates/invite', { subject: 'Interview invitation', body: 'Hi {{candidateName}}', enabled: true }]]));
    calls.length = 0;
    await ue.click(screen.getByRole('button', { name: 'Add address' }));
    sheet = await screen.findByRole('dialog');
    await ue.type(within(sheet).getByLabelText(/^Name/), 'Plant hiring');
    await ue.type(within(sheet).getByLabelText(/^Address/), 'plant@kaveri.test');
    await ue.click(within(sheet).getByRole('button', { name: 'Save address' }));
    await waitFor(() => expect(calls).toEqual([['POST /org-sender-addresses', { label: 'Plant hiring', address: 'plant@kaveri.test', isDefault: false }]]));
  });

  it('negative (5.4 hiring emails): without the keys the lists are not shown; while acting there is no Add or Edit', async () => {
    routes(['org.settings.manage']);
    const { unmount } = show(YxDocumentsSettingsPage, 'notifications');
    expect(await screen.findByText(/also send them by email/)).toBeInTheDocument();
    expect(screen.queryByText('Addresses recruiters send from')).toBeNull();
    unmount();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 't', impersonating: true });
    routes(['org.settings.manage', 'org:manage_settings', 'pipeline:manage']);
    show(YxDocumentsSettingsPage, 'notifications');
    expect(await screen.findByText('Kaveri Careers')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add address' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Invitation to the candidate' })).toBeNull();
  });

  it('5.4 Notifications: HR turns notification emails off, saved at once; the wording editor is linked', async () => {
    routes(['org.settings.manage']);
    show(YxDocumentsSettingsPage, 'notifications');
    await ue.click(await screen.findByRole('checkbox', { name: /also send them by email/ }));
    expect(screen.getByRole('button', { name: /Edit notification wording/ })).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(calls).toEqual([['PUT /org/settings', { key: 'notify.email.enabled', value: 'off', scopeType: 'tenant' }]]));
  });

  it('negative (5.4): expense set-up alone sees Notifications view only', async () => {
    routes(['expense.policy.manage']);
    show(YxDocumentsSettingsPage, 'notifications');
    expect(await screen.findByText(/also send them by email/)).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
  });

  it('5.1: the starter and company types are listed; HR adds one (a missing name is refused first)', async () => {
    routes(['org.settings.manage']);
    show(YxDocumentTypesPage as never, 'document-types');
    const table = await screen.findByRole('table', { name: 'Document types' });
    expect(within(table).getByText('YukthiX starter')).toBeInTheDocument();
    expect(within(table).getByText('Your company')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add document type' }));
    const drawer = await screen.findByRole('dialog');
    await ue.click(within(drawer).getByRole('button', { name: 'Add document type' }));
    expect(await within(drawer).findByText('Give the type a name of at least 2 characters.')).toBeInTheDocument();
    expect(calls).toEqual([]);
    await ue.type(within(drawer).getByRole('textbox', { name: /Name/ }), 'Driving licence');
    await ue.click(within(drawer).getByRole('checkbox', { name: /It has an expiry date/ }));
    await ue.click(within(drawer).getByRole('button', { name: 'Add document type' }));
    await waitFor(() => expect(calls).toEqual([['POST /documents/types', { name: 'Driving licence', sensitivity: 'personal', requiresVerification: true, expiryTracked: true, reminderDays: [60, 30, 7], uploadBy: ['person', 'hr'] }]]));
  });

  it('5.1 (answer 1822): a starter type opens with only verification and reminders to choose, saved for the company; never retired; a reader gets no Add button', async () => {
    routes(['org.settings.manage']);
    const { unmount } = show(YxDocumentTypesPage as never, 'document-types');
    await ue.click(await screen.findByRole('button', { name: 'Edit Passport' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText(/A YukthiX starter type: choose whether HR verifies it and when to remind/)).toBeInTheDocument();
    expect(within(drawer).getByRole('textbox', { name: /Name/ })).toBeDisabled();
    expect(within(drawer).queryByRole('button', { name: 'Retire' })).toBeNull();
    await ue.click(within(drawer).getByRole('checkbox', { name: /HR verifies it/ }));
    await ue.click(within(drawer).getByRole('button', { name: 'Save your choices' }));
    await waitFor(() => expect(calls).toEqual([['PUT /documents/types/passport', expect.objectContaining({ name: 'Passport', requiresVerification: true, reminderDays: [60, 30, 7] })]]));
    unmount();
    routes(['org.structure.view']);
    show(YxDocumentTypesPage as never, 'document-types');
    expect(await screen.findByRole('table', { name: 'Document types' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add document type' })).toBeNull();
  });
});
