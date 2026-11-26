import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExceptionsScreen, MusterScreen, TodayBoardScreen, type LiveExceptions, type LiveMusterData, type LiveTodayBoard } from './attendance';
import { AttendanceRequestSheet, DeviceBackfillWizard, IndustrialActionScreen, OtReviewScreen, PeriodsScreen, type LiveDeviceBackfill, type LiveIndustrialAction, type LiveOtReview, type LivePeriods } from './requests';
import { AttendanceReportsScreen } from './ops';
import { PresenceDayScreen } from './field';
import { OT_REVIEW, PERIODS, PREFLIGHT_READY } from './live/fixtures';
import type { DayCard, DevicePreview, ExceptionsList, HoursReport, IndustrialEvent, LateMarks, Muster, MyAttendance, OtReview, TodayBoard } from './live/types';

// Time ops (29 Oct 2026): the designed TIM-01, 02, 03, 04, 07, 09, 10, 11, 16, 36 and 37 screens with live data. Each
// state renders; pressed too early, a button says why and focuses the field; every action calls the API once.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn(async () => ({}));

describe('TIM-01 Today board (live)', () => {
  const data: TodayBoard = {
    today: '2026-10-28',
    at: '2026-10-28T04:15:00Z',
    scope: 'team',
    month: '2026-10',
    lockableFrom: '2026-11-02',
    blocking: 2,
    people: [
      { id: 'a', name: 'Arun Prakash', code: 'K1', role: 'QA', dept: 'Quality', location: 'Chennai office', status: 'in', inAt: '09:20', onSite: true, site: 'Chennai office', mode: 'Punch', source: 'web', detail: null, missedOutOn: null, nudged: false, shiftStarted: true, today: 'not_started' },
      { id: 'm', name: 'Meera Krishnan', code: 'K2', role: 'QA', dept: 'Quality', location: 'Chennai office', status: 'not_in', inAt: null, onSite: false, site: 'Chennai office', mode: 'Punch', source: null, detail: 'Shift 09:30–18:30', missedOutOn: null, nudged: false, shiftStarted: true, today: null },
      { id: 'p', name: 'Priya Shankar', code: 'K3', role: 'QA', dept: 'Quality', location: 'Chennai office', status: 'missing', inAt: '09:01', onSite: true, site: 'Chennai office', mode: 'Punch', source: 'web', detail: null, missedOutOn: '2026-10-27', nudged: true, shiftStarted: true, today: null },
    ],
  };
  const board = (o: Partial<LiveTodayBoard> = {}): LiveTodayBoard => ({ state: 'ready', data, onNudge: ok(), links: { exceptions: '/x', muster: '/m', roster: '/r', fieldMap: null }, ...o });

  it('shows the columns, the blocking alert and nudges people not in (once)', async () => {
    const live = board();
    render(<TodayBoardScreen live={live} />);
    expect(screen.getByRole('region', { name: 'Not checked in, 1' })).toBeInTheDocument();
    expect(screen.getByText('No check-out 27 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText(/2 open exceptions block October payroll/)).toBeInTheDocument();
    // House rule 8: the weekday is its own small label beside "28 Oct 2026".
    expect(screen.getByText('28 Oct 2026')).toBeInTheDocument();
    expect(document.querySelector('.yx-daydate__wd')?.textContent).toBe('Wed');
    await ue.click(screen.getByRole('button', { name: 'Nudge 1 person' }));
    await waitFor(() => expect(live.onNudge).toHaveBeenCalledWith('m'));
    expect(live.onNudge).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Everyone nudged' })).toBeInTheDocument();
  });

  it('On site now lists only people checked in and not out (assumed present and checked-out people are left out)', async () => {
    const extra: TodayBoard['people'] = [
      { ...data.people[0]!, id: 'x', name: 'Assumed Person', status: 'in', inAt: null, onSite: false, mode: 'Assumed present', source: null },
      { ...data.people[0]!, id: 'o', name: 'Gone Home', inAt: '08:00', onSite: false },
    ];
    render(<TodayBoardScreen live={board({ data: { ...data, scope: 'company', people: [...data.people, ...extra] } })} />);
    await ue.click(screen.getByRole('tab', { name: /On site now/ }));
    expect(screen.getByText('Arun Prakash')).toBeInTheDocument();
    expect(screen.getByText('In 9:20 am')).toBeInTheDocument();
    expect(screen.queryByText('Assumed Person')).not.toBeInTheDocument();
    expect(screen.queryByText('Gone Home')).not.toBeInTheDocument();
  });

  it('empty, error and no access', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<TodayBoardScreen live={board({ data: { ...data, people: [] } })} />);
    expect(screen.getByText('No one is rostered today')).toBeInTheDocument();
    rerender(<TodayBoardScreen live={board({ state: 'error', data: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<TodayBoardScreen live={board({ state: 'no-access', data: null })} />);
    expect(screen.getByText(/You don't have access/)).toBeInTheDocument();
  });
});

describe('TIM-04 Exceptions (live)', () => {
  const data: ExceptionsList = {
    month: '2026-10',
    today: '2026-10-28',
    scope: 'company',
    canResolve: true,
    page: 1,
    pageSize: 50,
    total: 2,
    blocking: 2,
    rows: [
      { id: 'a|2026-10-12', employeeId: 'a', person: 'Arjun Kulkarni', code: 'K1', on: '2026-10-12', kind: 'Missing check-out', status: 'Open', blocking: true, mode: 'Punch', detail: 'Checked in 09:25, no check-out', firstIn: null, inAt: '09:25', shiftEnd: '18:30', nudged: 0, request: null, resolution: null },
      { id: 's|2026-10-14', employeeId: 's', person: 'Sanjay Rao', code: 'K2', on: '2026-10-14', kind: 'Missing check-in', status: 'Request pending', blocking: true, mode: 'Punch', detail: 'Checked out, no check-in', firstIn: null, inAt: null, shiftEnd: '18:30', nudged: 0, request: { id: 'r', kind: 'missed_in', inMinute: 570, outMinute: null, reason: 'Phone died', taskId: 't1' }, resolution: null },
    ],
  };
  const live = (o: Partial<LiveExceptions> = {}): LiveExceptions => ({ state: 'ready', data, month: '2026-10', onMonth: vi.fn(), onResolve: ok(), onDecideTask: ok(), onQuery: vi.fn(), ...o });

  it('HR resolves with times; pressed without a reason it says so and sends nothing', async () => {
    const l = live();
    render(<ExceptionsScreen live={l} />);
    expect(screen.getByText('2 blocking')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Resolve' }));
    const dialog = screen.getByRole('dialog');
    // Deducting leave is not offered live (not built).
    expect(within(dialog).queryByText('Deduct leave')).toBeNull();
    await ue.click(within(dialog).getByRole('button', { name: 'Resolve exception' }));
    expect(l.onResolve).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('radio', { name: /Absent/ }));
    await ue.click(within(dialog).getByRole('button', { name: 'Resolve exception' }));
    expect(within(dialog).getByText('Enter a reason')).toBeInTheDocument();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'No show, supervisor confirmed');
    await ue.click(within(dialog).getByRole('button', { name: 'Resolve exception' }));
    await waitFor(() => expect(l.onResolve).toHaveBeenCalledWith({ days: [{ employeeId: 'a', on: '2026-10-12' }], how: 'absent', inMinute: undefined, outMinute: undefined, reason: 'No show, supervisor confirmed' }));
  });

  it('a waiting fix is reviewed as the viewer\'s task: reject needs a reason', async () => {
    const l = live();
    render(<ExceptionsScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Review request' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(within(dialog).getByText('Enter a reason to reject')).toBeInTheDocument();
    expect(l.onDecideTask).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(l.onDecideTask).toHaveBeenCalledWith('t1', 'approve', undefined));
  });

  it('the server pages the list: filters and pages go back as a query; the paging control shows past one page', async () => {
    const l = live({ data: { ...data, total: 240 } });
    render(<ExceptionsScreen live={l} />);
    expect(l.onQuery).toHaveBeenLastCalledWith({ status: ['Open', 'Request pending'], kind: [], search: '', page: 1, pageSize: 50 });
    await ue.click(screen.getByRole('button', { name: /Next page/ }));
    await waitFor(() => expect(l.onQuery).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it('a manager has no resolve; empty and no access', () => {
    const { rerender } = render(<ExceptionsScreen live={live({ data: { ...data, canResolve: false, scope: 'team' } })} />);
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
    rerender(<ExceptionsScreen live={live({ data: { ...data, rows: [] } })} />);
    expect(screen.getByText('No open exceptions')).toBeInTheDocument();
    rerender(<ExceptionsScreen live={live({ state: 'no-access', data: null })} />);
    expect(screen.getByText(/You don't have access/)).toBeInTheDocument();
  });
});

describe('My pages without an employee record (live)', () => {
  it('say so plainly with what to do, never "try again"', () => {
    render(<PresenceDayScreen live={{ state: 'no-record', month: '2026-10', onMonth: vi.fn(), mine: null, onConsent: ok() }} />);
    expect(screen.getByText('You have no employee record here')).toBeInTheDocument();
    expect(screen.getByText(/Ask HR to link your sign-in/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again|Retry/ })).toBeNull();
  });
});

describe('TIM-02 Muster stages and bulk (live)', () => {
  const day = (on: string, status: 'present' | 'absent' | 'missing_out') => ({ on, status, leavePart: null, workedMinutes: status === 'present' ? 480 : null, lateMinutes: null, regularised: false });
  const base: Muster = {
    month: '2026-09',
    from: '2026-09-01',
    to: '2026-09-30',
    scope: 'company',
    canMarkPresent: true,
    period: { legalEntityId: 'le', entityName: 'Kaveri Foods', stage: 'open', lockableFrom: '2026-10-02', lockable: true, flow: 'one_step', sentAt: null, lockedAt: null, exceptions: 1, pending: [], canLock: true, canApprove: false },
    people: [{ id: 'k', name: 'Kavya Reddy', code: 'K1', location: 'Hosur', me: false, mode: 'punch', missingPunchEffect: 'block_payroll_approval', days: [day('2026-09-01', 'present'), day('2026-09-02', 'absent'), day('2026-09-03', 'missing_out')] }],
  };
  const muster = (o: Partial<LiveMusterData> = {}, data: Muster = base): LiveMusterData => ({ state: 'ready', data, month: '2026-09', onMonth: vi.fn(), onOpenDay: vi.fn(async () => ({}) as DayCard), today: '2026-10-28', onFreeze: ok(), onLock: ok(), onSend: ok(), onApproveLock: ok(), onMarkPresent: ok(), ...o });

  it('open: freeze inputs after a confirm; the stage shows', async () => {
    const l = muster();
    render(<MusterScreen live={l} />);
    expect(screen.getByText('Open')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Freeze inputs' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Freeze inputs' }));
    await waitFor(() => expect(l.onFreeze).toHaveBeenCalledWith('le', '2026-09'));
  });

  it('frozen with open exceptions: Lock says why and does not call; resolved, it locks after a plain confirm', async () => {
    const l = muster({}, { ...base, period: { ...base.period!, stage: 'frozen' } });
    const { rerender } = render(<MusterScreen live={l} />);
    expect(screen.getByText('Inputs frozen')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Lock period' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(l.onLock).not.toHaveBeenCalled();
    rerender(<MusterScreen live={muster({ onLock: l.onLock }, { ...base, period: { ...base.period!, stage: 'frozen', exceptions: 0 } })} />);
    await ue.click(screen.getByRole('button', { name: 'Lock period' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Lock period' }));
    await waitFor(() => expect(l.onLock).toHaveBeenCalledWith('le', '2026-09'));
  });

  it('two-step: HR sends; payroll approves once sent', async () => {
    const two = { ...base.period!, stage: 'frozen' as const, exceptions: 0, flow: 'two_step' as const };
    const l = muster({}, { ...base, period: two });
    const { rerender } = render(<MusterScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(l.onSend).toHaveBeenCalled());
    rerender(<MusterScreen live={muster({ onApproveLock: l.onApproveLock }, { ...base, period: { ...two, sentAt: '2026-10-02T05:00:00Z', canLock: false, canApprove: true } })} />);
    await ue.click(screen.getByRole('button', { name: 'Approve lock' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve lock' }));
    await waitFor(() => expect(l.onApproveLock).toHaveBeenCalledWith('le', '2026-09'));
  });

  it('bulk: tick people, mark present with a reason (pressed without one, the field says so)', async () => {
    const l = muster();
    render(<MusterScreen live={l} />);
    await ue.click(screen.getByRole('checkbox', { name: 'Select Kavya Reddy' }));
    await ue.click(screen.getByRole('button', { name: 'Mark present with reason (1)' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Mark present' }));
    expect(within(dialog).getByText('Add a reason')).toBeInTheDocument();
    expect(l.onMarkPresent).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Reader down');
    await ue.click(within(dialog).getByRole('button', { name: 'Mark present' }));
    await waitFor(() => expect(l.onMarkPresent).toHaveBeenCalledWith(['k'], '2026-09-02', 'Reader down'));
  });

  it('a manager has no bulk and no stage buttons', () => {
    render(<MusterScreen live={muster({}, { ...base, scope: 'team', canMarkPresent: false, period: { ...base.period!, canLock: false } })} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Freeze inputs' })).toBeNull();
  });
});

describe('TIM-03 Day card: HR resolve and pending overtime (live)', () => {
  const muster: Muster = {
    month: '2026-10', from: '2026-10-01', to: '2026-10-31', scope: 'company',
    people: [{ id: 'a', name: 'Arjun Kulkarni', code: 'K1', location: 'Hosur', me: false, mode: 'punch', missingPunchEffect: 'block_payroll_approval', days: [{ on: '2026-10-12', status: 'missing_out', leavePart: null, workedMinutes: null, lateMinutes: null, regularised: false }, { on: '2026-10-13', status: 'present', leavePart: null, workedMinutes: 600, lateMinutes: null, regularised: false, otMinutes: 90, otStatus: 'pending' }] }],
  };
  const card = (on: string, o: Partial<DayCard> = {}): DayCard => ({ person: { name: 'Arjun Kulkarni', code: 'K1' }, on, zone: 'Asia/Kolkata', shift: { name: 'General', start: 570, end: 1110, grace: 10 }, day: null, punches: [], lateMarks: { month: 1, free: 3 }, hrFix: { ok: true, why: null }, ...o });

  it('HR resolves a missing check-out with times', async () => {
    const onResolve = ok();
    render(<MusterScreen live={{ state: 'ready', data: muster, month: '2026-10', onMonth: vi.fn(), today: '2026-10-28', onOpenDay: vi.fn(async (_e, on) => card(on)), onResolve }} />);
    await ue.click(screen.getByRole('button', { name: /Arjun Kulkarni, 12 Oct 2026: Missing check-out/ }));
    await ue.click(await screen.findByRole('button', { name: 'Resolve with reason' }));
    const dialog = screen.getAllByRole('dialog').at(-1)!;
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Gate register');
    await ue.click(within(dialog).getByRole('button', { name: 'Resolve exception' }));
    expect(within(dialog).getByText('Enter the check-in time')).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('today is read only for HR; a manager approves pending overtime', async () => {
    const onDecideOt = ok();
    render(<MusterScreen live={{ state: 'ready', data: { ...muster, scope: 'team' }, month: '2026-10', onMonth: vi.fn(), today: '2026-10-28', onOpenDay: vi.fn(async (_e, on) => card(on, { hrFix: null, ot: { eligibleMinutes: 90, payableMinutes: 90, overCapMinutes: 0, category: 'normal', settle: 'pay', claim: { id: 'oc9', status: 'pending', overridden: false } } })), onDecideOt }} />);
    await ue.click(screen.getByRole('button', { name: /Arjun Kulkarni, 13 Oct 2026/ }));
    await ue.click(await screen.findByRole('button', { name: 'Approve overtime' }));
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Approve overtime' }));
    await waitFor(() => expect(onDecideOt).toHaveBeenCalledWith('oc9', 'approve'));
  });
});

describe('TIM-09 OT decisions on the review page (live)', () => {
  const data: OtReview = { ...OT_REVIEW, claims: OT_REVIEW.claims.map((c) => (c.id === 'oc1' ? { ...c, taskId: 't1', canCompOff: true } : c)) };
  const review = (o: Partial<LiveOtReview> = {}): LiveOtReview => ({ state: 'ready', data, month: '2026-10', onMonth: vi.fn(), onOverride: ok(), onDecide: ok(), ...o });

  it('approve, and reject only with a reason', async () => {
    const l = review();
    render(<OtReviewScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(l.onDecide).toHaveBeenCalledWith('oc1', 'approve'));
  });
});

describe('TIM-11 Periods two-step (live)', () => {
  const periods = (o: Partial<LivePeriods> = {}): LivePeriods => ({ state: 'ready', data: { ...PERIODS, entities: [{ ...PERIODS.entities[0]!, flow: 'two_step', canLock: true, canApprove: false }] }, year: '2026', onYear: vi.fn(), onPreflight: vi.fn(async () => PREFLIGHT_READY), onLock: ok(), onUnlock: ok(), onSend: ok(), onApproveLock: ok(), ...o });

  it('HR sends the month for payroll approval instead of locking it', async () => {
    const l = periods();
    render(<PeriodsScreen live={l} />);
    await ue.click(screen.getAllByRole('button', { name: 'Pre-lock checklist' })[1]!);
    await ue.click(await screen.findByRole('button', { name: 'Send for approval' }));
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(l.onSend).toHaveBeenCalledWith('le-kfpl', '2026-09'));
    expect(l.onLock).not.toHaveBeenCalled();
  });
});

// Batch C item 6 (answers 2505, 2506): late-mark penalty waivers from the month card.
describe('TIM-11 late marks (live)', () => {
  const late: LateMarks = {
    legalEntityId: 'le-kfpl',
    month: '2026-09',
    unlocked: true,
    rows: [
      { employeeId: 'e1', name: 'Kavya Reddy', code: 'KF-1', on: '2026-09-03', lateMinutes: 14, waiver: null },
      { employeeId: 'e2', name: 'Ravi Kumar', code: 'KF-2', on: '2026-09-04', lateMinutes: 30, waiver: { id: 'w1', reason: 'Bus breakdown, confirmed', by: 'Lakshmi', at: '2026-09-28T06:00:00Z' } },
    ],
  };
  const live = (o: Partial<LivePeriods> = {}): LivePeriods => ({ state: 'ready', data: { ...PERIODS, entities: [{ ...PERIODS.entities[0]!, canLock: true, canApprove: false }] }, year: '2026', onYear: vi.fn(), onPreflight: vi.fn(async () => PREFLIGHT_READY), onLock: ok(), onUnlock: ok(), onLateMarks: vi.fn(async () => late), onWaiveLate: vi.fn(async () => ({ waived: [{}], skipped: [] })), onUndoLate: ok(), ...o });
  const open = async (l: LivePeriods) => {
    render(<PeriodsScreen live={l} />);
    await ue.click(screen.getAllByRole('button', { name: 'Late marks' })[1]!);
    return screen.findByRole('dialog', { name: /Late marks · September 2026/ });
  };

  it('waives the chosen marks with one reason; under 10 characters is a field error and nothing is sent; the waived one stays visible', async () => {
    const l = live();
    const drawer = await open(l);
    expect(within(drawer).getByText('Waived')).toBeInTheDocument();
    expect(within(drawer).getByText(/Lakshmi · Bus breakdown/)).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('checkbox', { name: /Kavya Reddy/ }));
    await ue.click(within(drawer).getByRole('button', { name: 'Waive 1' }));
    const dlg = screen.getAllByRole('dialog').at(-1)!;
    await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'Too short');
    await ue.click(within(dlg).getByRole('button', { name: 'Waive 1' }));
    expect(within(dlg).getByText('Say why in at least 10 characters.')).toBeInTheDocument();
    expect(l.onWaiveLate).not.toHaveBeenCalled();
    await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), ' to explain');
    await ue.click(within(dlg).getByRole('button', { name: 'Waive 1' }));
    await waitFor(() => expect(l.onWaiveLate).toHaveBeenCalledWith('le-kfpl', '2026-09', [{ employeeId: 'e1', on: '2026-09-03' }], 'Too short to explain'));
  });

  it('undoes a waiver with a reason; a locked month is read only', async () => {
    const l = live();
    const drawer = await open(l);
    await ue.click(within(drawer).getByRole('checkbox', { name: /Ravi Kumar/ }));
    await ue.click(within(drawer).getByRole('button', { name: 'Undo 1 waiver' }));
    const dlg = screen.getAllByRole('dialog').at(-1)!;
    await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'Transport did not confirm it');
    await ue.click(within(dlg).getByRole('button', { name: 'Undo 1' }));
    await waitFor(() => expect(l.onUndoLate).toHaveBeenCalledWith('le-kfpl', '2026-09', ['w1'], 'Transport did not confirm it'));
  });

  it('a locked month: no selection, the reason is shown', async () => {
    const drawer = await open(live({ onLateMarks: vi.fn(async () => ({ ...late, unlocked: false })) }));
    expect(within(drawer).getByText('This month is locked')).toBeInTheDocument();
    expect(within(drawer).queryByRole('checkbox')).toBeNull();
  });
});

// Founder answer 2527: a manager asks HR to waive their team's late marks; HR declines (or waives) from the same list.
describe('2527 ask HR to waive late marks (live)', () => {
  const team: LateMarks = {
    legalEntityId: '',
    month: '2026-09',
    unlocked: true,
    rows: [
      { employeeId: 'e1', name: 'Kavya Reddy', code: null, on: '2026-09-03', lateMinutes: 14, waiver: null, request: null },
      { employeeId: 'e2', name: 'Ravi Kumar', code: null, on: '2026-09-04', lateMinutes: 30, waiver: null, request: { id: 'r1', reason: 'Bus breakdown, confirmed', by: 'Divya', at: '2026-09-28T06:00:00Z', status: 'pending', declineReason: null } },
      { employeeId: 'e2', name: 'Ravi Kumar', code: null, on: '2026-09-09', lateMinutes: 12, waiver: null, request: { id: 'r0', reason: 'Traffic diversion near the plant', by: 'Divya', at: '2026-09-20T06:00:00Z', status: 'declined', declineReason: 'Inside the grace rule already' } },
    ],
  };
  const base: Muster = {
    month: '2026-09', from: '2026-09-01', to: '2026-09-30', scope: 'team',
    people: [
      { id: 'me', name: 'Divya', code: 'K0', location: 'Hosur', me: true, mode: 'punch', missingPunchEffect: 'block_payroll_approval', days: [] },
      { id: 'e1', name: 'Kavya Reddy', code: 'K1', location: 'Hosur', me: false, mode: 'punch', missingPunchEffect: 'block_payroll_approval', days: [], ot: { aheadDays: 30, factoriesAct: false } },
    ],
  };
  const muster = (o: Partial<LiveMusterData> = {}, data: Muster = base): LiveMusterData => ({ state: 'ready', data, month: '2026-09', onMonth: vi.fn(), today: '2026-10-05', onOpenDay: vi.fn(), onTeamLateMarks: vi.fn(async () => team), onAskLate: vi.fn(async () => ({ skipped: [] })), ...o });

  it('the manager picks days and a reason (10+ characters, else a field error and nothing sent); asked and declined days say so', async () => {
    const l = muster();
    render(<MusterScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Late marks' }));
    const drawer = await screen.findByRole('dialog', { name: /Late marks · September 2026 · Your team/ });
    expect(l.onTeamLateMarks).toHaveBeenCalledWith('2026-09');
    expect(within(drawer).getByText('Asked HR')).toBeInTheDocument();
    expect(within(drawer).getByText('Declined')).toBeInTheDocument();
    expect(within(drawer).getByText('Inside the grace rule already')).toBeInTheDocument();
    // An open request is not asked again; a declined day may be.
    await ue.click(within(drawer).getByRole('checkbox', { name: /Select all/i }));
    await ue.click(within(drawer).getByRole('button', { name: 'Ask HR to waive 2' }));
    const dlg = screen.getAllByRole('dialog').at(-1)!;
    await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'Too short');
    await ue.click(within(dlg).getByRole('button', { name: 'Ask HR to waive 2' }));
    expect(within(dlg).getByText('Say why in at least 10 characters.')).toBeInTheDocument();
    expect(l.onAskLate).not.toHaveBeenCalled();
    await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), ' to explain');
    await ue.click(within(dlg).getByRole('button', { name: 'Ask HR to waive 2' }));
    await waitFor(() => expect(l.onAskLate).toHaveBeenCalledWith('2026-09', [{ employeeId: 'e1', on: '2026-09-03' }, { employeeId: 'e2', on: '2026-09-09' }], 'Too short to explain'));
  });

  it('negative: no reports (or no handlers), no Late marks button; a locked month cannot be asked', async () => {
    const { unmount } = render(<MusterScreen live={muster({}, { ...base, people: [base.people[0]!] })} />);
    expect(screen.queryByRole('button', { name: 'Late marks' })).toBeNull();
    unmount();
    render(<MusterScreen live={muster({ onTeamLateMarks: vi.fn(async () => ({ ...team, unlocked: false })) })} />);
    await ue.click(screen.getByRole('button', { name: 'Late marks' }));
    const drawer = await screen.findByRole('dialog', { name: /Your team/ });
    expect(within(drawer).getByText('This month is locked')).toBeInTheDocument();
    expect(within(drawer).queryByRole('checkbox')).toBeNull();
  });

  it('HR sees the open request on Late marks and declines it with a reason the manager sees', async () => {
    const onDeclineLate = ok();
    const hrLate: LateMarks = { ...team, legalEntityId: 'le-kfpl', rows: team.rows.slice(0, 2) };
    render(<PeriodsScreen live={{ state: 'ready', data: { ...PERIODS, entities: [{ ...PERIODS.entities[0]!, canLock: true, canApprove: false }] }, year: '2026', onYear: vi.fn(), onPreflight: vi.fn(async () => PREFLIGHT_READY), onLock: ok(), onUnlock: ok(), onLateMarks: vi.fn(async () => hrLate), onWaiveLate: vi.fn(async () => ({ waived: [], skipped: [] })), onUndoLate: ok(), onDeclineLate }} />);
    await ue.click(screen.getAllByRole('button', { name: 'Late marks' })[1]!);
    const drawer = await screen.findByRole('dialog', { name: /Late marks · September 2026/ });
    expect(within(drawer).getByText('Asked by manager')).toBeInTheDocument();
    expect(within(drawer).getByText(/Divya · Bus breakdown/)).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('checkbox', { name: /Ravi Kumar/ }));
    await ue.click(within(drawer).getByRole('button', { name: 'Decline 1' }));
    const dlg = screen.getAllByRole('dialog').at(-1)!;
    await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'Inside the grace rule already');
    await ue.click(within(dlg).getByRole('button', { name: 'Decline 1' }));
    await waitFor(() => expect(onDeclineLate).toHaveBeenCalledWith('le-kfpl', '2026-09', ['r1'], 'Inside the grace rule already'));
  });
});

// Batch C item 16 (answers 2507, 2508): Short hours and Breaks.
describe('TIM-16 short hours and breaks (live)', () => {
  const data: HoursReport = {
    month: '2026-10',
    upTo: '2026-10-31',
    scope: 'team',
    rows: [
      { id: 'a', name: 'Kavya Reddy', code: 'KF-1', dept: 'Quality', location: 'Bengaluru', short: { b1: 1, b2: 2, b3: 0 }, breaksRecorded: true, breaks: 20, breakMinutes: 410, frequentBreakDays: 3, bands: [4, 6, 8], limit: { count: 3, minutes: 60 } },
      { id: 'b', name: 'Ravi Kumar', code: 'KF-2', dept: 'Production', location: 'Hosur', short: { b1: 0, b2: 0, b3: 4 }, breaksRecorded: false, breaks: null, breakMinutes: null, frequentBreakDays: null, bands: [4, 6, 8], limit: { count: 3, minutes: 60 } },
    ],
  };
  it("shows the company's bands, frequent-break days, and says breaks are not recorded where clock-in-again is off", () => {
    const onReport = vi.fn();
    render(<AttendanceReportsScreen live={{ report: 'hours', state: 'ready', data, month: '2026-10', onMonth: vi.fn(), onReport }} />);
    expect(screen.getByRole('columnheader', { name: /Under 4 h/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /4–6 h/ })).toBeInTheDocument();
    expect(screen.getByText(/more than 3 breaks or 60 minutes/)).toBeInTheDocument();
    expect(screen.getByText('Breaks are not recorded for 1 person')).toBeInTheDocument();
    const ravi = screen.getByRole('row', { name: /Ravi Kumar/ });
    expect(within(ravi).getByText('Breaks not recorded')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Kavya Reddy/ })).getAllByText('3').length).toBeGreaterThan(0);
  });

  it('nobody has clock-in-again: the note says anyone here; an empty month says so', () => {
    const { rerender } = render(<AttendanceReportsScreen live={{ report: 'hours', state: 'ready', data: { ...data, rows: [data.rows[1]!] }, month: '2026-10', onMonth: vi.fn(), onReport: vi.fn() }} />);
    expect(screen.getByText('Breaks are not recorded for anyone here')).toBeInTheDocument();
    rerender(<AttendanceReportsScreen live={{ report: 'hours', state: 'ready', data: { ...data, rows: [] }, month: '2026-10', onMonth: vi.fn(), onReport: vi.fn() }} />);
    expect(screen.getByText('No short days or breaks this month')).toBeInTheDocument();
  });
});

describe('TIM-07 late request to a locked month (live)', () => {
  const data = { employee: { id: 'e', name: 'Divya' }, today: '2026-10-28', zone: 'Asia/Kolkata', mode: 'punch', shift: { name: 'General', start: 570, end: 1110, grace: 10, checkIn: 'restricted' }, fences: [], punches: [], next: 'in', days: [{ on: '2026-10-20', status: 'absent', leavePart: null, workedMinutes: null, lateMinutes: null, regularised: false }], requests: [], regularise: { limit: 4, used: 0 }, wfh: { limit: 4, used: 0 }, locked: ['2026-10-20'], lateRequestMaxDays: 60 } as MyAttendance;

  it('goes as a late correction with a reason of a sentence', async () => {
    const onLate = ok();
    const onFix = ok();
    render(<AttendanceRequestSheet live={{ data, type: 'regularise', on: '2026-10-20', onFix, onLateCorrection: onLate, onClose: vi.fn() }} />);
    expect(screen.getByText(/is locked, so this goes as a late request/)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'short');
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getAllByText('Give the reason in a sentence (at least 10 letters).').length).toBeGreaterThan(0);
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), ' but I was on site all day');
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    // Answer 2282: what the day should have been is a fixed choice; present by default.
    await waitFor(() => expect(onLate).toHaveBeenCalledWith(expect.objectContaining({ on: '2026-10-20', kind: 'attendance', shouldBe: 'present' })));
    expect(onFix).not.toHaveBeenCalled();
  });

  it('answer 2282: the day may have been a leave of the company list; negative: Leave without a type sends nothing', async () => {
    const onLate = ok();
    render(<AttendanceRequestSheet live={{ data, type: 'regularise', on: '2026-10-20', onFix: ok(), onLateCorrection: onLate, leaveTypes: [{ code: 'CL', name: 'Casual leave' }, { code: 'LWP', name: 'Leave without pay' }], onClose: vi.fn() }} />);
    await ue.click(screen.getByRole('radio', { name: 'Leave' }));
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'I was on casual leave that day, approved by phone');
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getAllByText('Choose the leave type').length).toBeGreaterThan(0);
    expect(onLate).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /Leave type/ }));
    await ue.click(await screen.findByRole('option', { name: 'Casual leave' }));
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onLate).toHaveBeenCalledWith(expect.objectContaining({ shouldBe: 'leave:CL' })));
  });

  it('negative: without company leave types there is no Leave choice', () => {
    render(<AttendanceRequestSheet live={{ data, type: 'regularise', on: '2026-10-20', onFix: ok(), onLateCorrection: ok(), onClose: vi.fn() }} />);
    expect(screen.getByRole('radio', { name: 'Unpaid' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Leave' })).toBeNull();
  });
});

describe('TIM-10 Device backfill (live)', () => {
  const preview: DevicePreview = { deviceRef: 'GATE-1', from: '2026-10-14', to: '2026-10-17', receivedAt: '2026-10-28T10:00:00Z', punches: 3, people: 2, personDays: 2, becomePresent: 1, lateRemoved: 0, lateAdded: 0, corrections: 1, changes: [{ employeeId: 'a', name: 'Kavitha Sundaram', code: 'K1', on: '2026-10-15', open: true, stage: 'open', punches: [{ kind: 'in', at: '06:02' }], before: { status: 'absent', lateMinutes: null, firstIn: null, lastOut: null }, after: { status: 'present', lateMinutes: 0, firstIn: '06:02', lastOut: '14:05' } }] };
  const wizard = (o: Partial<LiveDeviceBackfill> = {}): LiveDeviceBackfill => ({ state: 'ready', batches: [{ legalEntityId: 'le-tn', entityName: 'Kaveri Foods (Tamil Nadu)', deviceRef: 'GATE-1', punches: 3, people: 2, from: '2026-10-14', to: '2026-10-17', receivedAt: null }], onPreview: vi.fn(async () => preview), onApply: vi.fn(async () => ({ id: 'b', punches: 3, people: 2, personDays: 2, openDays: 1, corrections: 1 })), musterHref: '/m', periodsHref: '/p', ...o });

  it('previews the changes; the reason must be a sentence; applies once with the reviewed count', async () => {
    const l = wizard();
    render(<DeviceBackfillWizard live={l} />);
    await waitFor(() => expect(l.onPreview).toHaveBeenCalledWith('le-tn', 'GATE-1'));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Absent → Present 6:02 am – 2:05 pm/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Give the reason in a sentence (at least 10 letters).')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Gate 1 kiosk was offline for four days');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Apply punches' }));
    await waitFor(() => expect(l.onApply).toHaveBeenCalledWith('le-tn', 'GATE-1', 'Gate 1 kiosk was offline for four days', 3));
    expect(await screen.findByText('Device punches applied')).toBeInTheDocument();
  });

  it('nothing waiting; no attendance.lock is the no-access state (never "nothing waiting"); every state has the h1', () => {
    const { rerender } = render(<DeviceBackfillWizard live={wizard({ batches: [] })} />);
    expect(screen.getByText('No device punches waiting')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Device punches correction' })).toBeInTheDocument();
    rerender(<DeviceBackfillWizard live={wizard({ state: 'no-access', batches: null })} />);
    expect(screen.queryByText('No device punches waiting')).toBeNull();
    expect(screen.getByText(/You don't have access/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Device punches correction' })).toBeInTheDocument();
  });

  it('batches from several legal entities name their entity', () => {
    render(<DeviceBackfillWizard live={wizard({ batches: [{ legalEntityId: 'le-a', entityName: 'Kaveri Foods', deviceRef: 'K1', punches: 2, people: 1, from: null, to: null, receivedAt: null }, { legalEntityId: 'le-tn', entityName: 'Kaveri Foods (Tamil Nadu)', deviceRef: 'K1', punches: 4, people: 2, from: null, to: null, receivedAt: null }] })} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Device punches correction' })).toBeInTheDocument();
  });
});

describe('TIM-37 Industrial action (live)', () => {
  const event: IndustrialEvent = { id: 'ev', kind: 'strike', from: '2026-11-05', to: '2026-11-07', days: 3, location: { id: 'l', name: 'Hosur plant', state: 'IN-TN' }, department: null, workers: 134, legality: 'undetermined', legalitySetAt: null, legalitySetBy: null, notice: 'Union notice', status: 'active', version: 1, today: '2026-10-28' };
  const ia = (o: Partial<LiveIndustrialAction> = {}): LiveIndustrialAction => ({ state: 'ready', options: { today: '2026-10-28', locations: [{ id: 'l', name: 'Hosur plant', state: 'IN-TN', people: 134, departments: [{ id: 'd', name: 'Operations', people: 120 }] }] }, event: null, onRecord: vi.fn(async () => event), onLegality: vi.fn(async () => ({ ...event, legality: 'legal' as const, version: 2 })), onDates: vi.fn(async () => event), onCancel: vi.fn(async () => ({ ...event, status: 'cancelled' as const })), links: { cancel: '/c', people: '/p', muster: '/m' }, ...o });

  it('the form refuses to record without dates and a notice', async () => {
    const l = ia();
    render(<IndustrialActionScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Record event' }));
    expect(screen.getAllByText('Pick both dates').length).toBeGreaterThan(0);
    expect(l.onRecord).not.toHaveBeenCalled();
  });

  it('the record sets the legality (pay on hold until then)', async () => {
    const l = ia({ event });
    render(<IndustrialActionScreen live={l} />);
    expect(screen.getByText(/Pay for 402 worker-days is on hold/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Set legality' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('radio', { name: 'Legal' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Set legality' }));
    await waitFor(() => expect(l.onLegality).toHaveBeenCalledWith('ev', 'legal', 1));
  });
});

describe('TIM-36 Presence (live)', () => {
  it('the person gives consent after reading what is recorded; a manager never sees the times', async () => {
    const onConsent = ok();
    const { rerender } = render(<PresenceDayScreen live={{ state: 'ready', month: '2026-10', onMonth: vi.fn(), mine: { month: '2026-10', today: '2026-10-28', enabled: true, notice: 'Presence notice v1', consent: null, history: [], days: [] }, onConsent }} />);
    await ue.click(screen.getByRole('button', { name: 'Review and give consent' }));
    expect(within(screen.getByRole('dialog')).getByText(/Keystrokes, screenshots/)).toBeInTheDocument();
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Give consent' }));
    await waitFor(() => expect(onConsent).toHaveBeenCalledWith('give'));
    rerender(<PresenceDayScreen live={{ state: 'ready', month: '2026-10', onMonth: vi.fn(), team: { month: '2026-10', scope: 'team', days: [{ id: 'x', employeeId: 'f', person: 'Fathima Beevi', dept: 'Quality', on: '2026-10-22', status: 'half_day', byPresence: true, activeMinutes: 230, first: null, last: null, webIn: null, webOut: null, consent: { givenAt: null, version: null }, withdrawnAt: null }] } }} />);
    await ue.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText(/never a minute-by-minute timeline/)).toBeInTheDocument();
    expect(screen.queryByText('First active')).toBeNull();
  });
});

describe('TIM-16 Attendance reports (live)', () => {
  it('HR adds people up by department; the night register lists consent', () => {
    const base = { month: '2026-09', onMonth: vi.fn(), onReport: vi.fn() };
    const { rerender } = render(<AttendanceReportsScreen live={{ ...base, report: 'late', state: 'ready', data: { month: '2026-09', upTo: '2026-09-30', scope: 'company', stage: 'locked', rows: [{ id: 'a', name: 'A', code: null, dept: 'Quality', location: 'Hosur', late: 2, early: 1, otMinutes: 90, lop: 0 }, { id: 'b', name: 'B', code: null, dept: 'Quality', location: 'Hosur', late: 1, early: 0, otMinutes: 30, lop: 1 }] } }} />);
    expect(screen.getAllByText('Quality').length).toBeGreaterThan(0);
    rerender(<AttendanceReportsScreen live={{ ...base, report: 'night', state: 'ready', data: { month: '2026-09', stage: 'open', rows: [{ id: 'k', name: 'Kavitha Sundaram', code: 'K1', location: 'Hosur', shifts: 6, nightMinutes: 2880, consent: null }] } }} />);
    expect(screen.getByText('None on file')).toBeInTheDocument();
  });
});
