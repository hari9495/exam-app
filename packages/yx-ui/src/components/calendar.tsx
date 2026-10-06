import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { formatDate } from '../lib/format';
import {
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  dayKey,
  dayTitle,
  daysFrom,
  findHoliday,
  isSameDay,
  layoutOverlaps,
  minutesOfDay,
  monthGrid,
  monthTitle,
  rangeTitle,
  startOfDay,
  startOfWeek,
  timeOf,
  weekdayLong,
  type Holiday,
} from '../lib/dates';
import { Button, ButtonGroup, IconButton } from './button';
import { VisuallyHidden } from './foundations';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Tooltip } from './tooltip';
import { Select } from './select';

export type CalendarEventType = 'leave' | 'holiday' | 'interview' | 'exam' | 'meeting';
export const EVENT_TYPE_LABEL: Record<CalendarEventType, string> = {
  leave: 'Leave',
  holiday: 'Holiday',
  interview: 'Interview',
  exam: 'Exam',
  meeting: 'Meeting',
};

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  /** For all-day events: the last day (inclusive). */
  end: Date;
  allDay?: boolean;
  type: CalendarEventType;
  /** Not approved yet: the chip is dashed (no text suffix to be cut off) and its name says "pending approval". */
  pending?: boolean;
}

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';
const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'agenda', label: 'Agenda' },
];

/** Time axis of week and day views (§28): 8 am to 8 pm. */
const AXIS_START = 8 * 60;
const AXIS_END = 20 * 60;
const AXIS_HOURS = Array.from({ length: (AXIS_END - AXIS_START) / 60 }, (_, i) => 8 + i);

function occursOn(e: CalendarEvent, d: Date): boolean {
  const day = startOfDay(d);
  if (e.allDay) return startOfDay(e.start) <= day && day <= startOfDay(e.end);
  return e.start < addDays(day, 1) && e.end > day;
}
const byStart = (a: CalendarEvent, b: CalendarEvent) => Number(!!b.allDay) - Number(!!a.allDay) || a.start.getTime() - b.start.getTime();
const whenText = (e: CalendarEvent) => (e.allDay ? 'All day' : `${timeOf(e.start)} – ${timeOf(e.end)}`);
const eventLabel = (e: CalendarEvent) => `${EVENT_TYPE_LABEL[e.type]}: ${e.title}${e.pending ? ', pending approval' : ''}, ${whenText(e)}`;

export interface CalendarProps {
  events: CalendarEvent[];
  /** Holidays for the viewer's work location; shaded and named. */
  holidays?: Holiday[];
  view?: CalendarView;
  defaultView?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  /** The focused day; the visible month / week / day follows it. */
  date?: Date;
  defaultDate?: Date;
  onDateChange?: (date: Date) => void;
  /** Today and the current-time line. Defaults to now. */
  today?: Date;
  onEventClick?: (event: CalendarEvent) => void;
  /** Enter on a month day, or a day header click. The calendar also switches to the day view. */
  onDayOpen?: (date: Date) => void;
  /** Events shown in a month cell before "+N more". */
  maxPerDay?: number;
  /** Opens the "+N more" list for this day (docs and screenshot tests). */
  defaultMoreOpen?: Date;
  /** Drop the visible type word on chips ("Leave") when every event is the same type. Still in the accessible name. */
  hideTypeLabel?: boolean;
  /** Days shaded as off in the month, week and day views. Default: Sundays plus the 2nd and 4th Saturdays. */
  weeklyOff?: (d: Date) => boolean;
  /**
   * The month shown first when it differs from the focused day, e.g. focus today (29 Sep) but show October, where the
   * upcoming events are. Moving to another day or month moves it.
   */
  month?: Date;
  /** Views offered (default all four). With one view the switch is hidden and opening a day doesn't change the view. */
  views?: CalendarView[];
  'aria-label'?: string;
}

