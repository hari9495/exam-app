import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { notifCategory, toMyRequest, toSearchHits } from '../../lib/yx-me-pages';
import { homeWidgets } from '../../lib/yx-home';
import YxNotificationsPage from './(app)/notifications/page';
import YxNotificationPreferencesPage from './(app)/me/notifications/page';
import YxMyRequestsPage from './(app)/me/requests/page';
import YxDelegationPage from './(app)/me/delegation/page';

// The Home panel's pages (design audit step 2): the designed PLT-03, PLT-06, PLT-07 and PLT-65 screens on live data.
jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: () => '/yx/home', useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), API_BASE: 'https://api.test/api/v1' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { id: 'u-me', name: 'Divya Raghunathan', email: 'divya.r@kaverifoods.in' } }) }));

const api = apiFetch as jest.Mock;
const calls = () => api.mock.calls.map(([path, init]) => `${init?.method ?? 'GET'} ${path}`);
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    return table[key];
  });
}
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const push = jest.fn();

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false });
});

describe('adapters', () => {
  it('sorts notification types into the designed categories', () => {
    expect(notifCategory('workflow.approval.needed')).toBe('Approvals');
    expect(notifCategory('time.roster.published')).toBe('Leave & time');
    expect(notifCategory('payroll.fnf.due')).toBe('Pay');
    expect(notifCategory('reminder.feedback_owed')).toBe('Hiring');
    expect(notifCategory('journey.task.due')).toBe('Tasks');
  });

  it('says where a request is: the step and who holds it, or how it ended', () => {
    const base = { requestId: 'abcdef12-0000-0000-0000-000000000000', type: 'Leave', title: 'Earned leave, 3 Nov to 5 Nov', submittedAt: '2026-10-10T05:00:00Z', raisedBy: null };
    const pending = toMyRequest({ ...base, status: 'pending', decidedAt: null, step: { name: 'Manager', index: 1, of: 2 }, waitingOn: ['Karthik S'] });
    expect(pending).toMatchObject({ ref: 'ABCDEF12', status: 'Pending', latestStep: 'Manager (step 1 of 2)', waitingOn: 'Karthik S' });
    expect(toMyRequest({ ...base, status: 'rejected', decidedAt: '2026-10-12T05:00:00Z', step: null, waitingOn: [] }).latestStep).toBe('Rejected on 12 Oct 2026');
  });

  it('turns search sections into designed results that keep their links', () => {
    const hits = toSearchHits({ people: [{ id: 'p1', label: 'Arjun Mehta', secondary: 'QA', href: '/yx/people/profile?person=p1' }], requests: [], candidates: [], tickets: [] });
    expect(hits).toEqual([{ id: 'people:p1', source: 'People', title: 'Arjun Mehta', subtitle: 'QA', entity: '', href: '/yx/people/profile?person=p1' }]);
  });

  it('Home: counts only, never invented trends; due dates and this week’s moves in the designed words', () => {
    const w = homeWidgets(
      {
        month: '2026-10',
        attendanceExceptions: 5,
        openCases: 2,
        dueLocks: [{ month: '2026-09', entityId: 'e1', entityName: 'Kaveri Foods Pvt Ltd', lockableFrom: '2026-10-02', exceptions: 3, waiting: 1 }],
        probationsDue: { count: 1, firstDue: '2026-10-14' },
        joiners: [{ id: 'j1', name: 'Rohan Shetty', on: '2026-10-15', department: 'Sales', location: 'Chennai', openTasks: 0 }],
        leavers: [],
      },
      '2026-10-15',
    );
    expect(w.stats?.map((s) => [s.label, s.value])).toEqual([['Attendance exceptions', 5], ['Open cases', 2]]);
    expect(w.stats?.every((s) => !('previous' in s))).toBe(true);
    expect(w.due).toEqual([
      expect.objectContaining({ text: 'Lock September attendance, Kaveri Foods Pvt Ltd', badge: { label: 'Due now', tone: 'warning' }, note: '3 exceptions still open · 1 request waiting', action: 'Lock attendance' }),
      expect.objectContaining({ text: 'Probation confirmations · 1 due from 14 Oct', href: '/yx/people/probation' }),
    ]);
    expect(w.moves).toEqual([{ id: 'j-j1', name: 'Rohan Shetty', secondary: 'Joins Thu 15 Oct · Sales', badges: [{ label: 'All ready', tone: 'success' }] }]);
    expect(homeWidgets({ month: '2026-10' }, '2026-10-15')).toEqual({ stats: [], due: [] });
  });
});

