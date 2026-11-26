import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxMyLeavePage from './(app)/time/leave/page';

jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => '/yx/time/leave', useSearchParams: () => new URLSearchParams() }));

// Answer 2760: Me › Leave reads GET /time/me/peers-away and shows "away" only.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const LEAVE = { employee: { id: 'e1', name: 'Divya R', code: null }, today: '2026-11-26', year: { start: '2026-01-01', end: '2026-12-31' }, balances: [], requests: [], holidays: { calendar: null, optionalLimit: 0, list: [] }, types: [] };

beforeEach(() => {
  api.mockReset();
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx/time/leave peers away', () => {
  it('lists peers away by day', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/time/me/leave') return LEAVE;
      if (path === '/time/me/peers-away') return { from: '2026-11-26', to: '2026-12-09', peers: 2, days: [{ on: '2026-11-27', names: ['Ravi Kumar'] }] };
      throw Object.assign(new Error('not here'), { status: 404 });
    });
    wrap(<YxMyLeavePage />);
    const list = await screen.findByRole('list', { name: 'Peers away' });
    expect(within(list).getByText('Ravi Kumar · away')).toBeInTheDocument();
  });

  it('negative: when the peers call fails, the page still shows and no card appears', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/time/me/leave') return LEAVE;
      throw Object.assign(new Error('not here'), { status: 404 });
    });
    wrap(<YxMyLeavePage />);
    expect(await screen.findByText('Upcoming holidays')).toBeInTheDocument();
    expect(screen.queryByText('Peers away')).not.toBeInTheDocument();
  });
});
