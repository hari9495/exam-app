import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { GeofenceEditorScreen, HolidayCalendarsScreen, LeavePoliciesScreen, LeaveTypeEditorScreen, YearEndWizard } from './leave-admin';
import { TIME_SETUP, YEAR_END } from './live/fixtures';
import type { TimeSetup } from './live/types';

// The designed set-up screens (TIM-26 / 27 / 28 / 29 / 31) with the live app's data: what each page must do live.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const base = { state: 'ready' as const, data: TIME_SETUP };
const policies = (over = {}) => ({ ...base, onCreatePolicy: vi.fn(async () => ({ id: 'pol-new' })), onAddVersion: vi.fn(async () => ({})), onAssign: vi.fn(async () => ({})), onRemoveAssignment: vi.fn(async () => ({})), onOpenType: vi.fn(), ...over });

describe('Loading, could not load and no access (every set-up page)', () => {
  it('shows each state', async () => {
    const onRetry = vi.fn();
    const { rerender } = wrap(<LeavePoliciesScreen live={policies({ state: 'loading', data: null })} />);
    expect(screen.getByRole('status', { name: 'Loading the leave set-up' })).toBeInTheDocument();
    rerender(<ToastProvider><HolidayCalendarsScreen live={{ state: 'error', data: null, onRetry, onCreateCalendar: vi.fn(), onUpdateCalendar: vi.fn(), onAddHoliday: vi.fn(), onRemoveHoliday: vi.fn() }} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<ToastProvider><YearEndWizard live={{ state: 'no-access', data: null, onYearEndPreview: vi.fn(), onYearEndRun: vi.fn() }} /></ToastProvider>);
    expect(screen.getByText(/your HR admin/)).toBeInTheDocument();
  });
});

describe('TIM-28 Leave policies, live', () => {
  it('lists the policies with where they apply and the legal minimums', () => {
    wrap(<LeavePoliciesScreen live={policies()} />);
    const table = screen.getByRole('table', { name: 'Leave policies' });
    expect(within(table).getByText('Kaveri Foods standard')).toBeInTheDocument();
    expect(within(table).getByText('Earned 18 · Casual 8 · Sick 7')).toBeInTheDocument();
    expect(within(table).getByText(/Hosur plant from 1 Apr 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Tamil Nadu: Earned 12 days a year/)).toBeInTheDocument();
  });

  it('a new policy needs a name; then it is added with its entitlements and stays open', async () => {
    const live = policies();
    wrap(<LeavePoliciesScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'New policy' }));
    const drawer = screen.getByRole('dialog');
    await ue.click(within(drawer).getByRole('button', { name: /^Save from/ }));
    expect(within(drawer).getAllByText('Name the policy.').length).toBeGreaterThan(0);
    expect(live.onCreatePolicy).not.toHaveBeenCalled();
    await ue.type(within(drawer).getByLabelText(/^Policy name/), 'Interns');
    await ue.click(within(drawer).getAllByRole('button', { name: 'Edit' })[0]);
    const days = within(drawer).getByLabelText(/Earned leave: days a year/);
    await ue.clear(days);
    await ue.type(days, '12');
    await ue.click(within(drawer).getByRole('button', { name: /^Save from/ }));
    await waitFor(() => expect(live.onAddVersion).toHaveBeenCalledWith('pol-new', { validFrom: '2026-10-28', lines: [expect.objectContaining({ leaveTypeId: 'el', annualDays: 12 })] }));
    expect(live.onCreatePolicy).toHaveBeenCalledWith('Interns');
  });

  it('applying a policy asks for the entity first, never a greyed-out button', async () => {
    const live = policies();
    wrap(<LeavePoliciesScreen live={live} />);
    await ue.click(screen.getByText('Hosur plant (Factories Act)'));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apply to' }));
    const apply = screen.getAllByRole('dialog').at(-1)!;
    await ue.click(within(apply).getByRole('button', { name: 'Apply' }));
    expect(within(apply).getByText('Choose one.')).toBeInTheDocument();
    expect(live.onAssign).not.toHaveBeenCalled();
  });

  it('an assignment that has not started yet can be removed', async () => {
    const live = policies();
    wrap(<LeavePoliciesScreen live={{ ...live, data: { ...TIME_SETUP, today: '2026-03-01' } }} />);
    await ue.click(screen.getByText('Hosur plant (Factories Act)'));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(live.onRemoveAssignment).toHaveBeenCalledWith('a2'));
  });
});

