import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LeaveHomeScreen, type LiveMgrLeaveHome } from './leave';
import type { LeaveRequestDetailView, TeamLeaveHome } from './live/types';

// TIM-17 Manager and TIM-19 Manager in the app: a manager's own team's leave waiting for them (the server sends only
// their team; another person's request answers 404), with team availability, the balance after it, Approve and Reject.

const ue = userEvent.setup({ pointerEventsCheck: 0 });

const HOME: TeamLeaveHome = {
  today: '2026-10-30',
  waiting: [
    { id: 'lr1', taskId: 't1', employeeId: 'e1', name: 'Arjun Kulkarni', type: 'Casual leave', from: '2026-11-03', to: '2026-11-04', fromHalf: 'full', toHalf: 'full', days: 2, certificate: 'none', sent: '2026-10-29T05:00:00Z', others: [{ name: 'Ravi Kumar', type: 'Earned leave' }] },
    { id: 'lr2', taskId: 't2', employeeId: 'e2', name: 'Meera Krishnan', type: 'Sick leave', from: '2026-11-05', to: '2026-11-05', fromHalf: 'full', toHalf: 'full', days: 1, certificate: 'pending', sent: '2026-10-29T06:00:00Z', others: [] },
  ],
  otherWaiting: 2,
  away: [{ employeeId: 'e3', name: 'Ravi Kumar', type: 'Earned leave', from: '2026-10-27', to: '2026-10-31' }],
};
const DETAIL: LeaveRequestDetailView = {
  id: 'lr1', employeeId: 'e1', type: { id: 'cl', code: 'CL', name: 'Casual leave', colour: '#888', medical: false }, from: '2026-11-03', to: '2026-11-04', fromHalf: 'full', toHalf: 'full', days: 2, status: 'pending', certificate: 'none', reason: 'Family function', createdAt: '2026-10-29T05:00:00Z', decidedAt: null,
  person: { name: 'Arjun Kulkarni', code: 'KF-0142' },
  team: { others: [{ name: 'Ravi Kumar', type: 'Earned leave' }], balanceAfter: 4, taskId: 't1' },
};
const mgr = (over: Partial<LiveMgrLeaveHome> = {}): LiveMgrLeaveHome => ({ state: 'ready', data: HOME, onOpen: vi.fn(async () => DETAIL), onDecide: vi.fn(async () => ({})), onNavigate: vi.fn(), hrefs: { approvals: '/yx/approvals', calendar: '/yx/time/team' }, ...over });
const firstRow = () => within(screen.getByRole('list', { name: 'Leave waiting for you' })).getAllByRole('listitem')[0]!;

