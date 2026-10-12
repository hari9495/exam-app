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
import YxTripsPage from './(app)/expenses/trips/page';
import YxTripPage from './(app)/expenses/trips/[id]/page';
import YxAdvancePage from './(app)/expenses/advances/[id]/page';
import YxExpenseReportsPage from './(app)/expenses/reports/page';

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

describe('Trips and advances (M05 batch E4)', () => {
  const TRIP = { id: 't1', purpose: 'Pune distributor meetings', person: 'Ravi Kumar', fromOn: '2026-10-05', toOn: '2026-10-09', currency: 'INR', estimate: '20000.00', advanceRequested: '10000.00', bookingNeeded: false, status: 'approved', version: 4, decisionNote: null, legs: [], bookings: [], budget: { estimate: '20000.00', companyPaid: '0.00', claimed: '0.00', used: '0.00', left: '20000.00' }, claims: [], advance: null, route: null, can: { edit: false, submit: false, cancel: false, book: true, partner: false, decide: 'task1', claim: true } };

  it('the trips list loads mine and those waiting for me; the travel desk list only for the desk', async () => {
    route({ 'GET /rbac/me/permissions': [], 'GET /expenses/trips': (p: string) => ({ trips: p.includes('approvals') ? [] : [TRIP] }) });
    wrap(<YxTripsPage />);
    expect(await screen.findByText('Pune distributor meetings')).toBeInTheDocument();
    expect(api.mock.calls.map((c) => c[0])).not.toContain('/expenses/trips?view=desk');
  });

  it('a trip page approves through the approvals engine and starts a claim on the trip', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
    (useParams as jest.Mock).mockReturnValue({ id: 't1' });
    const posted: [string, unknown][] = [];
    route({
      'GET /expenses/trips/t1': TRIP,
      'POST /workflow/approvals/tasks/task1/decide': (p: string, init: RequestInit) => (posted.push([p, JSON.parse(String(init.body))]), {}),
      'POST /expenses/claims': (p: string, init: RequestInit) => (posted.push([p, JSON.parse(String(init.body))]), { id: 'c9' }),
    });
    wrap(<YxTripPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a claim to this trip' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/yx/expenses/claims/c9'));
    expect(posted).toEqual([
      ['/workflow/approvals/tasks/task1/decide', { decision: 'approve' }],
      ['/expenses/claims', { title: 'Pune distributor meetings', tripId: 't1' }],
    ]);
  });

  it('finance records a payment with the advance version', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'a1' });
    const posted: unknown[] = [];
    route({
      'GET /expenses/advances/a1': { id: 'a1', kind: 'imprest', tripId: null, purpose: 'Site petty cash', currency: 'INR', requested: '4000.00', amount: '4000.00', changeReason: null, status: 'approved', paidOn: null, settleBy: null, balance: '0.00', overdue: false, version: 2, person: 'Ravi Kumar', ledger: [], can: { changeAmount: false, decide: null, pay: true, recordReturn: false, claim: false } },
      'POST /expenses/advances/a1/pay': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), {}),
    });
    wrap(<YxAdvancePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Bank reference/ }), 'NEFT-2');
    await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(posted).toEqual([expect.objectContaining({ ref: 'NEFT-2', version: 2 })]));
  });
});

describe('Expense reports (M05 batch E5)', () => {
  it('loads the spend report for this month and switches to the GST input report', async () => {
    const seen: string[] = [];
    route({ 'GET /expenses/reports/summary': (p: string) => (seen.push(p), { kind: 'summary', from: '2026-10-01', to: '2026-10-12', columns: [{ key: 'category', label: 'Category' }], rows: [{ category: 'Hotel and lodging' }] }), 'GET /expenses/reports/gst-input': (p: string) => (seen.push(p), { kind: 'gst-input', from: '2026-10-01', to: '2026-10-12', columns: [{ key: 'gstin', label: 'GSTIN of supplier' }], rows: [{ gstin: '27BBBBB2222B1Z5' }] }) });
    wrap(<YxExpenseReportsPage />);
    expect(await screen.findByText('Hotel and lodging')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'GST input' }));
    expect(await screen.findByText('27BBBBB2222B1Z5')).toBeInTheDocument();
    expect(seen[0]).toMatch(/^\/expenses\/reports\/summary\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/);
  });

  it('the menu shows Expense reports to whoever may read them', async () => {
    route({ 'GET /auth/mfa': { factors: [], required: false, enrolmentDueAt: '2030-01-01T00:00:00Z' }, 'GET /rbac/me/permissions': ['expense.report.view'], 'GET /people/employees': [], 'GET /people/team': { managerId: null, members: [] } });
    wrap(<YxAppLayout><p>page</p></YxAppLayout>);
    await waitFor(async () => expect(within(await screen.findByRole('navigation', { name: 'Menu' })).getByRole('link', { name: 'Expense reports' })).toHaveAttribute('href', '/yx/expenses/reports'));
  });
});
