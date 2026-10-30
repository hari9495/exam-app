import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceCalendarScreen, MusterScreen, MyAttendanceTodayScreen, type LiveMusterData, type LiveMyAttendance } from './attendance';
import type { DayCard, MyAttendance, Muster } from './live/types';

// The designed attendance screens with `live` (Me › Attendance, its clock page, and Time › Muster), as the app renders
// them: real data in, calls out. Ported from the old live copies' tests, plus the sub-pages' field errors and limits.

const ue = userEvent.setup({ pointerEventsCheck: 0 });

const ATT: MyAttendance = {
  employee: { id: 'e1', name: 'Arjun Kulkarni' },
  today: '2026-10-09',
  zone: 'Asia/Kolkata',
  mode: 'punch',
  shift: { name: 'General', start: 570, end: 1110, grace: 10, checkIn: 'restricted' },
  fences: [{ name: 'Bengaluru head office', lat: 12.97, lng: 77.59, radiusM: 150 }],
  punches: [],
  next: 'in',
  days: [
    { on: '2026-10-06', status: 'missing_out', leavePart: null, firstIn: '2026-10-06T04:01:00Z', lastOut: null, workedMinutes: null, lateMinutes: null, regularised: false },
    { on: '2026-10-07', status: 'present', leavePart: null, firstIn: '2026-10-07T04:01:00Z', lastOut: '2026-10-07T12:40:00Z', workedMinutes: 489, lateMinutes: 0, regularised: false },
  ],
  requests: [],
  regularise: { limit: 4, used: 1 },
  wfh: { limit: 4, used: 0 },
};
const DAY_6: DayCard = {
  person: { name: 'Arjun Kulkarni', code: 'KF-0142' },
  on: '2026-10-06',
  zone: 'Asia/Kolkata',
  shift: { name: 'General', start: 570, end: 1110, grace: 10 },
  day: { status: 'missing_out', leavePart: null, workedMinutes: null, lateMinutes: null, regularised: false },
  punches: [
    { id: 'p1', kind: 'in', at: '2026-10-06T04:01:00Z', source: 'web', accepted: true, refusal: null, verdict: 'network', distanceM: null, accuracyM: null, where: 'Bengaluru head office', minute: 571 },
    { id: 'p0', kind: 'in', at: '2026-10-06T03:50:00Z', source: 'mobile', accepted: false, refusal: 'Outside Bengaluru head office, 850 m away', verdict: 'outside', distanceM: 850, accuracyM: 20, where: null, minute: 560 },
  ],
};
const live = (over: Partial<LiveMyAttendance> = {}): LiveMyAttendance => ({
  state: 'ready',
  data: ATT,
  month: '2026-10',
  onMonth: vi.fn(),
  getLocation: vi.fn(async () => ({ pin: null })),
  onPunch: vi.fn(async (kind) => ({ accepted: true, duplicate: false, kind, message: 'Recorded', verdict: 'network', distanceM: null })),
  onFix: vi.fn(async () => ({})),
  onWithdrawFix: vi.fn(async () => ({})),
  onOpenDay: vi.fn(async () => DAY_6),
  now: new Date('2026-10-09T05:00:00Z'), // 10:30 am in India
  ...over,
});

