import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { buildNav, type NavInput } from '../../lib/yx-nav';
import { YxNavContext } from '../../lib/yx-shell';
import YxPeopleSettingsPage from './(app)/settings/people/[page]/page';
import YxApprovalPoliciesPage from './(app)/settings/approval-policies/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn(() => ({ accessToken: 't' })) }));

// Settings S-6, 2.4 Approvals (answer 1330): the page with its policies and hours, and the policy editor.
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
const ADMIN = buildNav({ ...base, has: () => true, role: 'org_admin' });
const POLICIES = {
  remindHours: 24,
  escalateHours: 48,
  types: [
    { key: 'leave.request', label: 'Leave', steps: [{ name: 'Manager', approver: 'manager', mode: 'any' }], approvers: 'Manager', version: 1, updatedBy: 'Lakshmi', updatedAt: '2026-11-12T10:00:00Z' },
    { key: 'expense.claim', label: 'Expense claim', steps: null, approvers: 'Manager; then the cost-centre owner above the set amount', version: 0, updatedBy: null, updatedAt: null },
  ],
};
const REGISTRY = {
  'approval.remind_hours': { label: 'Approvals: remind the approver after (hours)', scopes: ['tenant'], dated: false, values: ['4', '8', '12', '24', '48'], default: '24' },
  'approval.escalate_hours': { label: 'Approvals: escalate after (hours)', scopes: ['tenant'], dated: false, values: ['24', '48', '72', '96', '120'], default: '48' },
};
const calls: [string, unknown][] = [];
const routes = (perms: string[]) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method) {
      calls.push([`${init.method} ${path}`, JSON.parse(String(init.body ?? '{}'))]);
      return path.startsWith('/workflow/policies') ? POLICIES : {};
    }
    if (path.startsWith('/rbac/me/permissions')) return perms;
    if (path === '/workflow/policies') return POLICIES;
    if (path === '/org/settings') return { registry: REGISTRY, limits: {}, overrides: [] };
    if (path.startsWith('/org/settings/history')) return [];
    throw new Error(`unexpected ${path}`);
  });
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxNavContext.Provider value={{ nav: ADMIN, ready: true }}>{ui}</YxNavContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  calls.length = 0;
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
});

describe('Settings › Approvals (2.4)', () => {
  it('lists each request type with its steps, and the reminder and escalation hours', async () => {
    routes(['org.settings.manage']);
    (useParams as jest.Mock).mockReturnValue({ page: 'approvals' });
    wrap(<YxPeopleSettingsPage />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Leave')).toBeInTheDocument();
    expect(within(table).getAllByText('As built in').length).toBeGreaterThan(0);
    expect(within(table).getByText(/cost-centre owner above/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /remind the approver after/ })).toBeInTheDocument();
  });

  it('negative: without the settings key the page is view only', async () => {
    routes(['org.structure.view']);
    (useParams as jest.Mock).mockReturnValue({ page: 'approvals' });
    wrap(<YxPeopleSettingsPage />);
    expect(await screen.findByText('View only')).toBeInTheDocument();
  });
});

describe('Settings › Approval policies (PLT-12)', () => {
  it('saves a type steps to PUT /workflow/policies/<type> with the version opened', async () => {
    routes(['org.settings.manage']);
    wrap(<YxApprovalPoliciesPage />);
    await ue.click(await screen.findByRole('button', { name: 'Add step' }));
    await ue.click(screen.getByRole('button', { name: 'Save as version 2' }));
    await waitFor(() => expect(calls).toContainEqual(['PUT /workflow/policies/leave.request', { steps: [{ name: 'Manager', approver: 'manager', mode: 'any' }, { name: 'HR', approver: 'hr', mode: 'any' }], version: 1 }]));
  });

  it('negative: without the settings key it is view only, and with no key at all no access', async () => {
    routes(['org.structure.view']);
    const { unmount } = wrap(<YxApprovalPoliciesPage />);
    expect(await screen.findByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save as version/ })).toBeNull();
    unmount();
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/rbac/me/permissions')) return [];
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    });
    wrap(<YxApprovalPoliciesPage />);
    expect(await screen.findByText(/You don't have access to approval policies/)).toBeInTheDocument();
  });
});
