import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Copy, MessageSquareText, Plus, Trash2 } from 'lucide-react';
import { cx } from '../lib/cx';
import { formatDate } from '../lib/format';
import { formatHours, parseHours } from '../lib/table';
import { Button, IconButton } from './button';
import { Checkbox } from './choice';
import { Badge, DayDate, type BadgeTone } from './display';
import { InlineAlert, Meter } from './feedback';
import { Select } from './select';
import { TextArea } from './inputs';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover';

export interface TimesheetTask {
  id: string;
  name: string;
  /** Overrides the project's billable default (M12 YX-PRJ-03). */
  billable?: boolean;
}

export interface TimesheetProject {
  id: string;
  code: string;
  name: string;
  client?: string;
  billable: boolean;
  tasks: TimesheetTask[];
}

export interface TimesheetLine {
  id: string;
  projectId: string | null;
  taskId: string | null;
  billable: boolean;
  /** Seven entries, Monday to Sunday. */
  hours: (number | null)[];
  /**
   * An adjustment for a locked week ("24 Aug – 30 Aug"): one hours field (`correctionHours`) instead of seven days. It
   * never counts toward the day totals or the daily limit.
   */
  correctionFor?: string;
  correctionHours?: number | null;
  /**
   * Answer 1787: a comment per day, Monday to Sunday, in the person's own words (pre-filled rows start empty). Opened
   * from the "Comment" link under a day's hours; a day with no hours has none.
   */
  comments?: string[];
}

/** The company's comment rule (Settings › Projects & timesheets): required by default, at least 20 words a day with hours. */
export interface TimesheetNoteRule {
  required: boolean;
  minWords: number;
}

export interface TimesheetDay {
  /** Expected working hours from the day engine (M02). 0 on weekends and holidays. */
  expected: number;
  kind?: 'workday' | 'weekend' | 'holiday' | 'leave';
  /** e.g. "Gandhi Jayanti", "Casual leave". */
  label?: string;
}

export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'sent_back' | 'locked';

const STATUS: Record<TimesheetStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  sent_back: { label: 'Sent back', tone: 'danger' },
  locked: { label: 'Locked', tone: 'neutral' },
};

export interface TimesheetGridProps {
  /** Monday of the week. */
  weekStart: Date;
  days: TimesheetDay[];
  status: TimesheetStatus;
  lines: TimesheetLine[];
  onLinesChange: (lines: TimesheetLine[]) => void;
  /** Only projects the person is allocated to, plus internal codes (M12 YX-PRJ-02). */
  projects: TimesheetProject[];
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onThisWeek?: () => void;
  onCopyLastWeek?: () => void;
  onSaveDraft?: () => void;
  /** Called only when the week passes the checks. */
  onSubmit?: () => void;
  /** Why the approver sent the week back. */
  sentBackReason?: string;
  /** Starter: 24 (M12 YX-PRJ-03). */
  dailyMax?: number;
  saving?: boolean;
  submitting?: boolean;
  /** "auto" switches to the day list below 1100 px, so tablets get it too (M04). */
  layout?: 'auto' | 'grid' | 'days';
  /** Days on or after this date can't be filled yet (future days): their cells are read-only. */
  lockFrom?: Date;
  /** The cell the approver queried on a sent-back week: amber outline, "Queried by …". `day` is 0 (Mon) to 6. */
  sentBackCell?: { lineId: string; day: number; by: string };
  /** Locked week: shows "Add correction in current week" inside the locked notice. */
  onAddCorrection?: () => void;
  /** Days before this are past: a working day below its expected hours shows "N h short" in amber. */
  today?: Date;
  /** Answer 1787: a "Comment" link under each day with hours, with a live word count; Submit checks it (Save draft never does). */
  noteRule?: TimesheetNoteRule;
  /** Grid footer: the screen's own submit button (placed after Save draft), and a short line on the left (who it goes to). */
  submitAction?: ReactNode;
  footNote?: ReactNode;
}

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** "1 Oct 2026" (no leading zero). */
const longDate = (d: Date) => formatDate(d).replace(/^0/, '');
const sum = (xs: (number | null)[]) => Math.round(xs.reduce<number>((a, b) => a + (b ?? 0), 0) * 100) / 100;

