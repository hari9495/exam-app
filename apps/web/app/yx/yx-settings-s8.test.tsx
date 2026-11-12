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
const DOC_TYPES = [
  { key: 'passport', name: 'Passport', sensitivity: 'confidential', requiresVerification: false, expiryTracked: true, reminderDays: [60, 30, 7], uploadBy: ['person', 'hr'], system: true },
  { key: 'c_gate_pass', name: 'Gate pass', sensitivity: 'internal', requiresVerification: true, expiryTracked: false, reminderDays: [], uploadBy: ['hr'], system: false },
];
const routes = (perms: string[]) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT' || init?.method === 'POST') return (calls.push([`${init.method} ${path}`, JSON.parse(String(init.body))]), { pending: true });
    if (path.startsWith('/rbac/me/permissions')) return perms;
    if (path === '/documents/types') return DOC_TYPES;
    if (path === '/org/settings') return { registry: REGISTRY, limits: {}, pending: [], overrides: [] };
    if (path === '/org/legal-entities') return [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' }];
    if (path === '/org/locations') return [{ id: 'l1', name: 'Hosur plant' }];
    if (path.startsWith('/org/masters/')) return [];
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
    expect(await screen.findByText(/the manager approves a person/)).toBeInTheDocument();
    unmount();
    show(YxTalentSettingsPage, 'expenses-and-travel');
    expect(await screen.findByText(/You don't have access to/)).toBeInTheDocument();
    expect(screen.queryByText(/finance check of claims/)).toBeNull();
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

  it('negative (5.1): a starter type opens read-only; a reader gets no Add button', async () => {
    routes(['org.settings.manage']);
    const { unmount } = show(YxDocumentTypesPage as never, 'document-types');
    await ue.click(await screen.findByRole('button', { name: 'Edit Passport' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('A YukthiX starter type: it cannot be changed or removed.')).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: /Save|Retire/ })).toBeNull();
    unmount();
    routes(['org.structure.view']);
    show(YxDocumentTypesPage as never, 'document-types');
    expect(await screen.findByRole('table', { name: 'Document types' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add document type' })).toBeNull();
  });
});
