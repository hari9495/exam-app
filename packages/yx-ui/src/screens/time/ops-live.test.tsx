import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OtReviewScreen, PeriodsScreen, type LiveMyOvertime, type LiveOtReview, type LivePeriods } from './requests';
import { AttendanceReportsScreen, TimesheetScreen, type LiveTimesheet } from './ops';
import { MY_OVERTIME, MY_TIMESHEET, OT_REVIEW, PAYROLL_FEED, PERIODS, PREFLIGHT_BLOCKED, PREFLIGHT_READY, TODAY } from './live/fixtures';
import type { MyTimesheet, Registers } from './live/types';

// The designed TIM-09, TIM-11, TIM-15 and TIM-16 screens with the live app's data: what each live page must do.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn(async () => ({}));

describe('Overtime review (TIM-09 live)', () => {
  const review = (o: Partial<LiveOtReview> = {}): LiveOtReview => ({ state: 'ready', data: OT_REVIEW, month: '2026-10', onMonth: vi.fn(), onOverride: ok(), onRetry: vi.fn(), ...o });

  it('HR pays over the limit only with a reason of a sentence', async () => {
    const live = review();
    render(<OtReviewScreen live={live} />);
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Override limit' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Pay over the limit' }));
    expect(within(dialog).getByText('Give the reason in a sentence (at least 10 letters).')).toBeInTheDocument();
    expect(live.onOverride).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Boiler breakdown, plant head approved');
    await ue.click(within(dialog).getByRole('button', { name: 'Pay over the limit' }));
    await waitFor(() => expect(live.onOverride).toHaveBeenCalledWith('oc3', 'Boiler breakdown, plant head approved'));
  });

  it('moves by month, and shows the no-access and error states', async () => {
    const live = review();
    const { unmount } = render(<OtReviewScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(live.onMonth).toHaveBeenCalledWith('2026-09');
    unmount();
    const { unmount: u2 } = render(<OtReviewScreen live={review({ state: 'no-access', data: null })} />);
    expect(screen.getByText("You don't have access to overtime")).toBeInTheDocument();
    u2();
    const failed = review({ state: 'error', data: null });
    render(<OtReviewScreen live={failed} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(failed.onRetry).toHaveBeenCalled();
  });
});

describe('My overtime (TIM-09 parts, live)', () => {
  const mine = (): LiveMyOvertime => ({ state: 'ready', data: MY_OVERTIME, onClaim: ok(), onWithdraw: ok() });

  it('claims a day only with what it was for', async () => {
    const live = mine();
    render(<OtReviewScreen mine={live} />);
    await ue.click(screen.getAllByRole('button', { name: 'Claim overtime' })[0]!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Paid in payroll at the legal overtime rate (Factories Act)')).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    expect(within(dialog).getByText('Say what the extra time was for.')).toBeInTheDocument();
    expect(live.onClaim).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /What was it for/ }), 'Line changeover');
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(live.onClaim).toHaveBeenCalledWith({ on: '2026-10-26', reason: 'Line changeover' }));
  });

  it('withdraws a claim still waiting', async () => {
    const live = mine();
    render(<OtReviewScreen mine={live} />);
    await ue.click(screen.getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(live.onWithdraw).toHaveBeenCalledWith('oc1'));
  });
});