/** Month, week, day and agenda views for leave, holidays, interviews and exams (§28). */
export function Calendar({
  events,
  holidays,
  view: viewProp,
  defaultView = 'month',
  onViewChange,
  date: dateProp,
  defaultDate,
  onDateChange,
  today: todayProp,
  onEventClick,
  onDayOpen,
  maxPerDay = 3,
  defaultMoreOpen,
  hideTypeLabel,
  weeklyOff = defaultWeeklyOff,
  month: monthProp,
  views,
  'aria-label': ariaLabel = 'Calendar',
}: CalendarProps) {
  const offered = VIEWS.filter((v) => !views || views.includes(v.value));
  const today = useMemo(() => todayProp ?? new Date(), [todayProp]);
  const [viewState, setViewState] = useState(defaultView);
  const [dateState, setDateState] = useState(() => startOfDay(defaultDate ?? today));
  const view = viewProp ?? viewState;
  const date = dateProp ? startOfDay(dateProp) : dateState;
  // The month on screen: `month` until the person moves, then it follows the focused day.
  const [shownMonth, setShownMonth] = useState<Date | null>(monthProp ? startOfDay(monthProp) : null);
  const visible = shownMonth ?? date;
  const setView = (v: CalendarView) => {
    setViewState(v);
    onViewChange?.(v);
  };
  const setDate = (d: Date) => {
    setShownMonth(null);
    setDateState(startOfDay(d));
    onDateChange?.(startOfDay(d));
  };
  const openDay = (d: Date) => {
    setDate(d);
    if (offered.some((v) => v.value === 'day')) setView('day');
    onDayOpen?.(d);
  };

  const sorted = useMemo(() => [...events].sort(byStart), [events]);
  const eventsOn = (d: Date) => sorted.filter((e) => occursOn(e, d));

  const step = (dir: 1 | -1) => {
    if (view === 'month' || view === 'agenda') setDate(shownMonth ? addMonths(new Date(visible.getFullYear(), visible.getMonth(), 1), dir) : addMonths(date, dir));
    else setDate(addDays(date, view === 'week' ? 7 * dir : dir));
  };
  const unit = view === 'week' ? 'week' : view === 'day' ? 'day' : 'month';
  const weekStart = startOfWeek(date);
  const title =
    view === 'week' ? rangeTitle(weekStart, addDays(weekStart, 6)) : view === 'day' ? `${weekdayLong(date)}, ${formatDate(date)}` : monthTitle(visible);

  const ctx: ViewCtx = { date, visible, today, holidays, eventsOn, onEventClick, openDay, setDate, maxPerDay, defaultMoreOpen, hideTypeLabel, weeklyOff };

  return (
    <section className="yx-cal" aria-label={ariaLabel} data-view={view}>
      <div className="yx-cal__bar">
        <div className="yx-cal__nav">
          <Button onClick={() => setDate(today)}>Today</Button>
          <IconButton variant="secondary" icon={ChevronLeft} label={`Previous ${unit}`} onClick={() => step(-1)} />
          <IconButton variant="secondary" icon={ChevronRight} label={`Next ${unit}`} onClick={() => step(1)} />
          <h2 className="yx-cal__title" aria-live="polite">
            {title}
          </h2>
        </div>
        {offered.length > 1 && (
          <ButtonGroup aria-label="Calendar view">
            {offered.map((v) => (
              <Button key={v.value} size="sm" aria-pressed={view === v.value} onClick={() => setView(v.value)}>
                {v.label}
              </Button>
            ))}
          </ButtonGroup>
        )}
      </div>
      {view === 'month' && <MonthView {...ctx} />}
      {view === 'week' && <TimeGrid {...ctx} days={daysFrom(weekStart, 7)} />}
      {view === 'day' && <TimeGrid {...ctx} days={[date]} />}
      {view === 'agenda' && <AgendaView {...ctx} />}
    </section>
  );
}