describe('TIM-27 Leave type editor, live', () => {
  const editor = (typeId: string, over = {}) => ({ ...base, typeId, policiesHref: '/yx/time/setup', onSaveType: vi.fn(async () => ({ id: 'bl' })), onAdded: vi.fn(), ...over });

  it('a new type: a bad code is refused only on save, then it is added', async () => {
    const live = editor('new');
    wrap(<LeaveTypeEditorScreen live={live} />);
    await ue.type(screen.getByLabelText(/^Code/), 'b-1');
    expect(screen.queryByText(/Use 1 to 8 capital letters/)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add leave type' }));
    expect(screen.getAllByText(/Use 1 to 8 capital letters/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Name the leave type.').length).toBeGreaterThan(0);
    expect(live.onSaveType).not.toHaveBeenCalled();
    await ue.clear(screen.getByLabelText(/^Code/));
    await ue.type(screen.getByLabelText(/^Code/), 'bl');
    await ue.type(screen.getByLabelText(/^Name/), 'Bereavement leave');
    await ue.click(screen.getByRole('button', { name: 'Add leave type' }));
    await waitFor(() => expect(live.onSaveType).toHaveBeenCalledWith(null, expect.objectContaining({ code: 'BL', name: 'Bereavement leave', kind: 'earned', paid: true })));
    expect(live.onAdded).toHaveBeenCalledWith('bl');
  });

  it('a type keeps its code and shows the policies that give it; leave without pay must be unpaid', async () => {
    const live = editor('el');
    wrap(<LeaveTypeEditorScreen live={live} />);
    expect(screen.getByLabelText(/^Code/)).toBeDisabled();
    expect(screen.getByText(/used in 2 policies/)).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Counting' }));
    await ue.click(screen.getByRole('radio', { name: 'Always count them' }));
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(live.onSaveType).toHaveBeenCalledWith('el', expect.objectContaining({ code: 'EL', rules: expect.objectContaining({ sandwich: 'always' }) })));
    const lop = editor('lop');
    wrap(<LeaveTypeEditorScreen live={{ ...lop, data: { ...TIME_SETUP, types: TIME_SETUP.types.map((t) => (t.id === 'lop' ? { ...t, paid: true } : t)) } }} />);
    await ue.click(screen.getAllByRole('button', { name: 'Save' }).at(-1)!);
    expect(screen.getAllByText('Leave without pay is unpaid.').length).toBeGreaterThan(0);
    expect(lop.onSaveType).not.toHaveBeenCalled();
  });

  it('an unknown id says so', () => {
    wrap(<LeaveTypeEditorScreen live={editor('gone')} />);
    expect(screen.getByText('This leave type is not there')).toBeInTheDocument();
  });
});

describe('TIM-26 Holiday calendars, live', () => {
  const cals = (over: Partial<TimeSetup> = {}) => ({ ...base, data: { ...TIME_SETUP, ...over }, onCreateCalendar: vi.fn(async () => ({})), onUpdateCalendar: vi.fn(async () => ({})), onAddHoliday: vi.fn(async () => ({})), onRemoveHoliday: vi.fn(async () => ({})) });

  it('a location without a calendar gets one; another location shows its holidays', async () => {
    const live = cals();
    wrap(<HolidayCalendarsScreen live={live} />);
    expect(screen.getByRole('table', { name: 'Bengaluru head office holidays' })).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: /Hosur plant/ }));
    await ue.click(screen.getByRole('button', { name: 'Add a calendar for Hosur plant' }));
    await waitFor(() => expect(live.onCreateCalendar).toHaveBeenCalledWith({ name: 'Hosur plant holidays', locationId: 'loc-hosur', optionalLimit: 2 }));
  });

  it('Add holiday asks for the name and date, then adds it', async () => {
    const live = cals();
    wrap(<HolidayCalendarsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Add holiday' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Add holiday' }));
    expect(within(dialog).getByText('Enter the holiday name.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose the date.')).toBeInTheDocument();
    expect(live.onAddHoliday).not.toHaveBeenCalled();
  });

  it('Save rules with nothing changed does nothing and says so; a change is saved', async () => {
    const live = cals();
    wrap(<HolidayCalendarsScreen live={live} />);
    expect(screen.getByText('No changes to save')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(live.onUpdateCalendar).not.toHaveBeenCalled();
    const choose = screen.getByLabelText(/Optional holidays each person chooses/);
    await ue.clear(choose);
    await ue.type(choose, '1');
    await ue.click(screen.getByRole('button', { name: 'Save rules' }));
    await waitFor(() => expect(live.onUpdateCalendar).toHaveBeenCalledWith('cal-blr', { name: 'Bengaluru head office holidays', optionalLimit: 1, halfDayOpenHalf: 'first' }));
  });

  it('no locations: says where to add them', () => {
    wrap(<HolidayCalendarsScreen live={cals({ locations: [], calendars: [] })} />);
    expect(screen.getByText('No locations yet')).toBeInTheDocument();
  });
});

