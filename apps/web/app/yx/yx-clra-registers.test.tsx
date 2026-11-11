import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch, apiFetchBlob } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxClraRegistersPage from './(app)/contract-labour/registers/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ API_BASE: 'http://api', apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// CL-6 (CLB-04, answers 629, 630): the registers page on the contract labour and payroll registers APIs.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const calls: [string, string][] = [];
const REGS = { month: '2026-10', canMake: true, establishments: [{ id: 'hsr', name: 'Hosur plant' }], registers: [{ id: 'r1', type: 'clra_wages', locationId: 'hsr', location: 'Hosur plant', formatVersion: 'osh-2025-v1', version: 1, status: 'generated', rows: 3 }], waiting: [], chart: { months: ['2026-10'], series: [{ name: 'Hosur plant', values: [3] }] } };
const RETURNS = { year: 2025, canFile: true, daysNote: 'Days from the wage registers', returns: [] };

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (apiFetchBlob as jest.Mock).mockResolvedValue({ blob: new Blob(['%PDF']), filename: 'r.pdf' });
  Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:x'), revokeObjectURL: jest.fn() });
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') return void calls.push([init!.method!, path]);
    if (path.startsWith('/contract-labour/registers?month=')) return REGS;
    if (path.startsWith('/contract-labour/returns?year=')) return RETURNS;
    if (path.startsWith('/rbac/me/permissions')) return ['clra.contractor.manage', 'statutory.register.sign'];
    throw Object.assign(new Error(`unexpected ${path}`), { status: 404 });
  });
});

describe('Contract labour registers page (live)', () => {
  it('Freeze goes to the payroll registers route; PDF downloads from contract labour', async () => {
    wrap(<YxClraRegistersPage />);
    await ue.click(await screen.findByRole('button', { name: 'Freeze' }));
    await waitFor(() => expect(calls).toEqual([['POST', '/statutory/registers/r1/freeze']]));
    await ue.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(apiFetchBlob).toHaveBeenCalledWith('/contract-labour/registers/r1/file', {}, 't'));
  });

  it('without the contract labour key the page says no access', async () => {
    api.mockImplementation(async () => {
      throw Object.assign(new Error('forbidden'), { status: 403 });
    });
    wrap(<YxClraRegistersPage />);
    expect(await screen.findByText(/Ask your HR team/)).toBeInTheDocument();
  });
});