interface ViewCtx {
  date: Date;
  /** The month on screen (usually the focused day's). */
  visible: Date;
  weeklyOff: (d: Date) => boolean;
  today: Date;
  holidays?: Holiday[];
  eventsOn: (d: Date) => CalendarEvent[];
  onEventClick?: (e: CalendarEvent) => void;
  openDay: (d: Date) => void;
  setDate: (d: Date) => void;
  maxPerDay: number;
  defaultMoreOpen?: Date;
  hideTypeLabel?: boolean;
}

function Marker({ type }: { type: CalendarEventType }) {
  return <span className="yx-cal__marker" data-type={type} aria-hidden="true" />;
}

function EventChip({ e, onClick, tabbable = true, showTime = true, hideType }: { e: CalendarEvent; onClick?: (e: CalendarEvent) => void; tabbable?: boolean; showTime?: boolean; hideType?: boolean }) {
  return (
    <button
      type="button"
      className="yx-cal__chip"
      data-type={e.type}
      data-pending={e.pending || undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-label={eventLabel(e)}
      title={eventLabel(e)}
      onClick={(ev) => {
        ev.stopPropagation();
        onClick?.(e);
      }}
    >
      <Marker type={e.type} />
      <span className="yx-cal__chip-text">
        {!hideType && <span className="yx-cal__chip-type">{EVENT_TYPE_LABEL[e.type]}</span>}
        {showTime && !e.allDay && <span className="yx-cal__chip-time">{timeOf(e.start)}</span>}
        <span className="yx-cal__chip-title">{e.title}</span>
      </span>
    </button>
  );
}

const MOVES: Record<string, (d: Date) => Date> = {
  ArrowLeft: (d) => addDays(d, -1),
  ArrowRight: (d) => addDays(d, 1),
  ArrowUp: (d) => addDays(d, -7),
  ArrowDown: (d) => addDays(d, 7),
  Home: (d) => startOfWeek(d),
  End: (d) => addDays(startOfWeek(d), 6),
  PageUp: (d) => new Date(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), 28)),
  PageDown: (d) => new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), 28)),
};

