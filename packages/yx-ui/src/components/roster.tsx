import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatDate, formatTime } from '../lib/format';
import { WEEKDAYS_SHORT, addDays, dayKey, daysBetween, daysFrom, isWeekend, startOfWeek } from '../lib/dates';
import { Button } from './button';
import { Badge } from './display';
import { InlineAlert } from './feedback';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './menu';

export interface Shift {
  /** Text code shown in every cell, e.g. "G" (§28: colour + code). */
  code: string;
  name: string;
  /** "HH:mm"; night shifts end the next day. Omit for off days. */
  start?: string;
  end?: string;
  /** Time shown on the chip only ("SB 6 pm" for standby); rest, hours and night checks ignore it. */
  displayStart?: string;
  /** Paid hours counted towards the weekly limit. */
  hours: number;
  /** Chart colour 1–8; omit for off days. */
  color?: number;
}

export const DEFAULT_SHIFTS: Shift[] = [
  { code: 'G', name: 'General', start: '09:00', end: '18:00', hours: 8, color: 1 },
  { code: 'M', name: 'Morning', start: '06:00', end: '14:00', hours: 8, color: 2 },
  { code: 'N', name: 'Night', start: '22:00', end: '06:00', hours: 8, color: 4 },
  { code: 'OFF', name: 'Weekly off', hours: 0 },
];

export interface RosterPerson {
  id: string;
  name: string;
  role?: string;
}

/** personId → shift code per day (index 0 = start date); null = not assigned. */
export type RosterValue = Record<string, (string | null)[]>;

/** Approved leave (M02); rostering a working shift on it is a conflict. */
export interface RosterLeave {
  personId: string;
  date: Date;
  /** Leave code, e.g. "CL". */
  code: string;
}

export type RosterConflictKind = 'rest' | 'hours' | 'leave' | 'consent';
export interface RosterConflict {
  personId: string;
  day: number;
  kind: RosterConflictKind;
  /** Short text for the cell badge. */
  short: string;
  message: string;
}

export interface RosterRules {
  /** Minimum rest between two shifts, hours. Default 11. */
  minRestHours?: number;
  /** Maximum rostered hours in a Monday–Sunday week. Default 48. */
  maxWeeklyHours?: number;
  /** People with written consent for night work (7 pm – 6 am). When given, a night shift for anyone else is a conflict. */
  nightConsent?: string[];
}

/** Conflicts that stop Publish; over-hours stays a warning. */
export const BLOCKING_CONFLICTS: RosterConflictKind[] = ['rest', 'leave', 'consent'];

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
/** Any part of the shift between 7 pm and 6 am. */
const isNight = (s: Shift) => {
  const a = toMin(s.start!);
  const b = toMin(s.end!);
  return b <= a || a < 6 * 60 || b > 19 * 60;
};
const shiftTime = (s: Shift) => (s.start && s.end ? `${formatTime(s.start)} – ${formatTime(s.end)}` : s.displayStart ? `from ${formatTime(s.displayStart)}` : '');
/** "8 Oct 2026": no leading zero. */
const longDate = (d: Date) => formatDate(d).replace(/^0/, '');
/** "Thu 8 Oct". */
const dayDate = (d: Date) => `${WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} ${longDate(d).replace(/ \d{4}$/, '')}`;
/** "5 – 11 Oct 2026", "28 Sep – 4 Oct 2026", "28 Dec 2026 – 3 Jan 2027". */
const weekTitle = (a: Date, b: Date) => {
  const [, ma, ya] = longDate(a).split(' ');
  const [, mb, yb] = longDate(b).split(' ');
  const left = ya !== yb ? longDate(a) : ma !== mb ? `${a.getDate()} ${ma}` : String(a.getDate());
  return `${left} – ${longDate(b)}`;
};

