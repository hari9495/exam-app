// PPL-11 Onboarding board · PPL-12 Ready to onboard · PPL-13 Journey record · PPL-14 Pre-boarding batches
// PPL-15 Pre-boarding actions · PPL-16 Probation queue · PPL-17 Probation review · PPL-41 Buddy panel (M01 §3.4, §3.5, §3.11).
import { useMemo, useState } from 'react';
import { CalendarClock, Check, FileText, Lock, Plus, UserPlus } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Card, ObjectHeader, PageHeader } from '../../components/shell';
import { KanbanBoard, type KanbanCard, type KanbanColumn } from '../../components/kanban';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { Dialog } from '../../components/overlay';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { PersonPicker } from '../../components/select';
import { MenuItem } from '../../components/menu';
import { Icon, Text } from '../../components/foundations';
import { formatDate } from '../../lib/format';
import { useNarrow } from '../../components/stepper';
import { TODAY } from '../_kit/data';
import { addDays, daysBetween, extensionAllowed, journeyProgress, overdueTasks, probationState, reanchor, taskDue, type JourneyTask, type Persona } from './people-logic';
import { BATCHES, BUDDIES, d, EXIT_CASES, KAVYA_JOIN, NEEDS_BUDDY, ONBOARDING_TASKS, PROBATIONS, READY_TO_ONBOARD } from './people-data';
import { ListSkeleton, PeopleFrame, ProgressRing, StatusBadge, StatusChecklist, type ChecklistRow } from './people-kit';

/* ================================================================== PPL-11 onboarding board */

/** Thin progress bar with the percentage: "Tasks ▬▬▬▭ 62%". */
function TaskBar({ value, label, when }: { value: number; label: string; when: string }) {
  return (
    <span className="yx-ppl__taskbar">
      <span className="yx-ppl__taskbar-when">{when}</span>
      <span className="yx-ppl__taskbar-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <span className="yx-ppl__taskbar-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="yx-ppl__taskbar-text">{value}%</span>
    </span>
  );
}

type Owner = 'HR' | 'IT' | 'Manager' | 'New hire';
/** Board card plus what the filters need: location, who owns the next task, and batch size. */
type JoinerCard = KanbanCard & { location: string; owner: Owner; people: number };
const card = (id: string, name: string, role: string, when: string, progress: number, days: number, location: string, next: { text: string; owner: Owner; overdue?: boolean }, people = 1): JoinerCard => ({
  id,
  name,
  facts: [role, <TaskBar key="p" value={progress} when={when} label={`${name}: tasks done`} />] as [string, JSX.Element],
  daysInStage: days,
  next: { text: next.text, overdue: next.overdue },
  location,
  owner: next.owner,
  people,
});
export const BOARD: KanbanColumn[] = [
  { id: 'offer', title: 'Offer accepted', cards: [card('k4', 'Ananya Das', 'Account Executive', 'joins 2 Nov', 5, 2, 'Chennai office', { text: 'Pre-boarding link · 3 Oct', owner: 'HR' }), card('k2', 'Suresh Nair', 'Maintenance Technician', 'joins 12 Oct (rehire)', 10, 5, 'Hosur plant', { text: 'Rehire options · 30 Sep', owner: 'HR', overdue: true }), card('k9', 'Selvi Perumal', 'Warehouse Associate', 'joins 6 Oct', 0, 3, 'Hosur plant', { text: 'Convert to employee · 1 Oct', owner: 'HR' })], emptyText: 'No accepted offers waiting' },
  { id: 'pre', title: 'Pre-boarding', cards: [card('k1', 'Kavya Reddy', 'Quality Inspector', 'joins 5 Oct', journeyProgress(ONBOARDING_TASKS), 11, 'Hosur plant', { text: 'Education proofs · 28 Sep', owner: 'New hire', overdue: true }), card('k5', 'Campus 2026 · Sales', '12 sales trainees', 'join 19 Oct', 88, 40, 'Bengaluru head office', { text: 'Bank details ×3 · 25 Sep', owner: 'HR', overdue: true }, 12)], slaDays: 30 },
  { id: 'day1', title: 'Day 1', cards: [card('k3', 'Murugan K', 'Warehouse Associate', 'joins 1 Oct', 70, 3, 'Hosur plant', { text: 'Safety induction · 1 Oct', owner: 'Manager' })], emptyText: 'No one joins this week' },
  { id: 'first30', title: 'First 30 days', cards: [card('k6', 'Kiran Joshi', 'Account Executive', 'joined 3 Sep', 92, 26, 'Chennai office', { text: '30-day check-in · 6 Oct', owner: 'Manager' }), card('k7', 'Sneha Patil', 'HR Executive', 'joined 26 Aug', 96, 34, 'Bengaluru head office', { text: 'Buddy feedback · 27 Sep', owner: 'HR', overdue: true })], slaDays: 30 },
  { id: 'done', title: 'Done', cards: [card('k8', 'Deepa Ghosh', 'Accountant', 'joined 30 Mar', 100, 120, 'Bengaluru head office', { text: 'All tasks done', owner: 'HR' })] },
];

// PPL-11
const LOCATIONS = ['Bengaluru head office', 'Chennai office', 'Hosur plant'];
const OWNERS: Owner[] = ['HR', 'IT', 'Manager', 'New hire'];
const isLate = (c: KanbanCard, col: KanbanColumn) => Boolean(c.next?.overdue || (col.slaDays !== undefined && c.daysInStage > col.slaDays));

