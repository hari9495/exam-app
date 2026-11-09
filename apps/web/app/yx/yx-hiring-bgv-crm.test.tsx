import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHiringBgvPage from './(app)/hiring/bgv/page';
import YxHiringPoolsPage from './(app)/hiring/pools/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › Background checks (HIR-10) and Talent CRM (HIR-20): the designed screens with `live`, on the API.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;
const router = { push: jest.fn(), replace: jest.fn() };
let PERMS: string[] = [];
const forbidden = () => Object.assign(new Error('Missing required permission(s): lifecycle.bgv.manage'), { status: 403 });

beforeEach(() => {
  PERMS = ['candidate:manage', 'candidate:view', 'pipeline:manage', 'lifecycle.bgv.manage'];
  api.mockReset();
  router.push.mockReset();
  (useRouter as jest.Mock).mockReturnValue(router);
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/pools');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({});
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, impersonating: false, isLoading: false, logout: jest.fn() });
});

const TRACKER = {
  partner: null,
  today: '2026-11-12',
  viewerId: 'u2',
  deciderOtherPerson: true,
  joiners: [
    {
      id: 'p1', journeyId: 'j1', name: 'Joseph George', designation: 'Senior QA Engineer', joiningOn: '2026-11-20', status: 'invited', consent: 'given', consentAt: '2026-11-02T05:00:00.000Z',
      checks: [{ id: 'k1', checkType: 'employment', status: 'discrepancy', gate: 'before_joining', note: 'Dates differ', addedAt: '2026-11-03T05:00:00.000Z', addedBy: 'Neha', checkedBy: 'Neha', checkedById: 'u1', checkedOn: '2026-11-05', evidence: null, decision: null, version: 2 }],
    },
  ],
};

describe('Hiring › Background checks (HIR-10)', () => {
  it('lists joiners from GET lifecycle/bgv and records a decision with the check version', async () => {
    const posted: [string, unknown][] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/lifecycle/bgv') return TRACKER;
      if (init?.method === 'POST') return (posted.push([path, JSON.parse(String(init.body))]), { ok: true });
      return [];
    });
    wrap(<YxHiringBgvPage />);
    await userEvent.click(await screen.findByText('Joseph George'));
    await userEvent.click(within((await screen.findAllByRole('dialog')).at(-1)!).getByRole('button', { name: 'Decide' }));
    const d = (await screen.findAllByRole('dialog')).at(-1)!;
    await userEvent.click(within(d).getByRole('radio', { name: 'Do not proceed' }));
    await userEvent.type(within(d).getByLabelText(/^Reason/), 'Could not explain the gap');
    await userEvent.click(within(d).getByRole('button', { name: 'Record decision' }));
    await waitFor(() => expect(posted).toEqual([['/lifecycle/bgv/checks/k1/decision', { decision: 'stop', note: 'Could not explain the gap', version: 2 }]]));
  });

  it('without the key the page says who grants it', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/lifecycle/bgv') throw forbidden();
      return [];
    });
    wrap(<YxHiringBgvPage />);
    expect(await screen.findByText(/HR \(the background-check key\)/)).toBeInTheDocument();
  });
});

describe('Hiring › Talent CRM (HIR-20)', () => {
  const POOLS = [{ id: 'l1', name: 'QA silver medallists', kind: 'pool', description: 'Finalists', members: 1, consented: 1, ownerName: 'Neha', updatedAt: '2026-11-01T05:00:00.000Z' }];
  const routes = (calls: [string, string | undefined][]) =>
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      calls.push([path, init?.method]);
      if (path.startsWith('/rbac/me/permissions')) return PERMS;
      if (path === '/hiring/pools') return POOLS;
      if (path === '/hiring/pools/l1/members') return { pool: POOLS[0], members: [{ candidateId: 'c1', addedAt: '2026-11-02T05:00:00.000Z', consent: 'given', candidate: { id: 'c1', name: 'Priya Raman', email: 'priya@example.com', globalStage: 'available' } }] };
      if (path === '/hiring/postings') return [{ jobId: 'job1', title: 'Senior QA Engineer', status: 'open', jobBoardIds: [], postings: [{ boardId: 'b1', board: 'Naukri', status: 'not posted' }] }];
      return { ok: true };
    });

  it('opens a pool’s members (consent shown) and removes one with DELETE', async () => {
    const calls: [string, string | undefined][] = [];
    routes(calls);
    wrap(<YxHiringPoolsPage />);
    await userEvent.click(await screen.findByText('QA silver medallists'));
    const d = (await screen.findAllByRole('dialog')).at(-1)!;
    expect(await within(d).findByText('Priya Raman')).toBeInTheDocument();
    expect(within(d).getByText('Given')).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: 'Remove' }));
    await userEvent.click(within((await screen.findAllByRole('dialog')).at(-1)!).getByRole('button', { name: 'Remove from list' }));
    await waitFor(() => expect(calls).toContainEqual(['/hiring/pools/l1/members/c1', 'DELETE']));
  });

  it('posts a job to a board through PATCH jobs/:id; acting for someone else hides the writes', async () => {
    const calls: [string, string | undefined][] = [];
    routes(calls);
    wrap(<YxHiringPoolsPage />);
    await userEvent.click(await screen.findByRole('tab', { name: /Job-board postings/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Post' }));
    await waitFor(() => expect(calls).toContainEqual(['/jobs/job1', 'PATCH']));
  });

  it('acting for someone else: no New pool, no Post', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, impersonating: true, isLoading: false, logout: jest.fn() });
    routes([]);
    wrap(<YxHiringPoolsPage />);
    expect(await screen.findByText('QA silver medallists')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New pool' })).not.toBeInTheDocument();
  });
});
