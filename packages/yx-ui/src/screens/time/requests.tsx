// Attendance requests, OT review, device backfill, periods, industrial action.
// TIM-07, TIM-08, TIM-09, TIM-10, TIM-11, TIM-37.
import { useEffect, useState, type ReactNode } from 'react';
import { Check, Download, Lock, Send, Unlock, X } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Badge, DayDate, PersonLabel, type BadgeTone } from '../../components/display';
import { formatDate } from '../../lib/format';
import { IN_STATES } from '../../lib/india-states';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Pagination, Skeleton } from '../../components/feedback';
import { BottomSheet, ConfirmDialog, Dialog } from '../../components/overlay';
import { Card, DescriptionList, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { RadioGroup } from '../../components/choice';
import { NumberField, TextArea, TextField, TimeField } from '../../components/inputs';
import { FieldRow, FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Stepper } from '../../components/stepper';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { MenuItem } from '../../components/menu';
import { useToast } from '../../components/notify';
import { useTooEarly } from '../../components/field';
import { useRun } from '../org/org-kit';
import type { DayRow, FixInput, FixKind as LiveFixKind, FixRow, LateCorrectionInput, MyAttendance, OnDutyInput, OtPlanInput, PermissionInput, WfhInput } from './live/types';
import { Segment } from '../people/people-kit';
import { EXCEPTIONS, HOLIDAYS, HR_ADMIN, LATE_PAYROLL, LEAVE_REQUESTS, ME, OT_ROWS, PAYROLL_ADMIN, SEPTEMBER, TEAM, TODAY, isMyReport, timeCounts, type OtRow, type TimeUser } from './time-data';
import { DueBadge, Kpis, TimePage } from './time-kit';
import { canReopen, daysUntil, fmt12, fmtDuration, otCapFlag, regularisationRoute, type PeriodStage } from './time-logic';
import type { ViewState } from './attendance';
// useToast, useTooEarly and useRun come from the import lines above (shared with the TIM-07 region).
import { LiveGate, isoDate, liveTable, monthText, shiftMonth } from './ops';
import type { DeviceBatch, DeviceDayView, DevicePreview, IndustrialEvent, IndustrialInput, IndustrialList, IndustrialOptions, LoadState, MyOvertime, OtCategory, OtClaim, OtReview, Periods, Preflight } from './live/types';
// TIM-08 live (Me › My shifts).
import { useSaveErrors } from '../../components/field';
import type { MyShifts } from './live/types';
import './time.css';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "10 Sep 2026": the house date, always with the year. */
const dm = formatDate;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "2 h" for whole hours, else "2 h 15 m". */
const hhmmOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dur = (min: number) => (min >= 60 && min % 60 === 0 ? `${min / 60} h` : fmtDuration(min));
const range = (from: Date, to: Date) => (from.getMonth() === to.getMonth() ? `${from.getDate()}–${dm(to)}` : `${dm(from)} – ${dm(to)}`);
const storyHref = (id: string, args?: string) => `/?path=/story/${id}${args ? `&args=${args}` : ''}`;
/**
 * Blocked reason on its own line above the footer buttons (drawer and dialog footers wrap). Width, not flex-basis:
 * in a stacked (column) phone footer a 100% basis is a height, and the reason must never widen the footer.
 */
const FootReason = ({ children }: { children: ReactNode }) => <span className="yx-tim-muted" style={{ width: '100%', minWidth: 0 }}>{children}</span>;

/* =====================================================================
   TIM-07 · Attendance request sheet (regularise / WFH / on-duty / OT pre-approval / hourly permission)
   ===================================================================== */

export type AttReqType = 'regularise' | 'wfh' | 'on_duty' | 'ot' | 'permission';

export interface AttendanceRequestProps {
  type?: AttReqType;
  /** Regularisations already used this month (limit 4, M02 Q5). */
  used?: number;
  /** WFH days already used this month (default: Divya's September calendar). */
  wfhUsed?: number;
  /** Start on a day in a locked month, so it goes as a late request (P08 Q4). */
  locked?: boolean;
  /** Batch A item 7 (B4): hourly permissions already asked for this month (company limit 2 of up to 2 hours each). */
  permissionUsed?: number;
  submitted?: boolean;
  surface?: 'desk' | 'phone';
  error?: boolean;
}

const TYPE_OPTIONS: { value: AttReqType; label: string }[] = [
  { value: 'regularise', label: 'Regularise' },
  { value: 'wfh', label: 'Work from home' },
  { value: 'on_duty', label: 'On duty' },
  { value: 'ot', label: 'OT pre-approval' },
  { value: 'permission', label: 'Hourly permission' },
];
/** Short labels keep the joined Segment on one line in a narrow drawer. */
const TYPE_SHORT: { value: AttReqType; label: string }[] = [
  { value: 'regularise', label: 'Regularise' },
  { value: 'wfh', label: 'WFH' },
  { value: 'on_duty', label: 'On duty' },
  { value: 'ot', label: 'OT' },
  { value: 'permission', label: 'Permission' },
];
/** 10 Sep is Divya's open missed check-out (SEPTEMBER 'MP', EXCEPTIONS x2): kiosk check-in 9:31 am, no check-out. */
const RECORDED_IN = '09:31';
const toHm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
/** "In 9:52 am" → "09:52". */
const noteTime = (note?: string) => {
  const m = note?.match(/(\d+):(\d+) (am|pm)/);
  return m ? toHm(((Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0)) * 60 + Number(m[2])) : null;
};
/** Divya's day in the open month (SEPTEMBER), or undefined for other months. */
const sepDay = (d: Date | null) => (d && d.getMonth() === TODAY.getMonth() ? SEPTEMBER.find((x) => x.date.getDate() === d.getDate()) : undefined);
/** What the records show for a day: the recorded check-in and check-out the form starts from (none for a day without punches). */
function recordedTimes(d: Date | null): { in: string | null; out: string | null } {
  const day = sepDay(d);
  if (day?.code === 'MP') return { in: RECORDED_IN, out: null };
  const inAt = day?.code === 'L' ? noteTime(day.note) : null;
  // Late days: worked time plus the 30-min break gives the recorded check-out.
  return inAt && day?.workedMin ? { in: inAt, out: toHm(Number(inAt.slice(0, 2)) * 60 + Number(inAt.slice(3)) + day.workedMin + 30) } : { in: null, out: null };
}
/** Why a day in the open month has nothing to regularise, or null when it has. */
function nothingToFix(d: Date | null) {
  const day = sepDay(d);
  if (!d || !day || day.code === 'MP' || day.code === 'L') return null;
  const when = dm(d);
  if (day.code === 'R') return `${when} already has a request waiting`;
  if (day.code === 'TODAY') return "Today isn't over yet: check out as usual";
  if (day.code === 'WO') return `${when} is a weekly off: nothing to fix`;
  if (day.code === 'H') return `${when} is a holiday: nothing to fix`;
  if (day.code === 'CL' || day.code === 'HD') return `${when} is on approved leave: nothing to fix`;
  return `Nothing to fix on ${when}`;
}
const FIX_OPTIONS = [
  { value: 'in', label: 'Missed check-in' },
  { value: 'out', label: 'Missed check-out' },
  { value: 'wrong', label: 'Wrong time recorded' },
  { value: 'full', label: 'Full day (no punches)' },
];
const REG_LIMIT = 4;
const WFH_LIMIT = 4;
const LATE_DAYS = 60;
/** On duty can be asked up to this many days ahead. */
const OD_AHEAD = 30;
/** Batch A item 7 (B4): the company default, 2 permissions a month of up to 2 hours each; they never use leave. */
const PM_LIMIT = 2;
const PM_MAX = 120;
/** "2 hours" / "90 minutes". */
const minutesText = (m: number) => (m % 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`);
const SEP_WFH = SEPTEMBER.filter((d) => d.code === 'WFH').length;
const MONTH_START = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
/** The open month's payroll closes on its last day (30 Sep), as My attendance says. */
const PAYROLL_CLOSE = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0);

function defaultDate(type: AttReqType, locked: boolean) {
  if (locked) return new Date(2026, 7, 21);
  if (type === 'ot') return new Date(2026, 9, 1); // pre-approval is for a day still to come
  if (type === 'regularise') return new Date(2026, 8, 10);
  return new Date(2026, 8, 30);
}

/** Sample reasons for the stories; switching type clears the reason. */
function defaultReason(type: AttReqType, locked: boolean) {
  if (type === 'regularise') return locked ? 'Visited Hosur plant all day; the kiosk there was offline.' : 'Phone died at 2 pm; left office at 6:40 pm. Security register can confirm.';
  if (type === 'wfh') return 'Plumber visit at home in the morning';
  if (type === 'on_duty') return 'Supplier quality audit with the Hosur plant team';
  if (type === 'permission') return 'Bank visit to sign the home-loan papers';
  return 'Batch release testing for the October launch';
}

/** Divya's weekly offs are Sundays and the 2nd and 4th Saturdays (SEPTEMBER). */
function dayType(d: Date) {
  if (HOLIDAYS.some((h) => h.date.toDateString() === d.toDateString())) return 'holiday';
  const wd = d.getDay();
  return wd === 0 || (wd === 6 && [2, 4].includes(Math.ceil(d.getDate() / 7))) ? 'weekly off' : 'normal day';
}

function useAttendanceRequest({ type: t0 = 'regularise', used = 1, wfhUsed = SEP_WFH, locked: lockedStart = false, error = false, permissionUsed = 0 }: AttendanceRequestProps) {
  const [type, setTypeRaw] = useState<AttReqType>(t0);
  const [date, setDate] = useState<Date | null>(defaultDate(t0, lockedStart));
  const [fix, setFix] = useState(lockedStart ? 'full' : 'out');
  const [inT, setIn] = useState<string | null>(lockedStart ? '09:30' : RECORDED_IN);
  const [outT, setOut] = useState<string | null>(error ? null : '18:40');
  const [where, setWhere] = useState('Hosur plant');
  const [odFrom, setOdFrom] = useState<string | null>('08:30');
  const [odTo, setOdTo] = useState<string | null>('18:00');
  const [otHours, setOtHours] = useState<number | null>(2);
  const [pmFrom, setPmFrom] = useState<string | null>('16:30');
  const [pmTo, setPmTo] = useState<string | null>('18:30');
  const [takeAs, setTakeAs] = useState<'pay' | 'comp'>('pay');
  const [reason, setReason] = useState(defaultReason(t0, lockedStart));
  // Send pressed too early: the missing field says so (never a disabled Send).
  const [tried, setTried] = useState(false);
  // A new day starts from that day's own punches, never from another day's.
  const pickDate = (d: Date | null) => { setDate(d); const r = recordedTimes(d); setIn(r.in); setOut(r.out); };
  const setType = (t: AttReqType) => { setTypeRaw(t); pickDate(defaultDate(t, false)); setReason(''); };
  // A past day before this month is in a locked period: it goes as a late request.
  const locked = (type === 'regularise' || type === 'on_duty') && !!date && dayStart(date) < MONTH_START;
  const day = sepDay(date);
  const recIn = recordedTimes(date).in;
  // A missed check-out (10 Sep) keeps its kiosk check-in, so only the check-out or a wrong time can be fixed; a late day can only fix the wrong time.
  const punched = day?.code === 'MP';
  const fixOptions = punched ? FIX_OPTIONS.filter((o) => o.value === 'out' || o.value === 'wrong') : day?.code === 'L' ? FIX_OPTIONS.filter((o) => o.value === 'wrong') : FIX_OPTIONS;
  const nothing = type === 'regularise' && !locked ? nothingToFix(date) : null;
  const off = date ? dayType(date) : 'normal day';
  const holidayName = date ? HOLIDAYS.find((h) => h.date.toDateString() === date.toDateString())?.name : undefined;
  const wfhOffErr = type === 'wfh' && date && off !== 'normal day' ? `${dm(date)} is ${off === 'holiday' ? `a holiday (${holidayName})` : 'your weekly off'}` : null;
  const fixNow = fixOptions.some((o) => o.value === fix) ? fix : fixOptions[0].value;
  const route = regularisationRoute({ usedThisMonth: type === 'regularise' && !locked ? used : 0, dateLocked: locked });
  // WFH has its own monthly limit: past it, HR approves too.
  const wfhThisMonth = date && date.getMonth() === TODAY.getMonth() ? wfhUsed : 0;
  const wfhOver = type === 'wfh' && wfhThisMonth >= WFH_LIMIT;
  const steps = wfhOver ? [...route.steps, 'HR'] : route.steps;
  const hr = steps.includes('HR');
  const past = !!date && dayStart(date) < dayStart(TODAY);
  const future = !!date && dayStart(date) > dayStart(TODAY);
  const ago = date ? daysUntil(TODAY, date) : 0;
  const dateErr = !date
    ? null
    : type === 'regularise' && future
      ? 'Pick today or an earlier date'
      : (type === 'regularise' || type === 'on_duty' || type === 'permission') && ago > LATE_DAYS
        ? `Pick a date in the last ${LATE_DAYS} days`
        : (type === 'on_duty' || type === 'permission') && -ago > OD_AHEAD
          ? `Pick a date in the next ${OD_AHEAD} days`
          : (type === 'ot' || type === 'wfh') && past
            ? 'Pick today or a later date'
            : nothing ?? wfhOffErr;
  const otMin = Math.round((otHours ?? 0) * 60);
  const otErr = type !== 'ot' ? null : !otHours ? 'Enter the planned hours' : otMin < 30 ? 'Enter at least 0.5 h' : otMin % 15 ? 'Use quarter hours (e.g. 1.25 or 1.5)' : null;
  const outErr = type !== 'regularise' || nothing ? null : !outT ? 'Enter the check-out time' : !inT || outT <= inT ? 'Enter a check-out time after check-in' : null;
  const odErr = type !== 'on_duty' ? null : !where.trim() ? 'Enter where you will be' : !odFrom || !odTo ? 'Enter the From and To times' : odTo <= odFrom ? 'Enter a To time after From' : null;
  // Hourly permission: within the company's length; past the monthly count it is refused (answer 2310).
  const pmMin = pmFrom && pmTo ? Number(pmTo.slice(0, 2)) * 60 + Number(pmTo.slice(3)) - Number(pmFrom.slice(0, 2)) * 60 - Number(pmFrom.slice(3)) : 0;
  const pmErr = type !== 'permission' ? null : !pmFrom || !pmTo ? 'Enter the From and To times' : pmMin <= 0 ? 'Enter a To time after From' : pmMin > PM_MAX ? `A permission can be at most ${minutesText(PM_MAX)}. Apply for leave for a longer time.` : null;
  const pmThisMonth = date && date.getMonth() === TODAY.getMonth() ? permissionUsed : 0;
  const pmOver = type === 'permission' && pmThisMonth >= PM_LIMIT;
  const pmDayErr = type !== 'permission' || !date ? null : pmOver ? `You have used all ${PM_LIMIT} permissions for ${MONTH[date.getMonth()]}. Apply for leave instead.` : off !== 'normal day' ? `${dm(date)} is ${off === 'holiday' ? `a holiday (${holidayName})` : 'your weekly off'}: no permission needed` : null;
  const blocked = !date
    ? 'Pick a date'
    : dateErr ?? pmDayErr ?? outErr ?? odErr ?? pmErr ?? otErr ?? (!reason.trim() ? 'Enter a reason' : null);
  return { tried, setTried, type, setType, date, setDate: pickDate, day, recIn, nothing, off, fix: fixNow, setFix, fixOptions, punched, inT, setIn, outT, setOut, where, setWhere, odFrom, setOdFrom, odTo, setOdTo, otHours, setOtHours, otMin, otErr, pmFrom, setPmFrom, pmTo, setPmTo, pmMin, pmErr, pmDayErr, pmThisMonth, pmOver, takeAs, setTakeAs, reason, setReason, route, steps, hr, locked, used, wfhUsed, wfhThisMonth, wfhOver, dateErr, outErr, odErr, blocked };
}
type ReqState = ReturnType<typeof useAttendanceRequest>;

const beforeText = (s: ReqState) =>
  s.type === 'regularise'
    ? s.locked ? 'Absent · unpaid' : s.nothing ? 'Nothing to fix' : s.day?.code === 'L' ? `Late · ${s.day.note ?? ''}` : s.fix === 'out' ? 'Missing check-out' : s.fix === 'in' ? 'Missing check-in' : s.fix === 'full' ? 'No punches' : 'Wrong time recorded'
    : s.type === 'ot' ? 'No OT approved' : 'Expected in office';

function AttendanceRequestForm({ s, surface }: { s: ReqState; surface?: 'desk' | 'phone' }) {
  const { type, date, fix, locked, otMin } = s;
  // While the times are incomplete, say what is missing instead of a half-filled result.
  const afterMissing = s.nothing ? 'Pick a day that needs fixing' : s.outErr ? 'Add the check-out time to see the result' : s.odErr ? 'Add the place and times to see the result' : s.pmErr ? 'Add the times to see the result' : s.otErr ? 'Add the planned hours to see the result' : null;
  const after =
    type === 'regularise'
      ? `Present ${s.inT ? fmt12(s.inT) : '…'} – ${s.outT ? fmt12(s.outT) : '…'}`
      : type === 'wfh'
        ? 'Work from home · counts as present'
        : type === 'on_duty'
          ? `On duty at ${s.where.trim() || '…'}, ${s.odFrom ? fmt12(s.odFrom) : '…'} – ${s.odTo ? fmt12(s.odTo) : '…'}`
          : type === 'permission'
            ? `Permission ${s.pmFrom ? fmt12(s.pmFrom) : '…'} – ${s.pmTo ? fmt12(s.pmTo) : '…'} · the day stays present`
            : s.takeAs === 'pay'
            ? `Up to ${dur(otMin)} OT · paid at 2× (${date ? dayType(date) : 'normal day'})`
            : `Up to ${dur(otMin)} OT · ${otMin >= 240 ? '1 day' : '0.5 day'} comp-off credit`;
  const approvers = s.steps.map((x) => (x === 'Manager' ? ME.manager : x)).join(' → ');
  // A fix for a day in the open month is paid this month only if it is approved before payroll closes.
  const payDeadline = (type === 'regularise' || type === 'on_duty') && !locked && !s.nothing && !!date && date.getMonth() === TODAY.getMonth() && dayStart(date) <= dayStart(TODAY);
  const lockedMonth = date ? MONTH[date.getMonth()] : '';
  const lateRule = `Days before ${dm(MONTH_START)} go as a late request (up to ${LATE_DAYS} days back).`;
  const helper =
    locked
      ? `${lockedMonth} is locked, so this goes as a late request.`
      : type === 'regularise'
        ? lateRule
        : type === 'wfh'
          ? 'Pick the day you will work from home.'
          : type === 'on_duty'
            ? `Up to ${OD_AHEAD} days ahead. ${lateRule}`
            : type === 'permission'
              ? `Up to ${OD_AHEAD} days ahead or ${LATE_DAYS} days back.`
              : 'Pick today or a later date.';
  const min = type === 'regularise' || type === 'on_duty' || type === 'permission' ? addDays(TODAY, -LATE_DAYS) : dayStart(TODAY);
  const max = type === 'regularise' ? dayStart(TODAY) : type === 'on_duty' || type === 'permission' ? addDays(TODAY, OD_AHEAD) : undefined;
  return (
    <div className="yx-tim-form">
      <FormField label="Request type" required>
        {surface === 'phone' ? (
          <Select value={type} onChange={(v) => v && s.setType(v)} options={TYPE_OPTIONS} />
        ) : (
          <Segment label="Request type" value={type} onChange={s.setType} options={TYPE_SHORT} />
        )}
      </FormField>
      <FormField id="ar-date" label="Date" required error={s.dateErr ?? s.pmDayErr ?? (s.tried && !date ? 'Pick a date' : null)} helper={helper}>
        <DatePicker value={date} onChange={s.setDate} min={min} max={max} />
      </FormField>
      {type === 'regularise' && !s.nothing && (
        <>
          <FormField label="What needs fixing" required helper={s.recIn ? `Recorded check-in on this day: ${fmt12(s.recIn)}.` : undefined}>
            <RadioGroup aria-label="What needs fixing" value={fix} onChange={s.setFix} options={s.fixOptions} />
          </FormField>
          <FieldRow>
            {fix === 'out' && s.punched && s.recIn ? (
              <FormField label="Check-in" helper="Recorded by the kiosk; can't be changed here">
                <p>{fmt12(s.recIn)}</p>
              </FormField>
            ) : (
              <FormField label="Check-in">
                <TimeField value={s.inT} onChange={s.setIn} placeholder="--:--" />
              </FormField>
            )}
            <FormField id="ar-out" label="Check-out" error={s.outErr}>
              <TimeField value={s.outT} onChange={s.setOut} placeholder="--:--" />
            </FormField>
          </FieldRow>
        </>
      )}
      {type === 'on_duty' && (
        <>
          <FormField id="ar-where" label="Where" required><TextField value={s.where} onChange={s.setWhere} /></FormField>
          <FieldRow>
            <FormField label="From" required><TimeField value={s.odFrom} onChange={s.setOdFrom} placeholder="--:--" /></FormField>
            <FormField label="To" required error={s.odFrom && s.odTo && s.odTo <= s.odFrom ? 'Enter a To time after From' : null}><TimeField value={s.odTo} onChange={s.setOdTo} placeholder="--:--" /></FormField>
          </FieldRow>
        </>
      )}
      {type === 'permission' && (
        <FieldRow>
          <FormField id="ar-from" label="From" required><TimeField value={s.pmFrom} onChange={s.setPmFrom} placeholder="--:--" /></FormField>
          <FormField id="ar-to" label="To" required error={s.pmFrom && s.pmTo ? s.pmErr : s.tried ? s.pmErr : null} helper={`Up to ${minutesText(PM_MAX)}`}><TimeField value={s.pmTo} onChange={s.setPmTo} placeholder="--:--" /></FormField>
        </FieldRow>
      )}
      {type === 'ot' && (
        <FieldRow>
          <FormField id="ar-ot" label="Planned OT (hours)" required error={s.otHours || s.tried ? s.otErr : null} helper="Min 0.5 h, in quarter hours"><NumberField decimals value={s.otHours} onChange={s.setOtHours} placeholder="e.g. 1.25" /></FormField>
          <FormField label="Take as">
            <Select value={s.takeAs} onChange={(v) => v && s.setTakeAs(v)} options={[{ value: 'pay', label: 'Paid overtime' }, { value: 'comp', label: 'Comp-off credit' }]} />
          </FormField>
        </FieldRow>
      )}
      <FormField id="ar-reason" label="Reason" required error={s.tried && !s.reason.trim() ? 'Enter a reason' : null}>
        <TextArea rows={2} value={s.reason} onChange={s.setReason} />
      </FormField>
      <section className="yx-tim-effect" aria-live="polite" aria-label="Effect before you send">
        <strong>Effect on {date ? dm(date) : 'the day'}</strong>
        <div className="yx-tim-effect__line"><span className="yx-tim-muted">Now</span><Badge tone={locked && type === 'regularise' ? 'danger' : 'neutral'}>{beforeText(s)}</Badge></div>
        <div className="yx-tim-effect__line"><span className="yx-tim-muted">After</span>{afterMissing ? <Badge tone="neutral">{afterMissing}</Badge> : <Badge tone="success">{after}</Badge>}</div>
        {type === 'wfh' && date && (
          <p className="yx-tim-muted">
            {s.wfhOver
              ? `This would be WFH day ${s.wfhThisMonth + 1} of ${WFH_LIMIT} in ${MONTH[date.getMonth()]}, so HR approves too.`
              : `This will be WFH day ${s.wfhThisMonth + 1} of ${WFH_LIMIT} in ${MONTH[date.getMonth()]}.`}
          </p>
        )}
        {type === 'permission' && date && !s.pmOver && (
          <p className="yx-tim-muted">This will be permission {s.pmThisMonth + 1} of {PM_LIMIT} in {MONTH[date.getMonth()]}. It does not use leave.</p>
        )}
        {type === 'on_duty' && date && s.off !== 'normal day' && (
          <p className="yx-tim-muted">{dm(date)} is {s.off === 'holiday' ? 'a holiday' : 'your weekly off'}: you can claim the day as comp-off after it is approved.</p>
        )}
        <p className="yx-tim-muted">Approval: {approvers}</p>
        {payDeadline && (
          <div className="yx-tim-row">
            <span className="yx-tim-muted">Approve by {dm(PAYROLL_CLOSE)} to be paid in {MONTH[TODAY.getMonth()]} payroll</span>
            <DueBadge date={PAYROLL_CLOSE} />
          </div>
        )}
        {locked ? (
          <p className="yx-tim-muted">Late requests also go to HR. They don't count towards your monthly limit. The fix is paid in {LATE_PAYROLL} payroll.</p>
        ) : type === 'regularise' ? (
          <p className="yx-tim-muted">{s.used >= REG_LIMIT ? `Limit reached (${s.used} of ${REG_LIMIT}): HR approves too.` : `${s.route.left} of ${REG_LIMIT} regularisations left this month.`}</p>
        ) : null}
      </section>
    </div>
  );
}

export function AttendanceRequestSheet(p: AttendanceRequestProps & { live?: LiveAttendanceRequest }) {
  if (p.live) return <LiveAttendanceRequestDrawer live={p.live} />;
  return <SampleAttendanceRequestSheet {...p} />;
}

function SampleAttendanceRequestSheet(p: AttendanceRequestProps) {
  const [open, setOpen] = useState(true);
  const [sent, setSent] = useState(!!p.submitted);
  const [withdrawn, setWithdrawn] = useState(false);
  const [askWithdraw, setAskWithdraw] = useState(false);
  const s = useAttendanceRequest(p);
  const close = () => setOpen(false);
  // Pressed too early: the field that is missing shows its error and takes focus.
  const firstField = !s.date || s.dateErr || s.pmDayErr ? 'ar-date' : s.outErr ? 'ar-out' : s.odErr ? 'ar-where' : s.pmErr ? 'ar-to' : s.otErr ? 'ar-ot' : 'ar-reason';
  const send = <Button variant="primary" onClick={() => { if (!s.blocked) return setSent(true); s.setTried(true); document.getElementById(firstField)?.focus(); }}>Send request</Button>;
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === s.type)?.label ?? '';
  const summary = `${typeLabel} · ${s.date ? dm(s.date) : ''}`;
  const title = withdrawn ? 'Request withdrawn' : sent ? 'Request sent' : p.surface === 'phone' ? 'Attendance request' : 'New attendance request';
  const body = sent ? <SentState s={s} withdrawn={withdrawn} /> : <AttendanceRequestForm s={s} surface={p.surface} />;
  // Opens the attendance calendar on the request's day (September days have a day card).
  const dayHref = storyHref('screens-time-extra-·-attendance-calendar--employee') + (s.date && s.date.getMonth() === TODAY.getMonth() ? `&args=openDay:${s.date.getDate()}` : '');
  // Desk: the main next step, so it sits right in a row and first when the footer stacks; Withdraw goes last.
  const viewDay = <Button variant={p.surface === 'phone' ? undefined : 'primary'} asChild><a href={dayHref} target="_top">View attendance</a></Button>;
  const withdrawButton = !withdrawn && <Button onClick={() => setAskWithdraw(true)}>Withdraw request</Button>;
  const withdrawConfirm = (
    <ConfirmDialog
      open={askWithdraw}
      onOpenChange={setAskWithdraw}
      title={`Withdraw the ${typeLabel.toLowerCase()} request for ${s.date ? dm(s.date) : 'this day'}?`}
      consequence={`${ME.manager} no longer sees it. You can send a new request later.`}
      confirmLabel="Withdraw request"
      cancelLabel="Keep request"
      destructive
      onConfirm={() => setWithdrawn(true)}
    />
  );
  if (p.surface === 'phone')
    return (
      <PhoneFrame tab="time" title="Time">
        <BottomSheet
          open={open}
          onOpenChange={setOpen}
          title={title}
          // The sheet footer stacks bottom-up: the last item sits on top, so the reason reads right above Send, and Done tops the sent footer with Withdraw last.
          footer={sent
            ? <>{withdrawButton}{viewDay}<Button onClick={close}>Done</Button></>
            : <><Button onClick={close}>Cancel</Button>{send}{s.blocked && <span className="yx-tim-muted">{s.blocked}</span>}</>}
        >
          {body}
        </BottomSheet>
        {withdrawConfirm}
      </PhoneFrame>
    );
  return (
    <TimePage active="My attendance">
      <PageHeader title="My attendance" description="September 2026" />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={title}
        subtitle={sent ? summary : s.hr ? `Goes to ${ME.manager}, then HR` : `Goes to ${ME.manager} (your manager)`}
        footer={sent
          ? <>{withdrawButton}{viewDay}</>
          : <>{s.blocked && <FootReason>{s.blocked}</FootReason>}<Button onClick={close}>Cancel</Button>{send}</>}
      >
        {body}
      </Drawer>
      {withdrawConfirm}
    </TimePage>
  );
}

function SentState({ s, withdrawn }: { s: ReqState; withdrawn: boolean }) {
  const day = s.date ? dm(s.date) : 'The day';
  if (withdrawn)
    return <InlineAlert tone="info" title="Request withdrawn">{day} shows "{beforeText(s)}" again. You can send a new request any time.</InlineAlert>;
  const steps: ApprovalStep[] = [
    { id: 's1', label: 'Requested', status: 'done', approver: ME.name, at: new Date(2026, 8, 29, 9, 40) },
    { id: 's2', label: 'Manager approval', status: 'current', approver: ME.manager },
  ];
  if (s.hr) steps.push({ id: 's3', label: 'HR approval', status: 'pending', approver: HR_ADMIN.name });
  return (
    <div className="yx-tim-stack">
      <InlineAlert tone="info" title={`Sent to ${ME.manager}${s.hr ? ', then HR' : ''}`}>
        {day} shows "{s.type === 'regularise' ? 'Regularisation pending' : 'Request pending'}" until it's decided. You'll get a notification.
      </InlineAlert>
      <ApprovalTimeline now={TODAY} steps={steps} />
    </div>
  );
}

/* ---------- TIM-07 OnDuty sent back (TIM-19 SentBack style): what the manager asked, Change and send again, Withdraw ---------- */

export interface OnDutySentBackProps {
  on: string;
  place: string;
  inMinute: number;
  outMinute: number;
  reason: string;
  /** What the manager asked to change. */
  sentBack: string | null;
  by?: string | null;
  onResend: () => void;
  onWithdraw: () => Promise<unknown>;
  onClose: () => void;
}

const SAMPLE_SENT_BACK: Omit<OnDutySentBackProps, 'onResend' | 'onWithdraw' | 'onClose'> = { on: '2026-09-30', place: 'Hosur plant', inMinute: 510, outMinute: 1080, reason: 'Supplier quality audit with the Hosur plant team', sentBack: 'Add the plant gate times; the audit starts at 7:30 am.', by: ME.manager };

/** TIM-07 · On duty sent back. Stories show the sample; the app passes `live` (the request and its actions). */
export function OnDutySentBackSheet({ live }: { live?: OnDutySentBackProps }) {
  const [open, setOpen] = useState(true);
  const [ask, setAsk] = useState(false);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  if (!open) return null;
  const r = live ?? { ...SAMPLE_SENT_BACK, onResend: () => setOpen(false), onWithdraw: async () => undefined, onClose: () => setOpen(false) };
  const date = new Date(Number(r.on.slice(0, 4)), Number(r.on.slice(5, 7)) - 1, Number(r.on.slice(8, 10)));
  const by = r.by ?? 'Your manager';
  const steps: ApprovalStep[] = [
    { id: 's1', label: 'Requested', status: 'done' },
    { id: 's2', label: 'Sent back for changes', status: 'done', approver: by, ...(r.sentBack ? { comment: r.sentBack } : {}) },
  ];
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && r.onClose()}
      title={`On duty · ${formatDate(date)}`}
      subtitle="Sent back for changes"
      footer={
        <>
          <Button onClick={() => setAsk(true)}>Withdraw</Button>
          <Button variant="primary" onClick={r.onResend}>Change and send again</Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        {error && <InlineAlert tone="danger" title="Not withdrawn">{error}</InlineAlert>}
        <InlineAlert tone="warning" title={`${by} sent it back for changes`}>{r.sentBack || 'No note was given.'}</InlineAlert>
        <DescriptionList items={[{ label: 'Where', value: r.place }, { label: 'Time', value: `${fmt12(hhmmOf(r.inMinute))} – ${fmt12(hhmmOf(r.outMinute))}` }, { label: 'Reason', value: r.reason }]} />
        <ApprovalTimeline now={TODAY} steps={steps} />
      </div>
      <ConfirmDialog
        open={ask}
        onOpenChange={setAsk}
        title="Withdraw this request?"
        consequence="It was sent back, so the day is not on duty. Withdrawn, it stays in your history."
        confirmLabel={busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw request'}
        cancelLabel="Keep request"
        onConfirm={() =>
          void run('withdraw', async () => {
            await r.onWithdraw();
            setAsk(false);
            toast({ tone: 'success', title: 'Request withdrawn' });
            r.onClose();
          })
        }
      />
    </Drawer>
  );
}

/* ---------- TIM-02 · Pre-approve overtime (manager, from the team muster; TIM-07 Ot style) ---------- */

/** A report the manager may pre-approve overtime for (never themselves). */
export interface OtPreApprovePerson {
  id: string;
  name: string;
  /** "KF-0112 · Chennai office". */
  detail?: string;
  /** The company's plan-ahead limit for this person (attendance.overtime.plan_ahead_days). */
  aheadDays?: number;
  /** Covered by the Factories Act: overtime is paid by law, so only Paid overtime is offered. */
  paidOnly?: boolean;
}

export interface OtPreApproveProps {
  people: OtPreApprovePerson[];
  /** Opened from one person: that person is chosen. */
  employeeId?: string | null;
  /** Today in the company's zone, "2026-11-02". */
  today: string;
  /** How far ahead overtime may be planned when the person carries no limit of their own (default 30). */
  aheadDays?: number;
  /** Approved at once (the manager is the approver); a refusal is shown in the sheet. */
  onSubmit: (employeeId: string, input: OtPlanInput) => Promise<unknown>;
  onClose: () => void;
}

/** The sheet's story states: empty, filled in, Pre-approve pressed too early, refused by the server. */
export type OtPreApproveSample = 'default' | 'filled' | 'errors' | 'refused' | 'factory';

// The Hosur plant's lab technicians are factory workers in the sample (only Paid overtime for them).
const OT_SAMPLE_PEOPLE: OtPreApprovePerson[] = TEAM.filter((p) => isMyReport(p.name)).map((p) => ({ id: p.id, name: p.name, detail: `${p.code} · ${p.location}`, aheadDays: 30, ...(p.role === 'Lab Technician' ? { paidOnly: true } : {}) }));

/** TIM-02 Manager · Pre-approve overtime: approved at once and audited; the person claims it after the work. */
export function OtPreApproveSheet({ live, sample = 'default' }: { live?: OtPreApproveProps; sample?: OtPreApproveSample }) {
  const [open, setOpen] = useState(true);
  const filled = !live && (sample === 'filled' || sample === 'refused' || sample === 'factory');
  const p: OtPreApproveProps = live ?? {
    people: OT_SAMPLE_PEOPLE,
    employeeId: sample === 'factory' ? 't5' : filled ? 't1' : null,
    today: isoOf(TODAY),
    onSubmit: async () => {
      if (sample === 'refused') throw new Error(`Overtime on ${dm(addDays(TODAY, 2))} is already asked for. Withdraw that request first.`);
    },
    onClose: () => setOpen(false),
  };
  const today = isoDay(p.today);
  const ahead0 = p.aheadDays ?? 30;
  // One report: they are the only choice, so they are chosen. The date starts on today, as on TIM-07 Ot.
  const [who, setWho] = useState<string | null>(p.employeeId ?? (p.people.length === 1 ? p.people[0]!.id : null));
  const [date, setDate] = useState<Date | null>(filled ? addDays(today, 2) : sample === 'errors' && !live ? null : today);
  const [hours, setHours] = useState<number | null>(filled ? 2.5 : null);
  const [takeAs, setTakeAs] = useState<'pay' | 'comp_off'>('pay');
  const [reason, setReason] = useState(filled ? 'Month-end batch release' : '');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const on = date ? isoOf(date) : null;
  const minutes = Math.round((hours ?? 0) * 60);
  const person = p.people.find((x) => x.id === who);
  // The chosen person's own limit (their entity's setting), else the page's.
  const ahead = person?.aheadDays ?? ahead0;
  // A factory worker's overtime is paid by law: whatever was picked before, it goes as paid.
  const paidOnly = Boolean(person?.paidOnly);
  const as = paidOnly ? 'pay' : takeAs;
  const errors = [
    ...(!who ? [{ fieldId: 'ot-who', message: 'Choose the person' }] : []),
    ...(!on
      ? [{ fieldId: 'ot-date', message: 'Pick the date' }]
      : on < p.today
        ? [{ fieldId: 'ot-date', message: 'Pick today or a later date' }]
        : (isoDay(on).getTime() - today.getTime()) / 86_400_000 > ahead
          ? [{ fieldId: 'ot-date', message: `Pick a date in the next ${ahead} days` }]
          : []),
    ...(!hours
      ? [{ fieldId: 'ot-hours', message: 'Enter the hours' }]
      : minutes < 30
        ? [{ fieldId: 'ot-hours', message: 'Enter at least 0.5 h' }]
        : minutes > 720
          ? [{ fieldId: 'ot-hours', message: 'Enter at most 12 h' }]
          : minutes % 15
            ? [{ fieldId: 'ot-hours', message: 'Use quarter hours (e.g. 1.25 or 1.5)' }]
            : []),
    ...(!reason.trim() ? [{ fieldId: 'ot-reason', message: 'Enter the reason' }] : []),
  ];
  const early = useTooEarly(errors);
  const send = () => {
    if (early.stop() || !who || !on) return;
    void run('send', async () => {
      await p.onSubmit(who, { on, minutes, takeAs: as, reason: reason.trim() });
      toast({ tone: 'success', title: `Overtime pre-approved for ${person?.name ?? 'your team member'}`, description: `Up to ${dur(minutes)} on ${dm(isoDay(on))}, ${as === 'pay' ? 'paid' : 'as comp-off'}. They claim it on My overtime after the work.` });
      p.onClose();
    });
  };
  // The story states press Pre-approve once on opening: "errors" shows the field errors, "refused" the server's answer.
  useEffect(() => {
    if (!live && (sample === 'errors' || sample === 'refused')) send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!open) return null;
  const first = person ? person.name.split(' ')[0] : null;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && p.onClose()}
      title="Pre-approve overtime"
      subtitle="Approved at once, as their manager"
      dirty={Boolean(reason.trim() || hours)}
      footer={
        <>
          {errors[0] && <FootReason>{errors[0].message}</FootReason>}
          <Button onClick={p.onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'send'} onClick={send}>Pre-approve</Button>
        </>
      }
    >
      <div className="yx-tim-form">
        {error && <InlineAlert tone="danger" title="Not pre-approved">{error}</InlineAlert>}
        <FormField id="ot-who" label="Person" required error={early.errorOf('ot-who')} helper="People who report to you.">
          <Select value={who} onChange={setWho} options={p.people.map((x) => ({ value: x.id, label: x.detail ? `${x.name} · ${x.detail}` : x.name }))} placeholder="Choose a person" searchable={p.people.length > 8} />
        </FormField>
        <FormField id="ot-date" label="Date" required error={early.errorOf('ot-date')} helper={`Today or up to ${ahead} days ahead.`}>
          <DatePicker value={date} onChange={setDate} min={today} max={addDays(today, ahead)} aria-label="Date" />
        </FormField>
        <FormField id="ot-hours" label="Planned OT (hours)" required error={early.errorOf('ot-hours')} helper="0.5 to 12 h, in quarter hours">
          <NumberField decimals value={hours} onChange={setHours} placeholder="e.g. 1.25" />
        </FormField>
        <FormField label="Take as" helper={paidOnly ? `${first} works under the Factories Act, so overtime is paid by law.` : undefined}>
          <Segment label="Take as" value={as} onChange={setTakeAs} options={paidOnly ? [{ value: 'pay' as const, label: 'Paid overtime' }] : [{ value: 'pay' as const, label: 'Paid overtime' }, { value: 'comp_off' as const, label: 'Comp-off credit' }]} />
        </FormField>
        <FormField id="ot-reason" label="Reason" required error={early.errorOf('ot-reason')} helper="Shown to the person and on their overtime claim.">
          <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
        <section className="yx-tim-effect" aria-live="polite" aria-label="Effect before you pre-approve">
          <strong>Effect{on ? ` on ${dm(isoDay(on))}` : ''}</strong>
          <div className="yx-tim-effect__line"><span className="yx-tim-muted">Now</span><Badge tone="neutral">No OT approved</Badge></div>
          <div className="yx-tim-effect__line">
            <span className="yx-tim-muted">After</span>
            {minutes > 0 ? <Badge tone="success">{as === 'pay' ? `Up to ${dur(minutes)} OT · paid at the overtime rate` : `Up to ${dur(minutes)} OT · comp-off credit`}</Badge> : <Badge tone="neutral">Add the hours to see the result</Badge>}
          </div>
          <p className="yx-tim-muted">{first ? `${first} claims` : 'They claim'} it on My overtime after the work; the claim shows it was pre-approved. Hours past this are still allowed and flagged to the approver.</p>
        </section>
      </div>
    </Drawer>
  );
}

/* ---------- TIM-07 live: the same sheet on the person's real month (Me › Attendance) ---------- */

/** What the live sheet needs: my month from the server, and the two requests it can send. */
export interface LiveAttendanceRequest {
  data: MyAttendance;
  type: 'regularise' | 'wfh' | 'on_duty' | 'ot' | 'permission';
  /** Regularising is offered (punch mode, or a late correction); default yes. */
  canRegularise?: boolean;
  /** TIM-07 Ot: overtime asked for ahead; without it the sheet has no OT choice. */
  onOtPlan?: (input: OtPlanInput) => Promise<unknown>;
  /** On duty sent back for changes: the sheet starts from it and sends it again. */
  resend?: FixRow;
  /** TIM-07 OnDuty; without it the sheet has no On duty choice. */
  onOnDuty?: (input: OnDutyInput) => Promise<unknown>;
  /** Batch A item 7 (B4): hourly permission; without it the sheet has no Permission choice. */
  onPermission?: (input: PermissionInput) => Promise<unknown>;
  /** The day to start on (a day picked on the calendar), else today. */
  on?: string | null;
  onFix: (input: FixInput) => Promise<unknown>;
  /** Work from home; without it the sheet only regularises. */
  onWfh?: (input: WfhInput) => Promise<unknown>;
  /** TIM-07 LateRequest: a day of a frozen or locked month goes as a late correction (manager, HR, payroll; paid next payroll). */
  onLateCorrection?: (input: LateCorrectionInput) => Promise<unknown>;
  /** Answer 2282: the company's leave types, for "it was this leave" on a late request. */
  leaveTypes?: { code: string; name: string }[];
  onClose: () => void;
}

const isoDay = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const minuteOf = (hhmm: string | null) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);
const LIVE_FIX: Record<string, LiveFixKind> = { in: 'missed_in', out: 'missed_out', wrong: 'wrong_time', full: 'full_day' };
const STATUS_NOW: Record<DayRow['status'], string> = { present: 'Present', half_day: 'Half day', absent: 'Absent', leave: 'On leave', holiday: 'Holiday', weekly_off: 'Weekly off', missing_in: 'Missing check-in', missing_out: 'Missing check-out', no_timesheet: 'No timesheet yet', not_started: 'Not worked out yet', strike: 'Strike', lockout: 'Lockout', layoff: 'Lay-off' };
/** The time of day in the person's zone as "HH:MM". */
const zoneHm = (iso: string | null | undefined, zone: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }) : null);

function LiveAttendanceRequestDrawer({ live }: { live: LiveAttendanceRequest }) {
  const d = live.data;
  const today = isoDay(d.today);
  type T = 'regularise' | 'wfh' | 'on_duty' | 'ot' | 'permission';
  const offered = (t: T) => (t === 'regularise' && live.canRegularise !== false) || (t === 'wfh' && !!live.onWfh) || (t === 'on_duty' && !!live.onOnDuty) || (t === 'ot' && !!live.onOtPlan) || (t === 'permission' && !!live.onPermission);
  const choices = (['regularise', 'wfh', 'on_duty', 'ot', 'permission'] as const).filter(offered);
  const [type, setTypeRaw] = useState<T>(offered(live.type) ? live.type : choices[0] ?? 'regularise');
  // TIM-07 Ot: planned hours and how the overtime is taken.
  const [otHours, setOtHours] = useState<number | null>(null);
  const [takeAs, setTakeAs] = useState<'pay' | 'comp_off'>('pay');
  const [date, setDate] = useState<Date | null>(live.on ? isoDay(live.on) : today);
  // On duty: where and when (a sent-back request starts from what was sent).
  const [where, setWhere] = useState(live.resend?.place ?? '');
  const [odFrom, setOdFrom] = useState<string | null>(live.resend?.inMinute != null ? hhmmOf(live.resend.inMinute) : null);
  const [odTo, setOdTo] = useState<string | null>(live.resend?.outMinute != null ? hhmmOf(live.resend.outMinute) : null);
  // Hourly permission: from and to.
  const [pmFrom, setPmFrom] = useState<string | null>(null);
  const [pmTo, setPmTo] = useState<string | null>(null);
  const on = date ? isoOf(date) : null;
  const day = on ? d.days.find((x) => x.on === on) : undefined;
  const recIn = zoneHm(day?.firstIn, d.zone);
  const recOut = zoneHm(day?.lastOut, d.zone);
  // The fixes that fit the day: a recorded check-in can't be "missed".
  const options = day?.status === 'missing_out' ? FIX_OPTIONS.filter((o) => o.value === 'out' || o.value === 'wrong') : day?.status === 'missing_in' ? FIX_OPTIONS.filter((o) => o.value === 'in' || o.value === 'wrong') : day?.status === 'present' ? FIX_OPTIONS.filter((o) => o.value === 'wrong') : FIX_OPTIONS;
  const [picked, setFix] = useState<string>(day?.status === 'missing_out' ? 'out' : day?.status === 'missing_in' ? 'in' : day?.status === 'absent' ? 'full' : 'wrong');
  const fix = options.some((o) => o.value === picked) ? picked : options[0].value;
  const [inT, setIn] = useState<string | null>(null);
  const [outT, setOut] = useState<string | null>(null);
  const [reason, setReason] = useState(live.resend?.reason ?? '');
  const setType = (t: T) => { setTypeRaw(t); setDate(today); };
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const needIn = type === 'regularise' && (fix === 'in' || fix === 'wrong');
  const needOut = type === 'regularise' && (fix === 'out' || fix === 'wrong');
  const when = date ? dm(date) : '';
  const pending = on && type !== 'on_duty' && type !== 'permission' ? d.requests.some((r) => r.on === on && r.status === 'pending' && (type === 'wfh') === (r.kind === 'wfh') && r.kind !== 'on_duty' && r.kind !== 'permission') : false;
  const pmRules = d.permission ?? { limit: 2, maxMinutes: 120, used: 0 };
  const pmUsed = on && on.slice(0, 7) === d.today.slice(0, 7) ? pmRules.used : 0;
  const odWindow = d.onDuty ?? { aheadDays: 30, backDays: 60 };
  const ago = on ? Math.round((isoDay(d.today).getTime() - isoDay(on).getTime()) / 86_400_000) : 0;
  const nothing = type !== 'regularise' || !day ? null : pending ? `${when} already has a request waiting` : ['weekly_off', 'holiday', 'leave'].includes(day.status) ? `${when} is ${day.status === 'leave' ? 'on approved leave' : day.status === 'holiday' ? 'a holiday' : 'a weekly off'}: nothing to fix` : null;
  // A day of a frozen or locked month goes as a late request (P08 Q4), up to the company's limit in days.
  const late = type === 'regularise' && !!on && !!live.onLateCorrection && (d.locked ?? []).includes(on);
  // Answer 2282: what the day should have been, a fixed choice (the server accepts only these).
  const [shouldBe, setShouldBe] = useState<'present' | 'half_day' | 'leave' | 'unpaid'>('present');
  const [lateLeave, setLateLeave] = useState<string | null>(null);
  const tooLate = late && d.lateRequestMaxDays !== undefined && (isoDay(d.today).getTime() - isoDay(on!).getTime()) / 86_400_000 > d.lateRequestMaxDays;
  const otMin = Math.round((otHours ?? 0) * 60);
  const otAhead = d.otAheadDays ?? 30;
  const dateErr = !on
    ? null
    : type === 'ot'
      ? on < d.today ? 'Pick today or a later date' : -ago > otAhead ? `Pick a date in the next ${otAhead} days` : (d.otPlans ?? []).some((p) => p.on === on && (p.status === 'pending' || p.status === 'approved')) ? `${when} already has overtime asked for` : null
    : type === 'permission'
      ? -ago > odWindow.aheadDays ? `Pick a date in the next ${odWindow.aheadDays} days` : ago > odWindow.backDays ? `Pick a date in the last ${odWindow.backDays} days` : (d.locked ?? []).includes(on) ? `${when} is in a locked month. Ask HR to record a correction.` : pmUsed >= pmRules.limit ? (pmRules.limit === 0 ? 'Your company does not allow hourly permission. Apply for leave instead.' : `You have used all ${pmRules.limit} permissions for ${MONTH[date!.getMonth()]}. Apply for leave instead.`) : day && ['weekly_off', 'holiday', 'leave'].includes(day.status) ? `${when} is ${day.status === 'leave' ? 'on leave' : day.status === 'holiday' ? 'a holiday' : 'your weekly off'}: no permission needed` : null
    : type === 'on_duty'
      ? -ago > odWindow.aheadDays ? `Pick a date in the next ${odWindow.aheadDays} days` : ago > odWindow.backDays ? `Pick a date in the last ${odWindow.backDays} days` : (d.locked ?? []).includes(on) ? `${when} is in a locked month. Ask HR to record a correction.` : null
      : type === 'regularise' ? (on > d.today ? 'Pick today or an earlier date' : tooLate ? `${when} is more than ${d.lateRequestMaxDays} days ago, so only HR can correct it now. Ask HR.` : nothing) : on < d.today ? 'Pick today or a later date' : pending ? `${when} already has a request waiting` : null;
  const od = type === 'on_duty';
  const pm = type === 'permission';
  const pmMin = minuteOf(pmTo) !== null && minuteOf(pmFrom) !== null ? minuteOf(pmTo)! - minuteOf(pmFrom)! : 0;
  const errors = [
    ...(!on ? [{ fieldId: 'ar-date', message: 'Pick a date' }] : dateErr ? [{ fieldId: 'ar-date', message: dateErr }] : []),
    ...(!nothing && needIn && !inT ? [{ fieldId: 'ar-in', message: 'Enter the check-in time' }] : []),
    ...(!nothing && needOut && !outT ? [{ fieldId: 'ar-out', message: 'Enter the check-out time' }] : []),
    ...(!nothing && needIn && needOut && inT && outT && outT <= inT ? [{ fieldId: 'ar-out', message: 'Enter a check-out time after check-in' }] : []),
    ...(type === 'ot' && !otHours ? [{ fieldId: 'ar-ot', message: 'Enter the planned hours' }] : type === 'ot' && otMin < 30 ? [{ fieldId: 'ar-ot', message: 'Enter at least 0.5 h' }] : type === 'ot' && otMin % 15 ? [{ fieldId: 'ar-ot', message: 'Use quarter hours (e.g. 1.25 or 1.5)' }] : type === 'ot' && otMin > 720 ? [{ fieldId: 'ar-ot', message: 'Enter at most 12 h' }] : []),
    ...(od && where.trim().length < 2 ? [{ fieldId: 'ar-where', message: 'Enter where you will be' }] : []),
    ...(od && (!odFrom || !odTo) ? [{ fieldId: !odFrom ? 'ar-from' : 'ar-to', message: 'Enter the From and To times' }] : []),
    ...(od && odFrom && odTo && odTo <= odFrom ? [{ fieldId: 'ar-to', message: 'Enter a To time after From' }] : []),
    ...(od && odFrom && odTo && odTo > odFrom && minuteOf(odTo)! - minuteOf(odFrom)! < 30 ? [{ fieldId: 'ar-to', message: 'On duty is at least 30 minutes' }] : []),
    ...(pm && (!pmFrom || !pmTo) ? [{ fieldId: !pmFrom ? 'ar-from' : 'ar-to', message: 'Enter the From and To times' }] : pm && pmMin <= 0 ? [{ fieldId: 'ar-to', message: 'Enter a To time after From' }] : pm && pmMin > pmRules.maxMinutes ? [{ fieldId: 'ar-to', message: `A permission can be at most ${minutesText(pmRules.maxMinutes)}. Apply for leave for a longer time.` }] : []),
    ...(late && shouldBe === 'leave' && !lateLeave ? [{ fieldId: 'ar-leave', message: 'Choose the leave type' }] : []),
    ...(!reason.trim() ? [{ fieldId: 'ar-reason', message: 'Enter a reason' }] : (late || !(type === 'ot' || pm || od)) && reason.trim().length < 10 ? [{ fieldId: 'ar-reason', message: late ? 'Give the reason in a sentence (at least 10 letters).' : 'Please say why, in at least 10 characters, so your manager can check it.' }] : []),
  ];
  const early = useTooEarly(errors);
  const regLeft = Math.max(0, d.regularise.limit - d.regularise.used);
  const wfhThen = on && on.slice(0, 7) === d.today.slice(0, 7) ? d.wfh.used : 0;
  const hr = !od && !pm && type !== 'ot' && (late || (type === 'regularise' ? regLeft === 0 : wfhThen >= d.wfh.limit));
  const send = () => {
    if (early.stop() || !on) return;
    void run('send', async () => {
      if (type === 'ot') await live.onOtPlan!({ on, minutes: otMin, takeAs, reason: reason.trim() });
      else if (pm) await live.onPermission!({ on, inMinute: minuteOf(pmFrom)!, outMinute: minuteOf(pmTo)!, reason: reason.trim() });
      else if (od) await live.onOnDuty!({ on, inMinute: minuteOf(odFrom)!, outMinute: minuteOf(odTo)!, place: where.trim(), reason: reason.trim(), ...(live.resend ? { resendOf: live.resend.id } : {}) });
      else if (type === 'wfh') await live.onWfh!({ on, reason: reason.trim() });
      else if (late) await live.onLateCorrection!({ on, kind: 'attendance', shouldBe: shouldBe === 'leave' ? `leave:${lateLeave}` : shouldBe, reason: reason.trim() });
      else await live.onFix({ on, kind: LIVE_FIX[fix], ...(needIn ? { inMinute: minuteOf(inT)! } : {}), ...(needOut ? { outMinute: minuteOf(outT)! } : {}), reason: reason.trim() });
      toast({ tone: 'success', title: late ? 'Sent to your manager, then HR and payroll' : hr ? 'Sent to your manager, then HR' : 'Sent to your manager', description: `${type === 'ot' ? 'Overtime pre-approval' : pm ? 'Hourly permission' : od ? 'On duty' : type === 'wfh' ? 'Work from home' : late ? 'Late request' : 'Regularisation'} for ${when}. You will get a notification when it is decided.` });
      live.onClose();
    });
  };
  const timeText = (t: string | null) => (t ? fmt12(t) : '…');
  const after = type === 'ot' ? (takeAs === 'pay' ? `Up to ${dur(otMin)} OT · paid at the overtime rate` : `Up to ${dur(otMin)} OT · comp-off credit`) : od ? `On duty at ${where.trim() || '…'}, ${timeText(odFrom)} – ${timeText(odTo)}` : pm ? `Permission ${timeText(pmFrom)} – ${timeText(pmTo)} · the day stays present` : type === 'wfh' ? 'Work from home · counts as present' : fix === 'full' ? 'Present all day' : `Present ${timeText(needIn ? inT : recIn)} – ${timeText(needOut ? outT : recOut)}`;
  const monthName = date ? MONTH[date.getMonth()] : '';
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && live.onClose()}
      title={live.resend ? 'Change and send again' : type === 'wfh' ? 'Request work from home' : type === 'ot' ? 'Overtime pre-approval' : od ? 'On duty request' : pm ? 'Hourly permission' : 'New attendance request'}
      subtitle={late ? 'Goes to your manager, HR and payroll' : hr ? 'Goes to your manager, then HR' : 'Goes to your manager'}
      dirty={Boolean(reason)}
      footer={
        <>
          {errors[0] && <FootReason>{errors[0].message}</FootReason>}
          <Button onClick={live.onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'send'} onClick={send}>Send request</Button>
        </>
      }
    >
      <div className="yx-tim-form">
        {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
        {live.resend?.sentBack && <InlineAlert tone="warning" title="Your manager asked for changes">{live.resend.sentBack}</InlineAlert>}
        {/* OT pre-approval is not in the app yet: only the requests it can send. */}
        {choices.length > 1 && !live.resend && (
          <FormField label="Request type" required>
            <Segment label="Request type" value={type} onChange={setType} options={TYPE_SHORT.filter((o) => offered(o.value))} />
          </FormField>
        )}
        <FormField id="ar-date" label="Date" required error={early.errorOf('ar-date')} helper={type === 'ot' ? `Today or up to ${otAhead} days ahead. Overtime already worked is claimed on My overtime.` : od || pm ? `Up to ${odWindow.aheadDays} days ahead or ${odWindow.backDays} days back.` : type === 'wfh' ? 'Pick the day you will work from home.' : late ? `${monthName} is locked, so this goes as a late request.` : 'Pick the day to fix.'}>
          <DatePicker value={date} onChange={setDate} min={type === 'wfh' || type === 'ot' ? today : undefined} max={type === 'regularise' ? today : undefined} aria-label="Date" />
        </FormField>
        {late && (
          <FormField id="ar-should" label="What the day should have been" required>
            <Segment label="What the day should have been" value={shouldBe} onChange={(v) => setShouldBe(v)} options={[{ value: 'present' as const, label: 'Present' }, { value: 'half_day' as const, label: 'Half day' }, ...(live.leaveTypes?.length ? [{ value: 'leave' as const, label: 'Leave' }] : []), { value: 'unpaid' as const, label: 'Unpaid' }]} />
          </FormField>
        )}
        {late && shouldBe === 'leave' && (
          <FormField id="ar-leave" label="Leave type" required error={early.errorOf('ar-leave')}>
            <Select value={lateLeave} onChange={setLateLeave} options={(live.leaveTypes ?? []).map((t) => ({ value: t.code, label: t.name }))} placeholder="Choose the leave type" />
          </FormField>
        )}
        {type === 'ot' && (
          <FieldRow>
            <FormField id="ar-ot" label="Planned OT (hours)" required error={early.errorOf('ar-ot')} helper="Min 0.5 h, in quarter hours"><NumberField decimals value={otHours} onChange={setOtHours} placeholder="e.g. 1.25" /></FormField>
            <FormField label="Take as">
              <Select value={takeAs} onChange={(v) => v && setTakeAs(v as 'pay' | 'comp_off')} options={[{ value: 'pay', label: 'Paid overtime' }, { value: 'comp_off', label: 'Comp-off credit' }]} />
            </FormField>
          </FieldRow>
        )}
        {od && (
          <>
            <FormField id="ar-where" label="Where" required error={early.errorOf('ar-where')}><TextField value={where} onChange={setWhere} maxLength={120} /></FormField>
            <FieldRow>
              <FormField id="ar-from" label="From" required error={early.errorOf('ar-from')}><TimeField value={odFrom} onChange={setOdFrom} placeholder="--:--" /></FormField>
              <FormField id="ar-to" label="To" required error={early.errorOf('ar-to')}><TimeField value={odTo} onChange={setOdTo} placeholder="--:--" /></FormField>
            </FieldRow>
          </>
        )}
        {pm && (
          <FieldRow>
            <FormField id="ar-from" label="From" required error={early.errorOf('ar-from')}><TimeField value={pmFrom} onChange={setPmFrom} placeholder="--:--" /></FormField>
            <FormField id="ar-to" label="To" required error={early.errorOf('ar-to')} helper={`Up to ${minutesText(pmRules.maxMinutes)}`}><TimeField value={pmTo} onChange={setPmTo} placeholder="--:--" /></FormField>
          </FieldRow>
        )}
        {type === 'regularise' && !nothing && (
          <>
            <FormField label="What needs fixing" required helper={recIn ? `Recorded check-in on this day: ${fmt12(recIn)}.` : undefined}>
              <RadioGroup aria-label="What needs fixing" value={fix} onChange={setFix} options={options} />
            </FormField>
            {(needIn || needOut) && (
              <FieldRow>
                {needIn && (
                  <FormField id="ar-in" label="Check-in" required error={early.errorOf('ar-in')}>
                    <TimeField value={inT} onChange={setIn} placeholder="--:--" />
                  </FormField>
                )}
                {needOut && (
                  <FormField id="ar-out" label="Check-out" required error={early.errorOf('ar-out')}>
                    <TimeField value={outT} onChange={setOut} placeholder="--:--" />
                  </FormField>
                )}
              </FieldRow>
            )}
          </>
        )}
        <FormField id="ar-reason" label="Reason" required error={early.errorOf('ar-reason')}>
          <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
        <section className="yx-tim-effect" aria-live="polite" aria-label="Effect before you send">
          <strong>Effect on {date ? dm(date) : 'the day'}</strong>
          <div className="yx-tim-effect__line"><span className="yx-tim-muted">Now</span><Badge tone={late ? 'danger' : 'neutral'}>{type === 'ot' ? 'No OT approved' : type === 'wfh' || od || pm ? 'Expected in office' : day ? STATUS_NOW[day.status] : 'Nothing recorded'}</Badge></div>
          <div className="yx-tim-effect__line"><span className="yx-tim-muted">After</span>{nothing ? <Badge tone="neutral">Pick a day that needs fixing</Badge> : od && (!where.trim() || !odFrom || !odTo) ? <Badge tone="neutral">Add the place and times to see the result</Badge> : pm && (!pmFrom || !pmTo) ? <Badge tone="neutral">Add the times to see the result</Badge> : type === 'ot' && !otHours ? <Badge tone="neutral">Add the planned hours to see the result</Badge> : <Badge tone="success">{after}</Badge>}</div>
          {pm && on && pmUsed < pmRules.limit && <p className="yx-tim-muted">This will be permission {pmUsed + 1} of {pmRules.limit} in {monthName}. It does not use leave.</p>}
          {od && <p className="yx-tim-muted">Once approved, the time counts as worked: a full day is present, part of one adds to your office hours.</p>}
          {type === 'ot' && <p className="yx-tim-muted">After the work, claim it on My overtime; the claim shows it was pre-approved. Factory overtime is always paid.</p>}
          {type === 'wfh' && on && (
            <p className="yx-tim-muted">
              {hr ? `This would be work-from-home day ${wfhThen + 1} in ${monthName}, over the ${d.wfh.limit} your manager approves alone, so HR approves too.` : `This will be work-from-home day ${wfhThen + 1} of ${d.wfh.limit} in ${monthName}.`}
            </p>
          )}
          {type === 'wfh' && <p className="yx-tim-muted">On the day you can check in from anywhere: your location is recorded, not checked.</p>}
          <p className="yx-tim-muted">Approval: {late ? 'Your manager → HR → Payroll' : hr ? 'Your manager → HR' : 'Your manager'}</p>
          {late && <p className="yx-tim-muted">Late requests also go to HR and payroll. They don't count towards your monthly limit. The fix is paid in the next payroll.</p>}
          {type === 'regularise' && !late && <p className="yx-tim-muted">{regLeft === 0 ? `Limit reached (${d.regularise.used} of ${d.regularise.limit}): HR approves too.` : `${regLeft} of ${d.regularise.limit} regularisations left this month.`}</p>}
        </section>
      </div>
    </Drawer>
  );
}

/* =====================================================================
   TIM-08 · Shift change / swap request + colleague consent card
   ===================================================================== */

type ShiftCode = 'M' | 'E' | 'N' | 'G' | 'OFF';
/** Hosur plant shifts (TIM-05 PLANT_SHIFTS), in hours from midnight; Night ends next morning. */
const SHIFTS: Record<Exclude<ShiftCode, 'OFF'>, { name: string; start: number; end: number }> = {
  M: { name: 'Morning', start: 6, end: 14 },
  E: { name: 'Evening', start: 14, end: 22 },
  N: { name: 'Night', start: 22, end: 30 },
  G: { name: 'General', start: 9.5, end: 18.5 },
};
const SHIFT_H = 8;
const REST_MIN_H = 11;
/** Women need written consent to work in this window (Tamil Nadu); men need none. */
const NIGHT_FROM = 19;
const NIGHT_TO = 6;
const WEEK_START = new Date(2026, 9, 1); // Thu 1 Oct; the week list runs Thu 1 – Tue 6 Oct
const dayDate = (i: number) => addDays(WEEK_START, i);
const dayName = (i: number) => dm(dayDate(i));
const hourText = (h: number) => {
  const x = ((h % 24) + 24) % 24;
  return fmt12(`${String(Math.floor(x)).padStart(2, '0')}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}`).replace(':00', '');
};
const shiftLabel = (c: ShiftCode) => (c === 'OFF' ? 'Weekly off' : `${SHIFTS[c].name} ${hourText(SHIFTS[c].start)} – ${hourText(SHIFTS[c].end)}`);
const isNight = (c: ShiftCode) => c !== 'OFF' && (SHIFTS[c].end > NIGHT_FROM || SHIFTS[c].start < NIGHT_TO);

/**
 * Hours are counted from 00:00 on Thu 1 Oct. Weeks follow the TIM-05 roster (4 on / 2 off): Mon 5 and Tue 6 match the
 * published week of 5 Oct, and `nextStart` is each person's first shift after Tue 6.
 */
interface SwapPerson { value: string; name: string; email: string; nightConsent: boolean; week: ShiftCode[]; prevEnd: number; nextStart: number; /** Days on approved leave: rostered, but not worked and not swappable. */ leave?: number[] }
const REQUESTER: SwapPerson = {
  value: 'rekha', name: 'Rekha Balan', email: 'rekha.b@kaverifoods.in', nightConsent: false,
  week: ['M', 'M', 'M', 'M', 'OFF', 'OFF'], prevEnd: -58, nextStart: 150, // Mon 28 Sep Morning ended 2 pm; Wed 7 Oct Morning
};
/** Colleagues at Hosur plant who are off on the day you give and work a day you are off. */
const SWAP_WITH: SwapPerson[] = [
  // Men need no night-work consent (TIM-05). Off Fri 2 and Sat 3, as in TIM-05 LAST_WEEK; Wed 30 Morning ended 2 pm.
  { value: 'jaya', name: 'Jaya Prakash', email: 'jaya.p@kaverifoods.in', nightConsent: true, week: ['M', 'OFF', 'OFF', 'M', 'M', 'M'], prevEnd: -10, nextStart: 150 },
  // Consent valid until 28 Feb 2027 (TIM-35); Fri 2 Evening ends 10 pm.
  { value: 'selvi', name: 'Selvi Arumugam', email: 'selvi.a@kaverifoods.in', nightConsent: true, week: ['E', 'E', 'OFF', 'OFF', 'M', 'E'], prevEnd: -2, nextStart: 174 }, // Thu 8 Morning (TIM-05)
  // Morning 6 am – 2 pm through Fri 2 (TEAM, kiosk); joins the TIM-05 night crew on Mon 5.
  // Thu 1 Oct is her approved casual leave day (time-data BALANCES); the 6–7 Oct request is still pending.
  { value: 'kavitha', name: 'Kavitha Sundaram', email: 'kavitha.s@kaverifoods.in', nightConsent: true, week: ['M', 'M', 'OFF', 'OFF', 'N', 'N'], prevEnd: -10, nextStart: 166, leave: [0] },
];
const firstName = (name: string) => name.split(' ')[0];
const APPROVER = TEAM.find((p) => p.name === REQUESTER.name)?.reportsTo ?? 'your manager';
/** The approver's days off this week (TIM-05 STANDBY_THIS_WEEK: Senthil Murugan is off Fri 2 and Sat 3 Oct). */
const APPROVER_OFF = [1, 2];
const isHoliday = (i: number) => HOLIDAYS.some((h) => h.date.toDateString() === dayDate(i).toDateString());
/** The approver's last working day before day `first`: a deadline never lands on their day off or a holiday. */
const approverDay = (first: number) => { let i = first - 1; while (APPROVER_OFF.includes(i) || isHoliday(i)) i -= 1; return i; };
/** Rest before and after the shift on `day`, from the person's whole week (both gaps count). */
function restAround(p: SwapPerson, week: ShiftCode[], day: number) {
  const slots = [{ day: -1, start: -Infinity, end: p.prevEnd }];
  week.forEach((c, i) => { if (c !== 'OFF' && !p.leave?.includes(i)) slots.push({ day: i, start: 24 * i + SHIFTS[c].start, end: 24 * i + SHIFTS[c].end }); });
  slots.push({ day: 99, start: p.nextStart, end: Infinity });
  const k = slots.findIndex((x) => x.day === day);
  return { before: slots[k].start - slots[k - 1].end, after: slots[k + 1].start - slots[k].end };
}

type SwapIssue = { title: string; text: string; short: string };
/**
 * One source for rest and consent: the request, the blocks and the consent card all read this. You give `give`; the colleague gives you `take`.
 * `base` is your week with the swaps you already sent applied, so a day promised in a pending swap is never offered twice.
 */
function swapPlan(c: SwapPerson, give: number, base: ShiftCode[] = REQUESTER.week) {
  const issues: SwapIssue[] = [];
  const name = firstName(c.name);
  const free = (i: number) => c.week[i] === 'OFF' && !c.leave?.includes(i);
  const take = free(give) ? c.week.findIndex((x, i) => x !== 'OFF' && !c.leave?.includes(i) && base[i] === 'OFF') : -1;
  if (!free(give)) return { take, issues: [{ title: `${name} works ${dayName(give)} too`, short: `Works ${dayName(give)}`, text: 'Pick a colleague who is off that day.' }], mine: base, theirs: c.week, theirRest: 0 };
  if (take < 0) return { take, issues: [{ title: `${name} has no shift to give you`, short: 'No shift on your days off', text: 'Pick another colleague.' }], mine: base, theirs: c.week, theirRest: 0 };
  const mine = base.map((x, i) => (i === give ? 'OFF' : i === take ? c.week[take] : x));
  const theirs = c.week.map((x, i) => (i === give ? base[give] : i === take ? 'OFF' : x));
  const they = restAround(c, theirs, give);
  const me = restAround(REQUESTER, mine, take);
  const rule = `(the rule is at least ${REST_MIN_H} h)`;
  const restTitle = 'This swap breaks the rest rule';
  if (they.before < REST_MIN_H) issues.push({ title: restTitle, short: 'Breaks rest rule', text: `${name} would get ${they.before} h rest before your ${dayName(give)} shift ${rule}.` });
  if (they.after < REST_MIN_H) issues.push({ title: restTitle, short: 'Breaks rest rule', text: `${name} would get ${they.after} h rest after your ${dayName(give)} shift ${rule}.` });
  if (me.before < REST_MIN_H) issues.push({ title: restTitle, short: 'Breaks rest rule', text: `You would get ${me.before} h rest before the ${dayName(take)} shift ${rule}.` });
  if (me.after < REST_MIN_H) issues.push({ title: restTitle, short: 'Breaks rest rule', text: `You would get ${me.after} h rest after the ${dayName(take)} shift ${rule}.` });
  if (!REQUESTER.nightConsent && isNight(c.week[take]))
    issues.push({ title: "Can't place you on this shift", short: 'No night-work consent', text: "Women need written consent to work between 7 pm and 6 am. You have none on file, so this can't be sent." });
  if (!c.nightConsent && isNight(base[give]))
    issues.push({ title: `Can't place ${name} on this shift`, short: 'No night-work consent', text: `${name} has no night-work consent on file for 7 pm – 6 am.` });
  return { take, issues, mine, theirs, theirRest: they.before };
}
const hours = (week: ShiftCode[]) => week.filter((x) => x !== 'OFF').length * SHIFT_H;