describe('Periods (TIM-11 live)', () => {
  const periods = (o: Partial<LivePeriods> = {}): LivePeriods => ({ state: 'ready', data: PERIODS, year: '2026', onYear: vi.fn(), onPreflight: vi.fn(async () => PREFLIGHT_BLOCKED), onLock: ok(), onUnlock: ok(), ...o });
  const card = (entity: string, month: string) => within(within(screen.getByRole('region', { name: `${entity} periods` })).getByText(month).closest('.yx-card') as HTMLElement);

  it('runs the pre-lock checks and refuses to lock while requests wait', async () => {
    const live = periods();
    render(<PeriodsScreen live={live} />);
    await ue.click(card('Kaveri Foods Pvt Ltd', 'September 2026').getByRole('button', { name: 'Pre-lock checklist' }));
    expect(live.onPreflight).toHaveBeenCalledWith('le-kfpl', '2026-09');
    const drawer = screen.getByRole('dialog');
    expect(await within(drawer).findByText('3 waiting')).toBeInTheDocument();
    expect(within(drawer).getByText('5 open')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Lock the month' }));
    expect(within(drawer).getByText('Settle what is still waiting (listed above) before locking.')).toBeInTheDocument();
    expect(live.onLock).not.toHaveBeenCalled();
  });

  it('locks a ready month after the confirmation', async () => {
    const live = periods({ onPreflight: vi.fn(async () => PREFLIGHT_READY) });
    render(<PeriodsScreen live={live} />);
    await ue.click(card('Kaveri Foods Pvt Ltd', 'September 2026').getByRole('button', { name: 'Pre-lock checklist' }));
    const drawer = screen.getByRole('dialog');
    await within(drawer).findByText('Requests decided (leave, attendance, overtime, timesheets)');
    await ue.click(within(drawer).getByRole('button', { name: 'Lock the month' }));
    const confirm = (await screen.findByText('Lock September 2026 for Kaveri Foods Pvt Ltd?')).closest('[role="dialog"], [role="alertdialog"]') as HTMLElement;
    await ue.click(within(confirm).getByRole('button', { name: 'Lock the month' }));
    await waitFor(() => expect(live.onLock).toHaveBeenCalledWith('le-kfpl', '2026-09'));
  });

  it('says when a month is not over yet', async () => {
    const live = periods({ onPreflight: vi.fn(async () => PREFLIGHT_READY) });
    render(<PeriodsScreen live={live} />);
    expect(card('Kaveri Foods Pvt Ltd', 'October 2026').getByText('Can be locked from the 2nd of the next month')).toBeInTheDocument();
    await ue.click(card('Kaveri Foods Pvt Ltd', 'October 2026').getByRole('button', { name: 'Pre-lock checklist' }));
    const drawer = screen.getByRole('dialog');
    await within(drawer).findByText(/people in Kaveri Foods Pvt Ltd/);
    await ue.click(within(drawer).getByRole('button', { name: 'Lock the month' }));
    expect(within(drawer).getByText('October 2026 can be locked from 2 Oct 2026.')).toBeInTheDocument();
    expect(live.onLock).not.toHaveBeenCalled();
  });

  it('asks to reopen a locked month only with a reason; a request already asked waits', async () => {
    const live = periods();
    render(<PeriodsScreen live={live} />);
    expect(card('Kaveri Foods Pvt Ltd (Tamil Nadu)', 'August 2026').getByText('Waiting for two approvals')).toBeInTheDocument();
    expect(card('Kaveri Foods Pvt Ltd', 'July 2026').getByText('Filed: corrections only')).toBeInTheDocument();
    await ue.click(card('Kaveri Foods Pvt Ltd', 'August 2026').getByRole('button', { name: 'Request reopen' }));
    const dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Typo');
    await ue.click(within(dialog).getByRole('button', { name: 'Send reopen request' }));
    expect(within(dialog).getByText('Give the reason in a sentence (at least 10 letters).')).toBeInTheDocument();
    expect(live.onUnlock).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), ': a device batch arrived late');
    await ue.click(within(dialog).getByRole('button', { name: 'Send reopen request' }));
    await waitFor(() => expect(live.onUnlock).toHaveBeenCalledWith('le-kfpl', '2026-08', 'Typo: a device batch arrived late'));
  });

  it('year arrows stay clickable at a limit and say why', async () => {
    const live = periods();
    const { unmount } = render(<PeriodsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Next year' }));
    expect((await screen.findAllByText('There is no 2027 yet. Its months open as they start.'))[0]).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Previous year' }));
    expect(live.onYear).toHaveBeenCalledWith('2025');
    unmount();
    const early = periods({ year: '2025' });
    render(<PeriodsScreen live={early} />);
    await ue.click(screen.getByRole('button', { name: 'Previous year' }));
    expect((await screen.findAllByText('There are no periods before 2025.'))[0]).toBeInTheDocument();
    expect(early.onYear).not.toHaveBeenCalled();
  });
});