function useNarrow() {
  const q = '(max-width: 1099px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const h = () => setNarrow(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return narrow;
}

let seq = 0;
export const newTimesheetLine = (): TimesheetLine => ({ id: `new-${++seq}`, projectId: null, taskId: null, billable: false, hours: Array(7).fill(null) });

interface Problem {
  message: string;
  lineId?: string;
  day?: number;
}

/** Checks from M12 YX-PRJ-03; returns errors that block submit. */
/** Hours a line adds: its seven days, or its single correction field. */
const lineHours = (l: TimesheetLine) => (l.correctionFor ? l.correctionHours ?? 0 : sum(l.hours));

/** Words in a comment (runs of non-space characters). */
export const wordCount = (note: string | null | undefined) => (note ?? '').trim().split(/\s+/).filter(Boolean).length;

export function checkTimesheet(lines: TimesheetLine[], dailyMax = 24, noteRule?: TimesheetNoteRule): Problem[] {
  const out: Problem[] = [];
  lines.forEach((l, i) => {
    if (lineHours(l) > 0 && !l.projectId) out.push({ message: `Choose a project for row ${i + 1}`, lineId: l.id });
    else if (noteRule?.required && !l.correctionFor)
      l.hours.forEach((h, d) => {
        const n = wordCount(l.comments?.[d]);
        if ((h ?? 0) > 0 && n < noteRule.minWords) out.push({ message: `Row ${i + 1}, ${DAY[d]}: write a comment of at least ${noteRule.minWords} words (${n} so far)`, lineId: l.id });
      });
  });
  // Corrections belong to another week: they never count toward a day here.
  const dayLines = lines.filter((l) => !l.correctionFor);
  for (let d = 0; d < 7; d++) {
    const t = sum(dayLines.map((l) => l.hours[d]));
    if (t > dailyMax) out.push({ message: `${DAY[d]} has ${formatHours(t)} h. A day can have at most ${dailyMax} h`, day: d });
  }
  if (lines.reduce((a, l) => a + lineHours(l), 0) === 0) out.push({ message: 'Add your hours before submitting the week' });
  return out;
}

function HourCell({
  value,
  editable,
  invalid,
  r,
  c,
  label,
  onCommit,
  onActive,
}: {
  value: number | null;
  editable: boolean;
  invalid?: boolean;
  r: number;
  c: number;
  label: string;
  onCommit: (v: number | null) => void;
  /** Founder reference: the day's comment opens under the box while the person is in a box with hours. */
  onActive?: (hasHours: boolean) => void;
}) {
  const [text, setText] = useState(formatHours(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(formatHours(value));
    setBad(false);
  }, [value]);
  if (!editable) return <span className="yx-ts__hours-ro">{formatHours(value) || '–'}</span>;
  const commit = () => {
    const h = parseHours(text);
    if (h !== null && (Number.isNaN(h) || h < 0)) {
      setBad(true);
      return;
    }
    setBad(false);
    if (h !== value) onCommit(h);
    setText(formatHours(h));
  };
  const move = (e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    let [nr, nc] = [r, c];
    if (e.key === 'ArrowUp') nr--;
    else if (e.key === 'ArrowDown' || e.key === 'Enter') nr++;
    else if (e.key === 'ArrowLeft' && el.selectionStart === 0) nc--;
    else if (e.key === 'ArrowRight' && el.selectionEnd === el.value.length) nc++;
    else return;
    e.preventDefault();
    commit();
    const next = el.closest('.yx-ts')?.querySelector<HTMLInputElement>(`input[data-r="${nr}"][data-c="${nc}"]`);
    next?.focus();
    next?.select();
  };
  return (
    <input
      className="yx-ts__hours"
      inputMode="decimal"
      autoComplete="off"
      data-r={r}
      data-c={c}
      aria-label={label}
      aria-invalid={bad || invalid || undefined}
      title={bad ? 'Enter hours like 7.5, 7:30 or 45m' : undefined}
      value={text}
      placeholder="–"
      onChange={(e) => {
        setText(e.target.value);
        const h = parseHours(e.target.value);
        onActive?.(h !== null && !Number.isNaN(h) && h > 0);
      }}
      onBlur={commit}
      onKeyDown={move}
      onFocus={(e) => {
        e.currentTarget.select();
        onActive?.((value ?? 0) > 0);
      }}
    />
  );
}

