import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxAppLayout from './(app)/layout';
import YxExpenseSetupPage from './(app)/settings/expenses/page';
import YxExpensesPage from './(app)/expenses/page';
import YxClaimPage from './(app)/expenses/claims/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
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

describe('Expenses claims (M05 batch E2)', () => {
  const CLAIM = { id: 'c1', title: 'Mumbai client visit', person: 'Ravi Kumar', currency: 'INR', status: 'draft', paymentStatus: 'not_due', claimedTotal: '0.00', approvedTotal: null, advanceAdjusted: '0.00', netPayable: '0.00', risk: 'none', submittedAt: null, decidedAt: null, version: 1, decisionNote: null, lines: [], changes: [], flags: [], route: null, can: { edit: true, withdraw: false, decide: false, changeAmounts: false, review: false } };

  it('a new claim is created and opened', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
    const posted: unknown[] = [];
    route({ 'GET /expenses/me/home': { claims: [], waitingForMe: 0, toReview: null, toReceive: '0.00' }, 'POST /expenses/claims': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), { id: 'c1' }) });
    wrap(<YxExpensesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New claim' }));
    await userEvent.type(screen.getByRole('textbox', { name: /What is it for/ }), 'Mumbai client visit');
    await userEvent.click(screen.getByRole('button', { name: 'Start claim' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/yx/expenses/claims/c1'));
    expect(posted).toEqual([{ title: 'Mumbai client visit' }]);
  });

  it('a claim page loads the claim and its categories, and sends it with its version', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'c1' });
    const sent: unknown[] = [];
    route({ 'GET /expenses/claims/c1': { ...CLAIM, lines: [{ id: 'l1', lineNo: 1, categoryCode: 'meals', spentOn: '2026-10-09', merchant: 'Cafe', city: 'Mumbai', country: 'IN', tierId: null, payMode: 'personal', description: null, hasReceipt: false, selfDeclared: true, claimed: '300.00', approved: null, reduceReason: null, justification: null, policy: null, flags: [], mileage: null, perDiem: null, ocr: null, gst: null, version: 1 }] }, 'GET /expenses/categories': [{ id: 'k1', code: 'meals', name: 'Meals', kind: 'spend', receiptAbove: '500', gstEligible: false, itcBlockedReason: null, taxable: 'never', ledgerCode: null, active: true, version: 1 }], 'POST /expenses/claims/c1/submit': (_p: string, init: RequestInit) => (sent.push(JSON.parse(String(init.body))), CLAIM) });
    wrap(<YxClaimPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(sent).toEqual([{ version: 1 }]));
  });
});