// TIM-08: the story shows the Hosur plant sample; the app's Me › My shifts passes `live` (my published shifts and swaps).
export function ShiftSwapSheet({ view = 'request', surface = 'desk', blocked, live }: { view?: 'request' | 'consent' | 'accepted'; surface?: 'desk' | 'phone'; blocked?: 'rest' | 'night'; live?: LiveMyShifts }) {
  return live ? <LiveMyShiftsPage live={live} /> : <SampleShiftSwap view={view} surface={surface} blocked={blocked} />;
}

function SampleShiftSwap({ view, surface, blocked }: { view: 'request' | 'consent' | 'accepted'; surface: 'desk' | 'phone'; blocked?: 'rest' | 'night' }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(true);
  const [kind, setKind] = useState('swap');
  const [give, setGive] = useState(2); // Sat 3 Oct
  const [withId, setWithId] = useState(blocked === 'rest' ? 'selvi' : blocked === 'night' ? 'kavitha' : 'jaya');
  const [reason, setReason] = useState('Family function on Saturday morning.');
  /** Sent requests, one per day you give; asking about another day keeps the earlier ones. A shift change has no colleague (take -1). */
  const [sent, setSent] = useState<{ give: number; take: number; name: string; shift?: ShiftCode }[]>([]);
  const [agreed, setAgreed] = useState(view === 'accepted');
  // Your week with the pending swaps applied: given days are off, taken days are worked.
  const myWeek = REQUESTER.week.map((x, i): ShiftCode => {
    const s = sent.find((y) => y.take === i);
    return sent.some((y) => y.give === i && y.take >= 0) ? 'OFF' : s ? SWAP_WITH.find((p) => p.name === s.name)?.week[i] ?? x : x;
  });
  // Only colleagues who are off (and not on leave) on the day you give can take it.
  const offThatDay = SWAP_WITH.filter((x) => x.week[give] === 'OFF' && !x.leave?.includes(give));
  const c = offThatDay.find((x) => x.value === withId) ?? offThatDay[0];
  const plan = c ? swapPlan(c, give, myWeek) : null;
  const sentGive = sent.some((x) => x.give === give);
  // When every day you could take is already promised in a pending swap, say which one.
  const promised = plan && plan.take < 0 ? sent.find((x) => x.take >= 0 && c?.week[x.take] !== 'OFF') : undefined;
  // Shift change: any plant shift except the current one; Night only with consent on file.
  const shiftChoices = (['M', 'E', 'G', 'N'] as const).filter((x) => x !== REQUESTER.week[give] && (x !== 'N' || REQUESTER.nightConsent));
  const [newShiftRaw, setNewShift] = useState<ShiftCode>('G');
  const newShift = shiftChoices.some((x) => x === newShiftRaw) ? newShiftRaw : shiftChoices[0];
  const sendBlock =
    sentGive ? `A request for ${dayName(give)} is already sent`
      : kind === 'swap' && !plan ? 'No colleague is off that day'
        : kind === 'swap' && promised ? `${dayName(promised.take)} is already in your swap with ${firstName(promised.name)}`
          : kind === 'swap' && plan?.issues.length ? 'Pick another colleague'
            : !reason.trim() ? 'Enter a reason' : null;
  const consenter = SWAP_WITH[0]; // the consent card is Jaya's: Rekha asked her for Sat 3 Oct
  const consentGive = 2;
  const consentPlan = swapPlan(consenter, consentGive);
  // Approval is due on the approver's last working day before the first changed shift; the colleague replies a day earlier.
  const firstDay = (g: number, t: number) => (t >= 0 ? Math.min(g, t) : g);
  const approveBy = dayDate(approverDay(firstDay(give, kind === 'swap' ? plan?.take ?? -1 : -1)));
  const replyBy = dayDate(approverDay(firstDay(consentGive, consentPlan.take)) - 1);
  const me = view === 'request' ? REQUESTER : consenter;
  const holiday = (i: number) => HOLIDAYS.find((h) => h.date.toDateString() === dayDate(i).toDateString());
  const pendingDay = (i: number) =>
    view === 'request' ? sent.some((x) => x.give === i || x.take === i) : agreed && (i === consentGive || i === consentPlan.take);
  const weekList = (
    <ul className="yx-tim-list">
      {me.week.map((w, i) => {
        const h = holiday(i);
        return (
          <li key={i}>
            <span className="yx-tim-row"><DayDate date={dayDate(i)} /> · {shiftLabel(w)}{h && <Badge tone="neutral">Holiday · {h.name}</Badge>}</span>
            {pendingDay(i)
              ? <Badge tone="neutral">{sent.some((x) => x.give === i && x.take < 0) ? 'Change pending' : 'Swap pending'}</Badge>
              : view === 'request' && w !== 'OFF' && <Button size="sm" onClick={() => { setGive(i); setKind('swap'); setOpen(true); }}>Ask to swap</Button>}
          </li>
        );
      })}
    </ul>
  );
  const sentAlert = sent.map((x) => (
    <InlineAlert
      key={x.give}
      tone="info"
      title={`Sent to ${firstName(x.take >= 0 ? x.name : APPROVER)} · ${dayName(x.give)}`}
      actions={<Button size="sm" onClick={() => { setSent(sent.filter((y) => y.give !== x.give)); toast({ tone: 'success', title: 'Request withdrawn' }); }}>Withdraw</Button>}
    >
      {x.take >= 0
        ? <>Next: {firstName(x.name)} agrees, then {APPROVER} decides by {dayName(approverDay(firstDay(x.give, x.take)))}.</>
        : <>Change to {shiftLabel(x.shift ?? 'G')}. {APPROVER} decides by {dayName(approverDay(x.give))}.</>}
    </InlineAlert>
  ));
  const body =
    view === 'request' ? (
      <div className="yx-tim-form">
        <FormField label="Request" required>
          <Segment label="Request" value={kind} onChange={setKind} options={[{ value: 'swap', label: 'Swap with a colleague' }, { value: 'change', label: 'Change my shift' }]} />
        </FormField>
        <FormField label="My shift" required>
          <Select
            value={String(give)}
            onChange={(v) => v && setGive(Number(v))}
            options={REQUESTER.week.flatMap((x, i) => (x === 'OFF' ? [] : [{ value: String(i), label: `${dayName(i)} · ${shiftLabel(x)}` }]))}
          />
        </FormField>
        {kind === 'swap' && !c ? (
          <InlineAlert
            tone="info"
            title={`No one at Hosur plant is off on ${dayName(give)}`}
            actions={<Button size="sm" onClick={() => setKind('change')}>Change my shift instead</Button>}
          >
            A swap needs a colleague who is off that day. You can ask {APPROVER} to change your shift.
          </InlineAlert>
        ) : kind === 'swap' && c ? (
          <FormField label="Swap with" required helper={`Colleagues off on ${dayName(give)} who work one of your days off. A swap that breaks the rest or night-consent rules can't be sent.`}>
            <Select
              value={c.value}
              onChange={(v) => v && setWithId(v)}
              options={offThatDay.map((x) => {
                const p = swapPlan(x, give, myWeek);
                const gives = p.take >= 0 ? `${dayName(p.take)} ${SHIFTS[x.week[p.take] as Exclude<ShiftCode, 'OFF'>].name}` : 'no shift to give';
                return { value: x.value, label: `${x.name} · ${gives}`, description: p.issues.length ? `Can't swap: ${[...new Set(p.issues.map((y) => y.short))].join(', ')}` : 'Can swap' };
              })}
            />
          </FormField>
        ) : (
          <FormField label="New shift" required helper={REQUESTER.nightConsent ? undefined : 'Night needs written night-work consent; you have none on file.'}>
            <Select value={newShift} onChange={(v) => v && setNewShift(v as ShiftCode)} options={shiftChoices.map((x) => ({ value: x, label: shiftLabel(x) }))} />
          </FormField>
        )}
        <FormField label="Reason" required><TextArea rows={2} value={reason} onChange={setReason} /></FormField>
        {kind === 'swap' && plan?.issues.map((i) => <InlineAlert key={i.text} tone="danger" title={i.title}>{i.text}</InlineAlert>)}
        <section className="yx-tim-effect">
          <strong>Effect</strong>
          {kind === 'swap' && c && plan && plan.take >= 0 ? (
            <>
              <div className="yx-tim-effect__line">You: work {dayName(plan.take)} {shiftLabel(c.week[plan.take])} instead of {dayName(give)} {shiftLabel(REQUESTER.week[give])}</div>
              <div className="yx-tim-effect__line">{firstName(c.name)}: works {dayName(give)} {shiftLabel(REQUESTER.week[give])} instead of {dayName(plan.take)}</div>
              <p className="yx-tim-muted">Approval: {firstName(c.name)}'s consent → {APPROVER} (your manager).</p>
            </>
          ) : kind === 'swap' ? (
            <p className="yx-tim-muted">{c ? 'Pick a colleague to see the effect.' : 'No swap is possible for this day.'}</p>
          ) : (
            <>
              <div className="yx-tim-effect__line">You: {dayName(give)} {shiftLabel(REQUESTER.week[give])} → {shiftLabel(newShift)}</div>
              <p className="yx-tim-muted">Approval: {APPROVER} (your manager).</p>
            </>
          )}
          {kind === 'swap' && (!plan || plan.issues.length > 0) ? (
            <p className="yx-tim-muted">If sent, needs approval by {dm(approveBy)}.</p>
          ) : (
            <div className="yx-tim-row">
              <span className="yx-tim-muted">Needs approval by {dm(approveBy)}</span>
              <DueBadge date={approveBy} />
            </div>
          )}
        </section>
      </div>
    ) : (
      <div className="yx-tim-stack">
        <PersonLabel name={REQUESTER.name} secondary="Line Operator · Hosur plant" size={40} />
        <p>{firstName(REQUESTER.name)} asks to swap shifts with you.</p>
        <Kpis items={[
          { label: 'You give', value: `${dayName(consentPlan.take)} · ${shiftLabel(consenter.week[consentPlan.take])}` },
          { label: 'You get', value: `${dayName(consentGive)} · ${shiftLabel(REQUESTER.week[consentGive])}` },
        ]} />
        <p className="yx-tim-muted">
          Your rest before the new shift: {consentPlan.theirRest} h (rule {REST_MIN_H} h).
          {hours(consentPlan.theirs) === hours(consenter.week) ? ` Your hours for ${range(dayDate(0), dayDate(5))} stay ${hours(consenter.week)} h.` : ''}
        </p>
        <div className="yx-tim-row">
          <span className="yx-tim-muted">Reply by {dm(replyBy)}</span>
          <DueBadge date={replyBy} />
        </div>
        {agreed && <InlineAlert tone="info" title="You agreed">{APPROVER} decides next. Your roster changes only after approval.</InlineAlert>}
        {!agreed && <p className="yx-tim-note">Saying no has no effect on you. {firstName(REQUESTER.name)} only sees "declined".</p>}
      </div>
    );
  const phone = surface === 'phone';
  const sendButton = (
    <Button
      variant="primary"
      onClick={() => {
        // Never greyed out: pressed too early it says what to fix.
        if (sendBlock) return void toast({ tone: 'warning', title: sendBlock });
        if (kind === 'swap' && c && plan) setSent([...sent, { give, take: plan.take, name: c.name }]);
        else if (kind === 'change') setSent([...sent, { give, take: -1, name: APPROVER, shift: newShift }]);
        setOpen(false);
        toast({ tone: 'success', title: `Request sent to ${firstName(kind === 'swap' && c ? c.name : APPROVER)}` });
      }}
    >
      Send request
    </Button>
  );
  const footer =
    view === 'request' ? (
      phone
        // The sheet footer stacks bottom-up: the reason reads right above Send.
        ? <><Button onClick={() => setOpen(false)}>Cancel</Button>{sendButton}{sendBlock && <span className="yx-tim-muted">{sendBlock}</span>}</>
        : <>{sendBlock && <FootReason>{sendBlock}</FootReason>}<Button onClick={() => setOpen(false)}>Cancel</Button>{sendButton}</>
    ) : !agreed ? (
      <><Button icon={X} onClick={() => setOpen(false)}>Decline</Button><Button variant="approve" icon={Check} onClick={() => { setAgreed(true); toast({ tone: 'success', title: 'You agreed to the swap' }); }}>Agree to swap</Button></>
    ) : (
      <Button onClick={() => setOpen(false)}>Close</Button>
    );
  const title = view === 'request' ? 'Shift change or swap' : 'Swap request from a colleague';
  if (phone)
    return (
      <PhoneFrame tab="time" title="My shifts">
        <div className="yx-tim-stack">
          {sentAlert}
          {weekList}
        </div>
        <BottomSheet open={open} onOpenChange={setOpen} title={title} footer={footer}>{body}</BottomSheet>
      </PhoneFrame>
    );
  const user: TimeUser = { name: me.name, email: me.email, role: 'Line Operator' };
  return (
    <TimePage active="My shifts" user={user}>
      <PageHeader title="My shifts" description="Hosur plant · 4-on / 2-off pattern" />
      {sentAlert}
      <Card title="This week">{weekList}</Card>
      <Drawer open={open} onOpenChange={setOpen} title={title} subtitle={view === 'request' ? `${REQUESTER.name} · Line Operator · Hosur plant` : `From ${REQUESTER.name}`} footer={footer}>{body}</Drawer>
    </TimePage>
  );
}

