// Attendance: web clock-in page, attendance calendar, Today board, muster, day card, exceptions.
// TIM-01, TIM-02, TIM-03, TIM-04 + founder extras "My attendance today" and "Attendance calendar".
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bell, ChevronLeft, ChevronRight, Download, Lock, Snowflake } from 'lucide-react';
import { DesktopFrame, PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { BottomSheet, ConfirmDialog, Dialog, TypeToConfirmDialog } from '../../components/overlay';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar } from '../../components/filters';
import { RadioGroup } from '../../components/choice';
import { TextArea, TimeField } from '../../components/inputs';
import { FormField } from '../../components/field';
import { PersonPicker } from '../../components/select';
import { DatePicker } from '../../components/date';
import { formatDate } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import {
  AUGUST,
  DAY_10_PUNCHES,
  DAY_21_PUNCHES,
  DAY_22_PUNCHES,
  EXCEPTIONS,
  FIELD_DAY,
  GENERAL_SHIFT,
  HR_ADMIN,
  LATE_PAYROLL,
  LEAVE_REQUESTS,
  LOCATIONS,
  ME,
  NOW_MIN,
  OT_ROWS,
  SEPTEMBER,
  STATUS_LABEL,
  TEAM,
  TODAY,
  TODAY_PUNCHES,
  balancesFor,
  isMyReport,
  myReports,
  teamOffDuring,
  timeCounts,
  workingDaysText,
  type ExceptionRow,
  type TeamPerson,
  type TimeUser,
} from './time-data';
import { AttendanceLegend, AttendanceMonth, ClockCard, DayCardBody, DueBadge, GeoMap, Kpis, SOURCE_LABEL, TimePage, codeText, type ClockCardProps, type DayCardBodyProps } from './time-kit';
import { DAY_CODE_LABEL, daysUntil, fmt12, fmtDuration, lateMinutes, monthSummary, relativeDue, toHHMM, toMin, type AttendanceDay, type ClockState, type DayCode, type Punch } from './time-logic';
import { VISITS } from '../ops/visitors-data';
import './time.css';

export type ViewState = 'ready' | 'loading' | 'error' | 'empty';
export type Persona = 'emp' | 'mgr' | 'hr';

export function LoadingBlock({ rows = 6 }: { rows?: number }) {
  return (
    <div className="yx-tim-stack" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} />)}
    </div>
  );
}

/* =====================================================================
   Shared data: each person's month and punches (keyed by person + full date)
   ===================================================================== */

const SEP_1 = new Date(2026, 8, 1);
const SEP_CUTOFF = new Date(2026, 8, 30);
const sameDay = (a: Date, b: Date) => daysUntil(a, b) === 0;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "22 Sep" (fixed month names: the en-IN locale gives "Sept"). */
const shortDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const firstName = (name: string) => name.split(' ')[0];
const userFor = (persona: Persona): TimeUser => (persona === 'hr' ? HR_ADMIN : ME);
/** Keep "9:00 am" on one line. */
const nbspTime = (s: string) => s.replace(/(\d) (am|pm)\b/g, '$1 $2');

/** Links to other screens' stories (same pattern as roster.tsx). */
const storyHref = (id: string, args?: string) => `/?path=/story/${id}${args ? `&args=${args}` : ''}`;
const STORY = {
  exceptionsHr: 'screens-time-tim-04-·-attendance-exceptions--hr',
  exceptionsMgr: 'screens-time-tim-04-·-attendance-exceptions--manager',
  muster: 'screens-time-tim-02-·-muster--open',
  roster: 'screens-time-tim-05-·-roster--draft',
  fieldMgr: 'screens-time-tim-32-·-field-force-map--manager',
  fieldHr: 'screens-time-tim-32-·-field-force-map--hr',
  people: 'screens-people-ppl-01-·-directory--hr-employees',
  leaveReview: 'screens-time-tim-19-·-leave-request-detail--manager',
};
function LinkButton({ to, args, size, children }: { to: string; args?: string; size?: 'sm'; children: ReactNode }) {
  return <Button size={size} asChild><a href={storyHref(to, args)} target="_top">{children}</a></Button>;
}

/** Saves rows as a CSV file in the browser. */
function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Story state with a working Retry: error → loading → ready. */
function useViewState(initial: ViewState) {
  const [st, setSt] = useState(initial);
  useEffect(() => setSt(initial), [initial]);
  const retry = () => { setSt('loading'); window.setTimeout(() => setSt('ready'), 800); };
  return [st, retry] as const;
}

/** Hosur plant morning shift (4-on / 2-off roster) for Operations; Quality lab staff at Hosur work a 9:00 am day shift. */
const PLANT_SHIFT = { code: 'M', name: 'Morning', start: '06:00', end: '14:00', graceMin: 10 };
const HOSUR_DAY_SHIFT = { code: 'D', name: 'Day', start: '09:00', end: '18:00', graceMin: 10 };
const teamOf = (person: string) => TEAM.find((t) => t.name === person);
/** On the plant's 4-on / 2-off roster. */
const onRoster = (person: string) => teamOf(person)?.dept === 'Operations';
/** Works at the Hosur plant: no WFH, gate reader punches. */
const isPlant = (person: string) => teamOf(person)?.location === 'Hosur plant';
const shiftFor = (person: string) => (onRoster(person) ? PLANT_SHIFT : isPlant(person) ? HOSUR_DAY_SHIFT : GENERAL_SHIFT);
/** Where each plant worker sits in the 6-day cycle (Rekha is off today; Kavitha's 26 Sep OT was on a working day, as the OT review says). */
const PLANT_OFFSET: Record<string, number> = { 'Rekha Balan': 0, 'Kavitha Sundaram': 2, 'Anil Kumar': 2 };
/** Days with overtime claimed take their OT, status and check-out from the OT review (OT_ROWS). */
const OT_STATUS: Record<string, AttendanceDay['otStatus']> = { Pending: 'pending', Approved: 'approved', 'Comp-off': 'comp-off' };

type PDay = AttendanceDay & { inAt?: string; outAt?: string };
/** Days that other screens already state (OT review, today board): everything else is generated plainly. */
const PERSON_DAYS: Record<string, Record<number, Partial<PDay> & { code: DayCode }>> = {
  // Earned leave 1–3 Sep and unpaid leave 7–8 Sep, as the leave adjustments say (ops.tsx); 10 Sep is late mark 1 of 3.
  'Meera Krishnan': {
    1: { code: 'EL' },
    2: { code: 'EL' },
    3: { code: 'EL' },
    7: { code: 'LOP' },
    8: { code: 'LOP' },
    10: { code: 'L', lateMin: 18 },
    17: { code: 'P', otMin: 105, otStatus: 'comp-off', note: 'Overtime taken as comp-off' },
    23: { code: 'L', lateMin: 35 },
  },
  'Arun Prakash': { 14: { code: 'H', otMin: 360, otStatus: 'pending', workedMin: 360, inAt: '09:00', note: 'Vinayaka Chaturthi · worked' } },
  'Rahul Deshpande': { 23: { code: 'P', otMin: 60, otStatus: 'approved' } },
  'Sanjay Rao': { 29: { code: 'CL', note: 'Casual leave · approved' } },
};

/** A person's month. Divya's is the shared data; reports get theirs from the roster, PERSON_DAYS and the open exceptions. */
export function monthFor(person: string, month: 'aug' | 'sep' = 'sep', resolved = false): PDay[] {
  const base = month === 'sep' ? SEPTEMBER : AUGUST;
  // Resolved: HR approved every open exception and pending request, so those days count as present.
  if (person === ME.name) return resolved ? base.map((d) => (['MP', 'A', 'R'].includes(d.code) ? { date: d.date, code: 'P', note: 'Exception resolved by HR' } : d)) : base;
  const roster = onRoster(person);
  const plant = isPlant(person);
  const off = PLANT_OFFSET[person] ?? 0;
  const seed = person.length;
  const overrides = month === 'sep' ? PERSON_DAYS[person] ?? {} : {};
  const t = teamOf(person);
  return base.map((b, i) => {
    const n = i + 1;
    let day: PDay = { date: b.date, code: b.code };
    if (b.code !== 'FUT' && b.code !== 'H') {
      const k = (((daysUntil(b.date, SEP_1) + off) % 6) + 6) % 6;
      const working = roster ? k < 4 : b.code !== 'WO';
      const r = (i * 7 + seed * 13) % 23;
      day.code = !working ? 'WO' : b.code === 'TODAY' ? 'TODAY' : r === 1 && !PERSON_DAYS[person] ? 'L' : r === 11 && !plant ? 'WFH' : 'P';
      if (day.code === 'L') day.lateMin = 20;
      // Today's late check-in (Today board) counts as a late mark too.
      if (day.code === 'TODAY' && t?.status === 'late' && t.inAt) day.lateMin = lateMinutes(shiftFor(person).start, t.inAt, 0);
    }
    if (overrides[n]) day = { ...day, ...overrides[n] };
    const ot = month === 'sep' ? OT_ROWS.find((o) => o.person === person && sameDay(o.date, b.date) && o.status !== 'Rejected') : undefined;
    if (ot) day = { ...day, otMin: ot.otMin, otStatus: OT_STATUS[ot.status], outAt: ot.out };
    // Open exceptions decide the day (TIM-04 and the muster always agree).
    const x = resolved ? undefined : EXCEPTIONS.find((e) => e.person === person && sameDay(e.date, b.date) && e.status !== 'Resolved');
    if (x) {
      const detail = plainDetail(x.detail);
      day = {
        date: b.date,
        code: x.status === 'Request pending' ? 'R' : /check-out|offline/i.test(x.kind) ? 'MP' : 'A',
        note: x.kind === 'Missing check-out' ? detail : `${x.kind} · ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`,
      };
    }
    return day;
  });
}

/** Punches for one person's day, keyed by person and full date (21 Aug is not 21 Sep). */
export function punchesFor(day: PDay, person: string = ME.name): Punch[] {
  const n = day.date.getDate();
  const t = TEAM.find((p) => p.name === person);
  if (person === ME.name && day.date.getMonth() === 8) {
    if (n === 10) return DAY_10_PUNCHES;
    if (n === 21) return DAY_21_PUNCHES;
    if (n === 22) return DAY_22_PUNCHES;
  }
  if (day.code === 'TODAY') {
    if (person === ME.name) return TODAY_PUNCHES;
    return t?.inAt ? [{ id: `${person}-t`, kind: 'in', time: t.inAt, source: t.source ?? 'mobile', where: t.location, distanceM: 0, verdict: t.source === 'field' ? 'field' : 'inside' }] : [];
  }
  const worked = !!day.workedMin || !!day.otMin;
  if (day.code === 'FUT' || day.code === 'A' || day.code === 'LOP' || ['WO', 'H', 'CL', 'EL', 'SL'].includes(day.code) && !worked) return [];
  const shift = shiftFor(person);
  const start = toMin(shift.start);
  // The exception for this day already states the check-in ("In 9:29 am (kiosk), no out"): use it.
  const xIn = recordedIn(person, day.date);
  const inAt = xIn?.time ?? day.inAt ?? (day.lateMin ? toHHMM(start + day.lateMin) : ['WO', 'H'].includes(day.code) ? shift.start : toHHMM(start - 10 + (n % 10)));
  const out = day.outAt ?? (
    day.code === 'HD'
      ? '13:45'
      : ['WO', 'H'].includes(day.code)
        ? toHHMM(toMin(inAt) + (day.workedMin ?? 0) + ((day.workedMin ?? 0) > 300 ? 30 : 0))
        : toHHMM(toMin(shift.end) + (day.otMin ?? 0) + (day.otMin ? 0 : (n % 7) * 2)));
  const home = day.code === 'WFH';
  const site = person === ME.name ? 'Chennai office' : t?.location ?? 'Chennai office';
  const src: Punch['source'] = home ? 'web' : xIn?.source ?? (isPlant(person) ? 'biometric' : n % 3 === 0 ? 'biometric' : 'mobile');
  const where = home ? 'Home · IP 49.207.x.x' : src === 'biometric' ? `${site} · Gate 1 reader` : src === 'kiosk' ? `${site} · Reception kiosk` : site;
  const punch = (id: string, kind: Punch['kind'], time: string, d: number): Punch => ({ id: `${n}${id}`, kind, time, source: src, where, distanceM: home ? undefined : d, verdict: home ? 'field' : 'inside' });
  return day.code === 'MP' ? [punch('a', 'in', inAt, 0)] : [punch('a', 'in', inAt, 0), punch('b', 'out', out, 30)];
}

/** Check-in time and source stated by an exception's detail, e.g. "In 9:29 am (kiosk), no out". */
function recordedIn(person: string, date: Date): { time: string; source?: Punch['source'] } | null {
  const x = EXCEPTIONS.find((e) => e.person === person && sameDay(e.date, date));
  // Reads both the stored form ("In 9:29 am (kiosk)") and the plain one ("Checked in 9:29 am at the kiosk").
  const m = x?.detail.match(/\b(?:In|Checked in) (\d{1,2}):(\d{2})[  ](am|pm)(?: \((\w+)\)| at the (\w+))?/);
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0);
  const src = (m[4] ?? m[5]) as Punch['source'] | undefined;
  return { time: `${String(h).padStart(2, '0')}:${m[2]}`, source: src && src in SOURCE_LABEL ? src : undefined };
}

