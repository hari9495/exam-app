import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import { TourHost, autoTour, onPage, useToursPanel } from './yx-tours';

jest.mock('./api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('./auth-context', () => ({ useAuth: jest.fn() }));

// Help H-5 (answer 944): a tour floats once on its page, saves progress per person, and Help › Tours replays it.
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const data = (o: Record<string, unknown> = {}) => ({ show: true, stopped: false, tours: [{ id: 'employee', version: 1, page: '/yx/home', status: null, step: 0 }, { id: 'manager', version: 1, page: '/yx/approvals', status: 'completed', step: 2 }], ...o });
function Replay() {
  const live = useToursPanel();
  return live ? <button onClick={() => live.onStart('manager', 0)}>Replay manager</button> : <p>No tours</p>;
}
const mount = (pathname: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <button>Page</button>
      <TourHost pathname={pathname}>
        <Replay />
      </TourHost>
    </QueryClientProvider>,
  );

beforeEach(() => {
  api.mockReset();
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('tours (944)', () => {
  it('which tour starts by itself where', () => {
    expect(onPage('/yx/home', '/yx/home')).toBe(true);
    expect(onPage('/yx/home', '/yx/home/x')).toBe(false);
    expect(onPage('/yx/payroll/runs', '/yx/payroll/runs/r1')).toBe(true);
    expect(onPage('/yx/payroll/runs', '/yx/payroll/runsheet')).toBe(false);
    expect(autoTour(data() as never, '/yx/home')?.id).toBe('employee');
    expect(autoTour(data() as never, '/yx/approvals')).toBeNull(); // the manager tour is done
    expect(autoTour(data({ stopped: true }) as never, '/yx/home')).toBeNull();
    // Answer 1001: the admin tour (version 2) starts on the set-up hub, not on Home.
    const admin = data({ tours: [{ id: 'admin', version: 2, page: '/yx/settings/setup-hub', status: null, step: 0 }] }) as never;
    expect(autoTour(admin, '/yx/settings/setup-hub')?.id).toBe('admin');
    expect(autoTour(admin, '/yx/home')).toBeNull();
    expect(autoTour(data({ show: false }) as never, '/yx/home')).toBeNull();
  });

  it('starts on its page with focus in it; Esc saves it as skipped and gives focus back', async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => (init?.method === 'PUT' ? data({ tours: [{ ...data().tours[0], status: 'skipped' }, data().tours[1]] }) : data()));
    mount('/yx/home');
    const heading = await screen.findByRole('heading', { name: 'Clock in from Home' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await ue.keyboard('{Escape}');
    await waitFor(() => expect(api).toHaveBeenCalledWith('/help/tours/employee', { method: 'PUT', body: JSON.stringify({ version: 1, status: 'skipped', step: 0 }) }, 'tok'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('Next saves the step reached; nothing starts on another page', async () => {
    api.mockImplementation(async (_p: string, init?: RequestInit) => (init?.method === 'PUT' ? data() : data()));
    const r = mount('/yx/home');
    await ue.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/help/tours/employee', { method: 'PUT', body: JSON.stringify({ version: 1, status: 'in_progress', step: 1 }) }, 'tok'));
    r.unmount();
    mount('/yx/time/leave');
    await screen.findByRole('button', { name: 'Replay manager' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('replay from Help starts any tour, even one done; the company setting off shows nothing', async () => {
    api.mockResolvedValue(data({ stopped: true }));
    const r = mount('/yx/home');
    await ue.click(await screen.findByRole('button', { name: 'Replay manager' }));
    expect(await screen.findByRole('heading', { name: 'Read the request' })).toBeInTheDocument();
    r.unmount();
    api.mockResolvedValue({ show: false, stopped: false, tours: [] });
    mount('/yx/home');
    expect(await screen.findByText('No tours')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
