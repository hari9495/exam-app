import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { useYxPermissions } from '../../lib/yx-org';
import YxReportSchedulesPage from './(app)/hiring/schedules/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/yx-org', () => ({ ...jest.requireActual('../../lib/yx-org'), useYxPermissions: jest.fn() }));

// Answer 2428: Hire › Report schedules (ANL-08, live): the weekly hiring digest.
const api = apiFetch as jest.Mock;
const calls: string[] = [];
const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxReportSchedulesPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
const perms = (keys: string[]) => (useYxPermissions as jest.Mock).mockReturnValue(Object.assign(new Set(keys), { isSuccess: true }));

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
    if (path === '/organizations/scheduled-report-settings' && !init?.method) return { enabled: true, recipientUserIds: ['u1'], lastSentAt: '2026-11-16T03:30:00.000Z' };
    if (path === '/users?pageSize=100') return { data: [{ id: 'u1', name: 'Meera Iyer', email: 'm@x.test' }, { id: 'u2', name: null, email: 'ravi@x.test' }] };
    return {};
  });
});

it('shows the digest with its recipients and saves a change of recipients', async () => {
  perms(['org:manage_settings']);
  wrap();
  expect(await screen.findByText('Meera Iyer')).toBeInTheDocument();
  expect(screen.getByText('On')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('switch', { name: /Send the weekly digest/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
  await waitFor(() => expect(calls).toContain('PATCH /organizations/scheduled-report-settings {"enabled":false,"recipientUserIds":["u1"]}'));
});

it('negative: without the settings key it says who gives access and asks for nothing', async () => {
  perms(['results:view']);
  wrap();
  expect(await screen.findByText(/company admin/)).toBeInTheDocument();
  expect(calls).toEqual([]);
});
