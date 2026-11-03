import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
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
import YxTeamClaimsPage from './(app)/expenses/team/page';
import YxExpenseToPayPage from './(app)/expenses/to-pay/page';
import YxCardStatementsPage from './(app)/expenses/cards/page';
import YxCardLinesPage from './(app)/expenses/card-lines/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { name: 'Meena Iyer', email: 'meena@kaverifoods.in' } }) }));

// Settings › Expenses wired to /expenses (M05 batch E1, XP-1.06).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
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
  it('HR with the view key only sees the policy read only (no starters, no edit controls)', async () => {
    route({ ...EMPTY, 'GET /rbac/me/permissions': ['expense.policy.view'], 'GET /expenses/fx-rates': [] });
    wrap(<YxExpenseSetupPage />);
    expect(await screen.findByText('Read only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use the starters' })).toBeNull();
  });

  it('a new company copies the YukthiX starters', async () => {
    const posted: string[] = [];
    route({ ...EMPTY, 'GET /rbac/me/permissions': ['expense.policy.manage'], 'GET /expenses/fx-rates': [], 'POST /expenses/setup/from-starter': (p: string) => (posted.push(p), { categories: 11, tiers: 4, policies: 1, rates: 5 }) });
    wrap(<YxExpenseSetupPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use the starters' }));
    await waitFor(() => expect(posted).toEqual(['/expenses/setup/from-starter']));
  });

});