describe('TIM-17 Manager (live)', () => {
  it('lists my team waiting for me with who else is off; Approve decides my task and the row goes', async () => {
    const l = mgr();
    render(<LeaveHomeScreen mgrLive={l} />);
    expect(screen.getByRole('heading', { name: 'Team leave' })).toBeInTheDocument();
    expect(screen.getByText('Leave waiting for you (2)')).toBeInTheDocument();
    expect(screen.getByText('Also in Requests: 2 attendance or overtime requests')).toBeInTheDocument();
    expect(screen.getByText('Also off: Ravi Kumar (Earned leave)')).toBeInTheDocument();
    expect(screen.getByText(/No one else in the team is off then · certificate to give HR/)).toBeInTheDocument();
    await ue.click(within(firstRow()).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(l.onDecide).toHaveBeenCalledWith('t1', 'approve'));
    expect(await screen.findByText('Leave waiting for you (1)')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open leave calendar' }));
    expect(l.onNavigate).toHaveBeenCalledWith('/yx/time/team');
  });

  it('a refused decision (say, someone else decided first) stays on the page and keeps the row', async () => {
    render(<LeaveHomeScreen mgrLive={mgr({ onDecide: vi.fn(async () => { throw new Error('This task was already decided.'); }) })} />);
    await ue.click(within(firstRow()).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('This task was already decided.')).toBeInTheDocument();
    expect(screen.getByText('Leave waiting for you (2)')).toBeInTheDocument();
  });

  it('nothing waiting, and could not load', async () => {
    const onRetry = vi.fn();
    const { unmount } = render(<LeaveHomeScreen mgrLive={mgr({ data: { ...HOME, waiting: [], away: [] } })} />);
    expect(screen.getByText('Nothing waiting for you')).toBeInTheDocument();
    expect(screen.getByText('No one in your team is away this week.')).toBeInTheDocument();
    unmount();
    render(<LeaveHomeScreen mgrLive={mgr({ state: 'error', data: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('TIM-19 Manager (live)', () => {
  it('View shows team availability and the balance after; Approve asks first, then decides my task', async () => {
    const l = mgr();
    render(<LeaveHomeScreen mgrLive={l} />);
    await ue.click(within(firstRow()).getByRole('button', { name: 'View' }));
    expect(l.onOpen).toHaveBeenCalledWith('lr1');
    const drawer = await screen.findByRole('dialog', { name: /Casual leave · Arjun Kulkarni/ });
    expect(within(drawer).getByText("Arjun's balance after")).toBeInTheDocument();
    expect(within(drawer).getByText('1 other in the team is off then')).toBeInTheDocument();
    expect(within(drawer).getByText('Ravi Kumar (Earned leave)')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Approve' }));
    const confirm = screen.getByRole('dialog', { name: "Approve Arjun Kulkarni's casual leave?" });
    await ue.click(within(confirm).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(l.onDecide).toHaveBeenCalledWith('t1', 'approve'));
  });

  it('Reject needs a reason (field error and focus, the button never greyed out)', async () => {
    const l = mgr({ openId: 'lr1' });
    render(<LeaveHomeScreen mgrLive={l} />);
    const drawer = await screen.findByRole('dialog', { name: /Casual leave · Arjun Kulkarni/ });
    await ue.click(within(drawer).getByRole('button', { name: 'Reject' }));
    const confirm = screen.getByRole('dialog', { name: "Reject Arjun Kulkarni's casual leave?" });
    await ue.click(within(confirm).getByRole('button', { name: 'Reject' }));
    expect(within(confirm).getByText('Enter a reason.')).toBeInTheDocument();
    expect(within(confirm).getByLabelText(/^Reason/)).toHaveFocus();
    expect(l.onDecide).not.toHaveBeenCalled();
    await ue.type(within(confirm).getByLabelText(/^Reason/), 'Audit week');
    await ue.click(within(confirm).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(l.onDecide).toHaveBeenCalledWith('t1', 'reject', 'Audit week'));
  });

  it('Send back for changes: from the row; what to change is required; then my task is sent back and the row goes', async () => {
    const l = mgr();
    render(<LeaveHomeScreen mgrLive={l} />);
    await ue.click(within(firstRow()).getByRole('button', { name: 'Send back' }));
    const confirm = await screen.findByRole('dialog', { name: 'Send back to Arjun?' });
    expect(within(confirm).getByText('Arjun gets your note and can change the request and send it again.')).toBeInTheDocument();
    // Negative: pressed too early, the field says why and takes focus; nothing is sent.
    await ue.click(within(confirm).getByRole('button', { name: 'Send back' }));
    expect(within(confirm).getByText('Enter what to change.')).toBeInTheDocument();
    expect(within(confirm).getByLabelText(/^What to change/)).toHaveFocus();
    expect(l.onDecide).not.toHaveBeenCalled();
    await ue.type(within(confirm).getByLabelText(/^What to change/), 'Move it by a week');
    await ue.click(within(confirm).getByRole('button', { name: 'Send back' }));
    await waitFor(() => expect(l.onDecide).toHaveBeenCalledWith('t1', 'send_back', 'Move it by a week'));
    expect(await screen.findByText('Leave waiting for you (1)')).toBeInTheDocument();
  });

  it('Send back is not offered when the company turned it off', async () => {
    render(<LeaveHomeScreen mgrLive={mgr({ openId: 'lr1', data: { ...HOME, waiting: HOME.waiting.map((w) => ({ ...w, canSendBack: false })) }, onOpen: vi.fn(async () => ({ ...DETAIL, team: { ...DETAIL.team!, canSendBack: false } })) })} />);
    const drawer = await screen.findByRole('dialog', { name: /Casual leave · Arjun Kulkarni/ });
    expect(within(drawer).queryByRole('button', { name: 'Send back' })).toBeNull();
    expect(within(drawer).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it("not my task: no Approve, it says who decides; someone outside my team: the server's answer shows", async () => {
    const { unmount } = render(<LeaveHomeScreen mgrLive={mgr({ openId: 'lr1', onOpen: vi.fn(async () => ({ ...DETAIL, team: { ...DETAIL.team!, taskId: null } })) })} />);
    const drawer = await screen.findByRole('dialog', { name: /Casual leave · Arjun Kulkarni/ });
    expect(within(drawer).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(drawer).getByText('Waiting for another approver: only they can decide it')).toBeInTheDocument();
    unmount();
    render(<LeaveHomeScreen mgrLive={mgr({ openId: 'x', onOpen: vi.fn(async () => { throw new Error('Not found'); }) })} />);
    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });
});
