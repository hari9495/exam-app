import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { LeaveTypeEditorScreen, YearEndWizard } from './leave-admin';
import { TIME_SETUP, YEAR_END } from './live/fixtures';
import type { YearChangePreview } from './live/types';

// Nov 2026 (branch feat/yukthix-time-leave-rules): TIM-27 type rules, TIM-29 pay-outs / posted / leave-year change, live.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const base = { state: 'ready' as const, data: TIME_SETUP };
const editor = (typeId: string, over = {}) => ({ ...base, typeId, policiesHref: '/yx/time/setup', onSaveType: vi.fn(async () => ({ id: typeId })), onAdded: vi.fn(), ...over });

describe('TIM-27 type rules, live', () => {
  it('most days in a month: a request bigger than the month is refused on save with the field focused; a good limit is saved', async () => {
    const live = editor('el');
    wrap(<LeaveTypeEditorScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: 'Rules' }));
    await ue.type(screen.getByLabelText(/^Most days in a month/), '3');
    await ue.type(screen.getByLabelText(/^Most days in one request/), '4');
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getAllByText('More than the monthly limit of 3 days. A request that big can never be approved.').length).toBeGreaterThan(0);
    expect(live.onSaveType).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Most days in one request/)));
    await ue.clear(screen.getByLabelText(/^Most days in one request/));
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(live.onSaveType).toHaveBeenCalledWith('el', expect.objectContaining({ rules: expect.objectContaining({ maxDaysPerMonth: 3, maxDays: null }) })));
  });

  it('partially paid needs a share of 1 to 99; it saves as one pay step', async () => {
    const live = editor('cl');
    wrap(<LeaveTypeEditorScreen live={live} />);
    await ue.click(screen.getByRole('radio', { name: 'Partially paid' }));
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getAllByText('Enter a share between 1 and 99%.').length).toBeGreaterThan(0);
    expect(live.onSaveType).not.toHaveBeenCalled();
    await ue.type(screen.getByLabelText(/^Paid at/), '50');
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(live.onSaveType).toHaveBeenCalledWith('cl', expect.objectContaining({ paid: true, rules: expect.objectContaining({ paySteps: [{ days: 366, percent: 50 }] }) })));
  });

  it('cash-in limits and payout show only for a type that can be cashed in, naming the company default', async () => {
    const live = editor('el', { data: { ...TIME_SETUP, leaveDefaults: { 'leave.encashment.max_days': '7', 'leave.encashment.min_left': '5', 'leave.encashment.divisor': '26' } } });
    wrap(<LeaveTypeEditorScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: 'Year end' }));
    expect(screen.getByText(/Blank: the company limit, 7 days/)).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/^Encash per year in total/), '10');
    await ue.click(screen.getByRole('switch', { name: /Pay out the balance when someone leaves/ }));
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(live.onSaveType).toHaveBeenCalledWith('el', expect.objectContaining({ rules: expect.objectContaining({ encashMaxDays: 10, encashAtExit: false }) })));
    // Not cashable: the limits are cleared, never sent stale.
    await ue.click(screen.getByRole('switch', { name: /Can be cashed in/ }));
    expect(screen.queryByLabelText(/^Encash per year in total/)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(live.onSaveType).toHaveBeenLastCalledWith('el', expect.objectContaining({ rules: expect.objectContaining({ encashable: false, encashMaxDays: null }) })));
  });

  it('absence and notice: the company default is named; the type can choose its own', async () => {
    const live = editor('el', { data: { ...TIME_SETUP, leaveDefaults: { 'leave.notice_period.leave': 'extends_last_day', 'leave.long_absence.accrues': 'no' } } });
    wrap(<LeaveTypeEditorScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: 'Absence & notice' }));
    expect(screen.getByRole('radio', { name: 'Company default (stop crediting)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Company default (moves the last working day later)' })).toBeChecked();
    await ue.click(screen.getByRole('radio', { name: 'Keep crediting' }));
    await ue.click(screen.getByRole('radio', { name: 'Not allowed' }));
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(live.onSaveType).toHaveBeenCalledWith('el', expect.objectContaining({ rules: expect.objectContaining({ longAbsence: 'continue', noticePeriod: 'blocked' }) })));
  });

  it('statutory maternity: the law values are text, only the colour is the company one', async () => {
    const ml = { id: 'ml', code: 'ML', name: 'Maternity leave', kind: 'maternity', paid: true, colour: 'purple', active: true, rules: TIME_SETUP.types[0]!.rules, statutory: { law: 'Maternity Benefit Act 1961', days: 182, paidInFull: true } };
    const live = editor('ml', { data: { ...TIME_SETUP, types: [...TIME_SETUP.types, ml], maternity: { maternityWeeks: 26, maternityWeeksThirdChild: 12, beforeDeliveryWeeks: 8, eligibilityDaysWorked: 80 } } });
    wrap(<LeaveTypeEditorScreen live={live} />);
    expect(screen.getByText('The law sets these values')).toBeInTheDocument();
    expect(screen.getByText(/26 weeks \(at most 8 before delivery\); 12 weeks for mothers who adopt/)).toBeInTheDocument();
    expect(screen.getByText('Paid, full wages')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Rules' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save colour' }));
    await waitFor(() => expect(live.onSaveType).toHaveBeenCalledWith('ml', expect.objectContaining({ code: 'ML', kind: 'maternity', paid: true })));
  });

  it('a server refusal (below the legal minimum) shows as Not saved', async () => {
    const live = editor('el', { onSaveType: vi.fn(async () => { throw new Error('The most days in one request can not be below 182.'); }) });
    wrap(<LeaveTypeEditorScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/can not be below 182/)).toBeInTheDocument();
    expect(screen.getByText('Not saved')).toBeInTheDocument();
  });
});

