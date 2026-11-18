// Attendance: web clock-in page, attendance calendar, Today board, muster, day card, exceptions.
// TIM-01, TIM-02, TIM-03, TIM-04 + founder extras "My attendance today" and "Attendance calendar".
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Bell, ChevronLeft, ChevronRight, Clock, Download, Lock, Snowflake } from 'lucide-react';
import { DesktopFrame, PhoneFrame } from '../_kit/frames';
import { Button, IconButton, SplitButton } from '../../components/button';
import { MenuItem } from '../../components/menu';
import { Segment } from '../../components/segment';
import { AttendanceDayList, AttendanceDayTable, type DayViewRow } from './attendance-views-live';
import { Badge, DayDate, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Pagination, Skeleton } from '../../components/feedback';
import { BottomSheet, ConfirmDialog, Dialog } from '../../components/overlay';
import { Breadcrumbs, Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar } from '../../components/filters';
import { RadioGroup, Switch } from '../../components/choice';
import { CodeField, TextArea, TimeField } from '../../components/inputs';
import { FormField, useTooEarly } from '../../components/field';
import { PersonPicker } from '../../components/select';
import { DatePicker } from '../../components/date';
import { useToast } from '../../components/notify';
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
import { AttendanceLegend, AttendanceMonth, ClockCard, DayCardBody, DueBadge, GeoMap, Kpis, NoRecordState, SOURCE_LABEL, TimePage, codeText, type ClockCardProps, type DayCardBodyProps } from './time-kit';
import { DAY_CODE_LABEL, daysUntil, fmt12, fmtDuration, lateMinutes, monthSummary, relativeDue, toHHMM, toMin, type AttendanceDay, type ClockState, type DayCode, type Punch } from './time-logic';
import { VISITS } from '../ops/visitors-data';
import { useRun } from '../org/org-kit';
import { AttendanceRequestSheet, OnDutySentBackSheet, OtPreApproveSheet, type OtPreApproveSample } from './requests';
import { MODE_TEXT } from './live/kit';
import type { DayCard, DayRow, ExceptionsList, LateCorrectionInput, TodayBoard, FixInput, FixRow, LoadState, Muster, MyAttendance, MyNightWork, NightCodeSent, PersonAttendance, Pin, PunchKind, PunchResult, PunchRow, ResolveInput, WfhInput, OnDutyInput, PermissionInput, OtPlanInput, OtPlanRow } from './live/types';
import './time.css';

export type ViewState = 'ready' | 'loading' | 'error' | 'empty';
export type Persona = 'emp' | 'mgr' | 'hr';

/** "Plant day shift" stays as it is; "General" becomes "General shift" (no "shift shift"). */
export const shiftLabel = (name: string) => (/(^|\s)shift$/i.test(name.trim()) ? name.trim() : `${name.trim()} shift`);

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
/** "22 Sep 2026": the house date, always with the year. */
const shortDate = formatDate;
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
function LinkButton({ to, args, size, href, children }: { to: string; args?: string; size?: 'sm'; /** Live: an app path instead of the story. */ href?: string; children: ReactNode }) {
  return <Button size={size} asChild><a href={href ?? storyHref(to, args)} target={href ? undefined : '_top'}>{children}</a></Button>;
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

/** "Done" messages are toasts (5 s), never a success alert; `tone` 'default' says why a button had nothing to do. */
function useSay() {
  const { toast } = useToast();
  return (title: string, tone: 'success' | 'default' = 'success') => { if (title) toast({ tone, title }); };
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
  // Send pressed too early: the missing field says so and takes focus (never a disabled Send).
  const [tried, setTried] = useState(false);
  const needIn = how === 'in' || how === 'full' || how === 'wrong';
  const needOut = !inProgress && (how === 'out' || how === 'full' || how === 'wrong');
  const timesOk = how === 'wrong' ? !!(inT || (needOut && outT)) : (!needIn || !!inT) && (!needOut || !!outT);
  const missing = !day ? 'Choose the date.' : !timesOk ? 'Enter the actual time.' : reason.trim().length < 10 ? 'Say why, in at least 10 characters.' : null;
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
          <Button variant="primary" onClick={() => { if (!missing && day) return onSent(day); setTried(true); document.getElementById(!day ? 'rg-date' : !timesOk ? 'rg-in' : 'rg-reason')?.focus(); }}>Send request</Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        <FormField id="rg-date" label="Date" required error={tried && !day ? 'Choose the date' : null}>
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
          <FormField id="rg-in" label="Actual check-in" required={how !== 'wrong' || !needOut} error={tried && day && !timesOk ? 'Enter the actual time' : null}>
            {/* A neutral example: the recorded time as placeholder looked like a value already entered. */}
            <TimeField value={inT} onChange={setInT} placeholder="e.g. 9:25 am" />
          </FormField>
        )}
        {needOut && (
          <FormField label="Actual check-out" required={how !== 'wrong'}>
            <TimeField value={outT} onChange={setOutT} placeholder="e.g. 6:35 pm" />
          </FormField>
        )}
        <FormField id="rg-reason" label="Reason" required error={tried && reason.trim().length < 10 ? (reason.trim() ? 'Say why, in at least 10 characters' : 'Add a reason') : null}>
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
  const say = useSay();
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
            say(`Request for ${shortDate(d)} sent to ${ME.manager}`);
          }}
        />
      )}
    </>
  );
  return { open, node, isSent, used };
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

/** The day card's working buttons (TIM-03); the app passes `live` and the card loads the day's real punches. */
function DayPanel(p: Parameters<typeof SampleDayPanel>[0] | { live: Parameters<typeof LiveDayPanel>[0] }) {
  return 'live' in p ? <LiveDayPanel {...p.live} /> : <SampleDayPanel {...p} />;
}