/** Rest gap, weekly hours and approved-leave conflicts (M02 §B2). Pure, so it runs on the server too. */
export function checkRoster(opts: {
  people: RosterPerson[];
  value: RosterValue;
  start: Date;
  days: number;
  shifts?: Shift[];
  leave?: RosterLeave[];
  rules?: RosterRules;
}): RosterConflict[] {
  const { people, value, start, days, shifts = DEFAULT_SHIFTS, leave = [], rules = {} } = opts;
  const minRest = rules.minRestHours ?? 11;
  const maxWeek = rules.maxWeeklyHours ?? 48;
  const byCode = new Map(shifts.map((s) => [s.code, s]));
  const leaveKeys = new Map(leave.map((l) => [`${l.personId}:${dayKey(l.date)}`, l.code]));
  const week0 = startOfWeek(start);
  const out: RosterConflict[] = [];

  for (const p of people) {
    const row = value[p.id] ?? [];
    const weekTotals = new Map<number, number>();
    const flaggedWeeks = new Set<number>();
    for (let i = 0; i < days; i++) {
      const s = row[i] ? byCode.get(row[i]!) : undefined;
      if (!s) continue;
      const date = addDays(start, i);
      const leaveCode = leaveKeys.get(`${p.id}:${dayKey(date)}`);
      if (rules.nightConsent && s.start && s.end && isNight(s) && !rules.nightConsent.includes(p.id))
        out.push({ personId: p.id, day: i, kind: 'consent', short: 'No night consent', message: `${p.name}, ${dayDate(date)}: rostered for ${s.name.toLowerCase()} shift without night-work consent` });
      if (leaveCode && s.hours > 0) out.push({ personId: p.id, day: i, kind: 'leave', short: `On leave · ${leaveCode}`, message: `${p.name}, ${dayDate(date)}: on approved leave (${leaveCode}) but rostered for ${s.name.toLowerCase()} shift` });

      const prev = i > 0 && row[i - 1] ? byCode.get(row[i - 1]!) : undefined;
      if (prev?.start && prev.end && s.start) {
        const prevEnd = toMin(prev.end) + (toMin(prev.end) <= toMin(prev.start) ? 1440 : 0);
        const rest = (1440 + toMin(s.start) - prevEnd) / 60;
        const at = (t: string) => formatTime(t).replace(':00', '');
        if (rest < minRest)
          out.push({
            personId: p.id,
            day: i,
            kind: 'rest',
            short: 'Rest gap',
            message:
              rest <= 0
                ? `${p.name}, ${dayDate(date)}: no rest. The ${prev.name.toLowerCase()} shift before ends at ${at(prev.end)} and this ${s.name.toLowerCase()} shift starts at ${at(s.start)} (needs ${minRest} h).`
                : `${p.name}, ${dayDate(date)}: only ${rest} h rest after the ${prev.name.toLowerCase()} shift (needs ${minRest} h)`,
          });
      }

      const w = Math.floor(daysBetween(week0, date) / 7);
      // Leave days are not worked, so they don't count towards the week.
      const total = (weekTotals.get(w) ?? 0) + (leaveCode ? 0 : s.hours);
      weekTotals.set(w, total);
      if (total > maxWeek && !flaggedWeeks.has(w)) {
        flaggedWeeks.add(w);
        out.push({ personId: p.id, day: i, kind: 'hours', short: `Over ${maxWeek} h`, message: `${p.name}: over ${maxWeek} h in the week of ${longDate(addDays(week0, w * 7))}` });
      }
    }
  }
  return out;
}

export type RosterStatus = 'draft' | 'published';

export interface RosterGridProps {
  people: RosterPerson[];
  start: Date;
  /** 7 for a week, 14 for a fortnight. */
  days?: number;
  shifts?: Shift[];
  value?: RosterValue;
  defaultValue?: RosterValue;
  onChange?: (value: RosterValue) => void;
  leave?: RosterLeave[];
  rules?: RosterRules;
  status?: RosterStatus;
  defaultStatus?: RosterStatus;
  /** Called after the manager confirms. Staff are notified by the caller. */
  onPublish?: (value: RosterValue) => void;
  /** Staff view of a published roster: no editing. */
  readOnly?: boolean;
  /** Skip the grid's own Draft / Published badge when the page header already shows the roster's status. */
  hideStatus?: boolean;
  /** Pre-selected cells, as [personId, dayIndex] (docs and screenshot tests). */
  defaultSelection?: [string, number][];
  /** Opens the assign menu (docs and screenshot tests). */
  defaultMenuOpen?: boolean;
  /** Marks this day's column ("Today" under the date), as the other roster screens do. */
  today?: Date;
}

