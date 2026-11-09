// HIR-27 bulk interview day: the designed board (panels across, slots down) and the plan sheet. The sample and the live
// page render the same board; live fills it from the API (each candidate's own interview and send result).
import { useState } from 'react';
import { CalendarPlus, Plus, Send, Shuffle } from 'lucide-react';
import { Badge, PersonLabel } from '../../components/display';
import { Checkbox } from '../../components/choice';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextField, TimeField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
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
  candidate: string;
  panel: string;
  start: number;
  result: DayResult;
  error?: string | null;
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
  /** WhatsApp reminders: drawn; hidden live until reminders exist (question 421). */
  showReminders?: boolean;
}

const RESULT: Record<Exclude<DayResult, 'ready'>, { tone: 'success' | 'danger'; label: string }> = { sent: { tone: 'success', label: 'Invite sent' }, failed: { tone: 'danger', label: 'Not sent' } };

export function DayBoard(p: DayBoardProps) {
  const toast = useToastIfAny();
  const [busy, setBusy] = useState<'assign' | 'send' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const toSend = p.placed.filter((x) => x.result !== 'sent');
  const notSent = p.placed.filter((x) => x.result === 'failed');
  const at = (panel: string, slot: number) => p.placed.find((a) => a.panel === panel && a.start === slot);
  const run = async (which: 'assign' | 'send', fn: () => unknown) => {
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
                  <th scope="row">{minutesToLabel(s)}</th>
                  {p.panels.map((x) => {
                    const a = at(x.id, s);
                    return (
                      <td key={x.id}>
                        {a ? (
                          <div className="yx-hire-stack">
                            <PersonLabel name={a.candidate} size={20} />
                            {a.result !== 'ready' && <Badge tone={RESULT[a.result].tone}>{RESULT[a.result].label}</Badge>}
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
      {p.showReminders && <Checkbox label="Send WhatsApp reminders 2 hours before each slot (only to candidates who opted in)" defaultChecked />}
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
  const [panels, setPanels] = useState<PanelDraft[]>([{ name: 'Panel A', room: '', members: [] }]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const stages = jobs.find((j) => j.value === jobId)?.stages ?? [];
  const start = toMinutes(first);
  const lastEnd = start != null && count ? start + count * slotMinutes : null;
  const slotsBad = start == null || !count || count < 1 || count > 20 || (lastEnd ?? 0) > 1440;
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
    const bad = panels.findIndex((x) => !x.name.trim() || !x.room.trim() || !x.members.length);
    if (bad >= 0) return focus(!panels[bad]!.name.trim() ? `day-pn${bad}` : !panels[bad]!.room.trim() ? `day-pr${bad}` : `day-pm${bad}`);
    const seen = new Set<string>();
    const twice = panels.flatMap((x) => x.members).find((m) => (seen.has(m) ? true : (seen.add(m), false)));
    if (twice) return setFailed(`${people.find((x) => x.value === twice)?.label ?? 'A person'} is on two panels. Each panel sits at the same times, so put them on one panel only.`);
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), jobId, stageId, day: iso(day), slots: Array.from({ length: count! }, (_, i) => start + i * slotMinutes), panels: panels.map((x) => ({ name: x.name.trim(), room: x.room.trim(), memberUserIds: x.members })) });
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
  rows: { entryId: string; candidate: string; panelId: string | null; start: number | null; status: 'unassigned' | 'assigned' | 'sent' | 'failed'; error: string | null }[];
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
          <div className="yx-hire-stack" aria-busy="true" aria-label="Loading the interview day">
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
  const placed: DayPlaced[] = d.rows.filter((r) => r.panelId && r.start != null).map((r) => ({ candidate: r.candidate, panel: r.panelId!, start: r.start!, result: r.status === 'sent' ? 'sent' : r.status === 'failed' ? 'failed' : 'ready', error: r.error }));
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
    />
  );
}
