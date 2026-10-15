import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxCalibrationBoardPage from './(app)/performance/calibrations/[id]/page';
import YxPerformanceReportsPage from './(app)/performance/reports/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Calibration and reports wired to /performance (M06 batch PM6, PM-6.04).
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
  (usePathname as jest.Mock).mockReturnValue('/yx/performance/calibrations/s1');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Calibration and reports (M06 batch PM6)', () => {
  it('a move on the board posts the band and the reason', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 's1' });
    const posted: unknown[] = [];
    const board = { id: 's1', name: 'Sales', cycle: 'H1', status: 'open', guide: null, scale: { min: 1, max: 5, bands: [{ fromScore: 1, toScore: 2.49, label: 'Below' }, { fromScore: 2.5, toScore: 5, label: 'Meets' }] }, rows: [{ reviewId: 'r1', employee: 'Arjun', manager: 'Priya', managerScore: 4, score: 4, band: 'Meets', moved: false, selfIndication: null, skipAgreed: false, protectedLeave: false }], distribution: { bands: null, counted: 1, notes: [] }, changes: [], can: { change: true, signOff: true } };
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/calibrations/s1': board,
      'POST /performance/calibrations/s1/changes': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), board),
    });
    wrap(<YxCalibrationBoardPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Move' }));
    const d = screen.getByRole('dialog');
    await userEvent.click(within(d).getByRole('combobox', { name: 'Band' }));
    await userEvent.click(screen.getByRole('option', { name: 'Below' }));
    await userEvent.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Compared with peers');
    await userEvent.click(within(d).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(posted).toEqual([{ reviewId: 'r1', toBand: 'Below', reason: 'Compared with peers' }]));
  });

  it('reports load for the first cycle and show hidden cells', async () => {
    const seen: string[] = [];
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/report-cycles': [{ value: 'c1', label: 'H1' }],
      'GET /performance/reports/completion': (p: string) => (seen.push(p), { kind: 'completion', cycle: 'H1', header: ['department', 'total'], rows: [['Sales', 5]], total: 5 }),
    });
    wrap(<YxPerformanceReportsPage />);
    expect(await screen.findByText('Sales')).toBeInTheDocument();
    expect(seen[0]).toBe('/performance/reports/completion?cycle=c1');
  });
});
