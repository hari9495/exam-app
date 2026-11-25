import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxPositionsPage from './(app)/people/positions/page';
import YxPositionsSwitchOnPage from './(app)/people/positions/switch-on/page';
import YxPositionPage from './(app)/people/positions/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
// The seat page unwraps its route params with React 19 `use`; the tests run React 18, so hand it the id.
jest.mock('react', () => ({ ...jest.requireActual('react'), use: () => ({ id: 's-1' }) }));

// People › Positions (Enterprise E1, POS-01 and POS-03) wired to org/positions.
const wrap = (ui: ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}
const masters = { 'GET /org/legal-entities': [{ id: 'le-1', name: 'Kaveri Foods Pvt Ltd' }], 'GET /org/locations': [], 'GET /org/masters/departments': [], 'GET /org/masters/designations': [], 'GET /org/masters/employment-types': [], 'GET /org/masters/grades': [], 'GET /org/masters/cost-centres': [], 'GET /people/employees': [] };
const named = (id: string, name: string) => ({ id, name });
const ROW = { id: 's-1', code: 'POS-00001', title: 'Cashier', status: 'active', legalEntity: named('le-1', 'Kaveri Foods Pvt Ltd'), department: named('d-1', 'Stores'), location: named('l-1', 'Bengaluru'), designation: named('ds-1', 'Cashier'), grades: [], fte: 1, headcount: 3, filled: 2, vacant: 1, supervisor: null, costCentre: null, pendingChange: false };
const LIST = { asOf: '2026-11-25', enabled: true, canManage: true, totals: { seats: 1, headcount: 3, filled: 2, vacant: 1 }, rows: [ROW] };
let push: jest.Mock;

beforeEach(() => {
  api.mockReset();
  push = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx/people/positions', () => {
  it('lists the seats with filled and vacant and opens one (positive)', async () => {
    route({ 'GET /org/positions': LIST, ...masters });
    wrap(<YxPositionsPage />);
    const table = await screen.findByRole('table', { name: 'Positions' });
    expect(within(table).getByText('Cashier')).toBeInTheDocument();
    expect(screen.getByText('1 seats · 3 headcount · 2 filled · 1 vacant')).toBeInTheDocument();
    await userEvent.click(within(table).getByText('POS-00001'));
    expect(push).toHaveBeenCalledWith('/yx/people/positions/s-1');
  });

  it('without the keys it says so, and asks for no masters (negative)', async () => {
    route({ 'GET /org/positions': () => Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 })) });
    wrap(<YxPositionsPage />);
    expect(await screen.findByText(/positions/i, { selector: 'h2, h3, p' })).toBeInTheDocument();
    expect(api.mock.calls.map((c) => c[0])).toEqual(['/org/positions']);
  });
});

describe('/yx/people/positions/switch-on', () => {
  const PLAN = { enabled: false, date: '2026-11-25', people: 3, seats: [{ key: 'a', title: 'Cashier', department: 'Stores', location: 'Bengaluru', headcount: 3, people: ['Ravi', 'Meera', 'Asha'], supervisorKey: null }], plan: null, result: null, canSend: true, canApprove: true };
  it('sends the plan with the reason (positive)', async () => {
    const sent = jest.fn().mockResolvedValue({ batchId: 'b-1' });
    route({ 'GET /org/positions/switch-on': PLAN, 'POST /org/positions/switch-on': (_p: string, init: RequestInit) => sent(JSON.parse(String(init.body))) });
    wrap(<YxPositionsSwitchOnPage />);
    await userEvent.type(await screen.findByRole('textbox', { name: /Reason/ }), 'We plan by seats from this year on');
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(sent).toHaveBeenCalledWith({ reason: 'We plan by seats from this year on' }));
  });
  it('the sender of a waiting plan can only withdraw it, never approve (negative)', async () => {
    route({ 'GET /org/positions/switch-on': { ...PLAN, plan: { batchId: 'b-1', effectiveOn: '2026-11-25', reason: 'We plan by seats', mine: true, sentAt: '2026-11-25T09:00:00Z' } } });
    wrap(<YxPositionsSwitchOnPage />);
    expect(await screen.findByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve and switch on' })).not.toBeInTheDocument();
  });
});

describe('/yx/people/positions/[id] (answer 2683)', () => {
  const RECORD = {
    id: 's-1', code: 'POS-00001', legalEntity: named('le-1', 'Kaveri Foods Pvt Ltd'), asOf: '2026-11-25',
    current: { validFrom: '2026-11-01', status: 'active', title: 'Cashier', department: named('d-1', 'Stores'), location: named('l-1', 'Bengaluru'), designation: named('ds-1', 'Cashier'), grades: [], fte: 1, headcount: 3, costCentre: null, values: { title: 'Cashier', departmentId: 'd-1', locationId: 'l-1', designationId: 'ds-1', gradeIds: [], defaultGradeId: null, headcount: 3, fte: 1, supervisorPositionId: null, costCentreId: null, entrySalary: null } },
    supervisor: null, reports: [], filled: 2, vacant: 1, incumbents: [], history: [], requisitions: [], changes: [], canManage: false,
    unseated: [{ employeeId: 'e-9', name: 'Priya Shah', code: 'KF-0009' }],
  };
  const open = () => wrap(<YxPositionPage params={Promise.resolve({ id: 's-1' })} />);

  it('Give a seat sends a dated job correction with this seat for approval (positive)', async () => {
    const sent = jest.fn(async (_body: unknown) => ({ id: 'ch-1' }));
    route({ 'GET /org/positions/s-1': RECORD, 'POST /people/changes': (_p: string, init: RequestInit) => sent(JSON.parse(String(init.body))) });
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Give a seat' }));
    const drawer = await screen.findByRole('dialog', { name: /Give POS-00001 to someone/ });
    await userEvent.click(within(drawer).getByRole('combobox', { name: /Person without a seat/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Priya Shah · KF-0009' }));
    await userEvent.type(within(drawer).getByRole('textbox', { name: /Reason/ }), 'Left out at the switch-on');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(sent).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e-9', changeType: 'correction', payload: { assignment: { positionId: 's-1' } }, reason: 'Left out at the switch-on' })));
  });

  it('without the job-change key there is no Give a seat (negative)', async () => {
    const { unseated: _u, ...rest } = RECORD;
    route({ 'GET /org/positions/s-1': rest });
    open();
    expect(await screen.findByText('POS-00001 · Cashier')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Give a seat' })).not.toBeInTheDocument();
  });
});
