import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MyOvertimeScreen } from '../my-overtime';
import { OtReviewScreen, PeriodsScreen, ShiftSwapSheet } from '../requests';
import { ToastProvider } from '../../../components/notify';
import { PayrollFeedScreen } from '../payroll-feed';
import { AttendanceReportsScreen } from '../ops';
import { RosterScreen } from '../roster';
import { ShiftEditorScreen } from '../roster';
import { TimesheetScreen } from '../ops';
import type { MyOvertime, MyShifts, MyTimesheet, Muster, OtReview, PayrollFeed, Periods, Registers, RosterWeek, ShiftSetup } from './types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

const ROSTER: RosterWeek = {
  week: '2026-10-12',
  to: '2026-10-18',
  today: '2026-10-09',
  scope: 'team',
  shifts: [
    { id: 's-m', code: 'M', name: 'Morning', colour: 'orange', night: false, start: 360, end: 840 },
    { id: 's-n', code: 'N', name: 'Night', colour: 'purple', night: true, start: 1320, end: 360 },
  ],
  drafts: 1,
  people: [
    {
      id: 'p1',
      name: 'Murugan Selvam',
      code: 'KFT-0101',
      cells: Array.from({ length: 7 }, (_, i) => ({
        on: `2026-10-${12 + i}`,
        employed: true,
        planned: i === 6 ? null : { shiftId: i < 3 ? 's-m' : 's-n', name: i < 3 ? 'Morning' : 'Night', start: i < 3 ? 360 : 1320, end: i < 3 ? 840 : 360 },
        conflicts: i === 4 ? [{ on: '2026-10-16', kind: 'night' as const, message: 'No night-work consent on file for Murugan Selvam' }] : [],
      })),
    },
  ],
};

