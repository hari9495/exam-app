import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxRequisitionsPage from './(app)/hiring/requisitions/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › Requisitions (HIR-02) with the rediscovery panel (HIR-26), the designed screens live.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const push = jest.fn();

const ROW = (o: object = {}) => ({
  id: 'j1', jobNumber: 7, title: 'QA Engineer', department: 'Engineering', location: 'Chennai office', grade: 'G4', hiringManager: 'Divya', recruiter: 'Neha',
  replacementFor: null, outsidePlan: false, outsidePlanReason: null, budgetAmount: 900000, positions: 1, status: 'Approved', raised: '2026-11-02T05:00:00Z',
  line: { id: 'l1', designation: 'QA Engineer', grade: '', location: '', approved: 3, open: 1, filled: 0, budget: null, committedBudget: 0 },
  approval: { status: 'approved', reason: null, submittedAt: '2026-11-02T05:00:00Z', submittedBy: 'Divya', steps: [{ name: 'Recruiting', state: 'approved', approvers: ['Neha'], at: '2026-11-03T05:00:00Z' }], waitingOn: null },
  ...o,
});
const MATCH = { id: 'c1', name: 'Sana Nizami', lastRole: 'QA Engineer (JOB-0003)', lastStage: 'Final panel', reasons: ['Past role: Test Engineer'], aiNote: null, consent: { email: 'opted-in', whatsapp: 'none' }, retentionUntil: '2027-05-01T00:00:00Z', pool: null };
const serve = (keys: string[], viewer: 'all' | 'own', writes: { path: string; body: unknown }[] = [], rediscovery: unknown = { mode: 'text', ai: 'off', matches: [MATCH] }) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith('/rbac/me/permissions')) return keys;
    if (path === '/hiring/requisitions') return { viewer, rows: [ROW(), ROW({ id: 'j2', jobNumber: 8, title: 'Release Manager', status: 'Sent back', line: null, outsidePlan: true, outsidePlanReason: 'Client go-live', approval: { status: 'rejected', reason: 'Add the territory', submittedAt: null, submittedBy: null, steps: [], waitingOn: null } })] };
    if (path.endsWith('/rediscovery')) {
      if (rediscovery instanceof Error) throw rediscovery;
      return rediscovery;
    }
    if (init?.method) return (writes.push({ path, body: init.body ? JSON.parse(String(init.body)) : null }), { status: 'pending_approval' });
    throw new Error(`unexpected GET ${path}`);
  });

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/requisitions');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, impersonating: false, isLoading: false, logout: jest.fn() });
});

describe('Hiring › Requisitions (HIR-02 + HIR-26)', () => {
  it('a recruiter opens a requisition, sees past candidates and adds one to its pipeline with a toast', async () => {
    const writes: { path: string; body: unknown }[] = [];
    serve(['pipeline:manage', 'candidate:view'], 'all', writes);
    wrap(<YxRequisitionsPage />);
    expect(await screen.findByText('REQ-0007')).toBeInTheDocument();
    await userEvent.click(screen.getAllByText('QA Engineer')[0]);
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText('Sana Nizami')).toBeInTheDocument();
    expect(within(d).getByText(/Plain search: AI notes are off/)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: /Add to pipeline/ }));
    await waitFor(() => expect(writes).toEqual([{ path: '/jobs/j1/entries', body: { candidateId: 'c1' } }]));
    expect((await screen.findAllByText('Sana Nizami added to the pipeline')).length).toBeGreaterThan(0);
    await userEvent.click(within(d).getByRole('button', { name: 'Open job' }));
    expect(push).toHaveBeenCalledWith('/yx/hiring/jobs/j1');
  });

  it('a sent-back requisition is sent again by recruiting', async () => {
    const writes: { path: string; body: unknown }[] = [];
    serve(['pipeline:manage'], 'all', writes);
    wrap(<YxRequisitionsPage />);
    await userEvent.click(await screen.findByText('Release Manager'));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText(/Add the territory/)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(writes.map((w) => w.path)).toEqual(['/jobs/j2/submit']));
    expect((await screen.findAllByText('Release Manager sent for approval')).length).toBeGreaterThan(0);
  });

  it('a hiring manager reads their own, read-only, and raises a new one from the sheet', async () => {
    serve(['ats.requisition.raise', 'candidate:view'], 'own');
    wrap(<YxRequisitionsPage />);
    expect(await screen.findByText(/Read-only: recruiting and HR change them/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New requisition' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('Release Manager'));
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByRole('button', { name: 'Send for approval' })).toBeNull();
    expect(await within(d).findByText('Sana Nizami')).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: /Add to pipeline/ })).toBeNull();
  });

  it('acting for someone else: no New requisition, no Add, no Send', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, impersonating: true, isLoading: false, logout: jest.fn() });
    serve(['pipeline:manage', 'ats.requisition.raise'], 'all');
    wrap(<YxRequisitionsPage />);
    expect(await screen.findByText('REQ-0007')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New requisition' })).toBeNull();
    await userEvent.click(screen.getByText('Release Manager'));
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByRole('button', { name: 'Send for approval' })).toBeNull();
    expect(await within(d).findByText('Sana Nizami')).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: /Add to pipeline/ })).toBeNull();
  });

  it('HR without a candidate key sees no past candidates; a failing list shows the error with Retry', async () => {
    serve(['ats.headcount.manage'], 'all');
    const { unmount } = wrap(<YxRequisitionsPage />);
    await userEvent.click(await screen.findByText('Release Manager'));
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByText('Past candidates to consider')).toBeNull();
    unmount();
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/rbac/me/permissions')) return ['pipeline:manage'];
      throw Object.assign(new Error('down'), { status: 500 });
    });
    wrap(<YxRequisitionsPage />);
    expect(await screen.findByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });
});
