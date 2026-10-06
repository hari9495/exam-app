import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatDate } from '../lib/format';
import { dayKey, formatDuration, layoutOverlaps, monthGrid, weekRange } from '../lib/dates';
import { Calendar, type CalendarEvent } from './calendar';
import { RosterGrid, checkRoster, type RosterPerson } from './roster';
import { CommentThread, canEditComment, mentionQuery, parseMentions, toMentionMarkup, type Comment } from './timeline';

const d = (m: number, day: number, h = 0, min = 0) => new Date(2026, m - 1, day, h, min);

describe('date maths', () => {
  it('builds a Monday-first month grid', () => {
    const weeks = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(weeks).toHaveLength(5);
    expect(formatDate(weeks[0][0])).toBe('28 Sep 2026');
    expect(weeks[0][0].getDay()).toBe(1);
    expect(formatDate(weeks[4][6])).toBe('1 Nov 2026');
    expect(monthGrid(2021, 1)).toHaveLength(4); // Feb 2021 starts on a Monday, 28 days
  });

  it('gives Monday–Sunday week ranges', () => {
    const w = weekRange(d(10, 2));
    expect(formatDate(w.start)).toBe('28 Sep 2026');
    expect(formatDate(w.end)).toBe('4 Oct 2026');
    expect(formatDate(weekRange(d(10, 4)).start)).toBe('28 Sep 2026'); // Sunday belongs to the week before
  });

  it('lays overlapping events side by side', () => {
    const l = layoutOverlaps([
      { id: 'a', start: d(10, 1, 9), end: d(10, 1, 10) },
      { id: 'b', start: d(10, 1, 9, 30), end: d(10, 1, 11) },
      { id: 'c', start: d(10, 1, 10), end: d(10, 1, 10, 30) },
      { id: 'e', start: d(10, 1, 12), end: d(10, 1, 13) },
    ]);
    expect(l.get('a')).toEqual({ col: 0, cols: 2 });
    expect(l.get('b')).toEqual({ col: 1, cols: 2 });
    expect(l.get('c')).toEqual({ col: 0, cols: 2 }); // reuses a's column once a ends
    expect(l.get('e')).toEqual({ col: 0, cols: 1 });
  });

  it('formats durations', () => {
    expect(formatDuration(135 * 60_000)).toBe('2 h 15 min');
    expect(formatDuration(27 * 3_600_000)).toBe('1 day 3 h');
  });
});

const EVENTS: CalendarEvent[] = [
  { id: '1', title: 'Rahul Sharma', type: 'interview', start: d(10, 6, 10), end: d(10, 6, 11) },
  { id: '2', title: 'Payroll cut-off review', type: 'meeting', start: d(10, 6, 12), end: d(10, 6, 13) },
  { id: '3', title: 'Aptitude test, batch 2', type: 'exam', start: d(10, 6, 14), end: d(10, 6, 15) },
  { id: '4', title: 'Meera Iyer', type: 'leave', allDay: true, start: d(10, 6), end: d(10, 6) },
];