describe('Me › Attendance today (live clock page)', () => {
  it('a refused check-in says why and offers to retry the location (YX-AT-23)', async () => {
    const onPunch = vi.fn(async () => ({ accepted: false, duplicate: false, kind: 'in' as const, message: 'Outside Bengaluru head office, 850 m away', verdict: 'outside', distanceM: 850 }));
    const getLocation = vi.fn(async () => ({ pin: { lat: 12.9, lng: 77.6, accuracyM: 20 } }));
    render(<MyAttendanceTodayScreen live={live({ onPunch, getLocation })} />);
    await ue.click(screen.getByRole('button', { name: 'Clock in' }));
    expect(await screen.findByText('Outside Bengaluru head office, 850 m away')).toBeInTheDocument();
    expect(onPunch).toHaveBeenCalledWith('in', { lat: 12.9, lng: 77.6, accuracyM: 20 });
    await ue.click(screen.getByRole('button', { name: 'Retry location' }));
    await waitFor(() => expect(getLocation).toHaveBeenCalledTimes(2));
  });

  it("breaks: End break while on one; today's punches name them", async () => {
    const at = (id: string, kind: 'in' | 'break_start', iso: string) => ({ id, kind, at: iso, source: 'web', accepted: true, refusal: null, verdict: 'network', distanceM: null, accuracyM: null, where: 'Bengaluru head office' });
    const onPunch = vi.fn(async () => ({ accepted: true, duplicate: false, kind: 'break_end' as const, message: 'Break ended', verdict: 'network', distanceM: null }));
    render(<MyAttendanceTodayScreen live={live({ onPunch, data: { ...ATT, next: 'out', onBreak: true, punches: [at('p1', 'in', '2026-10-09T03:58:00Z'), at('p2', 'break_start', '2026-10-09T04:50:00Z')] } })} />);
    expect(within(screen.getByRole('list', { name: 'Punches' })).getByText('Break start')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'End break' }));
    await waitFor(() => expect(onPunch).toHaveBeenCalledWith('break_end', null));
  });

  it('OutsideNetwork: off the office network the card says so before any punch; Check again asks the server again', async () => {
    const onRetry = vi.fn();
    const onPunch = vi.fn();
    render(<MyAttendanceTodayScreen live={live({ onRetry, onPunch, data: { ...ATT, network: 'outside', wfhSameDay: false } })} />);
    expect(screen.getByText('Not on Bengaluru head office Wi-Fi')).toBeInTheDocument();
    expect(screen.getByText('Connect to the office network, then check again.')).toBeInTheDocument();
    // Negative: no work-from-home or on-duty way round when the company does not allow it.
    expect(screen.queryByRole('button', { name: 'Clock in as WFH' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clock in on duty' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Clock in' }));
    expect(onPunch).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('ChoseWfh: outside, Clock in as WFH shows who approves and this month; Clock in sends it as work from home', async () => {
    const onPunch = vi.fn(async () => ({ accepted: true, duplicate: false, kind: 'in' as const, message: 'Checked in. Working from home today, location recorded', verdict: 'field', distanceM: null }));
    render(<MyAttendanceTodayScreen live={live({ onPunch, data: { ...ATT, network: 'outside', wfhSameDay: true, manager: 'Kavya Rao', wfh: { limit: 4, used: 1 } } })} />);
    await ue.click(screen.getByRole('button', { name: 'Clock in as WFH' }));
    expect(screen.getByText("WFH · needs Kavya Rao's approval · 1 of 4 used this month")).toBeInTheDocument();
    expect(screen.queryByText('Not on Bengaluru head office Wi-Fi')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Clock in' }));
    await waitFor(() => expect(onPunch).toHaveBeenCalledWith('in', null, { wfh: true }));
  });

  it('ShiftNotStarted: before check-in opens the card says when; inside the window it lets you clock in', async () => {
    const onPunch = vi.fn(async () => ({ accepted: true, duplicate: false, kind: 'in' as const, message: 'Checked in', verdict: 'network', distanceM: null }));
    const early = new Date('2026-10-09T02:20:00Z'); // 7:50 am in India; the shift starts 9:30, check-in opens 8:30
    const { unmount } = render(<MyAttendanceTodayScreen live={live({ onPunch, now: early, data: { ...ATT, shift: { ...ATT.shift, opensBefore: 60 } } })} />);
    expect(screen.getByText('Your shift has not started yet')).toBeInTheDocument();
    expect(screen.getByText('General shift starts at 9:30 am. Clock-in opens at 8:30 am.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Clock in' }));
    expect(onPunch).not.toHaveBeenCalled();
    unmount();
    render(<MyAttendanceTodayScreen live={live({ onPunch, now: new Date('2026-10-09T03:05:00Z'), data: { ...ATT, shift: { ...ATT.shift, opensBefore: 60 } } })} />);
    expect(screen.queryByText('Your shift has not started yet')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Clock in' }));
    await waitFor(() => expect(onPunch).toHaveBeenCalledWith('in', null));
  });

  it('the rules come from the server; a day to fix is offered', async () => {
    render(<MyAttendanceTodayScreen live={live()} />);
    expect(screen.getByText('1 of 4 used this month')).toBeInTheDocument();
    expect(screen.getByText(/Bengaluru head office \(within 150 m\)/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Fix 6 Oct 2026' }));
    expect(screen.getByRole('dialog', { name: 'New attendance request' })).toBeInTheDocument();
  });
});

describe('Me › Attendance (live calendar)', () => {
  it('shows my month in the design codes; the next month at the limit says why instead of moving', async () => {
    const onMonth = vi.fn();
    render(<AttendanceCalendarScreen live={live({ onMonth })} />);
    expect(screen.getByRole('button', { name: /6 Oct 2026: Missing check-out/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /7 Oct 2026: Present/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Next month' }));
    expect((await screen.findAllByText('November 2026 has not started yet.')).length).toBeGreaterThan(0);
    expect(onMonth).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onMonth).toHaveBeenCalledWith('2026-09');
  });

  it('a day opens its day card with every punch, a refused one with its reason; Fix this day opens the request', async () => {
    const l = live();
    render(<AttendanceCalendarScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: /6 Oct 2026: Missing check-out/ }));
    expect(l.onOpenDay).toHaveBeenCalledWith('2026-10-06');
    expect(await screen.findByText('Not recorded: Outside Bengaluru head office, 850 m away')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Fix this day' }));
    expect(await screen.findByRole('dialog', { name: 'New attendance request' })).toBeInTheDocument();
  });

  it('a day card that cannot load says why and retries', async () => {
    const onOpenDay = vi.fn().mockRejectedValueOnce(new Error('You moved teams on 5 Oct.')).mockResolvedValue(DAY_6);
    render(<AttendanceCalendarScreen live={live({ onOpenDay })} />);
    await ue.click(screen.getByRole('button', { name: /7 Oct 2026: Present/ }));
    expect(await screen.findByText('You moved teams on 5 Oct.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    await waitFor(() => expect(onOpenDay).toHaveBeenCalledTimes(2));
  });

  it('work from home: Send pressed early shows the missing reason (never a disabled button), shows the effect, sends, then a toast', async () => {
    const onWfh = vi.fn(async () => undefined);
    render(<AttendanceCalendarScreen live={live({ onWfh })} />);
    await ue.click(screen.getByRole('button', { name: 'Request work from home' }));
    const sheet = screen.getByRole('dialog', { name: 'Request work from home' });
    expect(within(sheet).getByText('Goes to your manager')).toBeInTheDocument();
    expect(within(sheet).getByText('Work from home · counts as present')).toBeInTheDocument();
    expect(within(sheet).getByText('This will be work-from-home day 1 of 4 in October.')).toBeInTheDocument();
    const send = within(sheet).getByRole('button', { name: 'Send request' });
    expect(send).not.toBeDisabled();
    await ue.click(send);
    expect(onWfh).not.toHaveBeenCalled();
    expect(within(sheet).getAllByText('Enter a reason').length).toBeGreaterThan(1);
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Plumber visit');
    await ue.click(send);
    await waitFor(() => expect(onWfh).toHaveBeenCalledWith({ on: '2026-10-09', reason: 'Plumber visit' }));
    expect(await screen.findByText('Sent to your manager')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Request work from home' })).toBeNull());
  });

  it('work from home over the monthly limit goes to HR too; a refusal from the server says why', async () => {
    const onWfh = vi.fn(async () => {
      throw new Error('Wed 14 Oct is a holiday (Founders Day).');
    });
    render(<AttendanceCalendarScreen live={live({ data: { ...ATT, wfh: { limit: 4, used: 4 } }, onWfh, defaultRequest: 'wfh' })} />);
    const sheet = screen.getByRole('dialog', { name: 'Request work from home' });
    expect(within(sheet).getByText('Goes to your manager, then HR')).toBeInTheDocument();
    expect(within(sheet).getByText('Approval: Your manager → HR')).toBeInTheDocument();
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Family function');
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    expect(await within(sheet).findByText('Wed 14 Oct is a holiday (Founders Day).')).toBeInTheDocument();
  });

  it('fixing a missing check-out needs the time and a reason, then goes for approval', async () => {
    const onFix = vi.fn(async () => ({}));
    render(<AttendanceCalendarScreen live={live({ onFix })} />);
    await ue.click(screen.getByRole('button', { name: 'Fix 6 Oct 2026' }));
    const sheet = screen.getByRole('dialog', { name: 'New attendance request' });
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    expect(within(sheet).getAllByText('Enter the check-out time').length).toBeGreaterThan(0);
    expect(onFix).not.toHaveBeenCalled();
    await ue.type(within(sheet).getByLabelText(/Check-out/), '18:10');
    fireEvent.blur(within(sheet).getByLabelText(/Check-out/));
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Forgot to check out');
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onFix).toHaveBeenCalledWith({ on: '2026-10-06', kind: 'missed_out', outMinute: 1090, reason: 'Forgot to check out' }));
  });

  it('a day that has nothing to fix says so on the date', async () => {
    render(<AttendanceCalendarScreen live={live({ data: { ...ATT, days: [...ATT.days, { on: '2026-10-04', status: 'weekly_off', leavePart: null, workedMinutes: null, lateMinutes: null, regularised: false }] } })} />);
    await ue.click(screen.getByRole('button', { name: 'Regularise a day' }));
    const sheet = screen.getByRole('dialog', { name: 'New attendance request' });
    const date = within(sheet).getByRole('textbox', { name: 'Date' });
    await ue.clear(date);
    await ue.type(date, '4 Oct 2026');
    fireEvent.blur(date);
    expect(await within(sheet).findAllByText('4 Oct 2026 is a weekly off: nothing to fix')).not.toHaveLength(0);
  });

  it('a waiting request can be withdrawn after a confirm', async () => {
    const onWithdrawFix = vi.fn(async () => ({}));
    render(<AttendanceCalendarScreen live={live({ onWithdrawFix, data: { ...ATT, requests: [{ id: 'r1', on: '2026-10-06', kind: 'missed_out', inMinute: null, outMinute: 1090, reason: 'Forgot', status: 'pending' }] } })} />);
    const card = screen.getByRole('list', { name: 'Waiting for approval' });
    expect(within(card).getByText('6 Oct 2026 · Regularisation')).toBeInTheDocument();
    await ue.click(within(card).getByRole('button', { name: 'Withdraw' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Withdraw request' }));
    await waitFor(() => expect(onWithdrawFix).toHaveBeenCalledWith('r1'));
  });

  it('load states: loading, could not load with retry, no access', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<AttendanceCalendarScreen live={live({ state: 'loading', data: null })} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    rerender(<AttendanceCalendarScreen live={live({ state: 'error', data: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<AttendanceCalendarScreen live={live({ state: 'no-access', data: null })} />);
    expect(screen.queryByRole('button', { name: 'Regularise a day' })).toBeNull();
  });

  it('night work: opt in, confirm a consent with a one-time code (pressed early it asks for the code), withdraw it', async () => {
    const night = { byRecord: false, optedIn: false, optedInSince: null, consents: [{ id: 'c1', location: 'Hosur plant', givenOn: '2026-10-01', withdrawnOn: null, reference: 'Form 14', confirmedAt: null }] };
    const onNightOptIn = vi.fn(async () => ({}));
    const onNightCode = vi.fn(async () => ({ sentTo: 'your work email', expiresInSeconds: 300, resendAfterSeconds: 60 }));
    const onNightConfirm = vi.fn(async () => ({}));
    const onNightWithdraw = vi.fn(async () => ({}));
    render(<AttendanceCalendarScreen live={live({ night, onNightOptIn, onNightCode, onNightConfirm, onNightWithdraw })} />);
    await ue.click(screen.getByRole('switch', { name: 'Night-work protection' }));
    expect(onNightOptIn).toHaveBeenCalledWith(true);
    await ue.click(screen.getByRole('button', { name: 'Confirm with a code' }));
    expect(onNightCode).toHaveBeenCalledWith('c1');
    const confirm = await screen.findByRole('button', { name: 'Confirm my consent' });
    await ue.click(confirm);
    expect(onNightConfirm).not.toHaveBeenCalled();
    expect(screen.getAllByText('Enter the 6-digit code').length).toBeGreaterThan(0);
    await ue.type(screen.getByLabelText(/The 6-digit code sent to your work email/), '12a3456');
    await ue.click(confirm);
    await waitFor(() => expect(onNightConfirm).toHaveBeenCalledWith('c1', '123456'));
    await ue.click(screen.getByRole('button', { name: 'Withdraw' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(onNightWithdraw).toHaveBeenCalledWith('c1'));
  });

  it('night work: covered by the record, so no switch to turn it off', () => {
    render(<AttendanceCalendarScreen live={live({ night: { byRecord: true, optedIn: false, optedInSince: null, consents: [] }, onNightOptIn: vi.fn() })} />);
    expect(screen.getByText(/The night-work protection applies to you/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('Time › Muster (live)', () => {
  const data: Muster = {
    month: '2026-10',
    from: '2026-10-01',
    to: '2026-10-31',
    scope: 'granted',
    people: [
      { id: 'k', name: 'Kavya Reddy', code: 'KFT-0031', location: 'Hosur plant', me: false, mode: 'punch', missingPunchEffect: 'block_payroll_approval', days: [{ on: '2026-10-01', status: 'present', leavePart: null, workedMinutes: 490, lateMinutes: null, regularised: false }, { on: '2026-10-02', status: 'missing_in', leavePart: null, workedMinutes: null, lateMinutes: null, regularised: false }] },
    ],
  };
  const card: DayCard = { person: { name: 'Kavya Reddy', code: null }, on: '2026-10-01', zone: 'Asia/Kolkata', shift: { name: 'Day', start: 540, end: 1080, grace: 10 }, day: { status: 'present', leavePart: null, workedMinutes: 490, lateMinutes: null, regularised: false }, punches: [{ id: 'p', kind: 'in', at: '2026-10-01T02:31:00Z', source: 'web', accepted: true, refusal: null, verdict: 'inside', distanceM: 40, accuracyM: 18, where: 'Hosur plant', minute: 481 }] };
  const muster = (over: Partial<LiveMusterData> = {}): LiveMusterData => ({ state: 'ready', data, month: '2026-10', onMonth: vi.fn(), onOpenDay: vi.fn(async () => card), today: '2026-10-03', ...over });

  it('shows the month with totals and the days to fix; a cell opens the day card with each punch (YX-AT-15)', async () => {
    const l = muster();
    render(<MusterScreen live={l} />);
    expect(screen.getByText('Muster · October 2026')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(l.onMonth).toHaveBeenCalledWith('2026-09');
    expect(screen.getByText('1 day to fix')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Kavya Reddy, 1 Oct 2026: Present/ }));
    expect(l.onOpenDay).toHaveBeenCalledWith('k', '2026-10-01');
    expect(await screen.findByText(/40 m from centre/)).toBeInTheDocument();
    // Read only: no fix, resolve or nudge buttons that would do nothing.
    expect(screen.queryByRole('button', { name: /Resolve with reason|Nudge to fix/ })).toBeNull();
  });

  it('a day that cannot be opened says why', async () => {
    render(<MusterScreen live={muster({ onOpenDay: vi.fn(async () => { throw new Error('This person moved out of your team on 20 Oct.'); }) })} />);
    await ue.click(screen.getByRole('button', { name: /Kavya Reddy, 2 Oct 2026: Missing check-in/ }));
    expect(await screen.findByText('This person moved out of your team on 20 Oct.')).toBeInTheDocument();
  });

  it('no one to show, and could not load', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<MusterScreen live={muster({ data: { ...data, people: [] } })} />);
    expect(screen.getByText('No one on the muster')).toBeInTheDocument();
    rerender(<MusterScreen live={muster({ state: 'error', data: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