/** Exception details in plain words (the stored details read like log lines). */
const plainDetail = (s: string) =>
  nbspTime(
    s
      .replace(/^In (\d{1,2}:\d{2} [ap]m) \((\w+)\), no out$/, 'Checked in $1 at the $2; no check-out')
      .replace(/^Saved offline (\d+) hours ago; only (\d+) hours allowed$/, 'Synced $1 hours after the punch; the limit is $2 hours')
      .replace(/^Outside (.+), (\d+ m) away · (\d{1,2}:\d{2} [ap]m)$/, '$3 · $2 outside $1')
      .replace(/^Week of .+ not submitted$/, 'Not submitted'),
  );
/** "check‑out" with a non-breaking hyphen, so a narrow column never splits it. */
const nbHyphen = (s: string) => s.replace(/-/g, '‑');
/** Stacked cell content in a table: no row flex-basis (it turns into height in phone cards). */
const CELL = { flex: '0 1 auto' } as const;
/** Drawer footer hint: the shared phone rule's 100% flex-basis became full height in the stacked (column) footer and pushed the buttons off the right edge. */
const FOOT_HINT = { flexBasis: 'auto' } as const;
/** Monday of the week a date falls in (timesheet exceptions cover a week). */
const weekStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
/** "18 Sep", or "week of 14 Sep" for a timesheet row. */
const rowDate = (r: ExceptionRow) => (r.mode === 'Timesheet' ? `week of ${shortDate(weekStart(r.date))}` : shortDate(r.date));
/** Who approves a pending request: Divya's manager for her own, else the person's line manager. */
const approverOf = (r: ExceptionRow) => (r.person === ME.name ? ME.manager : teamOf(r.person)?.reportsTo ?? ME.name);

/** What was recorded on a day (for the regularise drawer): first in and last out. */
function recordedFor(date: Date): { in?: string; out?: string } {
  const ps = sameDay(date, TODAY) ? TODAY_PUNCHES : (() => {
    const d = [...SEPTEMBER, ...AUGUST].find((x) => sameDay(x.date, date));
    return d ? punchesFor(d) : [];
  })();
  return { in: ps.find((p) => p.kind === 'in')?.time, out: [...ps].reverse().find((p) => p.kind === 'out')?.time };
}

function useNarrow(query = '(max-width: 599px)') {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const f = () => setNarrow(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [query]);
  return narrow;
}

/* =====================================================================
   Regularise (from the clock page, the calendar and the day card)
   ===================================================================== */

type FixKind = 'in' | 'out' | 'wrong' | 'full';
/** Reason examples that fit the fix being asked for. */
const REASON_EXAMPLE: Record<FixKind, string> = {
  in: "For example: reached at 9:25 am, the clock-in page didn't load",
  out: 'For example: left at 6:35 pm, forgot to clock out',
  wrong: 'For example: clocked in late because the office Wi-Fi was down',
  full: 'For example: worked at the Chennai office all day, forgot to clock in and out',
};

function RegulariseDrawer({ date, kind, onClose, onSent, today, used }: { date: Date | null; kind: FixKind; onClose: () => void; onSent: (d: Date) => void; /** Today's punches as the clock page has them. */ today?: { in?: string; out?: string }; /** Regularisations already used this month. */ used: number }) {
  const [day, setDay] = useState<Date | null>(date);
  const isToday = !!day && sameDay(day, TODAY);
  const rec = day ? (isToday && today ? today : recordedFor(day)) : {};
  // Today, while still clocked in, there is no check-out to fix yet.
  const inProgress = isToday && !rec.out;
  const [picked, setHow] = useState<FixKind>(kind);
  // A recorded punch can't be "missed": those options are hidden, and a hidden pick falls back to a wrong time.
  const how: FixKind = (inProgress && (picked === 'out' || picked === 'full')) || (picked === 'in' && rec.in) || (picked === 'out' && rec.out) ? 'wrong' : picked;
  const [inT, setInT] = useState<string | null>(null);
  const [outT, setOutT] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const needIn = how === 'in' || how === 'full' || how === 'wrong';
  const needOut = !inProgress && (how === 'out' || how === 'full' || how === 'wrong');
  const timesOk = how === 'wrong' ? !!(inT || (needOut && outT)) : (!needIn || !!inT) && (!needOut || !!outT);
  const missing = !day ? 'Choose the date.' : !timesOk ? 'Enter the actual time.' : !reason.trim() ? 'Add a reason.' : null;
  const was = (t?: string) => (t ? fmt12(t) : 'none');
  const change = [inT && `in ${was(rec.in)} → ${fmt12(inT)}`, needOut && outT && `out ${was(rec.out)} → ${fmt12(outT)}`].filter(Boolean).join(', ');
  const recordedText = `Recorded: ${rec.in ? `in ${fmt12(rec.in)}` : 'no check-in'} · ${rec.out ? `out ${fmt12(rec.out)}` : inProgress ? 'still clocked in' : 'no check-out'}`;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Regularise a day"
      subtitle={`Attendance request · goes to ${ME.manager}`}
      footer={
        <>
          {missing && <span className="yx-tim-muted" style={FOOT_HINT}>{missing}</span>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!missing} onClick={() => day && onSent(day)}>Send request</Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        <FormField label="Date" required>
          <DatePicker value={day} onChange={setDay} max={TODAY} />
        </FormField>
        {day && <p className="yx-tim-muted">{recordedText}</p>}
        <FormField label="What needs fixing" required>
          <RadioGroup
            aria-label="What needs fixing"
            value={how}
            onChange={(v) => setHow(v as FixKind)}
            options={[
              ...(rec.in ? [] : [{ value: 'in', label: 'Missed check-in' }]),
              ...(inProgress || rec.out ? [] : [{ value: 'out', label: 'Missed check-out' }]),
              { value: 'wrong', label: inProgress ? 'Wrong check-in time' : 'Wrong time recorded' },
              ...(inProgress ? [] : [{ value: 'full', label: 'Full day (forgot to punch)' }]),
            ]}
          />
        </FormField>
        {needIn && (
          <FormField label="Actual check-in" required={how !== 'wrong' || !needOut}>
            {/* A neutral example: the recorded time as placeholder looked like a value already entered. */}
            <TimeField value={inT} onChange={setInT} placeholder="e.g. 9:25 am" />
          </FormField>
        )}
        {needOut && (
          <FormField label="Actual check-out" required={how !== 'wrong'}>
            <TimeField value={outT} onChange={setOutT} placeholder="e.g. 6:35 pm" />
          </FormField>
        )}
        <FormField label="Reason" required>
          <TextArea value={reason} onChange={setReason} rows={3} placeholder={REASON_EXAMPLE[how]} />
        </FormField>
        {day && change && (
          <InlineAlert tone="info" title="What changes">
            {shortDate(day)}: {change}. It counts once {ME.manager} approves. This is regularisation {used + 1} of 4 this month.
          </InlineAlert>
        )}
      </div>
    </Drawer>
  );
}

/** Opens the regularise drawer for a date and remembers the "sent" message. */
function useRegularise(initial?: { date: Date | null; kind: FixKind }, today?: { in?: string; out?: string }) {
  const [req, setReq] = useState<{ date: Date | null; kind: FixKind; n: number } | null>(initial ? { ...initial, n: 0 } : null);
  const [sent, setSent] = useState('');
  // Days with a request sent here: they leave the "to fix" lists and count towards the monthly limit.
  const [sentDays, setSentDays] = useState<Date[]>([]);
  const isSent = (d: Date) => sentDays.some((x) => sameDay(x, d));
  /** No date: the person picks the day in the drawer. */
  const open = (date: Date | null, kind: FixKind) => setReq({ date, kind, n: (req?.n ?? 0) + 1 });
  // One regularisation was used earlier this month (fixtures).
  const used = 1 + sentDays.length;
  const node = (
    <>
      {req && (
        <RegulariseDrawer
          key={req.n}
          date={req.date}
          kind={req.kind}
          today={today}
          used={used}
          onClose={() => setReq(null)}
          onSent={(d) => {
            setReq(null);
            if (!isSent(d)) setSentDays([...sentDays, d]);
            setSent(`Request for ${shortDate(d)} sent to ${ME.manager}.`);
          }}
        />
      )}
      {sent && <div className="yx-tim-sr" role="status">{sent}</div>}
    </>
  );
  const alert = sent ? <InlineAlert tone="success" title="Request sent">{sent}</InlineAlert> : null;
  return { open, node, alert, isSent, used };
}

const fixKindFor = (d: AttendanceDay): FixKind => (d.code === 'A' ? 'full' : d.code === 'MP' ? 'out' : 'wrong');

/* =====================================================================
   Day card with working buttons (TIM-03): used by the calendar, muster, day card pages
   ===================================================================== */

function exceptionFor(person: string, day: AttendanceDay): ExceptionRow {
  return (
    EXCEPTIONS.find((x) => x.person === person && sameDay(x.date, day.date)) ?? {
      id: `tmp-${person}-${day.date.getTime()}`,
      person,
      code: person === ME.name ? ME.code : TEAM.find((t) => t.name === person)?.code ?? '',
      date: day.date,
      kind: day.code === 'A' ? 'No attendance' : 'Missing check-out',
      detail: day.note ?? '',
      mode: 'Punch',
      nudged: 0,
      status: 'Open',
      blocking: true,
    }
  );
}

function DayPanel({ day, person, viewer, locked, monthDays, onRegularise }: { day: PDay; person: string; viewer: Persona; locked?: boolean; monthDays: AttendanceDay[]; onRegularise?: (d: Date, kind: FixKind) => void }) {
  const [msg, setMsg] = useState('');
  const [resolve, setResolve] = useState<ExceptionRow[] | null>(null);
  const [request, setRequest] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [ot, setOt] = useState(false);
  const [otReject, setOtReject] = useState(false);
  const [compOff, setCompOff] = useState(false);
  // What was just done here, so the card stops offering the same action.
  const [outcome, setOutcome] = useState<NonNullable<DayCardBodyProps['outcome']>>({});
  const done = (o: Partial<NonNullable<DayCardBodyProps['outcome']>>, text: string) => { setOutcome((x) => ({ ...x, ...o })); setMsg(text); };
  const first = firstName(person);
  return (
    <div className="yx-tim-stack">
      {msg && <InlineAlert tone="success" title={msg} />}
      <DayCardBody
        day={day}
        punches={punchesFor(day, person)}
        shift={shiftFor(person)}
        locked={locked}
        viewer={viewer}
        person={person}
        monthDays={monthDays}
        onFix={viewer === 'emp' ? () => onRegularise?.(day.date, fixKindFor(day)) : viewer === 'mgr' ? () => setMsg(`Nudge sent to ${first}`) : () => setResolve([exceptionFor(person, day)])}
        onRemind={() => setMsg(`Reminder sent to ${first}`)}
        onViewRequest={() => setRequest(true)}
        onWithdraw={() => setWithdraw(true)}
        onReviewOvertime={() => setOt(true)}
        onRejectOvertime={() => setOtReject(true)}
        onCompOff={() => setCompOff(true)}
        outcome={outcome}
      />
      <ResolveDialog key={resolve?.map((r) => r.id).join()} rows={resolve} onClose={() => setResolve(null)} onResolved={() => done({ exception: 'resolved' }, 'Exception resolved')} />
      <RequestDialog row={request ? exceptionFor(person, day) : null} viewer={viewer} onClose={() => setRequest(false)} onDone={setMsg} onWithdraw={() => { setRequest(false); setWithdraw(true); }} />
      <ConfirmDialog
        open={withdraw}
        onOpenChange={setWithdraw}
        title={`Withdraw the request for ${shortDate(day.date)}?`}
        consequence={`${ME.manager} won't see it any more. The day goes back to the recorded punches until you send a new request.`}
        confirmLabel="Withdraw request"
        onConfirm={() => { setWithdraw(false); done({ request: 'withdrawn' }, 'Request withdrawn'); }}
      />
      <ConfirmDialog
        open={ot}
        onOpenChange={setOt}
        title={`Approve ${fmtDuration(day.otMin ?? 0)} overtime for ${first}, ${shortDate(day.date)}?`}
        consequence={`It's paid in the ${locked ? LATE_PAYROLL : day.date.toLocaleDateString('en-IN', { month: 'long' })} payroll at the overtime rate.`}
        confirmLabel="Approve overtime"
        confirmVariant="approve"
        onConfirm={() => { setOt(false); done({ ot: 'approved' }, 'Overtime approved'); }}
      />
      <ConfirmDialog
        open={otReject}
        onOpenChange={setOtReject}
        title={`Reject ${fmtDuration(day.otMin ?? 0)} overtime for ${first}, ${shortDate(day.date)}?`}
        consequence={`It isn't paid and no comp-off is credited. ${first} is told it was rejected.`}
        confirmLabel="Reject overtime"
        onConfirm={() => { setOtReject(false); done({ ot: 'rejected' }, 'Overtime rejected'); }}
      />
      <ConfirmDialog
        open={compOff}
        onOpenChange={setCompOff}
        title={`Give ${first} ${fmtDuration(day.otMin ?? 0)} comp-off for ${shortDate(day.date)}?`}
        consequence={`${first} gets comp-off to use later; the hours are not paid as overtime.`}
        confirmLabel="Give comp-off"
        onConfirm={() => { setCompOff(false); done({ ot: 'comp-off' }, 'Comp-off credited'); }}
      />
    </div>
  );
}

