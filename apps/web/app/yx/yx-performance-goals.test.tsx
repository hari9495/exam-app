import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxGoalsPage from './(app)/performance/page';
import YxGoalPage from './(app)/performance/goals/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Goals wired to /performance (M06 batch PM2, PM-2.04).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/performance');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const GOAL = { id: 'g1', periodId: 'p1', ownerType: 'person', ownerEmployeeId: 'e1', ownerDepartmentId: null, owner: 'Arjun', parentGoalId: null, kind: 'okr', title: 'Close three new accounts', weight: 100, status: 'draft', progress: 0, version: 1 };

describe('Goals (M06 batch PM2)', () => {
  it('my goals load for the open period, and drafts are sent to the manager together', async () => {
    const seen: string[] = [];
    const posted: unknown[] = [];
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/goal-periods': [{ id: 'p0', name: 'H1', fromOn: '2026-04-01', toOn: '2026-09-30', status: 'closed' }, { id: 'p1', name: 'H2', fromOn: '2026-10-01', toOn: '2027-03-31', status: 'open' }],
      'GET /performance/goals': (p: string) => (seen.push(p), { goals: [GOAL], totalWeight: 100 }),
      'GET /performance/goals/align-options': [],
      'POST /performance/goals/submit': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), { goals: [], totalWeight: 100 }),
    });
    wrap(<YxGoalsPage />);
    expect(await screen.findByText('Close three new accounts')).toBeInTheDocument();
    expect(seen[0]).toBe('/performance/goals?period=p1&view=mine');
    await userEvent.click(screen.getByRole('button', { name: 'Send my goal to my manager' }));
    await waitFor(() => expect(posted).toEqual([{ periodId: 'p1' }]));
  });

  it('a check-in posts key result values to the goal', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'g1' });
    const posted: unknown[] = [];
    route({
      'GET /rbac/me/permissions': [],
      'GET /people/team': { managerId: null, members: [] },
      'GET /performance/goals/g1': { ...GOAL, status: 'active', description: null, keyResults: [{ id: 'k1', title: 'Accounts', unit: null, direction: 'up', start: 0, target: 3, current: 1, weight: 1, progress: 33.33 }], parent: null, children: [], checkins: [], pendingChange: null, decisionNote: null, can: { edit: true, checkIn: true, drop: true, cascade: false } },
      'GET /performance/goals/align-options': [],
      'POST /performance/goals/g1/checkins': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), {}),
    });
    wrap(<YxGoalPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Check in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save check-in' }));
    await waitFor(() => expect(posted).toEqual([{ values: [{ keyResultId: 'k1', value: 1 }], confidence: 'on_track', note: null }]));
  });
});
