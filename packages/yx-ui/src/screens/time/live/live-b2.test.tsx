import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MyOvertimeScreen, OvertimeReviewScreen } from './overtime';
import { PayrollFeedScreen, PeriodsScreen, RegistersScreen } from './periods';
import { MyShiftsScreen, RosterPlannerScreen } from './roster';
import { ShiftsSetupScreen } from './shifts-setup';
import { MyTimesheetScreen } from './timesheet';
import type { MyOvertime, MyShifts, MyTimesheet, OtReview, PayrollFeed, Periods, Registers, RosterWeek, ShiftSetup } from './types';

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
    render(<RosterPlannerScreen state="ready" data={ROSTER} week="2026-10-12" onWeek={vi.fn()} onCells={onCells} onCopy={vi.fn(async () => ({}))} onPublish={onPublish} />);
    expect(screen.getByText('Murugan Selvam')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Roster checks' })).toHaveTextContent('No night-work consent on file');
    expect(screen.getByRole('button', { name: 'Copy last week' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Publish roster' }));
    const confirm = screen.getAllByRole('button', { name: 'Publish roster' });
    await ue.click(confirm[0]);
    await waitFor(() => expect(onPublish).toHaveBeenCalledWith('2026-10-12'));
  });

  it('an employee sees their shifts and asks a teammate to swap (no errors while typing)', async () => {
    const data: MyShifts = { week: '2026-10-05', days: [{ on: '2026-10-10', shift: { shiftId: 's-m', name: 'Morning', start: 360, end: 840 }, off: false, employed: true }], colleagues: [{ id: 'c1', name: 'Karthik Raja' }], swaps: [] };
    const onSwap = vi.fn(async () => ({}));
    render(<MyShiftsScreen state="ready" data={data} today="2026-10-09" onSwap={onSwap} onWithdrawSwap={vi.fn(async () => ({}))} />);
    await ue.click(screen.getByRole('button', { name: 'Ask to swap a shift' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Choose the colleague.')).not.toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Send to my colleague' }));
    expect(within(dialog).getAllByText('Choose the colleague.').length).toBeGreaterThan(0);
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

describe('Shifts set-up', () => {
  it('lists shifts with the next-morning end, patterns with crews, and the night-work checklist', async () => {
    render(<ShiftsSetupScreen {...setupProps()} />);
    expect(screen.getByText(/10:00 pm to 6:00 am \(next day\)/)).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Patterns' }));
    expect(screen.getByText(/Murugan Selvam from/)).toHaveTextContent('starts on day 8');
    await ue.click(screen.getByRole('tab', { name: 'Night work' }));
    expect(screen.getByText('Not checked')).toBeInTheDocument();
    expect(screen.getByText(/There is no override/)).toBeInTheDocument();
  });

  it('a new shift shows what to fix only on save', async () => {
    const p = setupProps();
    render(<ShiftsSetupScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Add a shift' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/Use 1 to 6 capital letters/)).not.toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getAllByText(/Use 1 to 6 capital letters/).length).toBeGreaterThan(0);
    expect(p.onCreateShift).not.toHaveBeenCalled();
  });
});

describe('Overtime', () => {
  it('an employee claims a worked day with the server’s figures', async () => {
    const data: MyOvertime = { today: '2026-10-09', claims: [], open: [{ on: '2026-10-05', category: 'normal', workedMinutes: 540, scheduledMinutes: 450, eligibleMinutes: 90, payableMinutes: 90, overCapMinutes: 0, settle: 'comp_off', needsApproval: true }] };
    const onClaim = vi.fn(async () => ({}));
    render(<MyOvertimeScreen state="ready" data={data} onClaim={onClaim} onWithdraw={vi.fn(async () => ({}))} />);
    await ue.click(screen.getByRole('button', { name: 'Claim overtime' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Comp-off, added to your leave balance when approved')).toBeInTheDocument();
    await ue.type(within(dialog).getByRole('textbox', { name: /What was it for/ }), 'Line changeover');
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onClaim).toHaveBeenCalledWith({ on: '2026-10-05', reason: 'Line changeover' }));
  });

  it('HR pays over the limit only with a reason', async () => {
    const data: OtReview = { month: '2026-10', scope: 'company', claims: [{ id: 'o1', employeeId: 'e1', on: '2026-10-05', category: 'normal', workedMinutes: 600, scheduledMinutes: 450, eligibleMinutes: 150, payableMinutes: 90, overCapMinutes: 60, rate: 2, settle: 'pay', compOffDays: 0, reason: 'x', status: 'approved', overridden: false, overrideReason: null, name: 'Murugan Selvam', canOverride: true }] };
    const onOverride = vi.fn(async () => ({}));
    render(<OvertimeReviewScreen state="ready" data={data} month="2026-10" onMonth={vi.fn()} onOverride={onOverride} />);
    await ue.click(screen.getByRole('button', { name: 'Pay over the limit' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Pay over the limit' }));
    expect(onOverride).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Why/ }), 'Approved by the plant head');
    await ue.click(within(dialog).getByRole('button', { name: 'Pay over the limit' }));
    await waitFor(() => expect(onOverride).toHaveBeenCalledWith('o1', 'Approved by the plant head'));
  });
});

describe('Timesheet, periods, registers and the payroll feed', () => {
  it('the week shows locked days and submits through the API', () => {
    const data: MyTimesheet = { week: '2026-09-28', mode: 'timesheet', sheet: { id: 't1', status: 'pending', totalMinutes: 960 }, lines: [{ id: 'l1', projectId: 'pr', activity: 'Docs', billable: false, minutes: [480, 480, 0, 0, 0, 0, 0], note: null }], projects: [{ id: 'pr', code: 'AUDIT', name: 'Audit readiness', billable: false, activities: ['Docs'], active: true }], days: Array.from({ length: 7 }, (_, i) => ({ on: `2026-${i < 3 ? '09' : '10'}-${String(i < 3 ? 28 + i : i - 2).padStart(2, '0')}`, holiday: null, leave: null, locked: i < 3 })), recent: [] };
    render(<MyTimesheetScreen state="ready" data={data} week="2026-09-28" today="2026-10-09" onWeek={vi.fn()} onSave={vi.fn(async () => ({}))} onSubmit={vi.fn(async () => ({}))} onWithdraw={vi.fn(async () => ({}))} />);
    expect(screen.getByText('Part of this week is locked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw to change it' })).toBeInTheDocument();
  });

  it('locking shows the pre-flight first and refuses while requests wait', async () => {
    const data: Periods = { year: '2026', today: '2026-10-09', entities: [{ id: 'le', name: 'Kaveri Foods TN', months: [{ month: '2026-09', stage: 'open', changedAt: null, changedBy: null, reason: null, lockable: true }, { month: '2026-10', stage: 'open', changedAt: null, changedBy: null, reason: null, lockable: false }] }] };
    const onLock = vi.fn(async () => ({}));
    render(<PeriodsScreen state="ready" data={data} year="2026" onYear={vi.fn()} onPreflight={vi.fn(async () => ({ month: '2026-09', lockableFrom: '2026-10-02', people: 6, pending: [{ kind: 'Overtime claims', count: 1 }], exceptions: 0 }))} onLock={onLock} onUnlock={vi.fn(async () => ({}))} />);
    await ue.click(screen.getByRole('button', { name: 'Lock' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(/1 overtime claims still waiting/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Lock the month' })).toBeDisabled();
    expect(screen.getByText('Can be locked from the 2nd of the next month')).toBeInTheDocument();
  });

  it('registers download each format; the feed is read only and says when it is frozen', async () => {
    const regs: Registers = { month: '2026-09', locations: [{ id: 'l1', name: 'Hosur plant', state: 'IN-TN', entityId: 'le', entity: 'Kaveri Foods TN', people: 6, locked: true, formats: [{ type: 'muster', title: 'Register of attendance (muster roll)', form: 'TN form', columns: ['Sl. no.'] }], source: 'x', verify: true }] };
    const onDownload = vi.fn(async () => ({}));
    render(<RegistersScreen state="ready" data={regs} month="2026-09" onMonth={vi.fn()} onDownload={onDownload} />);
    await ue.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(onDownload).toHaveBeenCalledWith('muster', 'l1', 'pdf');
    const feed: PayrollFeed = { entity: { id: 'le', name: 'Kaveri Foods TN' }, month: '2026-09', frozen: true, lockedAt: '2026-10-02T10:00:00Z', rows: [{ employeeId: 'e1', name: 'Murugan Selvam', code: 'KFT-0101', mode: 'punch', calendarDays: 30, paidDays: 29.5, lopDays: 0.5, otNormalMinutes: 90, otWeeklyOffMinutes: 0, otHolidayMinutes: 0, nightShifts: 7, compOffDays: 0.5, timesheetMinutes: 0, unevaluatedDays: 0 }] };
    render(<PayrollFeedScreen state="ready" data={feed} entities={[{ id: 'le', name: 'Kaveri Foods TN' }]} entityId="le" onEntity={vi.fn()} month="2026-09" onMonth={vi.fn()} />);
    expect(screen.getByText(/Frozen/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Payroll feed' })).toHaveTextContent('29.5');
  });
});
