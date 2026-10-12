import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxAppLayout from './(app)/layout';
import YxExpenseSetupPage from './(app)/settings/expenses/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { name: 'Meena Iyer', email: 'meena@kaverifoods.in' } }) }));

// Settings › Expenses wired to /expenses (M05 batch E1, XP-1.06).
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
  (usePathname as jest.Mock).mockReturnValue('/yx/settings/expenses');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const EMPTY = {
  'GET /expenses/setup-check': { ready: false, problems: [{ key: 'no_categories', text: 'There are no expense categories yet. Start from the YukthiX starters.' }] },
  'GET /expenses/categories': [],
  'GET /expenses/tiers': [],
  'GET /expenses/policies': { policies: [], fields: [], today: '2026-10-12' },
  'GET /expenses/rates': { mileage: [], perDiem: [] },
  'GET /expenses/gst-registrations': [],
  'GET /org/legal-entities': [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd', country: 'IN' }],
};

describe('Settings › Expenses', () => {
  it('a new company copies the YukthiX starters', async () => {
    const posted: string[] = [];
    route({ ...EMPTY, 'POST /expenses/setup/from-starter': (p: string) => (posted.push(p), { categories: 11, tiers: 4, policies: 1, rates: 5 }) });
    wrap(<YxExpenseSetupPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use the starters' }));
    await waitFor(() => expect(posted).toEqual(['/expenses/setup/from-starter']));
  });

  it('the menu shows Expenses under Organisation to whoever keeps expense set-up', async () => {
    route({ 'GET /auth/mfa': { factors: [], required: false, enrolmentDueAt: '2030-01-01T00:00:00Z' }, 'GET /rbac/me/permissions': ['expense.policy.manage'], 'GET /people/employees': [], 'GET /people/team': { managerId: null, members: [] } });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    await waitFor(async () => expect(within(await screen.findByRole('navigation', { name: 'Menu' })).getByRole('link', { name: 'Expenses' })).toHaveAttribute('href', '/yx/settings/expenses'));
  });
});
