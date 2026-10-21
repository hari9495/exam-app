// Learning sessions, wired (LRN-04 sessions and trainers, LRN-05 trainer QR attendance, LRN-06 nominate and decline):
// the designed screens with live data. Forms the design shows only as a button (schedule, add trainer, nominate from the
// session page, choose a session) are drawn here in the same parts and words, with their own stories.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Plus, QrCode, UserCheck, Video } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { MultiSelect, Select, type SelectOption } from '../../components/select';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { GrowthFrame } from './growth-kit';
import { enrol as seatFor } from './growth-logic';
import type { LoadState } from './perf-goals';
import './growth.css';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

function Loading({ state, onRetry, what, children }: { state: LoadState; onRetry?: () => void; what: string; children: () => ReactNode }) {
  if (state === 'loading') return <Skeleton height={320} />;
  if (state === 'error') return <ErrorState title={`${what} didn’t load`} description="Try again in a moment." onRetry={onRetry} />;
  return <>{children()}</>;
}

/* ================================================================== LRN-04 · Sessions + trainers */

export interface LiveSessionRow {
  id: string;
  course: string;
  start: string | null;
  mode: 'Classroom' | 'Virtual';
  venue: string;
  trainer: string;
  external: boolean;
  seats: number;
  enrolled: number;
  waitlist: number;
  status: 'Scheduled' | 'In progress' | 'Completed' | 'Cancelled';
  cost: number;
}
export interface LiveTrainerRow {
  id: string;
  name: string;
  org: string;
  external: boolean;
  sessions: number;
}
export interface ScheduleInput {
  courseId: string;
  mode: 'classroom' | 'virtual';
  venue: string;
  trainerId: string;
  seats: number;
  slots: { startsAt: string; endsAt: string }[];
  costLines: { label: string; amount: number }[];
}
export interface TrainerInput {
  external: boolean;
  employeeId?: string | null;
  name?: string | null;
  orgName?: string | null;
}
export interface LiveSessions {
  state: LoadState;
  onRetry: () => void;
  sessions: LiveSessionRow[] | null;
  /** L&D only (learning.manage); an internal trainer sees just their sessions. */
  ld: boolean;
  trainers: LiveTrainerRow[] | null;
  courses: SelectOption[];
  employees: SelectOption[];
  view: 'list' | 'trainers';
  onView: (v: 'list' | 'trainers') => void;
  onOpen: (id: string) => void;
  onSchedule: (input: ScheduleInput) => Promise<void>;
  onAddTrainer: (input: TrainerInput) => Promise<void>;
}

const SESSION_FIELDS: FilterFieldDef[] = [
  { key: 'mode', label: 'Mode', type: 'multi', options: [{ value: 'Classroom', label: 'Classroom' }, { value: 'Virtual', label: 'Virtual' }] },
  { key: 'status', label: 'Status', type: 'multi', options: ['Scheduled', 'In progress', 'Completed', 'Cancelled'].map((v) => ({ value: v, label: v })) },
];