export function OnboardingBoard({ columns, state = 'ready' }: { columns: KanbanColumn[]; state?: 'ready' | 'loading' }) {
  const [entity, setEntity] = useState<string | null>('all');
  const [q, setQ] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [location, setLocation] = useState<string | null>(null);
  const [owner, setOwner] = useState<Owner | null>(null);
  const cards = columns.flatMap((c) => c.cards as JoinerCard[]);
  const total = cards.length;
  const batches = cards.filter((c) => c.people > 1);
  const singles = total - batches.length;
  const people = cards.reduce((n, c) => n + (c.people ?? 1), 0);
  const overdue = columns.reduce((n, col) => n + col.cards.filter((c) => isLate(c, col)).length, 0);
  // Filters change what the board shows; moves stay with the board.
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return columns.map((col) => ({
      ...col,
      cards: (col.cards as JoinerCard[]).filter(
        (c) => (!s || c.name.toLowerCase().includes(s)) && (!overdueOnly || isLate(c, col)) && (!location || c.location === location) && (!owner || c.owner === owner),
      ),
    }));
  }, [columns, q, overdueOnly, location, owner]);
  const filterKey = `${q}|${overdueOnly}|${location}|${owner}`;
  return (
    <PeopleFrame active="Onboarding board">
      <PageHeader
        title="Onboarding"
        description={
          total === 0
            ? 'No one is onboarding right now.'
            : `${singles} ${singles === 1 ? 'joiner' : 'joiners'}${batches.length ? ` and ${batches.length} campus ${batches.length === 1 ? 'batch' : 'batches'} (${batches.reduce((n, b) => n + b.people, 0)} people)` : ''} · ${people} people in all, from offer accepted to 30 days in. Drag a card or use Move to on each card.`
        }
        actions={
          <div className="yx-ppl__head-actions">
            <span className="yx-ppl__head-select">
              <Select aria-label="Legal entity" size="sm" options={[{ value: 'all', label: 'All entities' }, { value: 'ka', label: 'Kaveri Foods Pvt Ltd' }, { value: 'tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }]} value={entity} onChange={setEntity} />
            </span>
            {total > 0 && (
              <Button icon={UserPlus} variant="primary">
                Add joiner
              </Button>
            )}
          </div>
        }
      />
      {state === 'loading' ? (
        <ListSkeleton label="Loading onboarding board" rows={5} />
      ) : total === 0 ? (
        <EmptyState title="No one is onboarding right now" description="Accepted offers appear here automatically, or add a joiner by hand." action={<Button variant="primary" icon={UserPlus}>Add joiner</Button>} />
      ) : (
        <>
          <div className="yx-ppl__filters">
            <span className="yx-ppl__head-select">
              <TextField type="search" aria-label="Find a joiner" placeholder="Find a joiner" value={q} onChange={setQ} size="sm" />
            </span>
            <span className="yx-ppl__head-select">
              <Select aria-label="Location" size="sm" options={[{ value: 'all', label: 'All locations' }, ...LOCATIONS.map((l) => ({ value: l, label: l }))]} value={location ?? 'all'} onChange={(v) => setLocation(v === 'all' || !v ? null : v)} />
            </span>
            <span className="yx-ppl__head-select">
              <Select aria-label="Next task owner" size="sm" options={[{ value: 'all', label: 'Next task: anyone' }, ...OWNERS.map((o) => ({ value: o, label: `Next task: ${o}` }))]} value={owner ?? 'all'} onChange={(v) => setOwner(v === 'all' || !v ? null : (v as Owner))} />
            </span>
            <button type="button" className="yx-ppl__chip yx-ppl__chip--toggle" aria-pressed={overdueOnly} onClick={() => setOverdueOnly(!overdueOnly)}>
              {overdueOnly && <Icon icon={Check} size="sm" />}
              Only overdue ({overdue})
            </button>
          </div>
          <KanbanBoard key={filterKey} aria-label="Onboarding board" defaultColumns={shown} noun="joiner" onOpenCard={() => {}} />
        </>
      )}
    </PeopleFrame>
  );
}

/* ================================================================== PPL-12 ready to onboard */

type Ready = (typeof READY_TO_ONBOARD)[number];

/** `result` is what the company policy gives for this person; a choice that differs is an override and needs a reason. */
const REHIRE_OPTIONS: { option: string; policy: string; result: string; choice: string; choices: string[] }[] = [
  { option: 'Employee code', policy: 'Reuse old code', result: 'Reuse KF-0077', choice: 'Reuse KF-0077', choices: ['Reuse KF-0077', 'New code in series'] },
  { option: 'UAN and PF', policy: 'Reuse UAN; continue membership', result: 'Reuse UAN; continue', choice: 'Reuse UAN; continue', choices: ['Reuse UAN; continue', 'Reuse UAN; transfer old balance (Form 13)', 'Reuse UAN; fresh'] },
  { option: 'Same-FY tax', policy: 'Treat as previous employer (Form 12B)', result: 'Treat as previous employer (Form 12B)', choice: 'Treat as previous employer (Form 12B)', choices: ['Combine YTD (one Form 16)', 'Treat as previous employer (Form 12B)'] },
  { option: 'Service continuity', policy: 'Fresh', result: 'Fresh', choice: 'Fresh', choices: ['Continuous', 'Break counted', 'Fresh'] },
  { option: 'Gratuity service', policy: 'Fresh', result: 'Fresh', choice: 'Fresh', choices: ['Add prior service', 'Fresh'] },
  { option: 'Leave balance', policy: 'Start fresh', result: 'Start fresh', choice: 'Start fresh', choices: ['Carry forward', 'Start fresh'] },
  { option: 'Probation', policy: 'Skip if break under 6 months', result: 'Required: break is 20 months, over the 6-month rule', choice: 'Required: break is 20 months, over the 6-month rule', choices: ['Required: break is 20 months, over the 6-month rule', 'Skip probation'] },
  { option: 'Prior warnings and PIP', policy: 'HR only', result: 'HR only', choice: 'HR only', choices: ['Visible to new manager', 'HR only', 'Hidden'] },
];

/** Rehire impact preview (YX-LC-18): policy defaults, per-rehire override with a reason. */
export function RehireImpact({ overridden = false }: { overridden?: boolean }) {
  const [rows, setRows] = useState(REHIRE_OPTIONS.map((r, i) => (overridden && i === 3 ? { ...r, choice: 'Break counted' } : r)));
  const changed = rows.filter((r) => r.choice !== r.result);
  return (
    <Card title="Rehire impact preview">
      <Text size="sm" tone={changed.length ? 'warning' : 'secondary'} as="p">
        {changed.length === 0 ? 'Everything follows company policy.' : `${changed.length} ${changed.length === 1 ? 'option differs' : 'options differ'} from company policy. Give a reason below.`}
      </Text>
      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
      <table className="yx-ppl__impact">
        <thead>
          <tr>
            <th scope="col">Option</th>
            <th scope="col">Company policy</th>
            <th scope="col">For this rehire</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.option}>
              <th scope="row">
                <span className="yx-ppl__row">
                  {r.option}
                  {r.choice !== r.result && <Badge tone="warning">Changed</Badge>}
                </span>
              </th>
              <td>{r.policy}</td>
              <td>
                <Select aria-label={`${r.option} for this rehire`} size="sm" options={r.choices.map((c) => ({ value: c, label: c }))} value={r.choice} onChange={(v) => setRows((xs) => xs.map((x) => (x.option === r.option ? { ...x, choice: v ?? x.choice } : x)))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {changed.length > 0 && (
        <FormField label="Reason for changing the policy default" required error={overridden ? 'Enter a reason. Overrides are audited.' : null}>
          <TextArea rows={2} defaultValue="" />
        </FormField>
      )}
      <Text size="sm" tone="secondary" as="p">
        Suresh left on 14 Feb 2025 (resignation, rehire-eligible). A new employment opens on the existing record.
      </Text>
    </Card>
  );
}

// PPL-12
export function ReadyToOnboardQueue({ rows, defaultOpenId, overridden }: { rows: Ready[]; defaultOpenId?: string; overridden?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const open = rows.find((r) => r.id === openId);
  const narrow = useNarrow();
  const cols: TableColumn<Ready>[] = [
    { key: 'name', header: 'Joiner', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: `${r.role} · ${r.dept}` }), width: 260 },
    { key: 'joining', header: 'Joins', type: 'date', value: (r) => r.joining, render: (r) => <JoinsCell date={r.joining} />, width: 190 },
    { key: 'personType', header: 'Person type', value: (r) => r.personType, render: (r) => <TypeCell row={r} />, groupable: true, width: 240 },
    { key: 'source', header: 'From', value: (r) => r.source, width: 190, optional: true },
    { key: 'location', header: 'Location', value: (r) => r.location, width: 150, optional: true },
    { key: 'offerAccepted', header: 'Offer accepted', type: 'date', value: (r) => r.offerAccepted, width: 140, optional: true },
  ];
  const action = (r: Ready) => (
    <Button size="sm" icon={UserPlus} onClick={() => setOpenId(r.id)}>
      {r.personType === 'Contract worker conversion' ? 'Convert' : 'Create employee'}
    </Button>
  );
  const empty = (
    <EmptyState
      title="No accepted offers are waiting"
      description="Entities set to automatic hand-off create the employee when the offer is accepted, so their joiners go straight to the Onboarding board."
      action={<Button>Change hand-off setting</Button>}
    />
  );
  return (
    <PeopleFrame active="Ready to onboard">
      <PageHeader title="Ready to onboard" description="Accepted offers whose employee isn't created yet, soonest joining first. Create the employee to start pre-boarding; the person type decides the path." />
      {narrow ? (
        rows.length === 0 ? (
          empty
        ) : (
          <ul className="yx-ppl__cards" aria-label="Ready to onboard">
            {[...rows].sort((a, b) => a.joining.getTime() - b.joining.getTime()).map((r) => (
              <li key={r.id} className="yx-ppl__rcard">
                <span className="yx-ppl__rcard-name">{r.name}</span>
                <span className="yx-ppl__sub">
                  {r.role} · {r.location}
                </span>
                <span className="yx-ppl__row">
                  <TypeCell row={r} />
                </span>
                <JoinsCell date={r.joining} />
                {action(r)}
              </li>
            ))}
          </ul>
        )
      ) : (
      <DataTable
        defaultSort={{ key: 'joining', dir: 'asc' }}
        defaultColumnState={{ hidden: ['offerAccepted'] }}
        label="Ready to onboard"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        onRowClick={(r) => setOpenId(r.id)}
        activeRowId={openId}
        rowButtons={action}
        rowActions={() => (
          <>
            <MenuItem>Open offer</MenuItem>
            <MenuItem>Mark reneged</MenuItem>
          </>
        )}
        empty={empty}
      />
      )}
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        size="lg"
        title={open?.personType === 'Contract worker conversion' ? `Convert ${open?.name} to employee` : `Create employee: ${open?.name ?? ''}`}
        subtitle={open ? `${open.personType} · ${open.source}${open.note ? ` · ${open.note}` : ''}` : undefined}
        footer={
          <>
            <Button onClick={() => setOpenId(null)}>Cancel</Button>
            <Button variant="primary">{open?.personType === 'Contract worker conversion' ? 'Convert and start pre-boarding' : 'Create and start pre-boarding'}</Button>
          </>
        }
      >
        {open && (
          <div className="yx-ppl__stack yx-ppl__drawer-body">
            {/* From the offer, read-only: check before creating. */}
            <dl className="yx-ppl__dl">
              <div className="yx-ppl__dl-row"><dt>Name</dt><dd>{open.name}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Role</dt><dd>{open.role}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Department</dt><dd>{open.dept}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Location</dt><dd>{open.location}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Legal entity</dt><dd>{open.entity}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Manager</dt><dd>{open.manager}</dd></div>
              <div className="yx-ppl__dl-row">
                <dt>Employee code</dt>
                <dd className="yx-mono">{open.personType === 'Ex-employee rehire' ? 'Reuses KF-0077' : 'KF-0249 (next in series)'}</dd>
              </div>
            </dl>
            <div className="yx-ppl__form">
              <FormField label="Joining date" required helper="Pre-filled from the offer. Tasks are scheduled from this date.">
                <DatePicker value={open.joining} onChange={() => {}} />
              </FormField>
              <FormField label="Onboarding template" required helper="Chosen from the location. You can change it.">
                <Select
                  options={[{ value: 'plant', label: 'Plant staff · Hosur (13 tasks)' }, { value: 'office', label: 'Office staff (11 tasks)' }]}
                  value={open.location === 'Hosur plant' ? 'plant' : 'office'}
                  onChange={() => {}}
                />
              </FormField>
            </div>
            {open.personType === 'Ex-employee rehire' && <RehireImpact overridden={overridden} />}
            {open.personType === 'Contract worker conversion' && (
              <InlineAlert tone="info" title="Same person, new role">
                {open.name}'s deployments, site attendance and contract-labour records stay on the same timeline. Contract service doesn't count for probation (company setting). The kiosk enrolment carries over.
              </InlineAlert>
            )}
            <InlineAlert tone="info">An appointment letter task is added for HR, due by the joining date. It can't be removed.</InlineAlert>
          </div>
        )}
      </Drawer>
    </PeopleFrame>
  );
}

/** Joins column: date plus "in 5 days"; within a week it is flagged. */
function JoinsCell({ date }: { date: Date }) {
  const n = daysBetween(TODAY, date);
  const soon = n <= 7;
  return (
    <span className="yx-ppl__row">
      {formatDate(date)}
      <Badge tone={soon ? 'warning' : 'neutral'}>{n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}</Badge>
    </span>
  );
}

/** Person type badge, with the one fact that matters for it (when they left, where they were deployed). */
function TypeCell({ row }: { row: Ready }) {
  return (
    <span className="yx-ppl__type">
      <Badge tone={row.personType === 'New person' ? 'neutral' : 'info'}>{row.personType}</Badge>
      {row.note && <span className="yx-ppl__sub">{row.note}</span>}
    </span>
  );
}

/* ================================================================== PPL-13 journey record */

export type JourneyView = 'hr' | 'it' | 'mgr' | 'hire';
const VIEW_OWNERS: Record<JourneyView, JourneyTask['owner'][] | null> = { hr: null, it: ['IT'], mgr: ['Manager', 'Buddy'], hire: ['New hire'] };

// PPL-13
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const whenText = (offset: number) => (offset === 0 ? 'on joining day' : offset < 0 ? `${plural(-offset, 'day')} before joining` : `${plural(offset, 'day')} after joining`);
/** What the new hire's own tasks say on the button. */
const HIRE_ACTION: Record<string, string> = { t2: 'Upload proofs', t6: 'Fill Form 11 and Form 2' };
const PHASES: { id: string; title: string; test: (t: JourneyTask) => boolean }[] = [
  { id: 'before', title: 'Before joining', test: (t) => t.offset < 0 },
  { id: 'day', title: 'Joining day', test: (t) => t.offset === 0 },
  { id: 'after', title: 'After joining', test: (t) => t.offset > 0 },
];

/** The joiner shown on the journey record (Kavya Reddy, Quality, Hosur plant). */
const KAVYA = { name: 'Kavya Reddy', role: 'Quality Inspector', location: 'Hosur plant', manager: 'Divya Menon', buddy: 'Lakshmi Gowda' };

export function JourneyRecord({ tasks, joining, today, view = 'hr' }: { tasks: JourneyTask[]; joining: Date; today: Date; view?: JourneyView }) {
  const owners = VIEW_OWNERS[view];
  const mine = owners ? tasks.filter((t) => owners.includes(t.owner)) : tasks;
  const progress = journeyProgress(tasks);
  const late = overdueTasks(tasks, joining, today);
  const letterLate = late.find((t) => t.locked);
  const titleOf = (id?: string) => tasks.find((t) => t.id === id)?.title;
  const canAct = (t: JourneyTask) => view === 'hr' || owners?.includes(t.owner);
  const actionFor = (t: JourneyTask) => {
    if (t.status === 'done' || !canAct(t)) return undefined;
    // The legal letter completes only when it is actually issued.
    if (t.locked) return <Button size="sm" icon={FileText}>Issue letter</Button>;
    if (t.status === 'blocked') return <Button size="sm" disabled>Mark done</Button>;
    if (view === 'hire' && t.owner === 'New hire') return <Button size="sm">{HIRE_ACTION[t.id] ?? 'Open'}</Button>;
    return <Button size="sm">Mark done</Button>;
  };
  const rowOf = (t: JourneyTask): ChecklistRow => ({
    id: t.id,
    title: (
      <span className="yx-ppl__row">
        {t.title}
        {t.locked && (
          <Badge tone="neutral">
            <Icon icon={Lock} size="sm" /> Required by law
          </Badge>
        )}
      </span>
    ),
    owner: t.owner,
    due: taskDue(joining, t),
    when: whenText(t.offset),
    status: t.status === 'done' ? 'Done' : t.status === 'blocked' ? 'Blocked' : 'Pending',
    note: t.status === 'blocked' && t.waitsFor ? `Waiting for: ${titleOf(t.waitsFor)}` : undefined,
    action: actionFor(t),
  });
  const persona: Persona = view === 'hire' ? 'emp' : view === 'mgr' ? 'mgr' : 'hr';
  const daysLeft = daysBetween(today, joining);
  return (
    <PeopleFrame active="Onboarding board" persona={persona}>
      <ObjectHeader
        name={view === 'hire' ? 'Your onboarding' : `${KAVYA.name} · onboarding`}
        avatarName={KAVYA.name}
        person
        secondary={`${KAVYA.role} · ${KAVYA.location} · joins ${formatDate(joining)} (${daysLeft <= 0 ? 'today' : `in ${plural(daysLeft, 'day')}`})`}
        status={<ProgressRing value={progress} label="Onboarding" />}
        facts={[
          { label: 'Template', value: 'Plant staff · Hosur' },
          { label: 'Buddy', value: KAVYA.buddy },
          { label: 'Manager', value: KAVYA.manager },
          { label: 'Tasks done', value: `${tasks.filter((t) => t.status === 'done').length} of ${tasks.length}` },
        ]}
        actions={view === 'hr' ? <Button icon={Plus}>Add task</Button> : undefined}
      />
      {letterLate && view === 'hr' && (
        <InlineAlert tone="danger" title="Appointment letter is overdue" actions={<Button size="sm" icon={FileText}>Issue letter</Button>}>
          Due {formatDate(taskDue(joining, letterLate))}. A compliance alert went to HR and it shows in payroll pre-flight.
        </InlineAlert>
      )}
      {late.length > 0 && !letterLate && view === 'hr' && <InlineAlert tone="warning">{plural(late.length, 'task is', 'tasks are')} past the due date. Owners got a reminder.</InlineAlert>}
      {view !== 'hr' && <Text as="p" className="yx-ppl__muted">You see the {mine.length} tasks you own. HR sees all {tasks.length}.</Text>}
      <div className="yx-ppl__phases">
        {PHASES.map((ph) => {
          const items = mine.filter(ph.test);
          if (!items.length) return null;
          const open = items.filter((t) => t.status !== 'done');
          const done = items.filter((t) => t.status === 'done');
          return (
            <section key={ph.id} aria-labelledby={`phase-${ph.id}`}>
              <div className="yx-ppl__phase-head">
                <h2 className="yx-ppl__phase-title" id={`phase-${ph.id}`}>
                  {ph.title}
                </h2>
                <Text size="sm" tone="secondary">
                  {done.length} of {items.length} done
                </Text>
              </div>
              {open.length > 0 && <StatusChecklist label={`${ph.title}: open tasks`} rows={open.map(rowOf)} today={today} />}
              {done.length > 0 && (
                <details className="yx-ppl__done-fold">
                  <summary>Done ({done.length})</summary>
                  <StatusChecklist label={`${ph.title}: done tasks`} rows={done.map(rowOf)} today={today} />
                </details>
              )}
            </section>
          );
        })}
      </div>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-14 batches */

type Batch = (typeof BATCHES)[number];

// PPL-14
export function PreboardingBatches({ rows, defaultChangeId, defaultDate }: { rows: Batch[]; defaultChangeId?: string; defaultDate?: Date }) {
  const [changeId, setChangeId] = useState<string | null>(defaultChangeId ?? null);
  const [newDate, setNewDate] = useState<Date | null>(defaultDate ?? rows.find((b) => b.id === defaultChangeId)?.joining ?? null);
  const [notify, setNotify] = useState(true);
  const narrow = useNarrow();
  const target = rows.find((b) => b.id === changeId);
  const shift = target && newDate ? daysBetween(target.joining, newDate) : 0;
  const moves = target && newDate ? reanchor(ONBOARDING_TASKS, target.joining, newDate) : {};
  const moved = Object.values(moves).filter((m) => m.from.getTime() !== m.to.getTime()).length;
  const openChange = (b: Batch) => {
    setChangeId(b.id);
    setNewDate(b.joining);
  };
  const cols: TableColumn<Batch>[] = [
    {
      key: 'name',
      header: 'Batch',
      value: (r) => r.name,
      render: (r) => (
        <span className="yx-ppl__type">
          <span>{r.name}</span>
          <span className="yx-ppl__sub">{r.location}</span>
        </span>
      ),
      width: 220,
    },
    { key: 'joining', header: 'Joins', type: 'date', value: (r) => r.joining, render: (r) => <JoinsCell date={r.joining} />, width: 195 },
    { key: 'offers', header: 'Offers issued', value: (r) => r.offers, render: (r) => <OffersCell row={r} />, width: 175 },
    { key: 'completion', header: 'Progress', type: 'number', value: (r) => r.completion, render: (r) => <Meter value={r.completion} max={100} label={`${r.name} pre-boarding done`} valueText={`${r.completion}%`} warnAt={101} />, width: 140 },
    { key: 'entity', header: 'Legal entity', value: (r) => r.entity, width: 260 },
  ];
  const action = (r: Batch) => (
    <Button size="sm" icon={CalendarClock} onClick={() => openChange(r)}>
      Change date
    </Button>
  );
  const menu = (r: Batch) => (
    <>
      <MenuItem>Open batch</MenuItem>
      <MenuItem>Schedule a touchpoint</MenuItem>
      {r.members > r.offers && <MenuItem>Issue {r.members - r.offers} pending offers</MenuItem>}
    </>
  );
  const empty = <EmptyState title="No batches yet" description="Create a batch for campus hires who join together." action={<Button>New batch</Button>} />;
  const sorted = [...rows].sort((a, b) => a.joining.getTime() - b.joining.getTime());
  return (
    <PeopleFrame active="Batches">
      <PageHeader title="Pre-boarding batches" description="Campus hires who join on the same date. Change a batch's date and every member's open tasks move with it." actions={<Button variant="primary" icon={Plus}>New batch</Button>} />
      {narrow ? (
        rows.length === 0 ? (
          empty
        ) : (
          <ul className="yx-ppl__cards" aria-label="Batches">
            {sorted.map((r) => (
              <li key={r.id} className="yx-ppl__rcard">
                <span className="yx-ppl__rcard-name">{r.name}</span>
                <span className="yx-ppl__sub">
                  {r.location} · {r.members} members
                </span>
                <JoinsCell date={r.joining} />
                <OffersCell row={r} suffix=" offers issued" />
                <Meter value={r.completion} max={100} label={`${r.name} pre-boarding done`} valueText={`${r.completion}% pre-boarding done`} warnAt={101} />
                {action(r)}
              </li>
            ))}
          </ul>
        )
      ) : (
        <DataTable
          label="Batches"
          columns={cols}
          rows={rows}
          getRowId={(r) => r.id}
          defaultSort={{ key: 'joining', dir: 'asc' }}
          defaultColumnState={{ hidden: ['entity'] }}
          rowButtons={action}
          rowActions={menu}
          empty={empty}
        />
      )}
      <Dialog
        open={!!target}
        onOpenChange={(o) => !o && setChangeId(null)}
        title={`Change joining date for ${target?.name ?? ''}`}
        size="md"
        footer={
          <>
            <Button onClick={() => setChangeId(null)}>Cancel</Button>
            <Button variant="primary" disabled={shift === 0} onClick={() => setChangeId(null)}>
              Move {target?.members} members
            </Button>
          </>
        }
      >
        {target && (
          <div className="yx-ppl__stack">
            <dl className="yx-ppl__dl">
              <div className="yx-ppl__dl-row"><dt>Current date</dt><dd>{formatDate(target.joining)}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Location</dt><dd>{target.location}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Legal entity</dt><dd>{target.entity}</dd></div>
            </dl>
            <FormField label="New joining date" required>
              <DatePicker value={newDate} onChange={setNewDate} />
            </FormField>
            {newDate && shift !== 0 && (
              <>
                <InlineAlert tone="info" title={`${plural(moved, 'open task')} per member ${moved === 1 ? 'moves' : 'move'} ${plural(Math.abs(shift), 'day')} ${shift > 0 ? 'later' : 'earlier'}`}>
                  Done tasks keep their dates. Draft compensation, assignment start and probation dates move too. Engagement touchpoints re-anchor to {formatDate(newDate)}.
                </InlineAlert>
                <Checkbox checked={notify} onChange={setNotify} label={`Email the ${target.members} members their new date`} />
              </>
            )}
          </div>
        )}
      </Dialog>
    </PeopleFrame>
  );
}

/** Offers column: "12 of 18", and how many still hold only a letter of intent. */
function OffersCell({ row, suffix = '' }: { row: Batch; suffix?: string }) {
  const pending = row.members - row.offers;
  return (
    <span className="yx-ppl__type">
      <span>
        {row.offers} of {row.members}
        {suffix}
      </span>
      {pending > 0 && <span className="yx-ppl__sub">{pending} still on letter of intent</span>}
    </span>
  );
}

/* ================================================================== PPL-15 pre-boarding actions */

export type PreboardAction = 'postpone' | 'did-not-join' | 'reneged' | 'withdraw';

// PPL-15
export function PreboardingActionSheet({ action: initial, rehire = false, reasonError = false }: { action: PreboardAction; rehire?: boolean; reasonError?: boolean }) {
  const [action, setAction] = useState<PreboardAction>(initial);
  const [open, setOpen] = useState(true);
  const [date, setDate] = useState<Date | null>(new Date(2026, 9, 19));
  const who = rehire ? 'Suresh Nair' : 'Kavya Reddy';
  const join = rehire ? new Date(2026, 9, 12) : KAVYA_JOIN;
  const unwind = action !== 'postpone';
  const moves = date ? reanchor(ONBOARDING_TASKS, join, date) : {};
  const label: Record<PreboardAction, string> = { postpone: 'Postpone joining', 'did-not-join': 'Mark did not join', reneged: 'Record reneged', withdraw: 'Withdraw offer' };
  return (
    <PeopleFrame active="Onboarding board">
      <ObjectHeader name={`${who} · pre-boarding`} person secondary={`${rehire ? 'Maintenance Technician (rehire)' : 'Quality Inspector'} · joins ${formatDate(join)}`} status={<Badge tone="info">Pre-boarding</Badge>} actions={<Button onClick={() => setOpen(true)}>Change status</Button>} />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={`Change pre-boarding for ${who}`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant={unwind ? 'danger' : 'primary'}>{label[action]}</Button>
          </>
        }
      >
        <div className="yx-ppl__stack">
          <FormField label="What happened" required>
            <RadioGroup
              value={action}
              onChange={(v) => setAction(v as PreboardAction)}
              options={[
                { value: 'postpone', label: 'Postpone joining', description: 'The candidate or company moved the date. Nothing is cancelled.' },
                { value: 'did-not-join', label: 'Did not join', description: 'On or after the joining date, the person did not turn up.' },
                { value: 'reneged', label: 'Reneged', description: 'The candidate declined after accepting.' },
                { value: 'withdraw', label: 'Withdraw offer', description: 'The company withdraws. A reason and a withdrawal letter are required.' },
              ]}
            />
          </FormField>
          {action === 'postpone' && (
            <>
              <FormField label="New joining date" required>
                <DatePicker value={date} onChange={setDate} min={addDays(join, 1)} />
              </FormField>
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Open tasks re-anchor; done tasks stay, scrolls sideways on small screens">
              <table className="yx-ppl__impact">
                <caption className="yx-ppl__sub">Open tasks re-anchor; done tasks stay</caption>
                <thead>
                  <tr>
                    <th scope="col">Task</th>
                    <th scope="col">Was due</th>
                    <th scope="col">Now due</th>
                  </tr>
                </thead>
                <tbody>
                  {ONBOARDING_TASKS.slice(0, 6).map((t) => (
                    <tr key={t.id}>
                      <td>{t.title}</td>
                      <td>{formatDate(moves[t.id]?.from)}</td>
                      <td data-changed={t.status !== 'done' || undefined}>{t.status === 'done' ? 'Done' : formatDate(moves[t.id]?.to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
          {unwind && (
            <>
              <InlineAlert tone="warning" title="This unwinds pre-boarding in one audited step">
                The employee, employment, draft compensation and pre-boarding login are cancelled (kept, not deleted). The headcount-plan slot is released and requisition REQ-2026-0288 reopens. The candidate is marked {action === 'withdraw' ? 'withdrawn' : 'reneged'} in Hiring.
              </InlineAlert>
              <FormField label="Reason" required={action === 'withdraw'} optional={action !== 'withdraw'} error={reasonError ? 'Enter a reason. It goes on the withdrawal letter and the audit log.' : null}>
                <TextArea rows={3} defaultValue={reasonError ? '' : action === 'reneged' ? 'Accepted a counter-offer from the current employer.' : ''} />
              </FormField>
              {action === 'withdraw' && <Text size="sm" tone="secondary" as="p">A withdrawal letter (starter template) is created for your review. BGV discrepancies never withdraw an offer automatically.</Text>}
            </>
          )}
          {rehire && (
            <InlineAlert tone="info" title="Rehire: what the unwind reverses">
              The new employment on Suresh's existing record is cancelled. His old employment, code KF-0077 and UAN stay as they were; the rehire options you chose are discarded.
            </InlineAlert>
          )}
        </div>
      </Drawer>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-16 probation queue */

type Prob = (typeof PROBATIONS)[number];

// PPL-16
export function ProbationQueue({ rows, today, persona = 'hr', defaultOpenId }: { rows: Prob[]; today: Date; persona?: Persona; defaultOpenId?: string }) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const [outcome, setOutcome] = useState<ProbationOutcome>('confirm');
  const [months, setMonths] = useState<number | null>(null);
  const narrow = useNarrow();
  const mgr = persona === 'mgr';
  const withState = rows.map((r) => ({ ...r, state: probationState(r.end, today, 15, r.reviewDone) }));
  type Row = (typeof withState)[number];
  const open = withState.find((r) => r.id === openId);
  const first = open?.name.split(' ')[0] ?? '';
  const stateText = (r: Row) => (r.state === 'running' ? 'Not due' : r.state === 'review due' ? 'Review due' : r.state === 'overdue' ? 'Overdue' : 'With HR');
  const cols: TableColumn<Row>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.role }), width: 215 },
    ...(mgr ? [] : [{ key: 'manager', header: 'Manager', value: (r: Row) => r.manager, width: 187, optional: true } as TableColumn<Row>]),
    { key: 'end', header: 'Ends', type: 'date', value: (r) => r.end, render: (r) => <EndsCell row={r} today={today} />, width: 165 },
    {
      key: 'state',
      header: 'Review',
      type: 'status',
      value: stateText,
      statusTone: (v) => (v === 'Not due' ? 'neutral' : v === 'Review due' ? 'warning' : 'danger'),
      width: 133,
    },
  ];
  const openRow = (r: Row) => {
    setOutcome('confirm');
    setMonths(null);
    setOpenId(r.id);
  };
  const action = (r: Row) => {
    if (r.state === 'running') return null;
    if (mgr) return <Button size="sm" variant="review" onClick={() => openRow(r)}>Review</Button>;
    if (r.state === 'escalated') return <Button size="sm" variant="review" onClick={() => openRow(r)}>Decide</Button>;
    return <Button size="sm">Remind manager</Button>;
  };
  const escalated = withState.filter((r) => r.state === 'escalated');
  const empty = <EmptyState title="No one is on probation" description="New joiners appear here with their probation end date." />;
  const sorted = [...withState].sort((a, b) => a.end.getTime() - b.end.getTime());
  return (
    <PeopleFrame active="Probation" persona={persona}>
      <PageHeader title="Probation reviews" description="Managers get the review 15 days before probation ends. Nothing confirms on its own; a missed review goes to HR on the end date." />
      {!mgr && escalated.length > 0 && (
        <InlineAlert
          tone="danger"
          title={`${plural(escalated.length, 'review')} went to HR`}
          actions={escalated.length === 1 ? <Button size="sm" variant="review" onClick={() => openRow(escalated[0])}>Decide</Button> : undefined}
        >
          {escalated.length === 1
            ? `${escalated[0].name}'s probation ended on ${formatDate(escalated[0].end)} without a review. Confirm, extend or end it now.`
            : `${escalated.map((r) => r.name).join(', ')} passed their end date without a review. Confirm, extend or end each one now.`}
        </InlineAlert>
      )}
      {narrow ? (
        rows.length === 0 ? (
          empty
        ) : (
          <ul className="yx-ppl__cards" aria-label="Probation reviews">
            {sorted.map((r) => (
              <li key={r.id} className="yx-ppl__rcard">
                <span className="yx-ppl__rcard-name">{r.name}</span>
                <span className="yx-ppl__sub">{mgr ? r.role : `${r.role} · manager ${r.manager}`}</span>
                <EndsCell row={r} today={today} />
                <StatusBadge status={stateText(r)} />
                {action(r)}
              </li>
            ))}
          </ul>
        )
      ) : (
        <DataTable
          label="Probation reviews"
          columns={cols}
          rows={withState}
          getRowId={(r) => r.id}
          defaultSort={{ key: 'end', dir: 'asc' }}
          onRowClick={openRow}
          activeRowId={openId}
          rowButtons={action}
          empty={empty}
        />
      )}
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        size="lg"
        title={`Probation review: ${open?.name ?? ''}`}
        subtitle={open ? `${open.role} · probation ${formatDate(open.start)} to ${formatDate(open.end)}` : undefined}
        footer={
          open?.state === 'running' ? (
            <Button onClick={() => setOpenId(null)}>Close</Button>
          ) : (
            <>
              <Button onClick={() => setOpenId(null)}>Save draft</Button>
              <Button variant={outcome === 'terminate' ? 'danger' : 'primary'}>{outcome === 'confirm' ? `Confirm ${first}` : outcome === 'extend' ? 'Extend probation' : 'Send to HR'}</Button>
            </>
          )
        }
      >
        {open && (
          <div className="yx-ppl__stack yx-ppl__drawer-body">
            {open.state === 'escalated' && (
              <InlineAlert tone="danger">
                Probation ended on {formatDate(open.end)} and {open.manager} didn't review it, so HR decides. {open.manager} is told the outcome.
              </InlineAlert>
            )}
            {open.state === 'running' ? (
              <InlineAlert tone="info">The review opens on {formatDate(addDays(open.end, -15))}. {open.manager} gets the form then.</InlineAlert>
            ) : (
              <ProbationFields outcome={outcome} setOutcome={setOutcome} months={months} setMonths={setMonths} first={first} end={open.end} extended={open.extended} />
            )}
          </div>
        )}
      </Drawer>
    </PeopleFrame>
  );
}

/** Ends column: date, how far away in plain words, and any extension. */
function EndsCell({ row, today }: { row: Prob; today: Date }) {
  const n = daysBetween(today, row.end);
  return (
    <span className="yx-ppl__type">
      <span className="yx-ppl__row yx-ppl__row--tight">
        {formatDate(row.end)}
        <Badge tone={n <= 0 ? 'danger' : n <= 15 ? 'warning' : 'neutral'}>{n < 0 ? `${plural(-n, 'day')} ago` : n === 0 ? 'today' : `in ${plural(n, 'day')}`}</Badge>
      </span>
      {row.extended > 0 && <span className="yx-ppl__sub">Extended {plural(row.extended, 'month')}</span>}
    </span>
  );
}

/* ================================================================== PPL-17 probation review */

export type ProbationOutcome = 'confirm' | 'extend' | 'terminate';
/** Divya's own report whose review is due (same person as on the Probation queue). */
const ROHIT = { name: 'Rohit Menon', first: 'Rohit', role: 'QA Engineer', dept: 'Quality', start: d(2026, 4, 13), end: d(2026, 10, 12) };
const ROHIT_COMMENT = 'Owns the regression suite for the label printer; bug reports are clearer since the day-30 check-in.';
const addMonths = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth() + n, date.getDate());

function ProbationFields({ outcome, setOutcome, months, setMonths, first, end, extended = 0, comment }: { outcome: ProbationOutcome; setOutcome: (o: ProbationOutcome) => void; months: number | null; setMonths: (m: number | null) => void; first: string; end: Date; extended?: number; comment?: string }) {
  const [rating, setRating] = useState<string | null>(null);
  const [raised, setRaised] = useState<string | null>(null);
  const [raisedOn, setRaisedOn] = useState<Date | null>(null);
  const ok = outcome !== 'extend' || !months || extensionAllowed(6, extended, months, 12);
  return (
    <div className="yx-ppl__form">
      <FormField label="Outcome" required>
        <RadioGroup
          value={outcome}
          onChange={(v) => setOutcome(v as ProbationOutcome)}
          options={[
            { value: 'confirm', label: 'Confirm', description: 'Sends a confirmation letter. Notice becomes 60 days and earned leave starts.' },
            { value: 'extend', label: 'Extend', description: 'Up to 12 months of probation in total (company policy).' },
            { value: 'terminate', label: 'Recommend ending employment', description: `HR reviews it and decides. Nothing is shared with ${first} until then.` },
          ]}
        />
      </FormField>
      {outcome === 'extend' && (
        <>
          <FormField
            label="Extend by (months)"
            required
            error={ok ? null : 'Extend by 1 to 6 months. Probation can be 12 months at most in total.'}
            helper={ok && months ? `New end date: ${formatDate(addMonths(end, months))}` : undefined}
          >
            <NumberField value={months} onChange={setMonths} />
          </FormField>
          <FormField label="What needs to improve" required helper={`${first} sees this, so they know what to work on.`}>
            <TextArea rows={3} />
          </FormField>
        </>
      )}
      {outcome === 'terminate' && (
        <>
          <FormField label={`Did you raise these concerns with ${first} earlier?`} required>
            <RadioGroup value={raised ?? undefined} onChange={setRaised} orientation="horizontal" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          </FormField>
          {raised === 'yes' && (
            <FormField label="When" required>
              <DatePicker value={raisedOn} onChange={setRaisedOn} />
            </FormField>
          )}
          {raised === 'no' && (
            <InlineAlert tone="warning">
              Talk to {first} first. HR usually asks for at least one recorded conversation before ending employment.
            </InlineAlert>
          )}
        </>
      )}
      <FormField label="Rating" optional>
        <Select options={['Exceeds', 'Meets', 'Below'].map((x) => ({ value: x, label: x }))} value={rating} onChange={setRating} placeholder="Choose a rating" />
      </FormField>
      <FormField label="Comments" required helper={`Shared with HR. ${first} sees the outcome and the letter.`}>
        <TextArea rows={3} defaultValue={comment} />
      </FormField>
    </div>
  );
}

/** What the manager needs in front of them to decide. No pay. */
function HowItWent() {
  const notes: ChecklistRow[] = [
    { id: 'n1', title: 'Day-30 check-in · 13 May 2026', owner: 'Divya Raghunathan', status: 'Done', note: 'Picks up the test framework quickly; bug reports need clearer steps to reproduce.' },
    { id: 'n2', title: 'Buddy feedback · 12 Jun 2026', owner: 'Imran Qureshi', status: 'Done', note: 'Asks good questions and has settled into the team well.' },
  ];
  return (
    <Card title="How it went">
      <div className="yx-ppl__stack">
        <dl className="yx-ppl__dl">
          <div className="yx-ppl__dl-row"><dt>Attendance</dt><dd>96% · 4 days absent</dd></div>
          <div className="yx-ppl__dl-row"><dt>Leave taken</dt><dd>4 days (casual 2, sick 2)</dd></div>
          <div className="yx-ppl__dl-row"><dt>Goals</dt><dd>2 of 3 on track</dd></div>
          <div className="yx-ppl__dl-row"><dt>Warnings</dt><dd>None</dd></div>
        </dl>
        <StatusChecklist label="Earlier check-ins" rows={notes} />
      </div>
    </Card>
  );
}

const mainLabel = (o: ProbationOutcome, first: string) => (o === 'confirm' ? `Confirm ${first}` : o === 'extend' ? 'Extend probation' : 'Send to HR');
const mainVariant = (o: ProbationOutcome) => (o === 'confirm' ? 'approve' : o === 'extend' ? 'primary' : 'danger') as 'approve' | 'primary' | 'danger';
const deadline = (end: Date, today: Date) => `Decide by ${formatDate(end)} (in ${plural(daysBetween(today, end), 'day')}). If you don't, HR decides.`;

// PPL-17
export function ProbationReviewForm({ outcome: initial = 'confirm', months: m = null }: { outcome?: ProbationOutcome; months?: number | null }) {
  const [outcome, setOutcome] = useState<ProbationOutcome>(initial);
  const [months, setMonths] = useState<number | null>(m);
  return (
    <PeopleFrame active="Probation" persona="mgr">
      <ObjectHeader
        name={`Probation review: ${ROHIT.name}`}
        avatarName={ROHIT.name}
        person
        secondary={`${ROHIT.role} · ${ROHIT.dept} · probation ${formatDate(ROHIT.start)} to ${formatDate(ROHIT.end)}`}
        status={<StatusBadge status="Review due" />}
      />
      <InlineAlert tone="info">{deadline(ROHIT.end, TODAY)}</InlineAlert>
      <div className="yx-ppl__grid2 yx-ppl__grid2--aside-first">
        <HowItWent />
        <div className="yx-ppl__stack">
          <ProbationFields outcome={outcome} setOutcome={setOutcome} months={months} setMonths={setMonths} first={ROHIT.first} end={ROHIT.end} comment={ROHIT_COMMENT} />
          <div className="yx-ppl__row">
            <Button>Save draft</Button>
            <Button variant={mainVariant(outcome)}>{mainLabel(outcome, ROHIT.first)}</Button>
          </div>
        </div>
      </div>
    </PeopleFrame>
  );
}

// PPL-17 · phone
export function ProbationReviewPhone({ outcome: initial = 'confirm', months: m = null }: { outcome?: ProbationOutcome; months?: number | null }) {
  const [outcome, setOutcome] = useState<ProbationOutcome>(initial);
  const [months, setMonths] = useState<number | null>(m);
  return (
    <PhoneFrame tab="requests" title="Probation review">
      <ObjectHeader name={ROHIT.name} person secondary={`${ROHIT.role} · ends ${formatDate(ROHIT.end)}`} status={<StatusBadge status="Review due" />} />
      <InlineAlert tone="info">{deadline(ROHIT.end, TODAY)}</InlineAlert>
      <details className="yx-ppl__done-fold">
        <summary>How it went</summary>
        <HowItWent />
      </details>
      <ProbationFields outcome={outcome} setOutcome={setOutcome} months={months} setMonths={setMonths} first={ROHIT.first} end={ROHIT.end} comment={ROHIT_COMMENT} />
      <div className="yx-ppl__stack">
        <Button variant={mainVariant(outcome)} fullWidth>
          {mainLabel(outcome, ROHIT.first)}
        </Button>
        <Button fullWidth>Save draft</Button>
      </div>
    </PhoneFrame>
  );
}

/* ================================================================== PPL-41 buddy panel */

type Buddy = (typeof BUDDIES)[number];
type Joiner = (typeof NEEDS_BUDDY)[number];

/** Upcoming buddy check-ins; the pair is the second line so the task reads first. */
const BUDDY_CHECKINS: (ChecklistRow & { pair: string })[] = [
  { id: 'c1', title: 'Buddy feedback', pair: 'Sneha Patil and Farzana Begum', owner: 'Buddy and joiner', due: new Date(2026, 8, 27), status: 'Overdue' },
  { id: 'c2', title: 'Welcome call', pair: 'Kavya Reddy and Lakshmi Gowda', owner: 'Buddy', due: new Date(2026, 9, 2), status: 'Pending' },
  { id: 'c3', title: 'Day-30 check-in', pair: 'Kiran Joshi and Joseph Mathew', owner: 'Buddy and joiner', due: new Date(2026, 9, 3), status: 'Pending' },
  { id: 'c4', title: 'Day-30 check-in and feedback', pair: 'Kavya Reddy and Lakshmi Gowda', owner: 'Buddy and joiner', due: new Date(2026, 10, 4), status: 'Pending' },
  { id: 'c5', title: 'Day-30 check-in', pair: 'Arjun Pillai and Thomas George', owner: 'Buddy and joiner', due: new Date(2026, 8, 2), status: 'Done' },
  { id: 'c6', title: 'Welcome call', pair: 'Kiran Joshi and Joseph Mathew', owner: 'Buddy', due: new Date(2026, 8, 2), status: 'Done' },
];

/** "Joins today", "joins 06 Oct", "joined 03 Sep". */
const joinText = (date: Date) => {
  const n = daysBetween(TODAY, date);
  return n === 0 ? 'joins today' : n > 0 ? `joins ${formatDate(date)}` : `joined ${formatDate(date)}`;
};

// PPL-41
export function BuddyPanel({ pool, needs = NEEDS_BUDDY, assignFor }: { pool: Buddy[]; needs?: Joiner[]; assignFor?: string }) {
  const [forId, setForId] = useState<string | null>(assignFor ?? null);
  const joiner = needs.find((j) => j.id === forId);
  // Suggest the least-loaded buddy from the joiner's team and location.
  const suggest = (j: Joiner) => [...pool].filter((b) => b.joiners.length < b.cap && !EXIT_CASES.some((e) => e.name === b.name)).sort((a, b) => Number(b.team === j.team && b.location === j.location) - Number(a.team === j.team && a.location === j.location) || a.joiners.length - b.joiners.length)[0]?.id ?? null;
  const [pick, setPick] = useState<string | null>(() => (joiner ? suggest(joiner) : null));
  const narrow = useNarrow();
  const openFor = (j: Joiner) => {
    setForId(j.id);
    setPick(suggest(j));
  };
  const assignBtn = (j: Joiner) => (
    <Button size="sm" icon={UserPlus} onClick={() => openFor(j)}>
      Assign buddy
    </Button>
  );
  const load = (b: Buddy) => <Meter value={b.joiners.length} max={b.cap} label={`${b.name} joiners`} valueText={`${b.joiners.length} of ${b.cap}`} warnAt={101} dangerAt={101} />;
  const who = (b: Buddy) => (b.joiners.length ? b.joiners.map((j) => `${j.name} · ${joinText(j.joins)}`).join('; ') : 'No one yet');
  // A buddy who is leaving can't look after a joiner past their last day.
  const leaving = (b: Buddy) => EXIT_CASES.find((e) => e.name === b.name);
  const status = (b: Buddy) => (leaving(b) ? 'Leaving' : b.joiners.length >= b.cap ? 'Full' : 'Available');
  const leavingNote = (b: Buddy) => {
    const e = leaving(b);
    return e ? <Text size="sm" tone="danger">Leaving {formatDate(e.lwd)} · reassign {b.joiners.map((j) => j.name).join(' and ')}</Text> : null;
  };
  const cols: TableColumn<Buddy>[] = [
    { key: 'name', header: 'Buddy', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: `${r.team} · ${r.location}` }), width: 220 },
    { key: 'joiners', header: 'Looking after', value: who, render: (r) =>
        r.joiners.length ? (
          <span className="yx-ppl__type">
            {r.joiners.map((j) => (
              <span key={j.name}>
                {j.name} · {joinText(j.joins)}
              </span>
            ))}
            {leavingNote(r)}
          </span>
        ) : (
          <span className="yx-ppl__sub">No one yet</span>
        ),
      width: 260,
    },
    { key: 'load', header: 'Load', value: (r) => r.joiners.length, render: load, width: 150 },
    { key: 'status', header: 'Status', type: 'status', value: status, statusTone: (v) => (v === 'Leaving' ? 'warning' : v === 'Full' ? 'neutral' : 'success'), width: 110 },
  ];
  const checkRow = (c: (typeof BUDDY_CHECKINS)[number]): ChecklistRow => ({ ...c, note: c.pair });
  const open = BUDDY_CHECKINS.filter((c) => c.status !== 'Done').sort((a, b) => a.due!.getTime() - b.due!.getTime());
  const done = BUDDY_CHECKINS.filter((c) => c.status === 'Done');
  const emptyPool = <EmptyState title="No buddies in the pool" description="Add volunteers from each team and location." action={<Button icon={Plus}>Add to pool</Button>} />;
  return (
    <PeopleFrame active="Buddies">
      <PageHeader
        title="Buddies"
        description="A buddy is a colleague from the same team or location, never the joiner's manager. Each buddy looks after at most 2 joiners at a time."
        actions={<Button icon={Plus}>Add to pool</Button>}
      />
      {needs.length > 0 && (
        <Card title={`Needs a buddy (${needs.length})`}>
          {narrow ? (
            <ul className="yx-ppl__cards" aria-label="Joiners without a buddy">
              {needs.map((j) => (
                <li key={j.id} className="yx-ppl__rcard">
                  <span className="yx-ppl__rcard-name">{j.name}</span>
                  <span className="yx-ppl__sub">
                    {j.role} · {j.location}
                  </span>
                  <JoinsCell date={j.joins} />
                  {assignBtn(j)}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="yx-ppl__checklist" aria-label="Joiners without a buddy">
              {needs.map((j) => (
                <li key={j.id} className="yx-ppl__check-row">
                  <div className="yx-ppl__check-main">
                    <span className="yx-ppl__check-title">{j.name}</span>
                    <span className="yx-ppl__check-meta">
                      <Text size="sm" tone="secondary">
                        {j.role} · {j.location}
                      </Text>
                    </span>
                  </div>
                  <div className="yx-ppl__check-side">
                    <JoinsCell date={j.joins} />
                    {assignBtn(j)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <div className="yx-ppl__stack">
        {narrow ? (
          pool.length === 0 ? (
            emptyPool
          ) : (
            <ul className="yx-ppl__cards" aria-label="Buddy pool">
              {pool.map((b) => (
                <li key={b.id} className="yx-ppl__rcard">
                  <span className="yx-ppl__rcard-name">{b.name}</span>
                  <span className="yx-ppl__sub">
                    {b.team} · {b.location}
                  </span>
                  <span>{who(b)}</span>
                  {leavingNote(b)}
                  {load(b)}
                  <StatusBadge status={status(b)} />
                </li>
              ))}
            </ul>
          )
        ) : (
          <DataTable label="Buddy pool" columns={cols} rows={pool} getRowId={(r) => r.id} empty={emptyPool} />
        )}
        <Card title="Check-ins">
          <StatusChecklist label="Upcoming buddy check-ins" rows={open.map(checkRow)} today={TODAY} />
          {done.length > 0 && (
            <details className="yx-ppl__done-fold">
              <summary>Done ({done.length})</summary>
              <StatusChecklist label="Done buddy check-ins" rows={done.map(checkRow)} />
            </details>
          )}
        </Card>
      </div>
      <Drawer
        open={!!joiner}
        onOpenChange={(o) => !o && setForId(null)}
        title={`Assign a buddy to ${joiner?.name ?? ''}`}
        footer={
          <>
            <Button onClick={() => setForId(null)}>Cancel</Button>
            <Button variant="primary" disabled={!pick}>
              Assign buddy
            </Button>
          </>
        }
      >
        {joiner && (
          <div className="yx-ppl__stack yx-ppl__drawer-body">
            <dl className="yx-ppl__dl">
              <div className="yx-ppl__dl-row"><dt>Role</dt><dd>{joiner.role}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Team</dt><dd>{joiner.team}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Location</dt><dd>{joiner.location}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Joins</dt><dd>{formatDate(joiner.joins)}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Manager</dt><dd>{joiner.manager}</dd></div>
            </dl>
            <FormField label="Buddy" required helper={`Suggested from ${joiner.team} at ${joiner.location}. ${joiner.manager} is the manager, so isn't listed.`}>
              <PersonPicker
                people={pool.map((b) => {
                  const isFull = b.joiners.length >= b.cap;
                  return { id: b.id, name: b.name, role: b.team, department: b.location, note: `${b.joiners.length} of ${b.cap}${isFull ? ', full' : ''}`, disabled: isFull };
                })}
                value={pick}
                onChange={setPick}
              />
            </FormField>
            <InlineAlert tone="info">The buddy gets a welcome call, day-1 lunch and day-30 check-in tasks, with reminders.</InlineAlert>
          </div>
        )}
      </Drawer>
    </PeopleFrame>
  );
}
