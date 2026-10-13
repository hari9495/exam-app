import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHeadcountPlansPage from './(app)/hiring/plans/page';
import YxHiringApprovalRoutesPage from './(app)/hiring/approval-routes/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › Headcount plans and Hiring approvals on the API (M10 batch AT2).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/plans');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Hiring › Headcount plans (M10 AT2)', () => {
  it('lists the year’s plans and sends a draft for approval with its version', async () => {
    const posted: { path: string; body: unknown }[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/hiring/plans?fy=')) return [{ id: 'p1', departmentId: 'd1', department: 'Finance', legalEntityId: null, fyStart: 2026, status: 'draft', note: null, version: 4, lines: [{ id: 'l1', designationId: 'x1', designation: 'Accountant', gradeId: null, grade: null, locationId: null, location: null, count: 2, budget: null, committed: 0, committedBudget: 0, filled: 0 }] }];
      if (path === '/hiring/plans/p1/submit') return (posted.push({ path, body: JSON.parse(String(init!.body)) }), { status: 'submitted' });
      if (path.startsWith('/org/')) return [];
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    wrap(<YxHeadcountPlansPage />);
    expect(await screen.findByText(/Finance · FY/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(posted).toEqual([{ path: '/hiring/plans/p1/submit', body: { version: 4 } }]));
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
