// Batch G3b (M07 Q7-Q8; answers 2609): LRN-04 sessions, LRN-05 trainer attendance code, LRN-12 reaction and the
// manager's check, and a learner's seats in the course player, with real records in the designed layouts. The
// designed screens (learn-admin.tsx, learn-me.tsx) render these when given `live`.
import { useEffect, useState, type ReactNode } from 'react';
import { Check, Plus, QrCode, Trash2, UserCheck, Video } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { Card, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { PlainTable } from '../../components/plain-table';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { useToast } from '../../components/notify';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { CodeField, CurrencyField, NumberField, TextArea, TextField, TimeField } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DatePicker } from '../../components/date';
import { formatDate, formatINR } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { GrowthFrame, RatingScale } from './growth-kit';

export interface LiveSlot {
  id: string;
  date: string;
  start: string;
  end: string;
}
type Mark = 'present' | 'late' | 'absent';
const MARK_WORDS: Record<Mark, string> = { present: 'Present', late: 'Late', absent: 'Absent' };
const day = (s: string) => new Date(`${s}T00:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const slotText = (s: LiveSlot) => `${formatDate(day(s.date))} · ${s.start}–${s.end}`;
const STATUS_WORDS = { scheduled: 'Scheduled', closed: 'Completed', cancelled: 'Cancelled' } as const;

/* ------------------------------------------------------------------ LRN-04 sessions list and one session */

export interface LiveSessionRow {
  id: string;
  course: string;
  type: string;
  start: string | null;
  venue: string;
  trainer: string;
  seats: number;
  seated: number;
  waiting: number;
  status: 'scheduled' | 'closed' | 'cancelled';
}
export interface LiveSessionPage {
  id: string;
  course: string;
  type: string;
  venue: string | null;
  link: string | null;
  trainer: string;
  isLd: boolean;
  seats: number;
  status: 'scheduled' | 'closed' | 'cancelled';
  slots: LiveSlot[];
  share: number;
  seated: { userId: string; name: string }[];
  waiting: { userId: string; name: string }[];
  attendance: { userId: string; name: string; marks: (Mark | null)[]; method: string }[];
  results: { userId: string; name: string; attended: number; ok: boolean }[];
  feedback: { responses: number; overall: number | null; trainer: number | null; comments: string[] };
  costs: { label: string; amount: number }[];
}
export interface SessionInput {
  courseId: string;
  slots: LiveSlot[];
  venue?: string;
  link?: string;
  trainerUserId: string;
  seats: number;
  costs: { label: string; amount: number }[];
}
export interface LiveSessions {
  view: 'list' | 'page';
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  /** L&D (learning.manage) schedules, withdraws and closes; a trainer sees their own sessions only. */
  isLd: boolean;
  sessions: LiveSessionRow[];
  page?: LiveSessionPage | null;
  /** Published classroom and virtual courses, to schedule. */
  courses: { id: string; title: string; type: string }[];
  /** People of the company, to pick the trainer. */
  people: { id: string; name: string }[];
  onSearchPeople?: (q: string) => void;
  today: Date;
  onOpen: (id: string) => void;
  onSchedule: (input: SessionInput) => Promise<{ id: string }>;
  onShowCode: (id: string) => void;
  onMarks: (slotId: string, marks: { userId: string; mark: Mark }[]) => Promise<unknown>;
  onWithdraw: (userId: string) => Promise<{ promoted: string | null }>;
  onClose: () => Promise<{ completed: number; noShow: number }>;
}

export function LiveSessionsScreen({ live }: { live: LiveSessions }) {
  const [scheduling, setScheduling] = useState(false);
  const cols: TableColumn<LiveSessionRow>[] = [
    { key: 'course', header: 'Course', value: (r) => r.course, width: 260 },
    { key: 'start', header: 'Starts', value: (r) => r.start ?? '', render: (r) => (r.start ? formatDate(day(r.start)) : '—'), width: 120 },
    { key: 'mode', header: 'Mode', value: (r) => (r.type === 'virtual' ? 'Virtual' : 'Classroom'), width: 110 },
    { key: 'venue', header: 'Venue or link', value: (r) => r.venue, width: 200 },
    { key: 'trainer', header: 'Trainer', value: (r) => r.trainer, width: 180 },
    { key: 'seats', header: 'Seats', type: 'number', value: (r) => r.seated, render: (r) => `${r.seated} of ${r.seats}`, width: 100 },
    { key: 'wait', header: 'Waitlist', type: 'number', value: (r) => r.waiting, width: 100 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => STATUS_WORDS[r.status], statusTone: (v) => (v === 'Completed' ? 'success' : v === 'Cancelled' ? 'neutral' : 'info'), width: 130 },
  ];
  return (
    <GrowthFrame area="learning" active="Sessions" persona="ld">
      {live.view === 'page' ? (
        live.state === 'error' ? (
          <ErrorState title="We couldn't open the session." description="Try again in a moment." onRetry={live.onRetry} />
        ) : !live.page ? (
          <Skeleton height={400} />
        ) : (
          <SessionPage live={live} page={live.page} />
        )
      ) : (
        <>
          <PageHeader
            title="Sessions"
            description={live.isLd ? 'Classroom and virtual sessions of your courses' : 'Sessions you train'}
            actions={
              live.isLd ? (
                <Button variant="primary" icon={Plus} onClick={() => setScheduling(true)}>
                  Schedule session
                </Button>
              ) : undefined
            }
          />
          <DataTable
            label="Sessions"
            columns={cols}
            rows={live.sessions}
            getRowId={(r) => r.id}
            state={live.state}
            onRetry={live.onRetry}
            empty={<EmptyState title="No sessions scheduled" description={live.isLd ? 'Schedule a session for a classroom or virtual course.' : 'Sessions you train show here.'} />}
            onRowClick={(r) => live.onOpen(r.id)}
          />
          {scheduling && <ScheduleSheet live={live} onClose={() => setScheduling(false)} />}
        </>
      )}
    </GrowthFrame>
  );
}

function SessionPage({ live, page }: { live: LiveSessions; page: LiveSessionPage }) {
  const { toast } = useToast();
  const [marking, setMarking] = useState(false);
  const open = page.status === 'scheduled';
  const total = page.costs.reduce((a, c) => a + c.amount, 0);
  const withdraw = async (p: { userId: string; name: string }) => {
    try {
      const r = await live.onWithdraw(p.userId);
      toast({ tone: 'success', title: r.promoted ? `${p.name} withdrawn. The next person on the waitlist has the seat and is told.` : `${p.name} withdrawn.` });
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    }
  };
  return (
    <div className="yx-growth-stack">
      <ObjectHeader
        name={page.course}
        icon={page.type === 'virtual' ? Video : UserCheck}
        secondary={`${page.slots[0] ? formatDate(day(page.slots[0].date)) : ''} · ${page.venue ?? page.link ?? ''} · trainer ${page.trainer}`}
        status={<Badge tone={page.status === 'closed' ? 'success' : page.status === 'cancelled' ? 'neutral' : 'info'}>{STATUS_WORDS[page.status]}</Badge>}
        facts={[
          { label: 'Seats', value: `${page.seated.length} of ${page.seats}` },
          { label: 'Waitlist', value: page.waiting.length },
          { label: 'Slots', value: page.slots.length },
          ...(page.isLd ? [{ label: 'Cost', value: formatINR(total) }] : []),
        ]}
        actions={
          open ? (
            <>
              <Button icon={QrCode} onClick={() => live.onShowCode(page.id)}>
                Show attendance code
              </Button>
              {page.isLd && (
                <ConfirmDialog
                  trigger={<Button variant="primary">Close session</Button>}
                  title="Close this session?"
                  consequence={`People who attended at least ${page.share}% of the slots complete the course; the rest stay enrolled as a no-show. Attendance can't change after this.`}
                  confirmLabel="Close session"
                  onConfirm={async () => {
                    const r = await live.onClose();
                    toast({ tone: 'success', title: `Session closed. ${r.completed} completed, ${r.noShow} no-show.` });
                  }}
                />
              )}
            </>
          ) : undefined
        }
      />
      <Tabs defaultValue="attendees">
        <TabsList aria-label="Session">
          <TabsTrigger value="attendees" count={page.seated.length}>
            Attendees
          </TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          {page.isLd && <TabsTrigger value="cost">Cost</TabsTrigger>}
        </TabsList>
        <TabsContent value="attendees">
          <div className="yx-growth-cols" data-n="2">
            <Card title={`Enrolled · ${page.seated.length} of ${page.seats}`}>
              {page.seated.length === 0 ? (
                <Text tone="secondary">No one has booked yet.</Text>
              ) : (
                <ul className="yx-growth-list">
                  {page.seated.map((p) => (
                    <li key={p.userId} className="yx-growth-list__item">
                      <PersonLabel name={p.name} />
                      <span className="yx-growth-grow" />
                      {page.isLd && open && (
                        <Button size="sm" onClick={() => void withdraw(p)}>
                          Withdraw
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={`Waitlist · ${page.waiting.length}`}>
              {page.waiting.length === 0 ? (
                <Text tone="secondary">No one waiting.</Text>
              ) : (
                <ol className="yx-growth-list">
                  {page.waiting.map((p, i) => (
                    <li key={p.userId} className="yx-growth-list__item">
                      <span className="yx-growth-num yx-growth-meta">{i + 1}</span>
                      <PersonLabel name={p.name} />
                    </li>
                  ))}
                </ol>
              )}
              <Text size="sm" tone="secondary">
                First come, first served. A withdrawal moves the next person up automatically.
              </Text>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="attendance">
          {page.attendance.length === 0 ? (
            <EmptyState compact title="No one to mark yet" description="People with a seat show here." />
          ) : (
            <PlainTable
              label="Attendance by slot"
              rows={page.attendance}
              getRowId={(r) => r.userId}
              columns={[
                { key: 'name', header: 'Attendee', rowHeader: true, cell: (r) => r.name },
                ...page.slots.map((sl, i) => ({ key: sl.id, header: slotText(sl), cell: (r: LiveSessionPage['attendance'][number]) => (r.marks[i] ? MARK_WORDS[r.marks[i]!] : 'Not marked') })),
                { key: 'how', header: 'How', cell: (r) => (r.method ? r.method.replace('code', 'Code').replace('manual', 'By hand') : '—') },
              ]}
            />
          )}
          {open && page.attendance.length > 0 && (
            <div className="yx-growth-row">
              <Button icon={Check} onClick={() => setMarking(true)}>
                Mark manually
              </Button>
            </div>
          )}
          {marking && <MarkSheet slots={page.slots} people={page.seated} onSave={live.onMarks} onClose={() => setMarking(false)} />}
        </TabsContent>
        <TabsContent value="results">
          <PlainTable
            label="Results"
            rows={page.results}
            getRowId={(r) => r.userId}
            empty={<EmptyState compact title="No one has a seat yet" />}
            columns={[
              { key: 'name', header: 'Attendee', rowHeader: true, cell: (r) => r.name },
              { key: 'att', header: 'Attendance', num: true, cell: (r) => `${r.attended} of ${page.slots.length}` },
              {
                key: 'res',
                header: 'Result',
                cell: (r) => (
                  <>
                    <Badge tone={r.ok ? 'success' : page.status === 'closed' ? 'danger' : 'info'}>{r.ok ? (page.status === 'closed' ? 'Completed' : 'On track') : page.status === 'closed' ? 'No-show' : 'Not enough yet'}</Badge>{' '}
                    <span className="yx-growth-meta">Needs {page.share}% of the slots</span>
                  </>
                ),
              },
            ]}
          />
        </TabsContent>
        <TabsContent value="feedback">
          {page.feedback.responses === 0 ? (
            <EmptyState compact title="No feedback yet" description="Attendees rate the session after it closes." />
          ) : (
            <div className="yx-growth-stack">
              <div className="yx-growth-kpis">
                <Meter label="Session rating" value={page.feedback.overall ?? 0} max={5} valueText={`${page.feedback.overall} of 5 · ${page.feedback.responses} responses`} />
                <Meter label="Trainer score" value={page.feedback.trainer ?? 0} max={5} valueText={`${page.feedback.trainer} of 5`} />
              </div>
              <ul className="yx-growth-list">
                {page.feedback.comments.map((c, i) => (
                  <li key={i} className="yx-growth-list__item">
                    “{c}”
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
        {page.isLd && (
          <TabsContent value="cost">
            <PlainTable
              label="Cost"
              rows={page.costs}
              getRowId={(r) => r.label}
              empty={<EmptyState compact title="No costs recorded" />}
              columns={[
                { key: 'label', header: 'Item', rowHeader: true, cell: (r) => r.label },
                { key: 'amount', header: 'Amount', num: true, cell: (r) => formatINR(r.amount) },
              ]}
              footer={[{ id: 'total', label: `Total · ${formatINR(Math.round(total / Math.max(1, page.seated.length)))} per attendee`, cells: { amount: <strong>{formatINR(total)}</strong> } }]}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function MarkSheet({ slots, people, onSave, onClose }: { slots: LiveSlot[]; people: { userId: string; name: string }[]; onSave: LiveSessions['onMarks']; onClose: () => void }) {
  const { toast } = useToast();
  const [slotId, setSlotId] = useState(slots[0]?.id ?? '');
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const chosen = Object.entries(marks).map(([userId, mark]) => ({ userId, mark }));
  const save = async () => {
    if (!chosen.length) return setFailed('Mark at least one person.');
    setBusy(true);
    setFailed(null);
    try {
      await onSave(slotId, chosen);
      toast({ tone: 'success', title: `Attendance saved for ${chosen.length} ${chosen.length === 1 ? 'person' : 'people'}.` });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Mark attendance"
      footer={
        <div className="yx-growth-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} loading={busy} onClick={() => void save()}>
            Save attendance
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
        <FormField label="Slot">
          <Select value={slotId} onChange={(v) => setSlotId(v ?? slotId)} options={slots.map((s) => ({ value: s.id, label: slotText(s) }))} />
        </FormField>
        <ul className="yx-growth-list">
          {people.map((p) => (
            <li key={p.userId} className="yx-growth-list__item">
              <PersonLabel name={p.name} />
              <span className="yx-growth-grow" />
              <Segment<Mark> label={`Attendance of ${p.name}`} value={marks[p.userId] ?? null} onChange={(m) => setMarks((x) => ({ ...x, [p.userId]: m }))} options={(Object.keys(MARK_WORDS) as Mark[]).map((m) => ({ value: m, label: MARK_WORDS[m] }))} />
            </li>
          ))}
        </ul>
      </div>
    </Drawer>
  );
}

function ScheduleSheet({ live, onClose }: { live: LiveSessions; onClose: () => void }) {
  const { toast } = useToast();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ date: Date | null; start: string | null; end: string | null }[]>([{ date: null, start: '09:30', end: '17:30' }]);
  const [venue, setVenue] = useState('');
  const [link, setLink] = useState('');
  const [trainer, setTrainer] = useState<string | null>(null);
  const [seats, setSeats] = useState<number | null>(20);
  const [costs, setCosts] = useState<{ label: string; amount: number | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const course = live.courses.find((c) => c.id === courseId);
  const virtual = course?.type === 'virtual';
  const slotsOk = slots.every((s) => s.date && s.start && s.end && s.start < s.end);
  const early = useTooEarly([
    ...(courseId ? [] : [{ fieldId: 'ss-course', message: 'Choose the course.' }]),
    ...(slotsOk ? [] : [{ fieldId: 'ss-slots', message: 'Give every slot a day and a start before its end.' }]),
    ...(virtual ? (/^https:\/\/\S+$/.test(link.trim()) ? [] : [{ fieldId: 'ss-link', message: 'Paste the meeting link (https://).' }]) : venue.trim() ? [] : [{ fieldId: 'ss-venue', message: 'Write where it happens.' }]),
    ...(trainer ? [] : [{ fieldId: 'ss-trainer', message: 'Choose the trainer.' }]),
    ...(seats && seats > 0 ? [] : [{ fieldId: 'ss-seats', message: 'Give the number of seats.' }]),
  ]);
  const save = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      const r = await live.onSchedule({
        courseId: courseId!,
        slots: slots.map((s, i) => ({ id: `s${i + 1}`, date: iso(s.date!), start: s.start!, end: s.end! })),
        ...(virtual ? { link: link.trim() } : { venue: venue.trim() }),
        trainerUserId: trainer!,
        seats: seats!,
        costs: costs.filter((c) => c.label.trim() && c.amount != null).map((c) => ({ label: c.label.trim(), amount: c.amount! })),
      });
      toast({ tone: 'success', title: 'Session scheduled. Enrolled people can book a seat now.' });
      onClose();
      live.onOpen(r.id);
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Schedule session"
      footer={
        <div className="yx-growth-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Schedule session
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        {failed && <InlineAlert tone="danger" title="Not scheduled">{failed}</InlineAlert>}
        <FormField id="ss-course" label="Course" required error={early.errorOf('ss-course')} helper="Published classroom and virtual courses.">
          <Select value={courseId} onChange={setCourseId} options={live.courses.map((c) => ({ value: c.id, label: `${c.title} · ${c.type === 'virtual' ? 'Virtual' : 'Classroom'}` }))} />
        </FormField>
        <FormField id="ss-slots" label="Slots" required error={early.errorOf('ss-slots')} helper="One line per day. Times are India time.">
          <div className="yx-growth-stack">
            {slots.map((s, i) => (
              <FieldRow key={i}>
                <DatePicker aria-label={`Slot ${i + 1} day`} value={s.date} min={live.today} onChange={(d) => setSlots((xs) => xs.map((x, j) => (j === i ? { ...x, date: d } : x)))} />
                <TimeField aria-label={`Slot ${i + 1} start`} value={s.start} onChange={(t) => setSlots((xs) => xs.map((x, j) => (j === i ? { ...x, start: t } : x)))} />
                <TimeField aria-label={`Slot ${i + 1} end`} value={s.end} onChange={(t) => setSlots((xs) => xs.map((x, j) => (j === i ? { ...x, end: t } : x)))} />
                {slots.length > 1 && <IconButton icon={Trash2} label={`Remove slot ${i + 1}`} onClick={() => setSlots((xs) => xs.filter((_, j) => j !== i))} />}
              </FieldRow>
            ))}
            {slots.length < 20 && (
              <Button size="sm" icon={Plus} onClick={() => setSlots((xs) => [...xs, { date: null, start: '09:30', end: '17:30' }])}>
                Add slot
              </Button>
            )}
          </div>
        </FormField>
        {virtual ? (
          <FormField id="ss-link" label="Meeting link" required error={early.errorOf('ss-link')} helper="Only people with a seat see it.">
            <TextField value={link} onChange={setLink} placeholder="https://" />
          </FormField>
        ) : (
          <FormField id="ss-venue" label="Venue" required error={early.errorOf('ss-venue')}>
            <TextField value={venue} onChange={setVenue} maxLength={200} />
          </FormField>
        )}
        <FieldRow>
          <FormField id="ss-trainer" label="Trainer" required error={early.errorOf('ss-trainer')} helper="An employee; they see this session and show the attendance code.">
            <Select value={trainer} onChange={setTrainer} onSearchChange={live.onSearchPeople} searchable options={live.people.map((p) => ({ value: p.id, label: p.name }))} />
          </FormField>
          <FormField id="ss-seats" label="Seats" required error={early.errorOf('ss-seats')}>
            <NumberField value={seats} onChange={setSeats} min={1} max={1000} />
          </FormField>
        </FieldRow>
        <FormField label="Costs" optional helper="Trainer fee, venue, travel. Shown to L&D only.">
          <div className="yx-growth-stack">
            {costs.map((c, i) => (
              <FieldRow key={i}>
                <TextField aria-label={`Cost ${i + 1} label`} value={c.label} onChange={(v) => setCosts((xs) => xs.map((x, j) => (j === i ? { ...x, label: v } : x)))} placeholder="Trainer fee" />
                <CurrencyField aria-label={`Cost ${i + 1} amount`} value={c.amount} onChange={(v) => setCosts((xs) => xs.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
                <IconButton icon={Trash2} label={`Remove cost ${i + 1}`} onClick={() => setCosts((xs) => xs.filter((_, j) => j !== i))} />
              </FieldRow>
            ))}
            {costs.length < 20 && (
              <Button size="sm" icon={Plus} onClick={() => setCosts((xs) => [...xs, { label: '', amount: null }])}>
                Add cost
              </Button>
            )}
          </div>
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ LRN-05 the trainer's attendance code (phone) */

export interface LiveTrainerCode {
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  page: LiveSessionPage | null;
  slotId: string | null;
  onSlot: (slotId: string) => void;
  /** The current code from the server; asked again when it runs out. */
  code: { code: string; secondsLeft: number } | null;
  onRefresh: () => void;
  onMarks: LiveSessions['onMarks'];
}

export function LiveTrainerQrScreen({ live }: { live: LiveTrainerCode }) {
  const { toast } = useToast();
  const [left, setLeft] = useState(live.code?.secondsLeft ?? 0);
  const [manual, setManual] = useState(false);
  const [ticked, setTicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { onRefresh } = live;
  useEffect(() => setLeft(live.code?.secondsLeft ?? 0), [live.code]);
  useEffect(() => {
    if (!live.code) return;
    const t = setInterval(() => setLeft((s) => (s <= 1 ? (onRefresh(), 0) : s - 1)), 1000);
    return () => clearInterval(t);
  }, [live.code, onRefresh]);
  const p = live.page;
  if (live.state === 'error' || !p)
    return (
      <GrowthFrame area="learning" active="Sessions" persona="ld" device="phone" phone={{ title: 'Attendance', back: true, hideTabs: true }}>
        {live.state === 'error' ? <ErrorState title="We couldn't open the session." description="Try again in a moment." onRetry={live.onRetry} /> : <Skeleton height={300} />}
      </GrowthFrame>
    );
  const i = Math.max(0, p.slots.findIndex((s) => s.id === live.slotId));
  const slot = p.slots[i];
  const present = p.attendance.filter((a) => a.marks[i] && a.marks[i] !== 'absent').map((a) => a.userId);
  const marked = ticked ?? present;
  const closed = p.status !== 'scheduled';
  const save = async () => {
    setBusy(true);
    try {
      await live.onMarks(slot.id, p.seated.map((x) => ({ userId: x.userId, mark: marked.includes(x.userId) ? 'present' : 'absent' })));
      toast({ tone: 'success', title: 'Attendance saved.' });
      setManual(false);
      setTicked(null);
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <GrowthFrame area="learning" active="Sessions" persona="ld" device="phone" phone={{ title: 'Attendance', back: true, hideTabs: true }}>
      <div className="yx-growth-center">
        <Text weight="semibold">{p.course}</Text>
        {p.slots.length > 1 ? (
          <Select aria-label="Slot" value={slot.id} onChange={(v) => v && live.onSlot(v)} options={p.slots.map((s) => ({ value: s.id, label: slotText(s) }))} />
        ) : (
          <Text tone="secondary">{slotText(slot)}</Text>
        )}
      </div>
      {closed ? (
        <InlineAlert tone="info" title="This session is closed">
          {present.length} of {p.seated.length} were marked present in this slot.
        </InlineAlert>
      ) : !manual ? (
        <div className="yx-growth-center">
          <figure className="yx-qr">
            {live.code ? (
              <figcaption className="yx-qr__caption">
                <span>
                  Code <span className="yx-qr__code">{live.code.code}</span>
                </span>
                <span aria-live="polite">Changes in {left} s</span>
              </figcaption>
            ) : (
              <Skeleton height={60} />
            )}
          </figure>
          <Text tone="secondary">Attendees type this code in My learning › the course › Check in, on the day of the slot.</Text>
        </div>
      ) : null}
      <p className="yx-growth-center" aria-live="polite">
        <strong className="yx-growth-points">
          {marked.length} of {p.seated.length}
        </strong>
        <Text tone="secondary">checked in</Text>
      </p>
      {manual && (
        <ul className="yx-growth-list">
          {p.seated.map((x) => (
            <li key={x.userId} className="yx-growth-list__item">
              <PersonLabel name={x.name} />
              <span className="yx-growth-grow" />
              <Segment<'in' | 'out'> label={`${x.name} attended`} value={marked.includes(x.userId) ? 'in' : 'out'} onChange={(v) => setTicked((m) => (v === 'in' ? [...(m ?? present), x.userId] : (m ?? present).filter((y) => y !== x.userId)))} options={[{ value: 'in', label: 'Present' }, { value: 'out', label: 'Absent' }]} />
            </li>
          ))}
        </ul>
      )}
      {!closed && (
        <div className="yx-growth-pinned">
          {manual ? (
            <Button variant="primary" fullWidth icon={Check} loading={busy} onClick={() => void save()}>
              Save attendance
            </Button>
          ) : (
            <Button fullWidth onClick={() => setManual(true)}>
              Mark manually
            </Button>
          )}
        </div>
      )}
    </GrowthFrame>
  );
}

/* ------------------------------------------------------------------ the learner's sessions (in the course player) */

export interface LiveMySession {
  id: string;
  courseId: string;
  course: string;
  type: string;
  trainer: string;
  slots: LiveSlot[];
  venue: string | null;
  link: string | null;
  status: 'scheduled' | 'closed' | 'cancelled';
  seatsLeft: number;
  mySeat: string | null;
  canRate: boolean;
}
export interface LiveMySessions {
  sessions: LiveMySession[];
  today: string;
  onBook: (id: string) => Promise<{ status: string; position: number | null }>;
  onCancel: (id: string) => Promise<unknown>;
  onCheckIn: (id: string, slotId: string, code: string) => Promise<unknown>;
  onRate: (id: string) => void;
}

/** Sessions of a classroom or virtual course, shown in the course player: book, leave, check in, rate. */
export function MySessionsCard({ live }: { live: LiveMySessions }) {
  const { toast } = useToast();
  const [codes, setCodes] = useState<Record<string, string>>({});
  const mine = live.sessions.find((s) => s.mySeat);
  const run = async (f: () => Promise<unknown>, ok: string) => {
    try {
      await f();
      toast({ tone: 'success', title: ok });
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    }
  };
  return (
    <Card title="Sessions">
      {live.sessions.length === 0 ? (
        <Text tone="secondary">No session is scheduled yet. You'll be told when L&D schedules one.</Text>
      ) : (
        <ul className="yx-growth-list">
          {live.sessions.map((s) => {
            const todaySlot = s.mySeat === 'seated' && s.status === 'scheduled' ? s.slots.find((x) => x.date === live.today) : undefined;
            return (
              <li key={s.id} className="yx-growth-list__item yx-growth-stack">
                <div className="yx-growth-row">
                  <Text weight="semibold">{s.slots.map(slotText).join(' · ')}</Text>
                  {s.mySeat && <Badge tone={s.mySeat === 'seated' ? 'success' : 'info'}>{s.mySeat === 'seated' ? 'You have a seat' : `Waitlist, position ${s.mySeat.split(' ')[1]}`}</Badge>}
                  {s.status === 'closed' && <Badge tone="neutral">Completed</Badge>}
                </div>
                <Text size="sm" tone="secondary">
                  {s.link ?? s.venue ?? (s.type === 'virtual' ? 'Meeting link shown once you have a seat' : '')} · trainer {s.trainer}
                  {s.status === 'scheduled' && !s.mySeat ? ` · ${s.seatsLeft ? `${s.seatsLeft} seats left` : 'Full: you would join the waitlist'}` : ''}
                </Text>
                {todaySlot && (
                  <FieldRow>
                    <FormField label={`Check in · ${todaySlot.start}–${todaySlot.end}`} helper="Type the code the trainer shows.">
                      <CodeField value={codes[s.id] ?? ''} onChange={(v) => setCodes((c) => ({ ...c, [s.id]: v }))} />
                    </FormField>
                    <Button icon={Check} onClick={() => void run(() => live.onCheckIn(s.id, todaySlot.id, codes[s.id] ?? ''), 'You are checked in.')}>
                      Check in
                    </Button>
                  </FieldRow>
                )}
                <div className="yx-growth-row">
                  {s.status === 'scheduled' && !s.mySeat && !mine && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        void live
                          .onBook(s.id)
                          .then((r) => toast({ tone: 'success', title: r.status === 'seated' ? 'Seat booked. You are told of any change.' : `Session full. You are number ${r.position} on the waitlist.` }))
                          .catch((e: unknown) => toast({ tone: 'error', title: errorText(e) }))
                      }
                    >
                      {s.seatsLeft ? 'Book a seat' : 'Join the waitlist'}
                    </Button>
                  )}
                  {s.status === 'scheduled' && s.mySeat && (
                    <ConfirmDialog
                      trigger={<Button size="sm">{s.mySeat === 'seated' ? 'Give up my seat' : 'Leave the waitlist'}</Button>}
                      title={s.mySeat === 'seated' ? 'Give up your seat?' : 'Leave the waitlist?'}
                      consequence={s.mySeat === 'seated' ? 'The next person on the waitlist gets it. You stay enrolled in the course and can book another session.' : 'You stay enrolled in the course and can book another session.'}
                      confirmLabel={s.mySeat === 'seated' ? 'Give up seat' : 'Leave waitlist'}
                      onConfirm={async () => {
                        await live.onCancel(s.id);
                        toast({ tone: 'success', title: 'Done. You stay enrolled in the course.' });
                      }}
                    />
                  )}
                  {s.canRate && (
                    <Button size="sm" variant="primary" onClick={() => live.onRate(s.id)}>
                      Rate the session
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ LRN-12 reaction and the manager's check */

export interface LiveFeedback {
  mode: 'reaction' | 'manager-check';
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  /** Reaction: the session being rated. */
  session?: { id: string; course: string; trainer: string; when: string } | null;
  /** Manager's check: the people to ask about. */
  checks?: { sessionId: string; userId: string; person: string; course: string; closedOn: string }[];
  afterDays?: number;
  onReact?: (sessionId: string, v: { overall: number; trainer: number; comment?: string }) => Promise<unknown>;
  onCheck?: (sessionId: string, v: { aboutUserId: string; applying: 'yes' | 'partly' | 'no' | 'early'; comment?: string }) => Promise<unknown>;
  onDone: () => void;
}
const LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export function LiveTrainingFeedbackScreen({ live }: { live: LiveFeedback }) {
  const { toast } = useToast();
  const [overall, setOverall] = useState<number | null>(null);
  const [trainerScore, setTrainerScore] = useState<number | null>(null);
  const [applying, setApplying] = useState('');
  const [comment, setComment] = useState('');
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const reaction = live.mode === 'reaction';
  const check = live.checks?.[pick];
  const frame = (title: string, description: string | undefined, body: ReactNode, actions?: ReactNode) => (
    <GrowthFrame area="learning" active="My learning" persona={reaction ? 'emp' : 'mgr'}>
      <PageHeader title={title} description={description} actions={actions} />
      <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
        {body}
      </div>
    </GrowthFrame>
  );
  if (live.state !== 'ready')
    return frame(reaction ? 'Session feedback' : 'Training check', undefined, live.state === 'error' ? <ErrorState title="We couldn't open this." description="Try again in a moment." onRetry={live.onRetry} /> : <Skeleton height={300} />);
  if (reaction && !live.session) return frame('Session feedback', undefined, <EmptyState title="Nothing to rate" description="You can rate a session once it closes, if you had a seat." />);
  if (!reaction && !check) return frame('Training check', undefined, <EmptyState title="No checks due" description={`About ${live.afterDays ?? 60} days after your team members finish a session, we ask whether they are applying what they learnt.`} />);
  const send = async () => {
    setTried(true);
    if (reaction ? overall == null || trainerScore == null : !applying) return;
    setBusy(true);
    setFailed(null);
    try {
      if (reaction) await live.onReact!(live.session!.id, { overall: overall!, trainer: trainerScore!, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      else await live.onCheck!(check!.sessionId, { aboutUserId: check!.userId, applying: applying as 'yes', ...(comment.trim() ? { comment: comment.trim() } : {}) });
      toast({ tone: 'success', title: reaction ? 'Thank you. Your feedback goes into the course and trainer scores.' : 'Recorded. L&D uses this to judge how well the course works.' });
      setApplying('');
      setComment('');
      live.onDone();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const btn = (
    <Button variant="primary" loading={busy} onClick={() => void send()}>
      Send feedback
    </Button>
  );
  if (reaction)
    return frame(
      `Feedback: ${live.session!.course}`,
      `Session with ${live.session!.trainer} · ${live.session!.when}`,
      <>
        {failed && <InlineAlert tone="danger" title="Not sent">{failed}</InlineAlert>}
        <FormField label="How useful was the session overall?" required error={tried && overall == null ? 'Choose a rating.' : null}>
          <RatingScale label="Overall" value={overall} onChange={setOverall} labels={LABELS} />
        </FormField>
        <FormField label={`How was the trainer, ${live.session!.trainer}?`} required error={tried && trainerScore == null ? 'Choose a rating.' : null}>
          <RatingScale label="Trainer" value={trainerScore} onChange={setTrainerScore} labels={LABELS} />
        </FormField>
        <FormField label="What would you change?" optional helper="The trainer sees comments without your name.">
          <TextArea rows={3} value={comment} onChange={setComment} maxLength={1000} />
        </FormField>
      </>,
      btn,
    );
  return frame(
    'Training check',
    `${live.checks!.length} ${live.checks!.length === 1 ? 'person' : 'people'} to ask about`,
    <>
      {failed && <InlineAlert tone="danger" title="Not sent">{failed}</InlineAlert>}
      {live.checks!.length > 1 && (
        <FormField label="Person">
          <Select value={String(pick)} onChange={(v) => setPick(Number(v ?? 0))} options={live.checks!.map((c, i) => ({ value: String(i), label: `${c.person} · ${c.course}` }))} />
        </FormField>
      )}
      <Text>
        {check!.person} completed <strong>{check!.course}</strong> on {formatDate(day(check!.closedOn))}. Is {check!.person.split(' ')[0]} applying what they learnt?
      </Text>
      <FormField label="Applying the skill" required error={tried && !applying ? 'Choose one.' : null}>
        <RadioGroup
          aria-label="Applying the skill"
          value={applying}
          onChange={setApplying}
          options={[
            { value: 'yes', label: 'Yes, regularly' },
            { value: 'partly', label: 'Partly' },
            { value: 'no', label: 'Not yet' },
            { value: 'early', label: 'Too early to say' },
          ]}
        />
      </FormField>
      <FormField label="Example or comment" optional>
        <TextArea rows={3} value={comment} onChange={setComment} maxLength={1000} />
      </FormField>
    </>,
    btn,
  );
}
