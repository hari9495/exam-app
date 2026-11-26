import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LeaveCardScreen, LeaveHomeScreen, TeamLeaveCalendarScreen, type LiveLeaveCard, type LiveLeaveHome, type LiveTeamLeave } from './leave';
import type { HrBalances, LeavePlan, MyLeave, TeamCalendar } from './live/types';

// The designed leave screens (TIM-17 … TIM-23) with the live app's data: what /yx/time/leave, /team and /balances do.

const ue = userEvent.setup({ pointerEventsCheck: 0 });

const EL = { id: 'el', code: 'EL', name: 'Earned leave', colour: 'blue', medical: false };
const LEAVE: MyLeave = {
  employee: { id: 'e1', name: 'Arjun Kulkarni', code: 'KF-0142' },
  today: '2026-10-09',
  year: { start: '2026-01-01', end: '2026-12-31' },
  balances: [
    { leaveTypeId: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', colour: 'blue', paid: true, hasBalance: true, balance: 21, pending: 2, available: 19, takenThisYear: 0, entitlement: 18, negativeLimit: 0 },
    { leaveTypeId: 'lop', code: 'LOP', name: 'Leave without pay', kind: 'lop', colour: 'grey', paid: false, hasBalance: false, balance: 0, pending: 0, available: 0, takenThisYear: 2, entitlement: null, negativeLimit: 0 },
  ],
  requests: [
    { id: 'r1', employeeId: 'e1', type: EL, from: '2026-10-20', to: '2026-10-21', fromHalf: 'full', toHalf: 'full', days: 2, status: 'pending', certificate: 'none', reason: 'Family function', createdAt: '2026-10-01T05:00:00Z', decidedAt: null },
    { id: 'r2', employeeId: 'e1', type: EL, from: '2026-09-22', to: '2026-09-22', fromHalf: 'full', toHalf: 'full', days: 1, status: 'approved', certificate: 'none', reason: null, createdAt: '2026-09-01T05:00:00Z', decidedAt: '2026-09-02T05:00:00Z' },
  ],
  holidays: {
    calendar: { id: 'c', name: 'Bengaluru holidays', optionalLimit: 1 },
    list: [
      { id: 'h1', on: '2026-11-09', name: 'Balipadyami', kind: 'festival', halfDay: false },
      { id: 'o1', on: '2026-11-24', name: 'Karthigai Deepam', kind: 'optional', halfDay: false, chosen: false },
      { id: 'o2', on: '2026-12-24', name: 'Christmas Eve', kind: 'optional', halfDay: false, chosen: false },
    ],
  },
};
const PLAN: LeavePlan = { type: { id: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', rules: { certificateAfterDays: null, medical: false, halfDays: true } }, days: [], total: 2, holidaysExcluded: 0, sandwichDays: 0, balance: null, balanceAfter: 17, othersOff: 1, certificateNeeded: false, blocks: [], warnings: [] };

const home = (over: Partial<LiveLeaveHome> = {}): LiveLeaveHome => ({
  state: 'ready',
  data: LEAVE,
  onPreview: vi.fn(async () => PLAN),
  onApply: vi.fn(async () => ({})),
  onWithdraw: vi.fn(async () => ({})),
  onCancel: vi.fn(async () => ({})),
  onChooseHoliday: vi.fn(async () => ({})),
  onFindPeople: vi.fn(async () => []),
  ...over,
});
const typeDate = async (field: HTMLElement, text: string) => {
  await ue.clear(field);
  await ue.type(field, text);
  await ue.tab();
};

describe('My leave (TIM-17 live)', () => {
  it('shows what is free to apply for, "taken this year" for unpaid leave, and each request with its actions', () => {
    render(<LeaveHomeScreen live={home()} />);
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByText(/days taken this year/)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'My leave requests' });
    expect(within(list).getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Ask to cancel' })).toBeInTheDocument();
    expect(screen.getByText('Balipadyami')).toBeInTheDocument();
  });

  it('loading, could not load (with retry) and no access are the design’s states', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<LeaveHomeScreen live={home({ state: 'loading', data: null })} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    rerender(<LeaveHomeScreen live={home({ state: 'error', data: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<LeaveHomeScreen live={home({ state: 'no-access', data: null })} />);
    expect(screen.queryByRole('button', { name: 'Apply leave' })).toBeNull();
  });

  it('a new joiner sees no requests yet with Apply leave', () => {
    render(<LeaveHomeScreen live={home({ data: { ...LEAVE, requests: [] } })} />);
    expect(screen.getByText('No leave requests yet')).toBeInTheDocument();
  });

  it('asked to apply while already on the page (Ctrl K, N L), the sheet opens', () => {
    const { rerender } = render(<LeaveHomeScreen live={home()} />);
    expect(screen.queryByRole('dialog', { name: 'Apply leave' })).toBeNull();
    rerender(<LeaveHomeScreen live={home({ startApplying: true })} />);
    expect(screen.getByRole('dialog', { name: 'Apply leave' })).toBeInTheDocument();
  });
});

describe('Apply leave (TIM-18 live)', () => {
  it('no errors while typing; Send too early shows what to fix; the summary comes from the server; Send calls the API', async () => {
    const live = home({ startApplying: true });
    render(<LeaveHomeScreen live={live} />);
    const sheet = screen.getByRole('dialog', { name: 'Apply leave' });
    expect(within(sheet).queryByText('Choose the first day.')).toBeNull();
    const send = within(sheet).getByRole('button', { name: 'Send request' });
    expect(send).not.toBeDisabled();
    await ue.click(send);
    expect(within(sheet).getAllByText('Choose the first day.').length).toBeGreaterThan(0);
    expect(live.onApply).not.toHaveBeenCalled();
    await typeDate(within(sheet).getByLabelText(/^From/), '20 Oct 2026');
    await typeDate(within(sheet).getByLabelText(/^To/), '21 Oct 2026');
    await waitFor(() => expect(live.onPreview).toHaveBeenCalledWith({ leaveTypeId: 'el', from: '2026-10-20', to: '2026-10-21', fromHalf: 'full', toHalf: 'full' }));
    const summary = within(sheet).getByRole('region', { name: 'Leave summary' });
    expect(await within(summary).findByText('1 other is off then')).toBeInTheDocument();
    expect(within(summary).getByText('Balance after').nextSibling?.textContent).toBe('17');
    await ue.click(send);
    await waitFor(() => expect(live.onApply).toHaveBeenCalledWith(expect.objectContaining({ leaveTypeId: 'el', from: '2026-10-20', to: '2026-10-21' })));
  });

  it('the rules refuse the dates: the reason shows on Send and nothing is sent', async () => {
    const live = home({ startApplying: true, onPreview: vi.fn(async () => ({ ...PLAN, blocks: ['Earned leave needs 3 days’ notice.'] })) });
    render(<LeaveHomeScreen live={live} />);
    const sheet = screen.getByRole('dialog', { name: 'Apply leave' });
    await typeDate(within(sheet).getByLabelText(/^From/), '10 Oct 2026');
    await within(sheet).findByText('1 other is off then');
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    expect(within(sheet).getAllByText('Earned leave needs 3 days’ notice.').length).toBeGreaterThan(0);
    expect(live.onApply).not.toHaveBeenCalled();
  });

  it('a certificate is asked for when the rules need one, and the server’s refusal stays in the sheet', async () => {
    const live = home({ startApplying: true, onPreview: vi.fn(async () => ({ ...PLAN, certificateNeeded: true })), onApply: vi.fn(async () => Promise.reject(new Error('You already have leave on 20 Oct 2026.'))) });
    render(<LeaveHomeScreen live={live} />);
    const sheet = screen.getByRole('dialog', { name: 'Apply leave' });
    await typeDate(within(sheet).getByLabelText(/^From/), '20 Oct 2026');
    await within(sheet).findByText('I will give a certificate to HR');
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    expect(within(sheet).getAllByText('Tick that you will give a certificate to HR.').length).toBeGreaterThan(0);
    await ue.click(within(sheet).getByRole('checkbox', { name: /I will give a certificate/ }));
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    expect(await within(sheet).findByText('You already have leave on 20 Oct 2026.')).toBeInTheDocument();
  });
});

describe('Leave request (TIM-19 live)', () => {
  it('asking to cancel approved leave needs a reason, then sends it', async () => {
    const live = home();
    render(<LeaveHomeScreen live={live} />);
    await ue.click(within(screen.getByRole('list', { name: 'My leave requests' })).getByRole('button', { name: 'Ask to cancel' }));
    const dialog = screen.getByRole('dialog', { name: /Ask to cancel/ });
    await ue.click(within(dialog).getByRole('button', { name: 'Ask to cancel' }));
    expect(within(dialog).getByText('Say why you are cancelling.')).toBeInTheDocument();
    expect(live.onCancel).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByLabelText(/Why/), 'Trip called off');
    await ue.click(within(dialog).getByRole('button', { name: 'Ask to cancel' }));
    await waitFor(() => expect(live.onCancel).toHaveBeenCalledWith('r2', 'Trip called off'));
  });

  it('Sent back for changes: the note shows; Change and send again starts from the request and resends it; refused, it says why', async () => {
    const back = { id: 'r3', employeeId: 'e1', type: EL, from: '2026-11-09', to: '2026-11-10', fromHalf: 'full' as const, toHalf: 'full' as const, days: 2, status: 'sent_back' as const, certificate: 'none' as const, reason: 'Cousin wedding', createdAt: '2026-10-01T05:00:00Z', decidedAt: '2026-10-02T05:00:00Z', sentBack: { reason: 'The audit runs that week. Move it by a week?', by: 'Kavya Rao', at: '2026-10-02T05:00:00Z' } };
    const onResend = vi.fn().mockRejectedValueOnce(new Error('You already have leave on 16 Nov 2026.')).mockResolvedValueOnce({});
    const live = home({ onResend, data: { ...LEAVE, requests: [back, ...LEAVE.requests] } });
    render(<LeaveHomeScreen live={live} />);
    const list = screen.getByRole('list', { name: 'My leave requests' });
    expect(within(list).getByText('Sent back for changes')).toBeInTheDocument();
    await ue.click(within(list).getAllByRole('button', { name: 'View' })[0]!);
    const drawer = await screen.findByRole('dialog', { name: /Earned leave · Arjun Kulkarni/ });
    expect(within(drawer).getByText('Kavya Rao sent it back for changes')).toBeInTheDocument();
    expect(within(drawer).getByText('The audit runs that week. Move it by a week?')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Change and send again' }));
    const sheet = await screen.findByRole('dialog', { name: 'Change and send again' });
    expect(within(sheet).getByText('Kavya Rao asked for changes')).toBeInTheDocument();
    await typeDate(within(sheet).getByLabelText(/^From/), '16 Nov 2026');
    await typeDate(within(sheet).getByLabelText(/^To/), '17 Nov 2026');
    await within(sheet).findByText('1 other is off then');
    await ue.click(within(sheet).getByRole('button', { name: 'Send again' }));
    // Negative: the server refuses (overlap): the reason stays in the sheet.
    expect(await within(sheet).findByText('You already have leave on 16 Nov 2026.')).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(onResend).toHaveBeenLastCalledWith('r3', expect.objectContaining({ leaveTypeId: 'el', from: '2026-11-16', to: '2026-11-17', reason: 'Cousin wedding' })));
    expect(live.onApply).not.toHaveBeenCalled();
  });

  it('a withdraw the server refuses says why', async () => {
    const live = home({ onWithdraw: vi.fn(async () => Promise.reject(new Error('This request was approved a moment ago; cancel it instead.'))) });
    render(<LeaveHomeScreen live={live} />);
    await ue.click(within(screen.getByRole('list', { name: 'My leave requests' })).getByRole('button', { name: 'Withdraw' }));
    await ue.click(screen.getByRole('button', { name: 'Withdraw request' }));
    expect(await screen.findByText('This request was approved a moment ago; cancel it instead.')).toBeInTheDocument();
  });
});

describe('Optional holidays (TIM-23 live)', () => {
  it('at the limit the others lock with the reason; Save sends the choice', async () => {
    const live = home();
    render(<LeaveHomeScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: /Optional holidays · 0 chosen · 1 left/ }));
    const sheet = screen.getByRole('dialog', { name: 'Optional holidays' });
    await ue.click(within(sheet).getByRole('checkbox', { name: /Karthigai Deepam/ }));
    expect(within(sheet).getByRole('checkbox', { name: /Christmas Eve/ })).toBeDisabled();
    expect(within(sheet).getByText('Limit reached · untick one to swap')).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Save choices' }));
    await waitFor(() => expect(live.onChooseHoliday).toHaveBeenCalledWith('o1', true));
  });
});

const CAL: TeamCalendar = {
  from: '2026-10-12',
  to: '2026-10-25',
  scope: 'team',
  people: [{ id: 'a', name: 'Kavya Reddy', code: null, me: false, holidays: [], days: [{ on: '2026-10-12', part: 'full', status: 'pending', code: 'SL', colour: 'orange', name: 'Sick leave' }, { on: '2026-10-13', part: 'full', status: 'pending', code: 'SL', colour: 'orange', name: 'Sick leave' }] }],
};
const team = (over: Partial<LiveTeamLeave> = {}): LiveTeamLeave => ({ state: 'ready', data: CAL, onRange: vi.fn(), approvalsHref: '/yx/approvals', onNavigate: vi.fn(), ...over });

describe('Leave calendar (TIM-20 live)', () => {
  it('marks waiting leave; Review goes to Approvals; the week arrows ask for the next range', async () => {
    const live = team();
    render(<TeamLeaveCalendarScreen live={live} />);
    expect(screen.getAllByLabelText(/Kavya Reddy, .*Sick leave · pending approval/).length).toBe(2);
    await ue.click(screen.getByRole('button', { name: 'Review' }));
    expect(live.onNavigate).toHaveBeenCalledWith('/yx/approvals');
    await ue.click(screen.getByRole('button', { name: 'Next week' }));
    expect(live.onRange).toHaveBeenCalledWith('2026-10-19', '2026-11-01');
  });

  // Batch C item 15 (answer 2509): attendance dots for the manager's own team, with the legend; a dot opens the day card.
  it('dots and legend for the people the server marks as the team; a dot opens their day card; none without attendance', async () => {
    const onOpenDay = vi.fn();
    const withDots: TeamCalendar = { ...CAL, people: [{ ...CAL.people[0]!, attendance: [{ on: '2026-10-14', dot: 'late' }, { on: '2026-10-15', dot: 'remote' }] }, { id: 'b', name: 'Ravi Kumar', code: null, me: false, holidays: [], days: [] }] };
    render(<TeamLeaveCalendarScreen live={team({ data: withDots, onOpenDay })} />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getByText('Late')).toBeInTheDocument();
    expect(within(legend).getByText('Worked from home')).toBeInTheDocument();
    expect(within(legend).queryByText('Absent')).toBeNull();
    await ue.click(screen.getByRole('button', { name: /Kavya Reddy, .*: Late\. Open the day card/ }));
    expect(onOpenDay).toHaveBeenCalledWith('a', '2026-10-14');
    expect(screen.queryByRole('button', { name: /Ravi Kumar, .*Open the day card/ })).toBeNull();
  });

  it('only dots (no leave) still shows the calendar, not "No one is away"', () => {
    render(<TeamLeaveCalendarScreen live={team({ data: { ...CAL, people: [{ ...CAL.people[0]!, days: [], attendance: [{ on: '2026-10-14', dot: 'present' }] }] } })} />);
    expect(screen.queryByText(/No one is away/)).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Legend' })).getByText('Present')).toBeInTheDocument();
  });

  it('no one away shows the empty state with the next range; no people says so', async () => {
    const live = team({ data: { ...CAL, people: [{ ...CAL.people[0]!, days: [] }] } });
    const { rerender } = render(<TeamLeaveCalendarScreen live={live} />);
    expect(screen.getByText(/No one is away/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Next 2 weeks' }));
    expect(live.onRange).toHaveBeenCalledWith('2026-10-26', '2026-11-08');
    rerender(<TeamLeaveCalendarScreen live={team({ data: { ...CAL, people: [] } })} />);
    expect(screen.getByText('No one to show')).toBeInTheDocument();
  });
});

const HR: HrBalances = {
  types: [{ id: 'el', code: 'EL', name: 'Earned leave', kind: 'earned' }],
  people: [
    { employeeId: 'p1', name: 'Meera Krishnan', code: 'KF-0007', canAdjust: true, balances: [LEAVE.balances[0]!] },
    { employeeId: 'p2', name: 'Ravi Kumar', code: 'KF-0008', canAdjust: false, balances: [LEAVE.balances[0]!] },
  ],
};
const card = (over: Partial<LiveLeaveCard> = {}): LiveLeaveCard => ({
  state: 'ready',
  data: HR,
  onLedger: vi.fn(async () => [{ id: 'l1', on: '2026-01-01', type: 'EL', kind: 'accrual', days: 18, reason: '2026 credit' }]),
  onAdjust: vi.fn(async () => ({})),
  ...over,
});

describe('Leave card (TIM-21 HR live)', () => {
  it('shows the first person’s card and ledger; Adjust too early shows the field errors; a filled one posts a signed number', async () => {
    const live = card();
    render(<LeaveCardScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'Leave card · Meera Krishnan' })).toBeInTheDocument();
    expect(await screen.findByText(/Credited \+18 EL · 2026 credit/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Adjust balance' }));
    const dialog = screen.getByRole('dialog', { name: 'Adjust balance' });
    const post = within(dialog).getByRole('button', { name: 'Post adjustment' });
    expect(post).not.toBeDisabled();
    await ue.click(post);
    expect(within(dialog).getByText('Enter the days.')).toBeInTheDocument();
    expect(live.onAdjust).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('radio', { name: 'Deduct' }));
    await ue.type(within(dialog).getByLabelText(/^Days/), '1.5');
    await ue.type(within(dialog).getByLabelText(/^Reason/), 'Leave taken without applying');
    await ue.click(post);
    await waitFor(() => expect(live.onAdjust).toHaveBeenCalledWith('p1', { leaveTypeId: 'el', days: -1.5, reason: 'Leave taken without applying' }));
  });

  it('HR who can only read gets no Adjust; the server’s refusal shows in the dialog', async () => {
    const { unmount } = render(<LeaveCardScreen live={card({ data: { ...HR, people: [HR.people[1]!] } })} />);
    expect(screen.queryByRole('button', { name: 'Adjust balance' })).toBeNull();
    unmount();
    render(<LeaveCardScreen live={card({ onAdjust: vi.fn(async () => Promise.reject(new Error('October is locked.'))) })} />);
    await ue.click(screen.getByRole('button', { name: 'Adjust balance' }));
    const dialog = screen.getByRole('dialog', { name: 'Adjust balance' });
    await ue.type(within(dialog).getByLabelText(/^Days/), '1');
    await ue.type(within(dialog).getByLabelText(/^Reason/), 'Comp-off agreed');
    await ue.click(within(dialog).getByRole('button', { name: 'Post adjustment' }));
    expect(await within(dialog).findByText('October is locked.')).toBeInTheDocument();
  });

  it('no one in scope says so', () => {
    render(<LeaveCardScreen live={card({ data: { ...HR, people: [] } })} />);
    expect(screen.getByText('No one to show')).toBeInTheDocument();
  });
});

describe('answer 2760: peers away (live)', () => {
  it('shows each day with the names of peers away, and only "away"', () => {
    render(<LeaveHomeScreen live={home({ peers: { data: { from: '2026-11-26', to: '2026-12-09', peers: 3, days: [{ on: '2026-11-27', names: ['Ravi Kumar', 'Meera Krishnan'] }] } } })} />);
    const list = screen.getByRole('list', { name: 'Peers away' });
    expect(within(list).getByText('Ravi Kumar, Meera Krishnan · away')).toBeInTheDocument();
    expect(within(list).queryByText(/leave|Sick|Casual|half|:/i)).not.toBeInTheDocument();
  });

  it('negative: no peers, or none away, say so; no data shows no card', () => {
    const { unmount } = render(<LeaveHomeScreen live={home({ peers: { data: { from: '2026-11-26', to: '2026-12-09', peers: 0, days: [] } } })} />);
    expect(screen.getByText('No one else has your manager.')).toBeInTheDocument();
    unmount();
    const second = render(<LeaveHomeScreen live={home({ peers: { data: { from: '2026-11-26', to: '2026-12-09', peers: 2, days: [] } } })} />);
    expect(screen.getByText('None of your peers is away in the next two weeks.')).toBeInTheDocument();
    second.unmount();
    render(<LeaveHomeScreen live={home()} />);
    expect(screen.queryByText('Peers away')).not.toBeInTheDocument();
  });
});
