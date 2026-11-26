import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { useYxPermissions } from '../../lib/yx-org';
import YxPayRunReadinessPage from './(app)/payroll/runs/[id]/readiness/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/yx-org', () => ({ ...jest.requireActual('../../lib/yx-org'), useYxPermissions: jest.fn() }));

// Payroll › a run › readiness (PAY-02 live, Enterprise E5): the designed screen with the run's dates and late inputs.
const wrap = (ui: ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const RUN = { id: 'r1', legalEntityId: 'e1', payGroupId: 'g1', month: '2026-09', runType: 'regular', offcycleKind: null, status: 'draft', publishedAt: null, calcVersion: 0, totals: null, preparedBy: 'u1', approvedAt: null, voidReason: null, createdAt: '2026-09-01T00:00:00Z', reference: null, subPeriod: null, range: null };
const READY = {
  run: RUN,
  people: 2,
  period: 'open',
  groups: [],
  checks: [],
  dates: { payGroup: { id: 'g1', name: 'Head office monthly' }, month: '2026-09', cutOff: '2026-09-20', release: null, changed: null, canChange: true },
  late: [{ id: 'o1', employeeId: 'p1', name: 'Lakshmi Iyer', component: 'Incentive', amount: '5000.00', from: '2026-08', to: '2026-09', direction: 'in' }],
};
let push: jest.Mock;

beforeEach(() => {
  api.mockReset();
  push = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useParams as jest.Mock).mockReturnValue({ id: 'r1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
  (useYxPermissions as jest.Mock).mockReturnValue({ has: () => true });
});

const route = (table: Record<string, unknown>) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const v = table[key];
    return typeof v === 'function' ? v(path, init) : v;
  });

describe('/yx/payroll/runs/[id]/readiness', () => {
  it('shows the dates and late inputs, changes this month’s dates and calculates (positive)', async () => {
    const saved = jest.fn(async (body: unknown) => body);
    route({
      'GET /payroll/runs/r1': RUN,
      'GET /payroll/runs/r1/people': [],
      'GET /payroll/runs/r1/readiness': READY,
      'GET /payroll/runs/r1/input-sources': { runId: 'r1', people: 2, sources: [] },
      'PUT /payroll/pay-groups/g1/periods/2026-09/dates': (_p: string, init: RequestInit) => saved(JSON.parse(String(init.body))),
      'POST /payroll/runs/r1/calculate': {},
    });
    wrap(<YxPayRunReadinessPage />);
    expect(await screen.findByText('Lakshmi Iyer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change dates' }));
    const drawer = await screen.findByRole('dialog', { name: /Dates for September 2026/ });
    await userEvent.type(within(drawer).getByRole('textbox', { name: /Reason/ }), 'Festival week, inputs close early');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Save dates' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith({ cutOffOn: '2026-09-20', releaseOn: null, reason: 'Festival week, inputs close early' }));
  });

  it('without access to the run it says so (negative)', async () => {
    route({ 'GET /payroll/runs/r1': () => Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 })), 'GET /payroll/runs/r1/people': [], 'GET /payroll/runs/r1/readiness': READY, 'GET /payroll/runs/r1/input-sources': { runId: 'r1', people: 0, sources: [] } });
    wrap(<YxPayRunReadinessPage />);
    expect(await screen.findByText(/this payroll run/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change dates' })).not.toBeInTheDocument();
  });
});