describe('Expenses claims (EXP-01 … 03, the designed screens with live data)', () => {
  const CLAIM = { id: 'c1', title: 'Mumbai client visit', person: 'Ravi Kumar', currency: 'INR', status: 'draft', paymentStatus: 'not_due', claimedTotal: '0.00', approvedTotal: null, advanceAdjusted: '0.00', netPayable: '0.00', risk: 'none', submittedAt: null, decidedAt: null, version: 1, decisionNote: null, lines: [], changes: [], flags: [], route: null, can: { own: true, edit: true, withdraw: false, decide: false, changeAmounts: false, review: false } };
  const LISTS = { 'GET /rbac/me/permissions': [], 'GET /expenses/trips': { trips: [] }, 'GET /expenses/advances': { advances: [] } };

  it('a new claim is created and opened', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
    const posted: unknown[] = [];
    route({ ...LISTS, 'GET /expenses/me/home': { claims: [], waitingForMe: 0, toReview: null, toReceive: '0.00', team: null, payroll: { cutoffDay: 23, month: '2026-10' } }, 'POST /expenses/claims': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), { id: 'c1' }) });
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
    await userEvent.click(await screen.findByRole('button', { name: 'Submit claim' }));
    await waitFor(() => expect(sent).toEqual([{ version: 1 }]));
  });

  it('a claim that is not mine opens as the review, and approving sends the decision', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'c1' });
    const sent: unknown[] = [];
    route({ 'GET /expenses/claims/c1': { ...CLAIM, status: 'submitted', submittedAt: '2026-10-10T05:00:00Z', can: { own: false, edit: false, withdraw: false, decide: true, changeAmounts: true, review: false } }, 'GET /expenses/categories': [], 'POST /expenses/claims/c1/decide': (_p: string, init: RequestInit) => (sent.push(JSON.parse(String(init.body))), CLAIM) });
    wrap(<YxClaimPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve all' }));
    await waitFor(() => expect(sent).toEqual([{ decision: 'approve' }]));
  });

  it('a person who pays claims sees the finance view with what is to pay', async () => {
    route({
      ...LISTS,
      'GET /rbac/me/permissions': ['expense.payout.manage'],
      'GET /expenses/me/home': { claims: [], waitingForMe: 0, toReview: null, toReceive: '0.00', team: null, payroll: { cutoffDay: 23, month: '2026-10' } },
      'GET /expenses/to-pay': { entities: [], claims: [{ id: 'x', employeeId: 'p', employeeName: 'Priya', legalEntityId: 'e1', title: 'Internet', approvedTotal: '999.00', advanceAdjusted: '0.00', netPayable: '999.00', route: 'payout', paymentStatus: 'approved_unpaid', payMonth: null, ref: null, reason: null, batchId: null, paidOn: null }], batches: [] },
    });
    wrap(<YxExpensesPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Finance' }));
    expect(await screen.findByText('₹999')).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Add claim to this trip' }));
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

});

describe('Team claims (round 2, founder answer 1)', () => {
  const ROW = { id: 'c9', title: 'Pune plant audit', person: 'Sana Nizami', currency: 'INR', status: 'approved', paymentStatus: 'in_payroll', claimedTotal: '8450.00', approvedTotal: '8450.00', advanceAdjusted: '0.00', netPayable: '8450.00', risk: 'none', submittedAt: '2026-10-12T05:00:00Z', decidedAt: null, version: 1, overLimit: 1, canOpen: true };
  it('asks for this month; the over-limit drill and the month switch change the address; Open goes to the claim', async () => {
    const push = jest.fn();
    const replace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, replace });
    (usePathname as jest.Mock).mockReturnValue('/yx/expenses/team');
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('over=1'));
    const seen: string[] = [];
    route({ 'GET /expenses/claims': (p: string) => (seen.push(p), { month: p.slice(-7), people: 3, claims: [ROW] }) });
    wrap(<YxTeamClaimsPage />);
    expect(await screen.findByText('Pune plant audit')).toBeInTheDocument();
    expect(seen[0]).toMatch(/^\/expenses\/claims\?view=team&month=\d{4}-\d{2}$/);
    expect(screen.getByRole('radio', { name: /With over-limit lines/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /All claims/ }));
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/yx\/expenses\/team\?month=\d{4}-\d{2}$/), { scroll: false });
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(push).toHaveBeenCalledWith('/yx/expenses/claims/c9');
  });
  it('someone with no one reporting to them gets the no-access state (403)', async () => {
    route({ 'GET /expenses/claims': () => Promise.reject(Object.assign(new Error('Team claims are for managers.'), { status: 403 })) });
    wrap(<YxTeamClaimsPage />);
    expect(await screen.findByText("You don't have access to team claims")).toBeInTheDocument();
  });
});
describe('To pay (EXP-06, the designed screen with live data)', () => {
  it('shows the cut-off from the API and sends chosen claims to the payroll month', async () => {
    const posted: unknown[] = [];
    route({
      'GET /expenses/to-pay': { payroll: { cutoffDay: 23, month: '2026-10' }, entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' }], claims: [{ id: 'c1', employeeId: 'p1', employeeName: 'Arjun Kulkarni', legalEntityId: 'e1', title: 'Client visit', approvedTotal: '1114.00', advanceAdjusted: '0.00', netPayable: '1114.00', route: 'payout', paymentStatus: 'approved_unpaid', payMonth: null, ref: null, reason: null, batchId: null, paidOn: null }], batches: [] },
      'GET /expenses/journal': { month: '2026-10', lines: [], unmapped: [], balanced: true, exports: [] },
      'POST /expenses/to-pay/payroll': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), { moved: 1, refused: [] }),
    });
    wrap(<YxExpenseToPayPage />);
    expect(await screen.findByText('October payroll cut-off 23 Oct 2026')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('row', { name: /Arjun Kulkarni/ })).getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Add 1 to October payroll' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to payroll' }));
    await waitFor(() => expect(posted).toEqual([{ claimIds: ['c1'] }]));
  });

  it('a person without the pay key sees no access, not "check your connection"', async () => {
    api.mockImplementation(async () => {
      throw Object.assign(new Error('You cannot pay expense claims.'), { status: 403 });
    });
    wrap(<YxExpenseToPayPage />);
    expect(await screen.findByText(/You don't have access to claims to pay/)).toBeInTheDocument();
  });
});