describe('Calendar', () => {
  it('moves day focus with arrow keys and opens the day with Enter', async () => {
    const u = userEvent.setup();
    const onDayOpen = vi.fn();
    render(<Calendar events={EVENTS} today={d(10, 2, 11)} onDayOpen={onDayOpen} />);
    const grid = screen.getByRole('grid', { name: 'October 2026' });
    const start = grid.querySelector<HTMLElement>(`[data-day="${dayKey(d(10, 2))}"]`)!;
    expect(start).toHaveAttribute('tabindex', '0');
    start.focus();
    await u.keyboard('{ArrowRight}');
    expect(document.activeElement).toHaveAttribute('data-day', '2026-10-03');
    await u.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('data-day', '2026-10-10');
    await u.keyboard('{Home}');
    expect(document.activeElement).toHaveAttribute('data-day', '2026-10-05');
    await u.keyboard('{Enter}');
    expect(onDayOpen).toHaveBeenCalledWith(d(10, 5));
    expect(screen.getByRole('heading', { name: 'Monday, 5 Oct 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows "+N more" and lists every event in the popover; event click calls back', async () => {
    const u = userEvent.setup();
    const onEventClick = vi.fn();
    render(<Calendar events={EVENTS} today={d(10, 2)} onEventClick={onEventClick} maxPerDay={3} />);
    await u.click(screen.getByRole('button', { name: /\+2 more/ }));
    const pop = await screen.findByRole('dialog');
    expect(within(pop).getAllByRole('button')).toHaveLength(4);
    await u.click(within(pop).getByRole('button', { name: /Exam: Aptitude test/ }));
    expect(onEventClick).toHaveBeenCalledWith(EVENTS[2]);
  });

  it('switches to week view and moves by a week', async () => {
    const u = userEvent.setup();
    render(<Calendar events={EVENTS} today={d(10, 2)} />);
    await u.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByRole('heading', { name: '28 Sep – 4 Oct 2026' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByRole('heading', { name: '5 Oct – 11 Oct 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Interview: Rahul Sharma/ })).toBeInTheDocument();
  });
});

const PEOPLE: RosterPerson[] = [
  { id: 'p1', name: 'Arjun Kulkarni' },
  { id: 'p2', name: 'Lakshmi Venkatesan' },
];
const MON = d(9, 28);

describe('roster conflicts', () => {
  it('flags a short rest gap after a night shift', () => {
    const c = checkRoster({ people: PEOPLE, start: MON, days: 7, value: { p1: ['N', 'M', null], p2: ['N', 'G'] } });
    const rest = c.filter((x) => x.kind === 'rest');
    expect(rest.map((x) => [x.personId, x.day])).toEqual([
      ['p1', 1],
      ['p2', 1],
    ]);
    expect(rest[0].message).toContain('no rest. The night shift before ends at');
    expect(rest[1].message).toContain('only 3 h rest');
    expect(checkRoster({ people: PEOPLE, start: MON, days: 7, value: { p1: ['G', 'G', 'M'] } })).toEqual([]);
  });

  it('flags a working shift on approved leave, but not a weekly off', () => {
    const leave = [{ personId: 'p1', date: d(9, 30), code: 'CL' }];
    const c = checkRoster({ people: PEOPLE, start: MON, days: 7, value: { p1: [null, null, 'G'] }, leave });
    expect(c).toMatchObject([{ personId: 'p1', day: 2, kind: 'leave', short: 'On leave · CL' }]);
    expect(checkRoster({ people: PEOPLE, start: MON, days: 7, value: { p1: [null, null, 'OFF'] }, leave })).toEqual([]);
  });

  it('does not count leave days as worked hours, and checks night-work consent when given', () => {
    const leave = [{ personId: 'p1', date: d(9, 28), code: 'EL' }];
    const week = { p1: Array(7).fill('G') };
    expect(checkRoster({ people: PEOPLE, start: MON, days: 7, value: week, leave, rules: { maxWeeklyHours: 48 } }).filter((x) => x.kind === 'hours')).toEqual([]);
    const c = checkRoster({ people: PEOPLE, start: MON, days: 7, value: { p1: ['N'], p2: ['N'] }, rules: { nightConsent: ['p2'] } });
    expect(c).toMatchObject([{ personId: 'p1', day: 0, kind: 'consent' }]);
  });

  it('flags weekly hours once per week, on the day the limit is crossed', () => {
    const c = checkRoster({ people: PEOPLE, start: MON, days: 14, value: { p1: Array(14).fill('G') } });
    expect(c.filter((x) => x.kind === 'hours').map((x) => x.day)).toEqual([6, 13]);
    expect(checkRoster({ people: PEOPLE, start: MON, days: 7, value: { p1: Array(7).fill('G') }, rules: { maxWeeklyHours: 60 } })).toEqual([]);
  });
});

describe('RosterGrid', () => {
  it('assigns a shift to a selected range from the menu', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<RosterGrid people={PEOPLE} start={MON} onChange={onChange} />);
    const grid = screen.getByRole('grid');
    const cells = within(grid).getAllByRole('gridcell').filter((c) => c.hasAttribute('data-cell'));
    await u.click(cells[0]); // p1, Mon
    await u.click(cells[8]); // p2, Tue — plain click moves the anchor
    await u.keyboard('{Shift>}');
    await u.click(cells[0]);
    await u.keyboard('{/Shift}');
    expect(within(grid).getAllByRole('gridcell', { selected: true })).toHaveLength(4);
    await u.click(screen.getByRole('button', { name: /Assign shift \(4 cells\)/ }));
    await u.click(await screen.findByRole('menuitem', { name: /Night/ }));
    expect(onChange).toHaveBeenLastCalledWith({ p1: ['N', 'N', null, null, null, null, null], p2: ['N', 'N', null, null, null, null, null] });
    expect(screen.getByText('4 unsaved changes')).toBeInTheDocument();
    // N followed by N is a 16 h gap: no warning
    expect(screen.queryByText(/warnings? to check/)).not.toBeInTheDocument();
  });

  it('keyboard: Enter on a cell opens the menu; conflicts show in the cell and the list; publish needs confirming', async () => {
    const u = userEvent.setup();
    const onPublish = vi.fn();
    render(<RosterGrid people={PEOPLE} start={MON} defaultValue={{ p1: ['N'] }} onPublish={onPublish} />);
    const grid = screen.getByRole('grid');
    grid.querySelector<HTMLElement>('[data-cell="0:0"]')!.focus();
    await u.keyboard('{ArrowRight}{Enter}');
    await u.click(await screen.findByRole('menuitem', { name: /Morning/ }));
    expect(grid.querySelector('[data-cell="0:1"]')).toHaveTextContent('Rest gap');
    expect(screen.getByText(/1 warning to check/)).toBeInTheDocument();

    // A rest gap blocks publishing until it is fixed.
    expect(screen.getByRole('button', { name: 'Publish roster' })).toBeDisabled();
    expect(screen.getByText('Fix 1 conflict to publish')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Go to cell' }));
    expect(grid.querySelector('[data-cell="0:1"]')).toHaveFocus();
    await u.keyboard('{Delete}');
    await u.click(screen.getByRole('button', { name: 'Publish roster' }));
    await u.click(screen.getByRole('button', { name: 'Publish roster' }));
    expect(onPublish).toHaveBeenCalledWith({ p1: ['N', null] });
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.queryByText(/unsaved/)).not.toBeInTheDocument();
  });

  it('is read-only for staff', () => {
    render(<RosterGrid people={PEOPLE} start={MON} defaultValue={{ p1: ['G'] }} defaultStatus="published" readOnly />);
    expect(screen.getByRole('grid')).toHaveAttribute('aria-readonly', 'true');
    expect(screen.queryByRole('button', { name: /Publish roster|Assign shift/ })).not.toBeInTheDocument();
  });
});

describe('mentions', () => {
  const people = [
    { id: 'e3', name: 'Sana Nizami' },
    { id: 'e9', name: 'Sana Nizami Khan' },
    { id: 'e2', name: 'Arjun Kulkarni' },
  ];

  it('parses stored mention markup into segments and unique ids', () => {
    const r = parseMentions('Hi @[Sana Nizami](e3) and @[Arjun Kulkarni](e2), see @[Sana Nizami](e3).');
    expect(r.ids).toEqual(['e3', 'e2']);
    expect(r.segments[0]).toEqual({ text: 'Hi ' });
    expect(r.segments[1]).toEqual({ mention: { id: 'e3', name: 'Sana Nizami' } });
    expect(r.segments.at(-1)).toEqual({ text: '.' });
  });

  it('turns typed @names into markup, longest name first', () => {
    expect(toMentionMarkup('Ask @Sana Nizami Khan and @Sana Nizami.', people)).toBe('Ask @[Sana Nizami Khan](e9) and @[Sana Nizami](e3).');
    expect(toMentionMarkup('mail sana@yukthix.in', people)).toBe('mail sana@yukthix.in');
  });

  it('detects the @query being typed', () => {
    expect(mentionQuery('Please check @sa')).toBe('sa');
    expect(mentionQuery('@')).toBe('');
    expect(mentionQuery('mail sana@yuk')).toBeNull();
  });

  it('suggests people after @, selects with the keyboard and reports mentioned ids', async () => {
    const u = userEvent.setup();
    const onAdd = vi.fn();
    render(<CommentThread currentUser={{ id: 'e2', name: 'Arjun Kulkarni' }} people={people} onAdd={onAdd} />);
    const box = screen.getByRole('textbox', { name: 'Comment' });
    await u.type(box, 'Please check @Sana');
    const list = screen.getByRole('listbox', { name: 'People to mention' });
    expect(within(list).getAllByRole('option')).toHaveLength(2);
    await u.keyboard('{ArrowDown}{Enter}');
    expect(box).toHaveValue('Please check @Sana Nizami Khan ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ mentions: ['e9'], private: false }));
    expect(screen.getByText('@Sana Nizami Khan')).toHaveClass('yx-comment__mention');
  });

  it('asks for text before posting', async () => {
    const u = userEvent.setup();
    render(<CommentThread currentUser={{ id: 'e2', name: 'Arjun Kulkarni' }} people={people} />);
    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write a comment before you post it.');
  });
});

describe('comment edit window', () => {
  const now = d(9, 29, 11, 0);
  const me = { id: 'e2', name: 'Arjun Kulkarni' };
  const recent: Comment = { id: 'c1', author: me, body: 'Shift swap agreed.', at: d(9, 29, 10, 46) };
  const old: Comment = { id: 'c2', author: me, body: 'Checked the punches.', at: d(9, 29, 10, 44) };

  it('allows edits by the author for 15 minutes only', () => {
    expect(canEditComment(recent, 'e2', now)).toBe(true);
    expect(canEditComment({ ...recent, at: d(9, 29, 10, 45) }, 'e2', now)).toBe(true);
    expect(canEditComment(old, 'e2', now)).toBe(false);
    expect(canEditComment(recent, 'e3', now)).toBe(false);
  });

  it('shows Edit only inside the window and marks the comment Edited', async () => {
    const u = userEvent.setup();
    const onEdit = vi.fn();
    render(<CommentThread currentUser={me} people={[]} defaultComments={[old, recent]} now={now} onEdit={onEdit} />);
    const edits = screen.getAllByRole('button', { name: 'Edit comment' });
    expect(edits).toHaveLength(1);
    await u.click(edits[0]);
    const box = screen.getByRole('textbox', { name: 'Edit comment' });
    await u.clear(box);
    await u.type(box, 'Shift swap agreed with Meera.');
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onEdit).toHaveBeenCalledWith('c1', 'Shift swap agreed with Meera.');
    expect(screen.getByText('Edited')).toBeInTheDocument();
  });

  it('resolves a thread and hides the composer', async () => {
    const u = userEvent.setup();
    render(<CommentThread currentUser={me} people={[]} defaultComments={[old]} now={now} />);
    await u.click(screen.getByRole('button', { name: 'Resolve thread' }));
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Comment' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen thread' })).toBeInTheDocument();
  });
});
