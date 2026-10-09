import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MyAttendanceScreen } from './my-attendance';
import { MyLeaveScreen } from './my-leave';
import { TimeSetupScreen } from './setup';
import { MusterScreen, TeamLeaveScreen } from './team';
import type { LeavePlan, MyAttendance, MyLeave, Muster, TimeSetup } from './types';

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

const leaveProps = () => ({
  state: 'ready' as const,
  data: LEAVE,
  onPreview: vi.fn(async () => PLAN),
  onApply: vi.fn(async () => ({})),
  onWithdraw: vi.fn(async () => ({})),
  onCancel: vi.fn(async () => ({})),
  onChooseHoliday: vi.fn(async () => ({})),
  onFindPeople: vi.fn(async () => []),
});

describe('Me › Leave', () => {
  it('shows the balance to apply for, and "taken this year" for unpaid leave (YX-LV-14)', () => {
    render(<MyLeaveScreen {...leaveProps()} />);
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText(/taken this year/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel leave' })).toBeInTheDocument();
  });

  it('no errors while typing; the live summary comes from the server; sending calls the API', async () => {
    const p = leaveProps();
    render(<MyLeaveScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Apply for leave' }));
    const dialog = screen.getByRole('dialog');
    // Sending with nothing chosen shows what to fix only now.
    expect(within(dialog).queryByText('Choose the first day.')).not.toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    expect(within(dialog).getAllByText('Choose the first day.').length).toBeGreaterThan(0);
    fireEvent.change(within(dialog).getByLabelText(/First day/), { target: { value: '2026-10-20' } });
    fireEvent.change(within(dialog).getByLabelText(/Last day/), { target: { value: '2026-10-21' } });
    await waitFor(() => expect(p.onPreview).toHaveBeenCalledWith({ leaveTypeId: 'el', from: '2026-10-20', to: '2026-10-21', fromHalf: 'full', toHalf: 'full' }));
    expect(await within(dialog).findByText('1 other is off then')).toBeInTheDocument();
    expect(within(dialog).getByText('19')).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(p.onApply).toHaveBeenCalledWith(expect.objectContaining({ leaveTypeId: 'el', from: '2026-10-20', to: '2026-10-21' })));
  });

  it('cancelling approved leave asks why, then sends it', async () => {
    const p = leaveProps();
    render(<MyLeaveScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Cancel leave' }));
    await ue.click(screen.getByRole('button', { name: 'Ask to cancel' }));
    expect(screen.getByText('Say why you are cancelling.')).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/Why/), 'Trip called off');
    await ue.click(screen.getByRole('button', { name: 'Ask to cancel' }));
    await waitFor(() => expect(p.onCancel).toHaveBeenCalledWith('r2', 'Trip called off'));
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
};

describe('Me › Attendance', () => {
  it('a refused check-in says why and offers to retry the location (YX-AT-23)', async () => {
    const onPunch = vi.fn(async () => ({ accepted: false, duplicate: false, kind: 'in' as const, message: 'Outside Bengaluru head office, 850 m away', verdict: 'outside', distanceM: 850 }));
    const getLocation = vi.fn(async () => ({ pin: { lat: 12.9, lng: 77.6, accuracyM: 20 } }));
    render(<MyAttendanceScreen state="ready" data={ATT} month="2026-10" onMonth={vi.fn()} getLocation={getLocation} onPunch={onPunch} onFix={vi.fn()} onWithdrawFix={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    expect(await screen.findByText('Outside Bengaluru head office, 850 m away')).toBeInTheDocument();
    expect(onPunch).toHaveBeenCalledWith('in', { lat: 12.9, lng: 77.6, accuracyM: 20 });
    await ue.click(screen.getByRole('button', { name: 'Retry location' }));
    expect(getLocation).toHaveBeenCalledTimes(2);
  });

  it('fixing a missing check-out needs the time and a reason, then goes for approval', async () => {
    const onFix = vi.fn(async () => ({}));
    render(<MyAttendanceScreen state="ready" data={ATT} month="2026-10" onMonth={vi.fn()} getLocation={vi.fn()} onPunch={vi.fn()} onFix={onFix} onWithdrawFix={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Fix this day' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    expect(within(dialog).getAllByText('Give the time you finished.').length).toBeGreaterThan(0);
    await ue.type(within(dialog).getByLabelText(/Finished at/), '18:10');
    fireEvent.blur(within(dialog).getByLabelText(/Finished at/));
    await ue.type(within(dialog).getByLabelText(/What happened/), 'Forgot to check out');
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onFix).toHaveBeenCalledWith({ on: '2026-10-06', kind: 'missed_out', outMinute: 1090, reason: 'Forgot to check out' }));
  });

  it('night work: opt in to the protection, confirm a consent with a one-time code, withdraw it (founder decisions 9 Oct 2026)', async () => {
    const night = { byRecord: false, optedIn: false, optedInSince: null, consents: [{ id: 'c1', location: 'Hosur plant', givenOn: '2026-10-01', withdrawnOn: null, reference: 'Form 14', confirmedAt: null }] };
    const onNightOptIn = vi.fn(async () => ({}));
    const onNightCode = vi.fn(async () => ({ sentTo: 'your work email', expiresInSeconds: 300, resendAfterSeconds: 60 }));
    const onNightConfirm = vi.fn(async () => ({}));
    const onNightWithdraw = vi.fn(async () => ({}));
    render(<MyAttendanceScreen state="ready" data={ATT} month="2026-10" onMonth={vi.fn()} getLocation={vi.fn()} onPunch={vi.fn()} onFix={vi.fn()} onWithdrawFix={vi.fn()} night={night} onNightOptIn={onNightOptIn} onNightCode={onNightCode} onNightConfirm={onNightConfirm} onNightWithdraw={onNightWithdraw} />);
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
    render(<MyAttendanceScreen state="ready" data={ATT} month="2026-10" onMonth={vi.fn()} getLocation={vi.fn()} onPunch={vi.fn()} onFix={vi.fn()} onWithdrawFix={vi.fn()} night={{ byRecord: true, optedIn: false, optedInSince: null, consents: [] }} onNightOptIn={vi.fn()} />);
    expect(screen.getByText(/The night-work protection applies to you/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('Team and HR', () => {
  it('the team calendar marks leave and waiting requests', () => {
    render(
      <TeamLeaveScreen
        state="ready"
        data={{ from: '2026-10-12', to: '2026-10-14', scope: 'team', people: [{ id: 'a', name: 'Kavya Reddy', code: null, me: false, holidays: [], days: [{ on: '2026-10-12', part: 'full', status: 'pending', code: 'SL', colour: 'orange', name: 'Sick leave' }] }] }}
        onRange={vi.fn()}
        approvalsHref="/yx/approvals"
        onNavigate={vi.fn()}
      />,
    );
    const cell = screen.getByTitle('Sick leave, waiting for approval');
    expect(cell).toHaveTextContent('SL');
  });

  it('the muster opens a day card with each punch and its verdict (YX-AT-15)', async () => {
    const data: Muster = { month: '2026-10', from: '2026-10-01', to: '2026-10-02', scope: 'granted', people: [{ id: 'k', name: 'Kavya Reddy', code: 'KFT-0031', location: 'Hosur plant', me: false, mode: 'punch', missingPunchEffect: 'block_payroll_approval', days: [{ on: '2026-10-01', status: 'present', leavePart: null, workedMinutes: 490, lateMinutes: null, regularised: false }] }] };
    const onOpenDay = vi.fn(async () => ({ person: { name: 'Kavya Reddy', code: null }, on: '2026-10-01', zone: 'Asia/Kolkata', day: { status: 'present' as const, leavePart: null, workedMinutes: 490, lateMinutes: null, regularised: false }, punches: [{ id: 'p', kind: 'in' as const, at: '2026-10-01T02:31:00Z', source: 'web', accepted: true, refusal: null, verdict: 'inside', distanceM: 40, accuracyM: 18, where: 'Hosur plant', minute: 481 }] }));
    render(<MusterScreen state="ready" data={data} month="2026-10" onMonth={vi.fn()} onOpenDay={onOpenDay} />);
    await ue.click(screen.getByRole('button', { name: /Kavya Reddy, Thu 1 Oct: Present/ }));
    expect(await screen.findByText(/Inside · Hosur plant · 40 m from the site/)).toBeInTheDocument();
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