/**
 * Weekly timesheet (M12, M02 §B7): project × task × day grid with billable flag, copy last week,
 * save draft and submit week; totals against expected hours; day list on phones.
 */
export function TimesheetGrid(props: TimesheetGridProps) {
  const {
    weekStart,
    days,
    status,
    lines,
    onLinesChange,
    projects,
    onPrevWeek,
    onNextWeek,
    onThisWeek,
    onCopyLastWeek,
    onSaveDraft,
    onSubmit,
    sentBackReason,
    dailyMax = 24,
    saving,
    submitting,
    layout = 'auto',
    lockFrom,
    sentBackCell,
    onAddCorrection,
    today,
    noteRule,
    submitAction,
    footNote,
  } = props;
  const narrow = useNarrow();
  const asDays = layout === 'days' || (layout === 'auto' && narrow);
  const editable = status === 'draft' || status === 'sent_back';
  /** Future days (on or after lockFrom) can't be filled yet. */
  const dayLocked = (d: number) => !!lockFrom && addDays(weekStart, d) >= new Date(lockFrom.getFullYear(), lockFrom.getMonth(), lockFrom.getDate());
  const queried = (lineId: string, d: number) => (sentBackCell && sentBackCell.lineId === lineId && sentBackCell.day === d ? `Queried by ${sentBackCell.by}` : undefined);
  /** Billable as text where it can't be changed: read-only weeks and projects that aren't billable. */
  const billText = (l: TimesheetLine, p?: TimesheetProject, short = false) => {
    const yes = !(p && !p.billable) && !!l.billable;
    const words = yes ? 'Billable' : 'Not billable';
    // Short "Yes" / "No" only under the grid's Billable column header; elsewhere the full words.
    return short ? <span className="yx-ts__muted" aria-label={words}>{yes ? 'Yes' : 'No'}</span> : <span className="yx-ts__muted">{words}</span>;
  };
  const [problems, setProblems] = useState<Problem[]>([]);
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  // Correction lines belong to another (locked) week: they never count toward this week's days.
  const dayLines = lines.filter((l) => !l.correctionFor);
  const corrections = lines.filter((l) => l.correctionFor);
  const dayTotals = dates.map((_, d) => sum(dayLines.map((l) => l.hours[d])));
  const weekTotal = sum(dayTotals);
  const correctionTotal = sum(corrections.map((l) => l.correctionHours ?? null));
  const expectedTotal = sum(days.map((d) => d.expected));
  /** Header hint: the day's label and its expected hours together ("Half-day leave · 4 h"); "Not yet" for a future working day. */
  const dayExp = (d: number) => {
    // Holidays and weekly offs name themselves ("Gandhi Jayanti") or show '–', even in the future.
    if (days[d].kind === 'holiday' || days[d].kind === 'weekend') return days[d].label || '–';
    if (editable && dayLocked(d)) return 'Not yet';
    const h = days[d].expected ? `${formatHours(days[d].expected)} h` : '';
    return days[d].label ? [days[d].label, h].filter(Boolean).join(' · ') : h || '–';
  };
  /** A past working day below its expected hours: "1 h short". */
  const shortBy = (d: number) => {
    if (!today || (days[d].kind && days[d].kind !== 'workday') || !days[d].expected) return 0;
    if (dates[d] >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) return 0;
    return Math.max(0, Math.round((days[d].expected - dayTotals[d]) * 100) / 100);
  };

  const patch = (id: string, p: Partial<TimesheetLine>) => {
    onLinesChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
    if (problems.length) setProblems([]);
  };
  const setHour = (id: string, d: number, v: number | null) => {
    const l = lines.find((x) => x.id === id)!;
    const hours = [...l.hours];
    hours[d] = v;
    patch(id, { hours });
  };
  const pickProject = (l: TimesheetLine, projectId: string | null) => {
    const p = projectId ? byId.get(projectId) : undefined;
    patch(l.id, { projectId, taskId: null, billable: p?.billable ?? false });
  };
  const pickTask = (l: TimesheetLine, taskId: string | null) => {
    const p = l.projectId ? byId.get(l.projectId) : undefined;
    const t = p?.tasks.find((x) => x.id === taskId);
    patch(l.id, { taskId, billable: t?.billable ?? p?.billable ?? false });
  };
  const submit = () => {
    const p = checkTimesheet(lines, dailyMax, noteRule);
    setProblems(p);
    if (!p.length) onSubmit?.();
  };

  /** Answer 1787: the day's comment, opened from the "Comment" link under its hours (one open at a time). */
  const [openComment, setOpenComment] = useState<string | null>(null);
  const setComment = (id: string, d: number, text: string) => {
    const l = lines.find((x) => x.id === id)!;
    const comments = Array.from({ length: 7 }, (_, k) => l.comments?.[k] ?? '');
    comments[d] = text;
    patch(id, { comments });
  };
  const commentBox = (l: TimesheetLine, d: number, rowName: string) => {
    const text = l.comments?.[d] ?? '';
    const n = wordCount(text);
    const short = !!noteRule?.required && n < (noteRule?.minWords ?? 0);
    return editable ? (
      <span className="yx-ts__comment-box">
        <TextArea aria-label={`Comment for ${rowName}, ${DAY[d]} ${longDate(dates[d])}`} rows={3} value={text} placeholder="What did you do? In your own words." onChange={(v) => setComment(l.id, d, v)} />
        <span className="yx-ts__note-count" aria-live="polite" data-tone={short ? 'short' : undefined}>
          {noteRule?.required ? `${n} of ${noteRule.minWords} words` : `${n} words · optional`}
        </span>
      </span>
    ) : (
      <span className="yx-ts__comment-box yx-ts__note-text">{text}</span>
    );
  };
  /** The link under a day's hours; `inline` opens the box right there (day list), otherwise the grid opens it in a full-width row under the line. */
  const dayComment = (l: TimesheetLine, d: number, rowName: string, inline = true) => {
    if (!noteRule || l.correctionFor || !((l.hours[d] ?? 0) > 0)) return null;
    const text = l.comments?.[d] ?? '';
    const n = wordCount(text);
    const short = noteRule.required && n < noteRule.minWords;
    const key = `${l.id}:${d}`;
    const open = openComment === key;
    if (!editable && !text) return null;
    return (
      <span className="yx-ts__comment">
        <button type="button" className="yx-ts__comment-link" aria-expanded={open} aria-label={text ? `Comment · ${n} ${n === 1 ? 'word' : 'words'}` : 'Comment'} data-tone={editable && short ? 'short' : undefined} onClick={() => setOpenComment(open ? null : key)}>
          {text ? (
            <>
              <MessageSquareText size={12} aria-hidden /> {n}
            </>
          ) : (
            'Comment'
          )}
        </button>
        {open && inline && commentBox(l, d, rowName)}
      </span>
    );
  };

  const range = `${longDate(dates[0])} – ${longDate(dates[6])}`;
  const projectOptions = projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}`, description: p.client ?? 'Internal' }));
  const badLines = new Set(problems.map((p) => p.lineId).filter(Boolean));
  const badDays = new Set(problems.map((p) => p.day).filter((d) => d !== undefined));

  const offDay = (d: number) => days[d].kind === 'holiday' || days[d].kind === 'leave';
  const dayTone = (d: number) =>
    dayTotals[d] > dailyMax
      ? 'danger'
      : (days[d].expected > 0 && dayTotals[d] > days[d].expected) || (offDay(d) && dayTotals[d] > 0)
        ? 'warning'
        : undefined;
  const dayHint = (d: number) =>
    dayTone(d) !== 'warning'
      ? undefined
      : days[d].kind === 'holiday'
        ? `Hours on ${days[d].label ?? 'a holiday'} are paid at the holiday rate.`
        : days[d].kind === 'leave'
          ? 'You are on leave this day. Cancel the leave or move these hours'
          : `Above the expected ${formatHours(days[d].expected)} h`;

  const header = (
    <div className="yx-ts__bar">
      <div className="yx-ts__week">
        <span className="yx-ts__nav">
          {onPrevWeek && <IconButton icon={ChevronLeft} label="Previous week" variant="secondary" size="sm" onClick={onPrevWeek} />}
          <span className="yx-ts__range">{range}</span>
          {onNextWeek && <IconButton icon={ChevronRight} label="Next week" variant="secondary" size="sm" onClick={onNextWeek} />}
        </span>
        {onThisWeek && (
          <Button size="sm" onClick={onThisWeek}>
            This week
          </Button>
        )}
        <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
      </div>
      {editable && (
        <div className="yx-ts__actions">
          {onCopyLastWeek && (
            <Button size="sm" icon={Copy} onClick={onCopyLastWeek}>
              Copy last week
            </Button>
          )}
          {asDays && onSaveDraft && (
            <Button size="sm" onClick={onSaveDraft} loading={saving}>
              Save draft
            </Button>
          )}
          {asDays && onSubmit && (
            <Button size="sm" variant="primary" onClick={submit} loading={submitting}>
              Submit week
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const alerts = (
    <>
      {status === 'sent_back' && (
        <InlineAlert tone="warning" title="Your manager sent this week back">
          {sentBackReason ?? 'Check the lines, fix them and submit again.'}
        </InlineAlert>
      )}
      {status === 'submitted' && <InlineAlert tone="info">Submitted for approval.</InlineAlert>}
      {status === 'locked' && (
        <InlineAlert tone="info" actions={onAddCorrection && <Button size="sm" onClick={onAddCorrection}>Add correction in current week</Button>}>
          This week is locked with the payroll period. Corrections go in an open week as an adjustment line.
        </InlineAlert>
      )}
      {editable && lockFrom && dates.some((_, d) => dayLocked(d)) && <p className="yx-ts__muted">Hours from {longDate(lockFrom)} can be added on the day.</p>}
      {problems.length > 0 && (
        <InlineAlert tone="danger" title="Fix these before submitting">
          <ul className="yx-ts__problems">
            {problems.map((p) => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
        </InlineAlert>
      )}
    </>
  );

  const addRow = editable && (
    <Button size="sm" icon={Plus} onClick={() => onLinesChange([...lines, newTimesheetLine()])}>
      Add row
    </Button>
  );

  if (asDays) {
    return (
      <div className="yx-ts" data-layout="days">
        {header}
        {alerts}
        {editable && (
          <section className="yx-ts__day" aria-label="Projects this week">
            <header className="yx-ts__day-head">
              <span className="yx-ts__day-name">Projects this week</span>
            </header>
            {lines.map((l, r) => {
              const p = l.projectId ? byId.get(l.projectId) : undefined;
              return (
                <div key={l.id} className="yx-ts__pick" data-invalid={badLines.has(l.id) || undefined}>
                  <Select aria-label={`Project for row ${r + 1}`} options={projectOptions} value={l.projectId} onChange={(v) => pickProject(l, v)} placeholder="Choose project" />
                  <Select
                    aria-label={`Task for row ${r + 1}`}
                    options={(p?.tasks ?? []).map((t) => ({ value: t.id, label: t.name }))}
                    value={l.taskId}
                    onChange={(v) => pickTask(l, v)}
                    placeholder={p ? 'Choose task' : 'Project first'}
                    disabled={!p}
                    clearable
                  />
                  <div className="yx-ts__pick-foot">
                    {p?.billable ? <Checkbox label="Billable" checked={l.billable} onChange={(billable) => patch(l.id, { billable })} /> : p ? billText(l, p) : <span />}
                    <IconButton icon={Trash2} label={`Remove row ${r + 1}`} onClick={() => onLinesChange(lines.filter((x) => x.id !== l.id))} />
                  </div>
                </div>
              );
            })}
            {addRow}
          </section>
        )}
        {dates.map((date, d) => (
          <section key={d} className="yx-ts__day" data-kind={days[d].kind} aria-label={`${DAY[d]} ${longDate(date)}`}>
            <header className="yx-ts__day-head">
              <span className="yx-ts__day-name">
                <DayDate date={date} />
              </span>
              <span className="yx-ts__day-meta">
                {days[d].kind === 'holiday' || days[d].kind === 'weekend' || days[d].label
                  ? dayExp(d)
                  : editable && dayLocked(d)
                    ? 'Not yet'
                    : days[d].expected
                      ? `${formatHours(days[d].expected)} h expected`
                      : 'Weekend'}
              </span>
              {/* The shortfall sits with the total it explains: "7 h · 1 h short" in amber. */}
              <span className="yx-ts__day-total" data-tone={dayTone(d) ?? (shortBy(d) > 0 ? 'short' : undefined)}>
                {dayTotals[d] ? `${formatHours(dayTotals[d])} h` : '–'}
                {shortBy(d) > 0 && ` · ${formatHours(shortBy(d))} h short`}
              </span>
            </header>
            {dayLines
              .filter((l) => l.projectId)
              .map((l, r) => {
                const p = byId.get(l.projectId!);
                const t = p?.tasks.find((x) => x.id === l.taskId);
                const q = queried(l.id, d);
                return (
                  <div key={l.id} className="yx-ts__day-line" data-queried={q ? true : undefined} title={q}>
                    <span className="yx-ts__day-proj">
                      <span>{p ? `${p.code} · ${p.name}` : ''}</span>
                      <span className="yx-ts__muted">
                        {t?.name ?? 'No task'}
                        {l.billable ? ' · Billable' : ''}
                        {q ? ` · ${q}` : ''}
                      </span>
                    </span>
                    <HourCell
                      value={l.hours[d]}
                      editable={editable && !dayLocked(d)}
                      r={r}
                      c={d}
                      label={`${p?.name ?? 'Row'} ${DAY[d]} hours`}
                      onCommit={(v) => setHour(l.id, d, v)}
                    />
                    {dayComment(l, d, p?.name ?? `row ${r + 1}`)}
                  </div>
                );
              })}
          </section>
        ))}
        {corrections.length > 0 && (
          <section className="yx-ts__day" aria-label="Corrections">
            <header className="yx-ts__day-head">
              <span className="yx-ts__day-name">Corrections</span>
              <span className="yx-ts__day-meta">Not counted in this week's days</span>
            </header>
            {corrections.map((l, r) => {
              const p = l.projectId ? byId.get(l.projectId) : undefined;
              return (
                <div key={l.id} className="yx-ts__day-line">
                  <span className="yx-ts__day-proj">
                    <span>{p ? `${p.code} · ${p.name}` : 'Choose a project above'}</span>
                    <span className="yx-ts__muted">For {l.correctionFor}</span>
                  </span>
                  <HourCell value={l.correctionHours ?? null} editable={editable} r={100 + r} c={0} label={`Correction hours for ${l.correctionFor}`} onCommit={(v) => patch(l.id, { correctionHours: v })} />
                </div>
              );
            })}
          </section>
        )}
        <div className="yx-ts__week-total">
          Week total <strong>{formatHours(weekTotal)} h</strong> of {formatHours(expectedTotal)} h expected
          {correctionTotal > 0 && ` · plus ${formatHours(correctionTotal)} h correction`}
        </div>
      </div>
    );
  }

  /** The day's comment as a small box right under its hours (reference pattern): one open at a time. */
  const dayCell = (l: TimesheetLine, d: number, rowName: string, r: number) => {
    const key = `${l.id}:${d}`;
    const hasHours = (l.hours[d] ?? 0) > 0;
    const text = l.comments?.[d] ?? '';
    const n = wordCount(text);
    const asks = !!noteRule && hasHours && (editable || !!text);
    const short = !!noteRule?.required && n < (noteRule?.minWords ?? 0);
    const open = asks && openComment === key;
    const name = text ? `Comment · ${n} ${n === 1 ? 'word' : 'words'}` : 'Comment';
    const box = (
      <HourCell
        value={l.hours[d]}
        editable={editable && !dayLocked(d)}
        r={r}
        c={d}
        label={`${rowName} ${DAY[d]} ${longDate(dates[d])} hours`}
        onCommit={(v) => setHour(l.id, d, v)}
        onActive={noteRule && editable ? (yes) => yes && setOpenComment(key) : undefined}
      />
    );
    if (!noteRule) return <span className="yx-ts__cell">{box}</span>;
    return (
      <Popover open={open} onOpenChange={(o) => setOpenComment(o ? key : null)}>
        <PopoverAnchor asChild>
          <span className="yx-ts__cell">
            {box}
            {asks && (
              <PopoverTrigger asChild>
                <button type="button" className="yx-ts__comment-dot" aria-label={name} data-tone={editable && short ? 'short' : text ? 'done' : undefined}>
                  <MessageSquareText size={10} aria-hidden />
                </button>
              </PopoverTrigger>
            )}
          </span>
        </PopoverAnchor>
        <PopoverContent
          className="yx-ts__comment-pop"
          align="start"
          sideOffset={4}
          // Stay in the hours box; the comment is one click away under it.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if ((e.target as HTMLElement | null)?.closest?.(`[data-cell="${key}"]`)) e.preventDefault();
          }}
        >
          <span className="yx-ts__comment-head">
            {DAY[d]} {longDate(dates[d])} · {rowName}
          </span>
          {commentBox(l, d, rowName)}
        </PopoverContent>
      </Popover>
    );
  };
  const comments = dayLines
    .flatMap((l) => l.hours.map((h, d) => ({ l, d, h, text: (l.comments?.[d] ?? '').trim() })).filter((x) => x.text))
    .sort((a, b) => a.d - b.d);
  const cols = editable ? 10 : 9;

  return (
    <div className="yx-ts" data-layout="grid">
      <div className="yx-ts__card">
        {header}
        <div className="yx-ts__summary">
          <span className="yx-ts__summary-item">
            <span className="yx-ts__summary-label">Total this week</span>
            <span className="yx-ts__summary-value">
              <strong>{formatHours(weekTotal) || '0'}</strong> / {formatHours(expectedTotal)} h
            </span>
            {expectedTotal > 0 ? (
              <Meter value={weekTotal} max={expectedTotal} label="Hours this week" warnAt={1000} dangerAt={1000} valueText={`${Math.round((weekTotal / expectedTotal) * 100)}%`} />
            ) : (
              <span className="yx-ts__muted">No expected hours this week</span>
            )}
          </span>
          {correctionTotal > 0 && (
            <span className="yx-ts__summary-item">
              <span className="yx-ts__summary-label">Corrections</span>
              <span className="yx-ts__summary-value">{formatHours(correctionTotal)} h</span>
            </span>
          )}
        </div>
        {alerts}
        <div className="yx-ts__scroll" tabIndex={0} role="region" aria-label="Timesheet grid">
          <table className="yx-ts__table" aria-label={`Timesheet ${range}`}>
            <thead>
              <tr>
                <th scope="col" className="yx-ts__col-proj">
                  Project and task
                </th>
                {dates.map((date, d) => (
                  <th key={d} scope="col" className="yx-ts__col-day" data-kind={days[d].kind} data-invalid={badDays.has(d) || undefined}>
                    <span className="yx-ts__dayname">
                      <DayDate date={date} stacked year={false} />
                    </span>
                    <span className="yx-ts__dayexp" title={dayExp(d)}>
                      {dayExp(d)}
                    </span>
                  </th>
                ))}
                <th scope="col" className="yx-ts__col-total">
                  Total
                </th>
                {editable && (
                  <th scope="col" className="yx-ts__col-remove">
                    <span className="yx-visually-hidden">Remove</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, r) => {
                const p = l.projectId ? byId.get(l.projectId) : undefined;
                const rowName = p ? p.name : `Row ${r + 1}`;
                const taskName = p?.tasks.find((t) => t.id === l.taskId)?.name;
                return (
                  <tr key={l.id} data-invalid={badLines.has(l.id) || undefined}>
                    <td className="yx-ts__col-proj">
                      {editable ? (
                        <span className="yx-ts__pickrow">
                          <Select size="sm" aria-label={`Project for row ${r + 1}`} options={projectOptions} value={l.projectId} onChange={(v) => pickProject(l, v)} placeholder="Choose project" searchable={projects.length > 7} />
                          <Select
                            size="sm"
                            aria-label={`Task for row ${r + 1}`}
                            options={(p?.tasks ?? []).map((t) => ({ value: t.id, label: t.name }))}
                            value={l.taskId}
                            onChange={(v) => pickTask(l, v)}
                            placeholder={p ? 'Choose task' : 'Project first'}
                            disabled={!p}
                            clearable
                          />
                          {p?.billable ? (
                            <Checkbox aria-label={`${rowName} billable`} label="Billable" checked={l.billable} onChange={(billable) => patch(l.id, { billable })} />
                          ) : p ? (
                            <span className="yx-ts__billtext">{billText(l, p)}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="yx-ts__projtext">
                          <span className="yx-ts__cell-text">{p ? `${p.code} · ${p.name}` : '—'}</span>
                          <span className="yx-ts__cell-text yx-ts__muted">
                            {taskName ?? 'No task'}
                            {p ? ' · ' : ''}
                            {p ? billText(l, p) : null}
                          </span>
                        </span>
                      )}
                    </td>
                    {l.correctionFor ? (
                      <td colSpan={7}>
                        <span className="yx-ts__correction">
                          <span>Correction for {l.correctionFor} · not counted in this week's days</span>
                          <HourCell value={l.correctionHours ?? null} editable={editable} r={r} c={0} label={`${rowName} correction hours for ${l.correctionFor}`} onCommit={(v) => patch(l.id, { correctionHours: v })} />
                        </span>
                      </td>
                    ) : (
                      l.hours.map((_h, d) => (
                        <td key={d} className="yx-ts__col-day" data-cell={`${l.id}:${d}`} data-kind={days[d].kind} data-queried={queried(l.id, d) ? true : undefined} title={queried(l.id, d)}>
                          {dayCell(l, d, rowName, r)}
                        </td>
                      ))
                    )}
                    <td className="yx-ts__col-total">{formatHours(lineHours(l)) || '–'}</td>
                    {editable && (
                      <td className="yx-ts__col-remove">
                        <IconButton icon={Trash2} label={`Remove ${rowName}`} size="sm" onClick={() => onLinesChange(lines.filter((x) => x.id !== l.id))} />
                      </td>
                    )}
                  </tr>
                );
              })}
              {editable && (
                <tr className="yx-ts__addrow">
                  <td colSpan={cols}>{addRow}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="yx-ts__foot-label">Total hours per day</td>
                {dayTotals.map((t, d) => (
                  <td key={d} className="yx-ts__col-day" data-kind={days[d].kind}>
                    <span className={cx('yx-ts__daytotal')} data-tone={dayTone(d) ?? (shortBy(d) > 0 ? 'short' : undefined)} title={dayHint(d)}>
                      {t > 0 ? formatHours(t) : '–'}
                    </span>
                    {offDay(d) && t > 0 && <span className="yx-ts__dayhint">{days[d].kind === 'holiday' ? 'Holiday rate' : 'On leave'}</span>}
                    {shortBy(d) > 0 && (
                      <span className="yx-ts__dayhint" data-tone="short">
                        {formatHours(shortBy(d))} h short
                      </span>
                    )}
                  </td>
                ))}
                <td className="yx-ts__col-total">
                  <strong>{weekTotal > 0 ? formatHours(weekTotal) : '–'}</strong>
                  <span className="yx-ts__muted"> / {formatHours(expectedTotal)} h</span>
                  {correctionTotal > 0 && (
                    <span className="yx-ts__muted" style={{ display: 'block' }}>
                      + {formatHours(correctionTotal)} h correction
                    </span>
                  )}
                </td>
                {editable && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
        {editable && (onSaveDraft || onSubmit || submitAction) && (
          <div className="yx-ts__footbar">
            <span className="yx-ts__muted">{footNote}</span>
            <span className="yx-ts__footbar-actions">
              {onSaveDraft && (
                <Button onClick={onSaveDraft} loading={saving}>
                  Save draft
                </Button>
              )}
              {onSubmit && (
                <Button variant="primary" onClick={submit} loading={submitting}>
                  Submit week
                </Button>
              )}
              {submitAction}
            </span>
          </div>
        )}
      </div>
      {noteRule && (
        <section className="yx-ts__card yx-ts__notes" aria-label="Comments this week">
          <h3 className="yx-ts__notes-title">Comments this week</h3>
          {comments.length === 0 ? (
            <p className="yx-ts__muted">No comments yet. A comment you add under a day's hours shows here.</p>
          ) : (
            <ul className="yx-ts__notes-list">
              {comments.map(({ l, d, h, text }) => {
                const p = l.projectId ? byId.get(l.projectId) : undefined;
                return (
                  <li key={`${l.id}:${d}`}>
                    <span className="yx-ts__notes-meta">
                      {DAY[d]} {longDate(dates[d])} · {p ? `${p.code} · ${p.name}` : 'No project'} · {formatHours(h)} h
                    </span>
                    <span className="yx-ts__note-text">{text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
