// Rostering: roster, shift editor + patterns, auto-roster, open shifts & bids, standby, block leave,
// licences, hybrid office days. TIM-05, TIM-06, TIM-34, TIM-35, TIM-38, TIM-39, TIM-40, TIM-41.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Lock, Play, Plus, Send, Trash2 } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { locationHeadcount } from '../_kit/data';
import { Button, IconButton } from '../../components/button';
import { AiBadge, Badge, PersonLabel, Tag } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/menu';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { Icon } from '../../components/foundations';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { RadioGroup, Switch, Checkbox } from '../../components/choice';
import { NumberField, TextField, TimeField } from '../../components/inputs';
import { FieldRow, FormField, FormSection } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { useNarrow } from '../../components/stepper';
import { ON_CALL_RULES } from '../pay/pay-data';
import {
  BLOCKING_CONFLICTS,
  RosterGrid,
  checkRoster,
  type RosterConflict,
  type RosterLeave,
  type RosterPerson,
  type RosterRules,
  type RosterStatus,
  type RosterValue,
  type Shift,
} from '../../components/roster';
import { Segment } from '../people/people-kit';
import { DueBadge, Kpis, ShiftBar, TimePage } from './time-kit';
import { countLeaveDays, daysUntil, fmt12, relativeDue, type Punch } from './time-logic';
import { HOLIDAYS, HR_ADMIN, ME, TODAY, myReports, type TimeUser } from './time-data';
import { LoadingBlock, type ViewState } from './attendance';
import './time.css';

/** Opens another screen's story, so buttons that lead to a screen go somewhere. */
const storyHref = (id: string) => `/?path=/story/${id}`;
const STORY = {
  autoRoster: 'screens-time-tim-34-·-auto-roster--draft',
  swap: 'screens-time-tim-08-·-shift-change-or-swap--request',
  openShifts: 'screens-time-tim-35-·-open-shifts-and-bids--manager',
  rosterHr: 'screens-time-tim-05-·-roster--hr',
  myShifts: 'screens-time-tim-05-·-roster--phone',
  teamLeave: 'screens-time-tim-20-·-team-leave-calendar--manager',
};

/** Hosur plant people are Ramesh Gowda's reports (Operations), so plant manager stories sign in as him (S3). */
const PLANT_MANAGER: TimeUser = { name: 'Ramesh Gowda', email: 'ramesh.g@kaverifoods.in', role: 'Head of Operations' };
const LINE_OPERATOR: TimeUser = { name: 'Rekha Balan', email: 'rekha.b@kaverifoods.in', role: 'Line Operator' };

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Wed 7 Oct" */
const dayName = (d: Date) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
/** "7 Oct" */
const shortDate = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;
/** "7 Oct 2026" (no leading zero, like the rest of the app). */
const longDate = (d: Date) => `${shortDate(d)} ${d.getFullYear()}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const hm = (mins: number) => `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} m` : ''}`;
const toMins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const PLANT_SHIFTS: Shift[] = [
  { code: 'M', name: 'Morning', start: '06:00', end: '14:00', hours: 8, color: 2 },
  { code: 'E', name: 'Evening', start: '14:00', end: '22:00', hours: 8, color: 3 },
  { code: 'N', name: 'Night', start: '22:00', end: '06:00', hours: 8, color: 4 },
  { code: 'G', name: 'General', start: '09:30', end: '18:30', hours: 8, color: 1 },
  { code: 'SB', name: 'Standby', hours: 0, color: 6, displayStart: '18:00' },
  { code: 'OFF', name: 'Weekly off', hours: 0 },
];
const shiftOf = (code: string | null | undefined) => PLANT_SHIFTS.find((s) => s.code === code);
const shiftText = (code: string | null | undefined) => (!code ? 'No shift' : code === 'OFF' ? 'Off' : shiftOf(code)?.name ?? code);
const shiftTimes = (s: Shift) => (s.start && s.end ? `${fmt12(s.start)} – ${fmt12(s.end)}`.replace(/:00/g, '') : '');
/** Colleagues' leave in the staff view: the leave type stays private, but the day isn't called a weekly off. */
const AWAY: Shift = { code: 'Away', name: 'Away', hours: 0 };
const STAFF_SHIFTS = [...PLANT_SHIFTS, AWAY];
const legendText = (s: Shift) => (s.code === 'SB' ? 'Standby 6 pm – 6 am (on call, not counted in hours)' : s.code === 'SB+' ? 'Standby, called out (paid call-out time counted in hours)' : s.code === 'OFF' ? 'Weekly off' : s.code === AWAY.code ? 'on leave' : `${s.name} ${shiftTimes(s)}`);
/** Key for the shift codes, shown wherever the grid has no palette (staff and read-only views): small read-only chips, one line each. */
function Legend({ shifts = PLANT_SHIFTS }: { shifts?: Shift[] }) {
  return (
    <div className="yx-tim-row" role="list" aria-label="Shift key">
      {shifts.map((s) => <span key={s.code} role="listitem" className="yx-tim-nowrap"><Badge tone="neutral"><span className="yx-roster__code">{s.code}</span> {legendText(s)}</Badge></span>)}
    </div>
  );
}

export const PLANT_PEOPLE: RosterPerson[] = [
  { id: 'p1', name: 'Kavitha Sundaram', role: 'Line Operator' },
  { id: 'p2', name: 'Rekha Balan', role: 'Line Operator' },
  { id: 'p3', name: 'Anil Kumar', role: 'Maintenance Technician' },
  { id: 'p4', name: 'Senthil Murugan', role: 'Shift Supervisor' },
  { id: 'p5', name: 'Jaya Prakash', role: 'Line Operator' },
  { id: 'p6', name: 'Mohammed Irfan', role: 'Forklift Driver' },
  { id: 'p7', name: 'Lalitha Devi', role: 'Quality Inspector' },
  { id: 'p8', name: 'Selvi Arumugam', role: 'Line Operator' },
];
const WEEK = new Date(2026, 9, 5); // Mon 5 Oct 2026
const DAYS = ['Mon 5', 'Tue 6', 'Wed 7', 'Thu 8', 'Fri 9', 'Sat 10', 'Sun 11'];

/**
 * Draft for Line 2. Operators work 4 on / 2 off (Rekha's crew and Kavitha's night crew follow the TIM-06 patterns).
 * Two conflicts are left open on purpose: Senthil has no rest after Wednesday night, and Jaya is rostered on approved leave.
 */
export const PLANT_ROSTER: RosterValue = {
  p1: ['N', 'N', 'N', 'N', 'OFF', 'OFF', 'N'],
  p2: ['OFF', 'OFF', 'M', 'M', 'M', 'M', 'OFF'],
  p3: ['G', 'G', 'G', 'SB', 'G', 'OFF', 'SB'],
  p4: ['E', 'E', 'N', 'M', 'M', 'OFF', 'OFF'],
  p5: ['M', 'M', 'M', 'M', 'OFF', 'OFF', 'M'],
  p6: ['E', 'E', 'E', 'E', 'E', 'E', 'OFF'],
  p7: ['M', null, 'M', 'M', 'OFF', 'OFF', 'M'],
  // Matches TIM-08: Mon 5 Morning, Tue 6 Evening, Wed 7 off. Thu 8 and Sun 11 mornings keep her off the TIM-34 Wed and Sun nights.
  p8: ['M', 'E', 'OFF', 'M', 'M', 'OFF', 'M'],
};
/** The draft with Fri–Sun not set yet: what "Copy last week" fills. */
const PART_ROSTER: RosterValue = Object.fromEntries(Object.entries(PLANT_ROSTER).map(([id, row]) => [id, row.map((c, i) => (i >= 4 ? null : c))]));
/** The same week with both conflicts fixed: what staff see once it is published. */
export const PUBLISHED_ROSTER: RosterValue = { ...PLANT_ROSTER, p4: ['E', 'E', 'N', 'N', 'OFF', 'OFF', 'M'], p5: ['M', 'M', 'M', null, 'OFF', 'OFF', 'M'] };
/** Maintenance week of 28 Sep: Anil was on standby Mon 28 Sep night and has the General shift Tue 29 Sep (TIM-38). */
const STANDBY_THIS_WEEK: RosterValue = { p3: ['SB', 'G', 'G', 'G', 'G', 'OFF', 'OFF'], p4: ['M', 'M', 'M', 'M', 'OFF', 'OFF', 'SB'] };
/** Week of 28 Sep (published), the source for "Copy last week". */
export const LAST_WEEK: RosterValue = {
  ...PUBLISHED_ROSTER,
  // Same Anil and Senthil weeks as TIM-38, so the published week has one roster.
  ...STANDBY_THIS_WEEK,
  // Kavitha: mornings 29–30 Sep, leave 1 Oct (approved CL, PLANT_LEAVE), holiday shift 2 Oct (Gandhi Jayanti); night crew from 5 Oct.
  p1: ['OFF', 'M', 'M', null, 'M', 'OFF', 'OFF'],
  p2: ['M', 'OFF', 'OFF', 'M', 'M', 'M', 'M'],
  p5: ['M', 'M', 'M', 'M', 'OFF', 'OFF', 'M'],
  p7: ['M', 'M', 'M', 'M', 'OFF', 'OFF', 'M'],
  // Selvi (4 on / 2 off): evenings Tue 29 – Fri 2 Oct, off Sat 3 and Sun 4 (TIM-08: Fri 2 Evening ends 10 pm, 8 h before a Sat 3 morning).
  p8: ['OFF', 'E', 'E', 'E', 'E', 'OFF', 'OFF'],
};
const PLANT_LEAVE: RosterLeave[] = [{ personId: 'p1', date: new Date(2026, 9, 1), code: 'CL' }, { personId: 'p7', date: new Date(2026, 9, 6), code: 'CL' }, { personId: 'p5', date: new Date(2026, 9, 8), code: 'EL' }];
const leaveOn = (pid: string, i: number) => PLANT_LEAVE.some((l) => l.personId === pid && l.date.getTime() === addDays(WEEK, i).getTime());

/** Night work (7 pm – 6 am): in Tamil Nadu women need written consent and a safeguards checklist; men need none. */
const NIGHT_CONSENT: Record<string, string> = { p1: '31 Mar 2027', p8: '28 Feb 2027' };
const NIGHT_NO_CONSENT_NEEDED = ['p3', 'p4', 'p5', 'p6'];
const PLANT_RULES: RosterRules = { minRestHours: 11, maxWeeklyHours: 48, nightConsent: [...Object.keys(NIGHT_CONSENT), ...NIGHT_NO_CONSENT_NEEDED] };
const nameOf = (id: string) => PLANT_PEOPLE.find((p) => p.id === id)?.name ?? id;

const checkPlant = (value: RosterValue) => checkRoster({ people: PLANT_PEOPLE, value, start: WEEK, days: 7, shifts: PLANT_SHIFTS, leave: PLANT_LEAVE, rules: PLANT_RULES });
const conflictKey = (x: RosterConflict) => `${x.personId}:${x.day}:${x.kind}`;
const cellOf = (s: string): [string, number] => {
  const [p, i] = s.split(':');
  return [p, Number(i)];
};
function swapCells(v: RosterValue, a: string, b: string): RosterValue {
  const [pa, ia] = cellOf(a);
  const [pb, ib] = cellOf(b);
  const next: RosterValue = { ...v, [pa]: [...(v[pa] ?? [])] };
  next[pb] = pb === pa ? next[pa] : [...(v[pb] ?? [])];
  const t = next[pa][ia] ?? null;
  next[pa][ia] = next[pb][ib] ?? null;
  next[pb][ib] = t;
  return next;
}

/** Fills empty cells from last week; approved leave days stay empty. */
function copyLastWeek(v: RosterValue) {
  let filled = 0;
  const leaveKept: string[] = [];
  const next: RosterValue = {};
  for (const p of PLANT_PEOPLE) {
    next[p.id] = DAYS.map((_, i) => {
      const c = v[p.id]?.[i] ?? null;
      if (c) return c;
      if (leaveOn(p.id, i)) {
        leaveKept.push(p.name.split(' ')[0]);
        return null;
      }
      const from = LAST_WEEK[p.id]?.[i] ?? null;
      if (from) filled++;
      return from;
    });
  }
  return { next, filled, leaveKept };
}

/* =====================================================================
   TIM-05 · Roster (drag, copy week, swap, conflicts, publish)
   ===================================================================== */

/** Runs the grid's rest, leave and night-consent checks on the chosen pair before the swap is allowed. */
function SwapDialog({ open, onOpenChange, value, onSwap }: { open: boolean; onOpenChange: (o: boolean) => void; value: RosterValue; onSwap: (v: RosterValue) => void }) {
  // Default pair: two line operators on the same day (Fri 9), so the morning keeps its cover: Jaya takes Selvi's morning, Selvi gets the day off.
  const [a, setA] = useState('p5:4');
  const [b, setB] = useState('p8:4');
  const options = PLANT_PEOPLE.flatMap((p) => DAYS.map((d, i) => ({ value: `${p.id}:${i}`, label: `${p.name} · ${d} Oct · ${shiftText(value[p.id]?.[i])}` })));
  const swapped = useMemo(() => swapCells(value, a, b), [value, a, b]);
  const before = useMemo(() => checkPlant(value), [value]);
  const after = useMemo(() => checkPlant(swapped), [swapped]);
  const beforeKeys = new Set(before.map(conflictKey));
  const afterKeys = new Set(after.map(conflictKey));
  const added = after.filter((x) => !beforeKeys.has(conflictKey(x)));
  const cleared = before.filter((x) => !afterKeys.has(conflictKey(x)));
  const same = a === b || (value[cellOf(a)[0]]?.[cellOf(a)[1]] ?? null) === (value[cellOf(b)[0]]?.[cellOf(b)[1]] ?? null);
  const blocking = added.filter((x) => BLOCKING_CONFLICTS.includes(x.kind));
  // Skill check: a shift goes only to someone in the same role (a Maintenance Technician can't cover a Shift Supervisor's shift).
  const pa = PLANT_PEOPLE.find((p) => p.id === cellOf(a)[0])!;
  const pb = PLANT_PEOPLE.find((p) => p.id === cellOf(b)[0])!;
  const roleClash = pa.id !== pb.id && pa.role !== pb.role ? `${pa.name} (${pa.role}) and ${pb.name} (${pb.role}) aren't trained for each other's shifts` : '';
  // Cover check: on different days, each working shift that changes day leaves its own day one person short.
  const [ia, ib] = [cellOf(a)[1], cellOf(b)[1]];
  const va = value[pa.id]?.[ia] ?? null;
  const vb = value[pb.id]?.[ib] ?? null;
  const working = (c: string | null) => !!c && c !== 'OFF';
  const gaps = ia === ib ? [] : ([[ia, va], [ib, vb]] as const).filter(([, c]) => working(c)).map(([i, c]) => `${DAYS[i]} Oct ${shiftText(c).toLowerCase()} would be 1 person short`);
  // A shift traded for a day off on another date is a move, not a swap.
  const move = ia !== ib && (!working(va) || !working(vb));
  const reason = same ? 'Pick two different shifts' : roleClash ? 'Roles differ' : gaps.length ? `Leaves ${gaps.length === 1 ? 'a shift' : `${gaps.length} shifts`} short` : blocking.length ? `Breaks ${blocking.length === 1 ? 'a rule' : `${blocking.length} rules`}` : '';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Swap two shifts"
      footer={
        <>
          {reason && <span className="yx-tim-muted">{reason}</span>}
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!!reason} onClick={() => { onSwap(swapped); onOpenChange(false); }}>{move ? 'Move shift' : 'Swap shifts'}</Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        <FormField label="First"><Select searchable value={a} onChange={(v) => v && setA(v)} options={options} /></FormField>
        <FormField label="Second"><Select searchable value={b} onChange={(v) => v && setB(v)} options={options} /></FormField>
        {!same && (roleClash || gaps.length > 0 || blocking.length > 0) && (
          <InlineAlert tone="danger" title={roleClash || blocking.length ? 'This swap breaks a rule' : 'This leaves a shift without cover'}>
            <ul className="yx-tim-steps">{roleClash && <li>{roleClash}</li>}{gaps.map((g) => <li key={g}>{g}</li>)}{blocking.map((x) => <li key={conflictKey(x)}>{x.message}</li>)}</ul>
          </InlineAlert>
        )}
        {!same && !roleClash && !gaps.length && blocking.length === 0 && (
          <InlineAlert tone="success" title="Cover, role, rest, leave and night-consent checks pass">
            {cleared.length > 0 ? `Fixes: ${cleared.map((x) => x.message).join('; ')}.` : 'No new conflicts.'}
            {added.length > 0 && ` Still check: ${added.map((x) => x.message).join('; ')}.`}
          </InlineAlert>
        )}
        <p className="yx-tim-muted">Both people are notified. A swap you make as manager doesn't need their consent; a swap they ask for needs the colleague's consent.</p>
      </div>
    </Dialog>
  );
}

