import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHeadcountPlansPage from './(app)/hiring/plans/page';
import YxHiringApprovalRoutesPage from './(app)/hiring/approval-routes/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › Headcount plan (HIR-01) and Hiring approvals on the API (M10 batch AT2).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/plans');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, impersonating: false, isLoading: false, logout: jest.fn() });
});

describe('Hiring › Headcount plan (HIR-01, the designed board)', () => {
  const line = { id: 'l1', designationId: 'x1', designation: 'Accountant', gradeId: null, grade: null, locationId: null, location: null, count: 2, budget: 1_400_000, committed: 0, committedBudget: 0, filled: 0 };
  const plan = (o: object = {}) => ({ id: 'p1', departmentId: 'd1', department: 'Finance', legalEntityId: null, fyStart: 2026, status: 'draft', note: null, version: 4, revisionNo: 1, revision: null, approval: null, lines: [line], ...o });
  const serve = (keys: string[], plans: unknown, writes: { path: string; body: unknown }[] = []) =>
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/rbac/me/permissions')) return keys;
      if (path.startsWith('/hiring/plans?fy=')) {
        if (plans instanceof Error) throw plans;
        return plans;
      }
      if (init?.method) return (writes.push({ path, body: JSON.parse(String(init.body)) }), path.endsWith('/submit') ? { status: 'submitted' } : path.includes('/decide') ? {} : plan());
      if (path === '/org/masters/departments') return [{ id: 'd1', name: 'Finance', archivedAt: null }];
      if (path.startsWith('/org/')) return [{ id: 'x1', name: 'Accountant', archivedAt: null }];
      throw new Error(`unexpected GET ${path}`);
    });

  it('HR sends a draft plan from the plan sheet with its version', async () => {
    const writes: { path: string; body: unknown }[] = [];
    serve(['ats.headcount.manage'], [plan()], writes);
    wrap(<YxHeadcountPlansPage />);
    expect(await screen.findByRole('listitem', { name: 'Finance' })).toHaveTextContent('Draft');
    await userEvent.click(screen.getByRole('button', { name: 'Revise plan' }));
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('combobox', { name: /Department/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Finance' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(writes.map((w) => w.path)).toEqual(['/hiring/plans/p1', '/hiring/plans/p1/submit']));
    expect(writes[0].body).toMatchObject({ departmentId: 'd1', fyStart: expect.any(Number), lines: [{ id: null, designationId: 'x1', count: 2, budget: 1_400_000 }], version: 4 });
  });

  it('the approver approves the waiting plan on the board through the approvals API', async () => {
    const writes: { path: string; body: unknown }[] = [];
    serve(['ats.headcount.manage'], [plan({ status: 'submitted', approval: { kind: 'plan', status: 'pending', reason: null, submittedAt: null, submittedBy: 'Lakshmi', steps: [{ name: 'Finance and HR', state: 'waiting', approvers: ['Ravi'], at: null }], myTaskId: 't9' } })], writes);
    wrap(<YxHeadcountPlansPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve plan' }));
    await waitFor(() => expect(writes).toEqual([{ path: '/workflow/approvals/tasks/t9/decide', body: { decision: 'approve' } }]));
  });

  it('a hiring manager reads their department read-only; when the company shows HR only, says so', async () => {
    serve(['ats.requisition.raise'], [plan({ status: 'approved', lines: [{ ...line, budget: null }] })]);
    const { unmount } = wrap(<YxHeadcountPlansPage />);
    expect(await screen.findByText(/Showing Finance only · read-only/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revise plan' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Open requisition' })).toHaveLength(2);
    unmount();
    serve(['ats.requisition.raise'], Object.assign(new Error('HR only'), { status: 403, code: 'HEADCOUNT_PLAN_HR_ONLY' }));
    wrap(<YxHeadcountPlansPage />);
    expect(await screen.findByText('Only HR sees the headcount plan')).toBeInTheDocument();
  });

  it('any other 403 (an HR person without a hiring role) is plain no access, not the HR-only message', async () => {
    serve(['employee.change.manage'], Object.assign(new Error('Missing any of required permission(s): ats.headcount.manage, ats.requisition.raise'), { status: 403 }));
    wrap(<YxHeadcountPlansPage />);
    expect(await screen.findByText("You don't have access to the headcount plan")).toBeInTheDocument();
    expect(screen.getByText(/Your System Admin gives this through Roles & access/)).toBeInTheDocument();
    expect(screen.queryByText('Only HR sees the headcount plan')).toBeNull();
  });
});

describe('Hiring approvals (M10 AT2)', () => {
  it('reads both chains and saves the requisition chain on the same API', async () => {
    const put: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/organizations/approvals/chains' && !init?.method) return { requisition: { gate: 'requisition', enabled: true, steps: [{ position: 0, name: 'Head', approverType: 'reporting_manager', approverUserIds: [], managerLevel: 1, groupId: null }] }, offer: { gate: 'offer', enabled: false, steps: [] } };
      if (path === '/organizations/approvals/chains/requisition' && init?.method === 'PUT') return (put.push(JSON.parse(String(init.body))), {});
      if (path.startsWith('/users') || path.startsWith('/user-groups')) return [];
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    wrap(<YxHiringApprovalRoutesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Save requisition approval' }));
    await waitFor(() => expect(put).toEqual([{ enabled: true, steps: [{ name: 'Head', approverType: 'reporting_manager', managerLevel: 1 }] }]));
  });
});
