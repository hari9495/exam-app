import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import type { NavArea } from '../../lib/yx-nav';
import { YxNavContext } from '../../lib/yx-shell';
import YxHomePage from './(app)/home/page';
import YxPayTabPage from './(app)/me/pay/page';
import YxMeTabPage from './(app)/me/page';
import YxPhoneSettingsPage from './(app)/me/settings/page';
import YxRequestsTabPage from './(app)/requests/page';
import YxNewRequestPage from './(app)/requests/new/page';
import YxTimeTabPage from './(app)/time/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// T2-H (answer 2741): under 768 px the tab landings and Home render the designed phone screens with the same calls as
// their desk pages; over it the landings move on to the desk page (positive and negative).
const NAV: NavArea[] = [
  {
    id: 'home',
    title: 'Home',
    sections: [{ items: [{ id: 'approvals', label: 'Approvals', href: '/yx/approvals' }, { id: 'my-payslips', label: 'Payslips', href: '/yx/me/payslips' }, { id: 'my-attendance', label: 'My attendance', href: '/yx/time/attendance' }, { id: 'my-leave', label: 'My leave', href: '/yx/time/leave' }, { id: 'profile', label: 'Profile', href: '/yx/people/profile' }] }],
  },
];
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxNavContext.Provider value={{ nav: NAV, ready: true }}>{ui}</YxNavContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const push = jest.fn();
const replace = jest.fn();
const calls: { method: string; path: string; body: unknown }[] = [];
const serve = (routes: Record<string, unknown>) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (path.startsWith('/rbac/me/permissions')) return [];
    calls.push({ method, path, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    const key = `${method} ${path.split('?')[0]}`;
    if (!(key in routes)) throw Object.assign(new Error(`unexpected ${key}`), { status: 404 });
    const r = routes[key];
    if (r instanceof Error) throw r;
    return r;
  });
const realMatchMedia = window.matchMedia;
const width = (px: number) => {
  window.matchMedia = ((q: string) => ({ matches: px <= Number(/max-width: (\d+)px/.exec(q)?.[1] ?? 0), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  push.mockReset();
  replace.mockReset();
  width(390);
  (useRouter as jest.Mock).mockReturnValue({ push, replace });
  (usePathname as jest.Mock).mockReturnValue('/yx/home');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'employee', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe('phone tab landings', () => {
  it('Pay: the latest payslip from Payslips’ own call; a desk moves on to Payslips', async () => {
    serve({ 'GET /payroll/me/payslips': [{ id: 'p1', month: '2026-09', runType: 'regular', gross: '90000', deductions: '5750', net: '84250', paymentStatus: 'paid', verify: true }, { id: 'p2', month: '2026-10', runType: 'regular', gross: '90000', deductions: '5000', net: '85000', paymentStatus: 'paid', verify: true }] });
    const { unmount } = wrap(<YxPayTabPage />);
    expect(await screen.findByText('October 2026 payslip')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Payslips and YTD/ }));
    expect(push).toHaveBeenCalledWith('/yx/me/payslips');
    unmount();
    width(1278);
    wrap(<YxPayTabPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/yx/me/payslips'));
    expect(screen.queryByText(/payslip/)).not.toBeInTheDocument();
  });

  it('Pay: none published yet says so', async () => {
    serve({ 'GET /payroll/me/payslips': [] });
    wrap(<YxPayTabPage />);
    expect(await screen.findByText('No payslip yet.')).toBeInTheDocument();
  });

  it('Requests: mine and what waits for me, each opening its page', async () => {
    serve({
      'GET /workflow/approvals/mine': [{ requestId: 'r1', type: 'Leave', title: 'Casual leave · 1–2 Dec', status: 'pending', submittedAt: '2026-11-20T05:00:00Z', decidedAt: null, step: null, waitingOn: ['Karthik S'], raisedBy: null }],
      'GET /workflow/approvals/inbox': [{ taskId: 't1', requestId: 'q1', type: 'Leave', title: '2 days', summary: [], requester: 'Arjun K', raisedBy: null, onBehalfOf: null, step: { index: 1, of: 1, name: 'Manager', need: 1, approvers: 1 }, dueAt: null, submittedAt: '2026-11-20T05:00:00Z' }],
      'GET /people/team': { managerId: 'm', members: [] },
    });
    wrap(<YxRequestsTabPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Casual leave/ }));
    expect(push).toHaveBeenCalledWith('/yx/me/requests');
    await userEvent.click(await screen.findByRole('radio', { name: 'Team · 1' }));
    await userEvent.click(screen.getByRole('button', { name: /Leave · Arjun K/ }));
    expect(push).toHaveBeenCalledWith('/yx/approvals');
  });

  it('Requests: someone nothing waits on gets no Team segment; a failed load offers a retry', async () => {
    serve({ 'GET /workflow/approvals/mine': new Error('Server error'), 'GET /workflow/approvals/inbox': [], 'GET /people/team': { managerId: 'm', members: [] } });
    wrap(<YxRequestsTabPage />);
    expect(await screen.findByText("We couldn't load your requests.")).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Team/ })).not.toBeInTheDocument();
  });

  it('Me: the person’s own pages; Settings and More always', async () => {
    serve({ 'GET /users/me': { id: 'u1', name: 'Divya R', email: 'divya@example.test' } });
    wrap(<YxMeTabPage />);
    expect(await screen.findByText('Divya R')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Profile/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Speak up/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Settings and security/ }));
    expect(push).toHaveBeenCalledWith('/yx/me/settings');
  });

  it('Time: the rows the menu has and Apply leave; a desk moves on to My attendance', async () => {
    serve({ 'GET /time/me/attendance': new Error('No record'), 'GET /time/me/leave': { employee: { id: 'e', name: 'D', code: null }, today: '2026-11-20', year: { start: '2026-01-01', end: '2026-12-31' }, balances: [{ leaveTypeId: 'cl', code: 'CL', name: 'Casual leave', kind: 'casual', colour: 'blue', paid: true, hasBalance: true, balance: 4, pending: 0, available: 4, takenThisYear: 2, entitlement: 6, negativeLimit: 0 }], requests: [], holidays: { calendar: null, list: [] } } });
    const { unmount } = wrap(<YxTimeTabPage />);
    expect(await screen.findByText('Casual leave')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply leave' }));
    expect(push).toHaveBeenCalledWith('/yx/time/leave?apply=1');
    expect(screen.queryByRole('button', { name: /Open shifts/ })).not.toBeInTheDocument();
    unmount();
    width(1024);
    wrap(<YxTimeTabPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/yx/time/attendance'));
  });
});