describe('My timesheet (TIM-15 live)', () => {
  const sheet = (data: MyTimesheet, o: Partial<LiveTimesheet> = {}): LiveTimesheet => ({ state: 'ready', data, week: data.week, today: TODAY, onWeek: vi.fn(), onSave: ok(), onSubmit: ok(), onWithdraw: ok(), ...o });

  it('saves a draft with a toast and submits the week after saving it', async () => {
    const live = sheet(MY_TIMESHEET);
    render(<TimesheetScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(live.onSave).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText('Draft saved for 26 Oct – 1 Nov.'))[0]).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Submit week' }));
    await waitFor(() => expect(live.onSubmit).toHaveBeenCalledWith('2026-10-26'));
    expect(live.onSave).toHaveBeenCalledTimes(2);
  });

  it('a week with no hours is not sent; the next-week arrow at this week says why', async () => {
    const live = sheet({ ...MY_TIMESHEET, lines: [] });
    render(<TimesheetScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Submit week' }));
    expect(screen.getByText('Fix these before sending')).toBeInTheDocument();
    expect(live.onSubmit).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Next week' }));
    expect((await screen.findAllByText('Next week opens on Monday.'))[0]).toBeInTheDocument();
    expect(live.onWeek).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(live.onWeek).toHaveBeenCalledWith('2026-10-19');
  });

  it('a sent week can be recalled, and locked days are named', async () => {
    const data: MyTimesheet = { ...MY_TIMESHEET, sheet: { id: 'ts1', status: 'pending', totalMinutes: 1200 }, days: MY_TIMESHEET.days.map((x, i) => ({ ...x, locked: i < 2 })) };
    const live = sheet(data);
    render(<TimesheetScreen live={live} />);
    expect(screen.getByText('Part of this week is locked')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Recall to edit' }));
    await waitFor(() => expect(live.onWithdraw).toHaveBeenCalledWith('ts1'));
  });
});

describe('Registers and the payroll feed (TIM-16 live)', () => {
  it('downloads each register format and says so with a toast', async () => {
    const data: Registers = { month: '2026-09', locations: [{ id: 'l1', name: 'Hosur plant', state: 'IN-TN', entityId: 'le', entity: 'Kaveri Foods TN', people: 6, locked: false, formats: [{ type: 'muster', title: 'Register of attendance (muster roll)', form: 'TN form', columns: ['Sl. no.'] }], source: 'x', verify: true }] };
    const onDownload = ok();
    render(<AttendanceReportsScreen live={{ report: 'registers', state: 'ready', data, month: '2026-09', onMonth: vi.fn(), onDownload }} />);
    expect(screen.getByText('Draft: month not locked')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(onDownload).toHaveBeenCalledWith('muster', 'l1', 'pdf');
    expect((await screen.findAllByText(/downloaded\. Draft: the month is not locked yet\./))[0]).toBeInTheDocument();
  });

  it('the feed is read only and says when it is frozen; no entity shows the empty state', () => {
    const { unmount } = render(<AttendanceReportsScreen live={{ report: 'feed', state: 'ready', data: PAYROLL_FEED, entities: [PAYROLL_FEED.entity], entityId: PAYROLL_FEED.entity.id, onEntity: vi.fn(), month: '2026-09', onMonth: vi.fn() }} />);
    expect(screen.getByText(/^Frozen/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Payroll feed' })).toHaveTextContent('29.5');
    expect(screen.getByText('1 not worked out')).toBeInTheDocument();
    unmount();
    render(<AttendanceReportsScreen live={{ report: 'feed', state: 'ready', data: null, entities: [], entityId: null, onEntity: vi.fn(), month: '2026-09', onMonth: vi.fn() }} />);
    expect(screen.getByText('No legal entity in your scope this month')).toBeInTheDocument();
  });
});