describe('/yx/notifications (PLT-03)', () => {
  it('shows the feed, opens an item (read, then its page), and marks all read', async () => {
    route({
      'GET /notifications': [
        { id: 'n1', type: 'workflow.approval.needed', actorUserId: null, actorName: 'Arjun Mehta', entityType: 'wf_request', entityId: 'r1', contextText: 'Leave · needs your approval', linkPath: '/yx/approvals', readAt: null, createdAt: new Date().toISOString() },
      ],
      'POST /notifications/n1/read': null,
      'POST /notifications/read-all': null,
    });
    wrap(<YxNotificationsPage />);
    const item = await screen.findByRole('link', { name: /Leave · needs your approval/ });
    // (Outside the live app shell the designed frame's own sample menu shows too, so pick the page's button.)
    expect(screen.getAllByRole('link', { name: 'Notification preferences' }).map((a) => a.getAttribute('href'))).toContain('/yx/me/notifications');
    // No backend yet for snooze or mute: those menu items are left out.
    await userEvent.click(screen.getByRole('button', { name: /More for:/ }));
    expect(screen.queryByRole('menuitem', { name: /Remind me tomorrow/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(item);
    await waitFor(() => expect(calls()).toContain('POST /notifications/n1/read'));
    expect(push).toHaveBeenCalledWith('/yx/approvals');
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(calls()).toContain('POST /notifications/read-all'));
  });
});

describe('/yx/me/notifications (PLT-65)', () => {
  it('saves email per kind and how often, each with a done toast', async () => {
    route({
      'GET /notifications/preferences': [{ type: 'letter.ready', group: 'assignments', label: 'A letter for you is ready', emailEnabled: true }],
      'GET /notifications/digest': { mode: 'immediate' },
      'PATCH /notifications/preferences': { success: true },
      'PATCH /notifications/digest': { mode: 'daily' },
    });
    wrap(<YxNotificationPreferencesPage />);
    await userEvent.click(await screen.findByRole('switch', { name: /A letter for you is ready/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/notifications/preferences', { method: 'PATCH', body: JSON.stringify({ type: 'letter.ready', emailEnabled: false }) }, 'tok'));
    expect((await screen.findAllByText(/No email for this/)).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('radio', { name: 'Daily summary' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/notifications/digest', { method: 'PATCH', body: JSON.stringify({ mode: 'daily' }) }, 'tok'));
  });
});

describe('/yx/me/requests (PLT-06)', () => {
  it('lists the person’s requests with where each one is; no actions without a backend', async () => {
    route({
      'GET /workflow/approvals/mine': [
        { requestId: 'abcdef12-0000-0000-0000-000000000000', type: 'Leave', title: 'Earned leave, 3 Nov to 5 Nov', status: 'pending', submittedAt: '2026-10-10T05:00:00Z', decidedAt: null, step: { name: 'Manager', index: 1, of: 2 }, waitingOn: ['Karthik S'], raisedBy: null },
      ],
    });
    wrap(<YxMyRequestsPage />);
    expect(await screen.findByText('Earned leave, 3 Nov to 5 Nov')).toBeInTheDocument();
    expect(screen.getByText('Manager (step 1 of 2)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New request' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });
});

describe('/yx/me/delegation (PLT-07)', () => {
  it('shows the running delegation and ends it on the engine', async () => {
    const today = new Date();
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    route({
      'GET /workflow/delegations': [{ id: 'd1', mine: true, person: 'Divya Raghunathan', delegate: 'Karthik S', delegateUserId: 'u-k', startsOn: ymd(today), endsOn: ymd(new Date(today.getTime() + 3 * 86_400_000)), source: 'manual', requestTypes: [] }],
      'GET /workflow/people': [],
      'GET /workspace/counts': { approvals: 2 },
      'POST /workflow/delegations/d1/revoke': { revoked: true },
    });
    wrap(<YxDelegationPage />);
    expect(await screen.findByText(/Karthik S approves for you from/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End now' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'End now' }));
    await waitFor(() => expect(calls()).toContain('POST /workflow/delegations/d1/revoke'));
  });
});