describe('TIM-29 Year-end wizard, live', () => {
  it('previews the last leave year and posts it after the typed confirmation', async () => {
    const onYearEndPreview = vi.fn(async () => YEAR_END);
    const onYearEndRun = vi.fn(async () => ({ queued: true }));
    wrap(<YearEndWizard live={{ ...base, onYearEndPreview, onYearEndRun }} />);
    await waitFor(() => expect(onYearEndPreview).toHaveBeenCalledWith('2025-12-31'));
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(await screen.findByText('Divya Raghunathan')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    await ue.click(screen.getByRole('button', { name: 'Post year-end' }));
    const dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox'), 'LEAVE YEAR 2025');
    await ue.click(within(dialog).getByRole('button', { name: 'Post entries' }));
    await waitFor(() => expect(onYearEndRun).toHaveBeenCalledWith('2025-12-31', false));
    expect(await screen.findByText('Year end is being posted')).toBeInTheDocument();
  });

  it('pending requests are listed; posting is blocked until HR ticks Post anyway, then it posts with them', async () => {
    const onYearEndPreview = vi.fn(async () => ({ ...YEAR_END, pending: [{ id: 'r1', employeeId: 'e1', name: 'Arun Prakash', type: 'Casual leave', from: '2025-12-30', to: '2025-12-31', days: 2 }] }));
    const onYearEndRun = vi.fn(async () => ({ queued: true }));
    wrap(<YearEndWizard live={{ ...base, onYearEndPreview, onYearEndRun }} />);
    expect(await screen.findByText('1 leave request from this year is still pending')).toBeInTheDocument();
    expect(screen.getByText('Arun Prakash · Casual leave')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(screen.getByText('Decide the 1 pending leave request first, or tick "Post anyway" in Scope')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: /Scope/ })[0]!);
    await ue.click(screen.getByRole('checkbox', { name: /Post anyway/ }));
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    await ue.click(screen.getByRole('button', { name: 'Post year-end' }));
    const dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox'), 'LEAVE YEAR 2025');
    await ue.click(within(dialog).getByRole('button', { name: 'Post entries' }));
    await waitFor(() => expect(onYearEndRun).toHaveBeenCalledWith('2025-12-31', true));
  });

  it('nothing to lapse: posting is blocked and says why; a failed preview offers Try again', async () => {
    const onYearEndPreview = vi.fn().mockRejectedValueOnce(new Error('Year end for 31 Dec 2025 is already posted.')).mockResolvedValue({ yearEnd: '2025-12-31', lapses: 0, rows: [] });
    wrap(<YearEndWizard live={{ ...base, onYearEndPreview, onYearEndRun: vi.fn() }} />);
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(await screen.findByText('Year end for 31 Dec 2025 is already posted.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing to process')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(screen.getByText('Nothing lapses on that date, so there is nothing to post')).toBeInTheDocument();
  });
});

describe('TIM-31 Locations, live', () => {
  it('a shift that ends when it starts is refused; a good change is saved from its date', async () => {
    const onSetRule = vi.fn(async () => ({}));
    wrap(<GeofenceEditorScreen live={{ ...base, settingsHref: '/yx/settings/locations', onSetRule }} />);
    expect(screen.getByRole('heading', { name: 'Bengaluru head office' })).toBeInTheDocument();
    expect(screen.getByText('10.20.0.0/16')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: /^Field/ }));
    await ue.click(screen.getByRole('button', { name: 'Save from 28 Oct 2026' }));
    await waitFor(() => expect(onSetRule).toHaveBeenCalledWith('loc-blr', expect.objectContaining({ validFrom: '2026-10-28', shiftStart: 570, shiftEnd: 1110, checkIn: 'field', weeklyOffs: [{ weekday: 7 }, { weekday: 6, nth: [2, 4] }] })));
    const start = screen.getByLabelText(/^Starts/);
    const end = screen.getByLabelText(/^Ends/);
    await ue.clear(end);
    await ue.type(end, (start as HTMLInputElement).value);
    await ue.click(screen.getByRole('button', { name: 'Save from 28 Oct 2026' }));
    expect(screen.getAllByText('The shift ends at a different time from when it starts.').length).toBeGreaterThan(0);
    expect(onSetRule).toHaveBeenCalledTimes(1);
  });
});
