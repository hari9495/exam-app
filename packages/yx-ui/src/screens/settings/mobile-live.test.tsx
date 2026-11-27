import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { MobileSearchScreen } from '../platform-a/shell-home';
import { MyRequestsPhone } from '../platform-a/inbox';
import { MobileHomeScreen, MobilePayTabScreen, MobileTimeTabScreen, type LiveMobileHome } from './mobile-home';
import { MobileMeTabScreen, MobileMoreScreen, MobileRequestTypePickerScreen, MobileRequestsTabScreen, MobileSettingsScreen, type LiveMobileSettings } from './mobile-me';

// T2-H (answer 2741): the designed phone screens with live data; rows only for pages the person may open; every
// action goes through the page's own call.
const home = (over: Partial<LiveMobileHome> = {}): LiveMobileHome => ({
  firstName: 'Divya',
  todos: [{ id: 'a1', title: 'Leave · Arjun Kulkarni', sub: 'Casual leave, 1–2 Oct', due: 'Due today', dueToday: true, href: '/yx/approvals' }],
  quickActions: [{ label: 'Apply leave', href: '/yx/time/leave?apply=1', kind: 'leave' }],
  onNavigate: vi.fn(),
  ...over,
});

describe('MobileHomeScreen live', () => {
  it('shows the to-dos and quick actions; each opens its page', async () => {
    const live = home();
    render(<MobileHomeScreen live={live} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Good (morning|afternoon|evening), Divya/);
    await userEvent.click(screen.getByRole('button', { name: /Leave · Arjun Kulkarni/ }));
    expect(live.onNavigate).toHaveBeenCalledWith('/yx/approvals');
    await userEvent.click(screen.getByRole('button', { name: 'Apply leave' }));
    expect(live.onNavigate).toHaveBeenCalledWith('/yx/time/leave?apply=1');
    // The design's sample announcement and team are not shown with live data.
    expect(screen.queryByText(/Deepavali/)).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Show' })).not.toBeInTheDocument();
  });

  it('nothing to do says so; no quick actions without pages', () => {
    render(<MobileHomeScreen live={home({ todos: [], quickActions: [] })} />);
    expect(screen.getByText('Nothing to do right now.')).toBeInTheDocument();
    expect(screen.queryByText('Quick actions')).not.toBeInTheDocument();
  });

  it('a manager gets the Team segment with Nudge for people not in yet', async () => {
    const onNudge = vi.fn().mockResolvedValue(undefined);
    render(
      <ToastProvider>
        <MobileHomeScreen live={home({ onNudge, team: { total: 2, href: '/yx/time/today', groups: [{ key: 'not_in', label: 'Not in yet', people: [{ id: 'e1', name: 'Sanjay Gupta', nudge: true }] }, { key: 'leave', label: 'On leave', people: [{ id: 'e2', name: 'Meera K' }] }] } })} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Team' }));
    expect(screen.getByText('Team today · 2 people')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nudge Sanjay Gupta' }));
    expect(onNudge).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
    expect(screen.queryByRole('button', { name: 'Nudge Meera K' })).not.toBeInTheDocument();
  });
});

describe('Time, Pay, Requests, Me and More tabs live', () => {
  it('Time: only the rows given, the fix count and the balances', async () => {
    const onNavigate = vi.fn();
    render(<MobileTimeTabScreen live={{ attendance: [{ id: 'attendance', title: 'My attendance', sub: '2 late marks · 1 missing punch this month', fix: 1, href: '/yx/time/attendance' }], balances: [{ name: 'Casual leave', value: 4 }], applyLeaveHref: '/yx/time/leave?apply=1', leave: [], onNavigate }} />);
    expect(screen.getByText('Fix 1')).toBeInTheDocument();
    expect(screen.queryByText('Field visits')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply leave' }));
    expect(onNavigate).toHaveBeenCalledWith('/yx/time/leave?apply=1');
  });

  it('Pay: the latest payslip, or none yet', async () => {
    const onNavigate = vi.fn();
    const { unmount } = render(<MobilePayTabScreen live={{ latest: { month: 'October 2026', net: 84250, status: 'Published', href: '/yx/me/payslips' }, rows: [], onNavigate }} />);
    expect(screen.getByText('October 2026 payslip')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View payslip' }));
    expect(onNavigate).toHaveBeenCalledWith('/yx/me/payslips');
    unmount();
    render(<MobilePayTabScreen live={{ latest: null, rows: [], onNavigate }} />);
    expect(screen.getByText('No payslip yet.')).toBeInTheDocument();
  });

  it('Requests: Mine, and Team only for approvers; no New request without a picker', async () => {
    const onNavigate = vi.fn();
    const mine = [{ id: 'r1', title: 'Casual leave · 1–2 Oct', sub: 'With Karthik since 27 Sep 2026', status: 'Pending', tone: 'info' as const, href: '/yx/me/requests' }];
    const { unmount } = render(<MobileRequestsTabScreen live={{ mine, team: null, onNavigate }} />);
    expect(screen.queryByRole('radiogroup', { name: 'Show' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New request' })).not.toBeInTheDocument();
    unmount();
    render(<MobileRequestsTabScreen live={{ mine, team: [{ id: 't1', title: 'Leave · Arjun', sub: '2 days', due: 'Due today', dueSoon: true, href: '/yx/approvals' }], newHref: '/yx/requests/new', onNavigate }} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Team · 1' }));
    await userEvent.click(screen.getByRole('button', { name: /Leave · Arjun/ }));
    expect(onNavigate).toHaveBeenCalledWith('/yx/approvals');
    await userEvent.click(screen.getByRole('button', { name: 'New request' }));
    expect(onNavigate).toHaveBeenCalledWith('/yx/requests/new');
  });

  it('Me: empty groups are left out; the exit card shows while serving notice', () => {
    render(<MobileMeTabScreen live={{ name: 'Divya R', secondary: 'divya@example.test', exit: { title: 'Your exit · last day 30 Oct 2026', href: '/yx/me/resignation' }, groups: [{ label: 'About me', rows: [{ id: 'profile', title: 'Profile', href: '/yx/people/profile' }] }, { label: 'Growth', rows: [] }], onNavigate: vi.fn() }} />);
    expect(screen.getByRole('list', { name: 'About me' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Growth' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open my exit' })).toBeInTheDocument();
  });

  it('More: the areas given, or says there are none', () => {
    const { unmount } = render(<MobileMoreScreen live={{ areas: [{ id: 'helpdesk', title: 'Helpdesk', href: '/yx/desk/help' }], onNavigate: vi.fn() }} />);
    expect(within(screen.getByRole('list', { name: 'Areas' })).getByText('Helpdesk')).toBeInTheDocument();
    unmount();
    render(<MobileMoreScreen live={{ areas: [], onNavigate: vi.fn() }} />);
    expect(screen.getByText('No other areas for your role.')).toBeInTheDocument();
  });
});

describe('MobileSettingsScreen live', () => {
  const settings = (over: Partial<LiveMobileSettings> = {}): LiveMobileSettings => ({
    types: [{ type: 'approval', label: 'Approvals', app: true, email: false }],
    onToggle: vi.fn().mockResolvedValue(undefined),
    devices: [
      { id: 's1', title: 'Chrome on Android', sub: 'Last used 28 Nov 2026', current: true },
      { id: 's2', title: 'Edge on Windows', sub: 'Last used 20 Nov 2026', current: false },
    ],
    onSignOutDevice: vi.fn().mockResolvedValue(undefined),
    onSignOutOthers: vi.fn().mockResolvedValue(undefined),
    securityHref: '/yx/me/security',
    onNavigate: vi.fn(),
    ...over,
  });

  it('a channel change saves at once; this device cannot be signed out from its own row', async () => {
    const live = settings();
    render(
      <ToastProvider>
        <MobileSettingsScreen live={live} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Approvals by email' }));
    expect(live.onToggle).toHaveBeenCalledWith('approval', 'email', true);
    expect(screen.getAllByRole('button', { name: 'Sign out' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(live.onSignOutDevice).toHaveBeenCalledWith('s2');
    expect(screen.queryByRole('columnheader', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  it('a refused change says so; no App column without push; no sign-out-all with one device', async () => {
    const live = settings({ types: [{ type: 'approval', label: 'Approvals', email: true }], devices: [{ id: 's1', title: 'Chrome on Android', sub: '', current: true }], onToggle: vi.fn().mockRejectedValue(new Error('Server busy')) });
    render(
      <ToastProvider>
        <MobileSettingsScreen live={live} />
      </ToastProvider>,
    );
    expect(screen.queryByRole('columnheader', { name: 'App' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign out of all other devices/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Approvals by email' }));
    expect(await screen.findByText('Server busy')).toBeInTheDocument();
  });
});

describe('MobileSearchScreen live', () => {
  it('searches as the person types and opens a hit; suggested actions go to their pages', async () => {
    const live = { onQueryChange: vi.fn(), onOpen: vi.fn(), suggested: [{ label: 'Apply leave', href: '/yx/time/leave?apply=1', kind: 'leave' as const }], onNavigate: vi.fn() };
    const { rerender } = render(<MobileSearchScreen query="" hits={[]} live={live} />);
    expect(screen.queryByText('Recent searches')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply leave' }));
    expect(live.onNavigate).toHaveBeenCalledWith('/yx/time/leave?apply=1');
    await userEvent.type(screen.getByRole('textbox', { name: 'Search' }), 'ar');
    expect(live.onQueryChange).toHaveBeenLastCalledWith('ar');
    rerender(<MobileSearchScreen query="" hits={[{ id: 'p1', source: 'People', title: 'Arjun Kulkarni', subtitle: 'Quality', entity: 'Kaveri', href: '/yx/people/directory/p1' }]} live={live} />);
    await userEvent.click(screen.getByRole('link', { name: /Arjun Kulkarni/ }));
    expect(live.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });

  it('no match says so', async () => {
    render(<MobileSearchScreen query="zzz" hits={[]} live={{ onQueryChange: vi.fn(), onOpen: vi.fn(), suggested: [], onNavigate: vi.fn() }} />);
    expect(screen.getByText(/No results for/)).toBeInTheDocument();
  });
});

describe('MobileRequestTypePickerScreen live', () => {
  it('only the types given, in their sections; a row opens its page', async () => {
    const onNavigate = vi.fn();
    render(<MobileRequestTypePickerScreen live={{ rows: [{ section: 'Common', id: 'leave', title: 'Leave', href: '/yx/time/leave?apply=1' }], onNavigate }} />);
    expect(screen.queryByText('Money and help')).not.toBeInTheDocument();
    expect(screen.queryByText(/Uniform request/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onNavigate).toHaveBeenCalledWith('/yx/time/leave?apply=1');
  });

  it('nothing to raise says so', () => {
    render(<MobileRequestTypePickerScreen live={{ rows: [], onNavigate: vi.fn() }} />);
    expect(screen.getByText('No requests you can raise here.')).toBeInTheDocument();
  });
});

describe('MyRequestsPhone live', () => {
  const rows = [{ id: 'r1', ref: 'AB12CD34', type: 'Leave', summary: 'Casual leave · 1–2 Dec', submitted: new Date(2026, 10, 20), status: 'Pending' as const, latestStep: 'Manager (step 1 of 1)', waitingOn: 'Karthik S' }];
  it('where each request is, read-only like the desk page; New request opens the picker', async () => {
    const onNavigate = vi.fn();
    render(<MyRequestsPhone rows={rows} live={{ state: 'ready', newHref: '/yx/requests/new', onNavigate }} />);
    await userEvent.click(screen.getByRole('button', { name: /Casual leave/ }));
    expect(screen.getAllByText('With Karthik S').length).toBeGreaterThan(1);
    expect(screen.queryByRole('button', { name: /Withdraw/ })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'New request' }));
    expect(onNavigate).toHaveBeenCalledWith('/yx/requests/new');
  });

  it('no picker: no New request; a failed load retries', async () => {
    const onRetry = vi.fn();
    const { unmount } = render(<MyRequestsPhone rows={[]} live={{ state: 'ready', onNavigate: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: 'New request' })).not.toBeInTheDocument();
    unmount();
    render(<MyRequestsPhone rows={[]} live={{ state: 'error', onRetry, onNavigate: vi.fn() }} />);
    await userEvent.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
