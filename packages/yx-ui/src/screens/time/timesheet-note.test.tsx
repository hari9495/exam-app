import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { TimesheetApprovalCard } from '../../components/notify';
import { checkTimesheet, newTimesheetLine, wordCount } from '../../components/timesheet';
import { TimesheetScreen, type LiveTimesheet } from './ops';
import { MY_TIMESHEET, TODAY } from './live/fixtures';
import type { MyTimesheet } from './live/types';

// Founder request, answers 1731 to 1736: a note per row with a live word count; Submit is refused until every row with
// hours has enough words (the company's rule); Save draft never asks; pre-filled rows start with no note.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn(async () => ({}));
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const RULE = { required: true, minWords: 200 };
const sheet = (data: MyTimesheet): LiveTimesheet => ({ state: 'ready', data, week: data.week, today: TODAY, onWeek: vi.fn(), onSave: ok(), onSubmit: ok(), onWithdraw: ok() });
const show = (live: LiveTimesheet) => render(<ToastProvider><TimesheetScreen live={live} /></ToastProvider>);

describe('the timesheet note (1731 to 1736)', () => {
  it('a note box per row with a live count; Submit refused at 199 words, never saved or sent', async () => {
    const live = sheet({ ...MY_TIMESHEET, noteRule: RULE, lines: MY_TIMESHEET.lines.map((l, i) => ({ ...l, note: i ? words(200) : words(199) })) });
    show(live);
    expect(screen.getByText('199 of 200 words')).toBeInTheDocument();
    expect(screen.getByText('200 of 200 words')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Submit week' }));
    expect(screen.getByText(/Row 1: write at least 200 words about the work \(199 so far\)/)).toBeInTheDocument();
    expect(live.onSave).not.toHaveBeenCalled();
    expect(live.onSubmit).not.toHaveBeenCalled();
  });

  it('typing updates the count; at 200 words the week is saved with the notes and sent', async () => {
    const live = sheet({ ...MY_TIMESHEET, noteRule: RULE, lines: MY_TIMESHEET.lines.map((l, i) => ({ ...l, note: i ? words(200) : words(199) })) });
    show(live);
    const box = screen.getAllByRole('textbox', { name: /^Note for / })[0]!;
    await ue.type(box, ' done');
    expect(screen.getAllByText('200 of 200 words')).toHaveLength(2);
    await ue.click(screen.getByRole('button', { name: 'Submit week' }));
    await waitFor(() => expect(live.onSubmit).toHaveBeenCalled());
    const saved = (live.onSave as ReturnType<typeof vi.fn>).mock.calls[0]![1] as { note: string | null }[];
    expect(saved.map((l) => wordCount(l.note))).toEqual([200, 200]);
  });

  it('Save draft works with no note at all', async () => {
    const live = sheet({ ...MY_TIMESHEET, noteRule: RULE });
    show(live);
    expect(screen.getAllByText('0 of 200 words')).toHaveLength(2);
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(live.onSave).toHaveBeenCalledTimes(1));
    expect(live.onSubmit).not.toHaveBeenCalled();
  });

  it('the company setting off: notes are optional and an empty note is sent', async () => {
    const live = sheet({ ...MY_TIMESHEET, noteRule: { required: false, minWords: 200 } });
    show(live);
    expect(screen.getAllByText('0 words · optional')).toHaveLength(2);
    await ue.click(screen.getByRole('button', { name: 'Submit week' }));
    await waitFor(() => expect(live.onSubmit).toHaveBeenCalled());
  });

  it('rules: words, not characters; rows without hours need no note; a pre-filled row starts with none', () => {
    expect(wordCount('  Fixed  two\nbugs. ')).toBe(3);
    const filled = { ...newTimesheetLine(), projectId: 'p1', hours: [8, null, null, null, null, null, null] };
    expect(filled.note).toBeUndefined(); // 1735: the person writes their own words
    expect(checkTimesheet([filled], 24, RULE).map((p) => p.message)).toEqual(['Row 1: write at least 200 words about the work (0 so far)']);
    expect(checkTimesheet([{ ...filled, hours: Array(7).fill(null) }, { ...filled, id: 'b', note: words(200) }], 24, RULE)).toEqual([]);
    expect(checkTimesheet([filled], 24)).toEqual([]); // no rule given (an older API): nothing asked
  });

  it('the row approver reads the note on the approval card', () => {
    render(<TimesheetApprovalCard employee={{ name: 'Priya Nair' }} weekLabel="Week of 2 Nov" lines={[{ id: 'l1', project: 'NRP', hours: 16, note: 'Built the checkout page.' }]} onApprove={vi.fn()} onSendBack={vi.fn()} />);
    expect(screen.getByText('Built the checkout page.')).toBeInTheDocument();
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