describe('TIM-29 pay-outs, posted, and the leave-year change, live', () => {
  it('pay-outs show per person and in the totals', async () => {
    const onYearEndPreview = vi.fn(async () => ({ ...YEAR_END, payOuts: 1, rows: [{ ...YEAR_END.rows[0]!, carry: 30, encash: 2, lapse: 1.5 }] }));
    wrap(<YearEndWizard live={{ ...base, onYearEndPreview, onYearEndRun: vi.fn() }} />);
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(await screen.findByText('33.5 → 30 carried · 2 to pay out')).toBeInTheDocument();
    expect(screen.getByText('Paid out')).toBeInTheDocument();
  });

  it('a year end already posted says so and offers no Post', async () => {
    const onYearEndPreview = vi.fn(async () => ({ ...YEAR_END, posted: { at: '2026-01-02T10:00:00Z', by: 'Lakshmi Iyer', policies: 2 } }));
    wrap(<YearEndWizard live={{ ...base, onYearEndPreview, onYearEndRun: vi.fn() }} />);
    expect(await screen.findByText(/posted on 2 Jan 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Posted by Lakshmi Iyer\. A year end is posted once/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post year-end' })).not.toBeInTheDocument();
  });

  const change = (over: Partial<YearChangePreview> = {}): YearChangePreview => ({
    entity: { id: 'le-kfpl', name: 'Kaveri Foods Pvt Ltd' },
    oldStartMonth: 1,
    newStartMonth: 4,
    fromOn: '2027-01-01',
    shortEnd: '2027-03-31',
    months: 3,
    problem: null,
    scheduled: null,
    rows: [
      { employeeId: 'e1', name: 'Ananya Hegde', type: 'Earned leave', opening: 16.5, credit: 4.5, atEnd: 21, carry: 21, encash: 0, lapse: 0 },
      { employeeId: 'e2', name: 'Shwetha Gowda', type: 'Earned leave', opening: 30, credit: 4.5, atEnd: 34.5, carry: 30, encash: 0, lapse: 4.5 },
    ],
    ...over,
  });
  const transition = (over = {}) => ({ ...base, mode: 'transition' as const, onYearChangePreview: vi.fn(async () => change()), onYearChangeSchedule: vi.fn(async () => ({})), onYearEndPreview: vi.fn(), onYearEndRun: vi.fn(), ...over });

  it('Transition: previews the short year per person, then posts after the typed confirmation with a toast', async () => {
    const live = transition();
    wrap(<YearEndWizard live={live} />);
    await waitFor(() => expect(live.onYearChangePreview).toHaveBeenCalledWith('le-kfpl', 4));
    expect(await screen.findByText('A short year is created')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(await screen.findByText('Shwetha Gowda')).toBeInTheDocument();
    expect(screen.getByText('4.5 lapse')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    await ue.click(screen.getByRole('button', { name: 'Post transition' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Post entries' }));
    expect(live.onYearChangeSchedule).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox'), 'SHORT YEAR 2027');
    await ue.click(within(dialog).getByRole('button', { name: 'Post entries' }));
    await waitFor(() => expect(live.onYearChangeSchedule).toHaveBeenCalledWith('le-kfpl', 4));
    expect(await screen.findByText(/Leave-year change scheduled on/)).toBeInTheDocument();
    expect(screen.getAllByText('Leave-year change scheduled').length).toBeGreaterThan(0);
  });

  it('Transition: the same month is refused with the reason; one already scheduled is shown instead', async () => {
    const { unmount } = wrap(<YearEndWizard live={transition({ onYearChangePreview: vi.fn(async () => change({ problem: 'The leave year already starts in that month.', rows: [] })) })} />);
    expect(await screen.findByText('This change can not be made')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(screen.getAllByText('The leave year already starts in that month.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Post transition' }) ?? screen.getByText(/already starts/)).toBeTruthy();
    unmount();
    wrap(<YearEndWizard live={transition({ onYearChangePreview: vi.fn(async () => change({ scheduled: { fromOn: '2027-01-01', oldStartMonth: 1, newStartMonth: 4, shortEnd: '2027-03-31' } })) })} />);
    expect(await screen.findByText('Leave-year change scheduled for Kaveri Foods Pvt Ltd')).toBeInTheDocument();
  });

  it('Transition: a failed preview offers Try again', async () => {
    const onYearChangePreview = vi.fn().mockRejectedValueOnce(new Error('No such legal entity.')).mockResolvedValue(change());
    wrap(<YearEndWizard live={transition({ onYearChangePreview })} />);
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(await screen.findByText('No such legal entity.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Shwetha Gowda')).toBeInTheDocument();
  });
});