/** A pending attendance request: the employee views or withdraws it; manager / HR review it. */
function RequestDialog({ row, viewer, onClose, onDone, onWithdraw }: { row: ExceptionRow | null; viewer: Persona; onClose: () => void; /** `decided` = approved or rejected (not just a reminder). */ onDone: (msg: string, decided?: boolean) => void; onWithdraw?: () => void }) {
  // Requested time and reason come from the row (optional fields until every request carries them).
  const req = row as (ExceptionRow & { requested?: string; reason?: string }) | null;
  const approver = !row ? '' : row.person === ME.name ? ME.manager : teamOf(row.person)?.reportsTo ?? ME.name;
  // HR sees a request that is waiting for the line manager: read-only, with a reminder.
  const hrWatching = viewer === 'hr' && approver !== HR_ADMIN.name;
  return (
    <Dialog
      open={!!row}
      onOpenChange={(o) => !o && onClose()}
      title={row ? `Attendance request · ${row.person}, ${shortDate(row.date)}` : ''}
      description={row ? `${row.kind}: ${plainDetail(row.detail)}` : undefined}
      size="md"
      footer={
        viewer === 'emp' ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button onClick={onWithdraw}>Withdraw</Button>
          </>
        ) : hrWatching ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button icon={Bell} onClick={() => { onClose(); onDone(`Reminder sent to ${approver}`); }}>Remind {firstName(approver)}</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="danger" onClick={() => { onClose(); onDone('Request rejected', true); }}>Reject</Button>
            <Button variant="approve" onClick={() => { onClose(); onDone('Request approved', true); }}>Approve</Button>
          </>
        )
      }
    >
      <ul className="yx-tim-list">
        {req?.requested && <li><span>Asked for</span><span className="yx-tim-muted">{req.requested}</span></li>}
        {req?.reason && <li><span>Reason</span><span className="yx-tim-muted">{req.reason}</span></li>}
        <li><span>Waiting for</span><span className="yx-tim-muted">{approver}</span></li>
      </ul>
      {hrWatching && <p className="yx-tim-muted">{approver} approves this request. You can remind them.</p>}
    </Dialog>
  );
}

/* =====================================================================
   Extra 1 · My attendance today (web clock-in / clock-out page)
   ===================================================================== */

export interface MyAttendanceTodayProps {
  clock?: Partial<ClockCardProps>;
  /** Show the regularise sheet (TIM-07) as opened from the card. */
  regulariseOpen?: boolean;
}

/** Mon 28 Sep – Sat 3 Oct (1st Saturday is a working day at the Chennai office; 2 Oct is a holiday). */
const WEEK: { date: Date; code: DayCode; note?: string }[] = [
  { date: new Date(2026, 8, 28), code: 'P' },
  { date: new Date(2026, 8, 29), code: 'TODAY' },
  { date: new Date(2026, 8, 30), code: 'FUT' },
  { date: new Date(2026, 9, 1), code: 'FUT' },
  { date: new Date(2026, 9, 2), code: 'H', note: 'Gandhi Jayanti' },
  { date: new Date(2026, 9, 3), code: 'FUT' },
];

export function MyAttendanceTodayScreen({ clock, regulariseOpen = false }: MyAttendanceTodayProps) {
  const startPunches = clock?.defaultPunches ?? TODAY_PUNCHES;
  const nowHHMM = toHHMM(clock?.now ?? NOW_MIN);
  const [cs, setCs] = useState<ClockState>(clock?.defaultState ?? 'working');
  const [times, setTimes] = useState({ in: startPunches.find((p) => p.kind === 'in')?.time, out: [...startPunches].reverse().find((p) => p.kind === 'out')?.time });
  const reg = useRegularise(regulariseOpen ? { date: TODAY, kind: 'wrong' } : undefined, times);
  const state = clock?.state ?? cs;
  const late = times.in ? lateMinutes(GENERAL_SHIFT.start, times.in, GENERAL_SHIFT.graceMin) : 0;
  const todayText =
    state === 'not_in' ? 'Not in yet' : state === 'out' && times.in ? `${fmt12(times.in)} – ${fmt12(times.out ?? nowHHMM)}` : times.in ? `In ${fmt12(times.in)}${late ? ` · late by ${late} min` : ''}` : 'Working';
  const perDay = toMin(GENERAL_SHIFT.end) - toMin(GENERAL_SHIFT.start) - 30;
  const workingDays = WEEK.filter((d) => d.code !== 'H' && d.code !== 'WO').length;
  const latesBefore = SEPTEMBER.filter((d) => (d.lateMin ?? 0) > 0 && daysUntil(d.date, TODAY) < 0).length;
  const lates = latesBefore + (late ? 1 : 0);
  const mon = punchesFor(SEPTEMBER[27]);
  const toFix = SEPTEMBER.filter((d) => (d.code === 'MP' || d.code === 'A') && !reg.isSent(d.date));
  return (
    <TimePage active="My attendance">
      <PageHeader
        title="My attendance today"
        description="Clock in and out from your desk. Your company allows web clock-in from the Chennai office network."
        // Today has its own Regularise button on the card; this one is for any other day, picked in the drawer.
        actions={<Button onClick={() => reg.open(null, 'wrong')}>Regularise another day</Button>}
      />
      {reg.alert}
      <div className="yx-tim-grid">
        <div data-span="8">
          <ClockCard
            variant="page"
            now={NOW_MIN}
            seconds={15}
            date={TODAY}
            shift={GENERAL_SHIFT}
            defaultState="working"
            defaultPunches={TODAY_PUNCHES}
            onRegularise={() => reg.open(TODAY, 'wrong')}
            {...clock}
            // "Check again" and "Ask HR to approve" show their feedback inside the card, next to the button.
            onStateChange={(s) => {
              setCs(s);
              if (s === 'working' && !times.in) setTimes({ ...times, in: nowHHMM });
              if (s === 'out') setTimes({ ...times, out: nowHHMM });
              clock?.onStateChange?.(s);
            }}
          />
        </div>
        <div data-span="4" className="yx-tim-stack">
          {toFix.length > 0 && (
            <InlineAlert
              tone="danger"
              title={<span className="yx-tim-row">{`${toFix.length} ${toFix.length === 1 ? 'day needs' : 'days need'} fixing before payroll closes on ${shortDate(SEP_CUTOFF)}`}<DueBadge date={SEP_CUTOFF} /></span>}
              actions={toFix.map((d) => <Button key={d.date.getTime()} size="sm" onClick={() => reg.open(d.date, fixKindFor(d))}>Fix {shortDate(d.date)}</Button>)}
            >
              {toFix.map((d) => `${shortDate(d.date)}: ${DAY_CODE_LABEL[d.code].toLowerCase()}`).join(' · ')}
            </InlineAlert>
          )}
          <Card title="This week">
            <ul className="yx-tim-list">
              {WEEK.map((d) => {
                const label = `${d.date.toLocaleDateString('en-IN', { weekday: 'short' })} ${shortDate(d.date)}`;
                const text = d.code === 'TODAY' ? todayText : d.code === 'P' ? `Present · ${fmt12(mon[0].time)} – ${fmt12(mon[1].time)}` : d.code === 'H' ? `Holiday · ${d.note}` : 'General shift';
                return (
                  <li key={label}>
                    <span>{label}</span>
                    <span className={d.code === 'FUT' ? 'yx-tim-muted' : undefined}>{text}</span>
                  </li>
                );
              })}
            </ul>
            <p className="yx-tim-note">{fmtDuration(workingDays * perDay)} expected this week ({workingDays} working days)</p>
          </Card>
          <Card title="Your rules">
            <ul className="yx-tim-list">
              <li><span>Web clock-in</span><span className="yx-tim-muted">Chennai office Wi-Fi only</span></li>
              <li><span>Grace</span><span className="yx-tim-muted">{GENERAL_SHIFT.graceMin} min after {fmt12(GENERAL_SHIFT.start)}</span></li>
              <li>
                <span>Late marks</span>
                {lates < 3 ? (
                  <span className="yx-tim-muted">{lates} of 3 free used this month</span>
                ) : (
                  // Short badge; the consequence sits under it as plain text.
                  <span className="yx-tim-list__main">
                    <span><Badge tone={lates === 3 ? 'warning' : 'danger'}>{lates === 3 ? '3 of 3 free used' : `${lates} this month`}</Badge></span>
                    <span className="yx-tim-muted">{lates === 3 ? 'Next late costs ½ day of earned leave' : '½ day of earned leave per late over 3'}</span>
                  </span>
                )}
              </li>
              <li><span>Break</span><span className="yx-tim-muted">30 min unpaid above 5 h</span></li>
              <li><span>Regularisations</span><span className="yx-tim-muted">{reg.used} of 4 used this month</span></li>
            </ul>
          </Card>
        </div>
      </div>
      {reg.node}
    </TimePage>
  );
}

/** Home with the ClockCard widget (T1). */
export function HomeClockScreen({ clock }: { clock?: Partial<ClockCardProps> }) {
  const reg = useRegularise();
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={[{ items: [{ label: 'My home', active: true }, { label: 'Team home' }] }]}>
      <PageHeader title={`Good morning, ${firstName(ME.name)}`} description="Tuesday, 29 Sep 2026" />
      {reg.alert}
      <div className="yx-tim-grid">
        <div data-span="6">
          <ClockCard now={NOW_MIN} seconds={15} date={TODAY} shift={GENERAL_SHIFT} onRegularise={() => reg.open(TODAY, 'wrong')} {...clock} />
        </div>
        <div data-span="6" className="yx-tim-stack">
          <Card title="Needs your action">
            <ul className="yx-tim-list">
              {reg.isSent(SEPTEMBER[9].date)
                ? <li><span className="yx-tim-list__main"><strong>10 Sep · request sent</strong><span className="yx-tim-muted">Waiting for {ME.manager}</span></span></li>
                : <li><span className="yx-tim-list__main"><strong>Fix 10 Sep</strong><span className="yx-tim-muted">Missing check-out · blocks payroll</span></span><Button size="sm" onClick={() => reg.open(SEPTEMBER[9].date, 'out')}>Fix</Button></li>}
              {/* The team's pending leave, with the same overlap fact TIM-19 shows. */}
              {LEAVE_REQUESTS.filter((r) => r.id === 'lr3' && r.status === 'Pending').map((r) => {
                const off = teamOffDuring(r.person, r.from, r.to).length;
                const facts = [off === 0 ? 'no one else off' : `${off} other${off === 1 ? '' : 's'} off`, r.cert === 'pending' ? 'certificate pending' : ''].filter(Boolean).join(' · ');
                return <li key={r.id}><span className="yx-tim-list__main"><strong>{r.person} · {r.type} {workingDaysText(r.person, r.from, r.to)}</strong><span className="yx-tim-muted">{facts}</span></span><Button variant="review" size="sm" asChild><a href={storyHref(STORY.leaveReview)} target="_top">Review</a></Button></li>;
              })}
            </ul>
          </Card>
          <Card title="Leave balance">
            <Kpis items={balancesFor(ME.name).filter((b) => b.paid).map((b) => ({ label: b.name.replace(' leave', ''), value: b.balance, note: b.code === 'CO' ? <DueBadge date={new Date(2026, 9, 14)} prefix="expires" /> : undefined }))} />
          </Card>
        </div>
      </div>
      {reg.node}
    </DesktopFrame>
  );
}

/* =====================================================================
   Extra 2 · Attendance calendar (employee month view / manager view of one person)
   ===================================================================== */

export interface AttendanceCalendarProps {
  persona?: 'emp' | 'mgr';
  defaultMonth?: 'aug' | 'sep';
  /** Day of month to open in the day card drawer. */
  openDay?: number;
  state?: ViewState;
  /** Manager: whose month (default Meera Krishnan). */
  person?: string;
}

/** A locked month is paid: an absent day went to payroll as unpaid leave, so it is no longer a day to fix. */
const asPaid = (days: PDay[], locked: boolean): PDay[] =>
  locked ? days.map((d) => (d.code === 'A' ? { ...d, code: 'LOP', note: `Absent, not paid (deducted in ${d.date.toLocaleDateString('en-IN', { month: 'long' })} payroll)` } : d)) : days;
/** "23 Sep" from a note such as "Regularise sent 23 Sep: …". */
const sentOn = (note?: string) => note?.match(/sent (\d{1,2} \w{3})/i)?.[1];

function exportMonth(who: string, label: string, days: AttendanceDay[]) {
  downloadCsv(`attendance-${who.toLowerCase().replace(/\s+/g, '-')}-${label.toLowerCase().replace(/\s+/g, '-')}.csv`, [
    ['Date', 'Status', 'Late (min)', 'Overtime (min)', 'Note'],
    ...days.map((d) => [formatDate(d.date), DAY_CODE_LABEL[d.code], d.lateMin ?? '', d.otMin ?? '', d.note ?? '']),
  ]);
}