describe('Card statements (EXP-08, the designed screen with live data)', () => {
  const LINE = { id: 'l1', rowNo: 4, txnOn: '2026-09-14', description: 'SKYINDIA AIRLINES BOM', merchant: null, amount: '6840.00', direction: 'debit', currency: 'INR', cardLast4: '1234', holders: [{ id: 'e1', name: 'Vikram Rao' }], status: 'open', matchGone: false, matchedTo: null, suggestion: { lineId: 'x1', claimId: 'k1', text: 'Mumbai visit · line 1', amount: '6840.00', spentOn: '2026-09-14' }, chasedOn: null, own: false, version: 3 };
  const UNLINKED = { ...LINE, id: 'l2', description: 'CLOUDSOFT SUBSCRIPTION', cardLast4: '9999', holders: [], suggestion: null, version: 1 };
  const HEAD = { id: 's1', bankName: 'Kaveri Bank', revision: 1, periodFrom: '2026-09-01', periodTo: '2026-09-30', fileName: 'kf.csv', rowCount: 2, debitTotal: '10839.00', creditTotal: '0.00', fullNumbersDropped: 1, status: 'open', note: null, version: 2, importedAt: '2026-10-02T05:00:00.000Z' };
  const LIST = { statements: [{ ...HEAD, open: 2, toChase: 0 }], banks: [{ bankName: 'Kaveri Bank', mapping: { date: 'Txn Date', dateFormat: 'DD/MM/YYYY', description: 'Description', amountMode: 'signed', amount: 'Amount', card: 'Card No' }, version: 1 }], rules: { within: '1', days: 3, recoveryInstalments: 3 } };

  it('opens a statement: says full card numbers were cut, accepts a suggested match with the line version', async () => {
    const posted: unknown[] = [];
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('id=s1'));
    route({
      'GET /expenses/card-statements': LIST,
      'GET /expenses/card-statements/s1': { statement: HEAD, rules: LIST.rules, lines: [LINE, UNLINKED], candidates: [] },
      'POST /expenses/card-statements/s1/lines/l1/match': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), { ok: true }),
    });
    wrap(<YxCardStatementsPage />);
    expect(await screen.findByText('Card statement · September 2026')).toBeInTheDocument();
    expect(screen.getByText(/This file had 1 full card number/)).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /CLOUDSOFT/ })).getByRole('button', { name: 'Link card' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('row', { name: /SKYINDIA/ })).getByRole('button', { name: 'Accept match' }));
    await waitFor(() => expect(posted).toEqual([{ claimLineId: 'x1', version: 3 }]));
  });

  it('linking a card: pressed without an employee, it says so and sends nothing', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('id=s1'));
    route({ 'GET /expenses/card-statements': LIST, 'GET /expenses/card-statements/s1': { statement: HEAD, rules: LIST.rules, lines: [UNLINKED], candidates: [] } });
    wrap(<YxCardStatementsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Link card' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Link card' }));
    expect(await screen.findByText('Choose the employee who holds this card.')).toBeInTheDocument();
    expect(api.mock.calls.some(([p]) => String(p).startsWith('/expenses/cards'))).toBe(false);
  });

  it('a new import: Continue without a file says what is missing', async () => {
    route({ 'GET /expenses/card-statements': { ...LIST, statements: [] } });
    wrap(<YxCardStatementsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Upload the statement file (CSV or Excel).')).toBeInTheDocument();
  });

  it('someone without the pay key sees the no-access state (403)', async () => {
    api.mockImplementation(async () => {
      throw Object.assign(new Error('Card statements need expense.payout.manage for the whole company.'), { status: 403 });
    });
    wrap(<YxCardStatementsPage />);
    expect(await screen.findByText(/You don't have access to card statements/)).toBeInTheDocument();
  });

  it('the employee explains a line as personal spend', async () => {
    const posted: unknown[] = [];
    route({
      'GET /expenses/card-lines/mine': { lines: [{ id: 'm1', txnOn: '2026-09-21', description: 'BOOKNOOK MG ROAD', merchant: null, amount: '1450.00', currency: 'INR', cardLast4: '1234', bankName: 'Kaveri Bank', periodFrom: '2026-09-01', periodTo: '2026-09-30', suggestion: null, version: 2 }], recoveryInstalments: 3 },
      'POST /expenses/card-lines/m1/explain': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), { choice: 'personal' }),
    });
    wrap(<YxCardLinesPage />);
    await userEvent.click(await screen.findByRole('radio', { name: /Personal spend/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm personal spend' }));
    await waitFor(() => expect(posted).toEqual([{ choice: 'personal', version: 2 }]));
  });
});
