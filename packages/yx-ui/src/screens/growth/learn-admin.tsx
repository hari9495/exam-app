// Learning, L&D side: course builder + paths (LRN-03), sessions + session page + trainer master (LRN-04, trainer portal),
// trainer QR attendance (LRN-05), assignment rules (LRN-07), compliance dashboard (LRN-08), team skills matrix (LRN-09),
// training needs + budgets (LRN-11), skills library admin (LRN-14), AI course draft review (LRN-16).
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Download, FileText, GitMerge, MoreHorizontal, Plus, QrCode, RefreshCw, Trash2, UserCheck, Video } from 'lucide-react';
import { Button, IconButton, Link } from '../../components/button';
import { AiBadge, Badge, PersonLabel } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Heatmap, StatCard } from '../../components/charts';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { Select } from '../../components/select';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/menu';
import { ConditionBuilder } from '../../components/condition';
import type { Rule, RuleSchema } from '../../lib/rules';
import { formatDate, formatINR } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { PortalFrame } from '../_kit/frames';
import { TODAY } from '../_kit/data';
import { GrowthFrame, QrTile, SkillLevel, SplitLayout } from './growth-kit';
import { complianceCell, completionStatus, withdraw } from './growth-logic';
import type { Course } from './learn-me';
import type { LoadState } from './perf-goals';
import './growth.css';

/* ================================================================== LRN-03 · Course builder + learning paths */

export interface BuilderItem {
  id: string;
  title: string;
  kind: 'Video' | 'PDF' | 'SCORM' | 'Link' | 'Quiz';
  minutes: number;
  required: boolean;
}

export interface CourseBuilderProps {
  course: Course;
  items: BuilderItem[];
  tab?: 'content' | 'assessment' | 'certificate' | 'skills' | 'settings' | 'paths';
  paths?: { id: string; name: string; courses: string[]; certificate: boolean; enrolled: number }[];
  status?: 'Draft' | 'Published';
}

