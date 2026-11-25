import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxInterviewDaysPage from './(app)/hiring/interview-days/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// HIR-27 bulk interview day: the designed screen with `live`, on GET/POST /hiring/interview-days.
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const push = jest.fn();
const DAY = {
  id: 'd1', name: 'GET 2027', jobTitle: 'Graduate Engineer Trainee', stageName: 'Shortlisted', day: '2026-11-14', slotMinutes: 45, status: 'draft', sending: false, slots: [600],
  panels: [{ id: 'pa', name: 'Panel A', room: 'Room 1', members: 'Prakash Menon' }],
  rows: [{ entryId: 'e1', candidate: 'Asha Rao', panelId: 'pa', start: 600, status: 'assigned', error: null }],
};
const calls: [string, unknown][] = [];
const routes = (perms: string[], days: object[] = [{ id: 'd1', name: 'GET 2027', day: '2026-11-14', status: 'draft', jobTitle: 'GET', candidates: 1 }]) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      calls.push([`${init.method} ${path}`, init.body ? JSON.parse(String(init.body)) : null]);
      if (path === '/hiring/interview-days/d1/send') return { sent: 1, failed: 0, day: DAY };
      if (path === '/hiring/interview-days') return { id: 'd2' };
      return DAY;
    }
    if (path.startsWith('/rbac/me/permissions')) return perms;
    if (path === '/hiring/interview-days') return days;
    if (path === '/hiring/interview-days/d1') return DAY;
    if (path === '/hiring/interview-days/options') return { jobs: [{ value: 'j1', label: 'GET', stages: [{ value: 's1', label: 'Shortlisted' }] }], people: [{ value: 'u1', label: 'Prakash Menon' }], slotMinutes: 45, today: '2026-11-10' };
    throw new Error(`unexpected ${path}`);
  });

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/interview-days');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', organizationSlug: 'kaveri', role: 'panel', impersonating: false, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Hiring › Interview days (HIR-27, live)', () => {
  it('opens the latest day and sends its invites through the API, then a toast', async () => {
    routes(['pipeline:manage']);
    wrap(<YxInterviewDaysPage />);
    expect(await screen.findByText('Interview day · GET 2027')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send 1 invites' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send 1 invites' }));
    await waitFor(() => expect(calls).toEqual([['POST /hiring/interview-days/d1/send', null]]));
    expect((await screen.findAllByText('1 invite sent')).length).toBeGreaterThan(0);
  });

  it('answer 423: Remove takes one slot out through the API; a one-slot day has no Remove', async () => {
    routes(['pipeline:manage']);
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: RequestInit) => (path === '/hiring/interview-days/d1' && !init?.method ? { ...DAY, slots: [600, 780] } : base(path, init)));
    const { unmount } = wrap(<YxInterviewDaysPage />);
    await ue.click(await screen.findByRole('button', { name: 'Remove the 1:00 pm slot' }));
    await waitFor(() => expect(calls).toEqual([['DELETE /hiring/interview-days/d1/slots/780', null]]));
    unmount();
    routes(['pipeline:manage']);
    wrap(<YxInterviewDaysPage />);
    expect(await screen.findByText('Interview day · GET 2027')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove the/ })).not.toBeInTheDocument();
  });

  it('Auto-assign posts to the day', async () => {
    routes(['pipeline:manage']);
    wrap(<YxInterviewDaysPage />);
    await ue.click(await screen.findByRole('button', { name: 'Auto-assign' }));
    await waitFor(() => expect(calls).toEqual([['POST /hiring/interview-days/d1/assign', null]]));
  });

  it('no day yet: Plan an interview day loads the choices and opens the sheet', async () => {
    routes(['pipeline:manage'], []);
    wrap(<YxInterviewDaysPage />);
    expect(await screen.findByText('No interview days yet.')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Plan an interview day' })[0]!);
    expect(await screen.findByRole('dialog', { name: /Plan an interview day/ })).toBeInTheDocument();
  });

  it('while acting for someone else, or without the key: view only', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', impersonating: true, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    routes(['pipeline:manage']);
    wrap(<YxInterviewDaysPage />);
    expect(await screen.findByText('Interview day · GET 2027')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Auto-assign|Send|Plan/ })).not.toBeInTheDocument();
  });

  it('the API refuses (403): no access state', async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/rbac/me/permissions')) return [];
      throw Object.assign(new Error('Missing required permission(s)'), { status: 403 });
    });
    wrap(<YxInterviewDaysPage />);
    await waitFor(() => expect(screen.queryByText('Interview day · GET 2027')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Send/ })).not.toBeInTheDocument();
  });
});
