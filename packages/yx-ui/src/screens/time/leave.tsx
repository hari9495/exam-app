// Leave for employees and managers. TIM-17 … TIM-25.
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Download, Minus, Plus } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Segment } from '../people/people-kit';
import { Button, IconButton } from '../../components/button';
import { Badge, DayDate, PersonLabel, Tag } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, Meter, NoAccessState } from '../../components/feedback';
import { BottomSheet, ConfirmDialog, Dialog } from '../../components/overlay';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Checkbox, RadioGroup } from '../../components/choice';
import { NumberField, TextArea } from '../../components/inputs';
import { ErrorSummary, FieldRow, FormField, useSaveErrors, useTooEarly } from '../../components/field';
import { MultiSelect, PersonPicker, Select } from '../../components/select';
import { DatePicker, DateRangePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { Calendar, TeamCalendar, type CalendarEvent, type TeamAbsence, type TeamDayDot, type TeamDotKind } from '../../components/calendar';
import { ApprovalTimeline, SYSTEM_ACTOR, Timeline, type TimelineItem } from '../../components/timeline';
import { useToast } from '../../components/notify';
import { formatDate, formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { LivePicker } from '../desk/service-form';
import { LEAVE_STATUS, LeaveStatusBadge } from './live/kit';
import { LeaveHistoryDrawer, type LeaveHistoryPage, type LeaveHistoryQuery } from './leave-history-live';
import type { ApplyForForm, HrBalances, HrLeaveHome, LeaveRequestDetailView, TeamLeaveHome, LeaveBalanceRow, LeaveInput, LeavePlan, LeaveRequestRow as LiveRequest, LedgerRow, LoadState, LongAbsenceCheck, LongAbsenceInput, LongAbsenceRow, MaternityCase, MyCompOff, MyEncashment, MyLeave, MyLeaveCard, PersonOption as LivePersonOption, TeamCalendar as LiveCalendarData } from './live/types';
import {
  BALANCES,
  CLAIM,
  COMP_OFF_REQUESTS,
  EL_ENCASH_MAX,
  EL_ENCASH_MIN_LEFT,
  HOLIDAYS,
  HR_ADMIN,
  LEAVE_REQUESTS,
  SENT_BACK_REQUEST,
  ME,
  NEGATIVE_BALANCES,
  ON_NOTICE,
  PERSON_BALANCES,
  TEAM,
  TEAM_ABSENCES,
  TEAM_MEMBERS,
  TODAY,
  balancesFor,
  managerOf,
  myReports,
  personOff,
  timeCounts,
  type CompOffRequest,
  type LeaveBalance,
  type LeaveRequestRow,
  type TimeUser,
} from './time-data';
import { DueBadge, Kpis, NoRecordState, TimePage } from './time-kit';
import { countLeaveDays, daysUntil, encashAmount, fmt12, fmtDuration, leaveWarnings, type Half } from './time-logic';
import { LoadingBlock, type ViewState } from './attendance';
import './time.css';

type LeavePersona = 'emp' | 'mgr' | 'hr';
type LeaveCode = 'CL' | 'EL' | 'SL' | 'CO' | 'LWP';
const holidayDates = HOLIDAYS.map((h) => h.date);
const ALT_SAT = [new Date(2026, 9, 10), new Date(2026, 9, 24)]; // 2nd / 4th Saturdays in October

/* ---------- small date helpers (local) ---------- */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const same = (a: Date, b: Date) => day0(a).getTime() === day0(b).getTime();
const TODAY0 = day0(TODAY);
/** "12 Oct 2026" (house date format). */
const dm = (d: Date) => formatDate(d);
/** "12 Oct 2026", "12 Oct 2026 – 13 Oct 2026" */
const span = (a: Date, b: Date) => (same(a, b) ? dm(a) : `${dm(a)} – ${dm(b)}`);
const first = (name: string) => name.split(' ')[0];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Chennai office weekly offs and holidays. */
const isOff = (d: Date) => d.getDay() === 0 || ALT_SAT.some((s) => same(s, d)) || holidayDates.some((h) => same(h, d));

const LEAVE_NAME: Record<string, string> = { CL: 'Casual leave', SL: 'Sick leave', EL: 'Earned leave', CO: 'Comp-off', LWP: 'Leave without pay' };
const leaveCodeOf = (name: string) => (Object.keys(LEAVE_NAME).find((k) => LEAVE_NAME[k] === name) ?? 'CL') as LeaveCode;
const memberName = (id: string) => TEAM_MEMBERS.find((m) => m.id === id)?.name ?? id;
/** The pending request of `person` that overlaps start–end (decided ids in `gone` no longer count). */
const pendingRequest = (person: string, start: Date, end: Date = start, gone: string[] = []) =>
  LEAVE_REQUESTS.find((r) => !gone.includes(r.id) && r.person === person && r.status === 'Pending' && day0(r.from) <= day0(end) && day0(r.to) >= day0(start));
const pendingFor = (person: string, start: Date, end: Date = start, gone: string[] = []) => !!pendingRequest(person, start, end, gone);

/** Links to other screens' stories (same pattern as roster.tsx and attendance.tsx). */
const storyHref = (id: string) => `/?path=/story/${id}`;
const STORY = {
  myLeave: 'screens-time-tim-17-·-leave-home--employee',
  leaveHomeHr: 'screens-time-tim-17-·-leave-home--hr',
  requests: 'screens-platform-inbox-requests--plt-04-waiting',
  calendarMgr: 'screens-time-tim-20-·-team-leave-calendar--manager',
  calendarHr: 'screens-time-tim-20-·-team-leave-calendar--hr',
  attendance: 'screens-time-extra-·-attendance-calendar--employee',
  negative: 'screens-time-tim-30-·-leave-reports--negative',
  certificate: 'screens-time-tim-19-·-leave-request-detail--manager',
  leaveCardHr: 'screens-time-tim-21-·-leave-card--hr',
  balanceGrid: 'screens-time-tim-21-·-leave-card--balance-grid',
};
function LinkButton({ to, size, fullWidth, children }: { to: string; size?: 'sm'; fullWidth?: boolean; children: ReactNode }) {
  return <Button size={size} fullWidth={fullWidth} asChild><a href={storyHref(to)} target="_top">{children}</a></Button>;
}
/**
 * Drawer footer. Wide: the other buttons, the reason, then the main action on the right.
 * Small phones (under 480px): one full-width column inside the padding, reason first, then the main action, then the rest,
 * so no button is pushed past the right edge.
 */
function DrawerFoot({ hint, main, rest }: { hint?: ReactNode; main?: ReactNode; rest?: ReactNode }) {
  const narrow = useMedia('(max-width: 479px)');
  if (!narrow) return <>{rest}{hint && <span className="yx-tim-muted">{hint}</span>}{main}</>;
  return (
    <div className="yx-tim-sheet-actions" style={{ width: '100%', minWidth: 0 }}>
      {hint && <span className="yx-tim-muted" style={{ textAlign: 'center' }}>{hint}</span>}
      {main}
      {rest}
    </div>
  );
}
/** Lets the text column take the row before the badges and buttons, so they wrap under it on phones. */
const MAIN = { flex: '1 1 16rem' };
/** Pending is information (neutral) until the leave starts within 3 days. */
const statusTone = (r: LeaveRequestRow) => (r.status === 'Approved' ? 'success' : r.status === 'Sent back' || (r.status === 'Pending' && daysUntil(r.from, TODAY) >= 0 && daysUntil(r.from, TODAY) <= 3) ? 'warning' : 'neutral');

/** Absences split into working-day pieces, so no leave sits on a holiday or weekly off (TIM-20). */
type Absence = { memberId: string; start: Date; end: Date; code: string; name?: string; pending?: boolean };
function workingSegments(a: Absence): Absence[] {
  const out: Absence[] = [];
  let cur = null as Absence | null;
  const name = memberName(a.memberId);
  for (let d = day0(a.start); d <= day0(a.end); d = addDays(d, 1)) {
    // Each person's own weekly offs (Hosur plant roster or office calendar) plus holidays.
    if (personOff(name, d) || holidayDates.some((h) => same(h, d))) {
      if (cur) out.push(cur);
      cur = null;
    } else if (cur) cur.end = d;
    else cur = { ...a, start: d, end: d };
  }
  if (cur) out.push(cur);
  return out;
}

/** Team-mates of `person` who are off between `from` and `to`: people with the same direct manager (Divya's team = her reports). */
function othersOff(person: string, from: Date, to: Date) {
  const lead = person === ME.name ? ME.name : managerOf(person);
  const scope = TEAM.filter((p) => p.reportsTo === lead && p.name !== person).map((p) => p.id);
  return TEAM_ABSENCES.filter((a) => scope.includes(a.memberId) && day0(a.start) <= day0(to) && day0(a.end) >= day0(from)).map((a) => ({
    name: memberName(a.memberId),
    text: `${memberName(a.memberId)} (${LEAVE_NAME[a.code] ?? a.code} ${span(a.start, a.end)})`,
  }));
}
const othersTitle = (n: number) => (n === 0 ? 'No one else in the team is off then' : `${plural(n, 'other')} in the team ${n === 1 ? 'is' : 'are'} off then`);
const othersLine = (list: { text: string }[], label = 'Also off') => (list.length === 0 ? 'No one else in the team is off then' : `${label}: ${list.map((o) => o.text).join(', ')}`);

/** "1 & 3 Oct · 2 days": an absence's working days, once per absence (holidays and weekly offs left out). */
function absenceDates(a: Absence, withDays = true) {
  const segs = workingSegments(a);
  const n = segs.reduce((t, s) => t + daysUntil(s.end, s.start) + 1, 0);
  const dates = segs.map((s) => span(s.start, s.end)).join(' & ');
  return withDays ? `${dates} · ${plural(n, 'day')}` : dates;
}

const certText = (c?: 'verified' | 'pending') => (c === 'verified' ? 'Medical certificate verified by HR' : 'Medical certificate attached · HR to verify');

/** Applied times for the sample requests (the data stores the day only). */
const APPLIED_AT: Record<string, [number, number]> = { lr1: [10, 42], lr2: [9, 15], lr3: [8, 5], lr4: [16, 30], lr5: [11, 10], lr6: [14, 20] };
const appliedAt = (r: LeaveRequestRow) => {
  const t = APPLIED_AT[r.id];
  return t ? new Date(r.applied.getFullYear(), r.applied.getMonth(), r.applied.getDate(), t[0], t[1]) : r.applied;
};

/** Payroll is locked up to August 2026; September is still open. */
const LOCKED_UNTIL = new Date(2026, 8, 1);
const monthName = (d: Date) => d.toLocaleDateString('en-IN', { month: 'long' });

/** Comp-off expiry and unpaid days (sample data the shared file keeps as text). */
const CO_EXPIRES = new Date(2026, 9, 14);
const LWP_DATES = [new Date(2026, 7, 21)];

/* =====================================================================
   Balance cards (shared by TIM-17 and TIM-21)
   ===================================================================== */

/** Balance cards; unpaid types show "taken this year" (YX-LV-14). */
export function BalanceCards({ compact, balances = BALANCES, person = ME.name, onViewPending, onUseCompOff, live }: { compact?: boolean; balances?: LeaveBalance[]; /** Whose balances: approved leave still ahead shows as "booked", not "used". */ person?: string; onViewPending?: () => void; onUseCompOff?: () => void; /** The app: the ledger's balances. */ live?: { balances: LiveBalance[]; onViewPending?: (leaveTypeId: string) => void } }) {
  if (live) return <LiveBalanceCards {...live} />;
  return (
    <div className={compact ? 'yx-tim-stack' : 'yx-tim-cards'}>
      {balances.map((b) => {
        const total = b.credited + (b.carried ?? 0);
        const bookedReqs = LEAVE_REQUESTS.filter((r) => r.person === person && r.status === 'Approved' && r.type === b.name && day0(r.from) > TODAY0);
        const booked = Math.min(b.taken, bookedReqs.reduce((t, r) => t + r.days, 0));
        // One rule on every card: the big number is what is free to apply for now (booked and pending days already off).
        // A comp-off "pending" is a claim still to be credited, so it doesn't reduce what's free.
        const free = b.code === 'CO' ? b.balance : b.balance - b.pending;
        // The whole year is credited on 1 Jan (see the ledger), so there is no "next credit" line.
        return (
          <Card key={b.code} title={b.name} actions={b.paid ? undefined : <Badge tone="neutral">Unpaid</Badge>}>
            {b.paid ? (
              <>
                <p className="yx-tim-big">{free} <span className="yx-tim-muted">{free === 1 ? 'day' : 'days'} available</span></p>
                {b.code !== 'CO' && <Meter label={`${b.name} taken`} value={b.taken} max={total || 1} valueText={booked > 0 ? `${b.taken} of ${total} taken or booked` : `${b.taken} of ${total} taken`} />}
                {b.code !== 'CO' && b.carried ? <p className="yx-tim-note">{b.credited} for 2026 + {b.carried} carried from 2025</p> : null}
                {booked > 0 && <p className="yx-tim-note">Booked {plural(booked, 'day')} · {bookedReqs.map((r) => span(r.from, r.to)).join(', ')}</p>}
                {b.pending > 0 && (
                  <div className="yx-tim-row">
                    <span className="yx-tim-muted">Pending {plural(b.pending, 'day')}</span>
                    {onViewPending && <Button size="sm" onClick={onViewPending}>View request</Button>}
                  </div>
                )}
                {b.code === 'CO' && b.balance > 0 && (
                  <>
                    <div className="yx-tim-row">
                      <span className="yx-tim-muted">Expires {dm(CO_EXPIRES)}</span>
                      <DueBadge date={CO_EXPIRES} />
                    </div>
                    {onUseCompOff && <div><Button size="sm" onClick={onUseCompOff}>Use comp-off</Button></div>}
                  </>
                )}
              </>
            ) : (
              <>
                <p className="yx-tim-big">{b.taken} <span className="yx-tim-muted">{b.taken === 1 ? 'day' : 'days'} taken this year</span></p>
                {b.code === 'LWP' && b.taken > 0 && <p className="yx-tim-note">{LWP_DATES.map(dm).join(', ')} · deducted in that month's pay</p>}
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* =====================================================================
   TIM-19 · Leave request view (drawer on desktop, inline on phone)
   ===================================================================== */

type ReqAction = 'withdraw' | 'cancel' | 'report' | 'approve' | 'sendback' | 'reject' | 'cancel_days' | 'extend';

/* ---------- TIM-19 · Cancel some days and Extend (batch A D12, answer 2311) ---------- */

const eachIso = (from: Date, to: Date) => { const out: string[] = []; for (let d = new Date(from); d <= to; d = addDays(d, 1)) out.push(ymd(d)); return out; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOfIso = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));

/**
 * Cancel some days of approved leave: a checklist of its leave days. The employee picks days not yet taken (days before
 * today are shown as taken) and it goes to the approver; HR (`hr`) may pick any day and must give a reason.
 */
export function CancelSomeDaysDrawer({ days, today, hr = false, approver = 'your manager', onSend, onClose }: { days: { on: string; portion: number }[]; today: string; hr?: boolean; approver?: string; onSend: (x: { days: string[]; reason: string }) => Promise<unknown>; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const open = days.filter((d) => hr || d.on >= today);
  const back = days.filter((d) => picked.includes(d.on)).reduce((s, d) => s + d.portion, 0);
  const errors = [
    ...(!picked.length ? [{ fieldId: 'cd-days', message: 'Pick at least one day to cancel.' }] : picked.length === days.length ? [{ fieldId: 'cd-days', message: 'That is every day of this leave. Use Ask to cancel instead.' }] : []),
    ...(reason.trim().length < (hr ? 10 : 3) ? [{ fieldId: 'cd-why', message: hr ? 'Give the reason in a sentence (at least 10 letters).' : 'Say why you are cancelling these days.' }] : []),
  ];
  const shown = useSaveErrors(errors);
  const send = () => {
    if (errors.length) {
      shown.reveal();
      document.getElementById(errors[0].fieldId)?.focus();
      return;
    }
    void run('send', async () => {
      await onSend({ days: [...picked].sort(), reason: reason.trim() });
      toast({ tone: 'success', title: hr ? `${plural(back, 'day')} cancelled` : `Sent to ${approver}`, description: hr ? 'The days are back in the balance. Saved in the audit trail.' : `Once approved, ${plural(back, 'day')} ${back === 1 ? 'goes' : 'go'} back to the balance.` });
      onClose();
    });
  };
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title="Cancel some days" subtitle={hr ? 'Cancelled at once; saved in the audit trail' : `Goes to ${approver} for approval`} dirty={picked.length > 0 || Boolean(reason)} footer={<DrawerFoot main={<Button variant="danger" loading={busy === 'send'} onClick={send}>{hr ? 'Cancel these days' : 'Send to approver'}</Button>} rest={<Button onClick={onClose}>Keep leave</Button>} />}>
      <div className="yx-tim-form">
        <ErrorSummary errors={shown.shownErrors} />
        {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
        <FormField id="cd-days" label="Days to cancel" required error={shown.errorOf('cd-days')} helper={hr ? 'HR can cancel any day of this leave.' : 'Days already taken cannot be cancelled here; ask HR.'}>
          <div className="yx-tim-stack" role="group" aria-label="Days to cancel">
            {days.map((d) => {
              const taken = !open.some((o) => o.on === d.on);
              return (
                <Checkbox
                  key={d.on}
                  label={`${formatDate(dayOfIso(d.on))}${d.portion < 1 ? ' · half day' : ''}`}
                  description={taken ? 'Already taken' : dayOfIso(d.on).toLocaleDateString('en-IN', { weekday: 'long' })}
                  disabled={taken}
                  checked={picked.includes(d.on)}
                  onChange={(on) => setPicked(on ? [...picked, d.on] : picked.filter((x) => x !== d.on))}
                />
              );
            })}
          </div>
        </FormField>
        <FormField id="cd-why" label="Why" required error={shown.errorOf('cd-why')}>
          <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} placeholder="For example: back from the trip two days early" />
        </FormField>
        <p className="yx-tim-muted">{picked.length ? `${plural(back, 'day')} back to the balance${hr ? '' : ' once approved'}.` : 'Pick the days to see what comes back.'}</p>
      </div>
    </Drawer>
  );
}

/** Extend leave: a new last day; it goes as a new request of the same type, linked to this one, to the approver. */
export function ExtendLeaveDrawer({ lastDay, typeName, approver = 'your manager', onSend, onClose }: { lastDay: string; typeName: string; approver?: string; onSend: (x: { to: string; toHalf: 'full' | 'first'; reason?: string }) => Promise<unknown>; onClose: () => void }) {
  const [to, setTo] = useState<Date | null>(null);
  const [toHalf, setToHalf] = useState<'full' | 'first'>('full');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const first = addDays(dayOfIso(lastDay), 1);
  const errors = !to ? [{ fieldId: 'ex-to', message: 'Choose the new last day.' }] : ymd(to) < ymd(first) ? [{ fieldId: 'ex-to', message: `Choose a day after ${formatDate(dayOfIso(lastDay))}.` }] : [];
  const shown = useSaveErrors(errors);
  const send = () => {
    if (errors.length) {
      shown.reveal();
      document.getElementById('ex-to')?.focus();
      return;
    }
    void run('send', async () => {
      await onSend({ to: ymd(to!), toHalf, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      toast({ tone: 'success', title: `Extension sent to ${approver}`, description: `${typeName} from ${formatDate(first)} to ${formatDate(to!)}, linked to this leave.` });
      onClose();
    });
  };
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title="Extend leave" subtitle={`A new ${typeName.toLowerCase()} request from ${formatDate(first)}, linked to this one`} dirty={Boolean(to || reason)} footer={<DrawerFoot main={<Button variant="primary" loading={busy === 'send'} onClick={send}>Send request</Button>} rest={<Button onClick={onClose}>Cancel</Button>} />}>
      <div className="yx-tim-form">
        <ErrorSummary errors={shown.shownErrors} />
        {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
        <FieldRow>
          <FormField id="ex-to" label="New last day" required error={shown.errorOf('ex-to')}><DatePicker value={to} onChange={setTo} min={first} aria-label="New last day" /></FormField>
          <FormField label="Last day"><Select value={toHalf} onChange={(v) => v && setToHalf(v as 'full' | 'first')} options={[{ value: 'full', label: 'Full day' }, { value: 'first', label: 'First half only' }]} /></FormField>
        </FieldRow>
        <FormField id="ex-why" label="Reason" optional><TextArea rows={2} value={reason} onChange={setReason} maxLength={1000} /></FormField>
        <p className="yx-tim-muted">The usual leave rules and your balance apply. {approver[0].toUpperCase() + approver.slice(1)} approves it like any leave.</p>
      </div>
    </Drawer>
  );
}

export function LeaveRequestView({
  r: rIn,
  viewer = 'emp',
  action,
  surface = 'desk',
  open = true,
  onOpenChange,
  onDecided,
  live,
}: {
  r?: LeaveRequestRow;
  viewer?: 'emp' | 'mgr';
  action?: ReqAction;
  surface?: 'desk' | 'inline';
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  /** Called with a short message once the request is approved, sent back, rejected, withdrawn or cancelled. */
  onDecided?: (message: string, action: ReqAction) => void;
  /** The app: one of my requests, with withdraw and ask to cancel (managers decide in Approvals). */
  live?: LiveRequestProps;
}) {
  if (live) return <LiveLeaveRequestView {...live} />;
  const r = rIn!;
  const past = day0(r.to) < TODAY0;
  const [dlg, setDlg] = useState<ReqAction | undefined>(action === 'cancel' && past ? 'report' : action);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // Sent back: "Change and send again" opens Apply leave with this request's type and dates.
  const [resend, setResend] = useState(false);
  const close = () => {
    setDlg(undefined);
    setNote('');
    setTried(false);
  };
  const { toast } = useToast();
  // Done = a toast: the parent says it when it keeps the list (onDecided), otherwise this view does.
  const finish = (msg: string, a: ReqAction) => {
    setDone(msg);
    if (onDecided) onDecided(msg, a);
    else toast({ title: msg, tone: 'success' });
  };
  const overlap = othersOff(r.person, r.from, r.to);
  const canDecide = viewer === 'mgr' && r.status === 'Pending' && r.approver === ME.name && !done;
  const bal = balancesFor(r.person).find((b) => b.name === r.type);
  const pendingReq = r.status === 'Pending';
  // "Balance after" only for a pending request; once decided, the card shows today's balance as "now".
  const balValue = bal ? (pendingReq ? bal.balance - r.days : bal.balance) : 'Not available';
  const balLabel = pendingReq ? (viewer === 'mgr' ? `${first(r.person)}'s balance after` : 'Balance after') : `${r.type} balance now`;
  const locked = r.from < LOCKED_UNTIL;
  // Payroll for the leave's month locks on its 30th (TIM-11), or its last day in February; later fixes go to the next month.
  const lockDay = new Date(r.from.getFullYear(), r.from.getMonth(), Math.min(30, new Date(r.from.getFullYear(), r.from.getMonth() + 1, 0).getDate()));
  const nextMonth = new Date(r.from.getFullYear(), r.from.getMonth() + 1, 1);
  const who = viewer === 'mgr' ? `${first(r.person)}'s` : 'your';
  const inline = surface === 'inline';
  // Working days only, as the lists write them ("1 & 3 Oct"), so the dates never disagree with Days.
  const dates = absenceDates(requestAbsence(r), false);

  const body = (
    <div className="yx-tim-stack">
      {inline && viewer === 'mgr' && <PersonLabel name={r.person} secondary={`${r.type} · ${dates}`} />}
      <div className="yx-tim-row">
        <Badge tone={statusTone(r)}>{r.status}</Badge>
        {!past && <DueBadge date={r.from} prefix="Starts" />}
      </div>
      <Kpis
        items={[
          { label: 'Type', value: r.type },
          { label: 'Dates', value: dates },
          { label: 'Days', value: r.days },
          { label: balLabel, value: balValue },
        ]}
      />
      {r.status === 'Sent back' && r.note && <InlineAlert tone="warning" title={`${r.approver} sent it back for changes`}>{r.note}</InlineAlert>}
      <p><strong>Reason:</strong> {r.reason}</p>
      {r.cert && <div className="yx-tim-row"><Badge tone={r.cert === 'verified' ? 'success' : 'neutral'}>{certText(r.cert)}</Badge></div>}
      {viewer === 'mgr' && <InlineAlert tone="info" title={othersTitle(overlap.length)}>{overlap.length > 0 ? overlap.map((o) => o.text).join(', ') : undefined}</InlineAlert>}
      <ApprovalTimeline
        now={TODAY}
        steps={[
          { id: 'a', label: 'Requested', status: 'done', approver: r.person, at: appliedAt(r) },
          { id: 'b', label: r.status === 'Sent back' ? 'Sent back for changes' : 'Manager approval', status: r.status === 'Approved' ? 'done' : r.status === 'Rejected' ? 'rejected' : r.status === 'Sent back' ? 'done' : 'current', approver: r.approver, at: r.decided },
        ]}
      />
    </div>
  );

  const closeBtn = inline ? undefined : <Button onClick={() => onOpenChange?.(false)}>Close</Button>;
  let footer: ReactNode = null;
  if (done) footer = null;
  else if (viewer === 'mgr') {
    footer = canDecide ? (
      inline ? (
        <>
          <Button variant="approve" fullWidth onClick={() => setDlg('approve')}>Approve</Button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--yx-space-2)' }}><Button fullWidth onClick={() => setDlg('sendback')}>Send back</Button><Button variant="danger" fullWidth onClick={() => setDlg('reject')}>Reject</Button></div>
        </>
      ) : (
        // Approve first when the footer stacks on a phone; Reject never sits on top.
        <DrawerFoot main={<Button variant="approve" onClick={() => setDlg('approve')}>Approve</Button>} rest={<><Button onClick={() => setDlg('sendback')}>Send back</Button><Button variant="danger" onClick={() => setDlg('reject')}>Reject</Button></>} />
      )
    ) : r.status === 'Pending' ? (
      // Waiting on someone else: who decides it, and Close (no Approve to press).
      <DrawerFoot hint={`Waiting for ${r.approver}: only they can approve it`} rest={closeBtn} />
    ) : (
      // Already decided: only the status and Close.
      <DrawerFoot hint={`${r.status}${r.decided ? ` on ${formatDate(r.decided)}` : ''}`} rest={closeBtn} />
    );
  } else if (r.status === 'Pending') footer = <DrawerFoot main={<Button variant="danger" onClick={() => setDlg('withdraw')}>Withdraw request</Button>} />;
  else if (r.status === 'Sent back') footer = <DrawerFoot main={<Button variant="primary" onClick={() => setResend(true)}>Change and send again</Button>} rest={<Button onClick={() => setDlg('withdraw')}>Withdraw</Button>} />;
  else if (r.status === 'Approved' && past) footer = <DrawerFoot hint="Leave already taken" main={<Button onClick={() => setDlg('report')}>Report an error</Button>} />;
  else if (r.status === 'Approved') footer = <DrawerFoot main={<Button variant="danger" onClick={() => setDlg('cancel')}>Ask to cancel</Button>} rest={<><Button onClick={() => setDlg('cancel_days')}>Cancel some days</Button><Button onClick={() => setDlg('extend')}>Extend</Button></>} />;

  const noteField = (label: string, placeholder: string, error: string) => (
    <FormField label={label} required error={tried && !note.trim() ? error : null}><TextArea rows={2} value={note} placeholder={placeholder} onChange={setNote} /></FormField>
  );
  const dialogs = (
    <>
      <ApplyLeavePanel open={resend} onOpenChange={setResend} type={leaveCodeOf(r.type)} from={r.from} to={r.to} />
      {/* Batch A D12: the request's working days (Sundays are off in the sample company). */}
      {dlg === 'cancel_days' && <CancelSomeDaysDrawer days={eachIso(r.from, r.to).filter((on) => dayOfIso(on).getDay() !== 0).map((on) => ({ on, portion: 1 }))} today={ymd(TODAY0)} approver={r.approver} onSend={async () => undefined} onClose={() => { close(); }} />}
      {dlg === 'extend' && <ExtendLeaveDrawer lastDay={ymd(r.to)} typeName={r.type} approver={r.approver} onSend={async () => undefined} onClose={() => { close(); }} />}
      <ConfirmDialog open={dlg === 'withdraw'} onOpenChange={(o) => !o && close()} title="Withdraw this request?" consequence={r.status === 'Sent back' ? 'It was sent back, so it holds no days. Withdrawn, it stays in your history.' : `It hasn't been approved yet, so it's withdrawn at once and your ${plural(r.days, 'pending day')} ${r.days === 1 ? 'returns' : 'return'} to your balance.`} confirmLabel="Withdraw request" cancelLabel="Keep request" destructive onConfirm={() => { close(); finish('Request withdrawn', 'withdraw'); }} />
      <ConfirmDialog open={dlg === 'cancel'} onOpenChange={(o) => !o && close()} title="Ask to cancel approved leave?" consequence={locked ? `${monthName(r.from)} payroll is locked, so this becomes a late correction: any loss of pay is reversed in the next payroll.` : `${r.approver} needs to approve the cancellation. Once approved, the ${plural(r.days, 'day')} ${r.days === 1 ? 'goes' : 'go'} back to your balance.`} confirmLabel="Send cancellation" cancelLabel="Keep leave" destructive onConfirm={() => { close(); finish(`Cancellation sent to ${r.approver}`, 'cancel'); }} />
      <ConfirmDialog open={dlg === 'report'} onOpenChange={(o) => !o && close()} title="Report an error in this leave?" consequence={`This leave was already taken, so it goes to HR as an attendance correction. ${locked ? `${monthName(r.from)} payroll is locked: the change lands in the next payroll.` : `Fixed before ${monthName(r.from)} locks, the change lands in ${monthName(r.from)} pay; after that, in ${monthName(nextMonth)} pay.`}`} confirmLabel="Send to HR" onConfirm={() => { setTried(true); if (!note.trim()) return false; close(); finish('Sent to HR as an attendance correction', 'report'); }}>
        {!locked && <div className="yx-tim-row"><span className="yx-tim-muted">{monthName(r.from)} locks {dm(lockDay)}</span><DueBadge date={lockDay} /></div>}
        {noteField("What's wrong", 'For example: I worked on 17 Sep, only 16 Sep was leave', "Enter what's wrong.")}
      </ConfirmDialog>
      <ConfirmDialog open={dlg === 'approve'} onOpenChange={(o) => !o && close()} title={`Approve ${r.person}'s ${r.type.toLowerCase()}?`} consequence={`${plural(r.days, 'day')}, ${dates}. ${othersLine(overlap)}.`} confirmLabel="Approve" confirmVariant="approve" onConfirm={() => { close(); finish(`Approved · ${r.person}, ${dates}`, 'approve'); }} />
      <ConfirmDialog open={dlg === 'sendback'} onOpenChange={(o) => !o && close()} title={`Send back to ${first(r.person)}?`} consequence={`${first(r.person)} gets your note and can change the request and send it again.`} confirmLabel="Send back" onConfirm={() => { setTried(true); if (!note.trim()) return false; close(); finish(`Sent back to ${r.person}`, 'sendback'); }}>
        {noteField('What to change', r.cert ? 'For example: attach the certificate' : 'For example: move it by a week', 'Enter what to change.')}
      </ConfirmDialog>
      <ConfirmDialog open={dlg === 'reject'} onOpenChange={(o) => !o && close()} title={`Reject ${r.person}'s ${r.type.toLowerCase()}?`} consequence={`The ${plural(r.days, 'pending day')} ${r.days === 1 ? 'goes' : 'go'} back to ${who} balance. ${first(r.person)} sees your reason.`} confirmLabel="Reject" destructive onConfirm={() => { setTried(true); if (!note.trim()) return false; close(); finish(`Rejected · ${r.person}, ${dates}`, 'reject'); }}>
        {noteField('Reason', 'For example: audit week, the team is short', 'Enter a reason.')}
      </ConfirmDialog>
    </>
  );

  if (inline) return <div className="yx-tim-stack">{body}{footer && <div className="yx-tim-sheet-actions">{footer}</div>}{dialogs}</div>;
  return (
    <>
      <Drawer open={open && dlg !== 'cancel_days' && dlg !== 'extend'} onOpenChange={(o) => onOpenChange?.(o)} title={`${r.type} · ${r.person}`} subtitle={dates} footer={footer ?? <Button onClick={() => onOpenChange?.(false)}>Close</Button>}>{body}</Drawer>
      {dialogs}
    </>
  );
}

/* =====================================================================
   TIM-18 · Apply leave (range with halves, live effect, delegate, notify colleagues, notice warning)
   ===================================================================== */

export interface ApplyLeaveProps {
  type?: LeaveCode;
  from?: Date;
  to?: Date;
  fromHalf?: Half;
  toHalf?: Half;
  /** The signed-in employee applying for themselves (default Divya). Someone in ON_NOTICE gets the notice-period rules. */
  self?: string;
  blocked?: boolean;
  sandwich?: 'none' | 'sandwich' | 'always';
  /** Batch A C4: colleagues already chosen under Notify colleagues (stories). */
  notify?: string[];
}

/** Default range Fri 23 – Mon 26 Oct: clear of Divya's own pending 12–13 Oct, with the 4th Saturday and Sunday in between. */
const DEFAULT_FROM = new Date(2026, 9, 23);
const DEFAULT_TO = new Date(2026, 9, 26);
/** Company block dates (used when `blocked`): the audit at the Chennai office. */
const BLOCK_DATES = [{ date: new Date(2026, 9, 26), reason: 'quality audit at Chennai office' }];
const DEFAULT_REASON: Record<LeaveCode, string> = { EL: 'Family function in Madurai', CL: 'Family function in Madurai', SL: 'Fever, doctor advised rest', CO: 'Personal work', LWP: 'Extended family travel' };
/** Someone serving notice has their own reason (not Divya's 12–13 Oct one). */
const reasonFor = (t: LeaveCode, person: string) => (ON_NOTICE[person] && t !== 'SL' ? 'Moving house' : DEFAULT_REASON[t]);

/** What the form currently asks for (sent upwards so the footer can block Send). */
export interface LeaveDraft { type: LeaveCode; from: Date | null; to: Date | null; total: number; sandwichDays: number; errors: number; reason: string }

const countFor = (type: LeaveCode, from: Date, to: Date, fh: Half, th: Half, sandwich: ApplyLeaveProps['sandwich']) =>
  countLeaveDays({ from, to, fromHalf: fh, toHalf: th, holidays: holidayDates, weeklyOffDays: [0], weeklyOffDates: ALT_SAT, sandwich: type === 'CL' || type === 'CO' ? 'none' : sandwich ?? 'sandwich' });

export function ApplyLeaveForm({ type: t0 = 'EL', from: f0 = DEFAULT_FROM, to: to0 = DEFAULT_TO, fromHalf: fh0 = 'full', toHalf: th0 = 'full', blocked = false, sandwich = 'sandwich', notify: notify0 = [], phone, person = ME.name, own = person === ME.name, onDraft, onOpenRequest }: Omit<ApplyLeaveProps, 'self'> & { phone?: boolean; /** Whose leave (HR or a manager applying for someone). */ person?: string; /** The person is applying for themselves. */ own?: boolean; onDraft?: (d: LeaveDraft) => void; onOpenRequest?: (r: LeaveRequestRow) => void }) {
  const [type, setType] = useState<LeaveCode>(t0);
  const [range, setRange] = useState({ from: f0 as Date | null, to: to0 as Date | null });
  const [fh, setFh] = useState<Half>(fh0);
  const [th, setTh] = useState<Half>(th0);
  const [reason, setReason] = useState(reasonFor(t0, person));
  const pickType = (t: LeaveCode) => {
    setType(t);
    setReason(reasonFor(t, person));
  };
  const [delegate, setDelegate] = useState(true);
  // Batch A C4: colleagues told on approval (dates only).
  const [notify, setNotify] = useState<string[]>(notify0);
  // null = not picked yet: the first report who is in on those dates.
  const [delegateTo, setDelegateTo] = useState<string | null>(null);
  const dateId = useId();
  const certId = useId();
  const notice = ON_NOTICE[person];
  const onNotice = !!notice;
  const known = balancesFor(person);
  // No balance on file for this person and type: the type still shows, but the balance is not checked here.
  const typeBal = known.find((b) => b.code === type);
  const noBal = !typeBal;
  const bal = typeBal ?? BALANCES.find((b) => b.code === type) ?? BALANCES[0];
  const count = useMemo(() => (range.from && range.to ? countFor(type, range.from, range.to, fh, th, sandwich) : null), [range, fh, th, type, sandwich]);
  const total = count?.total ?? 0;
  const daysAhead = range.from ? daysUntil(range.from, TODAY) : 0;
  // Days already pending in other requests are spoken for, so "Balance after" takes them off too.
  const pendingDays = bal.paid && !noBal ? bal.pending : 0;
  const w = leaveWarnings({
    total,
    balance: bal.paid && !noBal ? bal.balance - pendingDays : 999,
    negativeLimit: type === 'EL' ? 2 : 0,
    // Founder decision 2: HR applying for someone skips the notice (leave.notice.on_behalf, skip by default).
    noticeDays: type === 'EL' && own ? 7 : 0,
    // A past start date on a type with no notice rule (sick leave) is not short notice.
    daysAhead: Math.max(0, daysAhead),
    maxPerRequest: type === 'CL' ? 3 : 15,
    attachmentAfter: type === 'SL' ? 2 : null,
    hasAttachment: false,
    blocked: false,
    onNotice,
    noticePolicy: type === 'EL' ? 'extends' : 'allowed',
  });
  const blockHits = blocked && count ? BLOCK_DATES.filter((b) => count.days.some((d) => same(d.date, b.date))) : [];
  // Days already in this person's own pending or approved leave can't be asked for twice.
  const clash = range.from && range.to
    ? LEAVE_REQUESTS.find((r) => r.person === person && (r.status === 'Pending' || r.status === 'Approved') && day0(r.from) <= day0(range.to!) && day0(r.to) >= day0(range.from!))
    : undefined;
  const clashDay = clash && range.from ? (day0(clash.from) > day0(range.from) ? clash.from : range.from) : null;
  const errors = [
    ...w.errors,
    ...blockHits.map((b) => `${dm(b.date)} is a company block date (${b.reason}). Pick other dates.`),
    ...(clash && clashDay ? [`${dm(clashDay)} is already in ${own ? 'your' : `${first(person)}'s`} ${clash.status.toLowerCase()} request (${clash.type} ${span(clash.from, clash.to)}).`] : []),
  ];
  const overlap = range.from && range.to ? othersOff(person, range.from, range.to) : [];
  const approver = managerOf(person) ?? ME.manager;
  const isLead = myReports(person).length > 0;
  const delegatePool = myReports(person).slice(0, 6);
  const delegateId = delegateTo ?? delegatePool.find((p) => !overlap.some((o) => o.name === p.name))?.id ?? null;
  const delegateOff = overlap.find((o) => o.name === delegatePool.find((p) => p.id === delegateId)?.name);
  // Not enough balance, or too many days for this type: offer another paid type that has enough left.
  const tooMany = w.errors.some((e) => e.startsWith('Not enough balance') || e.startsWith('At most'));
  // Sick leave is only for illness, and comp-off only for days worked, so neither is offered as a switch.
  const free = (b: LeaveBalance) => b.balance - b.pending;
  const switchTo = tooMany ? known.find((b) => b.paid && b.code !== type && b.code !== 'CO' && b.code !== 'SL' && free(b) >= total && !(b.code === 'CL' && total > 3)) : undefined;
  const warnings = w.warnings.map((x) => (notice && x.startsWith('You are serving notice: your last working day') ? `You are serving notice: your last working day moves from ${dm(notice.lastDay)} to ${dm(addDays(notice.lastDay, total))} (${plural(total, 'day')}).` : x));
  const paidLeft = known.filter((b) => b.paid && b.code !== 'CO' && b.code !== 'SL' && free(b) > 0).sort((a, b) => free(b) - free(a))[0];
  const needCert = w.errors.some((e) => e.toLowerCase().includes('certificate'));
  const focusCert = () => {
    const el = document.getElementById(certId);
    el?.scrollIntoView({ block: 'center' });
    (el?.querySelector('button, input') as HTMLElement | null)?.focus();
  };
  // The approver's own leave on these dates (they may decide late).
  const approverAway = range.from && range.to
    ? LEAVE_REQUESTS.find((r) => r.person === approver && (r.status === 'Pending' || r.status === 'Approved') && day0(r.from) <= day0(range.to!) && day0(r.to) >= day0(range.from!))
    : undefined;
  const sandwichHolidays = count ? count.days.filter((d) => d.kind === 'sandwich' && holidayDates.some((h) => same(h, d.date))).length : 0;
  const sw = count?.sandwichDays ?? 0;

  useEffect(() => {
    onDraft?.({ type, from: range.from, to: range.to, total, sandwichDays: count?.sandwichDays ?? 0, errors: errors.length + (reason.trim() ? 0 : 1), reason });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, range.from, range.to, total, errors.length, reason]);

  const focusDates = () => (document.getElementById(dateId)?.querySelector('button, input') as HTMLElement | null)?.focus();
  const dayLabel = (d: { date: Date; kind: string; value: number }) => {
    if (blockHits.some((b) => same(b.date, d.date))) return <Badge tone="danger">Blocked</Badge>;
    if (d.kind === 'counted') return d.value === 0.5 ? 'Half day' : 'Leave';
    if (d.kind === 'sandwich') return `${holidayDates.some((h) => same(h, d.date)) ? 'Holiday' : 'Weekend'} · counted`;
    return d.kind === 'holiday' ? 'Holiday · not counted' : 'Weekly off · not counted';
  };

  return (
    // On a phone sheet the editor is always one column (the sheet is narrower than the viewport).
    <div className="yx-tim-editor" style={phone ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
      <div className="yx-tim-form">
        {errors.length > 0 && (
          <div id="apply-errors" tabIndex={-1}>
          <InlineAlert
            tone="danger"
            title={`Fix ${plural(errors.length, 'thing')} to send this`}
            actions={blockHits.length > 0 || clash || tooMany || needCert ? (
              <>
                {(blockHits.length > 0 || clash || tooMany) && <Button size="sm" onClick={focusDates}>Change dates</Button>}
                {needCert && <Button size="sm" onClick={focusCert}>Attach certificate</Button>}
                {switchTo && <Button size="sm" onClick={() => pickType(switchTo.code as LeaveCode)}>Switch to {switchTo.name} ({plural(free(switchTo), 'day')})</Button>}
                {clash && onOpenRequest && <Button size="sm" onClick={() => onOpenRequest(clash)}>Open that request</Button>}
              </>
            ) : undefined}
          >
            <ul className="yx-tim-steps">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </InlineAlert>
          </div>
        )}
        {type === 'LWP' && own && paidLeft && (
          <InlineAlert tone="info" title={`You still have ${plural(free(paidLeft), 'day')} ${paidLeft.name}${paidLeft.pending > 0 ? ` (${paidLeft.pending} more pending)` : ''}`} actions={<Button size="sm" onClick={() => pickType(paidLeft.code as LeaveCode)}>Switch to {paidLeft.name}</Button>}>
            Unpaid leave is cut from your pay. Use paid leave instead?
          </InlineAlert>
        )}
        <FormField label="Leave type" required>
          <Select
            value={type}
            onChange={(v) => v && pickType(v as LeaveCode)}
            options={BALANCES.map((d) => {
              const b = known.find((x) => x.code === d.code);
              // Free to apply for: pending days are already spoken for, as in "Balance after".
              return { value: d.code, label: d.name, description: !b ? undefined : b.paid ? `${plural(b.code === 'CO' ? b.balance : free(b), 'day')} available` : `${b.taken} taken this year` };
            })}
          />
        </FormField>
        <div id={dateId}><DateRangePicker label="Dates" value={range} onChange={setRange} required helper="Holidays and weekly offs are shown in the calendar" /></div>
        <FieldRow>
          <FormField label="First day"><Select value={fh} onChange={(v) => v && setFh(v as Half)} options={[{ value: 'full', label: 'Full day' }, { value: 'second', label: 'Second half only' }]} /></FormField>
          <FormField label="Last day"><Select value={th} onChange={(v) => v && setTh(v as Half)} options={[{ value: 'full', label: 'Full day' }, { value: 'first', label: 'First half only' }]} /></FormField>
        </FieldRow>
        <FormField id="apply-reason" label="Reason" required><TextArea rows={2} value={reason} onChange={setReason} /></FormField>
        {type === 'SL' && <div id={certId}><FormField label="Medical certificate" helper="Needed for more than 2 days. Only HR sees the file; your manager sees whether it's attached and verified."><FileUpload upload={async () => {}} accept={['application/pdf', 'image/jpeg', 'image/png']} /></FormField></div>}
        {own && (
          <FormField id="apply-notify" label="Notify colleagues" optional helper={NOTIFY_HELP} error={notify.length > NOTIFY_MAX ? `Choose up to ${NOTIFY_MAX} people.` : undefined}>
            <MultiSelect aria-label="Notify colleagues" searchable placeholder="Choose people" value={notify} onChange={setNotify} options={TEAM.filter((t) => t.name !== person).slice(0, 14).map((t) => ({ value: t.name, label: t.name, description: t.role }))} />
          </FormField>
        )}
        {own && isLead && <Checkbox label="Delegate my approvals while I'm away" checked={delegate} onChange={setDelegate} />}
        {own && isLead && delegate && (
          <FormField label="Delegate to" error={delegateOff ? `${delegateOff.text} is off then too. Pick someone who is in.` : undefined}>
            <PersonPicker aria-label="Delegate to" value={delegateId} onChange={setDelegateTo} people={delegatePool.map((p) => ({ id: p.id, name: p.name, role: p.role, department: p.dept }))} />
          </FormField>
        )}
      </div>
      {/* Same right edge as the form fields when the editor stacks to one column. */}
      <div className="yx-tim-sticky" style={{ maxWidth: 'var(--yx-form-max)', minWidth: 0 }}>
        <section className="yx-tim-effect" aria-live="polite" aria-label="Leave summary">
          <strong>Summary</strong>
          <dl className="yx-tim-stack">
            <div className="yx-tim-effect__row"><dt>Days counted</dt><dd>{total}{sw > 0 ? ` (incl. ${plural(sw, sandwichHolidays ? 'weekend or holiday day' : 'weekend day', sandwichHolidays ? 'weekend and holiday days' : 'weekend days')})` : ''}</dd></div>
            {(count?.excluded ?? 0) > 0 && <div className="yx-tim-effect__row"><dt>Holidays / weekly offs not counted</dt><dd>{count?.excluded}</dd></div>}
            {!own && type === 'EL' && daysAhead < 7 && <div className="yx-tim-effect__row"><dt>Notice</dt><dd>Applied by HR: 7 days' notice not needed</dd></div>}
            <div className="yx-tim-effect__row">
              <dt>{bal.paid ? 'Balance after' : 'Unpaid days this year (with this)'}</dt>
              <dd>{noBal ? 'Not available' : !bal.paid ? bal.taken + total : w.balanceAfter < 0 ? <Badge tone="danger">{`−${-w.balanceAfter} (short by ${-w.balanceAfter})`}</Badge> : w.balanceAfter}</dd>
            </div>
          </dl>
          {pendingDays > 0 && <p className="yx-tim-note">Balance after also takes off {plural(pendingDays, 'day')} already pending for {own ? 'you' : first(person)}.</p>}
          {sw > 0 && <p className="yx-tim-note">Weekends and holidays between leave days count as leave under {own ? 'your' : 'the'} policy.</p>}
          {count && (
            <ul className="yx-tim-days">
              {count.days.map((d) => <li key={d.date.getTime()}><DayDate date={d.date} /><span>{dayLabel(d)}</span></li>)}
            </ul>
          )}
          {warnings.map((x) => <InlineAlert key={x} tone="warning">{x}</InlineAlert>)}
          {!own && <p className="yx-tim-note">Goes to {approver} for approval, marked "Applied by HR".</p>}
          <p className="yx-tim-note">Approver: {approver}{approverAway ? ` (also on leave ${span(approverAway.from, approverAway.to)})` : ''} · {othersLine(overlap, own && isLead ? 'Your reports also off' : 'Also off')}</p>
        </section>
      </div>
    </div>
  );
}

/** Apply leave in a drawer (desk) or bottom sheet (phone): Send is blocked while the form has errors; sent shows what happens next. */
type PickPerson = { id: string; name: string; role: string; department: string };
/** People to apply for, keyed by name: a manager's own reports, or everyone for HR. */
/** Batch A C4 (answer 2313): up to 10 colleagues, told on approval with the dates only. */
const NOTIFY_MAX = 10;
const NOTIFY_HELP = `Up to ${NOTIFY_MAX} people. They are told when the leave is approved, with the dates only, never the type or the reason.`;

/** Live: find colleagues one at a time; the chosen ones show as tags to remove. */
function NotifyColleagues({ value, onChange, onFind }: { value: { id: string; name: string }[]; onChange: (v: { id: string; name: string }[]) => void; onFind: (q: string) => Promise<LivePersonOption[]> }) {
  const [names, setNames] = useState<Record<string, string>>({});
  return (
    <div className="yx-tim-stack">
      {value.length < NOTIFY_MAX ? (
        <LivePicker
          kind="people"
          label="Colleague to notify"
          value={null}
          names={names}
          onChange={(id) => id && !value.some((p) => p.id === id) && onChange([...value, { id, name: names[id] ?? 'Colleague' }])}
          onPick={(_k, q) => onFind(q).then((r) => (setNames((n) => ({ ...n, ...Object.fromEntries(r.map((p) => [p.id, p.label])) })), r))}
        />
      ) : (
        <p className="yx-tim-muted">{NOTIFY_MAX} people chosen, the most you can notify.</p>
      )}
      {value.length > 0 && (
        <div className="yx-tim-row" aria-label="Colleagues to notify">
          {value.map((p) => (
            <Tag key={p.id} onRemove={() => onChange(value.filter((x) => x.id !== p.id))} removeLabel={`Remove ${p.name}`}>
              {p.name}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}

const pickPeople = (hr: boolean): PickPerson[] => (hr ? TEAM : myReports()).map((t) => ({ id: t.name, name: t.name, role: t.role, department: `${t.dept} · ${t.location}` }));

/**
 * Apply leave in a drawer (desk) or bottom sheet (phone): Send is blocked while the form has errors; sent shows what happens next.
 * With `forSomeone` (a manager's reports, or everyone for HR), the first field picks the employee; their balances and approver are used.
 */
export function ApplyLeavePanel({ open, onOpenChange, surface = 'desk', sent: sent0 = false, forSomeone, picked: picked0 = null, self = ME.name, live, liveFor, ...p }:ApplyLeaveProps & { open: boolean; onOpenChange: (o: boolean) => void; surface?: 'desk' | 'phone'; sent?: boolean; forSomeone?: PickPerson[]; /** With `forSomeone`: the person already picked (stories). */ picked?: string | null; /** The app: my own leave, with the server's summary. */ live?: { data: MyLeave; live: LiveLeaveHome; resend?: LiveRequest; /** Batch D A8: the day the request starts on (from the timesheet week). */ startOn?: string }; /** The app: HR applies for someone (founder answer B). */ liveFor?: LiveApplyFor }) {
  if (live) return open ? <LiveApplyLeavePanel {...live} onClose={() => onOpenChange(false)} /> : null;
  if (liveFor) return open ? <LiveApplyLeavePanel forSomeone={liveFor} onClose={() => onOpenChange(false)} /> : null;
  const [draft, setDraft] = useState<LeaveDraft>(() => {
    const type = p.type ?? 'EL';
    const from = p.from ?? DEFAULT_FROM;
    const to = p.to ?? DEFAULT_TO;
    const c = countFor(type, from, to, p.fromHalf ?? 'full', p.toHalf ?? 'full', p.sandwich);
    return { type, from, to, total: c.total, sandwichDays: c.sandwichDays, errors: 0, reason: reasonFor(type, self) };
  });
  const [sent, setSent] = useState(sent0);
  const [view, setView] = useState<ReqAction | 'view' | null>(null);
  const [other, setOther] = useState<LeaveRequestRow | null>(null);
  const [picked, setPicked] = useState<string | null>(picked0);
  const person = forSomeone ? picked : self;
  const approver = (person && managerOf(person)) ?? ME.manager;
  const request: LeaveRequestRow = {
    id: 'new', person: person ?? self, type: LEAVE_NAME[draft.type], from: draft.from ?? TODAY0, to: draft.to ?? TODAY0, days: draft.total,
    status: 'Pending', applied: TODAY, reason: draft.reason, approver,
  };
  const blockedBy = !person ? 'Pick the employee' : draft.errors > 0 ? `Fix ${plural(draft.errors, 'thing')} above` : null;
  // Never a disabled Send: pressed too early, the first thing to fix takes focus.
  const send = () => {
    if (!blockedBy) return setSent(true);
    const first = !person ? 'apply-employee' : !draft.reason.trim() ? 'apply-reason' : 'apply-errors';
    document.getElementById(first)?.focus();
  };
  const picker = forSomeone && !sent && (
    <FormField id="apply-employee" label="Employee" required>
      <PersonPicker aria-label="Employee" value={picked} onChange={setPicked} people={forSomeone} />
    </FormField>
  );
  const body = sent ? (
    <InlineAlert
      tone="info"
      title={forSomeone ? `Applied for ${person} · sent to ${approver}` : `Sent to ${approver}`}
      actions={<><Button size="sm" onClick={() => setView('view')}>View request</Button>{!forSomeone && <Button size="sm" onClick={() => setView('withdraw')}>Withdraw</Button>}</>}
    >
      {LEAVE_NAME[draft.type]} {span(request.from, request.to)} ({plural(draft.total, 'day')}{draft.sandwichDays ? `, including ${plural(draft.sandwichDays, 'weekend day')} between leave days` : ''}). {plural(draft.total, 'day')} {draft.total === 1 ? 'shows' : 'show'} as pending on {forSomeone ? `${first(person ?? '')}'s` : 'your'} balance until it's decided.
    </InlineAlert>
  ) : (
    <div className="yx-tim-stack">
      {picker}
      {person ? <ApplyLeaveForm key={person} {...p} person={person} own={!forSomeone} phone={surface === 'phone'} onDraft={setDraft} onOpenRequest={setOther} /> : <p className="yx-tim-muted">Pick the employee to see their leave types and balances.</p>}
    </div>
  );
  const footer = sent ? <Button onClick={() => onOpenChange(false)}>Close</Button> : surface === 'phone' ? (
    <>
      {/* On a phone sheet the reason takes its own line above the buttons. */}
      {blockedBy && <span className="yx-tim-muted" style={{ flexBasis: '100%' }}>{blockedBy}</span>}
      <Button onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button variant="primary" onClick={send}>Send request</Button>
    </>
  ) : (
    <DrawerFoot hint={blockedBy} rest={<Button onClick={() => onOpenChange(false)}>Cancel</Button>} main={<Button variant="primary" onClick={send}>Send request</Button>} />
  );
  const shown = view ? request : other;
  const action = view && view !== 'view' ? view : undefined;
  const closeShown = () => (view ? setView(null) : setOther(null));
  const requestView = shown && (surface === 'phone'
    ? <LeaveRequestView key={shown.id} r={shown} surface="inline" action={action} />
    : <LeaveRequestView key={shown.id} r={shown} action={action} open onOpenChange={(o) => !o && closeShown()} />);
  if (surface === 'phone')
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title={shown ? 'Leave request' : 'Apply leave'} footer={shown ? (other && !view ? <Button onClick={closeShown}>Back to the form</Button> : undefined) : footer}>
        {shown ? requestView : body}
      </BottomSheet>
    );
  return (
    <>
      <Drawer open={open && !shown} onOpenChange={onOpenChange} title={forSomeone ? 'Apply leave for someone' : 'Apply leave'} size="lg" footer={footer}>{body}</Drawer>
      {requestView}
    </>
  );
}

export function ApplyLeaveSheet({ live, ...p }: ApplyLeaveProps & { surface?: 'desk' | 'phone'; sent?: boolean; /** The app: the request drawer on My leave (`resend`: a request sent back, changed and sent again). */ live?: { data: MyLeave; live: LiveLeaveHome; onClose: () => void; resend?: LiveRequest } }) {
  if (live) return <ApplyLeavePanel open onOpenChange={(o) => !o && live.onClose()} live={{ data: live.data, live: live.live, resend: live.resend }} />;
  const [open, setOpen] = useState(true);
  if (p.surface === 'phone') return <PhoneFrame tab="time" title="Leave"><ApplyLeavePanel {...p} open={open} onOpenChange={setOpen} /></PhoneFrame>;
  const n = p.self && p.self !== ME.name ? ON_NOTICE[p.self] : undefined;
  return (
    <TimePage active="My leave" user={p.self && p.self !== ME.name ? { name: p.self, email: n?.email ?? '' } : undefined}>
      <PageHeader title="My leave" />
      <ApplyLeavePanel {...p} open={open} onOpenChange={setOpen} />
    </TimePage>
  );
}

/* =====================================================================
   Adjust balance (HR) · used by TIM-17 and TIM-21
   ===================================================================== */

const PEOPLE_WITH_BALANCES = [ME.name, ...Object.keys(PERSON_BALANCES)];

/** What the adjust dialog needs of a balance; the live card passes the leave type id as `code`. */
type AdjBalance = Pick<LeaveBalance, 'code' | 'name' | 'balance' | 'pending' | 'paid'>;
type AdjPost = { person: string; code: string; delta: number; reason: string };

function AdjustBalanceDialog({ open, onOpenChange, person: fixedPerson, onPost, balancesOf = balancesFor, people: peopleArg, live }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  person?: string;
  /** Live: resolves once the ledger line is saved, or throws the server's reason (shown in the dialog). */
  onPost?: (e: AdjPost) => void | Promise<unknown>;
  balancesOf?: (person: string) => AdjBalance[];
  people?: { id: string; name: string; role?: string; department?: string }[];
  /** The app with no fixed person (HR leave home): find someone in scope, then load their balances. */
  live?: LiveAdjust;
}) {
  const [person, setPerson] = useState(fixedPerson ?? 'Priya Shankar');
  const [picked, setPicked] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState<{ id: string; rows: AdjBalance[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    setLoadError(null);
    if (!live || !picked) return;
    let on = true;
    live.onLoad(picked).then(
      (rows) => on && setLoaded({ id: picked, rows: rows.filter((r) => r.hasBalance).map((r) => ({ code: r.leaveTypeId, name: r.name, balance: r.balance, pending: r.pending, paid: true })) }),
      (e: unknown) => on && setLoadError(e instanceof Error && e.message ? e.message : "Their balances didn't load. Try again."),
    );
    return () => {
      on = false;
    };
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  const loading = Boolean(live && picked && loaded?.id !== picked);
  const balances = live ? (loading || !loaded ? [] : loaded.rows) : balancesOf(fixedPerson ?? person).filter((b) => b.paid);
  const [code, setCode] = useState('EL');
  const [dir, setDir] = useState('add');
  const [days, setDays] = useState<number | null>((fixedPerson && peopleArg) || live ? null : 2);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const b = balances.find((x) => x.code === code) ?? balances[0];
  // Same "available" figure as the balance cards: days held for a pending request can't be deducted.
  const free = (x: AdjBalance) => (x.code === 'CO' ? x.balance : x.balance - x.pending);
  const avail = b ? free(b) : 0;
  const delta = (dir === 'add' ? 1 : -1) * (days ?? 0);
  const overDeduct = dir === 'deduct' && !!b && (days ?? 0) > avail;
  // Never a disabled Post: pressed too early, the errors show and the first field takes focus.
  const tooEarly = useTooEarly([
    ...(live && !picked ? [{ fieldId: 'adj-person', message: 'Choose the person.' }] : loading ? [{ fieldId: 'adj-type', message: 'Their balances are still loading.' }] : !b ? [{ fieldId: 'adj-type', message: 'This person has no leave with a balance to adjust.' }] : []),
    ...(!days ? [{ fieldId: 'adj-days', message: 'Enter the days.' }] : overDeduct ? [{ fieldId: 'adj-days', message: `Only ${plural(avail, 'day')} available to deduct.` }] : []),
    ...(reason.trim().length < 3 ? [{ fieldId: 'adj-reason', message: 'Say why (it goes on the ledger and the audit log).' }] : []),
  ]);
  const people = peopleArg ?? PEOPLE_WITH_BALANCES.map((n) => {
    const t = TEAM.find((p) => p.name === n);
    const other = n === ME.name ? { role: ME.role, dept: ME.department } : ON_NOTICE[n];
    return { id: n, name: n, role: t?.role ?? other?.role ?? '', department: t?.dept ?? other?.dept ?? '' };
  });
  const post = () => {
    if (tooEarly.stop()) return;
    void run('post', async () => {
      if (live) {
        await live.onAdjust(picked!, { leaveTypeId: b!.code, days: delta, reason: reason.trim() });
        toast({ tone: 'success', title: `Posted ${delta > 0 ? '+' : ''}${delta} ${b!.name} for ${names[picked!] ?? 'the person'}` });
      } else await onPost?.({ person, code: b!.code, delta, reason: reason.trim() });
      onOpenChange(false);
      setReason('');
    });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adjust balance"
      description="Adjustments are saved with your reason. They can't be edited later, only reversed."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy === 'post'} onClick={post}>Post adjustment</Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        {error && <InlineAlert tone="danger" title="Not posted">{error}</InlineAlert>}
        {live && loadError && <InlineAlert tone="danger" title="Balances not loaded">{loadError}</InlineAlert>}
        {live ? (
          <FormField id="adj-person" label="Employee" required error={tooEarly.errorOf('adj-person')}>
            <LivePicker kind="people" label="Employee" value={picked} onChange={setPicked} names={names} onPick={(_k, q) => live.onFindPeople(q).then((r) => (setNames((n) => ({ ...n, ...Object.fromEntries(r.map((p) => [p.id, p.label])) })), r))} />
          </FormField>
        ) : !fixedPerson && <FormField label="Employee" required><PersonPicker aria-label="Employee" value={person} onChange={(v) => v && setPerson(v)} people={people} /></FormField>}
        <FormField id="adj-type" label="Leave type" required error={tooEarly.errorOf('adj-type')}><Select value={b?.code ?? code} onChange={(v) => v && setCode(v)} options={balances.map((x) => ({ value: x.code, label: `${x.name} · ${plural(free(x), 'day')} available` }))} /></FormField>
        <FormField label="Direction"><Segment label="Direction" value={dir} onChange={setDir} options={[{ value: 'add', label: 'Add' }, { value: 'deduct', label: 'Deduct' }]} /></FormField>
        <FormField id="adj-days" label="Days" required helper="Half days are fine, e.g. 1.5." error={tooEarly.errorOf('adj-days')}><NumberField value={days} decimals min={0} max={100} onChange={setDays} /></FormField>
        <FormField id="adj-reason" label="Reason" required error={tooEarly.errorOf('adj-reason')}><TextArea rows={2} value={reason} onChange={setReason} maxLength={500} /></FormField>
        {b && <p className="yx-tim-muted">Available after: {plural(avail + delta, 'day')}{b.code !== 'CO' && b.pending > 0 ? ` · ${plural(b.pending, 'day')} held for a pending request` : ''}</p>}
      </div>
    </Dialog>
  );
}

/* =====================================================================
   TIM-21 HR · Balance grid (batch A D10, founder answer 2314): everyone in scope by leave type. Each cell opens a small
   dialog for the corrected balance and a reason; the difference is posted to the ledger and audited. Never below the
   leave type's minimum balance; never one's own (the cell is plain text then).
   ===================================================================== */

export interface BalanceGridPerson {
  employeeId: string;
  name: string;
  code: string | null;
  canAdjust: boolean;
  balances: { leaveTypeId: string; balance: number; hasBalance: boolean; negativeLimit: number }[];
}
export interface BalanceCorrection {
  employeeId: string;
  leaveTypeId: string;
  from: number;
  to: number;
  reason: string;
}
const daysText = (n: number) => `${n} ${Math.abs(n) === 1 ? 'day' : 'days'}`;

export function BalanceGrid({ types, people, onCorrect, open: open0 = null }: {
  types: { id: string; code: string; name: string }[];
  people: BalanceGridPerson[];
  /** Resolves once the ledger line is posted, or throws the server's reason (shown in the dialog). */
  onCorrect: (x: BalanceCorrection) => Promise<unknown>;
  /** Stories: the dialog open on one cell. */
  open?: { employeeId: string; leaveTypeId: string } | null;
}) {
  const [cell, setCell] = useState(open0);
  // Only types someone in the list holds with a balance; unpaid and other kinds have nothing to correct.
  const shown = types.filter((t) => people.some((p) => p.balances.some((b) => b.leaveTypeId === t.id && b.hasBalance)));
  const columns: TableColumn<BalanceGridPerson>[] = [
    { key: 'person', header: 'Employee', type: 'person', value: (p) => p.name, person: (p) => ({ name: p.name, secondary: p.code ?? undefined }), width: 220 },
    ...shown.map((t): TableColumn<BalanceGridPerson> => ({
      key: t.id,
      header: t.code,
      type: 'number',
      width: 96,
      value: (p) => p.balances.find((b) => b.leaveTypeId === t.id && b.hasBalance)?.balance ?? null,
      render: (p) => {
        const b = p.balances.find((x) => x.leaveTypeId === t.id && x.hasBalance);
        if (!b) return <span className="yx-tim-muted" aria-label={`${t.name}: not in ${p.name}'s policy`}>–</span>;
        return p.canAdjust ? (
          <Button size="sm" aria-label={`Correct ${t.name} for ${p.name}: ${daysText(b.balance)}`} onClick={() => setCell({ employeeId: p.employeeId, leaveTypeId: t.id })}>{String(b.balance)}</Button>
        ) : (
          <span aria-label={`${t.name} for ${p.name}: ${daysText(b.balance)}, you can't correct it`}>{String(b.balance)}</span>
        );
      },
    })),
  ];
  const person = cell ? people.find((p) => p.employeeId === cell.employeeId) : undefined;
  const type = cell ? types.find((t) => t.id === cell.leaveTypeId) : undefined;
  const bal = person && type ? person.balances.find((b) => b.leaveTypeId === type.id) : undefined;
  return (
    <>
      <DataTable label="Leave balances by type" columns={columns} rows={people} getRowId={(p) => p.employeeId} pageSize={8} rowNoun={['person', 'people']} empty={<EmptyState title="No one to show" description="People in your HR scope appear here." />} />
      <p className="yx-tim-note">Press a balance to correct it. Each change needs a reason, goes on the ledger as an adjustment and into the audit log. A balance can't go below the leave type's minimum.</p>
      {person && type && bal && (
        <CorrectBalanceDialog key={`${person.employeeId}:${type.id}`} person={person.name} typeName={type.name} from={bal.balance} min={-bal.negativeLimit} onClose={() => setCell(null)} onPost={(to, reason) => onCorrect({ employeeId: person.employeeId, leaveTypeId: type.id, from: bal.balance, to, reason })} />
      )}
    </>
  );
}

function CorrectBalanceDialog({ person, typeName, from, min, onPost, onClose }: { person: string; typeName: string; from: number; min: number; onPost: (to: number, reason: string) => Promise<unknown>; onClose: () => void }) {
  const [to, setTo] = useState<number | null>(from);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  // Never a disabled Post: pressed too early, the errors show and the first field takes focus.
  const tooEarly = useTooEarly([
    ...(to === null ? [{ fieldId: 'cb-to', message: 'Enter the corrected balance.' }] : to === from ? [{ fieldId: 'cb-to', message: 'That is the balance now. Change it first.' }] : to < min ? [{ fieldId: 'cb-to', message: `It can't go below ${daysText(min)}, the leave type's minimum balance.` }] : []),
    ...(reason.trim().length < 3 ? [{ fieldId: 'cb-why', message: 'Say why (it goes on the ledger and the audit log).' }] : []),
  ]);
  const delta = to === null ? 0 : Math.round((to - from) * 100) / 100;
  const post = () => {
    if (tooEarly.stop()) return;
    void run('post', async () => {
      await onPost(to!, reason.trim());
      toast({ tone: 'success', title: `${typeName} for ${person} is now ${daysText(to!)}` });
      onClose();
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Correct balance"
      description={`${person} · ${typeName}. The change goes on the ledger with your reason; it can't be edited later, only corrected again.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'post'} onClick={post}>Post correction</Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        {error && <InlineAlert tone="danger" title="Not posted">{error}</InlineAlert>}
        <FormField id="cb-to" label="Corrected balance (days)" required helper={`Now ${daysText(from)}. Lowest allowed: ${daysText(min)}. Half days are fine.`} error={tooEarly.errorOf('cb-to')}>
          <NumberField value={to} decimals min={-1000} max={1000} onChange={setTo} />
        </FormField>
        <FormField id="cb-why" label="Reason" required error={tooEarly.errorOf('cb-why')}>
          <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} placeholder="For example: opening balance from the old system was wrong" />
        </FormField>
        <p className="yx-tim-muted">{delta === 0 ? 'Nothing to post yet.' : `Posts ${delta > 0 ? '+' : ''}${daysText(delta)} to the ledger.`}</p>
      </div>
    </Dialog>
  );
}

/* =====================================================================
   TIM-17 · Leave home (role-based)
   ===================================================================== */

/** Who is away this week (28 Sep – 4 Oct), for the people in scope. */
function awayThisWeek(scope: string[]) {
  const start = addDays(TODAY0, -((TODAY0.getDay() + 6) % 7));
  const end = addDays(start, 6);
  // One row per absence (not per working-day piece), and only if some of it falls on a working day this week.
  return TEAM_ABSENCES.filter((a) => scope.includes(a.memberId) && a.start <= end && a.end >= start && workingSegments(a).length > 0);
}

/** `gone`: requests decided on this page, so their Pending badge drops. */
function AwayList({ items, gone = [] }: { items: Absence[]; gone?: string[] }) {
  if (items.length === 0) return <EmptyState compact title="Everyone's in this week" />;
  return (
    <ul className="yx-tim-list">
      {items.map((a) => {
        const name = memberName(a.memberId);
        return (
          <li key={`${a.memberId}-${a.start.getTime()}`}>
            <PersonLabel name={name} secondary={`${LEAVE_NAME[a.code] ?? a.code} · ${absenceDates(a)}`} />
            {pendingFor(name, a.start, a.end, gone) && <Badge tone="neutral">Pending</Badge>}
          </li>
        );
      })}
    </ul>
  );
}

const OPTIONAL_ALLOWED = 2;
const OPTIONAL_DEFAULT = ['o1'];
/** Comp-off is used before it expires (14 Oct), so "Use comp-off" starts on Mon 5 Oct. */
const CO_USE_DAY = new Date(2026, 9, 5);
const applyTypeProps = (t?: LeaveCode): ApplyLeaveProps => (t === 'CO' ? { type: 'CO', from: CO_USE_DAY, to: CO_USE_DAY } : t ? { type: t } : {});

/** TIM-17: the story shows the sample (persona, state); the app passes `live` (My leave, the signed-in employee). */
export function LeaveHomeScreen({ persona = 'emp', state = 'ready', live, hrLive, mgrLive, dialog }: { persona?: LeavePersona; state?: ViewState; live?: LiveLeaveHome; /** The app: HR's view of leave in their scope (TIM-17 HR). */ hrLive?: LiveHrLeaveHome; /** The app: a manager's own team (TIM-17 Manager, TIM-19 Manager). */ mgrLive?: LiveMgrLeaveHome; /** HR stories: Record long absence open, filled in (`absence-conflict`: leave in the way); Apply for someone open for Arun (`apply-refused`: a company block date in the way). */ dialog?: 'absence' | 'absence-conflict' | 'apply' | 'apply-refused' }) {
  if (hrLive) return <LiveHrLeaveHomeScreen live={hrLive} />;
  if (mgrLive) return <LiveMgrLeaveHomeScreen live={mgrLive} />;
  if (live) return <LiveLeaveHomeScreen live={live} />;
  const user: TimeUser = persona === 'hr' ? HR_ADMIN : ME;
  const [apply, setApply] = useState(dialog === 'apply' || dialog === 'apply-refused');
  // "Use comp-off" opens Apply leave on Comp-off; the header button on the default type.
  const [applyType, setApplyType] = useState<LeaveCode | undefined>(undefined);
  const startApply = (t?: LeaveCode) => {
    setApplyType(t);
    setApply(true);
  };
  const [adjust, setAdjust] = useState(false);
  const [recording, setRecording] = useState(dialog === 'absence' || dialog === 'absence-conflict');
  const [holidays, setHolidays] = useState(false);
  // No requests yet: no optional holiday taken either.
  const [optional, setOptional] = useState(state === 'empty' ? [] : OPTIONAL_DEFAULT);
  const [open, setOpen] = useState<{ r: LeaveRequestRow; action?: ReqAction; viewer: 'emp' | 'mgr' } | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const { toast } = useToast();
  const setMsg = (m: string) => void toast({ title: m, tone: 'success' });
  const [reminded, setReminded] = useState<string[]>([]);
  // Retry re-runs the load: back to loading, then the page.
  const [retried, setRetried] = useState<ViewState | null>(null);
  const st = retried ?? state;
  const retry = () => {
    setRetried('loading');
    window.setTimeout(() => setRetried('ready'), 800);
  };
  const mine = LEAVE_REQUESTS.filter((r) => r.person === ME.name && !gone.includes(r.id));
  const lr1 = LEAVE_REQUESTS.find((r) => r.id === 'lr1')!;
  const lr1Gone = gone.includes(lr1.id);
  const waiting = LEAVE_REQUESTS.filter((r) => r.status === 'Pending' && r.approver === ME.name && !gone.includes(r.id));
  const allPending = LEAVE_REQUESTS.filter((r) => r.status === 'Pending');
  const scope = persona === 'hr' ? TEAM.map((p) => p.id) : myReports().map((p) => p.id);
  const certs = LEAVE_REQUESTS.filter((r) => r.cert === 'pending');
  const negative = NEGATIVE_BALANCES.length;
  // Requests decided here leave the nav count too.
  const counts = timeCounts(user);
  const navCounts = { ...counts, Requests: counts.Requests - LEAVE_REQUESTS.filter((r) => gone.includes(r.id) && r.status === 'Pending' && r.person !== user.name).length };
  // The nav's Requests count also holds attendance, overtime and comp-off requests: say how many, so the numbers agree.
  const otherWaiting = Math.max(0, navCounts.Requests - waiting.length);
  const decided = (id: string) => (m: string) => {
    setGone((g) => [...g, id]);
    setMsg(m);
  };
  return (
    <TimePage active={persona === 'emp' ? 'My leave' : 'Team leave'} user={user} counts={navCounts}>
      <PageHeader
        title={persona === 'emp' ? 'My leave' : persona === 'mgr' ? 'Team leave' : 'Leave · Kaveri Foods'}
        description={persona === 'hr' ? 'Leave year Jan–Dec 2026 · 248 people · 3 policies' : 'Leave year Jan–Dec 2026 · Chennai office holiday calendar'}
        actions={<div className="yx-tim-row">{persona === 'hr' && <Button onClick={() => setRecording(true)}>Record long absence</Button>}{persona === 'hr' && <Button onClick={() => setAdjust(true)}>Adjust balance</Button>}<Button variant="primary" icon={CalendarPlus} onClick={() => startApply()}>{persona === 'emp' ? 'Apply leave' : 'Apply for someone'}</Button></div>}
      />
      {st === 'loading' ? <LoadingBlock rows={8} /> : st === 'error' ? (
        <ErrorState title={persona === 'emp' ? "Your leave didn't load" : "Leave didn't load"} description={persona === 'emp' ? 'Try again. Your requests are safe.' : 'Try again. No requests were changed.'} onRetry={retry} reference="LV-8820" />
      ) : (
        <>
          
          {persona === 'emp' && (
            <>
              {/* No requests yet: the full year's credit, nothing used or pending. A withdrawn request leaves the pending count. */}
              <BalanceCards
                balances={st === 'empty' ? BALANCES.map((b) => ({ ...b, taken: 0, pending: 0, balance: b.credited + (b.carried ?? 0) })) : lr1Gone ? BALANCES.map((b) => (b.name === lr1.type ? { ...b, pending: Math.max(0, b.pending - lr1.days) } : b)) : BALANCES}
                onViewPending={st === 'empty' || lr1Gone ? undefined : () => setOpen({ r: lr1, viewer: 'emp' })}
                onUseCompOff={() => startApply('CO')}
              />
              <div className="yx-tim-grid">
                <div data-span="7">
                  <Card title="My requests">
                    {st === 'empty' || mine.length === 0 ? (
                      <EmptyState compact title="No leave requests yet" description="Apply for leave and it will show here with its status." action={<Button variant="primary" icon={CalendarPlus} onClick={() => startApply()}>Apply leave</Button>} />
                    ) : (
                      <MyRequests rows={mine} onOpen={(r, action) => setOpen({ r, action, viewer: 'emp' })} />
                    )}
                  </Card>
                </div>
                <div data-span="5">
                  <Card title="Upcoming holidays">
                    <HolidayList optional={optional} />
                    <Button size="sm" onClick={() => setHolidays(true)}>{optionalText(optional, OPTIONAL_ALLOWED)}</Button>
                  </Card>
                </div>
              </div>
            </>
          )}
          {persona === 'mgr' && (
            <div className="yx-tim-grid">
              <div data-span="7">
                <Card title={`Leave waiting for you (${waiting.length})`} actions={<LinkButton size="sm" to={STORY.requests}>All requests</LinkButton>}>
                  {otherWaiting > 0 && <p className="yx-tim-note">Also in Requests: {plural(otherWaiting, 'attendance or overtime request')}</p>}
                  {waiting.length === 0 ? <EmptyState compact title="Nothing waiting for you" description="New requests from your team show here." /> : (
                    <ul className="yx-tim-list">
                      {waiting.map((r) => (
                        <li key={r.id}>
                          <span className="yx-tim-list__main" style={MAIN}>
                            <PersonLabel name={r.person} secondary={`${r.type} · ${reqDates(r)}`} />
                            <span className="yx-tim-muted">{othersLine(othersOff(r.person, r.from, r.to))}{r.cert ? ` · ${certText(r.cert)}` : ''}</span>
                          </span>
                          <span className="yx-tim-row">
                            <Button size="sm" onClick={() => setOpen({ r, action: 'sendback', viewer: 'mgr' })}>Send back</Button>
                            <Button variant="approve" size="sm" onClick={() => decided(r.id)(`Approved · ${r.person}, ${absenceDates(requestAbsence(r), false)}`)}>Approve</Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
              <div data-span="5" className="yx-tim-stack">
                <Card title="Away this week" actions={<LinkButton size="sm" to={STORY.calendarMgr}>Open leave calendar</LinkButton>}><AwayList items={awayThisWeek(scope)} gone={gone} /></Card>
              </div>
            </div>
          )}
          {persona === 'hr' && (
            <div className="yx-tim-grid">
              <div data-span="7">
                <Card title={`Pending leave with managers (${allPending.length})`} actions={<LinkButton size="sm" to={STORY.requests}>Open requests</LinkButton>}>
                  <ul className="yx-tim-list">
                    {allPending.map((r) => {
                      const age = -daysUntil(r.applied, TODAY);
                      return (
                        <li key={r.id}>
                          <span className="yx-tim-list__main" style={MAIN}>
                            <PersonLabel name={r.person} secondary={`${r.type} · ${reqDates(r)}`} />
                            <span className="yx-tim-muted">Waiting for {r.approver} · sent {age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`}</span>
                          </span>
                          {age > 2 && (reminded.includes(r.id) ? <span className="yx-tim-muted">Reminded</span> : <Button size="sm" onClick={() => setReminded((x) => [...x, r.id])}>Remind approver</Button>)}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </div>
              <div data-span="5" className="yx-tim-stack">
                <Card title="Away this week" actions={<LinkButton size="sm" to={STORY.calendarHr}>Open leave calendar</LinkButton>}><AwayList items={awayThisWeek(scope)} gone={gone} /></Card>
                <Card title="Needs HR">
                  <ul className="yx-tim-list">
                    <li>
                      <span className="yx-tim-list__main" style={MAIN}><span>Negative balances</span><span className="yx-tim-muted">{negative === 0 ? 'No one is below zero' : plural(negative, 'person', 'people')}</span></span>
                      <LinkButton size="sm" to={STORY.negative}>Review balances</LinkButton>
                    </li>
                    <li>
                      <span className="yx-tim-list__main" style={MAIN}><span>Certificates to verify</span><span className="yx-tim-muted">{certs.length === 0 ? 'None' : certs.map((r) => `${r.person} · ${r.type} ${span(r.from, r.to)}`).join(', ')}</span></span>
                      {certs.length > 0 && <LinkButton size="sm" to={STORY.certificate}>Verify certificate</LinkButton>}
                    </li>
                    <li><span>Year-end 2026</span><Badge tone="neutral">Opens 1 Dec</Badge></li>
                  </ul>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
      <ApplyLeavePanel key={`${apply}-${applyType}`} open={apply} onOpenChange={setApply} {...applyTypeProps(applyType)} forSomeone={persona === 'emp' ? undefined : pickPeople(persona === 'hr')} picked={dialog === 'apply' || dialog === 'apply-refused' ? 'Arun Prakash' : null} blocked={dialog === 'apply-refused'} />
      {persona === 'hr' && (
        <RecordAbsenceDialog
          open={recording}
          onOpenChange={setRecording}
          {...sampleRecordAbsence}
          onRecord={async (x) => setMsg(`${x.kind === 'lwp' ? 'Long leave without pay' : 'Sabbatical'} recorded · ${TEAM.find((t) => t.id === x.employeeId)?.name ?? ''}, ${formatDate(isoDate(x.from))} – ${formatDate(isoDate(x.to))}`)}
          names={Object.fromEntries(TEAM.map((t) => [t.id, t.name]))}
          initial={dialog === 'absence' ? { employeeId: 't6', kind: 'sabbatical', from: new Date(2026, 10, 2), to: new Date(2027, 3, 30), note: 'Sabbatical for a course in quality systems' } : dialog === 'absence-conflict' ? { employeeId: 't1', kind: 'lwp', from: new Date(2026, 9, 15), to: new Date(2026, 11, 31), note: 'Long unpaid leave to care for a parent' } : undefined}
        />
      )}
      {persona === 'hr' && <AdjustBalanceDialog open={adjust} onOpenChange={setAdjust} onPost={(e) => setMsg(`Posted ${e.delta > 0 ? '+' : ''}${e.delta} ${LEAVE_NAME[e.code]} for ${e.person}`)} />}
      {persona === 'emp' && <OptionalHolidaysPanel key={optional.join()} open={holidays} onOpenChange={setHolidays} chosen={optional} onSave={(s) => { setMsg(optionalSavedText(optional, s)); setOptional(s); }} />}
      {open && <LeaveRequestView key={`${open.r.id}-${open.action}`} r={open.r} viewer={open.viewer} action={open.action} open onOpenChange={(o) => !o && setOpen(null)} onDecided={decided(open.r.id)} />}
    </TimePage>
  );
}

function MyRequests({ rows, onOpen }: { rows: LeaveRequestRow[]; onOpen: (r: LeaveRequestRow, action?: ReqAction) => void }) {
  return (
    <ul className="yx-tim-list">
      {rows.map((r) => {
        const future = day0(r.from) >= TODAY0;
        return (
          <li key={r.id}>
            <span className="yx-tim-list__main" style={MAIN}>
              <strong>{r.type} · {absenceDates(requestAbsence(r), false)}</strong>
              <span className="yx-tim-muted">{plural(r.days, 'day')} · {r.status === 'Pending' ? `Waiting for ${r.approver}` : `${r.status} by ${r.approver}`}</span>
              <span className="yx-tim-row">
                <Badge tone={statusTone(r)}>{r.status}</Badge>
                {future && <DueBadge date={r.from} />}
              </span>
            </span>
            <span className="yx-tim-row">
              <Button size="sm" onClick={() => onOpen(r)}>View</Button>
              {r.status === 'Pending' && <Button size="sm" onClick={() => onOpen(r, 'withdraw')}>Withdraw</Button>}
              {r.status === 'Approved' && future && <Button size="sm" onClick={() => onOpen(r, 'cancel')}>Ask to cancel</Button>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Upcoming holidays from today, with the optional holidays the person has saved (date order). */
function HolidayList({ optional = [] }: { optional?: string[] }) {
  const items = [
    ...HOLIDAYS.map((h) => ({ ...h, optional: false })),
    ...OPTIONAL.filter((o) => optional.includes(o.id)).map((o) => ({ name: o.name, date: o.date, optional: true })),
  ].filter((h) => day0(h.date) >= TODAY0).sort((a, b) => a.date.getTime() - b.date.getTime());
  return (
    <ul className="yx-tim-list">
      {items.map((h) => (
        // The countdown always stays on the right of the name and date, at every width.
        <li key={h.name} style={{ flexWrap: 'nowrap' }}>
          <span className="yx-tim-list__main" style={{ flex: '1 1 auto' }}><span>{h.name}</span><span className="yx-tim-muted"><DayDate date={h.date} />{h.optional ? ' · Optional' : ''}</span></span>
          <DueBadge date={h.date} />
        </li>
      ))}
    </ul>
  );
}

export function LeaveHomePhone({ persona = 'emp' }: { persona?: 'emp' | 'mgr' }) {
  const [apply, setApply] = useState(false);
  const [applyType, setApplyType] = useState<LeaveCode | undefined>(undefined);
  const startApply = (t?: LeaveCode) => {
    setApplyType(t);
    setApply(true);
  };
  const [holidays, setHolidays] = useState(false);
  const [optional, setOptional] = useState(OPTIONAL_DEFAULT);
  const { toast } = useToast();
  const setMsg = (m: string) => void toast({ title: m, tone: 'success' });
  const [open, setOpen] = useState<{ r: LeaveRequestRow; action?: ReqAction } | null>(null);
  const waiting = LEAVE_REQUESTS.filter((r) => r.status === 'Pending' && r.approver === ME.name);
  const otherWaiting = Math.max(0, timeCounts(ME).Requests - waiting.length);
  const lr1 = LEAVE_REQUESTS.find((r) => r.id === 'lr1')!;
  if (open)
    return (
      <PhoneFrame tab="time" title="Leave request" back={<Button size="sm" icon={ChevronLeft} onClick={() => setOpen(null)}>Back</Button>}>
        <LeaveRequestView r={open.r} viewer={persona} action={open.action} surface="inline" />
      </PhoneFrame>
    );
  return (
    <PhoneFrame tab="time" title={persona === 'emp' ? 'Leave' : 'Team leave'}>
      {persona === 'emp' ? (
        <div className="yx-tim-stack">
          
          <Button variant="primary" fullWidth icon={CalendarPlus} onClick={() => startApply()}>Apply leave</Button>
          <BalanceCards compact onViewPending={() => setOpen({ r: lr1 })} onUseCompOff={() => startApply('CO')} />
          <Card title="My requests"><MyRequests rows={LEAVE_REQUESTS.filter((r) => r.person === ME.name)} onOpen={(r, action) => setOpen({ r, action })} /></Card>
          <Card title="Upcoming holidays">
            <div className="yx-tim-stack">
              <HolidayList optional={optional} />
              <Button fullWidth onClick={() => setHolidays(true)}>{optionalText(optional, OPTIONAL_ALLOWED)}</Button>
            </div>
          </Card>
          <ApplyLeavePanel key={`${apply}-${applyType}`} open={apply} onOpenChange={setApply} surface="phone" {...applyTypeProps(applyType)} />
          <OptionalHolidaysPanel key={optional.join()} open={holidays} onOpenChange={setHolidays} surface="phone" chosen={optional} onSave={(s) => { setMsg(optionalSavedText(optional, s)); setOptional(s); }} />
        </div>
      ) : (
        <div className="yx-tim-stack">
          <Button variant="primary" fullWidth icon={CalendarPlus} onClick={() => startApply()}>Apply for someone</Button>
          <Card title={`Leave waiting for you (${waiting.length})`}>
            <div className="yx-tim-stack">
              {otherWaiting > 0 && <p className="yx-tim-note">Also in Requests: {plural(otherWaiting, 'attendance or overtime request')}</p>}
              {waiting.length === 0 ? <EmptyState compact title="Nothing waiting for you" description="New requests from your team show here." /> : (
                <ul className="yx-tim-list">
                  {waiting.map((r) => {
                    const n = othersOff(r.person, r.from, r.to).length;
                    return (
                      <li key={r.id}>
                        <span className="yx-tim-list__main">
                          <strong>{r.person}</strong>
                          <span className="yx-tim-muted">{r.type} · {reqDates(r)} · {n === 0 ? 'no one else off' : `${plural(n, 'other')} off`}</span>
                          {r.cert && <span className="yx-tim-muted">Certificate: {r.cert === 'verified' ? 'verified by HR' : 'HR to verify'}</span>}
                        </span>
                        <Button variant="review" size="sm" onClick={() => setOpen({ r })}>Review</Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <LinkButton to={STORY.requests} fullWidth>All requests</LinkButton>
            </div>
          </Card>
          <Card title="Away this week">
            <div className="yx-tim-stack">
              <AwayList items={awayThisWeek(myReports().map((p) => p.id))} />
              <LinkButton to={STORY.calendarMgr} fullWidth>Open leave calendar</LinkButton>
            </div>
          </Card>
          <ApplyLeavePanel key={String(apply)} open={apply} onOpenChange={setApply} surface="phone" forSomeone={pickPeople(false)} />
        </div>
      )}
    </PhoneFrame>
  );
}

/* =====================================================================
   TIM-19 · Leave request detail + withdraw / cancel
   ===================================================================== */

export function LeaveRequestDetail({ id = 'lr1', persona = 'emp', action, surface = 'desk', live }: { id?: string; persona?: 'emp' | 'mgr'; action?: ReqAction; surface?: 'desk' | 'phone'; /** The app: one of my requests in a drawer. */ live?: LiveRequestProps }) {
  if (live) return <LeaveRequestView live={live} />;
  const base = persona === 'emp' ? LEAVE_REQUESTS.filter((x) => x.person === ME.name) : LEAVE_REQUESTS.filter((x) => x.approver === ME.name);
  const [cur, setCur] = useState<{ r: LeaveRequestRow; action?: ReqAction } | null>({ r: [...LEAVE_REQUESTS, SENT_BACK_REQUEST].find((x) => x.id === id)!, action });
  // Decisions made in the drawer update the list behind it: new status, or gone (withdrawn, sent back).
  const [changed, setChanged] = useState<Record<string, ReqAction>>({});
  const { toast } = useToast();
  const setMsg = (m: string) => void toast({ title: m, tone: 'success' });
  const NEW_STATUS: Partial<Record<ReqAction, LeaveRequestRow['status']>> = { approve: 'Approved', reject: 'Rejected', cancel: 'Cancel requested' };
  const rows = base
    .filter((r) => changed[r.id] !== 'withdraw' && changed[r.id] !== 'sendback')
    .map((r) => (changed[r.id] && NEW_STATUS[changed[r.id]] ? { ...r, status: NEW_STATUS[changed[r.id]]!, decided: r.decided ?? TODAY } : r));
  const counts = timeCounts(ME);
  const decidedHere = base.filter((r) => r.status === 'Pending' && r.person !== ME.name && ['approve', 'reject', 'sendback'].includes(changed[r.id] ?? '')).length;
  const navCounts = { ...counts, Requests: counts.Requests - decidedHere };
  const onDecided = (r: LeaveRequestRow) => (m: string, a: ReqAction) => {
    if (a !== 'report') setChanged((c) => ({ ...c, [r.id]: a }));
    setMsg(m);
  };
  const list = persona === 'emp' ? <MyRequests rows={rows} onOpen={(r, a) => setCur({ r, action: a })} /> : (
    <ul className="yx-tim-list">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="yx-tim-list__main" style={MAIN}>
            <PersonLabel name={r.person} secondary={`${r.type} · ${reqDates(r)}`} />
            <span className="yx-tim-row">
              <Badge tone={statusTone(r)}>{r.status}</Badge>
              {day0(r.from) >= TODAY0 && <DueBadge date={r.from} />}
            </span>
          </span>
          {r.status === 'Pending' ? <Button variant="review" size="sm" onClick={() => setCur({ r })}>Review</Button> : <Button size="sm" onClick={() => setCur({ r })}>View</Button>}
        </li>
      ))}
    </ul>
  );
  const listTitle = persona === 'emp' ? 'My requests' : 'Leave requests from your team';
  if (surface === 'phone') {
    if (cur)
      return (
        <PhoneFrame tab="requests" title="Leave request" back={<Button size="sm" icon={ChevronLeft} onClick={() => setCur(null)}>Back</Button>}>
          <LeaveRequestView key={`${cur.r.id}-${cur.action}`} r={cur.r} viewer={persona} action={cur.action} surface="inline" onDecided={onDecided(cur.r)} />
        </PhoneFrame>
      );
    return (
      <PhoneFrame tab="requests" title={listTitle}>
        <div className="yx-tim-stack">{list}</div>
      </PhoneFrame>
    );
  }
  return (
    <TimePage active={persona === 'emp' ? 'My leave' : 'Requests'} counts={navCounts}>
      <PageHeader title={persona === 'emp' ? 'My leave' : 'Leave requests'} />
      
      {/* The list stays behind the drawer, so closing it lands somewhere useful. */}
      <Card title={listTitle}>{list}</Card>
      {cur && <LeaveRequestView key={`${cur.r.id}-${cur.action}`} r={cur.r} viewer={persona} action={cur.action} open onOpenChange={(o) => !o && setCur(null)} onDecided={onDecided(cur.r)} />}
    </TimePage>
  );
}

/* =====================================================================
   TIM-20 · Team leave calendar
   ===================================================================== */

const CAL_START = new Date(2026, 8, 28);
/** Month view opens on October: today (29 Sep) ends the month and the team's upcoming leave is in October. */
const CAL_MONTH = new Date(2026, 9, 1);
/** True while the media query matches; follows resizes. */
function useMedia(q: string) {
  const has = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [m, setM] = useState(() => has && window.matchMedia(q).matches);
  useEffect(() => {
    if (!has) return;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q, has]);
  return m;
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

/** Who's away, one row per absence (with its dates), grouped This week / Next week / Later. Pending rows can be reviewed. */
function AwayByAbsence({ memberIds, from, days, onReview, gone = [] }: { memberIds: string[]; from: Date; days: number; onReview?: (r: LeaveRequestRow) => void; gone?: string[] }) {
  const to = addDays(from, days - 1);
  const weekEnd = addDays(TODAY0, 6 - ((TODAY0.getDay() + 6) % 7));
  const rows = TEAM_ABSENCES.filter((a) => memberIds.includes(a.memberId) && day0(a.start) <= to && day0(a.end) >= from && workingSegments(a).length > 0).sort((a, b) => a.start.getTime() - b.start.getTime());
  if (rows.length === 0) return <EmptyState compact title={`No one is away ${span(from, to)}`} />;
  const group = (a: (typeof rows)[number]) => (day0(a.start) <= weekEnd ? 'This week' : day0(a.start) <= addDays(weekEnd, 7) ? 'Next week' : 'Later');
  return (
    <div className="yx-tim-stack">
      {['This week', 'Next week', 'Later'].map((g) => {
        const items = rows.filter((a) => group(a) === g);
        if (items.length === 0) return null;
        return (
          <Card key={g} title={g}>
            <ul className="yx-tim-list">
              {items.map((a) => {
                const name = memberName(a.memberId);
                const req = pendingRequest(name, a.start, a.end, gone);
                return (
                  <li key={`${a.memberId}-${a.start.getTime()}`}>
                    <span className="yx-tim-list__main" style={MAIN}>
                      <PersonLabel name={name} secondary={`${LEAVE_NAME[a.code] ?? a.code} · ${absenceDates(a)}`} />
                    </span>
                    {req && (
                      <span className="yx-tim-row">
                        <Badge tone="neutral">Pending</Badge>
                        {/* Someone else decides (HR's view): say whom to chase, as the desktop list does. */}
                        {onReview && req.approver === ME.name ? <Button variant="review" size="sm" onClick={() => onReview(req)}>Review</Button> : <span className="yx-tim-muted">Waiting for {req.approver}</span>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/** Working-day pieces; pending ones get the dashed chip and the Pending legend (decided ids in `gone` count as approved). */
function calendarAbsences(memberIds: string[], gone: string[] = []) {
  return TEAM_ABSENCES.filter((a) => memberIds.includes(a.memberId)).flatMap((a) => {
    const pending = pendingFor(memberName(a.memberId), a.start, a.end, gone);
    return workingSegments(a).map((s) => (pending ? { ...s, pending: true } : s));
  });
}
/** A pending request as an absence, so its dates read the same way as the lists ("1 & 3 Oct · 2 days"). */
const requestAbsence = (r: LeaveRequestRow): Absence => ({
  memberId: TEAM.find((p) => p.name === r.person)?.id ?? r.person,
  start: r.from,
  end: r.to,
  code: Object.keys(LEAVE_NAME).find((k) => LEAVE_NAME[k] === r.type) ?? r.type,
});
/** "1 & 3 Oct · 2 days": a request's dates written the same way as in the Away lists. */
const reqDates = (r: LeaveRequestRow) => absenceDates(requestAbsence(r));

/** TIM-20: the story shows the sample; the app passes `live` (a manager's team, HR's people in scope). */
/** Batch C item 15 (design): the manager's own team's worked days as dots, up to today (HR sees none: answer 2509). */
function sampleDots(ids: string[], absences: TeamAbsence[], start: Date, days: number, off: (id: string, d: Date) => boolean): TeamDayDot[] {
  const out: TeamDayDot[] = [];
  ids.forEach((id, i) => {
    for (let j = 0; j < days; j++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + j);
      if (d > TODAY0 || off(id, d) || absences.some((a) => a.memberId === id && day0(a.start) <= d && d <= day0(a.end))) continue;
      const k = i + j;
      const dot: TeamDotKind = k % 11 === 3 ? 'late' : k % 13 === 5 ? 'remote' : k % 17 === 7 ? 'absent' : k % 19 === 2 ? 'missing' : k % 23 === 4 ? 'half_day' : 'present';
      out.push({ memberId: id, on: d, dot });
    }
  });
  return out;
}

export function TeamLeaveCalendarScreen({ persona = 'mgr', view = 'team', state = 'ready', live }: { persona?: 'mgr' | 'hr'; view?: 'team' | 'month'; state?: ViewState; live?: LiveTeamLeave }) {
  if (live) return <LiveTeamLeaveCalendar live={live} />;
  const hr = persona === 'hr';
  // HR sees each person's location beside the team (Hosur plant people follow a different calendar).
  const members = (hr ? TEAM : myReports()).map((p) => ({ id: p.id, name: p.name, team: hr ? `${p.dept} · ${p.location}` : p.dept }));
  const ids = members.map((m) => m.id);
  const [review, setReview] = useState<LeaveRequestRow | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const { toast } = useToast();
  const absences = calendarAbsences(ids, gone);
  const phoneWidth = useMedia('(max-width: 600px)');
  const days = useMedia('(max-width: 1100px)') ? 7 : 14;
  const [start, setStart] = useState(CAL_START);
  // Phone width: the list starts today and grows two weeks at a time, like the phone app (same first span).
  const [listDays, setListDays] = useState(14);
  const [tab, setTab] = useState<string>(view);
  // The month on screen in the Month tab (follows its arrows and Today).
  const [calMonth, setCalMonth] = useState(CAL_MONTH);
  // Narrow month cells: first name only, so who is away is never cut off.
  const narrowMonth = useMedia('(max-width: 900px)');
  const events: CalendarEvent[] = absences.map((a, i) => {
    const [fn, ln] = memberName(a.memberId).split(' ');
    // Pending shows as a dashed chip (no text prefix to be cut off).
    return { id: `e${i}`, title: `${a.code} · ${narrowMonth ? fn : `${fn} ${ln?.[0] ?? ''}.`}`, start: a.start, end: a.end, allDay: true, type: 'leave', pending: a.pending };
  });
  const pending = LEAVE_REQUESTS.filter((r) => r.status === 'Pending' && !gone.includes(r.id) && TEAM.some((p) => p.name === r.person && ids.includes(p.id)));
  const empty = state === 'empty';
  const loading = state === 'loading';
  // Export follows the range on screen: the phone list, the month shown, or the week grid.
  const month = !phoneWidth && tab === 'month';
  const exFrom = phoneWidth ? TODAY0 : month ? new Date(calMonth.getFullYear(), calMonth.getMonth(), 1) : start;
  const exTo = month ? new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0) : addDays(exFrom, (phoneWidth ? listDays : days) - 1);
  const exLabel = month ? `${MON[calMonth.getMonth()]} ${calMonth.getFullYear()}` : span(exFrom, exTo);
  const exportCsv = () =>
    downloadCsv(`leave-calendar-${month ? exLabel : `${dm(exFrom)}-${dm(exTo)}`}.csv`, [
      ['Person', 'Team', 'Leave', 'From', 'To', 'Status'],
      ...TEAM_ABSENCES.filter((a) => ids.includes(a.memberId) && day0(a.start) <= exTo && day0(a.end) >= exFrom).map((a) => {
        const name = memberName(a.memberId);
        return [name, members.find((m) => m.id === a.memberId)?.team ?? '', LEAVE_NAME[a.code] ?? a.code, formatDate(a.start), formatDate(a.end), pendingFor(name, a.start, a.end, gone) ? 'Pending' : 'Approved'];
      }),
    ]);
  const nav = (
    <div className="yx-tim-row">
      <Button size="sm" icon={ChevronLeft} onClick={() => setStart(addDays(start, -7))}>Previous week</Button>
      <Button size="sm" icon={ChevronRight} onClick={() => setStart(addDays(start, 7))}>Next week</Button>
    </div>
  );
  const pendingList = pending.length > 0 && (
    <Card title={`Waiting for approval (${pending.length})`}>
      <ul className="yx-tim-list">
        {pending.map((r) => (
          <li key={r.id}>
            <span className="yx-tim-list__main" style={MAIN}><PersonLabel name={r.person} secondary={`${r.type} · ${absenceDates(requestAbsence(r))}`} /></span>
            {!hr && r.approver === ME.name ? <Button variant="review" size="sm" onClick={() => setReview(r)}>Review</Button> : <span className="yx-tim-muted">Waiting for {r.approver}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
  return (
    <TimePage active="Leave calendar" user={hr ? HR_ADMIN : ME}>
      <PageHeader
        title="Leave calendar"
        description={hr ? 'All teams · all locations' : `Your team · ${ME.department} · ${plural(members.length, 'person', 'people')}`}
        actions={empty || loading ? <Button icon={Download} onClick={() => toast({ title: loading ? 'Still loading: export once the calendar shows' : 'Nothing to export in this range', tone: 'warning' })}>Export</Button> : <Button icon={Download} onClick={exportCsv}>Export {exLabel}</Button>}
      />
      {loading ? <LoadingBlock rows={8} /> : empty ? (
        <EmptyState title={`No one is away ${span(start, addDays(start, 27))}`} description={hr ? 'Leave shows here as soon as someone requests it.' : 'Leave shows here as soon as someone in your team requests it.'} action={<Button onClick={() => setStart(addDays(start, 28))}>Next 4 weeks</Button>} />
      ) : phoneWidth ? (
        // A people × days grid can't fit a phone: the same "who's away" list as the phone app.
        // The header already names the team, so only the range shows here.
        <div className="yx-tim-stack">
          <p className="yx-tim-muted">{span(TODAY0, addDays(TODAY0, listDays - 1))}</p>
          <AwayByAbsence memberIds={ids} from={TODAY0} days={listDays} onReview={hr ? undefined : setReview} gone={gone} />
          <Button fullWidth onClick={() => setListDays(listDays + 14)}>Next 2 weeks</Button>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Calendar views"><TabsTrigger value="team">People × days</TabsTrigger><TabsTrigger value="month">Month</TabsTrigger></TabsList>
          <TabsContent value="team">
            <div className="yx-tim-stack">
              {nav}
              <TeamCalendar members={members} absences={absences} holidays={HOLIDAYS} start={start} days={days} today={TODAY} team={hr ? undefined : ME.department} memberOff={(id, d) => personOff(memberName(id), d)} dots={hr ? undefined : sampleDots(ids, absences, start, days, (id, d) => personOff(memberName(id), d))} />
              {pendingList}
            </div>
          </TabsContent>
          <TabsContent value="month">
            <div className="yx-tim-stack">
              {/* Opens on October, where the team's upcoming leave is (today, 29 Sep, is still marked). */}
              <Calendar events={events} holidays={HOLIDAYS} defaultDate={TODAY} month={CAL_MONTH} today={TODAY} views={['month']} hideTypeLabel onDateChange={(d) => setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1))} aria-label="Team leave, month" />
              <p className="yx-tim-note">Solid chip: approved · Dashed chip: pending · Shaded day: holiday or weekly off</p>
              {pendingList}
            </div>
          </TabsContent>
        </Tabs>
      )}
      {review && <LeaveRequestView key={review.id} r={review} viewer="mgr" open onOpenChange={(o) => !o && setReview(null)} onDecided={(m) => { setGone((g) => [...g, review.id]); toast({ title: m, tone: 'success' }); }} />}
    </TimePage>
  );
}

/** Phone: a "who's away" list by day instead of a grid that only fits two days. */
export function TeamLeaveCalendarPhone() {
  const [days, setDays] = useState(14);
  const [review, setReview] = useState<LeaveRequestRow | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const { toast } = useToast();
  if (review)
    return (
      <PhoneFrame tab="time" title="Leave request" back={<Button size="sm" icon={ChevronLeft} onClick={() => setReview(null)}>Back</Button>}>
        <LeaveRequestView r={review} viewer="mgr" surface="inline" onDecided={(m) => { setGone((g) => [...g, review.id]); toast({ title: m, tone: 'success' }); }} />
      </PhoneFrame>
    );
  return (
    <PhoneFrame tab="time" title="Who's away">
      <div className="yx-tim-stack">
        <p className="yx-tim-muted">Your team · {ME.department} · {span(TODAY0, addDays(TODAY0, days - 1))}</p>
        <AwayByAbsence memberIds={myReports().map((p) => p.id)} from={TODAY0} days={days} onReview={setReview} gone={gone} />
        <Button fullWidth onClick={() => setDays(days + 14)}>Next 2 weeks</Button>
      </div>
    </PhoneFrame>
  );
}

/* =====================================================================
   TIM-21 · Leave card (balances, ledger timeline, projection; HR adjust)
   ===================================================================== */

const AUTO = { name: 'System' };
/** Divya's 2026 ledger: each card's balance is the sum of its rows (credited + carried − taken). */
const LEDGER: TimelineItem[] = [
  { id: 'l1', at: new Date(2026, 8, 27, 10, 42), actor: { name: ME.name }, action: 'requested 2 days Earned leave (12–13 Oct) · pending' },
  { id: 'l2', at: new Date(2026, 8, 23, 17, 10), actor: { name: ME.manager }, action: 'approved −0.5 Casual leave (24 Sep, second half)' },
  { id: 'l2b', at: new Date(2026, 8, 22, 10, 30), actor: { name: ME.manager }, action: 'approved −1 Casual leave (30 Oct)' },
  { id: 'l3', at: new Date(2026, 8, 14, 18, 30), actor: AUTO, action: 'credited +1 Comp-off (worked 14 Sep holiday) · use by 14 Oct' },
  { id: 'l4', at: new Date(2026, 8, 10, 11, 5), actor: { name: ME.manager }, action: 'approved −2 Casual leave (16–17 Sep)' },
  { id: 'l5', at: new Date(2026, 7, 31, 18, 0), actor: AUTO, action: 'recorded 1 day Leave without pay (21 Aug, no leave applied)' },
  { id: 'l6', at: new Date(2026, 7, 20, 10, 15), actor: { name: ME.manager }, action: 'approved −1 Earned leave (27 Aug)' },
  { id: 'l7', at: new Date(2026, 7, 14, 9, 20), actor: { name: ME.manager }, action: 'approved −2 Sick leave (12–13 Aug)' },
  { id: 'l8', at: new Date(2026, 5, 8, 16, 40), actor: { name: ME.manager }, action: 'approved −1 Casual leave (9 Jun)' },
  { id: 'l9', at: new Date(2026, 3, 20, 11, 0), actor: { name: ME.manager }, action: 'approved −4 Earned leave (4–7 May)' },
  { id: 'l10', at: new Date(2026, 0, 1, 0, 5), actor: AUTO, action: 'credited 2026 leave: +15 Earned, +8 Casual, +8 Sick' },
  { id: 'l11', at: new Date(2026, 0, 1, 0, 5), actor: AUTO, action: 'carried +4 Earned leave from 2025' },
];

/**
 * Another person's 2026 ledger, built from their balances so every card still sums to its rows (credited + carried −
 * taken). ponytail: taken is one total per leave type; per-request rows when people get their own ledger data.
 */
function ledgerFor(person: string): TimelineItem[] {
  const bs = balancesFor(person);
  const pending: TimelineItem[] = LEAVE_REQUESTS.filter((r) => r.person === person && r.status === 'Pending').map((r) => ({
    id: `p-${r.id}`, at: r.applied, actor: { name: person }, action: `requested ${plural(r.days, 'day')} ${r.type} (${span(r.from, r.to)}) · pending`,
  }));
  const taken: TimelineItem[] = bs.filter((b) => b.taken > 0).map((b) => ({
    id: `t-${b.code}`, at: new Date(2026, 8, 28, 18, 0), actor: AUTO, action: `${b.paid ? 'deducted −' : 'recorded '}${b.taken} ${b.name} taken in 2026 so far`,
  }));
  const credits = bs.filter((b) => b.credited > 0).map((b) => `+${b.credited} ${b.name.replace(' leave', '')}`);
  const carried: TimelineItem[] = bs.filter((b) => b.carried).map((b) => ({
    id: `c-${b.code}`, at: new Date(2026, 0, 1, 0, 5), actor: AUTO, action: `carried +${b.carried} ${b.name} from 2025`,
  }));
  return [
    ...pending,
    ...taken,
    ...(credits.length ? [{ id: 'cr', at: new Date(2026, 0, 1, 0, 5), actor: AUTO, action: `credited 2026 leave: ${credits.join(', ')}` }] : []),
    ...carried,
  ];
}

let adjSeq = 0;
/** Bordered "Reverse" on an HR adjustment row; turns into "Reversed" once used. */
function ReverseButton({ onReverse }: { onReverse: () => void }) {
  const [done, setDone] = useState(false);
  return done ? <span className="yx-tim-muted">Reversed</span> : <Button size="sm" onClick={() => { setDone(true); onReverse(); }}>Reverse</Button>;
}

/** The leave year ends 31 Dec; the whole year is credited on 1 Jan, so nothing more is credited before then. */
const YEAR_END = new Date(2026, 11, 31);

/** Balance on `on`: today's balance − pending days that start by then, to the half day. Pending is not certain, so the note says what happens if it isn't approved. */
function projectBalance(b: LeaveBalance, on: Date, person = ME.name) {
  const pending = LEAVE_REQUESTS.filter((r) => r.person === person && r.status === 'Pending' && r.type === b.name && r.from <= day0(on));
  const pendingDays = pending.reduce((a, r) => a + r.days, 0);
  const value = Math.floor((b.balance - pendingDays) * 2) / 2;
  const note = pendingDays
    ? `If the ${pending.map((r) => span(r.from, r.to)).join(', ')} request${pending.length > 1 ? 's are' : ' is'} approved · ${plural(b.balance, 'day')} if not`
    : 'Nothing pending · no more credit before 31 Dec';
  return { value, note };
}

export function LeaveCardScreen({ persona = 'emp', adjustOpen = false, surface = 'desk', person: personArg, view: view0 = 'card', correctOpen = false, cancelDaysOpen = false, live, mine }: {
  /** HR stories (answer 2325): Cancel some days open on the person's approved leave. */
  cancelDaysOpen?: boolean;
  persona?: 'emp' | 'hr'; adjustOpen?: boolean; surface?: 'desk' | 'phone';
  /** HR: one person's card, or everyone's balances by type (batch A D10). */
  view?: 'card' | 'grid';
  /** HR grid stories: the correction dialog open on Priya's earned leave. */
  correctOpen?: boolean;
  /** HR view only: whose card (default the signed-in employee, ME). */
  person?: string;
  /** The app (HR › Leave balances): everyone in HR's scope, one card at a time. */
  live?: LiveLeaveCard;
  /** The app (Me › My leave card): my own ledger and projection. */
  mine?: LiveMyLeaveCard;
}) {
  if (mine) return <LiveMyLeaveCardScreen live={mine} />;
  if (live) return <LiveLeaveCardScreen live={live} />;
  if (persona === 'hr' && view0 === 'grid' && surface === 'desk') return <SampleBalanceGridScreen correctOpen={correctOpen} />;
  const person = persona === 'hr' && personArg ? personArg : ME.name;
  const isMe = person === ME.name;
  const who = isMe ? ME : TEAM.find((p) => p.name === person);
  const [adj, setAdj] = useState(adjustOpen);
  // Answer 2325: HR's view of the person's approved leave, with Cancel some days (the drawer's HR mode).
  const hrApproved = LEAVE_REQUESTS.filter((r) => r.person === person && r.status === 'Approved');
  const [hrCancel, setHrCancel] = useState<LeaveRequestRow | null>(cancelDaysOpen ? (hrApproved.find((r) => r.days > 1) ?? null) : null);
  const [apply, setApply] = useState<LeaveCode | null>(null);
  const [viewReq, setViewReq] = useState(false);
  const [projDate, setProjDate] = useState<Date | null>(new Date(2026, 11, 1));
  const [balances, setBalances] = useState(() => (isMe ? BALANCES : balancesFor(person)));
  const [ledger, setLedger] = useState(() => (isMe ? LEDGER : ledgerFor(person)));
  const el = balances.find((b) => b.code === 'EL');
  const proj = projDate && el ? projectBalance(el, projDate, person) : null;
  const whose = persona === 'emp' ? 'my' : `${first(person)}'s`;
  const phone = surface === 'phone';
  const stacked = useMedia('(max-width: 1023px)');
  // HR opens the request read-only (viewer "mgr" without approval rights shows who it's waiting for).
  const reqViewer = persona === 'hr' ? 'mgr' : 'emp';
  const lr1 = LEAVE_REQUESTS.find((r) => (isMe ? r.id === 'lr1' : r.person === person && r.status === 'Pending'));
  const post =(e: { code: string; delta: number; reason: string }, reversal = false) => {
    const id = `adj${++adjSeq}`;
    setBalances((bs) => bs.map((b) => (b.code === e.code ? { ...b, balance: b.balance + e.delta, credited: b.credited + e.delta } : b)));
    const text = `${e.delta > 0 ? 'added +' : 'deducted −'}${Math.abs(e.delta)} ${LEAVE_NAME[e.code]} · ${e.reason}`;
    // HR can reverse an adjustment (never edit it): Reverse posts the opposite entry.
    const action = reversal ? text : (
      <span className="yx-tim-row">
        <span>{text}</span>
        <ReverseButton onReverse={() => post({ code: e.code, delta: -e.delta, reason: `reverses the adjustment of ${dm(TODAY0)}` }, true)} />
      </span>
    );
    setLedger((l) => [{ id, at: TODAY, actor: { name: HR_ADMIN.name }, action }, ...l]);
  };
  const ledgerCard = (
    <Card title={`History · every change to ${persona === 'emp' ? 'your' : 'the'} balance`}>
      <Timeline today={TODAY} aria-label="Leave history" items={ledger} />
      <p className="yx-tim-note">Each balance is the sum of its entries. Pending requests are listed here and held from what's available until decided.</p>
    </Card>
  );
  const projCard = (
    <Card title={`What will ${whose} balance be?`}>
      <FormField label="On date" helper="Leave year ends 31 Dec"><DatePicker value={projDate} onChange={setProjDate} min={TODAY0} max={YEAR_END} /></FormField>
      {proj && projDate && <Kpis items={[{ label: `Earned leave on ${dm(projDate)}`, value: plural(proj.value, 'day'), note: proj.note }]} />}
    </Card>
  );
  const body = (
    <div className="yx-tim-stack">
      {phone && persona === 'emp' && <Button variant="primary" fullWidth icon={CalendarPlus} onClick={() => setApply('EL')}>Apply leave</Button>}
      <BalanceCards compact={phone} balances={balances} onViewPending={() => setViewReq(true)} onUseCompOff={persona === 'emp' ? () => setApply('CO') : undefined} />
      {surface === 'phone' ? <>{projCard}{ledgerCard}</> : (
        <div className="yx-tim-grid">
          <div data-span="7">{ledgerCard}</div>
          {/* Stacked (below 1024): the projection comes before the long ledger, as on the phone. */}
          <div data-span="5" style={stacked ? { order: -1 } : undefined}>
            <div className="yx-tim-stack">
              {projCard}
              {persona === 'hr' && hrApproved.length > 0 && (
                <Card title="Approved leave">
                  <ul className="yx-tim-list" aria-label="Approved leave">
                    {hrApproved.map((r) => (
                      <li key={r.id}>
                        <span className="yx-tim-list__main"><strong>{r.type} · {span(r.from, r.to)}</strong><span className="yx-tim-muted">{plural(r.days, 'day')}</span></span>
                        {r.days > 1 && <Button size="sm" onClick={() => setHrCancel(r)}>Cancel some days</Button>}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
  const extras = (
    <>
      {apply && <ApplyLeavePanel key={apply} type={apply} from={new Date(2026, 9, 5)} to={new Date(2026, 9, 5)} open onOpenChange={(o) => !o && setApply(null)} surface={surface} />}
      {viewReq && !phone && lr1 && <LeaveRequestView r={lr1} viewer={reqViewer} open onOpenChange={setViewReq} />}
      {hrCancel && <CancelSomeDaysDrawer hr days={eachIso(hrCancel.from, hrCancel.to).filter((on) => dayOfIso(on).getDay() !== 0).map((on) => ({ on, portion: 1 }))} today={ymd(TODAY0)} onSend={async () => undefined} onClose={() => setHrCancel(null)} />}
    </>
  );
  if (phone && viewReq && lr1)
    return (
      <PhoneFrame tab="time" title="Leave request" back={<Button size="sm" icon={ChevronLeft} onClick={() => setViewReq(false)}>Back</Button>}>
        <LeaveRequestView r={lr1} viewer={reqViewer} surface="inline" />
      </PhoneFrame>
    );
  if (phone) return <PhoneFrame tab="time" title="Leave balance">{body}{extras}</PhoneFrame>;
  return (
    <TimePage active={persona === 'emp' ? 'My leave' : 'Team leave'} user={persona === 'hr' ? HR_ADMIN : ME}>
      <PageHeader
        title={persona === 'emp' ? 'My leave card' : `Leave card · ${person}`}
        description={isMe ? `Leave year 2026 · policy: Staff (Chennai)${persona === 'hr' ? ` · ${ME.code} · ${ME.role}` : ''}` : `Leave year 2026${who ? ` · ${who.code} · ${who.role}` : ''}`}
        actions={persona === 'hr' ? <div className="yx-tim-row"><LinkButton to={STORY.leaveHomeHr}>Back to Team leave</LinkButton><LinkButton to={STORY.balanceGrid}>Balance grid</LinkButton><Button variant="primary" onClick={() => setAdj(true)}>Adjust balance</Button></div> : <Button variant="primary" icon={CalendarPlus} onClick={() => setApply('EL')}>Apply leave</Button>}
      />
      {body}
      {extras}
      <AdjustBalanceDialog
        open={adj}
        onOpenChange={setAdj}
        person={person}
        onPost={(e) => post(e)}
      />
    </TimePage>
  );
}

/** TIM-21 HR · Balance grid with sample data: the people HR sees, their paid balances; a correction updates the cell. */
function SampleBalanceGridScreen({ correctOpen }: { correctOpen: boolean }) {
  const types = BALANCES.filter((b) => b.paid).map((b) => ({ id: b.code, code: b.code, name: b.name }));
  const [people, setPeople] = useState<BalanceGridPerson[]>(() =>
    PEOPLE_WITH_BALANCES.map((n) => ({
      employeeId: n,
      name: n,
      code: n === ME.name ? ME.code : (TEAM.find((t) => t.name === n)?.code ?? null),
      // HR never corrects their own balance; everyone else in scope can be corrected.
      canAdjust: n !== HR_ADMIN.name,
      balances: balancesFor(n).filter((b) => b.paid).map((b) => ({ leaveTypeId: b.code, balance: b.balance, hasBalance: true, negativeLimit: b.code === 'EL' ? 0 : b.code === 'CL' ? 2 : 0 })),
    })),
  );
  return (
    <TimePage active="Team leave" user={HR_ADMIN}>
      <PageHeader title="Leave balances · everyone" description="Leave year 2026 · press a balance to correct it, with a reason" actions={<LinkButton to={STORY.leaveCardHr}>One person's card</LinkButton>} />
      <BalanceGrid
        types={types}
        people={people}
        open={correctOpen ? { employeeId: 'Priya Shankar', leaveTypeId: 'EL' } : null}
        onCorrect={async (x) => setPeople((ps) => ps.map((p) => (p.employeeId === x.employeeId ? { ...p, balances: p.balances.map((b) => (b.leaveTypeId === x.leaveTypeId ? { ...b, balance: x.to } : b)) } : p)))}
      />
    </TimePage>
  );
}

/**
 * Answer 2325: HR's leave card lists the person's approved leave; "Cancel some days" opens the employee's drawer in HR mode
 * (any day, a reason of at least 10 letters, cancelled at once and audited).
 */
function HrApprovedLeave({ employeeId, today, onLoad, onCancelDays, onDone }: { employeeId: string; today: string; onLoad: (employeeId: string) => Promise<LiveRequest[]>; onCancelDays: NonNullable<LiveLeaveCard['onHrCancelDays']>; onDone: () => void }) {
  const [rows, setRows] = useState<LiveRequest[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<LiveRequest | null>(null);
  const load = () => {
    setProblem(null);
    onLoad(employeeId).then(setRows, (e: unknown) => setProblem(e instanceof Error && e.message ? e.message : "Their leave didn't load."));
  };
  useEffect(load, [employeeId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title="Approved leave">
      {problem ? <ErrorState title="Their leave didn't load" description={problem} onRetry={load} /> : !rows ? <LoadingBlock rows={3} /> : rows.length === 0 ? <p className="yx-tim-muted">No approved leave from the last two months on.</p> : (
        <ul className="yx-tim-list" aria-label="Approved leave">
          {rows.map((r) => (
            <li key={r.id}>
              <span className="yx-tim-list__main">
                <strong>{r.type?.name ?? 'Leave'} · {isoSpan(r.from, r.to)}</strong>
                <span className="yx-tim-muted">{r.changeWaiting ? 'A change is waiting for approval' : daysWord(r.days)}</span>
              </span>
              {(r.leaveDays?.length ?? 0) > 1 && !r.changeWaiting && <Button size="sm" onClick={() => setOpen(r)}>Cancel some days</Button>}
            </li>
          ))}
        </ul>
      )}
      <p className="yx-tim-note">HR can cancel any day at once with a reason; it is saved in the audit trail and the days go back to the balance.</p>
      {open && open.leaveDays && (
        <CancelSomeDaysDrawer
          hr
          days={open.leaveDays}
          today={today}
          onSend={async (x) => {
            await onCancelDays(employeeId, open.id, x);
            load();
            onDone();
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </Card>
  );
}

/* =====================================================================
   TIM-22 · Comp-off claim
   ===================================================================== */

/** The day being claimed (CLAIM in time-data): the option text, helper and the Full-day rule all read it. */
const CLAIM_DAY = CLAIM.date;
const CLAIM_USE_BY = CLAIM.useBy;
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const CLAIM_WORKED = toMinutes(CLAIM.out) - toMinutes(CLAIM.in);
const FULL_DAY_MIN = 8 * 60;
const HALF_DAY_MIN = 4 * 60;

export function CompOffClaim({ surface = 'desk', state = 'ready', live }: { surface?: 'desk' | 'phone'; state?: 'ready' | 'none' | 'sent'; /** The app: the claim drawer on My leave. */ live?: LiveCompOff & { onClose: () => void } }) {
  if (live) return <LiveCompOffClaim {...live} />;
  const [open, setOpen] = useState(true);
  const [st, setSt] = useState(state);
  const [reason, setReason] = useState('Vendor audit preparation');
  // Full day only with 8 h or more: start on the largest amount allowed.
  const [amount, setAmount] = useState(CLAIM_WORKED >= FULL_DAY_MIN ? 'full' : 'half');
  const claimDays = amount === 'full' ? 1 : 0.5;
  const amountText = claimDays === 1 ? 'Full-day' : 'Half-day';
  // A sent claim joins the pending list on the page behind; the day can't be claimed twice.
  // "No eligible days": 26 Sep was already claimed, so that claim shows behind the empty state.
  const [claimed, setClaimed] = useState(state === 'sent' || state === 'none');
  const [withdrawing, setWithdrawing] = useState<CompOffRequest | null>(null);
  const { toast } = useToast();
  const [tried, setTried] = useState(false);
  const sentClaim: CompOffRequest = { id: 'co-new', person: ME.name, worked: CLAIM_DAY, days: claimDays, status: 'Pending', applied: TODAY, approver: ME.manager, useBy: CLAIM_USE_BY, reason };
  const pending = [...COMP_OFF_REQUESTS.filter((r) => r.person === ME.name && r.status === 'Pending'), ...(claimed ? [sentClaim] : [])];
  // The balance card counts the claims still waiting as pending.
  const balances = BALANCES.map((b) => (b.code === 'CO' ? { ...b, pending: b.pending + pending.reduce((t, r) => t + r.days, 0) } : b));
  const worked = fmtDuration(CLAIM_WORKED);
  // The holiday worked before the claim day, which the comp-off balance already holds (credited automatically).
  const coBal = BALANCES.find((b) => b.code === 'CO');
  const creditedHoliday = [...HOLIDAYS].reverse().find((h) => day0(h.date) < day0(CLAIM_DAY));
  const body = st === 'none' ? (
    <EmptyState
      title="No eligible days to claim"
      description="You can claim comp-off for work on a holiday or weekly off in the last 30 days. Days already credited or claimed aren't listed. If you worked on one and it isn't here, check your punches for that day."
      action={<LinkButton to={STORY.attendance}>Open my attendance</LinkButton>}
    />
  ) : st === 'sent' ? (
    <div className="yx-tim-stack">
      <InlineAlert tone="info" title={`Sent to ${ME.manager}`}>
        {amountText} comp-off for {dm(CLAIM_DAY)}. It's listed on My leave until it's decided.
      </InlineAlert>
      <div className="yx-tim-row"><span className="yx-tim-muted">Use by {dm(CLAIM_USE_BY)}</span><DueBadge date={CLAIM_USE_BY} /></div>
    </div>
  ) : (
    <div className="yx-tim-form">
      <FormField label="Day you worked" required helper="Holidays and weekly offs with punches in the last 30 days">
        <RadioGroup aria-label="Day you worked" defaultValue="26" options={[{ value: '26', label: `${dm(CLAIM_DAY)} · ${CLAIM.kind}`, description: `Worked ${fmt12(CLAIM.in)} – ${fmt12(CLAIM.out)} (${worked}) · ${CLAIM.where}` }]} />
      </FormField>
      <FormField label="Claim" helper={CLAIM_WORKED < FULL_DAY_MIN ? `Full day needs 8 h; you worked ${worked} on ${dm(CLAIM_DAY)}.` : undefined}>
        <RadioGroup aria-label="Claim" value={amount} onChange={setAmount} orientation="horizontal" options={[{ value: 'half', label: 'Half day (4 h or more)', disabled: CLAIM_WORKED < HALF_DAY_MIN }, { value: 'full', label: 'Full day (8 h or more)', disabled: CLAIM_WORKED < FULL_DAY_MIN }]} />
      </FormField>
      <FormField id="co-reason" label="Reason" required error={tried && !reason.trim() ? 'Enter a reason.' : null}><TextArea rows={2} value={reason} onChange={setReason} /></FormField>
      <section className="yx-tim-effect">
        <strong>What you'll get</strong>
        <p className="yx-tim-muted">+{plural(claimDays, 'day')} comp-off after {ME.manager} approves</p>
        <div className="yx-tim-row"><span className="yx-tim-muted">Use by {dm(CLAIM_USE_BY)}</span><DueBadge date={CLAIM_USE_BY} /></div>
      </section>
      {/* Holiday work is credited without a claim: shown after the form, so it isn't read as a second day to pick. */}
      {creditedHoliday && coBal && coBal.credited > 0 && (
        <InlineAlert tone="info" title="Already credited">
          <div className="yx-tim-row" style={{ flexWrap: 'nowrap', justifyContent: 'space-between' }}>
            <span>{dm(creditedHoliday.date)} ({creditedHoliday.name}): +{plural(coBal.credited, 'day')} · use by {dm(CO_EXPIRES)}</span>
            <DueBadge date={CO_EXPIRES} />
          </div>
        </InlineAlert>
      )}
    </div>
  );
  const footer = st === 'ready' ? (
    <DrawerFoot rest={<Button onClick={() => setOpen(false)}>Cancel</Button>} main={<Button variant="primary" onClick={() => { setTried(true); if (!reason.trim()) return void document.getElementById('co-reason')?.focus(); setSt('sent'); setClaimed(true); }}>Send claim</Button>} />
  ) : <Button onClick={() => setOpen(false)}>Close</Button>;
  // The page behind is My leave (balances and claims waiting), with the button to claim again.
  const claimButton = <Button icon={CalendarPlus} onClick={() => { setSt(claimed ? 'none' : 'ready'); setOpen(true); }}>Claim comp-off</Button>;
  const withdrawDialog = (
    <ConfirmDialog
      open={!!withdrawing}
      onOpenChange={(o) => !o && setWithdrawing(null)}
      title="Withdraw this comp-off claim?"
      consequence={withdrawing ? `It hasn't been approved yet, so it's withdrawn at once. You can claim ${dm(withdrawing.worked)} again within 30 days of working it.` : ''}
      confirmLabel="Withdraw claim"
      cancelLabel="Keep claim"
      destructive
      onConfirm={() => {
        if (withdrawing) toast({ title: `Comp-off claim for ${dm(withdrawing.worked)} withdrawn`, tone: 'success' });
        if (withdrawing?.id === 'co-new') setClaimed(false);
        setWithdrawing(null);
      }}
    />
  );
  const pendingCard = pending.length > 0 && (
    <>
    {<Card title={`Comp-off waiting for approval (${pending.length})`}>
      <ul className="yx-tim-list">
        {pending.map((r) => (
          <li key={r.id}>
            <span className="yx-tim-list__main" style={MAIN}>
              <strong>{r.days === 0.5 ? 'Half day' : plural(r.days, 'day')} · worked {dm(r.worked)}</strong>
              <span className="yx-tim-muted">Waiting for {r.approver} · use by {dm(r.useBy)}</span>
            </span>
            <Button size="sm" onClick={() => setWithdrawing(r)}>Withdraw</Button>
          </li>
        ))}
      </ul>
    </Card>}
    </>
  );
  if (surface === 'phone')
    return (
      <PhoneFrame tab="time" title="Leave">
        <div className="yx-tim-stack">{claimButton}{pendingCard}<BalanceCards compact balances={balances} /></div>
        <BottomSheet open={open} onOpenChange={setOpen} title="Claim comp-off" footer={footer}>{body}</BottomSheet>
        {withdrawDialog}
      </PhoneFrame>
    );
  return (
    <TimePage active="My leave">
      <PageHeader title="My leave" actions={claimButton} />
      {pendingCard}
      <BalanceCards balances={balances} />
      <Drawer open={open} onOpenChange={setOpen} title="Claim comp-off" footer={footer}>{body}</Drawer>
      {withdrawDialog}
    </TimePage>
  );
}

/* =====================================================================
   TIM-23 · Optional holidays (choose N of M)
   ===================================================================== */

const OPTIONAL = [
  { id: 'o1', name: 'Onam', date: new Date(2026, 7, 26), past: true },
  { id: 'o2', name: 'Mahalaya Amavasya', date: new Date(2026, 9, 10) },
  { id: 'o4', name: 'Vijayadashami', date: new Date(2026, 9, 21) },
  { id: 'o3', name: 'Karthigai Deepam', date: new Date(2026, 10, 24) },
  { id: 'o5', name: 'Christmas Eve', date: new Date(2026, 11, 24) },
];

/** "1 taken · 1 chosen · 0 left" (chosen left out when 0), or "All used": the same count on My leave and in the sheet. */
function optionalCount(sel: string[], n: number) {
  const taken = OPTIONAL.filter((o) => o.past && sel.includes(o.id)).length;
  const chosen = sel.length - taken;
  return taken >= n ? 'All used' : [`${taken} taken`, chosen > 0 ? `${chosen} chosen` : null, `${Math.max(0, n - sel.length)} left`].filter(Boolean).join(' · ');
}
const optionalText = (sel: string[], n: number) => `Optional holidays · ${optionalCount(sel, n)}`;
/** Success line after Save: "Karthigai Deepam added as your optional holiday", or the saved list when something was removed. */
function optionalSavedText(before: string[], after: string[]) {
  const names = (ids: string[]) => ids.map((id) => OPTIONAL.find((o) => o.id === id)?.name ?? id).join(' and ');
  const added = after.filter((x) => !before.includes(x));
  const removed = before.filter((x) => !after.includes(x));
  if (removed.length === 0) return `${names(added)} added as your optional ${added.length === 1 ? 'holiday' : 'holidays'}`;
  return after.length === 0 ? 'Optional holidays cleared' : `Optional holidays saved: ${names(after)}`;
}

function OptionalHolidaysPanel({ open, onOpenChange, surface = 'desk', chosen = OPTIONAL_DEFAULT, transferred = false, onSave, live }: { open: boolean; onOpenChange: (o: boolean) => void; surface?: 'desk' | 'phone'; chosen?: string[]; transferred?: boolean; /** Saves the picks (My leave keeps them and recounts its button). */ onSave?: (sel: string[]) => void; /** The app: the calendar's optional days, each choice sent to the API. */ live?: { data: MyLeave; onChoose: LiveLeaveHome['onChooseHoliday'] } }) {
  if (live) return open ? <LiveOptionalHolidaysPanel {...live} onClose={() => onOpenChange(false)} /> : null;
  const [sel, setSel] = useState<string[]>(chosen);
  const { toast } = useToast();
  // Cancel or closing drops unsaved ticks.
  const dismiss = () => {
    setSel(chosen);
    onOpenChange(false);
  };
  const n = transferred ? 1 : OPTIONAL_ALLOWED;
  const taken = OPTIONAL.filter((o) => o.past && sel.includes(o.id)).length;
  const full = sel.length >= n;
  const usedUp = taken >= n;
  const changed = sel.length !== chosen.length || sel.some((x) => !chosen.includes(x));
  const why = (o: (typeof OPTIONAL)[number]) => {
    if (o.past) return sel.includes(o.id) ? 'Taken' : 'Already passed';
    if (sel.includes(o.id)) return undefined;
    if (isOff(o.date)) return 'Your weekly off';
    const twin = OPTIONAL.find((x) => x.id !== o.id && same(x.date, o.date) && sel.includes(x.id));
    if (twin) return `Same day as ${twin.name}`;
    // Used up: the alert says so once; the rows just stay locked.
    if (full) return usedUp ? undefined : 'Limit reached · untick one to swap';
    return undefined;
  };
  const prorate = transferred ? ' (prorated after your move to Chennai office on 1 Jul)' : '';
  // Past days and your weekly offs can't be picked, so say how many still can.
  const stillOpen = OPTIONAL.filter((o) => !o.past && !isOff(o.date)).length;
  const body = (
    <div className="yx-tim-form">
      <p>{usedUp ? 'Your optional holidays for 2026' : <>Choose <strong>{n}</strong> of {OPTIONAL.length} optional holidays for 2026{stillOpen < OPTIONAL.length ? ` · ${stillOpen} still open` : ''}</>} · Chennai office calendar.</p>
      {usedUp ? (
        <InlineAlert tone="info" title={`You've used your ${plural(n, 'optional holiday')} for 2026${prorate}`} />
      ) : transferred && (
        <InlineAlert tone="info" title="Prorated after your transfer">You moved to Chennai office on 1 Jul, so you get 1 optional holiday for the rest of the year.</InlineAlert>
      )}
      <ul className="yx-tim-check">
        {OPTIONAL.map((o) => {
          const reason = why(o);
          const picked = sel.includes(o.id);
          const locked = o.past || (!picked && (!!reason || usedUp));
          return (
            <li key={o.id}>
              <div className="yx-tim-row">
                <Checkbox label={`${o.name} · ${dm(o.date)}`} description={reason} checked={picked} disabled={locked} onChange={(c) => setSel(c ? [...sel, o.id] : sel.filter((x) => x !== o.id))} />
                {/* A countdown only on rows you can pick or have picked. */}
                {!o.past && !locked && <DueBadge date={o.date} />}
              </div>
            </li>
          );
        })}
      </ul>
      {/* Used up: the alert already says it. */}
      {!usedUp && <p className="yx-tim-muted" aria-live="polite">{optionalCount(sel, n)}</p>}
    </div>
  );
  const footer = usedUp ? <Button onClick={dismiss}>Close</Button> : (
    <DrawerFoot
      hint={changed ? undefined : full ? 'No changes to save' : 'Tick a holiday to save'}
      rest={<Button onClick={dismiss}>Cancel</Button>}
      main={<Button variant="primary" onClick={() => { if (!changed) return void toast({ title: full ? 'No changes to save' : 'Tick a holiday to save', tone: 'warning' }); onSave?.(sel); onOpenChange(false); }}>Save choices</Button>}
    />
  );
  const onSheet = (o: boolean) => (o ? onOpenChange(true) : dismiss());
  if (surface === 'phone') return <BottomSheet open={open} onOpenChange={onSheet} title="Optional holidays" footer={footer}>{body}</BottomSheet>;
  return <Drawer open={open} onOpenChange={onSheet} title="Optional holidays" footer={footer}>{body}</Drawer>;
}

export function OptionalHolidaysSheet({ surface = 'desk', chosen = ['o1'], transferred = false, live }: { surface?: 'desk' | 'phone'; chosen?: string[]; transferred?: boolean; /** The app: the calendar's optional days. */ live?: { data: MyLeave; onChoose: LiveLeaveHome['onChooseHoliday']; onClose: () => void } }) {
  if (live) return <OptionalHolidaysPanel open onOpenChange={(o) => !o && live.onClose()} live={{ data: live.data, onChoose: live.onChoose }} />;
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(chosen);
  const { toast } = useToast();
  const setMsg = (m: string) => void toast({ title: m, tone: 'success' });
  const n = transferred ? 1 : OPTIONAL_ALLOWED;
  const panel = <OptionalHolidaysPanel key={saved.join()} open={open} onOpenChange={setOpen} surface={surface} chosen={saved} transferred={transferred} onSave={(s) => { setMsg(optionalSavedText(saved, s)); setSaved(s); }} />;
  // Behind the sheet: the saved choice and the button that opens it again.
  const behind = (
    <div className="yx-tim-stack">
      
      <Card title="Upcoming holidays">
        <HolidayList optional={saved} />
        <Button size="sm" onClick={() => setOpen(true)}>{optionalText(saved, n)}</Button>
      </Card>
    </div>
  );
  if (surface === 'phone') return <PhoneFrame tab="time" title="Holidays">{behind}{panel}</PhoneFrame>;
  return <TimePage active="My leave"><PageHeader title="My leave" />{behind}{panel}</TimePage>;
}

/* =====================================================================
   TIM-24 · Encashment request
   ===================================================================== */

/** One encashment policy: up to 7 days a year, at least 7 days must stay after encashing, one request open at a time. */
const ENCASH = { maxPerYear: EL_ENCASH_MAX, minLeft: EL_ENCASH_MIN_LEFT, monthlyBase: 48000, divisor: 26 as const, taxRate: 0.208 };
/** The request already waiting in the "blocked" story (one at a time). */
const ENCASH_WAITING = { days: 5, sent: new Date(2026, 8, 22) };

export function EncashmentRequest({ surface = 'desk', days: d0 = 5, blocked, live }: { surface?: 'desk' | 'phone'; days?: number; blocked?: boolean; /** The app: the encashment drawer on My leave. */ live?: LiveEncash & { onClose: () => void } }) {
  if (live) return <LiveEncashment {...live} />;
  const [days, setDays] = useState<number | null>(d0);
  const [open, setOpen] = useState(true);
  const [sent, setSent] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const { toast } = useToast();
  const el = BALANCES.find((b) => b.code === 'EL')!;
  const available = el.balance - el.pending;
  const max = Math.max(0, Math.min(ENCASH.maxPerYear, available - ENCASH.minLeft));
  const n = days ?? 0;
  const rate = ENCASH.monthlyBase / ENCASH.divisor;
  const amount = encashAmount(ENCASH.monthlyBase, ENCASH.divisor, n);
  const error = n > max ? (max < ENCASH.maxPerYear ? `At most ${max} days: ${ENCASH.minLeft} days must remain after encashing` : `At most ${ENCASH.maxPerYear} days a year`) : n < 1 ? 'Encash at least 1 day' : null;
  const waiting = blocked && !withdrawn;
  // An encashment waiting for approval holds its days, so they can't also be booked as leave; withdrawing releases them.
  const held = waiting ? ENCASH_WAITING.days : sent ? n : 0;
  const shownBalances = held > 0 ? BALANCES.map((b) => (b.code === 'EL' ? { ...b, pending: b.pending + held } : b)) : BALANCES;
  const waitingCard = (waiting || sent) && (
    <Card title="Encashment waiting for approval (1)">
      <ul className="yx-tim-list">
        <li>
          <span className="yx-tim-list__main" style={MAIN}>
            <strong>{plural(held, 'day')} Earned leave · {formatINR(encashAmount(ENCASH.monthlyBase, ENCASH.divisor, held))} before tax</strong>
            <span className="yx-tim-muted">Sent {dm(waiting ? ENCASH_WAITING.sent : TODAY0)} · waiting for {ME.manager}</span>
          </span>
          {waiting && <Button size="sm" onClick={() => setConfirmWithdraw(true)}>Withdraw</Button>}
        </li>
      </ul>
    </Card>
  );
  const body = waiting ? (
    <InlineAlert tone="info" title="You already have an encashment request waiting" actions={<Button size="sm" onClick={() => setConfirmWithdraw(true)}>Withdraw request</Button>}>
      {plural(ENCASH_WAITING.days, 'day')} Earned leave, sent {dm(ENCASH_WAITING.sent)} ({plural(-daysUntil(ENCASH_WAITING.sent, TODAY), 'day')} ago), waiting for {ME.manager}. You can send another once it's decided or withdrawn.
    </InlineAlert>
  ) : sent ? (
    <InlineAlert tone="info" title={`Sent to ${ME.manager}`}>{plural(n, 'day')} Earned leave, {formatINR(amount)} before tax, paid in October payroll once approved. It's listed on My leave, and its days are held from your balance, until it's decided.</InlineAlert>
  ) : (
    <div className="yx-tim-form">
      {/* Only earned leave can be encashed, so the type is a fact, not a choice. */}
      <dl className="yx-tim-effect__row"><dt>Leave type</dt><dd style={{ textAlign: 'end' }}>Earned leave · {available} available<br /><span className="yx-tim-note">{el.balance} days, {el.pending} pending</span></dd></dl>
      <FormField id="enc-days" label="Days to encash" required helper={error ? undefined : max < ENCASH.maxPerYear ? `You can encash up to ${plural(max, 'day')} (${ENCASH.minLeft} of your ${available} must remain)` : `Up to ${ENCASH.maxPerYear} days a year`} error={error}>
        <div className="yx-tim-row">
          {/* At a limit the steppers stay pressable and say why. */}
          <IconButton variant="secondary" icon={Minus} label="Fewer days" onClick={() => (n <= 1 ? toast({ title: 'Encash at least 1 day', tone: 'warning' }) : setDays(Math.max(1, n - 1)))} />
          <NumberField value={days} onChange={setDays} aria-label="Days" min={1} />
          <IconButton variant="secondary" icon={Plus} label="More days" onClick={() => (n >= max ? toast({ title: `You can encash at most ${plural(max, 'day')}`, tone: 'warning' }) : setDays(Math.min(max, n + 1)))} />
        </div>
      </FormField>
      <section className="yx-tim-effect" aria-live="polite">
        <strong>What you'll get</strong>
        {/* An invalid number of days shows no figures, only what to do. */}
        {error ? <p className="yx-tim-muted">Fix the days above to see the amount.</p> : (
          <dl className="yx-tim-stack">
            <div className="yx-tim-effect__row"><dt>Rate</dt><dd style={{ textAlign: 'end' }}>(Basic + DA {formatINR(ENCASH.monthlyBase)}) ÷ {ENCASH.divisor}<br />= {formatINR(rate, { decimals: 2 })} a day</dd></div>
            <div className="yx-tim-effect__row"><dt>Amount (before tax)</dt><dd>{n} × {formatINR(rate, { decimals: 2 })} = {formatINR(amount)}</dd></div>
            <div className="yx-tim-effect__row"><dt>After tax (about)</dt><dd style={{ textAlign: 'end' }}><span style={{ whiteSpace: 'nowrap' }}>{formatINR(Math.round(amount * (1 - ENCASH.taxRate)))}</span><br /><span className="yx-tim-note">at your 20% slab + 4% cess</span></dd></div>
            <div className="yx-tim-effect__row"><dt>Balance after</dt><dd>{available - n} days available</dd></div>
            <div className="yx-tim-effect__row"><dt>Paid in</dt><dd>October payroll</dd></div>
          </dl>
        )}
      </section>
    </div>
  );
  const footer = waiting || sent ? <Button onClick={() => setOpen(false)}>Close</Button> : (
    <DrawerFoot hint={error ? 'Fix the days to send' : undefined} rest={<Button onClick={() => setOpen(false)}>Cancel</Button>} main={<Button variant="primary" onClick={() => (error ? document.getElementById('enc-days')?.focus() : setSent(true))}>Send request</Button>} />
  );
  const withdrawDialog = (
    <ConfirmDialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw} title="Withdraw this encashment request?" consequence={`It hasn't been approved yet, so it's withdrawn at once. Nothing is paid for these ${plural(ENCASH_WAITING.days, 'day')}.`} confirmLabel="Withdraw request" destructive onConfirm={() => { setConfirmWithdraw(false); setWithdrawn(true); toast({ title: 'Earlier request withdrawn', tone: 'success' }); }} />
  );
  // Behind the drawer: My leave with the balances and the button that opens it again.
  // The waiting request shows above the balances, which hold its days as pending.
  const behind = <div className="yx-tim-stack">{waitingCard}<BalanceCards compact={surface === 'phone'} balances={shownBalances} /><div><Button onClick={() => setOpen(true)}>Encash leave</Button></div></div>;
  if (surface === 'phone') return <PhoneFrame tab="time" title="Leave">{behind}<BottomSheet open={open} onOpenChange={setOpen} title="Encash leave" footer={footer}>{body}</BottomSheet>{withdrawDialog}</PhoneFrame>;
  return <TimePage active="My leave"><PageHeader title="My leave" actions={<Button onClick={() => setOpen(true)}>Encash leave</Button>} />{waitingCard}<BalanceCards balances={shownBalances} /><Drawer open={open} onOpenChange={setOpen} title="Encash leave" footer={footer}>{body}</Drawer>{withdrawDialog}</TimePage>;
}

/* =====================================================================
   TIM-25 · Long-absence status card
   ===================================================================== */

const ABSENCES_LONG = {
  // Anitha moved to the Hosur plant as a supervisor from 1 Jun 2026 (TIM-27 data).
  maternity: { title: 'Maternity leave', who: 'Anitha Rajan', email: 'anitha.r@kaverifoods.in', site: 'Hosur plant', from: new Date(2026, 7, 3), to: new Date(2027, 0, 31), weeks: '26 weeks', pay: 'Paid by ESI, not by Kaveri Foods. Claim it at your ESI branch.', accrual: 'Keeps earning leave' },
  sabbatical: { title: 'Sabbatical', who: 'Ramesh Natarajan', email: 'ramesh.n@kaverifoods.in', site: '', from: new Date(2026, 6, 1), to: new Date(2026, 11, 31), weeks: '', pay: '', accrual: 'No leave earned while away' },
  lwp: { title: 'Long leave without pay', who: 'Sneha Pillai', email: 'sneha.p@kaverifoods.in', site: '', from: new Date(2026, 8, 15), to: new Date(2026, 10, 14), weeks: '', pay: '', accrual: 'No leave earned while away' },
};

/** First working day after `d` (skips Sundays). */
const nextWorkingDay = (d: Date) => {
  let x = addDays(d, 1);
  while (x.getDay() === 0) x = addDays(x, 1);
  return x;
};

export function LongAbsenceCard({ kind = 'maternity', persona = 'emp', surface = 'desk', live }: { kind?: 'maternity' | 'sabbatical' | 'lwp'; persona?: 'emp' | 'hr'; surface?: 'desk' | 'phone'; /** The app: one absence's status in a drawer (employee or HR). */ live?: LiveAbsence }) {
  if (live) return <LiveLongAbsence {...live} />;
  const info = ABSENCES_LONG[kind];
  const [dlg, setDlg] = useState<'change' | 'extend' | 'early' | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const { toast } = useToast();
  const setMsg = (m: string) => void toast({ title: m, tone: 'success' });
  const [open, setOpen] = useState(true);
  // HR's Extend / Early return change the last day, so the meter, return date and pay effect recompute.
  const [end, setEnd] = useState(info.to);
  // The employee's new return date waits for HR to confirm it.
  const [asked, setAsked] = useState<Date | null>(null);
  const total = daysUntil(end, info.from) + 1;
  const dayN = Math.min(total, Math.max(0, daysUntil(TODAY0, info.from) + 1));
  const ret = nextWorkingDay(end);
  const months = [...new Set(Array.from({ length: total }, (_, i) => monthName(addDays(info.from, i)).slice(0, 3)))];
  // One style on every card: a range ("Sep–Nov"), or the month alone.
  const monthsText = months.length > 1 ? `${months[0]}–${months[months.length - 1]}` : months[0];
  // Maternity: ESI pays the planned weeks; days HR adds after that are unpaid unless earned leave covers them.
  const extra = kind === 'maternity' ? Math.max(0, daysUntil(end, info.to)) : 0;
  // Unpaid sabbatical and leave without pay have the same pay effect, so they use the same words.
  const pay = kind !== 'maternity'
    ? `Unpaid for all ${total} days · ${monthsText} payroll`
    : extra > 0
        ? `ESI pays the ${info.weeks} to ${formatDate(info.to)}. The ${plural(extra, 'day')} after that ${extra === 1 ? 'is' : 'are'} unpaid unless ${persona === 'emp' ? 'you use' : `${first(info.who)} uses`} earned leave.`
        : info.pay;
  /** Return dates never fall on a Sunday: a Sunday pick moves to Monday, in the message and on the card. */
  const workingDay = (d: Date) => (d.getDay() === 0 ? nextWorkingDay(d) : d);
  const user: TimeUser = persona === 'hr' ? HR_ADMIN : { name: info.who, email: info.email };
  const close = () => {
    setDlg(null);
    setDate(null);
    setNote('');
    setTried(false);
  };
  const her = first(info.who);
  const dlgCfg = {
    change: { title: 'Tell HR your return date changed', label: 'New return date', confirm: 'Send to HR', effect: (d: Date) => `HR gets your new return date, ${formatDate(d)}, and confirms it with you.`, done: (d: Date) => `Sent to HR. They will confirm your new return date, ${formatDate(d)}.` },
    extend: {
      title: `Extend ${her}'s ${info.title.toLowerCase()}`, label: 'New last day', confirm: 'Extend',
      effect: (d: Date) => `${plural(daysUntil(d, end), kind === 'maternity' ? 'more day' : 'more unpaid day')}${kind === 'maternity' ? ` beyond the ${info.weeks}, unpaid unless ${her} uses earned leave` : ''}; return moves to ${formatDate(nextWorkingDay(d))}.`,
      done: (d: Date) => `Leave extended to ${formatDate(d)}. Return ${formatDate(nextWorkingDay(d))}.`,
    },
    early: { title: `Record ${her}'s early return`, label: 'Return date', confirm: 'Record return', effect: (d: Date) => `Back on ${formatDate(workingDay(d))}; leave ends ${formatDate(addDays(workingDay(d), -1))}. ${kind === 'maternity' ? 'Pay restarts from that day.' : 'Pay and leave earning restart from that day.'}`, done: (d: Date) => `Early return recorded. Back on ${formatDate(workingDay(d))}.` },
  };
  const cfg = dlg ? dlgCfg[dlg] : null;
  const body = (
    <div className="yx-tim-stack">
      
      <div className="yx-tim-row"><Badge tone="info">{info.title}</Badge><span className="yx-tim-muted">{formatDate(info.from)} – {formatDate(end)}{info.weeks && end === info.to ? ` (${info.weeks})` : ''}</span></div>
      <Meter label="Absence progress" value={dayN} max={total} valueText={`Day ${dayN} of ${total}`} />
      <ul className="yx-tim-list">
        <li><span>Expected return</span><span className="yx-tim-row"><strong>{formatDate(ret)}</strong><DueBadge date={ret} />{asked && <Badge tone="neutral">{`Waiting for HR · ${formatDate(asked)}`}</Badge>}</span></li>
        <li><span>Pay effect</span><span className="yx-tim-muted">{pay}</span></li>
        <li><span>Leave accrual</span><span className="yx-tim-muted">{info.accrual}</span></li>
        {persona === 'hr' && <li><span>Attendance</span><span className="yx-tim-muted">Alerts paused · resume {formatDate(ret)}</span></li>}
        {kind === 'maternity' && <li><span>After return</span><span className="yx-tim-muted">Work from home option by mutual agreement{info.site ? ` · crèche at ${info.site}` : ''}</span></li>}
      </ul>
      {/* No "Open leave card" / "Open profile" yet: those stories show other people, not the person on leave. */}
      {persona === 'hr' && (
        <div className="yx-tim-row">
          <Button onClick={() => setDlg('extend')}>Extend</Button>
          <Button variant="primary" onClick={() => setDlg('early')}>Record early return</Button>
        </div>
      )}
      {persona === 'emp' && <Button onClick={() => setDlg('change')}>Tell HR my return date changed</Button>}
      {cfg && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && close()}
          title={cfg.title}
          consequence={date ? cfg.effect(date) : 'Pick a date to see the effect.'}
          confirmLabel={cfg.confirm}
          onConfirm={() => {
            setTried(true);
            if (!date || !note.trim()) return false;
            setMsg(cfg.done(date));
            if (dlg === 'extend') setEnd(date);
            else if (dlg === 'early') setEnd(addDays(workingDay(date), -1));
            else setAsked(date);
            close();
          }}
        >
          <div className="yx-tim-stack">
            <FormField label={cfg.label} required error={tried && !date ? 'Choose the date.' : null}><DatePicker value={date} onChange={setDate} min={dlg === 'extend' ? addDays(end, 1) : TODAY0} max={dlg === 'early' ? end : undefined} /></FormField>
            <FormField label="Reason" required error={tried && !note.trim() ? 'Enter a reason.' : null}><TextArea rows={2} value={note} onChange={setNote} /></FormField>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
  // Behind the status: the person's normal My leave content (absence card, balances when on file, requests).
  const balances = balancesFor(info.who);
  const summary = (
    <Card title={`${persona === 'emp' ? 'On' : `${her} is on`} ${info.title.toLowerCase()} until ${formatDate(end)}`} actions={<Button size="sm" onClick={() => setOpen(true)}>Open status</Button>}>
      <div className="yx-tim-row"><span className="yx-tim-muted">Back on {formatDate(ret)}</span><DueBadge date={ret} /></div>
    </Card>
  );
  const requests = (
    <Card title={persona === 'emp' ? 'My requests' : `${her}'s requests`}>
      <ul className="yx-tim-list">
        <li>
          <span className="yx-tim-list__main" style={MAIN}>
            <strong>{info.title} · {formatDate(info.from)} – {formatDate(end)}</strong>
            <span className="yx-tim-muted">{plural(total, 'day')} · approved by {HR_ADMIN.name}</span>
          </span>
          <Button size="sm" onClick={() => setOpen(true)}>View</Button>
        </li>
      </ul>
    </Card>
  );
  const page = (
    <div className="yx-tim-stack">
      {summary}
      {balances.length > 0 && <BalanceCards compact={surface === 'phone'} balances={balances} person={info.who} />}
      {requests}
    </div>
  );
  if (surface === 'phone')
    return (
      <PhoneFrame tab="time" title="Leave">
        {page}
        <BottomSheet open={open} onOpenChange={setOpen} title={info.title}>{body}</BottomSheet>
      </PhoneFrame>
    );
  return (
    <TimePage active={persona === 'emp' ? 'My leave' : 'Team leave'} user={user}>
      <PageHeader title={persona === 'emp' ? 'My leave' : `${info.who}`} />
      {page}
      <Drawer open={open} onOpenChange={setOpen} title={`${info.title} · ${info.who}`} subtitle="Long-absence status">{body}</Drawer>
    </TimePage>
  );
}

/* =====================================================================
   Live: the same designs filled with the API's data (apps/web /yx/time/leave, /team and /balances).
   The pages keep the API glue and say "done" with a toast; these parts keep the load states, validation and errors.
   ===================================================================== */

/** Me › Leave in the app (TIM-17, with TIM-18 / 19 / 23 opening from it). */
export interface LiveLeaveHome {
  state: LoadState;
  onRetry?: () => void;
  data: MyLeave | null;
  /** The live summary from the server's own rules (days counted, sandwich, holidays, balance after, who else is off). */
  onPreview: (input: Omit<LeaveInput, 'reason' | 'delegateUserId' | 'certificate'>) => Promise<LeavePlan>;
  onApply: (input: LeaveInput) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
  onCancel: (id: string, reason: string) => Promise<unknown>;
  /** Batch A D12: ask to cancel some days of approved leave (to the approver), and extend leave (a new linked request). */
  onCancelDays?: (id: string, x: { days: string[]; reason: string }) => Promise<unknown>;
  onExtend?: (id: string, x: { to: string; toHalf: 'full' | 'first'; reason?: string }) => Promise<unknown>;
  /** A request sent back for changes, changed and sent again (a new request; the server checks every rule again). */
  onResend?: (id: string, input: LeaveInput) => Promise<unknown>;
  onChooseHoliday: (holidayId: string, choose: boolean) => Promise<unknown>;
  onFindPeople: (q: string) => Promise<LivePersonOption[]>;
  /** Opens Apply leave at once (a link from Home, Ctrl K › N L). */
  startApplying?: boolean;
  /** TIM-22: comp-off claims (shown when the company has a comp-off type). */
  compOff?: LiveCompOff;
  /** TIM-24: encashment (the button shows while the window is open or a request waits). */
  encash?: LiveEncash;
  /** TIM-25: my current or next long absence. */
  absence?: { data: LongAbsenceRow | null; onAskReturn: (id: string, on: string, note: string) => Promise<unknown> };
  /** My leave card (TIM-21 employee). */
  onOpenCard?: () => void;
  /** Batch A item 2 (C2): my full leave history, a page at a time. */
  onHistory?: (q: LeaveHistoryQuery) => Promise<LeaveHistoryPage>;
}

export interface LiveCompOff {
  data: MyCompOff | null;
  onClaim: (input: { on: string; days: number; reason: string }) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
}
export interface LiveEncash {
  data: MyEncashment | null;
  onRequest: (input: { leaveTypeId: string; days: number }) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
}
export interface LiveAbsence {
  absence: LongAbsenceRow;
  persona: 'emp' | 'hr';
  today: string;
  onClose: () => void;
  /** Employee: tell HR a new return date. */
  onAskReturn?: (on: string, note: string) => Promise<unknown>;
  /** HR: a new last day, or the first day back. */
  onChange?: (how: 'extend' | 'early', on: string, note: string, version: number) => Promise<unknown>;
}
/** Founder answer B: HR applies leave for someone in the TIM-18 drawer (leave.balance.adjust; the API checks each person). */
export interface LiveApplyFor {
  onFindPeople: (q: string) => Promise<LivePersonOption[]>;
  /** The person's leave types and balances, and how the request is approved. */
  onLoad: (employeeId: string) => Promise<ApplyForForm>;
  onPreview: (employeeId: string, input: Omit<LeaveInput, 'reason' | 'delegateUserId' | 'certificate'>) => Promise<LeavePlan>;
  onApply: (employeeId: string, input: LeaveInput) => Promise<unknown>;
}
/** Adjust balance from the HR leave home (TIM-17 HR, founder-approved): find a person in scope, load their balances, post. */
export interface LiveAdjust {
  onFindPeople: (q: string) => Promise<LivePersonOption[]>;
  onLoad: (employeeId: string) => Promise<LeaveBalanceRow[]>;
  onAdjust: (employeeId: string, input: { leaveTypeId: string; days: number; reason: string }) => Promise<unknown>;
}
/** HR › Leave (TIM-17 HR). */
export interface LiveHrLeaveHome {
  state: LoadState;
  onRetry?: () => void;
  data: HrLeaveHome | null;
  onRemind: (requestId: string) => Promise<unknown>;
  onNavigate: (href: string) => void;
  hrefs: { approvals: string; calendar: string; negative: string; yearEnd: string; request: (id: string) => string };
  /** TIM-25 HR: long absences now and coming, each opening its status to extend or end early. */
  absences?: { data: LongAbsenceRow[] | null; onChange: (id: string, how: 'extend' | 'early', on: string, note: string, version: number) => Promise<unknown> };
  /** Founder decision 1: Record long absence (leave.balance.adjust; the API checks each person). */
  record?: RecordAbsenceProps;
  /** Founder answer B: Apply for someone (leave.balance.adjust). */
  applyFor?: LiveApplyFor;
  /** Adjust balance for someone in scope (leave.balance.adjust; the API checks each person). */
  adjust?: LiveAdjust;
}
/** Team leave in the app (TIM-17 Manager, TIM-19 Manager): the manager's own team only; the server checks each step. */
export interface LiveMgrLeaveHome {
  state: LoadState;
  onRetry?: () => void;
  data: TeamLeaveHome | null;
  /** One request: team availability, the balance after it and my approval task (TIM-19 Manager). */
  onOpen: (id: string) => Promise<LeaveRequestDetailView>;
  /** Decides my approval task (the approvals inbox's own call; it checks I hold the task). */
  onDecide: (taskId: string, decision: 'approve' | 'reject' | 'send_back', reason?: string) => Promise<unknown>;
  onNavigate: (href: string) => void;
  hrefs: { approvals: string; calendar: string };
  /** Opens this request at once (a link from Approvals or a notification). */
  openId?: string;
}

/** Me › My leave card (TIM-21 employee). */
export interface LiveMyLeaveCard {
  state: LoadState;
  onRetry?: () => void;
  data: MyLeaveCard | null;
  onApply: () => void;
}

/** Team leave in the app (TIM-20): the page loads the range asked for. */
export interface LiveTeamLeave {
  state: LoadState;
  onRetry?: () => void;
  data: LiveCalendarData | null;
  onRange: (from: string, to: string) => void;
  /** Batch C item 15: a team member's dot opens their day card (TIM-03). */
  onOpenDay?: (employeeId: string, on: string) => void;
  /** Where leave is approved (the shared Approvals inbox). */
  approvalsHref: string;
  onNavigate: (href: string) => void;
}

/** HR › Leave balances in the app (TIM-21 HR): one person's card at a time, adjust with a reason. */
export interface LiveLeaveCard {
  state: LoadState;
  onRetry?: () => void;
  data: HrBalances | null;
  onLedger: (employeeId: string) => Promise<LedgerRow[]>;
  onAdjust: (employeeId: string, input: { leaveTypeId: string; days: number; reason: string }) => Promise<unknown>;
  /** Answer 2325: the person's approved leave HR may change, and HR's "Cancel some days" (cancelled at once, audited). */
  onApproved?: (employeeId: string) => Promise<LiveRequest[]>;
  onHrCancelDays?: (employeeId: string, requestId: string, x: { days: string[]; reason: string }) => Promise<unknown>;
  /** Batch A D10: the balance grid's correction of one cell (absent: no grid). */
  onCorrect?: (x: BalanceCorrection) => Promise<unknown>;
  /** Opens on the grid (the page keeps it in the address, ?view=grid). */
  view?: 'card' | 'grid';
  onView?: (v: 'card' | 'grid') => void;
}

const isoDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isoAdd = (s: string, n: number) => isoOf(addDays(isoDate(s), n));
const fd = (s: string) => formatDate(isoDate(s));
const isoSpan = (a: string, b: string) => (a === b ? fd(a) : `${fd(a)} – ${fd(b)}`);
const daysWord = (n: number) => plural(n, 'day');

/** Loading, could not load and no access: the design's own states. */
function LiveStates({ state, onRetry, what, children }: { state: LoadState; onRetry?: () => void; what: string; children: ReactNode }) {
  if (state === 'loading') return <LoadingBlock rows={8} />;
  if (state === 'error') return <ErrorState title={`${what} didn't load`} description="Try again. Nothing was changed." onRetry={onRetry} />;
  if (state === 'no-access') return <NoAccessState grantedBy="HR" what={what.toLowerCase()} />;
  if (state === 'no-record') return <NoRecordState />;
  return <>{children}</>;
}

type LiveBalance = MyLeave['balances'][number];

/** The design's balance cards with the ledger's figures; unpaid types show "taken this year" (YX-LV-14). */
function LiveBalanceCards({ balances, onViewPending }: { balances: LiveBalance[]; onViewPending?: (leaveTypeId: string) => void }) {
  // Maternity and paternity are per event (no balance), so they are only in the apply list.
  const shown = balances.filter((b) => b.hasBalance || b.kind === 'lop');
  if (!shown.length) return <EmptyState compact title="No leave types yet" description="HR has not given you a leave policy yet." />;
  return (
    <div className="yx-tim-cards">
      {shown.map((b) => (
        <Card key={b.leaveTypeId} title={b.name} actions={b.paid ? undefined : <Badge tone="neutral">Unpaid</Badge>}>
          {b.hasBalance ? (
            <>
              <p className="yx-tim-big">{b.available} <span className="yx-tim-muted">{b.available === 1 ? 'day' : 'days'} available</span></p>
              {b.entitlement !== null && <Meter label={`${b.name} taken`} value={b.takenThisYear} max={Math.max(b.entitlement, b.takenThisYear, 1)} valueText={`${b.takenThisYear} taken this year · ${b.entitlement} a year`} />}
              <p className="yx-tim-note">Balance {b.balance}</p>
              {b.pending > 0 && (
                <div className="yx-tim-row">
                  <span className="yx-tim-muted">Pending {daysWord(b.pending)}</span>
                  {onViewPending && <Button size="sm" onClick={() => onViewPending(b.leaveTypeId)}>View request</Button>}
                </div>
              )}
            </>
          ) : (
            <p className="yx-tim-big">{b.takenThisYear} <span className="yx-tim-muted">{b.takenThisYear === 1 ? 'day' : 'days'} taken this year</span></p>
          )}
        </Card>
      ))}
    </div>
  );
}

const halvesText = (r: LiveRequest) => `${r.fromHalf === 'second' ? ' · from the second half' : ''}${r.toHalf === 'first' ? ' · until the first half' : ''}`;
/** Approved leave can be cancelled up to the start of last month (the API's own limit). */
const cancellable = (r: LiveRequest, today: string) => r.status === 'approved' && r.to >= isoAdd(`${today.slice(0, 7)}-01`, -31);

function LiveLeaveHomeScreen({ live }: { live: LiveLeaveHome }) {
  const d = live.data;
  const [apply, setApply] = useState(Boolean(live.startApplying));
  // Asked again while already on this page (Ctrl K, N L): open the sheet then too, not only on first load.
  useEffect(() => {
    if (live.startApplying) setApply(true);
  }, [live.startApplying]);
  const [open, setOpen] = useState<{ r: LiveRequest; action?: 'withdraw' | 'cancel' } | null>(null);
  const [history, setHistory] = useState(false);
  // Sent back for changes: Apply leave starts from that request and sends it again.
  const [resend, setResend] = useState<LiveRequest | null>(null);
  const [holidays, setHolidays] = useState(false);
  const [sheet, setSheet] = useState<'comp-off' | 'encash' | 'absence' | null>(null);
  const [withdraw, setWithdraw] = useState<{ kind: 'claim' | 'encash'; id: string; text: string } | null>(null);
  const today = d ? isoDate(d.today) : TODAY0;
  const co = live.compOff?.data;
  const en = live.encash?.data;
  const waitingClaims = co?.claims.filter((x) => x.status === 'pending') ?? [];
  const ab = live.absence?.data ?? null;
  const optional = d ? d.holidays.list.filter((h) => h.kind === 'optional' || h.kind === 'restricted') : [];
  const chosen = optional.filter((h) => h.chosen).length;
  const limit = d?.holidays.calendar?.optionalLimit ?? 0;
  const upcoming = d ? d.holidays.list.filter((h) => h.on >= d.today && (!(h.kind === 'optional' || h.kind === 'restricted') || h.chosen)) : [];
  return (
    <TimePage active="My leave">
      <PageHeader
        title="My leave"
        description={d ? `Leave year ${fd(d.year.start)} – ${fd(d.year.end)}${d.holidays.calendar ? ` · ${d.holidays.calendar.name}` : ''}` : undefined}
        actions={live.state === 'ready' ? (
          <div className="yx-tim-row">
            {live.onOpenCard && <Button onClick={live.onOpenCard}>My leave card</Button>}
            {co?.enabled && <Button onClick={() => setSheet('comp-off')}>Claim comp-off</Button>}
            {en && (en.open || en.waiting) && <Button onClick={() => setSheet('encash')}>Encash leave</Button>}
            <Button variant="primary" icon={CalendarPlus} onClick={() => setApply(true)}>Apply leave</Button>
          </div>
        ) : undefined}
      />
      <LiveStates state={live.state} onRetry={live.onRetry} what="Your leave">
        {d && (
          <>
            {ab && (
              <Card title={`${ABSENCE_TITLE[ab.kind]} until ${fd(ab.to)}`} actions={<Button size="sm" onClick={() => setSheet('absence')}>Open status</Button>}>
                <div className="yx-tim-row"><span className="yx-tim-muted">Back on {fd(isoAdd(ab.to, 1))}</span><DueBadge date={isoDate(isoAdd(ab.to, 1))} today={today} /></div>
              </Card>
            )}
            {(waitingClaims.length > 0 || en?.waiting) && (
              <Card title={`Waiting for approval (${waitingClaims.length + (en?.waiting ? 1 : 0)})`}>
                <ul className="yx-tim-list">
                  {waitingClaims.map((x) => (
                    <li key={x.id}>
                      <span className="yx-tim-list__main" style={MAIN}><strong>Comp-off · {x.days === 0.5 ? 'half day' : daysWord(x.days)} · worked {fd(x.on)}</strong><span className="yx-tim-muted">{x.useBy ? `Use by ${fd(x.useBy)}` : 'No expiry'}</span></span>
                      <Button size="sm" onClick={() => setWithdraw({ kind: 'claim', id: x.id, text: `Comp-off for ${fd(x.on)}` })}>Withdraw</Button>
                    </li>
                  ))}
                  {en?.waiting && (
                    <li>
                      <span className="yx-tim-list__main" style={MAIN}><strong>Encash · {daysWord(en.waiting.days)} {en.types.find((t) => t.leaveTypeId === en.waiting!.leaveTypeId)?.name ?? ''}</strong><span className="yx-tim-muted">Sent {formatDate(new Date(en.waiting.createdAt))} · its days are held until it is decided</span></span>
                      <Button size="sm" onClick={() => setWithdraw({ kind: 'encash', id: en.waiting!.id, text: 'This encashment request' })}>Withdraw</Button>
                    </li>
                  )}
                </ul>
              </Card>
            )}
            <BalanceCards
              live={{
                balances: d.balances,
                onViewPending: (typeId) => {
                  const r = d.requests.find((x) => x.status === 'pending' && x.type?.id === typeId);
                  if (r) setOpen({ r });
                },
              }}
            />
            <div className="yx-tim-grid">
              <div data-span="7">
                <Card title="My requests" actions={live.onHistory ? <Button size="sm" onClick={() => setHistory(true)}>All requests</Button> : undefined}>
                  {d.requests.length === 0 ? (
                    <EmptyState compact title="No leave requests yet" description="Apply for leave and it will show here with its status." action={<Button variant="primary" icon={CalendarPlus} onClick={() => setApply(true)}>Apply leave</Button>} />
                  ) : (
                    <ul className="yx-tim-list" aria-label="My leave requests">
                      {d.requests.map((r) => (
                        <li key={r.id}>
                          <span className="yx-tim-list__main" style={MAIN}>
                            <strong>{r.type?.name ?? 'Leave'} · {isoSpan(r.from, r.to)}</strong>
                            <span className="yx-tim-muted">{daysWord(r.days)}{halvesText(r)}{r.certificate !== 'none' ? ` · certificate ${r.certificate === 'verified' ? 'verified by HR' : 'to give HR'}` : ''}</span>
                            <span className="yx-tim-row">
                              <LeaveStatusBadge status={r.status} />
                              {r.from >= d.today && <DueBadge date={isoDate(r.from)} today={today} />}
                            </span>
                          </span>
                          <span className="yx-tim-row">
                            <Button size="sm" onClick={() => setOpen({ r })}>View</Button>
                            {r.status === 'pending' && <Button size="sm" onClick={() => setOpen({ r, action: 'withdraw' })}>Withdraw</Button>}
                            {r.status === 'sent_back' && live.onResend && <Button size="sm" variant="primary" onClick={() => setResend(r)}>Change and send again</Button>}
                            {cancellable(r, d.today) && <Button size="sm" onClick={() => setOpen({ r, action: 'cancel' })}>Ask to cancel</Button>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
              <div data-span="5">
                <Card title="Upcoming holidays">
                  {!d.holidays.calendar ? (
                    <EmptyState compact title="No holiday calendar yet" description="HR has not set up holidays for your location." />
                  ) : (
                    <>
                      {upcoming.length === 0 ? <p className="yx-tim-muted">No more holidays this year.</p> : (
                        <ul className="yx-tim-list">
                          {upcoming.map((h) => (
                            <li key={h.id} style={{ flexWrap: 'nowrap' }}>
                              <span className="yx-tim-list__main" style={{ flex: '1 1 auto' }}><span>{h.name}{h.halfDay ? ' (half day)' : ''}</span><span className="yx-tim-muted"><DayDate date={isoDate(h.on)} />{h.chosen ? ' · Optional' : ''}</span></span>
                              <DueBadge date={isoDate(h.on)} today={today} />
                            </li>
                          ))}
                        </ul>
                      )}
                      {optional.length > 0 && <Button size="sm" onClick={() => setHolidays(true)}>Optional holidays · {chosen} chosen · {Math.max(0, limit - chosen)} left</Button>}
                    </>
                  )}
                </Card>
              </div>
            </div>
            {apply && <ApplyLeaveSheet live={{ data: d, live, onClose: () => setApply(false) }} />}
            {resend && <ApplyLeaveSheet key={resend.id} live={{ data: d, live, resend, onClose: () => setResend(null) }} />}
            {live.onHistory && d && (
              <LeaveHistoryDrawer
                open={history}
                onClose={() => setHistory(false)}
                types={d.balances.map((b) => ({ id: b.leaveTypeId, name: b.name }))}
                load={live.onHistory}
                onOpenRequest={(r) => {
                  setHistory(false);
                  setOpen({ r });
                }}
              />
            )}
            {open && <LeaveRequestDetail key={`${open.r.id}-${open.action}`} live={{ r: open.r, data: d, action: open.action, live, onClose: () => setOpen(null), onResend: () => { setOpen(null); setResend(open.r); } }} />}
            {holidays && <OptionalHolidaysSheet live={{ data: d, onChoose: live.onChooseHoliday, onClose: () => setHolidays(false) }} />}
            {sheet === 'comp-off' && live.compOff && <CompOffClaim live={{ ...live.compOff, onClose: () => setSheet(null) }} />}
            {sheet === 'encash' && live.encash && <EncashmentRequest live={{ ...live.encash, onClose: () => setSheet(null) }} />}
            {sheet === 'absence' && ab && live.absence && <LongAbsenceCard live={{ absence: ab, persona: 'emp', today: d.today, onClose: () => setSheet(null), onAskReturn: (on, note) => live.absence!.onAskReturn(ab.id, on, note) }} />}
            <ConfirmDialog
              open={!!withdraw}
              onOpenChange={(o) => !o && setWithdraw(null)}
              title="Withdraw this request?"
              consequence={withdraw ? `${withdraw.text} hasn't been approved yet, so it's withdrawn at once.` : ''}
              confirmLabel="Withdraw"
              cancelLabel="Keep it"
              destructive
              onConfirm={async () => {
                if (!withdraw) return;
                await (withdraw.kind === 'claim' ? live.compOff!.onWithdraw(withdraw.id) : live.encash!.onWithdraw(withdraw.id));
                setWithdraw(null);
              }}
            />
          </>
        )}
      </LiveStates>
    </TimePage>
  );
}

type LiveRequestProps = { r: LiveRequest; data: MyLeave; action?: 'withdraw' | 'cancel'; live: LiveLeaveHome; onClose: () => void; /** Sent back: open Apply leave from this request. */ onResend?: () => void };
/** TIM-19 in the app: the request in a drawer; withdraw (pending) or ask to cancel with a reason (approved). */
function LiveLeaveRequestView({ r, data, action, live, onClose, onResend }: LiveRequestProps) {
  const [dlg, setDlg] = useState<'withdraw' | 'cancel' | 'cancel_days' | 'extend' | undefined>(action);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const bal = data.balances.find((b) => b.leaveTypeId === r.type?.id);
  const close = () => {
    setDlg(undefined);
    setNote('');
    setTried(false);
  };
  const footer =
    r.status === 'pending' ? <DrawerFoot rest={<Button onClick={onClose}>Close</Button>} main={<Button variant="danger" onClick={() => setDlg('withdraw')}>Withdraw request</Button>} />
    : r.status === 'sent_back' && onResend && live.onResend ? <DrawerFoot main={<Button variant="primary" onClick={onResend}>Change and send again</Button>} rest={<><Button onClick={() => setDlg('withdraw')}>Withdraw</Button><Button onClick={onClose}>Close</Button></>} />
    : cancellable(r, data.today) ? <DrawerFoot rest={<>{r.leaveDays && live.onCancelDays && !r.changeWaiting && r.leaveDays.length > 1 && <Button onClick={() => setDlg('cancel_days')}>Cancel some days</Button>}{r.leaveDays && live.onExtend && r.toHalf === 'full' && <Button onClick={() => setDlg('extend')}>Extend</Button>}<Button onClick={onClose}>Close</Button></>} main={<Button variant="danger" onClick={() => setDlg('cancel')}>Ask to cancel</Button>} />
    : <DrawerFoot hint={`${LEAVE_STATUS[r.status].label}${r.decidedAt ? ` on ${formatDate(new Date(r.decidedAt))}` : ''}`} rest={<Button onClick={onClose}>Close</Button>} />;
  return (
    <>
      <Drawer open={!dlg} onOpenChange={(o) => !o && onClose()} title={`${r.type?.name ?? 'Leave'} · ${data.employee.name}`} subtitle={isoSpan(r.from, r.to)} footer={footer}>
        <div className="yx-tim-stack">
          <div className="yx-tim-row">
            <LeaveStatusBadge status={r.status} />
            {r.from >= data.today && <DueBadge date={isoDate(r.from)} today={isoDate(data.today)} prefix="Starts" />}
          </div>
          <Kpis
            items={[
              { label: 'Type', value: r.type?.name ?? 'Leave' },
              { label: 'Dates', value: `${isoSpan(r.from, r.to)}${halvesText(r)}` },
              { label: 'Days', value: r.days },
              { label: bal?.hasBalance ? `${bal.name} available now` : 'Balance', value: bal?.hasBalance ? bal.available : 'Not counted' },
            ]}
          />
          {r.sentBack && <InlineAlert tone="warning" title={`${r.sentBack.by ?? 'Your approver'} sent it back for changes`}>{r.sentBack.reason}</InlineAlert>}
          {r.changeWaiting && <InlineAlert tone="info" title="Cancel some days: waiting for approval">{r.changeWaiting.map((on) => formatDate(dayOfIso(on))).join(', ')}</InlineAlert>}
          <p><strong>Reason:</strong> {r.reason || 'None given'}</p>
          {r.certificate !== 'none' && <div className="yx-tim-row"><Badge tone={r.certificate === 'verified' ? 'success' : 'neutral'}>{r.certificate === 'verified' ? 'Certificate verified by HR' : 'Certificate to give HR'}</Badge></div>}
          <p className="yx-tim-muted">Sent {formatDate(new Date(r.createdAt || Date.now()))}{r.decidedAt ? ` · decided ${formatDate(new Date(r.decidedAt))}` : ''}</p>
        </div>
      </Drawer>
      {dlg === 'cancel_days' && r.leaveDays && live.onCancelDays && <CancelSomeDaysDrawer days={r.leaveDays} today={data.today} onSend={(x) => live.onCancelDays!(r.id, x)} onClose={onClose} />}
      {dlg === 'extend' && live.onExtend && <ExtendLeaveDrawer lastDay={r.to} typeName={r.type?.name ?? 'Leave'} onSend={(x) => live.onExtend!(r.id, x)} onClose={onClose} />}
      <ConfirmDialog
        open={dlg === 'withdraw'}
        onOpenChange={(o) => !o && close()}
        title="Withdraw this request?"
        consequence={r.status === 'sent_back' ? 'It was sent back, so it holds no days. Withdrawn, it stays in your history.' : `It hasn't been approved yet, so it's withdrawn at once and your ${plural(r.days, 'pending day')} ${r.days === 1 ? 'returns' : 'return'} to your balance.`}
        confirmLabel="Withdraw request"
        cancelLabel="Keep request"
        destructive
        onConfirm={async () => {
          await live.onWithdraw(r.id);
          onClose();
        }}
      />
      <ConfirmDialog
        open={dlg === 'cancel'}
        onOpenChange={(o) => !o && close()}
        title="Ask to cancel approved leave?"
        consequence={`Your manager approves the cancellation. Once approved, the ${daysWord(r.days)} ${r.days === 1 ? 'goes' : 'go'} back to your balance.`}
        confirmLabel="Ask to cancel"
        cancelLabel="Keep leave"
        destructive
        onConfirm={async () => {
          setTried(true);
          if (!note.trim()) {
            document.getElementById('lv-cancel-reason')?.focus();
            return false;
          }
          await live.onCancel(r.id, note.trim());
          onClose();
        }}
      >
        <FormField id="lv-cancel-reason" label="Why" required error={tried && !note.trim() ? 'Say why you are cancelling.' : null}>
          <TextArea rows={3} value={note} onChange={setNote} maxLength={500} placeholder="For example: the client visit moved to December" />
        </FormField>
      </ConfirmDialog>
    </>
  );
}

const MATERNITY_CASES: { value: MaternityCase; label: string }[] = [
  { value: 'birth', label: 'Birth' },
  { value: 'third_child', label: 'Third child or later' },
  { value: 'adoption', label: 'Adoption or surrogacy' },
  { value: 'miscarriage', label: 'Miscarriage' },
  { value: 'tubectomy', label: 'Tubectomy' },
];
const COUNTED_AS: Record<LeavePlan['days'][number]['countedAs'], string> = { leave: 'Leave', sandwich: 'Between leave days · counted', holiday: 'Holiday · not counted', weekly_off: 'Weekly off · not counted' };

/** TIM-18 in the app: the design's form and summary; the summary comes from the server's own rules. */
/**
 * TIM-18 in the app: my own leave (`data`, `live`), or HR applying for someone (`forSomeone`, founder answer B): the
 * first field picks the person, then the same form with their leave types, balances and the server's summary.
 */
function LiveApplyLeavePanel({ data, live, forSomeone, resend, startOn, onClose }: { data?: MyLeave; live?: LiveLeaveHome; forSomeone?: LiveApplyFor; /** Sent back for changes: starts from that request; Send sends it again. */ resend?: LiveRequest; startOn?: string; onClose: () => void }) {
  const [personId, setPersonId] = useState<string | null>(null);
  const [target, setTarget] = useState<ApplyForForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const types = forSomeone ? (target?.balances ?? []) : data!.balances;
  const today = forSomeone ? target?.today : data!.today;
  const [typeId, setTypeId] = useState<string | null>(resend?.type?.id ?? types[0]?.leaveTypeId ?? null);
  const [from, setFrom] = useState<Date | null>(resend ? isoDate(resend.from) : startOn ? isoDate(startOn) : null);
  const [to, setTo] = useState<Date | null>(resend && resend.to !== resend.from ? isoDate(resend.to) : null);
  const [fromHalf, setFromHalf] = useState<'full' | 'second'>(resend?.fromHalf ?? 'full');
  const [toHalf, setToHalf] = useState<'full' | 'first'>(resend?.toHalf ?? 'full');
  const [reason, setReason] = useState(resend?.reason ?? '');
  // Maternity (YX-LV-10): the expected date and the case decide the weeks and the eligibility window.
  const [expectedOn, setExpectedOn] = useState<Date | null>(null);
  const [mCase, setMCase] = useState<MaternityCase>('birth');
  const [delegate, setDelegate] = useState<string | null>(null);
  const [notify, setNotify] = useState<{ id: string; name: string }[]>([]);
  const [certificate, setCertificate] = useState(false);
  const [plan, setPlan] = useState<LeavePlan | null>(null);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  // A new person: load their leave types and balances (only theirs are offered).
  useEffect(() => {
    if (!forSomeone) return;
    setTarget(null);
    setLoadError(null);
    setTypeId(null);
    if (!personId) return;
    let on = true;
    forSomeone.onLoad(personId).then(
      (x) => {
        if (!on) return;
        setTarget(x);
        setTypeId(x.balances[0]?.leaveTypeId ?? null);
      },
      (e: unknown) => on && setLoadError(e instanceof Error ? e.message : 'Their leave did not load.'),
    );
    return () => {
      on = false;
    };
  }, [personId]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = types.find((t) => t.leaveTypeId === typeId);
  const maternity = chosen?.kind === 'maternity';
  const f = from ? isoOf(from) : '';
  const end = to ? isoOf(to) : f;
  const oneDay = f !== '' && end === f;
  const extra = maternity ? { expectedOn: expectedOn ? isoOf(expectedOn) : undefined, maternityCase: mCase } : {};

  // The live summary comes from the server once the dates make sense; no error while typing.
  useEffect(() => {
    setPlan(null);
    if (!typeId || !f || !end || end < f || (forSomeone && !target)) return;
    let on = true;
    const h = setTimeout(() => {
      const input = { leaveTypeId: typeId, from: f, to: end, fromHalf, toHalf, ...extra };
      void (forSomeone ? forSomeone.onPreview(target!.employee.id, input) : live!.onPreview(input))
        .then((x) => on && setPlan(x))
        .catch(() => on && setPlan(null));
    }, 300);
    return () => {
      on = false;
      clearTimeout(h);
    };
  }, [typeId, f, end, fromHalf, toHalf, expectedOn, mCase, target]); // eslint-disable-line react-hooks/exhaustive-deps

  const errors = useMemo(() => {
    const e: { fieldId: string; message: string }[] = [];
    if (forSomeone && !personId) e.push({ fieldId: 'lv-person', message: 'Choose the person.' });
    if (!typeId && (!forSomeone || personId)) e.push({ fieldId: 'lv-type', message: 'Choose the kind of leave.' });
    if (!f) e.push({ fieldId: 'lv-from', message: 'Choose the first day.' });
    if (f && end < f) e.push({ fieldId: 'lv-to', message: 'The last day is before the first day.' });
    if (plan?.certificateNeeded && !certificate) e.push({ fieldId: 'lv-cert', message: 'Tick that you will give a certificate to HR.' });
    for (const b of plan?.blocks ?? []) e.push({ fieldId: 'lv-from', message: b });
    return e;
  }, [typeId, f, end, plan, certificate, personId]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  const send = () => {
    if (errors.length) {
      saveErrors.reveal();
      document.getElementById(errors[0]!.fieldId)?.focus();
      return;
    }
    void run('apply', async () => {
      const input = { leaveTypeId: typeId!, from: f, to: end, fromHalf, toHalf, reason: reason.trim() || undefined, delegateUserId: delegate ?? undefined, certificate: certificate || undefined, ...(!forSomeone && notify.length ? { notifyUserIds: notify.map((p) => p.id) } : {}), ...extra };
      if (forSomeone && target) {
        await forSomeone.onApply(target.employee.id, input);
        toast({ tone: 'success', title: plan?.approval === 'approved' ? `Leave approved for ${target.employee.name}` : `Leave applied for ${target.employee.name} · sent for approval` });
      } else if (resend && live?.onResend) await live.onResend(resend.id, input);
      else await live!.onApply(input);
      onClose();
    });
  };
  const their = (mine: string, theirs: string) => (forSomeone ? theirs : mine);
  const halves = plan?.type.rules.halfDays !== false && f !== '';
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={forSomeone ? 'Apply leave for someone' : resend ? 'Change and send again' : 'Apply leave'}
      size="lg"
      dirty={Boolean(f || reason || personId)}
      footer={<DrawerFoot rest={<Button onClick={onClose}>Cancel</Button>} main={<Button variant="primary" loading={busy === 'apply'} onClick={send}>{resend ? 'Send again' : 'Send request'}</Button>} />}
    >
      <div className="yx-tim-editor">
        <div className="yx-tim-form">
          <ErrorSummary errors={saveErrors.shownErrors} title="Check these before sending" />
          {resend?.sentBack && <InlineAlert tone="warning" title={`${resend.sentBack.by ?? 'Your approver'} asked for changes`}>{resend.sentBack.reason}</InlineAlert>}
          {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
          {forSomeone && (
            <FormField id="lv-person" label="Employee" required error={errorOf('lv-person')}>
              <LivePicker kind="people" label="Employee" value={personId} onChange={setPersonId} onPick={(_k, q) => forSomeone.onFindPeople(q)} />
            </FormField>
          )}
          {forSomeone && loadError && <InlineAlert tone="danger" title="Their leave did not load">{loadError} Pick the person again.</InlineAlert>}
          {forSomeone && !target ? <p className="yx-tim-muted">Pick the employee to see their leave types and balances.</p> : (
          <>
          <FormField id="lv-type" label="Leave type" required error={errorOf('lv-type')}>
            <Select value={typeId} onChange={setTypeId} options={types.map((t) => ({ value: t.leaveTypeId, label: t.name, description: t.hasBalance ? `${daysWord(t.available)} available` : t.kind === 'lop' ? `${t.takenThisYear} taken this year` : undefined }))} />
          </FormField>
          {maternity && (
            <>
              <FormField id="lv-expected" label="Expected date of delivery (or of the event)" required helper="Eligibility counts the days you worked in the 12 months before it.">
                <DatePicker value={expectedOn} onChange={setExpectedOn} />
              </FormField>
              <FormField id="lv-case" label="Kind of maternity leave">
                <Segment label="Kind of maternity leave" value={mCase} onChange={setMCase} options={MATERNITY_CASES} />
              </FormField>
            </>
          )}
          <FieldRow>
            <FormField id="lv-from" label="From" required error={errorOf('lv-from')}>
              <DatePicker value={from} onChange={setFrom} min={today ? addDays(isoDate(today), -60) : undefined} />
            </FormField>
            <FormField id="lv-to" label="To" helper="Leave empty for one day" error={errorOf('lv-to')}>
              <DatePicker value={to} onChange={setTo} min={from ?? undefined} />
            </FormField>
          </FieldRow>
          {halves && (oneDay ? (
            <FormField label="Part of the day">
              <Select
                value={fromHalf === 'second' ? 'second' : toHalf === 'first' ? 'first' : 'full'}
                onChange={(v) => {
                  setFromHalf(v === 'second' ? 'second' : 'full');
                  setToHalf(v === 'first' ? 'first' : 'full');
                }}
                options={[{ value: 'full', label: 'Full day' }, { value: 'first', label: 'First half only' }, { value: 'second', label: 'Second half only' }]}
              />
            </FormField>
          ) : end > f ? (
            <FieldRow>
              <FormField label="First day"><Select value={fromHalf} onChange={(v) => v && setFromHalf(v as 'full' | 'second')} options={[{ value: 'full', label: 'Full day' }, { value: 'second', label: 'Second half only' }]} /></FormField>
              <FormField label="Last day"><Select value={toHalf} onChange={(v) => v && setToHalf(v as 'full' | 'first')} options={[{ value: 'full', label: 'Full day' }, { value: 'first', label: 'First half only' }]} /></FormField>
            </FieldRow>
          ) : null)}
          <FormField id="lv-reason" label="Reason" optional helper={plan?.type.rules.medical ? their('Only you and HR can read this.', 'Only they and HR can read this.') : their('Your approvers see this.', 'Their approvers see this.')}>
            <TextArea rows={2} value={reason} onChange={setReason} maxLength={1000} />
          </FormField>
          {plan?.certificateNeeded && (
            <FormField id="lv-cert" label="Medical certificate" error={errorOf('lv-cert')}>
              <Checkbox label={their('I will give a certificate to HR', 'They will give a certificate to HR')} description={their("Only HR sees it; your manager sees only whether it's in and verified.", "Only HR sees it; their manager sees only whether it's in and verified.")} checked={certificate} onChange={setCertificate} />
            </FormField>
          )}
          {!forSomeone && (
            <FormField id="lv-notify" label="Notify colleagues" optional helper={NOTIFY_HELP}>
              <NotifyColleagues value={notify} onChange={setNotify} onFind={(q) => live!.onFindPeople(q)} />
            </FormField>
          )}
          {!forSomeone && (
            <FormField id="lv-delegate" label="Delegate to" optional helper="If you approve requests, they go to this person on your leave days. Otherwise they go to your manager.">
              <LivePicker kind="people" label="Colleague" value={delegate} onChange={setDelegate} onPick={(_k, q) => live!.onFindPeople(q)} />
            </FormField>
          )}
          </>
          )}
        </div>
        <div className="yx-tim-sticky" style={{ maxWidth: 'var(--yx-form-max)', minWidth: 0 }}>
          <section className="yx-tim-effect" aria-live="polite" aria-label="Leave summary">
            <strong>Summary</strong>
            {!plan ? <p className="yx-tim-muted">{forSomeone && !target ? 'Pick the person, then the dates, to see the days counted and their balance after.' : `Pick the dates to see the days counted and ${their('your', 'their')} balance after.`}</p> : (
              <>
                <dl className="yx-tim-stack">
                  <div className="yx-tim-effect__row"><dt>Days counted</dt><dd>{plan.total}{plan.sandwichDays > 0 ? ` (incl. ${plural(plan.sandwichDays, 'day')} between leave days)` : ''}</dd></div>
                  {plan.holidaysExcluded > 0 && <div className="yx-tim-effect__row"><dt>Holidays / weekly offs not counted</dt><dd>{plan.holidaysExcluded}</dd></div>}
                  {plan.balanceAfter !== null && <div className="yx-tim-effect__row"><dt>Balance after</dt><dd>{plan.balanceAfter < 0 ? <Badge tone="danger">{`${plan.balanceAfter}`}</Badge> : plan.balanceAfter}</dd></div>}
                  {plan.balanceAfter === null && chosen && !chosen.paid && <div className="yx-tim-effect__row"><dt>Unpaid days this year (with this)</dt><dd>{chosen.takenThisYear + plan.total}</dd></div>}
                  {plan.notice && <div className="yx-tim-effect__row"><dt>Last working day</dt><dd>{plan.notice.newLastDay === plan.notice.lastDay ? `Stays ${fd(plan.notice.lastDay)}` : `${fd(plan.notice.lastDay)} → ${fd(plan.notice.newLastDay)}`}</dd></div>}
                  {plan.noticeSkipped && <div className="yx-tim-effect__row"><dt>Notice</dt><dd>Applied by HR: {daysWord(plan.noticeDays ?? 0)}' notice not needed</dd></div>}
                  <div className="yx-tim-effect__row"><dt>{their('Your team', 'Their team')}</dt><dd>{plan.othersOff ? `${plan.othersOff} ${plan.othersOff === 1 ? 'other is' : 'others are'} off then` : 'No one else is off then'}</dd></div>
                </dl>
                {plan.sandwichDays > 0 && <p className="yx-tim-note">Weekends and holidays between leave days count as leave under {their('your', 'the')} policy.</p>}
                {plan.days.length > 0 && (
                  <ul className="yx-tim-days">
                    {plan.days.map((x) => <li key={x.on}><DayDate date={isoDate(x.on)} /><span>{x.countedAs === 'leave' && x.portion === 0.5 ? 'Half day' : COUNTED_AS[x.countedAs]}</span></li>)}
                  </ul>
                )}
                {plan.warnings.map((w) => <InlineAlert key={w} tone="warning">{w}</InlineAlert>)}
                {forSomeone && <p className="yx-tim-note">{plan.approval === 'approved' ? 'Approved at once (company setting), marked "Applied by HR".' : 'Goes to their manager for approval, marked "Applied by HR".'}</p>}
              </>
            )}
          </section>
        </div>
      </div>
    </Drawer>
  );
}

/** TIM-23 in the app: tick up to the calendar's limit; Save sends each change. */
function LiveOptionalHolidaysPanel({ data, onChoose, onClose }: { data: MyLeave; onChoose: LiveLeaveHome['onChooseHoliday']; onClose: () => void }) {
  const list = data.holidays.list.filter((h) => h.kind === 'optional' || h.kind === 'restricted');
  const n = data.holidays.calendar?.optionalLimit ?? 0;
  const initial = list.filter((h) => h.chosen).map((h) => h.id);
  const [sel, setSel] = useState<string[]>(initial);
  const { busy, error, run } = useRun();
  const full = sel.length >= n;
  const add = sel.filter((x) => !initial.includes(x));
  const drop = initial.filter((x) => !sel.includes(x));
  const save = () => {
    // Nothing changed: nothing to send, so Save just closes.
    if (!add.length && !drop.length) return onClose();
    void run('save', async () => {
      // Give back first, so a swap at the limit never goes over it.
      for (const id of drop) await onChoose(id, false);
      for (const id of add) await onChoose(id, true);
      onClose();
    });
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Optional holidays"
      footer={<DrawerFoot rest={<Button onClick={onClose}>Cancel</Button>} main={<Button variant="primary" loading={busy === 'save'} onClick={save}>Save choices</Button>} />}
    >
      <div className="yx-tim-form">
        <p>Choose <strong>{n}</strong> of {list.length} optional holidays · {data.holidays.calendar?.name}.</p>
        {data.holidays.calendar?.movedOn && <InlineAlert tone="info" title="Prorated after your move">You moved to this office on {fd(data.holidays.calendar.movedOn)}, so you get {plural(n, 'optional holiday')} for the rest of the year.</InlineAlert>}
        {initial.length > n && <InlineAlert tone="warning" title={`${initial.length} chosen, the limit is now ${n}`}>Untick {plural(initial.length - n, 'holiday')} you have not taken, then save.</InlineAlert>}
        {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
        <ul className="yx-tim-check">
          {list.map((h) => {
            const picked = sel.includes(h.id);
            const past = h.on < data.today;
            const reason = past ? (picked ? 'Taken' : 'Already passed') : !picked && full ? 'Limit reached · untick one to swap' : undefined;
            return (
              <li key={h.id}>
                <div className="yx-tim-row">
                  <Checkbox label={`${h.name} · ${fd(h.on)}`} description={reason} checked={picked} disabled={past || (!picked && full)} onChange={(c) => setSel(c ? [...sel, h.id] : sel.filter((x) => x !== h.id))} />
                  {!past && <DueBadge date={isoDate(h.on)} today={isoDate(data.today)} />}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="yx-tim-muted" aria-live="polite">{sel.length} chosen · {Math.max(0, n - sel.length)} left</p>
      </div>
    </Drawer>
  );
}

const SCOPE_TEXT = { team: 'Your team', granted: 'The people you look after', company: 'Everyone in the company' } as const;

/** Consecutive days of the same leave become one chip; a half day stays on its own with its half in the name. */
function liveAbsences(d: LiveCalendarData): (TeamAbsence & { name: string })[] {
  const out: (TeamAbsence & { name: string })[] = [];
  for (const p of d.people) {
    const days = [...p.days].sort((a, b) => a.on.localeCompare(b.on));
    for (const x of days) {
      const last = out[out.length - 1];
      const pending = x.status === 'pending';
      if (last && last.memberId === p.id && x.part === 'full' && last.code === x.code && Boolean(last.pending) === pending && isoOf(addDays(last.end, 1)) === x.on && !last.name.includes('half')) last.end = isoDate(x.on);
      else out.push({ memberId: p.id, start: isoDate(x.on), end: isoDate(x.on), code: x.code, name: x.part === 'full' ? x.name : `${x.name}, ${x.part} half`, pending });
    }
  }
  return out;
}

/** TIM-20 in the app: people × days (two weeks, one under 1100 px) and the month, with what waits for approval. */
/** Batch C item 15: the server sends attendance only for the manager's own team (answer 2509). */
const liveDots = (d: LiveCalendarData): TeamDayDot[] => d.people.flatMap((p) => (p.attendance ?? []).map((a) => ({ memberId: p.id, on: isoDate(a.on), dot: a.dot })));

function LiveTeamLeaveCalendar({ live }: { live: LiveTeamLeave }) {
  const d = live.data;
  const [tab, setTab] = useState('team');
  const days = useMedia('(max-width: 1100px)') ? 7 : 14;
  const { toast } = useToast();
  const today = new Date();
  const start = d ? isoDate(d.from) : day0(today);
  const absences = d ? liveAbsences(d) : [];
  const members = d ? d.people.map((p) => ({ id: p.id, name: p.me ? `${p.name} (you)` : p.name, team: SCOPE_TEXT[d.scope] })) : [];
  const holidays = d ? [...new Map(d.people.flatMap((p) => p.holidays).map((h) => [h.on, { date: isoDate(h.on), name: h.name }])).values()] : [];
  const holidayOf = (id: string, day: Date) => !!d?.people.find((p) => p.id === id)?.holidays.some((h) => h.on === isoOf(day));
  const pending = absences.filter((a) => a.pending);
  const range = d ? isoSpan(d.from, d.to) : '';
  const twoWeeks = (from: string) => live.onRange(from, isoAdd(from, 13));
  const month = (first: Date) => live.onRange(isoOf(new Date(first.getFullYear(), first.getMonth(), 1)), isoOf(new Date(first.getFullYear(), first.getMonth() + 1, 0)));
  const nameOf = (id: string) => d?.people.find((p) => p.id === id)?.name ?? '';
  const exportCsv = () => {
    if (!d || !absences.length) return void toast({ title: 'Nothing to export in this range', tone: 'warning' });
    downloadCsv(`leave-calendar-${d.from}-${d.to}.csv`, [
      ['Person', 'Leave', 'From', 'To', 'Status'],
      ...absences.map((a) => [nameOf(a.memberId), a.name, formatDate(a.start), formatDate(a.end), a.pending ? 'Pending' : 'Approved']),
    ]);
  };
  const pendingList = pending.length > 0 && (
    <Card title={`Waiting for approval (${pending.length})`}>
      <ul className="yx-tim-list">
        {pending.map((a) => (
          <li key={`${a.memberId}-${a.start.getTime()}`}>
            <span className="yx-tim-list__main" style={MAIN}><PersonLabel name={nameOf(a.memberId)} secondary={`${a.name} · ${span(a.start, a.end)}`} /></span>
            <Button variant="review" size="sm" onClick={() => live.onNavigate(live.approvalsHref)}>Review</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
  return (
    <TimePage active="Leave calendar">
      <PageHeader
        title="Leave calendar"
        description={d ? `${SCOPE_TEXT[d.scope]} · ${plural(d.people.length, 'person', 'people')}` : undefined}
        actions={live.state === 'ready' ? <Button icon={Download} onClick={exportCsv}>Export {range}</Button> : undefined}
      />
      <LiveStates state={live.state} onRetry={live.onRetry} what="Team leave">
        {d && (d.people.length === 0 ? (
          <EmptyState title="No one to show" description="People you manage, or look after in HR, appear here." />
        ) : (
          <Tabs
            value={tab}
            onValueChange={(t) => {
              setTab(t);
              if (t === 'month') month(start);
              else twoWeeks(isoOf(day0(today)));
            }}
          >
            <TabsList aria-label="Calendar views"><TabsTrigger value="team">People × days</TabsTrigger><TabsTrigger value="month">Month</TabsTrigger></TabsList>
            <TabsContent value="team">
              <div className="yx-tim-stack">
                <div className="yx-tim-row">
                  <Button size="sm" icon={ChevronLeft} onClick={() => twoWeeks(isoAdd(d.from, -7))}>Previous week</Button>
                  <Button size="sm" icon={ChevronRight} onClick={() => twoWeeks(isoAdd(d.from, 7))}>Next week</Button>
                </div>
                {absences.length === 0 && liveDots(d).length === 0 ? (
                  <EmptyState title={`No one is away ${range}`} description="Leave shows here as soon as someone requests it." action={<Button onClick={() => twoWeeks(isoAdd(d.from, 14))}>Next 2 weeks</Button>} />
                ) : (
                  <TeamCalendar members={members} absences={absences} holidays={holidays} start={start} days={days} today={today} team={SCOPE_TEXT[d.scope]} weeklyOff={() => false} memberOff={holidayOf} dots={liveDots(d)} onDayClick={live.onOpenDay ? (id, x) => live.onOpenDay!(id, isoOf(x)) : undefined} />
                )}
                {pendingList}
              </div>
            </TabsContent>
            <TabsContent value="month">
              <div className="yx-tim-stack">
                <Calendar
                  events={absences.map((a, i) => ({ id: `e${i}`, title: `${a.code} · ${nameOf(a.memberId).split(' ')[0]}`, start: a.start, end: a.end, allDay: true, type: 'leave', pending: a.pending }))}
                  holidays={holidays}
                  defaultDate={today}
                  month={start}
                  today={today}
                  views={['month']}
                  hideTypeLabel
                  weeklyOff={() => false}
                  onDateChange={(x) => x.getMonth() !== start.getMonth() && month(x)}
                  aria-label="Team leave, month"
                />
                <p className="yx-tim-note">Solid chip: approved · Dashed chip: pending · Shaded day: holiday</p>
                {pendingList}
              </div>
            </TabsContent>
          </Tabs>
        ))}
      </LiveStates>
    </TimePage>
  );
}

const LEDGER_TEXT: Record<string, string> = { opening: 'Opening balance', accrual: 'Credited', taken: 'Leave taken', cancelled: 'Leave cancelled', adjustment: 'Adjusted by HR', carry_forward: 'Carried forward', lapse: 'Lapsed', comp_off: 'Comp-off credited' };

/** TIM-21 (HR) in the app: whose card, their balances, every ledger line, and Adjust with a reason. */
function LiveLeaveCardScreen({ live }: { live: LiveLeaveCard }) {
  const d = live.data;
  const [pick, setPick] = useState<string | null>(null);
  const person = d?.people.find((p) => p.employeeId === pick) ?? d?.people[0];
  const [ledger, setLedger] = useState<{ id: string; rows: LedgerRow[] } | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [adj, setAdj] = useState(false);
  const load = (id: string) => {
    setLedgerError(null);
    live.onLedger(id).then((rows) => setLedger({ id, rows }), (e: unknown) => setLedgerError(e instanceof Error && e.message ? e.message : "The ledger didn't load."));
  };
  useEffect(() => {
    if (person) load(person.employeeId);
  }, [person?.employeeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = ledger && ledger.id === person?.employeeId ? ledger.rows : null;
  const items: TimelineItem[] = (rows ?? []).map((l) => ({
    id: l.id,
    at: isoDate(l.on),
    actor: { name: l.kind === 'adjustment' ? 'HR' : SYSTEM_ACTOR },
    action: `${LEDGER_TEXT[l.kind] ?? l.kind} ${l.days > 0 ? '+' : ''}${l.days} ${l.type}${l.reason ? ` · ${l.reason}` : ''}`,
  }));
  const [view0, setView0] = useState<'card' | 'grid'>(live.view ?? 'card');
  const view = live.onCorrect ? (live.view ?? view0) : 'card';
  const setView = (v: 'card' | 'grid') => (live.onView ? live.onView(v) : setView0(v));
  const viewSwitch = live.onCorrect ? <Segment label="View" value={view} onChange={setView} options={[{ value: 'card', label: 'One person' }, { value: 'grid', label: 'Balance grid' }]} /> : null;
  if (view === 'grid')
    return (
      <TimePage active="Team leave">
        <PageHeader title="Leave balances · everyone" description="Press a balance to correct it, with a reason" actions={viewSwitch} />
        <LiveStates state={live.state} onRetry={live.onRetry} what="Leave balances">
          {d && <BalanceGrid types={d.types} people={d.people} onCorrect={live.onCorrect!} />}
        </LiveStates>
      </TimePage>
    );
  return (
    <TimePage active="Team leave">
      <PageHeader
        title={person ? `Leave card · ${person.name}` : 'Leave card'}
        description={person ? `${person.code ?? 'No employee code'} · every balance is the sum of its ledger` : undefined}
        actions={<div className="yx-tim-row">{viewSwitch}{live.state === 'ready' && person?.canAdjust && <Button variant="primary" onClick={() => setAdj(true)}>Adjust balance</Button>}</div>}
      />
      <LiveStates state={live.state} onRetry={live.onRetry} what="Leave balances">
        {d && (!person ? (
          <EmptyState title="No one to show" description="People in your HR scope appear here." />
        ) : (
          <div className="yx-tim-stack">
            <FormField label="Employee">
              <PersonPicker aria-label="Employee" value={person.employeeId} onChange={(v) => v && setPick(v)} people={d.people.map((p) => ({ id: p.employeeId, name: p.name, department: p.code ?? undefined }))} />
            </FormField>
            <BalanceCards live={{ balances: person.balances }} />
            <div className="yx-tim-grid">
              <div data-span={person.canAdjust && live.onApproved ? '7' : '12'}>
                <Card title="History · every change to the balance">
                  {ledgerError ? (
                    <ErrorState title="The ledger didn't load" description={ledgerError} onRetry={() => load(person.employeeId)} />
                  ) : !rows ? <LoadingBlock rows={4} /> : items.length === 0 ? <p className="yx-tim-muted">No ledger lines yet.</p> : <Timeline aria-label="Leave history" items={items} />}
                  <p className="yx-tim-note">Each balance is the sum of its entries. An adjustment adds a line with your reason; it can't be edited, only reversed by another.</p>
                </Card>
              </div>
              {person.canAdjust && live.onApproved && live.onHrCancelDays && (
                <div data-span="5">
                  <HrApprovedLeave key={person.employeeId} employeeId={person.employeeId} today={new Date().toISOString().slice(0, 10)} onLoad={live.onApproved} onCancelDays={live.onHrCancelDays} onDone={() => load(person.employeeId)} />
                </div>
              )}
            </div>
          </div>
        ))}
      </LiveStates>
      {adj && person && (
        <AdjustBalanceDialog
          open
          onOpenChange={(o) => !o && setAdj(false)}
          person={person.employeeId}
          people={[]}
          balancesOf={() => person.balances.filter((b) => b.hasBalance).map((b) => ({ code: b.leaveTypeId, name: b.name, balance: b.balance, pending: b.pending, paid: true }))}
          onPost={async (e) => {
            await live.onAdjust(person.employeeId, { leaveTypeId: e.code, days: e.delta, reason: e.reason });
            load(person.employeeId);
          }}
        />
      )}
    </TimePage>
  );
}

/* shared request list for leave reports */
export const LEAVE_COLS: TableColumn<LeaveRequestRow>[] = [
  { key: 'person', header: 'Employee', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person }) },
  { key: 'type', header: 'Type', value: (r) => r.type },
  { key: 'from', header: 'From', type: 'date', value: (r) => r.from },
  { key: 'to', header: 'To', type: 'date', value: (r) => r.to, optional: true },
  { key: 'days', header: 'Days', type: 'number', value: (r) => r.days, total: 'sum' },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Approved' ? 'success' : v === 'Pending' ? 'warning' : 'neutral') },
];

/* =====================================================================
   Live, leave v2 (29 Oct 2026): HR leave home, my leave card, comp-off claim, encashment, long absence.
   ===================================================================== */

const ABSENCE_TITLE: Record<LongAbsenceRow['kind'], string> = { maternity: 'Maternity leave', sabbatical: 'Sabbatical', lwp: 'Long leave without pay' };
const hm = (mins: number) => `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}`;
const daysBetweenIso = (a: string, b: string) => Math.round((isoDate(b).getTime() - isoDate(a).getTime()) / 86_400_000);

/* =====================================================================
   Founder decision 1 (29 Oct 2026) · Record long absence (TIM-17 HR): a sabbatical or long leave without pay for
   someone in HR's scope. The effect (pay, leave credits, the day back) and anything in the way (leave already asked
   for, another absence, notice, a joining day, a locked month) show before Record; nothing is cancelled silently.
   ===================================================================== */

export interface RecordAbsenceProps {
  onFindPeople: (q: string) => Promise<LivePersonOption[]>;
  onCheck: (q: { employeeId: string; from: string; to: string }) => Promise<LongAbsenceCheck>;
  onRecord: (input: LongAbsenceInput) => Promise<unknown>;
}
const ABSENCE_KINDS = [
  { value: 'sabbatical' as const, label: 'Sabbatical' },
  { value: 'lwp' as const, label: 'Long leave without pay' },
];

function RecordAbsenceDialog({ open, onOpenChange, onFindPeople, onCheck, onRecord, initial, names }: RecordAbsenceProps & {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Stories: the dialog filled in. */
  initial?: { employeeId: string; kind: LongAbsenceInput['kind']; from: Date; to: Date; note: string };
  names?: Record<string, string>;
}) {
  const [person, setPerson] = useState<string | null>(initial?.employeeId ?? null);
  const [kind, setKind] = useState<LongAbsenceInput['kind']>(initial?.kind ?? 'sabbatical');
  const [from, setFrom] = useState<Date | null>(initial?.from ?? null);
  const [to, setTo] = useState<Date | null>(initial?.to ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [check, setCheck] = useState<LongAbsenceCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const ready = Boolean(person && from && to && to >= from);
  useEffect(() => {
    setCheck(null);
    setCheckError(null);
    if (!ready) return;
    let live = true;
    onCheck({ employeeId: person!, from: isoOf(from!), to: isoOf(to!) }).then(
      (c) => live && setCheck(c),
      (e: unknown) => live && setCheckError(e instanceof Error ? e.message : 'The dates could not be checked. Try again.'),
    );
    return () => {
      live = false;
    };
  }, [person, from?.getTime(), to?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const early = useTooEarly([
    ...(person ? [] : [{ fieldId: 'la-person', message: 'Choose the person.' }]),
    ...(from ? [] : [{ fieldId: 'la-from', message: 'Choose the first day away.' }]),
    ...(!to ? [{ fieldId: 'la-to', message: 'Choose the last day away.' }] : from && to < from ? [{ fieldId: 'la-to', message: 'The last day is on or after the first day.' }] : []),
    ...(note.trim().length >= 10 ? [] : [{ fieldId: 'la-note', message: 'Write the reason in at least 10 characters.' }]),
  ]);
  const days = from && to && to >= from ? daysUntil(to, from) + 1 : null;
  const reset = () => {
    setPerson(null);
    setFrom(null);
    setTo(null);
    setNote('');
    setKind('sabbatical');
    early.reset();
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      size="md"
      title="Record long absence"
      consequence="For a sabbatical or long leave without pay. Maternity leave starts from the person's own leave request."
      confirmLabel="Record absence"
      onConfirm={async () => {
        if (early.stop()) return false;
        // The problems are on screen already; Record says so again instead of sending.
        if (!check || check.problems.length) {
          document.getElementById('la-effect')?.focus();
          return false;
        }
        await onRecord({ employeeId: person!, kind, from: isoOf(from!), to: isoOf(to!), note: note.trim() });
        reset();
      }}
    >
      <div className="yx-tim-form">
        <FormField id="la-person" label="Person" required error={early.errorOf('la-person')}>
          <LivePicker kind="people" label="Person" value={person} onChange={setPerson} onPick={(_k, q) => onFindPeople(q)} names={names} />
        </FormField>
        <FormField label="Type"><Segment label="Type" value={kind} onChange={setKind} options={ABSENCE_KINDS} /></FormField>
        <FieldRow>
          <FormField id="la-from" label="First day away" required error={early.errorOf('la-from')}><DatePicker value={from} onChange={setFrom} /></FormField>
          <FormField id="la-to" label="Last day away" required error={early.errorOf('la-to')}><DatePicker value={to} onChange={setTo} min={from ?? undefined} /></FormField>
        </FieldRow>
        <FormField id="la-note" label="Reason" required helper="HR and the person's manager see this." error={early.errorOf('la-note')}><TextArea rows={2} value={note} onChange={setNote} maxLength={500} /></FormField>
        <section id="la-effect" tabIndex={-1} className="yx-tim-effect" aria-live="polite" aria-label="What this does">
          <strong>What this does</strong>
          {!ready ? (
            <p className="yx-tim-muted">Choose the person and the dates to see the effect on pay and leave.</p>
          ) : checkError ? (
            <InlineAlert tone="danger" title="Not checked">{checkError}</InlineAlert>
          ) : !check ? (
            <p className="yx-tim-muted">Checking the dates…</p>
          ) : (
            <>
              <dl className="yx-tim-stack">
                <div className="yx-tim-effect__row"><dt>Days away</dt><dd>{daysWord(days!)}</dd></div>
                <div className="yx-tim-effect__row"><dt>Pay</dt><dd>Not paid: the days go to payroll as unpaid days</dd></div>
                <div className="yx-tim-effect__row"><dt>Leave credits</dt><dd>{check.accrues ? 'Keeps earning leave (company setting)' : 'No leave earned for these days (company setting)'}</dd></div>
                <div className="yx-tim-effect__row"><dt>Back at work</dt><dd>{fd(check.comesBackOn)}</dd></div>
              </dl>
              {check.problems.length > 0 && (
                <InlineAlert tone="danger" title="This can't be recorded yet">
                  <ul className="yx-tim-stack">{check.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                </InlineAlert>
              )}
            </>
          )}
        </section>
      </div>
    </ConfirmDialog>
  );
}

/** Stories: the people and checks the dialog shows (Arun's earned leave 19–23 Oct is in the way of an October start). */
const SAMPLE_ABSENCE_PEOPLE = TEAM.map((t) => ({ id: t.id, label: t.name, detail: `${t.role} · ${t.location}` }));
const sampleRecordAbsence: RecordAbsenceProps = {
  onFindPeople: async (q) => SAMPLE_ABSENCE_PEOPLE.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())).slice(0, 8),
  onCheck: async ({ employeeId, from, to }) => {
    const name = TEAM.find((t) => t.id === employeeId)?.name ?? 'This person';
    const f = isoDate(from);
    const t = isoDate(to);
    const leave = LEAVE_REQUESTS.filter((r) => r.person === name && r.status !== 'Rejected' && r.from <= t && r.to >= f);
    const lwd = ON_NOTICE[name]?.lastDay;
    return {
      name,
      accrues: false,
      comesBackOn: isoAdd(to, 1),
      leave: leave.map((r) => ({ id: r.id, type: r.type, from: isoOf(r.from), to: isoOf(r.to), status: r.status === 'Pending' ? 'pending' : 'approved' })),
      problems: [
        ...(lwd && t > lwd ? [`${name} is on notice. The last working day is ${formatDate(lwd)}, so end the absence on or before it.`] : []),
        ...(leave.length ? [`${name} already has leave on these dates: ${leave.map((r) => `${r.type} ${formatDate(r.from)} – ${formatDate(r.to)} (${r.status === 'Pending' ? 'waiting' : 'approved'})`).join('; ')}. Withdraw or cancel it first, then record the absence.`] : []),
      ],
    };
  },
  onRecord: async () => undefined,
};

/** TIM-17 HR in the app: requests waiting with their approvers, who is away this week, what needs HR. */
/** "Also off: Ravi Kumar (Casual leave), …" from the server's team availability. */
const offLine = (others: { name: string; type: string }[], label = 'Also off') => othersLine(others.map((o) => ({ text: `${o.name} (${o.type})` })), label);

/** TIM-17 Manager, live: my team's leave waiting for me (approve here or open it), other approvals, who is away. */
function LiveMgrLeaveHomeScreen({ live }: { live: LiveMgrLeaveHome }) {
  const d = live.data;
  const { toast } = useToast();
  const [gone, setGone] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(live.openId ?? null);
  // "Send back" on a row opens the request with the send-back step open (TIM-17 Manager).
  const [openAction, setOpenAction] = useState<'sendback' | undefined>(undefined);
  const { busy, error, run } = useRun();
  const waiting = (d?.waiting ?? []).filter((r) => !gone.includes(r.id));
  const done = (id: string, msg: string) => {
    setGone((g) => [...g, id]);
    toast({ title: msg, tone: 'success' });
  };
  const approve = (r: TeamLeaveHome['waiting'][number]) =>
    void run(`a${r.id}`, async () => {
      await live.onDecide(r.taskId, 'approve');
      done(r.id, `Approved · ${r.name}, ${isoSpan(r.from, r.to)}`);
    });
  return (
    <TimePage active="Team leave">
      <PageHeader title="Team leave" description={d ? 'Leave from your team waiting for you, and who is away this week' : undefined} />
      <LiveStates state={live.state} onRetry={live.onRetry} what="your team's leave">
        {d && (
          <div className="yx-tim-grid">
            <div data-span="7">
              <Card title={`Leave waiting for you (${waiting.length})`} actions={<Button size="sm" onClick={() => live.onNavigate(live.hrefs.approvals)}>All requests</Button>}>
                {d.otherWaiting > 0 && <p className="yx-tim-note">Also in Requests: {plural(d.otherWaiting, 'attendance or overtime request')}</p>}
                {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
                {waiting.length === 0 ? <EmptyState compact title="Nothing waiting for you" description="New requests from your team show here." /> : (
                  <ul className="yx-tim-list" aria-label="Leave waiting for you">
                    {waiting.map((r) => (
                      <li key={r.id}>
                        <span className="yx-tim-list__main" style={MAIN}>
                          <PersonLabel name={r.name} secondary={`${r.type} · ${isoSpan(r.from, r.to)}`} />
                          <span className="yx-tim-muted">{offLine(r.others)}{r.certificate !== 'none' ? ` · certificate ${r.certificate === 'verified' ? 'verified by HR' : 'to give HR'}` : ''}</span>
                        </span>
                        <span className="yx-tim-row">
                          <Button size="sm" onClick={() => setOpenId(r.id)}>View</Button>
                          {r.canSendBack !== false && <Button size="sm" onClick={() => { setOpenAction('sendback'); setOpenId(r.id); }}>Send back</Button>}
                          <Button variant="approve" size="sm" loading={busy === `a${r.id}`} onClick={() => approve(r)}>Approve</Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            <div data-span="5" className="yx-tim-stack">
              <Card title="Away this week" actions={<Button size="sm" onClick={() => live.onNavigate(live.hrefs.calendar)}>Open leave calendar</Button>}>
                {d.away.length === 0 ? <p className="yx-tim-muted">No one in your team is away this week.</p> : (
                  <ul className="yx-tim-list">
                    {d.away.map((a) => <li key={`${a.employeeId}-${a.from}`}><PersonLabel name={a.name} secondary={`${a.type} · ${isoSpan(a.from, a.to)}`} /></li>)}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </LiveStates>
      {openId && <LiveMgrRequestView key={`${openId}-${openAction ?? ''}`} id={openId} action={openAction} live={live} onClose={() => { setOpenId(null); setOpenAction(undefined); }} onDone={done} />}
    </TimePage>
  );
}

/** TIM-19 Manager, live: someone's request with team availability and the balance after it; Approve or Reject when it is my task. */
function LiveMgrRequestView({ id, action, live, onClose, onDone }: { id: string; /** 'sendback': opens with Send back for changes. */ action?: 'sendback'; live: LiveMgrLeaveHome; onClose: () => void; onDone: (id: string, msg: string) => void }) {
  const [r, setR] = useState<LeaveRequestDetailView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dlg, setDlg] = useState<'approve' | 'reject' | 'sendback' | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => {
    let on = true;
    live.onOpen(id).then(
      (x) => {
        if (!on) return;
        setR(x);
        if (action === 'sendback' && x.team?.taskId && x.status === 'pending' && x.team.canSendBack !== false) setDlg('sendback');
      },
      (e: unknown) => on && setLoadError(e instanceof Error ? e.message : 'This request did not load.'),
    );
    return () => {
      on = false;
    };
  }, [id, live]);
  const who = r?.person?.name ?? 'Leave';
  const others = r?.team?.others ?? [];
  const taskId = r?.team?.taskId ?? null;
  const dates = r ? `${isoSpan(r.from, r.to)}${halvesText(r)}` : '';
  const footer = !r ? <Button onClick={onClose}>Close</Button>
    : taskId && r.status === 'pending' ? <DrawerFoot main={<Button variant="approve" onClick={() => setDlg('approve')}>Approve</Button>} rest={<>{r.team?.canSendBack !== false && <Button onClick={() => { setTried(false); setNote(''); setDlg('sendback'); }}>Send back</Button>}<Button variant="danger" onClick={() => { setTried(false); setNote(''); setDlg('reject'); }}>Reject</Button><Button onClick={onClose}>Close</Button></>} />
      : r.status === 'pending' ? <DrawerFoot hint="Waiting for another approver: only they can decide it" rest={<Button onClick={onClose}>Close</Button>} />
        : <DrawerFoot hint={`${LEAVE_STATUS[r.status].label}${r.decidedAt ? ` on ${formatDate(new Date(r.decidedAt))}` : ''}`} rest={<Button onClick={onClose}>Close</Button>} />;
  return (
    <>
      <Drawer open={!dlg} onOpenChange={(o) => !o && onClose()} title={r ? `${r.type?.name ?? 'Leave'} · ${who}` : 'Leave request'} subtitle={r ? isoSpan(r.from, r.to) : undefined} footer={footer}>
        {loadError ? <InlineAlert tone="danger" title="Not loaded">{loadError}</InlineAlert> : !r ? <LoadingBlock rows={4} /> : (
          <div className="yx-tim-stack">
            <div className="yx-tim-row"><LeaveStatusBadge status={r.status} /></div>
            <Kpis
              items={[
                { label: 'Type', value: r.type?.name ?? 'Leave' },
                { label: 'Dates', value: dates },
                { label: 'Days', value: r.days },
                { label: r.status === 'pending' ? `${first(who)}'s balance after` : `${r.type?.name ?? 'Leave'} balance now`, value: r.team?.balanceAfter ?? 'Not counted' },
              ]}
            />
            <p><strong>Reason:</strong> {r.reason ?? (r.type?.medical ? 'Medical: only HR sees the reason' : 'None given')}</p>
            {r.certificate !== 'none' && <div className="yx-tim-row"><Badge tone={r.certificate === 'verified' ? 'success' : 'neutral'}>{r.certificate === 'verified' ? 'Certificate verified by HR' : 'Certificate to give HR'}</Badge></div>}
            <InlineAlert tone="info" title={othersTitle(others.length)}>{others.length > 0 ? others.map((o) => `${o.name} (${o.type})`).join(', ') : undefined}</InlineAlert>
          </div>
        )}
      </Drawer>
      {r && taskId && (
        <>
          <ConfirmDialog
            open={dlg === 'approve'}
            onOpenChange={(o) => !o && setDlg(null)}
            title={`Approve ${who}'s ${(r.type?.name ?? 'leave').toLowerCase()}?`}
            consequence={`${plural(r.days, 'day')}, ${dates}. ${offLine(others)}.`}
            confirmLabel="Approve"
            confirmVariant="approve"
            onConfirm={async () => {
              await live.onDecide(taskId, 'approve');
              onDone(r.id, `Approved · ${who}, ${isoSpan(r.from, r.to)}`);
              onClose();
            }}
          />
          <ConfirmDialog
            open={dlg === 'reject'}
            onOpenChange={(o) => !o && setDlg(null)}
            title={`Reject ${who}'s ${(r.type?.name ?? 'leave').toLowerCase()}?`}
            consequence={`The ${plural(r.days, 'pending day')} ${r.days === 1 ? 'goes' : 'go'} back to ${first(who)}'s balance. ${first(who)} sees your reason.`}
            confirmLabel="Reject"
            destructive
            onConfirm={async () => {
              setTried(true);
              if (!note.trim()) {
                document.getElementById('lv-mgr-reason')?.focus();
                return false;
              }
              await live.onDecide(taskId, 'reject', note.trim());
              onDone(r.id, `Rejected · ${who}, ${isoSpan(r.from, r.to)}`);
              onClose();
            }}
          >
            <FormField id="lv-mgr-reason" label="Reason" required error={tried && !note.trim() ? 'Enter a reason.' : null}>
              <TextArea rows={2} value={note} onChange={setNote} maxLength={1000} placeholder="For example: audit week, the team is short" />
            </FormField>
          </ConfirmDialog>
          <ConfirmDialog
            open={dlg === 'sendback'}
            onOpenChange={(o) => !o && setDlg(null)}
            title={`Send back to ${first(who)}?`}
            consequence={`${first(who)} gets your note and can change the request and send it again.`}
            confirmLabel="Send back"
            onConfirm={async () => {
              setTried(true);
              if (!note.trim()) {
                document.getElementById('lv-mgr-change')?.focus();
                return false;
              }
              await live.onDecide(taskId, 'send_back', note.trim());
              onDone(r.id, `Sent back to ${who}`);
              onClose();
            }}
          >
            <FormField id="lv-mgr-change" label="What to change" required error={tried && !note.trim() ? 'Enter what to change.' : null}>
              <TextArea rows={2} value={note} onChange={setNote} maxLength={1000} placeholder={r.certificate !== 'none' ? 'For example: attach the certificate' : 'For example: move it by a week'} />
            </FormField>
          </ConfirmDialog>
        </>
      )}
    </>
  );
}

function LiveHrLeaveHomeScreen({ live }: { live: LiveHrLeaveHome }) {
  const d = live.data;
  const [reminded, setReminded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [absence, setAbsence] = useState<LongAbsenceRow | null>(null);
  const [recording, setRecording] = useState(false);
  const [applying, setApplying] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const today = d ? isoDate(d.today) : TODAY0;
  const absences = live.absences?.data ?? [];
  const remind = (id: string) => {
    setError(null);
    live.onRemind(id).then(() => setReminded((x) => [...x, id]), (e: unknown) => setError(e instanceof Error ? e.message : 'The reminder was not sent.'));
  };
  return (
    <TimePage active="Team leave">
      <PageHeader title="Leave" description={d ? `Leave year ends ${fd(d.yearEnd.nextOn)}` : undefined} actions={(live.record || live.adjust || live.applyFor) && <div className="yx-tim-row">{live.record && <Button onClick={() => setRecording(true)}>Record long absence</Button>}{live.adjust && <Button onClick={() => setAdjusting(true)}>Adjust balance</Button>}{live.applyFor && <Button variant="primary" icon={CalendarPlus} onClick={() => setApplying(true)}>Apply for someone</Button>}</div>} />
      <LiveStates state={live.state} onRetry={live.onRetry} what="Leave">
        {d && (
          <div className="yx-tim-grid">
            <div data-span="7">
              <Card title={`Pending leave with managers (${d.pending.total})`} actions={<Button size="sm" onClick={() => live.onNavigate(live.hrefs.approvals)}>Open requests</Button>}>
                {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
                {d.pending.rows.length === 0 ? <EmptyState compact title="Nothing waiting" description="Leave requests waiting for a manager show here." /> : (
                  <ul className="yx-tim-list">
                    {d.pending.rows.map((r) => {
                      const age = Math.max(0, Math.round((today.getTime() - day0(new Date(r.sent)).getTime()) / 86_400_000));
                      return (
                        <li key={r.id}>
                          <span className="yx-tim-list__main" style={MAIN}>
                            <PersonLabel name={r.name} secondary={`${r.type} · ${isoSpan(r.from, r.to)}`} />
                            <span className="yx-tim-muted">Waiting for {r.approvers ?? 'an approver'} · sent {age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`}</span>
                          </span>
                          {age > 2 && (reminded.includes(r.id) ? <span className="yx-tim-muted">Reminded</span> : <Button size="sm" onClick={() => remind(r.id)}>Remind approver</Button>)}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
            <div data-span="5" className="yx-tim-stack">
              <Card title="Away this week" actions={<Button size="sm" onClick={() => live.onNavigate(live.hrefs.calendar)}>Open leave calendar</Button>}>
                {d.away.length === 0 ? <p className="yx-tim-muted">No one is away this week.</p> : (
                  <ul className="yx-tim-list">
                    {d.away.map((a) => <li key={`${a.employeeId}-${a.from}`}><PersonLabel name={a.name} secondary={`${a.type} · ${isoSpan(a.from, a.to)}${a.pending ? ' · pending' : ''}`} /></li>)}
                  </ul>
                )}
              </Card>
              <Card title="Needs HR">
                <ul className="yx-tim-list">
                  <li>
                    <span className="yx-tim-list__main" style={MAIN}><span>Negative balances</span><span className="yx-tim-muted">{d.negative === 0 ? 'No one is below zero' : plural(d.negative, 'person', 'people')}</span></span>
                    {d.negative > 0 && <Button size="sm" onClick={() => live.onNavigate(live.hrefs.negative)}>Review balances</Button>}
                  </li>
                  {d.certificates && (
                    <li>
                      <span className="yx-tim-list__main" style={MAIN}><span>Certificates to verify</span><span className="yx-tim-muted">{d.certificates.length === 0 ? 'None' : d.certificates.map((c) => `${c.name} · ${c.type} ${isoSpan(c.from, c.to)}`).join(', ')}</span></span>
                      {d.certificates.length > 0 && <Button size="sm" onClick={() => live.onNavigate(live.hrefs.request(d.certificates![0]!.id))}>Verify certificate</Button>}
                    </li>
                  )}
                  {absences.map((a) => (
                    <li key={a.id}>
                      <span className="yx-tim-list__main" style={MAIN}><span>{a.name} · {ABSENCE_TITLE[a.kind]}</span><span className="yx-tim-muted">{isoSpan(a.from, a.to)}{a.returnAskedOn ? ` · asks to return ${fd(a.returnAskedOn)}` : ''}</span></span>
                      <Button size="sm" onClick={() => setAbsence(a)}>Open status</Button>
                    </li>
                  ))}
                  <li>
                    <span>Year-end {fd(d.yearEnd.on)}</span>
                    {d.yearEnd.posted ? <Badge tone="success">Posted</Badge> : <Button size="sm" onClick={() => live.onNavigate(live.hrefs.yearEnd)}>Open year-end</Button>}
                  </li>
                </ul>
              </Card>
            </div>
          </div>
        )}
      </LiveStates>
      {absence && d && live.absences && <LongAbsenceCard live={{ absence, persona: 'hr', today: d.today, onClose: () => setAbsence(null), onChange: (how, on, note, version) => live.absences!.onChange(absence.id, how, on, note, version) }} />}
      {live.record && <RecordAbsenceDialog open={recording} onOpenChange={setRecording} {...live.record} />}
      {live.adjust && adjusting && <AdjustBalanceDialog open onOpenChange={setAdjusting} live={live.adjust} />}
      {live.applyFor && <ApplyLeavePanel key={String(applying)} open={applying} onOpenChange={setApplying} liveFor={live.applyFor} />}
    </TimePage>
  );
}

/** TIM-21 employee in the app: my balances, every ledger line, and what a balance will be on a date. */
function LiveMyLeaveCardScreen({ live }: { live: LiveMyLeaveCard }) {
  const d = live.data;
  const withBalance = d ? d.balances.filter((b) => b.hasBalance) : [];
  const [typeId, setTypeId] = useState<string | null>(null);
  const [on, setOn] = useState<Date | null>(null);
  const type = withBalance.find((b) => b.leaveTypeId === typeId) ?? withBalance[0];
  const items: TimelineItem[] = (d?.ledger ?? []).map((l) => ({ id: l.id, at: isoDate(l.on), actor: { name: l.kind === 'adjustment' ? 'HR' : SYSTEM_ACTOR }, action: `${LEDGER_TEXT[l.kind] ?? l.kind} ${l.days > 0 ? '+' : ''}${l.days} ${l.type}${l.reason ? ` · ${l.reason}` : ''}` }));
  // Today's balance less the pending requests that start by the date; credits after today are not counted.
  const proj = d && type && on ? (() => {
    const by = isoOf(on);
    const pend = d.pending.filter((p) => p.leaveTypeId === type.leaveTypeId && p.from <= by);
    const days = pend.reduce((a, p) => a + p.days, 0);
    return { value: Math.round((type.balance - days) * 100) / 100, note: pend.length ? `If ${pend.map((p) => isoSpan(p.from, p.to)).join(', ')} ${pend.length > 1 ? 'are' : 'is'} approved · ${daysWord(type.balance)} if not` : 'Nothing pending · credits after today are not counted' };
  })() : null;
  return (
    <TimePage active="My leave">
      <PageHeader title="My leave card" description={d ? `Leave year ${fd(d.year.start)} – ${fd(d.year.end)}` : undefined} actions={live.state === 'ready' ? <Button variant="primary" icon={CalendarPlus} onClick={live.onApply}>Apply leave</Button> : undefined} />
      <LiveStates state={live.state} onRetry={live.onRetry} what="Your leave card">
        {d && (
          <div className="yx-tim-stack">
            <BalanceCards live={{ balances: d.balances }} />
            <div className="yx-tim-grid">
              <div data-span="7">
                <Card title="History · every change to your balance">
                  {items.length === 0 ? <p className="yx-tim-muted">No ledger lines yet.</p> : <Timeline aria-label="Leave history" items={items} />}
                  <p className="yx-tim-note">Each balance is the sum of its entries. Pending requests are held from what is available until decided.</p>
                </Card>
              </div>
              <div data-span="5">
                <Card title="What will my balance be?">
                  {withBalance.length === 0 ? <p className="yx-tim-muted">No leave with a balance yet.</p> : (
                    <div className="yx-tim-form">
                      <FormField label="Leave type"><Select value={type?.leaveTypeId ?? null} onChange={setTypeId} options={withBalance.map((b) => ({ value: b.leaveTypeId, label: b.name }))} /></FormField>
                      <FormField label="On date" helper={`Leave year ends ${fd(d.year.end)}`}><DatePicker value={on} onChange={setOn} min={isoDate(d.today)} max={isoDate(d.year.end)} /></FormField>
                      {proj && on && type && <Kpis items={[{ label: `${type.name} on ${formatDate(on)}`, value: daysWord(proj.value), note: proj.note }]} />}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}
      </LiveStates>
    </TimePage>
  );
}

/** TIM-22 in the app: pick a worked weekly off or holiday, half or full day, with a reason. */
function LiveCompOffClaim({ data, onClaim, onClose }: LiveCompOff & { onClose: () => void }) {
  const days = data?.eligible ?? [];
  const [on, setOn] = useState<string | null>(days[0]?.on ?? null);
  const pick = days.find((x) => x.on === on);
  const [amount, setAmount] = useState<'half' | 'full'>(days[0]?.maxDays === 1 ? 'full' : 'half');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useRun();
  const n = amount === 'full' ? 1 : 0.5;
  const useBy = pick && typeof data?.expiryDays === 'number' ? isoAdd(pick.on, data.expiryDays) : null;
  const tooMuch = Boolean(pick && n > pick.maxDays);
  const send = () => {
    setTried(true);
    if (!pick) return void document.getElementById('co-day')?.focus();
    if (tooMuch) return void document.getElementById('co-amount')?.focus();
    if (!reason.trim()) return void document.getElementById('co-reason')?.focus();
    void run('claim', async () => {
      await onClaim({ on: pick.on, days: n, reason: reason.trim() });
      onClose();
    });
  };
  const body = days.length === 0 ? (
    <EmptyState title="No eligible days to claim" description={`You can claim comp-off for work on a holiday or weekly off in the last ${data?.within ?? 30} days. Days already credited or claimed are not listed. If you worked one and it is not here, check your punches for that day.`} />
  ) : (
    <div className="yx-tim-form">
      {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
      <FormField id="co-day" label="Day you worked" required error={tried && !pick ? 'Choose the day you worked.' : null} helper="Holidays and weekly offs with punches">
        <RadioGroup aria-label="Day you worked" value={on ?? undefined} onChange={(v: string) => { setOn(v); const x = days.find((y) => y.on === v); if (x && x.maxDays < 1) setAmount('half'); }} options={days.map((x) => ({ value: x.on, label: `${fd(x.on)} · ${x.holiday ?? 'Weekly off'}`, description: `Worked ${hm(x.workedMinutes)}` }))} />
      </FormField>
      <FormField id="co-amount" label="Claim" error={tried && tooMuch && pick ? `You worked ${hm(pick.workedMinutes)}: claim a half day.` : null}>
        <Segment label="Claim" value={amount} onChange={setAmount} options={[{ value: 'half' as const, label: 'Half day' }, { value: 'full' as const, label: 'Full day' }]} />
      </FormField>
      <FormField id="co-reason" label="Reason" required error={tried && !reason.trim() ? 'Enter a reason.' : null}><TextArea rows={2} value={reason} onChange={setReason} maxLength={500} /></FormField>
      {pick && data && (
        <section className="yx-tim-effect">
          <strong>What you will get</strong>
          <p className="yx-tim-muted">+{n === 1 ? '1 day' : 'half a day'} comp-off after your manager approves</p>
          {useBy && <div className="yx-tim-row"><span className="yx-tim-muted">Use by {fd(useBy)}</span><DueBadge date={isoDate(useBy)} today={isoDate(data.today)} /></div>}
        </section>
      )}
    </div>
  );
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title="Claim comp-off" dirty={Boolean(reason)} footer={days.length === 0 ? <Button onClick={onClose}>Close</Button> : <DrawerFoot rest={<Button onClick={onClose}>Cancel</Button>} main={<Button variant="primary" loading={busy === 'claim'} onClick={send}>Send claim</Button>} />}>
      {body}
    </Drawer>
  );
}

/** TIM-24 in the app: days to cash in, the amount before tax, the tax note, and payroll. */
function LiveEncashment({ data, onRequest, onWithdraw, onClose }: LiveEncash & { onClose: () => void }) {
  const types = data?.types ?? [];
  const [typeId, setTypeId] = useState<string | null>(types[0]?.leaveTypeId ?? null);
  const t = types.find((x) => x.leaveTypeId === typeId);
  const [days, setDays] = useState<number | null>(t && t.max > 0 ? Math.min(t.max, 1) : null);
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const n = days ?? 0;
  const max = t?.max ?? 0;
  const minLeft = data?.minLeft ?? 0;
  const err = !t ? 'Choose the leave to cash in.' : n <= 0 ? 'Cash in at least half a day.' : Math.round(n * 2) !== n * 2 ? 'Cash in whole or half days.' : n > max ? (max === 0 ? `Nothing can be cashed in now: ${minLeft} days must stay.` : `At most ${daysWord(max)}: ${minLeft} days must stay, ${data?.maxPerYear ?? 0} a year.`) : null;
  const amount = data?.dailyRate ? Math.round(data.dailyRate * n * 100) / 100 : null;
  const send = () => {
    if (err) return void document.getElementById('enc-days')?.focus();
    void run('send', async () => {
      await onRequest({ leaveTypeId: t!.leaveTypeId, days: n });
      onClose();
    });
  };
  const waiting = data?.waiting;
  const body = !data ? <LoadingBlock rows={4} /> : waiting ? (
    <InlineAlert tone="info" title="You already have an encashment request waiting" actions={<Button size="sm" loading={busy === 'withdraw'} onClick={() => void run('withdraw', async () => { await onWithdraw(waiting.id); onClose(); })}>Withdraw request</Button>}>
      {daysWord(waiting.days)}, sent {formatDate(new Date(waiting.createdAt))}. You can send another once it is decided or withdrawn.
    </InlineAlert>
  ) : !data.open ? (
    <InlineAlert tone="info" title="Encashment is closed">{data.window === 'off' ? 'Your company does not cash in leave while you work. Leave left at exit is paid in your final settlement.' : `Leave can be cashed in only in ${MON[Number(data.window) - 1]}.`}</InlineAlert>
  ) : (
    <div className="yx-tim-form">
      {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
      {types.length > 1 ? (
        <FormField label="Leave type"><Select value={typeId} onChange={setTypeId} options={types.map((x) => ({ value: x.leaveTypeId, label: x.name, description: `${daysWord(x.available)} available` }))} /></FormField>
      ) : t && <dl className="yx-tim-effect__row"><dt>Leave type</dt><dd style={{ textAlign: 'end' }}>{t.name} · {t.available} available<br /><span className="yx-tim-note">{t.balance} days, {t.pending} pending</span></dd></dl>}
      <FormField id="enc-days" label="Days to encash" required helper={err ? undefined : `You can encash up to ${daysWord(max)} (${minLeft} must remain; ${data.maxPerYear} a year)`} error={err}>
        <div className="yx-tim-row">
          <IconButton variant="secondary" icon={Minus} label="Fewer days" onClick={() => (n <= 0.5 ? toast({ title: 'Cash in at least half a day', tone: 'warning' }) : setDays(Math.max(0.5, n - 1)))} />
          <NumberField value={days} onChange={setDays} aria-label="Days" min={0.5} />
          <IconButton variant="secondary" icon={Plus} label="More days" onClick={() => (n >= max ? toast({ title: `You can encash at most ${daysWord(max)}`, tone: 'warning' }) : setDays(Math.min(max, n + 1)))} />
        </div>
      </FormField>
      <section className="yx-tim-effect" aria-live="polite">
        <strong>What you will get</strong>
        {err ? <p className="yx-tim-muted">Fix the days above to see the amount.</p> : (
          <dl className="yx-tim-stack">
            {data.dailyRate && data.monthly && amount !== null ? (
              <>
                <div className="yx-tim-effect__row"><dt>Rate</dt><dd style={{ textAlign: 'end' }}>({data.basis === 'gross' ? 'Gross' : 'Basic + DA'} {formatINR(data.monthly)}) ÷ {data.divisor}<br />= {formatINR(data.dailyRate, { decimals: 2 })} a day</dd></div>
                <div className="yx-tim-effect__row"><dt>Amount (before tax)</dt><dd>{n} × {formatINR(data.dailyRate, { decimals: 2 })} = {formatINR(amount)}</dd></div>
              </>
            ) : <div className="yx-tim-effect__row"><dt>Amount</dt><dd>Payroll works it out from your pay on the day it is approved</dd></div>}
            <div className="yx-tim-effect__row"><dt>Balance after</dt><dd>{Math.round(((t?.available ?? 0) - n) * 100) / 100} days available</dd></div>
            <div className="yx-tim-effect__row"><dt>Paid in</dt><dd>The payroll of the month it is approved</dd></div>
          </dl>
        )}
        <p className="yx-tim-note">{data.taxNote}</p>
      </section>
    </div>
  );
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title="Encash leave" footer={waiting || !data?.open ? <Button onClick={onClose}>Close</Button> : <DrawerFoot hint={err ? 'Fix the days to send' : undefined} rest={<Button onClick={onClose}>Cancel</Button>} main={<Button variant="primary" loading={busy === 'send'} onClick={send}>Send request</Button>} />}>
      {body}
    </Drawer>
  );
}

/** TIM-25 in the app: progress, return date, pay and accrual effect; the employee tells HR, HR extends or ends it. */
function LiveLongAbsence({ absence: a, persona, today, onClose, onAskReturn, onChange }: LiveAbsence) {
  const [dlg, setDlg] = useState<'change' | 'extend' | 'early' | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const total = daysBetweenIso(a.from, a.to) + 1;
  const dayN = Math.min(total, Math.max(0, daysBetweenIso(a.from, today) + 1));
  const back = isoAdd(a.to, 1);
  const who = a.name ?? 'This person';
  const pay = a.kind === 'maternity' ? 'Maternity benefit: paid by ESI where the person is covered, otherwise by the company (Maternity Benefit Act).' : `Unpaid for all ${total} days`;
  const close = () => {
    setDlg(null);
    setDate(null);
    setNote('');
    setTried(false);
  };
  const cfg =
    dlg === 'change'
      ? { title: 'Tell HR your return date changed', label: 'New return date', confirm: 'Send to HR', min: addDays(isoDate(today), 1), max: undefined, effect: (x: Date) => `HR gets your new return date, ${formatDate(x)}, and confirms it with you.` }
      : dlg === 'extend'
        ? { title: `Extend ${who}'s ${ABSENCE_TITLE[a.kind].toLowerCase()}`, label: 'New last day', confirm: 'Extend', min: isoDate(isoAdd(a.to, 1)), max: undefined, effect: (x: Date) => `${daysWord(daysBetweenIso(a.to, isoOf(x)))} more; back on ${formatDate(addDays(x, 1))}.` }
        : { title: `Record ${who}'s early return`, label: 'First day back', confirm: 'Record return', min: isoDate(isoAdd(a.from, 1)), max: isoDate(a.to), effect: (x: Date) => `Back on ${formatDate(x)}; the absence ends ${formatDate(addDays(x, -1))}.` };
  return (
    <>
      <Drawer open={!dlg} onOpenChange={(o) => !o && onClose()} title={`${ABSENCE_TITLE[a.kind]}${a.name ? ` · ${a.name}` : ''}`} subtitle="Long-absence status" footer={<Button onClick={onClose}>Close</Button>}>
        <div className="yx-tim-stack">
          <div className="yx-tim-row"><Badge tone="info">{ABSENCE_TITLE[a.kind]}</Badge><span className="yx-tim-muted">{isoSpan(a.from, a.to)}</span></div>
          <Meter label="Absence progress" value={dayN} max={total} valueText={`Day ${dayN} of ${total}`} />
          <ul className="yx-tim-list">
            <li><span>Expected return</span><span className="yx-tim-row"><strong>{fd(back)}</strong><DueBadge date={isoDate(back)} today={isoDate(today)} />{a.returnAskedOn && <Badge tone="neutral">{`Waiting for HR · ${fd(a.returnAskedOn)}`}</Badge>}</span></li>
            <li><span>Pay effect</span><span className="yx-tim-muted">{pay}</span></li>
            <li><span>Leave accrual</span><span className="yx-tim-muted">{a.accrues ? 'Keeps earning leave' : 'No leave earned while away'}</span></li>
            {a.to !== a.plannedTo && <li><span>First planned to</span><span className="yx-tim-muted">{fd(a.plannedTo)}</span></li>}
          </ul>
          {persona === 'hr' && onChange && (
            <div className="yx-tim-row">
              <Button onClick={() => setDlg('extend')}>Extend</Button>
              <Button variant="primary" onClick={() => setDlg('early')}>Record early return</Button>
            </div>
          )}
          {persona === 'emp' && onAskReturn && <Button onClick={() => setDlg('change')}>Tell HR my return date changed</Button>}
        </div>
      </Drawer>
      {dlg && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && close()}
          title={cfg.title}
          consequence={date ? cfg.effect(date) : 'Pick a date to see the effect.'}
          confirmLabel={cfg.confirm}
          onConfirm={async () => {
            setTried(true);
            if (!date || !note.trim()) return false;
            if (dlg === 'change') await onAskReturn!(isoOf(date), note.trim());
            else await onChange!(dlg, isoOf(date), note.trim(), a.version);
            close();
            onClose();
          }}
        >
          <div className="yx-tim-stack">
            <FormField label={cfg.label} required error={tried && !date ? 'Choose the date.' : null}><DatePicker value={date} onChange={setDate} min={cfg.min} max={cfg.max} /></FormField>
            <FormField label="Reason" required error={tried && !note.trim() ? 'Enter a reason.' : null}><TextArea rows={2} value={note} onChange={setNote} maxLength={500} /></FormField>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