describe('new request picker', () => {
  it('lists the types the menu allows and opens their pages; a desk moves on to My requests', async () => {
    const { unmount } = wrap(<YxNewRequestPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(push).toHaveBeenCalledWith('/yx/time/leave?apply=1');
    expect(screen.queryByRole('button', { name: /Ask HR/ })).not.toBeInTheDocument();
    unmount();
    width(1278);
    wrap(<YxNewRequestPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/yx/me/requests'));
  });
});

describe('phone settings', () => {
  const routes = () => ({
    'GET /notifications/preferences': [{ type: 'approval_requested', group: 'approvals', label: 'Approvals', emailEnabled: false, pushEnabled: true }],
    'GET /notifications/push': { available: true, publicKey: null, paused: false, quietFrom: '22:00', quietTo: '07:00' },
    'GET /auth/sessions': [
      { id: 's1', method: 'otp', assuranceLevel: 'aal1', userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/130', ipAddress: null, geo: null, createdAt: '2026-11-01T00:00:00Z', lastSeenAt: '2026-11-20T00:00:00Z', absoluteExpiresAt: '2026-12-01T00:00:00Z', current: true },
      { id: 's2', method: 'otp', assuranceLevel: 'aal1', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Edg/130', ipAddress: null, geo: null, createdAt: '2026-11-01T00:00:00Z', lastSeenAt: '2026-11-18T00:00:00Z', absoluteExpiresAt: '2026-12-01T00:00:00Z' },
    ],
    'GET /global/me/language': { language: 'en', chosen: false, companyLanguage: 'en', choices: ['en'] },
    'PATCH /notifications/preferences': {},
    'DELETE /auth/sessions/s2': {},
    'POST /auth/sessions/revoke-others': {},
  });

  it('a channel saves with the preferences call; another device signs out with the sessions call', async () => {
    serve(routes());
    wrap(<YxPhoneSettingsPage />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Approvals by email' }));
    await waitFor(() => expect(calls).toContainEqual({ method: 'PATCH', path: '/notifications/preferences', body: { type: 'approval_requested', emailEnabled: true } }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Approvals in app' }));
    await waitFor(() => expect(calls).toContainEqual({ method: 'PATCH', path: '/notifications/preferences', body: { type: 'approval_requested', pushEnabled: false } }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/auth/sessions/s2')).toBe(true));
    // One language: no language picker.
    expect(screen.queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument();
  });

  it('a refused change says why; a desk moves on to Notification preferences', async () => {
    serve({ ...routes(), 'PATCH /notifications/preferences': Object.assign(new Error('You can’t turn this one off.'), { status: 400 }) });
    const { unmount } = wrap(<YxPhoneSettingsPage />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Approvals by email' }));
    expect(await screen.findByText('You can’t turn this one off.')).toBeInTheDocument();
    unmount();
    width(1278);
    wrap(<YxPhoneSettingsPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/yx/me/notifications'));
  });
});

describe('phone Home', () => {
  it('renders the designed phone Home (nothing to do), and the desk Home over 767 px', async () => {
    serve({ 'GET /workflow/approvals/inbox': [] });
    const { unmount } = wrap(<YxHomePage />);
    expect(await screen.findByText('Nothing to do right now.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening), /);
    unmount();
    width(1278);
    wrap(<YxHomePage />);
    await waitFor(() => expect(screen.queryByText('Nothing to do right now.')).not.toBeInTheDocument());
  });
});
