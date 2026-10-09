// Attendance requests, OT review, device backfill, periods, industrial action.
// TIM-07, TIM-08, TIM-09, TIM-10, TIM-11, TIM-37.
import { useState, type ReactNode } from 'react';
import { Check, Download, Lock, Send, Unlock, X } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { BottomSheet, ConfirmDialog, Dialog, TypeToConfirmDialog } from '../../components/overlay';
import { Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { RadioGroup } from '../../components/choice';
import { NumberField, TextArea, TextField, TimeField } from '../../components/inputs';
import { FieldRow, FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Stepper } from '../../components/stepper';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { MenuItem } from '../../components/menu';
import { Segment } from '../people/people-kit';
import { EXCEPTIONS, HOLIDAYS, HR_ADMIN, LATE_PAYROLL, LEAVE_REQUESTS, ME, OT_ROWS, PAYROLL_ADMIN, SEPTEMBER, TEAM, TODAY, isMyReport, timeCounts, type OtRow, type TimeUser } from './time-data';
import { DueBadge, Kpis, TimePage } from './time-kit';
import { canReopen, daysUntil, fmt12, fmtDuration, otCapFlag, regularisationRoute, type PeriodStage } from './time-logic';
import type { ViewState } from './attendance';
import './time.css';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "10 Sep": no leading zero. */
const dm = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;
const dmy = (d: Date) => `${dm(d)} ${d.getFullYear()}`;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "2 h" for whole hours, else "2 h 15 m". */
const dur = (min: number) => (min >= 60 && min % 60 === 0 ? `${min / 60} h` : fmtDuration(min));
const range = (from: Date, to: Date) => (from.getMonth() === to.getMonth() ? `${from.getDate()}–${dm(to)}` : `${dm(from)} – ${dm(to)}`);
const storyHref = (id: string, args?: string) => `/?path=/story/${id}${args ? `&args=${args}` : ''}`;
/**
 * Blocked reason on its own line above the footer buttons (drawer and dialog footers wrap). Width, not flex-basis:
 * in a stacked (column) phone footer a 100% basis is a height, and the reason must never widen the footer.
 */
const FootReason = ({ children }: { children: ReactNode }) => <span className="yx-tim-muted" style={{ width: '100%', minWidth: 0 }}>{children}</span>;

/* =====================================================================
   TIM-07 · Attendance request sheet (regularise / WFH / on-duty / OT pre-approval)
   ===================================================================== */

export type AttReqType = 'regularise' | 'wfh' | 'on_duty' | 'ot';

export interface AttendanceRequestProps {
  type?: AttReqType;
  /** Regularisations already used this month (limit 4, M02 Q5). */
  used?: number;
  /** WFH days already used this month (default: Divya's September calendar). */
  wfhUsed?: number;
  /** Start on a day in a locked month, so it goes as a late request (P08 Q4). */
  locked?: boolean;
  submitted?: boolean;
  surface?: 'desk' | 'phone';
  error?: boolean;
}

const TYPE_OPTIONS: { value: AttReqType; label: string }[] = [
  { value: 'regularise', label: 'Regularise' },
  { value: 'wfh', label: 'Work from home' },
  { value: 'on_duty', label: 'On duty' },
  { value: 'ot', label: 'OT pre-approval' },
];
/** Short labels keep the joined Segment on one line in a narrow drawer. */
const TYPE_SHORT: { value: AttReqType; label: string }[] = [
  { value: 'regularise', label: 'Regularise' },
  { value: 'wfh', label: 'WFH' },
  { value: 'on_duty', label: 'On duty' },
  { value: 'ot', label: 'OT' },
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
  return 'Batch release testing for the October launch';
}

/** Divya's weekly offs are Sundays and the 2nd and 4th Saturdays (SEPTEMBER). */
function dayType(d: Date) {
  if (HOLIDAYS.some((h) => h.date.toDateString() === d.toDateString())) return 'holiday';
  const wd = d.getDay();
  return wd === 0 || (wd === 6 && [2, 4].includes(Math.ceil(d.getDate() / 7))) ? 'weekly off' : 'normal day';
}

function useAttendanceRequest({ type: t0 = 'regularise', used = 1, wfhUsed = SEP_WFH, locked: lockedStart = false, error = false }: AttendanceRequestProps) {
  const [type, setTypeRaw] = useState<AttReqType>(t0);
  const [date, setDate] = useState<Date | null>(defaultDate(t0, lockedStart));
  const [fix, setFix] = useState(lockedStart ? 'full' : 'out');
  const [inT, setIn] = useState<string | null>(lockedStart ? '09:30' : RECORDED_IN);
  const [outT, setOut] = useState<string | null>(error ? null : '18:40');
  const [where, setWhere] = useState('Hosur plant');
  const [odFrom, setOdFrom] = useState<string | null>('08:30');
  const [odTo, setOdTo] = useState<string | null>('18:00');
  const [otHours, setOtHours] = useState<number | null>(2);
  const [takeAs, setTakeAs] = useState<'pay' | 'comp'>('pay');
  const [reason, setReason] = useState(defaultReason(t0, lockedStart));
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
  const wfhOffErr = type === 'wfh' && date && off !== 'normal day' ? `${WD[date.getDay()]} ${dm(date)} is ${off === 'holiday' ? `a holiday (${holidayName})` : 'your weekly off'}` : null;
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
      : (type === 'regularise' || type === 'on_duty') && ago > LATE_DAYS
        ? `Pick a date in the last ${LATE_DAYS} days`
        : type === 'on_duty' && -ago > OD_AHEAD
          ? `Pick a date in the next ${OD_AHEAD} days`
          : (type === 'ot' || type === 'wfh') && past
            ? 'Pick today or a later date'
            : nothing ?? wfhOffErr;
  const otMin = Math.round((otHours ?? 0) * 60);
  const otErr = type !== 'ot' ? null : !otHours ? 'Enter the planned hours' : otMin < 30 ? 'Enter at least 0.5 h' : otMin % 15 ? 'Use quarter hours (e.g. 1.25 or 1.5)' : null;
  const outErr = type !== 'regularise' || nothing ? null : !outT ? 'Enter the check-out time' : !inT || outT <= inT ? 'Enter a check-out time after check-in' : null;
  const odErr = type !== 'on_duty' ? null : !where.trim() ? 'Enter where you will be' : !odFrom || !odTo ? 'Enter the From and To times' : odTo <= odFrom ? 'Enter a To time after From' : null;
  const blocked = !date
    ? 'Pick a date'
    : dateErr ?? outErr ?? odErr ?? otErr ?? (!reason.trim() ? 'Enter a reason' : null);
  return { type, setType, date, setDate: pickDate, day, recIn, nothing, off, fix: fixNow, setFix, fixOptions, punched, inT, setIn, outT, setOut, where, setWhere, odFrom, setOdFrom, odTo, setOdTo, otHours, setOtHours, otMin, otErr, takeAs, setTakeAs, reason, setReason, route, steps, hr, locked, used, wfhUsed, wfhThisMonth, wfhOver, dateErr, outErr, odErr, blocked };
}
type ReqState = ReturnType<typeof useAttendanceRequest>;

const beforeText = (s: ReqState) =>
  s.type === 'regularise'
    ? s.locked ? 'Absent · unpaid' : s.nothing ? 'Nothing to fix' : s.day?.code === 'L' ? `Late · ${s.day.note ?? ''}` : s.fix === 'out' ? 'Missing check-out' : s.fix === 'in' ? 'Missing check-in' : s.fix === 'full' ? 'No punches' : 'Wrong time recorded'
    : s.type === 'ot' ? 'No OT approved' : 'Expected in office';

function AttendanceRequestForm({ s, surface }: { s: ReqState; surface?: 'desk' | 'phone' }) {
  const { type, date, fix, locked, otMin } = s;
  // While the times are incomplete, say what is missing instead of a half-filled result.
  const afterMissing = s.nothing ? 'Pick a day that needs fixing' : s.outErr ? 'Add the check-out time to see the result' : s.odErr ? 'Add the place and times to see the result' : s.otErr ? 'Add the planned hours to see the result' : null;
  const after =
    type === 'regularise'
      ? `Present ${s.inT ? fmt12(s.inT) : '…'} – ${s.outT ? fmt12(s.outT) : '…'}`
      : type === 'wfh'
        ? 'Work from home · counts as present'
        : type === 'on_duty'
          ? `On duty at ${s.where.trim() || '…'}, ${s.odFrom ? fmt12(s.odFrom) : '…'} – ${s.odTo ? fmt12(s.odTo) : '…'}`
          : s.takeAs === 'pay'
            ? `Up to ${dur(otMin)} OT · paid at 2× (${date ? dayType(date) : 'normal day'})`
            : `Up to ${dur(otMin)} OT · ${otMin >= 240 ? '1 day' : '0.5 day'} comp-off credit`;
  const approvers = s.steps.map((x) => (x === 'Manager' ? ME.manager : x)).join(' → ');
  // A fix for a day in the open month is paid this month only if it is approved before payroll closes.
  const payDeadline = (type === 'regularise' || type === 'on_duty') && !locked && !s.nothing && !!date && date.getMonth() === TODAY.getMonth() && dayStart(date) <= dayStart(TODAY);
  const lockedMonth = date ? MONTH[date.getMonth()] : '';
  const lateRule = `Days before 1 ${MON[MONTH_START.getMonth()]} go as a late request (up to ${LATE_DAYS} days back).`;
  const helper =
    locked
      ? `${lockedMonth} is locked, so this goes as a late request.`
      : type === 'regularise'
        ? lateRule
        : type === 'wfh'
          ? 'Pick the day you will work from home.'
          : type === 'on_duty'
            ? `Up to ${OD_AHEAD} days ahead. ${lateRule}`
            : 'Pick today or a later date.';
  const min = type === 'regularise' || type === 'on_duty' ? addDays(TODAY, -LATE_DAYS) : dayStart(TODAY);
  const max = type === 'regularise' ? dayStart(TODAY) : type === 'on_duty' ? addDays(TODAY, OD_AHEAD) : undefined;
  return (
    <div className="yx-tim-form">
      <FormField label="Request type" required>
        {surface === 'phone' ? (
          <Select value={type} onChange={(v) => v && s.setType(v)} options={TYPE_OPTIONS} />
        ) : (
          <Segment label="Request type" value={type} onChange={s.setType} options={TYPE_SHORT} />
        )}
      </FormField>
      <FormField label="Date" required error={s.dateErr} helper={helper}>
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
            <FormField label="Check-out" error={s.outErr}>
              <TimeField value={s.outT} onChange={s.setOut} placeholder="--:--" />
            </FormField>
          </FieldRow>
        </>
      )}
      {type === 'on_duty' && (
        <>
          <FormField label="Where" required><TextField value={s.where} onChange={s.setWhere} /></FormField>
          <FieldRow>
            <FormField label="From" required><TimeField value={s.odFrom} onChange={s.setOdFrom} placeholder="--:--" /></FormField>
            <FormField label="To" required error={s.odFrom && s.odTo && s.odTo <= s.odFrom ? 'Enter a To time after From' : null}><TimeField value={s.odTo} onChange={s.setOdTo} placeholder="--:--" /></FormField>
          </FieldRow>
        </>
      )}
      {type === 'ot' && (
        <FieldRow>
          <FormField label="Planned OT (hours)" required error={s.otHours ? s.otErr : null} helper="Min 0.5 h, in quarter hours"><NumberField decimals value={s.otHours} onChange={s.setOtHours} placeholder="e.g. 1.25" /></FormField>
          <FormField label="Take as">
            <Select value={s.takeAs} onChange={(v) => v && s.setTakeAs(v)} options={[{ value: 'pay', label: 'Paid overtime' }, { value: 'comp', label: 'Comp-off credit' }]} />
          </FormField>
        </FieldRow>
      )}
      <FormField label="Reason" required>
        <TextArea rows={2} value={s.reason} onChange={s.setReason} />
      </FormField>
      <section className="yx-tim-effect" aria-live="polite" aria-label="Effect before you send">
        <strong>Effect on {date ? dmy(date) : 'the day'}</strong>
        <div className="yx-tim-effect__line"><span className="yx-tim-muted">Now</span><Badge tone={locked && type === 'regularise' ? 'danger' : 'neutral'}>{beforeText(s)}</Badge></div>
        <div className="yx-tim-effect__line"><span className="yx-tim-muted">After</span>{afterMissing ? <Badge tone="neutral">{afterMissing}</Badge> : <Badge tone="success">{after}</Badge>}</div>
        {type === 'wfh' && date && (
          <p className="yx-tim-muted">
            {s.wfhOver
              ? `This would be WFH day ${s.wfhThisMonth + 1} of ${WFH_LIMIT} in ${MONTH[date.getMonth()]}, so HR approves too.`
              : `This will be WFH day ${s.wfhThisMonth + 1} of ${WFH_LIMIT} in ${MONTH[date.getMonth()]}.`}
          </p>
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

export function AttendanceRequestSheet(p: AttendanceRequestProps) {
  const [open, setOpen] = useState(true);
  const [sent, setSent] = useState(!!p.submitted);
  const [withdrawn, setWithdrawn] = useState(false);
  const [askWithdraw, setAskWithdraw] = useState(false);
  const s = useAttendanceRequest(p);
  const close = () => setOpen(false);
  const send = <Button variant="primary" disabled={!!s.blocked} onClick={() => setSent(true)}>Send request</Button>;
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
      <InlineAlert tone="success" title={`Sent to ${ME.manager}${s.hr ? ', then HR' : ''}`}>
        {day} shows "{s.type === 'regularise' ? 'Regularisation pending' : 'Request pending'}" until it's decided. You'll get a notification.
      </InlineAlert>
      <ApprovalTimeline now={TODAY} steps={steps} />
    </div>
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
const dayName = (i: number) => { const d = dayDate(i); return `${WD[d.getDay()]} ${dm(d)}`; };
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

export function ShiftSwapSheet({ view = 'request', surface = 'desk', blocked }: { view?: 'request' | 'consent' | 'accepted'; surface?: 'desk' | 'phone'; blocked?: 'rest' | 'night' }) {
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
            <span className="yx-tim-row">{dayName(i)} · {shiftLabel(w)}{h && <Badge tone="neutral">Holiday · {h.name}</Badge>}</span>
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
      tone="success"
      title={`Sent to ${firstName(x.take >= 0 ? x.name : APPROVER)} · ${dayName(x.give)}`}
      actions={<Button size="sm" onClick={() => setSent(sent.filter((y) => y.give !== x.give))}>Withdraw</Button>}
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
            <p className="yx-tim-muted">If sent, needs approval by {WD[approveBy.getDay()]} {dm(approveBy)}.</p>
          ) : (
            <div className="yx-tim-row">
              <span className="yx-tim-muted">Needs approval by {WD[approveBy.getDay()]} {dm(approveBy)}</span>
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
          <span className="yx-tim-muted">Reply by {WD[replyBy.getDay()]} {dm(replyBy)}</span>
          <DueBadge date={replyBy} />
        </div>
        {agreed && <InlineAlert tone="success" title="You agreed">{APPROVER} decides next. Your roster changes only after approval.</InlineAlert>}
        {!agreed && <p className="yx-tim-note">Saying no has no effect on you. {firstName(REQUESTER.name)} only sees "declined".</p>}
      </div>
    );
  const phone = surface === 'phone';
  const sendButton = (
    <Button
      variant="primary"
      disabled={!!sendBlock}
      onClick={() => {
        if (kind === 'swap' && c && plan) setSent([...sent, { give, take: plan.take, name: c.name }]);
        else if (kind === 'change') setSent([...sent, { give, take: -1, name: APPROVER, shift: newShift }]);
        setOpen(false);
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
      <><Button icon={X} onClick={() => setOpen(false)}>Decline</Button><Button variant="approve" icon={Check} onClick={() => setAgreed(true)}>Agree to swap</Button></>
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

export function OtReviewScreen({ persona = 'mgr', manager = ME.name, state = 'ready', action }: { persona?: 'mgr' | 'hr'; /** Manager whose reports are shown (default the signed-in manager). */ manager?: string; state?: ViewState; action?: 'override' | 'comp' }) {
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
  const user = persona === 'hr' ? HR_ADMIN : manager === PLANT_HEAD.name ? PLANT_HEAD : ME;
  const setStatus = (ids: string[], status: OtRow['status']) => { setRows(rows.map((r) => (ids.includes(r.id) ? { ...r, status } : r))); setSel([]); };
  const open = (r: OtRow, m: 'override' | 'comp') => { setMode(m); setReason(''); setDlg(r); };
  const askReject = (ids: string[]) => { setRejReason(''); setRej(ids); };
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
              disabled={needReason && !reason.trim()}
              onClick={() => { if (dlg) setStatus([dlg.id], mode === 'comp' ? 'Comp-off' : 'Approved'); setDlg(null); }}
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
              <FormField label="Reason" required><TextArea rows={3} value={reason} onChange={setReason} placeholder="For example: emergency line breakdown, plant head approved" /></FormField>
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
            <Button variant="danger" disabled={!rejReason.trim()} onClick={() => { if (rej) setStatus(rej, 'Rejected'); setRej(null); }}>Reject overtime</Button>
          </>
        }
      >
        <div className="yx-tim-stack">
          <p className="yx-tim-muted">{rejRows.length === 1 ? otFacts(rejRows[0]) : `${rejRows.length} entries · ${fmtDuration(rejRows.reduce((a, r) => a + r.otMin, 0))} of overtime`}</p>
          <p>These hours are not paid. The employee sees your reason.</p>
          <FormField label="Reason" required><TextArea rows={3} value={rejReason} onChange={setRejReason} placeholder="For example: work could wait until the next shift" /></FormField>
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
  const csv = ['Employee,Date,Change', ...BACKFILL_CHANGES.map((c) => `${c.name},${dmy(c.date)},"${c.change}"`)].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'BKF-0917-changes.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function DeviceBackfillWizard({ current = 'batch', done = false }: { current?: string; done?: boolean }) {
  const [applied, setApplied] = useState(done);
  const [reason, setReason] = useState('Gate 1 kiosk lost network 14–17 Sep; the network was restored on 18 Sep and the stored punches synced on 28 Sep.');
  const effects = '6 absent → present · 2 late marks removed · 1 new late mark';
  const restored = BACKFILL_CHANGES.filter((c) => c.change.startsWith('Absent → Present'));
  const payNote = `Effects land in September payroll: ${plural(new Set(restored.map((c) => c.name)).size, 'person', 'people')} get pay back for ${plural(restored.length, 'absent day')}; 1 new late mark may lead to a deduction.`;
  if (applied)
    return (
      <TimePage active="Periods" user={HR_ADMIN}>
        <PageHeader title="Device punches applied" />
        <InlineAlert
          tone="success"
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
        onFinish={() => setApplied(true)}
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
                  <p>{range(BACKFILL_FROM, BACKFILL_TO)} {BACKFILL_TO.getFullYear()}</p>
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

export function PeriodsScreen({ persona = 'hr', openId, dialog, reopenable = false, after = false }: {
  persona?: 'hr' | 'pa'; openId?: string; dialog?: 'lock' | 'send' | 'reopen';
  /** September locked on 1 Oct with payroll not yet run, so it can still be reopened. Use with `after`. */
  reopenable?: boolean;
  /** 1 Oct: September's inputs are frozen and every item is done, so it can be locked. */
  after?: boolean;
}) {
  const today = after ? new Date(2026, 9, 1, 10, 0) : TODAY;
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const periods = PERIODS.map((p) =>
    (reopenable && p.id === 'sep') || lockedIds.includes(p.id) ? { ...p, stage: 'locked' as const, locked: { on: dayStart(today), by: PAYROLL_ADMIN.name } }
      : after && p.id === 'sep' ? { ...p, stage: 'frozen' as const } : p,
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
                {p.stage === 'locked' && (reopen.ok
                  ? <Button size="sm" icon={Unlock} onClick={() => { setOpen(p); setDlg('reopen'); }}>Request reopen</Button>
                  : <><Button size="sm" icon={Unlock} disabled>Request reopen</Button><span className="yx-tim-muted">{reopen.reason}</span></>)}
              </div>
            </Card>
          );
        })}
      </div>
      <Drawer
        open={!!open && dlg !== 'reopen'}
        onOpenChange={(o) => !o && setOpen(null)}
        // Wide enough that each checklist label, badge and fix button share one line on desktop.
        size="lg"
        title={open ? `${monthName(open)} · ${live(open) ? 'pre-lock checklist' : 'lock summary'}` : ''}
        footer={open && live(open) ? (
          <>
            {block && <FootReason>{block}</FootReason>}
            <Button onClick={() => setOpen(null)}>Close</Button>
            {persona === 'pa'
              ? <Button variant="approve" icon={Lock} disabled={!!block} onClick={() => setDlg('lock')}>Approve lock</Button>
              : waiting(open)
                ? <Button icon={Send} disabled>Sent for approval</Button>
                : <Button variant="primary" icon={Send} disabled={!!block} onClick={() => setDlg('send')}>Send for approval</Button>}
          </>
        ) : undefined}
      >
        {open && (live(open) ? (
          <div className="yx-tim-stack">
            {waiting(open) && sentOn && <p className="yx-tim-muted">Sent for approval by {HR_ADMIN.name} on {dm(sentOn)}.</p>}
            <ul className="yx-tim-check">
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
        <TypeToConfirmDialog
          open={dlg === 'lock'}
          onOpenChange={(o) => !o && setDlg(undefined)}
          title={`Approve lock · ${monthName(open)}`}
          consequence={`Attendance and pay-affecting leave for ${MONTH[open.m]} can't be changed after this; fixes become late requests paid in ${MONTH[(open.m + 1) % 12]} payroll.`}
          objectName={`KAVERI TN ${MON[open.m].toUpperCase()} 2026`}
          // Same name and colour as the drawer's button: an approval is green (R7), the typed confirmation stays.
          confirmLabel="Approve lock"
          confirmVariant="approve"
          onConfirm={() => { setLockedIds([...lockedIds, open.id]); setDlg(undefined); setOpen(null); }}
        />
      )}
      {open && dlg === 'reopen' && <ReopenDialog period={open} onClose={() => { setDlg(undefined); setOpen(null); }} />}
    </TimePage>
  );
}

function ReopenDialog({ period, onClose }: { period: Period; onClose: () => void }) {
  const check = canReopen(period);
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const footer = check.ok && !sent ? (
    <>
      {!reason.trim() && <FootReason>Enter a reason</FootReason>}
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="danger" icon={Unlock} disabled={!reason.trim()} onClick={() => setSent(true)}>Send reopen request</Button>
    </>
  ) : <Button onClick={onClose}>Close</Button>;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Request reopen · ${monthName(period)}`} footer={footer}>
      {!check.ok ? (
        <InlineAlert tone="danger" title="This period can't be reopened">{check.reason}</InlineAlert>
      ) : sent ? (
        <InlineAlert tone="success" title="Reopen request sent">{PAYROLL_ADMIN.name} and the System Admin decide next. {MONTH[period.m]} stays locked until both approve.</InlineAlert>
      ) : (
        <div className="yx-tim-stack">
          <p>Reopen is a high-risk request. It needs Payroll Admin and System Admin approval, and you can't approve your own request.</p>
          <FormField label="Reason" required><TextArea rows={3} value={reason} onChange={setReason} /></FormField>
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

export function IndustrialActionScreen({ view = 'form', legality = 'undetermined' }: { view?: 'form' | 'record'; legality?: Legality }) {
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
        <FormField label="Notice reference" required><TextField value={notice} onChange={setNotice} placeholder="For example: notice dated 21 Sep 2026" /></FormField>
        <section className="yx-tim-effect" aria-live="polite">
          <strong>Effect</strong>
          <p className="yx-tim-muted">
            {count} workers × {plural(Math.max(days, 0), 'day')} marked {IA_LABEL[type]}, not absence or leave. {payLine(type, leg, days)}
          </p>
        </section>
        <div className="yx-tim-stack">
          {block && <p className="yx-tim-muted">{block}</p>}
          <div className="yx-tim-row">
            {/* Cancel leaves the form for Time > Requests. */}
            <Button asChild><a href={storyHref('screens-time-tim-09-·-ot-review--hr')} target="_top">Cancel</a></Button>
            <Button variant="primary" disabled={!!block} onClick={() => setConfirm(true)}>Record event</Button>
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

function IndustrialActionRecord({ type, from, to, count, group, notice, legality, setOn, onLegality, onDates }: {
  type: IaType; from: Date; to: Date; count: number; group: string; notice: string; legality: Legality; setOn: Date | null;
  onLegality: (l: Legality) => void; onDates: (from: Date, to: Date) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  // A legal decision needs an explicit pick: nothing is pre-selected.
  const [next, setNext] = useState<Legality | null>(null);
  const [editing, setEditing] = useState(false);
  const [eFrom, setEFrom] = useState<Date | null>(from);
  const [eTo, setETo] = useState<Date | null>(to);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [cancelled, setCancelled] = useState(false);
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
  const openLegality = () => { setNext(null); setConfirm(true); };
  return (
    <TimePage active="Requests" user={HR_ADMIN}>
      <PageHeader
        title={`${label} · Hosur plant`}
        status={
          <span className="yx-tim-row">
            {/* An upcoming event shows only "Starts in …"; the status badge is for the other states. */}
            {!started && !cancelled ? <DueBadge date={from} prefix="Starts" /> : <Badge tone="neutral">{cancelled ? 'Cancelled' : ended ? 'Ended' : 'In progress'}</Badge>}
          </span>
        }
        description={`${range(from, to)} ${to.getFullYear()} · ${count} workers · ${legText}`}
        actions={cancelled ? undefined : (
          <>
            {!ended && <Button onClick={() => { setEFrom(from); setETo(to); setEditing(true); }}>Edit dates</Button>}
            {!ended && <Button onClick={() => setCancelAsk(true)}>Cancel event</Button>}
            {!unset && <Button onClick={openLegality}>Change legality</Button>}
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
        {!cancelled && <Button asChild><a href={storyHref('screens-people-ppl-01-·-directory--hr-employees')} target="_top">Open people directory</a></Button>}
        <Button asChild><a href={storyHref('screens-time-tim-02-·-muster--open')} target="_top">Open muster</a></Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={unset ? 'Set legality' : 'Change legality'}
        consequence={changeText}
        confirmLabel={unset ? 'Set legality' : 'Change legality'}
        confirmDisabled={!next || next === legality}
        onConfirm={() => { if (next) onLegality(next); setConfirm(false); }}
      >
        <div className="yx-tim-stack">
          <RadioGroup aria-label="Legality" value={next ?? ''} onChange={(v) => setNext(v as Legality)} options={LEGALITY.map((o) => ({ ...o, disabled: o.value === legality }))} />
          {!next && <p className="yx-tim-muted">Pick a legality</p>}
        </div>
      </ConfirmDialog>
      <Dialog
        open={editing}
        onOpenChange={setEditing}
        title={`Edit dates · ${label}`}
        footer={
          <>
            {editErr && <FootReason>{editErr}</FootReason>}
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" disabled={!!editErr} onClick={() => { if (eFrom && eTo) onDates(eFrom, eTo); setEditing(false); }}>Save dates</Button>
          </>
        }
      >
        <FieldRow>
          {started ? (
            <FormField label="From" helper="Already started, so the start stays"><p>{dmy(from)}</p></FormField>
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
        onConfirm={() => { setCancelled(true); setCancelAsk(false); }}
      />
    </TimePage>
  );
}
