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
const policies = (over = {}) => ({ ...base, onCreatePolicy: vi.fn(async () => ({ id: 'pol-new' })), onAddVersion: vi.fn(async () => ({})), onAssign: vi.fn(async () => ({})), onRemoveAssignment: vi.fn(async () => ({})), onSaveOrder: vi.fn(async () => ({})), onOpenType: vi.fn(), ...over });

describe('Loading, could not load and no access (every set-up page)', () => {
  it('shows each state', async () => {
    const onRetry = vi.fn();
    const { rerender } = wrap(<LeavePoliciesScreen live={policies({ state: 'loading', data: null })} />);
    expect(screen.getByRole('status', { name: 'Loading the leave set-up' })).toBeInTheDocument();
    rerender(<ToastProvider><HolidayCalendarsScreen live={{ state: 'error', data: null, onRetry, onCreateCalendar: vi.fn(), onUpdateCalendar: vi.fn(), onAddHoliday: vi.fn(), onRemoveHoliday: vi.fn(), onChangeHoliday: vi.fn(), onTemplate: vi.fn(), onClone: vi.fn(), onConfirmDraft: vi.fn(), onRemoveDraft: vi.fn(), onPublish: vi.fn() }} /></ToastProvider>);
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

  it('shows people per policy, the overrides and who matches no policy', async () => {
    const id = TIME_SETUP.policies[0]!.id;
    wrap(<LeavePoliciesScreen live={policies({ data: { ...TIME_SETUP, coverage: { [id]: { people: 41, overrides: 2 } }, covered: 41, uncovered: { count: 2, people: [{ id: 'e9', name: 'Ravi Kumar', code: 'KF-0901', joinedOn: '2026-10-01' }, { id: 'e8', name: 'Sita Devi', code: null, joinedOn: '2026-09-15' }] } } })} />);
    expect(screen.getByText('41 people')).toBeInTheDocument();
    expect(screen.getByText('2 overrides')).toBeInTheDocument();
    expect(screen.getByText('2 people match no policy')).toBeInTheDocument();
    expect(screen.queryByText(/Ravi Kumar/)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Show them' }));
    expect(screen.getByText('Ravi Kumar · KF-0901')).toBeInTheDocument();
    expect(screen.getByText(/41 people covered by/)).toBeInTheDocument();
  });

  it('the order arrows change a draft order; it is saved from a date, and the first arrow says it is first', async () => {
    const two = { ...TIME_SETUP, policies: [TIME_SETUP.policies[0]!, { ...TIME_SETUP.policies[0]!, id: 'pol-2', name: 'Plant workers', assignments: [] }] };
    const live = policies({ data: two });
    wrap(<LeavePoliciesScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: `Move ${TIME_SETUP.policies[0]!.name} up` }));
    expect((await screen.findAllByText(`${TIME_SETUP.policies[0]!.name} is already first.`)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Order changed, not saved yet')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Move Plant workers up' }));
    expect(screen.getByText('Order changed, not saved yet')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save order' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: /^Save from/ }));
    await waitFor(() => expect(live.onSaveOrder).toHaveBeenCalledWith(['pol-2', TIME_SETUP.policies[0]!.id], '2026-10-28'));
  });

  it('a saved later order is shown with its date', () => {
    const id = TIME_SETUP.policies[0]!.id;
    wrap(<LeavePoliciesScreen live={policies({ data: { ...TIME_SETUP, order: { current: null, currentFrom: null, upcoming: { validFrom: '2026-12-01', policyIds: [id] } } } })} />);
    expect(screen.getByText('New order from 1 Dec 2026')).toBeInTheDocument();
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
  const cals = (over: Partial<TimeSetup> = {}) => ({ ...base, data: { ...TIME_SETUP, ...over }, onCreateCalendar: vi.fn(async () => ({})), onUpdateCalendar: vi.fn(async () => ({})), onAddHoliday: vi.fn(async () => ({})), onRemoveHoliday: vi.fn(async () => ({})), onChangeHoliday: vi.fn(async () => ({})), onTemplate: vi.fn(async () => ({})), onClone: vi.fn(async () => ({})), onConfirmDraft: vi.fn(async () => ({})), onRemoveDraft: vi.fn(async () => ({})), onPublish: vi.fn(async () => ({})), onReviewFeed: vi.fn() });

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
    await waitFor(() => expect(live.onUpdateCalendar).toHaveBeenCalledWith('cal-blr', { name: 'Bengaluru head office holidays', optionalLimit: 1, halfDayOpenHalf: 'first', onWeeklyOff: 'none', onMove: 'share' }));
  });

  it('the weekly-off and move rules are saved with the calendar', async () => {
    const live = cals();
    wrap(<HolidayCalendarsScreen live={live} />);
    await ue.click(screen.getByRole('radio', { name: 'Substitute day off' }));
    expect(screen.getByText('People get the next working day off.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save rules' }));
    await waitFor(() => expect(live.onUpdateCalendar).toHaveBeenCalledWith('cal-blr', expect.objectContaining({ onWeeklyOff: 'substitute', onMove: 'share' })));
  });

  it('Change date: a future holiday moves after a date is chosen', async () => {
    const live = cals();
    wrap(<HolidayCalendarsScreen live={live} />);
    const table = screen.getByRole('table', { name: 'Bengaluru head office holidays' });
    await ue.click(within(table).getAllByRole('button', { name: /Actions|More/ })[0]!);
    await ue.click(screen.getByRole('menuitem', { name: 'Change date' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/becomes a working day/)).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Change date' }));
    await waitFor(() => expect(live.onChangeHoliday).toHaveBeenCalledWith('h1', '2026-11-01'));
  });

  it('D11: a holiday is marked as a working day with a reason; the mark is listed and can be removed', async () => {
    const live = { ...cals({ calendars: [{ ...TIME_SETUP.calendars[0]!, workingDays: [{ id: 'w1', on: '2026-11-08', reason: 'Stock count Sunday' }] }] }), onMarkWorking: vi.fn(async () => ({})), onUnmarkWorking: vi.fn(async () => ({})) };
    wrap(<HolidayCalendarsScreen live={live} />);
    const table = screen.getByRole('table', { name: 'Bengaluru head office holidays' });
    await ue.click(within(table).getAllByRole('button', { name: /Actions|More/ })[0]!);
    await ue.click(screen.getByRole('menuitem', { name: 'Mark as working day' }));
    const dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByLabelText(/^Why it is worked/), 'Make-up day for the Diwali bridge');
    await ue.click(within(dialog).getByRole('button', { name: 'Mark as working' }));
    await waitFor(() => expect(live.onMarkWorking).toHaveBeenCalledWith('cal-blr', { on: '2026-11-01', reason: 'Make-up day for the Diwali bridge' }));
    const list = screen.getByRole('list', { name: 'Bengaluru head office working days' });
    expect(within(list).getByText('Stock count Sunday')).toBeInTheDocument();
    await ue.click(within(list).getByRole('button', { name: 'Remove' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(live.onUnmarkWorking).toHaveBeenCalledWith('w1'));
  });

  it('negative D11: no date or a short reason sends nothing and says why', async () => {
    const live = { ...cals(), onMarkWorking: vi.fn(async () => ({})), onUnmarkWorking: vi.fn() };
    wrap(<HolidayCalendarsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Mark a day as working' }));
    const dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByLabelText(/^Why it is worked/), 'no');
    await ue.click(within(dialog).getByRole('button', { name: 'Mark as working' }));
    expect(within(dialog).getByText('Choose the date.')).toBeInTheDocument();
    expect(within(dialog).getByText('Say why the day is worked (at least 5 characters).')).toBeInTheDocument();
    expect(live.onMarkWorking).not.toHaveBeenCalled();
    expect(screen.getByText('No holiday or weekly off is marked as a working day.')).toBeInTheDocument();
  });

  it('a location with a state template starts from it (or one by one)', async () => {
    const live = cals({ templates: { 'loc-hosur': 'Tamil Nadu' } });
    wrap(<HolidayCalendarsScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: /Hosur plant/ }));
    expect(screen.getByText('Hosur plant has no 2026 calendar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add holidays one by one' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Start from the Tamil Nadu template' }));
    const dialog = screen.getByRole('dialog', { name: 'Start Hosur plant from the Tamil Nadu template?' });
    await ue.click(within(dialog).getByRole('button', { name: 'Use template' }));
    await waitFor(() => expect(live.onTemplate).toHaveBeenCalledWith('loc-hosur', 'Hosur plant'));
  });

  it('a draft shows as not published and is published with one click', async () => {
    const drafts = [{ id: 'd1', on: '2026-12-31', name: 'New Year Eve', kind: 'state' as const, halfDay: false, confirm: false, source: 'template' as const }];
    const live = cals({ calendars: [{ ...TIME_SETUP.calendars[0]!, drafts }] });
    wrap(<HolidayCalendarsScreen live={live} />);
    expect(screen.getByText('Draft · not published')).toBeInTheDocument();
    expect(screen.getByText('New Year Eve')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Publish Bengaluru head office calendar' }));
    await waitFor(() => expect(live.onPublish).toHaveBeenCalledWith('cal-blr', 'Bengaluru head office', 2026));
  });

  it('Clone waits while feed changes are waiting; then clones to next year', async () => {
    const live = cals({ calendars: [{ ...TIME_SETUP.calendars[0]!, waitingFeedChanges: 1 }] });
    const { unmount } = wrap(<HolidayCalendarsScreen live={live} />);
    expect(screen.getByText('Review the feed changes first')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Clone Bengaluru head office to 2027' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(live.onReviewFeed).toHaveBeenCalled();
    unmount();
    const ok = cals();
    wrap(<HolidayCalendarsScreen live={ok} />);
    await ue.click(screen.getByRole('button', { name: 'Clone Bengaluru head office to 2027' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/3 festivals with changing dates are added as drafts/)).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Clone to 2027' }));
    await waitFor(() => expect(ok.onClone).toHaveBeenCalledWith('cal-blr', 'Bengaluru head office', 2027));
  });

  it('next year draft: festival dates are confirmed before publishing', async () => {
    const drafts = [
      { id: 'd1', on: '2027-01-26', name: 'Republic Day', kind: 'national' as const, halfDay: false, confirm: false, source: 'clone' as const },
      { id: 'd2', on: '2027-11-09', name: 'Balipadyami', kind: 'festival' as const, halfDay: false, confirm: true, source: 'clone' as const },
    ];
    const live = cals({ calendars: [{ ...TIME_SETUP.calendars[0]!, drafts }] });
    wrap(<HolidayCalendarsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Open 2027 draft' }));
    expect(screen.getByRole('heading', { name: 'Bengaluru head office · 2027' })).toBeInTheDocument();
    expect(screen.getByText('1 festival date to confirm before you publish')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Publish Bengaluru head office 2027 calendar' }));
    expect(live.onPublish).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Confirm date' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Confirm date' }));
    await waitFor(() => expect(live.onConfirmDraft).toHaveBeenCalledWith('d2', '2027-11-09'));
    await ue.click(screen.getByRole('button', { name: 'Back to 2026' }));
    expect(screen.getByRole('heading', { name: 'Holiday calendars · 2026' })).toBeInTheDocument();
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
    expect(screen.getByText('Nothing lapses or is paid out on that date, so there is nothing to post')).toBeInTheDocument();
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

  it('IpError: a bad IP range is refused by line and focused; good ranges are saved', async () => {
    const onSetNetworks = vi.fn(async () => ({}));
    wrap(<GeofenceEditorScreen live={{ ...base, settingsHref: '/yx/settings/locations', onSetRule: vi.fn(), onSetNetworks }} />);
    const ips = screen.getByLabelText(/^IP ranges/);
    expect(ips).toHaveValue('10.20.0.0/16');
    await ue.type(ips, '{Enter}10.20.300.0/24');
    await ue.click(screen.getByRole('button', { name: 'Save office network' }));
    expect(screen.getByText('Line 2: 10.20.300.0/24 is not a valid range. Each part must be 0–255, e.g. 10.20.4.0/24.')).toBeInTheDocument();
    expect(ips).toHaveFocus();
    expect(onSetNetworks).not.toHaveBeenCalled();
    await ue.clear(ips);
    await ue.type(ips, '10.20.4.0/24{Enter}{Enter}10.20.5.0/24');
    await ue.click(screen.getByRole('button', { name: 'Save office network' }));
    await waitFor(() => expect(onSetNetworks).toHaveBeenCalledWith('loc-blr', ['10.20.4.0/24', '10.20.5.0/24']));
  });

  it('Multi: a location saved with one point shows it; another point is added and both are saved with the version seen', async () => {
    const onSetPoints = vi.fn(async () => ({}));
    const data = { ...TIME_SETUP, locations: TIME_SETUP.locations.map((l, i) => (i === 0 ? { ...l, updatedAt: '2026-10-28T04:00:00.000Z' } : l)) };
    wrap(<GeofenceEditorScreen live={{ ...base, data, settingsHref: '/yx/settings/locations', onSetRule: vi.fn(), onSetPoints }} />);
    expect(screen.getByText('12.97, 77.59 · 150 m')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add another point' }));
    // Pressed too early: the new point has no latitude yet, so its field takes the focus and nothing is sent.
    await ue.click(screen.getByRole('button', { name: 'Save points' }));
    await waitFor(() => expect(screen.getByLabelText(/^Latitude/)).toHaveFocus());
    expect(onSetPoints).not.toHaveBeenCalled();
    await ue.type(screen.getByLabelText(/^Latitude/), '12.975');
    await ue.type(screen.getByLabelText(/^Longitude/), '77.595');
    await ue.clear(screen.getByLabelText(/^Point name/));
    await ue.type(screen.getByLabelText(/^Point name/), 'Annexe');
    await ue.click(screen.getByRole('button', { name: 'Save points' }));
    await waitFor(() => expect(onSetPoints).toHaveBeenCalledWith('loc-blr', [{ name: 'Bengaluru head office', lat: 12.97, lng: 77.59, radiusM: 150 }, { name: 'Annexe', lat: 12.975, lng: 77.595, radiusM: 100 }], '2026-10-28T04:00:00.000Z'));
  });

  it('Multi: Remove shows only with more than one point; a radius outside 50 to 1,000 m is marked', async () => {
    const onSetPoints = vi.fn(async () => ({}));
    const data = { ...TIME_SETUP, locations: TIME_SETUP.locations.map((l, i) => (i === 0 ? { ...l, points: [{ name: 'Main block', lat: 12.97, lng: 77.59, radiusM: 200 }, { name: 'Annexe', lat: 12.972, lng: 77.592, radiusM: 80 }] } : l)) };
    wrap(<GeofenceEditorScreen live={{ ...base, data, settingsHref: '/yx/settings/locations', onSetRule: vi.fn(), onSetPoints }} />);
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
    await ue.click(screen.getAllByRole('button', { name: 'Remove' })[1]!);
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    const radius = screen.getByLabelText(/^Radius/);
    await ue.clear(radius);
    await ue.type(radius, '20');
    await ue.tab();
    expect(screen.getByText('Enter a radius between 50 and 1,000 m')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save points' }));
    expect(onSetPoints).not.toHaveBeenCalled();
  });

  it("IpError: the server's line error shows on the field", async () => {
    const onSetNetworks = vi.fn(async () => { throw new Error('Line 1: 10.0.0.0/33 is not a valid range. Each part must be 0–255, e.g. 10.20.4.0/24.'); });
    wrap(<GeofenceEditorScreen live={{ ...base, settingsHref: '/yx/settings/locations', onSetRule: vi.fn(), onSetNetworks }} />);
    await ue.click(screen.getByRole('button', { name: 'Save office network' }));
    expect((await screen.findAllByText(/Line 1: 10.0.0.0\/33 is not a valid range/)).length).toBeGreaterThan(0);
  });
});

describe('HLP-12 answer 62: Add injury leave', () => {
  it('shows only while the injury leave type is missing, and creates it only when pressed', async () => {
    const onAddInjuryLeave = vi.fn(async () => ({ id: 'lt-inj' }));
    const { unmount } = wrap(<LeavePoliciesScreen live={policies({ onAddInjuryLeave, data: { ...TIME_SETUP, injuryLeave: { code: 'INJURY', missing: true } } })} />);
    expect(screen.getByText('No injury leave type yet')).toBeInTheDocument();
    expect(onAddInjuryLeave).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Add injury leave' }));
    expect(onAddInjuryLeave).toHaveBeenCalledTimes(1);
    unmount();
    wrap(<LeavePoliciesScreen live={policies({ onAddInjuryLeave, data: { ...TIME_SETUP, injuryLeave: { code: 'INJURY', missing: false } } })} />);
    expect(screen.queryByText('No injury leave type yet')).not.toBeInTheDocument();
  });

  it('a refusal shows as a toast', async () => {
    const onAddInjuryLeave = vi.fn(async () => { throw new Error('A leave type with the code INJURY already exists.'); });
    wrap(<LeavePoliciesScreen live={policies({ onAddInjuryLeave, data: { ...TIME_SETUP, injuryLeave: { code: 'INJURY', missing: true } } })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add injury leave' }));
    expect((await screen.findAllByText('A leave type with the code INJURY already exists.')).length).toBeGreaterThan(0);
  });
});

// Founder answer 141: the location editor says where Factories Act coverage comes from.
describe('TIM-31 Locations: Factories Act coverage (answer 141)', () => {
  const withFa = (factoriesAct: NonNullable<(typeof base.data.locations)[number]['factoriesAct']>) => ({ ...base.data, locations: base.data.locations.map((l, i) => (i === 0 ? { ...l, factoriesAct } : l)) });
  it('a registered factory names the flag and the exclusions; the setting and none say so too', () => {
    const { unmount } = wrap(<GeofenceEditorScreen live={{ ...base, data: withFa({ covered: true, source: 'registered_factory', scopeType: null, exclusions: [{ scopeType: 'employment_type', name: 'Office staff' }] }), settingsHref: '/yx/settings/locations', onSetRule: vi.fn() }} />);
    expect(screen.getByText('Covered: this location is a registered factory (Settings › Locations).')).toBeInTheDocument();
    expect(screen.getByText('Not covered here: Office staff (employment type).')).toBeInTheDocument();
    unmount();
    const second = wrap(<GeofenceEditorScreen live={{ ...base, data: withFa({ covered: true, source: 'setting', scopeType: 'location', exclusions: [] }), settingsHref: '/yx/settings/locations', onSetRule: vi.fn() }} />);
    expect(screen.getByText('Covered: the Factories Act setting for this location (Settings › Attendance).')).toBeInTheDocument();
    second.unmount();
    wrap(<GeofenceEditorScreen live={{ ...base, data: withFa({ covered: false, source: 'default', scopeType: null, exclusions: [] }), settingsHref: '/yx/settings/locations', onSetRule: vi.fn() }} />);
    expect(screen.getByText('Not covered: not a registered factory, and no Factories Act setting applies.')).toBeInTheDocument();
  });
});

// Founder answer 151: Time set-up says what to do with an old location-level value.
describe('TIM-31 Locations: an old Factories Act value (answer 151)', () => {
  const withFa = (factoriesAct: NonNullable<(typeof base.data.locations)[number]['factoriesAct']>) => ({ ...base.data, locations: base.data.locations.map((l, i) => (i === 0 ? { ...l, factoriesAct } : l)) });
  it('setting "covered", no flag: mark it, with a link to edit the location', () => {
    wrap(<GeofenceEditorScreen live={{ ...base, data: withFa({ covered: true, source: 'setting', scopeType: 'location', exclusions: [], locationSetting: 'covered' }), settingsHref: '/yx/settings/locations', onSetRule: vi.fn() }} />);
    expect(screen.getByText('Mark the location as a registered factory to make it the one source')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit the location' })).toHaveAttribute('href', '/yx/settings/locations');
  });
  it('flagged with the old value: no longer needed; flagged without it, or nothing at all: no alert', () => {
    const one = wrap(<GeofenceEditorScreen live={{ ...base, data: withFa({ covered: true, source: 'registered_factory', scopeType: null, exclusions: [], locationSetting: 'covered' }), settingsHref: '/yx/settings/locations', onSetRule: vi.fn() }} />);
    expect(screen.getByText('The Factories Act setting for this location is no longer needed')).toBeInTheDocument();
    expect(screen.queryByText('Mark the location as a registered factory to make it the one source')).toBeNull();
    one.unmount();
    const two = wrap(<GeofenceEditorScreen live={{ ...base, data: withFa({ covered: true, source: 'registered_factory', scopeType: null, exclusions: [], locationSetting: null }), settingsHref: '/yx/settings/locations', onSetRule: vi.fn() }} />);
    expect(screen.queryByText('The Factories Act setting for this location is no longer needed')).toBeNull();
    two.unmount();
    wrap(<GeofenceEditorScreen live={{ ...base, data: withFa({ covered: false, source: 'default', scopeType: null, exclusions: [], locationSetting: null }), settingsHref: '/yx/settings/locations', onSetRule: vi.fn() }} />);
    expect(screen.queryByText('Mark the location as a registered factory to make it the one source')).toBeNull();
  });
});