type Cell = [number, number]; // [row, col]
const k = (r: number, c: number) => `${r}:${c}`;

/**
 * Shift roster (§28, M02 §B2): people × days, shift blocks with a text code. Assign by dragging from
 * the palette, or select cells (click, Shift+click, Ctrl+click, arrows + Shift, Space) and pick a shift
 * from the menu (Enter). Conflicts show in the cell and in a list. Publish comes before staff see it.
 */
export function RosterGrid({
  people,
  start,
  days = 7,
  shifts = DEFAULT_SHIFTS,
  value: valueProp,
  defaultValue = {},
  onChange,
  leave = [],
  rules,
  status: statusProp,
  defaultStatus = 'draft',
  onPublish,
  readOnly,
  hideStatus,
  defaultSelection = [],
  defaultMenuOpen = false,
  today,
}: RosterGridProps) {
  const [valueState, setValueState] = useState(defaultValue);
  const value = valueProp ?? valueState;
  const [baseline, setBaseline] = useState(value);
  const [statusState, setStatusState] = useState(defaultStatus);
  const status = statusProp ?? statusState;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultSelection.map(([pid, d]) => k(people.findIndex((p) => p.id === pid), d))),
  );
  const [focus, setFocus] = useState<Cell>(() => {
    const first = defaultSelection[0];
    return first ? [Math.max(0, people.findIndex((p) => p.id === first[0])), first[1]] : [0, 0];
  });
  const anchor = useRef<Cell>(focus);
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen);
  const fromGrid = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [announce, setAnnounce] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  const dates = daysFrom(start, days);
  const byCode = useMemo(() => new Map(shifts.map((s) => [s.code, s])), [shifts]);
  const leaveOn = useMemo(() => new Map(leave.map((l) => [`${l.personId}:${dayKey(l.date)}`, l.code])), [leave]);
  const conflicts = useMemo(() => checkRoster({ people, value, start, days, shifts, leave, rules }), [people, value, start, days, shifts, leave, rules]);
  const changes = people.reduce((n, p) => n + dates.filter((_, i) => (value[p.id]?.[i] ?? null) !== (baseline[p.id]?.[i] ?? null)).length, 0);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${k(...focus)}"]`)?.focus();
  }, [focus]);

  const commit = (next: RosterValue) => {
    setValueState(next);
    onChange?.(next);
    if (status === 'published') setStatusState('draft');
  };

  const assign = (code: string | null, cells: Cell[]) => {
    if (!cells.length) return;
    const next: RosterValue = { ...value };
    for (const [r, c] of cells) {
      const pid = people[r].id;
      const row = [...(next[pid] ?? Array(days).fill(null))];
      row[c] = code;
      next[pid] = row;
    }
    commit(next);
    const s = code ? byCode.get(code) : null;
    setAnnounce(`${s ? `${s.name} shift assigned` : 'Shift cleared'} for ${cells.length} ${cells.length === 1 ? 'cell' : 'cells'}`);
  };

  const selectedCells = (): Cell[] => [...selected].map((s) => s.split(':').map(Number) as Cell);
  const targets = (): Cell[] => (selected.size ? selectedCells() : [focus]);

  const rangeSet = (a: Cell, b: Cell) => {
    const s = new Set<string>();
    for (let r = Math.min(a[0], b[0]); r <= Math.max(a[0], b[0]); r++) for (let c = Math.min(a[1], b[1]); c <= Math.max(a[1], b[1]); c++) s.add(k(r, c));
    return s;
  };

  const onCellClick = (e: MouseEvent, cell: Cell) => {
    if (readOnly) return;
    setFocus(cell);
    if (e.shiftKey) setSelected(rangeSet(anchor.current, cell));
    else if (e.ctrlKey || e.metaKey) {
      const s = new Set(selected);
      if (s.has(k(...cell))) s.delete(k(...cell));
      else s.add(k(...cell));
      setSelected(s);
      anchor.current = cell;
    } else {
      setSelected(new Set([k(...cell)]));
      anchor.current = cell;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).getAttribute('role') !== 'gridcell') return;
    const [r, c] = focus;
    const moves: Record<string, Cell> = {
      ArrowUp: [Math.max(0, r - 1), c],
      ArrowDown: [Math.min(people.length - 1, r + 1), c],
      ArrowLeft: [r, Math.max(0, c - 1)],
      ArrowRight: [r, Math.min(days - 1, c + 1)],
      Home: [r, 0],
      End: [r, days - 1],
    };
    const to = moves[e.key];
    if (to) {
      e.preventDefault();
      moveFocus.current = true;
      setFocus(to);
      if (readOnly) return;
      if (e.shiftKey) setSelected(rangeSet(anchor.current, to));
      else if (!e.ctrlKey && !e.metaKey) {
        setSelected(new Set([k(...to)]));
        anchor.current = to;
      }
      return;
    }
    if (readOnly) return;
    if (e.key === ' ') {
      e.preventDefault();
      const s = new Set(selected);
      if (s.has(k(r, c))) s.delete(k(r, c));
      else s.add(k(r, c));
      setSelected(s);
      anchor.current = focus;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!selected.size) setSelected(new Set([k(r, c)]));
      fromGrid.current = true;
      setMenuOpen(true);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      assign(null, targets());
    }
  };

  const onDrop = (e: DragEvent, cell: Cell) => {
    e.preventDefault();
    const code = e.dataTransfer.getData('text/plain');
    if (!byCode.has(code)) return;
    assign(code, selected.has(k(...cell)) ? selectedCells() : [cell]);
  };

  const publish = () => {
    setBaseline(value);
    setStatusState('published');
    setConfirming(false);
    setAnnounce('Roster published');
    onPublish?.(value);
  };

  const blockedId = useId();
  const blocking = conflicts.filter((x) => BLOCKING_CONFLICTS.includes(x.kind));
  const goTo = (x: RosterConflict) => {
    const cell: Cell = [people.findIndex((p) => p.id === x.personId), x.day];
    setSelected(new Set([k(...cell)]));
    anchor.current = cell;
    moveFocus.current = true;
    setFocus(cell);
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${k(...cell)}"]`)?.focus();
  };
  const conflictAt = (pid: string, i: number) => conflicts.filter((x) => x.personId === pid && x.day === i);
  const title = weekTitle(dates[0], dates[dates.length - 1]);

  return (
    <section className="yx-roster" aria-label={`Shift roster, ${title}`} data-readonly={readOnly || undefined}>
      <div className="yx-roster__bar">
        <div className="yx-roster__head">
          <h2 className="yx-roster__title">{title}</h2>
          {!hideStatus && <Badge tone={status === 'published' ? 'success' : 'neutral'}>{status === 'published' ? 'Published' : 'Draft'}</Badge>}
          {!readOnly && changes > 0 && (
            <span className="yx-roster__changes">
              {changes} unsaved {changes === 1 ? 'change' : 'changes'}
            </span>
          )}
        </div>
        {!readOnly && !confirming && status === 'draft' && (
          <div className="yx-roster__publish">
            {blocking.length > 0 && (
              <span className="yx-roster__blocked" id={blockedId}>
                Fix {blocking.length} {blocking.length === 1 ? 'conflict' : 'conflicts'} to publish
              </span>
            )}
            <Button variant="primary" disabled={blocking.length > 0} aria-describedby={blocking.length ? blockedId : undefined} onClick={() => setConfirming(true)}>
              Publish roster
            </Button>
          </div>
        )}
      </div>

      {confirming && (
        <InlineAlert
          tone={conflicts.length ? 'warning' : 'info'}
          title={`Publish the roster for ${title}?`}
          actions={
            <>
              <Button variant="primary" size="sm" onClick={publish}>
                Publish roster
              </Button>
              <Button size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          }
        >
          Staff will see their shifts and get a notification.
          {conflicts.length > 0 && ` ${conflicts.length} ${conflicts.length === 1 ? 'warning is' : 'warnings are'} still open.`}
        </InlineAlert>
      )}

      {!readOnly && (
        <div className="yx-roster__tools">
          <div className="yx-roster__palette" role="group" aria-label="Shifts. Drag onto a cell, or select cells and click a shift">
            {shifts.map((s) => (
              <Button
                key={s.code}
                size="sm"
                className="yx-roster__pal"
                data-color={s.color}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', s.code);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => assign(s.code, targets())}
                aria-label={`Assign ${s.name} ${shiftTime(s)} to selected cells`}
              >
                <span className="yx-roster__code">{s.code}</span> {s.name}
              </Button>
            ))}
          </div>
          <Menu
            open={menuOpen}
            onOpenChange={(o) => {
              setMenuOpen(o);
              if (!o) setTimeout(() => (fromGrid.current = false));
            }}
          >
            <MenuTrigger asChild>
              <Button size="sm" icon={ChevronDown}>
                Assign shift{selected.size > 1 ? ` (${selected.size} cells)` : ''}
              </Button>
            </MenuTrigger>
            <MenuContent
              align="end"
              onCloseAutoFocus={(e) => {
                if (!fromGrid.current) return;
                e.preventDefault();
                gridRef.current?.querySelector<HTMLElement>(`[data-cell="${k(...focus)}"]`)?.focus();
              }}
            >
              <MenuLabel>
                {selected.size ? `${selected.size} ${selected.size === 1 ? 'cell' : 'cells'} selected` : 'Assign to the focused cell'}
              </MenuLabel>
              {shifts.map((s) => (
                <MenuItem key={s.code} onSelect={() => assign(s.code, targets())} shortcut={s.code}>
                  {s.name}
                  {s.start && <span className="yx-roster__menu-time"> {shiftTime(s)}</span>}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onSelect={() => assign(null, targets())}>Clear shift</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      )}

      <p className="yx-roster__sr" aria-live="polite">
        {announce}
      </p>

      <div className="yx-roster__scroll">
        <div
          ref={gridRef}
          role="grid"
          aria-label={`Roster ${title}`}
          aria-multiselectable={!readOnly || undefined}
          aria-readonly={readOnly || undefined}
          className="yx-roster__grid"
          style={{ ['--yx-roster-days' as string]: days }}
          onKeyDown={onKeyDown}
        >
          <div role="row" className="yx-roster__row yx-roster__row--head">
            <span role="columnheader" className="yx-roster__person">
              Person
            </span>
            {dates.map((d) => (
              <span key={dayKey(d)} role="columnheader" className="yx-roster__day" data-weekend={isWeekend(d) || undefined} data-today={(today && dayKey(d) === dayKey(today)) || undefined}>
                <span>{WEEKDAYS_SHORT[(d.getDay() + 6) % 7]}</span> <span className="yx-roster__dn">{d.getDate()}</span>
                {today && dayKey(d) === dayKey(today) && <span className="yx-roster__today">Today</span>}
              </span>
            ))}
            <span role="columnheader" className="yx-roster__total">
              Hours
            </span>
          </div>
          {people.map((p, r) => {
            // Leave days are not worked hours.
            const hours = dates.reduce((n, d, i) => {
              const code = value[p.id]?.[i];
              return n + (code && !leaveOn.has(`${p.id}:${dayKey(d)}`) ? (byCode.get(code)?.hours ?? 0) : 0);
            }, 0);
            const personConflicts = conflicts.filter((x) => x.personId === p.id);
            return (
              <div key={p.id} role="row" className="yx-roster__row">
                <span role="rowheader" className="yx-roster__person">
                  <span className="yx-roster__name">{p.name}</span>
                  {p.role && <span className="yx-roster__role">{p.role}</span>}
                </span>
                {dates.map((d, c) => {
                  const code = value[p.id]?.[c] ?? null;
                  const s = code ? byCode.get(code) : undefined;
                  const leaveCode = leaveOn.get(`${p.id}:${dayKey(d)}`);
                  const here = conflictAt(p.id, c);
                  const focused = focus[0] === r && focus[1] === c;
                  const label = [
                    `${p.name}, ${WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} ${formatDate(d)}`,
                    s ? `${s.name}${s.start ? ` ${shiftTime(s)}` : ''}` : 'no shift',
                    leaveCode && `on leave (${leaveCode})`,
                    ...here.map((x) => `warning: ${x.short}`),
                  ]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <div
                      key={c}
                      role="gridcell"
                      data-cell={k(r, c)}
                      className="yx-roster__cell"
                      tabIndex={focused ? 0 : -1}
                      aria-selected={readOnly ? undefined : selected.has(k(r, c))}
                      aria-label={label}
                      data-weekend={isWeekend(d) || undefined}
                      data-conflict={here.length > 0 || undefined}
                      onClick={(e) => onCellClick(e, [r, c])}
                      onDragOver={readOnly ? undefined : (e) => e.preventDefault()}
                      onDrop={readOnly ? undefined : (e) => onDrop(e, [r, c])}
                    >
                      {/* Day label for the phone card layout (the column header carries it on wider screens). */}
                      <span className="yx-roster__cday" aria-hidden="true">{WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} {d.getDate()}</span>
                      {s ? (
                        <span className="yx-roster__block" data-color={s.color} data-off={!s.color || undefined} aria-hidden="true">
                          <span className="yx-roster__code">{s.code}</span>
                          {(s.displayStart ?? s.start) && <span className="yx-roster__time">{formatTime((s.displayStart ?? s.start)!).replace(':00', '')}</span>}
                        </span>
                      ) : (
                        // A leave day with no shift: a neutral block like a weekly off.
                        leaveCode && (
                          <span className="yx-roster__block" data-off data-leave aria-hidden="true" title={`Leave · ${leaveCode}`}>
                            <span className="yx-roster__leave-pre">Leave · </span>{leaveCode}
                          </span>
                        )
                      )}
                      {/* A leave conflict already says "On leave · EL" in one amber badge: no second leave tag. */}
                      {s && leaveCode && !here.some((x) => x.kind === 'leave') && (
                        <span className="yx-roster__leave" aria-hidden="true" title={`On leave · ${leaveCode}`}>
                          {/* Narrow grids drop the "Leave · " prefix so the badge stays on one line. */}
                          <Badge tone="neutral"><span className="yx-roster__leave-pre">Leave · </span>{leaveCode}</Badge>
                        </span>
                      )}
                      {here.map((x) => (
                        <span key={x.kind} className="yx-roster__warn" data-kind={x.kind} aria-hidden="true" title={x.short}>
                          {/* Narrow grids show only the leave code ("EL"); the title keeps the full text. */}
                          {x.kind === 'leave' && leaveCode ? <><span className="yx-roster__leave-pre">On leave · </span>{leaveCode}</> : x.short}
                        </span>
                      ))}
                    </div>
                  );
                })}
                <span role="gridcell" className="yx-roster__total" data-over={personConflicts.some((x) => x.kind === 'hours') || undefined}>
                  {hours} h
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {!readOnly && conflicts.length > 0 && (
        <InlineAlert tone="warning" title={`${conflicts.length} ${conflicts.length === 1 ? 'warning' : 'warnings'} to check before you publish`}>
          <ul className="yx-roster__conflicts">
            {conflicts.map((x) => (
              <li key={`${x.personId}-${x.day}-${x.kind}`} className="yx-roster__conflict">
                <span>{x.message}</span>
                <span className="yx-roster__conflict-actions">
                  {/* On approved leave: the direct fix is to take the shift off that day. */}
                  {x.kind === 'leave' && (
                    <Button size="sm" onClick={() => assign(null, [[people.findIndex((p) => p.id === x.personId), x.day]])}>
                      Clear shift
                    </Button>
                  )}
                  <Button size="sm" onClick={() => goTo(x)}>
                    Go to cell
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}

      {!readOnly && (
        <p className="yx-roster__hint">
          Select cells with click, Shift+click or the arrow keys, then press Enter to pick a shift. Delete clears a shift.
        </p>
      )}
    </section>
  );
}