describe('Roster planner (YX-AT-07)', () => {
  it('shows the planned week and the server’s checks; a change is saved as a draft, publish calls the API', async () => {
    const onCells = vi.fn(async () => ({}));
    const onPublish = vi.fn(async () => ({}));
    render(<RosterScreen live={{ state: 'ready', data: ROSTER, week: '2026-10-12', onWeek: vi.fn(), onCells, onCopy: vi.fn(async () => ({})), onPublish }} />);
    expect(screen.getByRole('heading', { name: 'Roster' })).toBeInTheDocument();
    expect(screen.getByText('Draft · not visible to staff')).toBeInTheDocument();
    expect(screen.getByText('Murugan Selvam')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Roster checks' })).toHaveTextContent('No night-work consent on file');
    expect(screen.getByRole('button', { name: 'Copy last week' })).toBeInTheDocument();
    // The server's night-work guard blocks nights in the grid too, so the week can't be published yet.
    expect(screen.getByRole('button', { name: 'Publish roster' })).toBeDisabled();
    cleanup();
    const clear: RosterWeek = { ...ROSTER, people: ROSTER.people.map((x) => ({ ...x, cells: x.cells.map((c) => ({ ...c, conflicts: [] })) })) };
    render(<RosterScreen live={{ state: 'ready', data: clear, week: '2026-10-12', onWeek: vi.fn(), onCells, onCopy: vi.fn(async () => ({})), onPublish }} />);
    await ue.click(screen.getByRole('button', { name: 'Publish roster' }));
    await ue.click(screen.getAllByRole('button', { name: 'Publish roster' })[0]);
    await waitFor(() => expect(onPublish).toHaveBeenCalledWith('2026-10-12'));
  });

  it('an employee sees their shifts and asks a teammate to swap: Send waits for a colleague and a reason, then a toast', async () => {
    const data: MyShifts = { week: '2026-10-05', days: [{ on: '2026-10-10', shift: { shiftId: 's-m', name: 'Morning', start: 360, end: 840 }, off: false, employed: true }], colleagues: [{ id: 'c1', name: 'Karthik Raja' }], swaps: [] };
    const onSwap = vi.fn(async () => ({}));
    render(<ToastProvider><ShiftSwapSheet live={{ state: 'ready', data, today: '2026-10-09', onSwap, onWithdraw: vi.fn(async () => ({})), onOpenApprovals: vi.fn() }} /></ToastProvider>);
    expect(screen.getByRole('heading', { name: 'My shifts' })).toBeInTheDocument();
    expect(screen.getByText(/Sat 10 Oct · Morning 6 am – 2 pm/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Ask to swap' }));
    const dialog = screen.getByRole('dialog', { name: 'Shift change or swap' });
    expect(within(dialog).getByText('Pick a colleague')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send request' })).toBeDisabled();
    expect(onSwap).not.toHaveBeenCalled();
  });
});

const SETUP: ShiftSetup = {
  today: '2026-10-09',
  shifts: [{ id: 's-n', code: 'N', name: 'Night', colour: 'purple', night: true, active: true, versions: [{ validFrom: '2026-01-01', start: 1320, end: 360, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes: 30, breakAboveMinutes: 300 }] }],
  patterns: [{ id: 'pt', name: 'Hosur 3-shift rotation', kind: 'cycle', cycle: ['s-n', null], active: true, assignments: [{ id: 'a1', scopeType: 'employee', scopeId: 'e1', scopeName: 'Murugan Selvam', validFrom: '2026-06-01', offsetDays: 7, removable: false }] }],
  otRules: [],
  projects: [],
  night: { locations: [{ locationId: 'l1', name: 'Hosur plant', window: { start: 1140, end: 360 }, items: [{ item: 'transport', label: 'Transport pick-up and drop', attestedOn: null, reviewDue: null, note: null, ok: false }] }], consents: [] },
  hasCompOffType: true,
  locations: [{ id: 'l1', name: 'Hosur plant', state: 'IN-TN' }],
  departments: [],
  entities: [],
  people: [{ id: 'e1', name: 'Murugan Selvam', code: 'KFT-0101' }],
  users: [],
};
const setupProps = () => ({
  state: 'ready' as const,
  data: SETUP,
  onCreateShift: vi.fn(async () => ({})),
  onShiftTimes: vi.fn(async () => ({})),
  onShiftDetails: vi.fn(async () => ({})),
  onCreatePattern: vi.fn(async () => ({})),
  onAssignPattern: vi.fn(async () => ({})),
  onRemoveAssignment: vi.fn(async () => ({})),
  onCreateOtRule: vi.fn(async () => ({})),
  onRemoveOtRule: vi.fn(async () => ({})),
  onSaveProject: vi.fn(async () => ({})),
  onAddConsent: vi.fn(async () => ({})),
  onWithdrawConsent: vi.fn(async () => ({})),
  onAttest: vi.fn(async () => ({})),
});

describe('Shifts & patterns (the designed TIM-06)', () => {
  it('opens the first shift in the designed editor, patterns with who follows them, and the night-work checklist', async () => {
    render(<ToastProvider><ShiftEditorScreen live={setupProps()} /></ToastProvider>);
    expect(screen.getByRole('heading', { name: 'Night shift' })).toBeInTheDocument();
    expect(screen.getByText('Ends next day; the day belongs to the start date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save shift' })).toBeDisabled();
    await ue.click(screen.getByRole('tab', { name: 'Patterns' }));
    expect(screen.getByText('Murugan Selvam')).toBeInTheDocument();
    expect(screen.getByText(/starts on day 8/)).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Night work' }));
    expect(screen.getByText('Not checked')).toBeInTheDocument();
    expect(screen.getByText(/There is no override/)).toBeInTheDocument();
  });

  it('a new shift: Save waits for a name and code (never red while typing), then creates it with the times', async () => {
    const p = setupProps();
    render(<ToastProvider><ShiftEditorScreen live={p} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'New shift' }));
    expect(screen.getByText('Enter a name')).toBeInTheDocument();
    expect(screen.queryByText(/Fix 1 thing/)).toBeNull();
    await ue.type(screen.getByRole('textbox', { name: /^Name/ }), 'General');
    await ue.type(screen.getByRole('textbox', { name: /^Code/ }), 'g');
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    await waitFor(() => expect(p.onCreateShift).toHaveBeenCalledWith(expect.objectContaining({ code: 'G', name: 'General', start: 570, end: 1110, graceMinutes: 10, fullDayMinutes: 450, halfDayMinutes: 240 })));
  });
});

describe('Overtime', () => {
  it('an employee claims a worked day with the server’s figures', async () => {
    const data: MyOvertime = { today: '2026-10-09', claims: [], open: [{ on: '2026-10-05', category: 'normal', workedMinutes: 540, scheduledMinutes: 450, eligibleMinutes: 90, payableMinutes: 90, overCapMinutes: 0, settle: 'comp_off', needsApproval: true }] };
    const onClaim = vi.fn(async () => ({}));
    render(<ToastProvider><MyOvertimeScreen live={{ state: "ready", data, onClaim, onWithdraw: vi.fn(async () => ({})) }} /></ToastProvider>);
    expect(screen.getByRole("heading", { name: "My overtime" })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Claim overtime' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Comp-off, added to your leave balance when approved')).toBeInTheDocument();
    await ue.type(within(dialog).getByRole('textbox', { name: /What was it for/ }), 'Line changeover');
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onClaim).toHaveBeenCalledWith({ on: '2026-10-05', reason: 'Line changeover' }));
  });

  it('the designed overtime review approves in place, and HR pays over the limit only with a reason', async () => {
    const base = { employeeId: 'e1', category: 'normal' as const, workedMinutes: 600, scheduledMinutes: 450, eligibleMinutes: 150, payableMinutes: 90, rate: 2, settle: 'pay' as const, compOffDays: 0, reason: 'x', overridden: false, overrideReason: null };
    const data: OtReview = { month: '2026-10', scope: 'company', claims: [
      { ...base, id: 'o1', on: '2026-10-05', overCapMinutes: 60, status: 'approved', name: 'Murugan Selvam', canOverride: true, taskId: null },
      { ...base, id: 'o2', on: '2026-10-06', overCapMinutes: 0, status: 'pending', name: 'Kavya Reddy', taskId: 't2' },
    ] };
    const onOverride = vi.fn(async () => ({}));
    const onDecide = vi.fn(async () => ({}));
    render(<ToastProvider><OtReviewScreen live={{ state: 'ready', data, today: '2026-10-09', onDecide, onOverride }} /></ToastProvider>);
    expect(screen.getByRole('heading', { name: 'Overtime review' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('t2', 'approve'));
    expect((await screen.findAllByText("Approved Kavya Reddy's overtime for 6 Oct")).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Override limit' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Approve with override' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Approved by the plant head');
    await ue.click(within(dialog).getByRole('button', { name: 'Approve with override' }));
    await waitFor(() => expect(onOverride).toHaveBeenCalledWith('o1', 'Approved by the plant head'));
  });
});

describe('Timesheet, periods, registers and the payroll feed', () => {
  it('the designed week shows locked days; a sent week can be recalled to edit', async () => {
    const data: MyTimesheet = { week: '2026-09-28', mode: 'timesheet', sheet: { id: 't1', status: 'pending', totalMinutes: 960 }, lines: [{ id: 'l1', projectId: 'pr', activity: 'Docs', billable: false, minutes: [480, 480, 0, 0, 0, 0, 0], note: null }], projects: [{ id: 'pr', code: 'AUDIT', name: 'Audit readiness', billable: false, activities: ['Docs'], active: true }], days: Array.from({ length: 7 }, (_, i) => ({ on: `2026-${i < 3 ? '09' : '10'}-${String(i < 3 ? 28 + i : i - 2).padStart(2, '0')}`, holiday: null, leave: null, locked: i < 3 })), recent: [] };
    const onWithdraw = vi.fn(async () => ({}));
    render(<ToastProvider><TimesheetScreen live={{ state: 'ready', data, week: '2026-09-28', today: '2026-10-09', onWeek: vi.fn(), onSave: vi.fn(async () => ({})), onSubmit: vi.fn(async () => ({})), onWithdraw }} /></ToastProvider>);
    expect(screen.getByRole('heading', { name: 'My timesheet' })).toBeInTheDocument();
    expect(screen.getByText('Part of this week is locked')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Recall to edit' }));
    await waitFor(() => expect(onWithdraw).toHaveBeenCalledWith('t1'));
  });

  it('locking shows the pre-flight first and refuses while requests wait', async () => {
    const data: Periods = { year: '2026', today: '2026-10-09', entities: [{ id: 'le', name: 'Kaveri Foods TN', months: [{ month: '2026-09', stage: 'open', changedAt: null, changedBy: null, reason: null, lockable: true }, { month: '2026-10', stage: 'open', changedAt: null, changedBy: null, reason: null, lockable: false }] }] };
    const onLock = vi.fn(async () => ({}));
    const onOpen = vi.fn();
    render(<ToastProvider><PeriodsScreen live={{ state: 'ready', data, onPreflight: vi.fn(async () => ({ month: '2026-09', lockableFrom: '2026-10-02', people: 6, pending: [{ kind: 'Overtime claims', count: 1 }], exceptions: 0 })), onLock, onUnlock: vi.fn(async () => ({})), onOpen }} /></ToastProvider>);
    expect(screen.getByRole('heading', { name: 'Periods' })).toBeInTheDocument();
    expect(screen.getByText('Can be locked from 2 Nov')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Pre-lock checklist' })[1]);
    const drawer = screen.getByRole('dialog', { name: /September 2026 · pre-lock checklist/ });
    expect(await within(drawer).findByText('1 pending')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Lock period' })).toBeDisabled();
    await ue.click(within(drawer).getByRole('button', { name: 'Review OT' }));
    expect(onOpen).toHaveBeenCalledWith('overtime');
    expect(onLock).not.toHaveBeenCalled();
  });

  it('registers download each format; the feed is read only and says when it is frozen', async () => {
    const regs: Registers = { month: '2026-09', locations: [{ id: 'l1', name: 'Hosur plant', state: 'IN-TN', entityId: 'le', entity: 'Kaveri Foods TN', people: 6, locked: true, formats: [{ type: 'muster', title: 'Register of attendance (muster roll)', form: 'TN form', columns: ['Sl. no.'] }], source: 'x', verify: true }] };
    const onDownload = vi.fn(async () => ({}));
    const base = { leavePart: null, workedMinutes: 480, regularised: false, leave: null, ot: null, waiting: false, wfh: false };
    const muster: Muster = { month: '2026-09', from: '2026-09-01', to: '2026-09-30', scope: 'company', people: [{ id: 'm', name: 'Murugan Selvam', code: 'KFT-0101', location: 'Hosur plant', department: 'Production', me: false, mode: 'punch', missingPunchEffect: 'block_payroll_approval', days: [{ ...base, on: '2026-09-02', status: 'present', lateMinutes: 12 }, { ...base, on: '2026-09-03', status: 'present', lateMinutes: null, ot: { minutes: 90, status: 'approved' } }] }] };
    const { unmount } = render(<ToastProvider><AttendanceReportsScreen live={{ state: 'ready', muster, registers: regs, today: '2026-10-09', month: '2026-09', months: ['2026-10', '2026-09'], onMonth: vi.fn(), onDownload }} /></ToastProvider>);
    expect(screen.getByRole('heading', { name: 'Attendance reports' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Report rows' })).toHaveTextContent('Production');
    await ue.click(screen.getByRole('combobox', { name: 'Report' }));
    await ue.click(screen.getByRole('option', { name: 'Register of attendance (muster roll)' }));
    await ue.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(onDownload).toHaveBeenCalledWith('muster', 'l1', 'pdf');
    unmount();
    const feed: PayrollFeed = { entity: { id: 'le', name: 'Kaveri Foods TN' }, month: '2026-09', frozen: true, lockedAt: '2026-10-02T10:00:00Z', rows: [{ employeeId: 'e1', name: 'Murugan Selvam', code: 'KFT-0101', mode: 'punch', calendarDays: 30, paidDays: 29.5, lopDays: 0.5, otNormalMinutes: 90, otWeeklyOffMinutes: 0, otHolidayMinutes: 0, nightShifts: 7, compOffDays: 0.5, timesheetMinutes: 0, unevaluatedDays: 0 }] };
    render(<PayrollFeedScreen live={{ state: 'ready', data: feed, entities: [{ id: 'le', name: 'Kaveri Foods TN' }], entityId: 'le', onEntity: vi.fn(), month: '2026-09', months: ['2026-09'], onMonth: vi.fn() }} />);
    expect(screen.getByRole('heading', { name: 'Payroll feed' })).toBeInTheDocument();
    expect(screen.getByText('Frozen 2 Oct')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Payroll feed' });
    expect(table).toHaveTextContent('29.5');
    expect(table).toHaveTextContent('1 h 30 min');
  });
});