export function LiveSessionsScreen({ live }: { live: LiveSessions }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [adding, setAdding] = useState(false);
  const rows = (live.sessions ?? []).filter((s) => (!q || s.course.toLowerCase().includes(q.toLowerCase())) && filters.every((f) => matchesFilter((s as unknown as Record<string, unknown>)[f.key], f)));
  const cols: TableColumn<LiveSessionRow>[] = [
    { key: 'course', header: 'Course', value: (r) => r.course, width: 260 },
    { key: 'start', header: 'Starts', value: (r) => when(r.start), width: 150 },
    { key: 'mode', header: 'Mode', value: (r) => r.mode, width: 110 },
    { key: 'venue', header: 'Venue or link', value: (r) => r.venue, width: 200 },
    { key: 'trainer', header: 'Trainer', value: (r) => r.trainer + (r.external ? ' (external)' : ''), width: 200 },
    { key: 'seats', header: 'Seats', type: 'number', value: (r) => r.enrolled, render: (r) => `${r.enrolled} of ${r.seats}`, width: 100 },
    { key: 'wait', header: 'Waitlist', type: 'number', value: (r) => r.waitlist, width: 100 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Completed' ? 'success' : v === 'Cancelled' ? 'neutral' : 'info'), width: 130 },
  ];
  const list = (
    <DataTable
      label="Sessions"
      columns={cols}
      rows={rows}
      getRowId={(r) => r.id}
      filtered={filters.length > 0 || q !== ''}
      onClearFilters={() => (setFilters([]), setQ(''))}
      empty={<EmptyState title="No sessions scheduled" description={live.ld ? 'Schedule a session for a classroom or virtual course.' : 'Sessions you run show here.'} />}
      toolbar={<FilterBar fields={SESSION_FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search course" />}
      onRowClick={(r) => live.onOpen(r.id)}
    />
  );
  return (
    <GrowthFrame area="learning" active="Sessions" persona="ld">
      <PageHeader
        title={live.view === 'trainers' ? 'Trainers' : 'Sessions'}
        actions={live.ld ? <Button variant="primary" icon={Plus} onClick={() => (live.view === 'trainers' ? setAdding(true) : setScheduling(true))} disabled={live.view === 'list' && !live.courses.length}>{live.view === 'trainers' ? 'Add trainer' : 'Schedule session'}</Button> : undefined}
      />
      <Loading state={live.state} onRetry={live.onRetry} what="Sessions">
        {() =>
          live.ld ? (
            <Tabs value={live.view} onValueChange={(v) => live.onView(v as 'list' | 'trainers')}>
              <TabsList aria-label="Sessions and trainers">
                <TabsTrigger value="list">Sessions</TabsTrigger>
                <TabsTrigger value="trainers" count={live.trainers?.length ?? 0}>
                  Trainers
                </TabsTrigger>
              </TabsList>
              <TabsContent value="list">{list}</TabsContent>
              <TabsContent value="trainers">
                <DataTable
                  label="Trainers"
                  rows={live.trainers ?? []}
                  getRowId={(r) => r.id}
                  empty={<EmptyState compact title="No trainers yet" description="Add the employees and training companies who run your sessions." />}
                  columns={[
                    { key: 'name', header: 'Trainer', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.org }), width: 240 },
                    { key: 'type', header: 'Type', type: 'status', value: (r) => (r.external ? 'External' : 'Internal'), statusTone: () => 'neutral', width: 120 },
                    { key: 'sessions', header: 'Sessions', type: 'number', value: (r) => r.sessions, width: 110 },
                    { key: 'access', header: 'Sign-in', value: (r) => (r.external ? 'Through L&D' : 'Uses employee login'), width: 180 },
                  ]}
                />
              </TabsContent>
            </Tabs>
          ) : (
            list
          )
        }
      </Loading>
      {scheduling && <ScheduleDrawer courses={live.courses} trainers={(live.trainers ?? []).map((t) => ({ value: t.id, label: t.name + (t.external ? ` (${t.org})` : '') }))} onClose={() => setScheduling(false)} onSave={live.onSchedule} />}
      {adding && <TrainerDialog employees={live.employees} onClose={() => setAdding(false)} onSave={live.onAddTrainer} />}
    </GrowthFrame>
  );
}

const localValue = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** Schedule a session (or reschedule): course, mode, venue or link, trainer, seats, slots and cost lines. */
export function ScheduleDrawer({ courses, trainers, onClose, onSave, start }: { courses: SelectOption[]; trainers: SelectOption[]; onClose: () => void; onSave: (input: ScheduleInput) => Promise<void>; start?: ScheduleInput }) {
  const tomorrow = new Date(Date.now() + 86_400_000);
  tomorrow.setHours(10, 0, 0, 0);
  const [courseId, setCourse] = useState<string | null>(start?.courseId ?? null);
  const [mode, setMode] = useState<'classroom' | 'virtual'>(start?.mode ?? 'classroom');
  const [venue, setVenue] = useState(start?.venue ?? '');
  const [trainerId, setTrainer] = useState<string | null>(start?.trainerId ?? null);
  const [seats, setSeats] = useState<number | null>(start?.seats ?? 20);
  const [slots, setSlots] = useState(start?.slots.map((x) => ({ startsAt: localValue(new Date(x.startsAt)), endsAt: localValue(new Date(x.endsAt)) })) ?? [{ startsAt: localValue(tomorrow), endsAt: localValue(new Date(tomorrow.getTime() + 3 * 3_600_000)) }]);
  const [costs, setCosts] = useState(start?.costLines ?? [{ label: 'Trainer fee', amount: 0 }]);
  const [errors, setErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const okSlots = slots.length > 0 && slots.every((x) => x.startsAt && x.endsAt && x.endsAt > x.startsAt);
  const ok = Boolean(courseId && trainerId && seats && venue.trim().length >= 3 && okSlots);
  return (
    <Drawer
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={start ? 'Reschedule session' : 'Schedule a session'}
      footer={
        <div className="yx-growth-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!ok) return setErrors(true);
              setBusy(true);
              try {
                await onSave({ courseId: courseId!, mode, venue: venue.trim(), trainerId: trainerId!, seats: seats!, slots: slots.map((x) => ({ startsAt: new Date(x.startsAt).toISOString(), endsAt: new Date(x.endsAt).toISOString() })), costLines: costs.filter((x) => x.label.trim()) });
                onClose();
              } catch {
                // The page said what went wrong.
              } finally {
                setBusy(false);
              }
            }}
          >
            {start ? 'Save changes' : 'Schedule session'}
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        {!start && (
          <FormField label="Course" required helper="Classroom and virtual courses." error={errors && !courseId ? 'Choose the course.' : null}>
            <Select value={courseId} onChange={setCourse} options={courses} placeholder="Choose a course" />
          </FormField>
        )}
        <FormField label="Mode">
          <RadioGroup aria-label="Mode" orientation="horizontal" value={mode} onChange={(v) => setMode(v as 'classroom' | 'virtual')} options={[{ value: 'classroom', label: 'Classroom' }, { value: 'virtual', label: 'Virtual' }]} />
        </FormField>
        <FormField label={mode === 'virtual' ? 'Meeting link' : 'Venue'} required error={errors && venue.trim().length < 3 ? (mode === 'virtual' ? 'Paste the meeting link.' : 'Say where it is.') : null}>
          <TextField value={venue} onChange={setVenue} placeholder={mode === 'virtual' ? 'https://' : 'Site, room'} />
        </FormField>
        <FieldRow>
          <FormField label="Trainer" required error={errors && !trainerId ? 'Choose the trainer.' : null}>
            <Select value={trainerId} onChange={setTrainer} options={trainers} placeholder="Choose a trainer" />
          </FormField>
          <FormField label="Seats" required>
            <NumberField value={seats} onChange={setSeats} min={1} max={500} />
          </FormField>
        </FieldRow>
        <Card title="Slots">
          <div className="yx-growth-stack">
            {slots.map((x, i) => (
              <FieldRow key={i}>
                <FormField label={`Slot ${i + 1} starts`}>
                  <TextField type="datetime-local" value={x.startsAt} onChange={(v) => setSlots(slots.map((y, j) => (j === i ? { ...y, startsAt: v } : y)))} />
                </FormField>
                <FormField label="Ends">
                  <TextField type="datetime-local" value={x.endsAt} onChange={(v) => setSlots(slots.map((y, j) => (j === i ? { ...y, endsAt: v } : y)))} />
                </FormField>
              </FieldRow>
            ))}
            {errors && !okSlots && <InlineAlert tone="danger">Each slot ends after it starts.</InlineAlert>}
            <div className="yx-growth-row">
              <Button size="sm" icon={Plus} onClick={() => setSlots([...slots, { ...slots[slots.length - 1] }])}>
                Add slot
              </Button>
              {slots.length > 1 && (
                <Button size="sm" onClick={() => setSlots(slots.slice(0, -1))}>
                  Remove last slot
                </Button>
              )}
            </div>
          </div>
        </Card>
        <Card title="Cost">
          <div className="yx-growth-stack">
            {costs.map((x, i) => (
              <FieldRow key={i}>
                <FormField label="What for">
                  <TextField value={x.label} onChange={(v) => setCosts(costs.map((y, j) => (j === i ? { ...y, label: v } : y)))} />
                </FormField>
                <FormField label="Amount">
                  <CurrencyField value={x.amount} onChange={(v) => setCosts(costs.map((y, j) => (j === i ? { ...y, amount: v ?? 0 } : y)))} />
                </FormField>
              </FieldRow>
            ))}
            <div className="yx-growth-row">
              <Button size="sm" icon={Plus} onClick={() => setCosts([...costs, { label: '', amount: 0 }])}>
                Add a cost
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </Drawer>
  );
}

/** Add a trainer: an employee (they use their own login) or someone from a training company. */
export function TrainerDialog({ employees, onClose, onSave }: { employees: SelectOption[]; onClose: () => void; onSave: (input: TrainerInput) => Promise<void> }) {
  const [external, setExternal] = useState(false);
  const [employeeId, setEmployee] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [orgName, setOrg] = useState('');
  const [errors, setErrors] = useState(false);
  const ok = external ? name.trim().length >= 2 && orgName.trim().length >= 2 : Boolean(employeeId);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a trainer"
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (!ok) return setErrors(true);
              try {
                await onSave(external ? { external, name: name.trim(), orgName: orgName.trim() } : { external, employeeId });
                onClose();
              } catch {
                // The page said what went wrong.
              }
            }}
          >
            Add trainer
          </Button>
        </>
      }
    >
      <div className="yx-growth-stack">
        <RadioGroup aria-label="Trainer" orientation="horizontal" value={external ? 'external' : 'internal'} onChange={(v) => setExternal(v === 'external')} options={[{ value: 'internal', label: 'An employee' }, { value: 'external', label: 'From a training company' }]} />
        {external ? (
          <FieldRow>
            <FormField label="Name" required error={errors && name.trim().length < 2 ? 'Give their name.' : null}>
              <TextField value={name} onChange={setName} />
            </FormField>
            <FormField label="Training company" required error={errors && orgName.trim().length < 2 ? 'Give the company.' : null}>
              <TextField value={orgName} onChange={setOrg} />
            </FormField>
          </FieldRow>
        ) : (
          <FormField label="Employee" required helper="They see and mark attendance for their own sessions." error={errors && !employeeId ? 'Choose the employee.' : null}>
            <Select value={employeeId} onChange={setEmployee} options={employees} placeholder="Choose an employee" searchable />
          </FormField>
        )}
      </div>
    </Dialog>
  );
}