/* ---------------- TIM-08 live: Me › My shifts (my published shifts and swaps with a teammate) ---------------- */

/** The person's own published shifts and swaps; a swap goes to the colleague first, then to the manager (P03). */
export interface LiveMyShifts {
  state: LoadState;
  onRetry?: () => void;
  data: MyShifts | null;
  today: string;
  onSwap: (input: { on: string; colleagueEmployeeId: string; reason: string }) => Promise<unknown>;
  onWithdrawSwap: (id: string) => Promise<unknown>;
}

const SWAP_STATUS: Record<MyShifts['swaps'][number]['status'], { label: string; tone: BadgeTone }> = { pending: { label: 'Waiting', tone: 'info' }, approved: { label: 'Approved', tone: 'success' }, rejected: { label: 'Not approved', tone: 'danger' }, withdrawn: { label: 'Withdrawn', tone: 'neutral' } };
const swapDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const swapDay = (iso: string) => dm(swapDate(iso));
const minText = (m: number) => fmt12(`${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`).replace(':00', '');
const swapShift = (s: MyShifts['days'][number]['shift']) => (s ? `${s.name} ${minText(s.start)} – ${minText(s.end)}` : 'Weekly off');

function LiveMyShiftsPage({ live: p }: { live: LiveMyShifts }) {
  const d = p.data;
  const { busy, error, run } = useRun();
  const send = useRun();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const days = (d?.days ?? []).filter((x) => x.employed);
  const swappable = days.filter((x) => x.on >= p.today && x.shift);
  const pendingOn = (iso: string) => d?.swaps.find((s) => s.on === iso && s.status === 'pending');
  const errors = [...(!on ? [{ fieldId: 'sw-day', message: 'Choose the day.' }] : []), ...(!who ? [{ fieldId: 'sw-who', message: 'Choose the colleague.' }] : []), ...(!reason.trim() ? [{ fieldId: 'sw-why', message: 'Say why you want to swap.' }] : [])];
  const shown = useSaveErrors(errors);
  const ask = (iso: string) => {
    setOn(iso);
    setWho(null);
    setReason('');
    shown.reset();
    setOpen(true);
  };
  const day = days.find((x) => x.on === on);
  const mate = d?.colleagues.find((c) => c.id === who);
  const sendNow = () => {
    if (errors.length) {
      shown.reveal();
      return document.getElementById(errors[0]!.fieldId)?.focus();
    }
    void send.run('swap', async () => {
      await p.onSwap({ on: on!, colleagueEmployeeId: who!, reason: reason.trim() });
      setOpen(false);
    });
  };
  const pending = (d?.swaps ?? []).filter((s) => s.status === 'pending');
  const decided = (d?.swaps ?? []).filter((s) => s.status !== 'pending');
  return (
    <TimePage active="My shifts">
      <PageHeader title="My shifts" description="Your shifts for the next two weeks, as published. Swap one with a teammate who has the same manager." />
      <LiveGate state={p.state} onRetry={p.onRetry} what="your shifts">
        {d && (
          <div className="yx-tim-stack">
            {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
            {pending.map((s) => (
              <InlineAlert
                key={s.id}
                tone="info"
                title={s.mine ? `Sent to ${s.with} · ${swapDay(s.on)}` : `${s.with} asks to swap · ${swapDay(s.on)}`}
                actions={s.mine ? <Button size="sm" loading={busy === s.id} onClick={() => void run(s.id, () => p.onWithdrawSwap(s.id))}>Withdraw</Button> : undefined}
              >
                {s.mine ? <>Next: {s.with} agrees, then your manager decides.</> : <>Agree or decline it in Approvals. Saying no has no effect on you.</>}
              </InlineAlert>
            ))}
            <Card title="Next two weeks">
              <ul className="yx-tim-list" aria-label="My shifts">
                {days.map((x) => (
                  <li key={x.on}>
                    <span className="yx-tim-row"><DayDate date={swapDate(x.on)} /> · {swapShift(x.shift)}{x.on === p.today && <Badge tone="info">Today</Badge>}</span>
                    {pendingOn(x.on) ? <Badge tone="neutral">Swap pending</Badge> : x.on >= p.today && x.shift && d.colleagues.length > 0 && <Button size="sm" onClick={() => ask(x.on)}>Ask to swap</Button>}
                  </li>
                ))}
              </ul>
              {!days.length && <p className="yx-tim-muted">No shifts published for you yet.</p>}
              {days.length > 0 && !d.colleagues.length && <p className="yx-tim-note">No teammate to swap with: a swap is with someone who has the same manager.</p>}
            </Card>
            {decided.length > 0 && (
              <Card title="Earlier swaps">
                <ul className="yx-tim-list" aria-label="Swaps">
                  {decided.map((s) => (
                    <li key={s.id}>
                      <span className="yx-tim-row"><DayDate date={swapDate(s.on)} /> with {s.with}{s.mine ? '' : ' (they asked you)'}</span>
                      <Badge tone={SWAP_STATUS[s.status].tone}>{SWAP_STATUS[s.status].label}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Drawer
              open={open}
              onOpenChange={setOpen}
              title="Shift change or swap"
              subtitle="A swap with a teammate who has the same manager"
              footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={send.busy === 'swap'} onClick={sendNow}>Send request</Button></>}
            >
              <div className="yx-tim-form">
                {send.error && <InlineAlert tone="danger" title="Not sent">{send.error}</InlineAlert>}
                <FormField id="sw-day" label="My shift" required error={shown.errorOf('sw-day')}>
                  <Select value={on} onChange={setOn} options={swappable.map((x) => ({ value: x.on, label: `${swapDay(x.on)} · ${swapShift(x.shift)}` }))} />
                </FormField>
                <FormField id="sw-who" label="Swap with" required helper="Someone with the same manager. A swap that breaks the rest or night-work rules can't be sent." error={shown.errorOf('sw-who')}>
                  <Select value={who} onChange={setWho} options={d.colleagues.map((c) => ({ value: c.id, label: c.name }))} />
                </FormField>
                <FormField id="sw-why" label="Reason" required error={shown.errorOf('sw-why')}>
                  <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
                </FormField>
                <section className="yx-tim-effect">
                  <strong>Effect</strong>
                  {day && mate ? (
                    <>
                      <div className="yx-tim-effect__line">You: work {mate.name}'s shift on {swapDay(day.on)} instead of {swapShift(day.shift)}</div>
                      <div className="yx-tim-effect__line">{mate.name}: works your {swapShift(day.shift)}</div>
                    </>
                  ) : (
                    <p className="yx-tim-muted">Pick the day and a colleague to see the effect.</p>
                  )}
                  <p className="yx-tim-muted">Approval: {mate?.name ?? 'your colleague'}'s consent → your manager.</p>
                </section>
              </div>
            </Drawer>
          </div>
        )}
      </LiveGate>
    </TimePage>
  );
}

/* =====================================================================
   TIM-09 · OT review (after the fact, statutory-cap flags, comp-off option)
   ===================================================================== */

/** Head of Operations: the line operators and maintenance staff at Hosur plant report to him (TEAM reportsTo). */
const PLANT_HEAD: TimeUser = { name: 'Ramesh Gowda', email: 'ramesh.g@kaverifoods.in', role: 'Head of Operations' };
/** Full limit text for the override dialog. */
const capShort = (r: OtRow) => (r.quarterHours > 75 ? `Over 75 h a quarter (${r.quarterHours} h)` : r.weekHours > 12 ? `Over 12 h a week (${r.weekHours} h)` : null);
/** Short badge for the table; the hours go on the line under it. */
const capBadge = (r: OtRow) => (r.quarterHours > 75 ? 'Over quarter limit' : r.weekHours > 12 ? 'Over week limit' : null);
const capHours = (r: OtRow) => (r.quarterHours > 75 ? `${r.quarterHours} h this quarter` : r.weekHours > 12 ? `${r.weekHours} h this week` : null);
const otStatusLabel = (s: OtRow['status']) => (s === 'Comp-off' ? 'Comp-off given' : s);
const NOWRAP = { whiteSpace: 'nowrap' } as const;
const minus = (hhmm: string, min: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m - min;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const otFacts = (r: OtRow) => `${dm(r.date)} · ${fmtDuration(r.otMin)} OT · ${r.preApproved ? 'pre-approved' : 'not pre-approved'}`;
const OT_STATUS_TONE: Record<OtRow['status'], BadgeTone> = { Pending: 'warning', Approved: 'success', Rejected: 'danger', 'Comp-off': 'info' };

/* ---------- live: /time/overtime-review (TIM-09) and /time/overtime (Me › Overtime, shown with TIM-09's parts) ---------- */

/** Team / HR › Overtime: the month's claims in the viewer's scope; minutes over a limit are paid only with a reason. */
export interface LiveOtReview {
  state: LoadState;
  onRetry?: () => void;
  data: OtReview | null;
  month: string;
  onMonth: (month: string) => void;
  onOverride: (id: string, reason: string) => Promise<unknown>;
  /** TIM-09: approve, reject (with a reason) or give comp-off, as the viewer's approval task. */
  onDecide: (id: string, decision: 'approve' | 'reject' | 'comp_off', reason?: string) => Promise<unknown>;
}
/** Me › Overtime: my own claims. It has no design of its own, so it uses this screen's parts (Question: founder). */
export interface LiveMyOvertime {
  state: LoadState;
  onRetry?: () => void;
  data: MyOvertime | null;
  onClaim: (input: { on: string; reason: string }) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
}
type OtOpenDay = MyOvertime['open'][number];

const OT_CATEGORY: Record<OtCategory, string> = { normal: 'Working day', weekly_off: 'Weekly off', holiday: 'Holiday' };
const CLAIM_STATUS: Record<OtClaim['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};
type OtFigures = { payableMinutes: number; settle: 'pay' | 'comp_off'; compOffDays?: number; rate?: number; factoriesAct?: boolean };
const settledAs = (c: OtFigures) =>
  c.settle === 'comp_off' ? (c.compOffDays ? `Comp-off ${plural(c.compOffDays, 'day')}` : 'Comp-off') : c.rate ? `Paid at ${c.rate}×` : c.factoriesAct ? 'Paid at the legal overtime rate' : 'Paid in payroll';
const workedText = (c: { category: OtCategory; workedMinutes: number; scheduledMinutes: number }) =>
  c.category === 'normal' ? `Worked ${fmtDuration(c.workedMinutes)} of ${fmtDuration(c.scheduledMinutes)}` : `${OT_CATEGORY[c.category]} · worked ${fmtDuration(c.workedMinutes)}`;
const capCell = (c: { overCapMinutes: number; overridden?: boolean }) =>
  c.overCapMinutes ? (
    <span className="yx-tim-list__main" style={{ alignItems: 'flex-start' }}>
      <Badge tone={c.overridden ? 'warning' : 'danger'} style={NOWRAP}>{c.overridden ? 'Paid over the limit' : 'Over the limit'}</Badge>
      <span className="yx-tim-muted" style={NOWRAP}>{fmtDuration(c.overCapMinutes)} over</span>
    </span>
  ) : (
    <Badge tone="success" style={NOWRAP}>Within limit</Badge>
  );
const otCell = (c: OtFigures) => (
  <span className="yx-tim-list__main">
    <span>{fmtDuration(c.payableMinutes)}</span>
    <span className="yx-tim-muted" style={NOWRAP}>{settledAs(c)}</span>
  </span>
);
const claimBadge = (c: OtClaim) => <Badge tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].label}</Badge>;

function LiveOtReviewScreen({ live }: { live: LiveOtReview }) {
  const claims = live.data?.claims ?? [];
  const [over, setOver] = useState<OtClaim | null>(null);
  const [comp, setComp] = useState<OtClaim | null>(null);
  const [rej, setRej] = useState<OtClaim[] | null>(null);
  const [rejWhy, setRejWhy] = useState('');
  const [compWhy, setCompWhy] = useState('');
  const [tried, setTried] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const { toast } = useToast();
  const { busy, error, run, clearError } = useRun();
  const pending = claims.filter((c) => c.status === 'pending');
  // This viewer decides a claim when they hold its approval task (the same task as in Approvals: one engine).
  const mine = (c: OtClaim) => c.status === 'pending' && !!c.taskId;
  // Bulk decisions only within the limit; a claim over a limit is decided one by one.
  const bulkOk = new Set(claims.filter((c) => mine(c) && !c.overCapMinutes).map((c) => c.id));
  const scope = live.data?.scope === 'team' ? 'Your team' : live.data?.scope === 'company' ? 'Everyone' : 'The people in your scope';
  const decideMany = (ids: string[], decision: 'approve' | 'reject', reason?: string) =>
    run('bulk', async () => {
      let ok = 0;
      const refused: string[] = [];
      for (const id of ids) {
        try {
          await live.onDecide(id, decision, reason);
          ok++;
        } catch (e) {
          refused.push(e instanceof Error ? e.message : 'Not decided');
        }
      }
      setSel([]);
      if (ok) toast({ tone: 'success', title: `${ok} ${ok === 1 ? 'claim' : 'claims'} ${decision === 'approve' ? 'approved' : 'rejected'}` });
      if (refused.length) throw new Error(`${refused.length} not decided: ${refused[0]}`);
    });
  const cols: TableColumn<OtClaim>[] = [
    { key: 'person', header: 'Employee', type: 'person', width: 200, value: (c) => c.name ?? '', person: (c) => ({ name: c.name ?? '', secondary: isoDate(c.on) }) },
    { key: 'worked', header: 'Worked', optional: true, width: 220, value: (c) => c.workedMinutes, render: workedText },
    // TIM-09's "not pre-approved" line (TIM-07 Ot): shown when the claim was made without a pre-approval.
    { key: 'ot', header: 'OT', type: 'number', value: (c) => c.payableMinutes / 60, render: (c) => (c.preApprovedMinutes === null ? <span className="yx-tim-list__main">{otCell(c)}<span className="yx-tim-muted" style={NOWRAP}>not pre-approved</span></span> : otCell(c)) },
    { key: 'cap', header: 'Legal limit', hideable: false, width: 150, value: (c) => c.overCapMinutes, render: capCell },
  ];
  const needCompWhy = !!comp?.overCapMinutes;
  return (
    <TimePage active="Requests">
      <PageHeader
        title="Overtime review"
        description={`${scope}. Approve, reject or give comp-off here or in Approvals; HR can pay minutes over the legal limit with a recorded reason.`}
        facts={
          <span className="yx-tim-row">
            <strong>{monthText(live.month)}</strong>
            {pending.length > 0 && <span className="yx-tim-muted">{pending.length} waiting · {fmtDuration(pending.reduce((a, c) => a + c.payableMinutes, 0))} of overtime</span>}
          </span>
        }
        actions={
          <div className="yx-tim-row">
            <Button size="sm" onClick={() => live.onMonth(shiftMonth(live.month, -1))}>Previous month</Button>
            <Button size="sm" onClick={() => live.onMonth(shiftMonth(live.month, 1))}>Next month</Button>
          </div>
        }
      />
      {error && <InlineAlert tone="danger" title="Not all decided">{error}</InlineAlert>}
      {live.state === 'no-access' ? (
        <LiveGate state="no-access" what="overtime" />
      ) : (
        <DataTable
          label="Overtime to review"
          columns={cols}
          rows={claims}
          getRowId={(c) => c.id}
          state={liveTable(live.state)}
          onRetry={live.onRetry}
          empty={<EmptyState title="No overtime to review" description="Claims show here once someone claims overtime for a day in this month." />}
          selectable={bulkOk.size > 0}
          isSelectable={(c) => (!mine(c) ? false : c.overCapMinutes ? 'Over the limit: decide one by one' : true)}
          selectedIds={sel}
          onSelectedChange={(ids) => setSel(ids.filter((id) => bulkOk.has(id)))}
          bulkActions={(ids) => (
            <>
              <Button variant="approve" size="sm" loading={busy === 'bulk'} onClick={() => void decideMany(ids, 'approve')}>Approve {ids.length}</Button>
              <Button size="sm" onClick={() => { setRejWhy(''); setTried(false); setRej(claims.filter((c) => ids.includes(c.id))); }}>Reject</Button>
            </>
          )}
          // One visible decision per row (Approve, or Override for HR on over-limit approved rows); comp-off and reject sit in the "…" menu.
          rowButtons={(c) =>
            c.canOverride ? <Button size="sm" onClick={() => setOver(c)}>Override limit</Button>
              : mine(c) ? <Button variant="approve" size="sm" loading={busy === c.id} onClick={() => void run(c.id, async () => { await live.onDecide(c.id, 'approve'); toast({ tone: 'success', title: 'Overtime approved' }); })}>Approve</Button>
                : claimBadge(c)
          }
          rowActions={(c) =>
            mine(c) ? (
              <>
                {c.canCompOff && <MenuItem onSelect={() => { clearError(); setCompWhy(''); setTried(false); setComp(c); }}>Give comp-off…</MenuItem>}
                <MenuItem onSelect={() => { setRejWhy(''); setTried(false); setRej([c]); }}>Reject…</MenuItem>
              </>
            ) : null
          }
        />
      )}
      {over && <OverrideDialog claim={over} onClose={() => setOver(null)} onOverride={live.onOverride} />}
      <Dialog
        open={!!comp}
        onOpenChange={(o) => !o && setComp(null)}
        title={`Give comp-off instead · ${comp?.name ?? ''}`}
        footer={
          <>
            {needCompWhy && !compWhy.trim() && <FootReason>Enter a reason</FootReason>}
            <Button onClick={() => setComp(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy === 'comp'}
              onClick={() => {
                if (needCompWhy && !compWhy.trim()) {
                  setTried(true);
                  return document.getElementById('ot-comp-why')?.focus();
                }
                void run('comp', async () => {
                  await live.onDecide(comp!.id, 'comp_off', compWhy.trim() || undefined);
                  setComp(null);
                });
              }}
            >
              Give comp-off
            </Button>
          </>
        }
      >
        <div className="yx-tim-stack">
          {comp && <p className="yx-tim-muted">{isoDate(comp.on)} · {fmtDuration(comp.payableMinutes)} OT</p>}
          <p>The overtime becomes comp-off in the leave balance, usable later. No OT pay for this day.</p>
          {needCompWhy && <InlineAlert tone="warning" title="Part of this is over a legal limit">Giving comp-off for hours over the legal limit is recorded against your name in the audit log.</InlineAlert>}
          <FormField id="ot-comp-why" label={needCompWhy ? 'Reason' : 'Reason (optional)'} required={needCompWhy} error={tried && needCompWhy && !compWhy.trim() ? 'Enter a reason' : null}>
            <TextArea rows={2} value={compWhy} onChange={setCompWhy} maxLength={500} />
          </FormField>
        </div>
      </Dialog>
      <Dialog
        open={!!rej}
        onOpenChange={(o) => !o && setRej(null)}
        title={rej?.length === 1 ? `Reject overtime · ${rej[0].name ?? ''}` : `Reject ${rej?.length ?? 0} overtime entries`}
        footer={
          <>
            {!rejWhy.trim() && <FootReason>Enter a reason</FootReason>}
            <Button onClick={() => setRej(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={busy === 'bulk'}
              onClick={() => {
                if (!rejWhy.trim()) {
                  setTried(true);
                  return document.getElementById('ot-reject-why')?.focus();
                }
                void decideMany(rej!.map((c) => c.id), 'reject', rejWhy.trim()).then((ok) => ok && setRej(null));
              }}
            >
              Reject overtime
            </Button>
          </>
        }
      >
        <div className="yx-tim-stack">
          <p className="yx-tim-muted">{rej?.length === 1 ? `${isoDate(rej[0].on)} · ${fmtDuration(rej[0].payableMinutes)} OT` : `${rej?.length ?? 0} entries · ${fmtDuration((rej ?? []).reduce((a, c) => a + c.payableMinutes, 0))} of overtime`}</p>
          <p>These hours are not paid. The employee sees your reason.</p>
          <FormField id="ot-reject-why" label="Reason" required error={tried && !rejWhy.trim() ? 'Enter a reason' : null}>
            <TextArea rows={3} value={rejWhy} onChange={setRejWhy} placeholder="For example: work could wait until the next shift" />
          </FormField>
        </div>
      </Dialog>
    </TimePage>
  );
}

function OverrideDialog({ claim, onClose, onOverride }: { claim: OtClaim; onClose: () => void; onOverride: LiveOtReview['onOverride'] }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const early = useTooEarly(reason.trim().length < 10 ? [{ fieldId: 'ot-override-why', message: 'Give the reason in a sentence (at least 10 letters).' }] : []);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Pay over the limit · ${claim.name ?? ''}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="approve"
            loading={busy === 'ov'}
            onClick={() => {
              if (early.stop()) return;
              void run('ov', async () => {
                await onOverride(claim.id, reason.trim());
                onClose();
              });
            }}
          >
            Pay over the limit
          </Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        <p className="yx-tim-muted">{isoDate(claim.on)} · {fmtDuration(claim.payableMinutes)} OT · {fmtDuration(claim.overCapMinutes)} over the limit</p>
        {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
        <InlineAlert tone="warning" title="This goes past a legal or company limit">Paying over the limit is recorded against your name in the audit log.</InlineAlert>
        <FormField id="ot-override-why" label="Reason" required error={early.errorOf('ot-override-why')}>
          <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} placeholder="For example: emergency line breakdown, plant head approved" />
        </FormField>
      </div>
    </Dialog>
  );
}

function LiveMyOvertimeScreen({ mine }: { mine: LiveMyOvertime }) {
  const d = mine.data;
  const [claiming, setClaiming] = useState<OtOpenDay | null>(null);
  const { busy, error, run } = useRun();
  const openCols: TableColumn<OtOpenDay>[] = [
    { key: 'day', header: 'Day', width: 140, value: (x) => x.on, render: (x) => isoDate(x.on) },
    { key: 'worked', header: 'Worked', optional: true, width: 220, value: (x) => x.workedMinutes, render: workedText },
    { key: 'ot', header: 'OT', type: 'number', value: (x) => x.payableMinutes / 60, render: otCell },
    { key: 'cap', header: 'Legal limit', hideable: false, width: 150, value: (x) => x.overCapMinutes, render: capCell },
  ];
  const claimCols: TableColumn<OtClaim>[] = [
    { key: 'day', header: 'Day', width: 140, value: (c) => c.on, render: (c) => isoDate(c.on) },
    { key: 'ot', header: 'OT', type: 'number', value: (c) => c.payableMinutes / 60, render: otCell },
    { key: 'cap', header: 'Legal limit', hideable: false, width: 150, value: (c) => c.overCapMinutes, render: capCell },
  ];
  return (
    <TimePage active="My attendance">
      <PageHeader title="My overtime" description="Overtime counts past the minimum, in 15-min steps, within the legal limits. Your manager approves it." />
      <LiveGate state={mine.state} onRetry={mine.onRetry} what="your overtime">
        {d && (
          <div className="yx-tim-stack">
            {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
            <DataTable
              label="Days you can claim"
              columns={openCols}
              rows={d.open}
              getRowId={(x) => x.on}
              empty={<EmptyState compact title="No days with overtime to claim" description="Days from the last month with time past the minimum show here." />}
              rowButtons={(x) => <Button size="sm" onClick={() => setClaiming(x)}>Claim overtime</Button>}
            />
            <DataTable
              label="My claims"
              columns={claimCols}
              rows={d.claims}
              getRowId={(c) => c.id}
              empty={<EmptyState compact title="No claims yet" />}
              rowButtons={(c) =>
                c.status === 'pending' ? (
                  <span className="yx-tim-row">
                    {claimBadge(c)}
                    <Button size="sm" loading={busy === c.id} onClick={() => void run(c.id, () => mine.onWithdraw(c.id))}>Withdraw</Button>
                  </span>
                ) : (
                  claimBadge(c)
                )
              }
            />
          </div>
        )}
      </LiveGate>
      {claiming && <ClaimDialog day={claiming} onClose={() => setClaiming(null)} onClaim={mine.onClaim} />}
    </TimePage>
  );
}

function ClaimDialog({ day, onClose, onClaim }: { day: OtOpenDay; onClose: () => void; onClaim: LiveMyOvertime['onClaim'] }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const early = useTooEarly(!reason.trim() ? [{ fieldId: 'ot-claim-why', message: 'Say what the extra time was for.' }] : []);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Claim overtime · ${isoDate(day.on)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'claim'}
            onClick={() => {
              if (early.stop()) return;
              void run('claim', async () => {
                await onClaim({ on: day.on, reason: reason.trim() });
                onClose();
              });
            }}
          >
            {day.needsApproval ? 'Send for approval' : 'Claim'}
          </Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
        <ul className="yx-tim-check">
          <li><span>Worked</span><span>{fmtDuration(day.workedMinutes)}</span></li>
          <li><span>Expected</span><span>{day.category === 'normal' ? fmtDuration(day.scheduledMinutes) : `${OT_CATEGORY[day.category]}: every minute counts`}</span></li>
          <li><span>Overtime</span><span>{fmtDuration(day.payableMinutes)}</span></li>
          <li><span>Settled as</span><span>{day.settle === 'comp_off' ? 'Comp-off, added to your leave balance when approved' : day.factoriesAct ? 'Paid in payroll at the legal overtime rate (Factories Act)' : 'Paid in payroll'}</span></li>
        </ul>
        {day.overCapMinutes > 0 && <InlineAlert tone="warning" title={`${fmtDuration(day.overCapMinutes)} more is over the legal limit`}>HR decides whether that part is paid.</InlineAlert>}
        <FormField id="ot-claim-why" label="What was it for" required error={early.errorOf('ot-claim-why')}>
          <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}

export function OtReviewScreen({ persona = 'mgr', manager = ME.name, state = 'ready', action, live, mine }: {
  persona?: 'mgr' | 'hr';
  /** Manager whose reports are shown (default the signed-in manager). */
  manager?: string;
  state?: ViewState;
  action?: 'override' | 'comp';
  /** The live app's /time/overtime-review. */
  live?: LiveOtReview;
  /** The live app's /time/overtime (my own claims). */
  mine?: LiveMyOvertime;
}) {
  if (live) return <LiveOtReviewScreen live={live} />;
  if (mine) return <LiveMyOvertimeScreen mine={mine} />;
  return <SampleOtReview persona={persona} manager={manager} state={state} action={action} />;
}

function SampleOtReview({ persona, manager, state, action }: { persona: 'mgr' | 'hr'; manager: string; state: ViewState; action?: 'override' | 'comp' }) {
  const scoped = persona === 'hr' ? OT_ROWS : OT_ROWS.filter((r) => isMyReport(r.person, manager));
  const capped = (r: OtRow) => !!otCapFlag(r.weekHours, r.quarterHours);
  const [rows, setRows] = useState<OtRow[]>(scoped);
  const [sel, setSel] = useState<string[]>([]);
  const [dlg, setDlg] = useState<OtRow | null>(
    action ? scoped.find((r) => r.status === 'Pending' && (action === 'override' ? capped(r) : !capped(r))) ?? null : null,
  );
  const [mode, setMode] = useState(action ?? 'override');
  const [reason, setReason] = useState('');
  const [rej, setRej] = useState<string[] | null>(null);
  const [rejReason, setRejReason] = useState('');
  // Pressed without a reason: the field says so (never a disabled button).
  const [tried, setTried] = useState(false);
  const user = persona === 'hr' ? HR_ADMIN : manager === PLANT_HEAD.name ? PLANT_HEAD : ME;
  const setStatus = (ids: string[], status: OtRow['status']) => { setRows(rows.map((r) => (ids.includes(r.id) ? { ...r, status } : r))); setSel([]); };
  const open = (r: OtRow, m: 'override' | 'comp') => { setMode(m); setReason(''); setTried(false); setDlg(r); };
  const askReject = (ids: string[]) => { setRejReason(''); setTried(false); setRej(ids); };
  // Bulk decisions only for pending rows within the legal limit; over-limit rows need a decision one by one.
  const bulkOk = new Set(rows.filter((r) => r.status === 'Pending' && !capped(r)).map((r) => r.id));
  const ready = state === 'ready';
  const overPending = ready ? rows.filter((r) => r.status === 'Pending' && capped(r)).length : 0;
  // Managers count only the rows they can decide; over-limit rows are with HR.
  const pending = ready ? rows.filter((r) => r.status === 'Pending' && (persona === 'hr' || !capped(r))) : [];
  const payrollOpen = ready && rows.some((r) => r.status === 'Pending' && r.date.getMonth() === TODAY.getMonth());
  const payrollClose = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0);
  const closeIn = daysUntil(payrollClose, TODAY);
  const closeText = closeIn <= 0 ? 'today' : closeIn === 1 ? 'tomorrow' : `in ${closeIn} days`;
  const overText = persona === 'hr' ? `${overPending} over the limit: decide one by one` : `${overPending} over the limit ${overPending === 1 ? 'is' : 'are'} with HR`;
  const rejRows = rows.filter((r) => rej?.includes(r.id));
  // Hours over the legal limit need a recorded reason however they are paid (override or comp-off).
  const needReason = mode === 'override' || (!!dlg && capped(dlg));
  // Nav count follows this page: pending OT the viewer can decide, taken from the live rows (none in the empty story).
  const otCounted = (list: OtRow[]) => list.filter((r) => r.status === 'Pending' && (persona === 'hr' || !capped(r))).length;
  const navCounts = { ...timeCounts(user), Requests: timeCounts(user).Requests - otCounted(scoped) + (state === 'empty' ? 0 : otCounted(rows)) };
  const cols: TableColumn<OtRow>[] = [
    {
      key: 'person', header: 'Employee', type: 'person', width: 200, value: (r) => r.person,
      person: (r) => {
        const ago = -daysUntil(r.date, TODAY);
        return {
          name: r.person,
          secondary: (
            <span className="yx-tim-row">
              {dm(r.date)}
              {r.status === 'Pending' && ago > 0 && <Badge tone={ago > 7 ? 'warning' : 'neutral'}>{ago === 1 ? 'yesterday' : `${ago} days ago`}</Badge>}
            </span>
          ),
        };
      },
    },
    {
      key: 'worked', header: 'Worked', optional: true, width: 220, value: (r) => r.shift,
      // The check-out time sits in the OT cell, so it stays visible when this column is hidden to fit.
      render: (r) =>
        r.category === 'Normal' ? (
          <span>{r.shift.replace(/:00/g, '')}</span>
        ) : (
          <span className="yx-tim-list__main">
            <span>{r.category === 'Holiday' ? HOLIDAYS.find((h) => h.date.toDateString() === r.date.toDateString())?.name ?? 'Holiday' : 'Weekly off'}</span>
            <span className="yx-tim-muted">Worked {fmt12(minus(r.out, r.otMin))} – {fmt12(r.out)}</span>
          </span>
        ),
    },
    {
      key: 'ot', header: 'OT', type: 'number', value: (r) => r.otMin / 60,
      // One short note per line, so nothing runs into the next column.
      render: (r) => (
        <span className="yx-tim-list__main">
          <span>{fmtDuration(r.otMin)}</span>
          <span className="yx-tim-muted" style={NOWRAP}>{r.category === 'Normal' ? `Out ${fmt12(r.out)}` : r.category.toLowerCase()}</span>
          {!r.preApproved && <span className="yx-tim-muted" style={NOWRAP}>not pre-approved</span>}
        </span>
      ),
    },
    {
      key: 'cap', header: 'Legal limit', hideable: false, width: 150, value: (r) => capShort(r) ?? 'Within limit',
      render: (r) => {
        const f = capBadge(r);
        return f
          ? <span className="yx-tim-list__main" style={{ alignItems: 'flex-start' }}><Badge tone="danger" style={NOWRAP}>{f}</Badge><span className="yx-tim-muted" style={NOWRAP}>{capHours(r)}</span></span>
          : <Badge tone="success" style={NOWRAP}>Within limit</Badge>;
      },
    },
  ];
  return (
    <TimePage active="Requests" user={user} counts={navCounts}>
      <PageHeader
        title="Overtime review"
        description="Legal limit: 12 h a week, 75 h a quarter. Overtime counts from the shift end when you stay more than 30 min, in 15-min steps."
        facts={
          <span className="yx-tim-row">
            <span className="yx-tim-muted">
              {pending.length ? `${pending.length} waiting · ${fmtDuration(pending.reduce((a, r) => a + r.otMin, 0))} of overtime. ` : ''}
              {persona === 'hr' ? 'HR can pay over the limit with a recorded reason.' : overPending ? `${overText}.` : ''}
            </span>
            {payrollOpen && <Badge tone={closeIn <= 1 ? 'danger' : closeIn <= 7 ? 'warning' : 'neutral'}>{MONTH[TODAY.getMonth()]} payroll closes {closeText}</Badge>}
          </span>
        }
      />
      <DataTable
        label="Overtime to review"
        columns={cols}
        rows={state === 'empty' ? [] : rows}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        onRetry={() => {}}
        empty={
          <EmptyState
            title="No overtime to review"
            description="Overtime shows here once a day ends more than 30 min after the shift."
            action={<Button asChild><a href={storyHref('screens-time-tim-04-·-attendance-exceptions--manager')} target="_top">Check attendance exceptions</a></Button>}
          />
        }
        selectable
        // Decided rows carry their own status badge, so no "Already decided" note beside it.
        isSelectable={(r) => (r.status !== 'Pending' ? false : capped(r) ? 'Over the limit: decide one by one' : true)}
        selectedIds={sel}
        onSelectedChange={(ids) => setSel(ids.filter((id) => bulkOk.has(id)))}
        bulkActions={(ids) => (
          <>
            <Button variant="approve" size="sm" onClick={() => setStatus(ids, 'Approved')}>Approve {ids.length}</Button>
            <Button size="sm" onClick={() => setStatus(ids, 'Comp-off')}>Give comp-off</Button>
            <Button size="sm" onClick={() => askReject(ids)}>Reject</Button>
            {overPending > 0 && <span className="yx-tim-muted">{overText}</span>}
          </>
        )}
        // One visible decision per row (Approve, or Override for HR on over-limit rows); comp-off and reject sit in the "…" menu, so the actions fit one line.
        rowButtons={(r) =>
          r.status !== 'Pending' ? <Badge tone={OT_STATUS_TONE[r.status]}>{otStatusLabel(r.status)}</Badge> : capped(r) ? (
            persona === 'hr' ? <Button size="sm" onClick={() => open(r, 'override')}>Override limit</Button> : <Badge tone="neutral">Sent to HR</Badge>
          ) : (
            <Button variant="approve" size="sm" onClick={() => setStatus([r.id], 'Approved')}>Approve</Button>
          )
        }
        rowActions={(r) =>
          r.status === 'Pending' && (persona === 'hr' || !capped(r)) ? (
            <>
              <MenuItem onSelect={() => open(r, 'comp')}>Give comp-off…</MenuItem>
              <MenuItem onSelect={() => askReject([r.id])}>Reject…</MenuItem>
            </>
          ) : null
        }
      />
      <Dialog
        open={!!dlg}
        onOpenChange={(o) => !o && setDlg(null)}
        title={mode === 'override' ? `Pay over the limit · ${dlg?.person}` : `Give comp-off instead · ${dlg?.person}`}
        footer={
          <>
            {needReason && !reason.trim() && <FootReason>Enter a reason</FootReason>}
            <Button onClick={() => setDlg(null)}>Cancel</Button>
            <Button
              variant={mode === 'override' ? 'approve' : 'primary'}
              onClick={() => {
                if (needReason && !reason.trim()) return setTried(true);
                if (dlg) setStatus([dlg.id], mode === 'comp' ? 'Comp-off' : 'Approved');
                setDlg(null);
              }}
            >
              {mode === 'override' ? 'Approve with override' : 'Give comp-off'}
            </Button>
          </>
        }
      >
        <div className="yx-tim-stack">
          {dlg && <p className="yx-tim-muted">{otFacts(dlg)}</p>}
          {mode === 'comp' && dlg && (
            // Comp-off lasts 30 days from the day worked, as the leave balance shows ("expires 14 Oct").
            <p>{fmtDuration(dlg.otMin)} becomes <strong>{dlg.otMin >= 240 ? '1 day' : '0.5 day'}</strong> of comp-off, usable until {dm(addDays(dlg.date, 30))}. No OT pay for this day.</p>
          )}
          {needReason && (
            <>
              <InlineAlert tone="warning" title={dlg ? capShort(dlg) ?? '' : ''}>
                {mode === 'override' ? 'Paying' : 'Giving comp-off for hours'} over the legal limit is recorded against your name in the audit log.
              </InlineAlert>
              <FormField label="Reason" required error={tried && !reason.trim() ? 'Enter a reason' : null}><TextArea rows={3} value={reason} onChange={setReason} placeholder="For example: emergency line breakdown, plant head approved" /></FormField>
            </>
          )}
        </div>
      </Dialog>
      <Dialog
        open={!!rej}
        onOpenChange={(o) => !o && setRej(null)}
        title={rejRows.length === 1 ? `Reject overtime · ${rejRows[0].person}` : `Reject ${rejRows.length} overtime entries`}
        footer={
          <>
            {!rejReason.trim() && <FootReason>Enter a reason</FootReason>}
            <Button onClick={() => setRej(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (!rejReason.trim()) return setTried(true); if (rej) setStatus(rej, 'Rejected'); setRej(null); }}>Reject overtime</Button>
          </>
        }
      >
        <div className="yx-tim-stack">
          <p className="yx-tim-muted">{rejRows.length === 1 ? otFacts(rejRows[0]) : `${rejRows.length} entries · ${fmtDuration(rejRows.reduce((a, r) => a + r.otMin, 0))} of overtime`}</p>
          <p>These hours are not paid. The employee sees your reason.</p>
          <FormField label="Reason" required error={tried && !rejReason.trim() ? 'Enter a reason' : null}><TextArea rows={3} value={rejReason} onChange={setRejReason} placeholder="For example: work could wait until the next shift" /></FormField>
        </div>
      </Dialog>
    </TimePage>
  );
}

/* =====================================================================
   TIM-10 · Device backfill correction (late device batch) — wizard
   ===================================================================== */

/** Gate 1 kiosk at Hosur plant (TIM-14 device list). */
const BACKFILL_DEVICE = 'KF-HSR-K1 · Hosur Gate 1';
/** The batch covers exactly the offline window; the counts below are for these days. */
const BACKFILL_FROM = new Date(2026, 8, 14);
const BACKFILL_TO = new Date(2026, 8, 17);
const clip = (t: string, n = 60) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
/**
 * Every status change in the batch (the KPIs count these): 6 absences become present, 2 late marks go, 1 is new.
 * The other 122 rechecked days keep their status. The first three are the examples shown.
 */
const BACKFILL_CHANGES = [
  { name: 'Kavitha Sundaram', date: new Date(2026, 8, 15), change: 'Absent → Present 6:02 am – 2:05 pm' },
  { name: 'Rekha Balan', date: new Date(2026, 8, 16), change: 'Late (6:18 am) → On time (5:58 am, punch on device)' },
  { name: 'Jaya Prakash', date: new Date(2026, 8, 17), change: 'Present → Late (6:24 am, Morning shift)' },
  { name: 'Selvi Arumugam', date: new Date(2026, 8, 14), change: 'Absent → Present 1:56 pm – 10:04 pm' },
  { name: 'Anil Kumar', date: new Date(2026, 8, 14), change: 'Absent → Present 9:02 am – 6:05 pm' },
  { name: 'Mohammed Irfan', date: new Date(2026, 8, 15), change: 'Absent → Present 5:57 am – 2:01 pm' },
  { name: 'Anil Kumar', date: new Date(2026, 8, 16), change: 'Absent → Present 8:58 am – 6:10 pm' },
  { name: 'Kavitha Sundaram', date: new Date(2026, 8, 17), change: 'Absent → Present 5:59 am – 2:03 pm' },
  { name: 'Selvi Arumugam', date: new Date(2026, 8, 16), change: 'Late (2:14 pm) → On time (1:58 pm, punch on device)' },
];
const BACKFILL_DAYS = 131;
const BACKFILL_EXAMPLES = BACKFILL_CHANGES.slice(0, 3);
/** ponytail: stub export built from the change list above; the real file comes from the API. */
function downloadChanges() {
  const csv = ['Employee,Date,Change', ...BACKFILL_CHANGES.map((c) => `${c.name},${dm(c.date)},"${c.change}"`)].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'BKF-0917-changes.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/** TIM-10 · Device backfill. The app passes `live` (Time › Device punches); stories show the sample. */
export function DeviceBackfillWizard(p: { current?: string; done?: boolean; live?: LiveDeviceBackfill }) {
  return p.live ? <LiveDeviceBackfillWizard live={p.live} /> : <SampleDeviceBackfillWizard {...p} />;
}

function SampleDeviceBackfillWizard({ current = 'batch', done = false }: { current?: string; done?: boolean }) {
  const { toast } = useToast();
  const [applied, setApplied] = useState(done);
  const [reason, setReason] = useState('Gate 1 kiosk lost network 14–17 Sep; the network was restored on 18 Sep and the stored punches synced on 28 Sep.');
  const effects = '6 absent → present · 2 late marks removed · 1 new late mark';
  const restored = BACKFILL_CHANGES.filter((c) => c.change.startsWith('Absent → Present'));
  const payNote = `Effects land in September payroll: ${plural(new Set(restored.map((c) => c.name)).size, 'person', 'people')} get pay back for ${plural(restored.length, 'absent day')}; 1 new late mark may lead to a deduction.`;
  if (applied)
    return (
      <TimePage active="Periods" user={HR_ADMIN}>
        <PageHeader title="Device punches applied" />
        {/* Done is said by the toast; this stays as the record of what changed and where to go next. */}
        <InlineAlert
          tone="info"
          title="412 punches applied for 38 people"
          actions={
            <>
              <Button size="sm" asChild><a href={storyHref('screens-time-tim-02-·-muster--open')} target="_top">Open September muster</a></Button>
              <Button size="sm" asChild><a href={storyHref('screens-time-tim-11-·-periods--hr')} target="_top">Back to Periods</a></Button>
            </>
          }
        >
          Recorded as one audited correction (ref BKF-0917). {payNote}
        </InlineAlert>
      </TimePage>
    );
  return (
    <TimePage active="Periods" user={HR_ADMIN}>
      <Stepper
        title="Device punches correction"
        defaultCurrent={current}
        finishLabel="Apply punches"
        onFinish={() => { toast({ tone: 'success', title: '412 punches applied for 38 people' }); setApplied(true); }}
        finishBlocked={!reason.trim() ? 'Enter a reason' : undefined}
        review={{ title: 'Review', note: '412 punches for 38 people are applied as one audited correction. Effects go to September payroll.' }}
        steps={[
          {
            id: 'batch', title: 'Batch', description: 'Device and dates',
            content: (
              <div className="yx-tim-form">
                <InlineAlert tone="info" title="Late punches from a device">The Gate 1 kiosk at Hosur plant was offline 14–17 Sep. Its network was restored on 18 Sep, and its stored punches synced on 28 Sep. Apply them once, with one audit record, instead of 38 separate requests.</InlineAlert>
                <FormField label="Device" helper="Set by the batch">
                  <p>{BACKFILL_DEVICE}</p>
                </FormField>
                <FormField label="Dates" helper="Set by the batch: the days the kiosk was offline">
                  <p>{range(BACKFILL_FROM, BACKFILL_TO)}</p>
                </FormField>
                <p className="yx-tim-muted">Batch received 28 Sep, 11:02 pm · 412 punches · 2 duplicates ignored</p>
              </div>
            ),
            summary: `Kiosk ${BACKFILL_DEVICE} · ${range(BACKFILL_FROM, BACKFILL_TO)} · 412 punches`,
          },
          {
            id: 'preview', title: 'Preview', description: 'What changes',
            content: (
              <div className="yx-tim-stack">
                <Kpis items={[{ label: 'People', value: 38 }, { label: 'Days rechecked', value: BACKFILL_DAYS }, { label: 'Absences that become present', value: 6 }, { label: 'Late marks removed', value: 2 }, { label: 'New late marks', value: 1 }]} />
                <strong>Examples · {BACKFILL_EXAMPLES.length} of {BACKFILL_CHANGES.length} changes</strong>
                <p className="yx-tim-muted">{BACKFILL_DAYS} days rechecked; {BACKFILL_DAYS - BACKFILL_CHANGES.length} keep their status.</p>
                <ul className="yx-tim-list">
                  {BACKFILL_EXAMPLES.map((c) => (
                    <li key={`${c.name}-${c.date.getDate()}`}>
                      <span className="yx-tim-list__main">
                        <span><strong>{c.name}</strong> <span className="yx-tim-muted">· {dm(c.date)}</span></span>
                        <span>{c.change}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="yx-tim-row"><Button size="sm" icon={Download} onClick={downloadChanges}>Download all {BACKFILL_CHANGES.length} changes</Button></div>
                <InlineAlert tone="info" title="September is open">{payNote}</InlineAlert>
              </div>
            ),
            summary: `38 people · ${BACKFILL_DAYS} days rechecked · ${effects}`,
          },
          {
            id: 'reason', title: 'Reason', description: 'Audit note',
            content: <FormField label="Reason (audited)" required><TextArea rows={3} value={reason} onChange={setReason} /></FormField>,
            summary: reason.trim() ? clip(reason.trim()) : 'No reason entered',
          },
        ]}
      />
    </TimePage>
  );
}

/* ---------- live: /time/device-punches (TIM-10) ---------- */

/** HR (attendance.lock over the legal entity): a device's late punches, previewed, then applied once with a reason. */
export interface LiveDeviceBackfill {
  state: LoadState;
  onRetry?: () => void;
  /** Devices with punches waiting, in every legal entity the person may lock (each batch names its entity). */
  batches: DeviceBatch[] | null;
  onPreview: (legalEntityId: string, deviceRef: string) => Promise<DevicePreview>;
  /** Applies the batch (the second sign-in step is asked); `punches` is the count reviewed. */
  onApply: (legalEntityId: string, deviceRef: string, reason: string, punches: number) => Promise<{ id: string; punches: number; people: number; personDays: number; openDays: number; corrections: number }>;
  musterHref: string;
  periodsHref: string;
}

const STATUS_WORD: Record<string, string> = { present: 'Present', half_day: 'Half day', absent: 'Absent', missing_in: 'Missing check-in', missing_out: 'Missing check-out', not_started: 'Not worked out', no_timesheet: 'No timesheet', leave: 'On leave', holiday: 'Holiday', weekly_off: 'Weekly off', strike: 'Strike', lockout: 'Lockout', layoff: 'Lay-off' };
/** "Absent → Present 6:02 am – 2:05 pm", "Late (6:18 am) → On time (5:58 am)", or the correction a locked day becomes. */
function deviceChange(c: DevicePreview['changes'][number]): string {
  if (!c.open) return `Correction for the next payroll: ${c.punches.map((p) => `${p.kind === 'in' ? 'in' : 'out'} ${p.at ? fmt12(p.at) : ''}`).join(', ')}`;
  const b = c.before;
  const a = c.after;
  const word = (x: DeviceDayView | null) => (!x ? 'Nothing recorded' : (x.lateMinutes ?? 0) > 0 && x.status === 'present' ? `Late (${x.firstIn ? fmt12(x.firstIn) : ''})` : STATUS_WORD[x.status] ?? x.status);
  const span = a?.firstIn && a.lastOut ? ` ${fmt12(a.firstIn)} – ${fmt12(a.lastOut)}` : '';
  return `${word(b)} → ${a && (b?.lateMinutes ?? 0) > 0 && !(a.lateMinutes ?? 0) && a.status === 'present' ? `On time (${a.firstIn ? fmt12(a.firstIn) : ''})` : `${word(a)}${span}`}`;
}

function LiveDeviceBackfillWizard({ live }: { live: LiveDeviceBackfill }) {
  const { toast } = useToast();
  const [device, setDevice] = useState<string | null>(null);
  const [preview, setPreview] = useState<DevicePreview | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<Awaited<ReturnType<LiveDeviceBackfill['onApply']>> | null>(null);
  const { busy, error, run } = useRun();
  const batches = live.batches ?? [];
  const keyOf = (b: DeviceBatch) => `${b.legalEntityId}|${b.deviceRef}`;
  const chosen = batches.find((b) => keyOf(b) === device) ?? (batches.length === 1 ? batches[0] : null);
  const load = (b: DeviceBatch) => void run('preview', async () => setPreview(await live.onPreview(b.legalEntityId, b.deviceRef)));
  useEffect(() => {
    if (chosen) load(chosen);
  }, [chosen && keyOf(chosen)]); // eslint-disable-line react-hooks/exhaustive-deps
  const reasonErr = reason.trim().length < 10 ? 'Give the reason in a sentence (at least 10 letters).' : null;
  if (done)
    return (
      <TimePage active="Periods">
        <PageHeader title="Device punches applied" />
        {/* Done is said by the toast; this stays as the record of what changed and where to go next. */}
        <InlineAlert
          tone="info"
          title={`${plural(done.punches, 'punch', 'punches')} applied for ${plural(done.people, 'person', 'people')}`}
          actions={
            <>
              <Button size="sm" asChild><a href={live.musterHref}>Open muster</a></Button>
              <Button size="sm" asChild><a href={live.periodsHref}>Back to Periods</a></Button>
            </>
          }
        >
          Recorded as one audited correction. {done.openDays ? `${plural(done.openDays, 'day')} of open months worked out again. ` : ''}{done.corrections ? `${plural(done.corrections, 'day')} of locked months go to the next payroll as corrections.` : ''}
        </InlineAlert>
      </TimePage>
    );
  return (
    <TimePage active="Periods">
      {/* The wizard's own title is the page heading; the other states get the same heading. */}
      {!(live.state === 'ready' && batches.length) && <PageHeader title="Device punches correction" />}
      <LiveGate state={live.state} onRetry={live.onRetry} what="device punches">
        {!batches.length ? (
          <EmptyState title="No device punches waiting" description="When a kiosk or reader that was offline sends its stored punches late, they wait here to be applied once." action={<Button asChild><a href={live.periodsHref}>Back to Periods</a></Button>} />
        ) : (
          <>
          {error && busy === null && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
          <Stepper
            title="Device punches correction"
            showTitle
            finishLabel="Apply punches"
            finishing={busy === 'apply'}
            onContinue={(id) => {
              if (id === 'batch' && !chosen) {
                document.getElementById('bf-device')?.focus();
                return false;
              }
              if (id === 'preview' && !preview) return false;
              if (id === 'reason' && reasonErr) {
                setTried(true);
                document.getElementById('bf-reason')?.focus();
                return false;
              }
              return true;
            }}
            onFinish={() => {
              if (reasonErr || !chosen || !preview) return setTried(true);
              void run('apply', async () => {
                const r = await live.onApply(chosen.legalEntityId, chosen.deviceRef, reason.trim(), preview.punches);
                toast({ tone: 'success', title: `${plural(r.punches, 'punch', 'punches')} applied for ${plural(r.people, 'person', 'people')}` });
                setDone(r);
              });
            }}
            review={{ title: 'Review', note: preview ? `${plural(preview.punches, 'punch', 'punches')} for ${plural(preview.people, 'person', 'people')} are applied as one audited correction. You'll be asked to confirm it's you.` : undefined }}
            steps={[
              {
                id: 'batch',
                title: 'Batch',
                description: 'Device and dates',
                content: (
                  <div className="yx-tim-form">
                    <InlineAlert tone="info" title="Late punches from a device">Apply a device's stored punches once, with one audit record, instead of a request from each person.</InlineAlert>
                    <FormField id="bf-device" label="Device" required error={!chosen && tried ? 'Choose the device' : null}>
                      <Select value={chosen ? keyOf(chosen) : null} onChange={(v) => { setDevice(v); setPreview(null); }} options={batches.map((b) => ({ value: keyOf(b), label: `${b.deviceRef} · ${b.entityName} · ${plural(b.punches, 'punch', 'punches')}` }))} />
                    </FormField>
                    {chosen && (
                      <FormField label="Dates" helper="Set by the batch: the days the punches are for">
                        <p>{chosen.from && chosen.to ? `${isoDate(chosen.from)} – ${isoDate(chosen.to)}` : '—'}</p>
                      </FormField>
                    )}
                    {chosen && <p className="yx-tim-muted">{chosen.entityName} · {chosen.receivedAt ? `Batch received ${isoDate(chosen.receivedAt)} · ` : ''}{plural(chosen.punches, 'punch', 'punches')} · {plural(chosen.people, 'person', 'people')}</p>}
                  </div>
                ),
                summary: chosen ? `${chosen.deviceRef} · ${plural(chosen.punches, 'punch', 'punches')}` : 'No device chosen',
              },
              {
                id: 'preview',
                title: 'Preview',
                description: 'What changes',
                content: !preview ? (
                  busy === 'preview' ? <Skeleton height={120} /> : <InlineAlert tone="danger" title="The preview did not load" actions={chosen ? <Button size="sm" onClick={() => load(chosen)}>Try again</Button> : undefined}>{error ?? 'Try again.'}</InlineAlert>
                ) : (
                  <div className="yx-tim-stack">
                    <Kpis items={[{ label: 'People', value: preview.people }, { label: 'Days rechecked', value: preview.personDays }, { label: 'Absences that become present', value: preview.becomePresent }, { label: 'Late marks removed', value: preview.lateRemoved }, { label: 'New late marks', value: preview.lateAdded }]} />
                    <strong>Examples · {Math.min(3, preview.changes.length)} of {plural(preview.changes.length, 'change')}</strong>
                    <ul className="yx-tim-list">
                      {preview.changes.slice(0, 3).map((c) => (
                        <li key={`${c.employeeId}-${c.on}`}>
                          <span className="yx-tim-list__main">
                            <span><strong>{c.name}</strong> <span className="yx-tim-muted">· {isoDate(c.on)}</span></span>
                            <span>{deviceChange(c)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="yx-tim-row">
                      <Button size="sm" icon={Download} onClick={() => downloadText(`${preview.deviceRef}-changes.csv`, ['Employee,Code,Date,Change', ...preview.changes.map((c) => `"${c.name}","${c.code ?? ''}",${c.on},"${deviceChange(c).replace(/"/g, '""')}"`)].join('\n'))}>Download all {plural(preview.changes.length, 'change')}</Button>
                    </div>
                    {preview.corrections > 0 ? (
                      <InlineAlert tone="info" title={`${plural(preview.corrections, 'day')} in a frozen or locked month`}>Those days don't change; they go to the next payroll as approved corrections.</InlineAlert>
                    ) : (
                      <InlineAlert tone="info" title="The month is open">The days are worked out again with these punches.</InlineAlert>
                    )}
                  </div>
                ),
                summary: preview ? `${plural(preview.people, 'person', 'people')} · ${plural(preview.personDays, 'day')} rechecked · ${preview.becomePresent} absent → present` : 'Not previewed',
              },
              {
                id: 'reason',
                title: 'Reason',
                description: 'Audit note',
                content: (
                  <FormField id="bf-reason" label="Reason (audited)" required error={tried ? reasonErr : null}>
                    <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} placeholder="For example: Gate 1 kiosk lost network 14–17 Sep; punches synced on 28 Sep" />
                  </FormField>
                ),
                summary: reason.trim() ? clip(reason.trim()) : 'No reason entered',
              },
            ]}
          />
          </>
        )}
      </LiveGate>
    </TimePage>
  );
}

/** Saves text as a file in the browser. */
function downloadText(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* =====================================================================
   TIM-11 · Periods (month cards, lock stages, pre-lock checklist, reopen request)
   ===================================================================== */

interface Period { id: string; m: number; stage: PeriodStage; locked?: { on: Date; by: string }; filedOn?: Date; bankReleased: boolean; payslipsPublished: boolean; returnFiled: boolean }
const PERIODS: Period[] = [
  { id: 'oct', m: 9, stage: 'open', bankReleased: false, payslipsPublished: false, returnFiled: false },
  { id: 'sep', m: 8, stage: 'open', bankReleased: false, payslipsPublished: false, returnFiled: false },
  // Locked on the 1st, after the freeze and before payroll runs (as September is on 1 Oct).
  { id: 'aug', m: 7, stage: 'filed', locked: { on: new Date(2026, 8, 1), by: PAYROLL_ADMIN.name }, filedOn: new Date(2026, 8, 15), bankReleased: true, payslipsPublished: true, returnFiled: true },
  { id: 'jul', m: 6, stage: 'filed', locked: { on: new Date(2026, 7, 1), by: PAYROLL_ADMIN.name }, filedOn: new Date(2026, 7, 14), bankReleased: true, payslipsPublished: true, returnFiled: true },
];
const STAGE: Record<PeriodStage, { label: string; tone: 'success' | 'warning' | 'neutral' | 'info' }> = {
  open: { label: 'Open', tone: 'success' },
  frozen: { label: 'Frozen', tone: 'warning' },
  locked: { label: 'Locked', tone: 'neutral' },
  filed: { label: 'Filed', tone: 'info' },
};
const monthName = (p: Period) => `${MONTH[p.m]} 2026`;
const freezeDate = (p: Period) => new Date(2026, p.m, 30);
const inMonth = (d: Date, m: number) => d.getFullYear() === 2026 && d.getMonth() === m;
const lockedText = (p: Period) => (p.locked ? `${dm(p.locked.on)} by ${p.locked.by}` : '');

/** Checklist counts for one month, from the data (the nav counts read the same rows). */
function checklist(m: number) {
  return {
    exceptions: EXCEPTIONS.filter((x) => inMonth(x.date, m) && x.blocking && x.status === 'Open').length,
    attReq: EXCEPTIONS.filter((x) => inMonth(x.date, m) && x.status === 'Request pending').length,
    leave: LEAVE_REQUESTS.filter((r) => r.status === 'Pending' && inMonth(r.from, m)).length,
    ot: OT_ROWS.filter((r) => r.status === 'Pending' && inMonth(r.date, m)).length,
    timesheets: EXCEPTIONS.filter((x) => inMonth(x.date, m) && x.kind === 'No approved timesheet' && x.status !== 'Resolved').length,
  };
}
const NONE = { exceptions: 0, attReq: 0, leave: 0, ot: 0, timesheets: 0 };
/** When the month's matching exceptions belong to one person, the fix button opens the queue searched to them. */
function onePerson(m: number, pick: (x: (typeof EXCEPTIONS)[number]) => boolean) {
  const names = new Set(EXCEPTIONS.filter((x) => inMonth(x.date, m) && pick(x)).map((x) => x.person));
  return names.size === 1 ? `defaultSearch:${[...names][0].replace(/ /g, '+')}` : undefined;
}
/** Where each checklist fix button goes (the screen that holds those items). */
const FIX_STORY = {
  exceptions: 'screens-time-tim-04-·-attendance-exceptions--hr',
  // No pending-leave queue exists yet; the button says it opens the calendar.
  leave: 'screens-time-tim-20-·-team-leave-calendar--hr',
  ot: 'screens-time-tim-09-·-ot-review--hr',
  timesheets: 'screens-time-tim-15-·-timesheets--submitted',
};

/* ---------- live: /time/periods (TIM-11) ---------- */

/** HR › Attendance periods: attendance.lock for a legal entity; lock and the reopen request ask for a fresh second step. */
export interface LivePeriods {
  state: LoadState;
  onRetry?: () => void;
  data: Periods | null;
  year: string;
  onYear: (year: string) => void;
  onPreflight: (legalEntityId: string, month: string) => Promise<Preflight>;
  onLock: (legalEntityId: string, month: string) => Promise<unknown>;
  onUnlock: (legalEntityId: string, month: string, reason: string) => Promise<unknown>;
  /** Decision 7a: HR opens a month it froze again (a reason and the authenticator code). */
  onUnfreeze?: (legalEntityId: string, month: string, reason: string) => Promise<unknown>;
  /** TIM-11 two-step flow (company setting attendance.lock_flow): HR sends, payroll approves the lock. */
  onSend?: (legalEntityId: string, month: string) => Promise<unknown>;
  onApproveLock?: (legalEntityId: string, month: string) => Promise<unknown>;
}
type LiveMonth = Periods['entities'][number]['months'][number];
type LiveTarget = { entity: Periods['entities'][number]; m: LiveMonth; view: 'checklist' | 'reopen' | 'open_again' };
/** Sent to payroll and still frozen: payroll approves it next. */
const withPayroll = (m: LiveMonth) => Boolean(m.sentAt) && liveOpen(m);
const liveOpen = (m: LiveMonth) => m.stage === 'open' || m.stage === 'frozen';
const changeText = (m: LiveMonth) => (m.changedAt ? `${isoDate(m.changedAt)}${m.changedBy ? ` by ${m.changedBy}` : ''}` : '');
/** First year the app keeps attendance periods for (nav limit). */
const FIRST_PERIOD_YEAR = 2025;

function LivePeriodsScreen({ live }: { live: LivePeriods }) {
  const { toast } = useToast();
  const d = live.data;
  const [target, setTarget] = useState<LiveTarget | null>(null);
  const thisYear = d?.today.slice(0, 4) ?? live.year;
  const go = (n: number) => {
    const y = Number(live.year) + n;
    if (n > 0 && String(y) > thisYear) return toast({ title: `There is no ${y} yet. Its months open as they start.` });
    if (y < FIRST_PERIOD_YEAR) return toast({ title: `There are no periods before ${FIRST_PERIOD_YEAR}.` });
    live.onYear(String(y));
  };
  return (
    <TimePage active="Periods">
      <PageHeader
        title="Periods"
        description="Lock a month once its attendance and leave are final. Locked months refuse changes; payroll reads their frozen figures."
        facts={<span className="yx-tim-muted">Year {live.year}. After a month is locked, people can still ask for fixes; they are paid in the next payroll.</span>}
        actions={
          <div className="yx-tim-row">
            <Button size="sm" onClick={() => go(-1)}>Previous year</Button>
            <Button size="sm" onClick={() => go(1)}>Next year</Button>
          </div>
        }
      />
      <LiveGate state={live.state} onRetry={live.onRetry} what="attendance periods">
        {d && !d.entities.length && <EmptyState title="No legal entity to lock" description="Locking attendance needs attendance.lock for a legal entity." />}
        {d?.entities.map((e) => (
          <section key={e.id} className="yx-tim-stack" aria-label={`${e.name} periods`}>
            {d.entities.length > 1 && <h2 className="yx-tim-h2">{e.name}</h2>}
            <div className="yx-tim-cards">
              {e.months
                .filter((m) => m.month <= d.today.slice(0, 7))
                .slice()
                .reverse()
                .map((m) => (
                  <Card key={m.month} title={monthText(m.month)} actions={m.reopenAsked ? <Badge tone="info">Reopen asked</Badge> : withPayroll(m) ? <Badge tone="info">With payroll</Badge> : <Badge tone={STAGE[m.stage].tone}>{STAGE[m.stage].label}</Badge>}>
                    {liveOpen(m) ? (
                      <p className="yx-tim-muted">{withPayroll(m) ? `Sent by ${m.sentBy ?? 'HR'} ${isoDate(m.sentAt!)}` : m.lockable ? 'Ready for the pre-lock checks' : 'Can be locked from the 2nd of the next month'}{m.changedAt && m.stage === 'open' ? ` · reopened ${changeText(m)}${m.reason ? `: ${m.reason}` : ''}` : ''}</p>
                    ) : (
                      <p className="yx-tim-muted">Locked {changeText(m)}</p>
                    )}
                    <div className="yx-tim-row">
                      <Button size="sm" onClick={() => setTarget({ entity: e, m, view: 'checklist' })}>{liveOpen(m) ? 'Pre-lock checklist' : 'Lock summary'}</Button>
                      {m.stage === 'locked' && !m.reopenAsked && <Button size="sm" icon={Unlock} onClick={() => setTarget({ entity: e, m, view: 'reopen' })}>Request reopen</Button>}
                      {m.stage === 'frozen' && e.canLock && live.onUnfreeze && <Button size="sm" icon={Unlock} onClick={() => setTarget({ entity: e, m, view: 'open_again' })}>Open the month again</Button>}
                      {m.stage === 'locked' && m.reopenAsked && <span className="yx-tim-muted">Waiting for two approvals</span>}
                      {m.stage === 'filed' && <span className="yx-tim-muted">Filed: corrections only</span>}
                    </div>
                  </Card>
                ))}
            </div>
          </section>
        ))}
      </LiveGate>
      {target?.view === 'checklist' && (liveOpen(target.m) ? <LiveLockDrawer target={target} live={live} onClose={() => setTarget(null)} /> : <LiveLockSummary target={target} onClose={() => setTarget(null)} onReopen={() => setTarget({ ...target, view: 'reopen' })} />)}
      {target?.view === 'reopen' && (
        <ReopenDialog name={`${monthText(target.m.month)} · ${target.entity.name}`} check={{ ok: true }} minLength={10} onClose={() => setTarget(null)} onSend={(reason) => live.onUnlock(target.entity.id, target.m.month, reason)} />
      )}
      {target?.view === 'open_again' && live.onUnfreeze && (
        <ReopenDialog kind="open_again" name={`${monthText(target.m.month)} · ${target.entity.name}`} check={{ ok: true }} minLength={10} onClose={() => setTarget(null)} onSend={(reason) => live.onUnfreeze!(target.entity.id, target.m.month, reason)} />
      )}
    </TimePage>
  );
}

function LiveLockDrawer({ target, live, onClose }: { target: LiveTarget; live: LivePeriods; onClose: () => void }) {
  const [pre, setPre] = useState<Preflight | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { busy, error, run } = useRun();
  const load = () => void run('pre', async () => setPre(await live.onPreflight(target.entity.id, target.m.month)));
  useEffect(load, [target.entity.id, target.m.month]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocked = !!pre && (pre.pending.length > 0 || pre.exceptions > 0);
  const twoStep = target.entity.flow === 'two_step';
  // Never disabled (founder rule): pressed too early, the reason shows and the checklist takes focus.
  const why = !target.m.lockable
    ? `${monthText(target.m.month)} can be locked from ${pre ? isoDate(pre.lockableFrom) : 'the 2nd of the next month'}.`
    : !pre
      ? 'Wait a moment: the checks of the month are still running.'
      : blocked
        ? 'Settle what is still waiting (listed above) before locking.'
        : twoStep && target.entity.canApprove && !target.entity.canLock && !target.m.sentAt
          ? 'HR has not sent this month for approval yet.'
          : null;
  const early = useTooEarly(why ? [{ fieldId: 'lock-checklist', message: why }] : []);
  const name = monthText(target.m.month);
  return (
    <>
      <Drawer
        open
        onOpenChange={(o) => !o && onClose()}
        size="lg"
        title={`${name} · pre-lock checklist`}
        subtitle={target.entity.name}
        footer={
          <>
            {early.errorOf('lock-checklist') && <FootReason>{early.errorOf('lock-checklist')}</FootReason>}
            <Button onClick={onClose}>Close</Button>
            {twoStep && !target.m.sentAt && target.entity.canLock ? (
              <Button variant="primary" icon={Send} onClick={() => !early.stop() && setConfirm(true)}>Send for approval</Button>
            ) : twoStep && target.entity.canApprove && !target.m.sentByMe ? (
              <Button variant="approve" icon={Lock} onClick={() => !early.stop() && setConfirm(true)}>Approve lock</Button>
            ) : twoStep ? (
              <Badge tone="info">Sent for approval</Badge>
            ) : (
              <Button variant="primary" icon={Lock} onClick={() => !early.stop() && setConfirm(true)}>Lock the month</Button>
            )}
          </>
        }
      >
        <div className="yx-tim-stack">
          {busy === 'pre' && <Skeleton height={80} />}
          {error && <InlineAlert tone="danger" title="The checks did not run" actions={<Button size="sm" onClick={load}>Try again</Button>}>{error}</InlineAlert>}
          {pre && (
            <>
              <p className="yx-tim-muted">{plural(pre.people, 'person', 'people')} in {target.entity.name} during the month. Every day is worked out again before the lock.</p>
              <ul id="lock-checklist" tabIndex={-1} className="yx-tim-check" aria-label="Pre-lock checklist">
                <li>
                  <span>Attendance exceptions resolved</span>
                  {pre.exceptions ? <Badge tone="danger">{pre.exceptions} open</Badge> : <Badge tone="success">Done</Badge>}
                </li>
                {pre.pending.map((x) => (
                  <li key={x.kind}>
                    <span>{x.kind} decided</span>
                    <Badge tone="danger">{x.count} waiting</Badge>
                  </li>
                ))}
                {!pre.pending.length && (
                  <li>
                    <span>Requests decided (leave, attendance, overtime, timesheets)</span>
                    <Badge tone="success">Done</Badge>
                  </li>
                )}
              </ul>
              <p className="yx-tim-muted">After the lock, attendance, leave, overtime, rosters and timesheets of the month can't change, and its payroll figures are frozen.</p>
            </>
          )}
        </div>
      </Drawer>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={twoStep && !target.m.sentAt ? `Send ${name} for payroll approval?` : twoStep ? `Approve lock · ${name}` : `Lock ${name} for ${target.entity.name}?`}
        consequence={twoStep && !target.m.sentAt ? `Payroll approves the lock. Until then, inputs for ${name} stay frozen.` : `Attendance and pay-affecting leave for ${name} can't be changed after this; fixes become late requests paid in the next payroll. You'll be asked to confirm it's you.`}
        confirmLabel={twoStep && !target.m.sentAt ? 'Send for approval' : twoStep ? 'Approve lock' : 'Lock the month'}
        confirmVariant={twoStep && target.m.sentAt ? 'approve' : undefined}
        onConfirm={async () => {
          if (twoStep && !target.m.sentAt) await live.onSend!(target.entity.id, target.m.month);
          else if (twoStep) await live.onApproveLock!(target.entity.id, target.m.month);
          else await live.onLock(target.entity.id, target.m.month);
          onClose();
        }}
      />
    </>
  );
}

function LiveLockSummary({ target, onClose, onReopen }: { target: LiveTarget; onClose: () => void; onReopen: () => void }) {
  const m = target.m;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`${monthText(m.month)} · lock summary`}
      subtitle={target.entity.name}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {m.stage === 'locked' && !m.reopenAsked && <Button icon={Unlock} onClick={onReopen}>Request reopen</Button>}
        </>
      }
    >
      <ul className="yx-tim-check">
        <li><span>Lock</span><span>{changeText(m) || 'Locked'}</span></li>
        <li><span>Stage</span><Badge tone={STAGE[m.stage].tone}>{STAGE[m.stage].label}</Badge></li>
        <li>
          <span>Reopen</span>
          <span className="yx-tim-muted">{m.stage === 'filed' ? 'Not allowed. The month is filed: corrections only.' : m.reopenAsked ? 'Asked: waiting for two approvals' : 'Allowed until its bank file is released and its payslips are issued'}</span>
        </li>
      </ul>
    </Drawer>
  );
}

export function PeriodsScreen({ persona = 'hr', openId, dialog, reopenable = false, after = false, live }: {
  persona?: 'hr' | 'pa'; openId?: string; dialog?: 'lock' | 'send' | 'reopen' | 'open_again';
  /** September locked on 1 Oct with payroll not yet run, so it can still be reopened. Use with `after`. */
  reopenable?: boolean;
  /** 1 Oct: September's inputs are frozen and every item is done, so it can be locked. */
  after?: boolean;
  /** The live app's /time/periods. */
  live?: LivePeriods;
}) {
  if (live) return <LivePeriodsScreen live={live} />;
  return <SamplePeriods persona={persona} openId={openId} dialog={dialog} reopenable={reopenable} after={after} />;
}

function SamplePeriods({ persona, openId, dialog, reopenable, after }: { persona: 'hr' | 'pa'; openId?: string; dialog?: 'lock' | 'send' | 'reopen' | 'open_again'; reopenable: boolean; after: boolean }) {
  const { toast } = useToast();
  const today = after ? new Date(2026, 9, 1, 10, 0) : TODAY;
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  /** Frozen months HR opened again (decision 7a). */
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const periods = PERIODS.map((p) =>
    (reopenable && p.id === 'sep') || lockedIds.includes(p.id) ? { ...p, stage: 'locked' as const, locked: { on: dayStart(today), by: PAYROLL_ADMIN.name } }
      : after && p.id === 'sep' && !openedIds.includes(p.id) ? { ...p, stage: 'frozen' as const } : p,
  );
  const counts = (p: Period) => (after && p.id === 'sep' ? NONE : checklist(p.m));
  const [open, setOpen] = useState<Period | null>(openId ? periods.find((p) => p.id === openId) ?? null : null);
  const [dlg, setDlg] = useState(dialog);
  // HR sends September for payroll approval; the Payroll Admin story starts after that.
  const [sentOn, setSentOn] = useState<Date | null>(after && persona === 'pa' ? dayStart(today) : null);
  const user = persona === 'pa' ? PAYROLL_ADMIN : HR_ADMIN;
  const live = (p: Period) => p.stage === 'open' || p.stage === 'frozen';
  const waiting = (p: Period) => p.id === 'sep' && !!sentOn && live(p);
  // A month that hasn't started yet is not "Open" beside the current one.
  const upcoming = (p: Period) => daysUntil(new Date(2026, p.m, 1), today) > 0;
  const lockBlock = (p: Period) => {
    const c = counts(p);
    const why: string[] = [];
    // Each persona reads the reason for its own button: HR sends for approval, the Payroll Admin locks.
    if (daysUntil(freezeDate(p), today) >= 0)
      why.push(persona === 'pa' ? `${MONTH[p.m]} can be locked after ${dm(freezeDate(p))}` : `You can send ${MONTH[p.m]} for approval after ${dm(freezeDate(p))}`);
    const left = [c.exceptions && plural(c.exceptions, 'exception'), c.attReq && plural(c.attReq, 'attendance request')].filter(Boolean);
    if (left.length) why.push(`${left.join(' and ')} still open`);
    if (persona === 'pa' && !waiting(p) && !why.length) why.push('HR has not sent it for approval yet');
    return why.length ? `${why.join('. ')}.` : null;
  };
  const block = open ? lockBlock(open) : null;
  const c = open ? counts(open) : NONE;
  const zero = (p: Period) =>
    daysUntil(new Date(2026, p.m + 1, 0), today) < 0 ? <Badge tone="success">Done</Badge>
      : daysUntil(new Date(2026, p.m, 1), today) > 0 ? <Badge tone="neutral">None yet</Badge> : <Badge tone="neutral">None open</Badge>;
  // Badges and fix buttons each share one width, so the buttons start at the same x down the list (R9).
  const fixRow = (p: Period, n: number, label: string, tone: 'danger' | 'warning', button: string, story: string, args?: string) =>
    n ? (
      <>
        <Badge tone={tone} style={{ minWidth: 'calc(var(--yx-space-16) * 1.25)', justifyContent: 'center' }}>{label}</Badge>
        <Button size="sm" asChild><a href={storyHref(story, args)} target="_top" style={{ minWidth: 'calc(var(--yx-space-16) * 2.5)' }}>{button}</a></Button>
      </>
    ) : zero(p);
  /**
   * The label grows; the status keeps its natural width with badge and button on one line. When both don't fit
   * (phones) the status wraps to line 2, left-aligned. Baseline alignment lines the label up with the badge text.
   */
  const CheckRow = ({ label, children }: { label: string; children: ReactNode }) => (
    <li style={{ flexWrap: 'wrap', alignItems: 'baseline' }}>
      <span style={{ flex: '1 1 calc(var(--yx-space-16) * 2.5)' }}>{label}</span>
      <span className="yx-tim-row" style={{ flex: 'none', flexWrap: 'nowrap' }}>{children}</span>
    </li>
  );
  return (
    <TimePage active="Periods" user={user} counts={after ? { Exceptions: 0, Requests: 0 } : undefined}>
      <PageHeader
        title="Periods"
        description="Kaveri Foods Pvt Ltd (Tamil Nadu). Each month is frozen on the 30th, locked before payroll runs, then filed."
        facts={<span className="yx-tim-muted">{persona === 'pa' ? 'Payroll Admin' : 'HR'} view. After a month is locked, people can still ask for fixes up to 60 days later; they are paid in the next payroll.</span>}
      />
      <div className="yx-tim-cards">
        {periods.map((p) => {
          const pc = counts(p);
          const blockers = [pc.exceptions && plural(pc.exceptions, 'exception'), pc.attReq && plural(pc.attReq, 'attendance request')].filter(Boolean);
          const reopen = canReopen(p);
          return (
            <Card
              key={p.id}
              title={monthName(p)}
              actions={waiting(p) ? <Badge tone="info">With payroll</Badge>
                : upcoming(p) ? <Badge tone="neutral">Starts {dm(new Date(2026, p.m, 1))}</Badge>
                  : <Badge tone={STAGE[p.stage].tone}>{STAGE[p.stage].label}</Badge>}
            >
              {p.stage === 'open' ? (
                <div className="yx-tim-row"><span className="yx-tim-muted">Freezes {dm(freezeDate(p))}</span><DueBadge date={freezeDate(p)} today={today} /></div>
              ) : p.stage === 'frozen' ? (
                <p className="yx-tim-muted">Inputs frozen {dm(freezeDate(p))}</p>
              ) : (
                <>
                  <p className="yx-tim-muted">Locked {lockedText(p)}</p>
                  {p.filedOn && <p className="yx-tim-muted">PF and ESI returns filed {dm(p.filedOn)}</p>}
                </>
              )}
              {waiting(p) && sentOn && <p className="yx-tim-muted">Sent by {HR_ADMIN.name} {dm(sentOn)}</p>}
              {live(p) && blockers.length > 0 && (
                <div className="yx-tim-row"><Badge tone="danger" title={`${blockers.join(' · ')} open`}>Lock blocked: {plural(pc.exceptions + pc.attReq, 'item')} open</Badge></div>
              )}
              <div className="yx-tim-row">
                <Button size="sm" onClick={() => setOpen(p)}>{live(p) ? 'Pre-lock checklist' : 'Lock summary'}</Button>
                {/* Never disabled: when it can't be reopened, the dialog says why. */}
                {p.stage === 'locked' && <Button size="sm" icon={Unlock} onClick={() => { setOpen(p); setDlg('reopen'); }}>Request reopen</Button>}
                {p.stage === 'frozen' && persona === 'hr' && <Button size="sm" icon={Unlock} onClick={() => { setOpen(p); setDlg('open_again'); }}>Open the month again</Button>}
                {p.stage === 'locked' && !reopen.ok && <span className="yx-tim-muted">{reopen.reason}</span>}
              </div>
            </Card>
          );
        })}
      </div>
      <Drawer
        open={!!open && dlg !== 'reopen' && dlg !== 'open_again'}
        onOpenChange={(o) => !o && setOpen(null)}
        // Wide enough that each checklist label, badge and fix button share one line on desktop.
        size="lg"
        title={open ? `${monthName(open)} · ${live(open) ? 'pre-lock checklist' : 'lock summary'}` : ''}
        footer={open && live(open) ? (
          <>
            {block && <FootReason>{block}</FootReason>}
            <Button onClick={() => setOpen(null)}>Close</Button>
            {/* Pressed while blocked, the checklist takes focus; the reason is above the buttons. */}
            {persona === 'pa'
              ? <Button variant="approve" icon={Lock} onClick={() => (block ? document.getElementById('prelock-checklist')?.focus() : setDlg('lock'))}>Approve lock</Button>
              : waiting(open)
                ? <Badge tone="info">Sent for approval</Badge>
                : <Button variant="primary" icon={Send} onClick={() => (block ? document.getElementById('prelock-checklist')?.focus() : setDlg('send'))}>Send for approval</Button>}
          </>
        ) : undefined}
      >
        {open && (live(open) ? (
          <div className="yx-tim-stack">
            {waiting(open) && sentOn && <p className="yx-tim-muted">Sent for approval by {HR_ADMIN.name} on {dm(sentOn)}.</p>}
            <ul id="prelock-checklist" tabIndex={-1} className="yx-tim-check">
              <CheckRow label="Attendance exceptions resolved">{fixRow(open, c.exceptions, `${c.exceptions} open`, 'danger', 'Resolve exceptions', FIX_STORY.exceptions, onePerson(open.m, (x) => x.blocking && x.status === 'Open'))}</CheckRow>
              <CheckRow label="Attendance requests decided">{fixRow(open, c.attReq, `${c.attReq} pending`, 'danger', 'Open in exceptions', FIX_STORY.exceptions, onePerson(open.m, (x) => x.status === 'Request pending'))}</CheckRow>
              <CheckRow label="Leave requests for the month decided (does not block)">{fixRow(open, c.leave, `${c.leave} pending`, 'warning', 'Open leave calendar', FIX_STORY.leave)}</CheckRow>
              <CheckRow label="OT approved or rejected (does not block)">{fixRow(open, c.ot, `${c.ot} pending`, 'warning', 'Review OT', FIX_STORY.ot)}</CheckRow>
              <CheckRow label="Timesheets approved (does not block)">{fixRow(open, c.timesheets, `${c.timesheets} missing`, 'warning', 'Open timesheets', FIX_STORY.timesheets)}</CheckRow>
              <CheckRow label="Device batches synced">{zero(open)}</CheckRow>
              <CheckRow label="Night-shift register generated (Hosur)">{daysUntil(freezeDate(open), today) < 0 ? <Badge tone="success">Done</Badge> : <Badge tone="neutral">At month end</Badge>}</CheckRow>
            </ul>
            {(c.ot > 0 || c.leave > 0) && (
              <p className="yx-tim-muted">
                {[c.ot > 0 && plural(c.ot, 'OT claim'), c.leave > 0 && plural(c.leave, 'leave request')].filter(Boolean).join(' and ')} not decided by the lock
                {' '}{c.ot + c.leave === 1 ? 'is' : 'are'} settled in {MONTH[(open.m + 1) % 12]} payroll.
              </p>
            )}
          </div>
        ) : (
          <ul className="yx-tim-check">
            <li><span>Lock</span><span>{lockedText(open)}</span></li>
            <li><span>Checklist</span><Badge tone="success">All items done</Badge></li>
            <li><span>Payslips</span><span>{open.payslipsPublished ? 'Published' : 'Not published'}</span></li>
            <li><span>Bank file</span><span>{open.bankReleased ? 'Released' : 'Not released'}</span></li>
            <li><span>PF and ESI returns</span><span>{open.filedOn ? `Filed ${dm(open.filedOn)}` : 'Not filed'}</span></li>
            <li><span>Reopen</span><span className="yx-tim-muted">{canReopen(open).ok ? 'Allowed until payslips are published' : `Not allowed. ${canReopen(open).reason}`}</span></li>
          </ul>
        ))}
      </Drawer>
      {open && (
        <ConfirmDialog
          open={dlg === 'send'}
          onOpenChange={(o) => !o && setDlg(undefined)}
          title={`Send ${monthName(open)} for payroll approval?`}
          consequence={`${PAYROLL_ADMIN.name} approves the lock. Until then, inputs for ${MONTH[open.m]} stay frozen.`}
          confirmLabel="Send for approval"
          onConfirm={() => { setSentOn(dayStart(today)); setDlg(undefined); }}
        />
      )}
      {open && (
        <ConfirmDialog
          open={dlg === 'lock'}
          onOpenChange={(o) => !o && setDlg(undefined)}
          title={`Approve lock · ${monthName(open)}`}
          consequence={`Attendance and pay-affecting leave for ${MONTH[open.m]} can't be changed after this; fixes become late requests paid in ${MONTH[(open.m + 1) % 12]} payroll. You'll be asked to confirm it's you.`}
          // Same name and colour as the drawer's button: an approval is green (R7). Founder (29 Oct 2026): a plain confirm and the authenticator step.
          confirmLabel="Approve lock"
          confirmVariant="approve"
          onConfirm={() => { setLockedIds([...lockedIds, open.id]); setDlg(undefined); setOpen(null); }}
        />
      )}
      {open && dlg === 'open_again' && (
        <ReopenDialog
          kind="open_again"
          name={monthName(open)}
          check={{ ok: true }}
          minLength={10}
          onClose={() => { setDlg(undefined); setOpen(null); }}
          onSend={() => {
            setOpenedIds([...openedIds, open.id]);
            setSentOn(null);
            toast({ tone: 'success', title: `${monthName(open)} is open again`, description: 'Fixes and requests can change it. Freeze it again before it is locked.' });
          }}
        />
      )}
      {open && dlg === 'reopen' && (
        <ReopenDialog
          name={monthName(open)}
          check={canReopen(open)}
          onClose={() => { setDlg(undefined); setOpen(null); }}
          onSend={() => toast({ tone: 'success', title: 'Reopen request sent', description: `${PAYROLL_ADMIN.name} and the System Admin decide next. ${MONTH[open.m]} stays locked until both approve.` })}
        />
      )}
    </TimePage>
  );
}

/**
 * Sent, it closes and says so with a toast (the live page's write toasts; the story toasts here). `open_again`: HR opens a
 * month it froze (founder decision 7a, 29 Oct 2026): a reason, then the authenticator code, like Lock.
 */
function ReopenDialog({ name, check, minLength = 1, onSend, onClose, kind = 'reopen' }: { name: string; check: { ok: boolean; reason?: string }; minLength?: number; onSend: (reason: string) => unknown; onClose: () => void; kind?: 'reopen' | 'open_again' }) {
  const again = kind === 'open_again';
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const early = useTooEarly(reason.trim().length < minLength ? [{ fieldId: 'reopen-why', message: minLength > 1 ? `Give the reason in a sentence (at least ${minLength} letters).` : 'Enter a reason' }] : []);
  const footer = check.ok ? (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button
        variant="danger"
        icon={Unlock}
        loading={busy === 'send'}
        onClick={() => {
          if (early.stop()) return;
          void run('send', async () => {
            await onSend(reason.trim());
            onClose();
          });
        }}
      >
        {again ? 'Open the month again' : 'Send reopen request'}
      </Button>
    </>
  ) : <Button onClick={onClose}>Close</Button>;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={again ? `Open ${name} again?` : `Request reopen · ${name}`} footer={footer}>
      {!check.ok ? (
        <InlineAlert tone="danger" title="This period can't be reopened">{check.reason}</InlineAlert>
      ) : (
        <div className="yx-tim-stack">
          {error && <InlineAlert tone="danger" title={again ? 'Not opened' : 'Not sent'}>{error}</InlineAlert>}
          {again ? (
            <p>The month goes back to open: fixes and requests can change its days again. If it was sent to payroll, it comes back to you. Freeze it again before it is locked. You'll be asked for your authenticator code.</p>
          ) : <p>Reopen is a high-risk request. It needs a payroll check, then Finance or a System Admin, and you can't approve your own request. Once approved, the month's frozen payroll figures are set aside (kept for the record).</p>}
          <FormField id="reopen-why" label="Reason" required error={early.errorOf('reopen-why')}><TextArea rows={3} value={reason} onChange={setReason} maxLength={500} /></FormField>
        </div>
      )}
    </Dialog>
  );
}

/* =====================================================================
   TIM-37 · Industrial-action event (HR only: pay terms are shown)
   ===================================================================== */

type IaType = 'strike' | 'lockout' | 'layoff';
type Legality = 'legal' | 'illegal' | 'undetermined';
const IA_LABEL: Record<IaType, string> = { strike: 'Strike', lockout: 'Lockout', layoff: 'Lay-off' };
const LEGALITY: { value: Legality; label: string }[] = [{ value: 'legal', label: 'Legal' }, { value: 'illegal', label: 'Illegal' }, { value: 'undetermined', label: 'Undetermined' }];
const IA_GROUPS = [{ value: 'line', label: 'Operations · Line workers', count: 120 }, { value: 'maint', label: 'Operations · Maintenance', count: 14 }];

/** The pay part only; the attendance part is said once by the caller. */
function payText(type: IaType, legality: Legality, days: number) {
  if (legality === 'undetermined') return 'on hold while legality is undetermined';
  if (type === 'layoff') return legality === 'legal' ? `lay-off pay of 50% of basic pay + dearness allowance for ${plural(days, 'day')}` : 'full wages, because the lay-off is not legal';
  if (type === 'lockout' && legality === 'illegal') return 'full wages, because the lockout is not legal';
  return 'none for these days';
}
const payLine = (type: IaType, legality: Legality, days: number) => `Pay: ${payText(type, legality, days)}.`;
/** Payroll row beside its label: no "Pay:" prefix and no full stop, like the other rows. */
const payRow = (type: IaType, legality: Legality, days: number) => { const t = payText(type, legality, days); return t[0].toUpperCase() + t.slice(1); };

const payKpi = (type: IaType, legality: Legality) =>
  legality === 'undetermined' ? 'On hold' : type === 'layoff' ? (legality === 'legal' ? '50% of basic + allowance' : 'Full wages') : type === 'lockout' && legality === 'illegal' ? 'Full wages' : 'Unpaid';

const iaDays = (from: Date | null, to: Date | null) => (from && to ? daysUntil(to, from) + 1 : 0);
/** One date check for the form and the Edit dates dialog. */
const iaDateError = (from: Date | null, to: Date | null) => (!from || !to ? 'Pick both dates' : iaDays(from, to) < 1 ? 'To must be on or after From' : null);

/** One row of the past-events list (decision 7b, 29 Oct 2026). */
interface IaListRow { id: string; kind: IaType; from: Date; to: Date; days: number; place: string; group: string; workers: number; legality: Legality; status: 'active' | 'cancelled' }
const LEGALITY_LABEL: Record<Legality, string> = { legal: 'Legal', illegal: 'Illegal', undetermined: 'Undetermined' };
const IA_LIST_STORY = 'screens-time-tim-37-·-industrial-action-event--list';

/** "Past strikes and lockouts": every event in scope, newest first, 25 / 50 / 100 a page (server paging when live). */
function IndustrialActionList({ rows, state, onRetry, total, page, pageSize, onPage, onPageSize, openHref, recordHref }: {
  rows: IaListRow[]; state: 'ready' | 'loading' | 'error'; onRetry?: () => void;
  total: number; page: number; pageSize: number; onPage: (page: number) => void; onPageSize: (size: number) => void;
  openHref: (row: IaListRow) => string; recordHref: string;
}) {
  const record = <Button variant="primary" asChild><a href={recordHref} target="_top">Record event</a></Button>;
  const cols: TableColumn<IaListRow>[] = [
    { key: 'kind', header: 'Type', value: (r) => IA_LABEL[r.kind] },
    { key: 'dates', header: 'Dates', type: 'date', value: (r) => r.from.getTime(), render: (r) => (r.days === 1 ? dm(r.from) : `${dm(r.from)} – ${dm(r.to)}`) },
    { key: 'days', header: 'Days', type: 'number', value: (r) => r.days },
    { key: 'place', header: 'Establishment', value: (r) => r.place },
    { key: 'workers', header: 'Workers', value: (r) => r.workers, render: (r) => `${r.group} · ${plural(r.workers, 'worker')}` },
    { key: 'legality', header: 'Legality', type: 'status', value: (r) => LEGALITY_LABEL[r.legality], statusTone: (v) => (v === 'Undetermined' ? 'warning' : 'neutral') },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.status === 'cancelled' ? 'Cancelled' : 'Active'), statusTone: (v) => (v === 'Active' ? 'info' : 'neutral') },
  ];
  return (
    <TimePage active="Requests" user={HR_ADMIN}>
      <PageHeader title="Industrial action" description="Past strikes, lockouts and lay-offs at your establishments, newest first" actions={record} />
      <DataTable
        label="Past strikes and lockouts"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={onRetry}
        rowNoun={['event', 'events']}
        empty={<EmptyState title="No strikes, lockouts or lay-offs yet" description="Recorded events show here, newest first, with their legality and pay status." action={record} />}
        rowButtons={(r) => <Button size="sm" asChild><a href={openHref(r)} target="_top">Open</a></Button>}
      />
      {total > pageSize && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPage} onPageSizeChange={onPageSize} />}
    </TimePage>
  );
}

/** Sample events: the lay-off of the record story, an earlier strike and a cancelled lockout (Hosur plant). */
const IA_SAMPLE: IaListRow[] = [
  { id: 'e1', kind: 'layoff', from: new Date(2026, 9, 5), to: new Date(2026, 9, 7), days: 3, place: 'Hosur plant (Tamil Nadu)', group: 'Operations · Line workers', workers: 120, legality: 'legal', status: 'active' },
  { id: 'e2', kind: 'lockout', from: new Date(2026, 7, 24), to: new Date(2026, 7, 24), days: 1, place: 'Hosur plant (Tamil Nadu)', group: 'Operations · Maintenance', workers: 14, legality: 'undetermined', status: 'cancelled' },
  { id: 'e3', kind: 'strike', from: new Date(2026, 6, 14), to: new Date(2026, 6, 15), days: 2, place: 'Hosur plant (Tamil Nadu)', group: 'Operations · Line workers', workers: 120, legality: 'illegal', status: 'active' },
];

function SampleIndustrialList({ state }: { state: 'ready' | 'empty' | 'loading' }) {
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const rows = state === 'ready' ? IA_SAMPLE : [];
  return (
    <IndustrialActionList
      rows={rows}
      state={state === 'loading' ? 'loading' : 'ready'}
      total={rows.length}
      page={page}
      pageSize={pageSize}
      onPage={setPage}
      onPageSize={(n) => { setPageSize(n); setPage(1); }}
      openHref={(r) => storyHref(r.legality === 'undetermined' ? 'screens-time-tim-37-·-industrial-action-event--record-undetermined' : 'screens-time-tim-37-·-industrial-action-event--record')}
      recordHref={storyHref('screens-time-tim-37-·-industrial-action-event--form')}
    />
  );
}

/** TIM-37 · Industrial action. The app passes `live` (Time › Industrial action); stories show the sample. */
export function IndustrialActionScreen(p: { view?: 'form' | 'record' | 'list'; legality?: Legality; /** The list's state (view "list"). */ listState?: 'ready' | 'empty' | 'loading'; live?: LiveIndustrialAction }) {
  if (p.live) return <LiveIndustrialActionScreen live={p.live} />;
  return p.view === 'list' ? <SampleIndustrialList state={p.listState ?? 'ready'} /> : <SampleIndustrialAction view={p.view} legality={p.legality} />;
}

function SampleIndustrialAction({ view = 'form', legality = 'undetermined' }: { view?: 'form' | 'record'; legality?: Legality }) {
  const startType: IaType = view === 'record' ? 'layoff' : 'strike';
  const startFrom = new Date(2026, 9, 5);
  const startTo = new Date(2026, 9, 7);
  const [type, setType] = useState<IaType>(startType);
  const [from, setFrom] = useState<Date | null>(startFrom);
  const [to, setTo] = useState<Date | null>(startTo);
  const [group, setGroup] = useState('line');
  const [leg, setLeg] = useState<Legality>(legality);
  // When legality was last set: the record story's legal status was checked on 28 Sep, the day of the notice.
  const [setOn, setSetOn] = useState<Date | null>(view === 'record' && legality !== 'undetermined' ? new Date(2026, 8, 28) : null);
  const [notice, setNotice] = useState(view === 'record' ? 'Lay-off notice dated 28 Sep 2026' : '');
  const [confirm, setConfirm] = useState(false);
  const [recorded, setRecorded] = useState(view === 'record');
  // Pressed too early, the missing part says so (never a disabled button).
  const [tried, setTried] = useState(false);
  const g = IA_GROUPS.find((x) => x.value === group) ?? IA_GROUPS[0];
  const count = g.count;
  const days = iaDays(from, to);
  const dateErr = iaDateError(from, to);
  const block = dateErr ? (from && to ? 'Fix the dates' : dateErr) : !notice.trim() ? 'Enter the notice reference' : null;
  if (recorded && from && to)
    return (
      <IndustrialActionRecord
        type={type} from={from} to={to} count={count} group={g.label} notice={notice} legality={leg} setOn={setOn}
        onLegality={(l) => { setLeg(l); setSetOn(l === 'undetermined' ? null : dayStart(TODAY)); }}
        onDates={(f, t) => { setFrom(f); setTo(t); }}
        listHref={storyHref(IA_LIST_STORY)}
      />
    );
  return (
    <TimePage active="Requests" user={HR_ADMIN}>
      <PageHeader title="Record industrial action" description="Strike, lockout or lay-off at one establishment" />
      <div className="yx-tim-form">
        <FormField label="Type" required>
          <Segment label="Type" value={type} onChange={setType} options={(Object.keys(IA_LABEL) as IaType[]).map((k) => ({ value: k, label: IA_LABEL[k] }))} />
        </FormField>
        <FormField label="Establishment" required><Select value="h" onChange={() => {}} options={[{ value: 'h', label: 'Hosur plant (Tamil Nadu)' }]} /></FormField>
        <FieldRow>
          <FormField label="From" required><DatePicker value={from} onChange={setFrom} /></FormField>
          <FormField label="To" required error={from && to && days < 1 ? 'To must be on or after From' : null}><DatePicker value={to} onChange={setTo} min={from ?? undefined} /></FormField>
        </FieldRow>
        <FormField label="Workers affected" required helper={`${count} workers selected`}>
          <Select value={group} onChange={(v) => v && setGroup(v)} options={IA_GROUPS.map((x) => ({ value: x.value, label: `${x.label} (${x.count})` }))} />
        </FormField>
        <FormField label="Legality" required>
          <Segment label="Legality" value={leg} onChange={setLeg} options={LEGALITY} />
        </FormField>
        <FormField label="Notice reference" required error={tried && !notice.trim() ? 'Enter the notice reference' : null}><TextField value={notice} onChange={setNotice} placeholder="For example: notice dated 21 Sep 2026" /></FormField>
        <section className="yx-tim-effect" aria-live="polite">
          <strong>Effect</strong>
          <p className="yx-tim-muted">
            {count} workers × {plural(Math.max(days, 0), 'day')} marked {IA_LABEL[type]}, not absence or leave. {payLine(type, leg, days)}
          </p>
        </section>
        <div className="yx-tim-stack">
          {block && <p className="yx-tim-muted">{block}</p>}
          <div className="yx-tim-row">
            {/* Cancel goes back to the list of past events. */}
            <Button asChild><a href={storyHref(IA_LIST_STORY)} target="_top">Cancel</a></Button>
            <Button variant="primary" onClick={() => (block ? setTried(true) : setConfirm(true))}>Record event</Button>
          </div>
        </div>
      </div>
      {from && to && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Mark ${count} workers as ${IA_LABEL[type]} for ${range(from, to)}?`}
          consequence={`Their attendance for these days changes to "${IA_LABEL[type]}", not absence or leave. ${payLine(type, leg, days)}`}
          confirmLabel="Record event"
          onConfirm={() => { setConfirm(false); setSetOn(leg === 'undetermined' ? null : dayStart(TODAY)); setRecorded(true); }}
        />
      )}
    </TimePage>
  );
}

function IndustrialActionRecord({ type, from, to, count, group, notice, legality, setOn, onLegality, onDates, place = 'Hosur plant', today: now = TODAY, onCancel, cancelled: cancelledStart = false, links, listHref }: {
  type: IaType; from: Date; to: Date; count: number; group: string; notice: string; legality: Legality; setOn: Date | null;
  /** Back to the list of past events (decision 7b). */
  listHref?: string;
  /** The live record awaits the server; a refusal stays in the dialog. */
  onLegality: (l: Legality) => void | Promise<unknown>; onDates: (from: Date, to: Date) => void | Promise<unknown>;
  /** Live: the establishment, today, cancelling on the server and the app's links. */
  place?: string; today?: Date; onCancel?: () => Promise<unknown>; cancelled?: boolean; links?: { people: string; muster: string };
}) {
  const TODAY = now;
  const [confirm, setConfirm] = useState(false);
  // A legal decision needs an explicit pick: nothing is pre-selected.
  const [next, setNext] = useState<Legality | null>(null);
  const [tried, setTried] = useState(false);
  const [editing, setEditing] = useState(false);
  const [eFrom, setEFrom] = useState<Date | null>(from);
  const [eTo, setETo] = useState<Date | null>(to);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [cancelled, setCancelled] = useState(cancelledStart);
  const { busy: saving, error: saveError, run: runSave } = useRun();
  const days = iaDays(from, to);
  const workerDays = count * days;
  const label = IA_LABEL[type];
  const started = daysUntil(from, TODAY) <= 0;
  const ended = daysUntil(to, TODAY) < 0;
  const unset = legality === 'undetermined';
  const legText = unset ? 'Legality: undetermined' :`Legality: ${LEGALITY.find((l) => l.value === legality)?.label}${setOn ? `, set ${dm(setOn)}` : ''}`;
  // Days already started can't be rewritten: an upcoming event can't start in the past, and a running one keeps its start.
  const editErr =
    iaDateError(eFrom, eTo) ??
    (!started && eFrom && dayStart(eFrom) < dayStart(TODAY) ? 'Start date has passed'
      : started && eTo && dayStart(eTo) < dayStart(TODAY) ? 'End date has passed' : null);
  const changeText =
    !next
      ? 'Pick a legality to see the effect on pay.'
      : next === 'undetermined'
        ? `Pay for ${workerDays} worker-days is held while legality is undetermined.`
        : `${workerDays} worker-days are recalculated. ${payLine(type, next, days)}`;
  const openLegality = () => { setNext(null); setTried(false); setConfirm(true); };
  return (
    <TimePage active="Requests" user={HR_ADMIN}>
      <PageHeader
        title={`${label} · ${place}`}
        status={
          <span className="yx-tim-row">
            {/* An upcoming event shows only "Starts in …"; the status badge is for the other states. */}
            {!started && !cancelled ? <DueBadge date={from} prefix="Starts" /> : <Badge tone="neutral">{cancelled ? 'Cancelled' : ended ? 'Ended' : 'In progress'}</Badge>}
          </span>
        }
        description={`${range(from, to)} · ${count} workers · ${legText}`}
        actions={(
          <>
            {listHref && <Button asChild><a href={listHref} target="_top">All events</a></Button>}
            {!cancelled && !ended && <Button onClick={() => { setEFrom(from); setETo(to); setEditing(true); }}>Edit dates</Button>}
            {!cancelled && !ended && <Button onClick={() => setCancelAsk(true)}>Cancel event</Button>}
            {!cancelled && !unset && <Button onClick={openLegality}>Change legality</Button>}
          </>
        )}
      />
      {cancelled ? (
        <InlineAlert tone="info" title="Event cancelled">The {count} workers' days for {range(from, to)} are back to normal attendance.</InlineAlert>
      ) : unset ? (
        <InlineAlert tone="warning" title={`Pay for ${workerDays} worker-days is on hold while legality is undetermined`} actions={<Button size="sm" variant="primary" onClick={openLegality}>Set legality</Button>} />
      ) : null}
      {/* A cancelled event has no pay or attendance treatment left to show: only the alert and the muster. */}
      {!cancelled && (
        <>
          <Kpis items={[{ label: 'Workers affected', value: count, note: group }, { label: 'Days', value: days }, { label: 'Pay', value: payKpi(type, legality) }]} />
          <Card title="Pay and attendance treatment">
            <ul className="yx-tim-list">
              <li><span>Notice</span><span className="yx-tim-muted">{notice || 'Not entered'}</span></li>
              <li><span>Attendance</span><span className="yx-tim-muted">Days marked "{label}", not absence or leave; weekly offs inside stay weekly off</span></li>
              <li><span>Payroll</span><span className="yx-tim-muted">{payRow(type, legality, days)}</span></li>
              <li><span>Employee timeline</span><span className="yx-tim-muted">Event shown on each worker's record</span></li>
            </ul>
          </Card>
        </>
      )}
      <div className="yx-tim-row">
        {!cancelled && <Button asChild><a href={links?.people ?? storyHref('screens-people-ppl-01-·-directory--hr-employees')} target={links ? undefined : '_top'}>Open people directory</a></Button>}
        <Button asChild><a href={links?.muster ?? storyHref('screens-time-tim-02-·-muster--open')} target={links ? undefined : '_top'}>Open muster</a></Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={unset ? 'Set legality' : 'Change legality'}
        consequence={changeText}
        confirmLabel={unset ? 'Set legality' : 'Change legality'}
        onConfirm={async () => {
          setTried(true);
          if (!next || next === legality) return false;
          await onLegality(next);
          setConfirm(false);
        }}
      >
        <div className="yx-tim-stack">
          <FormField label="Legality" hideLabel error={tried && (!next || next === legality) ? 'Pick a legality.' : null}>
            <RadioGroup aria-label="Legality" value={next ?? ''} onChange={(v) => setNext(v as Legality)} options={LEGALITY.map((o) => ({ ...o, disabled: o.value === legality }))} />
          </FormField>
          {!next && !tried && <p className="yx-tim-muted">Pick a legality</p>}
        </div>
      </ConfirmDialog>
      <Dialog
        open={editing}
        onOpenChange={setEditing}
        title={`Edit dates · ${label}`}
        footer={
          <>
            {(editErr ?? saveError) && <FootReason>{editErr ?? saveError}</FootReason>}
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            {/* Never disabled: the reason shows beside the buttons. */}
            <Button variant="primary" loading={saving === 'dates'} onClick={() => { if (editErr || !eFrom || !eTo) return; void runSave('dates', async () => { await onDates(eFrom, eTo); setEditing(false); }); }}>Save dates</Button>
          </>
        }
      >
        <FieldRow>
          {started ? (
            <FormField label="From" helper="Already started, so the start stays"><p>{dm(from)}</p></FormField>
          ) : (
            <FormField label="From" required><DatePicker value={eFrom} onChange={setEFrom} min={dayStart(TODAY)} /></FormField>
          )}
          <FormField label="To" required error={eFrom && eTo && iaDays(eFrom, eTo) < 1 ? 'To must be on or after From' : null}>
            <DatePicker value={eTo} onChange={setETo} min={started ? dayStart(TODAY) : eFrom ?? undefined} />
          </FormField>
        </FieldRow>
      </Dialog>
      <ConfirmDialog
        open={cancelAsk}
        onOpenChange={setCancelAsk}
        title={`Cancel the ${label.toLowerCase()} for ${count} workers, ${range(from, to)}?`}
        consequence="Their days go back to normal attendance and the pay lines for this event are removed."
        confirmLabel="Cancel event"
        cancelLabel="Keep event"
        destructive
        onConfirm={async () => { if (onCancel) await onCancel(); setCancelled(true); setCancelAsk(false); }}
      />
    </TimePage>
  );
}

/* ---------- live: /time/industrial-action (TIM-37) ---------- */

/** HR (attendance.lock over the legal entity): record a strike, lockout or lay-off, then its record (legality, dates, cancel). */
export interface LiveIndustrialAction {
  state: LoadState;
  onRetry?: () => void;
  /** The form's establishments and their departments (form view). */
  options: IndustrialOptions | null;
  /** An event to show (record view); null: the form. */
  event: IndustrialEvent | null;
  onRecord: (input: IndustrialInput) => Promise<IndustrialEvent>;
  onLegality: (id: string, legality: Legality, version: number) => Promise<IndustrialEvent>;
  onDates: (id: string, from: string, to: string, version: number) => Promise<IndustrialEvent>;
  onCancel: (id: string, version: number) => Promise<IndustrialEvent>;
  links: { cancel: string; people: string; muster: string; /** The list of past events (decision 7b). */ list?: string };
  /** The page's landing view: past strikes and lockouts (decision 7b). Undefined on the form and record views. */
  list?: { data: IndustrialList | null; page: number; pageSize: number; onPage: (page: number) => void; onPageSize: (size: number) => void; openHref: (id: string) => string; recordHref: string };
}

function LiveIndustrialActionScreen({ live }: { live: LiveIndustrialAction }) {
  return live.list ? <LiveIndustrialList live={live} list={live.list} /> : <LiveIndustrialForm live={live} />;
}

function LiveIndustrialList({ live, list }: { live: LiveIndustrialAction; list: NonNullable<LiveIndustrialAction['list']> }) {
  const rows: IaListRow[] = (list.data?.events ?? []).map((e) => ({
    id: e.id, kind: e.kind, from: isoDay(e.from), to: isoDay(e.to), days: e.days,
    place: `${e.location.name}${STATE_NAME[e.location.state] ? ` (${STATE_NAME[e.location.state]})` : ''}`,
    group: e.department ? e.department.name : 'Everyone', workers: e.workers, legality: e.legality, status: e.status,
  }));
  if (live.state === 'no-access' || live.state === 'no-record')
    return <TimePage active="Requests" user={HR_ADMIN}><PageHeader title="Industrial action" /><LiveGate state={live.state} onRetry={live.onRetry} what="industrial action">{null}</LiveGate></TimePage>;
  return (
    <IndustrialActionList
      rows={rows}
      state={live.state === 'loading' ? 'loading' : live.state === 'error' ? 'error' : 'ready'}
      onRetry={live.onRetry}
      total={list.data?.total ?? 0}
      page={list.page}
      pageSize={list.pageSize}
      onPage={list.onPage}
      onPageSize={list.onPageSize}
      openHref={(r) => list.openHref(r.id)}
      recordHref={list.recordHref}
    />
  );
}

function LiveIndustrialForm({ live }: { live: LiveIndustrialAction }) {
  const [event, setEvent] = useState<IndustrialEvent | null>(live.event);
  useEffect(() => setEvent(live.event), [live.event]);
  const locations = live.options?.locations ?? [];
  const [type, setType] = useState<IaType>('strike');
  const [loc, setLoc] = useState<string | null>(null);
  const [group, setGroup] = useState<string>('all');
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [leg, setLeg] = useState<Legality>('undetermined');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [tried, setTried] = useState(false);
  const place = locations.find((l) => l.id === (loc ?? locations[0]?.id)) ?? null;
  const dept = place?.departments.find((x) => x.id === group) ?? null;
  const count = dept ? dept.people : (place?.people ?? 0);
  const days = iaDays(from, to);
  const dateErr = iaDateError(from, to);
  const block = !place ? 'Choose the establishment' : dateErr ? (from && to ? 'Fix the dates' : dateErr) : notice.trim().length < 3 ? 'Enter the notice reference' : null;
  if (event) {
    const ev = event;
    return (
      <IndustrialActionRecord
        type={ev.kind}
        from={isoDay(ev.from)}
        to={isoDay(ev.to)}
        count={ev.workers}
        group={ev.department ? ev.department.name : `Everyone at ${ev.location.name}`}
        notice={ev.notice}
        legality={ev.legality}
        setOn={ev.legalitySetAt ? new Date(ev.legalitySetAt) : null}
        place={`${ev.location.name}${STATE_NAME[ev.location.state] ? ` (${STATE_NAME[ev.location.state]})` : ''}`}
        today={isoDay(ev.today)}
        cancelled={ev.status === 'cancelled'}
        links={{ people: live.links.people, muster: live.links.muster }}
        listHref={live.links.list}
        onLegality={async (l) => setEvent(await live.onLegality(ev.id, l, ev.version))}
        onDates={async (f, t) => setEvent(await live.onDates(ev.id, isoOf(f), isoOf(t), ev.version))}
        onCancel={async () => setEvent(await live.onCancel(ev.id, ev.version))}
      />
    );
  }
  return (
    <TimePage active="Requests" user={HR_ADMIN}>
      <PageHeader title="Record industrial action" description="Strike, lockout or lay-off at one establishment" />
      <LiveGate state={live.state} onRetry={live.onRetry} what="industrial action">
        {!locations.length ? (
          <EmptyState title="No establishment in your scope" description="Recording industrial action needs attendance.lock for the legal entity." />
        ) : (
          <div className="yx-tim-form">
            <FormField label="Type" required>
              <Segment label="Type" value={type} onChange={setType} options={(Object.keys(IA_LABEL) as IaType[]).map((k) => ({ value: k, label: IA_LABEL[k] }))} />
            </FormField>
            <FormField id="ia-place" label="Establishment" required>
              <Select value={place?.id ?? null} onChange={(v) => { setLoc(v); setGroup('all'); }} options={locations.map((l) => ({ value: l.id, label: `${l.name}${STATE_NAME[l.state] ? ` (${STATE_NAME[l.state]})` : ''}` }))} />
            </FormField>
            <FieldRow>
              <FormField id="ia-from" label="From" required error={tried && !from ? 'Pick both dates' : null}><DatePicker value={from} onChange={setFrom} /></FormField>
              <FormField id="ia-to" label="To" required error={(tried && !to) ? 'Pick both dates' : from && to && days < 1 ? 'To must be on or after From' : null}><DatePicker value={to} onChange={setTo} min={from ?? undefined} /></FormField>
            </FieldRow>
            <FormField label="Workers affected" required helper={`${plural(count, 'worker')} selected`}>
              <Select value={group} onChange={(v) => v && setGroup(v)} options={[{ value: 'all', label: `Everyone at ${place?.name ?? ''} (${place?.people ?? 0})` }, ...(place?.departments ?? []).map((x) => ({ value: x.id, label: `${x.name} (${x.people})` }))]} />
            </FormField>
            <FormField label="Legality" required>
              <Segment label="Legality" value={leg} onChange={setLeg} options={LEGALITY} />
            </FormField>
            <FormField id="ia-notice" label="Notice reference" required error={tried && notice.trim().length < 3 ? 'Enter the notice reference' : null}><TextField value={notice} onChange={setNotice} placeholder="For example: notice dated 21 Sep 2026" maxLength={200} /></FormField>
            <section className="yx-tim-effect" aria-live="polite">
              <strong>Effect</strong>
              <p className="yx-tim-muted">
                {count} workers × {plural(Math.max(days, 0), 'day')} marked {IA_LABEL[type]}, not absence or leave. {payLine(type, leg, days)}
              </p>
            </section>
            <div className="yx-tim-stack">
              {block && <p className="yx-tim-muted">{block}</p>}
              <div className="yx-tim-row">
                <Button asChild><a href={live.links.cancel}>Cancel</a></Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!block) return setConfirm(true);
                    setTried(true);
                    document.getElementById(!place ? 'ia-place' : !from ? 'ia-from' : dateErr ? 'ia-to' : 'ia-notice')?.focus();
                  }}
                >
                  Record event
                </Button>
              </div>
            </div>
          </div>
        )}
      </LiveGate>
      {from && to && place && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Mark ${count} workers as ${IA_LABEL[type]} for ${range(from, to)}?`}
          consequence={`Their attendance for these days changes to "${IA_LABEL[type]}", not absence or leave. ${payLine(type, leg, days)}`}
          confirmLabel="Record event"
          onConfirm={async () => {
            setEvent(await live.onRecord({ kind: type, locationId: place.id, ...(dept ? { departmentId: dept.id } : {}), from: isoOf(from), to: isoOf(to), legality: leg, notice: notice.trim() }));
          }}
        />
      )}
    </TimePage>
  );
}
const STATE_NAME = IN_STATES;
