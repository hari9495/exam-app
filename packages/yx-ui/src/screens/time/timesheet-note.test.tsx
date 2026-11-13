import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { TimesheetApprovalCard } from '../../components/notify';
import { checkTimesheet, newTimesheetLine, wordCount } from '../../components/timesheet';
import { TimesheetScreen, type LiveTimesheet } from './ops';
import { MY_TIMESHEET, TODAY } from './live/fixtures';
import type { MyTimesheet } from './live/types';

// Founder change, answer 1787: a comment per day. Under each day with hours a "Comment" link opens a small box with a
// live word count; Submit is refused until every day with hours has enough words (the company's rule); Save draft never
// asks; days with no hours have no link; pre-filled days start with no comment.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn(async () => ({}));
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const RULE = { required: true, minWords: 20 };
const sheet = (data: MyTimesheet): LiveTimesheet => ({ state: 'ready', data, week: data.week, today: TODAY, onWeek: vi.fn(), onSave: ok(), onSubmit: ok(), onWithdraw: ok() });
const show = (live: LiveTimesheet) => render(<ToastProvider><TimesheetScreen live={live} /></ToastProvider>);
// MY_TIMESHEET: two rows, hours on Monday, Tuesday and Wednesday only.
const all = (n: number) => [words(n), words(n), words(n), '', '', '', ''];
const links = () => screen.getAllByRole('button', { name: /^Comment/ });

describe('a comment per day (1787)', () => {
  it('a Comment link only under days with hours; it opens a box with a live count', async () => {
    show(sheet({ ...MY_TIMESHEET, noteRule: RULE }));
    expect(links()).toHaveLength(6);
    await ue.click(links()[0]!);
    const box = screen.getByRole('textbox', { name: /^Comment for .*, Mon / });
    expect(screen.getByText('0 of 20 words')).toBeInTheDocument();
    await ue.type(box, 'Fixed the build');
    expect(screen.getByText('3 of 20 words')).toBeInTheDocument();
  });

  it('Submit is refused when one day with hours has no comment, or is 1 word short; nothing is saved or sent', async () => {
    const missing = sheet({ ...MY_TIMESHEET, noteRule: RULE, lines: MY_TIMESHEET.lines.map((l, i) => ({ ...l, comments: i ? [words(20), words(20), '', '', '', '', ''] : all(20) })) });
    const a = show(missing);
    await ue.click(screen.getByRole('button', { name: 'Submit week' }));
    expect(screen.getByText(/Row 2, Wed: write a comment of at least 20 words \(0 so far\)/)).toBeInTheDocument();
    expect(missing.onSave).not.toHaveBeenCalled();
    a.unmount();
    const short = sheet({ ...MY_TIMESHEET, noteRule: RULE, lines: MY_TIMESHEET.lines.map((l, i) => ({ ...l, comments: i ? [words(20), words(19), words(20), '', '', '', ''] : all(20) })) });
    show(short);
    await ue.click(screen.getByRole('button', { name: 'Submit week' }));
    expect(screen.getByText(/Row 2, Tue: write a comment of at least 20 words \(19 so far\)/)).toBeInTheDocument();
    expect(short.onSubmit).not.toHaveBeenCalled();
  });

  it('every day with hours at 20 words: saved with the comments and sent', async () => {
    const live = sheet({ ...MY_TIMESHEET, noteRule: RULE, lines: MY_TIMESHEET.lines.map((l) => ({ ...l, comments: all(20) })) });
    show(live);
    await ue.click(screen.getByRole('button', { name: 'Submit week' }));
    await waitFor(() => expect(live.onSubmit).toHaveBeenCalled());
    const saved = (live.onSave as ReturnType<typeof vi.fn>).mock.calls[0]![1] as { comments: string[] }[];
    expect(saved[0]!.comments.map(wordCount)).toEqual([20, 20, 20, 0, 0, 0, 0]);
  });

  it('Save draft works with no comment at all; the setting off sends empty comments', async () => {
    const draft = sheet({ ...MY_TIMESHEET, noteRule: RULE });
    const a = show(draft);
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(draft.onSave).toHaveBeenCalledTimes(1));
    a.unmount();
    const off = sheet({ ...MY_TIMESHEET, noteRule: { required: false, minWords: 20 } });
    show(off);
    await ue.click(links()[0]!);
    expect(screen.getByText('0 words · optional')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Submit week' }));
    await waitFor(() => expect(off.onSubmit).toHaveBeenCalled());
  });

  it('rules: days with no hours need none; a pre-filled row starts with no comment; no rule asks nothing', () => {
    expect(wordCount('  Fixed  two\nbugs. ')).toBe(3);
    const filled = { ...newTimesheetLine(), projectId: 'p1', hours: [8, null, 4, null, null, null, null] };
    expect(filled.comments).toBeUndefined(); // 1735: the person writes their own words
    expect(checkTimesheet([filled], 24, RULE).map((p) => p.message)).toEqual(['Row 1, Mon: write a comment of at least 20 words (0 so far)', 'Row 1, Wed: write a comment of at least 20 words (0 so far)']);
    expect(checkTimesheet([{ ...filled, comments: [words(20), '', words(20), '', '', '', ''] }], 24, RULE)).toEqual([]);
    expect(checkTimesheet([filled], 24)).toEqual([]);
  });

  it('the row approver reads each day’s comment on the approval card', () => {
    render(<TimesheetApprovalCard employee={{ name: 'Priya Nair' }} weekLabel="Week of 2 Nov" lines={[{ id: 'l1', project: 'NRP', hours: 16, comments: ['Built the checkout page.', '', 'Client call'] }]} onApprove={vi.fn()} onSendBack={vi.fn()} />);
    const card = screen.getByText('Mon: Built the checkout page.').closest('li')!;
    expect(within(card).getByText('Wed: Client call')).toBeInTheDocument();
  });
});

// Founder walk (13 Nov 2026): at 1278 x 635 the grid fits, Total in view. jsdom has no layout, so these hold the parts
// that make it fit: day headers without the year (the week's range above has it) and one-line day labels with a tooltip.
describe('the timesheet grid fits a laptop screen', () => {
  it('day headers show the day and month, not the year; the week range keeps the year', () => {
    show(sheet(MY_TIMESHEET));
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    const days = heads.filter((t) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(t));
    expect(days).toHaveLength(7);
    expect(days.some((t) => /\d{4}/.test(t))).toBe(false);
    expect(screen.getAllByText(/\d{4} – \d{1,2} \w{3} \d{4}/).length).toBeGreaterThan(0);
  });

  it('negative: a long holiday name keeps its full text in the tooltip, never cut away', () => {
    show(sheet(MY_TIMESHEET));
    for (const el of document.querySelectorAll('.yx-ts__dayexp')) expect(el.getAttribute('title')).toBe(el.textContent);
  });
});