function SampleDayPanel({ day, person, viewer, locked, monthDays, onRegularise, punchNote }: { day: PDay; person: string; viewer: Persona; locked?: boolean; monthDays: AttendanceDay[]; onRegularise?: (d: Date, kind: FixKind) => void; /** WithNote: the note the person kept with the day's first punch. */ punchNote?: string }) {
  const setMsg = useSay();
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
      <DayCardBody
        day={day}
        punches={punchesFor(day, person).map((x, i) => (i === 0 && punchNote ? { ...x, note: punchNote } : x))}
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
      <RequestDialog row={request ? exceptionFor(person, day) : null} viewer={viewer} onClose={() => setRequest(false)} onDone={(m) => setMsg(m)} onWithdraw={() => { setRequest(false); setWithdraw(true); }} />
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

/** Extra · My attendance today. The app passes `live` (Me › Attendance › Today); stories show the sample. */
export function MyAttendanceTodayScreen(p: MyAttendanceTodayProps & { live?: LiveMyAttendance }) {
  return p.live ? <LiveAttendanceToday live={p.live} /> : <SampleAttendanceToday {...p} />;
}

function SampleAttendanceToday({ clock, regulariseOpen = false }: MyAttendanceTodayProps) {
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
                const label = shortDate(d.date);
                const text = d.code === 'TODAY' ? todayText : d.code === 'P' ? `Present · ${fmt12(mon[0].time)} – ${fmt12(mon[1].time)}` : d.code === 'H' ? `Holiday · ${d.note}` : 'General shift';
                return (
                  <li key={label}>
                    <DayDate date={d.date} />
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

/**
 * Extra · Attendance calendar. The app passes `live` (Me › Attendance) or `personLive` (Manager · one person, from the
 * muster); stories show the sample.
 */
export function AttendanceCalendarScreen(p: AttendanceCalendarProps & { live?: LiveMyAttendance; personLive?: LivePersonAttendance }) {
  if (p.personLive) return <LivePersonCalendar live={p.personLive} />;
  return p.live ? <LiveAttendanceCalendar live={p.live} /> : <SampleAttendanceCalendar {...p} />;
}

function SampleAttendanceCalendar({ persona = 'emp', defaultMonth = 'sep', openDay, state: stateProp = 'ready', person: personProp = 'Meera Krishnan' }: AttendanceCalendarProps) {
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
  const say = useSay();
  // At the first or last month the arrows stay clickable and say why they can't go further.
  const goMonth = (m: 'aug' | 'sep') => (!ready ? undefined : m === month ? say(m === 'aug' ? 'There is no attendance before August 2026.' : 'October 2026 has not started yet.', 'default') : (setMonth(m), setOpenN(null)));
  const firstPaid = days.find((d) => d.code === 'LOP') ?? days.find((d) => d.code !== 'WO' && d.code !== 'H');
  const toFix = monthSummary(days).toFix.filter((d) => !reg.isSent(d.date));
  // The fix-before-payroll alert carries the "Tomorrow" badge; the month bar doesn't repeat it.
  const fixAlert = persona === 'emp' && !locked && ready && toFix.length > 0;
  const [newReq, setNewReq] = useState(0);
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
            {ready && <Button icon={Download} onClick={() => exportMonth(who, monthLabel, days)}>Export month</Button>}
            {ready && persona === 'emp' && <Button onClick={() => setNewReq((n) => n + 1)}>New request</Button>}
            {ready && persona === 'emp' && <Button variant="primary" onClick={() => reg.open(null, 'wrong')}>Regularise a day</Button>}
          </div>
        }
      />
      {/* New request: the TIM-07 sheet (Regularise, WFH, On duty, OT pre-approval). */}
      {newReq > 0 && <AttendanceRequestSheet key={newReq} type="wfh" />}
      <div className="yx-tim-row yx-tim-monthnav">
        <IconButton icon={ChevronLeft} label="Previous month" variant="secondary" onClick={() => goMonth('aug')} />
        <h2 className="yx-tim-h2" aria-live="polite">{monthLabel}</h2>
        <IconButton icon={ChevronRight} label="Next month" variant="secondary" onClick={() => goMonth('sep')} />
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
        title={open ? <DayDate date={open.date} /> : ''}
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
  const say = useSay();
  const goMonth = (m: 'aug' | 'sep') => (m === month ? say(m === 'aug' ? 'There is no attendance before August 2026.' : 'October 2026 has not started yet.', 'default') : setMonth(m));
  const s = monthSummary(days);
  const firstPaid = days.find((d) => d.code === 'LOP');
  const waiting = days.filter((d) => d.code === 'R');
  const toFix = s.toFix.filter((d) => !reg.isSent(d.date));
  return (
    <PhoneFrame tab="time" title="My attendance">
      <div className="yx-tim-row yx-tim-monthnav">
        <IconButton icon={ChevronLeft} label="Previous month" variant="secondary" onClick={() => goMonth('aug')} />
        <h2 className="yx-tim-h2">{month === 'sep' ? 'Sep 2026' : 'Aug 2026'}</h2>
        <IconButton icon={ChevronRight} label="Next month" variant="secondary" onClick={() => goMonth('sep')} />
      </div>
      {locked && (
        <InlineAlert tone="info" title="August is locked" actions={firstPaid ? <Button size="sm" onClick={() => reg.open(firstPaid.date, 'full')}>Raise late request for {shortDate(firstPaid.date)}</Button> : undefined}>
          Pick a day to ask for a change. It goes as a late request; the effect lands in the {LATE_PAYROLL} payroll.
        </InlineAlert>
      )}
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
/** "No check-out 28 Sep 2026" from the open exception. */
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

/** TIM-01 · Today board. The app passes `live` (Time › Today); stories show the sample. */
export function TodayBoardScreen(p: TodayBoardProps & { live?: LiveTodayBoard }) {
  return p.live ? <LiveTodayBoardScreen live={p.live} /> : <SampleTodayBoard {...p} />;
}

function SampleTodayBoard({ persona = 'mgr', state: stateProp = 'ready', defaultTab = 'board', nudged }: TodayBoardProps) {
  const [state, retry] = useViewState(stateProp);
  const user = userFor(persona);
  const hr = persona === 'hr';
  const people = hr ? HR_BOARD : myReports();
  const [sent, setSent] = useState<string[]>(nudged ? [nudged] : []);
  const setNotice = useSay();
  // A story that starts with a nudge already sent shows the same toast a real click gives.
  useEffect(() => { if (nudged) setNotice('1 nudge sent'); }, [nudged]); // eslint-disable-line react-hooks/exhaustive-deps
  const nudge = (ids: string[]) => {
    setSent([...sent, ...ids]);
    setNotice(`${ids.length} ${ids.length === 1 ? 'nudge' : 'nudges'} sent`);
  };
  return (
    <TodayBoardView
      user={user}
      hr={hr}
      people={people}
      scope={hr ? 'Kaveri Foods Pvt Ltd (Tamil Nadu) · Chennai office and Hosur plant' : `Your reports (${people.length})`}
      nowText={NOW_TEXT}
      state={state}
      onRetry={retry}
      defaultTab={defaultTab}
      sent={sent}
      onNudge={nudge}
      blocking={{ count: timeCounts(user).Exceptions, month: 'September', cutoff: SEP_CUTOFF }}
      emptyWhere={hr ? 'at the Chennai office and Hosur plant' : 'in your team'}
    />
  );
}

/** One person on the board: the design's person, plus the live day they missed a check-out on (else the story's). */
/** `onSite` (live): checked in at a site and not checked out yet; assumed-present people have no check-in. */
type BoardPerson = TeamPerson & { missedOutOn?: string | null; onSite?: boolean };
/** Where the board's buttons go: story links in Storybook, app paths live (null: not built, so no button). */
interface BoardLinks { exceptions?: string | null; muster?: string | null; roster?: string | null; fieldMap?: string | null }

function TodayBoardView({ user, hr, people, scope, nowText, state, onRetry, defaultTab = 'board', sent, onNudge, blocking, emptyWhere, links, sites, visitors = true }: {
  user: ReturnType<typeof userFor>;
  hr: boolean;
  people: BoardPerson[];
  scope: string;
  nowText: ReactNode;
  state: ViewState;
  onRetry?: () => void;
  defaultTab?: 'board' | 'field' | 'onsite';
  sent: string[];
  onNudge: (ids: string[]) => void;
  blocking: { count: number; month: string; cutoff: Date };
  emptyWhere: string;
  links?: BoardLinks;
  /** On site now: the sites to list (default: the story's locations). */
  sites?: string[];
  /** Visitors signed in at reception (the Visitors module); live: not built yet. */
  visitors?: boolean;
}) {
  const setNotice = useSay();
  const count = (keys: BoardStatus[]) => countOf(people, keys);
  const toNudge = people.filter((p) => needsNudge(p) && !sent.includes(p.id));
  // Weekly off isn't rostered; the KPIs below add up to this number.
  const rostered = people.filter((p) => p.status !== 'off').length;
  const resting = count(['rest']);
  const missed = (p: BoardPerson) => (p.missedOutOn !== undefined ? (p.missedOutOn ? `No check-out ${shortDate(isoDay(p.missedOutOn))}` : 'No check-out yesterday') : missedOutText(p));
  const exceptionsLink = links ? links.exceptions : hr ? STORY.exceptionsHr : STORY.exceptionsMgr;
  // Shown on the board and on a day with no shifts: earlier days' exceptions still block payroll.
  const blockingAlert = blocking.count > 0 && (
    <InlineAlert
      tone="danger"
      title={<span className="yx-tim-row">{blocking.count} open exceptions block {blocking.month} payroll <DueBadge date={blocking.cutoff} /></span>}
      actions={exceptionsLink ? <LinkButton size="sm" to={exceptionsLink} href={links?.exceptions ?? undefined}>Open exceptions</LinkButton> : undefined}
    >
      Missing punches and absences {hr ? 'at your sites' : 'in your team'} need fixing before the {shortDate(blocking.cutoff)} cut-off.
    </InlineAlert>
  );
  return (
    <TimePage active="Today" user={user}>
      <PageHeader
        title="Today"
        description={state === 'empty' ? `${scope} · none rostered today` : <>{scope} · {nowText}</>}
        actions={
          <div className="yx-tim-row">
            {state === 'ready' && (
              <Button icon={Bell} onClick={() => (toNudge.length ? onNudge(toNudge.map((p) => p.id)) : setNotice('Everyone who is not in yet has been nudged today.', 'default'))}>
                {toNudge.length ? `Nudge ${toNudge.length} ${toNudge.length === 1 ? 'person' : 'people'}` : 'Everyone nudged'}
              </Button>
            )}
            {hr && (links ? links.muster : true) && <LinkButton to={STORY.muster} href={links?.muster ?? undefined}>Open muster</LinkButton>}
          </div>
        }
      />
      {state === 'loading' ? (
        <LoadingBlock rows={8} />
      ) : state === 'error' ? (
        <ErrorState title="Today's board didn't load" description="Punches are still being recorded. Try again in a moment." onRetry={onRetry} reference="TDY-19C0" />
      ) : state === 'empty' ? (
        <div className="yx-tim-stack">
          {blockingAlert}
          <EmptyState
            title="No one is rostered today"
            description={`No one ${emptyWhere} has a shift today. The board fills when a shift starts.`}
            action={(links ? links.roster : true) ? <LinkButton to={STORY.roster} href={links?.roster ?? undefined}>Open roster</LinkButton> : undefined}
          />
        </div>
      ) : (
        <Tabs defaultValue={defaultTab}>
          <TabsList aria-label="Today views">
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="field">Field</TabsTrigger>
            {hr && <TabsTrigger value="onsite">On site now</TabsTrigger>}
          </TabsList>
          <TabsContent value="board">
            <div className="yx-tim-stack">
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
                                {p.status === 'missing' && <Badge tone="danger">{missed(p)}</Badge>}
                                {sent.includes(p.id) ? <Badge tone="neutral">Nudged</Badge> : needsNudge(p) && <Button size="sm" onClick={() => onNudge([p.id])}>Nudge</Button>}
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
            <FieldSummary people={people} hr={hr} mapHref={links ? links.fieldMap : undefined} />
          </TabsContent>
          {hr && (
            <TabsContent value="onsite">
              <OnSiteNow people={people} sites={sites} visitors={visitors} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </TimePage>
  );
}

/* ---------- live: /time/today (TIM-01) ---------- */

/** A manager's team or HR's people (attendance.view in scope) today; nudges go to the server (once a day per person). */
export interface LiveTodayBoard {
  state: LoadState;
  onRetry?: () => void;
  data: TodayBoard | null;
  onNudge: (employeeId: string) => Promise<unknown>;
  links: BoardLinks;
}

const LIVE_BOARD: Record<TodayBoard['people'][number]['status'], TeamPerson['status']> = { in: 'in', late: 'late', missing: 'missing', not_in: 'not_in', leave: 'leave', wfh: 'wfh', od: 'od', off: 'off', rest: 'off' };

function LiveTodayBoardScreen({ live }: { live: LiveTodayBoard }) {
  const d = live.data;
  const say = useSay();
  const [sent, setSent] = useState<string[]>([]);
  const people: BoardPerson[] = (d?.people ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code ?? '',
    role: p.role,
    dept: p.dept,
    location: p.status === 'in' || p.status === 'late' || p.status === 'missing' ? p.site : p.location,
    status: LIVE_BOARD[p.status],
    ...(p.inAt ? { inAt: p.inAt } : {}),
    ...(p.detail ? { detail: p.detail } : {}),
    ...(p.source ? { source: p.source } : {}),
    mode: p.mode,
    reportsTo: '',
    missedOutOn: p.missedOutOn,
    onSite: p.onSite,
  }));
  const nudged = [...new Set([...sent, ...(d?.people ?? []).filter((p) => p.nudged).map((p) => p.id)])];
  const nudge = async (ids: string[]) => {
    let ok = 0;
    const refused: string[] = [];
    for (const id of ids) {
      try {
        await live.onNudge(id);
        ok++;
      } catch (e) {
        refused.push(e instanceof Error ? e.message : 'Not sent');
      }
    }
    setSent((s) => [...s, ...ids]);
    if (ok) say(`${ok} ${ok === 1 ? 'nudge' : 'nudges'} sent`);
    if (refused.length) say(refused[0], 'default');
  };
  const at = d ? new Date(d.at) : new Date();
  // House rule 8: the weekday is its own small label (DayDate), the date reads "29 Oct 2026", then the time.
  const nowText = <span style={{ whiteSpace: 'nowrap' }}><DayDate date={isoDay(d?.today ?? isoOf(at))} /> · {fmt12(at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }))}</span>;
  const scope = !d ? '' : d.scope === 'team' ? `Your reports (${people.length})` : d.scope === 'company' ? `Everyone (${people.length})` : `The people you look after (${people.length})`;
  const state: ViewState = live.state === 'ready' ? (people.filter((p) => p.status !== 'off').length ? 'ready' : 'empty') : live.state === 'loading' ? 'loading' : 'error';
  if (live.state === 'no-access') return <TimePage active="Today"><PageHeader title="Today" /><NoAccessState grantedBy="HR" what="today's board" /></TimePage>;
  return (
    <TodayBoardView
      user={HR_ADMIN}
      hr={d?.scope !== 'team'}
      people={people}
      scope={scope}
      nowText={nowText}
      state={state}
      onRetry={live.onRetry}
      sent={nudged}
      onNudge={(ids) => void nudge(ids)}
      blocking={{ count: d?.blocking ?? 0, month: d ? MONTH_LONG[Number(d.month.slice(5, 7)) - 1] : '', cutoff: isoDay(d?.lockableFrom ?? isoOf(new Date())) }}
      emptyWhere={d?.scope === 'team' ? 'in your team' : 'in your scope'}
      links={live.links}
      sites={[...new Set(people.filter((p) => ['in', 'late', 'missing'].includes(p.status)).map((p) => p.location))]}
      visitors={false}
    />
  );
}

/** Employees checked in at each site now (same people as the board), plus visitors signed in (Visitors module). */
function OnSiteNow({ people, sites: liveSites, visitors = true }: { people: BoardPerson[]; sites?: string[]; visitors?: boolean }) {
  const here = people.filter((p) => (p.onSite ?? ['in', 'late', 'missing'].includes(p.status)) && p.inAt);
  // Live: visitors come from the Visitors module, which is not built yet, so only employees are listed.
  const guests = visitors ? VISITS.filter((v) => v.status === 'On site') : [];
  const sites = (liveSites ?? LOCATIONS.map((l) => l.name)).filter((s) => here.some((p) => p.location === s) || guests.some((v) => v.location === s));
  const at12 = (d: Date) => fmt12(toHHMM(d.getHours() * 60 + d.getMinutes()));
  return (
    <div className="yx-tim-stack">
      <p className="yx-tim-muted">{visitors ? 'For emergencies: employees checked in at each site, plus visitors signed in at reception.' : 'For emergencies: employees checked in at each site and not checked out yet.'}</p>
      {sites.length === 0 && <EmptyState compact title="No one is on site now" description="People show here once they check in at a site." />}
      {sites.map((site) => {
        const emp = here.filter((p) => p.location === site);
        const vis = guests.filter((v) => v.location === site);
        return (
          <Card key={site} title={`On site now · ${site}`}>
            <Kpis items={[{ label: 'Employees in', value: emp.length }, ...(visitors ? [{ label: 'Visitors on site', value: vis.length }] : [])]} />
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

function FieldSummary({ people, hr, mapHref }: { people: TeamPerson[]; hr?: boolean; /** Live: the field-force map is not built yet (null: no button). */ mapHref?: string | null }) {
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
          {mapHref !== null && <LinkButton size="sm" to={hr ? STORY.fieldHr : STORY.fieldMgr} href={mapHref}>Open field map</LinkButton>}
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
  const setNotice = useSay();
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
      <Button icon={Bell} fullWidth onClick={() => (toNudge.length ? nudge(toNudge.map((p) => p.id)) : setNotice('Everyone who is not in yet has been nudged today.', 'default'))}>
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
const MUSTER_CODES: DayCode[] = ['P', 'WFH', 'OD', 'HD', 'CL', 'EL', 'SL', 'LV', 'H', 'WO', 'ST', 'LO', 'LF', 'A', 'LOP', 'MP', 'MI', 'R', 'TODAY', 'FUT'];
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
  /** Manager: their team only, no period or bulk actions; "Pre-approve overtime" for a report. */
  persona?: 'hr' | 'mgr';
  /** Manager: the Pre-approve overtime sheet open in one of its states. */
  preApprove?: OtPreApproveSample;
}

/** TIM-02 · Muster. The app passes `live` (Time › Muster); stories show the sample. */
export function MusterScreen(p: MusterProps & { live?: LiveMusterData }) {
  return p.live ? <LiveMusterScreen live={p.live} /> : <SampleMusterScreen {...p} />;
}

function SampleMusterScreen({ stage: stageProp = 'open', state: stateProp = 'ready', month = 'sep', openCell, dialog = null, defaultSelected = [], resolved: resolvedProp = false, asOf, persona = 'hr', preApprove }: MusterProps) {
  const mgr = persona === 'mgr';
  const [otSheet, setOtSheet] = useState(preApprove ?? null);
  const today = asOf ?? TODAY;
  const [state, retry] = useViewState(stateProp);
  const [stage, setStage] = useState(stageProp);
  // August is paid and closed; September's exceptions are open unless the story says resolved.
  const resolved = resolvedProp || month === 'aug' || stage === 'locked';
  // A manager's muster is their own row and their reports (TIM-02, YX-AT-14).
  const [rows, setRows] = useState(() => musterRows(month, resolved).filter((r) => !mgr || r.name === ME.name || isMyReport(r.name)));
  const [cell, setCell] = useState<[string, number] | null>(openCell ?? null);
  const [dlg, setDlg] = useState(dialog);
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [monthOf, setMonthOf] = useState<string | null>(null);
  const setMsg = useSay();
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
  // Days from today to the cut-off that aren't over yet ("29 and 30 Sep 2026").
  const daysLeft = cutoffPassed ? [] : monthDays.filter((d) => daysUntil(d.date, today) >= 0 && daysUntil(d.date, cutoff) <= 0).map((d) => d.date.getDate());
  const daysLeftText = daysLeft.length > 1 ? `${daysLeft.slice(0, -1).join(', ')} and ${daysLeft[daysLeft.length - 1]} ${MONTHS[cutoff.getMonth()]} ${cutoff.getFullYear()}` : daysLeft.length ? shortDate(cutoff) : '';
  const ready = state === 'ready' && shown.length > 0;
  const toggle = (id: string, on: boolean) => setSelected(on ? [...selected, id] : selected.filter((x) => x !== id));
  const sheetRow = monthOf ? rows.find((r) => r.id === monthOf) : null;
  const openExceptions = <LinkButton size="sm" to={STORY.exceptionsHr}>Open exceptions</LinkButton>;
  // Bulk "mark present" only when the month has absent or missing-punch days to mark (a closed August has none).
  const bulkable = !mgr && stage !== 'locked' && shown.some((r) => r.days.some((d) => canMarkPresent(d.code)));
  // Open on the latest days, where most of the open exceptions are (names and totals stay pinned).
  useEffect(() => {
    const g = gridRef.current;
    if (g) g.scrollLeft = g.scrollWidth;
  }, [narrow, state]);
  return (
    <TimePage active="Muster" user={userFor(persona)} counts={resolved || state === 'empty' ? { ...timeCounts(userFor(persona)), Exceptions: 0 } : undefined}>
      <PageHeader
        title={`Muster · ${monthName} 2026`}
        description={mgr ? `Your team${state === 'ready' ? ` · ${shown.length - 1} people and you` : ''}` : `Kaveri Foods Pvt Ltd (Tamil Nadu) · Chennai office and Hosur plant${state === 'ready' ? ` · ${shown.length} people` : ''}${asOf ? ` · as on ${shortDate(asOf)}` : ''}`}
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
            {ready && <Button icon={Download} onClick={() => downloadCsv(`muster-${monthName.toLowerCase()}-2026.csv`, [['Employee', 'Code', 'Payable', 'Unpaid', 'Late', 'OT h', ...monthDays.map((d) => String(d.date.getDate()))], ...shown.map((r) => { const s = monthSummary(r.days); return [r.name, r.code, s.payable, s.lop, s.lateMarks, s.otHours, ...r.days.map((d) => codeText(cellCode(d.code)))]; })])}>Export</Button>}
            {mgr && ready && <Button icon={Clock} onClick={() => setOtSheet('default')}>Pre-approve overtime</Button>}
            {!mgr && stage === 'open' && ready && <Button icon={Snowflake} onClick={() => setDlg('freeze')}>Freeze inputs</Button>}
            {/* Not ready to lock: pressed, it says why (the alert below says it too). */}
            {!mgr && stage === 'frozen' && <Button variant="primary" icon={Lock} onClick={() => (lockBlock ? setMsg(`${lockBlock}.`, 'default') : setDlg('lock'))}>Lock period</Button>}
          </div>
        }
      />
      {stage !== 'open' && (
        <InlineAlert
          tone={stage === 'frozen' && exceptions > 0 ? 'warning' : 'info'}
          title={stage === 'frozen' ? (exceptions > 0 ? `Inputs are frozen · ${exceptions} open exceptions` : 'Inputs are frozen') : `${monthName} 2026 is locked`}
          actions={stage === 'frozen' && exceptions > 0 ? openExceptions : undefined}
        >
          {/* Why Lock period cannot be pressed yet sits here, not beside the header buttons, so the title keeps its room. */}
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
          <MusterGrid rows={shown} monthDays={monthDays} monthName={monthName} today={today} narrow={narrow} gridRef={gridRef} bulkable={bulkable} selected={selected} onToggle={toggle} cell={cell} onCell={setCell} onMonthOf={setMonthOf} />
        </>
      )}
      <BottomSheet open={!!sheetRow} onOpenChange={(o) => !o && setMonthOf(null)} title={sheetRow ? `${sheetRow.name} · ${monthName}` : ''}>
        {sheetRow && <AttendanceMonth month={monthDays[0].date} days={sheetRow.days} compact onDayClick={(d) => { setMonthOf(null); setCell([sheetRow.id, d.date.getDate() - 1]); }} />}
      </BottomSheet>
      <Drawer open={!!day} onOpenChange={(o) => !o && setCell(null)} title={day ? `${row!.name} · ${formatDate(day.date)}` : ''} subtitle="Day card" size="lg">
        {day && <DayPanel key={`${row!.id}-${cell![1]}`} day={day} person={row!.name} viewer={mgr ? 'mgr' : 'hr'} locked={stage === 'locked'} monthDays={row!.days} />}
      </Drawer>
      {otSheet && <OtPreApproveSheet key={otSheet} sample={otSheet} />}
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
      {/* Founder decision (29 Oct 2026): a plain confirm, then the authenticator step, as on Periods (no typed name). */}
      <ConfirmDialog
        open={dlg === 'lock' && !lockBlock}
        onOpenChange={(o) => !o && setDlg(null)}
        title={`Lock ${monthName} 2026 attendance?`}
        consequence={`${rows.length} people · ${rows.length * monthDays.length} days · no open exceptions. Locked days can't be edited; corrections go to the next payroll as arrears or a reversal of unpaid days. You'll be asked to confirm it's you.`}
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

/** The muster grid (desk table with pinned names and totals, phone cards), its legend and note: the story and the live muster. */
function MusterGrid({ rows: shown, monthDays, monthName, today, narrow, gridRef, bulkable, selected, onToggle: toggle, cell, onCell: setCell, onMonthOf: setMonthOf, note }: {
  rows: MusterRow[];
  monthDays: AttendanceDay[];
  monthName: string;
  today: Date;
  narrow: boolean;
  gridRef: RefObject<HTMLDivElement>;
  bulkable: boolean;
  selected: string[];
  onToggle: (id: string, on: boolean) => void;
  cell: [string, number] | null;
  onCell: (c: [string, number]) => void;
  onMonthOf?: (id: string) => void;
  note?: string;
}) {
  const usedCodes = MUSTER_CODES.filter((c) => shown.some((r) => r.days.some((d) => cellCode(d.code) === c)));
  return (
    <>
          {narrow ? (
            <div className="yx-tim-stack">
              {shown.map((r) => {
                const s = monthSummary(r.days, today);
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
                      <Button size="sm" onClick={() => setMonthOf?.(r.id)}>View month</Button>
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
                    const s = monthSummary(r.days, today);
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
          <p className="yx-tim-note">{note ?? '"late" = arrived after the 10-minute grace · "OT" = overtime worked. Unpaid = days already deducted as unpaid leave. Absent days stay out of Payable until they are fixed.'}</p>
    </>
  );
}

function BulkPresentDialog({ rows, monthDays, today, onClose, onDone }: { rows: MusterRow[]; /** The muster's month: only its days can be picked. */ monthDays: AttendanceDay[]; today: Date; onClose: () => void; onDone: (ids: string[], date: Date, reason: string) => void }) {
  // Starts on the day the Hosur Gate 2 reader was down (25 Sep; the Gate 1 kiosk's outage was 14–17 Sep, TIM-10) when it applies, else the first day a selected person needs fixing.
  const fixDays = rows.flatMap((r) => r.days).filter((d) => canMarkPresent(d.code)).map((d) => d.date).sort((a, b) => a.getTime() - b.getTime());
  const readerDown = fixDays.find((d) => sameDay(d, new Date(2026, 8, 25)));
  const [date, setDate] = useState<Date | null>(readerDown ?? fixDays[0] ?? null);
  const [reason, setReason] = useState(readerDown ? 'Biometric reader at Hosur Gate 2 was down 25 Sep; supervisor register attached.' : '');
  const [tried, setTried] = useState(false);
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
          <Button variant="primary" onClick={() => { if (!missing && date) return onDone(eligible.map(({ r }) => r.id), date, reason.trim()); setTried(true); document.getElementById(!date || !eligible.length ? 'bp-date' : 'bp-reason')?.focus(); }}>Mark present</Button>
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
        <FormField id="bp-date" label="Date" required error={tried && !date ? 'Choose the date' : tried && !eligible.length ? 'Everyone selected already has attendance that day' : null}>
          {/* Today isn't over: its punches are still coming in. */}
          <DatePicker value={date} onChange={setDate} min={monthDays[0].date} max={last < yesterday ? last : yesterday} />
        </FormField>
        <FormField id="bp-reason" label="Reason (saved in the audit log)" required error={tried && !reason.trim() ? 'Add a reason' : null}>
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
  /** WithNote: a note kept with the day's first punch, shown under it in the punch list. */
  punchNote?: string;
}

export function DayCardScreen({ persona = 'emp', day = 22, person, punchNote }: DayCardScreenProps) {
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
      <AttendanceMonth month={SEPTEMBER[0].date} days={days} selected={d.date} />
      <Drawer
        open
        onOpenChange={() => {}}
        title={`${who} · ${formatDate(d.date)}`}
        subtitle={persona === 'emp' ? 'Your day card' : persona === 'mgr' ? `${t?.role ?? ''} · reports to you` : t ? `${t.code} · ${t.role} · ${t.location}` : `${ME.code} · ${ME.role} · ${ME.location}`}
        size="lg"
      >
        <DayPanel day={d} person={who} viewer={persona} monthDays={days} onRegularise={reg.open} punchNote={punchNote} />
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

/** TIM-04 · Attendance exceptions. The app passes `live` (Time › Exceptions); stories show the sample. */
export function ExceptionsScreen(p: ExceptionsProps & { live?: LiveExceptions }) {
  return p.live ? <LiveExceptionsScreen live={p.live} /> : <SampleExceptionsScreen {...p} />;
}

function SampleExceptionsScreen({ persona = 'hr', state: stateProp = 'ready', resolveOpen = false, rows = EXCEPTIONS, defaultSearch = '', defaultStatus = ['Open', 'Request pending'] }: ExceptionsProps) {
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
  const setMsg = useSay();
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
            onClick={() => state !== 'ready' ? undefined : !unnudged.length ? setMsg('Everyone with an open exception has been reminded today.', 'default') : (setNudged([...nudged, ...unnudged.map((r) => r.id)]), setMsg(`Reminder sent to ${unnudged.length} ${unnudged.length === 1 ? 'person' : 'people'}`))}
          >
            {open.length > 0 && unnudged.length === 0 ? 'Reminders sent today' : narrowed ? `Remind ${unnudged.length}` : 'Remind all'}
          </Button>
        }
      />
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
                onClick={() => {
                  if (!picked.length) return setMsg('Select people with an open exception.', 'default');
                  setNudged([...nudged, ...picked.map((r) => r.id)]);
                  setSelected([]);
                  setMsg(`Reminder sent to ${picked.length} ${picked.length === 1 ? 'person' : 'people'}`);
                }}
              >
                Nudge {picked.length}
              </Button>
              <Button size="sm" onClick={() => (picked.length ? setResolve(picked) : setMsg('Select people with an open exception.', 'default'))}>Resolve {picked.length} with reason</Button>
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
            <Button size="sm" onClick={() => (nudged.includes(r.id) ? setMsg(`${firstName(r.person)} was already reminded today.`, 'default') : nudgeOne(r))}>{nudged.includes(r.id) ? 'Nudged' : 'Nudge'}</Button>
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

/** The live app's resolve: the check-in on record, the shift end, and the call (it closes on success; a refusal stays). */
interface LiveResolve {
  recordedIn: string | null;
  shiftEnd: string;
  onSubmit: (how: 'present' | 'absent', inMinute: number | undefined, outMinute: number | undefined, reason: string) => Promise<unknown>;
}

function ResolveDialog({ rows, onClose, onResolved, live }: { rows: ExceptionRow[] | null; onClose: () => void; onResolved?: (ids: string[]) => void; live?: LiveResolve }) {
  const one = rows?.length === 1 ? rows[0] : null;
  const refused = (r: ExceptionRow) => r.kind === 'Refused check-in attempt';
  // Present needs actual times, except for a refused check-in (the logged attempt is the time). Bulk: only when every row is a refused check-in.
  const canPresent = !!rows && (!!one || rows.every(refused));
  // A timesheet row covers a week and has no punches: no times to enter, and leave or pay is counted per working day.
  const sheet = !!one && one.mode === 'Timesheet';
  const weekDays = one && sheet ? SEPTEMBER.filter((d) => sameDay(weekStart(d.date), weekStart(one.date)) && d.code !== 'WO' && d.code !== 'H').length : 1;
  const daysText = `${weekDays} ${weekDays === 1 ? 'day' : 'working days'}`;
  const needTimes = !!one && !refused(one) && !sheet;
  const onRecord = live ? live.recordedIn : one ? recordedIn(one.person, one.date)?.time ?? null : null;
  const { busy, error, run } = useRun();
  const [how, setHow] = useState(one && hasCheckIn(one) ? 'present' : '');
  const [inT, setInT] = useState<string | null>(onRecord);
  const [outT, setOutT] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const cl = one && !live ? balancesFor(one.person).find((b) => b.code === 'CL') : undefined;
  const timesMissing = how === 'present' && needTimes ? (!inT ? 'Enter the check-in time.' : !outT ? 'Enter the check-out time.' : null) : null;
  const missing = !how ? 'Choose a resolution.' : timesMissing ?? (!reason.trim() ? 'Enter a reason.' : null);
  const content: ReactNode = rows && (
    <div className="yx-tim-stack">
      {!one && (
        <ul className="yx-tim-list">
          {rows.map((r) => <li key={r.id}><span>{r.person}</span><span className="yx-tim-muted">{rowDate(r)} · {r.kind}</span></li>)}
        </ul>
      )}
      <div id="rs-how" tabIndex={-1}>
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
            // Live: deducting leave is not built yet (the leave API takes no HR leave on someone's behalf), so it is not offered.
            ...(live ? [] : [{ value: 'leave', label: 'Deduct leave', description: `${sheet ? `${daysText} · ` : ''}${cl ? `Casual leave first; ${firstName(one!.person)} has ${cl.balance} left` : 'Casual leave first'}` }]),
            { value: 'absent', label: 'Absent (unpaid)', description: live ? "The day's pay is deducted in this month's payroll" : sheet ? `${daysText}' pay deducted in September payroll` : "1 day's pay deducted in September payroll" },
          ]}
        />
      </div>
      {how === 'present' && needTimes && (
        <div className="yx-tim-row">
          <FormField id="rs-in" label="Check-in" required error={tried && !inT ? 'Enter the check-in time' : null}>
            <TimeField value={inT} onChange={setInT} />
          </FormField>
          <FormField id="rs-out" label="Check-out" required error={tried && !outT ? 'Enter the check-out time' : null}>
            <TimeField value={outT} onChange={setOutT} placeholder={`Shift ends ${fmt12(live ? live.shiftEnd : shiftFor(one!.person).end)}`} />
          </FormField>
        </div>
      )}
      {error && <InlineAlert tone="danger" title="Not resolved">{error}</InlineAlert>}
      <FormField id="rs-reason" label="Reason" required helper="Saved in the audit history" error={tried && !reason.trim() ? 'Enter a reason' : null}>
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
          <Button
            variant="primary"
            loading={busy === 'resolve'}
            onClick={() => {
              if (missing) {
                setTried(true);
                document.getElementById(!how ? 'rs-how' : timesMissing ? (inT ? 'rs-out' : 'rs-in') : 'rs-reason')?.focus();
                return;
              }
              if (!live) {
                onResolved?.(rows!.map((r) => r.id));
                return onClose();
              }
              const times = how === 'present' && needTimes && inT && outT ? { inMinute: toMin(inT), outMinute: toMin(outT) } : { inMinute: undefined, outMinute: undefined };
              void run('resolve', async () => {
                await live.onSubmit(how as 'present' | 'absent', times.inMinute, times.outMinute, reason.trim());
                onResolved?.(rows!.map((r) => r.id));
                onClose();
              });
            }}
          >
            {one ? 'Resolve exception' : `Resolve ${rows?.length ?? 0}`}
          </Button>
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
  const setMsg = useSay();
  const left = rows.filter((r) => !nudged.includes(r.id));
  const remind = (ids: string[]) => {
    setNudged([...nudged, ...ids]);
    setMsg(`Reminder sent to ${ids.length} ${ids.length === 1 ? 'person' : 'people'}`);
  };
  return (
    <PhoneFrame tab="time" title="Team exceptions">
      <InlineAlert tone="warning" title={`${rows.length} open`}>September payroll is blocked until these are fixed.</InlineAlert>
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
      <Button variant="primary" fullWidth icon={Bell} onClick={() => (left.length ? remind(left.map((r) => r.id)) : setMsg('Everyone was reminded today.', 'default'))}>{left.length === 0 ? 'Reminders sent today' : 'Remind all'}</Button>
    </PhoneFrame>
  );
}

/* =====================================================================
   Live (the app): the designs above on the person's real data. The web pages pass `live`; stories keep the samples.
   ===================================================================== */

/** What Me › Attendance gets from the app: my month, punches, requests and night work, and the calls behind them. */
export interface LiveMyAttendance {
  state: LoadState;
  onRetry?: () => void;
  data: MyAttendance | null;
  /** "2026-10" */
  month: string;
  onMonth: (month: string) => void;
  /** The browser's location, or null with the reason (permission refused, no GPS). */
  getLocation: () => Promise<{ pin: Pin | null; problem?: string }>;
  /** `wfh`: ChoseWfh, clocking in from outside the office as work from home today (a request goes to the manager). `note`: WithNote. */
  onPunch: (kind: PunchKind, pin: Pin | null, opts?: { wfh?: boolean; note?: string }) => Promise<PunchResult>;
  /** DeviceNotApproved: ask HR to approve this computer for web clock-in (POST /time/me/web-device). */
  onAskDevice?: () => Promise<unknown>;
  onFix: (input: FixInput) => Promise<unknown>;
  onWithdrawFix: (id: string) => Promise<unknown>;
  /** A day card with every punch of that day (TIM-03). */
  onOpenDay: (on: string) => Promise<DayCard>;
  /** Request work from home (TIM-07); without it only regularising is offered. */
  onWfh?: (input: WfhInput) => Promise<unknown>;
  /** TIM-07 OnDuty: a day or part of one on duty away from the office (or sent again after changes). */
  onOnDuty?: (input: OnDutyInput) => Promise<unknown>;
  /** Batch A item 7 (B4): an hourly permission on a working day (never uses leave). */
  onPermission?: (input: PermissionInput) => Promise<unknown>;
  /** TIM-07 Ot: overtime asked for ahead; and withdrawing one still waiting. */
  onOtPlan?: (input: OtPlanInput) => Promise<unknown>;
  onWithdrawOtPlan?: (id: string) => Promise<unknown>;
  /** TIM-07 LateRequest: a day of a frozen or locked month goes as a late correction, paid in the next payroll. */
  onLateCorrection?: (input: LateCorrectionInput) => Promise<unknown>;
  /** Answer 2282: the company's leave types for a late request's "it was this leave". */
  leaveTypes?: { code: string; name: string }[];
  /** Open the request sheet at once (Home's "Request work from home" links here). */
  defaultRequest?: 'wfh' | 'regularise';
  /** Night work (founder decisions 9 Oct 2026): shown when loaded. */
  night?: MyNightWork | null;
  onNightOptIn?: (optIn: boolean) => Promise<unknown>;
  onNightCode?: (consentId: string) => Promise<NightCodeSent>;
  onNightConfirm?: (consentId: string, code: string) => Promise<unknown>;
  onNightWithdraw?: (consentId: string) => Promise<unknown>;
  /** The clock page and the month calendar link to each other. */
  todayHref?: string;
  monthHref?: string;
  /** The time now (tests); default the real clock. */
  now?: Date;
}

/** Manager · one person (Extra · Attendance calendar): one of my team's months; the server answers 404 outside my scope. */
export interface LivePersonAttendance {
  state: LoadState;
  onRetry?: () => void;
  data: PersonAttendance | null;
  /** "2026-10" */
  month: string;
  onMonth: (month: string) => void;
  /** The people the viewer may open (the muster's list: a manager's team). */
  people: { id: string; name: string; role?: string }[];
  onPick: (employeeId: string) => void;
  /** The person's day card (TIM-03). */
  onOpenDay: (on: string) => Promise<DayCard>;
  musterHref: string;
  /** TIM-04 exceptions, searched for this person. */
  exceptionsHref?: string;
}

/** What the muster gets from the app (TIM-02): the people in my scope this month, and a day card per cell. */
export interface LiveMusterData {
  state: LoadState;
  onRetry?: () => void;
  data: Muster | null;
  /** "2026-10": the month shown, and moving to another (the top bar has no month here). */
  month: string;
  onMonth: (month: string) => void;
  /** The person's day card (TIM-03). */
  onOpenDay: (employeeId: string, on: string) => Promise<DayCard>;
  /** Today in the company's zone, "2026-10-29" (default: the browser's date). */
  today?: string;
  /** TIM-02 period stage actions (each checked again on the server; lock and approve ask for the second step). */
  onFreeze?: (legalEntityId: string, month: string) => Promise<unknown>;
  onLock?: (legalEntityId: string, month: string) => Promise<unknown>;
  onSend?: (legalEntityId: string, month: string) => Promise<unknown>;
  onApproveLock?: (legalEntityId: string, month: string) => Promise<unknown>;
  /** TIM-02 bulk: mark the ticked people present on one date with a reason. */
  onMarkPresent?: (employeeIds: string[], on: string, reason: string) => Promise<unknown>;
  /** TIM-03 HrFix and pending overtime on the day card. */
  onResolve?: (input: ResolveInput) => Promise<unknown>;
  onDecideOt?: (claimId: string, decision: 'approve' | 'reject' | 'comp_off', reason?: string) => Promise<unknown>;
  /** Where "Open exceptions" goes (TIM-04). */
  exceptionsHref?: string;
  /** Manager · one person: the person's month page (opened from their day card). */
  personHref?: (employeeId: string, month: string) => string;
  /** TIM-02 Manager · Pre-approve overtime for a report (approved at once); offered on a team muster that has reports. */
  onPreApproveOt?: (employeeId: string, input: OtPlanInput) => Promise<unknown>;
}

const LIVE_SOURCES: Punch['source'][] = ['web', 'mobile', 'biometric', 'kiosk', 'teams', 'desktop', 'field'];
const SCOPE_TEXT = { team: 'Your team', granted: 'The people you look after', company: 'Everyone in the company' } as const;
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const isoDay = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const monthLong = (month: string) => `${MONTH_LONG[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const shiftMonth = (month: string, n: number) => {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1);
  return isoOf(d).slice(0, 7);
};
/** Hours and minutes of a moment in a time zone, as "HH:MM" and minutes since midnight. */
function zoneTime(at: Date, zone: string) {
  const [h, m, s] = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: zone }).split(':').map(Number);
  const hh = h % 24;
  return { hhmm: `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`, minute: hh * 60 + m, second: s };
}

/** A server punch as the design's punch (time in the person's zone); a refused one keeps its reason. */
function livePunch(p: PunchRow, zone: string): Punch {
  const verdict: Punch['verdict'] = p.verdict === 'outside' ? 'outside' : p.verdict === 'field' ? 'field' : p.verdict === 'network' ? 'network' : 'inside';
  return {
    id: p.id,
    kind: p.kind,
    time: zoneTime(new Date(p.at), zone).hhmm,
    source: LIVE_SOURCES.includes(p.source as Punch['source']) ? (p.source as Punch['source']) : 'web',
    where: p.where ?? '',
    distanceM: p.distanceM ?? undefined,
    verdict,
    ...(p.accepted ? {} : { refusal: p.refusal ?? 'Refused' }),
    ...(p.note ? { note: p.note } : {}),
    ...(p.place ? { place: p.place } : {}),
  };
}

/** A day from the day engine in the design's day codes (a waiting request shows as R, an approved WFH day as WFH). */
function liveDay(on: string, x: Omit<DayRow, 'on'> | undefined, today: string, o: { pending?: boolean; wfh?: boolean; od?: string } = {}): PDay {
  const date = isoDay(on);
  if (on > today) return { date, code: 'FUT' };
  if (o.pending) return { date, code: 'R', note: 'Request waiting for approval' };
  const late = x?.lateMinutes ?? 0;
  const st = x?.status;
  const code: DayCode =
    st === 'leave' ? (x!.leavePart && x!.leavePart !== 'full' ? 'HD' : 'LV')
      : st === 'holiday' ? 'H'
        : st === 'weekly_off' ? 'WO'
          : on === today ? 'TODAY'
            : o.od && (st === 'present' || st === 'half_day') ? 'OD'
            : st === 'present' ? (o.wfh ? 'WFH' : late > 0 ? 'L' : 'P')
              : st === 'half_day' ? 'HD'
                : st === 'absent' || st === 'no_timesheet' ? 'A'
                  : st === 'missing_out' ? 'MP'
                    : st === 'missing_in' ? 'MI'
                      : st === 'strike' ? 'ST'
                        : st === 'lockout' ? 'LO'
                          : st === 'layoff' ? 'LF'
                            : 'FUT';
  const note = o.od && (st === 'present' || st === 'half_day') ? o.od : x?.regularised ? 'Fixed by an approved request' : st === 'no_timesheet' ? 'No timesheet yet' : st === 'leave' && x?.leavePart && x.leavePart !== 'full' ? `On leave, ${x.leavePart} half` : undefined;
  const ot = x?.otMinutes ? { otMin: x.otMinutes, otStatus: x.otStatus === 'approved' ? ('approved' as const) : ('pending' as const) } : {};
  return { date, code, ...(late > 0 ? { lateMin: late } : {}), ...(x?.workedMinutes ? { workedMin: x.workedMinutes } : {}), ...ot, ...(note ? { note } : {}) };
}

/** Every day of a month in the design's codes. */
function liveMonth(month: string, rows: DayRow[], today: string, pending = new Set<string>(), wfh = new Set<string>(), od = new Map<string, string>()): PDay[] {
  const first = isoDay(`${month}-01`);
  const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => {
    const on = `${month}-${String(i + 1).padStart(2, '0')}`;
    return liveDay(on, rows.find((r) => r.on === on), today, { pending: pending.has(on), wfh: wfh.has(on), od: od.get(on) });
  });
}

/** Approved on-duty days → "place" (TIM-03 OnDuty: the calendar and day card show OD). */
const onDutyDays = (reqs: FixRow[] | undefined) => new Map((reqs ?? []).filter((r) => r.kind === 'on_duty' && r.status === 'approved').map((r) => [r.on, r.place ?? 'On duty']));
const REQUEST_WORD: Record<string, string> = { wfh: 'Work from home', on_duty: 'On duty', permission: 'Permission' };
/** Requests that are not a fix of the day (no day card to open; batch A item 7 adds hourly permission). */
const NOT_FIX = new Set(['wfh', 'on_duty', 'permission']);
const requestWord = (r: FixRow) => REQUEST_WORD[r.kind] ?? 'Regularisation';

/** Today's shift as the design's shift. */
const liveShift = (s: MyAttendance['shift']) => ({ name: s.name, start: hm(s.start), end: hm(s.end), graceMin: s.grace });

/** The clock card (Extra · My attendance today, Home) on the person's live day: punches go to the server. */
function liveClock(d: MyAttendance, now: Date, getLocation: LiveMyAttendance['getLocation'], onPunch: LiveMyAttendance['onPunch'], onRecheck?: () => void, onAskDevice?: () => Promise<unknown>): ClockCardProps {
  const t = zoneTime(now, d.zone);
  const punches = d.punches.filter((p) => p.accepted).map((p) => livePunch(p, d.zone));
  const state: ClockState = d.next === 'out' ? (d.onBreak ? 'break' : 'working') : punches.length ? 'out' : 'not_in';
  const day = d.days.find((x) => x.on === d.today);
  const dayOff = d.shift.off ? 'Weekly off today' : day?.status === 'holiday' ? 'Holiday today' : day?.status === 'leave' && (!day.leavePart || day.leavePart === 'full') ? 'On leave today' : undefined;
  return {
    live: true,
    now: t.minute,
    seconds: t.second,
    date: now,
    // ShiftNotStarted: the company's opening time (setting); none set, the card never blocks before the shift.
    shift: { ...liveShift(d.shift), opensBeforeMin: d.shift.opensBefore ?? d.shift.start },
    // OutsideNetwork: the server knows this computer is off the office network before any punch.
    inside: d.network !== 'outside',
    // ChoseWfh: work from home on the day when the company allows it (asked for today already: the card starts there).
    // DeviceNotApproved: "Ask HR to approve" this computer, where the page can send the request.
    alternatives: [...(d.wfhSameDay && d.mode === 'punch' ? ['wfh' as const] : []), 'retry', 'regularise', ...(onAskDevice ? ['ask_hr' as const] : [])],
    deviceApproved: d.device?.approved ?? true,
    reclockIn: d.shift.reclockIn ?? false,
    deviceRequested: d.device?.requested ?? false,
    defaultWorkMode: d.wfhPendingToday ? 'wfh' : 'office',
    wfhAsk: { approver: d.manager ?? 'your manager', used: d.wfh.used, limit: d.wfh.limit },
    onAlternative: (o) => (o === 'retry' ? onRecheck?.() : o === 'ask_hr' ? onAskDevice?.() : undefined),
    state,
    punches,
    mode: d.shift.checkIn,
    locationName: d.fences[0]?.name ?? 'the office',
    wfhToday: d.wfhToday,
    dayOff,
    lateMarksBefore: d.days.filter((x) => x.on < d.today && (x.lateMinutes ?? 0) > 0).length,
    onPunch: async (kind, mode, note) => {
      const loc = await getLocation();
      const wfh = kind === 'in' && mode === 'wfh' && !d.wfhToday;
      const r = wfh || note ? await onPunch(kind, loc.pin, { ...(wfh ? { wfh: true } : {}), ...(note ? { note } : {}) }) : await onPunch(kind, loc.pin);
      // The browser's own reason (location off, not found) is the clearer one; never two messages run together.
      return { accepted: r.accepted, message: r.accepted ? r.message : (loc.problem ?? r.message) };
    },
  };
}

/**
 * "Attendance today" on the live Home (PLT-02): the designed clock card (HomeClockScreen's card) on the person's live
 * day. Checking in and out and Start break / End break go to the server, which applies the location and network rules.
 */
export function HomeClockCard({ data, now, getLocation, onPunch, attendanceHref, onRegularise }: {
  data: MyAttendance;
  now: Date;
  getLocation: LiveMyAttendance['getLocation'];
  onPunch: LiveMyAttendance['onPunch'];
  attendanceHref: string;
  onRegularise: () => void;
}) {
  return <ClockCard variant="home" {...liveClock(data, now, getLocation, onPunch)} punchesHref={attendanceHref} onRegularise={onRegularise} />;
}

/** A live day card (TIM-03): loads the day's punches and shows them in the design's day card. */
function LiveDayPanel({ load, day, viewer, person, employeeId, approver, monthDays, now, fallbackShift, onFix, onWithdraw, onResolve, onDecideOt }: {
  load: () => Promise<DayCard>;
  day: PDay;
  viewer: Persona;
  person: string;
  employeeId?: string;
  approver?: string;
  monthDays: AttendanceDay[];
  now?: number;
  fallbackShift: DayCardBodyProps['shift'];
  onFix?: () => void;
  onWithdraw?: () => void;
  /** TIM-03 HrFix: HR resolves the day with a reason (the TIM-04 resolve dialog). */
  onResolve?: (input: ResolveInput) => Promise<unknown>;
  /** TIM-03 pending overtime: decide it here, as the viewer's approval task (one engine with Approvals). */
  onDecideOt?: (claimId: string, decision: 'approve' | 'reject' | 'comp_off', reason?: string) => Promise<unknown>;
}) {
  const [card, setCard] = useState<DayCard | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [resolve, setResolve] = useState<ExceptionRow[] | null>(null);
  const [ot, setOt] = useState<'approve' | 'reject' | 'comp_off' | null>(null);
  const [rejectWhy, setRejectWhy] = useState('');
  const [tried, setTried] = useState(false);
  const [outcome, setOutcome] = useState<NonNullable<DayCardBodyProps['outcome']>>({});
  useEffect(() => {
    let on = true;
    setCard(null);
    setProblem(null);
    load().then(
      (c) => on && setCard(c),
      (e: unknown) => on && setProblem(e instanceof Error ? e.message : 'That did not work. Try again.'),
    );
    return () => {
      on = false;
    };
    // The loader is a new function each render; the day it loads is fixed by the panel's key.
  }, [tries]); // eslint-disable-line react-hooks/exhaustive-deps
  if (problem) return <ErrorState title="We couldn't open this day" description={problem} onRetry={() => setTries(tries + 1)} />;
  if (!card) return <LoadingBlock rows={4} />;
  const shift = card.shift ? { name: card.shift.name, start: hm(card.shift.start), end: hm(card.shift.end), graceMin: card.shift.grace } : fallbackShift;
  const otMin = card.ot ? card.ot.payableMinutes : undefined;
  const claim = card.ot?.claim ?? null;
  const otStatus: PDay['otStatus'] = !card.ot ? undefined : !claim ? 'unclaimed' : claim.status === 'approved' ? (card.ot.settle === 'comp_off' ? 'comp-off' : 'approved') : 'pending';
  // TIM-03 OnDuty: an approved on-duty day shows as "On duty" with the place and times (the design's header).
  const od = card.onDuty?.status === 'approved' && card.day?.status && ['present', 'half_day'].includes(card.day.status) && card.on !== undefined ? card.onDuty : null;
  const shown: PDay = { ...day, ...(od ? { code: 'OD' as const, note: `${od.place} · ${fmt12(hm(od.inMinute))} – ${fmt12(hm(od.outMinute))}` } : {}), ...(card.day?.workedMinutes && !day.workedMin ? { workedMin: card.day.workedMinutes } : {}), ...(otMin ? { otMin, otStatus } : {}) };
  // HR may resolve only a past day of an open month; the card says why not otherwise (today, frozen or locked).
  const hrFix = viewer === 'hr' && onResolve && card.hrFix?.ok ? () => setResolve([liveException(shown, person, employeeId ?? '', card)]) : undefined;
  const firstIn = card.punches.find((p) => p.accepted && p.kind === 'in');
  const decide = onDecideOt && claim && claim.status === 'pending' && viewer !== 'emp' ? onDecideOt : undefined;
  const first = person.split(' ')[0];
  return (
    <div className="yx-tim-stack">
      <DayCardBody
        day={shown}
        punches={card.punches.map((p) => livePunch(p, card.zone))}
        place={card.place}
        shift={shift}
        locked={card.locked}
        viewer={viewer}
        person={person}
        approver={approver}
        monthDays={monthDays}
        now={now}
        hideMap
        lateFree={card.lateMarks?.free}
        onFix={viewer === 'hr' ? hrFix : onFix}
        onWithdraw={onWithdraw}
        onReviewOvertime={decide ? () => setOt('approve') : undefined}
        onRejectOvertime={decide ? () => setOt('reject') : undefined}
        onCompOff={decide ? () => setOt('comp_off') : undefined}
        outcome={outcome}
      />
      {viewer === 'hr' && card.hrFix && !card.hrFix.ok && card.hrFix.why && (day.code === 'MP' || day.code === 'MI' || day.code === 'A') && <p className="yx-tim-note">{card.hrFix.why}</p>}
      {card.resolution && <p className="yx-tim-note">Resolved by {card.resolution.by ?? 'HR'} on {formatDate(new Date(card.resolution.at))}: {card.resolution.reason}</p>}
      <ResolveDialog
        key={resolve?.map((r) => r.id).join()}
        rows={resolve}
        onClose={() => setResolve(null)}
        live={onResolve ? { recordedIn: firstIn ? zoneTime(new Date(firstIn.at), card.zone).hhmm : null, shiftEnd: shift.end, onSubmit: async (how, inMinute, outMinute, reason) => { await onResolve({ days: [{ employeeId: employeeId ?? '', on: card.on }], how, inMinute, outMinute, reason }); setOutcome((x) => ({ ...x, exception: 'resolved' })); } } : undefined}
      />
      <ConfirmDialog
        open={ot === 'approve'}
        onOpenChange={(o) => !o && setOt(null)}
        title={`Approve ${fmtDuration(otMin ?? 0)} overtime for ${first}, ${formatDate(day.date)}?`}
        consequence="It's paid in payroll at the overtime rate."
        confirmLabel="Approve overtime"
        confirmVariant="approve"
        onConfirm={async () => { await decide!(claim!.id, 'approve'); setOutcome((x) => ({ ...x, ot: 'approved' })); }}
      />
      <ConfirmDialog
        open={ot === 'comp_off'}
        onOpenChange={(o) => !o && setOt(null)}
        title={`Give ${first} comp-off for ${formatDate(day.date)}?`}
        consequence={`${first} gets comp-off to use later; the hours are not paid as overtime.`}
        confirmLabel="Give comp-off"
        onConfirm={async () => { await decide!(claim!.id, 'comp_off'); setOutcome((x) => ({ ...x, ot: 'comp-off' })); }}
      />
      <ConfirmDialog
        open={ot === 'reject'}
        onOpenChange={(o) => { if (!o) { setOt(null); setRejectWhy(''); setTried(false); } }}
        title={`Reject ${fmtDuration(otMin ?? 0)} overtime for ${first}, ${formatDate(day.date)}?`}
        consequence={`It isn't paid and no comp-off is credited. ${first} sees your reason.`}
        confirmLabel="Reject overtime"
        onConfirm={async () => {
          // Pressed too early: the field says so and takes focus (never a disabled button).
          if (!rejectWhy.trim()) {
            setTried(true);
            document.getElementById('dc-ot-why')?.focus();
            return false;
          }
          await decide!(claim!.id, 'reject', rejectWhy.trim());
          setOutcome((x) => ({ ...x, ot: 'rejected' }));
        }}
      >
        <FormField id="dc-ot-why" label="Reason" required error={tried && !rejectWhy.trim() ? 'Enter a reason' : null}>
          <TextArea rows={2} value={rejectWhy} onChange={setRejectWhy} maxLength={500} />
        </FormField>
      </ConfirmDialog>
    </div>
  );
}

/** A live day as the resolve dialog's exception row. */
function liveException(day: PDay, person: string, employeeId: string, card: DayCard): ExceptionRow {
  const kind: ExceptionRow['kind'] = day.code === 'MP' ? 'Missing check-out' : day.code === 'MI' ? 'Missing check-in' : 'No attendance';
  return { id: `${employeeId}|${card.on}`, person, code: card.person.code ?? '', date: day.date, kind, detail: DAY_CODE_LABEL[day.code], mode: card.day?.status === 'no_timesheet' ? 'Timesheet' : 'Punch', nudged: 0, status: 'Open', blocking: day.code !== 'A' };
}

const fixable = (c: DayCode) => c === 'A' || c === 'MP' || c === 'MI';
const shortIso = (on: string) => shortDate(isoDay(on));

/** Days to fix (missing punch, absent): the red alert with a Fix button per day (calendar and clock page). */
function FixAlert({ days, onFix }: { days: AttendanceDay[]; onFix: (on: string) => void }) {
  if (!days.length) return null;
  return (
    <InlineAlert
      tone="danger"
      title={`${days.length} ${days.length === 1 ? 'day needs' : 'days need'} fixing before payroll`}
      actions={days.map((x) => <Button key={x.date.getTime()} size="sm" onClick={() => onFix(isoOf(x.date))}>Fix {shortDate(x.date)}</Button>)}
    >
      {days.map((x) => `${shortDate(x.date)}: ${DAY_CODE_LABEL[x.code].toLowerCase()}`).join(' · ')}
    </InlineAlert>
  );
}

/** The live page's load states, in the design's own blocks. */
function LiveStates({ state, onRetry, what, children }: { state: LoadState; onRetry?: () => void; what: string; children: ReactNode }) {
  if (state === 'loading') return <LoadingBlock rows={8} />;
  if (state === 'error') return <ErrorState title={`We couldn't load ${what}`} description="Check your connection and try again. Nothing has changed." onRetry={onRetry} />;
  if (state === 'no-access') return <NoAccessState grantedBy="HR" what={what} />;
  if (state === 'no-record') return <NoRecordState />;
  return <>{children}</>;
}

/** Shared by both live attendance pages: the request sheet (TIM-07), and withdrawing a waiting request. */
function useLiveRequests(live: LiveMyAttendance) {
  const say = useSay();
  type ReqType = 'regularise' | 'wfh' | 'on_duty' | 'ot' | 'permission';
  const [req, setReq] = useState<{ type: ReqType; on: string | null; n: number; resend?: FixRow } | null>(live.defaultRequest ? { type: live.defaultRequest, on: null, n: 0 } : null);
  const [withdrawing, setWithdrawing] = useState<FixRow | null>(null);
  const [plan, setPlan] = useState<OtPlanRow | null>(null);
  // On duty sent back for changes: the TIM-07 sent-back sheet (what the manager asked, Change and send again, Withdraw).
  const [sentBack, setSentBack] = useState<FixRow | null>(null);
  const open = (type: ReqType, on: string | null = null, resend?: FixRow) => setReq({ type, on, n: (req?.n ?? 0) + 1, resend });
  const d = live.data;
  // "New request": only the choices this person may use (regularising needs punch mode).
  const canRegularise = d?.mode === 'punch';
  const first: ReqType | null = canRegularise ? 'regularise' : live.onWfh ? 'wfh' : live.onOnDuty ? 'on_duty' : live.onPermission ? 'permission' : live.onOtPlan ? 'ot' : null;
  const node = (
    <>
      {req && d && <AttendanceRequestSheet key={req.n} live={{ data: d, type: req.type, on: req.on, resend: req.resend, canRegularise, onFix: live.onFix, onWfh: live.onWfh, onOnDuty: live.onOnDuty, onPermission: live.onPermission, onOtPlan: live.onOtPlan, onLateCorrection: live.onLateCorrection, leaveTypes: live.leaveTypes, onClose: () => setReq(null) }} />}
      <ConfirmDialog
        open={!!plan}
        onOpenChange={(o) => !o && setPlan(null)}
        title={plan ? `Withdraw the overtime pre-approval for ${shortIso(plan.on)}?` : ''}
        consequence="Your manager won't see it any more. You can ask again any time before the day."
        confirmLabel="Withdraw request"
        cancelLabel="Keep request"
        onConfirm={async () => {
          await live.onWithdrawOtPlan!(plan!.id);
          setPlan(null);
          say('Request withdrawn');
        }}
      />
      <ConfirmDialog
        open={!!withdrawing}
        onOpenChange={(o) => !o && setWithdrawing(null)}
        title={withdrawing ? `Withdraw the ${withdrawing.kind === 'wfh' ? 'work-from-home' : withdrawing.kind === 'on_duty' ? 'on-duty' : withdrawing.kind === 'permission' ? 'permission' : 'regularisation'} request for ${shortIso(withdrawing.on)}?` : ''}
        consequence="Your manager won't see it any more. The day goes back to what was recorded until you send a new request."
        confirmLabel="Withdraw request"
        cancelLabel="Keep request"
        onConfirm={async () => {
          await live.onWithdrawFix(withdrawing!.id);
          setWithdrawing(null);
          say('Request withdrawn');
        }}
      />
    </>
  );
  return { open, node, withdraw: setWithdrawing, withdrawPlan: setPlan, viewSentBack: setSentBack, sentBack, first };
}

/** Me › Attendance, live: the attendance calendar design (Extra · Attendance calendar) on my month. */
/** Batch A item 5 (A1): the month's days for the list and table, times in the person's zone. */
function viewRows(days: PDay[], d: MyAttendance): DayViewRow[] {
  const at = (iso: string | null | undefined) => (iso ? fmt12(hm(zoneTime(new Date(iso), d.zone).minute)) : null);
  // shortcut: the bar uses today's shift length for every day (a day's own shift is not in the month data); a per-day shift if rosters vary a lot.
  const shiftMin = d.shift.off ? null : d.shift.end > d.shift.start ? d.shift.end - d.shift.start : d.shift.end + 1440 - d.shift.start;
  return days.map((x) => {
    const on = isoOf(x.date);
    const row = d.days.find((r) => r.on === on);
    return { on, code: x.code, firstIn: at(row?.firstIn), lastOut: at(row?.lastOut), workedMin: row?.workedMinutes ?? null, shiftMin, lateMin: row?.lateMinutes ?? null, note: x.note, place: row?.place };
  });
}

const REQ_STATUS: Record<FixRow['status'], { label: string; tone: 'info' | 'success' | 'danger' | 'neutral' | 'warning' }> = {
  pending: { label: 'Waiting for approval', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  sent_back: { label: 'Sent back for changes', tone: 'warning' },
  resent: { label: 'Changed and sent again', tone: 'neutral' },
};

/** Batch A item 18 (A3): this month's requests on their own tab, by status. */
function MyRequestsTab({ rows, filter, onFilter, month, onView, onWithdraw, canView }: { rows: FixRow[]; filter: 'all' | 'waiting' | 'approved' | 'closed'; onFilter: (f: 'all' | 'waiting' | 'approved' | 'closed') => void; month: string; onView: (on: string) => void; onWithdraw: (r: FixRow) => void; canView: (r: FixRow) => boolean }) {
  const shown = rows.filter((r) => (filter === 'all' ? true : filter === 'waiting' ? r.status === 'pending' || r.status === 'sent_back' : filter === 'approved' ? r.status === 'approved' : r.status === 'rejected' || r.status === 'withdrawn' || r.status === 'resent'));
  return (
    <div className="yx-tim-stack">
      <Segment label="Show requests" value={filter} onChange={onFilter} options={[{ value: 'all', label: 'All' }, { value: 'waiting', label: 'Waiting' }, { value: 'approved', label: 'Approved' }, { value: 'closed', label: 'Not approved or withdrawn' }]} />
      {shown.length === 0 ? (
        <EmptyState compact title={rows.length ? 'No requests match this filter.' : `No requests in ${month}.`} description={rows.length ? 'Choose "All" to see every request.' : 'Regularisations, work from home and on duty you ask for show here.'} />
      ) : (
        <ul className="yx-tim-list" aria-label="My requests this month">
          {[...shown].sort((a, b) => (a.on < b.on ? 1 : -1)).map((r) => (
            <li key={r.id}>
              <span className="yx-tim-list__main">
                <strong>{shortIso(r.on)} · {requestWord(r)}{r.place ? ` at ${r.place}` : ''}</strong>
                <span className="yx-tim-muted">{r.reason}</span>
              </span>
              <span className="yx-tim-row">
                <Badge tone={REQ_STATUS[r.status].tone}>{REQ_STATUS[r.status].label}</Badge>
                {canView(r) && <Button size="sm" onClick={() => onView(r.on)}>View</Button>}
                {r.status === 'pending' && <Button size="sm" onClick={() => onWithdraw(r)}>Withdraw</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LiveAttendanceCalendar({ live }: { live: LiveMyAttendance }) {
  const d = live.data;
  const ready = live.state === 'ready' && !!d;
  const say = useSay();
  const narrow = useNarrow();
  const [openOn, setOpenOn] = useState<string | null>(null);
  // Batch A items 5 and 18 (A1, A3): the month as a calendar, list or table; my requests on their own tab.
  const [view, setView] = useState<'calendar' | 'list' | 'table'>('calendar');
  const [tab, setTab] = useState<'days' | 'requests'>('days');
  const [reqFilter, setReqFilter] = useState<'all' | 'waiting' | 'approved' | 'closed'>('all');
  const reqs = useLiveRequests(live);
  const pendingFix = new Set((d?.requests ?? []).filter((r) => r.status === 'pending' && !NOT_FIX.has(r.kind)).map((r) => r.on));
  const wfhDays = new Set((d?.requests ?? []).filter((r) => r.status === 'approved' && r.kind === 'wfh').map((r) => r.on));
  const days = d ? liveMonth(live.month, d.days, d.today, pendingFix, wfhDays, onDutyDays(d.requests)) : [];
  const label = monthLong(live.month);
  const toFix = d?.mode === 'punch' ? days.filter((x) => fixable(x.code)) : [];
  // Waiting, and on duty sent back for changes (to change and send again, or withdraw).
  const waiting = (d?.requests ?? []).filter((r) => r.status === 'pending' || (r.kind === 'on_duty' && r.status === 'sent_back'));
  const waitingPlans = (d?.otPlans ?? []).filter((p) => p.status === 'pending');
  const open = openOn ? days.find((x) => isoOf(x.date) === openOn) ?? null : null;
  const openReq = openOn ? waiting.find((r) => r.on === openOn && r.status === 'pending' && !NOT_FIX.has(r.kind)) : undefined;
  const nowMin = d ? zoneTime(live.now ?? new Date(), d.zone).minute : undefined;
  // The next month has not started: the arrow stays clickable and says so.
  const goMonth = (n: number) => {
    if (!d) return;
    if (n > 0 && live.month >= d.today.slice(0, 7)) return say(`${monthLong(shiftMonth(live.month, 1))} has not started yet.`, 'default');
    setOpenOn(null);
    live.onMonth(shiftMonth(live.month, n));
  };
  return (
    <TimePage active="My attendance">
      <PageHeader
        title="My attendance"
        description={d ? `${MODE_TEXT[d.mode] ?? d.mode} · ${d.shift.off ? 'Weekly off today' : `${shiftLabel(d.shift.name)} ${fmt12(hm(d.shift.start))} – ${fmt12(hm(d.shift.end))}`}` : undefined}
        actions={
          ready ? (
            <div className="yx-tim-row">
              {live.todayHref && <Button asChild><a href={live.todayHref}>Clock in or out</a></Button>}
              <Button icon={Download} onClick={() => exportMonth(d.employee.name, label, days)}>Export month</Button>
              {reqs.first && (live.onWfh || live.onOnDuty || live.onPermission || live.onOtPlan) && (
                <SplitButton
                  onClick={() => reqs.open(reqs.first!)}
                  menuLabel="Choose a request"
                  menu={
                    <>
                      {d.mode === 'punch' && <MenuItem onSelect={() => reqs.open('regularise')}>Regularise a day</MenuItem>}
                      {live.onWfh && <MenuItem onSelect={() => reqs.open('wfh')}>Work from home</MenuItem>}
                      {live.onOnDuty && <MenuItem onSelect={() => reqs.open('on_duty')}>On duty</MenuItem>}
                      {live.onPermission && <MenuItem onSelect={() => reqs.open('permission')}>Hourly permission</MenuItem>}
                      {live.onOtPlan && <MenuItem onSelect={() => reqs.open('ot')}>Overtime ahead</MenuItem>}
                    </>
                  }
                >
                  New request
                </SplitButton>
              )}
              {d.mode === 'punch' && <Button variant="primary" onClick={() => reqs.open('regularise')}>Regularise a day</Button>}
            </div>
          ) : undefined
        }
      />
      {ready && (
        <div className="yx-tim-row yx-tim-monthnav">
          <IconButton icon={ChevronLeft} label="Previous month" variant="secondary" onClick={() => goMonth(-1)} />
          <h2 className="yx-tim-h2" aria-live="polite">{label}</h2>
          <IconButton icon={ChevronRight} label="Next month" variant="secondary" onClick={() => goMonth(1)} />
        </div>
      )}
      {ready && <FixAlert days={toFix} onFix={(on) => reqs.open('regularise', on)} />}
      <LiveStates state={live.state} onRetry={live.onRetry} what="your attendance">
        {d && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'days' | 'requests')}>
            <TabsList aria-label="My attendance">
              <TabsTrigger value="days">Days</TabsTrigger>
              <TabsTrigger value="requests">{`Requests (${d.requests.filter((r) => r.on.startsWith(live.month)).length})`}</TabsTrigger>
            </TabsList>
            <TabsContent value="requests">
              <MyRequestsTab rows={d.requests.filter((r) => r.on.startsWith(live.month))} filter={reqFilter} onFilter={setReqFilter} month={label} onView={(on) => { setTab('days'); setOpenOn(on); }} onWithdraw={reqs.withdraw} canView={(r) => !NOT_FIX.has(r.kind) && r.on.startsWith(live.month)} />
            </TabsContent>
            <TabsContent value="days">
          <div className="yx-tim-grid">
            <div data-span="8" className="yx-tim-stack">
              <Segment label="Show the month as" value={view} onChange={setView} options={[{ value: 'calendar', label: 'Calendar' }, { value: 'list', label: 'List' }, { value: 'table', label: 'Table' }]} />
              {view === 'calendar' ? (
                <AttendanceMonth month={isoDay(`${live.month}-01`)} days={days} compact={narrow} selected={open?.date} onDayClick={(x) => setOpenOn(isoOf(x.date))} />
              ) : view === 'list' ? (
                <AttendanceDayList rows={viewRows(days, d)} onOpen={setOpenOn} />
              ) : (
                <AttendanceDayTable rows={viewRows(days, d)} onOpen={setOpenOn} />
              )}
            </div>
            <div data-span="4" className="yx-tim-stack">
              <Card title={`${label} totals`}>
                <AttendanceLegend days={days} />
              </Card>
              {(waiting.length > 0 || waitingPlans.length > 0) && (
                <Card title="Waiting for approval">
                  <ul className="yx-tim-list" aria-label="Waiting for approval">
                    {waiting.map((r) => (
                      <li key={r.id}>
                        <span className="yx-tim-list__main">
                          <strong>{shortIso(r.on)} · {requestWord(r)}{r.place ? ` at ${r.place}` : ''}</strong>
                          <span className="yx-tim-muted">{r.status === 'sent_back' ? `Sent back for changes${r.sentBack ? `: ${r.sentBack}` : ''}` : 'With your manager'}</span>
                        </span>
                        <span className="yx-tim-row">
                          {r.status === 'sent_back' && live.onOnDuty && <Button size="sm" onClick={() => reqs.viewSentBack(r)}>View</Button>}
                          {!NOT_FIX.has(r.kind) && r.on.startsWith(live.month) && <Button size="sm" onClick={() => setOpenOn(r.on)}>View</Button>}
                          <Button size="sm" onClick={() => reqs.withdraw(r)}>Withdraw</Button>
                        </span>
                      </li>
                    ))}
                    {waitingPlans.map((p) => (
                      <li key={p.id}>
                        <span className="yx-tim-list__main">
                          <strong>{shortIso(p.on)} · Overtime pre-approval</strong>
                          <span className="yx-tim-muted">Up to {fmtDuration(p.minutes)} · {p.takeAs === 'comp_off' ? 'comp-off' : 'paid'} · with your manager</span>
                        </span>
                        {live.onWithdrawOtPlan && <Button size="sm" onClick={() => reqs.withdrawPlan(p)}>Withdraw</Button>}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {live.night && <NightWork night={live.night} live={live} />}
            </div>
          </div>
            </TabsContent>
          </Tabs>
        )}
      </LiveStates>
      <Drawer open={!!open && !!d} onOpenChange={(o) => !o && setOpenOn(null)} title={open ? <DayDate date={open.date} /> : ''} subtitle="Your day card" size="lg">
        {open && d && openOn && (
          <DayPanel
            key={openOn}
            live={{
              load: () => live.onOpenDay(openOn),
              day: open,
              viewer: 'emp',
              person: d.employee.name,
              approver: 'your manager',
              monthDays: days,
              now: nowMin,
              fallbackShift: liveShift(d.shift),
              onFix: d.mode === 'punch' ? () => { setOpenOn(null); reqs.open('regularise', openOn); } : undefined,
              onWithdraw: openReq ? () => reqs.withdraw(openReq) : undefined,
            }}
          />
        )}
      </Drawer>
      {/* On duty sent back (TIM-07 OnDutySentBack): what the manager asked, Change and send again, Withdraw. */}
      {reqs.sentBack && d && (
        <OnDutySentBackSheet
          key={reqs.sentBack.id}
          live={{
            on: reqs.sentBack.on,
            place: reqs.sentBack.place ?? '',
            inMinute: reqs.sentBack.inMinute ?? 0,
            outMinute: reqs.sentBack.outMinute ?? 0,
            reason: reqs.sentBack.reason,
            sentBack: reqs.sentBack.sentBack ?? null,
            by: d.manager ?? null,
            onResend: () => { const r = reqs.sentBack!; reqs.viewSentBack(null); reqs.open('on_duty', r.on, r); },
            onWithdraw: () => live.onWithdrawFix(reqs.sentBack!.id),
            onClose: () => reqs.viewSentBack(null),
          }}
        />
      )}
      {reqs.node}
    </TimePage>
  );
}

/** Manager · one person, live: the attendance calendar design on one of my team's months (read only, day cards open). */
function LivePersonCalendar({ live }: { live: LivePersonAttendance }) {
  const d = live.data;
  const ready = live.state === 'ready' && !!d;
  const say = useSay();
  const narrow = useNarrow();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const pending = new Set((d?.requests ?? []).filter((r) => r.kind !== 'wfh').map((r) => r.on));
  const days = d ? liveMonth(live.month, d.days, d.today, pending) : [];
  const label = monthLong(live.month);
  const who = d?.employee.name ?? '';
  const toFix = days.filter((x) => fixable(x.code));
  const locked = !!d && d.locked.length > 0 && d.locked.length >= days.filter((x) => isoOf(x.date) <= d.today).length;
  const open = openOn ? days.find((x) => isoOf(x.date) === openOn) ?? null : null;
  const goMonth = (n: number) => {
    if (!d) return;
    if (n > 0 && live.month >= d.today.slice(0, 7)) return say(`${monthLong(shiftMonth(live.month, 1))} has not started yet.`, 'default');
    setOpenOn(null);
    live.onMonth(shiftMonth(live.month, n));
  };
  const picker = live.people.some((p) => p.id === d?.employee.id) ? live.people : d ? [{ id: d.employee.id, name: d.employee.name, role: d.employee.role ?? undefined }, ...live.people] : live.people;
  return (
    <TimePage active="Muster">
      <PageHeader
        title={d ? `Attendance · ${who}` : 'Attendance'}
        description={d ? [d.employee.role, d.employee.location].filter(Boolean).join(' · ') : undefined}
        breadcrumbs={<Breadcrumbs items={[{ label: 'Muster', href: live.musterHref }, ...(d ? [{ label: who }] : [])]} />}
        actions={
          <div className="yx-tim-row">
            {picker.length > 0 && (
              <div className="yx-tim-picker">
                <PersonPicker aria-label="Person" value={d?.employee.id ?? null} onChange={(v) => { if (v && v !== d?.employee.id) { setOpenOn(null); live.onPick(v); } }} people={picker.map((p) => ({ id: p.id, name: p.name, role: p.role }))} />
              </div>
            )}
            {ready && <Button icon={Download} onClick={() => exportMonth(who, label, days)}>Export month</Button>}
          </div>
        }
      />
      {ready && (
        <div className="yx-tim-row yx-tim-monthnav">
          <IconButton icon={ChevronLeft} label="Previous month" variant="secondary" onClick={() => goMonth(-1)} />
          <h2 className="yx-tim-h2" aria-live="polite">{label}</h2>
          <IconButton icon={ChevronRight} label="Next month" variant="secondary" onClick={() => goMonth(1)} />
          {locked ? <Badge tone="neutral"><Lock size={12} aria-hidden="true" /> Locked</Badge> : <Badge tone="success">Open</Badge>}
        </div>
      )}
      <LiveStates state={live.state} onRetry={live.onRetry} what={`${who || 'this person'}'s attendance`}>
        {d && (
          <div className="yx-tim-grid">
            <div data-span="8">
              <AttendanceMonth month={isoDay(`${live.month}-01`)} days={days} compact={narrow} selected={open?.date} onDayClick={(x) => setOpenOn(isoOf(x.date))} />
            </div>
            <div data-span="4" className="yx-tim-stack">
              <Card title={`${label} totals`}>
                <AttendanceLegend days={days} locked={locked} />
              </Card>
              {!locked && (
                <Card title="Open exceptions">
                  {toFix.length === 0 ? (
                    <p className="yx-tim-muted">Nothing open for {who.split(' ')[0]} this month.</p>
                  ) : (
                    <ul className="yx-tim-list" aria-label="Open exceptions">
                      {toFix.map((x) => (
                        <li key={x.date.getTime()}>
                          <span className="yx-tim-list__main"><strong>{shortDate(x.date)} · {DAY_CODE_LABEL[x.code]}</strong><span className="yx-tim-muted">{x.note ?? 'Not fixed yet'}</span></span>
                          <Button size="sm" onClick={() => setOpenOn(isoOf(x.date))}>View</Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {live.exceptionsHref && <Button size="sm" asChild><a href={live.exceptionsHref}>Open exceptions</a></Button>}
                </Card>
              )}
            </div>
          </div>
        )}
      </LiveStates>
      <Drawer open={!!open && !!d} onOpenChange={(o) => !o && setOpenOn(null)} title={open ? <DayDate date={open.date} /> : ''} subtitle={`${who} · day card`} size="lg">
        {open && d && openOn && (
          <DayPanel
            key={openOn}
            live={{
              load: () => live.onOpenDay(openOn),
              day: open,
              viewer: 'mgr',
              person: who,
              employeeId: d.employee.id,
              approver: 'you',
              monthDays: days,
              fallbackShift: d.shift.start !== null && d.shift.end !== null ? { name: d.shift.name ?? 'Shift', start: hm(d.shift.start), end: hm(d.shift.end), graceMin: 0 } : { name: 'No shift', start: '00:00', end: '00:00', graceMin: 0 },
            }}
          />
        )}
      </Drawer>
    </TimePage>
  );
}

/** Me › Attendance › Today, live: the "My attendance today" design (web clock-in page) on my day. */
function LiveAttendanceToday({ live }: { live: LiveMyAttendance }) {
  const d = live.data;
  const ready = live.state === 'ready' && !!d;
  const reqs = useLiveRequests(live);
  const now = live.now ?? new Date();
  const pendingFix = new Set((d?.requests ?? []).filter((r) => r.status === 'pending' && !NOT_FIX.has(r.kind)).map((r) => r.on));
  const days = d ? liveMonth(d.today.slice(0, 7), d.days, d.today, pendingFix) : [];
  const toFix = d?.mode === 'punch' ? days.filter((x) => fixable(x.code)) : [];
  // Monday to Sunday of this week (days outside this month show the shift only).
  const today = d ? isoDay(d.today) : TODAY;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  const lates = d ? d.days.filter((x) => (x.lateMinutes ?? 0) > 0).length : 0;
  const weekText = (date: Date) => {
    if (!d) return '';
    const on = isoOf(date);
    const row = d.days.find((x) => x.on === on);
    const code = days.find((x) => isoOf(x.date) === on)?.code ?? (on > d.today ? 'FUT' : undefined);
    if (on === d.today) return d.next === 'out' ? (d.onBreak ? 'On a break' : 'Working') : d.punches.some((p) => p.accepted) ? 'Done for the day' : 'Not in yet';
    if (code === 'FUT' || !code) return shiftLabel(d.shift.name);
    const inAt = row?.firstIn ? zoneTime(new Date(row.firstIn), d.zone).hhmm : null;
    const outAt = row?.lastOut ? zoneTime(new Date(row.lastOut), d.zone).hhmm : null;
    return (code === 'P' || code === 'L' || code === 'WFH') && inAt && outAt ? `${DAY_CODE_LABEL[code]} · ${fmt12(inAt)} – ${fmt12(outAt)}` : DAY_CODE_LABEL[code];
  };
  const where = !d ? '' : d.shift.checkIn === 'field' ? 'Anywhere: your location is recorded' : d.fences.length ? `${d.fences.map((f) => `${f.name} (within ${f.radiusM} m)`).join(' or ')}, or the office network` : 'The office network';
  return (
    <TimePage active="My attendance">
      <PageHeader
        title="My attendance today"
        description={d ? (d.mode === 'punch' ? 'Clock in and out from your desk.' : d.mode === 'assumed_present' ? 'You are counted present unless you are on leave, so clocking in is optional.' : 'Your day comes from your timesheet; punches are kept as a record.') : undefined}
        actions={
          ready ? (
            <div className="yx-tim-row">
              {live.monthHref && <Button asChild><a href={live.monthHref}>My month</a></Button>}
              {d.mode === 'punch' && <Button onClick={() => reqs.open('regularise')}>Regularise another day</Button>}
            </div>
          ) : undefined
        }
      />
      <LiveStates state={live.state} onRetry={live.onRetry} what="your attendance">
        {d && (
          <div className="yx-tim-grid">
            <div data-span="8">
              <ClockCard key={d.network} variant="page" {...liveClock(d, now, live.getLocation, live.onPunch, live.onRetry, live.onAskDevice)} onRegularise={() => reqs.open('regularise', d.today)} />
            </div>
            <div data-span="4" className="yx-tim-stack">
              <FixAlert days={toFix} onFix={(on) => reqs.open('regularise', on)} />
              <Card title="This week">
                <ul className="yx-tim-list">
                  {week.map((date) => (
                    <li key={date.getTime()}>
                      <DayDate date={date} />
                      <span className={isoOf(date) > d.today ? 'yx-tim-muted' : undefined}>{weekText(date)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Your rules">
                <ul className="yx-tim-list">
                  <li><span>Clock-in from</span><span className="yx-tim-muted">{where}</span></li>
                  <li><span>Grace</span><span className="yx-tim-muted">{d.shift.grace} min after {fmt12(hm(d.shift.start))}</span></li>
                  <li><span>Late marks</span><span className="yx-tim-muted">{lates} this month</span></li>
                  <li><span>Regularisations</span><span className="yx-tim-muted">{d.regularise.used} of {d.regularise.limit} used this month</span></li>
                  {live.onWfh && <li><span>Work from home</span><span className="yx-tim-muted">{d.wfh.used} of {d.wfh.limit} this month without HR</span></li>}
                </ul>
              </Card>
            </div>
          </div>
        )}
      </LiveStates>
      {reqs.node}
    </TimePage>
  );
}

/** Night work (founder decisions 9 Oct 2026): opt in (only the person can turn it off), confirm or withdraw a consent. */
function NightWork({ night, live }: { night: MyNightWork; live: LiveMyAttendance }) {
  const { busy, error, run } = useRun();
  const say = useSay();
  const [sent, setSent] = useState<{ id: string; to: string } | null>(null);
  const [code, setCode] = useState('');
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const early = useTooEarly(code.length === 6 ? [] : [{ fieldId: 'nw-code', message: 'Enter the 6-digit code' }]);
  const open = night.consents.filter((x) => !x.withdrawnOn);
  return (
    <Card title="Night work">
      <div className="yx-tim-stack">
        {night.byRecord ? (
          <p className="yx-tim-muted">The night-work protection applies to you: you are placed on a shift between 7 pm and 6 am only with your consent, confirmed by you here, and the workplace safeguards in place.</p>
        ) : (
          <Switch
            label="Night-work protection"
            description="Placed on a shift between 7 pm and 6 am only with your consent, confirmed by you here, and the workplace safeguards in place. HR can see this. Only you can turn it off."
            checked={night.optedIn}
            disabled={busy === 'opt' || !live.onNightOptIn}
            onChange={(on) => void run('opt', () => live.onNightOptIn!(on))}
          />
        )}
        {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
        {night.consents.length > 0 && (
          <ul className="yx-tim-list" aria-label="My night-work consents">
            {night.consents.map((x) => (
              <li key={x.id} className="yx-tim-row">
                <Badge tone={x.withdrawnOn ? 'neutral' : x.confirmedAt ? 'success' : 'warning'}>{x.withdrawnOn ? 'Withdrawn' : x.confirmedAt ? 'Confirmed' : 'Needs your confirmation'}</Badge>
                <span className="yx-tim-list__main">
                  <span>{x.location}</span>
                  <span className="yx-tim-note">
                    Given {formatDate(isoDay(x.givenOn))} · {x.reference}
                    {x.withdrawnOn ? ` · withdrawn from ${formatDate(isoDay(x.withdrawnOn))}` : ''}
                  </span>
                </span>
                {!x.withdrawnOn && !x.confirmedAt && live.onNightCode && (
                  <Button size="sm" loading={busy === `code-${x.id}`} onClick={() => void run(`code-${x.id}`, async () => setSent({ id: x.id, to: (await live.onNightCode!(x.id)).sentTo }))}>
                    {sent?.id === x.id ? 'Send a new code' : 'Confirm with a code'}
                  </Button>
                )}
                {!x.withdrawnOn && live.onNightWithdraw && <Button size="sm" onClick={() => setWithdrawing(x.id)}>Withdraw</Button>}
              </li>
            ))}
          </ul>
        )}
        {sent && open.some((x) => x.id === sent.id && !x.confirmedAt) && (
          <div className="yx-tim-row">
            <FormField id="nw-code" label={`The 6-digit code sent to ${sent.to}`} required error={early.errorOf('nw-code')}>
              <CodeField value={code} onChange={setCode} />
            </FormField>
            <Button
              variant="primary"
              loading={busy === 'confirm'}
              onClick={() => {
                if (early.stop()) return;
                void run('confirm', async () => {
                  await live.onNightConfirm!(sent.id, code);
                  setSent(null);
                  setCode('');
                  say('Night-work consent confirmed');
                });
              }}
            >
              Confirm my consent
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={!!withdrawing}
        onOpenChange={(o) => !o && setWithdrawing(null)}
        title="Withdraw your night-work consent?"
        consequence="From today you are not placed on shifts between 7 pm and 6 am at this workplace. Withdrawing never leads to any action against you."
        confirmLabel="Withdraw"
        onConfirm={async () => {
          await live.onNightWithdraw!(withdrawing!);
          setWithdrawing(null);
          say('Night-work consent withdrawn');
        }}
      />
    </Card>
  );
}

const LIVE_MODE: Record<string, MusterRow['mode']> = { punch: 'Punch', assumed_present: 'Assumed present', timesheet: 'Timesheet' };

/** Time › Muster, live (TIM-02): the muster design on the people in my scope; each cell opens the day card (TIM-03). */
/** "Your team · 5 people, and you" / "Only you": the reports are counted apart from the viewer's own row. */
function musterCount(d: Muster) {
  const others = d.people.filter((p) => !p.me).length;
  const me = d.people.some((p) => p.me);
  if (!others) return me ? 'Only you: no one reports to you' : `${SCOPE_TEXT[d.scope]} · no one`;
  return `${SCOPE_TEXT[d.scope]} · ${others} ${others === 1 ? 'person' : 'people'}${me ? ', and you' : ''}`;
}

function LiveMusterScreen({ live }: { live: LiveMusterData }) {
  const d = live.data;
  const narrow = useNarrow();
  const gridRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState<[string, number] | null>(null);
  const [monthOf, setMonthOf] = useState<string | null>(null);
  const [dlg, setDlg] = useState<'freeze' | 'lock' | 'send' | 'approve' | 'bulk' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  // Pre-approve overtime: open for no one yet (''), or for the person whose day card it came from.
  const [otFor, setOtFor] = useState<string | null>(null);
  const { run } = useRun();
  const today = live.today ?? isoOf(new Date());
  const todayDate = isoDay(today);
  const rows: MusterRow[] = (d?.people ?? []).map((p) => {
    const days = liveMonth(d!.month, p.days, today);
    return { id: p.id, name: `${p.name}${p.me ? ' (you)' : ''}`, code: p.code ?? '', mode: LIVE_MODE[p.mode] ?? 'Punch', days: p.mode === 'punch' ? days : noLate(days) };
  });
  const monthDays = d ? liveMonth(d.month, [], '0000-00-00') : [];
  const label = d ? monthLong(d.month) : '';
  const ready = live.state === 'ready' && rows.length > 0;
  const openCount = rows.reduce((n, r) => n + r.days.filter((x) => fixable(x.code)).length, 0);
  const row = cell ? rows.find((r) => r.id === cell[0]) : null;
  const day = row && cell ? row.days[cell[1]] : null;
  const sheetRow = monthOf ? rows.find((r) => r.id === monthOf) : null;
  const person = row ? d!.people.find((p) => p.id === row.id) : undefined;
  const say = useSay();
  // TIM-02 period stage of the month for its legal entity (none when the company has several and none is picked).
  const period = d?.period ?? null;
  const stage = period?.stage === 'filed' ? 'locked' : (period?.stage ?? 'open');
  const twoStep = period?.flow === 'two_step';
  const exceptions = period?.exceptions ?? 0;
  const waiting = (period?.pending ?? []).reduce((n, x) => n + x.count, 0);
  const lockBlock = !period ? null : !period.lockable ? `${label} can be frozen and locked from ${formatDate(isoDay(period.lockableFrom))}` : waiting ? `${waiting} ${waiting === 1 ? 'request is' : 'requests are'} still waiting for a decision` : exceptions ? `Lock opens when ${exceptions} open ${exceptions === 1 ? 'exception is' : 'exceptions are'} resolved` : null;
  const own = selected.filter((id) => d?.people.find((p) => p.id === id)?.me);
  // Founder 2 Nov 2026: overtime is pre-approved by the reporting line only; the server marks those people (`ot`) and
  // checks each one again. Never oneself.
  const reports = live.onPreApproveOt && d ? d.people.filter((p) => p.ot && !p.me) : [];
  // Bulk "mark present" only for HR, in an open month with absent or missing-punch days to mark (never their own row).
  const bulkable = Boolean(d?.canMarkPresent) && stage === 'open' && rows.some((r) => !d!.people.find((p) => p.id === r.id)?.me && r.days.some((x) => canMarkPresent(x.code)));
  const toggle = (id: string, on: boolean) => setSelected(on ? [...selected, id] : selected.filter((x) => x !== id));
  // Like the calendar: the next month that has not started says so instead of moving.
  const goMonth = (n: number) => {
    if (n > 0 && live.month >= today.slice(0, 7)) return say(`${monthLong(shiftMonth(live.month, 1))} has not started yet.`, 'default');
    setCell(null);
    setSelected([]);
    live.onMonth(shiftMonth(live.month, n));
  };
  useEffect(() => {
    const g = gridRef.current;
    if (g) g.scrollLeft = g.scrollWidth;
  }, [narrow, live.state]);
  // The one button the stage offers this viewer; pressed while blocked, it says why (never disabled).
  const press = (next: 'freeze' | 'lock' | 'send' | 'approve') => (lockBlock && (next !== 'freeze' || !period?.lockable || waiting) ? say(`${lockBlock}.`, 'default') : setDlg(next));
  // Bulk: the dialog stays open on a refusal and the reason shows as a toast; done closes it (the page toasts).
  const act = (fn: () => Promise<unknown>) =>
    void run('bulk', async () => {
      try {
        await fn();
        setDlg(null);
      } catch (e) {
        say(e instanceof Error && e.message ? e.message : 'That did not work. Nothing has changed.', 'default');
        throw e;
      }
    });
  const stageButton = !period || !ready ? null : stage === 'open' && period.canLock ? (
    <Button icon={Snowflake} onClick={() => press('freeze')}>Freeze inputs</Button>
  ) : stage === 'frozen' && !twoStep && period.canLock ? (
    <Button variant="primary" icon={Lock} onClick={() => press('lock')}>Lock period</Button>
  ) : stage === 'frozen' && twoStep && period.canApprove && period.sentAt ? (
    <Button variant="approve" icon={Lock} onClick={() => press('approve')}>Approve lock</Button>
  ) : stage === 'frozen' && twoStep && period.canLock && !period.sentAt ? (
    <Button variant="primary" icon={Lock} onClick={() => press('send')}>Send for approval</Button>
  ) : stage === 'frozen' && twoStep && period.sentAt ? (
    <Badge tone="info">Sent for payroll approval</Badge>
  ) : null;
  return (
    <TimePage active="Muster" user={HR_ADMIN}>
      <PageHeader
        title={`Muster · ${monthLong(live.month)}`}
        // The viewer's own row is on the muster on purpose (YX-AT-14: "(you)"); the count says so instead of adding it to the team.
        description={d ? `${period?.entityName ? `${period.entityName} · ` : ''}${musterCount(d)}` : undefined}
        status={period ? <Badge tone={stage === 'open' ? 'success' : stage === 'frozen' ? 'warning' : 'neutral'}>{stage === 'open' ? 'Open' : stage === 'frozen' ? 'Inputs frozen' : 'Locked'}</Badge> : undefined}
        facts={
          period && stage !== 'locked' ? (
            <span className="yx-tim-row">
              <span className="yx-tim-muted">{ready && exceptions > 0 && stage === 'open' ? 'Open exceptions stop payroll approval · ' : ''}{period.lockable ? `Cut-off ${formatDate(isoDay(period.lockableFrom))} has passed` : `Cut-off ${formatDate(isoDay(period.lockableFrom))}`}</span>
              {!period.lockable && <DueBadge date={isoDay(period.lockableFrom)} />}
            </span>
          ) : undefined
        }
        actions={
          <div className="yx-tim-row">
            {ready && reports.length > 0 && <Button icon={Clock} onClick={() => setOtFor('')}>Pre-approve overtime</Button>}
            {ready && <Button icon={Download} onClick={() => downloadCsv(`muster-${d!.month}.csv`, [['Employee', 'Code', 'Payable', 'Unpaid', 'Late', 'OT h', ...monthDays.map((x) => String(x.date.getDate()))], ...rows.map((r) => { const s = monthSummary(r.days, todayDate); return [r.name, r.code, s.payable, s.lop, s.lateMarks, s.otHours, ...r.days.map((x) => codeText(cellCode(x.code)))]; })])}>Export</Button>}
            {stageButton}
          </div>
        }
      />
      <div className="yx-tim-row yx-tim-monthnav">
        <IconButton icon={ChevronLeft} label="Previous month" variant="secondary" onClick={() => goMonth(-1)} />
        <h2 className="yx-tim-h2" aria-live="polite">{monthLong(live.month)}</h2>
        <IconButton icon={ChevronRight} label="Next month" variant="secondary" onClick={() => goMonth(1)} />
      </div>
      {period && stage !== 'open' && (
        <InlineAlert
          tone={stage === 'frozen' && exceptions > 0 ? 'warning' : 'info'}
          title={stage === 'frozen' ? (exceptions > 0 ? `Inputs are frozen · ${exceptions} open exceptions` : twoStep && period.sentAt ? `Inputs are frozen · sent for payroll approval ${formatDate(new Date(period.sentAt))}` : 'Inputs are frozen') : `${label} is locked`}
          actions={stage === 'frozen' && exceptions > 0 && live.exceptionsHref ? <Button size="sm" asChild><a href={live.exceptionsHref}>Open exceptions</a></Button> : undefined}
        >
          {stage === 'frozen'
            ? `${lockBlock ? `${lockBlock}. ` : ''}Employees can still raise late requests; they need HR and payroll approval and are paid in the next payroll. Days can't change any more: HR records a correction with a reason.`
            : 'Corrections become late requests with effect in the next payroll.'}
        </InlineAlert>
      )}
      <LiveStates state={live.state} onRetry={live.onRetry} what="the muster">
        {d && rows.length === 0 ? (
          <EmptyState title="No one on the muster" description="People you manage, or look after in HR, appear here." />
        ) : d ? (
          <>
            {(openCount > 0 || bulkable) && (
              <div className="yx-tim-row">
                {openCount > 0 && <Badge tone="danger">{openCount} {openCount === 1 ? 'day' : 'days'} to fix</Badge>}
                {openCount > 0 && live.exceptionsHref && <Button size="sm" asChild><a href={live.exceptionsHref}>Open exceptions</a></Button>}
                {bulkable && <span className="yx-tim-muted">Select people to act in bulk.</span>}
                {selected.length > 0 && bulkable && <Button onClick={() => (own.length ? say('You cannot mark your own attendance. Untick your own row.', 'default') : setDlg('bulk'))}>Mark present with reason ({selected.length})</Button>}
              </div>
            )}
            <MusterGrid
              rows={rows}
              monthDays={monthDays}
              monthName={label}
              today={todayDate}
              narrow={narrow}
              gridRef={gridRef}
              bulkable={bulkable}
              selected={selected}
              onToggle={toggle}
              cell={cell}
              onCell={setCell}
              onMonthOf={setMonthOf}
              note={'"late" = came in after the grace time · "OT" = overtime claimed · Unpaid = days already deducted as unpaid leave. Absent days stay out of Payable until they are fixed.'}
            />
          </>
        ) : null}
      </LiveStates>
      <BottomSheet open={!!sheetRow} onOpenChange={(o) => !o && setMonthOf(null)} title={sheetRow ? `${sheetRow.name} · ${label}` : ''}>
        {sheetRow && <AttendanceMonth month={monthDays[0].date} days={sheetRow.days} compact onDayClick={(x) => { setMonthOf(null); setCell([sheetRow.id, x.date.getDate() - 1]); }} />}
      </BottomSheet>
      <Drawer
        open={!!day}
        onOpenChange={(o) => !o && setCell(null)}
        title={day && row ? `${row.name} · ${formatDate(day.date)}` : ''}
        subtitle={person ? [person.code, person.location].filter(Boolean).join(' · ') : 'Day card'}
        size="lg"
        footer={
          row && person && !person.me && (live.personHref || reports.some((x) => x.id === row.id)) ? (
            <>
              {reports.some((x) => x.id === row.id) && <Button icon={Clock} onClick={() => { setCell(null); setOtFor(row.id); }}>Pre-approve overtime</Button>}
              {live.personHref && <Button asChild><a href={live.personHref(row.id, live.month)}>Open {person.name.split(' ')[0]}'s month</a></Button>}
            </>
          ) : undefined
        }
      >
        {day && row && person && (
          <DayPanel
            key={`${row.id}-${cell![1]}`}
            live={{
              load: () => live.onOpenDay(row.id, isoOf(day.date)),
              day,
              viewer: d!.scope === 'team' ? 'mgr' : 'hr',
              person: person.name,
              employeeId: row.id,
              approver: 'their manager',
              monthDays: row.days,
              fallbackShift: { name: 'No shift', start: '00:00', end: '00:00', graceMin: 0 },
              onResolve: live.onResolve,
              onDecideOt: live.onDecideOt,
            }}
          />
        )}
      </Drawer>
      {period && (
        <>
          <ConfirmDialog
            open={dlg === 'freeze'}
            onOpenChange={(o) => !o && setDlg(null)}
            title={`Freeze ${label} inputs?`}
            consequence={[
              "After freezing, the month's days can't change: employees raise late requests, paid in the next payroll.",
              exceptions > 0 && `${exceptions} exceptions are still open and will block the lock until HR records a correction for each.`,
            ].filter(Boolean).join(' ')}
            confirmLabel="Freeze inputs"
            onConfirm={async () => { await live.onFreeze!(period.legalEntityId, live.month); }}
          />
          <ConfirmDialog
            open={dlg === 'lock'}
            onOpenChange={(o) => !o && setDlg(null)}
            title={`Lock ${label} attendance?`}
            consequence={`${rows.length} people · no open exceptions. Locked days can't be edited; corrections go to the next payroll. You'll be asked to confirm it's you.`}
            confirmLabel="Lock period"
            onConfirm={async () => { await live.onLock!(period.legalEntityId, live.month); }}
          />
          <ConfirmDialog
            open={dlg === 'send'}
            onOpenChange={(o) => !o && setDlg(null)}
            title={`Send ${label} for payroll approval?`}
            consequence={`Payroll approves the lock. Until then, inputs for ${label} stay frozen.`}
            confirmLabel="Send for approval"
            onConfirm={async () => { await live.onSend!(period.legalEntityId, live.month); }}
          />
          <ConfirmDialog
            open={dlg === 'approve'}
            onOpenChange={(o) => !o && setDlg(null)}
            title={`Approve lock · ${label}`}
            consequence={`Attendance and pay-affecting leave for ${label} can't be changed after this; fixes become late requests paid in the next payroll. You'll be asked to confirm it's you.`}
            confirmLabel="Approve lock"
            confirmVariant="approve"
            onConfirm={async () => { await live.onApproveLock!(period.legalEntityId, live.month); }}
          />
        </>
      )}
      {otFor !== null && live.onPreApproveOt && (
        <OtPreApproveSheet
          live={{
            people: reports.map((x) => ({ id: x.id, name: x.name, detail: [x.code, x.location].filter(Boolean).join(' · '), aheadDays: x.ot!.aheadDays, paidOnly: x.ot!.factoriesAct })),
            employeeId: otFor || null,
            today,
            onSubmit: live.onPreApproveOt,
            onClose: () => setOtFor(null),
          }}
        />
      )}
      {dlg === 'bulk' && (
        <BulkPresentDialog
          rows={rows.filter((r) => selected.includes(r.id))}
          monthDays={monthDays}
          today={todayDate}
          onClose={() => setDlg(null)}
          onDone={(ids, date, reason) =>
            act(async () => {
              await live.onMarkPresent!(ids, isoOf(date), reason);
              setSelected([]);
            })
          }
        />
      )}
    </TimePage>
  );
}

/* ---------- live: /time/exceptions (TIM-04) ---------- */

/** HR's queue (attendance.view in scope) or a manager's team: the month's days that need a decision. */
export interface LiveExceptions {
  state: LoadState;
  onRetry?: () => void;
  data: ExceptionsList | null;
  month: string;
  onMonth: (month: string) => void;
  /** HR resolves one or more days with a reason (leave.approve; checked per person on the server). */
  onResolve: (input: ResolveInput) => Promise<unknown>;
  /** A waiting fix the viewer approves (their task in the shared approvals engine). */
  onDecideTask: (taskId: string, decision: 'approve' | 'reject', reason?: string) => Promise<unknown>;
  /** Opened for one person (from their day or calendar). */
  defaultSearch?: string;
  musterHref?: string;
  /** The server pages and filters the list (10,000 rows hold up); each change asks for the page again. */
  onQuery: (q: ExceptionsQuery) => void;
}
export interface ExceptionsQuery { status: string[]; kind: string[]; search: string; page: number; pageSize: number }
type LiveExceptionRow = ExceptionsList['rows'][number];

/** A live row in the design's exception shape (the table, filters and resolve dialog read it). */
const asException = (r: LiveExceptionRow): ExceptionRow => ({
  id: r.id,
  person: r.person,
  code: r.code ?? '',
  date: isoDay(r.on),
  kind: r.kind as ExceptionRow['kind'],
  detail: r.detail,
  mode: r.mode,
  nudged: r.nudged,
  status: r.status,
  blocking: r.blocking,
  ...(r.request ? { requested: requestText(r.request), reason: r.request.reason } : {}),
});
const requestText = (q: NonNullable<LiveExceptionRow['request']>) =>
  q.kind === 'full_day' ? 'Present all day' : [q.inMinute !== null ? `In ${fmt12(hm(q.inMinute))}` : '', q.outMinute !== null ? `out ${fmt12(hm(q.outMinute))}` : ''].filter(Boolean).join(', ');

function LiveExceptionsScreen({ live }: { live: LiveExceptions }) {
  const d = live.data;
  const say = useSay();
  const hr = Boolean(d?.canResolve);
  const all = d?.rows ?? [];
  const [filters, setFilters] = useState<FilterValue[]>([{ key: 'status', type: 'multi', values: ['Open', 'Request pending'] }]);
  const [search, setSearch] = useState(live.defaultSearch ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [resolve, setResolve] = useState<LiveExceptionRow[] | null>(null);
  const [review, setReview] = useState<LiveExceptionRow | null>(null);
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  const { busy, error, run, clearError } = useRun();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const pick = (k: string) => { const f = filters.find((x) => x.key === k); return f && f.type === 'multi' ? f.values : []; };
  // Filters, search and the page go to the server; a new filter starts again on page 1.
  useEffect(() => {
    live.onQuery({ status: pick('status'), kind: pick('kind'), search: search.trim(), page, pageSize });
  }, [JSON.stringify(filters), search, page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = all;
  const blocking = d?.blocking ?? 0;
  const goMonth = (n: number) => {
    if (n > 0 && d && live.month >= d.today.slice(0, 7)) return say(`${monthLong(shiftMonth(live.month, 1))} has not started yet.`, 'default');
    setSelected([]);
    live.onMonth(shiftMonth(live.month, n));
  };
  const cols: TableColumn<LiveExceptionRow>[] = [
    { key: 'person', header: 'Employee', type: 'person', width: 220, value: (r) => r.person, person: (r) => ({ name: r.person, secondary: r.mode === 'Timesheet' ? `${r.code ?? ''} · timesheet` : (r.code ?? '') }) },
    {
      key: 'date',
      header: 'Date',
      type: 'date',
      value: (r) => isoDay(r.on),
      render: (r) => <span className="yx-tim-list__main" style={CELL}><span>{formatDate(isoDay(r.on))}</span>{r.status !== 'Resolved' && <span><Badge tone={-daysUntil(isoDay(r.on), isoDay(d!.today)) > 7 ? 'danger' : 'neutral'}>{relativeDue(isoDay(r.on), isoDay(d!.today)).text}</Badge></span>}</span>,
    },
    {
      key: 'kind',
      header: 'Exception',
      width: 300,
      hideable: false,
      value: (r) => r.kind,
      render: (r) => <span className="yx-tim-list__main" style={CELL}><strong>{nbHyphen(r.kind)}</strong><span className="yx-tim-muted">{nbHyphen(r.resolution ? `${r.detail} · ${r.resolution.reason}` : r.detail)}</span></span>,
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
  ];
  const decide = (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !why.trim()) {
      setTried(true);
      document.getElementById('ex-review-why')?.focus();
      return;
    }
    void run(decision, async () => {
      await live.onDecideTask(review!.request!.taskId!, decision, decision === 'reject' ? why.trim() : undefined);
      setReview(null);
    });
  };
  const one = resolve?.length === 1 ? resolve[0] : null;
  return (
    <TimePage active="Exceptions">
      <PageHeader
        title="Attendance exceptions"
        description={`${monthLong(live.month)} · ${d ? (d.scope === 'team' ? 'your team' : d.scope === 'company' ? 'everyone' : 'the people you look after') : ''} · fix these before payroll can be approved`}
        status={live.state === 'ready' ? <Badge tone={blocking ? 'danger' : 'success'}>{blocking} blocking</Badge> : undefined}
      />
      <div className="yx-tim-row yx-tim-monthnav">
        <IconButton icon={ChevronLeft} label="Previous month" variant="secondary" onClick={() => goMonth(-1)} />
        <h2 className="yx-tim-h2" aria-live="polite">{monthLong(live.month)}</h2>
        <IconButton icon={ChevronRight} label="Next month" variant="secondary" onClick={() => goMonth(1)} />
      </div>
      {live.state === 'no-access' ? (
        <LiveStates state="no-access" what="attendance exceptions">{null}</LiveStates>
      ) : (
        <>
          <FilterBar
            fields={[
              { key: 'status', label: 'Status', type: 'multi', options: ['Open', 'Request pending', 'Resolved'].map((v) => ({ value: v, label: v })) },
              { key: 'kind', label: 'Exception', type: 'multi', options: ['Missing check-out', 'Missing check-in', 'No attendance', 'No approved timesheet'].map((v) => ({ value: v, label: v })) },
            ]}
            value={filters}
            onChange={(f) => { setFilters(f); setPage(1); }}
            search={search}
            onSearchChange={(x) => { setSearch(x); setPage(1); }}
            searchPlaceholder="Search people"
          />
          <DataTable
            label="Attendance exceptions"
            columns={cols}
            rows={shown}
            getRowId={(r) => r.id}
            state={live.state === 'loading' ? 'loading' : live.state === 'error' ? 'error' : 'ready'}
            onRetry={live.onRetry}
            filtered={!!search.trim() || pick('kind').length > 0}
            onClearFilters={() => { setFilters([]); setSearch(''); setPage(1); }}
            empty={<EmptyState title="No open exceptions" description={`Every working day in ${monthLong(live.month)} has punches, leave or an approved request. Payroll is not blocked by attendance.`} action={live.musterHref ? <Button asChild><a href={live.musterHref}>Open muster</a></Button> : undefined} />}
            selectable={hr}
            isSelectable={(r) => (r.status === 'Open' ? true : r.status === 'Resolved' ? false : 'A request is waiting: decide it first')}
            selectedIds={selected}
            onSelectedChange={setSelected}
            bulkActions={(ids) => {
              const picked = all.filter((r) => ids.includes(r.id) && r.status === 'Open');
              return <Button size="sm" onClick={() => (picked.length ? setResolve(picked) : say('Select people with an open exception.', 'default'))}>Resolve {picked.length} with reason</Button>;
            }}
            rowButtons={(r) =>
              r.status === 'Resolved' ? null : r.status === 'Request pending' ? (
                r.request?.taskId ? <Button size="sm" variant="review" onClick={() => { clearError(); setWhy(''); setTried(false); setReview(r); }}>Review request</Button> : <Button size="sm" onClick={() => { clearError(); setReview(r); }}>View request</Button>
              ) : hr ? (
                <Button size="sm" onClick={() => setResolve([r])}>Resolve</Button>
              ) : null
            }
          />
          {/* Server paging: the designed table shows one page; the count and the next page come from the server. */}
          {(d?.total ?? 0) > pageSize && <Pagination page={page} pageSize={pageSize} total={d!.total} onPageChange={(x) => { setSelected([]); setPage(x); }} onPageSizeChange={(x) => { setPageSize(x); setPage(1); }} />}
        </>
      )}
      <ResolveDialog
        key={resolve?.map((r) => r.id).join()}
        rows={resolve ? resolve.map(asException) : null}
        onClose={() => setResolve(null)}
        onResolved={() => setSelected([])}
        live={{
          recordedIn: one?.inAt ?? null,
          shiftEnd: one?.shiftEnd ?? '18:30',
          onSubmit: (how, inMinute, outMinute, reason) => live.onResolve({ days: (resolve ?? []).map((r) => ({ employeeId: r.employeeId, on: r.on })), how, inMinute, outMinute, reason }),
        }}
      />
      <Dialog
        open={!!review}
        onOpenChange={(o) => !o && setReview(null)}
        title={review ? `${review.request?.taskId ? 'Review' : 'View'} request · ${review.person}, ${formatDate(isoDay(review.on))}` : ''}
        description={review ? `${review.kind}: ${review.detail}` : undefined}
        footer={
          review?.request?.taskId ? (
            <>
              <Button onClick={() => setReview(null)}>Cancel</Button>
              <Button variant="danger" loading={busy === 'reject'} onClick={() => decide('reject')}>Reject</Button>
              <Button variant="approve" loading={busy === 'approve'} onClick={() => decide('approve')}>Approve</Button>
            </>
          ) : (
            <Button onClick={() => setReview(null)}>Close</Button>
          )
        }
      >
        <div className="yx-tim-stack">
          {error && <InlineAlert tone="danger" title="Not decided">{error}</InlineAlert>}
          {review?.request && (
            <ul className="yx-tim-list">
              <li><span>Asked for</span><span className="yx-tim-muted">{requestText(review.request)}</span></li>
              <li><span>Reason</span><span className="yx-tim-muted">{review.request.reason}</span></li>
            </ul>
          )}
          {review?.request && !review.request.taskId && <p className="yx-tim-muted">Their approver decides this request.</p>}
          {review?.request?.taskId && (
            <FormField id="ex-review-why" label="Reason (needed to reject)" error={tried && !why.trim() ? 'Enter a reason to reject' : null}>
              <TextArea rows={2} value={why} onChange={setWhy} maxLength={500} />
            </FormField>
          )}
        </div>
      </Dialog>
    </TimePage>
  );
}