/** LRN-03 Course builder (T3): content items, assessment picker, certificate (+ Open Badge / Credly), skill mapping, settings; learning paths. */
export function CourseBuilderScreen({ course, items: initial, tab = 'content', paths = [], status = 'Draft' }: CourseBuilderProps) {
  const [items, setItems] = useState(initial);
  const [badge, setBadge] = useState(true);
  const [credly, setCredly] = useState(false);
  const [threshold, setThreshold] = useState<number | null>(75);
  const [pass, setPass] = useState<number | null>(70);
  const noRequired = !items.some((i) => i.required);
  const move = (i: number, by: -1 | 1) =>
    setItems((xs) => {
      const j = i + by;
      if (j < 0 || j >= xs.length) return xs;
      const n = [...xs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  return (
    <GrowthFrame area="learning" active="Course builder" persona="ld">
      <ObjectHeader
        name={course.title}
        icon={FileText}
        secondary={`${course.type} · ${course.duration} · ${course.source}`}
        status={<Badge tone={status === 'Published' ? 'success' : 'neutral'}>{status}</Badge>}
        facts={[
          { label: 'Items', value: items.length },
          { label: 'Required', value: items.filter((i) => i.required).length },
          { label: 'Cost', value: course.cost ? formatINR(course.cost) : 'No cost' },
        ]}
        actions={
          <>
            <Button>Preview as learner</Button>
            <Button variant="primary" disabled={noRequired}>
              {status === 'Published' ? 'Publish changes' : 'Publish course'}
            </Button>
          </>
        }
      />
      {noRequired && (
        <InlineAlert tone="danger" title="Mark at least one item as required">
          A course needs a required item or an assessment so completion can be checked.
        </InlineAlert>
      )}
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Course builder">
          <TabsTrigger value="content" count={items.length}>
            Content
          </TabsTrigger>
          <TabsTrigger value="assessment">Assessment</TabsTrigger>
          <TabsTrigger value="certificate">Certificate</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="paths" count={paths.length}>
            Learning paths
          </TabsTrigger>
        </TabsList>
        <TabsContent value="content">
          <div className="yx-growth-stack">
            <ol className="yx-growth-list">
              {items.map((it, i) => (
                <li key={it.id} className="yx-growth-list__item">
                  <span className="yx-growth-num yx-growth-meta">{i + 1}</span>
                  <div className="yx-growth-list__main">
                    <span className="yx-growth-list__title">{it.title}</span>
                    <span className="yx-growth-meta">
                      {it.kind} · {it.minutes} min
                    </span>
                  </div>
                  <Checkbox checked={it.required} onChange={(c) => setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, required: c } : x)))} label="Required" />
                  <IconButton icon={ArrowUp} label={`Move ${it.title} up`} size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label={`Move ${it.title} down`} size="sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
                  <IconButton icon={Trash2} label={`Remove ${it.title}`} size="sm" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))} />
                </li>
              ))}
            </ol>
            <div className="yx-growth-row">
              <Button icon={Plus}>Add video or PDF</Button>
              <Button icon={Plus}>Upload SCORM package</Button>
              <Button icon={Plus}>Add link</Button>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="assessment">
          <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
            <FormField label="Final assessment" helper="From the question bank. Enrolling creates a test invitation in the learner’s My tests.">
              <Select value="t1" onChange={() => {}} options={[{ value: 't1', label: 'Food safety basics (20 questions, 30 min)' }, { value: 't2', label: 'Allergen control check (10 questions)' }]} clearable />
            </FormField>
            <FormField label="Pass mark">
              <NumberField value={pass} onChange={setPass} suffix="%" min={0} max={100} />
            </FormField>
            <FormField label="Attempts allowed">
              <NumberField value={2} onChange={() => {}} />
            </FormField>
          </div>
        </TabsContent>
        <TabsContent value="certificate">
          <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
            <FormField label="Certificate template">
              <Select value="c1" onChange={() => {}} options={[{ value: 'c1', label: 'Training certificate with QR verification' }]} />
            </FormField>
            <FormField label="Valid for" helper="Renewal enrolment is created 30 days before expiry.">
              <NumberField value={12} onChange={() => {}} suffix="months" />
            </FormField>
            <Switch checked={badge} onChange={setBadge} label="Also issue as Open Badge" description="A signed digital badge the employee can share and keep after they leave." />
            <Switch checked={credly} onChange={setCredly} label="Also push to Credly" description="Uses your company’s Credly account and fees." />
          </div>
        </TabsContent>
        <TabsContent value="skills">
          <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="yx-growth-matrix">
            <thead>
              <tr>
                <th scope="col">Skill</th>
                <th scope="col">Level gained on completion</th>
              </tr>
            </thead>
            <tbody>
              {course.skills.map((s, i) => (
                <tr key={s}>
                  <th scope="row">{s}</th>
                  <td>
                    <SkillLevel level={3 - (i % 2)} label={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </TabsContent>
        <TabsContent value="settings">
          <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
            <FieldRow>
              <FormField label="Cost per person">
                <CurrencyField value={course.cost} onChange={() => {}} />
              </FormField>
              <FormField label="Attendance to complete" helper="Share of session slots.">
                <NumberField value={threshold} onChange={setThreshold} suffix="%" />
              </FormField>
            </FieldRow>
            <Switch defaultChecked={course.approval} label="Self-enrolment needs approval" />
            <Switch defaultChecked label="Create the online meeting automatically for virtual sessions" description="On the trainer’s connected calendar, or L&D’s when the trainer has none." />
            <Switch defaultChecked={course.cost > 25000} label="Training bond above ₹25,000" description="12 months, pro-rata recovery after HR confirms." />
          </div>
        </TabsContent>
        <TabsContent value="paths">
          {paths.length === 0 ? (
            <EmptyState compact title="Not part of any learning path" action={<Button icon={Plus}>Add to a path</Button>} />
          ) : (
            <ul className="yx-growth-list">
              {paths.map((p) => (
                <li key={p.id} className="yx-growth-list__item">
                  <div className="yx-growth-list__main">
                    <span className="yx-growth-list__title">{p.name}</span>
                    <span className="yx-growth-meta">{p.courses.map((c, i) => `${i + 1}. ${c}`).join(' → ')}</span>
                  </div>
                  {p.certificate && <Badge tone="success">Path certificate</Badge>}
                  <span className="yx-growth-meta">{p.enrolled} enrolled</span>
                  <Button size="sm">Edit path</Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </GrowthFrame>
  );
}

/* ================================================================== LRN-04 · Sessions + session page + trainer master */

export interface SessionRow {
  id: string;
  course: string;
  start: Date;
  mode: 'Classroom' | 'Virtual';
  venue: string;
  trainer: string;
  external: boolean;
  seats: number;
  enrolled: string[];
  waitlist: string[];
  status: 'Scheduled' | 'In progress' | 'Completed' | 'Cancelled';
  cost: number;
}

export interface SessionPageData {
  session: SessionRow;
  slots: string[];
  attendance: { name: string; marks: ('Present' | 'Absent' | 'Late' | null)[]; method: string }[];
  results: { name: string; score: number | null }[];
  feedback: { avg: number; trainer: number; responses: number; comments: string[] };
  costLines: { label: string; amount: number }[];
  meeting?: { platform: string; link: string; report: boolean };
}

export interface Trainer {
  id: string;
  name: string;
  org: string;
  external: boolean;
  sessions: number;
  score: number | null;
  accessEnds: Date | null;
}

export interface SessionsProps {
  persona: 'ld' | 'trn';
  view: 'list' | 'page' | 'trainers';
  sessions: SessionRow[];
  page?: SessionPageData;
  trainers?: Trainer[];
  tab?: 'attendees' | 'attendance' | 'results' | 'feedback' | 'cost';
  state?: LoadState;
}

const SESSION_FIELDS: FilterFieldDef[] = [
  { key: 'mode', label: 'Mode', type: 'multi', options: [{ value: 'Classroom', label: 'Classroom' }, { value: 'Virtual', label: 'Virtual' }] },
  { key: 'status', label: 'Status', type: 'multi', options: ['Scheduled', 'In progress', 'Completed', 'Cancelled'].map((v) => ({ value: v, label: v })) },
];

function SessionPage({ page, persona, tab }: { page: SessionPageData; persona: 'ld' | 'trn'; tab: SessionsProps['tab'] }) {
  const s0 = page.session;
  const [seat, setSeat] = useState({ seats: s0.seats, enrolled: s0.enrolled, waitlist: s0.waitlist });
  const [promoted, setPromoted] = useState<string | null>(null);
  const total = page.costLines.reduce((a, c) => a + c.amount, 0);
  return (
    <div className="yx-growth-stack">
      <ObjectHeader
        name={s0.course}
        icon={s0.mode === 'Virtual' ? Video : UserCheck}
        secondary={`${formatDate(s0.start)} · ${s0.venue} · trainer ${s0.trainer}`}
        status={<Badge tone={s0.status === 'Completed' ? 'success' : 'info'}>{s0.status}</Badge>}
        facts={[
          { label: 'Seats', value: `${seat.enrolled.length} of ${seat.seats}` },
          { label: 'Waitlist', value: seat.waitlist.length },
          { label: 'Slots', value: page.slots.length },
          { label: 'Cost', value: formatINR(total) },
        ]}
        actions={
          persona === 'ld' ? (
            <>
              <Button>Reschedule</Button>
              <Button icon={QrCode}>Show attendance QR</Button>
            </>
          ) : (
            <Button icon={QrCode}>Show attendance QR</Button>
          )
        }
      />
      {page.meeting && (
        <InlineAlert tone="info" title={`Meeting created on ${page.meeting.platform}`}>
          Join link {page.meeting.link}. Invites went to every attendee; changes here update the same meeting.{page.meeting.report ? ' The participant report filled the Attendance tab; confirm it before results.' : ''}
        </InlineAlert>
      )}
      {promoted && (
        <InlineAlert tone="success" title={`${promoted} moved off the waitlist`}>
          They got a seat and were notified.
        </InlineAlert>
      )}
      <Tabs defaultValue={tab ?? 'attendees'}>
        <TabsList aria-label="Session">
          <TabsTrigger value="attendees" count={seat.enrolled.length}>
            Attendees
          </TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          {persona === 'ld' && <TabsTrigger value="cost">Cost</TabsTrigger>}
        </TabsList>
        <TabsContent value="attendees">
          <div className="yx-growth-cols" data-n="2">
            <Card title={`Enrolled · ${seat.enrolled.length} of ${seat.seats}`}>
              <ul className="yx-growth-list">
                {seat.enrolled.map((n) => (
                  <li key={n} className="yx-growth-list__item">
                    <PersonLabel name={n} />
                    <span className="yx-growth-grow" />
                    {persona === 'ld' && (
                      <Button
                        size="sm"
                        onClick={() => {
                          const r = withdraw(seat, n);
                          setSeat({ seats: r.seats, enrolled: r.enrolled, waitlist: r.waitlist });
                          setPromoted(r.promoted);
                        }}
                      >
                        Withdraw
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
            <Card title={`Waitlist · ${seat.waitlist.length}`}>
              {seat.waitlist.length === 0 ? (
                <Text tone="secondary">No one waiting.</Text>
              ) : (
                <ol className="yx-growth-list">
                  {seat.waitlist.map((n, i) => (
                    <li key={n} className="yx-growth-list__item">
                      <span className="yx-growth-num yx-growth-meta">{i + 1}</span>
                      <PersonLabel name={n} />
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
          <div className="yx-growth-scroll" tabIndex={0} role="region" aria-label="Attendance by slot">
            <table className="yx-growth-matrix">
              <thead>
                <tr>
                  <th scope="col">Attendee</th>
                  {page.slots.map((s) => (
                    <th key={s} scope="col">
                      {s}
                    </th>
                  ))}
                  <th scope="col">How</th>
                </tr>
              </thead>
              <tbody>
                {page.attendance.map((a) => (
                  <tr key={a.name}>
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
          <div className="yx-growth-row">
            <Button>Mark manually</Button>
            <Button variant="primary" icon={Check}>
              Confirm attendance
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="results">
          <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="yx-growth-matrix">
            <thead>
              <tr>
                <th scope="col">Attendee</th>
                <th scope="col">Attendance</th>
                <th scope="col">Score</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {page.results.map((r) => {
                const a = page.attendance.find((x) => x.name === r.name);
                const attended = a ? a.marks.filter((m) => m === 'Present' || m === 'Late').length : 0;
                const res = completionStatus({ kind: 'session', attendedSlots: attended, totalSlots: page.slots.length, passScore: 60, score: r.score });
                return (
                  <tr key={r.name}>
                    <th scope="row">{r.name}</th>
                    <td className="yx-growth-num">
                      {attended} of {page.slots.length}
                    </td>
                    <td className="yx-growth-num">{r.score == null ? '—' : `${r.score}%`}</td>
                    <td>
                      <Badge tone={res.status === 'Completed' ? 'success' : res.status === 'No-show' || res.status === 'Failed' ? 'danger' : 'info'}>{res.status}</Badge> <span className="yx-growth-meta">{res.reason}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </TabsContent>
        <TabsContent value="feedback">
          <div className="yx-growth-kpis">
            <StatCard label="Session rating" value={page.feedback.avg} unit="of 5" drill={{ label: `View ${page.feedback.responses} responses`, href: '#fb' }} />
            <StatCard label="Trainer score" value={page.feedback.trainer} unit="of 5" drill={{ label: 'View trainer history', href: '#trainer' }} />
          </div>
          <ul className="yx-growth-list">
            {page.feedback.comments.map((c) => (
              <li key={c} className="yx-growth-list__item">
                “{c}”
              </li>
            ))}
          </ul>
        </TabsContent>
        {persona === 'ld' && (
          <TabsContent value="cost">
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="yx-growth-matrix">
              <tbody>
                {page.costLines.map((c) => (
                  <tr key={c.label}>
                    <th scope="row">{c.label}</th>
                    <td className="yx-growth-num">{formatINR(c.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Total · {formatINR(Math.round(total / Math.max(1, seat.enrolled.length)))} per attendee</th>
                  <td className="yx-growth-num">
                    <strong>{formatINR(total)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/** LRN-04 Sessions (T3): list, one session record for attendees, attendance, results, feedback, cost (YX-LRN-08), trainer master; external trainer portal. */
export function SessionsScreen({ persona, view, sessions, page, trainers = [], tab, state = 'ready' }: SessionsProps) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const shown = useMemo(() => sessions.filter((s) => (!q || s.course.toLowerCase().includes(q.toLowerCase())) && filters.every((f) => matchesFilter((s as unknown as Record<string, unknown>)[f.key], f))), [sessions, filters, q]);
  const cols: TableColumn<SessionRow>[] = [
    { key: 'course', header: 'Course', value: (r) => r.course, width: 260 },
    { key: 'start', header: 'Starts', type: 'date', value: (r) => r.start, width: 120 },
    { key: 'mode', header: 'Mode', value: (r) => r.mode, width: 110 },
    { key: 'venue', header: 'Venue or link', value: (r) => r.venue, width: 200 },
    { key: 'trainer', header: 'Trainer', value: (r) => r.trainer + (r.external ? ' (external)' : ''), width: 200 },
    { key: 'seats', header: 'Seats', type: 'number', value: (r) => r.enrolled.length, render: (r) => `${r.enrolled.length} of ${r.seats}`, width: 100 },
    { key: 'wait', header: 'Waitlist', type: 'number', value: (r) => r.waitlist.length, width: 100 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Completed' ? 'success' : v === 'Cancelled' ? 'neutral' : 'info'), width: 130 },
  ];
  const list = (
    <DataTable
      label="Sessions"
      columns={cols}
      rows={shown}
      getRowId={(r) => r.id}
      state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
      onRetry={() => {}}
      filtered={filters.length > 0 || q !== ''}
      onClearFilters={() => {
        setFilters([]);
        setQ('');
      }}
      empty={<EmptyState title="No sessions scheduled" description="Schedule a session for a classroom or virtual course." />}
      toolbar={<FilterBar fields={SESSION_FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search course" />}
      views={persona === 'ld' ? <SavedViewMenu views={[{ id: 'up', name: 'Upcoming' }, { id: 'hosur', name: 'Hosur plant', shared: true }]} currentId="up" onSelect={() => {}} /> : undefined}
      onRowClick={() => {}}
    />
  );
  if (persona === 'trn')
    return (
      <PortalFrame tenant="Kaveri Foods Pvt Ltd" portal="Trainer portal" nav={[{ label: 'My sessions', active: true }]} user="Ramesh Kamath · Safe Works Training">
        <InlineAlert tone="info">Access ends 30 days after your last session (26 Oct 2026). You see only the people in your own sessions.</InlineAlert>
        {view === 'page' && page ? <SessionPage page={page} persona="trn" tab={tab} /> : list}
      </PortalFrame>
    );
  return (
    <GrowthFrame area="learning" active="Sessions" persona="ld">
      {view === 'page' && page ? (
        <SessionPage page={page} persona="ld" tab={tab} />
      ) : (
        <>
          <PageHeader title={view === 'trainers' ? 'Trainers' : 'Sessions'} actions={<Button variant="primary" icon={Plus}>{view === 'trainers' ? 'Add trainer' : 'Schedule session'}</Button>} />
          <Tabs defaultValue={view}>
            <TabsList aria-label="Sessions and trainers">
              <TabsTrigger value="list">Sessions</TabsTrigger>
              <TabsTrigger value="trainers" count={trainers.length}>
                Trainers
              </TabsTrigger>
            </TabsList>
            <TabsContent value="list">{list}</TabsContent>
            <TabsContent value="trainers">
              <DataTable
                label="Trainers"
                rows={trainers}
                getRowId={(r) => r.id}
                empty={<EmptyState compact title="No trainers yet" />}
                columns={[
                  { key: 'name', header: 'Trainer', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.org }), width: 240 },
                  { key: 'type', header: 'Type', type: 'status', value: (r) => (r.external ? 'External' : 'Internal'), statusTone: () => 'neutral', width: 120 },
                  { key: 'sessions', header: 'Sessions', type: 'number', value: (r) => r.sessions, width: 110 },
                  { key: 'score', header: 'Trainer score', type: 'number', value: (r) => r.score, render: (r) => (r.score == null ? 'No feedback yet' : `${r.score} of 5`), width: 140 },
                  { key: 'access', header: 'Portal access ends', type: 'date', value: (r) => r.accessEnds, render: (r) => (r.external ? (r.accessEnds ? formatDate(r.accessEnds) : 'No active session') : 'Uses employee login'), width: 180 },
                ]}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </GrowthFrame>
  );
}

/* ================================================================== LRN-05 · Trainer QR attendance (phone) */

/** LRN-05 Trainer QR screen (T8): rotating code per slot, live count, manual and kiosk-code fallback (M07 Q7). */
export function TrainerQrScreen({ session, slot, present, expected, closed, manual }: { session: string; slot: string; present: string[]; expected: string[]; closed?: boolean; manual?: boolean }) {
  const [marked, setMarked] = useState<string[]>(present);
  return (
    <GrowthFrame area="learning" active="Sessions" persona="ld" device="phone" phone={{ title: 'Attendance', back: true, hideTabs: true }}>
      <div className="yx-growth-center">
        <Text weight="semibold">{session}</Text>
        <Text tone="secondary">{slot}</Text>
      </div>
      {closed ? (
        <InlineAlert tone="info" title="Check-in closed for this slot">
          {marked.length} of {expected.length} checked in. Mark anyone else manually.
        </InlineAlert>
      ) : !manual ? (
        <div className="yx-growth-center">
          <QrTile sessionId="S-2031" slot={2} tick={17} secondsLeft={21} />
          <Text tone="secondary">Attendees scan this in the YukthiX app. No phone? They can type the code at the plant kiosk.</Text>
        </div>
      ) : null}
      <p className="yx-growth-center" aria-live="polite">
        <strong className="yx-growth-points">
          {marked.length} of {expected.length}
        </strong>
        <Text tone="secondary">checked in</Text>
      </p>
      {(manual || closed) && (
        <ul className="yx-growth-list">
          {expected.map((n) => (
            <li key={n} className="yx-growth-list__item">
              <Checkbox checked={marked.includes(n)} onChange={(c) => setMarked((m) => (c ? [...m, n] : m.filter((x) => x !== n)))} label={n} />
            </li>
          ))}
        </ul>
      )}
      <div className="yx-growth-pinned">
        {manual || closed ? (
          <Button variant="primary" fullWidth icon={Check}>
            Save attendance
          </Button>
        ) : (
          <>
            <Button variant="primary" fullWidth>
              Close check-in
            </Button>
            <Button fullWidth>Mark manually</Button>
          </>
        )}
      </div>
    </GrowthFrame>
  );
}

/* ================================================================== LRN-07 · Assignment rules */

export interface AssignmentRule {
  id: string;
  name: string;
  course: string;
  population: string;
  due: string;
  recurrence: string;
  matches: number;
  active: boolean;
}

const RULE_SCHEMA: RuleSchema = {
  triggers: [
    { value: 'daily', label: 'Every day', phrase: 'the daily check runs' },
    { value: 'join', label: 'Employee joins', phrase: 'an employee joins' },
    { value: 'transfer', label: 'Transfer', phrase: 'an employee transfers' },
    { value: 'role', label: 'Role change', phrase: 'an employee’s role changes' },
  ],
  fields: [
    { key: 'entity', label: 'Legal entity', type: 'choice', options: [{ value: 'ka', label: 'Kaveri Foods Pvt Ltd' }, { value: 'tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }] },
    { key: 'location', label: 'Location', type: 'choice', options: [{ value: 'hsr', label: 'Hosur plant' }, { value: 'blr', label: 'Bengaluru head office' }, { value: 'maa', label: 'Chennai office' }] },
    { key: 'department', label: 'Department', type: 'choice', options: ['Operations', 'Quality', 'Engineering', 'Sales', 'Finance', 'People'].map((d) => ({ value: d, label: d })) },
    { key: 'designation', label: 'Designation', type: 'text' },
  ],
  recipients: [{ value: 'mgr', label: 'Manager' }],
};

const HOSUR_RULE: Rule = {
  trigger: 'join',
  conditions: { id: 'g1', join: 'and', items: [{ id: 'c1', field: 'location', operator: 'one_of', value: ['hsr'] }, { id: 'c2', field: 'department', operator: 'one_of', value: ['Operations', 'Quality'] }] },
  actions: [],
};

/** LRN-07 Assignment rules (T3): population, course, due in N days, recurrence, reminders and escalation; preview of who matches (Q3). */
export function AssignmentRulesScreen({ rules, openId }: { rules: AssignmentRule[]; openId?: string }) {
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const current = rules.find((r) => r.id === open);
  return (
    <GrowthFrame area="learning" active="Compliance" persona="ld">
      <PageHeader title="Assignment rules" description="Who must complete what, by when. Checked every day and when people join, transfer or change role." actions={<Button variant="primary" icon={Plus}>Add rule</Button>} />
      <DataTable
        label="Assignment rules"
        rows={rules}
        getRowId={(r) => r.id}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
        empty={<EmptyState title="No assignment rules" description="Start with the shipped rules: POSH awareness for joiners, yearly fire safety for plant staff." action={<Button>Load starter rules</Button>} />}
        columns={[
          { key: 'name', header: 'Rule', value: (r) => r.name, width: 260 },
          { key: 'course', header: 'Course', value: (r) => r.course, width: 220 },
          { key: 'pop', header: 'Who', value: (r) => r.population, width: 240 },
          { key: 'due', header: 'Due', value: (r) => r.due, width: 150 },
          { key: 'rec', header: 'Repeats', value: (r) => r.recurrence, width: 120 },
          { key: 'matches', header: 'People', type: 'number', value: (r) => r.matches, width: 100 },
          { key: 'active', header: 'Status', type: 'status', value: (r) => (r.active ? 'Active' : 'Paused'), statusTone: (v) => (v === 'Active' ? 'success' : 'neutral'), width: 110 },
        ]}
      />
      {current && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpen(null)}
          size="lg"
          title={current.name}
          footer={
            <div className="yx-growth-foot">
              <Button onClick={() => setOpen(null)}>Cancel</Button>
              <Button variant="primary">Save rule</Button>
            </div>
          }
        >
          <div className="yx-growth-stack">
            <ConditionBuilder schema={RULE_SCHEMA} defaultValue={HOSUR_RULE} parts={['when', 'if']} />
            <FieldRow>
              <FormField label="Course">
                <Select value="fire" onChange={() => {}} options={[{ value: 'fire', label: 'Fire safety and evacuation' }, { value: 'posh', label: 'POSH awareness' }]} />
              </FormField>
              <FormField label="Due within">
                <NumberField value={30} onChange={() => {}} suffix="days" />
              </FormField>
            </FieldRow>
            <FormField label="Repeat">
              <RadioGroup aria-label="Repeat" orientation="horizontal" defaultValue="12" options={[{ value: '0', label: 'Once' }, { value: '12', label: 'Every 12 months' }, { value: '24', label: 'Every 24 months' }]} />
            </FormField>
            <FormField label="Reminders and escalation">
              <Text>Reminders 7 and 2 days before the due date; the manager is told the day after it’s missed, then HR after 7 days.</Text>
            </FormField>
            <div className="yx-growth-effect">
              <span className="yx-growth-effect__title">Preview</span>
              <ul>
                <li>{current.matches} people match today; 12 don’t have a valid completion and will be enrolled when you save.</li>
                <li>New joiners at Hosur plant are enrolled on their joining day.</li>
                <li>Expiring certificates create a renewal enrolment 30 days ahead.</li>
              </ul>
            </div>
          </div>
        </Drawer>
      )}
    </GrowthFrame>
  );
}

/* ================================================================== LRN-08 · Compliance dashboard */

export interface ComplianceData {
  courses: string[];
  rows: { dept: string; done: number[]; assigned: number[]; size: number }[];
  overdue: { id: string; name: string; dept: string; course: string; due: Date; manager: string }[];
}

/** LRN-08 Compliance dashboard (T6): department × mandatory course heatmap with % in every cell, overdue list, audit export. */
export function ComplianceDashboardScreen({ persona = 'ld', data, state = 'ready' }: { persona?: 'ld' | 'hr'; data: ComplianceData; state?: LoadState }) {
  const cells = data.rows.map((r) => ({ label: r.dept, groupSize: r.size, values: r.done.map((d, i) => complianceCell(d, r.assigned[i]).pct) }));
  const all = data.rows.flatMap((r) => r.done.map((d, i) => ({ d, a: r.assigned[i] })));
  const overall = complianceCell(all.reduce((a, x) => a + x.d, 0), all.reduce((a, x) => a + x.a, 0));
  return (
    <GrowthFrame area="learning" active="Compliance" persona={persona}>
      <PageHeader
        title="Compliance training"
        description="Mandatory courses by department, all entities. Expired certifications count as non-compliant."
        actions={
          <>
            <Select aria-label="Entity" value="all" onChange={() => {}} options={[{ value: 'all', label: 'All entities' }, { value: 'ka', label: 'Kaveri Foods Pvt Ltd' }, { value: 'tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }]} />
            <Button icon={Download}>Export for audit</Button>
            <Button variant="primary">Remind overdue</Button>
          </>
        }
      />
      {state === 'loading' ? (
        <Skeleton height={320} />
      ) : state === 'error' ? (
        <ErrorState title="Compliance figures didn’t load" onRetry={() => {}} reference="LRN-CMP-311" />
      ) : (
        <>
          <div className="yx-growth-kpis">
            <StatCard label="Overall completion" value={overall.pct ?? 0} unit="%" previous={88} previousLabel="August" drill={{ label: 'View by person', href: '#people' }} />
            <StatCard label="Overdue people" value={data.overdue.length} previous={31} previousLabel="August" drill={{ label: `View ${data.overdue.length} people`, href: '#overdue' }} />
            <StatCard label="Expiring in 30 days" value={17} drill={{ label: 'View 17 certificates', href: '#expiring' }} />
            <StatCard label="Mandatory courses" value={data.courses.length} drill={{ label: 'View assignment rules', href: '#rules' }} />
          </div>
          <Heatmap title="Completion by department" description="Share of assigned people with a valid completion. 95% and above is compliant; below 80% is non-compliant." xLabel="Department" columns={data.courses} rows={cells} max={100} format={(v) => `${v}%`} />
          <Card title={`Overdue · ${data.overdue.length}`}>
            <DataTable
              label="Overdue"
              rows={data.overdue}
              getRowId={(r) => r.id}
              empty={<EmptyState compact title="No one is overdue" />}
              columns={[
                { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.dept }), width: 220 },
                { key: 'course', header: 'Course', value: (r) => r.course, width: 220 },
                { key: 'due', header: 'Was due', type: 'date', value: (r) => r.due, width: 120 },
                { key: 'days', header: 'Days overdue', type: 'number', value: (r) => Math.round((TODAY.getTime() - r.due.getTime()) / 86400000), width: 130 },
                { key: 'mgr', header: 'Manager', value: (r) => r.manager, width: 180 },
              ]}
            />
          </Card>
        </>
      )}
    </GrowthFrame>
  );
}

/* ================================================================== LRN-09 · Team skills matrix */

/** LRN-09 Team skills matrix (T6, Mgr): people × competencies, gaps against the role highlighted with words (U87). */
export function TeamSkillsMatrixScreen({ people, skills, state = 'ready' }: { people: { name: string; role: string; levels: (number | null)[]; required: number[] }[]; skills: string[]; state?: LoadState }) {
  const gaps = people.reduce((a, p) => a + p.levels.filter((l, i) => l == null || l < p.required[i]).length, 0);
  return (
    <GrowthFrame area="learning" active="Skills" persona="mgr">
      <PageHeader title="Team skills" description="Quality team · confirmed skills only · required levels from each person’s role" facts={`${people.length} people · ${gaps} gaps`} actions={<Button variant="primary">Raise training need</Button>} />
      {state === 'loading' ? (
        <Skeleton height={300} />
      ) : people.length === 0 ? (
        <EmptyState title="No one in your team yet" />
      ) : (
        <div className="yx-growth-scroll" tabIndex={0} role="region" aria-label="Team skills matrix">
          <table className="yx-growth-matrix">
            <caption className="yx-growth-meta">Level of 5, with the required level when there’s a gap. Cells with a gap are shaded and say so.</caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                {skills.map((s) => (
                  <th key={s} scope="col">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.name}>
                  <th scope="row">
                    <PersonLabel name={p.name} secondary={p.role} />
                  </th>
                  {p.levels.map((l, i) => {
                    const gap = l == null || l < p.required[i];
                    return (
                      <td key={i} data-tone={gap ? 'gap' : undefined}>
                        <SkillLevel level={l} required={p.required[i]} label={`${p.name}, ${skills[i]}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GrowthFrame>
  );
}

/* ================================================================== LRN-11 · Training needs + budgets */

export interface TrainingNeed {
  id: string;
  title: string;
  who: string;
  source: 'Review gap' | 'Skill gap' | 'Manager request' | 'Employee request' | 'Compliance';
  skill: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'New' | 'Planned' | 'In progress' | 'Closed';
  plan?: string;
  estCost: number;
}

const NEED_FIELDS: FilterFieldDef[] = [
  { key: 'source', label: 'Source', type: 'multi', options: ['Review gap', 'Skill gap', 'Manager request', 'Employee request', 'Compliance'].map((v) => ({ value: v, label: v })) },
  { key: 'status', label: 'Status', type: 'multi', options: ['New', 'Planned', 'In progress', 'Closed'].map((v) => ({ value: v, label: v })) },
  { key: 'priority', label: 'Priority', type: 'multi', options: ['High', 'Medium', 'Low'].map((v) => ({ value: v, label: v })) },
];

/** LRN-11 Training needs (T2) grouped into plans, and department budgets per FY (planned, spent, committed) (Q4, Q5). */
export function TrainingNeedsScreen({ persona, needs, budgets, tab = 'needs', state = 'ready' }: { persona: 'ld' | 'fin'; needs: TrainingNeed[]; budgets: { dept: string; planned: number; spent: number; committed: number }[]; tab?: 'needs' | 'budgets'; state?: LoadState }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const shown = useMemo(() => needs.filter((n) => (!q || n.title.toLowerCase().includes(q.toLowerCase())) && filters.every((f) => matchesFilter((n as unknown as Record<string, unknown>)[f.key], f))), [needs, filters, q]);
  const cols: TableColumn<TrainingNeed>[] = [
    { key: 'title', header: 'Need', value: (r) => r.title, width: 260 },
    { key: 'who', header: 'For', value: (r) => r.who, width: 180 },
    { key: 'source', header: 'Source', value: (r) => r.source, groupable: true, width: 150 },
    { key: 'skill', header: 'Skill', value: (r) => r.skill, groupable: true, width: 170 },
    { key: 'priority', header: 'Priority', type: 'status', value: (r) => r.priority, statusTone: (v) => (v === 'High' ? 'danger' : v === 'Medium' ? 'warning' : 'neutral'), width: 110 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Closed' ? 'success' : v === 'New' ? 'info' : 'neutral'), groupable: true, width: 120 },
    { key: 'plan', header: 'Plan', value: (r) => r.plan ?? 'Not planned', width: 200 },
    { key: 'cost', header: 'Est. cost', type: 'money', value: (r) => r.estCost, total: 'sum', width: 130 },
  ];
  const budgetView = (
    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
    <table className="yx-growth-matrix">
      <thead>
        <tr>
          <th scope="col">Department</th>
          <th scope="col">Budget FY 2026-27</th>
          <th scope="col">Spent</th>
          <th scope="col">Committed</th>
          <th scope="col">Left</th>
          <th scope="col">Used</th>
        </tr>
      </thead>
      <tbody>
        {budgets.map((b) => {
          const left = b.planned - b.spent - b.committed;
          return (
            <tr key={b.dept}>
              <th scope="row">{b.dept}</th>
              <td className="yx-growth-num">{formatINR(b.planned)}</td>
              <td className="yx-growth-num">{formatINR(b.spent)}</td>
              <td className="yx-growth-num">{formatINR(b.committed)}</td>
              <td className="yx-growth-num" data-tone={left < 0 ? 'bad' : undefined}>
                {left < 0 ? `Over by ${formatINR(-left)}` : formatINR(left)}
              </td>
              <td>
                <Meter label={`${b.dept} budget used`} value={b.spent + b.committed} max={b.planned} valueText={`${Math.round(((b.spent + b.committed) / b.planned) * 100)}%`} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
  return (
    <GrowthFrame area="learning" active="Needs & budgets" persona={persona}>
      <PageHeader title="Training needs and budgets" description="Needs come from reviews, skill gaps, compliance and requests. Group them into a plan with a course or session." actions={persona === 'ld' ? <Button variant="primary" icon={Plus}>Add need</Button> : <Button icon={Download}>Export budgets</Button>} />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Needs and budgets">
          <TabsTrigger value="needs" count={needs.filter((n) => n.status !== 'Closed').length}>
            Needs
          </TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
        </TabsList>
        <TabsContent value="needs">
          <DataTable
            label="Training needs"
            columns={cols}
            rows={shown}
            getRowId={(r) => r.id}
            state={state === 'loading' ? 'loading' : 'ready'}
            defaultGroupBy="status"
            filtered={filters.length > 0 || q !== ''}
            onClearFilters={() => {
              setFilters([]);
              setQ('');
            }}
            toolbar={<FilterBar fields={NEED_FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search needs" />}
            selectable={persona === 'ld'}
            selectedIds={sel}
            onSelectedChange={setSel}
            bulkActions={(ids) => <Button size="sm">Group {ids.length} into a plan</Button>}
            empty={<EmptyState title="No training needs yet" description="Needs are added automatically from skill gaps and reviews, or by managers and employees." />}
          />
        </TabsContent>
        <TabsContent value="budgets">{budgetView}</TabsContent>
      </Tabs>
    </GrowthFrame>
  );
}

/* ================================================================== LRN-14 · Skills library admin */

export interface LibrarySkill {
  id: string;
  domain: string;
  skill: string;
  sub?: string;
  synonyms: string[];
  starter: boolean;
  status: 'Active' | 'Retired' | 'Merged';
  views: { competency: boolean; tag: boolean; scorecard: boolean };
  people: number;
  roles: string[];
}

/** LRN-14 Skills library admin (T2 / T3): one company library (starter + own), synonyms, proficiency scale, role requirements; retire or merge only when in use. */
export function SkillsLibraryScreen({ persona = 'hr', skills, openId, mergeOpen }: { persona?: 'hr' | 'ld'; skills: LibrarySkill[]; openId?: string; mergeOpen?: boolean }) {
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const [merge, setMerge] = useState(!!mergeOpen);
  const [q, setQ] = useState('');
  const cur = skills.find((s) => s.id === open);
  const shown = skills.filter((s) => !q || `${s.skill} ${s.synonyms.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <GrowthFrame area="learning" active="Skills" persona={persona}>
      <PageHeader title="Skills library" description="Domain → skill → sub-skill. Used by competencies, test question tags and hiring scorecards." facts={`${skills.length} skills · ${skills.filter((s) => s.starter).length} from the starter taxonomy`} actions={<><Button>Proficiency scale</Button><Button variant="primary" icon={Plus}>Add skill</Button></>} />
      <DataTable
        label="Skills library"
        rows={shown}
        getRowId={(r) => r.id}
        defaultGroupBy="domain"
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
        toolbar={<FilterBar fields={[]} value={[]} onChange={() => {}} search={q} onSearchChange={setQ} searchPlaceholder="Search skills and synonyms" />}
        columns={[
          { key: 'skill', header: 'Skill', value: (r) => (r.sub ? `${r.skill} › ${r.sub}` : r.skill), width: 240 },
          { key: 'domain', header: 'Domain', value: (r) => r.domain, groupable: true, width: 160 },
          { key: 'syn', header: 'Synonyms', value: (r) => r.synonyms.join(', ') || '—', width: 200 },
          { key: 'views', header: 'Used as', value: (r) => [r.views.competency && 'Competency', r.views.tag && 'Question tag', r.views.scorecard && 'Scorecard'].filter(Boolean).join(', ') || 'Not used', width: 240 },
          { key: 'people', header: 'People', type: 'number', value: (r) => r.people, width: 100 },
          { key: 'status', header: 'Status', type: 'status', value: (r) => (r.starter ? `${r.status} · starter` : r.status), statusTone: (v) => (String(v).startsWith('Active') ? 'success' : 'neutral'), width: 150 },
        ]}
      />
      {cur && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={cur.sub ? `${cur.skill} › ${cur.sub}` : cur.skill}
          subtitle={cur.domain}
          footer={
            <div className="yx-growth-foot" data-split="">
              <Button icon={GitMerge} onClick={() => setMerge(true)}>
                Merge into…
              </Button>
              <Button variant="primary">Save skill</Button>
            </div>
          }
        >
          <div className="yx-growth-stack">
            {cur.starter && <InlineAlert tone="info">From the YukthiX starter taxonomy. Edit it freely; your changes stay with your company.</InlineAlert>}
            <FormField label="Synonyms" helper="Comma separated. Used to match CVs, courses and tests.">
              <TextField defaultValue={cur.synonyms.join(', ')} />
            </FormField>
            <FormField label="Required by role">
              <Text>{cur.roles.join(', ') || 'No role requires this yet.'}</Text>
            </FormField>
            <DescriptionList
              items={[
                { label: 'Competency view', value: cur.views.competency ? 'Yes' : 'No' },
                { label: 'Question tag', value: cur.views.tag ? 'Yes' : 'No' },
                { label: 'Hiring scorecard', value: cur.views.scorecard ? 'Yes' : 'No' },
                { label: 'People with this skill', value: cur.people },
              ]}
            />
            {cur.people > 0 && <Text size="sm" tone="secondary">In use, so it can’t be deleted. Retire it, or merge it into another skill and every view follows.</Text>}
          </div>
        </Drawer>
      )}
      {cur && (
        <ConfirmDialog
          open={merge}
          onOpenChange={setMerge}
          title={`Merge ${cur.skill} into another skill?`}
          consequence={`${cur.people} people, their evidence and every mapped view move to the skill you pick. The old name becomes a synonym.`}
          confirmLabel="Merge skill"
          onConfirm={() => setMerge(false)}
        >
          <FormField label="Merge into" required>
            <Select value="s2" onChange={() => {}} options={skills.filter((s) => s.id !== cur.id).map((s) => ({ value: s.id, label: s.skill }))} />
          </FormField>
        </ConfirmDialog>
      )}
    </GrowthFrame>
  );
}

/* ================================================================== LRN-16 · AI course draft review */

export interface CourseDraft {
  title: string;
  sources: { name: string; version: string; updated?: boolean }[];
  lessons: { id: string; title: string; summary: string; cite: string }[];
  quiz: { id: string; q: string; options: string[]; answer: number; cite: string }[];
  reviewer: string | null;
  sourceChanged?: boolean;
}

/** LRN-16 AI course draft review (T3): AI-generated label, outline with a citation per lesson and question, edits, named reviewer, publish (YX-LRN-15). */
export function AiCourseDraftScreen({ draft }: { draft: CourseDraft }) {
  const [reviewer, setReviewer] = useState<string | null>(draft.reviewer);
  const [removed, setRemoved] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  return (
    <GrowthFrame area="learning" active="Course builder" persona="ld">
      <PageHeader
        title={draft.title}
        status={
          <>
            <Badge tone="ai">AI-generated draft</Badge> <AiBadge />
          </>
        }
        description="Built only from the documents below. Check every lesson and question against its source before publishing."
        actions={
          <>
            <Button icon={RefreshCw}>Regenerate a lesson</Button>
            <Button variant="primary" disabled={!reviewer} onClick={() => setConfirm(true)}>
              Publish course
            </Button>
          </>
        }
      />
      {draft.sourceChanged && (
        <InlineAlert tone="warning" title="A source document changed" actions={<Button size="sm">Compare versions</Button>}>
          Leave policy moved from v3 to v4 on 24 Sep 2026. Review lessons 2 and 3 before publishing.
        </InlineAlert>
      )}
      <SplitLayout
        main={
          <Tabs defaultValue="lessons">
            <TabsList aria-label="Draft">
              <TabsTrigger value="lessons" count={draft.lessons.length}>
                Lessons
              </TabsTrigger>
              <TabsTrigger value="quiz" count={draft.quiz.length}>
                Quiz
              </TabsTrigger>
            </TabsList>
            <TabsContent value="lessons">
              <ol className="yx-growth-list">
                {draft.lessons.map((l, i) => (
                  <li key={l.id} className="yx-growth-list__item">
                    <div className="yx-growth-stack yx-growth-grow" data-gap="sm">
                      <FormField label={`Lesson ${i + 1} title`}>
                        <TextField defaultValue={l.title} />
                      </FormField>
                      <TextArea aria-label={`Lesson ${i + 1} text`} defaultValue={l.summary} rows={3} />
                      <span className="yx-growth-meta">Source: {l.cite}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </TabsContent>
            <TabsContent value="quiz">
              <ol className="yx-growth-list">
                {draft.quiz
                  .filter((q) => !removed.includes(q.id))
                  .map((q, i) => (
                    <li key={q.id} className="yx-growth-list__item">
                      <div className="yx-growth-list__main">
                        <span className="yx-growth-list__title">
                          {i + 1}. {q.q}
                        </span>
                        <span className="yx-growth-meta">
                          Answer: {q.options[q.answer]} · Source: {q.cite}
                        </span>
                      </div>
                      <Menu>
                        <MenuTrigger asChild>
                          <IconButton icon={MoreHorizontal} label={`Actions for question ${i + 1}`} size="sm" />
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem>Edit question</MenuItem>
                          <MenuItem destructive icon={Trash2} onSelect={() => setRemoved((r) => [...r, q.id])}>
                            Remove question
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    </li>
                  ))}
              </ol>
            </TabsContent>
          </Tabs>
        }
        side={
          <>
            <Card title="Source documents">
              <ul className="yx-growth-list">
                {draft.sources.map((s) => (
                  <li key={s.name} className="yx-growth-list__item">
                    <Icon icon={FileText} />
                    <span className="yx-growth-grow">{s.name}</span>
                    <Badge tone={s.updated ? 'warning' : 'neutral'}>{s.version}{s.updated ? ' · newer exists' : ''}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Reviewer">
              <FormField label="Named reviewer" required helper="Publishing needs a person who checked the content.">
                <Select value={reviewer} onChange={setReviewer} placeholder="Choose reviewer" options={[{ value: 'Deepa Rao', label: 'Deepa Rao, L&D Lead' }, { value: 'Lakshmi Venkatesan', label: 'Lakshmi Venkatesan, HR Business Partner' }]} />
              </FormField>
              <Text size="sm" tone="secondary">
                This draft used 42 AI credits.
              </Text>
            </Card>
          </>
        }
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Publish ${draft.title}?`}
        consequence={`Reviewed by ${reviewer}. The source versions are stored with the course, and a new policy version will flag it for review.`}
        confirmLabel="Publish course"
        onConfirm={() => setConfirm(false)}
      />
    </GrowthFrame>
  );
}
