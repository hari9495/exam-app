// TIM-38 · Standby and call-out, live: the designed StandbyScreen (roster.tsx) with the API's standby slots, call-out log,
// rest check and "Move next shift". Same header, week Segment, legend, read-only roster grid, call-out log rows, log
// dialog (person on standby, start, end, reason, source, the effect) and move confirmation. The standby slot dialog
// (StandbySlotDialog, story TIM-38 SetStandby) sets and cancels slots. Money is payroll's: no allowance or rates here.
import { useMemo, useState } from 'react';
import { Segment } from '../people/people-kit';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { useToast } from '../../components/notify';
import { Dialog } from '../../components/overlay';
import { Card, PageHeader } from '../../components/shell';
import { RosterGrid, type RosterValue, type Shift } from '../../components/roster';
import { TextField, TimeField } from '../../components/inputs';
import { FieldRow, FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { useNarrow } from '../../components/stepper';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { TimePage } from './time-kit';
import { LoadingBlock } from './attendance';
import { fmt12 } from './time-logic';
import { localDate } from './open-shifts-live';
import { Legend } from './roster';
import type { LoadState } from './live/types';

export interface StandbyShift { id: string; code: string; name: string; start: string; end: string }
export interface StandbyCallOut {
  id: string;
  employeeId: string;
  name: string;
  startedAt: string;
  endedAt: string;
  workedMinutes: number;
  paidMinutes: number;
  minimumApplied: boolean;
  reason: string;
  /** The person's next published shift after the call-out, and the rest left before it (rule 1). */
  next: { on: string; shiftId: string | null; name: string; start: string; end: string; startsAt: string } | null;
  restMinutes: number | null;
  minRestMinutes: number | null;
  short: boolean;
  /** The person's latest call-out: only it offers "Move next shift". */
  latest?: boolean;
  repeat?: boolean;
}
export interface StandbySlot { id: string; employeeId: string; name: string; startsAt: string; endsAt: string; status: 'planned' | 'cancelled'; started: boolean }
export interface StandbyData {
  week: string;
  today: string;
  minimumHours: number;
  /** The people the viewer plans (the slot dialog's list). */
  planned: { employeeId: string; name: string }[];
  shifts: StandbyShift[];
  slots: StandbySlot[];
  people: { employeeId: string; name: string; days: { on: string; employed: boolean; standby: boolean; shift: { id: string | null; code: string | null; name: string; start: string; end: string } | null }[] }[];
  callOuts: StandbyCallOut[];
}
export interface LiveStandby {
  state: LoadState;
  data: StandbyData | null;
  onRetry?: () => void;
  /** Monday of the week on screen. */
  week: string;
  onWeek: (week: string) => void;
  onSlot: (input: { employeeId: string; startsAt: string; endsAt: string }) => Promise<unknown>;
  onCancelSlot: (id: string) => Promise<unknown>;
  onCallOut: (input: { employeeId: string; startedAt: string; endedAt: string; reason: string; clientRef: string }) => Promise<StandbyCallOut>;
  onMove: (input: { employeeId: string; on: string; shiftId: string | null; reason?: string }) => Promise<unknown>;
}

const IST = 'Asia/Kolkata';
const hm = (mins: number) => `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} m` : ''}`;
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (iso: string, n: number) => toIso(new Date(localDate(iso).getTime() + n * 86_400_000 + 3_600_000));
/** "2026-11-03" and "22:00" (IST) as an instant. */
const instant = (on: string, time: string) => new Date(`${on}T${time}:00+05:30`);
const istParts = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { on: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Tue 3 Nov 2026, 2:30 am" in IST: the weekday stays a short separate word. */
const when = (iso: string) => {
  const { on, time } = istParts(iso);
  return `${WD[localDate(on).getDay()]} ${formatDate(localDate(on))}, ${fmt12(time)}`;
};
const clockOf = (iso: string) => fmt12(istParts(iso).time);
const shiftTimes = (s: { start: string; end: string }) => `${fmt12(s.start)} – ${fmt12(s.end)}`.replace(/:00/g, '');
const lengthHours = (s: { start: string; end: string }) => {
  const [a, b] = [s.start, s.end].map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));
  return Math.round((((b - a + 1440) % 1440) / 60) * 10) / 10;
};
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16)));

/** The standby slot dialog: who, from and until (at most 24 h). Presentational, so the design story can show it. */
export function StandbySlotDialog({ open, onOpenChange, people, today, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; people: { employeeId: string; name: string }[]; today: string; onSave: (input: { employeeId: string; startsAt: string; endsAt: string }) => Promise<unknown> }) {
  const { toast } = useToast();
  const [who, setWho] = useState<string | null>(people[0]?.employeeId ?? null);
  const [fromDay, setFromDay] = useState<Date | null>(localDate(today));
  const [fromTime, setFromTime] = useState<string | null>('18:00');
  const [toDay, setToDay] = useState<Date | null>(localDate(plusDays(today, 1)));
  const [toTime, setToTime] = useState<string | null>('06:00');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = fromDay && fromTime ? instant(toIso(fromDay), fromTime) : null;
  const end = toDay && toTime ? instant(toIso(toDay), toTime) : null;
  const span = start && end ? (end.getTime() - start.getTime()) / 60_000 : null;
  const problem: [string, string] | null = !who ? ['sb-who', 'Pick who is on standby'] : !start ? ['sb-from', 'Enter when standby starts'] : !end ? ['sb-to', 'Enter when standby ends'] : span! <= 0 ? ['sb-to', 'The end must be after the start'] : span! > 24 * 60 ? ['sb-to', 'A standby slot is at most 24 hours'] : null;
  const save = async () => {
    if (problem) {
      setTried(true);
      document.getElementById(problem[0])?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ employeeId: who!, startsAt: start!.toISOString(), endsAt: end!.toISOString() });
      toast({ title: 'Standby set', description: `${people.find((p) => p.employeeId === who)?.name ?? 'They'} ${people.length ? 'is told.' : ''}`, tone: 'success' });
      setTried(false);
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const err = (id: string) => (tried && problem?.[0] === id ? problem[1] : undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Set standby" footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Set standby</Button></>}>
      <div className="yx-tim-stack">
        {error && <InlineAlert tone="danger" title="Not set">{error}</InlineAlert>}
        <FormField id="sb-who" label="Person on standby" required error={err('sb-who')}><Select value={who} onChange={setWho} options={people.map((p) => ({ value: p.employeeId, label: p.name }))} /></FormField>
        <FieldRow>
          <FormField label="From" required><DatePicker value={fromDay} min={localDate(today)} onChange={setFromDay} /></FormField>
          <FormField id="sb-from" label="At" required error={err('sb-from')}><TimeField id="sb-from" value={fromTime} onChange={setFromTime} /></FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Until" required><DatePicker value={toDay} min={fromDay ?? localDate(today)} onChange={setToDay} /></FormField>
          <FormField id="sb-to" label="At" required error={err('sb-to')}><TimeField id="sb-to" value={toTime} onChange={setToTime} /></FormField>
        </FieldRow>
        <p className="yx-tim-muted">Standby is not a working shift. At most 24 hours, and never two slots at once for one person. Times are India time.</p>
      </div>
    </Dialog>
  );
}

export function LiveStandbyScreen({ live: p }: { live: LiveStandby }) {
  const d = p.data;
  const { toast } = useToast();
  const narrow = useNarrow();
  const [logOpen, setLogOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [moving, setMoving] = useState<StandbyCallOut | null>(null);
  const thisWeek = d ? mondayOfIso(d.today) : p.week;
  const wk: 'this' | 'next' = p.week === thisWeek ? 'this' : 'next';
  const minimum = d?.minimumHours ?? 2;

  const shifts: Shift[] = useMemo(
    () => [
      ...(d?.shifts ?? []).map((s, i) => ({ code: s.code, name: s.name, start: s.start, end: s.end, hours: lengthHours(s), color: (i % 5) + 1 })),
      { code: 'SB', name: 'Standby', hours: 0, color: 6, displayStart: '18:00' },
      { code: 'OFF', name: 'Weekly off', hours: 0 },
    ],
    [d],
  );
  const value: RosterValue = useMemo(() => Object.fromEntries((d?.people ?? []).map((x) => [x.employeeId, x.days.map((c) => (!c.employed ? null : c.shift ? (c.shift.code ?? null) : c.standby ? 'SB' : 'OFF'))])), [d]);
  const people = (d?.people ?? []).map((x) => ({ id: x.employeeId, name: x.name }));

  const row = (c: StandbyCallOut) => {
    const short = c.short && c.restMinutes !== null;
    const actions = short && (
      <span className="yx-tim-row">
        <Badge tone="warning">{c.latest ? `Rest ${hm(Math.max(0, c.restMinutes!))}` : `Rest was ${hm(Math.max(0, c.restMinutes!))}`}</Badge>
        {c.latest && c.next && <Button size="sm" onClick={() => setMoving(c)}>Move next shift</Button>}
      </span>
    );
    return (
      <li key={c.id}>
        <span className="yx-tim-list__main">
          <strong>{c.name} · {when(c.startedAt)} – {clockOf(c.endedAt)}</strong>
          <span className="yx-tim-muted">{c.reason} · worked {hm(c.workedMinutes)} · paid {hm(c.paidMinutes)}{c.minimumApplied ? ' (minimum)' : ''} · counts towards weekly hours</span>
          {c.next
            ? <span className="yx-tim-muted">Next shift {when(c.next.startsAt)} ({c.next.name}) · {hm(Math.max(0, c.restMinutes ?? 0))} rest{short ? ` (needs ${hm(c.minRestMinutes ?? 660)})` : ''}</span>
            : <span className="yx-tim-muted">No shift in the next 7 days</span>}
          {narrow && actions}
        </span>
        {!narrow && actions}
      </li>
    );
  };

  return (
    <TimePage active="Roster">
      <PageHeader
        title="Standby and call-outs"
        description={`Standby is not a working shift · call-out paid at least ${minimum} h · standby allowance and call-out rates are set in Pay`}
        actions={p.state === 'ready' && d ? <div className="yx-tim-row"><Button onClick={() => setSlotOpen(true)}>Set standby</Button><Button variant="primary" onClick={() => setLogOpen(true)}>Log call-out</Button></div> : undefined}
      />
      {p.state === 'loading' || (p.state === 'ready' && !d) ? (
        <LoadingBlock rows={6} />
      ) : p.state === 'error' ? (
        <ErrorState title="Standby didn't load" description="Check your connection and try again. Nothing you logged is lost." onRetry={p.onRetry} />
      ) : p.state === 'no-access' ? (
        <NoAccessState what="standby and call-outs" grantedBy="HR" />
      ) : d && (
        <>
          <div className="yx-tim-stack">
            <Segment label="Week" value={wk} onChange={(w) => p.onWeek(w === 'this' ? thisWeek : plusDays(thisWeek, 7))} options={[{ value: 'this', label: `This week · ${formatDate(localDate(thisWeek))}` }, { value: 'next', label: `Next week · ${formatDate(localDate(plusDays(thisWeek, 7)))}` }]} />
            {people.length ? (
              <>
                <Legend shifts={shifts} />
                <RosterGrid key={`${d.week}-${d.callOuts.length}`} people={people} start={localDate(d.week)} shifts={shifts} defaultValue={value} rules={{ minRestHours: (d.callOuts[0]?.minRestMinutes ?? 660) / 60 }} defaultStatus="published" readOnly today={localDate(d.today)} />
              </>
            ) : (
              <EmptyState title="No one on standby this week" description="Set standby for the people you plan. A call-out can be logged only during a standby slot." action={<Button onClick={() => setSlotOpen(true)}>Set standby</Button>} />
            )}
            <p className="yx-tim-note">Call-outs count towards hours and rest. The rest left before the next shift shows on each call-out; if it is short, move that shift.</p>
          </div>
          {d.slots.length > 0 && (
            <Card title="Standby slots">
              <ul className="yx-tim-list">
                {d.slots.map((s) => (
                  <li key={s.id}>
                    <span className="yx-tim-list__main">
                      <strong>{s.name} · {when(s.startsAt)} – {when(s.endsAt)}</strong>
                      <span className="yx-tim-muted">{s.status === 'cancelled' ? 'Cancelled' : s.started ? 'Started' : 'Planned'}</span>
                    </span>
                    {s.status === 'planned' && !s.started && <Button size="sm" onClick={() => void p.onCancelSlot(s.id).then(() => toast({ title: 'Standby cancelled', description: `${s.name} is told.`, tone: 'success' }), (e) => toast({ title: errorText(e), tone: 'error' }))}>Cancel</Button>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Call-out log">
            {d.callOuts.length ? <ul className="yx-tim-list">{d.callOuts.map(row)}</ul> : <p className="yx-tim-muted">No call-outs this week.</p>}
          </Card>
          <LogDialog open={logOpen} onOpenChange={setLogOpen} data={d} onCallOut={p.onCallOut} />
          <StandbySlotDialog open={slotOpen} onOpenChange={setSlotOpen} people={d.planned} today={d.today} onSave={p.onSlot} />
          {moving && <MoveDialog c={moving} shifts={d.shifts} onClose={() => setMoving(null)} onMove={p.onMove} />}
        </>
      )}
    </TimePage>
  );
}

function mondayOfIso(iso: string) {
  const day = localDate(iso).getDay();
  return plusDays(iso, -((day + 6) % 7));
}

function LogDialog({ open, onOpenChange, data, onCallOut }: { open: boolean; onOpenChange: (o: boolean) => void; data: StandbyData; onCallOut: LiveStandby['onCallOut'] }) {
  const { toast } = useToast();
  // Only slots that have started can have a call-out.
  const slots = data.slots.filter((s) => s.status === 'planned' && s.started);
  const [slotId, setSlotId] = useState<string | null>(slots[0]?.id ?? null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [source, setSource] = useState('Phone call');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState(uuid);
  const slot = slots.find((s) => s.id === slotId);
  // The times are on the slot's days: a time before the slot's start time is the next morning.
  const at = (time: string) => {
    const s = istParts(slot!.startsAt);
    return instant(time < s.time ? plusDays(s.on, 1) : s.on, time);
  };
  const a = slot && from ? at(from) : null;
  const bRaw = slot && to ? at(to) : null;
  const b = a && bRaw && bRaw <= a ? new Date(bRaw.getTime() + 86_400_000) : bRaw;
  const worked = a && b ? Math.round((b.getTime() - a.getTime()) / 60_000) : 0;
  const paid = Math.max(worked, data.minimumHours * 60);
  const problem: [string, string] | null = !slot ? ['co-slot', 'Pick the person on standby'] : !from ? ['co-from', 'Enter the start'] : !to ? ['co-to', 'Enter the end'] : b!.getTime() > Date.now() ? ['co-to', 'Log a call-out after it ends'] : !reason.trim() ? ['co-reason', 'Enter a reason'] : null;
  const err = (id: string) => (tried && problem?.[0] === id ? problem[1] : undefined);
  const save = async () => {
    if (problem) {
      setTried(true);
      document.getElementById(problem[0])?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await onCallOut({ employeeId: slot!.employeeId, startedAt: a!.toISOString(), endedAt: b!.toISOString(), reason: `${reason.trim()} (${source.toLowerCase()})`, clientRef: ref });
      toast({ title: 'Call-out logged', description: `Paid ${hm(r.paidMinutes)}${r.minimumApplied ? ' (call-out minimum)' : ''}.${r.next && r.restMinutes !== null ? ` ${hm(Math.max(0, r.restMinutes))} rest before the next shift${r.short ? `, needs ${hm(r.minRestMinutes ?? 660)}: use Move next shift in the log` : ''}.` : ''}`, tone: r.short ? 'warning' : 'success' });
      setRef(uuid());
      setFrom(null);
      setTo(null);
      setReason('');
      setTried(false);
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Log a call-out" footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save call-out</Button></>}>
      <div className="yx-tim-stack">
        {error && <InlineAlert tone="danger" title="Not logged">{error}</InlineAlert>}
        <FormField id="co-slot" label="Person on standby" required helper="Only standby slots that have started are listed" error={err('co-slot')}>
          {slots.length ? <Select value={slotId} onChange={setSlotId} options={slots.map((s) => ({ value: s.id, label: `${s.name} · standby ${when(s.startsAt)} – ${clockOf(s.endsAt)}` }))} /> : <p className="yx-tim-muted">No standby has started this week.</p>}
        </FormField>
        <FieldRow>
          <FormField id="co-from" label="Start" required error={err('co-from')}><TimeField id="co-from" value={from} onChange={setFrom} /></FormField>
          <FormField id="co-to" label="End" required error={err('co-to')}><TimeField id="co-to" value={to} onChange={setTo} /></FormField>
        </FieldRow>
        <FormField id="co-reason" label="Reason" required error={err('co-reason')}><TextField id="co-reason" value={reason} maxLength={250} placeholder="For example Compressor trip, Line 2" onChange={setReason} /></FormField>
        <FormField label="Source"><Select value={source} onChange={(v) => v && setSource(v)} options={[{ value: 'Phone call', label: 'Phone call' }, { value: 'Alarm system', label: 'Alarm system' }]} /></FormField>
        {!problem && (
          <InlineAlert tone="info" title="Effect">
            Paid {hm(paid)}{paid > worked ? ' (call-out minimum)' : ''}. The rest left before {slot?.name ?? 'their'}’s next shift shows in the log after you save.
          </InlineAlert>
        )}
      </div>
    </Dialog>
  );
}

function MoveDialog({ c, shifts, onClose, onMove }: { c: StandbyCallOut; shifts: StandbyShift[]; onClose: () => void; onMove: LiveStandby['onMove'] }) {
  const { toast } = useToast();
  const next = c.next!;
  const needMinutes = c.minRestMinutes ?? 660;
  // Suggested: the first shift that starts late enough after the call-out for the full rest.
  const ok = shifts.find((s) => instant(next.on, s.start).getTime() - new Date(c.endedAt).getTime() >= needMinutes * 60_000 && s.id !== next.shiftId);
  const [target, setTarget] = useState<string | null>(ok?.id ?? 'off');
  const [reason, setReason] = useState(`Rest after the call-out ${clockOf(c.startedAt)} – ${clockOf(c.endedAt)}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const save = async () => {
    if (!target) {
      setTried(true);
      document.getElementById('mv-to')?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onMove({ employeeId: c.employeeId, on: next.on, shiftId: target === 'off' ? null : target, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      toast({ title: 'Shift moved', description: `${c.name} is told at once.`, tone: 'success' });
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Move ${c.name}'s shift on ${formatDate(localDate(next.on))}?`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Move shift</Button></>}>
      <div className="yx-tim-stack">
        {error && <InlineAlert tone="danger" title="Not moved">{error}</InlineAlert>}
        <p className="yx-tim-muted">Now {next.name} {shiftTimes(next)}: {hm(Math.max(0, c.restMinutes ?? 0))} rest after the call-out (needs {hm(needMinutes)}). The roster is published, so {c.name} is told at once.</p>
        <FormField id="mv-to" label="Move to" required error={tried && !target ? 'Pick a shift or a day off' : undefined}><Select value={target} onChange={setTarget} options={[...shifts.filter((s) => s.id !== next.shiftId).map((s) => ({ value: s.id, label: `${s.name} ${shiftTimes(s)}` })), { value: 'off', label: 'Day off' }]} /></FormField>
        <FormField label="Reason" helper="Needed when the change is inside the notice the person is owed"><TextField value={reason} maxLength={300} onChange={setReason} /></FormField>
      </div>
    </Dialog>
  );
}
