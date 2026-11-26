import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxPayArrearsPage from './(app)/payroll/arrears/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Enterprise E3 (answers 2651, 2652, 2787): Payroll › Arrears and recoveries › Rule changes and triggers, on the API.
const wrap = (ui: ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const PROPOSALS = [
  { id: 'rp1', statute: 'IN.PT', jurisdiction: 'IN-KA', ruleVersion: '2026-v3', periods: ['2026-09'], employeeCount: 3, status: 'open', reason: null, impact: null },
  { id: 'rp2', statute: 'IN.LWF', jurisdiction: 'IN-KA', ruleVersion: '2026-v2', periods: ['2026-09'], employeeCount: 3, status: 'open', reason: null, impact: { status: 'ready', people: 3, total: '360.00', largest: '120.00' } },
];
const JOBS = [{ id: 'j1', kind: 'change', mode: 'draft', status: 'done', people: 1, done: 1, skipped: [], total: '6000.00', largest: '6000.00', largestPerson: 'Lakshmi Devi', createdAt: '2026-11-20T09:30:00Z' }];
const calls: string[] = [];
function route(perms: string[]) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (init?.method) calls.push(key);
    if (key === 'GET /rbac/me/permissions') return perms;
    if (key === 'GET /statutory/arrears-proposals') return PROPOSALS;
    if (key === 'GET /payroll/arrears-runs') return JOBS;
    if (key.startsWith('POST /statutory/arrears-proposals/')) return { id: 'rp', status: 'accepted' };
    if (key === 'GET /auth/me' || key === 'GET /users/me') return { id: 'u-me' };
    return [];
  });
}

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx/payroll/arrears: rule changes and triggers (E3)', () => {
  it('works out a rule change\'s impact and accepts one whose impact is ready (positive)', async () => {
    route(['payroll.arrears.approve']);
    wrap(<YxPayArrearsPage />);
    await ue.click(await screen.findByRole('tab', { name: /Rule changes and triggers/ }));
    const pt = await screen.findByRole('row', { name: /IN\.PT/ });
    await ue.click(within(pt).getByRole('button', { name: 'Accept' }));
    expect(screen.getByText(/Work out the impact of IN\.PT 2026-v3 first/)).toBeInTheDocument();
    expect(calls).not.toContain('POST /statutory/arrears-proposals/rp1/accept');
    await ue.click(within(pt).getByRole('button', { name: 'Work out the impact' }));
    await waitFor(() => expect(calls).toContain('POST /statutory/arrears-proposals/rp1/preview'));
    await ue.click(within(screen.getByRole('row', { name: /IN\.LWF/ })).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(calls).toContain('POST /statutory/arrears-proposals/rp2/accept'));
    expect(screen.getByText('Back-dated salary change')).toBeInTheDocument();
  });

  it('without the arrears key the tab is not there and nothing is fetched (negative)', async () => {
    route(['payroll.run.view']);
    wrap(<YxPayArrearsPage />);
    expect(await screen.findByRole('tab', { name: /Recoveries/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Rule changes and triggers/ })).toBeNull();
    expect(api.mock.calls.map((c) => String(c[0]))).not.toContain('/statutory/arrears-proposals');
  });
});
