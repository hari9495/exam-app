// HIR-27 bulk interview day: the designed board (panels across, slots down) and the plan sheet. The sample and the live
// page render the same board; live fills it from the API (each candidate's own interview and send result).
import { useState } from 'react';
import { CalendarPlus, Plus, Send, Shuffle } from 'lucide-react';
import { Badge, PersonLabel } from '../../components/display';
import { Checkbox, Switch } from '../../components/choice';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextField, TimeField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { MultiSelect, Select } from '../../components/select';
import { PageHeader } from '../../components/shell';
import { formatDate } from '../../lib/format';
import { HireFrame } from './hiring-kit';
import { minutesToLabel } from './hiring-logic';
import type { Choice } from './live/types';
import './hiring.css';

const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

export type DayResult = 'ready' | 'sent' | 'failed';
export interface DayPlaced {
  /** The row (live): answer 422 swaps two rows. */
  id?: string;
  candidate: string;
  panel: string;
  start: number;
  result: DayResult;
  error?: string | null;
  /** Answer 421: the WhatsApp reminder's result. */
  reminder?: 'sent' | 'failed' | 'not_opted_in' | 'no_phone' | 'not_connected' | null;
}
export type SendResult = { sent: number; failed: number };
export interface DayPanel {
  id: string;
  name: string;
  members: string;
  room: string;
}

/** What the board shows: the same for the sample and the live page. */
export interface DayBoardProps {
  drive: string;
  date: Date;
  /** e.g. "Graduate Engineer Trainee · Shortlisted". */
  context?: string;
  panels: DayPanel[];
  slots: number[];
  slotMinutes?: number;
  placed: DayPlaced[];
  unassigned: string[];
  status: 'draft' | 'sent' | 'sending';
  assignedYet: boolean;
  /** People who may plan, assign and send (the scheduling key, not acting for someone else). */
  canManage: boolean;
  /** Extra header controls (the day picker, Plan an interview day). */
  extra?: React.ReactNode;
  onAssign: () => Promise<unknown> | void;
  onSend: () => Promise<SendResult | void> | SendResult | void;
  /** Answer 423: removes one slot (a lunch break); its unsent candidates go back to waiting for Auto-assign. */
  onRemoveSlot?: (start: number) => Promise<unknown>;
  /** WhatsApp reminders (answer 421): the drawn switch. */
  showReminders?: boolean;
  /** Answer 421 (live): the day's switch; connected = a WhatsApp provider is set for the company. */
  reminders?: { on: boolean; connected: boolean; onChange?: (on: boolean) => Promise<unknown> };
  /** Answer 422: two unsent candidates change places (row ids). */
  onSwap?: (a: string, b: string) => Promise<unknown>;
  /** The design opens "Swap with…" for this candidate. */
  swapOpen?: string | null;
}

const REMINDER: Record<NonNullable<DayPlaced['reminder']>, { tone: 'success' | 'danger' | 'neutral' | 'warning'; label: string }> = {
  sent: { tone: 'success', label: 'Reminder sent' },
  failed: { tone: 'danger', label: 'Reminder not sent' },
  not_opted_in: { tone: 'neutral', label: 'No WhatsApp (not opted in)' },
  no_phone: { tone: 'neutral', label: 'No mobile number' },
  not_connected: { tone: 'warning', label: 'WhatsApp not connected' },
};

const RESULT: Record<Exclude<DayResult, 'ready'>, { tone: 'success' | 'danger'; label: string }> = { sent: { tone: 'success', label: 'Invite sent' }, failed: { tone: 'danger', label: 'Not sent' } };

