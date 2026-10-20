import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NightWorkCard } from './my-attendance';
import { AttendanceCalendarScreen, type LiveMyAttendance } from '../attendance';
import { TimeSetupScreen } from './setup';
import { LeaveHomeScreen, TeamLeaveCalendarScreen } from '../leave';
import { MusterScreen } from '../attendance';
import { LeaveReportsScreen } from '../ops';
import type { HrBalances, LeavePlan, MyAttendance, MyLeave, Muster, TeamCalendar, TimeSetup } from './types';
import { ToastProvider } from '../../../components/notify';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

const LEAVE: MyLeave = {
  employee: { id: 'e1', name: 'Arjun Kulkarni', code: 'KF-0142' },
  today: '2026-10-09',
  year: { start: '2026-01-01', end: '2026-12-31' },
  balances: [
    { leaveTypeId: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', colour: 'blue', paid: true, hasBalance: true, balance: 21, pending: 0, available: 21, takenThisYear: 0, entitlement: 18, negativeLimit: 0 },
    { leaveTypeId: 'lop', code: 'LOP', name: 'Leave without pay', kind: 'lop', colour: 'grey', paid: false, hasBalance: false, balance: 0, pending: 0, available: 0, takenThisYear: 2, entitlement: null, negativeLimit: 0 },
  ],
  requests: [
    { id: 'r1', employeeId: 'e1', type: { id: 'el', code: 'EL', name: 'Earned leave', colour: 'blue', medical: false }, from: '2026-10-20', to: '2026-10-21', fromHalf: 'full', toHalf: 'full', days: 2, status: 'pending', certificate: 'none', reason: null, createdAt: '', decidedAt: null },
    { id: 'r2', employeeId: 'e1', type: { id: 'el', code: 'EL', name: 'Earned leave', colour: 'blue', medical: false }, from: '2026-09-22', to: '2026-09-22', fromHalf: 'full', toHalf: 'full', days: 1, status: 'approved', certificate: 'none', reason: null, createdAt: '', decidedAt: null },
  ],
  holidays: { calendar: { id: 'c', name: 'Bengaluru holidays', optionalLimit: 2 }, list: [{ id: 'h1', on: '2026-11-09', name: 'Balipadyami', kind: 'festival', halfDay: false }, { id: 'h2', on: '2026-12-01', name: 'Optional one', kind: 'optional', halfDay: false, chosen: false }] },
};

const PLAN: LeavePlan = { type: { id: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', rules: { certificateAfterDays: null, medical: false, halfDays: true } }, days: [], total: 2, holidaysExcluded: 0, sandwichDays: 0, balance: null, balanceAfter: 19, othersOff: 1, certificateNeeded: false, blocks: [], warnings: [] };


const leaveLive = () => ({
  state: 'ready' as const,
  data: LEAVE,
  onPreview: vi.fn(async () => PLAN),
  onApply: vi.fn(async () => ({})),
  onWithdraw: vi.fn(async () => ({})),
  onCancel: vi.fn(async () => ({})),
  onChooseHoliday: vi.fn(async () => ({})),
  onFindPeople: vi.fn(async () => []),
});
const typeDate = async (field: HTMLElement, text: string) => {
  await ue.type(field, text);
  fireEvent.blur(field);
};

describe('Me › Leave (the designed TIM-17 leave home)', () => {
  it('shows the balance to apply for, "taken this year" for unpaid leave (YX-LV-14), and each request with its next step', () => {
    render(<ToastProvider><LeaveHomeScreen live={leaveLive()} /></ToastProvider>);
    expect(screen.getByRole('heading', { name: 'My leave' })).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText(/taken this year/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask to cancel' })).toBeInTheDocument();
    expect(screen.getByText('Balipadyami')).toBeInTheDocument();
  });

  it('applying: Send waits for the dates and a reason (never red while typing); the summary comes from the server; then a toast', async () => {
    const p = leaveLive();
    render(<ToastProvider><LeaveHomeScreen live={p} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Apply leave' }));
    const dialog = screen.getByRole('dialog', { name: 'Apply leave' });
    expect(within(dialog).getByRole('button', { name: 'Send request' })).toBeDisabled();
    expect(within(dialog).getByText('Choose the dates')).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await typeDate(within(dialog).getByLabelText(/^From/), '20 Oct 2026');
    await typeDate(within(dialog).getByLabelText(/^To/), '21 Oct 2026');
    await waitFor(() => expect(p.onPreview).toHaveBeenCalledWith({ leaveTypeId: 'el', from: '2026-10-20', to: '2026-10-21', fromHalf: 'full', toHalf: 'full' }));
    expect(await within(dialog).findByText('19')).toBeInTheDocument();
    expect(within(dialog).getByText(/1 other off then/)).toBeInTheDocument();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Family function');
    await ue.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(p.onApply).toHaveBeenCalledWith(expect.objectContaining({ leaveTypeId: 'el', from: '2026-10-20', to: '2026-10-21', reason: 'Family function' })));
    expect((await screen.findAllByText('Earned leave 20–21 Oct sent to your manager')).length).toBeGreaterThan(0);
  });

  it('asking to cancel approved leave needs a reason, then sends it', async () => {
    const p = leaveLive();
    render(<ToastProvider><LeaveHomeScreen live={p} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Ask to cancel' }));
    const confirm = screen.getAllByRole('dialog').at(-1)!;
    expect(within(confirm).getByRole('button', { name: 'Send cancellation' })).toBeDisabled();
    await ue.type(within(confirm).getByRole('textbox', { name: /Why/ }), 'Trip called off');
    await ue.click(within(confirm).getByRole('button', { name: 'Send cancellation' }));
    await waitFor(() => expect(p.onCancel).toHaveBeenCalledWith('r2', 'Trip called off'));
  });

  it('optional holidays: tick one and save', async () => {
    const p = leaveLive();
    render(<ToastProvider><LeaveHomeScreen live={p} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: /Optional holidays · 0 chosen · 2 left/ }));
    const panel = screen.getByRole('dialog', { name: 'Optional holidays' });
    await ue.click(within(panel).getByRole('checkbox', { name: /Optional one/ }));
    await ue.click(within(panel).getByRole('button', { name: 'Save choices' }));
    await waitFor(() => expect(p.onChooseHoliday).toHaveBeenCalledWith('h2', true));
  });
});

const ATT: MyAttendance = {
  employee: { id: 'e1', name: 'Arjun' },
  today: '2026-10-09',
  zone: 'Asia/Kolkata',
  mode: 'punch',
  shift: { name: 'General', start: 570, end: 1110, grace: 10, checkIn: 'restricted' },
  fences: [{ name: 'Bengaluru head office', lat: 12.97, lng: 77.59, radiusM: 150 }],
  punches: [],
  next: 'in',
  days: [{ on: '2026-10-06', status: 'missing_out', leavePart: null, firstIn: '2026-10-06T04:01:00Z', lastOut: null, workedMinutes: null, lateMinutes: null, regularised: false }],
  requests: [],
  regularise: { limit: 4, used: 1 },
  wfh: { limit: 4, used: 0 },
};

const attLive = (over: Partial<LiveMyAttendance> = {}): LiveMyAttendance => ({
  state: 'ready',
  data: ATT,
  month: '2026-10',
  onMonth: vi.fn(),
  onOpenDay: vi.fn(async () => ({ person: { name: 'Arjun', code: null }, on: '2026-10-06', zone: 'Asia/Kolkata', shift: { name: 'General', start: 570, end: 1110, grace: 10 }, day: null, punches: [] })),
  onFix: vi.fn(async () => ({})),
  onWfh: vi.fn(async () => ({})),
  onWithdraw: vi.fn(async () => ({})),
  ...over,
});

describe('Me › Attendance (the designed calendar)', () => {
  it('work from home: the designed request drawer says what Send needs (never red), shows the effect, sends, then a toast', async () => {
    const live = attLive();
    render(<ToastProvider><AttendanceCalendarScreen live={live} /></ToastProvider>);
    expect(screen.getByRole('heading', { name: 'My attendance' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Regularise a day' }));
    const sheet = screen.getByRole('dialog', { name: 'New attendance request' });
    await ue.click(within(sheet).getByRole('radio', { name: 'WFH' }));
    expect(within(sheet).getByText('Work from home · counts as present')).toBeInTheDocument();
    expect(within(sheet).getByText('This will be WFH day 1 of 4 in October.')).toBeInTheDocument();
    expect(within(sheet).getByText('Enter a reason')).toBeInTheDocument();
    expect(within(sheet).queryByRole('alert')).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Send request' })).toBeDisabled();
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Plumber visit');
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(live.onWfh).toHaveBeenCalledWith({ on: '2026-10-10', reason: 'Plumber visit' }));
    expect((await screen.findAllByText('Work from home for 10 Oct sent to your manager')).length).toBeGreaterThan(0);
  });

  it('work from home over the monthly limit goes to HR too; a refusal from the server says why', async () => {
    const live = attLive({ data: { ...ATT, wfh: { limit: 4, used: 4 } }, onWfh: vi.fn(async () => { throw new Error('Sat 10 Oct is your weekly off.'); }) });
    render(<ToastProvider><AttendanceCalendarScreen live={live} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Regularise a day' }));
    const sheet = screen.getByRole('dialog', { name: 'New attendance request' });
    await ue.click(within(sheet).getByRole('radio', { name: 'WFH' }));
    expect(within(sheet).getByText('Goes to your manager, then HR')).toBeInTheDocument();
    expect(within(sheet).getByText('Approval: your manager → HR')).toBeInTheDocument();
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Family function');
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    expect(await within(sheet).findByText('Sat 10 Oct is your weekly off.')).toBeInTheDocument();
  });

  it('fixing a missing check-out: the alert offers the day, the drawer needs the time and a reason, then it goes for approval', async () => {
    const live = attLive();
    render(<ToastProvider><AttendanceCalendarScreen live={live} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Fix 6 Oct' }));
    const sheet = screen.getByRole('dialog', { name: 'New attendance request' });
    expect(within(sheet).getByRole('button', { name: 'Send request' })).toBeDisabled();
    const out = within(sheet).getByLabelText(/Check-out/);
    await ue.type(out, '6:10 pm');
    fireEvent.blur(out);
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Forgot to check out');
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(live.onFix).toHaveBeenCalledWith({ on: '2026-10-06', kind: 'missed_out', outMinute: 1090, reason: 'Forgot to check out' }));
  });

  it('night work: opt in to the protection, confirm a consent with a one-time code, withdraw it (founder decisions 9 Oct 2026)', async () => {
    const night = { byRecord: false, optedIn: false, optedInSince: null, consents: [{ id: 'c1', location: 'Hosur plant', givenOn: '2026-10-01', withdrawnOn: null, reference: 'Form 14', confirmedAt: null }] };
    const onNightOptIn = vi.fn(async () => ({}));
    const onNightCode = vi.fn(async () => ({ sentTo: 'your work email', expiresInSeconds: 300, resendAfterSeconds: 60 }));
    const onNightConfirm = vi.fn(async () => ({}));
    const onNightWithdraw = vi.fn(async () => ({}));
    render(<NightWorkCard night={night} onNightOptIn={onNightOptIn} onNightCode={onNightCode} onNightConfirm={onNightConfirm} onNightWithdraw={onNightWithdraw} />);
    await ue.click(screen.getByRole('switch', { name: 'Night-work protection' }));
    expect(onNightOptIn).toHaveBeenCalledWith(true);
    expect(screen.getByText('Needs your confirmation')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Confirm with a code' }));
    expect(onNightCode).toHaveBeenCalledWith('c1');
    const confirm = await screen.findByRole('button', { name: 'Confirm my consent' });
    expect(confirm).toBeDisabled();
    await ue.type(screen.getByLabelText(/The 6-digit code sent to your work email/), '12a3456');
    await ue.click(confirm);
    await waitFor(() => expect(onNightConfirm).toHaveBeenCalledWith('c1', '123456'));
    await ue.click(screen.getByRole('button', { name: 'Withdraw' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(onNightWithdraw).toHaveBeenCalledWith('c1'));
  });

  it('night work: covered by the record, so no switch to turn it off', () => {
    render(<NightWorkCard night={{ byRecord: true, optedIn: false, optedInSince: null, consents: [] }} onNightOptIn={vi.fn()} />);
    expect(screen.getByText(/The night-work protection applies to you/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('Team and HR', () => {
  it('the designed leave reports list balances per type and open a leave card where HR adjusts with a reason', async () => {
    const row = { leaveTypeId: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', colour: 'blue', paid: true, hasBalance: true, balance: 12, pending: 0, available: 12, takenThisYear: 3, entitlement: 15, negativeLimit: 0 };
    const data: HrBalances = { types: [{ id: 'el', code: 'EL', name: 'Earned leave', kind: 'earned' }], people: [{ employeeId: 'k', name: 'Kavya Reddy', code: 'KFT-0031', canAdjust: true, balances: [row] }] };
    const onLedger = vi.fn(async () => [{ id: 'l1', on: '2026-01-01', type: 'Earned leave', kind: 'accrual', days: 15, reason: 'Year credit' }]);
    const onAdjust = vi.fn(async () => ({}));
    render(<ToastProvider><LeaveReportsScreen live={{ state: 'ready', data, today: '2026-10-20', onLedger, onAdjust }} /></ToastProvider>);
    expect(screen.getByRole('heading', { name: 'Leave reports' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Earned/ })).toBeInTheDocument();
    await ue.click(screen.getByText('Kavya Reddy'));
    const card = await screen.findByRole('dialog', { name: /Leave card · Kavya Reddy/ });
    expect(await within(card).findByText(/credited \+15 Earned leave/)).toBeInTheDocument();
    await ue.click(within(card).getByRole('button', { name: 'Adjust balance' }));
    const adjust = screen.getByRole('dialog', { name: 'Adjust balance' });
    expect(within(adjust).getByRole('button', { name: 'Post adjustment' })).toBeDisabled();
    await ue.type(within(adjust).getByRole('textbox', { name: /Reason/ }), 'Joined mid-year');
    await ue.click(within(adjust).getByRole('button', { name: 'Post adjustment' }));
    await waitFor(() => expect(onAdjust).toHaveBeenCalledWith('k', { leaveTypeId: 'el', days: 2, reason: 'Joined mid-year' }));
  });

  it('the designed leave calendar marks leave, waiting requests and each person’s weekly off', async () => {
    const onRange = vi.fn();
    const data: TeamCalendar = { from: '2026-10-12', to: '2026-10-25', scope: 'team', people: [{ id: 'a', name: 'Kavya Reddy', code: null, me: false, department: 'Production', location: 'Hosur plant', offs: ['2026-10-18'], holidays: [], days: [{ on: '2026-10-13', part: 'full', status: 'pending', code: 'SL', colour: 'orange', name: 'Sick leave' }] }] };
    render(<TeamLeaveCalendarScreen live={{ state: 'ready', data, today: '2026-10-12', onRange, onReview: vi.fn() }} />);
    expect(screen.getByRole('heading', { name: 'Leave calendar' })).toBeInTheDocument();
    expect(onRange).toHaveBeenCalledWith('2026-10-12', '2026-10-25');
    expect(screen.getByLabelText(/Kavya Reddy, .*: Sick leave · pending approval/)).toHaveTextContent('SL');
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Next week' }));
    expect(onRange).toHaveBeenLastCalledWith('2026-10-19', '2026-11-01');
  });

  it('the designed muster shows leave codes and opens the designed day card with each punch (YX-AT-15)', async () => {
    const base = { leavePart: null, lateMinutes: null, regularised: false, leave: null, ot: null, waiting: false, wfh: false };
    const data: Muster = {
      month: '2026-10',
      from: '2026-10-01',
      to: '2026-10-31',
      scope: 'granted',
      people: [{ id: 'k', name: 'Kavya Reddy', code: 'KFT-0031', location: 'Hosur plant', me: false, mode: 'punch', missingPunchEffect: 'block_payroll_approval', days: [{ ...base, on: '2026-10-01', status: 'present', workedMinutes: 490 }, { ...base, on: '2026-10-02', status: 'leave', workedMinutes: null, leave: { code: 'CO', name: 'Comp-off' } }] }],
    };
    const onOpenDay = vi.fn(async () => ({ person: { name: 'Kavya Reddy', code: null }, on: '2026-10-01', zone: 'Asia/Kolkata', shift: { name: 'Morning', start: 360, end: 840, grace: 10 }, day: { status: 'present' as const, leavePart: null, workedMinutes: 490, lateMinutes: null, regularised: false }, punches: [{ id: 'p', kind: 'in' as const, at: '2026-10-01T02:31:00Z', source: 'web', accepted: true, refusal: null, verdict: 'inside', distanceM: 40, accuracyM: 18, where: 'Hosur plant', minute: 481 }] }));
    render(<MusterScreen live={{ state: 'ready', data, today: '2026-10-03', month: '2026-10', onOpenDay }} />);
    expect(screen.getByRole('heading', { name: 'Muster · October 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kavya Reddy, .*2 Oct 2026: Comp-off/ })).toHaveTextContent('CO');
    expect(screen.queryByRole('button', { name: 'Freeze inputs' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Kavya Reddy, .*1 Oct 2026: Present/ }));
    expect(onOpenDay).toHaveBeenCalledWith('k', '2026-10-01');
    expect(await screen.findByText(/At Hosur plant \(40 m from centre\)/)).toBeInTheDocument();
  });

  it('set-up shows the legal minimums and refuses a bad code only on save', async () => {
    const data: TimeSetup = { today: '2026-10-09', types: [], policies: [], calendars: [], locations: [], entities: [], statutory: [{ jurisdiction: 'IN-KA', version: '1', validFrom: '2000-01-01', values: { floors: [{ kinds: ['earned'], days: 18 }] }, source: '', verify: true }] };
    const onSaveType = vi.fn(async () => ({}));
    render(<TimeSetupScreen state="ready" data={data} onSaveType={onSaveType} onCreatePolicy={vi.fn()} onAddVersion={vi.fn()} onAssign={vi.fn()} onRemoveAssignment={vi.fn()} onCreateCalendar={vi.fn()} onAddHoliday={vi.fn()} onRemoveHoliday={vi.fn()} onSetRule={vi.fn()} onYearEndPreview={vi.fn()} onYearEndRun={vi.fn()} />);
    await ue.click(screen.getByRole('tab', { name: 'Policies' }));
    expect(screen.getByText(/Karnataka: Earned 18 days a year/)).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Leave types' }));
    await ue.click(screen.getByRole('button', { name: 'Add a leave type' }));
    const dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByLabelText(/Code/), 'el1');
    expect(within(dialog).queryByText(/Use 1 to 8 capital letters/)).not.toBeInTheDocument();
    await ue.type(within(dialog).getByLabelText(/^Name/), 'Earned leave');
    await ue.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaveType).toHaveBeenCalledWith(null, expect.objectContaining({ code: 'EL1', name: 'Earned leave', kind: 'earned', paid: true })));
  });
});