/* ================================================================== LRN-04 · The session page */

export interface LiveSessionPageData {
  session: LiveSessionRow & { slots: { id: string; label: string; startsAt: string; endsAt: string; closed: boolean }[]; version: number; attendancePct: number; mandatory: boolean; ld: boolean; confirmed: boolean };
  enrolled: { enrolmentId: string; employeeId: string; name: string; source: string }[];
  waitlist: { enrolmentId: string; employeeId: string; name: string }[];
  attendance: { enrolmentId: string; name: string; marks: ('Present' | 'Late' | 'Absent' | null)[]; method: string }[];
  results: { name: string; status: 'Completed' | 'No-show' | 'Not completed' | 'Pending'; reason: string }[];
  costLines: { label: string; amount: number }[];
}
export interface LiveSessionPage {
  state: LoadState;
  onRetry: () => void;
  data: LiveSessionPageData | null;
  trainers: SelectOption[];
  /** People who can be nominated (L&D: everyone; empty hides Nominate). */
  people: SelectOption[];
  onReschedule: (input: ScheduleInput) => Promise<void>;
  onCancel: () => Promise<void>;
  onWithdraw: (e: { enrolmentId: string; name: string }) => Promise<void>;
  onNominate: (employeeIds: string[]) => Promise<void>;
  onMark: (slotId: string, marks: { enrolmentId: string; status: 'present' | 'late' | 'absent' }[]) => Promise<void>;
  onConfirm: () => Promise<void>;
  onShowQr: (slotId: string) => void;
}

