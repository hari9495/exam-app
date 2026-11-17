import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxAccommodationsPage from './(app)/hiring/assessments/accommodations/page';
import YxConnectivityPage from './(app)/hiring/assessments/connectivity/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Assessments AS-4b (answer 2011): the accommodation queue (PRC-11) and connectivity above the cap (PRC-10).
const api = apiFetch as jest.Mock;
const calls: string[] = [];
const REQ = { id: 'r1', candidateName: 'Deepa Pillai', test: 'Java L2', kinds: ['time', 'reader'], extraTimePercent: 25, note: 'Low vision', evidenceName: 'letter.pdf', status: 'pending', approvedKinds: [], grantedExtraTimePercent: null, message: null, createdAt: '2026-11-14T06:30:00.000Z', decidedAt: null, decidedBy: null, started: false };
const GAP = { id: 'c1', attemptId: 'a1', candidateName: 'Ananya Rao', test: 'Campus aptitude', lostMs: 535_000, creditedMs: 600_000, capMinutes: 10, status: 'pending', attemptStatus: 'in_progress', startedAt: '2026-11-16T04:32:00.000Z', reason: null, decidedBy: null, decidedAt: null, updatedAt: '2026-11-16T05:00:00.000Z' };

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
    if (path === '/asmt/accommodations?status=pending') return [REQ];
    if (path === '/asmt/accommodations?status=decided') return [];
    if (path === '/asmt/accommodations/r1/evidence') return { url: 'https://blob/letter.pdf', name: 'letter.pdf' };
    if (path === '/asmt/connectivity?status=pending') return [GAP];
    return {};
  });
});

it('the queue decides a request item by item and opens the evidence', async () => {
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);
  wrap(<YxAccommodationsPage />);
  await screen.findByText('Deepa Pillai');
  await userEvent.click(within(screen.getByRole('table', { name: 'Accommodation requests' })).getByText('Deepa Pillai'));
  await userEvent.click(screen.getByRole('button', { name: 'View' }));
  expect(open).toHaveBeenCalledWith('https://blob/letter.pdf', '_blank', 'noopener');
  await userEvent.click(screen.getByRole('checkbox', { name: /25 % extra time/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Approve 1 of 2' }));
  expect(calls).toContain('POST /asmt/accommodations/r1/decide {"approvedKinds":["reader"],"extraTimePercent":null,"extraBreaks":null,"breakMinutes":null,"message":null}');
  open.mockRestore();
});

it('negative: the connectivity page sends nothing without a reason; with one it approves', async () => {
  wrap(<YxConnectivityPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Approve extra time' }));
  expect(calls.filter((c) => c.startsWith('POST'))).toEqual([]);
  await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'Area-wide outage confirmed');
  await userEvent.click(screen.getByRole('button', { name: 'Approve extra time' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve extra time' }));
  expect(calls).toContain('POST /asmt/connectivity/c1/approve {"reason":"Area-wide outage confirmed"}');
});
