import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { useYxPermissions } from '../../lib/yx-org';
import YxHiringDashboardPage from './(app)/hiring/dashboard/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/yx-org', () => ({ ...jest.requireActual('../../lib/yx-org'), useYxPermissions: jest.fn() }));

// Answer 2432: Hire › Dashboard (ANL-02 Recruiter, live).
const api = apiFetch as jest.Mock;
const DATA = { openJobs: 5, timeToHire: { medianDays: 21, hiredCount: 3 }, offers: { accepted: 3, declined: 1 }, funnel: [{ stage: 'active', reached: 40 }, { stage: 'offer', reached: 4 }, { stage: 'hired', reached: 3 }], sources: [{ source: 'referral', entered: 10, hired: 2 }], jobs: [] };
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><YxHiringDashboardPage /></QueryClientProvider>);
const perms = (keys: string[]) => (useYxPermissions as jest.Mock).mockReturnValue(Object.assign(new Set(keys), { isSuccess: true }));

beforeEach(() => {
  api.mockReset();
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
  api.mockImplementation(async (path: string) => {
    if (path.startsWith('/analytics/hiring')) return DATA;
    if (path === '/hiring/costs') return [{ id: 'c1', amount: 90000, period: '2026-11', createdAt: '2026-11-02T00:00:00Z', origin: 'manual' }];
    if (path === '/hiring/costs/overview') return { from: '2026-10-01', to: '2026-12-31', hires: 3, jobs: [] };
    return {};
  });
});

it('shows the hiring figures for the last 90 days; with the costs key, cost per hire for the quarter', async () => {
  perms(['results:view', 'ats.costs.manage']);
  wrap();
  expect(await screen.findByText('21')).toBeInTheDocument();
  expect(screen.getByText('75')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'View recruiting costs' })).toBeInTheDocument();
  expect(api.mock.calls.map((c) => c[0] as string).find((p) => p.startsWith('/analytics/hiring'))).toMatch(/^\/analytics\/hiring\?from=\d{4}-\d{2}-\d{2}$/);
});

it('negative: no cost per hire and no costs calls without the costs key', async () => {
  perms(['results:view']);
  wrap();
  expect(await screen.findByText('21')).toBeInTheDocument();
  expect(screen.queryByText(/Cost per hire/)).toBeNull();
  expect(api.mock.calls.some((c) => String(c[0]).startsWith('/hiring/costs'))).toBe(false);
});

it('negative: without results:view it says who gives access and asks for nothing', async () => {
  perms(['pipeline:manage']);
  wrap();
  expect(await screen.findByText(/HR/)).toBeInTheDocument();
  await waitFor(() => expect(api).not.toHaveBeenCalled());
});
