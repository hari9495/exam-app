import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxAppLayout from './(app)/layout';
import YxPerformanceSetupPage from './(app)/settings/performance/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { name: 'Meena Iyer', email: 'meena@kaverifoods.in' } }) }));

// Settings › Performance wired to /performance (M06 batch PM1, PM-1.05).
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
  (usePathname as jest.Mock).mockReturnValue('/yx/settings/performance');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Settings › Performance', () => {
  it('a new company copies the YukthiX starters', async () => {
    const posted: string[] = [];
    route({ 'GET /rbac/me/permissions': ['perf.setup.manage'], 'GET /performance/scales': [], 'GET /performance/templates': [], 'GET /performance/competencies': [], 'GET /performance/skills': [], 'POST /performance/setup/from-starter': (p: string) => (posted.push(p), { scales: 1, templates: 4, competencies: 12 }) });
    wrap(<YxPerformanceSetupPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use the starters' }));
    await waitFor(() => expect(posted).toEqual(['/performance/setup/from-starter']));
  });

  it('the menu shows Performance under Organisation to whoever keeps performance set-up', async () => {
    route({ 'GET /auth/mfa': { factors: [], required: false, enrolmentDueAt: '2030-01-01T00:00:00Z' }, 'GET /rbac/me/permissions': ['perf.setup.manage'], 'GET /people/employees': [], 'GET /people/team': { managerId: null, members: [] } });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    await waitFor(async () => expect(within(await screen.findByRole('navigation', { name: 'Menu' })).getByRole('link', { name: 'Performance' })).toHaveAttribute('href', '/yx/settings/performance'));
  });
});
