import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxCompSheetPage from './(app)/performance/comp/[id]/page';
import YxMyPayBandPage from './(app)/performance/pay-band/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Comp review and my pay band wired to /performance (M06 batch PM7, PM-7.07).
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
  (usePathname as jest.Mock).mockReturnValue('/yx/performance/comp/c1');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Comp review (M06 batch PM7)', () => {
  it('a manager change puts the proposal with its version', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'c1' });
    const put: unknown[] = [];
    const sheet = {
      cycle: { id: 'c1', name: 'FY27', reviewCycleId: null, legalEntityId: 'le', currency: 'INR', effectiveOn: '2027-04-01', matrixId: 'm', bonus: null, status: 'open', appliedAt: null, version: 2 },
      role: 'manager',
      proposals: [{ id: 'p1', employee: 'Arjun', employeeId: 'e1', departmentId: 'd1', manager: 'Priya', band: 'Meets', currentCtc: 800_000, compaRatio: 1, proration: 1, cell: { band: 'Meets', minPct: 4, targetPct: 5, maxPct: 6 }, meritPct: 5, meritAmount: 40_000, promotionToGradeId: null, promotionToDesignationId: null, promotionAmount: 0, bonusAmount: 0, newCtc: 840_000, outOfRange: false, justification: null, status: 'draft', version: 4 }],
      budgets: [],
      overrun: 'extra_approval',
      can: { edit: true, submit: true, apply: false },
    };
    route({
      'GET /rbac/me/permissions': [],
      'GET /org/masters/departments': [],
      'GET /performance/comp-cycles/c1/sheet': sheet,
      'PUT /performance/comp-proposals/p1': (_p: string, init: RequestInit) => (put.push(JSON.parse(String(init.body))), {}),
    });
    wrap(<YxCompSheetPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Change' }));
    const d = screen.getByRole('dialog');
    const merit = within(d).getByRole('textbox', { name: /Merit increase/ });
    await userEvent.clear(merit);
    await userEvent.type(merit, '6');
    await userEvent.click(within(d).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toEqual([{ meritPct: 6, promotionToDesignationId: null, promotionAmount: 0, bonusAmount: 0, justification: null, version: 4 }]));
  });

  it('my pay band shows where I sit', async () => {
    route({ 'GET /performance/me/pay-band': { visible: true, currency: 'INR', range: { min: 600_000, mid: 800_000, max: 1_000_000 }, position: 'below', quartile: null } });
    wrap(<YxMyPayBandPage />);
    expect(await screen.findByText(/You are below the range/)).toBeInTheDocument();
  });
});
