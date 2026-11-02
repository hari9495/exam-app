import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxMusterPage from './(app)/time/muster/page';

jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/yx-shell', () => ({ ...jest.requireActual('../../lib/yx-shell'), useScopeParams: () => ({ entity: '', month: '2026-11', setMonth: jest.fn() }) }));

// Time › Muster (TIM-02) as a manager (founder 2 Nov 2026, overtime pre-approval item 1): "Pre-approve overtime" posts
// the plan for a report to POST /time/team/overtime/plans/:employeeId; someone with no reports never sees it.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const day = { on: '2026-11-02', status: 'present', leavePart: null, workedMinutes: 480, lateMinutes: null, regularised: false };
const person = (id: string, name: string, me = false) => ({ id, name, code: `KF-${id}`, location: 'Bengaluru head office', me, mode: 'punch', missingPunchEffect: 'block_payroll_approval', days: [day] });
const api = apiFetch as jest.Mock;

beforeEach(() => {
  api.mockReset();
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx/time/muster as a manager', () => {
  it('pre-approves overtime for a report and toasts; the server is asked once with the plan', async () => {
    const posted: { path: string; body: unknown }[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/time/muster')) return { month: '2026-11', from: '2026-11-01', to: '2026-11-30', scope: 'team', people: [person('d', 'Divya Raghunathan', true), person('a', 'Arjun Kulkarni')] };
      if (path.startsWith('/time/team/overtime/plans/') && init?.method === 'POST') {
        posted.push({ path, body: JSON.parse(String(init.body)) });
        return { id: 'p1', status: 'approved' };
      }
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    wrap(<YxMusterPage />);
    await ue.click(await screen.findByRole('button', { name: 'Pre-approve overtime' }));
    const sheet = screen.getByRole('dialog', { name: 'Pre-approve overtime' });
    // One report: already chosen.
    expect(within(sheet).getByRole('combobox')).toHaveTextContent('Arjun Kulkarni');
    await ue.click(within(sheet).getByRole('button', { name: 'Pre-approve' }));
    expect(posted).toEqual([]);
    await ue.type(within(sheet).getByLabelText(/^Planned OT/), '1.5');
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Audit prep');
    await ue.click(within(sheet).getByRole('button', { name: 'Pre-approve' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.path).toBe('/time/team/overtime/plans/a');
    expect(posted[0]!.body).toEqual({ on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), minutes: 90, takeAs: 'pay', reason: 'Audit prep' });
    expect(await screen.findByText('Overtime pre-approved for Arjun Kulkarni')).toBeInTheDocument();
  });

  it('a refusal (someone outside the line) stays in the sheet with the reason', async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/time/muster')) return { month: '2026-11', from: '2026-11-01', to: '2026-11-30', scope: 'team', people: [person('d', 'Divya Raghunathan', true), person('a', 'Arjun Kulkarni')] };
      if (init?.method === 'POST') throw Object.assign(new Error('Not found'), { status: 404 });
      throw new Error(`unexpected ${path}`);
    });
    wrap(<YxMusterPage />);
    await ue.click(await screen.findByRole('button', { name: 'Pre-approve overtime' }));
    const sheet = screen.getByRole('dialog', { name: 'Pre-approve overtime' });
    await ue.type(within(sheet).getByLabelText(/^Planned OT/), '2');
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Audit prep');
    await ue.click(within(sheet).getByRole('button', { name: 'Pre-approve' }));
    expect(await within(sheet).findByText('Not pre-approved')).toBeInTheDocument();
  });

  it('someone with no reports (only their own row) does not see the action', async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/time/muster')) return { month: '2026-11', from: '2026-11-01', to: '2026-11-30', scope: 'team', people: [person('a', 'Arjun Kulkarni', true)] };
      throw new Error(`unexpected ${path}`);
    });
    wrap(<YxMusterPage />);
    expect(await screen.findByText('Muster · November 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pre-approve overtime' })).toBeNull();
  });
});
