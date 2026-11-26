import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import ConsoleSystemLogsPage from './(console)/system-logs/page';
import ConsoleUsersPage from './(console)/users/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(() => ({ push: jest.fn() })), usePathname: jest.fn(), useParams: jest.fn(), useSearchParams: jest.fn(() => new URLSearchParams('')) }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), STAFF_SIGN_IN: '/staff/sign-in' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Retire /v2 (answers 2421, 2431): system logs and Find a user in the staff console, wired to /platform/*.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  api.mockReset();
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('/staff/system-logs', () => {
  it('loads the logs and asks again with the chosen level', async () => {
    api.mockResolvedValue({ data: [{ id: 'l1', at: '2026-11-18T09:42:10Z', service: 'api', severity: 'error', message: 'Payslip PDF render timed out', context: null, company: 'Kaveri Foods', companyId: 'c1' }], nextCursor: null });
    wrap(<ConsoleSystemLogsPage />);
    expect(await screen.findByText('Payslip PDF render timed out')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Errors' }));
    await waitFor(() => expect(api.mock.calls.map((c) => c[0])).toContain('/platform/system-logs?&severity=error'));
  });

  it('says who grants the page when the key is missing', async () => {
    api.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    wrap(<ConsoleSystemLogsPage />);
    expect(await screen.findByText(/a YukthiX console owner/)).toBeInTheDocument();
  });
});

describe('/staff/users', () => {
  it('asks nothing before a search, then searches the text and lists the users', async () => {
    api.mockResolvedValue({ data: [{ id: 'u1', email: 'priya@kaveri.test', name: 'Priya Sharma', role: 'org_admin', status: 'active', lastSignIn: null, company: 'Kaveri Foods', companyId: 'c1' }], more: false });
    wrap(<ConsoleUsersPage />);
    expect(api).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: 'Email or name' }), 'priya@kav');
    await ue.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Priya Sharma')).toBeInTheDocument();
    expect(api.mock.calls[0][0]).toBe('/platform/users?q=priya%40kav');
  });
});