export function DayBoard(p: DayBoardProps) {
  const toast = useToastIfAny();
  const [busy, setBusy] = useState<'assign' | 'send' | 'swap' | 'reminders' | number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const toSend = p.placed.filter((x) => x.result !== 'sent');
  const notSent = p.placed.filter((x) => x.result === 'failed');
  const at = (panel: string, slot: number) => p.placed.find((a) => a.panel === panel && a.start === slot);
  // Answer 422: unsent candidates can change places; by "Swap with…" (keyboard) or by dragging one cell onto another.
  const canSwap = p.canManage && p.status !== 'sending' && Boolean(p.onSwap || p.swapOpen);
  const unsent = p.placed.filter((x) => x.result !== 'sent' && (x.id ?? x.candidate));
  const keyOf = (x: DayPlaced) => x.id ?? x.candidate;
  const [swapFrom, setSwapFrom] = useState<string | null>(p.swapOpen ?? null);
  const [swapTo, setSwapTo] = useState<string | null>(null);
  const [swapTried, setSwapTried] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const from = unsent.find((x) => keyOf(x) === swapFrom);
  const doSwap = (a: string, b: string, names: [string, string]) =>
    void run('swap', async () => {
      if (!p.onSwap) return;
      await p.onSwap(a, b);
      toast?.toast({ tone: 'success', title: `${names[0]} and ${names[1]} swapped`, description: 'Their panels and slots changed places. Recorded in the audit log.' });
      setSwapFrom(null);
      setSwapTo(null);
      setSwapTried(false);
    });
  const [remindersOn, setRemindersOn] = useState(p.reminders?.on ?? true);
  const run = async (which: 'assign' | 'send' | 'swap' | 'reminders' | number, fn: () => unknown) => {
    setBusy(which);
    setFailed(null);
    try {
      return await fn();
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const assign = () => void run('assign', async () => {
    await p.onAssign();
    toast?.toast({ tone: 'success', title: 'Candidates assigned', description: 'Rows already sent keep their place.' });
  });
  const removeSlot = (s: number) => void run(s, async () => {
    await p.onRemoveSlot!(s);
    toast?.toast({ tone: 'success', title: `Slot ${minutesToLabel(s)} removed`, description: 'Auto-assign will not use it. Anyone placed there is waiting again.' });
  });
  const send = async () => {
    const r = (await run('send', p.onSend)) as SendResult | void;
    if (r) toast?.toast({ tone: r.failed ? 'warning' : 'success', title: `${r.sent} invite${r.sent === 1 ? '' : 's'} sent`, description: r.failed ? `${r.failed} not sent: see each row.` : undefined });
  };
  return (
    <HireFrame active="Interviews">
      <PageHeader
        title={`Interview day · ${p.drive}`}
        description={`${formatDate(p.date)}${p.context ? ` · ${p.context}` : ''} · ${p.panels.length} panels × ${p.slots.length} slots = ${p.panels.length * p.slots.length} interviews${p.slotMinutes ? ` of ${p.slotMinutes} min` : ''}`}
        status={<Badge tone={p.status === 'sent' ? 'success' : p.status === 'sending' ? 'info' : 'neutral'}>{p.status === 'sent' ? 'Invites sent' : p.status === 'sending' ? 'Sending' : 'Draft'}</Badge>}
        actions={
          <>
            {p.extra}
            {p.canManage && (
              <>
                <Button icon={Shuffle} loading={busy === 'assign'} onClick={assign}>
                  Auto-assign
                </Button>
                {toSend.length ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="primary" icon={Send} loading={busy === 'send'}>
                        Send {toSend.length} invites
                      </Button>
                    }
                    title={`Send ${toSend.length} interview invites?`}
                    consequence={`Each candidate gets their slot, room and panel by email; panel members get their invite. Every invite goes on its own: one that fails is shown on its row and never stops the others. ${p.unassigned.length ? `${p.unassigned.length} candidates without a slot get nothing yet.` : ''}`}
                    confirmLabel={`Send ${toSend.length} invites`}
                    onConfirm={send}
                  />
                ) : (
                  <Button variant="primary" icon={Send} onClick={() => setFailed(p.placed.length ? 'Every invite on this day has been sent.' : 'Nobody is waiting for an invite. Use Auto-assign first.')}>
                    Send invites
                  </Button>
                )}
              </>
            )}
          </>
        }
      />
      {failed && <InlineAlert tone="danger" title={failed} />}
      {notSent.length > 0 && (
        <InlineAlert tone="danger" title={`${notSent.length} invite${notSent.length === 1 ? '' : 's'} not sent`}>
          {notSent.map((x) => `${x.candidate}: ${x.error ?? 'not sent'}`).join(' · ')} Send again to retry only these.
        </InlineAlert>
      )}
      {p.unassigned.length > 0 && (
        <InlineAlert tone="warning" title={`${p.unassigned.length} candidates don't fit this day`}>
          Add a panel or a slot, or move them to the next interview day: {p.unassigned.join(', ')}.
        </InlineAlert>
      )}
      {!p.assignedYet ? (
        <EmptyState
          title="No one is assigned yet."
          description="The shortlisted candidates are waiting. Auto-assign fills the slots by the company's rule; rows already sent keep their place."
          action={p.canManage ? <Button variant="primary" icon={Shuffle} loading={busy === 'assign'} onClick={assign}>Auto-assign</Button> : undefined}
        />
      ) : (
        <div className="yx-hire-slots__scroll" tabIndex={0} role="region" aria-label="Interview day assignments, scroll sideways">
          <table className="yx-hire-daygrid">
            <caption className="yx-visually-hidden">Assignments by panel and slot</caption>
            <thead>
              <tr>
                <th scope="col">Slot</th>
                {p.panels.map((x) => (
                  <th scope="col" key={x.id}>
                    {x.name}
                    <Text size="xs" tone="secondary" as="div">
                      {x.room} · {x.members}
                    </Text>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.slots.map((s) => (
                <tr key={s}>
                  <th scope="row">
                    {minutesToLabel(s)}
                    {p.onRemoveSlot && p.canManage && p.status !== 'sending' && p.slots.length > 1 && (
                      <div>
                        <Button size="sm" loading={busy === s} onClick={() => removeSlot(s)} aria-label={`Remove the ${minutesToLabel(s)} slot`}>
                          Remove
                        </Button>
                      </div>
                    )}
                  </th>
                  {p.panels.map((x) => {
                    const a = at(x.id, s);
                    return (
                      <td
                        key={x.id}
                        onDragOver={(e) => a && a.result !== 'sent' && dragging && dragging !== keyOf(a) && e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const src = unsent.find((u) => keyOf(u) === dragging);
                          if (a && src && a.result !== 'sent' && keyOf(src) !== keyOf(a)) doSwap(keyOf(src), keyOf(a), [src.candidate, a.candidate]);
                          setDragging(null);
                        }}
                      >
                        {a ? (
                          <div className="yx-hire-stack" draggable={canSwap && a.result !== 'sent'} onDragStart={() => setDragging(keyOf(a))} onDragEnd={() => setDragging(null)}>
                            <PersonLabel name={a.candidate} size={20} />
                            {a.result !== 'ready' && <Badge tone={RESULT[a.result].tone}>{RESULT[a.result].label}</Badge>}
                            {a.reminder && <Badge tone={REMINDER[a.reminder].tone}>{REMINDER[a.reminder].label}</Badge>}
                            {canSwap && a.result !== 'sent' && unsent.length > 1 && (
                              <Button size="sm" onClick={() => (setSwapFrom(keyOf(a)), setSwapTo(null), setSwapTried(false))} aria-label={`Swap ${a.candidate} with someone`}>
                                Swap with…
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Text size="sm" tone="muted">Free</Text>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(p.showReminders || p.reminders) && (
        <div className="yx-hire-stack">
          <Switch
            label="Send WhatsApp reminders 2 hours before each slot (only to candidates who opted in)"
            checked={p.reminders?.connected === false ? false : remindersOn}
            onChange={(on) => {
              if (p.reminders?.connected === false) return setFailed('WhatsApp is not connected. Ask your admin to set up WhatsApp in Settings › Messages; until then no reminder can go.');
              setRemindersOn(on);
              if (p.reminders?.onChange) void run('reminders', async () => (await p.reminders!.onChange!(on), toast?.toast({ tone: 'success', title: on ? 'WhatsApp reminders on' : 'WhatsApp reminders off' })));
            }}
          />
          {p.reminders?.connected === false && <InlineAlert tone="warning" title="WhatsApp is not connected">No reminder goes until your admin sets up WhatsApp (Settings › Messages). Each slot shows it was not sent.</InlineAlert>}
        </div>
      )}
      {from && (
        <Dialog
          open
          onOpenChange={(o) => !o && setSwapFrom(null)}
          size="sm"
          title={`Swap ${from.candidate} with…`}
          description={`${from.candidate} is at ${minutesToLabel(from.start)} with ${p.panels.find((x) => x.id === from.panel)?.name ?? ''}. Only candidates not sent an invite can swap.`}
          footer={
            <>
              <Button onClick={() => setSwapFrom(null)}>Cancel</Button>
              <Button
                variant="primary"
                loading={busy === ('swap')}
                onClick={() => {
                  setSwapTried(true);
                  const to = unsent.find((x) => keyOf(x) === swapTo);
                  if (!to) return focus('day-swap-to');
                  doSwap(keyOf(from), keyOf(to), [from.candidate, to.candidate]);
                }}
              >
                Swap
              </Button>
            </>
          }
        >
          <FormField id="day-swap-to" label="Swap with" required error={swapTried && !swapTo ? 'Choose who they swap with.' : null}>
            <Select
              aria-label="Swap with"
              value={swapTo}
              onChange={setSwapTo}
              placeholder="Choose a candidate"
              options={unsent.filter((x) => keyOf(x) !== keyOf(from)).map((x) => ({ value: keyOf(x), label: `${x.candidate} · ${minutesToLabel(x.start)} · ${p.panels.find((y) => y.id === x.panel)?.name ?? ''}` }))}
            />
          </FormField>
        </Dialog>
      )}
    </HireFrame>
  );
}

/* ---------------- Plan an interview day (sheet) ---------------- */

export interface InterviewDayInput {
  name: string;
  jobId: string;
  stageId: string;
  /** yyyy-mm-dd */
  day: string;
  slots: number[];
  panels: { name: string; room: string; memberUserIds: string[] }[];
}

export interface InterviewDaySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: (Choice & { stages: Choice[] })[];
  people: Choice[];
  /** The company's interview length (Settings › Hiring). */
  slotMinutes: number;
  today: Date;
  onCreate: (input: InterviewDayInput) => Promise<unknown>;
}

type PanelDraft = { name: string; room: string; members: string[] };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toMinutes = (t: string | null) => (t && /^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);

export function InterviewDaySheet({ open, onOpenChange, jobs, people, slotMinutes, today, onCreate }: InterviewDaySheetProps) {
  const toast = useToastIfAny();
  const [name, setName] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [day, setDay] = useState<Date | null>(null);
  const [first, setFirst] = useState<string | null>('10:00');
  const [count, setCount] = useState<number | null>(6);
  // Answer 423: single slots the planner took out (a lunch break), by start time.
  const [dropped, setDropped] = useState<number[]>([]);
  const [panels, setPanels] = useState<PanelDraft[]>([{ name: 'Panel A', room: '', members: [] }]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const stages = jobs.find((j) => j.value === jobId)?.stages ?? [];
  const start = toMinutes(first);
  const lastEnd = start != null && count ? start + count * slotMinutes : null;
  const slotsBad = start == null || !count || count < 1 || count > 20 || (lastEnd ?? 0) > 1440;
  const allSlots = !slotsBad ? Array.from({ length: count! }, (_, i) => start! + i * slotMinutes) : [];
  const kept = allSlots.filter((s) => !dropped.includes(s));
  const pastDay = day != null && iso(day) < iso(today);
  const set = (k: number, patch: Partial<PanelDraft>) => setPanels((x) => x.map((y, i) => (i === k ? { ...y, ...patch } : y)));
  const save = async () => {
    setTried(true);
    setFailed(null);
    if (!name.trim()) return focus('day-name');
    if (!jobId) return focus('day-job');
    if (!stageId) return focus('day-stage');
    if (!day || pastDay) return focus('day-date');
    if (start == null) return focus('day-first');
    if (slotsBad) return focus('day-count');
    if (!kept.length) return focus('day-slots');
    const bad = panels.findIndex((x) => !x.name.trim() || !x.room.trim() || !x.members.length);
    if (bad >= 0) return focus(!panels[bad]!.name.trim() ? `day-pn${bad}` : !panels[bad]!.room.trim() ? `day-pr${bad}` : `day-pm${bad}`);
    const seen = new Set<string>();
    const twice = panels.flatMap((x) => x.members).find((m) => (seen.has(m) ? true : (seen.add(m), false)));
    if (twice) return setFailed(`${people.find((x) => x.value === twice)?.label ?? 'A person'} is on two panels. Each panel sits at the same times, so put them on one panel only.`);
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), jobId, stageId, day: iso(day), slots: kept, panels: panels.map((x) => ({ name: x.name.trim(), room: x.room.trim(), memberUserIds: x.members })) });
      toast?.toast({ tone: 'success', title: 'Interview day planned', description: 'Use Auto-assign to place the candidates.' });
      onOpenChange(false);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Plan an interview day"
      subtitle="Bulk interview day"
      dirty
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Plan the day
          </Button>
        </>
      }
    >
      <div className="yx-hire-stack">
        <Text as="p" size="sm" tone="secondary">
          The job&apos;s candidates in the chosen stage are placed on the panels. Each interview lasts {slotMinutes} minutes (Settings › Hiring). Times are India time (IST).
        </Text>
        {failed && <InlineAlert tone="danger" title={failed} />}
        <FormField id="day-name" label="Name" required helper="For example, the drive or campus." error={tried && !name.trim() ? 'Enter a name for the day.' : null}>
          <TextField value={name} onChange={setName} maxLength={120} />
        </FormField>
        <div className="yx-hire-actions">
          <FormField id="day-job" label="Job" required error={tried && !jobId ? 'Choose the job.' : null}>
            <Select value={jobId} onChange={(v) => (setJobId(v), setStageId(null))} options={jobs} searchable placeholder="Choose a job" />
          </FormField>
          <FormField id="day-stage" label="Candidates in stage" required error={tried && !stageId ? 'Choose the stage.' : null}>
            <Select value={stageId} onChange={setStageId} options={stages} placeholder={jobId ? 'Choose a stage' : 'Choose the job first'} />
          </FormField>
        </div>
        <div className="yx-hire-actions">
          <FormField id="day-date" label="Day" required error={tried && (!day || pastDay) ? (pastDay ? 'Choose today or a later day.' : 'Choose the day.') : null}>
            <DatePicker value={day} onChange={setDay} min={today} />
          </FormField>
          <FormField id="day-first" label="First slot" required error={tried && start == null ? 'Enter the first slot.' : null}>
            <TimeField value={first} onChange={setFirst} />
          </FormField>
          <FormField id="day-count" label="Slots" required helper={lastEnd != null && lastEnd <= 1440 ? `Last ends ${minutesToLabel(lastEnd)}` : undefined} error={tried && slotsBad && start != null ? 'Enter 1 to 20 slots that end by midnight.' : null}>
            <NumberField value={count} onChange={setCount} min={1} max={20} />
          </FormField>
        </div>
        {allSlots.length > 0 && (
          <FormField id="day-slots" label="Slots in the day" helper="Untick a slot to leave it out, for example a lunch break. Auto-assign skips it." error={tried && !kept.length ? 'Keep at least one slot.' : null}>
            <div className="yx-hire-actions">
              {allSlots.map((s) => (
                <Checkbox key={s} label={minutesToLabel(s)} checked={!dropped.includes(s)} onChange={(on) => setDropped((d) => (on ? d.filter((x) => x !== s) : [...d, s]))} />
              ))}
            </div>
          </FormField>
        )}
        {panels.map((x, k) => (
          <div key={k} className="yx-hire-actions">
            <FormField id={`day-pn${k}`} label={`Panel ${k + 1}`} required error={tried && !x.name.trim() ? 'Name the panel.' : null}>
              <TextField value={x.name} onChange={(v) => set(k, { name: v })} maxLength={80} />
            </FormField>
            <FormField id={`day-pr${k}`} label={`Room ${k + 1}`} required error={tried && !x.room.trim() ? 'Enter the room.' : null}>
              <TextField value={x.room} onChange={(v) => set(k, { room: v })} maxLength={120} />
            </FormField>
            <FormField id={`day-pm${k}`} label={`Members ${k + 1}`} required error={tried && !x.members.length ? 'Choose who sits on the panel.' : null}>
              <MultiSelect value={x.members} onChange={(v) => set(k, { members: v.slice(0, 10) })} options={people} />
            </FormField>
            {panels.length > 1 && (
              <div>
                <Button size="sm" variant="danger" onClick={() => setPanels((y) => y.filter((_, i) => i !== k))}>
                  Remove panel {k + 1}
                </Button>
              </div>
            )}
          </div>
        ))}
        <div>
          <Button size="sm" icon={Plus} onClick={() => (panels.length >= 10 ? setFailed('A day has up to 10 panels.') : setPanels((y) => [...y, { name: `Panel ${String.fromCharCode(65 + y.length)}`, room: '', members: [] }]))}>
            Add a panel
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

/* ---------------- Live ---------------- */

export interface InterviewDayView {
  id: string;
  name: string;
  jobTitle: string;
  stageName: string;
  day: string;
  slotMinutes: number;
  status: 'draft' | 'sent';
  sending: boolean;
  slots: number[];
  panels: DayPanel[];
  rows: { id?: string; entryId: string; candidate: string; panelId: string | null; start: number | null; status: 'unassigned' | 'assigned' | 'sent' | 'failed'; error: string | null; reminder?: DayPlaced['reminder'] }[];
  /** Answer 421: the day's WhatsApp reminders, and whether a WhatsApp provider is set. */
  reminders?: { on: boolean; connected: boolean };
}

export interface LiveInterviewDay {
  state: 'loading' | 'ready' | 'error' | 'denied';
  onRetry: () => void;
  days: Choice[];
  day: InterviewDayView | null;
  canManage: boolean;
  onPickDay: (id: string) => void;
  onPlan: () => void;
  onAssign: () => Promise<unknown>;
  onSend: () => Promise<{ sent: number; failed: number }>;
  /** Answer 423: removes one slot of the chosen day. */
  onRemoveSlot?: (start: number) => Promise<unknown>;
  /** Answer 422: two unsent candidates change places. */
  onSwap?: (a: string, b: string) => Promise<unknown>;
  /** Answer 421: the day's WhatsApp reminders on or off. */
  onReminders?: (on: boolean) => Promise<unknown>;
}

export function LiveInterviewDayView({ live }: { live: LiveInterviewDay }) {
  const extra = (
    <>
      {live.days.length > 0 && (
        <FormField label="Interview day" hideLabel>
          <Select aria-label="Interview day" value={live.day?.id ?? null} onChange={(v) => v && live.onPickDay(v)} options={live.days} placeholder="Choose a day" />
        </FormField>
      )}
      {live.canManage && (
        <Button icon={CalendarPlus} onClick={live.onPlan}>
          Plan an interview day
        </Button>
      )}
    </>
  );
  if (live.state !== 'ready' || !live.day)
    return (
      <HireFrame active="Interviews">
        <PageHeader title="Interview days" description="A hiring day with several panels: candidates are placed on slots and each gets their own interview." actions={live.state === 'ready' ? extra : undefined} />
        {live.state === 'loading' ? (
          <div className="yx-hire-stack" role="status" aria-busy="true" aria-label="Loading the interview day">
            <Skeleton height={64} />
            <Skeleton height={320} />
          </div>
        ) : live.state === 'error' ? (
          <ErrorState title="The interview day could not be loaded." onRetry={live.onRetry} />
        ) : live.state === 'denied' ? (
          <NoAccessState grantedBy="the recruiter" what="interview days" />
        ) : (
          <EmptyState title={live.days.length ? 'Choose an interview day.' : 'No interview days yet.'} description="Plan one for a job: its panels, rooms and slots." action={live.canManage ? <Button variant="primary" icon={CalendarPlus} onClick={live.onPlan}>Plan an interview day</Button> : undefined} />
        )}
      </HireFrame>
    );
  const d = live.day;
  const placed: DayPlaced[] = d.rows.filter((r) => r.panelId && r.start != null).map((r) => ({ id: r.id, candidate: r.candidate, panel: r.panelId!, start: r.start!, result: r.status === 'sent' ? 'sent' : r.status === 'failed' ? 'failed' : 'ready', error: r.error, reminder: r.reminder ?? null }));
  return (
    <DayBoard
      drive={d.name}
      date={new Date(`${d.day}T00:00:00`)}
      context={`${d.jobTitle} · ${d.stageName}`}
      panels={d.panels}
      slots={d.slots}
      slotMinutes={d.slotMinutes}
      placed={placed}
      unassigned={d.rows.filter((r) => r.status === 'unassigned').map((r) => r.candidate)}
      status={d.sending ? 'sending' : d.status}
      assignedYet={d.rows.length > 0}
      canManage={live.canManage}
      extra={extra}
      onAssign={live.onAssign}
      onSend={live.onSend}
      onRemoveSlot={live.onRemoveSlot}
      onSwap={live.onSwap}
      reminders={d.reminders ? { ...d.reminders, onChange: live.onReminders } : undefined}
    />
  );
}