function GuardsCard() {
  const women = PLANT_PEOPLE.filter((p) => !NIGHT_CONSENT[p.id] && !NIGHT_NO_CONSENT_NEEDED.includes(p.id));
  return (
    <Card title="Law and licence guards">
      <ul className="yx-tim-list">
        <li><span className="yx-tim-list__main"><strong>{women.map((p) => p.name).join(', ')} · no night-work consent</strong><span className="yx-tim-muted">Can't be rostered between 7 pm and 6 am. The law sets this window; there is no override.</span></span><Badge tone="danger">Law</Badge></li>
        {Object.entries(NIGHT_CONSENT).map(([id, until]) => (
          <li key={id}><span className="yx-tim-list__main"><strong>{nameOf(id)} · night-work consent</strong><span className="yx-tim-muted">Valid until {until} · Hosur safeguards checklist valid</span></span></li>
        ))}
        {/* Same watch list as TIM-40, so both screens read one source. */}
        {FORKLIFT_WATCH().map((h) => {
          const gone = daysUntil(h.expires, TODAY) < 0;
          return (
            <li key={h.name}>
              <span className="yx-tim-list__main">
                <strong>{h.name} · forklift licence {gone ? 'expired' : 'expires'} {shortDate(h.expires)}</strong>
                <span className="yx-tim-muted">{gone ? "Can't be rostered on forklift duty until it's renewed" : `Can't be rostered on forklift duty from ${shortDate(h.expires)} unless renewed`}</span>
              </span>
              <DueBadge date={h.expires} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** One person's week as a plain list (phones). */
function MyWeekList({ row, pid }: { row: (string | null)[]; pid: string }) {
  return (
    <ul className="yx-tim-list">
      {row.map((c, i) => {
        const s = shiftOf(c);
        const leave = PLANT_LEAVE.find((l) => l.personId === pid && l.date.getTime() === addDays(WEEK, i).getTime());
        return <li key={i}><span>{DAYS[i]} Oct</span><strong>{leave ? `On leave · ${leave.code}` : s?.start ? `${s.name} ${shiftTimes(s)}` : c === 'SB' ? 'Standby 6 pm – 6 am' : c === 'OFF' ? 'Weekly off' : 'No shift'}</strong></li>;
      })}
    </ul>
  );
}

export function RosterScreen({ persona = 'mgr', status = 'draft', dialog, state = 'ready', readOnly, partial }: { persona?: 'mgr' | 'hr' | 'emp'; status?: 'draft' | 'published'; dialog?: 'copy' | 'swap' | 'night'; state?: ViewState; readOnly?: boolean; /** Draft with Fri–Sun still empty. */ partial?: boolean }) {
  const [dlg, setDlg] = useState(dialog);
  const [st, setSt] = useState<ViewState>(state);
  const [value, setValue] = useState<RosterValue>(state === 'empty' ? {} : status === 'published' ? PUBLISHED_ROSTER : partial ? PART_ROSTER : PLANT_ROSTER);
  // One status for the header and the grid.
  const [rs, setRs] = useState<RosterStatus>(status);
  const [publishedOn, setPublishedOn] = useState(status === 'published' ? '28 Sep' : '');
  const narrow = useNarrow();
  const staff = persona === 'emp' || readOnly;
  const user = persona === 'hr' ? HR_ADMIN : persona === 'emp' ? LINE_OPERATOR : PLANT_MANAGER;
  const ready = st === 'ready';
  // Staff see their own row first (marked "You") and no conflict flags. Their own leave shows its type; a colleague's leave shows as "Away".
  const me = PLANT_PEOPLE.find((p) => p.name === LINE_OPERATOR.name)!;
  const people = staff ? [{ ...me, role: `You · ${me.role}` }, ...PLANT_PEOPLE.filter((p) => p !== me)] : PLANT_PEOPLE;
  const shown = staff
    ? Object.fromEntries(Object.entries(value).map(([id, row]) => [id, row.map((c, i) => c ?? (leaveOn(id, i) ? (id === me.id ? null : AWAY.code) : 'OFF'))]))
    : value;
  // Header actions: blocked with the reason while the roster isn't there; a published week doesn't offer a fresh draft.
  const notReady = st === 'loading' ? 'Roster is loading' : st === 'error' ? "Roster didn't load" : st === 'empty' ? 'No shifts to swap yet' : '';
  const draftTools = st !== 'empty' && rs !== 'published';
  const change = (v: RosterValue) => {
    setValue(v);
    if (rs === 'published') setRs('draft');
  };
  const copy = copyLastWeek(value);
  const badge = !ready
    ? st === 'empty' && <Badge tone="neutral">No roster yet</Badge>
    : rs === 'published'
      ? <Badge tone="success">Published {publishedOn}</Badge>
      : <Badge tone="warning">{publishedOn ? 'Unpublished changes' : 'Draft · not visible to staff'}</Badge>;
  const rosterBody =
    st === 'loading' ? <LoadingBlock rows={8} /> : st === 'error' ? (
      <ErrorState title="The roster didn't load" description="Check your connection and try again. Nothing you published is lost." onRetry={() => setSt('ready')} reference="ROS-7B02" />
    ) : st === 'empty' ? (
      <EmptyState
        title="No roster for this week yet"
        description="Copy last week's roster, or let auto-roster fill it from the number of people each shift needs."
        action={<span className="yx-tim-row"><Button variant="primary" icon={Copy} onClick={() => setDlg('copy')}>Copy last week</Button><Button asChild><a href={storyHref(STORY.autoRoster)} target="_top">Auto-roster</a></Button></span>}
      />
    ) : staff && narrow ? (
      <div className="yx-tim-stack">
        <MyWeekList row={shown[me.id] ?? []} pid={me.id} />
        <p className="yx-tim-note">Your shifts only. Open the roster on a wider screen to see your colleagues' shifts.</p>
      </div>
    ) : (
      <div className="yx-tim-stack">
        {staff && <Legend shifts={STAFF_SHIFTS} />}
        <RosterGrid
          people={people}
          start={WEEK}
          shifts={staff ? STAFF_SHIFTS : PLANT_SHIFTS}
          value={shown}
          onChange={change}
          leave={staff ? PLANT_LEAVE.filter((l) => l.personId === me.id) : PLANT_LEAVE}
          status={rs}
          onPublish={() => { setRs('published'); setPublishedOn('today'); }}
          readOnly={staff}
          rules={PLANT_RULES}
        />
        {!staff && <GuardsCard />}
      </div>
    );
  return (
    <TimePage active={staff ? 'My shifts' : 'Roster'} user={user}>
      <PageHeader
        title="Roster · Hosur plant"
        description={staff ? 'Week of 5 Oct 2026 · Line 2' : 'Week of 5 Oct 2026 · Line 2 · minimum rest 11 h · max 48 h a week · night window 7 pm – 6 am (Tamil Nadu)'}
        status={badge || undefined}
        actions={
          staff ? (
            <Button asChild><a href={storyHref(STORY.swap)} target="_top">Ask to swap a shift</a></Button>
          ) : (
            <div className="yx-tim-row">
              {/* One reason ahead of the whole group, so it reads as applying to every disabled button. */}
              {notReady && <span className="yx-tim-muted">{notReady}</span>}
              {draftTools && ready && copy.filled === 0 && <span className="yx-tim-muted">Every cell is set</span>}
              {draftTools && <Button icon={Copy} disabled={!ready || copy.filled === 0} onClick={() => setDlg('copy')}>Copy last week</Button>}
              <Button disabled={!ready} onClick={() => setDlg('swap')}>Swap shifts</Button>
              {draftTools && (ready
                ? <Button asChild><a href={storyHref(STORY.autoRoster)} target="_top">Auto-roster</a></Button>
                : <Button disabled>Auto-roster</Button>)}
            </div>
          )
        }
      />
      {staff ? rosterBody : (
        <Tabs defaultValue="roster">
          <TabsList aria-label="Roster views">
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="open" count={OPEN.filter((o) => o.status === 'Open').length}>Open shifts</TabsTrigger>
            <TabsTrigger value="bids">Bids</TabsTrigger>
          </TabsList>
          <TabsContent value="roster">{rosterBody}</TabsContent>
          <TabsContent value="open"><OpenShiftsManager /></TabsContent>
          <TabsContent value="bids"><BidWindowPanel /></TabsContent>
        </Tabs>
      )}
      <ConfirmDialog
        open={dlg === 'copy'}
        onOpenChange={(o) => !o && setDlg(undefined)}
        title="Copy week of 28 Sep into this week?"
        consequence={`${copy.filled ? `Fills ${copy.filled} empty ${copy.filled === 1 ? 'cell' : 'cells'}; cells you already set stay.` : 'Every cell is already set, so nothing would change.'}${copy.leaveKept.length ? ` ${copy.leaveKept.join(' and ')}'s leave ${copy.leaveKept.length === 1 ? 'day stays' : 'days stay'} empty.` : ''}`}
        confirmLabel="Copy week"
        confirmDisabled={copy.filled === 0}
        onConfirm={() => { change(copy.next); setSt('ready'); setDlg(undefined); }}
      />
      <SwapDialog open={dlg === 'swap' && ready} onOpenChange={(o) => !o && setDlg(undefined)} value={value} onSwap={change} />
    </TimePage>
  );
}

/** Employee phone: My shifts (published roster, read-only) with swap entry. Rekha's row of the published roster. */
export function MyShiftsPhone() {
  return (
    <PhoneFrame tab="time" title="My shifts" user={LINE_OPERATOR}>
      <p className="yx-tim-muted">Week of 5 Oct · Line 2 · published 28 Sep</p>
      <MyWeekList row={PUBLISHED_ROSTER.p2} pid="p2" />
      <Button fullWidth asChild><a href={storyHref(STORY.swap)} target="_top">Ask to swap a shift</a></Button>
    </PhoneFrame>
  );
}

/* =====================================================================
   TIM-06 · Shift editor with preview + shift patterns
   ===================================================================== */

type ShiftKind = 'fixed' | 'flexi' | 'split' | 'night';
/** Each type is its own shift; changing the type of a shift in use would change everyone on it. */
const SHIFT_TYPES: Record<ShiftKind, { name: string; code: string; start: string; end: string; people: number; label: string }> = {
  fixed: { name: 'General', code: 'G', start: '09:30', end: '18:30', people: 146, label: 'Fixed' },
  flexi: { name: 'Flexi day', code: 'FX', start: '08:00', end: '20:00', people: 38, label: 'Flexi with core hours' },
  split: { name: 'Canteen split', code: 'SP', start: '07:00', end: '21:00', people: 12, label: 'Split' },
  night: { name: 'Night', code: 'N', start: '22:00', end: '06:00', people: 24, label: 'Night (across midnight)' },
};
const punch = (id: string, kind: Punch['kind'], time: string): Punch => ({ id, kind, time, source: 'biometric', where: 'Hosur plant', verdict: 'inside' });
/** Sample punches per type (night "out" past midnight is written as 30:40 so the bar runs on). The result is worked out from the form. */
const PREVIEW_PUNCHES: Record<ShiftKind, Punch[]> = {
  fixed: [punch('a', 'in', '09:52'), punch('b', 'out', '19:20')],
  flexi: [punch('a', 'in', '09:52'), punch('b', 'out', '19:20')],
  split: [punch('a', 'in', '06:58'), punch('b', 'out', '11:02'), punch('c', 'in', '16:55'), punch('d', 'out', '21:05')],
  night: [punch('a', 'in', '21:55'), punch('b', 'out', '30:40')],
};
type BreakRule = 'fixed' | 'punch' | 'none';
/** "45 m", "1 h 10 m" */
const mins = (m: number) => (m < 60 ? `${m} m` : hm(m));
/** The preview day: status, worked time, break, overtime and allowance from the form's rules and the sample punches. */
function previewOf(kind: ShiftKind, f: ShiftFields, breakRule: BreakRule) {
  const p = PREVIEW_PUNCHES[kind];
  const t = (s: string) => toMins(s);
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < p.length; i += 2) pairs.push([t(p[i].time), t(p[i + 1].time)]);
  const inM = pairs[0][0];
  const outM = pairs[pairs.length - 1][1];
  const gross = pairs.reduce((n, [a, b]) => n + b - a, 0);
  const startM = f.start ? t(f.start) : inM;
  // Night ends next day; a split's day ends with its second part.
  const lastEnd = kind === 'split' ? f.part2To : f.end;
  const endM = lastEnd ? t(lastEnd) + (kind === 'night' && t(lastEnd) <= startM ? 1440 : 0) : outM;
  const breakM = kind === 'split' || breakRule !== 'fixed' || gross <= 5 * 60 ? 0 : 30;
  const worked = gross - breakM;
  const late = inM - startM;
  const coreOk = !f.coreFrom || !f.coreTo || (inM <= t(f.coreFrom) && outM >= t(f.coreTo));
  const status = f.halfDay != null && worked < f.halfDay * 60 ? 'Absent (under half day)'
    : f.fullDay != null && worked < f.fullDay * 60 ? 'Half day'
      : kind === 'flexi' ? (coreOk ? 'Present · in for all core hours' : 'Present · missed core hours')
        : kind !== 'split' && late > 0 ? (f.late != null && late <= f.late ? 'Present · within late grace' : `Present · late by ${mins(late)}`) : 'Present';
  const otAfter = kind === 'flexi' ? worked - (f.flexiOt ?? 0) * 60 : outM - endM;
  const otPaid = f.otMin != null && otAfter >= f.otMin && otAfter > 0 ? (f.otRound ? Math.floor(otAfter / f.otRound) * f.otRound : otAfter) : 0;
  const overtime = otPaid
    ? `${mins(otPaid)} ${kind === 'flexi' ? `over ${f.flexiOt} h worked` : `after ${clock(endM)}`} (pending)`
    : kind === 'flexi' ? `None (under ${f.flexiOt ?? 0} h worked)` : otAfter > 0 ? 'None (under the minimum)' : 'None';
  const text = kind === 'night' ? 'A night with punches at 9:55 pm and 6:40 am.'
    : kind === 'split' ? `A day with punches at 6:58 am – 11:02 am and 4:55 pm – 9:05 pm.${f.end && f.part2From ? ` The ${clock(t(f.end))} – ${clock(t(f.part2From))} gap is the break, not shift time.` : ''}`
      : `A day with punches at 9:52 am and 7:20 pm.${kind === 'fixed' ? ` The shift ends at ${clock(endM)}; the time after it is overtime.` : ''}`;
  const rows: [string, string][] = [
    ['Status', status],
    ['Worked', hm(worked)],
    ['Break deducted', kind === 'split' ? 'None (the gap is the break)' : breakRule === 'punch' ? 'None (no break punches)' : breakM ? mins(breakM) : 'None'],
    ['Overtime', overtime],
    ['Allowance', kind === 'night' ? 'Night ₹150' : 'None'],
  ];
  const note = kind !== 'flexi' && f.otMin ? `Leaving before ${clock(endM + f.otMin)} would give no overtime: the minimum is ${f.otMin} min.` : undefined;
  return { text, punches: p, rows, note };
}

interface Pattern {
  id: string; name: string; weekly: boolean; cycle: string[]; group: string; people: number; start: Date;
  /** Cycle kept while Weekly is picked, so switching back restores it. */ prevCycle?: string[];
  /** Added on this page and not saved yet. */ draft?: boolean;
  /** For a pattern that has started: the date edits take effect. */ effective?: Date;
}
/** Start dates are past dates that line up with the TIM-05 roster: Rekha (morning crew) and Kavitha (night crew) week of 5 Oct. */
const PATTERNS: Pattern[] = [
  { id: 'w5', name: '5-day week · General', weekly: true, cycle: ['G', 'G', 'G', 'G', 'G', 'OFF', 'OFF'], group: 'Chennai office · all staff', people: locationHeadcount('Chennai office'), start: new Date(2026, 8, 7) },
  { id: 'm42', name: '4 on / 2 off · Morning', weekly: false, cycle: ['M', 'M', 'M', 'M', 'OFF', 'OFF'], group: 'Hosur plant · Line 2 morning crew', people: 18, start: new Date(2026, 8, 25) },
  { id: 'n42', name: '4 on / 2 off · Night', weekly: false, cycle: ['N', 'N', 'N', 'N', 'OFF', 'OFF'], group: 'Hosur plant · Line 2 night crew', people: 8, start: new Date(2026, 8, 23) },
  { id: 'r21', name: 'Rotating: Morning, Evening, Night', weekly: false, cycle: [...Array(5).fill('M'), 'OFF', 'OFF', ...Array(5).fill('E'), 'OFF', 'OFF', ...Array(5).fill('N'), 'OFF', 'OFF'], group: 'Hosur plant · Line 1', people: 24, start: new Date(2026, 8, 7) },
];
const GROUPS = ['Chennai office · all staff', 'Bengaluru head office · all staff', 'Hosur plant · Line 1', 'Hosur plant · Line 2 morning crew', 'Hosur plant · Line 2 night crew'];
/** Headcount per group, so Assign to keeps the people count right. */
const GROUP_PEOPLE: Record<string, number> = {
  'Chennai office · all staff': locationHeadcount('Chennai office'),
  'Bengaluru head office · all staff': locationHeadcount('Bengaluru head office'),
  'Hosur plant · Line 1': 24,
  'Hosur plant · Line 2 morning crew': 18,
  'Hosur plant · Line 2 night crew': 8,
};

/** The editable rules of one shift (times in "HH:mm", grace and overtime in minutes, thresholds in hours). */
interface ShiftFields { start: string | null; end: string | null; coreFrom: string | null; coreTo: string | null; part2From: string | null; part2To: string | null; checkIn: number | null; late: number | null; early: number | null; fullDay: number | null; halfDay: number | null; otMin: number | null; otRound: number | null; /** Flexi only: overtime starts after this many hours worked. */ flexiOt: number | null }
const fieldsOf = (k: ShiftKind, halfDay = 4): ShiftFields => ({
  start: k === 'split' ? '07:00' : SHIFT_TYPES[k].start,
  end: k === 'split' ? '11:00' : SHIFT_TYPES[k].end,
  coreFrom: '11:00', coreTo: '16:00', part2From: '17:00', part2To: '21:00',
  checkIn: 60, late: 10, early: 10, fullDay: 7.5, halfDay, otMin: 30, otRound: 15, flexiOt: 9,
});
/** "18:52" from minutes after midnight. */
const hhmm = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
/** "6:52 pm" from minutes after midnight. */
const clock = (mins: number) => fmt12(hhmm(mins));

export function ShiftEditorScreen({ tab = 'shift', kind: kindProp = 'fixed', saveState }: { tab?: 'shift' | 'patterns'; kind?: ShiftKind; saveState?: 'error' | 'saved' }) {
  const [t, setT] = useState<string>(tab);
  const [patterns, setPatterns] = useState(PATTERNS);
  const [patternId, setPatternId] = useState('m42');
  const [patternSaved, setPatternSaved] = useState<string | null>(null);
  const [kind, setKind] = useState<ShiftKind>(kindProp);
  const [f, setF] = useState<ShiftFields>(() => fieldsOf(kindProp, saveState === 'error' ? 8 : 4));
  const [nameVal, setNameVal] = useState(SHIFT_TYPES[kindProp].name);
  const [codeVal, setCodeVal] = useState(SHIFT_TYPES[kindProp].code);
  const [breakRule, setBreakRule] = useState<BreakRule>(kindProp === 'split' ? 'none' : 'fixed');
  /** What was on screen when Duplicate was clicked, so Discard copy puts it back; null when not editing a copy. */
  const [copyFrom, setCopyFrom] = useState<{ kind: ShiftKind; name: string; code: string; f: ShiftFields; isNew: boolean } | null>(null);
  /** A copy once saved: a shift of its own with no one on it yet. ponytail: one saved copy per visit; a list store when shifts are wired. */
  const [newShift, setNewShift] = useState<{ kind: ShiftKind; name: string; code: string; f: ShiftFields; from: Date } | null>(null);
  const [editingNew, setEditingNew] = useState(false);
  /** Saved edits per shift, so a saved shift reopens with its saved values. */
  const [savedShifts, setSavedShifts] = useState<Partial<Record<ShiftKind, { f: ShiftFields; name: string; code: string; breakRule: BreakRule }>>>({});
  /** What the form held when the shift was opened or last saved; any difference is an unsaved change. */
  // The save-error story opens on an unsaved edit (half day 8 h), so its base is the shift as saved.
  const [base, setBase] = useState(() => ({ kind: kindProp, f: fieldsOf(kindProp), name: SHIFT_TYPES[kindProp].name, code: SHIFT_TYPES[kindProp].code, breakRule: (kindProp === 'split' ? 'none' : 'fixed') as BreakRule }));
  const [tried, setTried] = useState(saveState === 'error');
  const [saved, setSaved] = useState(saveState === 'saved');
  const [effective, setEffective] = useState<Date | null>(addDays(TODAY, 1));
  const narrow = useNarrow(1023);
  const pattern = patterns.find((p) => p.id === patternId) ?? patterns[0];
  const shift = SHIFT_TYPES[kind];
  const copy = copyFrom !== null;
  const people = copy || editingNew ? 0 : shift.people;
  const name = nameVal.trim();
  const night = kind === 'night';
  const split = kind === 'split';
  const set = (patch: Partial<ShiftFields>) => { setF({ ...f, ...patch }); setSaved(false); };
  const formNow = { kind, f, name: nameVal, code: codeVal, breakRule };
  const dirty = !copy && JSON.stringify(formNow) !== JSON.stringify(base);
  const halfDayError = tried && f.halfDay != null && f.fullDay != null && f.halfDay >= f.fullDay ? `Make it less than full day (${f.fullDay} h)` : null;
  const shiftBlocked = halfDayError ? 'Fix the half day threshold first' : !name ? 'Enter a name' : !codeVal.trim() ? 'Enter a code' : !f.start || !f.end ? 'Enter the start and end' : !effective ? 'Pick the effective date' : '';
  const saveShift = () => {
    setTried(true);
    if (f.halfDay != null && f.fullDay != null && f.halfDay >= f.fullDay) return;
    // A saved copy becomes a shift of its own: it leaves the copy state and its type is fixed from now on.
    if (copy || editingNew) {
      setNewShift({ kind, name, code: codeVal.trim(), f, from: effective ?? addDays(TODAY, 1) });
      setEditingNew(true);
      setCopyFrom(null);
    } else {
      setSavedShifts({ ...savedShifts, [kind]: { f, name, code: codeVal.trim(), breakRule } });
    }
    setBase(formNow);
    setSaved(true);
  };
  const discardChanges = () => {
    setKind(base.kind); setF(base.f); setNameVal(base.name); setCodeVal(base.code); setBreakRule(base.breakRule);
    setSaved(false);
    setTried(false);
  };
  const pickKind = (k: ShiftKind) => {
    setKind(k);
    // Only the type's own fields change; thresholds, grace and overtime stay as the user set them.
    const base = fieldsOf(k);
    setF({ ...f, start: base.start, end: base.end });
    if (k === 'split') setBreakRule('none');
  };
  const duplicate = () => {
    setCopyFrom({ kind, name: nameVal, code: codeVal, f, isNew: editingNew });
    setNameVal(`${name} (copy)`);
    setCodeVal('');
    setEditingNew(false);
    setSaved(false);
    setTried(false);
  };
  const discardCopy = () => {
    if (copyFrom) { setKind(copyFrom.kind); setF(copyFrom.f); setNameVal(copyFrom.name); setCodeVal(copyFrom.code); setEditingNew(copyFrom.isNew); }
    setCopyFrom(null);
    setSaved(false);
  };
  /** Opens another shift from the list (or the saved copy). */
  const openShift = (k: ShiftKind | 'new') => {
    const s = k === 'new' ? newShift : null;
    const nk = s ? s.kind : (k as ShiftKind);
    const kept = s ? null : savedShifts[nk];
    const next = {
      kind: nk,
      f: s ? s.f : kept ? kept.f : fieldsOf(nk),
      name: s ? s.name : kept ? kept.name : SHIFT_TYPES[nk].name,
      code: s ? s.code : kept ? kept.code : SHIFT_TYPES[nk].code,
      breakRule: kept ? kept.breakRule : ((nk === 'split' ? 'none' : 'fixed') as BreakRule),
    };
    setKind(next.kind);
    setF(next.f);
    setNameVal(next.name);
    setCodeVal(next.code);
    setBreakRule(next.breakRule);
    setBase(next);
    setEditingNew(!!s);
    if (s) setEffective(s.from);
    setCopyFrom(null);
    setSaved(false);
    setTried(false);
  };
  const preview = previewOf(kind, f, breakRule);
  const previewRows = preview.rows;
  const previewNote = preview.note;
  const onPatterns = t === 'patterns';
  const patternStarted = pattern.start.getTime() <= TODAY.getTime() && pattern.people > 0;
  const patternBlocked = !pattern.name.trim() ? 'Enter a pattern name' : !pattern.group ? 'Choose who it applies to' : '';
  const updatePattern = (patch: Partial<Pattern>) => { setPatterns(patterns.map((p) => (p.id === pattern.id ? { ...p, ...patch } : p))); setPatternSaved(null); };
  const addPattern = () => {
    const id = `new${patterns.length}`;
    setPatterns([...patterns, { id, name: '', weekly: true, cycle: Array(7).fill('OFF'), group: '', people: 0, start: WEEK, draft: true }]);
    setPatternId(id);
    setPatternSaved(null);
  };
  const removePattern = (id: string) => {
    const rest = patterns.filter((p) => p.id !== id);
    setPatterns(rest);
    if (id === pattern.id) setPatternId(rest[0]?.id ?? '');
    setPatternSaved(null);
  };
  const savePattern = () => {
    // A group follows one pattern: the one saved here takes it over from any other.
    const moved = patterns.find((p) => p.id !== pattern.id && p.group === pattern.group);
    setPatterns(patterns.map((p) => (p.id === pattern.id ? { ...p, draft: false } : moved && p.id === moved.id ? { ...p, group: '', people: 0 } : p)));
    setPatternSaved(`Saved ${pattern.name}${patternStarted ? ` · applies from ${longDate(pattern.effective ?? addDays(TODAY, 1))}` : ''}${moved ? ` · ${pattern.group} moved from ${moved.name}` : ''}`);
  };
  const used = onPatterns ? pattern.people : people;
  const previewCard = (
    <Card title="Preview">
      <p className="yx-tim-muted">{preview.text}</p>
      <ShiftBar
        start={f.start ?? shift.start}
        end={(split ? f.part2To : f.end) ?? shift.end}
        parts={split ? [[f.start ?? '07:00', f.end ?? '11:00'], [f.part2From ?? '17:00', f.part2To ?? '21:00']] : undefined} from={night ? 18 * 60 : 6 * 60} to={night ? 32 * 60 : 23 * 60} punches={preview.punches} />
      <ul className="yx-tim-days">
        {previewRows.map(([k, v]) => <li key={k}><span>{k}</span><strong>{v}</strong></li>)}
      </ul>
      {previewNote && <p className="yx-tim-note">{previewNote}</p>}
    </Card>
  );
  return (
    <TimePage active="Shifts & patterns" user={HR_ADMIN}>
      <PageHeader
        title={onPatterns ? pattern.name || 'New pattern' : name ? `${name} shift` : 'New shift'}
        description={`Time › Time settings › Shifts & patterns · ${used ? `used by ${used} people` : 'not used yet'}`}
        status={
          onPatterns
            ? patternStarted ? <Badge tone="success">Active</Badge> : <span className="yx-tim-row"><Badge tone="neutral">Starts {shortDate(pattern.start)}</Badge><DueBadge date={pattern.start} /></span>
            : copy ? <Badge tone="neutral">Not saved yet</Badge>
              : editingNew && newShift ? <span className="yx-tim-row"><Badge tone="neutral">Starts {shortDate(newShift.from)}</Badge><DueBadge date={newShift.from} /></span>
                : <Badge tone="success">Active</Badge>
        }
        actions={
          onPatterns ? (
            <span className="yx-tim-row">{patternBlocked && <span className="yx-tim-muted">{patternBlocked}</span>}<Button variant="primary" disabled={!!patternBlocked} onClick={savePattern}>Save pattern</Button></span>
          ) : (
            <span className="yx-tim-row">
              {copy
                ? <Button onClick={discardCopy}>Discard copy</Button>
                : <Button icon={Copy} onClick={duplicate}>Duplicate</Button>}
              {shiftBlocked && <span className="yx-tim-muted">{shiftBlocked}</span>}
              <Button variant="primary" disabled={!!shiftBlocked} onClick={saveShift}>Save shift</Button>
            </span>
          )
        }
      />
      {halfDayError && !onPatterns && (
        <InlineAlert tone="danger" title="Fix 1 thing to save" actions={<Button size="sm" onClick={() => document.getElementById('half-day')?.focus()}>Go to field</Button>}>
          Half day from ({f.halfDay} h) is not less than full day from ({f.fullDay} h).
        </InlineAlert>
      )}
      {saved && !onPatterns && effective && (
        <InlineAlert tone="success" title={`Saved · applies from ${longDate(effective)}`}>
          {people ? `Applies to the ${people} people on this shift from ${longDate(effective)}. Earlier days keep the old rules.` : `${name} is in the shift list and can be used from ${longDate(effective)}.`}
        </InlineAlert>
      )}
      {patternSaved && onPatterns && <InlineAlert tone="success" title={patternSaved} />}
      {copy && !saved && !onPatterns && <InlineAlert tone="info" title={`Copy of ${copyFrom.name}`}>No one uses this copy yet, so you can pick its type. Save it to add it to the shift list, or discard it.</InlineAlert>}
      <Tabs value={t} onValueChange={setT}>
        <TabsList aria-label="Shift editor">
          <TabsTrigger value="shift">Shift</TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
        </TabsList>
        <TabsContent value="shift">
          <div className="yx-tim-editor">
            <div className="yx-tim-form">
              <Card title="Shifts">
                <ul className="yx-tim-list">
                  {[...(Object.keys(SHIFT_TYPES) as ShiftKind[]).map((k) => ({ id: k as ShiftKind | 'new', title: savedShifts[k]?.name ?? SHIFT_TYPES[k].name, sub: `${savedShifts[k]?.code ?? SHIFT_TYPES[k].code} ·${SHIFT_TYPES[k].label} · ${SHIFT_TYPES[k].people} people` })),
                    ...(newShift ? [{ id: 'new' as const, title: newShift.name, sub: `${newShift.code} · ${SHIFT_TYPES[newShift.kind].label} · starts ${shortDate(newShift.from)}` }] : [])].map((s) => {
                    const current = !copy && (s.id === 'new' ? editingNew : !editingNew && s.id === kind);
                    return (
                      <li key={s.id}>
                        <span className="yx-tim-list__main" style={{ flex: '1 1 0', minWidth: 0 }}><strong>{s.title}</strong><span className="yx-tim-muted">{s.sub}</span></span>
                        <Button size="sm" disabled={current || copy || dirty} onClick={() => openShift(s.id)}>{current ? 'Editing' : 'Edit'}</Button>
                      </li>
                    );
                  })}
                  {dirty && <li><span className="yx-tim-muted" style={{ flex: '1 1 0', minWidth: 0 }}>Save or discard your changes first</span><Button size="sm" onClick={discardChanges}>Discard changes</Button></li>}
                  {copy && <li><span className="yx-tim-list__main" style={{ flex: '1 1 0', minWidth: 0 }}><strong>{name || 'New shift'}</strong><span className="yx-tim-muted">Copy · not saved. Save or discard it to open another shift.</span></span><Button size="sm" disabled>Editing</Button></li>}
                </ul>
              </Card>
              <FormSection title="Basics">
                <FieldRow>
                  <FormField label="Name" required><TextField value={nameVal} onChange={(v) => { setNameVal(v); setSaved(false); }} /></FormField>
                  <FormField label="Code" required><TextField value={codeVal} placeholder="For example GC" onChange={(v) => { setCodeVal(v); setSaved(false); }} /></FormField>
                </FieldRow>
                <FormField label="Type" helper={copy ? 'Pick the type for the new shift.' : editingNew ? 'Type is fixed once the shift is saved. Duplicate it to make a shift of another type.' : `Type can't change while ${people} people use this shift. Duplicate it to make a shift of another type.`}>
                  <RadioGroup aria-label="Type" value={kind} disabled={!copy} onChange={(v) => pickKind(v as ShiftKind)} orientation="horizontal" options={(Object.keys(SHIFT_TYPES) as ShiftKind[]).map((k) => ({ value: k, label: SHIFT_TYPES[k].label }))} />
                </FormField>
                <FieldRow>
                  <FormField label={split ? 'First part from' : 'Start'} required><TimeField value={f.start} onChange={(v) => set({ start: v })} /></FormField>
                  <FormField label={split ? 'First part to' : 'End'} required helper={night ? 'Ends next day; the day belongs to the start date' : undefined}><TimeField value={f.end} onChange={(v) => set({ end: v })} /></FormField>
                </FieldRow>
                {kind === 'flexi' && <FieldRow><FormField label="Core from"><TimeField value={f.coreFrom} onChange={(v) => set({ coreFrom: v })} /></FormField><FormField label="Core to"><TimeField value={f.coreTo} onChange={(v) => set({ coreTo: v })} /></FormField></FieldRow>}
                {split && <FieldRow><FormField label="Second part from"><TimeField value={f.part2From} onChange={(v) => set({ part2From: v })} /></FormField><FormField label="Second part to"><TimeField value={f.part2To} onChange={(v) => set({ part2To: v })} /></FormField></FieldRow>}
              </FormSection>
              {narrow && previewCard}
              <FormSection title="Check-in and grace">
                <FieldRow>
                  <FormField label="Check-in opens (min before start)"><NumberField value={f.checkIn} min={0} onChange={(v) => set({ checkIn: v })} /></FormField>
                  <FormField label="Late grace (min)"><NumberField value={f.late} min={0} onChange={(v) => set({ late: v })} /></FormField>
                  <FormField label="Early-leave grace (min)"><NumberField value={f.early} min={0} onChange={(v) => set({ early: v })} /></FormField>
                </FieldRow>
              </FormSection>
              <FormSection title="Break rule">
                <RadioGroup aria-label="Break rule" value={breakRule} onChange={(v) => { setBreakRule(v as BreakRule); setSaved(false); }} options={[{ value: 'fixed', label: 'Fixed unpaid break', description: '30 min deducted when worked time is above 5 h' }, { value: 'punch', label: 'Punch-based breaks' }, { value: 'none', label: 'No break' }]} />
              </FormSection>
              <FormSection title="Day thresholds">
                <FieldRow>
                  <FormField label="Full day from (h)"><NumberField value={f.fullDay} min={0} max={24} decimals onChange={(v) => set({ fullDay: v })} /></FormField>
                  <FormField label="Half day from (h)" id="half-day" error={halfDayError}><NumberField value={f.halfDay} min={0} max={24} decimals onChange={(v) => set({ halfDay: v })} /></FormField>
                </FieldRow>
                <p className="yx-tim-note">{f.halfDay != null ? `Under ${f.halfDay} h worked counts as absent. ` : ''}A missing punch shows as "Missing check-out".</p>
              </FormSection>
              <FormSection title="Overtime">
                <FieldRow>
                  <FormField label="Minimum (min)"><NumberField value={f.otMin} min={0} onChange={(v) => set({ otMin: v })} /></FormField>
                  <FormField label="Round down to (min)"><NumberField value={f.otRound} min={0} onChange={(v) => set({ otRound: v })} /></FormField>
                </FieldRow>
                {kind === 'flexi' && <FormField label="Overtime after (h worked)" helper="Flexi shifts have no fixed end, so overtime counts from hours worked"><NumberField value={f.flexiOt} min={0} max={24} decimals onChange={(v) => set({ flexiOt: v })} /></FormField>}
                <Switch label="Needs pre-approval" description="Off: approved after the fact (default)" defaultChecked={false} />
                <Switch label="Allow comp-off instead of pay" defaultChecked />
              </FormSection>
              <FormSection title="Allowances">
                <Switch label="Night allowance" description={night ? '₹150 per night shift, feeds payroll' : 'Allowance only for shifts overlapping 10 pm – 6 am'} defaultChecked={night} />
                {night && <InlineAlert tone="info" title="Night window for women (law)">In Tamil Nadu the legal night window is 7 pm – 6 am. Women can be rostered on this shift only with written consent and a valid safeguards checklist. The allowance window above is for pay only; consent checks always use 7 pm – 6 am.</InlineAlert>}
              </FormSection>
              <FormSection title="When it applies">
                <FormField label="Effective from" required helper={people ? `Changes apply to the ${people} people on this shift from this date. Earlier days keep the old rules.` : 'The shift can be used from this date.'}>
                  <DatePicker value={effective} min={addDays(TODAY, 1)} onChange={(d) => { setEffective(d); setSaved(false); }} />
                </FormField>
              </FormSection>
            </div>
            {!narrow && <div className="yx-tim-sticky">{previewCard}</div>}
          </div>
        </TabsContent>
        <TabsContent value="patterns"><PatternsPanel patterns={patterns} pattern={pattern} started={patternStarted} onPick={(id) => { setPatternId(id); setPatternSaved(null); }} onAdd={addPattern} onRemove={removePattern} onUpdate={updatePattern} /></TabsContent>
      </Tabs>
    </TimePage>
  );
}

const CYCLE_CODES = ['M', 'E', 'N', 'G', 'OFF'];
const codeName = (c: string) => (c === 'OFF' ? 'weekly off' : shiftOf(c)?.name ?? c);
const posMod = (n: number, m: number) => ((n % m) + m) % m;

function PatternsPanel({ patterns, pattern, started, onPick, onAdd, onRemove, onUpdate }: { patterns: Pattern[]; pattern: Pattern; started: boolean; onPick: (id: string) => void; onAdd: () => void; onRemove: (id: string) => void; onUpdate: (patch: Partial<Pattern>) => void }) {
  const { cycle, weekly: isWeekly } = pattern;
  const setCycle = (c: string[]) => onUpdate({ cycle: c });
  // A pattern in use changes from its effective date: the preview opens a few days before it (not before tomorrow), keeps the saved cycle
  // up to that date and shows the edited one from it. A pattern not started yet opens on its start date.
  const saved = PATTERNS.find((p) => p.id === pattern.id);
  const eff = started ? pattern.effective ?? addDays(TODAY, 1) : null;
  const tomorrow = addDays(TODAY, 1);
  const from = eff ? (addDays(eff, -4).getTime() > tomorrow.getTime() ? addDays(eff, -4) : tomorrow) : pattern.start;
  const length = Math.max(14, cycle.length);
  const codeOn = (d: Date) => {
    const old = eff && saved && d.getTime() < eff.getTime();
    const c = old ? saved.cycle : cycle;
    return (old ? saved.weekly : isWeekly) ? c[(d.getDay() + 6) % 7] : c[posMod(Math.round((d.getTime() - pattern.start.getTime()) / 86400000), c.length)];
  };
  const days = Array.from({ length }, (_, i) => addDays(from, i));
  const dayLabel = (i: number) => (isWeekly ? DAYS[i].slice(0, 3) : `Day ${i + 1}`);
  const lost = isWeekly && pattern.prevCycle && pattern.prevCycle.length > 7 ? pattern.prevCycle.length : 0;
  const other = pattern.group ? patterns.find((p) => p.id !== pattern.id && p.group === pattern.group) : undefined;
  return (
    <div className="yx-tim-editor">
      <div className="yx-tim-form">
        <Card title="Patterns" actions={<Button size="sm" icon={Plus} onClick={onAdd}>Add pattern</Button>}>
          <ul className="yx-tim-list">
            {patterns.map((p) => (
              <li key={p.id}>
                {/* Only the text wraps; the buttons keep their place on the right on every row. */}
                <span className="yx-tim-list__main" style={{ flex: '1 1 0', minWidth: 0 }}><strong>{p.name || 'New pattern'}</strong><span className="yx-tim-muted">{p.weekly ? 'Weekly' : `${p.cycle.length}-day cycle`} · {p.group || 'Not assigned yet'} · {p.people} people{p.draft ? ' · not saved' : ''}</span></span>
                <span className="yx-tim-row" style={{ flexShrink: 0, justifyContent: 'flex-end' }}>
                  <Button size="sm" onClick={() => onPick(p.id)} disabled={p.id === pattern.id}>{p.id === pattern.id ? 'Editing' : 'Edit'}</Button>
                  {(p.draft || p.people === 0) && patterns.length > 1 && <Button size="sm" icon={Trash2} onClick={() => onRemove(p.id)}>{p.draft ? 'Discard' : 'Delete'}</Button>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <FormField label="Pattern name" required><TextField value={pattern.name} placeholder="For example 4 on / 2 off · Evening" onChange={(v) => onUpdate({ name: v })} /></FormField>
        <FormField label="Repeat" helper={lost ? `Weekly keeps the first 7 days. Switch back to N-day cycle to get all ${lost} days back; your changes to the first 7 days stay.` : undefined}>
          <RadioGroup
            aria-label="Repeat"
            value={isWeekly ? 'week' : 'cycle'}
            onChange={(v) => (v === 'week'
              ? onUpdate({ weekly: true, prevCycle: cycle, cycle: [...cycle, ...Array(7).fill('OFF')].slice(0, 7) })
              // Edits made while Weekly carry over into the first 7 days of the cycle.
              : onUpdate({ weekly: false, cycle: pattern.prevCycle ? pattern.prevCycle.map((x, i) => (i < 7 ? cycle[i] : x)) : cycle, prevCycle: undefined }))}
            orientation="horizontal"
            options={[{ value: 'week', label: 'Weekly' }, { value: 'cycle', label: 'N-day cycle' }]}
          />
        </FormField>
        <FormField label={isWeekly ? 'Week (Mon to Sun)' : `Cycle (${cycle.length} days)`} helper="Click a day and pick its shift, or OFF for a weekly off.">
          <div className="yx-tim-stack">
            {Array.from({ length: Math.ceil(cycle.length / 7) }, (_, w) => (
              <div key={w} className="yx-tim-row" role="group" aria-label={isWeekly ? 'Week' : `Week ${w + 1} of the cycle`}>
                {cycle.slice(w * 7, w * 7 + 7).map((c, j) => {
                  const i = w * 7 + j;
                  return (
                    <Menu key={i}>
                      <MenuTrigger asChild>
                        <Button size="sm" aria-label={`${dayLabel(i)}: ${codeName(c)}. Change`}>{isWeekly ? dayLabel(i) : i + 1} · {c}</Button>
                      </MenuTrigger>
                      <MenuContent align="start">
                        {CYCLE_CODES.map((code) => {
                          const s = shiftOf(code);
                          return <MenuItem key={code} shortcut={code} onSelect={() => setCycle(cycle.map((x, k) => (k === i ? code : x)))}>{code === 'OFF' ? 'Weekly off' : `${s?.name} ${s ? shiftTimes(s) : ''}`}</MenuItem>;
                        })}
                      </MenuContent>
                    </Menu>
                  );
                })}
              </div>
            ))}
            <p className="yx-tim-note">{CYCLE_CODES.map((c) => { const s = shiftOf(c); return c === 'OFF' || !s ? `${c} weekly off` : `${c} ${s.name} ${shiftTimes(s)}`; }).join(' · ')}</p>
            {!isWeekly && (
              <div className="yx-tim-row">
                <Button size="sm" icon={Plus} onClick={() => setCycle([...cycle, 'OFF'])}>Day</Button>
                <Button size="sm" icon={Trash2} disabled={cycle.length <= 2} onClick={() => setCycle(cycle.slice(0, -1))}>Remove day {cycle.length}</Button>
              </div>
            )}
          </div>
        </FormField>
        <FieldRow>
          {started ? (
            // A pattern in use keeps its start, so past days don't move; edits take effect from a future date.
            <FormField label="Effective from" required helper={`Started ${longDate(pattern.start)}. Changes the roster for the ${pattern.people} people from this date. Earlier days stay.`}>
              <DatePicker value={pattern.effective ?? addDays(TODAY, 1)} min={addDays(TODAY, 1)} onChange={(d) => onUpdate({ effective: d ?? undefined })} />
            </FormField>
          ) : (
            <FormField label="Starts on" required helper={isWeekly ? 'Days follow the weekday, whatever the start date' : 'Day 1 of the cycle falls on this date'}><DatePicker value={pattern.start} min={TODAY} onChange={(d) => d && onUpdate({ start: d })} /></FormField>
          )}
          <FormField label="Assign to" required helper={other ? `${pattern.group} moves from ${other.name} to this pattern when you save.` : undefined}>
            <Select value={pattern.group || null} placeholder="Choose a group" onChange={(v) => onUpdate({ group: v ?? '', people: v ? GROUP_PEOPLE[v] ?? 0 : 0 })} options={GROUPS.map((g) => ({ value: g, label: g }))} />
          </FormField>
        </FieldRow>
      </div>
      <Card title={`${length === 14 ? '14 days' : `One full cycle (${length} days)`} from ${dayName(from)}${eff ? ` · your edits apply from ${shortDate(eff)}` : ''}`}>
        <ul className="yx-tim-days">
          {days.map((d, i) => {
            // Weekly patterns follow the weekday (Mon = first day); cycles count days from the start date.
            const s = shiftOf(codeOn(d));
            const firstNew = eff && d.getTime() === eff.getTime();
            return <li key={i}><span className="yx-tim-row">{dayName(d)}{firstNew && <Badge tone="info">Changes from here</Badge>}</span><strong>{!s?.start ? 'Off' : `${s.name} ${shiftTimes(s)}`}</strong></li>;
          })}
        </ul>
      </Card>
    </div>
  );
}

/* =====================================================================
   TIM-34 · Auto-roster (demand editor, generated draft, coverage, explanations, publish)
   ===================================================================== */

interface DemandRow { slot: string; role: string; need: number[]; got: number[]; override?: Record<number, string> }
const DEMAND: DemandRow[] = [
  // Sat 10 Oct has a festival-sale override: 3 + 1 morning operators.
  { slot: 'Morning', role: 'Line operator', need: [4, 4, 4, 4, 4, 4, 3], got: [4, 4, 3, 4, 4, 4, 3], override: { 5: 'Festival sale: 3 + 1' } },
  { slot: 'Evening', role: 'Line operator', need: [3, 3, 3, 3, 3, 2, 2], got: [3, 3, 3, 3, 3, 2, 2] },
  { slot: 'Night', role: 'Line operator', need: [2, 2, 2, 2, 2, 2, 2], got: [2, 2, 1, 2, 2, 2, 1] },
  { slot: 'General', role: 'Quality inspector', need: [1, 1, 1, 1, 1, 0, 0], got: [1, 1, 1, 1, 1, 0, 0] },
];
const RUN_PEOPLE = 42;
/** Wed 7 Oct among the 18 trained Line 2 operators: one leave count and one 48 h count, used by the list and the drawer. */
const WED = { leave: 1, over48: 2 };
/** Why each short cell is short; every short cell in DEMAND needs a line here. */
const SHORT_REASON: Record<string, string> = {
  'Morning:2': `${WED.leave} trained operator (not in the ${PLANT_PEOPLE.length} shown) is on approved leave, and the ${WED.over48} who are free would pass 48 h this week.`,
  'Night:2': 'Every operator who could take it works Wednesday or early Thursday, is on leave, would pass 48 h, or has no night-work consent.',
  'Night:6': 'Kavitha Sundaram is assigned. The other operators with night consent work Sunday morning, which leaves 8 h rest before 10 pm.',
};
/** Who was checked for Wed 7 night; the counts add up to the 18 trained operators. */
const WED_NIGHT: [string, string][] = [
  ['3 people', 'Work Wed morning (6 am – 2 pm): only 8 h rest before 10 pm. Rekha Balan is one, and also has no night-work consent.'],
  ['3 people', 'Already on Wed evening (2 pm – 10 pm)'],
  ['4 people', 'Work Thu morning from 6 am: no rest after a night that ends at 6 am'],
  ['4 people', 'Off that day, but have no night-work consent'],
  [`${WED.over48} people`, 'Would pass 48 h this week'],
  [`${WED.leave} person`, 'On approved leave'],
  ['1 person', 'Assigned (Kavitha Sundaram)'],
];
const cellsOf = (rows: DemandRow[]) => rows.flatMap((r) => r.need.map((n, i) => ({ row: r, day: i, need: n, got: r.got[i], key: `${r.slot}:${i}` })));
type DemandCell = ReturnType<typeof cellsOf>[number];
/** A short slot that was already offered on TIM-35 (Wed 7 Oct morning and night), so it isn't offered twice. */
const offeredOf = (c: DemandCell) => OPEN.find((o) => o.date.getTime() === addDays(WEEK, c.day).getTime() && o.slot.startsWith(c.row.slot) && o.skill === c.row.role);
const slotName = (c: DemandCell) => `${DAYS[c.day]} Oct ${c.row.slot.toLowerCase()}`;
/** Nights per person, worked out from the draft grid. */
const NIGHTS = PLANT_PEOPLE.map((p) => ({ name: p.name, n: (PUBLISHED_ROSTER[p.id] ?? []).filter((c) => c === 'N').length })).filter((x) => x.n > 0);
const NIGHTS_MIN = Math.min(...NIGHTS.map((x) => x.n));
const NIGHTS_MAX = Math.max(...NIGHTS.map((x) => x.n));

/** Two-column fact list with a fixed label width, so the reasons line up. */
function FactList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <ul className="yx-tim-days">
      {rows.map(([k, v], i) => (
        <li key={i} style={{ justifyContent: 'flex-start' }}>
          <span style={{ flex: '0 0 calc(var(--yx-space-16) * 1.5)', whiteSpace: 'nowrap' }}>{k}</span>
          <span style={{ flex: '1 1 0', textAlign: 'left' }}>{v}</span>
        </li>
      ))}
    </ul>
  );
}

export function AutoRosterScreen({ step = 'draft', explainOpen = false, approved: approvedProp = false }: { step?: 'demand' | 'draft' | 'running'; explainOpen?: boolean; approved?: boolean }) {
  const [tab, setTab] = useState(step === 'demand' ? 'demand' : 'draft');
  const [explain, setExplain] = useState<string | null>(explainOpen ? 'Night:2' : null);
  const [approved, setApproved] = useState(approvedProp);
  const [pub, setPub] = useState(false);
  const [published, setPublished] = useState(false);
  const [running, setRunning] = useState(step === 'running');
  const [rerun, setRerun] = useState(false);
  const [ai, setAi] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const narrow = useNarrow();
  // Demand being edited, and the demand the last run used (coverage follows the run, not the unsaved edits).
  const [need, setNeed] = useState(() => DEMAND.map((r) => r.need));
  const [usedNeed, setUsedNeed] = useState(need);
  const demandChanged = need.some((r, i) => r.some((n, j) => n !== usedNeed[i][j]));
  const demandEdited = usedNeed.some((r, i) => r.some((n, j) => n !== DEMAND[i].need[j]));
  const demand = DEMAND.map((r, i) => ({ ...r, need: usedNeed[i] }));
  const cells = cellsOf(demand);
  const short = cells.filter((c) => c.got < c.need);
  const toOffer = short.filter((c) => !offeredOf(c));
  const total = cells.reduce((a, c) => a + c.need, 0);
  const filled = cells.reduce((a, c) => a + Math.min(c.got, c.need), 0);
  const over = cells.filter((c) => c.got > c.need).length;
  const open = cells.find((c) => c.key === explain);
  const run = () => {
    setUsedNeed(need);
    setCsv(null);
    setApproved(false);
    setPublished(false);
    setRunning(true);
    window.setTimeout(() => setRunning(false), 1500);
  };
  const stateWord = published ? 'Published roster' : approved ? 'Approved draft' : 'Draft';
  const offeredText = (c: DemandCell) => {
    const o = offeredOf(c);
    return o ? `Already an open shift · ${o.claims.length ? `${o.claims.length} ${o.claims.length === 1 ? 'claim' : 'claims'} (${o.claims.map((x) => x.name).join(', ')})` : 'no claims yet'}` : '';
  };
  const covCols: TableColumn<DemandRow>[] = [
    { key: 'slot', header: 'Slot', width: 140, value: (r) => `${r.slot} · ${r.role}`, render: (r) => <span className="yx-tim-list__main" style={{ flex: 'none' }}><strong>{r.slot}</strong><span className="yx-tim-muted">{r.role}</span></span> },
    ...DAYS.map((d, i): TableColumn<DemandRow> => ({
      key: d,
      header: d,
      width: 84,
      value: (r) => `${r.got[i]}/${r.need[i]}`,
      render: (r) => {
        const g = r.got[i];
        const n = r.need[i];
        const s = g < n ? 'short' : g > n ? 'over' : 'ok';
        const label = `${r.slot} ${d}: ${g} of ${n}${s === 'short' ? ', short' : s === 'over' ? ', over-staffed' : ''}`;
        return s === 'short' ? (
          // The chip itself is the button, so short cells line up with the plain chips.
          <button type="button" className="yx-tim-cov" data-state={s} style={{ border: 0, font: 'inherit', fontWeight: 'var(--yx-weight-medium)', cursor: 'pointer' }} onClick={() => setExplain(`${r.slot}:${i}`)} aria-label={`${label}. Explain`}>{g}/{n}</button>
        ) : <span className="yx-tim-cov" data-state={s} aria-label={label}>{g}/{n}</span>;
      },
    })),
  ];
  const blockedReason = running ? 'Wait for the run to finish' : published ? 'Published · change it on the roster' : '';
  // Approve and Publish wait until the draft uses the demand on screen.
  const approveBlocked = running ? '' : demandChanged ? 'Run again to use the new demand' : '';
  // Sat 10 Oct morning: the usual 3, raised for the festival sale. The marker follows the number on screen.
  const sale = need[0][5];
  const demandInput = (ri: number, i: number, n: number, r: DemandRow) => (
    <input
      className="yx-tim-numcell"
      type="number"
      min={0}
      value={n}
      // A visible input border, so the numbers read as editable.
      style={{ border: 'var(--yx-border-width) solid var(--yx-color-border-strong)', borderRadius: 'var(--yx-radius-control)', background: 'var(--yx-color-bg-surface)' }}
      onChange={(e) => {
        const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
        setNeed(need.map((row, a) => (a === ri ? row.map((x, b) => (b === i ? v : x)) : row)));
      }}
      aria-label={`${r.slot} ${r.role} ${DAYS[i]} Oct`}
    />
  );
  const rerunAction = () => (approved ? setRerun(true) : run());
  const claimAction = (c: DemandCell) => {
    const o = offeredOf(c);
    return o ? (
      <Button size="sm" variant={o.claims.length ? 'review' : undefined} asChild><a href={storyHref(STORY.openShifts)} target="_top">{o.claims.length ? 'Pick from claims' : 'View open shift'}</a></Button>
    ) : published ? (
      <Badge tone="neutral">Sent as open shift</Badge>
    ) : (
      <Button size="sm" asChild><a href={storyHref(STORY.openShifts)} target="_top">Publish as open shift</a></Button>
    );
  };
  const coverage = <DataTable label="Coverage: filled of required" toolbar={<strong>Coverage: filled of required</strong>} columns={covCols} rows={demand} getRowId={(r) => r.slot + r.role} />;
  return (
    <TimePage active="Roster" user={PLANT_MANAGER}>
      <PageHeader
        title="Auto-roster · Hosur plant"
        description="Week of 5 Oct 2026 · Rules: plant default · run 29 Sep, 9:30 am"
        status={running ? <Badge tone="neutral">Generating</Badge> : <Badge tone={published || approved ? 'success' : 'warning'}>{published ? 'Published 29 Sep' : approved ? 'Approved · ready to publish' : 'Draft'}</Badge>}
        actions={
          <div className="yx-tim-row">
            {(blockedReason || approveBlocked) && <span className="yx-tim-muted">{blockedReason || approveBlocked}</span>}
            <Button icon={Play} disabled={!!blockedReason} onClick={rerunAction}>Run again</Button>
            {!published && (approved
              ? <Button variant="primary" icon={Send} disabled={running || !!approveBlocked} onClick={() => setPub(true)}>Publish roster</Button>
              : <Button variant="approve" disabled={running || !!approveBlocked} onClick={() => setApproved(true)}>Approve draft</Button>)}
          </div>
        }
      />
      {published && (
        <InlineAlert tone="success" title={`Published · ${RUN_PEOPLE} people notified`} actions={<Button size="sm" asChild><a href={storyHref(STORY.openShifts)} target="_top">Open open shifts</a></Button>}>
          {toOffer.length ? `Went out as open shifts: ${toOffer.map(slotName).join(', ')}.` : 'No new open shifts.'}
          {short.length > toOffer.length && ` Already open: ${short.filter((c) => offeredOf(c)).map(slotName).join(', ')}.`}
        </InlineAlert>
      )}
      {running ? (
        <div className="yx-tim-stack" aria-live="polite"><p>Generating the roster for {RUN_PEOPLE} people and {total} slots…</p><LoadingBlock rows={6} /></div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Auto-roster">
            <TabsTrigger value="demand">Demand</TabsTrigger>
            <TabsTrigger value="draft">Coverage and draft</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>
          <TabsContent value="demand">
            <div className="yx-tim-stack">
              <p className="yx-tim-muted">People needed for each shift, each day. Change a number, then use Run again at the top.</p>
              {narrow ? (
                // Phones: one card per slot with the seven days in a wrapping row, so nothing scrolls sideways.
                <ul className="yx-tim-list">
                  {DEMAND.map((r, ri) => (
                    <li key={r.slot + r.role}>
                      <span className="yx-tim-list__main" style={{ flex: '1 1 100%', minWidth: 0 }}>
                        <strong>{r.slot} · {r.role}</strong>
                        <span className="yx-tim-row">
                          {need[ri].map((n, i) => (
                            <label key={i} className="yx-tim-stack" style={{ gap: 'var(--yx-space-1)', alignItems: 'center' }}>
                              <span className="yx-tim-note">{DAYS[i]}{ri === 0 && i === 5 && sale !== 3 ? ' · Sale' : ''}</span>
                              {demandInput(ri, i, n, r)}
                            </label>
                          ))}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="yx-tim-muster" tabIndex={0} role="region" aria-label="Staffing demand table">
                  <table aria-label="Staffing demand">
                    <thead><tr><th scope="col">Slot</th><th scope="col">Skill</th>{DAYS.map((d) => <th key={d} scope="col">{d}</th>)}</tr></thead>
                    <tbody>
                      {DEMAND.map((r, ri) => (
                        <tr key={r.slot + r.role}>
                          <th scope="row">{r.slot}</th><td className="yx-tim-muster__total">{r.role}</td>
                          {need[ri].map((n, i) => (
                            <td key={i} style={{ padding: 'var(--yx-space-1)' }}>
                              {demandInput(ri, i, n, r)}
                              {ri === 0 && i === 5 && sale !== 3 && <span className="yx-tim-cell__mark" title={`Festival sale: morning 3 → ${sale}`}> Sale</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="yx-tim-row">
                <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => setCsv(e.target.files?.[0]?.name ?? null)} />
                <Button onClick={() => fileRef.current?.click()}>Import forecast (CSV)</Button>
                {csv && <span className="yx-tim-muted">{csv} chosen · run again to use it</span>}
                {demandChanged && <span className="yx-tim-muted">Changed · use Run again at the top to use the new demand</span>}
                {sale !== 3 && <Badge tone="neutral">Sat 10 Oct festival sale: morning 3 → {sale}</Badge>}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="draft">
            <div className="yx-tim-stack">
              <Kpis items={[{ label: 'Slots filled', value: `${filled} of ${total}` }, { label: 'Unfilled', value: total - filled }, ...(over ? [{ label: 'Over-staffed', value: over }] : []), { label: 'OT hours', value: 6 }, { label: 'Nights per person', value: `${NIGHTS_MIN}–${NIGHTS_MAX}`, note: `Most: ${NIGHTS.find((x) => x.n === NIGHTS_MAX)?.name} (${NIGHTS_MAX})` }]} />
              {/* On phones the slots that need action come before the long coverage list. */}
              {!narrow && coverage}
              {short.length > 0 && (
                <Card title="Why slots are unfilled">
                  <ul className="yx-tim-list">
                    {short.map((c) => {
                      const o = offeredOf(c);
                      return (
                        <li key={c.key}>
                          <span className="yx-tim-list__main">
                            <strong>{DAYS[c.day]} Oct · {c.row.slot} · {c.need - c.got} {c.row.role.toLowerCase()} short</strong>
                            <span className="yx-tim-muted">{SHORT_REASON[c.key] ?? 'Not enough trained people are free once rest, leave and hour rules are applied.'}</span>
                            {o && <span className="yx-tim-muted">{offeredText(c)}</span>}
                          </span>
                          <span className="yx-tim-row">
                            <Button size="sm" onClick={() => setExplain(c.key)}>Explain</Button>
                            {claimAction(c)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
              {narrow && coverage}
              <p className="yx-tim-muted">{stateWord} for Line 2, showing {PLANT_PEOPLE.length} of {RUN_PEOPLE} people. Coverage counts line operators and quality inspectors only.</p>
              {demandEdited && <p className="yx-tim-note">Prototype: only coverage follows the new demand. The grid, OT hours and nights per person stay as in the first run.</p>}
              <RosterGrid people={PLANT_PEOPLE} start={WEEK} shifts={PLANT_SHIFTS} defaultValue={PUBLISHED_ROSTER} leave={PLANT_LEAVE} rules={PLANT_RULES} status={published ? 'published' : 'draft'} hideStatus readOnly />
              <Legend />
            </div>
          </TabsContent>
          <TabsContent value="rules">
            <Card title="Hard constraints (never broken)">
              <ul className="yx-tim-check">
                {['Valid skill and certification on the date', 'Declared unavailability (hard)', 'Approved and pending leave, holidays, weekly offs', 'Minimum rest 11 h (law floor)', 'Hour and OT caps: 48 h a week, 75 h OT a quarter', 'One shift at a time', "Women's night-shift consent and safeguards (law)", 'Required licences valid'].map((t) => <li key={t}><span>{t}</span><Badge tone="neutral">Hard</Badge></li>)}
              </ul>
            </Card>
            <Card title="Soft goals (weights)">
              <ul className="yx-tim-check">
                <li><span>Fairness: nights, weekends, holidays over 8 weeks</span><Badge tone="info">40%</Badge></li>
                <li><span>Preferences and bids</span><Badge tone="info">25%</Badge></li>
                <li><span>Continuity</span><Badge tone="info">15%</Badge></li>
                <li><span>Cost (fewer OT hours)</span><Badge tone="info">20%</Badge></li>
              </ul>
            </Card>
          </TabsContent>
        </Tabs>
      )}
      <Drawer open={!!open} onOpenChange={(o) => !o && setExplain(null)} title={open ? `${DAYS[open.day]} Oct · ${open.row.slot} · ${open.row.role.toLowerCase()}` : ''} subtitle={open ? `${open.got} of ${open.need} filled` : undefined}>
        {open && (
          <div className="yx-tim-stack">
            <p>{SHORT_REASON[open.key] ?? (open.got < open.need ? 'Not enough trained people are free once rest, leave and hour rules are applied.' : '')}</p>
            {offeredOf(open) && <p className="yx-tim-muted">{offeredText(open)}</p>}
            {open.key === 'Night:2' && (
              <>
                <p>Checked 18 trained operators:</p>
                <FactList rows={WED_NIGHT} />
                <Card title={<span className="yx-tim-row">Plain-words summary <AiBadge /></span>}>
                  {ai ? (
                    <p className="yx-tim-muted">Wednesday night needs 2 operators and has 1, Kavitha Sundaram. Everyone else on Line 2 is working Wednesday, starts at 6 am on Thursday, is on leave, would go over 48 hours, or has no night-work consent. Moving someone would open a gap elsewhere. It is already an open shift: Deepa Ramesh from Line 1 is off Tuesday and Wednesday, has night consent and has claimed it, so you can pick her from the claims.</p>
                  ) : (
                    <span className="yx-tim-row"><Button size="sm" onClick={() => setAi(true)}>Explain (1 AI credit)</Button></span>
                  )}
                </Card>
              </>
            )}
            {open.got < open.need && <span className="yx-tim-row">{claimAction(open)}</span>}
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={pub} onOpenChange={setPub} title="Publish the roster for 5–11 Oct?" consequence={`${RUN_PEOPLE} people are notified by push and SMS.${toOffer.length ? ` ${toOffer.length} unfilled ${toOffer.length === 1 ? 'slot goes' : 'slots go'} out as open shifts to eligible people only: ${toOffer.map(slotName).join(', ')}.` : ''}${short.length > toOffer.length ? ` ${short.length - toOffer.length} already ${short.length - toOffer.length === 1 ? 'is an open shift' : 'are open shifts'}.` : ''}`} confirmLabel="Publish roster" onConfirm={() => { setPublished(true); setPub(false); }} />
      <ConfirmDialog open={rerun} onOpenChange={setRerun} title="Run auto-roster again?" consequence="Running again discards the approval. You'll need to review and approve the new draft." confirmLabel="Run again" onConfirm={() => { setRerun(false); run(); }} />
    </TimePage>
  );
}

/* =====================================================================
   TIM-35 · Open shifts & shift bidding
   ===================================================================== */

interface Claimant { name: string; detail: string }
interface OpenShift { id: string; date: Date; slot: string; skill: string; pool: string; claims: Claimant[]; rule: 'Manager picks' | 'First come'; status: 'Open' | 'Awarded'; awardedTo?: string; /** Why it was offered, when it came from a blocked assignment. */ note?: string }
const OPEN: OpenShift[] = [
  {
    id: 'os1', date: new Date(2026, 9, 7), slot: 'Night 10 pm – 6 am', skill: 'Line operator', pool: 'Hosur plant', rule: 'Manager picks', status: 'Open',
    claims: [
      { name: 'Deepa Ramesh', detail: 'Claimed 29 Sep, 8:10 am · off Tue 6 and Wed 7, rest 48 h · nights this month: 2 · night consent valid until 31 Mar 2027' },
      { name: 'Arul Prakasam', detail: 'Claimed 29 Sep, 9:02 am · off Wed 7, last shift ends Tue 6 at 10 pm, rest 24 h · nights this month: 4 · no night consent needed' },
    ],
  },
  { id: 'os2', date: new Date(2026, 9, 7), slot: 'Morning 6 am – 2 pm', skill: 'Line operator', pool: 'Hosur plant · Line 2', claims: [], rule: 'Manager picks', status: 'Open' },
  { id: 'os3', date: new Date(2026, 9, 3), slot: 'Evening 2 pm – 10 pm', skill: 'Forklift driver', pool: 'Hosur plant', claims: [{ name: 'Mohammed Irfan', detail: 'Claimed 28 Sep, 4:30 pm' }], rule: 'First come', status: 'Awarded', awardedTo: 'Mohammed Irfan' },
  // The TIM-40 blocked assignment: Babu Raj's forklift licence expired 27 Sep, so his Thu 1 Oct morning went out as an open shift.
  { id: 'os4', date: new Date(2026, 9, 1), slot: 'Morning 6 am – 2 pm', skill: 'Forklift driver', pool: 'Hosur plant', claims: [], rule: 'Manager picks', status: 'Open', note: 'Babu Raj blocked: forklift licence expired' },
];
const nowrap = { whiteSpace: 'nowrap' } as const;
/** "In 4 days", as DueBadge writes it. */
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The November bid window closes on this day. */
const BID_CLOSE = new Date(2026, 9, 15);
const SKILLS = ['Line operator', 'Forklift driver', 'Quality inspector'];

function OpenShiftsManager({ state = 'ready', offer = false, onOffer }: { state?: ViewState; offer?: boolean; onOffer?: (o: boolean) => void }) {
  const [rows, setRows] = useState(state === 'empty' ? [] : OPEN);
  const [award, setAward] = useState<OpenShift | null>(null);
  const [pick, setPick] = useState('');
  const [reminded, setReminded] = useState<string[]>([]);
  const [offerLocal, setOfferLocal] = useState(false);
  const [form, setForm] = useState<{ date: Date | null; code: string; skill: string }>({ date: new Date(2026, 9, 10), code: 'E', skill: 'Line operator' });
  const offering = onOffer ? offer : offerLocal;
  const setOffering = onOffer ?? setOfferLocal;
  const update = (id: string, patch: Partial<OpenShift>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addOffer = () => {
    const s = shiftOf(form.code)!;
    if (!form.date) return;
    setRows([...rows, { id: `os${rows.length + 10}`, date: form.date, slot: `${s.name} ${shiftTimes(s)}`, skill: form.skill, pool: 'Hosur plant · Line 2', claims: [], rule: 'Manager picks', status: 'Open' }]);
    setOffering(false);
  };
  // Status and claims sit in the Shift cell, so they stay visible when the table narrows (tablet widths).
  const cols: TableColumn<OpenShift>[] = [
    { key: 'when', header: 'Shift', width: 260, value: (r) => r.date, render: (r) => (
      <span className="yx-tim-list__main">
        <span className="yx-tim-row">
          <strong>{dayName(r.date)}</strong>
          <Badge tone={r.status === 'Open' ? 'warning' : 'success'}>{r.status}</Badge>
          {r.status === 'Open' ? <DueBadge date={r.date} /> : <Badge tone="neutral">{capFirst(relativeDue(r.date, TODAY).text)}</Badge>}
        </span>
        <span style={nowrap}>{r.slot}</span>
        <span className="yx-tim-muted">{r.skill} · {r.awardedTo ? `awarded to ${r.awardedTo}` : `${r.claims.length} ${r.claims.length === 1 ? 'claim' : 'claims'}`}</span>
        {r.note && <span className="yx-tim-muted">{r.note}</span>}
      </span>
    ) },
    { key: 'pool', header: 'Offered to', value: (r) => r.pool, optional: true },
    { key: 'rule', header: 'Award rule', value: (r) => r.rule, optional: true },
  ];
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  // The page header already has the primary "Offer an open shift", so the empty state's copy is a plain button,
  // and an empty list shows no column header row.
  const emptyState = <EmptyState title="No open shifts" description="Unfilled slots from auto-roster, sick calls or swaps can be offered here." action={<Button icon={Plus} onClick={() => setOffering(true)}>Offer an open shift</Button>} />;
  return (
    <>
      {!sorted.length && state !== 'loading' ? emptyState : <DataTable
        label="Open shifts"
        columns={cols}
        rows={sorted}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : 'ready'}
        empty={emptyState}
        rowButtons={(r) =>
          r.status !== 'Open' ? null : r.claims.length ? (
            <Button size="sm" variant="review" onClick={() => { setAward(r); setPick(r.claims[0].name); }}>Pick claimant</Button>
          ) : (
            <>
              <Button size="sm" disabled={reminded.includes(r.id)} onClick={() => setReminded([...reminded, r.id])}>{reminded.includes(r.id) ? 'Reminded' : 'Remind eligible'}</Button>
              {r.pool === 'Hosur plant'
                ? <span className="yx-tim-muted">Already offered to the whole plant</span>
                : <Button size="sm" onClick={() => update(r.id, { pool: 'Hosur plant' })}>Offer to all Hosur lines</Button>}
            </>
          )
        }
      />}
      <Dialog
        open={!!award}
        onOpenChange={(o) => !o && setAward(null)}
        title={award ? `Award ${dayName(award.date)} · ${award.slot}` : ''}
        footer={<><Button onClick={() => setAward(null)}>Cancel</Button><Button variant="approve" onClick={() => { if (award) update(award.id, { status: 'Awarded', awardedTo: pick }); setAward(null); }}>Award shift</Button></>}
      >
        <RadioGroup aria-label="Claimant" value={pick} onChange={setPick} options={(award?.claims ?? []).map((c) => ({ value: c.name, label: c.name, description: c.detail }))} />
      </Dialog>
      <Dialog
        open={offering}
        onOpenChange={setOffering}
        title="Offer an open shift"
        footer={<>{!form.date && <span className="yx-tim-muted">Pick a date</span>}<Button onClick={() => setOffering(false)}>Cancel</Button><Button variant="primary" disabled={!form.date} onClick={addOffer}>Offer shift</Button></>}
      >
        <div className="yx-tim-stack">
          <FormField label="Date" required><DatePicker value={form.date} min={TODAY} onChange={(d) => setForm({ ...form, date: d })} /></FormField>
          <FormField label="Shift" required><Select value={form.code} onChange={(v) => v && setForm({ ...form, code: v })} options={PLANT_SHIFTS.filter((s) => s.start).map((s) => ({ value: s.code, label: `${s.name} ${shiftTimes(s)}` }))} /></FormField>
          <FormField label="Skill" required><Select value={form.skill} onChange={(v) => v && setForm({ ...form, skill: v })} options={SKILLS.map((s) => ({ value: s, label: s }))} /></FormField>
          <p className="yx-tim-muted">Offered first to Hosur plant · Line 2, only to people who pass skill, rest and hour checks. You pick from the claims.</p>
        </div>
      </Dialog>
    </>
  );
}

function BidWindowPanel() {
  const [reminded, setReminded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);
  return (
    <div className="yx-tim-stack">
      <Card title="Bid window · November roster" actions={closed ? <Badge tone="neutral">Closed 29 Sep</Badge> : <span className="yx-tim-row"><Badge tone="success">Open until 15 Oct</Badge><DueBadge date={BID_CLOSE} prefix="Closes" /></span>}>
        <Kpis items={[{ label: 'Eligible', value: 42 }, { label: 'Bids in', value: 27 }, { label: "Haven't bid", value: 15 }]} />
        <p className="yx-tim-muted">Ties go to the person with the fewest nights, then the longest service.</p>
        {!closed && (
          <div className="yx-tim-row">
            <Button disabled={reminded} onClick={() => setReminded(true)}>{reminded ? 'Reminded' : "Remind 15 who haven't bid"}</Button>
            <Button onClick={() => setClosing(true)}>Close window early</Button>
          </div>
        )}
      </Card>
      <Card title="Awards to approve">
        <div className="yx-tim-stack">
          <p className="yx-tim-muted">{closed ? 'Awards arrive here with the generated November roster and go through approval together.' : 'Awards appear here after the window closes on 15 Oct. They go through approval with the November roster.'}</p>
          {closed ? (
            <span className="yx-tim-row"><Button size="sm" variant="primary" asChild><a href={storyHref(STORY.autoRoster)} target="_top">Run auto-roster for November</a></Button></span>
          ) : (
            <span className="yx-tim-row"><Button size="sm" disabled>Open November roster</Button><span className="yx-tim-muted">Available after 15 Oct</span></span>
          )}
        </div>
      </Card>
      <ConfirmDialog
        open={closing}
        onOpenChange={setClosing}
        title="Close the November bid window now?"
        consequence="27 of 42 eligible people have bid. The 15 who haven't lose the chance to rank patterns for November and get the leftover slots."
        confirmLabel="Close window"
        confirmVariant="danger"
        onConfirm={() => setClosed(true)}
      />
    </div>
  );
}

export function OpenShiftsScreen({ state = 'ready' }: { state?: ViewState }) {
  const [offer, setOffer] = useState(false);
  return (
    <TimePage active="Roster" user={PLANT_MANAGER}>
      <PageHeader title="Open shifts and bids" description="Hosur plant · offered only to people who pass skill, pool, conflict, rest and hour checks" actions={<Button variant="primary" icon={Plus} onClick={() => setOffer(true)}>Offer an open shift</Button>} />
      <Tabs defaultValue="open">
        <TabsList aria-label="Open shifts"><TabsTrigger value="open">Open shifts</TabsTrigger><TabsTrigger value="bids">Bid windows</TabsTrigger></TabsList>
        <TabsContent value="open"><OpenShiftsManager state={state} offer={offer} onOffer={setOffer} /></TabsContent>
        <TabsContent value="bids"><BidWindowPanel /></TabsContent>
      </Tabs>
    </TimePage>
  );
}

const NOV_START = new Date(2026, 10, 1);
const NOV_END = new Date(2026, 10, 30);
/** Wed 7 Oct: the night (10 pm – 6 am) and morning (6 am – 2 pm) leave only 8 h rest between them, so a worker can claim one. */
const PHONE_SLOTS = [
  { id: 'n', name: 'Night', time: '10 pm – 6 am', detail: 'Line operator · Hosur plant · night allowance ₹150' },
  { id: 'm', name: 'Morning', time: '6 am – 2 pm', detail: 'Line operator · Hosur plant · Line 2' },
];
const SHIFT_DAY = new Date(2026, 9, 7);
export function OpenShiftsPhone({ view = 'list' }: { view?: 'list' | 'claimed' | 'bid' | 'none' }) {
  const [order, setOrder] = useState(['4 on / 2 off · Morning', 'Rotating: Morning, Evening, Night', '4 on / 2 off · Night']);
  const [daysOff, setDaysOff] = useState<Date[]>([new Date(2026, 10, 14), new Date(2026, 10, 15)]);
  const [claimed, setClaimed] = useState<string[]>(view === 'claimed' ? ['n'] : []);
  const [sent, setSent] = useState(false);
  const move = (i: number, by: number) => {
    const next = [...order];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setOrder(next);
    setSent(false);
  };
  return (
    <PhoneFrame tab="time" title={view === 'bid' ? 'Bid for November' : 'Open shifts'} user={LINE_OPERATOR}>
      {view === 'none' && (
        <EmptyState
          title="No open shifts for you"
          description="You'll see a shift here only when you're eligible: right skill, no conflict, enough rest."
          action={<Button asChild><a href={storyHref(STORY.myShifts)} target="_top">See my shifts</a></Button>}
        />
      )}
      {(view === 'list' || view === 'claimed') && (
        <ul className="yx-tim-list">
          {PHONE_SLOTS.map((s) => {
            const other = PHONE_SLOTS.find((x) => x.id !== s.id && claimed.includes(x.id));
            return (
              <li key={s.id}>
                <span className="yx-tim-list__main">
                  <span className="yx-tim-row"><strong>{dayName(SHIFT_DAY)}</strong><DueBadge date={SHIFT_DAY} /></span>
                  <span style={nowrap}>{s.name} {s.time}</span>
                  <span className="yx-tim-muted">{s.detail}</span>
                  {other && !claimed.includes(s.id) && <span className="yx-tim-muted">Clashes with your {other.name.toLowerCase()} claim (8 h rest)</span>}
                </span>
                {claimed.includes(s.id) ? (
                  <span className="yx-tim-stack">
                    <Badge tone="neutral">Waiting for manager</Badge>
                    <Button size="sm" onClick={() => setClaimed(claimed.filter((x) => x !== s.id))}>Withdraw claim</Button>
                  </span>
                ) : (
                  <Button size="sm" disabled={!!other} onClick={() => setClaimed([...claimed, s.id])}>Claim</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {claimed.length > 0 && view !== 'bid' && <p className="yx-tim-note">A claim doesn't assign the shift. Your manager picks from claimants; you'll get a notification. You can withdraw until then.</p>}
      {view === 'bid' && (
        <div className="yx-tim-stack">
          <div className="yx-tim-row"><span className="yx-tim-muted">Rank the patterns you prefer, most wanted first. Window closes 15 Oct.</span><DueBadge date={BID_CLOSE} /></div>
          <ol className="yx-tim-list">
            {order.map((p, i) => (
              <li key={p}>
                {/* Only the label wraps; the arrows keep a fixed place on the right. */}
                <span style={{ flex: '1 1 0', minWidth: 0 }}>{i + 1}. {p}</span>
                <span className="yx-tim-row" style={{ flexWrap: 'nowrap', flexShrink: 0 }}>
                  <IconButton icon={ArrowUp} size="sm" label={`Move ${p} up`} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} size="sm" label={`Move ${p} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)} />
                </span>
              </li>
            ))}
          </ol>
          <FormField label="Days I want off" optional helper="November only">
            <div className="yx-tim-stack">
              <DatePicker value={null} min={NOV_START} max={NOV_END} placeholder="Add a day" aria-label="Add a day off" onChange={(d) => { if (d && !daysOff.some((x) => x.getTime() === d.getTime())) { setDaysOff([...daysOff, d].sort((a, b) => a.getTime() - b.getTime())); setSent(false); } }} />
              <div className="yx-tim-row">{daysOff.map((d) => <Tag key={d.getTime()} onRemove={() => { setDaysOff(daysOff.filter((x) => x !== d)); setSent(false); }} removeLabel={`Remove ${dayName(d)}`}>{dayName(d)}</Tag>)}</div>
            </div>
          </FormField>
          {sent && <InlineAlert tone="success" title="Bid sent">You can change it until 15 Oct.</InlineAlert>}
          <Button variant="primary" fullWidth disabled={sent} onClick={() => setSent(true)}>{sent ? 'Bid sent' : 'Send bid'}</Button>
        </div>
      )}
    </PhoneFrame>
  );
}

/* =====================================================================
   TIM-38 · Standby slots and call-out
   ===================================================================== */

/** Current week (28 Sep – 4 Oct), STANDBY_THIS_WEEK above. */
const THIS_WEEK = new Date(2026, 8, 28);
const SHIFT_TODAY = toMins('09:30');
const GENERAL_MINS = 9 * 60;
const MIN_REST = 11 * 60;
/** One call-out. Times are minutes after midnight on the call-out day; `rest` is fixed for past rows, worked out for Anil's today. */
interface CallOut { id: string; who: 'Anil Kumar' | 'Senthil Murugan'; day: string; start: number; end: number; reason: string; source: string; nextText?: string; rest?: number }
const CALL_OUTS: CallOut[] = [
  // Ends 2:30 am, so moving today's shift to 1:30 pm – 10:30 pm also leaves exactly 11 h before Wed 30 Sep, 9:30 am.
  { id: 'a1', who: 'Anil Kumar', day: 'Tue 29 Sep', start: toMins('02:00'), end: toMins('02:30'), reason: 'Compressor trip, Line 2', source: 'Phone call' },
  // Week of 21 Sep: his Mon 28 Sep morning shift (6 am) came 7 h 30 m after this call-out ended.
  { id: 's1', who: 'Senthil Murugan', day: 'Sun 27 Sep', start: toMins('19:10'), end: toMins('22:30'), reason: 'Boiler alarm', source: 'Alarm system', nextText: 'Mon 28 Sep, 6 am', rest: 24 * 60 + toMins('06:00') - toMins('22:30') },
];
/** Call-out minimum and standby allowance come from Pay's on-call rules (PAY-35), so both screens agree. */
const MIN_CALL_OUT = ON_CALL_RULES.minimumHours * 60;
const STANDBY_ALLOWANCE = `₹${ON_CALL_RULES.standbyPerSlot.toLocaleString('en-IN')} allowance`;
const paidOf = (c: CallOut) => Math.max(MIN_CALL_OUT, c.end - c.start);
/** Minutes from Tue 29 Sep midnight: 6 pm onwards is Monday evening (negative), anything else is Tuesday morning. */
const slotMins = (s: string) => (toMins(s) >= toMins('18:00') ? toMins(s) - 1440 : toMins(s));
/** Clock time for minutes that may run before midnight (negative) or past it. */
const clockAt = (m: number) => clock(posMod(m, 1440));

export function StandbyScreen({ dialog = false, moved = false }: { dialog?: boolean; moved?: boolean }) {
  const [open, setOpen] = useState(dialog);
  const [moving, setMoving] = useState(false);
  /** Anil's moved start today (minutes), or null while it is still 9:30 am. `moved` opens with it already moved (11 h after the 2:30 am call-out). */
  const [movedTo, setMovedTo] = useState<number | null>(moved ? CALL_OUTS[0].end + MIN_REST : null);
  const [wk, setWk] = useState<'this' | 'next'>('this');
  const [log, setLog] = useState<CallOut[]>(CALL_OUTS);
  const [from, setFrom] = useState<string | null>('04:10');
  const [to, setTo] = useState<string | null>('04:50');
  const [source, setSource] = useState('Phone call');
  const [reason, setReason] = useState('Conveyor jam, Line 2');
  const narrow = useNarrow();
  const nextShift = movedTo ?? SHIFT_TODAY;
  const anil = log.filter((c) => c.who === 'Anil Kumar');
  const latest = anil.reduce((x, c) => (c.end > x.end ? c : x), anil[0]);
  const anilRest = nextShift - latest.end;
  const anilPaid = anil.reduce((n, c) => n + paidOf(c), 0);
  const moveTarget = latest.end + MIN_REST;
  // The slot runs Mon 28 Sep 6 pm – Tue 29 Sep 6 am: a time from 6 pm is Monday (minutes before Tuesday's midnight), before 6 am is Tuesday.
  const outside = (s: string) => toMins(s) > toMins('06:00') && toMins(s) < toMins('18:00');
  const a = from ? slotMins(from) : 0;
  const b = to ? slotMins(to) : 0;
  const clash = anil.find((c) => a < c.end && b > c.start);
  const blocked = !from || !to ? 'Enter the start and end'
    : outside(from) || outside(to) ? 'Standby is 6 pm – 6 am'
      : b <= a ? 'End must be after start'
        : clash ? `Overlaps the ${clockAt(clash.start)} call-out already logged`
          : !reason.trim() ? 'Enter a reason' : '';
  const paid = Math.max(MIN_CALL_OUT, b - a);
  const rest = nextShift - b;
  const save = () => {
    setLog([...log, { id: `c${log.length}`, who: 'Anil Kumar', day: a < 0 ? 'Mon 28 Sep' : 'Tue 29 Sep', start: a, end: b, reason: reason.trim(), source }]);
    setOpen(false);
  };
  // The roster follows the move: Tue 29 shows the new start under a plain "Moved" code.
  const movedShift: Shift | null = movedTo == null ? null : { code: 'Moved', name: 'General', start: hhmm(movedTo), end: hhmm(movedTo + GENERAL_MINS), hours: 8, color: 1 };
  // Anil's Mon 28 standby carries his paid call-out time, so the grid's Hours column includes it.
  const calledOut: Shift = { code: 'SB+', name: 'Standby, called out', hours: Math.round(anilPaid / 6) / 10, color: 6, displayStart: '18:00' };
  const shifts = [...PLANT_SHIFTS, calledOut, ...(movedShift ? [movedShift] : [])];
  const thisWeek: RosterValue = { ...STANDBY_THIS_WEEK, p3: STANDBY_THIS_WEEK.p3.map((c, i) => (i === 0 ? calledOut.code : i === 1 && movedShift ? movedShift.code : c)) };
  const people = PLANT_PEOPLE.slice(2, 4);
  const shiftHours = (thisWeek.p3 ?? []).reduce((n, c) => n + (c === calledOut.code ? 0 : shifts.find((s) => s.code === c)?.hours ?? 0), 0);
  const row = (c: CallOut) => {
    const today = c.who === 'Anil Kumar';
    const r = today ? nextShift - c.end : c.rest ?? MIN_REST;
    const isLatest = today && c.id === latest.id;
    const nextText = today ? (movedTo != null ? `moved to ${clock(movedTo)} – ${clock(movedTo + GENERAL_MINS)} today` : `${clock(SHIFT_TODAY)} today`) : c.nextText;
    const actions = r < MIN_REST && (
      <span className="yx-tim-row">
        <Badge tone="warning">{today ? `Rest ${hm(r)}` : `Rest was ${hm(r)}`}</Badge>
        {isLatest && <Button size="sm" onClick={() => setMoving(true)}>Move next shift</Button>}
      </span>
    );
    return (
      <li key={c.id}>
        <span className="yx-tim-list__main">
          <strong>{c.who} · {c.day}, {clockAt(c.start)} – {clockAt(c.end)}</strong>
          <span className="yx-tim-muted">{c.reason} · {c.source.toLowerCase()} · paid {hm(paidOf(c))}{paidOf(c) === MIN_CALL_OUT ? ' (minimum)' : ''} · counts towards weekly hours</span>
          {/* Only the latest call-out sets Anil's rest before today's shift. */}
          {(!today || isLatest) && <span className="yx-tim-muted">Next shift {nextText} · {hm(r)} rest{r < MIN_REST ? ' (needs 11 h)' : ''}{today && movedTo != null ? ' · Anil notified' : ''}</span>}
          {narrow && actions}
        </span>
        {!narrow && actions}
      </li>
    );
  };
  return (
    <TimePage active="Roster" user={PLANT_MANAGER}>
      <PageHeader title="Standby and call-outs · Hosur maintenance" description={`Standby is not a working shift · ${STANDBY_ALLOWANCE} per slot · call-out paid at least ${ON_CALL_RULES.minimumHours} h`} actions={<Button variant="primary" onClick={() => setOpen(true)}>Log call-out</Button>} />
      <div className="yx-tim-stack">
        <Segment label="Week" value={wk} onChange={setWk} options={[{ value: 'this', label: 'This week · 28 Sep' }, { value: 'next', label: 'Next week · 5 Oct' }]} />
        <Legend shifts={wk === 'this' ? shifts : PLANT_SHIFTS} />
        <RosterGrid
          key={`${wk}-${movedTo}`}
          people={people}
          start={wk === 'this' ? THIS_WEEK : WEEK}
          shifts={wk === 'this' ? shifts : PLANT_SHIFTS}
          defaultValue={wk === 'this' ? thisWeek : { p3: PUBLISHED_ROSTER.p3, p4: PUBLISHED_ROSTER.p4 }}
          rules={PLANT_RULES}
          defaultStatus="published"
          readOnly
          today={TODAY}
        />
        {wk === 'this'
          ? <p className="yx-tim-note">Anil Kumar: standby Mon 28 Sep night, then General shift today (Tue 29 Sep){movedTo != null ? `, moved to ${clockAt(movedTo)} – ${clockAt(movedTo + GENERAL_MINS)} for rest` : ''}. His hours this week: {shiftHours} h of shifts + {hm(anilPaid)} call-out = {hm(shiftHours * 60 + anilPaid)}.</p>
          : <p className="yx-tim-note">If Anil Kumar is called out on Thu 8 Oct night, his Fri 9 Oct 9:30 am shift may leave too little rest. Check it the morning after.</p>}
      </div>
      <Card title="Call-out log">
        <ul className="yx-tim-list">
          {[...anil].reverse().map(row)}
          {log.filter((c) => c.who !== 'Anil Kumar').map(row)}
        </ul>
      </Card>
      <ConfirmDialog
        open={moving}
        onOpenChange={setMoving}
        title={`Move Anil Kumar's shift today to ${clock(moveTarget)} – ${clock(moveTarget + GENERAL_MINS)}?`}
        consequence="This gives him 11 h rest after the call-out. The roster is published, so Anil is notified by push and SMS."
        confirmLabel="Move shift"
        onConfirm={() => setMovedTo(moveTarget)}
      />
      <Dialog open={open} onOpenChange={setOpen} title="Log a call-out" footer={<>{blocked && <span className="yx-tim-muted">{blocked}</span>}<Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!!blocked} onClick={save}>Save call-out</Button></>}>
        <div className="yx-tim-stack">
          <FormField label="Person on standby" required helper="Only standby slots that have started are listed"><Select value="a" onChange={() => {}} options={[{ value: 'a', label: 'Anil Kumar · standby Mon 28 Sep, 6 pm – 6 am' }]} /></FormField>
          <FieldRow><FormField label="Start" required><TimeField value={from} onChange={setFrom} /></FormField><FormField label="End" required><TimeField value={to} onChange={setTo} /></FormField></FieldRow>
          <FormField label="Reason" required><TextField value={reason} placeholder="For example Compressor trip, Line 2" onChange={setReason} /></FormField>
          <FormField label="Source"><Select value={source} onChange={(v) => v && setSource(v)} options={[{ value: 'Phone call', label: 'Phone call' }, { value: 'Alarm system', label: 'Alarm system' }]} /></FormField>
          {!blocked && (
            <InlineAlert tone={rest < MIN_REST ? 'warning' : 'info'} title="Effect">
              Paid {hm(paid)}{paid === MIN_CALL_OUT ? ' (call-out minimum)' : ''}. Next shift at {clock(nextShift)} leaves {hm(rest)} rest{rest < MIN_REST ? ' (needs 11 h). After you save, use Move next shift in the log.' : '.'}
            </InlineAlert>
          )}
        </div>
      </Dialog>
    </TimePage>
  );
}

/** Anil Kumar's phone on Tue 29 Sep: today's shift (moved for rest after the night call-out), then his next standby on Thu 8 Oct. */
export function StandbyPhone({ moved = false }: { moved?: boolean }) {
  const next = new Date(2026, 9, 8);
  return (
    <PhoneFrame tab="time" title="Standby" user={{ name: 'Anil Kumar', email: 'anil.k@kaverifoods.in' }}>
      <Card title="Today · Tue 29 Sep" actions={moved ? undefined : <Badge tone="warning">Rest 7 h</Badge>}>
        <p className="yx-tim-muted">
          {moved
            ? 'Your General shift today is 1:30 pm – 10:30 pm, not 9:30 am. It was moved so you get 11 h rest after last night’s call-out.'
            : 'Rest is short: 7 h before your 9:30 am shift. Your manager has been told and may move it.'}
        </p>
      </Card>
      <Card title="Next standby" actions={<DueBadge date={next} />}>
        <p className="yx-tim-muted">Thu 8 Oct, 6:00 pm – 6:00 am · {STANDBY_ALLOWANCE}</p>
        <Button variant="primary" fullWidth disabled aria-describedby="sb-reason">Start call-out</Button>
        <p className="yx-tim-note" id="sb-reason">You can start a call-out once your standby begins.</p>
      </Card>
      <Card title="Last call-out">
        <p className="yx-tim-muted">Tue 29 Sep, 2:00 am – 2:30 am · compressor trip · paid 2 h</p>
      </Card>
      <p className="yx-tim-note">Call-outs count towards your hours and rest. You're paid at least 2 h per call-out.</p>
    </PhoneFrame>
  );
}

/* =====================================================================
   TIM-39 · Block-leave planner
   ===================================================================== */

interface BlockRow { name: string; role: string; reportsTo: string; from?: Date; to?: Date; status: 'Planned' | 'Not planned' | 'Taken'; /** Earned leave left, which the block is charged to. */ elLeft: number }
const BLOCK_ROWS: BlockRow[] = [
  { name: 'Revathi Chandran', role: 'Cash and bank · Bengaluru head office', reportsTo: 'Meera Iyer', from: new Date(2026, 9, 12), to: new Date(2026, 9, 26), status: 'Planned', elLeft: 18 },
  { name: 'Ganesh Hegde', role: 'Accounts payable · Bengaluru head office', reportsTo: 'Meera Iyer', status: 'Not planned', elLeft: 14 },
  { name: 'Farida Shaikh', role: 'Accounts payable · Chennai office', reportsTo: 'Meera Iyer', from: new Date(2026, 2, 2), to: new Date(2026, 2, 13), status: 'Taken', elLeft: 9 },
  { name: 'Vinod Pai', role: 'Stores in-charge · Hosur plant', reportsTo: 'Ramesh Gowda', from: new Date(2026, 10, 9), to: new Date(2026, 10, 20), status: 'Planned', elLeft: 21 },
];
const BLOCK_CUT_OFF = new Date(2026, 9, 31);
const HOLIDAY_TIMES = HOLIDAYS.map((h) => h.date.getTime());
/** Mon–Fri, public holidays excluded. ponytail: ignores 1st/3rd Saturday working days; use the location calendar when wired. */
const workingDays = (from: Date, to: Date) => countLeaveDays({ from, to, holidays: HOLIDAYS.map((h) => h.date), weeklyOffDays: [0, 6], sandwich: 'none' }).total;
/** First working day after the block: when access comes back. */
const restoreOn = (to: Date) => {
  let d = addDays(to, 1);
  while (d.getDay() === 0 || d.getDay() === 6 || HOLIDAY_TIMES.includes(d.getTime())) d = addDays(d, 1);
  return d;
};
const shortRange = (a: Date, b: Date) => `${a.getDate()}${a.getMonth() === b.getMonth() ? '' : ` ${MON[a.getMonth()]}`}–${b.getDate()} ${MON[b.getMonth()]}${b.getFullYear() !== TODAY.getFullYear() ? ` ${b.getFullYear()}` : ''}`;

export function BlockLeavePlannerScreen({ persona = 'hr', confirm = false }: { persona?: 'hr' | 'mgr'; confirm?: boolean }) {
  const [sel, setSel] = useState<BlockRow | null>(confirm ? BLOCK_ROWS[0] : null);
  const [nudged, setNudged] = useState<string[]>([]);
  const [paused, setPaused] = useState<string[]>([]);
  /** Blocks HR plans here for someone who hadn't planned one. */
  const [planned, setPlanned] = useState<Record<string, { from: Date; to: Date }>>({});
  const [planFor, setPlanFor] = useState<BlockRow | null>(null);
  const [pFrom, setPFrom] = useState<Date | null>(null);
  const [pTo, setPTo] = useState<Date | null>(null);
  const hr = persona === 'hr';
  const narrow = useNarrow();
  const rows = (hr ? BLOCK_ROWS : BLOCK_ROWS.filter((r) => r.reportsTo === ME.name)).map((r): BlockRow => {
    const p = planned[r.name];
    // The block is charged to earned leave, so what is left drops by its working days.
    return p ? { ...r, ...p, status: 'Planned', elLeft: r.elLeft - workingDays(p.from, p.to) } : r;
  });
  const pDays = pFrom && pTo && pTo.getTime() >= pFrom.getTime() ? workingDays(pFrom, pTo) : 0;
  const planBlocked = !planFor ? '' : !pFrom || !pTo ? 'Pick the first and last day'
    : pTo.getTime() < pFrom.getTime() ? 'Last day must be after the first'
      : pDays < 10 ? `Only ${pDays} working days; the block needs 10 in a row`
        : pDays > planFor.elLeft ? `Only ${planFor.elLeft} days earned leave left`
          : '';
  const openPlan = (r: BlockRow) => { setPlanFor(r); setPFrom(new Date(2026, 10, 16)); setPTo(new Date(2026, 10, 27)); };
  const count = (s: BlockRow['status']) => rows.filter((r) => r.status === s).length;
  const future = !!sel?.from && daysUntil(sel.from, TODAY) > 1;
  return (
    <TimePage active="Block leave" user={hr ? HR_ADMIN : ME}>
      <PageHeader title="Block leave · 2026" description="Staff in cash, payment and stores roles take 10 working days off in a row each year. Their system access is paused while away." />
      {rows.length === 0 ? (
        <EmptyState
          title="None of your team is in a block-leave role"
          description="Block leave applies to cash, payment and stores roles. HR plans it with the person's manager. Your team's other leave is on the team leave calendar."
          action={<Button asChild><a href={storyHref(STORY.teamLeave)} target="_top">Open team leave calendar</a></Button>}
        />
      ) : (
        <>
          <Kpis items={[{ label: 'People', value: rows.length }, { label: 'Taken', value: count('Taken') }, { label: 'Planned', value: count('Planned') }, { label: 'Not planned', value: count('Not planned') }]} />
          <Card title="People in scope">
            <ul className="yx-tim-list">
              {rows.map((r) => {
                const wd = r.from && r.to ? workingDays(r.from, r.to) : 0;
                const startsIn = r.from ? daysUntil(r.from, TODAY) : 0;
                return (
                  <li key={r.name}>
                    <PersonLabel name={r.name} secondary={r.role} />
                    <span className="yx-tim-row">
                      {/* The earned-leave balance sits with the dates, so it isn't the part cut off on phones. */}
                      {r.from && r.to ? (
                        <span className="yx-tim-muted">{shortRange(r.from, r.to)} · {wd} working days{r.status !== 'Taken' ? ` · ${r.elLeft} days earned leave left after the block` : ''}</span>
                      ) : (
                        // Flat in the row, so the badge and buttons share a line; on phones "Plan by 31 Oct" already gives the date.
                        <span className="yx-tim-muted">Plan by 31 Oct · {r.elLeft} days earned leave left</span>
                      )}
                      {!r.from && !narrow && <DueBadge date={BLOCK_CUT_OFF} />}
                      {r.from && wd < 10 && <Badge tone="danger">Only {wd} working days</Badge>}
                      {/* On phones the dates or "Plan by" already say whether it is planned. */}
                      {!narrow && <Badge tone={r.status === 'Not planned' ? 'warning' : r.status === 'Taken' ? 'success' : 'info'}>{r.status}</Badge>}
                      {r.status === 'Planned' && startsIn > 1 && <DueBadge date={r.from!} prefix="Starts" />}
                      {hr && r.status === 'Not planned' && (
                        <>
                          {nudged.includes(r.name) ? <span className="yx-tim-muted">Nudged 29 Sep</span> : <Button size="sm" onClick={() => setNudged([...nudged, r.name])}>Nudge to plan</Button>}
                          <Button size="sm" onClick={() => openPlan(r)}>Plan block leave</Button>
                        </>
                      )}
                      {hr && r.status === 'Planned' && (
                        paused.includes(r.name)
                          ? startsIn > 1
                            ? <span className="yx-tim-row"><span className="yx-tim-muted">Access pause scheduled from {shortDate(r.from!)}</span><Button size="sm" onClick={() => setPaused(paused.filter((x) => x !== r.name))}>Cancel pause</Button></span>
                            : <span className="yx-tim-muted">Access paused</span>
                          : <Button size="sm" onClick={() => setSel(r)}>{startsIn > 1 ? 'Schedule access pause' : 'Start block'}</Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
      <ConfirmDialog
        open={!!sel && hr}
        onOpenChange={(o) => !o && setSel(null)}
        title={sel ? (future && sel.from ? `Pause ${sel.name}'s access from ${shortDate(sel.from)}?` : `Start block leave for ${sel.name} and pause access?`) : ''}
        consequence={sel?.from && sel.to ? `${sel.name}'s access to YukthiX, the ERP and the bank portal is paused from ${shortDate(sel.from)}, 12:00 am and restored on ${shortDate(restoreOn(sel.to))}. Only Lakshmi Venkatesan (HR) can grant an exception, and each one is logged.` : undefined}
        confirmLabel={future ? 'Schedule access pause' : 'Start block and pause access'}
        confirmVariant="danger"
        onConfirm={() => { if (sel) setPaused([...paused, sel.name]); setSel(null); }}
      />
      <Dialog
        open={!!planFor}
        onOpenChange={(o) => !o && setPlanFor(null)}
        title={planFor ? `Plan block leave for ${planFor.name}` : ''}
        footer={<>{planBlocked && <span className="yx-tim-muted">{planBlocked}</span>}<Button onClick={() => setPlanFor(null)}>Cancel</Button><Button variant="primary" disabled={!!planBlocked} onClick={() => { if (planFor && pFrom && pTo) setPlanned({ ...planned, [planFor.name]: { from: pFrom, to: pTo } }); setPlanFor(null); }}>Plan block</Button></>}
      >
        <div className="yx-tim-stack">
          <FieldRow>
            <FormField label="First day" required><DatePicker value={pFrom} min={addDays(TODAY, 1)} onChange={setPFrom} /></FormField>
            <FormField label="Last day" required><DatePicker value={pTo} min={pFrom ?? addDays(TODAY, 1)} onChange={setPTo} /></FormField>
          </FieldRow>
          {planFor && <p className="yx-tim-muted">{pDays} working days · charged to earned leave ({planFor.elLeft} days left now). {planFor.name} and their manager, {planFor.reportsTo}, are told.</p>}
        </div>
      </Dialog>
    </TimePage>
  );
}

/* =====================================================================
   TIM-40 · Licence requirements
   ===================================================================== */

interface LicHolder { name: string; expires: Date }
interface LicRow { id: string; req: string; kind: 'Role' | 'Skill' | 'Shift'; licence: string; /** Short second line under the licence name. */ note?: string; legal: boolean; holders: number; watch: LicHolder[]; /** Days before expiry that reminders go out. */ remind: number[] }
const REMIND_DEFAULT = [60, 30, 7];
/** "60, 30 and 7" */
const daysList = (d: number[]) => (d.length > 1 ? `${d.slice(0, -1).join(', ')} and ${d[d.length - 1]}` : String(d[0] ?? ''));
const LIC: LicRow[] = [
  { id: 'l1', req: 'Forklift driver', kind: 'Role', licence: 'Forklift licence', note: 'LMV endorsement', legal: true, holders: 6, remind: REMIND_DEFAULT, watch: [{ name: 'Babu Raj', expires: new Date(2026, 8, 27) }, { name: 'Mohammed Irfan', expires: new Date(2026, 9, 12) }] },
  {
    id: 'l2', req: 'Food handler', kind: 'Skill', licence: 'FSSAI food handler', legal: true, holders: 48, remind: REMIND_DEFAULT,
    watch: [
      { name: 'Pooja Nair', expires: new Date(2026, 8, 15) }, { name: 'Manoj Kumar', expires: new Date(2026, 8, 22) }, { name: 'Sathya Priya', expires: new Date(2026, 9, 8) },
      { name: 'Divakar Selvam', expires: new Date(2026, 9, 19) }, { name: 'Kalaiselvi Raman', expires: new Date(2026, 9, 30) }, { name: 'Arjun Das', expires: new Date(2026, 10, 11) }, { name: 'Shanthi Mani', expires: new Date(2026, 10, 20) },
    ],
  },
  { id: 'l3', req: 'Boiler shift', kind: 'Shift', licence: 'Boiler attendant', legal: true, holders: 4, remind: REMIND_DEFAULT, watch: [] },
  { id: 'l4', req: 'First aider', kind: 'Role', licence: 'First aid', note: 'Company certificate', legal: false, holders: 11, remind: REMIND_DEFAULT, watch: [{ name: 'Gopal Iyer', expires: new Date(2026, 8, 10) }, { name: 'Nisha Menon', expires: new Date(2026, 9, 14) }, { name: 'Senthil Murugan', expires: new Date(2026, 10, 2) }] },
];
/** Forklift licences to watch: read by the TIM-05 guards card too. */
function FORKLIFT_WATCH() {
  return LIC[0].watch;
}
/** Holders overridden by HR (name → reason): they can be rostered, so they don't count as needing action. */
type Overrides = Record<string, string>;
/** The needs-action window is the row's first (longest) reminder. */
const windowOf = (r: LicRow) => Math.max(...r.remind);
const expiredOf = (r: LicRow, ov: Overrides = {}) => r.watch.filter((h) => !ov[h.name] && daysUntil(h.expires, TODAY) < 0).length;
const expiringOf = (r: LicRow, ov: Overrides = {}) => r.watch.filter((h) => { const n = daysUntil(h.expires, TODAY); return !ov[h.name] && n >= 0 && n <= windowOf(r); }).length;
const actionCount = (r: LicRow, ov: Overrides = {}) => expiredOf(r, ov) + expiringOf(r, ov);
const needsAction = (r: LicRow, ov: Overrides = {}) => actionCount(r, ov) > 0;

function NeedsAction({ r, ov }: { r: LicRow; ov: Overrides }) {
  const ex = expiredOf(r, ov);
  const soon = expiringOf(r, ov);
  const overridden = r.watch.filter((h) => ov[h.name]).length;
  if (!ex && !soon) return <span className="yx-tim-row"><span className="yx-tim-muted">All valid {windowOf(r)}+ days</span>{overridden > 0 && <Badge tone="neutral">{overridden} overridden</Badge>}</span>;
  // Two short badges, one line each, instead of one badge that wraps.
  return (
    <span className="yx-tim-row">
      {ex > 0 && <Badge tone="danger">{ex} expired</Badge>}
      {soon > 0 && <Badge tone="warning">{soon} expiring</Badge>}
      {overridden > 0 && <Badge tone="neutral">{overridden} overridden</Badge>}
    </span>
  );
}

export function LicenceRequirementsScreen({ state = 'ready', blocked = false }: { state?: ViewState; blocked?: boolean }) {
  const [lics, setLics] = useState(state === 'empty' ? [] : LIC);
  const [onlyAction, setOnlyAction] = useState(false);
  const [holders, setHolders] = useState<LicRow | null>(null);
  const [edit, setEdit] = useState<LicRow | 'new' | null>(null);
  /** People asked to renew (blocked alert and drawer share it). */
  const [asked, setAsked] = useState<string[]>([]);
  const ask = (names: string[]) => setAsked([...asked, ...names.filter((n) => !asked.includes(n))]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [kind, setKind] = useState<LicRow['kind']>('Role');
  const [legal, setLegal] = useState<'legal' | 'company'>('legal');
  const [req, setReq] = useState('');
  const [licence, setLicence] = useState('');
  const [remind, setRemind] = useState<(number | null)[]>(REMIND_DEFAULT);
  const [saved, setSaved] = useState<{ title: string; text: string } | null>(null);
  const openEdit = (r: LicRow | 'new') => {
    setEdit(r);
    setKind(r === 'new' ? 'Role' : r.kind);
    setLegal(r !== 'new' && !r.legal ? 'company' : 'legal');
    setReq(r === 'new' ? '' : r.req);
    setLicence(r === 'new' ? '' : r.licence);
    setRemind(r === 'new' ? REMIND_DEFAULT : r.remind);
  };
  const missing = !req.trim() ? `Enter the ${kind.toLowerCase()}` : !licence.trim() ? 'Enter the licence' : remind.some((n) => n == null) ? 'Fill in all three reminder days' : '';
  const saveEdit = () => {
    if (!edit || missing) return;
    const patch = { req: req.trim(), kind, licence: licence.trim(), legal: legal === 'legal', remind: remind.map(Number).sort((a, b) => b - a) };
    setLics(edit === 'new' ? [...lics, { id: `l${lics.length + 1}`, holders: 0, watch: [], ...patch }] : lics.map((r) => (r.id === edit.id ? { ...r, ...patch } : r)));
    setSaved(edit === 'new'
      ? { title: `Added ${patch.req}`, text: `No one holds this licence yet, so from today the roster blocks ${kind === 'Role' ? `everyone in the ${patch.req.toLowerCase()} role` : kind === 'Skill' ? `everyone rostered for ${patch.req.toLowerCase()} work` : `everyone on ${patch.req.toLowerCase()}`} until licences are recorded${patch.legal ? '' : ' or HR overrides with a reason'}.` }
      : { title: `Saved ${patch.req}`, text: `Reminders go out ${daysList(patch.remind)} days before expiry.` });
    setEdit(null);
  };
  const cols: TableColumn<LicRow>[] = [
    { key: 'req', header: 'Required for', value: (r) => r.req, render: (r) => <span className="yx-tim-list__main"><strong>{r.req}</strong><span className="yx-tim-muted">{r.kind}</span></span> },
    { key: 'licence', header: 'Licence', value: (r) => r.licence, render: (r) => <span className="yx-tim-list__main" style={{ flex: 'none' }}><span>{r.licence}</span>{r.note && <span className="yx-tim-muted">{r.note}</span>}</span> },
    // Type stays visible at every width: it decides whether HR can override.
    { key: 'legal', header: 'Type', width: 116, value: (r) => (r.legal ? 'Legal' : 'Company'), render: (r) => <Badge tone="neutral">{r.legal ? 'Legal' : 'Company'}</Badge> },
    { key: 'holders', header: 'Holders', type: 'number', value: (r) => r.holders, optional: true },
    { key: 'needs', header: 'Needs action', width: 190, value: (r) => expiredOf(r, overrides) * 100 + expiringOf(r, overrides), render: (r) => <NeedsAction r={r} ov={overrides} /> },
  ];
  const drawerNames = holders ? holders.watch.map((h) => h.name) : [];
  const act = (r: LicRow) => needsAction(r, overrides);
  const rows = onlyAction ? lics.filter(act) : lics;
  const babu = LIC[0].watch[0];
  return (
    <TimePage active="Roster" user={HR_ADMIN}>
      <PageHeader
        title="Licence requirements"
        description={`People without a valid licence can't be rostered. Reminders go out before expiry (${daysList(REMIND_DEFAULT)} days by default). Legal licences have no override; HR can override company ones with a reason.`}
        actions={<span className="yx-tim-row">{state === 'loading' && <span className="yx-tim-muted">Requirements are loading</span>}<Button variant="primary" icon={Plus} disabled={state === 'loading'} onClick={() => openEdit('new')}>Add requirement</Button></span>}
      />
      {saved && <InlineAlert tone="success" title={saved.title}>{saved.text}</InlineAlert>}
      {blocked && (
        <InlineAlert
          tone="danger"
          title="Assignment blocked · Forklift, Morning 6 am – 2 pm, Thu 1 Oct"
          actions={<><Button size="sm" asChild><a href={storyHref(STORY.openShifts)} target="_top">Offer as open shift</a></Button><Button size="sm" disabled={asked.includes(babu.name)} onClick={() => ask([babu.name])}>{asked.includes(babu.name) ? 'Reminder sent' : 'Ask to renew'}</Button></>}
        >
          <span className="yx-tim-row">{babu.name}'s forklift licence expired {shortDate(babu.expires)} <DueBadge date={babu.expires} /></span>
          He can't be rostered on forklift duty until it's renewed, so his Thu 1 Oct morning shift needs someone else.
        </InlineAlert>
      )}
      <DataTable
        label="Licence requirements"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        onRetry={() => {}}
        toolbar={
          state === 'ready' && (
            <button type="button" className="yx-ppl__chip yx-ppl__chip--toggle" aria-pressed={onlyAction} onClick={() => setOnlyAction(!onlyAction)}>
              {onlyAction && <Icon icon={Check} size="sm" />}
              Only needing action ({lics.filter(act).length})
            </button>
          )
        }
        rowButtons={(r) => <><Button size="sm" disabled={!act(r)} title={act(r) ? undefined : `All holders valid for ${windowOf(r)}+ days`} onClick={() => setHolders(r)}>Who needs action</Button><Button size="sm" onClick={() => openEdit(r)}>Edit</Button></>}
        empty={
          onlyAction ? (
            <EmptyState title="No licences need action" description="Every holder's licence is valid past its first reminder." action={<Button onClick={() => setOnlyAction(false)}>Show all</Button>} />
          ) : (
            <EmptyState title="No licence requirements yet" description="Add one for a role, skill or shift that needs a licence to work." action={<Button variant="primary" onClick={() => openEdit('new')}>Add requirement</Button>} />
          )
        }
      />
      <Drawer open={!!holders} onOpenChange={(o) => !o && setHolders(null)} title={holders ? `${holders.req} · ${holders.licence}` : ''} subtitle={holders ? `${actionCount(holders, overrides)} of ${holders.holders} need action · reminders ${daysList(holders.remind)} days before expiry` : undefined}>
        {holders && (holders.watch.length ? (
          <div className="yx-tim-stack">
            <span className="yx-tim-row">
              <Button size="sm" disabled={drawerNames.every((n) => asked.includes(n))} onClick={() => ask(drawerNames)}>{drawerNames.every((n) => asked.includes(n)) ? 'All asked to renew' : 'Ask all to renew'}</Button>
            </span>
            <ul className="yx-tim-list">
              {[...holders.watch].sort((a, b) => a.expires.getTime() - b.expires.getTime()).map((h) => {
                const gone = daysUntil(h.expires, TODAY) < 0;
                return (
                  <li key={h.name}>
                    <PersonLabel name={h.name} secondary={overrides[h.name] ? `Overridden: ${overrides[h.name]}` : `${gone ? 'Expired' : 'Expires'} ${longDate(h.expires)}`} />
                    <span className="yx-tim-row">
                      <DueBadge date={h.expires} />
                      <Button size="sm" disabled={asked.includes(h.name)} onClick={() => ask([h.name])}>{asked.includes(h.name) ? 'Reminder sent' : 'Ask to renew'}</Button>
                      {/* Company licences only: HR can let an expired holder be rostered, with a reason. */}
                      {!holders.legal && gone && !overrides[h.name] && <Button size="sm" onClick={() => { setOverrideFor(h.name); setOverrideReason(''); }}>Override…</Button>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : <p className="yx-tim-muted">{holders.holders ? `All ${holders.holders} holders have a licence valid for more than ${windowOf(holders)} days.` : 'No holders yet.'}</p>)}
      </Drawer>
      <Dialog
        open={!!overrideFor}
        onOpenChange={(o) => !o && setOverrideFor(null)}
        title={overrideFor ? `Override for ${overrideFor}` : ''}
        footer={<>{!overrideReason.trim() && <span className="yx-tim-muted">Enter a reason</span>}<Button onClick={() => setOverrideFor(null)}>Cancel</Button><Button variant="primary" disabled={!overrideReason.trim()} onClick={() => { if (overrideFor) setOverrides({ ...overrides, [overrideFor]: overrideReason.trim() }); setOverrideFor(null); }}>Override</Button></>}
      >
        <div className="yx-tim-stack">
          <p className="yx-tim-muted">{overrideFor} can be rostered while the company licence is renewed. The override and its reason are logged.</p>
          <FormField label="Reason" required><TextField value={overrideReason} placeholder="For example Renewal course booked for 6 Oct" onChange={setOverrideReason} /></FormField>
        </div>
      </Dialog>
      <Dialog
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit === 'new' ? 'Add requirement' : 'Edit requirement'}
        footer={<>{missing && <span className="yx-tim-muted">{missing}</span>}<Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" disabled={!!missing} onClick={saveEdit}>Save requirement</Button></>}
      >
        <div className="yx-tim-stack">
          <FormField label="Required for"><Segment label="Required for" value={kind} onChange={setKind} options={(['Role', 'Skill', 'Shift'] as const).map((k) => ({ value: k, label: k }))} /></FormField>
          <FormField label={kind} required><TextField value={req} onChange={setReq} /></FormField>
          <FormField label="Licence" required><TextField value={licence} onChange={setLicence} /></FormField>
          <FormField label="Type" helper={legal === 'legal' ? 'Required by law: no one can override it.' : 'Company rule: HR can override it with a reason.'}>
            <Segment label="Type" value={legal} onChange={setLegal} options={[{ value: 'legal', label: 'Legal' }, { value: 'company', label: 'Company' }]} />
          </FormField>
          <FieldRow>
            {['First reminder (days before)', 'Second reminder', 'Last reminder'].map((l, i) => (
              <FormField key={l} label={l} required><NumberField value={remind[i]} min={1} max={365} onChange={(v) => setRemind(remind.map((x, j) => (j === i ? v : x)))} /></FormField>
            ))}
          </FieldRow>
        </div>
      </Dialog>
    </TimePage>
  );
}

/* =====================================================================
   TIM-41 · Hybrid policy and team office-day planner
   ===================================================================== */

/** Divya's reports in the Chennai office (S3: my reports, not a department filter). */
const HYBRID_TEAM = myReports().filter((p) => p.location === 'Chennai office').map((p) => p.name);
const HYBRID_EMP: TimeUser = { name: 'Arun Prakash', email: 'arun.p@kaverifoods.in', role: 'QA Engineer' };
const WEEK_DAYS = ['Mon 5', 'Tue 6', 'Wed 7', 'Thu 8', 'Fri 9'];
const WD5 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const ANCHOR = [1, 3];
const OFFICE_TARGET = 3;
const initialPlan = (): Record<string, boolean[]> =>
  Object.fromEntries(HYBRID_TEAM.map((p, i) => [p, WEEK_DAYS.map((_, d) => ANCHOR.includes(d) || (p !== 'Rahul Deshpande' && (i + d) % 3 === 0))]));
const COMPLIANCE: { name: string; fact: string; days: number }[] = [
  { name: 'Arun Prakash', fact: '3 office days', days: 3 },
  { name: 'Meera Krishnan', fact: '3 office days', days: 3 },
  { name: 'Fathima Beevi', fact: '3 office days', days: 3 },
  { name: 'Nisha Menon', fact: '2 office + 1 on duty', days: 3 },
  { name: 'Rahul Deshpande', fact: '1 office day', days: 1 },
  { name: 'Priya Shankar', fact: '2 office + 1 leave', days: 3 },
];
const EVIDENCE = ['Punch inside an office geofence', 'Kiosk check-in', 'Badge swipe (access control)'];
interface Policy { group: string; days: number; anchors: number[]; payLink: boolean; evidence: string[] }
const POLICY_GROUPS = ['Chennai office · Quality, Engineering', 'Chennai office · all staff', 'Bengaluru head office · all staff'];
const POLICY0: Policy = { group: POLICY_GROUPS[0], days: OFFICE_TARGET, anchors: ANCHOR, payLink: false, evidence: EVIDENCE.slice(0, 2) };
const dayList = (ds: number[]) => ds.map((i) => WD5[i]).join(' and ');
const policyText = (p: Policy) =>
  `${p.group} · ${p.days} office days a week · ${p.anchors.length ? `anchor days ${dayList(p.anchors)}` : 'no anchor days'} · ${p.payLink ? 'linked to pay deductions or ratings' : 'not linked to pay or ratings'}`;
const samePolicy = (a: Policy, b: Policy) => a.group === b.group && a.days === b.days && a.payLink === b.payLink && a.anchors.join() === b.anchors.join() && a.evidence.join() === b.evidence.join();

/** The week now running (28 Sep – 2 Oct): read-only, today marked. */
const NOW_WEEK = new Date(2026, 8, 28);
type HybridWeek = 'now' | 'next';
function WeekBar({ wk, onWk }: { wk: HybridWeek; onWk: (w: HybridWeek) => void }) {
  return (
    <div className="yx-tim-row">
      <IconButton icon={ChevronLeft} label="Previous week" size="sm" disabled={wk === 'now'} onClick={() => onWk('now')} />
      <strong>Week of {wk === 'now' ? '28 Sep' : '5 Oct'} 2026</strong>
      <IconButton icon={ChevronRight} label="Next week" size="sm" disabled={wk === 'next'} onClick={() => onWk('next')} />
      <span className="yx-tim-muted">{wk === 'now' ? 'This week · earlier weeks are in Compliance' : 'Plans open one week ahead'}</span>
    </div>
  );
}
/** Who is in the office each day this week (the plan already made), with today and holidays marked. */
function NowWeek({ anchors, me }: { anchors: number[]; me?: string }) {
  // This week's plan was saved last week; the same team pattern as the opening plan for 5 Oct.
  const plan = useMemo(initialPlan, []);
  return (
    <Card title="Who's in this week">
      <ul className="yx-tim-days">
        {WD5.map((_, j) => {
          const d = addDays(NOW_WEEK, j);
          const hol = HOLIDAYS.find((h) => h.date.getTime() === d.getTime());
          const names = HYBRID_TEAM.filter((p) => anchors.includes(j) || plan[p]?.[j]).map((p) => (p === me ? 'You' : p));
          return (
            <li key={j}>
              <span className="yx-tim-row">{dayName(d)}{d.getTime() === TODAY.getTime() && <Badge tone="info">Today</Badge>}</span>
              <span>{hol ? `Holiday · ${hol.name}` : anchors.includes(j) ? 'Everyone (anchor day)' : names.length ? names.join(', ') : 'No one'}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** One day of one person's plan: Home | Office, or the fixed anchor badge. */
function DayChoice({ label, anchor, office, onChange }: { label: string; anchor: boolean; office: boolean; onChange: (office: boolean) => void }) {
  return anchor
    ? <Badge tone="info"><Icon icon={Lock} size="sm" /> Office · anchor</Badge>
    : <Segment label={label} value={office ? 'office' : 'home'} onChange={(v) => onChange(v === 'office')} options={[{ value: 'home', label: 'Home' }, { value: 'office', label: 'Office' }]} />;
}

export function HybridPlannerScreen({ persona = 'mgr', tab = 'plan' }: { persona?: 'hr' | 'mgr' | 'emp'; tab?: 'plan' | 'compliance' | 'policy' }) {
  const [baseline, setBaseline] = useState(initialPlan);
  const [plan, setPlan] = useState(initialPlan);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [reminded, setReminded] = useState<string[]>([]);
  const [remindMsg, setRemindMsg] = useState<string | null>(null);
  const [wk, setWk] = useState<HybridWeek>('next');
  /** One policy per group; HR picks the group first and edits that group's policy. */
  const [policies, setPolicies] = useState<Record<string, Policy>>({ [POLICY0.group]: POLICY0 });
  const [draft, setDraft] = useState(POLICY0);
  const [policySaved, setPolicySaved] = useState(false);
  // The planner follows the team's own group policy; the HR form follows the group being edited.
  const policy = policies[POLICY0.group];
  const groupPolicy = policies[draft.group];
  const policyDirty = !groupPolicy || !samePolicy(draft, groupPolicy);
  const narrow = useNarrow();
  const emp = persona === 'emp';
  const hr = persona === 'hr';
  const people = emp ? [HYBRID_EMP.name] : HYBRID_TEAM;
  const setDay = (p: string, d: number, office: boolean) => {
    setPlan({ ...plan, [p]: plan[p].map((v, j) => (j === d ? office : v)) });
    setSavedMsg(null);
  };
  // The saved policy drives the planner: anchor days are always office days, and the target is its office days.
  const anchors = policy.anchors;
  const target = policy.days;
  const isAnchor = (d: number) => anchors.includes(d);
  const officeOn = (p: string, d: number) => isAnchor(d) || plan[p][d];
  const inOffice = (d: number) => HYBRID_TEAM.filter((p) => officeOn(p, d));
  const shortOf = (p: string) => target - WEEK_DAYS.filter((_, d) => officeOn(p, d)).length;
  const anchorHint = anchors.length ? `${dayList(anchors)} ${anchors.length === 1 ? 'is an anchor day' : 'are anchor days'}: everyone is in the office.` : '';
  const daysError = draft.days > 5 ? 'At most 5 days' : draft.days < Math.max(1, draft.anchors.length) ? `At least ${Math.max(1, draft.anchors.length)}${draft.anchors.length ? ', the number of anchor days' : ''}` : null;
  const changed = people.filter((p) => plan[p].some((v, j) => v !== baseline[p][j]));
  const savePlan = () => {
    setBaseline(plan);
    setSavedMsg(emp ? 'Plan for week of 5 Oct saved' : `Plan for week of 5 Oct saved · ${changed.join(', ')} notified`);
  };
  /** Remind sends a reminder about the week of 5 Oct and says what was sent. */
  const remindBtn = (key: string, label: string, msg: string) => (
    <Button size="sm" disabled={reminded.includes(key)} onClick={() => { setReminded([...reminded, key]); setRemindMsg(msg); }}>{reminded.includes(key) ? 'Reminded' : label}</Button>
  );
  const vsTarget = (p: string) => {
    const s = shortOf(p);
    return s > 0
      ? <span className="yx-tim-row"><Badge tone="warning">Short by {s}</Badge>{!emp && remindBtn(`plan:${p}`, 'Remind', `Reminder sent to ${p}: pick ${s} more office ${s === 1 ? 'day' : 'days'} for the week of 5 Oct`)}</span>
      : <span className="yx-tim-muted">{target - s} of {target}</span>;
  };
  const updPolicy = (patch: Partial<Policy>) => { setDraft({ ...draft, ...patch }); setPolicySaved(false); };
  /** Switching group opens that group's own policy (or a blank one); unsaved edits are confirmed first. */
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const openGroup = (g: string) => {
    setDraft(policies[g] ?? { group: g, days: OFFICE_TARGET, anchors: [], payLink: false, evidence: EVIDENCE.slice(0, 1) });
    setPolicySaved(false);
    setSwitchTo(null);
  };

  const planTab = wk === 'now' ? (
    <div className="yx-tim-stack">
      <WeekBar wk={wk} onWk={setWk} />
      <NowWeek anchors={anchors} me={emp ? HYBRID_EMP.name : undefined} />
    </div>
  ) : (
    <div className="yx-tim-stack">
      <WeekBar wk={wk} onWk={setWk} />
      <p className="yx-tim-muted">{emp ? 'Pick Home or Office for each day.' : 'Click a day to switch it between Home and Office.'} {anchorHint}</p>
      {emp && <p className="yx-tim-row"><strong>You: {target - shortOf(HYBRID_EMP.name)} of {target} office days</strong>{shortOf(HYBRID_EMP.name) > 0 && <Badge tone="warning">Short by {shortOf(HYBRID_EMP.name)}</Badge>}</p>}
      {narrow ? (
        <ul className="yx-tim-list">
          {emp
            ? WEEK_DAYS.map((d, j) => {
                const others = inOffice(j).filter((p) => p !== HYBRID_EMP.name);
                return (
                  <li key={d}>
                    <span className="yx-tim-list__main">
                      <strong>{d} Oct</strong>
                      <DayChoice label={`${d} Oct`} anchor={isAnchor(j)} office={plan[HYBRID_EMP.name][j]} onChange={(o) => setDay(HYBRID_EMP.name, j, o)} />
                      <span className="yx-tim-muted">{isAnchor(j) ? 'Everyone is in' : others.length ? `Also in: ${others.join(', ')}` : 'No one else is in'}</span>
                    </span>
                  </li>
                );
              })
            // Anchor days are fixed (said once in the hint above), so each card shows only the days to choose.
            : people.map((p) => (
                <li key={p}>
                  <span className="yx-tim-list__main">
                    <span className="yx-tim-row"><strong>{p}</strong>{vsTarget(p)}</span>
                    <span className="yx-tim-row">
                      {WEEK_DAYS.map((d, j) => !isAnchor(j) && (
                        <Button key={d} size="sm" aria-label={`${p}, ${d}: ${plan[p][j] ? 'Office' : 'Home'}. Change to ${plan[p][j] ? 'home' : 'office'}`} onClick={() => setDay(p, j, !plan[p][j])}>{WD5[j]} · {plan[p][j] ? 'Office' : 'Home'}</Button>
                      ))}
                    </span>
                  </span>
                </li>
              ))}
        </ul>
      ) : (
        <div className="yx-tim-muster" tabIndex={0} role="region" aria-label="Office-day plan">
          <table aria-label="Office-day plan, week of 5 Oct">
            <thead><tr>{!emp && <th scope="col">Person</th>}{WEEK_DAYS.map((d) => <th key={d} scope="col">{d}</th>)}{!emp && <th scope="col">Office days</th>}</tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p}>
                  {!emp && <th scope="row">{p}</th>}
                  {WEEK_DAYS.map((d, j) => {
                    const office = plan[p][j];
                    return (
                      <td key={d}>
                        {/* The employee row has room for the Home | Office choice; the manager grid keeps a compact switch. */}
                        {isAnchor(j)
                          ? <Badge tone="info"><Icon icon={Lock} size="sm" /> Anchor</Badge>
                          : emp
                            ? <DayChoice label={`${d} Oct`} anchor={false} office={office} onChange={(o) => setDay(p, j, o)} />
                            : <Button size="sm" aria-label={`${p}, ${d}: ${office ? 'Office' : 'Home'}. Change to ${office ? 'home' : 'office'}`} onClick={() => setDay(p, j, !office)}>{office ? 'Office' : 'Home'}</Button>}
                      </td>
                    );
                  })}
                  {!emp && <td className="yx-tim-muster__total">{vsTarget(p)}</td>}
                </tr>
              ))}
            </tbody>
            {!emp && (
              <tfoot>
                <tr><th scope="row">In office</th>{WEEK_DAYS.map((d, j) => <td key={d} className="yx-tim-muster__total">{inOffice(j).length} of {HYBRID_TEAM.length}</td>)}<td /></tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {emp && !narrow && (
        <Card title="Who else is in">
          <ul className="yx-tim-days">
            {WEEK_DAYS.map((d, j) => {
              const others = inOffice(j).filter((p) => p !== HYBRID_EMP.name);
              return <li key={d}><span>{d} Oct</span><span>{isAnchor(j) ? 'Everyone (anchor day)' : others.length ? others.join(', ') : 'No one else'}</span></li>;
            })}
          </ul>
        </Card>
      )}
      {remindMsg && <InlineAlert tone="success" title={remindMsg} />}
      {savedMsg && <InlineAlert tone="success" title={savedMsg} />}
      <span className="yx-tim-row">
        <Button variant="primary" disabled={!changed.length} onClick={savePlan}>Save plan</Button>
        {!changed.length && !savedMsg && <span className="yx-tim-muted">No changes yet</span>}
      </span>
    </div>
  );

  const policyForm = (
    <div className="yx-tim-form">
      <FormField label="Policy for" helper={groupPolicy ? undefined : 'This group has no policy yet. Save to add one.'}>
        <Select value={draft.group} onChange={(v) => v && v !== draft.group && (policyDirty && groupPolicy ? setSwitchTo(v) : openGroup(v))} options={POLICY_GROUPS.map((g) => ({ value: g, label: `${g}${policies[g] ? '' : ' · no policy yet'}` }))} />
      </FormField>
      <FormField label="Office days per week" error={daysError}><NumberField value={draft.days} min={0} max={5} onChange={(v) => updPolicy({ days: v ?? 0 })} /></FormField>
      <FormField label="Anchor days" helper="Everyone is in the office on these days">
        <div className="yx-tim-row">{WD5.map((d, i) => <Checkbox key={d} label={d} checked={draft.anchors.includes(i)} onChange={(c) => updPolicy({ anchors: c ? [...draft.anchors, i].sort((x, y) => x - y) : draft.anchors.filter((x) => x !== i) })} />)}</div>
      </FormField>
      <FormField label="Evidence" helper="What counts as a day in the office">
        <div className="yx-tim-stack">
          {EVIDENCE.map((e) => <Checkbox key={e} label={e} checked={draft.evidence.includes(e)} onChange={(c) => updPolicy({ evidence: EVIDENCE.filter((x) => (x === e ? c : draft.evidence.includes(x))) })} />)}
        </div>
      </FormField>
      <FormField label="Pay and ratings">
        <Checkbox label="Link to pay deductions or ratings" description={draft.payLink ? 'Missed office days can reduce pay or ratings. Set the amounts in pay rules.' : "Missed office days don't affect pay or ratings."} checked={draft.payLink} onChange={(c) => updPolicy({ payLink: c })} />
      </FormField>
      {policySaved && groupPolicy && <InlineAlert tone="success" title="Policy saved">Applies from the week of 5 Oct to {groupPolicy.group}. Evidence: {groupPolicy.evidence.length ? groupPolicy.evidence.join(', ').toLowerCase() : 'none'}.</InlineAlert>}
      <span className="yx-tim-row">
        <Button variant="primary" disabled={!policyDirty || !!daysError || !draft.evidence.length} onClick={() => { setPolicies({ ...policies, [draft.group]: draft }); setPolicySaved(true); }}>Save policy</Button>
        {!policyDirty && !policySaved ? <span className="yx-tim-muted">No changes yet</span> : daysError ? <span className="yx-tim-muted">Fix office days per week</span> : !draft.evidence.length ? <span className="yx-tim-muted">Pick at least one kind of evidence</span> : null}
      </span>
      <ConfirmDialog
        open={!!switchTo}
        onOpenChange={(o) => !o && setSwitchTo(null)}
        title={`Discard your changes to the ${draft.group} policy?`}
        consequence={switchTo ? `You haven't saved them. ${switchTo} opens with its own policy.` : undefined}
        confirmLabel="Discard and switch"
        onConfirm={() => { if (switchTo) openGroup(switchTo); }}
      />
    </div>
  );

  return (
    <TimePage active={emp ? 'My office days' : 'Office days'} user={hr ? HR_ADMIN : emp ? HYBRID_EMP : ME}>
      {/* The planner hint names the anchor days, so the planner header keeps to the group and target. */}
      <PageHeader title={hr ? 'Hybrid policy' : emp ? 'My office days' : 'Office days · Quality team'} description={hr ? (groupPolicy ? `Policy: ${policyText(groupPolicy)}` : `${draft.group} · no policy yet`) : `${policy.group} · ${policy.days} office days a week`} />
      {hr ? policyForm : emp ? planTab : (
        <Tabs defaultValue={tab === 'policy' ? 'plan' : tab}>
          <TabsList aria-label="Hybrid">
            <TabsTrigger value="plan">Plan week</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
          </TabsList>
          <TabsContent value="plan">{planTab}</TabsContent>
          <TabsContent value="compliance">
            <Card title="Week of 21 Sep">
              <ul className="yx-tim-list">
                {COMPLIANCE.map((r) => (
                  <li key={r.name}>
                    <PersonLabel name={r.name} secondary={r.fact} />
                    {r.days >= target ? <Badge tone="success">Met</Badge> : (
                      <span className="yx-tim-row">
                        <Badge tone="warning">{r.days} of {target}</Badge>
                        {/* The week is over, so the reminder is about planning next week. */}
                        {remindBtn(`comp:${r.name}`, 'Remind about next week', `Reminder sent to ${r.name}: plan ${target} office days for the week of 5 Oct`)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {remindMsg && <InlineAlert tone="success" title={remindMsg} />}
              <p className="yx-tim-note">On-duty days and leave days count as office days.</p>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </TimePage>
  );
}

/** Arun Prakash's phone plan for the week of 5 Oct. */
export function HybridPhone() {
  const team = useMemo(initialPlan, []);
  const [baseline, setBaseline] = useState(() => team[HYBRID_EMP.name]);
  const [office, setOffice] = useState(() => team[HYBRID_EMP.name]);
  const [saved, setSaved] = useState(false);
  // Same policy and the same list body as the employee planner at phone width.
  const { anchors, days: target } = POLICY0;
  const isAnchor = (j: number) => anchors.includes(j);
  const count = office.filter((v, j) => v || isAnchor(j)).length;
  const short = target - count;
  const dirty = office.some((v, j) => v !== baseline[j]);
  return (
    <PhoneFrame tab="time" title="My office days" user={HYBRID_EMP}>
      <p className="yx-tim-muted">Week of 5 Oct 2026. Pick Home or Office for each day. {dayList(anchors)} {anchors.length === 1 ? 'is an anchor day' : 'are anchor days'}: everyone is in the office.</p>
      <p className="yx-tim-row"><strong>You: {count} of {target} office days</strong>{short > 0 && <Badge tone="warning">Short by {short}</Badge>}</p>
      <ul className="yx-tim-list">
        {WEEK_DAYS.map((d, j) => {
          const others = HYBRID_TEAM.filter((p) => p !== HYBRID_EMP.name && (isAnchor(j) || team[p][j]));
          return (
            <li key={d}>
              <span className="yx-tim-list__main">
                <strong>{d} Oct</strong>
                <DayChoice label={`${d} Oct`} anchor={isAnchor(j)} office={office[j]} onChange={(o) => { setOffice(office.map((x, k) => (k === j ? o : x))); setSaved(false); }} />
                <span className="yx-tim-muted">{isAnchor(j) ? 'Everyone is in' : others.length ? `Also in: ${others.join(', ')}` : 'No one else is in'}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {saved && <InlineAlert tone="success" title="Plan for week of 5 Oct saved" />}
      <span className="yx-tim-row">
        <Button variant="primary" disabled={!dirty} onClick={() => { setBaseline(office); setSaved(true); }}>Save plan</Button>
        {!dirty && !saved && <span className="yx-tim-muted">No changes yet</span>}
      </span>
    </PhoneFrame>
  );
}
