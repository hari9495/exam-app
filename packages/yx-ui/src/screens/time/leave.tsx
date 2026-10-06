// Leave for employees and managers. TIM-17 … TIM-25.
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Download, Minus, Plus } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Segment } from '../people/people-kit';
import { Button, IconButton } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, Meter } from '../../components/feedback';
import { BottomSheet, ConfirmDialog, Dialog } from '../../components/overlay';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { type TableColumn } from '../../components/table';
import { Checkbox, RadioGroup } from '../../components/choice';
import { NumberField, TextArea } from '../../components/inputs';
import { FieldRow, FormField } from '../../components/field';
import { PersonPicker, Select } from '../../components/select';
import { DatePicker, DateRangePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { Calendar, TeamCalendar, type CalendarEvent } from '../../components/calendar';
import { ApprovalTimeline, Timeline, type TimelineItem } from '../../components/timeline';
import { formatDate, formatINR } from '../../lib/format';
import {
  BALANCES,
  CLAIM,
  COMP_OFF_REQUESTS,
  EL_ENCASH_MAX,
  EL_ENCASH_MIN_LEFT,
  HOLIDAYS,
  HR_ADMIN,
  LEAVE_REQUESTS,
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
import { DueBadge, Kpis, TimePage } from './time-kit';
import { countLeaveDays, daysUntil, encashAmount, fmt12, fmtDuration, leaveWarnings, type Half } from './time-logic';
import { LoadingBlock, type ViewState } from './attendance';
import './time.css';

type LeavePersona = 'emp' | 'mgr' | 'hr';
type LeaveCode = 'CL' | 'EL' | 'SL' | 'CO' | 'LWP';
const holidayDates = HOLIDAYS.map((h) => h.date);
const ALT_SAT = [new Date(2026, 9, 10), new Date(2026, 9, 24)]; // 2nd / 4th Saturdays in October

/* ---------- small date helpers (local) ---------- */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const same = (a: Date, b: Date) => day0(a).getTime() === day0(b).getTime();
const TODAY0 = day0(TODAY);
/** "12 Oct" */
const dm = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;
/** "Sat 10 Oct" */
const wdm = (d: Date) => `${WD[d.getDay()]} ${dm(d)}`;
/** "12–13 Oct", "30 Sep – 2 Oct", "12 Oct" */
const span = (a: Date, b: Date) => (same(a, b) ? dm(a) : a.getMonth() === b.getMonth() ? `${a.getDate()}–${dm(b)}` : `${dm(a)} – ${dm(b)}`);
const first = (name: string) => name.split(' ')[0];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Chennai office weekly offs and holidays. */
const isOff = (d: Date) => d.getDay() === 0 || ALT_SAT.some((s) => same(s, d)) || holidayDates.some((h) => same(h, d));

const LEAVE_NAME: Record<string, string> = { CL: 'Casual leave', SL: 'Sick leave', EL: 'Earned leave', CO: 'Comp-off', LWP: 'Leave without pay' };
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
const statusTone = (r: LeaveRequestRow) => (r.status === 'Approved' ? 'success' : r.status === 'Pending' && daysUntil(r.from, TODAY) >= 0 && daysUntil(r.from, TODAY) <= 3 ? 'warning' : 'neutral');

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
  const oneMonth = segs.every((s) => s.start.getMonth() === a.start.getMonth() && s.end.getMonth() === a.start.getMonth());
  const dates = segs.length > 1 && oneMonth ? `${segs.map((s) => span(s.start, s.end).replace(/ \w+$/, '')).join(' & ')} ${MON[a.start.getMonth()]}` : segs.map((s) => span(s.start, s.end)).join(', ');
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
export function BalanceCards({ compact, balances = BALANCES, person = ME.name, onViewPending, onUseCompOff }: { compact?: boolean; balances?: LeaveBalance[]; /** Whose balances: approved leave still ahead shows as "booked", not "used". */ person?: string; onViewPending?: () => void; onUseCompOff?: () => void }) {
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

type ReqAction = 'withdraw' | 'cancel' | 'report' | 'approve' | 'sendback' | 'reject';

export function LeaveRequestView({
  r,
  viewer = 'emp',
  action,
  surface = 'desk',
  open = true,
  onOpenChange,
  onDecided,
}: {
  r: LeaveRequestRow;
  viewer?: 'emp' | 'mgr';
  action?: ReqAction;
  surface?: 'desk' | 'inline';
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  /** Called with a short message once the request is approved, sent back, rejected, withdrawn or cancelled. */
  onDecided?: (message: string, action: ReqAction) => void;
}) {
  const past = day0(r.to) < TODAY0;
  const [dlg, setDlg] = useState<ReqAction | undefined>(action === 'cancel' && past ? 'report' : action);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const close = () => {
    setDlg(undefined);
    setNote('');
  };
  const finish = (msg: string, a: ReqAction) => {
    setDone(msg);
    onDecided?.(msg, a);
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
      {done && <InlineAlert tone="success" title={done} />}
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
      <p><strong>Reason:</strong> {r.reason}</p>
      {r.cert && <div className="yx-tim-row"><Badge tone={r.cert === 'verified' ? 'success' : 'neutral'}>{certText(r.cert)}</Badge></div>}
      {viewer === 'mgr' && <InlineAlert tone="info" title={othersTitle(overlap.length)}>{overlap.length > 0 ? overlap.map((o) => o.text).join(', ') : undefined}</InlineAlert>}
      <ApprovalTimeline
        now={TODAY}
        steps={[
          { id: 'a', label: 'Requested', status: 'done', approver: r.person, at: appliedAt(r) },
          { id: 'b', label: 'Manager approval', status: r.status === 'Approved' ? 'done' : r.status === 'Rejected' ? 'rejected' : 'current', approver: r.approver, at: r.decided },
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
      // Waiting on someone else: the blocked Approve with the reason beside it.
      <DrawerFoot hint={`Waiting for ${r.approver}`} main={<Button variant="approve" disabled>Approve</Button>} />
    ) : (
      // Already decided: only the status and Close.
      <DrawerFoot hint={`${r.status}${r.decided ? ` on ${formatDate(r.decided)}` : ''}`} rest={closeBtn} />
    );
  } else if (r.status === 'Pending') footer = <DrawerFoot main={<Button variant="danger" onClick={() => setDlg('withdraw')}>Withdraw request</Button>} />;
  else if (r.status === 'Approved' && past) footer = <DrawerFoot hint="Leave already taken" main={<Button onClick={() => setDlg('report')}>Report an error</Button>} />;
  else if (r.status === 'Approved') footer = <DrawerFoot main={<Button variant="danger" onClick={() => setDlg('cancel')}>Ask to cancel</Button>} />;

  const noteField = (label: string, placeholder: string) => (
    <FormField label={label} required><TextArea rows={2} value={note} placeholder={placeholder} onChange={setNote} /></FormField>
  );
  const dialogs = (
    <>
      <ConfirmDialog open={dlg === 'withdraw'} onOpenChange={(o) => !o && close()} title="Withdraw this request?" consequence={`It hasn't been approved yet, so it's withdrawn at once and your ${plural(r.days, 'pending day')} ${r.days === 1 ? 'returns' : 'return'} to your balance.`} confirmLabel="Withdraw request" cancelLabel="Keep request" destructive onConfirm={() => { close(); finish('Request withdrawn', 'withdraw'); }} />
      <ConfirmDialog open={dlg === 'cancel'} onOpenChange={(o) => !o && close()} title="Ask to cancel approved leave?" consequence={locked ? `${monthName(r.from)} payroll is locked, so this becomes a late correction: any loss of pay is reversed in the next payroll.` : `${r.approver} needs to approve the cancellation. Once approved, the ${plural(r.days, 'day')} ${r.days === 1 ? 'goes' : 'go'} back to your balance.`} confirmLabel="Send cancellation" cancelLabel="Keep leave" destructive onConfirm={() => { close(); finish(`Cancellation sent to ${r.approver}`, 'cancel'); }} />
      <ConfirmDialog open={dlg === 'report'} onOpenChange={(o) => !o && close()} title="Report an error in this leave?" consequence={`This leave was already taken, so it goes to HR as an attendance correction. ${locked ? `${monthName(r.from)} payroll is locked: the change lands in the next payroll.` : `Fixed before ${monthName(r.from)} locks, the change lands in ${monthName(r.from)} pay; after that, in ${monthName(nextMonth)} pay.`}`} confirmLabel="Send to HR" confirmDisabled={!note.trim()} onConfirm={() => { close(); finish('Sent to HR as an attendance correction', 'report'); }}>
        {!locked && <div className="yx-tim-row"><span className="yx-tim-muted">{monthName(r.from)} locks {dm(lockDay)}</span><DueBadge date={lockDay} /></div>}
        {noteField("What's wrong", 'For example: I worked on 17 Sep, only 16 Sep was leave')}
      </ConfirmDialog>
      <ConfirmDialog open={dlg === 'approve'} onOpenChange={(o) => !o && close()} title={`Approve ${r.person}'s ${r.type.toLowerCase()}?`} consequence={`${plural(r.days, 'day')}, ${dates}. ${othersLine(overlap)}.`} confirmLabel="Approve" confirmVariant="approve" onConfirm={() => { close(); finish(`Approved · ${r.person}, ${dates}`, 'approve'); }} />
      <ConfirmDialog open={dlg === 'sendback'} onOpenChange={(o) => !o && close()} title={`Send back to ${first(r.person)}?`} consequence={`${first(r.person)} gets your note and can change the request and send it again.`} confirmLabel="Send back" confirmDisabled={!note.trim()} onConfirm={() => { close(); finish(`Sent back to ${r.person}`, 'sendback'); }}>
        {noteField('What to change', r.cert ? 'For example: attach the certificate' : 'For example: move it by a week')}
      </ConfirmDialog>
      <ConfirmDialog open={dlg === 'reject'} onOpenChange={(o) => !o && close()} title={`Reject ${r.person}'s ${r.type.toLowerCase()}?`} consequence={`The ${plural(r.days, 'pending day')} ${r.days === 1 ? 'goes' : 'go'} back to ${who} balance. ${first(r.person)} sees your reason.`} confirmLabel="Reject" destructive confirmDisabled={!note.trim()} onConfirm={() => { close(); finish(`Rejected · ${r.person}, ${dates}`, 'reject'); }}>
        {noteField('Reason', 'For example: audit week, the team is short')}
      </ConfirmDialog>
    </>
  );

  if (inline) return <div className="yx-tim-stack">{body}{footer && <div className="yx-tim-sheet-actions">{footer}</div>}{dialogs}</div>;
  return (
    <>
      <Drawer open={open} onOpenChange={(o) => onOpenChange?.(o)} title={`${r.type} · ${r.person}`} subtitle={dates} footer={footer ?? <Button onClick={() => onOpenChange?.(false)}>Close</Button>}>{body}</Drawer>
      {dialogs}
    </>
  );
}

/* =====================================================================
   TIM-18 · Apply leave (range with halves, live effect, delegate, notice warning)
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

export function ApplyLeaveForm({ type: t0 = 'EL', from: f0 = DEFAULT_FROM, to: to0 = DEFAULT_TO, fromHalf: fh0 = 'full', toHalf: th0 = 'full', blocked = false, sandwich = 'sandwich', phone, person = ME.name, own = person === ME.name, onDraft, onOpenRequest }: Omit<ApplyLeaveProps, 'self'> & { phone?: boolean; /** Whose leave (HR or a manager applying for someone). */ person?: string; /** The person is applying for themselves. */ own?: boolean; onDraft?: (d: LeaveDraft) => void; onOpenRequest?: (r: LeaveRequestRow) => void }) {
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
    noticeDays: type === 'EL' ? 7 : 0,
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
    ...blockHits.map((b) => `${wdm(b.date)} is a company block date (${b.reason}). Pick other dates.`),
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
        <FormField label="Reason" required><TextArea rows={2} value={reason} onChange={setReason} /></FormField>
        {type === 'SL' && <div id={certId}><FormField label="Medical certificate" helper="Needed for more than 2 days. Only HR sees the file; your manager sees whether it's attached and verified."><FileUpload upload={async () => {}} accept={['application/pdf', 'image/jpeg', 'image/png']} /></FormField></div>}
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
            <div className="yx-tim-effect__row">
              <dt>{bal.paid ? 'Balance after' : 'Unpaid days this year (with this)'}</dt>
              <dd>{noBal ? 'Not available' : !bal.paid ? bal.taken + total : w.balanceAfter < 0 ? <Badge tone="danger">{`−${-w.balanceAfter} (short by ${-w.balanceAfter})`}</Badge> : w.balanceAfter}</dd>
            </div>
          </dl>
          {pendingDays > 0 && <p className="yx-tim-note">Balance after also takes off {plural(pendingDays, 'day')} already pending for {own ? 'you' : first(person)}.</p>}
          {sw > 0 && <p className="yx-tim-note">Weekends and holidays between leave days count as leave under {own ? 'your' : 'the'} policy.</p>}
          {count && (
            <ul className="yx-tim-days">
              {count.days.map((d) => <li key={d.date.getTime()}><span style={{ whiteSpace: 'nowrap' }}>{wdm(d.date)}</span><span>{dayLabel(d)}</span></li>)}
            </ul>
          )}
          {warnings.map((x) => <InlineAlert key={x} tone="warning">{x}</InlineAlert>)}
          <p className="yx-tim-note">Approver: {approver}{approverAway ? ` (also on leave ${span(approverAway.from, approverAway.to)})` : ''} · {othersLine(overlap, own && isLead ? 'Your reports also off' : 'Also off')}</p>
        </section>
      </div>
    </div>
  );
}

/** Apply leave in a drawer (desk) or bottom sheet (phone): Send is blocked while the form has errors; sent shows what happens next. */
type PickPerson = { id: string; name: string; role: string; department: string };
/** People to apply for, keyed by name: a manager's own reports, or everyone for HR. */
const pickPeople = (hr: boolean): PickPerson[] => (hr ? TEAM : myReports()).map((t) => ({ id: t.name, name: t.name, role: t.role, department: `${t.dept} · ${t.location}` }));

/**
 * Apply leave in a drawer (desk) or bottom sheet (phone): Send is blocked while the form has errors; sent shows what happens next.
 * With `forSomeone` (a manager's reports, or everyone for HR), the first field picks the employee; their balances and approver are used.
 */
export function ApplyLeavePanel({ open, onOpenChange, surface = 'desk', sent: sent0 = false, forSomeone, self = ME.name, ...p }:ApplyLeaveProps & { open: boolean; onOpenChange: (o: boolean) => void; surface?: 'desk' | 'phone'; sent?: boolean; forSomeone?: PickPerson[] }) {
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
  const [picked, setPicked] = useState<string | null>(null);
  const person = forSomeone ? picked : self;
  const approver = (person && managerOf(person)) ?? ME.manager;
  const request: LeaveRequestRow = {
    id: 'new', person: person ?? self, type: LEAVE_NAME[draft.type], from: draft.from ?? TODAY0, to: draft.to ?? TODAY0, days: draft.total,
    status: 'Pending', applied: TODAY, reason: draft.reason, approver,
  };
  const blockedBy = !person ? 'Pick the employee' : draft.errors > 0 ? `Fix ${plural(draft.errors, 'thing')} above` : null;
  const picker = forSomeone && !sent && (
    <FormField label="Employee" required>
      <PersonPicker aria-label="Employee" value={picked} onChange={setPicked} people={forSomeone} />
    </FormField>
  );
  const body = sent ? (
    <InlineAlert
      tone="success"
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
      <Button variant="primary" disabled={!!blockedBy} onClick={() => setSent(true)}>Send request</Button>
    </>
  ) : (
    <DrawerFoot hint={blockedBy} rest={<Button onClick={() => onOpenChange(false)}>Cancel</Button>} main={<Button variant="primary" disabled={!!blockedBy} onClick={() => setSent(true)}>Send request</Button>} />
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

export function ApplyLeaveSheet(p: ApplyLeaveProps & { surface?: 'desk' | 'phone'; sent?: boolean }) {
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

function AdjustBalanceDialog({ open, onOpenChange, person: fixedPerson, onPost }: { open: boolean; onOpenChange: (o: boolean) => void; person?: string; onPost?: (e: { person: string; code: string; delta: number; reason: string }) => void }) {
  const [person, setPerson] = useState(fixedPerson ?? 'Priya Shankar');
  const balances = balancesFor(person).filter((b) => b.paid);
  const [code, setCode] = useState('EL');
  const [dir, setDir] = useState('add');
  const [days, setDays] = useState<number | null>(2);
  const [reason, setReason] = useState('');
  const b = balances.find((x) => x.code === code) ?? balances[0];
  // Same "available" figure as the balance cards: days held for a pending request can't be deducted.
  const free = (x: LeaveBalance) => (x.code === 'CO' ? x.balance : x.balance - x.pending);
  const avail = b ? free(b) : 0;
  const delta = (dir === 'add' ? 1 : -1) * (days ?? 0);
  const overDeduct = dir === 'deduct' && !!b && (days ?? 0) > avail;
  const blockedBy = !days ? 'Enter the days' : overDeduct ? `Only ${plural(avail, 'day')} available to deduct` : !reason.trim() ? 'Add a reason' : null;
  const people = PEOPLE_WITH_BALANCES.map((n) => {
    const t = TEAM.find((p) => p.name === n);
    const other = n === ME.name ? { role: ME.role, dept: ME.department } : ON_NOTICE[n];
    return { id: n, name: n, role: t?.role ?? other?.role ?? '', department: t?.dept ?? other?.dept ?? '' };
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adjust balance"
      description="Adjustments are saved with your reason. They can't be edited later, only reversed."
      footer={
        <>
          {blockedBy && <span className="yx-tim-muted" style={{ alignSelf: 'center' }}>{blockedBy}</span>}
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!!blockedBy} onClick={() => { onPost?.({ person, code: b.code, delta, reason }); onOpenChange(false); setReason(''); }}>Post adjustment</Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        {!fixedPerson && <FormField label="Employee" required><PersonPicker aria-label="Employee" value={person} onChange={(v) => v && setPerson(v)} people={people} /></FormField>}
        <FormField label="Leave type" required><Select value={b?.code ?? code} onChange={(v) => v && setCode(v)} options={balances.map((x) => ({ value: x.code, label: `${x.name} · ${plural(free(x), 'day')} available` }))} /></FormField>
        <FormField label="Direction"><Segment label="Direction" value={dir} onChange={setDir} options={[{ value: 'add', label: 'Add' }, { value: 'deduct', label: 'Deduct' }]} /></FormField>
        <FormField label="Days" required><NumberField value={days} decimals min={0} max={dir === 'deduct' && b ? avail : undefined} onChange={setDays} /></FormField>
        <FormField label="Reason" required><TextArea rows={2} value={reason} onChange={setReason} /></FormField>
        {b && <p className="yx-tim-muted">Available after: {plural(avail + delta, 'day')}{b.code !== 'CO' && b.pending > 0 ? ` · ${plural(b.pending, 'day')} held for a pending request` : ''}</p>}
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

export function LeaveHomeScreen({ persona = 'emp', state = 'ready' }: { persona?: LeavePersona; state?: ViewState }) {
  const user: TimeUser = persona === 'hr' ? HR_ADMIN : ME;
  const [apply, setApply] = useState(false);
  // "Use comp-off" opens Apply leave on Comp-off; the header button on the default type.
  const [applyType, setApplyType] = useState<LeaveCode | undefined>(undefined);
  const startApply = (t?: LeaveCode) => {
    setApplyType(t);
    setApply(true);
  };
  const [adjust, setAdjust] = useState(false);
  const [holidays, setHolidays] = useState(false);
  // No requests yet: no optional holiday taken either.
  const [optional, setOptional] = useState(state === 'empty' ? [] : OPTIONAL_DEFAULT);
  const [open, setOpen] = useState<{ r: LeaveRequestRow; action?: ReqAction; viewer: 'emp' | 'mgr' } | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
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
        actions={<div className="yx-tim-row">{persona === 'hr' && <Button onClick={() => setAdjust(true)}>Adjust balance</Button>}<Button variant="primary" icon={CalendarPlus} onClick={() => startApply()}>{persona === 'emp' ? 'Apply leave' : 'Apply for someone'}</Button></div>}
      />
      {st === 'loading' ? <LoadingBlock rows={8} /> : st === 'error' ? (
        <ErrorState title={persona === 'emp' ? "Your leave didn't load" : "Leave didn't load"} description={persona === 'emp' ? 'Try again. Your requests are safe.' : 'Try again. No requests were changed.'} onRetry={retry} reference="LV-8820" />
      ) : (
        <>
          {msg && <InlineAlert tone="success" title={msg} />}
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
      <ApplyLeavePanel key={`${apply}-${applyType}`} open={apply} onOpenChange={setApply} {...applyTypeProps(applyType)} forSomeone={persona === 'emp' ? undefined : pickPeople(persona === 'hr')} />
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
          <span className="yx-tim-list__main" style={{ flex: '1 1 auto' }}><span>{h.name}</span><span className="yx-tim-muted">{wdm(h.date)}{h.optional ? ' · Optional' : ''}</span></span>
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
  const [msg, setMsg] = useState<string | null>(null);
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
          {msg && <InlineAlert tone="success" title={msg} />}
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

export function LeaveRequestDetail({ id = 'lr1', persona = 'emp', action, surface = 'desk' }: { id?: string; persona?: 'emp' | 'mgr'; action?: ReqAction; surface?: 'desk' | 'phone' }) {
  const base = persona === 'emp' ? LEAVE_REQUESTS.filter((x) => x.person === ME.name) : LEAVE_REQUESTS.filter((x) => x.approver === ME.name);
  const [cur, setCur] = useState<{ r: LeaveRequestRow; action?: ReqAction } | null>({ r: LEAVE_REQUESTS.find((x) => x.id === id)!, action });
  // Decisions made in the drawer update the list behind it: new status, or gone (withdrawn, sent back).
  const [changed, setChanged] = useState<Record<string, ReqAction>>({});
  const [msg, setMsg] = useState<string | null>(null);
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
        <div className="yx-tim-stack">{msg && <InlineAlert tone="success" title={msg} />}{list}</div>
      </PhoneFrame>
    );
  }
  return (
    <TimePage active={persona === 'emp' ? 'My leave' : 'Requests'} counts={navCounts}>
      <PageHeader title={persona === 'emp' ? 'My leave' : 'Leave requests'} />
      {msg && <InlineAlert tone="success" title={msg} />}
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

export function TeamLeaveCalendarScreen({ persona = 'mgr', view = 'team', state = 'ready' }: { persona?: 'mgr' | 'hr'; view?: 'team' | 'month'; state?: ViewState }) {
  const hr = persona === 'hr';
  // HR sees each person's location beside the team (Hosur plant people follow a different calendar).
  const members = (hr ? TEAM : myReports()).map((p) => ({ id: p.id, name: p.name, team: hr ? `${p.dept} · ${p.location}` : p.dept }));
  const ids = members.map((m) => m.id);
  const [review, setReview] = useState<LeaveRequestRow | null>(null);
  const [gone, setGone] = useState<string[]>([]);
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
        actions={empty || loading ? <span className="yx-tim-row"><span className="yx-tim-muted">{loading ? 'Loading…' : 'Nothing to export in this range'}</span><Button icon={Download} disabled>Export</Button></span> : <Button icon={Download} onClick={exportCsv}>Export {exLabel}</Button>}
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
              <TeamCalendar members={members} absences={absences} holidays={HOLIDAYS} start={start} days={days} today={TODAY} team={hr ? undefined : ME.department} memberOff={(id, d) => personOff(memberName(id), d)} />
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
      {review && <LeaveRequestView key={review.id} r={review} viewer="mgr" open onOpenChange={(o) => !o && setReview(null)} onDecided={() => setGone((g) => [...g, review.id])} />}
    </TimePage>
  );
}

/** Phone: a "who's away" list by day instead of a grid that only fits two days. */
export function TeamLeaveCalendarPhone() {
  const [days, setDays] = useState(14);
  const [review, setReview] = useState<LeaveRequestRow | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  if (review)
    return (
      <PhoneFrame tab="time" title="Leave request" back={<Button size="sm" icon={ChevronLeft} onClick={() => setReview(null)}>Back</Button>}>
        <LeaveRequestView r={review} viewer="mgr" surface="inline" onDecided={() => setGone((g) => [...g, review.id])} />
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

export function LeaveCardScreen({ persona = 'emp', adjustOpen = false, surface = 'desk', person: personArg }: {
  persona?: 'emp' | 'hr'; adjustOpen?: boolean; surface?: 'desk' | 'phone';
  /** HR view only: whose card (default the signed-in employee, ME). */
  person?: string;
}) {
  const person = persona === 'hr' && personArg ? personArg : ME.name;
  const isMe = person === ME.name;
  const who = isMe ? ME : TEAM.find((p) => p.name === person);
  const [adj, setAdj] = useState(adjustOpen);
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
          <div data-span="5" style={stacked ? { order: -1 } : undefined}>{projCard}</div>
        </div>
      )}
    </div>
  );
  const extras = (
    <>
      {apply && <ApplyLeavePanel key={apply} type={apply} from={new Date(2026, 9, 5)} to={new Date(2026, 9, 5)} open onOpenChange={(o) => !o && setApply(null)} surface={surface} />}
      {viewReq && !phone && lr1 && <LeaveRequestView r={lr1} viewer={reqViewer} open onOpenChange={setViewReq} />}
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
        actions={persona === 'hr' ? <div className="yx-tim-row"><LinkButton to={STORY.leaveHomeHr}>Back to Team leave</LinkButton><Button variant="primary" onClick={() => setAdj(true)}>Adjust balance</Button></div> : <Button variant="primary" icon={CalendarPlus} onClick={() => setApply('EL')}>Apply leave</Button>}
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

export function CompOffClaim({ surface = 'desk', state = 'ready' }: { surface?: 'desk' | 'phone'; state?: 'ready' | 'none' | 'sent' }) {
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
  const [withdrawnMsg, setWithdrawnMsg] = useState<string | null>(null);
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
      <InlineAlert tone="success" title={`Sent to ${ME.manager}`}>
        {amountText} comp-off for {wdm(CLAIM_DAY)}. It's listed on My leave until it's decided.
      </InlineAlert>
      <div className="yx-tim-row"><span className="yx-tim-muted">Use by {dm(CLAIM_USE_BY)}</span><DueBadge date={CLAIM_USE_BY} /></div>
    </div>
  ) : (
    <div className="yx-tim-form">
      <FormField label="Day you worked" required helper="Holidays and weekly offs with punches in the last 30 days">
        <RadioGroup aria-label="Day you worked" defaultValue="26" options={[{ value: '26', label: `${wdm(CLAIM_DAY)} · ${CLAIM.kind}`, description: `Worked ${fmt12(CLAIM.in)} – ${fmt12(CLAIM.out)} (${worked}) · ${CLAIM.where}` }]} />
      </FormField>
      <FormField label="Claim" helper={CLAIM_WORKED < FULL_DAY_MIN ? `Full day needs 8 h; you worked ${worked} on ${dm(CLAIM_DAY)}.` : undefined}>
        <RadioGroup aria-label="Claim" value={amount} onChange={setAmount} orientation="horizontal" options={[{ value: 'half', label: 'Half day (4 h or more)', disabled: CLAIM_WORKED < HALF_DAY_MIN }, { value: 'full', label: 'Full day (8 h or more)', disabled: CLAIM_WORKED < FULL_DAY_MIN }]} />
      </FormField>
      <FormField label="Reason" required><TextArea rows={2} value={reason} onChange={setReason} /></FormField>
      <section className="yx-tim-effect">
        <strong>What you'll get</strong>
        <p className="yx-tim-muted">+{plural(claimDays, 'day')} comp-off after {ME.manager} approves</p>
        <div className="yx-tim-row"><span className="yx-tim-muted">Use by {dm(CLAIM_USE_BY)}</span><DueBadge date={CLAIM_USE_BY} /></div>
      </section>
      {/* Holiday work is credited without a claim: shown after the form, so it isn't read as a second day to pick. */}
      {creditedHoliday && coBal && coBal.credited > 0 && (
        <InlineAlert tone="info" title="Already credited">
          <div className="yx-tim-row" style={{ flexWrap: 'nowrap', justifyContent: 'space-between' }}>
            <span>{wdm(creditedHoliday.date)} ({creditedHoliday.name}): +{plural(coBal.credited, 'day')} · use by {dm(CO_EXPIRES)}</span>
            <DueBadge date={CO_EXPIRES} />
          </div>
        </InlineAlert>
      )}
    </div>
  );
  const footer = st === 'ready' ? (
    <DrawerFoot hint={reason.trim() ? undefined : 'Add a reason'} rest={<Button onClick={() => setOpen(false)}>Cancel</Button>} main={<Button variant="primary" disabled={!reason.trim()} onClick={() => { setSt('sent'); setClaimed(true); setWithdrawnMsg(null); }}>Send claim</Button>} />
  ) : <Button onClick={() => setOpen(false)}>Close</Button>;
  // The page behind is My leave (balances and claims waiting), with the button to claim again.
  const claimButton = <Button icon={CalendarPlus} onClick={() => { setSt(claimed ? 'none' : 'ready'); setOpen(true); }}>Claim comp-off</Button>;
  const withdrawDialog = (
    <ConfirmDialog
      open={!!withdrawing}
      onOpenChange={(o) => !o && setWithdrawing(null)}
      title="Withdraw this comp-off claim?"
      consequence={withdrawing ? `It hasn't been approved yet, so it's withdrawn at once. You can claim ${wdm(withdrawing.worked)} again within 30 days of working it.` : ''}
      confirmLabel="Withdraw claim"
      cancelLabel="Keep claim"
      destructive
      onConfirm={() => {
        if (withdrawing) setWithdrawnMsg(`Comp-off claim for ${wdm(withdrawing.worked)} withdrawn`);
        if (withdrawing?.id === 'co-new') setClaimed(false);
        setWithdrawing(null);
      }}
    />
  );
  const pendingCard = (pending.length > 0 || withdrawnMsg) && (
    <>
    {withdrawnMsg && <InlineAlert tone="success" title={withdrawnMsg} />}
    {pending.length > 0 && <Card title={`Comp-off waiting for approval (${pending.length})`}>
      <ul className="yx-tim-list">
        {pending.map((r) => (
          <li key={r.id}>
            <span className="yx-tim-list__main" style={MAIN}>
              <strong>{r.days === 0.5 ? 'Half day' : plural(r.days, 'day')} · worked {wdm(r.worked)}</strong>
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

function OptionalHolidaysPanel({ open, onOpenChange, surface = 'desk', chosen = OPTIONAL_DEFAULT, transferred = false, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; surface?: 'desk' | 'phone'; chosen?: string[]; transferred?: boolean; /** Saves the picks (My leave keeps them and recounts its button). */ onSave?: (sel: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(chosen);
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
                <Checkbox label={`${o.name} · ${wdm(o.date)}`} description={reason} checked={picked} disabled={locked} onChange={(c) => setSel(c ? [...sel, o.id] : sel.filter((x) => x !== o.id))} />
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
      main={<Button variant="primary" disabled={!changed} onClick={() => { onSave?.(sel); onOpenChange(false); }}>Save choices</Button>}
    />
  );
  const onSheet = (o: boolean) => (o ? onOpenChange(true) : dismiss());
  if (surface === 'phone') return <BottomSheet open={open} onOpenChange={onSheet} title="Optional holidays" footer={footer}>{body}</BottomSheet>;
  return <Drawer open={open} onOpenChange={onSheet} title="Optional holidays" footer={footer}>{body}</Drawer>;
}

export function OptionalHolidaysSheet({ surface = 'desk', chosen = ['o1'], transferred = false }: { surface?: 'desk' | 'phone'; chosen?: string[]; transferred?: boolean }) {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(chosen);
  const [msg, setMsg] = useState<string | null>(null);
  const n = transferred ? 1 : OPTIONAL_ALLOWED;
  const panel = <OptionalHolidaysPanel key={saved.join()} open={open} onOpenChange={setOpen} surface={surface} chosen={saved} transferred={transferred} onSave={(s) => { setMsg(optionalSavedText(saved, s)); setSaved(s); }} />;
  // Behind the sheet: the saved choice and the button that opens it again.
  const behind = (
    <div className="yx-tim-stack">
      {msg && <InlineAlert tone="success" title={msg} />}
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

export function EncashmentRequest({ surface = 'desk', days: d0 = 5, blocked }: { surface?: 'desk' | 'phone'; days?: number; blocked?: boolean }) {
  const [days, setDays] = useState<number | null>(d0);
  const [open, setOpen] = useState(true);
  const [sent, setSent] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
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
    <InlineAlert tone="success" title={`Sent to ${ME.manager}`}>{plural(n, 'day')} Earned leave, {formatINR(amount)} before tax, paid in October payroll once approved. It's listed on My leave, and its days are held from your balance, until it's decided.</InlineAlert>
  ) : (
    <div className="yx-tim-form">
      {withdrawn && <InlineAlert tone="success" title="Earlier request withdrawn" />}
      {/* Only earned leave can be encashed, so the type is a fact, not a choice. */}
      <dl className="yx-tim-effect__row"><dt>Leave type</dt><dd style={{ textAlign: 'end' }}>Earned leave · {available} available<br /><span className="yx-tim-note">{el.balance} days, {el.pending} pending</span></dd></dl>
      <FormField label="Days to encash" required helper={error ? undefined : max < ENCASH.maxPerYear ? `You can encash up to ${plural(max, 'day')} (${ENCASH.minLeft} of your ${available} must remain)` : `Up to ${ENCASH.maxPerYear} days a year`} error={error}>
        <div className="yx-tim-row">
          <IconButton variant="secondary" icon={Minus} label="Fewer days" disabled={n <= 1} onClick={() => setDays(Math.max(1, n - 1))} />
          <NumberField value={days} onChange={setDays} aria-label="Days" min={1} />
          <IconButton variant="secondary" icon={Plus} label="More days" disabled={n >= max} onClick={() => setDays(Math.min(max, n + 1))} />
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
    <DrawerFoot hint={error ? 'Fix the days to send' : undefined} rest={<Button onClick={() => setOpen(false)}>Cancel</Button>} main={<Button variant="primary" disabled={!!error} onClick={() => setSent(true)}>Send request</Button>} />
  );
  const withdrawDialog = (
    <ConfirmDialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw} title="Withdraw this encashment request?" consequence={`It hasn't been approved yet, so it's withdrawn at once. Nothing is paid for these ${plural(ENCASH_WAITING.days, 'day')}.`} confirmLabel="Withdraw request" destructive onConfirm={() => { setConfirmWithdraw(false); setWithdrawn(true); }} />
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

export function LongAbsenceCard({ kind = 'maternity', persona = 'emp', surface = 'desk' }: { kind?: 'maternity' | 'sabbatical' | 'lwp'; persona?: 'emp' | 'hr'; surface?: 'desk' | 'phone' }) {
  const info = ABSENCES_LONG[kind];
  const [dlg, setDlg] = useState<'change' | 'extend' | 'early' | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
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
      {msg && <InlineAlert tone="success" title={msg} />}
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
          confirmDisabled={!date || !note.trim()}
          onConfirm={() => {
            if (!date) return;
            setMsg(cfg.done(date));
            if (dlg === 'extend') setEnd(date);
            else if (dlg === 'early') setEnd(addDays(workingDay(date), -1));
            else setAsked(date);
            close();
          }}
        >
          <div className="yx-tim-stack">
            <FormField label={cfg.label} required><DatePicker value={date} onChange={setDate} min={dlg === 'extend' ? addDays(end, 1) : TODAY0} max={dlg === 'early' ? end : undefined} /></FormField>
            <FormField label="Reason" required><TextArea rows={2} value={note} onChange={setNote} /></FormField>
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

/* shared request list for leave reports */
export const LEAVE_COLS: TableColumn<LeaveRequestRow>[] = [
  { key: 'person', header: 'Employee', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person }) },
  { key: 'type', header: 'Type', value: (r) => r.type },
  { key: 'from', header: 'From', type: 'date', value: (r) => r.from },
  { key: 'to', header: 'To', type: 'date', value: (r) => r.to, optional: true },
  { key: 'days', header: 'Days', type: 'number', value: (r) => r.days, total: 'sum' },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Approved' ? 'success' : v === 'Pending' ? 'warning' : 'neutral') },
];
