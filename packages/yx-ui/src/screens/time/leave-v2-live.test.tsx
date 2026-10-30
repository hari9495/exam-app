import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LeaveCardScreen, LeaveHomeScreen, type LiveLeaveHome } from './leave';
import { LeaveReportsScreen } from './ops';
import { BlockLeavePlannerScreen } from './roster';
import { HolidayFeedScreen } from './leave-admin';
import type { BlockLeaveList, HolidayFeeds, HrLeaveHome, LeaveReport, MyCompOff, MyEncashment, MyLeave, MyLeaveCard } from './live/types';

// Leave v2 live states: comp-off claim, encashment, long absence, HR leave home, my leave card, leave reports, block
// leave and holiday feeds. Pressed too early shows field errors (never a disabled button); done is the page's toast.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const BAL = { leaveTypeId: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', colour: 'blue', paid: true, hasBalance: true, balance: 18, pending: 0, available: 18, takenThisYear: 0, entitlement: 18, negativeLimit: 0 };
const LEAVE: MyLeave = { employee: { id: 'e1', name: 'Arjun Kulkarni', code: 'KF-1' }, today: '2026-10-29', year: { start: '2026-01-01', end: '2026-12-31' }, balances: [BAL], requests: [], holidays: { calendar: null, list: [] } };
const CO: MyCompOff = { enabled: true, today: '2026-10-29', within: 30, expiryDays: 60, eligible: [{ on: '2026-10-25', kind: 'weekly_off', holiday: null, workedMinutes: 300, maxDays: 0.5 }], claims: [{ id: 'c1', on: '2026-10-18', kind: 'weekly_off', workedMinutes: 500, days: 1, reason: 'Audit', status: 'pending', useBy: '2026-12-17', createdAt: '2026-10-19T05:00:00Z', decidedAt: null }], credits: [] };
const EN: MyEncashment = { today: '2026-10-29', window: 'any_month', open: true, maxPerYear: 7, minLeft: 7, divisor: 26, basis: 'basic_da', monthly: 26000, dailyRate: 1000, year: { start: '2026-01-01', end: '2026-12-31' }, types: [{ leaveTypeId: 'el', name: 'Earned leave', balance: 18, pending: 0, available: 18, encashedThisYear: 0, max: 7 }], taxNote: 'Taxed as salary; exempt at exit up to the limit under section 10(10AA).', waiting: null, history: [] };
const home = (over: Partial<LiveLeaveHome> = {}): LiveLeaveHome => ({
  state: 'ready',
  data: LEAVE,
  onPreview: vi.fn(),
  onApply: vi.fn(),
  onWithdraw: vi.fn(),
  onCancel: vi.fn(),
  onChooseHoliday: vi.fn(),
  onFindPeople: vi.fn(async () => []),
  ...over,
});