const RESULT_TONE = { Completed: 'success', 'No-show': 'danger', 'Not completed': 'danger', Pending: 'info' } as const;

export function LiveSessionPageScreen({ live }: { live: LiveSessionPage }) {
  const d = live.data;
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [nominating, setNominating] = useState(false);
  const [withdrawing, setWithdrawing] = useState<{ enrolmentId: string; name: string } | null>(null);
  const s = d?.session;
  const ld = Boolean(s?.ld);
  const scheduled = s?.status === 'Scheduled' || s?.status === 'In progress';
  const total = (d?.costLines ?? []).reduce((a, c) => a + Number(c.amount), 0);
  const openSlot = s?.slots.find((x) => !x.closed && new Date(x.endsAt).getTime() > Date.now() - 3_600_000) ?? s?.slots[0];
  const ended = Boolean(s && s.slots.every((x) => new Date(x.endsAt).getTime() < Date.now()));
  return (
    <GrowthFrame area="learning" active="Sessions" persona="ld">
      <Loading state={live.state} onRetry={live.onRetry} what="The session">
        {() =>
          d &&
          s && (
            <div className="yx-growth-stack">
              <ObjectHeader
                name={s.course}
                icon={s.mode === 'Virtual' ? Video : UserCheck}
                secondary={`${when(s.start)} · ${s.venue} · trainer ${s.trainer}`}
                status={<Badge tone={s.status === 'Completed' ? 'success' : s.status === 'Cancelled' ? 'neutral' : 'info'}>{s.status}</Badge>}
                facts={[
                  { label: 'Seats', value: `${d.enrolled.length} of ${s.seats}` },
                  { label: 'Waitlist', value: d.waitlist.length },
                  { label: 'Slots', value: s.slots.length },
                  ...(ld ? [{ label: 'Cost', value: inr(total) }] : []),
                ]}
                actions={
                  <>
                    {ld && scheduled && !d.attendance.some((a) => a.marks.some(Boolean)) && <Button onClick={() => setRescheduling(true)}>Reschedule</Button>}
                    {scheduled && openSlot && (
                      <Button icon={QrCode} onClick={() => live.onShowQr(openSlot.id)}>
                        Show attendance QR
                      </Button>
                    )}
                  </>
                }
              />
              <Tabs defaultValue="attendees">
                <TabsList aria-label="Session">
                  <TabsTrigger value="attendees" count={d.enrolled.length}>
                    Attendees
                  </TabsTrigger>
                  <TabsTrigger value="attendance">Attendance</TabsTrigger>
                  <TabsTrigger value="results">Results</TabsTrigger>
                  {ld && <TabsTrigger value="cost">Cost</TabsTrigger>}
                </TabsList>
                <TabsContent value="attendees">
                  <div className="yx-growth-stack">
                    {ld && scheduled && live.people.length > 0 && (
                      <div className="yx-growth-row">
                        <Button icon={Plus} onClick={() => setNominating(true)}>
                          Nominate people
                        </Button>
                      </div>
                    )}
                    <div className="yx-growth-cols" data-n="2">
                      <Card title={`Enrolled · ${d.enrolled.length} of ${s.seats}`}>
                        {d.enrolled.length === 0 ? (
                          <Text tone="secondary">No one yet.</Text>
                        ) : (
                          <ul className="yx-growth-list">
                            {d.enrolled.map((e) => (
                              <li key={e.enrolmentId} className="yx-growth-list__item">
                                <PersonLabel name={e.name} />
                                <span className="yx-growth-grow" />
                                {ld && scheduled && (
                                  <Button size="sm" onClick={() => setWithdrawing(e)}>
                                    Withdraw
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </Card>
                      <Card title={`Waitlist · ${d.waitlist.length}`}>
                        {d.waitlist.length === 0 ? (
                          <Text tone="secondary">No one waiting.</Text>
                        ) : (
                          <ol className="yx-growth-list">
                            {d.waitlist.map((n, i) => (
                              <li key={n.enrolmentId} className="yx-growth-list__item">
                                <span className="yx-growth-num yx-growth-meta">{i + 1}</span>
                                <PersonLabel name={n.name} />
                              </li>
                            ))}
                          </ol>
                        )}
                        <Text size="sm" tone="secondary">
                          First come, first served. A withdrawal moves the next person up automatically.
                        </Text>
                      </Card>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="attendance">
                  {d.enrolled.length === 0 ? (
                    <EmptyState compact title="No one to mark yet" />
                  ) : (
                    <div className="yx-growth-stack">
                      <div className="yx-growth-scroll" tabIndex={0} role="region" aria-label="Attendance by slot">
                        <table className="yx-growth-matrix">
                          <thead>
                            <tr>
                              <th scope="col">Attendee</th>
                              {s.slots.map((x) => (
                                <th key={x.id} scope="col">
                                  {x.label}
                                </th>
                              ))}
                              <th scope="col">How</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.attendance.map((a) => (
                              <tr key={a.enrolmentId}>
                                <th scope="row">{a.name}</th>
                                {a.marks.map((m, i) => (
                                  <td key={i} data-tone={m === 'Absent' ? 'bad' : m === 'Late' ? 'gap' : undefined}>
                                    {m ?? 'Not marked'}
                                  </td>
                                ))}
                                <td className="yx-growth-meta">{a.method}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {!s.confirmed && (
                        <div className="yx-growth-row">
                          <Button onClick={() => setMarking(openSlot?.id ?? s.slots[0].id)}>Mark manually</Button>
                          {ld && (
                            <Button variant="primary" icon={Check} disabled={!ended} onClick={() => void live.onConfirm()}>
                              Confirm attendance
                            </Button>
                          )}
                          {ld && !ended && <Text size="sm" tone="secondary">Confirm after the last slot ends.</Text>}
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="results">
                  {d.results.length === 0 ? (
                    <EmptyState compact title="No results yet" description={`Results come when L&D confirms attendance. Attending ${s.attendancePct}% of the slots completes the course; anyone who attended no slot is a no-show.`} />
                  ) : (
                    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Results">
                      <table className="yx-growth-matrix">
                        <thead>
                          <tr>
                            <th scope="col">Attendee</th>
                            <th scope="col">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.results.map((r) => (
                            <tr key={r.name}>
                              <th scope="row">{r.name}</th>
                              <td>
                                <Badge tone={RESULT_TONE[r.status]}>{r.status}</Badge> <span className="yx-growth-meta">{r.reason}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
                {ld && (
                  <TabsContent value="cost">
                    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Cost">
                      <table className="yx-growth-matrix">
                        <tbody>
                          {d.costLines.map((c) => (
                            <tr key={c.label}>
                              <th scope="row">{c.label}</th>
                              <td className="yx-growth-num">{inr(Number(c.amount))}</td>
                            </tr>
                          ))}
                          <tr>
                            <th scope="row">Total · {inr(Math.round(total / Math.max(1, d.enrolled.length)))} per attendee</th>
                            <td className="yx-growth-num">
                              <strong>{inr(total)}</strong>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>
                )}
              </Tabs>
              {ld && scheduled && (
                <div className="yx-growth-row">
                  <Button onClick={() => setCancelling(true)}>Cancel session</Button>
                </div>
              )}
              {rescheduling && (
                <ScheduleDrawer
                  courses={[]}
                  trainers={live.trainers}
                  start={{ courseId: '', mode: s.mode === 'Virtual' ? 'virtual' : 'classroom', venue: s.venue, trainerId: '', seats: s.seats, slots: s.slots.map((x) => ({ startsAt: x.startsAt, endsAt: x.endsAt })), costLines: d.costLines }}
                  onClose={() => setRescheduling(false)}
                  onSave={live.onReschedule}
                />
              )}
              {marking && <MarkDialog slots={s.slots} slotId={marking} people={d.attendance} onClose={() => setMarking(null)} onSave={live.onMark} />}
              {nominating && <NominateSheet title={`Nominate for ${s.course}`} course={s.course} session={{ label: `${when(s.start)}, ${s.venue}`, seats: s.seats, enrolled: d.enrolled.length, waitlist: d.waitlist.length }} people={live.people.filter((p) => !d.enrolled.some((e) => e.employeeId === p.value) && !d.waitlist.some((w) => w.employeeId === p.value))} mandatory={s.mandatory} onClose={() => setNominating(false)} onNominate={live.onNominate} />}
              <ConfirmDialog
                open={Boolean(withdrawing)}
                onOpenChange={(o) => !o && setWithdrawing(null)}
                title={`Withdraw ${withdrawing?.name ?? ''} from ${s.course}?`}
                consequence="Their seat goes to the first person on the waitlist, who is told."
                confirmLabel="Withdraw"
                onConfirm={async () => {
                  if (withdrawing) await live.onWithdraw(withdrawing);
                  setWithdrawing(null);
                }}
              />
              <ConfirmDialog
                open={cancelling}
                onOpenChange={setCancelling}
                title={`Cancel the ${s.course} session?`}
                consequence="Everyone with a seat or a waitlist place is told, and their places end."
                confirmLabel="Cancel session"
                cancelLabel="Keep it"
                destructive
                onConfirm={async () => {
                  await live.onCancel();
                  setCancelling(false);
                }}
              />
            </div>
          )
        }
      </Loading>
    </GrowthFrame>
  );
}

function MarkDialog({ slots, slotId: first, people, onClose, onSave }: { slots: LiveSessionPageData['session']['slots']; slotId: string; people: LiveSessionPageData['attendance']; onClose: () => void; onSave: LiveSessionPage['onMark'] }) {
  const [slotId, setSlot] = useState(first);
  const i = slots.findIndex((x) => x.id === slotId);
  const [marks, setMarks] = useState<Record<string, 'present' | 'late' | 'absent'>>({});
  useEffect(() => setMarks(Object.fromEntries(people.map((p) => [p.enrolmentId, (p.marks[i]?.toLowerCase() as 'present' | 'late' | 'absent' | undefined) ?? 'absent']))), [slotId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Mark attendance"
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={Check}
            onClick={async () => {
              try {
                await onSave(slotId, Object.entries(marks).map(([enrolmentId, status]) => ({ enrolmentId, status })));
                onClose();
              } catch {
                // The page said what went wrong.
              }
            }}
          >
            Save attendance
          </Button>
        </>
      }
    >
      <div className="yx-growth-stack">
        <FormField label="Slot">
          <Select value={slotId} onChange={(v) => v && setSlot(v)} options={slots.map((x, n) => ({ value: x.id, label: `Slot ${n + 1}: ${x.label}` }))} />
        </FormField>
        <ul className="yx-growth-list">
          {people.map((p) => (
            <li key={p.enrolmentId} className="yx-growth-list__item">
              <span className="yx-growth-grow">{p.name}</span>
              <RadioGroup aria-label={`${p.name} attendance`} orientation="horizontal" value={marks[p.enrolmentId] ?? 'absent'} onChange={(v) => setMarks({ ...marks, [p.enrolmentId]: v as 'present' | 'late' | 'absent' })} options={[{ value: 'present', label: 'Present' }, { value: 'late', label: 'Late' }, { value: 'absent', label: 'Absent' }]} />
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

/* ================================================================== LRN-06 · Nominate + decline */

export interface SessionOption {
  id: string;
  label: string;
  seats: number;
  enrolled: number;
  waitlist: number;
}

/** LRN-06 nominate: people for a session (seat or waitlist each), what happens before sending. */
export function NominateSheet({ title, course, session, sessions, people, mandatory, onClose, onNominate }: { title: string; course: string; session?: { label: string; seats: number; enrolled: number; waitlist: number }; sessions?: SessionOption[]; people: SelectOption[]; mandatory: boolean; onClose: () => void; onNominate: (employeeIds: string[], sessionId?: string) => Promise<void> }) {
  const [who, setWho] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(sessions?.[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const s = session ?? sessions?.find((x) => x.id === picked);
  const preview = useMemo(() => {
    if (!s) return [];
    let state = { seats: s.seats, enrolled: Array.from({ length: s.enrolled }, (_, i) => `x${i}`), waitlist: Array.from({ length: s.waitlist }, (_, i) => `w${i}`) };
    return who.map((id) => {
      const r = seatFor(state, id);
      state = r;
      return { name: people.find((p) => p.value === id)?.label ?? '', result: r.result === 'Waitlisted' ? `Waitlist, position ${'position' in r ? r.position : ''}` : r.result };
    });
  }, [s, who, people]);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <div className="yx-growth-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!who.length || !s}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onNominate(who, picked ?? undefined);
                onClose();
              } catch {
                // The page said what went wrong.
              } finally {
                setBusy(false);
              }
            }}
          >
            {`Nominate ${who.length} ${who.length === 1 ? 'person' : 'people'}`}
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        {sessions ? (
          sessions.length === 0 ? (
            <InlineAlert tone="info">No session of {course} is scheduled yet. L&amp;D schedules sessions.</InlineAlert>
          ) : (
            <FormField label="Session" required>
              <Select value={picked} onChange={setPicked} options={sessions.map((x) => ({ value: x.id, label: `${x.label} · ${x.enrolled} of ${x.seats} seats` }))} />
            </FormField>
          )
        ) : (
          <DescriptionList items={[{ label: 'Course', value: course }, { label: 'Session', value: session!.label }, { label: 'Seats', value: `${session!.enrolled} of ${session!.seats} taken` }]} />
        )}
        <FormField label="People" required>
          <MultiSelect value={who} onChange={setWho} options={people} searchable />
        </FormField>
        <div className="yx-growth-effect" aria-live="polite">
          <span className="yx-growth-effect__title">What happens</span>
          <ul>
            {preview.map((p) => (
              <li key={p.name}>
                {p.name}: {p.result}
              </li>
            ))}
            <li>{mandatory ? 'Each person is told. This course is mandatory, so it can’t be declined.' : 'Each person is told and can decline with a reason, except for mandatory courses.'}</li>
          </ul>
        </div>
      </div>
    </Drawer>
  );
}

/** LRN-06 decline: a reason (at least 10 characters) the manager sees; mandatory courses can't be declined. */
export function DeclineSheet({ course, mandatory, onClose, onDecline }: { course: string; mandatory: boolean; onClose: () => void; onDecline: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Decline nomination: ${course}`}
      footer={
        <div className="yx-growth-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            disabled={mandatory || reason.trim().length < 10}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDecline(reason.trim());
                onClose();
              } catch {
                // The page said what went wrong.
              } finally {
                setBusy(false);
              }
            }}
          >
            Decline nomination
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        {mandatory ? (
          <InlineAlert tone="warning" title="Mandatory courses can’t be declined">
            This course is required for your role. Talk to your manager if the date doesn’t work; they can move you to another session.
          </InlineAlert>
        ) : (
          <>
            <Text>Your manager sees your reason.</Text>
            <FormField label="Reason" required helper="At least 10 characters.">
              <TextArea value={reason} onChange={setReason} rows={3} />
            </FormField>
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ================================================================== LRN-05 · Trainer QR attendance + check-in */

export interface LiveTrainerQr {
  session: string;
  slot: string;
  /** The QR image (a data URL the page makes from the check-in link), or null when check-in is closed. */
  qrImage: string | null;
  code: string | null;
  secondsLeft: number;
  expected: { enrolmentId: string; name: string }[];
  present: string[];
  closed: boolean;
  onCloseCheckin: () => Promise<void>;
  onSave: (marks: { enrolmentId: string; status: 'present' | 'absent' }[]) => Promise<void>;
  onBack: () => void;
}

/** LRN-05, wired: the rotating code (QR and digits), the live count, close check-in, mark the rest by hand. */
export function LiveTrainerQrScreen({ live }: { live: LiveTrainerQr }) {
  const [manual, setManual] = useState(false);
  const [marked, setMarked] = useState<string[]>(live.present);
  useEffect(() => setMarked((m) => [...new Set([...m, ...live.present])]), [live.present]);
  const showList = manual || live.closed;
  return (
    <GrowthFrame area="learning" active="Sessions" persona="ld">
      <PageHeader title="Attendance" description={`${live.session} · ${live.slot}`} actions={<Button onClick={live.onBack}>Back to the session</Button>} />
      {live.closed ? (
        <InlineAlert tone="info" title="Check-in closed for this slot">
          {live.present.length} of {live.expected.length} checked in. Mark anyone else manually.
        </InlineAlert>
      ) : !manual ? (
        <div className="yx-growth-center">
          {live.qrImage && <img src={live.qrImage} alt={`Check-in code ${live.code ?? ''}`} width={220} height={220} />}
          <Text size="lg" weight="semibold">
            {live.code?.replace(/(\d{3})(\d{3})/, '$1 $2')}
          </Text>
          <Text tone="secondary">Attendees scan this in the YukthiX app, or type the code. It changes every 30 seconds ({live.secondsLeft} s left).</Text>
        </div>
      ) : null}
      <p className="yx-growth-center" aria-live="polite">
        <strong className="yx-growth-points">
          {live.present.length} of {live.expected.length}
        </strong>{' '}
        <Text tone="secondary">checked in</Text>
      </p>
      {showList && (
        <ul className="yx-growth-list">
          {live.expected.map((n) => (
            <li key={n.enrolmentId} className="yx-growth-list__item">
              <Checkbox checked={marked.includes(n.enrolmentId)} onChange={(c) => setMarked((m) => (c ? [...m, n.enrolmentId] : m.filter((x) => x !== n.enrolmentId)))} label={n.name} />
            </li>
          ))}
        </ul>
      )}
      <div className="yx-growth-row">
        {showList ? (
          <Button variant="primary" icon={Check} onClick={() => void live.onSave(live.expected.map((n) => ({ enrolmentId: n.enrolmentId, status: marked.includes(n.enrolmentId) ? 'present' : 'absent' })))}>
            Save attendance
          </Button>
        ) : (
          <>
            <Button variant="primary" onClick={() => void live.onCloseCheckin()}>
              Close check-in
            </Button>
            <Button onClick={() => setManual(true)}>Mark manually</Button>
          </>
        )}
      </div>
    </GrowthFrame>
  );
}

/** The attendee's check-in: from the QR (code filled in) or typed at a kiosk. */
export function CheckInScreen({ course, defaultCode, result, onCheckIn }: { course: string | null; defaultCode?: string; result: { tone: 'success' | 'danger'; text: string } | null; onCheckIn: (code: string) => Promise<void> }) {
  const [code, setCode] = useState(defaultCode ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <GrowthFrame area="learning" active="My learning" persona="emp">
      <PageHeader title="Check in" description={course ? `${course}: type the 6-digit code on the trainer’s screen.` : 'Type the 6-digit code on the trainer’s screen.'} />
      <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
        {result && <InlineAlert tone={result.tone}>{result.text}</InlineAlert>}
        <FormField label="Code" required>
          <TextField value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
        </FormField>
        <div className="yx-growth-row">
          <Button
            variant="primary"
            disabled={code.length !== 6}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onCheckIn(code);
              } finally {
                setBusy(false);
              }
            }}
          >
            Check in
          </Button>
        </div>
      </div>
    </GrowthFrame>
  );
}

