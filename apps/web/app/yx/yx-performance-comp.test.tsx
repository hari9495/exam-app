import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxCompSheetPage from './(app)/performance/comp/[id]/page';
import YxMyPayBandPage from './(app)/performance/pay-band/page';
import YxMarketDataPage from './(app)/performance/comp/market/page';

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
  it('a manager change puts the proposal with its version; the manager never sees pay-gap figures', async () => {
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
    await userEvent.click(await screen.findByText('Arjun'));
    const d = screen.getByRole('dialog');
    const merit = within(d).getByRole('textbox', { name: /Merit increase/ });
    await userEvent.clear(merit);
    await userEvent.type(merit, '6');
    await userEvent.click(within(d).getByRole('button', { name: 'Save justification' }));
    await waitFor(() => expect(put).toEqual([{ meritPct: 6, promotionToDesignationId: null, promotionAmount: 0, bonusAmount: 0, justification: null, version: 4 }]));
    expect(screen.getByText(/Pay-gap figures are for HR and finance/)).toBeInTheDocument();
    expect(api.mock.calls.some(([path]) => String(path).includes('pay-equity'))).toBe(false);
  });

  it('my pay band shows where I sit', async () => {
    route({ 'GET /performance/me/pay-band': { visible: true, currency: 'INR', range: { min: 600_000, mid: 800_000, max: 1_000_000 }, position: 'below', quartile: null } });
    wrap(<YxMyPayBandPage />);
    expect(await screen.findByText(/You are below the range/)).toBeInTheDocument();
  });

  it('market data: the latest survey per grade for the chosen company; a refused upload lists the rows to fix (answer 12)', async () => {
    const posted: unknown[] = [];
    route({
      'GET /rbac/me/permissions': ['perf.comp.manage'],
      'GET /org/legal-entities': [{ id: 'le', name: 'Kaveri Foods' }],
      'GET /performance/comp-market': { staleMonths: 12, latest: { version: 1, source: 'Aon 2026', currency: 'INR', asOf: '2026-04-01', stale: false, rows: [{ grade: 'G3', min: 510000, median: 600000, max: 720000 }] }, versions: [{ version: 1, source: 'Aon 2026', currency: 'INR', asOf: '2026-04-01', fileName: 'aon.csv', rows: 1, uploadedBy: 'Lakshmi', uploadedAt: '2026-04-02T09:00:00.000Z' }] },
      'POST /performance/comp-market': (_p: string, init: RequestInit) => {
        posted.push(JSON.parse(String(init.body)));
        throw Object.assign(new Error('1 row needs fixing. Nothing was saved.'), { status: 400, body: { errors: [{ row: 2, message: 'No grade "G9" in this company.' }] } });
      },
    });
    const { container } = wrap(<YxMarketDataPage />);
    expect(await screen.findByText('Current survey · version 1')).toBeInTheDocument();
    expect(screen.getByText(/Version 1 · Aon 2026/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Upload survey' }));
    expect(screen.getByText('Choose the CSV file.')).toBeInTheDocument();
    expect(posted).toEqual([]);
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['grade,min,median,max,currency\nG9,1,2,3,INR\n'], 'bad.csv', { type: 'text/csv' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Source/ }), 'Aon 2027');
    await userEvent.type(screen.getByRole('textbox', { name: /As of/ }), '01/10/2026{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Upload survey' }));
    expect(await screen.findByText('No grade "G9" in this company.')).toBeInTheDocument();
    expect(posted).toEqual([{ legalEntityId: 'le', source: 'Aon 2027', asOf: '2026-10-01', fileName: 'bad.csv', csv: 'grade,min,median,max,currency\nG9,1,2,3,INR\n' }]);
  });
});
