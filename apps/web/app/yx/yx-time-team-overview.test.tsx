import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxTeamLeaveHomePage from './(app)/time/team-leave/page';

jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/yx/time/team-leave', useSearchParams: () => new URLSearchParams() }));

// Answer 2759: Team › Leave shows the manager's overview cards from GET /time/team/leave-home, names only.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const home = (cards: unknown) => ({ today: '2026-11-26', waiting: [], otherWaiting: 0, away: [{ employeeId: 'e3', name: 'Ravi Kumar', type: 'Leave', from: '2026-11-24', to: '2026-11-27' }], cards });

beforeEach(() => {
  api.mockReset();
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx/time/team-leave overview cards', () => {
  it('shows unplanned and no-leave counts with names', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/time/team/leave-home') return home({ unplanned: { count: 1, people: [{ employeeId: 'e1', name: 'Arjun Kulkarni', requests: 1 }] }, noLeave: { days: 90, count: 1, people: [{ employeeId: 'e4', name: 'Suresh Pillai' }] } });
      throw new Error(`unexpected ${path}`);
    });
    wrap(<YxTeamLeaveHomePage />);
    expect(await screen.findByText('Unplanned leave this month')).toBeInTheDocument();
    expect(screen.getByText('Arjun Kulkarni')).toBeInTheDocument();
    expect(screen.getByText('No leave in 90 days')).toBeInTheDocument();
    expect(screen.getByText('Suresh Pillai')).toBeInTheDocument();
    // Sick leave reaches the manager only as "Leave".
    expect(screen.getByText(/^Leave ·/)).toBeInTheDocument();
  });

  it('negative: a manager with no team gets no cards', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/time/team/leave-home') return { ...home(null), away: [] };
      throw new Error(`unexpected ${path}`);
    });
    wrap(<YxTeamLeaveHomePage />);
    expect(await screen.findByText('No one in your team is away this week.')).toBeInTheDocument();
    expect(screen.queryByText('Unplanned leave this month')).not.toBeInTheDocument();
  });
});