describe('My leave, leave v2', () => {
  it('comp-off: waiting claims show with Withdraw; a short day can only be a half day; Send too early shows the reason error', async () => {
    const onClaim = vi.fn(async () => ({}));
    const onWithdraw = vi.fn(async () => ({}));
    render(<LeaveHomeScreen live={home({ compOff: { data: CO, onClaim, onWithdraw } })} />);
    expect(screen.getByText(/Comp-off · 1 day · worked/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Claim comp-off' }));
    const drawer = screen.getByRole('dialog', { name: 'Claim comp-off' });
    await ue.click(within(drawer).getByRole('radio', { name: 'Full day' }));
    await ue.click(within(drawer).getByRole('button', { name: 'Send claim' }));
    expect(within(drawer).getByText(/claim a half day/)).toBeInTheDocument();
    expect(onClaim).not.toHaveBeenCalled();
    await ue.click(within(drawer).getByRole('radio', { name: 'Half day' }));
    await ue.click(within(drawer).getByRole('button', { name: 'Send claim' }));
    expect(within(drawer).getByText('Enter a reason.')).toBeInTheDocument();
    await ue.type(within(drawer).getByLabelText(/Reason/), 'Stock count');
    await ue.click(within(drawer).getByRole('button', { name: 'Send claim' }));
    await waitFor(() => expect(onClaim).toHaveBeenCalledWith({ on: '2026-10-25', days: 0.5, reason: 'Stock count' }));
  });

  it('comp-off: no eligible days says why', async () => {
    render(<LeaveHomeScreen live={home({ compOff: { data: { ...CO, eligible: [], claims: [] }, onClaim: vi.fn(), onWithdraw: vi.fn() } })} />);
    await ue.click(screen.getByRole('button', { name: 'Claim comp-off' }));
    expect(screen.getByText('No eligible days to claim')).toBeInTheDocument();
  });

  it('encashment: over the cap is a field error; the amount and tax note show; a closed window says why', async () => {
    const onRequest = vi.fn(async () => ({}));
    const { unmount } = render(<LeaveHomeScreen live={home({ encash: { data: EN, onRequest, onWithdraw: vi.fn() } })} />);
    await ue.click(screen.getByRole('button', { name: 'Encash leave' }));
    const drawer = screen.getByRole('dialog', { name: 'Encash leave' });
    const days = within(drawer).getByLabelText('Days');
    await ue.clear(days);
    await ue.type(days, '8');
    await ue.click(within(drawer).getByRole('button', { name: 'Send request' }));
    expect(within(drawer).getByText(/At most 7 days/)).toBeInTheDocument();
    expect(onRequest).not.toHaveBeenCalled();
    await ue.clear(days);
    await ue.type(days, '2');
    expect(within(drawer).getByText(/section 10\(10AA\)/)).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onRequest).toHaveBeenCalledWith({ leaveTypeId: 'el', days: 2 }));
    unmount();
    render(<LeaveHomeScreen live={home({ encash: { data: { ...EN, open: false, window: 'off' }, onRequest, onWithdraw: vi.fn() } })} />);
    expect(screen.queryByRole('button', { name: 'Encash leave' })).toBeNull();
  });

  it('long absence: the status card and telling HR a new return date (both fields required)', async () => {
    const onAskReturn = vi.fn(async () => ({}));
    render(<LeaveHomeScreen live={home({ absence: { data: { id: 'a1', employeeId: 'e1', name: 'Arjun Kulkarni', kind: 'sabbatical', from: '2026-10-01', to: '2026-12-31', plannedTo: '2026-12-31', accrues: false, linkedRequest: null, returnAskedOn: null, returnAskedNote: null, note: 'Studies', version: 1 }, onAskReturn } })} />);
    await ue.click(screen.getByRole('button', { name: 'Open status' }));
    expect(screen.getByText('No leave earned while away')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Tell HR my return date changed' }));
    await ue.click(screen.getByRole('button', { name: 'Send to HR' }));
    expect(screen.getByText('Choose the date.')).toBeInTheDocument();
    expect(onAskReturn).not.toHaveBeenCalled();
  });
});

describe('HR leave home and leave card', () => {
  const HR: HrLeaveHome = { today: '2026-10-29', pending: { total: 1, rows: [{ id: 'r1', employeeId: 'e1', name: 'Meera Krishnan', type: 'Casual leave', from: '2026-11-02', to: '2026-11-02', days: 1, sent: '2026-10-20T05:00:00Z', approvers: 'Ravi Kumar' }] }, away: [], negative: 2, certificates: [], yearEnd: { on: '2025-12-31', posted: false, nextOn: '2026-12-31' } };
  it('shows who waits on whom, reminds the approver once, and what needs HR', async () => {
    const onRemind = vi.fn(async () => ({}));
    const onNavigate = vi.fn();
    render(<LeaveHomeScreen hrLive={{ state: 'ready', data: HR, onRemind, onNavigate, hrefs: { approvals: '/a', calendar: '/c', negative: '/n', yearEnd: '/y', request: () => '/a' } }} />);
    expect(screen.getByText(/Waiting for Ravi Kumar/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Remind approver' }));
    await waitFor(() => expect(screen.getByText('Reminded')).toBeInTheDocument());
    expect(screen.getByText('2 people')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Review balances' }));
    expect(onNavigate).toHaveBeenCalledWith('/n');
  });

  it('my leave card: ledger lines and the balance on a date with pending requests', () => {
    const card: MyLeaveCard = { employee: LEAVE.employee, today: '2026-10-29', year: LEAVE.year, balances: [BAL], ledger: [{ id: 'l1', on: '2026-01-01', type: 'EL', kind: 'accrual', days: 18, reason: 'Earned leave for the year' }], pending: [{ id: 'p1', leaveTypeId: 'el', from: '2026-11-10', to: '2026-11-11', days: 2 }] };
    render(<LeaveCardScreen mine={{ state: 'ready', data: card, onApply: vi.fn() }} />);
    expect(screen.getByRole('heading', { name: 'My leave card' })).toBeInTheDocument();
    expect(screen.getByText(/Credited \+18 EL/)).toBeInTheDocument();
  });
});

describe('Leave reports, block leave, holiday feeds (live)', () => {
  const REPORT: LeaveReport = { report: 'balances', types: [{ id: 'el', code: 'EL', name: 'Earned', kind: 'earned', hasBalance: true, paid: true }], total: 51, page: 1, pageSize: 50, filters: { entities: [], locations: [{ id: 'l1', name: 'Chennai' }], departments: [] }, rows: [{ employeeId: 'e1', name: 'Meera Krishnan', code: 'KF-2', location: 'Chennai', department: 'Ops', values: { el: -1.5 } }] };
  it('reports: a page at a time; a row opens the leave card; a filter asks the server again', async () => {
    const onQuery = vi.fn();
    const onOpenCard = vi.fn();
    render(<LeaveReportsScreen live={{ state: 'ready', data: REPORT, query: { report: 'balances', page: 1, pageSize: 50 }, onQuery, onExport: vi.fn(async () => undefined), onOpenCard }} />);
    expect(screen.getByText('Showing 1–50 of 51. Export has every row.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(onQuery).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    await ue.click(screen.getAllByRole('button', { name: 'Open leave card' })[0]!);
    expect(onOpenCard).toHaveBeenCalledWith('e1');
  });

  it('block leave: planning too early shows the date errors; an empty list says who it is for', async () => {
    const list: BlockLeaveList = { today: '2026-10-29', rows: [{ employeeId: 'e1', name: 'Ganesh Hegde', code: null, need: 10, status: 'not_planned', plan: null, nudgedAt: null, earnedLeft: 14, canPlan: true }] };
    const onPlan = vi.fn();
    const { unmount } = render(<BlockLeavePlannerScreen live={{ state: 'ready', data: list, onPlan, onNudge: vi.fn(), onPause: vi.fn(), teamLeaveHref: '/t', onNavigate: vi.fn() }} />);
    await ue.click(screen.getByRole('button', { name: 'Plan block leave' }));
    await ue.click(screen.getByRole('button', { name: 'Plan block' }));
    expect(screen.getByText('Choose the first day.')).toBeInTheDocument();
    expect(onPlan).not.toHaveBeenCalled();
    unmount();
    render(<BlockLeavePlannerScreen live={{ state: 'ready', data: { today: '2026-10-29', rows: [] }, onPlan, onNudge: vi.fn(), onPause: vi.fn(), teamLeaveHref: '/t', onNavigate: vi.fn() }} />);
    expect(screen.getByText('No one in a block-leave role')).toBeInTheDocument();
  });

  it('Suspend: the access pause confirmation says when access stops and comes back; a running pause shows "Access paused"', async () => {
    const row = { employeeId: 'e1', name: 'Ganesh Hegde', code: null, need: 10, status: 'planned' as const, nudgedAt: null, earnedLeft: 14, canPlan: true };
    const onPause = vi.fn(async () => ({}));
    const { unmount } = render(<BlockLeavePlannerScreen live={{ state: 'ready', data: { today: '2026-10-29', rows: [{ ...row, plan: { from: '2026-11-09', to: '2026-11-20', accessPause: 'none', version: 1 } }] }, onPlan: vi.fn(), onNudge: vi.fn(), onPause, teamLeaveHref: '/t', onNavigate: vi.fn() }} />);
    await ue.click(screen.getByRole('button', { name: 'Schedule access pause' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText(/paused from 9 Nov 2026, 12:00 am and restored on 21 Nov 2026/)).toBeInTheDocument();
    await ue.click(within(dlg).getByRole('button', { name: 'Schedule access pause' }));
    await waitFor(() => expect(onPause).toHaveBeenCalledWith('e1', true));
    unmount();
    // Negative: from the first day there is no cancel and no new pause; the server's job runs it.
    render(<BlockLeavePlannerScreen live={{ state: 'ready', data: { today: '2026-11-10', rows: [{ ...row, plan: { from: '2026-11-09', to: '2026-11-20', accessPause: 'scheduled', version: 2 } }] }, onPlan: vi.fn(), onNudge: vi.fn(), onPause, teamLeaveHref: '/t', onNavigate: vi.fn() }} />);
    expect(screen.getByText('Access paused')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel pause' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Schedule access pause' })).not.toBeInTheDocument();
  });

  it('holiday feeds: publishing needs every change decided; then accepted and ignored go together', async () => {
    const feeds: HolidayFeeds = { on: true, provider: 'dev-fake', states: [{ code: 'IN-KA', name: 'Karnataka' }], feeds: [{ id: 'f1', state: 'IN-KA', stateName: 'Karnataka', provider: 'dev-fake', checkedAt: '2026-10-29T05:00:00Z', checkError: null, locations: [{ id: 'l1', name: 'Bengaluru', hasCalendar: true }], waiting: 2 }], changes: [{ id: 'c1', feedId: 'f1', calendar: 'Bengaluru', action: 'add', on: '2026-11-01', name: 'Kannada Rajyotsava', peopleOnLeave: 1 }, { id: 'c2', feedId: 'f1', calendar: 'Bengaluru', action: 'add', on: '2027-01-26', name: 'Republic Day', peopleOnLeave: 0 }] };
    const onDecide = vi.fn(async () => ({ accepted: 1, ignored: 1, leaveReturned: 1 }));
    render(<HolidayFeedScreen live={{ state: 'ready', data: feeds, onSwitch: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn(), onCheck: vi.fn(), onDecide, calendarsHref: '/h', onNavigate: vi.fn() }} />);
    expect(screen.getByText(/1 person has leave that day/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Publish changes' }));
    expect(onDecide).not.toHaveBeenCalled();
    const [accept] = screen.getAllByRole('button', { name: 'Accept' });
    await ue.click(accept!);
    await ue.click(screen.getByRole('button', { name: 'Ignore' }));
    await ue.click(screen.getByRole('button', { name: 'Publish 1 change' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(['c1'], ['c2']));
  });
});