function MonthView({ date, visible, weeklyOff, today, holidays, eventsOn, onEventClick, openDay, setDate, maxPerDay, defaultMoreOpen, hideTypeLabel }: ViewCtx) {
  const weeks = monthGrid(visible.getFullYear(), visible.getMonth());
  const [moreOpen, setMoreOpen] = useState<string | null>(defaultMoreOpen ? dayKey(defaultMoreOpen) : null);
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${dayKey(date)}"]`)?.focus();
  }, [date]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).getAttribute('role') !== 'gridcell') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDay(date);
      return;
    }
    const move = MOVES[e.key];
    if (!move) return;
    e.preventDefault();
    moveFocus.current = true;
    setDate(move(date));
  };

  const selected = eventsOn(date);
  const selectedHoliday = findHoliday(holidays, date);

  return (
    <>
      <div className="yx-cal__month" role="grid" aria-label={monthTitle(visible)} ref={gridRef} onKeyDown={onKeyDown}>
        <div role="row" className="yx-cal__week yx-cal__week--head">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} role="columnheader" className="yx-cal__colhead">
              {w}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={dayKey(week[0])} role="row" className="yx-cal__week">
            {week.map((d) => {
              const key = dayKey(d);
              const list = eventsOn(d);
              const holiday = findHoliday(holidays, d);
              const focused = isSameDay(d, date);
              const overflow = list.length > maxPerDay;
              const shown = overflow ? list.slice(0, maxPerDay - 1) : list;
              const label = [dayTitle(d), isSameDay(d, today) && 'today', holiday && `${holiday.name} (holiday)`, list.length ? `${list.length} ${list.length === 1 ? 'event' : 'events'}` : 'no events']
                .filter(Boolean)
                .join(', ');
              return (
                <div
                  key={key}
                  role="gridcell"
                  data-day={key}
                  className="yx-cal__day"
                  tabIndex={focused ? 0 : -1}
                  aria-selected={focused}
                  aria-label={label}
                  data-outside={d.getMonth() !== visible.getMonth() || undefined}
                  data-today={isSameDay(d, today) || undefined}
                  data-weekend={weeklyOff(d) || undefined}
                  data-holiday={holiday ? true : undefined}
                  onClick={() => setDate(d)}
                >
                  <span className="yx-cal__daynum" aria-hidden="true">
                    {d.getDate()}
                    {isSameDay(d, today) && <span className="yx-cal__today-tag">Today</span>}
                  </span>
                  {holiday && (
                    <span className="yx-cal__holiday" aria-hidden="true">
                      {holiday.name}
                    </span>
                  )}
                  <span className="yx-cal__events">
                    {shown.map((e) => (
                      <EventChip key={e.id} e={e} onClick={onEventClick} tabbable={focused} hideType={hideTypeLabel} />
                    ))}
                    {overflow && (
                      <Popover open={moreOpen === key} onOpenChange={(o) => setMoreOpen(o ? key : null)}>
                        <PopoverTrigger asChild>
                          <button type="button" className="yx-cal__more" tabIndex={focused ? 0 : -1} onClick={(ev) => ev.stopPropagation()}>
                            +{list.length - shown.length} more
                            <VisuallyHidden> on {dayTitle(d)}</VisuallyHidden>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="yx-cal__more-pop" aria-label={`Events on ${dayTitle(d)}`}>
                          <p className="yx-cal__more-title">{dayTitle(d)}</p>
                          <ul className="yx-cal__list">
                            {list.map((e) => (
                              <li key={e.id}>
                                <EventChip e={e} onClick={onEventClick} hideType={hideTypeLabel} />
                              </li>
                            ))}
                          </ul>
                        </PopoverContent>
                      </Popover>
                    )}
                  </span>
                  {list.length > 0 && (
                    <span className="yx-cal__dots" aria-hidden="true">
                      {list.slice(0, 4).map((e) => (
                        <Marker key={e.id} type={e.type} />
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {/* Mobile (§37): the grid shows dots only; the selected day's events are listed here. */}
      <div className="yx-cal__daylist" aria-live="polite">
        <p className="yx-cal__more-title">
          {dayTitle(date)}
          {selectedHoliday && ` · ${selectedHoliday.name}`}
        </p>
        {selected.length ? (
          <ul className="yx-cal__list">
            {selected.map((e) => (
              <li key={e.id}>
                <EventChip e={e} onClick={onEventClick} hideType={hideTypeLabel} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="yx-cal__empty">No events on this day.</p>
        )}
      </div>
    </>
  );
}

function TimeGrid({ days, today, holidays, eventsOn, onEventClick, openDay, hideTypeLabel, weeklyOff }: ViewCtx & { days: Date[] }) {
  const nowMin = minutesOfDay(today);
  return (
    <div className="yx-cal__tg" data-days={days.length} style={{ ['--yx-cal-days' as string]: days.length }}>
      <div className="yx-cal__tg-row yx-cal__tg-head">
        <span className="yx-cal__tg-corner" />
        {days.map((d) => (
          <div key={dayKey(d)} className="yx-cal__tg-dayhead" data-today={isSameDay(d, today) || undefined} data-weekend={weeklyOff(d) || undefined}>
            {days.length > 1 ? (
              <button type="button" className="yx-cal__tg-open" onClick={() => openDay(d)} aria-label={`Open ${dayTitle(d)}`}>
                <span>{WEEKDAYS_SHORT[(d.getDay() + 6) % 7]}</span>
                <span className="yx-cal__tg-date">{d.getDate()}</span>
              </button>
            ) : (
              <span>{dayTitle(d)}</span>
            )}
            {isSameDay(d, today) && <span className="yx-cal__today-tag">Today</span>}
          </div>
        ))}
      </div>
      <div className="yx-cal__tg-row yx-cal__tg-allday">
        <span className="yx-cal__tg-axislabel">All day</span>
        {days.map((d) => {
          const holiday = findHoliday(holidays, d);
          return (
            <div key={dayKey(d)} className="yx-cal__tg-alldaycell" data-holiday={holiday ? true : undefined}>
              {holiday && <span className="yx-cal__holiday">{holiday.name}</span>}
              {eventsOn(d)
                .filter((e) => e.allDay)
                .map((e) => (
                  <EventChip key={e.id} e={e} onClick={onEventClick} hideType={hideTypeLabel} />
                ))}
            </div>
          );
        })}
      </div>
      <div className="yx-cal__tg-row yx-cal__tg-body">
        <div className="yx-cal__tg-axis" aria-hidden="true">
          {AXIS_HOURS.map((h) => (
            <span key={h} className="yx-cal__tg-hour">
              {h % 12 === 0 ? 12 : h % 12} {h < 12 ? 'am' : 'pm'}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const timed = eventsOn(d).filter((e) => !e.allDay);
          const dayStart = startOfDay(d);
          const clip = (t: Date) => Math.min(AXIS_END, Math.max(AXIS_START, t < dayStart ? 0 : t >= addDays(dayStart, 1) ? 1440 : minutesOfDay(t)));
          const layout = layoutOverlaps(timed.map((e) => ({ id: e.id, start: e.start, end: e.end })));
          return (
            <div key={dayKey(d)} className="yx-cal__tg-col" data-holiday={findHoliday(holidays, d) ? true : undefined} data-weekend={weeklyOff(d) || undefined}>
              {AXIS_HOURS.map((h) => (
                <span key={h} className="yx-cal__tg-slot" />
              ))}
              {timed.map((e) => {
                const top = clip(e.start);
                const bottom = clip(e.end);
                if (bottom <= top) return null;
                const { col, cols } = layout.get(e.id) ?? { col: 0, cols: 1 };
                const span = AXIS_END - AXIS_START;
                return (
                  <button
                    key={e.id}
                    type="button"
                    className="yx-cal__tg-event"
                    data-type={e.type}
                    aria-label={eventLabel(e)}
                    style={{
                      top: `${((top - AXIS_START) / span) * 100}%`,
                      height: `${((bottom - top) / span) * 100}%`,
                      left: `${(col / cols) * 100}%`,
                      width: `${100 / cols}%`,
                    }}
                    onClick={() => onEventClick?.(e)}
                  >
                    <span className="yx-cal__tg-event-time">
                      <Marker type={e.type} />
                      {hideTypeLabel ? timeOf(e.start) : `${EVENT_TYPE_LABEL[e.type]} · ${timeOf(e.start)}`}
                    </span>
                    <span className="yx-cal__chip-title">{e.title}</span>
                  </button>
                );
              })}
              {isSameDay(d, today) && nowMin >= AXIS_START && nowMin <= AXIS_END && (
                <span className="yx-cal__now" style={{ top: `${((nowMin - AXIS_START) / (AXIS_END - AXIS_START)) * 100}%` }}>
                  <VisuallyHidden>Current time {timeOf(today)}</VisuallyHidden>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({ visible, today, holidays, eventsOn, onEventClick, hideTypeLabel }: ViewCtx) {
  const days = daysFrom(new Date(visible.getFullYear(), visible.getMonth(), 1), new Date(visible.getFullYear(), visible.getMonth() + 1, 0).getDate())
    .map((d) => ({ d, list: eventsOn(d), holiday: findHoliday(holidays, d) }))
    .filter((x) => x.list.length || x.holiday);
  if (!days.length) return <p className="yx-cal__empty">No events in {monthTitle(visible)}.</p>;
  return (
    <ol className="yx-cal__agenda">
      {days.map(({ d, list, holiday }) => (
        <li key={dayKey(d)} className="yx-cal__agenda-day" data-holiday={holiday ? true : undefined}>
          <h3 className="yx-cal__agenda-date">
            {dayTitle(d)}
            {isSameDay(d, today) && <span className="yx-cal__today-tag">Today</span>}
            {holiday && <span className="yx-cal__holiday">Holiday: {holiday.name}</span>}
          </h3>
          <ul className="yx-cal__list">
            {list.map((e) => (
              <li key={e.id} className="yx-cal__agenda-row">
                <span className="yx-cal__agenda-time">{whenText(e)}</span>
                <EventChip e={e} onClick={onEventClick} showTime={false} hideType={hideTypeLabel} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- Team calendar ---------------- */

/** Leave codes shown in cells; the full name goes in the tooltip and accessible name (M02). */
export const LEAVE_TYPES: Record<string, string> = {
  CL: 'Casual leave',
  EL: 'Earned leave',
  SL: 'Sick leave',
  CO: 'Compensatory off',
  ML: 'Maternity leave',
  LOP: 'Leave without pay',
  OD: 'On duty',
};

export interface TeamMember {
  id: string;
  name: string;
  team: string;
}

export interface TeamAbsence {
  memberId: string;
  start: Date;
  /** Last day, inclusive. */
  end: Date;
  /** Leave code, e.g. "CL". */
  code: string;
  /** Full name when the code is not in LEAVE_TYPES. */
  name?: string;
  /** Not approved yet: dashed chip with a "Pending" marker. */
  pending?: boolean;
}

/** Sundays plus the 2nd and 4th Saturdays (the usual Indian office pattern). */
export const defaultWeeklyOff = (d: Date) => d.getDay() === 0 || (d.getDay() === 6 && [2, 4].includes(Math.ceil(d.getDate() / 7)));

export interface TeamCalendarProps {
  members: TeamMember[];
  absences: TeamAbsence[];
  holidays?: Holiday[];
  /** First day shown. */
  start: Date;
  /** 14 for a fortnight, or the month's length. */
  days?: number;
  today?: Date;
  /** Fixed team: hides the team picker. */
  team?: string;
  defaultTeam?: string;
  onTeamChange?: (team: string) => void;
  /** Company weekly off days, shaded and labelled "Off". Defaults to Sundays plus 2nd and 4th Saturdays. */
  weeklyOff?: (d: Date) => boolean;
  /** Per-person off days (shift patterns, other locations). Overrides weeklyOff for that person's row. */
  memberOff?: (memberId: string, d: Date) => boolean;
}

const ALL = 'all';

/** Who is away: people × days, leave as a code chip with its full name (§28). */
export function TeamCalendar({ members, absences, holidays, start, days = 14, today: todayProp, team: teamProp, defaultTeam = ALL, onTeamChange, weeklyOff = defaultWeeklyOff, memberOff }: TeamCalendarProps) {
  const today = useMemo(() => startOfDay(todayProp ?? new Date()), [todayProp]);
  const [teamState, setTeamState] = useState(defaultTeam);
  const team = teamProp ?? teamState;
  const teams = [...new Set(members.map((m) => m.team))].sort();
  const shown = members.filter((m) => team === ALL || m.team === team);
  const oneTeam = new Set(shown.map((m) => m.team)).size <= 1;
  const cols = daysFrom(start, days);
  const absenceOn = (id: string, d: Date) => absences.find((a) => a.memberId === id && startOfDay(a.start) <= d && d <= startOfDay(a.end));
  const awayToday = shown.filter((m) => absenceOn(m.id, today));
  const shownHolidays = (holidays ?? []).filter((h) => cols.some((c) => isSameDay(c, h.date)));
  const anyPending = absences.some((a) => a.pending);

  return (
    <section className="yx-teamcal" aria-label="Team calendar">
      <div className="yx-teamcal__bar">
        <div>
          <h2 className="yx-cal__title">{rangeTitle(cols[0], cols[cols.length - 1])}</h2>
          <p className="yx-teamcal__summary" aria-live="polite">
            {awayToday.length} away today
            {awayToday.length > 0 && <span className="yx-teamcal__names">: {awayToday.map((m) => m.name).join(', ')}</span>}
          </p>
        </div>
        {teamProp === undefined && teams.length > 1 && (
          <Select
            aria-label="Team"
            size="sm"
            value={team}
            onChange={(v) => {
              const next = v ?? ALL;
              setTeamState(next);
              onTeamChange?.(next);
            }}
            options={[{ value: ALL, label: 'All teams' }, ...teams.map((t) => ({ value: t, label: t }))]}
          />
        )}
      </div>
      <div className="yx-teamcal__scroll">
        <table className="yx-teamcal__table">
          <caption className="yx-teamcal__caption">Who is away, {rangeTitle(cols[0], cols[cols.length - 1])}</caption>
          <thead>
            <tr>
              <th scope="col" className="yx-teamcal__person">
                Person
              </th>
              {cols.map((d) => {
                const holiday = findHoliday(holidays, d);
                const off = weeklyOff(d);
                return (
                  <th
                    key={dayKey(d)}
                    scope="col"
                    className="yx-teamcal__day"
                    data-weekend={off || undefined}
                    data-holiday={holiday ? true : undefined}
                    data-today={isSameDay(d, today) || undefined}
                    aria-label={[dayTitle(d), holiday?.name, !holiday && off && 'weekly off', isSameDay(d, today) && 'today'].filter(Boolean).join(', ')}
                  >
                    <span className="yx-teamcal__wd">{WEEKDAYS_SHORT[(d.getDay() + 6) % 7].slice(0, 2)}</span>
                    <span className="yx-teamcal__dn">{d.getDate()}</span>
                    {holiday ? <span className="yx-teamcal__flag">Hol</span> : off && <span className="yx-teamcal__flag yx-teamcal__flag--off">Off</span>}
                    {isSameDay(d, today) && <span className="yx-teamcal__flag">Today</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id}>
                <th scope="row" className="yx-teamcal__person">
                  <span className="yx-teamcal__name">{m.name}</span>
                  {!oneTeam && <span className="yx-teamcal__team">{m.team}</span>}
                </th>
                {cols.map((d) => {
                  const a = absenceOn(m.id, d);
                  const name = a ? `${a.name ?? LEAVE_TYPES[a.code] ?? a.code}${a.pending ? ' · pending approval' : ''}` : '';
                  const off = memberOff ? memberOff(m.id, d) : weeklyOff(d);
                  return (
                    <td
                      key={dayKey(d)}
                      className="yx-teamcal__cell"
                      data-weekend={off || undefined}
                      data-holiday={findHoliday(holidays, d) ? true : undefined}
                      data-today={isSameDay(d, today) || undefined}
                    >
                      {a ? (
                        <Tooltip content={name}>
                          <span className="yx-teamcal__chip" data-code={a.code} data-pending={a.pending || undefined} tabIndex={0} aria-label={`${m.name}, ${dayTitle(d)}: ${name}`}>
                            {a.code}
                            {a.pending && <Clock3 className="yx-teamcal__pending" size={10} aria-hidden="true" />}
                          </span>
                        </Tooltip>
                      ) : (
                        memberOff && off && <span className="yx-teamcal__off">Off</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="yx-teamcal__legend" aria-label="Legend">
        <li><span className="yx-teamcal__chip" aria-hidden="true">CL</span>Approved</li>
        {anyPending && (
          <li>
            <span className="yx-teamcal__chip" data-pending aria-hidden="true">CL<Clock3 className="yx-teamcal__pending" size={10} /></span>Pending
          </li>
        )}
        <li><span className="yx-teamcal__swatch" aria-hidden="true" />Holiday (Hol) or weekly off (Off)</li>
      </ul>
      {shownHolidays.length > 0 && (
        <p className="yx-teamcal__holidays">
          Holidays: {shownHolidays.map((h) => `${formatDate(h.date).slice(0, -5)} ${h.name}`).join(' · ')}
        </p>
      )}
    </section>
  );
}