export function AttendanceCalendarScreen({ persona = 'emp', defaultMonth = 'sep', openDay, state: stateProp = 'ready', person: personProp = 'Meera Krishnan' }: AttendanceCalendarProps) {
  const [state, retry] = useViewState(stateProp);
  const [month, setMonth] = useState(defaultMonth);
  const reports = myReports();
  const [pick, setPick] = useState(reports.find((r) => r.name === personProp)?.id ?? reports[0].id);
  const who = persona === 'emp' ? ME.name : reports.find((r) => r.id === pick)!.name;
  const report = TEAM.find((t) => t.name === who);
  const locked = month === 'aug';
  const days = asPaid(monthFor(who, month), locked);
  const [openN, setOpenN] = useState<number | null>(openDay ?? null);
  const open = openN ? days[openN - 1] ?? null : null;
  const reg = useRegularise();
  const narrow = useNarrow();
  const monthLabel = month === 'sep' ? 'September 2026' : 'August 2026';
  const waiting = days.filter((d) => d.code === 'R');
  const openEx = EXCEPTIONS.filter((x) => x.person === who && x.status === 'Open');
  const [nudged, setNudged] = useState<string[]>([]);
  const ready = state === 'ready';
  const firstPaid = days.find((d) => d.code === 'LOP') ?? days.find((d) => d.code !== 'WO' && d.code !== 'H');
  const toFix = monthSummary(days).toFix.filter((d) => !reg.isSent(d.date));
  // The fix-before-payroll alert carries the "Tomorrow" badge; the month bar doesn't repeat it.
  const fixAlert = persona === 'emp' && !locked && ready && toFix.length > 0;
  return (
    <TimePage active={persona === 'emp' ? 'My attendance' : 'Muster'}>
      <PageHeader
        title={persona === 'emp' ? 'My attendance' : `Attendance · ${who}`}
        description={persona === 'emp' ? `${ME.location} · ${GENERAL_SHIFT.name} shift ${fmt12(GENERAL_SHIFT.start)} – ${fmt12(GENERAL_SHIFT.end)}` : `${report?.role} · ${report?.location} · reports to you`}
        breadcrumbs={persona === 'mgr' ? <span className="yx-tim-muted">Muster › {who}</span> : undefined}
        actions={
          <div className="yx-tim-row">
            {persona === 'mgr' && (
              <div className="yx-tim-picker">
                <PersonPicker aria-label="Person" value={pick} onChange={(v) => { if (v) { setPick(v); setOpenN(null); } }} people={reports.map((p) => ({ id: p.id, name: p.name, role: p.role, department: p.dept }))} />
              </div>
            )}
            <Button icon={Download} disabled={!ready} onClick={() => exportMonth(who, monthLabel, days)}>Export month</Button>
            {persona === 'emp' && <Button variant="primary" disabled={!ready} onClick={() => reg.open(null, 'wrong')}>Regularise a day</Button>}
          </div>
        }
      />
      {reg.alert}
      <div className="yx-tim-row yx-tim-monthnav">
        <IconButton icon={ChevronLeft} label="Previous month" variant="secondary" onClick={() => { setMonth('aug'); setOpenN(null); }} disabled={!ready || month === 'aug'} />
        <h2 className="yx-tim-h2" aria-live="polite">{monthLabel}</h2>
        <IconButton icon={ChevronRight} label="Next month" variant="secondary" onClick={() => { setMonth('sep'); setOpenN(null); }} disabled={!ready || month === 'sep'} />
        {!ready ? null : locked ? (
          <Badge tone="neutral"><Lock size={12} aria-hidden="true" /> Locked · payroll approved 3 Sep</Badge>
        ) : (
          <>
            <Badge tone="success">Open · freezes {shortDate(SEP_CUTOFF)}</Badge>
            {!fixAlert && <DueBadge date={SEP_CUTOFF} />}
          </>
        )}
      </div>
      {fixAlert && (
        <InlineAlert
          tone="danger"
          title={<span className="yx-tim-row">{`${toFix.length} ${toFix.length === 1 ? 'day needs' : 'days need'} fixing before payroll closes on ${shortDate(SEP_CUTOFF)}`}<DueBadge date={SEP_CUTOFF} /></span>}
          actions={toFix.map((d) => <Button key={d.date.getTime()} size="sm" onClick={() => reg.open(d.date, fixKindFor(d))}>Fix {shortDate(d.date)}</Button>)}
        >
          {toFix.map((d) => `${shortDate(d.date)}: ${DAY_CODE_LABEL[d.code].toLowerCase()}`).join(' · ')}
        </InlineAlert>
      )}
      {locked && ready && (
        <InlineAlert
          tone="info"
          title="August 2026 is locked"
          actions={persona === 'emp' && firstPaid ? <Button size="sm" onClick={() => reg.open(firstPaid.date, 'full')}>Raise late request for {shortDate(firstPaid.date)}</Button> : undefined}
        >
          You can still ask for a change: pick a day, or raise a late request. It needs an extra HR approval, and the effect lands in the {LATE_PAYROLL} payroll. Late requests are accepted up to 60 days back.
        </InlineAlert>
      )}
      {state === 'loading' ? (
        <LoadingBlock rows={8} />
      ) : state === 'error' ? (
        <ErrorState title="We couldn't load your attendance" description="Check your connection and try again. Your punches are safe." onRetry={retry} reference="ATT-4F21" />
      ) : (
        <div className="yx-tim-grid">
          <div data-span="8">
            <AttendanceMonth month={days[0].date} days={days} compact={narrow} selected={open?.date} onDayClick={(d) => setOpenN(d.date.getDate())} />
          </div>
          <div data-span="4" className="yx-tim-stack">
            <Card title={`${monthLabel} totals`}>
              {/* The fix buttons sit in the alert above the calendar; the totals list the dates only. */}
              <AttendanceLegend days={days} locked={locked} />
            </Card>
            {persona === 'emp' && waiting.length > 0 && !locked && (
              <Card title="Waiting for approval">
                <ul className="yx-tim-list">
                  {waiting.map((d) => (
                    <li key={d.date.getTime()}>
                      <span className="yx-tim-list__main"><strong>{shortDate(d.date)} · Regularisation</strong><span className="yx-tim-muted">With {ME.manager}{sentOn(d.note) ? ` since ${sentOn(d.note)}` : ''}</span></span>
                      <Button size="sm" onClick={() => setOpenN(d.date.getDate())}>View</Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {persona === 'mgr' && !locked && (
              <Card title="Open exceptions">
                {openEx.length === 0 ? (
                  <p className="yx-tim-muted">Nothing open for {firstName(who)} this month.</p>
                ) : (
                  <ul className="yx-tim-list">
                    {openEx.map((x) => (
                      <li key={x.id}>
                        <span className="yx-tim-list__main"><strong>{rowDate(x)} · {x.kind}</strong><span className="yx-tim-muted">{plainDetail(x.detail)}</span></span>
                        {nudged.includes(x.id) ? <Badge tone="neutral">Nudged</Badge> : <Button size="sm" onClick={() => setNudged([...nudged, x.id])}>Nudge</Button>}
                      </li>
                    ))}
                  </ul>
                )}
                <LinkButton size="sm" to={STORY.exceptionsMgr} args={`defaultSearch:${who.replace(/ /g, '+')}`}>Open exceptions</LinkButton>
              </Card>
            )}
          </div>
        </div>
      )}
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenN(null)}
        title={open ? `${open.date.toLocaleDateString('en-IN', { weekday: 'long' })}, ${formatDate(open.date)}` : ''}
        subtitle={`${who} · day card`}
        size="lg"
      >
        {open && <DayPanel key={`${who}-${open.date.getTime()}`} day={open} person={who} viewer={persona} locked={locked} monthDays={days} onRegularise={reg.open} />}
      </Drawer>
      {reg.node}
    </TimePage>
  );
}

/** Phone: Time tab › attendance calendar with markers and day-grouped punches (M04 YX-MOB-12). */
export function AttendanceCalendarPhone({ openDay, defaultMonth = 'sep' }: { openDay?: number; defaultMonth?: 'aug' | 'sep' }) {
  const [month, setMonth] = useState(defaultMonth);
  const locked = month === 'aug';
  const days = asPaid(month === 'sep' ? SEPTEMBER : AUGUST, locked);
  const [open, setOpen] = useState<AttendanceDay | null>(openDay ? days[openDay - 1] : null);
  const reg = useRegularise();
  const s = monthSummary(days);
  const firstPaid = days.find((d) => d.code === 'LOP');
  const waiting = days.filter((d) => d.code === 'R');
  const toFix = s.toFix.filter((d) => !reg.isSent(d.date));
  return (
    <PhoneFrame tab="time" title="My attendance">
      <div className="yx-tim-row yx-tim-monthnav">
        <IconButton icon={ChevronLeft} label="Previous month" variant="secondary" onClick={() => setMonth('aug')} disabled={month === 'aug'} />
        <h2 className="yx-tim-h2">{month === 'sep' ? 'Sep 2026' : 'Aug 2026'}</h2>
        <IconButton icon={ChevronRight} label="Next month" variant="secondary" onClick={() => setMonth('sep')} disabled={month === 'sep'} />
      </div>
      {locked && (
        <InlineAlert tone="info" title="August is locked" actions={firstPaid ? <Button size="sm" onClick={() => reg.open(firstPaid.date, 'full')}>Raise late request for {shortDate(firstPaid.date)}</Button> : undefined}>
          Pick a day to ask for a change. It goes as a late request; the effect lands in the {LATE_PAYROLL} payroll.
        </InlineAlert>
      )}
      {reg.alert}
      {!locked && toFix.length > 0 && (
        <InlineAlert
          tone="danger"
          title={<span className="yx-tim-row">{`${toFix.length} ${toFix.length === 1 ? 'day needs' : 'days need'} fixing before payroll closes on ${shortDate(SEP_CUTOFF)}`}<DueBadge date={SEP_CUTOFF} /></span>}
          actions={toFix.map((d) => <Button key={d.date.getTime()} size="sm" onClick={() => reg.open(d.date, fixKindFor(d))}>Fix {shortDate(d.date)}</Button>)}
        >
          {toFix.map((d) => `${shortDate(d.date)}: ${DAY_CODE_LABEL[d.code].toLowerCase()}`).join(' · ')}
        </InlineAlert>
      )}
      <AttendanceMonth month={days[0].date} days={days} compact selected={open?.date} onDayClick={setOpen} />
      {/* Same totals, labels and legend as the desktop calendar. */}
      <AttendanceLegend days={days} locked={locked} />
      {!locked && waiting.length > 0 && (
        <Card title="Waiting for approval">
          <ul className="yx-tim-list">
            {waiting.map((d) => (
              <li key={d.date.getTime()}>
                <span className="yx-tim-list__main"><strong>{shortDate(d.date)} · Regularisation</strong><span className="yx-tim-muted">With {ME.manager}{sentOn(d.note) ? ` since ${sentOn(d.note)}` : ''}</span></span>
                <Button size="sm" onClick={() => setOpen(d)}>View</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <BottomSheet open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open ? formatDate(open.date) : ''}>
        {open && <DayPanel key={open.date.getTime()} day={open} person={ME.name} viewer="emp" locked={locked} monthDays={days} onRegularise={(d, k) => { setOpen(null); reg.open(d, k); }} />}
      </BottomSheet>
      {reg.node}
    </PhoneFrame>
  );
}

/* =====================================================================
   TIM-01 · Time › Today board
   ===================================================================== */

type BoardStatus = TeamPerson['status'] | 'rest';
/** Resting after a night call-out is expected, not a no-show: no nudge, not counted as "not checked in". */
const boardStatus = (p: TeamPerson): BoardStatus => (p.status === 'not_in' && /call-out/i.test(p.detail ?? '') ? 'rest' : p.status);

const COLS: { key: BoardStatus[]; title: string; tone: BadgeTone; hideEmpty?: boolean }[] = [
  { key: ['in', 'missing'], title: 'In', tone: 'success' },
  { key: ['late'], title: 'Late', tone: 'warning' },
  { key: ['not_in'], title: 'Not checked in', tone: 'danger' },
  { key: ['leave'], title: 'On leave', tone: 'info' },
  { key: ['wfh', 'od'], title: 'WFH / on duty', tone: 'info' },
  // Weekly off is listed here too, under its own line, but not counted: it isn't rostered (matches the Resting KPI).
  { key: ['off', 'rest'], title: 'Resting', tone: 'neutral', hideEmpty: true },
];
const countOf = (people: TeamPerson[], keys: BoardStatus[]) => people.filter((p) => keys.includes(boardStatus(p))).length;
const needsNudge = (p: TeamPerson) => boardStatus(p) === 'not_in' || p.status === 'missing';
/** "No check-out 28 Sep" from the open exception. */
const missedOutText = (p: TeamPerson) => {
  const x = EXCEPTIONS.find((e) => e.person === p.name && e.kind === 'Missing check-out' && e.status === 'Open');
  return x ? `No check-out ${shortDate(x.date)}` : 'No check-out yesterday';
};
/** Second line: the time and only what is unusual (the column already says the status). The site shows only when it differs from the column's usual one. */
const personLine = (p: TeamPerson, usual?: string, /** A status badge sits beside the name: drop the status words from the detail. */ badged = false) => {
  // HR only (usual is set): WFH is at home, on duty is at the duty place (already in the detail).
  const site = usual === undefined ? undefined : p.status === 'wfh' ? 'Home' : p.status === 'od' || p.location === usual ? undefined : p.location;
  // Assumed-present and timesheet people don't check in, so they have no "In" time.
  const checksIn = !p.mode || p.mode === 'Punch';
  const detail = badged ? p.detail?.replace(/^(On duty · |WFH )/, '') : p.detail;
  const line = [checksIn && p.inAt && `In ${fmt12(p.inAt)}`, p.status !== 'missing' && detail, site].filter(Boolean).join(' · ');
  return nbspTime(line.charAt(0).toUpperCase() + line.slice(1));
};
/** The site most of a list is at; '' on a tie or no clear majority (each person's line then carries their own site). */
const usualSite = (list: TeamPerson[]) => {
  const n: Record<string, number> = {};
  for (const p of list) n[p.location] = (n[p.location] ?? 0) + 1;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > list.length / 2 ? top[0] : '';
};
const NOW_TEXT = <span style={{ whiteSpace: 'nowrap' }}>Tue 29 Sep 2026, 9:42 am</span>;
/**
 * HR board: everyone at the Tamil Nadu entity's sites today. The team, plus Divya (her own exceptions block payroll too)
 * and the Chennai office staff hosting today's visitors, so the emergency roll call has every host.
 */
const HR_BOARD: TeamPerson[] = [
  { id: 'e1', name: ME.name, code: ME.code, role: ME.role, dept: 'Quality', location: 'Chennai office', status: 'in', inAt: TODAY_PUNCHES[0].time, source: 'web', reportsTo: ME.manager },
  ...TEAM,
  { id: 'h1', name: 'Neha Joshi', code: 'KF-0109', role: 'Talent Acquisition Lead', dept: 'People', location: 'Chennai office', status: 'in', inAt: '09:12', source: 'biometric', reportsTo: 'Lakshmi Venkatesan' },
  { id: 'h2', name: 'Farhan Qureshi', code: 'KF-0216', role: 'Facilities Executive', dept: 'Operations', location: 'Chennai office', status: 'in', inAt: '08:32', source: 'biometric', reportsTo: 'Ramesh Gowda' },
];

export interface TodayBoardProps {
  persona?: 'mgr' | 'hr';
  state?: ViewState;
  defaultTab?: 'board' | 'field' | 'onsite';
  /** Nudge sent confirmation for one person. */
  nudged?: string;
}

export function TodayBoardScreen({ persona = 'mgr', state: stateProp = 'ready', defaultTab = 'board', nudged }: TodayBoardProps) {
  const [state, retry] = useViewState(stateProp);
  const user = userFor(persona);
  const hr = persona === 'hr';
  const people = hr ? HR_BOARD : myReports();
  const [sent, setSent] = useState<string[]>(nudged ? [nudged] : []);
  // A story that starts with a nudge already sent shows the same confirmation a real click gives.
  const [notice, setNotice] = useState(nudged ? '1 nudge sent' : '');
  const count = (keys: BoardStatus[]) => countOf(people, keys);
  const blocking = timeCounts(user).Exceptions;
  const toNudge = people.filter((p) => needsNudge(p) && !sent.includes(p.id));
  const nudge = (ids: string[]) => {
    setSent([...sent, ...ids]);
    setNotice(`${ids.length} ${ids.length === 1 ? 'nudge' : 'nudges'} sent`);
  };
  const scope = hr ? 'Kaveri Foods Pvt Ltd (Tamil Nadu) · Chennai office and Hosur plant' : `Your reports (${people.length})`;
  // Weekly off isn't rostered; the KPIs below add up to this number.
  const rostered = people.filter((p) => p.status !== 'off').length;
  const resting = count(['rest']);
  // Shown on the board and on a day with no shifts: earlier days' exceptions still block payroll.
  const blockingAlert = blocking > 0 && (
    <InlineAlert
      tone="danger"
      title={<span className="yx-tim-row">{blocking} open exceptions block September payroll <DueBadge date={SEP_CUTOFF} /></span>}
      actions={<LinkButton size="sm" to={hr ? STORY.exceptionsHr : STORY.exceptionsMgr}>Open exceptions</LinkButton>}
    >
      Missing punches and absences {hr ? 'at both sites' : 'in your team'} need fixing before the {shortDate(SEP_CUTOFF)} cut-off.
    </InlineAlert>
  );
  return (
    <TimePage active="Today" user={user}>
      <PageHeader
        title="Today"
        description={state === 'empty' ? `${scope} · none rostered today` : <>{scope} · {NOW_TEXT}</>}
        actions={
          <div className="yx-tim-row">
            {state === 'ready' && (
              <Button icon={Bell} disabled={toNudge.length === 0} onClick={() => nudge(toNudge.map((p) => p.id))}>
                {toNudge.length ? `Nudge ${toNudge.length} ${toNudge.length === 1 ? 'person' : 'people'}` : 'Everyone nudged'}
              </Button>
            )}
            {hr && <LinkButton to={STORY.muster}>Open muster</LinkButton>}
          </div>
        }
      />
      {state === 'loading' ? (
        <LoadingBlock rows={8} />
      ) : state === 'error' ? (
        <ErrorState title="Today's board didn't load" description="Punches are still being recorded. Try again in a moment." onRetry={retry} reference="TDY-19C0" />
      ) : state === 'empty' ? (
        <div className="yx-tim-stack">
          {blockingAlert}
          <EmptyState
            title="No one is rostered today"
            description={`No one ${hr ? 'at the Chennai office and Hosur plant' : 'in your team'} has a shift today. The board fills when a shift starts.`}
            action={<LinkButton to={STORY.roster}>Open roster</LinkButton>}
          />
        </div>
      ) : (
        <Tabs defaultValue={defaultTab}>
          <TabsList aria-label="Today views">
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="field">Field</TabsTrigger>
            {persona === 'hr' && <TabsTrigger value="onsite">On site now</TabsTrigger>}
          </TabsList>
          <TabsContent value="board">
            <div className="yx-tim-stack">
              {notice && <InlineAlert tone="success" title={notice} />}
              <Kpis
                items={[
                  { label: 'Rostered', value: rostered },
                  { label: 'In', value: count(['in', 'missing']) },
                  { label: 'Late', value: count(['late']) },
                  { label: 'Not checked in', value: count(['not_in']) },
                  { label: 'On leave', value: count(['leave']) },
                  { label: 'WFH / on duty', value: count(['wfh', 'od']) },
                  ...(resting ? [{ label: 'Resting', value: resting }] : []),
                ]}
              />
              {blockingAlert}
              <div className="yx-tim-board">
                {COLS.map((c) => {
                  const all = people.filter((p) => c.key.includes(boardStatus(p)));
                  if (c.hideEmpty && all.length === 0) return null;
                  // Weekly off isn't rostered: listed under its own line, left out of the count.
                  const off = all.filter((p) => boardStatus(p) === 'off');
                  const list = all.filter((p) => boardStatus(p) !== 'off');
                  // HR: a column of 2 or more names its usual site once; a lone person carries the site in their own line ('' = no usual site).
                  // WFH / on duty people aren't at a site, so that column has none.
                  const usual = !hr ? undefined : list.length > 1 && !c.key.includes('wfh') ? usualSite(list) : '';
                  const allSame = list.every((p) => p.location === usual);
                  return (
                    <section key={c.title} className="yx-tim-board__col" aria-label={`${c.title}, ${list.length}`}>
                      <div className="yx-tim-board__head"><span>{c.title}</span><Badge tone={c.tone}>{list.length}</Badge></div>
                      {usual && <p className="yx-tim-muted">{allSame ? 'All at' : 'Mostly'} {usual}</p>}
                      {list.length === 0 && <p className="yx-tim-muted">No one</p>}
                      {list.map((p) => (
                        <div key={p.id} className="yx-tim-person">
                          {/* Text keeps the full width; the badge and Nudge sit under it. */}
                          <span className="yx-tim-list__main">
                            <strong>{p.name}</strong>
                            <span className="yx-tim-muted">{personLine(p, usual)}</span>
                            {(p.status === 'missing' || needsNudge(p)) && (
                              <span className="yx-tim-row">
                                {p.status === 'missing' && <Badge tone="danger">{missedOutText(p)}</Badge>}
                                {sent.includes(p.id) ? <Badge tone="neutral">Nudged</Badge> : <Button size="sm" onClick={() => nudge([p.id])}>Nudge</Button>}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                      {off.length > 0 && <p className="yx-tim-muted">Weekly off · not rostered</p>}
                      {off.map((p) => (
                        <div key={p.id} className="yx-tim-person">
                          <span className="yx-tim-list__main">
                            <strong>{p.name}</strong>
                            <span className="yx-tim-muted">{personLine(p, hr ? '' : undefined)}</span>
                          </span>
                        </div>
                      ))}
                    </section>
                  );
                })}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="field">
            <FieldSummary people={people} hr={hr} />
          </TabsContent>
          {persona === 'hr' && (
            <TabsContent value="onsite">
              <OnSiteNow people={people} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </TimePage>
  );
}

/** Employees checked in at each site now (same people as the board), plus visitors signed in (Visitors module). */
function OnSiteNow({ people }: { people: TeamPerson[] }) {
  const here = people.filter((p) => ['in', 'late', 'missing'].includes(p.status));
  const guests = VISITS.filter((v) => v.status === 'On site');
  const sites = LOCATIONS.map((l) => l.name).filter((s) => here.some((p) => p.location === s) || guests.some((v) => v.location === s));
  const at12 = (d: Date) => fmt12(toHHMM(d.getHours() * 60 + d.getMinutes()));
  return (
    <div className="yx-tim-stack">
      <p className="yx-tim-muted">For emergencies: employees checked in at each site, plus visitors signed in at reception.</p>
      {sites.map((site) => {
        const emp = here.filter((p) => p.location === site);
        const vis = guests.filter((v) => v.location === site);
        return (
          <Card key={site} title={`On site now · ${site}`}>
            <Kpis items={[{ label: 'Employees in', value: emp.length }, { label: 'Visitors on site', value: vis.length }]} />
            <ul className="yx-tim-list" aria-label={`Employees at ${site}`}>
              {emp.map((p) => (
                <li key={p.id}><span>{p.name}</span><span className="yx-tim-muted">In {fmt12(p.inAt!)}</span></li>
              ))}
            </ul>
            {vis.length > 0 && (
              <ul className="yx-tim-list" aria-label={`Visitors at ${site}`}>
                {vis.map((v) => (
                  <li key={v.id}>
                    <span className="yx-tim-list__main"><span>{v.name} · visitor</span><span className="yx-tim-muted">Host {v.host}</span></span>
                    <span className="yx-tim-muted">{v.checkIn ? `In ${at12(v.checkIn)}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button
              icon={Download}
              onClick={() =>
                downloadCsv(`on-site-${site.toLowerCase().replace(/\s+/g, '-')}.csv`, [
                  ['Name', 'Type', 'Host', 'In'],
                  ...emp.map((p) => [p.name, 'Employee', '', fmt12(p.inAt!)]),
                  ...vis.map((v) => [v.name, 'Visitor', v.host, v.checkIn ? at12(v.checkIn) : '']),
                ])
              }
            >
              Download list
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

function FieldSummary({ people, hr }: { people: TeamPerson[]; hr?: boolean }) {
  const field = people.filter((p) => p.source === 'field');
  if (field.length === 0) return <EmptyState title="No one is on field duty today" description="People on duty away from the office show here with their visits." />;
  // Tracking comes from each person's own record; the live trail and visit counts exist only for FIELD_DAY's person.
  const tracked = field.find((p) => !p.trackingOff && p.name === FIELD_DAY.person);
  const trackedCount = field.filter((p) => !p.trackingOff).length;
  return (
    <div className="yx-tim-grid">
      <div data-span="8">
        <GeoMap
          fences={[{ id: 'maa', label: 'Chennai office', x: 90, y: 120, r: 22 }]}
          // Only people with tracking on have a live position to draw.
          pins={tracked ? [{ id: tracked.id, label: tracked.name, x: 210, y: 80, kind: 'person' as const }] : []}
          trail={tracked ? [[90, 120], [130, 110], [180, 95], [210, 80]] : undefined}
          caption={`${field.length} on field duty · ${trackedCount} with tracking on, shown during duty hours only`}
        />
      </div>
      <div data-span="4">
        <Card title="Field today">
          <ul className="yx-tim-list">
            {field.map((p) => (
              <li key={p.id}>
                {/* The badge sits under the text so the reason has the full width. */}
                <span className="yx-tim-list__main">
                  <strong>{p.name}</strong>
                  <span className="yx-tim-muted">{p === tracked ? `${FIELD_DAY.done} of ${FIELD_DAY.planned} visits · ${FIELD_DAY.km} km` : p.detail}</span>
                  <span><Badge tone={p.trackingOff ? 'neutral' : 'info'}>{p.trackingOff ? `Tracking off · ${p.trackingOff}` : 'Tracking on'}</Badge></span>
                </span>
              </li>
            ))}
          </ul>
          <LinkButton size="sm" to={hr ? STORY.fieldHr : STORY.fieldMgr}>Open field map</LinkButton>
        </Card>
      </div>
    </div>
  );
}

/** Phone: Home › Team today (M04 Q5). */
/** Phone list order: people who need action first, then late, then the rest. */
const ACTION_ORDER: BoardStatus[] = ['not_in', 'missing', 'late'];
const actionRank = (p: TeamPerson) => {
  const i = ACTION_ORDER.indexOf(boardStatus(p));
  return i < 0 ? ACTION_ORDER.length : i;
};

export function TeamTodayPhone() {
  const people = [...myReports()].sort((a, b) => actionRank(a) - actionRank(b));
  const [sent, setSent] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const count = (keys: BoardStatus[]) => countOf(people, keys);
  const blocking = timeCounts(ME).Exceptions;
  const toNudge = people.filter((p) => needsNudge(p) && !sent.includes(p.id));
  // Same label and confirmation as the desktop board.
  const nudge = (ids: string[]) => {
    setSent([...sent, ...ids]);
    setNotice(`${ids.length} ${ids.length === 1 ? 'nudge' : 'nudges'} sent`);
  };
  return (
    <PhoneFrame tab="home" title="Team today">
      <Kpis
        items={[
          // Same total as the desktop board: weekly off isn't rostered.
          { label: 'Rostered', value: people.filter((p) => p.status !== 'off').length },
          { label: 'In', value: count(['in', 'missing']) },
          { label: 'Late', value: count(['late']) },
          { label: 'Not checked in', value: count(['not_in']) },
          { label: 'On leave', value: count(['leave']) },
          { label: 'WFH / on duty', value: count(['wfh', 'od']) },
        ]}
      />
      {blocking > 0 && (
        <InlineAlert
          tone="danger"
          title={<span className="yx-tim-row">{blocking} open exceptions block September payroll <DueBadge date={SEP_CUTOFF} /></span>}
          actions={<LinkButton size="sm" to={STORY.exceptionsMgr}>Open exceptions</LinkButton>}
        />
      )}
      {notice && <InlineAlert tone="success" title={notice} />}
      <Button icon={Bell} fullWidth disabled={toNudge.length === 0} onClick={() => nudge(toNudge.map((p) => p.id))}>
        {toNudge.length ? `Nudge ${toNudge.length} ${toNudge.length === 1 ? 'person' : 'people'}` : 'Everyone nudged'}
      </Button>
      <ul className="yx-tim-list">
        {people.map((p) => (
          <li key={p.id}>
            {/* Name and status on one line; the time under it; only the action (and Priya's missed check-out) on a third line. */}
            <span className="yx-tim-list__main">
              <span className="yx-tim-row">
                <strong>{p.name}</strong>
                {/* Priya's red badge already explains her row, so she gets no "In" badge. */}
                {p.status !== 'missing' && !needsNudge(p) && <Badge tone={p.status === 'late' ? 'warning' : p.status === 'in' ? 'success' : 'info'}>{STATUS_LABEL[p.status]}</Badge>}
              </span>
              <span className="yx-tim-muted">{personLine(p, undefined, p.status !== 'missing' && !needsNudge(p)) || p.location}</span>
              {needsNudge(p) && (
                <span className="yx-tim-row">
                  {p.status === 'missing' && <Badge tone="danger">{missedOutText(p)}</Badge>}
                  {sent.includes(p.id) ? <Badge tone="neutral">Nudged</Badge> : <Button size="sm" onClick={() => nudge([p.id])}>Nudge</Button>}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </PhoneFrame>
  );
}

/* =====================================================================
   TIM-02 · Muster grid (+ freeze / lock)
   ===================================================================== */

interface MusterRow { id: string; name: string; code: string; mode: 'Punch' | 'Assumed present' | 'Timesheet'; days: PDay[] }

/** Assumed-present and timesheet people don't check in, so they can't be late: those days are plain present. */
const noLate = (days: PDay[]): PDay[] => days.map((d) => (d.lateMin ? { ...d, code: d.code === 'L' ? 'P' : d.code, lateMin: undefined } : d));

/** Muster rows for a month. `resolved`: every blocking exception and pending request has been closed by HR. */
export function musterRows(month: 'aug' | 'sep' = 'sep', resolved = false): MusterRow[] {
  return [
    { id: 'e1', name: ME.name, code: ME.code, mode: 'Punch', days: monthFor(ME.name, month, resolved) },
    ...TEAM.slice(0, 11).map((p) => {
      const mode = p.mode ?? 'Punch';
      const days = monthFor(p.name, month, resolved);
      return { id: p.id, name: p.name, code: p.code, mode, days: mode === 'Punch' ? days : noLate(days) };
    }),
  ];
}

/** Day codes that the muster can show, in legend order. */
const MUSTER_CODES: DayCode[] = ['P', 'WFH', 'OD', 'HD', 'CL', 'EL', 'SL', 'H', 'WO', 'A', 'LOP', 'MP', 'R', 'TODAY', 'FUT'];
const WEEKDAY2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
/** Late is a mark on a present day, not its own code. */
const cellCode = (c: DayCode): DayCode => (c === 'L' ? 'P' : c);
/** Days HR can mark present in bulk: no attendance or a missing punch. */
const canMarkPresent = (c: DayCode) => c === 'A' || c === 'MP';

export interface MusterProps {
  stage?: 'open' | 'frozen' | 'locked';
  state?: ViewState;
  /** Which month (a locked story uses August, which has ended). */
  month?: 'aug' | 'sep';
  openCell?: [string, number];
  dialog?: 'freeze' | 'lock' | 'bulk' | null;
  /** Rows ticked for the bulk action. */
  defaultSelected?: string[];
  /** All blocking exceptions resolved (the lock is allowed once the cut-off has passed). */
  resolved?: boolean;
  /** Show the muster as it was on an earlier day (the August lock story is set on 2 Sep, before payroll was approved on 3 Sep). */
  asOf?: Date;
}

export function MusterScreen({ stage: stageProp = 'open', state: stateProp = 'ready', month = 'sep', openCell, dialog = null, defaultSelected = [], resolved: resolvedProp = false, asOf }: MusterProps) {
  const today = asOf ?? TODAY;
  const [state, retry] = useViewState(stateProp);
  const [stage, setStage] = useState(stageProp);
  // August is paid and closed; September's exceptions are open unless the story says resolved.
  const resolved = resolvedProp || month === 'aug' || stage === 'locked';
  const [rows, setRows] = useState(() => musterRows(month, resolved));
  const [cell, setCell] = useState<[string, number] | null>(openCell ?? null);
  const [dlg, setDlg] = useState(dialog);
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [monthOf, setMonthOf] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const narrow = useNarrow();
  const gridRef = useRef<HTMLDivElement>(null);
  const shown = state === 'empty' ? [] : rows;
  const row = cell ? rows.find((r) => r.id === cell[0]) : null;
  const day = row && cell ? row.days[cell[1]] : null;
  const exceptions = resolved ? 0 : timeCounts(HR_ADMIN).Exceptions;
  const monthDays = month === 'sep' ? SEPTEMBER : AUGUST;
  const monthName = month === 'sep' ? 'September' : 'August';
  const cutoff = month === 'sep' ? SEP_CUTOFF : new Date(2026, 7, 31);
  // The month can't be locked before its last day is recorded.
  const cutoffPassed = daysUntil(cutoff, today) < 0;
  const lockBlock = !cutoffPassed
    ? `Lock opens after the ${shortDate(cutoff)} cut-off${exceptions > 0 ? ` and when ${exceptions} open exceptions are resolved` : ''}`
    : exceptions > 0 ? `Lock opens when ${exceptions} open exceptions are resolved` : null;
  // Days from today to the cut-off that aren't over yet ("29 and 30 Sep").
  const daysLeft = cutoffPassed ? [] : monthDays.filter((d) => daysUntil(d.date, today) >= 0 && daysUntil(d.date, cutoff) <= 0).map((d) => d.date.getDate());
  const daysLeftText = daysLeft.length > 1 ? `${daysLeft.slice(0, -1).join(', ')} and ${daysLeft[daysLeft.length - 1]} ${MONTHS[cutoff.getMonth()]}` : daysLeft.length ? `${daysLeft[0]} ${MONTHS[cutoff.getMonth()]}` : '';
  const ready = state === 'ready' && shown.length > 0;
  const toggle = (id: string, on: boolean) => setSelected(on ? [...selected, id] : selected.filter((x) => x !== id));
  const sheetRow = monthOf ? rows.find((r) => r.id === monthOf) : null;
  const usedCodes = MUSTER_CODES.filter((c) => shown.some((r) => r.days.some((d) => cellCode(d.code) === c)));
  const openExceptions = <LinkButton size="sm" to={STORY.exceptionsHr}>Open exceptions</LinkButton>;
  // Bulk "mark present" only when the month has absent or missing-punch days to mark (a closed August has none).
  const bulkable = stage !== 'locked' && shown.some((r) => r.days.some((d) => canMarkPresent(d.code)));
  // Open on the latest days, where most of the open exceptions are (names and totals stay pinned).
  useEffect(() => {
    const g = gridRef.current;
    if (g) g.scrollLeft = g.scrollWidth;
  }, [narrow, state]);
  return (
    <TimePage active="Muster" user={HR_ADMIN} counts={resolved || state === 'empty' ? { ...timeCounts(HR_ADMIN), Exceptions: 0 } : undefined}>
      <PageHeader
        title={`Muster · ${monthName} 2026`}
        description={`Kaveri Foods Pvt Ltd (Tamil Nadu) · Chennai office and Hosur plant${state === 'ready' ? ` · ${shown.length} people` : ''}${asOf ? ` · as on ${shortDate(asOf)}` : ''}`}
        status={<Badge tone={stage === 'open' ? 'success' : stage === 'frozen' ? 'warning' : 'neutral'}>{stage === 'open' ? 'Open' : stage === 'frozen' ? 'Inputs frozen' : 'Locked'}</Badge>}
        facts={
          stage !== 'locked' && (
            <span className="yx-tim-row">
              {/* Frozen: the alert below carries the open exceptions and their button, so the facts don't repeat them. */}
              <span className="yx-tim-muted">{ready && exceptions > 0 && stage === 'open' ? 'Open exceptions stop payroll approval · ' : ''}{cutoffPassed ? `Cut-off ${shortDate(cutoff)} has passed` : `Cut-off ${shortDate(cutoff)}`}</span>
              {/* A passed cut-off waiting only for the lock isn't overdue: no red badge. */}
              {!cutoffPassed && <DueBadge date={cutoff} />}
            </span>
          )
        }
        actions={
          <div className="yx-tim-row">
            <Button icon={Download} disabled={!ready} onClick={() => downloadCsv(`muster-${monthName.toLowerCase()}-2026.csv`, [['Employee', 'Code', 'Payable', 'Unpaid', 'Late', 'OT h', ...monthDays.map((d) => String(d.date.getDate()))], ...shown.map((r) => { const s = monthSummary(r.days); return [r.name, r.code, s.payable, s.lop, s.lateMarks, s.otHours, ...r.days.map((d) => codeText(cellCode(d.code)))]; })])}>Export</Button>
            {stage === 'open' && <Button icon={Snowflake} disabled={!ready} onClick={() => setDlg('freeze')}>Freeze inputs</Button>}
            {stage === 'frozen' && <Button variant="primary" icon={Lock} disabled={!!lockBlock} onClick={() => setDlg('lock')}>Lock period</Button>}
          </div>
        }
      />
      {msg && <InlineAlert tone="success" title={msg} />}
      {stage !== 'open' && (
        <InlineAlert
          tone={stage === 'frozen' && exceptions > 0 ? 'warning' : 'info'}
          title={stage === 'frozen' ? (exceptions > 0 ? `Inputs are frozen · ${exceptions} open exceptions` : 'Inputs are frozen') : `${monthName} 2026 is locked`}
          actions={stage === 'frozen' && exceptions > 0 ? openExceptions : undefined}
        >
          {/* Why Lock period is disabled sits here, not beside the header buttons, so the title keeps its room. */}
          {stage === 'frozen'
            ? `${lockBlock ? `${lockBlock}. ` : ''}Employees can still raise late requests; they need an extra HR approval. Cells are read-only except HR corrections with a reason.`
            : `Payroll ${month === 'aug' ? 'was approved on 3 Sep' : 'is approved'}. Corrections become late requests with effect in ${month === 'aug' ? LATE_PAYROLL : 'November'} payroll.`}
        </InlineAlert>
      )}
      {state === 'loading' ? <LoadingBlock rows={10} /> : state === 'error' ? (
        <ErrorState title="The muster didn't load" description="Try again. If it keeps failing, share the reference with support." onRetry={retry} reference="MUS-0A77" />
      ) : state === 'empty' ? (
        <EmptyState
          title="No one on the muster"
          description={`No one is on the muster for Kaveri Foods Pvt Ltd (Tamil Nadu) in ${monthName}. Add people to this entity in People.`}
          action={<LinkButton to={STORY.people}>Open People</LinkButton>}
        />
      ) : (
        <>
          <div className="yx-tim-row">
            {stage === 'open' && exceptions > 0 && <><Badge tone="danger">{exceptions} open exceptions</Badge>{openExceptions}</>}
            {bulkable && <span className="yx-tim-muted">Select people to act in bulk.</span>}
            {selected.length > 0 && bulkable && <Button onClick={() => setDlg('bulk')}>Mark present with reason ({selected.length})</Button>}
          </div>
          {narrow ? (
            <div className="yx-tim-stack">
              {shown.map((r) => {
                const s = monthSummary(r.days);
                // Pending requests also need HR action: they open the day card, where HR approves them.
                const fix = r.days.map((d, i) => ({ d, i })).filter(({ d }) => d.code === 'MP' || d.code === 'A' || d.code === 'R');
                return (
                  <Card key={r.id} title={r.name}>
                    <p className="yx-tim-muted">{r.code}{r.mode !== 'Punch' ? ` · ${r.mode}` : ''}</p>
                    <Kpis items={[{ label: 'Payable', value: s.payable }, { label: 'Unpaid', value: s.lop }, { label: 'Late', value: s.lateMarks }, { label: 'OT h', value: s.otHours }]} />
                    {fix.length > 0 && (
                      <div className="yx-tim-row">
                        <span className="yx-tim-muted">To fix:</span>
                        {fix.map(({ d, i }) => <Button key={i} size="sm" onClick={() => setCell([r.id, i])}>{shortDate(d.date)}{d.code === 'R' ? ' · request' : ''}</Button>)}
                      </div>
                    )}
                    <div className="yx-tim-row">
                      {bulkable && (
                        <label className="yx-tim-row">
                          <input type="checkbox" checked={selected.includes(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} /> Select
                        </label>
                      )}
                      <Button size="sm" onClick={() => setMonthOf(r.id)}>View month</Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div ref={gridRef} className="yx-tim-muster" data-pinned-totals tabIndex={0} role="region" aria-label="Muster grid, scrolls sideways">
              <table aria-label={`Muster, ${monthName} 2026`}>
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Payable</th><th scope="col">Unpaid</th><th scope="col">Late</th><th scope="col">OT h</th>
                    {monthDays.map((d) => <th key={d.date.getDate()} scope="col">{d.date.getDate()}<br />{WEEKDAY2[d.date.getDay()]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const s = monthSummary(r.days);
                    return (
                      <tr key={r.id}>
                        <th scope="row">
                          <label className="yx-tim-row" style={{ flexWrap: 'nowrap' }}>
                            {bulkable && <input type="checkbox" checked={selected.includes(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} aria-label={`Select ${r.name}`} />}
                            <span className="yx-tim-list__main">
                              <span>{r.name}</span>
                              {/* Short mode label so the pinned name cell stays two lines ("Assumed present" wrapped to a third). */}
                              <span className="yx-tim-muted" title={r.mode !== 'Punch' ? r.mode : undefined}>{r.code}{r.mode === 'Assumed present' ? ' · No punch' : r.mode === 'Timesheet' ? ' · Timesheet' : ''}</span>
                            </span>
                          </label>
                        </th>
                        <td className="yx-tim-muster__total">{s.payable}</td>
                        <td className="yx-tim-muster__total">{s.lop}</td>
                        <td className="yx-tim-muster__total">{s.lateMarks}</td>
                        <td className="yx-tim-muster__total">{s.otHours}</td>
                        {r.days.map((d, i) => (
                          <td key={i}>
                            <button
                              type="button"
                              className="yx-tim-cell"
                              data-code={cellCode(d.code)}
                              aria-pressed={cell?.[0] === r.id && cell[1] === i}
                              aria-label={`${r.name}, ${formatDate(d.date)}: ${DAY_CODE_LABEL[cellCode(d.code)]}${d.lateMin ? ', late' : ''}`}
                              onClick={() => setCell([r.id, i])}
                            >
                              {codeText(cellCode(d.code)) || '·'}
                              {d.lateMin || d.otMin ? <span className="yx-tim-cell__mark">{d.lateMin ? 'late' : 'OT'}</span> : null}
                            </button>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {shown.length > 0 && (
            <ul className="yx-tim-legend__list" aria-label="Legend">
              {usedCodes.map((c) => <li key={c}><span className="yx-tim-legend__chip" data-code={c}>{codeText(c) || '·'}</span> {DAY_CODE_LABEL[c]}</li>)}
            </ul>
          )}
          <p className="yx-tim-note">"late" = arrived after the 10-minute grace · "OT" = overtime worked. Unpaid = days already deducted as unpaid leave. Absent days stay out of Payable until they are fixed.</p>
        </>
      )}
      <BottomSheet open={!!sheetRow} onOpenChange={(o) => !o && setMonthOf(null)} title={sheetRow ? `${sheetRow.name} · ${monthName}` : ''}>
        {sheetRow && <AttendanceMonth month={monthDays[0].date} days={sheetRow.days} compact onDayClick={(d) => { setMonthOf(null); setCell([sheetRow.id, d.date.getDate() - 1]); }} />}
      </BottomSheet>
      <Drawer open={!!day} onOpenChange={(o) => !o && setCell(null)} title={day ? `${row!.name} · ${formatDate(day.date)}` : ''} subtitle="Day card" size="lg">
        {day && <DayPanel key={`${row!.id}-${cell![1]}`} day={day} person={row!.name} viewer="hr" locked={stage === 'locked'} monthDays={row!.days} />}
      </Drawer>
      <ConfirmDialog
        open={dlg === 'freeze'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={`Freeze ${monthName} inputs?`}
        consequence={[
          "After freezing, employees' changes need an extra HR approval as late requests.",
          daysLeftText && `${daysLeftText} ${daysLeft.length > 1 ? "aren't" : "isn't"} over yet; punches for ${daysLeft.length > 1 ? 'them' : 'it'} still come in after the freeze.`,
          exceptions > 0 && `${exceptions} exceptions are still open and will block payroll approval.`,
        ].filter(Boolean).join(' ')}
        confirmLabel="Freeze inputs"
        onConfirm={() => { setStage('frozen'); setDlg(null); }}
      />
      <TypeToConfirmDialog
        open={dlg === 'lock' && !lockBlock}
        onOpenChange={(o) => !o && setDlg(null)}
        title={`Lock ${monthName} 2026 attendance`}
        consequence={`${rows.length} people · ${rows.length * monthDays.length} days · no open exceptions. Locked days can't be edited; corrections go to the next payroll as arrears or a reversal of unpaid days.`}
        objectName={`KAVERI TN ${monthName.slice(0, 3).toUpperCase()} 2026`}
        confirmLabel="Lock period"
        onConfirm={() => { setStage('locked'); setDlg(null); }}
      />
      {dlg === 'bulk' && (
        <BulkPresentDialog
          rows={rows.filter((r) => selected.includes(r.id))}
          monthDays={monthDays}
          today={today}
          onClose={() => setDlg(null)}
          onDone={(ids, date, reason) => {
            setRows(rows.map((r) => (ids.includes(r.id) ? { ...r, days: r.days.map((d) => (sameDay(d.date, date) ? { date: d.date, code: 'P', note: `Marked present by HR: ${reason}` } : d)) } : r)));
            setSelected([]);
            setDlg(null);
            setMsg(`Marked ${ids.length} ${ids.length === 1 ? 'person' : 'people'} present on ${shortDate(date)}`);
          }}
        />
      )}
    </TimePage>
  );
}

function BulkPresentDialog({ rows, monthDays, today, onClose, onDone }: { rows: MusterRow[]; /** The muster's month: only its days can be picked. */ monthDays: AttendanceDay[]; today: Date; onClose: () => void; onDone: (ids: string[], date: Date, reason: string) => void }) {
  // Starts on the day the Hosur Gate 2 reader was down (25 Sep; the Gate 1 kiosk's outage was 14–17 Sep, TIM-10) when it applies, else the first day a selected person needs fixing.
  const fixDays = rows.flatMap((r) => r.days).filter((d) => canMarkPresent(d.code)).map((d) => d.date).sort((a, b) => a.getTime() - b.getTime());
  const readerDown = fixDays.find((d) => sameDay(d, new Date(2026, 8, 25)));
  const [date, setDate] = useState<Date | null>(readerDown ?? fixDays[0] ?? null);
  const [reason, setReason] = useState(readerDown ? 'Biometric reader at Hosur Gate 2 was down 25 Sep; supervisor register attached.' : '');
  const last = monthDays[monthDays.length - 1].date;
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  // Each person's current code that day: only absent or missing-punch days change.
  const current = rows.map((r) => ({ r, d: date ? r.days.find((x) => sameDay(x.date, date)) : undefined }));
  const eligible = current.filter(({ d }) => d && canMarkPresent(d.code));
  const missing = rows.length === 0 ? 'Select at least one person.' : !date ? 'Choose the date.' : eligible.length === 0 ? 'Everyone selected already has attendance that day.' : !reason.trim() ? 'Add a reason.' : null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Mark ${eligible.length} ${eligible.length === 1 ? 'person' : 'people'} present${date ? ` on ${shortDate(date)}` : ''}`}
      size="md"
      footer={
        <>
          {missing && <span className="yx-tim-muted" style={FOOT_HINT}>{missing}</span>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!missing} onClick={() => date && onDone(eligible.map(({ r }) => r.id), date, reason.trim())}>Mark present</Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        {rows.length === 0 ? <p>No one selected.</p> : (
          <ul className="yx-tim-list" aria-label="Selected people">
            {current.map(({ r, d }) => (
              <li key={r.id}>
                <span>{r.name}</span>
                <span className="yx-tim-muted">{d ? `${DAY_CODE_LABEL[cellCode(d.code)]}${canMarkPresent(d.code) ? '' : ' · no change'}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
        <FormField label="Date" required>
          {/* Today isn't over: its punches are still coming in. */}
          <DatePicker value={date} onChange={setDate} min={monthDays[0].date} max={last < yesterday ? last : yesterday} />
        </FormField>
        <FormField label="Reason (saved in the audit log)" required>
          <TextArea value={reason} onChange={setReason} rows={3} />
        </FormField>
      </div>
    </Dialog>
  );
}

/* =====================================================================
   TIM-03 · Day card (desk drawer + phone sheet)
   ===================================================================== */

export interface DayCardScreenProps {
  persona?: Persona;
  day?: number;
  /** Whose day (default: Meera Krishnan, a report, for the manager; Divya otherwise, whom HR may also view). */
  person?: string;
}

export function DayCardScreen({ persona = 'emp', day = 22, person }: DayCardScreenProps) {
  const who = person ?? (persona === 'mgr' ? 'Meera Krishnan' : ME.name);
  const days = monthFor(who);
  const d = days[day - 1];
  const t = TEAM.find((p) => p.name === who);
  const reg = useRegularise();
  return (
    <TimePage active={persona === 'emp' ? 'My attendance' : 'Muster'} user={userFor(persona)}>
      <PageHeader
        title={persona === 'emp' ? 'My attendance' : `${who} · September 2026`}
        actions={persona === 'emp' ? undefined : <LinkButton to={persona === 'hr' ? STORY.muster : STORY.exceptionsMgr}>{persona === 'hr' ? 'Back to muster' : 'Back to exceptions'}</LinkButton>}
      />
      {reg.alert}
      <AttendanceMonth month={SEPTEMBER[0].date} days={days} selected={d.date} />
      <Drawer
        open
        onOpenChange={() => {}}
        title={`${who} · ${formatDate(d.date)}`}
        subtitle={persona === 'emp' ? 'Your day card' : persona === 'mgr' ? `${t?.role ?? ''} · reports to you` : t ? `${t.code} · ${t.role} · ${t.location}` : `${ME.code} · ${ME.role} · ${ME.location}`}
        size="lg"
      >
        <DayPanel day={d} person={who} viewer={persona} monthDays={days} onRegularise={reg.open} />
      </Drawer>
      {reg.node}
    </TimePage>
  );
}

export function DayCardPhone({ day = 10 }: { day?: number }) {
  const d = SEPTEMBER[day - 1];
  const reg = useRegularise();
  return (
    <PhoneFrame tab="time" title="My attendance">
      {reg.alert}
      <AttendanceMonth month={SEPTEMBER[0].date} days={SEPTEMBER} compact selected={d.date} />
      <BottomSheet open onOpenChange={() => {}} title={formatDate(d.date)}>
        <DayPanel day={d} person={ME.name} viewer="emp" monthDays={SEPTEMBER} onRegularise={reg.open} />
      </BottomSheet>
      {reg.node}
    </PhoneFrame>
  );
}

/* =====================================================================
   TIM-04 · Attendance exceptions queue
   ===================================================================== */

export interface ExceptionsProps {
  persona?: 'mgr' | 'hr';
  state?: ViewState;
  resolveOpen?: boolean;
  rows?: ExceptionRow[];
  /** Search pre-filled (e.g. opened from one person's calendar). */
  defaultSearch?: string;
  /** Status filter to start with (default Open and Request pending), e.g. ['Request pending'] from the TIM-11 checklist. */
  defaultStatus?: ExceptionRow['status'][];
}

const STATUS_TONE: Record<ExceptionRow['status'], BadgeTone> = { Open: 'danger', 'Request pending': 'warning', Resolved: 'success' };

/** How old an exception is: neutral within a week, red after. */
function AgeBadge({ date }: { date: Date }) {
  const r = relativeDue(date, TODAY);
  return <Badge tone={r.days < -7 ? 'danger' : 'neutral'}>{r.text}</Badge>;
}

export function ExceptionsScreen({ persona = 'hr', state: stateProp = 'ready', resolveOpen = false, rows = EXCEPTIONS, defaultSearch = '', defaultStatus = ['Open', 'Request pending'] }: ExceptionsProps) {
  const [state, retry] = useViewState(stateProp);
  const user = userFor(persona);
  // A manager sees only her reports, never her own rows (those are on My attendance). The empty story has none.
  const base = state === 'empty' ? [] : persona === 'mgr' ? rows.filter((r) => isMyReport(r.person)) : rows;
  const [done, setDone] = useState<string[]>([]);
  const scoped = base.map((r) => (done.includes(r.id) ? { ...r, status: 'Resolved' as const } : r));
  const [filters, setFilters] = useState<FilterValue[]>([{ key: 'status', type: 'multi', values: defaultStatus }]);
  const [search, setSearch] = useState(defaultSearch);
  const [selected, setSelected] = useState<string[]>([]);
  const [resolve, setResolve] = useState<ExceptionRow[] | null>(resolveOpen && base[0] ? [base[0]] : null);
  const [review, setReview] = useState<ExceptionRow | null>(null);
  const [nudged, setNudged] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const shown = useMemo(() => {
    const st = filters.find((f) => f.key === 'status');
    const kind = filters.find((f) => f.key === 'kind');
    const ok = (f: FilterValue | undefined, v: string) => !f || f.type !== 'multi' || f.values.length === 0 || f.values.includes(v);
    return scoped.filter((r) => ok(st, r.status) && ok(kind, r.kind) && r.person.toLowerCase().includes(search.toLowerCase()));
  }, [scoped, filters, search]);
  // Remind all acts only on the rows the table shows (a person search narrows it).
  const open = shown.filter((r) => r.status === 'Open');
  // Counted from the rows on screen (Open and Request pending), so the badge, the nav count and the "Blocks payroll" badges agree.
  const blocking = scoped.filter((r) => r.status !== 'Resolved' && r.blocking).length;
  const unnudged = open.filter((r) => !nudged.includes(r.id));
  const narrowed = !!search.trim();
  const nudgeOne = (r: ExceptionRow) => { setNudged([...nudged, r.id]); setMsg(`Reminder sent to ${firstName(r.person)}`); };
  const cols: TableColumn<ExceptionRow>[] = [
    { key: 'person', header: 'Employee', type: 'person', width: 220, value: (r) => r.person, person: (r) => ({ name: r.person, secondary: r.mode === 'Timesheet' ? `${r.code} · timesheet` : r.code }) },
    {
      key: 'date',
      header: 'Date',
      type: 'date',
      value: (r) => r.date,
      // flex 0 1 auto: the list's row flex-basis became a 256px height in phone cards.
      render: (r) => <span className="yx-tim-list__main" style={CELL}><span>{r.mode === 'Timesheet' ? `Week of ${shortDate(weekStart(r.date))}` : formatDate(r.date)}</span>{r.status !== 'Resolved' && <span><AgeBadge date={r.date} /></span>}</span>,
    },
    {
      key: 'kind',
      header: 'Exception',
      width: 300,
      // The key fact of each row: never auto-hidden at tablet width.
      hideable: false,
      value: (r) => r.kind,
      // Non-breaking hyphens keep "check-out" whole; the detail reads as plain words.
      render: (r) => <span className="yx-tim-list__main" style={CELL}><strong>{nbHyphen(r.kind)}</strong><span className="yx-tim-muted">{nbHyphen(plainDetail(r.detail))}</span></span>,
    },
    {
      key: 'status',
      header: 'Status',
      type: 'status',
      value: (r) => r.status,
      statusTone: (v) => STATUS_TONE[v as ExceptionRow['status']],
      render: (r) => (
        <span className="yx-tim-row">
          <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
          {r.status !== 'Resolved' && <Badge tone={r.blocking ? 'danger' : 'neutral'}>{r.blocking ? 'Blocks payroll' : 'Not blocking'}</Badge>}
        </span>
      ),
    },
    {
      key: 'nudged',
      header: 'Reminders sent',
      value: (r) => r.nudged + (nudged.includes(r.id) ? 1 : 0),
      render: (r) => { const n = r.nudged + (nudged.includes(r.id) ? 1 : 0); return n ? `${n} sent` : 'None yet'; },
      optional: true,
    },
  ];
  return (
    <TimePage active="Exceptions" user={user} counts={{ ...timeCounts(user), Exceptions: state === 'ready' && blocking ? blocking : undefined }}>
      <PageHeader
        title="Attendance exceptions"
        description={persona === 'hr' ? 'September 2026 · all locations · fix these before September payroll can be approved' :'September 2026 · your reports · fix these before September payroll can be approved'}
        status={state === 'ready' ? <Badge tone={blocking ? 'danger' : 'success'}>{blocking} blocking</Badge> : undefined}
        actions={
          <Button
            variant="primary"
            icon={Bell}
            disabled={state !== 'ready' || unnudged.length === 0}
            onClick={() => { setNudged([...nudged, ...unnudged.map((r) => r.id)]); setMsg(`Reminder sent to ${unnudged.length} ${unnudged.length === 1 ? 'person' : 'people'}`); }}
          >
            {open.length > 0 && unnudged.length === 0 ? 'Reminders sent today' : narrowed ? `Remind ${unnudged.length}` : 'Remind all'}
          </Button>
        }
      />
      {msg && <InlineAlert tone="success" title={msg} />}
      <FilterBar
        fields={[
          { key: 'status', label: 'Status', type: 'multi', options: ['Open', 'Request pending', 'Resolved'].map((v) => ({ value: v, label: v })) },
          { key: 'kind', label: 'Exception', type: 'multi', options: ['Missing check-out', 'Check-out outside office', 'Missing check-in', 'No attendance', 'Refused check-in attempt', 'Offline punch too old', 'No approved timesheet'].map((v) => ({ value: v, label: v })) },
        ]}
        value={filters}
        onChange={setFilters}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search people"
      />
      <DataTable
        label="Attendance exceptions"
        columns={cols}
        rows={state === 'empty' ? [] : shown}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        onRetry={retry}
        errorReference="EXC-2210"
        filtered={state !== 'empty' && (filters.length > 0 || !!search)}
        onClearFilters={() => { setFilters([]); setSearch(''); }}
        empty={<EmptyState title="No open exceptions" description="Every working day in September has punches, leave or an approved request. Payroll is not blocked by attendance." action={<LinkButton to={STORY.muster}>Open muster</LinkButton>} />}
        selectable={persona === 'hr'}
        selectedIds={selected}
        onSelectedChange={setSelected}
        bulkActions={(ids) => {
          const picked = scoped.filter((r) => ids.includes(r.id) && r.status === 'Open');
          return (
            <>
              <Button
                size="sm"
                disabled={!picked.length}
                onClick={() => {
                  setNudged([...nudged, ...picked.map((r) => r.id)]);
                  setSelected([]);
                  setMsg(`Reminder sent to ${picked.length} ${picked.length === 1 ? 'person' : 'people'}`);
                }}
              >
                Nudge {picked.length}
              </Button>
              <Button size="sm" disabled={!picked.length} onClick={() => setResolve(picked)}>Resolve {picked.length} with reason</Button>
            </>
          );
        }}
        rowButtons={(r) =>
          r.status === 'Resolved' ? null : r.status === 'Request pending' ? (
            // Only the approver reviews; HR watching a manager's request just views it (and can remind).
            persona === 'hr' && approverOf(r) !== HR_ADMIN.name
              ? <Button size="sm" onClick={() => setReview(r)}>View request</Button>
              : <Button size="sm" variant="review" onClick={() => setReview(r)}>Review request</Button>
          ) : persona === 'hr' ? (
            <Button size="sm" onClick={() => setResolve([r])}>Resolve</Button>
          ) : (
            <Button size="sm" disabled={nudged.includes(r.id)} onClick={() => nudgeOne(r)}>{nudged.includes(r.id) ? 'Nudged' : 'Nudge'}</Button>
          )
        }
      />
      <ResolveDialog
        key={resolve?.map((r) => r.id).join()}
        rows={resolve}
        onClose={() => setResolve(null)}
        onResolved={(ids) => { setDone([...done, ...ids]); setSelected([]); setMsg(`${ids.length} ${ids.length === 1 ? 'exception' : 'exceptions'} resolved`); }}
      />
      <RequestDialog row={review} viewer={persona} onClose={() => setReview(null)} onDone={(m, decided) => { if (review && decided) setDone([...done, review.id]); setMsg(m); }} />
    </TimePage>
  );
}

/** One person has a check-in on record: present is the likely answer. */
const hasCheckIn = (r: ExceptionRow) => r.kind !== 'No attendance' && r.kind !== 'Missing check-in' && r.kind !== 'No approved timesheet';

function ResolveDialog({ rows, onClose, onResolved }: { rows: ExceptionRow[] | null; onClose: () => void; onResolved?: (ids: string[]) => void }) {
  const one = rows?.length === 1 ? rows[0] : null;
  const refused = (r: ExceptionRow) => r.kind === 'Refused check-in attempt';
  // Present needs actual times, except for a refused check-in (the logged attempt is the time). Bulk: only when every row is a refused check-in.
  const canPresent = !!rows && (!!one || rows.every(refused));
  // A timesheet row covers a week and has no punches: no times to enter, and leave or pay is counted per working day.
  const sheet = !!one && one.mode === 'Timesheet';
  const weekDays = one && sheet ? SEPTEMBER.filter((d) => sameDay(weekStart(d.date), weekStart(one.date)) && d.code !== 'WO' && d.code !== 'H').length : 1;
  const daysText = `${weekDays} ${weekDays === 1 ? 'day' : 'working days'}`;
  const needTimes = !!one && !refused(one) && !sheet;
  const onRecord = one ? recordedIn(one.person, one.date)?.time ?? null : null;
  const [how, setHow] = useState(one && hasCheckIn(one) ? 'present' : '');
  const [inT, setInT] = useState<string | null>(onRecord);
  const [outT, setOutT] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const cl = one ? balancesFor(one.person).find((b) => b.code === 'CL') : undefined;
  const timesMissing = how === 'present' && needTimes ? (!inT ? 'Enter the check-in time.' : !outT ? 'Enter the check-out time.' : null) : null;
  const missing = !how ? 'Choose a resolution.' : timesMissing ?? (!reason.trim() ? 'Enter a reason.' : null);
  const content: ReactNode = rows && (
    <div className="yx-tim-stack">
      {!one && (
        <ul className="yx-tim-list">
          {rows.map((r) => <li key={r.id}><span>{r.person}</span><span className="yx-tim-muted">{rowDate(r)} · {r.kind}</span></li>)}
        </ul>
      )}
      <RadioGroup
        aria-label="Resolution"
        value={how}
        onChange={setHow}
        options={[
          ...(canPresent
            ? [sheet
              ? { value: 'present', label: 'Accept the week as worked', description: `All ${daysText} count as present; no times needed for a timesheet` }
              : { value: 'present', label: 'Present with approval', description: one && !refused(one) ? 'Enter the actual times below' : 'From the logged attempt: no late mark for a location failure' }]
            : []),
          { value: 'leave', label: 'Deduct leave', description: `${sheet ? `${daysText} · ` : ''}${cl ? `Casual leave first; ${firstName(one!.person)} has ${cl.balance} left` : 'Casual leave first'}` },
          { value: 'absent', label: 'Absent (unpaid)', description: sheet ? `${daysText}' pay deducted in September payroll` : "1 day's pay deducted in September payroll" },
        ]}
      />
      {how === 'present' && needTimes && (
        <div className="yx-tim-row">
          <FormField label="Check-in" required>
            <TimeField value={inT} onChange={setInT} />
          </FormField>
          <FormField label="Check-out" required>
            <TimeField value={outT} onChange={setOutT} placeholder={`Shift ends ${fmt12(shiftFor(one!.person).end)}`} />
          </FormField>
        </div>
      )}
      <FormField label="Reason" required helper="Saved in the audit history">
        <TextArea rows={3} value={reason} onChange={setReason} placeholder="For example: confirmed with the supervisor's gate register" />
      </FormField>
    </div>
  );
  return (
    <Dialog
      open={!!rows}
      onOpenChange={(o) => !o && onClose()}
      title={one ? `Resolve · ${one.person}, ${rowDate(one)}` : rows ? `Resolve ${rows.length} exceptions` : ''}
      description={one ? `${one.kind}: ${plainDetail(one.detail)}` : undefined}
      size="md"
      footer={
        <>
          {missing && <span className="yx-tim-muted" style={FOOT_HINT}>{missing}</span>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!missing} onClick={() => { onResolved?.(rows!.map((r) => r.id)); onClose(); }}>{one ? 'Resolve exception' : `Resolve ${rows?.length ?? 0}`}</Button>
        </>
      }
    >
      {content}
    </Dialog>
  );
}

/** Phone: manager's team exceptions with nudge (M04 Q5). */
export function ExceptionsPhone() {
  const rows = EXCEPTIONS.filter((r) => r.status === 'Open' && isMyReport(r.person));
  const [nudged, setNudged] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const left = rows.filter((r) => !nudged.includes(r.id));
  const remind = (ids: string[]) => {
    setNudged([...nudged, ...ids]);
    setMsg(`Reminder sent to ${ids.length} ${ids.length === 1 ? 'person' : 'people'}`);
  };
  return (
    <PhoneFrame tab="time" title="Team exceptions">
      <InlineAlert tone="warning" title={`${rows.length} open`}>September payroll is blocked until these are fixed.</InlineAlert>
      {msg && <InlineAlert tone="success" title={msg} />}
      <ul className="yx-tim-list">
        {rows.map((r) => (
          <li key={r.id}>
            <span className="yx-tim-list__main">
              <strong>{r.person}</strong>
              <span className="yx-tim-row"><span className="yx-tim-muted">{rowDate(r)} · {r.kind}</span><AgeBadge date={r.date} /></span>
            </span>
            {nudged.includes(r.id) ? <Badge tone="neutral">Nudged</Badge> : <Button size="sm" onClick={() => remind([r.id])}>Nudge</Button>}
          </li>
        ))}
      </ul>
      <Button variant="primary" fullWidth icon={Bell} disabled={left.length === 0} onClick={() => remind(left.map((r) => r.id))}>{left.length === 0 ? 'Reminders sent today' : 'Remind all'}</Button>
    </PhoneFrame>
  );
}
