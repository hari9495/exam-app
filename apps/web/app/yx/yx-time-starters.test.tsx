import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxTimeSetupPage from './(app)/time/setup/page';

jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/yx/time/setup', useSearchParams: () => new URLSearchParams() }));

// Answer 2754: Time › Set-up with no leave types offers the starter gallery; Add posts the starter's key and toasts.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const setup = (added: boolean) => ({
  today: '2026-11-26', types: [], policies: [], calendars: [], locations: [], entities: [], statutory: [],
  starters: [{ key: 'casual', code: 'CL', name: 'Casual leave', kind: 'casual', summary: '12 days a year', added }],
});

beforeEach(() => {
  api.mockReset();
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx/time/setup starter leave types', () => {
  it('adds a starter in one click and toasts', async () => {
    const posted: string[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/time/setup') return setup(posted.length > 0);
      if (path === '/time/setup/block-dates') return { blocks: [] };
      if (init?.method === 'POST') { posted.push(path); return { id: 'lt-cl', code: 'CL' }; }
      throw new Error(`unexpected ${path}`);
    });
    wrap(<YxTimeSetupPage />);
    await ue.click(await screen.findByRole('button', { name: 'Choose starter leave types' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(posted).toEqual(['/time/setup/types/starter/casual']));
    expect((await screen.findAllByText('Casual leave added')).length).toBeGreaterThan(0);
  });

  it('negative: a refusal is shown and nothing is toasted as added', async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/time/setup') return setup(false);
      if (path === '/time/setup/block-dates') return { blocks: [] };
      if (init?.method === 'POST') throw Object.assign(new Error('Casual leave (CL) is already there.'), { status: 409 });
      throw new Error(`unexpected ${path}`);
    });
    wrap(<YxTimeSetupPage />);
    await ue.click(await screen.findByRole('button', { name: 'Choose starter leave types' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Add' }));
    expect((await screen.findAllByText('Casual leave (CL) is already there.')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Casual leave added')).not.toBeInTheDocument();
  });
});
