import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RosterScreen, type LiveRoster } from './roster';
import { ShiftEditorScreen } from './roster';
import { ShiftSwapSheet, type LiveMyShifts } from './requests';
import type { LiveShiftSetup } from './live/shifts-setup';
import type { MyShifts, RosterWeek, ShiftSetup, TeamRosterWeek } from './live/types';
import type { LiveStaffRoster } from './roster';

// The designed rostering screens (TIM-05 roster, TIM-06 shift editor, TIM-08 my shifts and swaps) with the live
// app's data: what each page must do once it is live. Ported from the old live-copy tests (live-b2.test.tsx).

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
const roster = (over: Partial<LiveRoster> = {}): LiveRoster => ({
  state: 'ready',
  data: ROSTER,
  week: '2026-10-12',
  onWeek: vi.fn(),
  onCells: vi.fn(async () => ({})),
  onCopy: vi.fn(async () => ({})),
  onPublish: vi.fn(async () => ({})),
  ...over,
});

describe('TIM-05 Roster, live (YX-AT-07)', () => {
  it('shows the planned week and the server’s checks; publish calls the API', async () => {
    const live = roster();
    render(<RosterScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'Roster' })).toBeInTheDocument();
    expect(screen.getByText('Murugan Selvam')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Roster checks' })).toHaveTextContent('No night-work consent on file');
    expect(screen.getByText(/Draft · 1 change not visible to staff/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Publish roster' }));
    const confirm = screen.getAllByRole('button', { name: 'Publish roster' });
    await ue.click(confirm[confirm.length - 1]);
    await waitFor(() => expect(live.onPublish).toHaveBeenCalledWith('2026-10-12'));
  });

  it('moves a week back and forward', async () => {
    const live = roster();
    render(<RosterScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(live.onWeek).toHaveBeenCalledWith('2026-10-05');
    await ue.click(screen.getByRole('button', { name: 'Next week' }));
    expect(live.onWeek).toHaveBeenCalledWith('2026-10-19');
  });

  it('copies last week after the confirm, and shows a refusal in the dialog', async () => {
    const onCopy = vi.fn(async () => {
      throw new Error('Last week has no published roster to copy.');
    });
    render(<RosterScreen live={roster({ onCopy })} />);
    await ue.click(screen.getByRole('button', { name: 'Copy last week' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Copy week of 5 Oct 2026 into this week?');
    await ue.click(within(dialog).getByRole('button', { name: 'Copy week' }));
    expect(onCopy).toHaveBeenCalledWith('2026-10-05', '2026-10-12');
    expect(await within(screen.getByRole('dialog')).findByText(/no published roster to copy/)).toBeInTheDocument();
  });

  it('loading, error with retry, no access and no one to plan', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<RosterScreen live={roster({ state: 'error', data: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<RosterScreen live={roster({ state: 'no-access', data: null })} />);
    expect(screen.getByText(/the roster/i)).toBeInTheDocument();
    rerender(<RosterScreen live={roster({ data: { ...ROSTER, people: [] } })} />);
    expect(screen.getByText('No one to plan')).toBeInTheDocument();
    // Swap with no one to plan says why instead of opening.
    await ue.click(screen.getByRole('button', { name: 'Swap shifts' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await screen.findAllByText('No one to plan this week')).length).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ TIM-08 my shifts and swaps

const MINE: MyShifts = {
  week: '2026-10-05',
  days: [
    { on: '2026-10-09', shift: { shiftId: 's-m', name: 'Morning', start: 360, end: 840 }, off: false, employed: true },
    { on: '2026-10-10', shift: { shiftId: 's-m', name: 'Morning', start: 360, end: 840 }, off: false, employed: true },
    { on: '2026-10-11', shift: null, off: true, employed: true },
  ],
  colleagues: [{ id: 'c1', name: 'Karthik Raja' }],
  swaps: [{ id: 'sw1', on: '2026-10-10', mine: true, with: 'Karthik Raja', status: 'pending', reason: 'Family function' }],
};
const mine = (over: Partial<LiveMyShifts> = {}): LiveMyShifts => ({ state: 'ready', data: MINE, today: '2026-10-09', onSwap: vi.fn(async () => ({})), onWithdrawSwap: vi.fn(async () => ({})), ...over });

describe('TIM-08 My shifts and swaps, live', () => {
  it('lists my shifts; a pending swap can be withdrawn', async () => {
    const live = mine();
    render(<ShiftSwapSheet live={live} />);
    expect(screen.getByRole('list', { name: 'My shifts' })).toHaveTextContent('Fri 9 Oct 2026 · Morning 6 am – 2 pm');
    expect(screen.getByText('Swap pending')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(live.onWithdrawSwap).toHaveBeenCalledWith('sw1');
  });

  it('asks a teammate to swap: errors only on send, then sends', async () => {
    const live = mine();
    render(<ShiftSwapSheet live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Ask to swap' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Choose the colleague.')).not.toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(within(dialog).getByText('Choose the colleague.')).toBeInTheDocument();
    expect(within(dialog).getByText('Say why you want to swap.')).toBeInTheDocument();
    expect(live.onSwap).not.toHaveBeenCalled();
  });

  it('shows the server’s refusal in the sheet', async () => {
    const onSwap = vi.fn(async () => {
      throw new Error('Karthik Raja is on leave that day.');
    });
    render(<ShiftSwapSheet live={mine({ onSwap, data: { ...MINE, swaps: [] } })} />);
    await ue.click(screen.getAllByRole('button', { name: 'Ask to swap' })[0]);
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('combobox', { name: /Swap with/ }));
    await ue.click(await screen.findByRole('option', { name: 'Karthik Raja' }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'School annual day');
    await ue.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(onSwap).toHaveBeenCalledWith({ on: '2026-10-09', colleagueEmployeeId: 'c1', reason: 'School annual day' });
    expect(await within(dialog).findByText('Karthik Raja is on leave that day.')).toBeInTheDocument();
  });

  it('no teammate: no swap button, and it says why', () => {
    render(<ShiftSwapSheet live={mine({ data: { ...MINE, colleagues: [], swaps: [] } })} />);
    expect(screen.queryByRole('button', { name: 'Ask to swap' })).not.toBeInTheDocument();
    expect(screen.getByText(/No teammate to swap with/)).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------ TIM-06 shifts set-up

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
const setup = (over: Partial<LiveShiftSetup> = {}): LiveShiftSetup => ({
  state: 'ready',
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
  ...over,
});

describe('TIM-06 Shift editor, live (HR › Shifts set-up)', () => {
  it('lists shifts with the next-morning end, patterns with crews, and the night-work checklist', async () => {
    render(<ShiftEditorScreen live={setup()} />);
    expect(screen.getByRole('heading', { name: 'Night shift' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Shifts' })).toHaveTextContent('(next day)');
    await ue.click(screen.getByRole('tab', { name: 'Patterns' }));
    expect(screen.getByRole('list', { name: 'Who follows it' })).toHaveTextContent('starts on day 8');
    await ue.click(screen.getByRole('tab', { name: 'Night work' }));
    expect(screen.getByText('Not checked')).toBeInTheDocument();
    expect(screen.getByText(/There is no override/)).toBeInTheDocument();
  });

  it('a new shift shows what to fix only on save', async () => {
    const live = setup();
    render(<ShiftEditorScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Add a shift' }));
    expect(screen.queryByText(/Use 1 to 6 capital letters/)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    expect(screen.getAllByText(/Use 1 to 6 capital letters/).length).toBeGreaterThan(0);
    expect(live.onCreateShift).not.toHaveBeenCalled();
  });

  it('a half day not under the full day is a field error; nothing changed says so', async () => {
    const live = setup();
    render(<ShiftEditorScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    expect((await screen.findAllByText('Nothing has changed yet')).length).toBeGreaterThan(0);
    const half = screen.getByRole('textbox', { name: /Half day from/ });
    await ue.clear(half);
    await ue.type(half, '9');
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    expect(screen.getAllByText(/Make the half day less than the full day/).length).toBeGreaterThan(0);
    expect(live.onShiftTimes).not.toHaveBeenCalled();
  });

  it('saves new times for an existing shift from a date', async () => {
    const live = setup();
    render(<ShiftEditorScreen live={live} />);
    const grace = screen.getByRole('textbox', { name: /Late grace/ });
    await ue.clear(grace);
    await ue.type(grace, '15');
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    await waitFor(() => expect(live.onShiftTimes).toHaveBeenCalledWith('s-n', expect.objectContaining({ validFrom: '2026-10-09', start: 1320, end: 360, graceMinutes: 15, halfDayMinutes: 240, fullDayMinutes: 450 })));
    expect(live.onShiftDetails).not.toHaveBeenCalled();
  });

  it('a new pattern needs a name and a day; applying a pattern needs who', async () => {
    const live = setup();
    render(<ShiftEditorScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: 'Patterns' }));
    await ue.click(screen.getByRole('button', { name: 'Apply pattern' }));
    expect(screen.getAllByText('Choose who the pattern is for.').length).toBeGreaterThan(0);
    expect(live.onAssignPattern).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Add pattern' }));
    await ue.click(screen.getByRole('button', { name: 'Save pattern' }));
    expect(screen.getAllByText('Name the pattern.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Give at least one day a shift.').length).toBeGreaterThan(0);
    expect(live.onCreatePattern).not.toHaveBeenCalled();
  });

  it('loading, error with retry and no access', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ShiftEditorScreen live={setup({ state: 'error', data: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<ShiftEditorScreen live={setup({ state: 'no-access', data: null })} />);
    expect(screen.getByText(/the shifts set-up/i)).toBeInTheDocument();
  });
});

describe('TIM-05 rules, notice and Staff, live (feature sheet rules 1–6)', () => {
  it('shows the new rule checks (hours, weekly off, licence) with the limits from the server', () => {
    const cells = ROSTER.people[0].cells.map((c, i) => (i === 2 ? { ...c, conflicts: [{ on: c.on, kind: 'licence' as const, message: 'Murugan Selvam has no valid Forklift licence on this day' }] } : i === 6 ? { ...c, conflicts: [{ on: c.on, kind: 'weekly_off' as const, message: 'No weekly off in the week of 12 Oct 2026 (at least 1)' }] } : c));
    render(<RosterScreen live={roster({ data: { ...ROSTER, rules: { minRestHours: 12, maxDailyHours: 9, maxWeeklyHours: 48, maxSpreadOverHours: 10.5, minWeeklyOffs: 1 }, people: [{ ...ROSTER.people[0], cells }] } })} />);
    const checks = screen.getByRole('list', { name: 'Roster checks' });
    expect(checks).toHaveTextContent('Licence');
    expect(checks).toHaveTextContent('No weekly off');
    expect(screen.getByText(/minimum rest 12 h · max 9 h a day, 48 h a week/)).toBeInTheDocument();
  });

  it('a publish inside the notice asks for a reason: too early shows the field error and focus, then publishes with it', async () => {
    const onPublish = vi.fn(async (_w: string, reason?: string) => {
      if (!reason) throw Object.assign(new Error('1 change starts sooner than the notice the people are owed.'), { code: 'NOTICE_REASON' });
      return {};
    });
    render(<RosterScreen live={roster({ onPublish })} />);
    await ue.click(screen.getByRole('button', { name: 'Publish roster' }));
    const confirm = screen.getAllByRole('button', { name: 'Publish roster' });
    await ue.click(confirm[confirm.length - 1]);
    const dialog = await screen.findByRole('dialog', { name: 'Some changes start too soon' });
    await ue.click(within(dialog).getByRole('button', { name: 'Publish with reason' }));
    expect(within(dialog).getByText(/at least 5 letters/)).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /Reason/ })).toHaveFocus();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Machine breakdown on line 2');
    await ue.click(within(dialog).getByRole('button', { name: 'Publish with reason' }));
    await waitFor(() => expect(onPublish).toHaveBeenLastCalledWith('2026-10-12', 'Machine breakdown on line 2'));
  });

  const TEAM: TeamRosterWeek = {
    week: '2026-10-12',
    to: '2026-10-18',
    today: '2026-10-09',
    team: true,
    shifts: ROSTER.shifts,
    people: [
      { id: 'me', name: 'Rekha Balan', code: 'KFT-0102', me: true, cells: Array.from({ length: 7 }, (_, i) => ({ on: `2026-10-${12 + i}`, employed: true, shift: i < 5 ? { shiftId: 's-m', name: 'Morning', start: 360, end: 840 } : null, off: i >= 5, leave: null })) },
      { id: 'p2', name: 'Kavitha Sundaram', code: 'KFT-0103', me: false, cells: Array.from({ length: 7 }, (_, i) => ({ on: `2026-10-${12 + i}`, employed: true, shift: { shiftId: 's-n', name: 'Night', start: 1320, end: 360 }, off: false, leave: i === 1 ? ('away' as const) : null })) },
    ],
  };
  const staff = (over: Partial<LiveStaffRoster> = {}): LiveStaffRoster => ({ state: 'ready', data: TEAM, week: '2026-10-12', onWeek: vi.fn(), swapHref: '/yx/time/shifts', ...over });

  it('Staff: the published team week read-only, me marked You, a colleague on leave only as Away, the swap link', () => {
    render(<RosterScreen staffLive={staff()} />);
    expect(screen.getByText('Rekha Balan')).toBeInTheDocument();
    expect(screen.getByText('Kavitha Sundaram')).toBeInTheDocument();
    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
    expect(screen.getByRole('list', { name: 'Shift key' })).toHaveTextContent('on leave');
    expect(screen.getByRole('link', { name: 'Ask to swap a shift' })).toHaveAttribute('href', '/yx/time/shifts');
    expect(screen.queryByRole('button', { name: 'Publish roster' })).not.toBeInTheDocument();
  });

  it('Staff, setting off: only my row and the note why; loading and error states', async () => {
    const { unmount } = render(<RosterScreen staffLive={staff({ data: { ...TEAM, team: false, people: [TEAM.people[0]] } })} />);
    expect(screen.queryByText('Kavitha Sundaram')).not.toBeInTheDocument();
    expect(screen.getByText(/only their own roster; HR can change that/)).toBeInTheDocument();
    unmount();
    const onRetry = vi.fn();
    render(<RosterScreen staffLive={staff({ state: 'error', data: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
