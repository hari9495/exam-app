// PPL-11 Onboarding board · PPL-12 Ready to onboard · PPL-13 Journey record · PPL-14 Pre-boarding batches
// PPL-15 Pre-boarding actions · PPL-16 Probation queue · PPL-17 Probation review · PPL-41 Buddy panel (M01 §3.4, §3.5, §3.11).
import { useMemo, useState, type ReactNode } from 'react';
import { CalendarClock, Check, FileText, Lock, Plus, Upload, UserPlus } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Card, ObjectHeader, PageHeader } from '../../components/shell';
import { KanbanBoard, type KanbanCard, type KanbanColumn } from '../../components/kanban';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, NoAccessState, InlineAlert, Meter } from '../../components/feedback';
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
import type { JoinerInput, JoinerPlaces, Journey as LiveJourneyData } from './live/types';
import { TaskDialog, type TaskActions, type TaskAsk } from './live/lifecycle';
import { taskButtons, taskRow } from './checklists';
import { useRun } from '../org/org-kit';
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
export type JoinerCard = KanbanCard & { location: string; owner: string; people: number };
export const joinerCard = (id: string, name: string, role: string, when: string, progress: number, days: number, location: string, next: { text: string; owner: string; overdue?: boolean }, people = 1): JoinerCard => ({
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
  { id: 'offer', title: 'Offer accepted', cards: [joinerCard('k4', 'Ananya Das', 'Account Executive', 'joins 2 Nov', 5, 2, 'Chennai office', { text: 'Pre-boarding link · 3 Oct', owner: 'HR' }), joinerCard('k2', 'Suresh Nair', 'Maintenance Technician', 'joins 12 Oct (rehire)', 10, 5, 'Hosur plant', { text: 'Rehire options · 30 Sep', owner: 'HR', overdue: true }), joinerCard('k9', 'Selvi Perumal', 'Warehouse Associate', 'joins 6 Oct', 0, 3, 'Hosur plant', { text: 'Convert to employee · 1 Oct', owner: 'HR' })], emptyText: 'No accepted offers waiting' },
  { id: 'pre', title: 'Pre-boarding', cards: [joinerCard('k1', 'Kavya Reddy', 'Quality Inspector', 'joins 5 Oct', journeyProgress(ONBOARDING_TASKS), 11, 'Hosur plant', { text: 'Education proofs · 28 Sep', owner: 'New hire', overdue: true }), joinerCard('k5', 'Campus 2026 · Sales', '12 sales trainees', 'join 19 Oct', 88, 40, 'Bengaluru head office', { text: 'Bank details ×3 · 25 Sep', owner: 'HR', overdue: true }, 12)], slaDays: 30 },
  { id: 'day1', title: 'Day 1', cards: [joinerCard('k3', 'Murugan K', 'Warehouse Associate', 'joins 1 Oct', 70, 3, 'Hosur plant', { text: 'Safety induction · 1 Oct', owner: 'Manager' })], emptyText: 'No one joins this week' },
  { id: 'first30', title: 'First 30 days', cards: [joinerCard('k6', 'Kiran Joshi', 'Account Executive', 'joined 3 Sep', 92, 26, 'Chennai office', { text: '30-day check-in · 6 Oct', owner: 'Manager' }), joinerCard('k7', 'Sneha Patil', 'HR Executive', 'joined 26 Aug', 96, 34, 'Bengaluru head office', { text: 'Buddy feedback · 27 Sep', owner: 'HR', overdue: true })], slaDays: 30 },
  { id: 'done', title: 'Done', cards: [joinerCard('k8', 'Deepa Ghosh', 'Accountant', 'joined 30 Mar', 100, 120, 'Bengaluru head office', { text: 'All tasks done', owner: 'HR' })] },
];

// PPL-11
const LOCATIONS = ['Bengaluru head office', 'Chennai office', 'Hosur plant'];
const OWNERS: Owner[] = ['HR', 'IT', 'Manager', 'New hire'];
const isLate = (c: KanbanCard, col: KanbanColumn) => Boolean(c.next?.overdue || (col.slaDays !== undefined && c.daysInStage > col.slaDays));

/** The live app's board (design audit step 3). Stages follow the dates, so cards are not moved by hand. */
export interface LiveBoard {
  error: boolean;
  /** The board answered 403: the person has no onboarding grant. */
  noAccess?: boolean;
  onRetry: () => void;
  onAdd?: () => void;
  onImport?: () => void;
  onOpenCard: (id: string) => void;
  /** The company the top-bar picker scopes the board to, when the group has more than one. */
  entityName?: string;
  /** Drawers and dialogs the page opens. */
  children?: ReactNode;
}

export function OnboardingBoard({ columns, state = 'ready', live }: { columns: KanbanColumn[]; state?: 'ready' | 'loading'; live?: LiveBoard }) {
  const [entity, setEntity] = useState<string | null>('all');
  const [q, setQ] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [location, setLocation] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const cards = columns.flatMap((c) => c.cards as JoinerCard[]);
  const total = cards.length;
  const batches = cards.filter((c) => c.people > 1);
  const singles = total - batches.length;
  const people = cards.reduce((n, c) => n + (c.people ?? 1), 0);
  const overdue = columns.reduce((n, col) => n + col.cards.filter((c) => isLate(c, col)).length, 0);
  const locations = live ? [...new Set(cards.map((c) => c.location).filter(Boolean))].sort() : LOCATIONS;
  const owners = live ? [...new Set(cards.map((c) => c.owner).filter(Boolean))] : OWNERS;
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
  const filterKey = `${q}|${overdueOnly}|${location}|${owner}|${live ? total : ''}`;
  const add = live ? live.onAdd : () => {};
  return (
    <PeopleFrame active="Onboarding board">
      <PageHeader
        title="Onboarding"
        description={
          live?.noAccess
            ? undefined
            : total === 0
            ? `No one is onboarding right now${live?.entityName ? ` in ${live.entityName}. Switch company at the top to see the others` : ''}.`
            : `${singles} ${singles === 1 ? 'joiner' : 'joiners'}${batches.length ? ` and ${batches.length} campus ${batches.length === 1 ? 'batch' : 'batches'} (${batches.reduce((n, b) => n + b.people, 0)} people)` : ''} · ${people} ${people === 1 ? 'person' : 'people'} in all, from offer accepted to 30 days in. ${live ? 'Open a card for the checklist.' : 'Drag a card or use Move to on each card.'}${live?.entityName ? ` Joiners of ${live.entityName}. Switch company at the top to see the others.` : ''}`
        }
        actions={
          <div className="yx-ppl__head-actions">
            {/* Live: the company picker in the top bar scopes the board. */}
            {!live && (
              <span className="yx-ppl__head-select">
                <Select aria-label="Legal entity" size="sm" options={[{ value: 'all', label: 'All entities' }, { value: 'ka', label: 'Kaveri Foods Pvt Ltd' }, { value: 'tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }]} value={entity} onChange={setEntity} />
              </span>
            )}
            {total > 0 && live?.onImport && (
              <Button icon={Upload} onClick={live.onImport}>
                Import joiners
              </Button>
            )}
            {total > 0 && add && (
              <Button icon={UserPlus} variant="primary" onClick={add}>
                Add joiner
              </Button>
            )}
          </div>
        }
      />
      {live?.noAccess ? (
        <NoAccessState what="the onboarding board" grantedBy="your HR admin" />
      ) : live?.error ? (
        <ErrorState title="We couldn't load the onboarding board" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : state === 'loading' ? (
        <ListSkeleton label="Loading onboarding board" rows={5} />
      ) : total === 0 ? (
        <EmptyState
          title="No one is onboarding right now"
          description={add ? 'Accepted offers appear here automatically, or add a joiner by hand.' : 'Accepted offers and joiners appear here.'}
          action={
            add ? (
              <span className="yx-ppl__row">
                {live?.onImport && <Button icon={Upload} onClick={live.onImport}>Import joiners</Button>}
                <Button variant="primary" icon={UserPlus} onClick={add}>
                  Add joiner
                </Button>
              </span>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="yx-ppl__filters">
            <span className="yx-ppl__head-select">
              <TextField type="search" aria-label="Find a joiner" placeholder="Find a joiner" value={q} onChange={setQ} size="sm" />
            </span>
            <span className="yx-ppl__head-select">
              <Select aria-label="Location" size="sm" options={[{ value: 'all', label: 'All locations' }, ...locations.map((l) => ({ value: l, label: l }))]} value={location ?? 'all'} onChange={(v) => setLocation(v === 'all' || !v ? null : v)} />
            </span>
            <span className="yx-ppl__head-select">
              <Select aria-label="Next task owner" size="sm" options={[{ value: 'all', label: 'Next task: anyone' }, ...owners.map((o) => ({ value: o, label: `Next task: ${o}` }))]} value={owner ?? 'all'} onChange={(v) => setOwner(v === 'all' || !v ? null : v)} />
            </span>
            <button type="button" className="yx-ppl__chip yx-ppl__chip--toggle" aria-pressed={overdueOnly} onClick={() => setOverdueOnly(!overdueOnly)}>
              {overdueOnly && <Icon icon={Check} size="sm" />}
              Only overdue ({overdue})
            </button>
          </div>
          <KanbanBoard key={filterKey} aria-label="Onboarding board" defaultColumns={shown} noun="joiner" readOnly={Boolean(live)} onOpenCard={live ? live.onOpenCard : () => {}} />
        </>
      )}
      {live?.children}
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

/** A row of the queue: the sample offers, or a live accepted offer. */
export type ReadyRow = Ready & { live?: { offerId: string; email: string; internal: boolean } };

/** The live app's queue (design audit step 3). */
export interface LiveReady {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  today: Date;
  places: JoinerPlaces;
  onCreate: (row: ReadyRow, input: Omit<JoinerInput, 'email' | 'phone'>) => Promise<void>;
  /** A current employee moves by a job change, never onboarding. */
  onJobChange: () => void;
}

// PPL-12
export function ReadyToOnboardQueue({ rows, defaultOpenId, overridden, live }: { rows: ReadyRow[]; defaultOpenId?: string; overridden?: boolean; live?: LiveReady }) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const open = rows.find((r) => r.id === openId);
  const narrow = useNarrow();
  const today = live?.today ?? TODAY;
  const cols: TableColumn<ReadyRow>[] = [
    { key: 'name', header: 'Joiner', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: [r.role, r.dept].filter(Boolean).join(' · ') }), width: 260 },
    { key: 'joining', header: 'Joins', type: 'date', value: (r) => r.joining, render: (r) => <JoinsCell date={r.joining} today={today} />, width: 190 },
    { key: 'personType', header: 'Person type', value: (r) => r.personType, render: (r) => <TypeCell row={r} />, groupable: true, width: 240 },
    { key: 'source', header: 'From', value: (r) => r.source, width: 190, optional: true },
    { key: 'location', header: 'Location', value: (r: ReadyRow) => r.location, width: 150, optional: true } as TableColumn<ReadyRow>,
    { key: 'offerAccepted', header: 'Offer accepted', type: 'date', value: (r) => r.offerAccepted, width: 140, optional: true },
  ];
  const action = (r: ReadyRow) =>
    r.live?.internal ? (
      <Button size="sm" onClick={live?.onJobChange}>
        Job change
      </Button>
    ) : (
      <Button size="sm" icon={UserPlus} onClick={() => setOpenId(r.id)}>
        {r.personType === 'Contract worker conversion' ? 'Convert' : 'Create employee'}
      </Button>
    );
  const empty = (
    <EmptyState
      title="No accepted offers are waiting"
      description="Entities set to automatic hand-off create the employee when the offer is accepted, so their joiners go straight to the Onboarding board."
      action={live ? undefined : <Button>Change hand-off setting</Button>}
    />
  );
  return (
    <PeopleFrame active="Ready to onboard">
      <PageHeader title="Ready to onboard" description="Accepted offers whose employee isn't created yet, soonest joining first. Create the employee to start pre-boarding; the person type decides the path." />
      {live?.state === 'no-access' ? (
        <NoAccessState what="the accepted offers" grantedBy="your HR admin" />
      ) : live?.state === 'error' ? (
        <ErrorState title="We couldn't load the accepted offers" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : live?.state === 'loading' ? (
        <ListSkeleton label="Loading accepted offers" />
      ) : narrow ? (
        rows.length === 0 ? (
          empty
        ) : (
          <ul className="yx-ppl__cards" aria-label="Ready to onboard">
            {[...rows].sort((a, b) => a.joining.getTime() - b.joining.getTime()).map((r) => (
              <li key={r.id} className="yx-ppl__rcard">
                <span className="yx-ppl__rcard-name">{r.name}</span>
                <span className="yx-ppl__sub">{[r.role, r.location].filter(Boolean).join(' · ')}</span>
                <span className="yx-ppl__row">
                  <TypeCell row={r} />
                </span>
                <JoinsCell date={r.joining} today={today} />
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
          onRowClick={(r) => !r.live?.internal && setOpenId(r.id)}
          activeRowId={openId}
          rowButtons={action}
          // Open offer and Mark reneged: no live action for an accepted offer yet (left out).
          rowActions={
            live
              ? undefined
              : () => (
                  <>
                    <MenuItem>Open offer</MenuItem>
                    <MenuItem>Mark reneged</MenuItem>
                  </>
                )
          }
          empty={empty}
        />
      )}
      {live ? (
        open && <CreateFromOffer row={open} live={live} onClose={() => setOpenId(null)} />
      ) : (
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
                  {open.name}&apos;s deployments, site attendance and contract-labour records stay on the same timeline. Contract service doesn&apos;t count for probation (company setting). The kiosk enrolment carries over.
                </InlineAlert>
              )}
              <InlineAlert tone="info">An appointment letter task is added for HR, due by the joining date. It can&apos;t be removed.</InlineAlert>
            </div>
          )}
        </Drawer>
      )}
    </PeopleFrame>
  );
}

const dayKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Live: the offer's facts, then where the joiner works (the offer does not say), then create. */
function CreateFromOffer({ row, live, onClose }: { row: ReadyRow; live: LiveReady; onClose: () => void }) {
  const places = live.places;
  const [first, ...rest] = row.name.split(' ');
  const [date, setDate] = useState<Date | null>(row.joining);
  const [entity, setEntity] = useState<string | null>(places.entities.length === 1 ? places.entities[0].value : null);
  const [location, setLocation] = useState<string | null>(null);
  const [dept, setDept] = useState<string | null>(null);
  const [desig, setDesig] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [manager, setManager] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const missing = { date: !date, entity: !entity, location: !location };
  const create = async () => {
    setTried(true);
    if (missing.date || missing.entity || missing.location) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onCreate(row, { givenName: first, familyName: rest.join(' ') || null, joiningOn: dayKeyOf(date!), legalEntityId: entity!, locationId: location!, departmentId: dept, designationId: desig, employmentTypeId: type, managerEmployeeId: manager });
      onClose();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'The joiner was not created. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`Create employee: ${row.name}`}
      subtitle={`${row.personType} · ${row.source}${row.note ? ` · ${row.note}` : ''}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void create()}>
            Create and start pre-boarding
          </Button>
        </>
      }
    >
      <div className="yx-ppl__stack yx-ppl__drawer-body">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <dl className="yx-ppl__dl">
          <div className="yx-ppl__dl-row"><dt>Name</dt><dd>{row.name}</dd></div>
          <div className="yx-ppl__dl-row"><dt>Role</dt><dd>{row.role}</dd></div>
          <div className="yx-ppl__dl-row"><dt>Email</dt><dd>{row.live?.email}</dd></div>
          <div className="yx-ppl__dl-row"><dt>Start date in the offer</dt><dd>{formatDate(row.joining)}</dd></div>
        </dl>
        <div className="yx-ppl__form">
          <FormField id="ro-date" label="Joining date" required helper="Pre-filled from the offer. Tasks are scheduled from this date." error={tried && missing.date ? 'Choose the joining day.' : null}>
            <DatePicker value={date} onChange={setDate} aria-label="Joining date" />
          </FormField>
          <FormField id="ro-entity" label="Legal entity" required error={tried && missing.entity ? 'Choose the legal entity.' : null}>
            <Select aria-label="Legal entity" value={entity} onChange={(x) => (setEntity(x), setLocation(null))} options={places.entities} />
          </FormField>
          <FormField id="ro-location" label="Location" required helper={entity ? undefined : 'Choose the legal entity first.'} error={tried && missing.location ? 'Choose the location.' : null}>
            <Select aria-label="Location" value={location} onChange={setLocation} options={places.locations.filter((l) => l.entityId === entity)} disabled={!entity} />
          </FormField>
          <FormField id="ro-dept" label="Department" optional>
            <Select aria-label="Department" value={dept} onChange={setDept} options={places.departments} clearable searchable />
          </FormField>
          <FormField id="ro-desig" label="Designation" optional>
            <Select aria-label="Designation" value={desig} onChange={setDesig} options={places.designations} clearable searchable />
          </FormField>
          <FormField id="ro-type" label="Employment type" optional>
            <Select aria-label="Employment type" value={type} onChange={setType} options={places.employmentTypes} clearable />
          </FormField>
          <FormField id="ro-manager" label="Manager" optional helper="They see the joiner under Joining soon and get the manager's tasks.">
            <Select aria-label="Manager" value={manager} onChange={setManager} options={places.managers} clearable searchable />
          </FormField>
        </div>
        {row.personType === 'Ex-employee rehire' && (
          <InlineAlert tone="info" title="Worked here before">
            After you create the joiner, choose the rehire options (code, PF, service, leave) on their checklist.
          </InlineAlert>
        )}
      </div>
    </Drawer>
  );
}

/** Joins column: date plus "in 5 days"; within a week it is flagged. */
export function JoinsCell({ date, today = TODAY }: { date: Date; today?: Date }) {
  const n = daysBetween(today, date);
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

/** The live app's checklist (design audit step 3): any journey (onboarding, leaving, life events), its tasks in phases. */
export interface LiveJourney {
  state: 'ready' | 'loading' | 'error' | 'no-access' | 'not-found';
  onRetry: () => void;
  journey: LiveJourneyData | null;
  /** The joiner's role, place and people, when the journey is an onboarding HR runs. */
  joiner?: { role: string | null; location: string; manager: string | null; buddy: string | null } | null;
  actions: TaskActions;
  /** HR on a joiner still waiting to join: Change status (PPL-15). */
  preboard?: LivePreboardAction;
  /** Joiner details and actions (forms, checks, joined, rehire options, buddy), shown under the tasks. */
  children?: ReactNode;
}

const LIVE_PHASE_WORD: Record<LiveJourneyData['kind'], [string, string, string]> = {
  onboarding: ['Before joining', 'Joining day', 'After joining'],
  offboarding: ['Before the last day', 'Last working day', 'After leaving'],
  new_manager: ['Before the start', 'First day', 'After the start'],
  transfer: ['Before the move', 'Moving day', 'After the move'],
  parental_leave: ['Before the leave', 'First day of leave', 'After the leave starts'],
  return_to_work: ['Before the return', 'Return day', 'After the return'],
};
const LIVE_ANCHOR: Record<LiveJourneyData['kind'], string> = { onboarding: 'joins', offboarding: 'leaves', new_manager: 'manages from', transfer: 'moves', parental_leave: 'leave from', return_to_work: 'back on' };
const LIVE_ANCHOR_PAST: Record<LiveJourneyData['kind'], string> = { onboarding: 'joined', offboarding: 'left', new_manager: 'managing since', transfer: 'moved', parental_leave: 'leave from', return_to_work: 'back since' };
const LIVE_TITLE: Record<LiveJourneyData['kind'], string> = { onboarding: 'onboarding', offboarding: 'leaving', new_manager: 'new manager', transfer: 'transfer', parental_leave: 'parental leave', return_to_work: 'return to work' };
const liveWhen = (offset: number, kind: LiveJourneyData['kind']) => {
  const [before, day, after] = LIVE_PHASE_WORD[kind];
  return offset === 0 ? `on ${day.toLowerCase()}` : offset < 0 ? `${plural(-offset, 'day')} ${before.toLowerCase()}` : `${plural(offset, 'day')} ${after.toLowerCase()}`;
};

function LiveJourneyRecord({ live, today }: { live: LiveJourney; today: Date }) {
  const j = live.journey;
  const [ask, setAsk] = useState<TaskAsk | null>(null);
  const [changing, setChanging] = useState(false);
  const fromKey = (iso: string) => new Date(`${iso}T00:00:00`);
  if (live.state !== 'ready' || !j)
    return (
      <PeopleFrame active="Onboarding board">
        {live.state === 'no-access' ? (
          <NoAccessState what="this checklist" grantedBy="your HR admin" />
        ) : live.state === 'error' ? (
          <ErrorState title="We couldn't load this checklist" description="Check your connection and try again." onRetry={live.onRetry} />
        ) : live.state === 'not-found' ? (
          <EmptyState title="Not found" description="This checklist doesn't exist or you can't open it." />
        ) : (
          <ListSkeleton label="Loading the checklist" />
        )}
      </PeopleFrame>
    );
  const anchor = fromKey(j.anchorOn);
  const tasks = j.tasks.filter((t) => t.status !== 'cancelled');
  const done = (t: (typeof tasks)[number]) => t.status === 'done' || t.status === 'skipped';
  const late = tasks.filter((t) => t.overdue);
  const letterLate = late.find((t) => t.locked && t.kind === 'letter');
  const words = LIVE_PHASE_WORD[j.kind];
  const phases = [
    { id: 'before', title: words[0], test: (o: number) => o < 0 },
    { id: 'day', title: words[1], test: (o: number) => o === 0 },
    { id: 'after', title: words[2], test: (o: number) => o > 0 },
  ];
  const rowOf = (t: (typeof tasks)[number]) => taskRow(t, liveWhen(t.dueOffsetDays, j.kind), taskButtons(t, setAsk, { manage: j.canManage, actions: live.actions }));
  const daysLeft = daysBetween(today, anchor);
  const kindTitle = LIVE_TITLE[j.kind];
  const where = [live.joiner?.role, live.joiner?.location].filter(Boolean).join(' · ');
  const doneCount = tasks.filter(done).length;
  return (
    <PeopleFrame active="Onboarding board">
      <ObjectHeader
        name={`${j.person} · ${kindTitle}`}
        avatarName={j.person}
        person
        secondary={`${where ? `${where} · ` : ''}${daysLeft < 0 ? LIVE_ANCHOR_PAST[j.kind] : LIVE_ANCHOR[j.kind]} ${formatDate(anchor)}${daysLeft < 0 ? '' : ` (${daysLeft === 0 ? 'today' : `in ${plural(daysLeft, 'day')}`})`}`}
        status={<ProgressRing value={j.progress} label={kindTitle} />}
        facts={[
          { label: 'Template', value: j.template },
          ...(live.joiner?.buddy ? [{ label: 'Buddy', value: live.joiner.buddy }] : []),
          ...(live.joiner?.manager ? [{ label: 'Manager', value: live.joiner.manager }] : j.owner ? [{ label: 'Run by', value: j.owner }] : []),
          { label: 'Tasks done', value: `${doneCount} of ${tasks.length}` },
        ]}
        // Add task: no way to add a one-off task to a running checklist yet (left out).
        actions={j.canManage && j.status === 'active' && live.preboard ? <Button onClick={() => setChanging(true)}>Change status</Button> : undefined}
      />
      {j.status !== 'active' && <InlineAlert tone={j.status === 'done' ? 'success' : 'info'}>{j.status === 'done' ? 'This checklist is complete.' : 'This checklist was cancelled.'}</InlineAlert>}
      {letterLate && j.canManage && (
        <InlineAlert tone="danger" title={`${letterLate.title} is overdue`} actions={live.actions.onIssueLetter ? <Button size="sm" icon={FileText} onClick={() => setAsk({ kind: 'letter', task: letterLate })}>Issue letter</Button> : undefined}>
          Due {formatDate(fromKey(letterLate.dueOn))}. It is required by law.
        </InlineAlert>
      )}
      {late.length > 0 && !letterLate && j.canManage && <InlineAlert tone="warning">{plural(late.length, 'task is', 'tasks are')} past the due date.</InlineAlert>}
      {!j.canManage && <Text as="p" className="yx-ppl__muted">You can do the tasks that have a button. HR runs the rest.</Text>}
      <div className="yx-ppl__phases">
        {phases.map((ph) => {
          const items = tasks.filter((t) => ph.test(t.dueOffsetDays));
          if (!items.length) return null;
          const open = items.filter((t) => !done(t));
          const closed = items.filter(done);
          return (
            <section key={ph.id} aria-labelledby={`phase-${ph.id}`}>
              <div className="yx-ppl__phase-head">
                <h2 className="yx-ppl__phase-title" id={`phase-${ph.id}`}>
                  {ph.title}
                </h2>
                <Text size="sm" tone="secondary">
                  {closed.length} of {items.length} done
                </Text>
              </div>
              {open.length > 0 && <StatusChecklist label={`${ph.title}: open tasks`} rows={open.map(rowOf)} today={today} />}
              {closed.length > 0 && (
                <details className="yx-ppl__done-fold">
                  <summary>Done ({closed.length})</summary>
                  <StatusChecklist label={`${ph.title}: done tasks`} rows={closed.map(rowOf)} today={today} />
                </details>
              )}
            </section>
          );
        })}
      </div>
      {live.children}
      {ask && <TaskDialog ask={ask} actions={live.actions} onClose={() => setAsk(null)} />}
      {changing && live.preboard && <PreboardingActionDrawer who={j.person} join={live.preboard.joiningOn} tasks={live.preboard.tasks} initial="postpone" initialDate={null} rehire={live.preboard.rehire} open onClose={() => setChanging(false)} live={live.preboard} />}
    </PeopleFrame>
  );
}

export function JourneyRecord({ tasks, joining, today, view = 'hr', live }: { tasks: JourneyTask[]; joining: Date; today: Date; view?: JourneyView; live?: LiveJourney }) {
  if (live) return <LiveJourneyRecord live={live} today={today} />;
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
/** A batch row: the sample, or a live batch (no offer counts on record: that column is left out live). */
export type BatchRow = Batch;

/** The live app's batches (design audit step 3). */
export interface LiveBatches {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  today: Date;
  /** Members of each batch, for "Open batch". */
  members: Record<string, { id: string; name: string; status: string; joiningOn: Date }[]>;
  onNew?: () => void;
  onEdit?: (id: string) => void;
  onAddMembers?: (id: string) => void;
  onLetters?: (id: string) => void;
  /** Moves the batch and every waiting member (with their checklist) to a new day. */
  onChangeDate?: (id: string, date: Date, reason: string) => Promise<void>;
  children?: ReactNode;
}

// PPL-14
export function PreboardingBatches({ rows, defaultChangeId, defaultDate, live }: { rows: BatchRow[]; defaultChangeId?: string; defaultDate?: Date; live?: LiveBatches }) {
  const [changeId, setChangeId] = useState<string | null>(defaultChangeId ?? null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState<Date | null>(defaultDate ?? rows.find((b) => b.id === defaultChangeId)?.joining ?? null);
  const [notify, setNotify] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const narrow = useNarrow();
  const today = live?.today ?? TODAY;
  const target = rows.find((b) => b.id === changeId);
  const opened = rows.find((b) => b.id === openId);
  const shift = target && newDate ? daysBetween(target.joining, newDate) : 0;
  const moves = target && newDate ? reanchor(ONBOARDING_TASKS, target.joining, newDate) : {};
  const moved = Object.values(moves).filter((m) => m.from.getTime() !== m.to.getTime()).length;
  const openChange = (b: Batch) => {
    setChangeId(b.id);
    setNewDate(b.joining);
    setReason('');
    setFailed(null);
  };
  const cols: TableColumn<Batch>[] = [
    {
      key: 'name',
      header: 'Batch',
      value: (r) => r.name,
      render: (r) => (
        <span className="yx-ppl__type">
          <span>{r.name}</span>
          <span className="yx-ppl__sub">{r.location || r.entity}</span>
        </span>
      ),
      width: 220,
    },
    { key: 'joining', header: 'Joins', type: 'date', value: (r) => r.joining, render: (r) => <JoinsCell date={r.joining} today={today} />, width: 195 },
    { key: 'offers', header: 'Offers issued', value: (r: Batch) => r.offers, render: (r: Batch) => <OffersCell row={r} />, width: 175 } as TableColumn<Batch>,
    { key: 'completion', header: 'Progress', type: 'number', value: (r) => r.completion, render: (r) => <Meter value={r.completion} max={100} label={`${r.name} pre-boarding done`} valueText={`${r.completion}%`} warnAt={101} />, width: 140 },
    { key: 'entity', header: 'Legal entity', value: (r) => r.entity, width: 260 },
  ];
  const canChange = !live || Boolean(live.onChangeDate);
  const action = (r: Batch) =>
    canChange && (!live || daysBetween(today, r.joining) >= 0) ? (
      <Button size="sm" icon={CalendarClock} onClick={() => openChange(r)}>
        Change date
      </Button>
    ) : null;
  const menu = (r: Batch) =>
    live ? (
      <>
        <MenuItem onSelect={() => setOpenId(r.id)}>Open batch</MenuItem>
        {live.onEdit && <MenuItem onSelect={() => live.onEdit!(r.id)}>Rename or add touchpoints</MenuItem>}
        {live.onAddMembers && <MenuItem onSelect={() => live.onAddMembers!(r.id)}>Add joiners</MenuItem>}
        {live.onLetters && r.members > 0 && <MenuItem onSelect={() => live.onLetters!(r.id)}>Send letters of intent</MenuItem>}
      </>
    ) : (
      <>
        <MenuItem>Open batch</MenuItem>
        <MenuItem>Schedule a touchpoint</MenuItem>
        {r.members > r.offers && <MenuItem>Issue {r.members - r.offers} pending offers</MenuItem>}
      </>
    );
  const newBatch = live ? live.onNew : () => {};
  const empty = <EmptyState title="No batches yet" description="Create a batch for campus hires who join together." action={newBatch ? <Button onClick={newBatch}>New batch</Button> : undefined} />;
  const sorted = [...rows].sort((a, b) => a.joining.getTime() - b.joining.getTime());
  const save = async () => {
    if (!live?.onChangeDate || !target || !newDate) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onChangeDate(target.id, newDate, reason.trim());
      setChangeId(null);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'The date was not changed. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <PeopleFrame active="Batches">
      <PageHeader title="Pre-boarding batches" description="Campus hires who join on the same date. Change a batch's date and every member's open tasks move with it." actions={newBatch && rows.length > 0 ? <Button variant="primary" icon={Plus} onClick={newBatch}>New batch</Button> : undefined} />
      {live?.state === 'no-access' ? (
        <NoAccessState what="the batches" grantedBy="your HR admin" />
      ) : live?.state === 'error' ? (
        <ErrorState title="We couldn't load the batches" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : live?.state === 'loading' ? (
        <ListSkeleton label="Loading batches" />
      ) : narrow ? (
        rows.length === 0 ? (
          empty
        ) : (
          <ul className="yx-ppl__cards" aria-label="Batches">
            {sorted.map((r) => (
              <li key={r.id} className="yx-ppl__rcard">
                <span className="yx-ppl__rcard-name">{r.name}</span>
                <span className="yx-ppl__sub">
                  {r.location || r.entity} · {r.members} members
                </span>
                <JoinsCell date={r.joining} today={today} />
                {!live && <OffersCell row={r} suffix=" offers issued" />}
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
          {...(live ? { onRowClick: (r: Batch) => setOpenId(r.id) } : {})}
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
            <Button variant="primary" disabled={shift === 0 || (live && reason.trim().length < 3)} loading={busy} onClick={live ? () => void save() : () => setChangeId(null)}>
              Move {plural(target?.members ?? 0, 'member')}
            </Button>
          </>
        }
      >
        {target && (
          <div className="yx-ppl__stack">
            {failed && <InlineAlert tone="danger" title={failed} />}
            <dl className="yx-ppl__dl">
              <div className="yx-ppl__dl-row"><dt>Current date</dt><dd>{formatDate(target.joining)}</dd></div>
              {target.location && <div className="yx-ppl__dl-row"><dt>Location</dt><dd>{target.location}</dd></div>}
              <div className="yx-ppl__dl-row"><dt>Legal entity</dt><dd>{target.entity}</dd></div>
            </dl>
            <FormField label="New joining date" required>
              <DatePicker value={newDate} onChange={setNewDate} min={live ? today : undefined} />
            </FormField>
            {newDate && shift !== 0 && (
              live ? (
                <>
                  <InlineAlert tone="info" title={`Every member waiting to join moves ${plural(Math.abs(shift), 'day')} ${shift > 0 ? 'later' : 'earlier'}`}>
                    Their open checklist tasks move with them. Done tasks keep their dates.
                  </InlineAlert>
                  <FormField id="bt-move-why" label="Why the day moves" required>
                    <TextField value={reason} onChange={setReason} maxLength={300} />
                  </FormField>
                </>
              ) : (
                <>
                  <InlineAlert tone="info" title={`${plural(moved, 'open task')} per member ${moved === 1 ? 'moves' : 'move'} ${plural(Math.abs(shift), 'day')} ${shift > 0 ? 'later' : 'earlier'}`}>
                    Done tasks keep their dates. Draft compensation, assignment start and probation dates move too. Engagement touchpoints re-anchor to {formatDate(newDate)}.
                  </InlineAlert>
                  <Checkbox checked={notify} onChange={setNotify} label={`Email the ${target.members} members their new date`} />
                </>
              )
            )}
          </div>
        )}
      </Dialog>
      {live && (
        <Drawer open={!!opened} onOpenChange={(o) => !o && setOpenId(null)} title={opened?.name ?? ''} subtitle={opened ? `Joins ${formatDate(opened.joining)} · ${opened.entity}` : undefined} footer={<Button onClick={() => setOpenId(null)}>Close</Button>}>
          {opened && (
            (live.members[opened.id] ?? []).length ? (
              <ul className="yx-ppl__checklist" aria-label={`Members of ${opened.name}`}>
                {live.members[opened.id].map((m) => (
                  <li key={m.id} className="yx-ppl__check-row">
                    <div className="yx-ppl__check-main">
                      <span className="yx-ppl__check-title">{m.name}</span>
                      <Text size="sm" tone="secondary">
                        {m.status === 'joined' ? 'Joined' : 'Joins'} {formatDate(m.joiningOn)}
                      </Text>
                    </div>
                    <StatusBadge status={m.status === 'joined' ? 'Done' : 'Scheduled'} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title="No one in this batch yet" description={live.onAddMembers ? 'Add joiners from the batch menu.' : undefined} />
            )
          )}
        </Drawer>
      )}
      {live?.children}
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
type PreboardOutcome = 'did_not_join' | 'reneged' | 'withdrawn';
const OUTCOME: Record<Exclude<PreboardAction, 'postpone'>, PreboardOutcome> = { 'did-not-join': 'did_not_join', reneged: 'reneged', withdraw: 'withdrawn' };

/** One checklist task as the postpone preview shows it. */
export interface PreboardTask {
  id: string;
  title: string;
  dueOn: Date;
  done: boolean;
}

/** The live journey record's Change status (PPL-15): HR moves the joining day or unwinds pre-boarding. */
export interface LivePreboardAction {
  joiningOn: Date;
  today: Date;
  tasks: PreboardTask[];
  /** The joiner came from an accepted offer in Hiring. */
  fromOffer: boolean;
  /** A rehire: the first name and the old employee code the unwind leaves alone. */
  rehire: { first: string; code: string } | null;
  onPostpone: (joiningOn: string) => Promise<unknown>;
  onCancel: (outcome: PreboardOutcome, reason: string) => Promise<unknown>;
}

const PREBOARD_LABEL: Record<PreboardAction, string> = { postpone: 'Postpone joining', 'did-not-join': 'Mark did not join', reneged: 'Record reneged', withdraw: 'Withdraw offer' };

/** The Change status drawer; the sample (story) and the live journey record share it. */
function PreboardingActionDrawer({ who, join, tasks, initial, initialDate, initialReason = '', reasonError = false, rehire, open, onClose, live }: { who: string; join: Date; tasks: PreboardTask[]; initial: PreboardAction; initialDate: Date | null; initialReason?: string; reasonError?: boolean; rehire: { first: string; code: string } | null; open: boolean; onClose: () => void; live?: LivePreboardAction }) {
  const [action, setAction] = useState<PreboardAction>(initial);
  const [date, setDate] = useState<Date | null>(initialDate);
  const [reason, setReason] = useState(initialReason);
  const [tried, setTried] = useState(reasonError);
  const { busy, error, run } = useRun();
  const unwind = action !== 'postpone';
  const shift = date ? daysBetween(join, date) : 0;
  const reasonMissing = action === 'withdraw' && !reason.trim();
  const earliest = live && live.today > join ? live.today : addDays(join, 1);
  const submit = async () => {
    setTried(true);
    if (!live || (action === 'postpone' ? !date : reasonMissing)) return;
    const ok = await run('go', () => (action === 'postpone' ? live.onPostpone(dayKeyOf(date!)) : live.onCancel(OUTCOME[action], reason.trim())));
    if (ok) onClose();
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Change pre-boarding for ${who}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={unwind ? 'danger' : 'primary'} loading={busy === 'go'} onClick={() => void submit()}>
            {PREBOARD_LABEL[action]}
          </Button>
        </>
      }
    >
      <div className="yx-ppl__stack">
        {error && (
          <InlineAlert tone="danger" title="That didn't work">
            {error}
          </InlineAlert>
        )}
        <FormField label="What happened" required>
          <RadioGroup
            value={action}
            onChange={(v) => setAction(v as PreboardAction)}
            options={[
              { value: 'postpone', label: 'Postpone joining', description: 'The candidate or company moved the date. Nothing is cancelled.' },
              { value: 'did-not-join', label: 'Did not join', description: 'On or after the joining date, the person did not turn up.' },
              { value: 'reneged', label: 'Reneged', description: 'The candidate declined after accepting.' },
              { value: 'withdraw', label: 'Withdraw offer', description: live ? 'The company withdraws. A reason is required.' : 'The company withdraws. A reason and a withdrawal letter are required.' },
            ]}
          />
        </FormField>
        {action === 'postpone' && (
          <>
            <FormField label="New joining date" required error={tried && !date ? 'Pick the new joining date.' : null}>
              <DatePicker value={date} onChange={setDate} min={earliest} />
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
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td>{t.title}</td>
                      <td>{formatDate(t.dueOn)}</td>
                      <td data-changed={(!t.done && Boolean(date)) || undefined}>{t.done ? 'Done' : date ? formatDate(addDays(t.dueOn, shift)) : '—'}</td>
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
              {live
                ? `The checklist, desk requests, background checks, unsigned letters and the pre-boarding login are cancelled (kept, not deleted).${live.fromOffer ? ` The candidate's offer is marked ${action === 'withdraw' ? 'withdrawn' : 'reneged'} in Hiring.` : ''}`
                : `The employee, employment, draft compensation and pre-boarding login are cancelled (kept, not deleted). The headcount-plan slot is released and requisition REQ-2026-0288 reopens. The candidate is marked ${action === 'withdraw' ? 'withdrawn' : 'reneged'} in Hiring.`}
            </InlineAlert>
            <FormField label="Reason" required={action === 'withdraw'} optional={action !== 'withdraw'} error={tried && reasonMissing ? (live ? 'Enter a reason. It is kept on the record and the audit log.' : 'Enter a reason. It goes on the withdrawal letter and the audit log.') : null}>
              <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} />
            </FormField>
            {action === 'withdraw' && <Text size="sm" tone="secondary" as="p">{live ? 'BGV discrepancies never withdraw an offer automatically.' : 'A withdrawal letter (starter template) is created for your review. BGV discrepancies never withdraw an offer automatically.'}</Text>}
          </>
        )}
        {rehire && (
          <InlineAlert tone="info" title="Rehire: what the unwind reverses">
            {live ? `${rehire.first}'s old employment, code ${rehire.code} and UAN stay as they were; the rehire options you chose are discarded.` : `The new employment on ${rehire.first}'s existing record is cancelled. His old employment, code ${rehire.code} and UAN stay as they were; the rehire options you chose are discarded.`}
          </InlineAlert>
        )}
      </div>
    </Drawer>
  );
}

// PPL-15
export function PreboardingActionSheet({ action, rehire = false, reasonError = false }: { action: PreboardAction; rehire?: boolean; reasonError?: boolean }) {
  const [open, setOpen] = useState(true);
  const who = rehire ? 'Suresh Nair' : 'Kavya Reddy';
  const join = rehire ? new Date(2026, 9, 12) : KAVYA_JOIN;
  const tasks = ONBOARDING_TASKS.slice(0, 6).map((t) => ({ id: t.id, title: t.title, dueOn: taskDue(join, t), done: t.status === 'done' }));
  return (
    <PeopleFrame active="Onboarding board">
      <ObjectHeader name={`${who} · pre-boarding`} person secondary={`${rehire ? 'Maintenance Technician (rehire)' : 'Quality Inspector'} · joins ${formatDate(join)}`} status={<Badge tone="info">Pre-boarding</Badge>} actions={<Button onClick={() => setOpen(true)}>Change status</Button>} />
      <PreboardingActionDrawer
        who={who}
        join={join}
        tasks={tasks}
        initial={action}
        initialDate={new Date(2026, 9, 19)}
        initialReason={!reasonError && action === 'reneged' ? 'Accepted a counter-offer from the current employer.' : ''}
        reasonError={reasonError}
        rehire={rehire ? { first: 'Suresh', code: 'KF-0077' } : null}
        open={open}
        onClose={() => setOpen(false)}
      />
    </PeopleFrame>
  );
}

/* ================================================================== PPL-16 probation queue */

type Prob = (typeof PROBATIONS)[number];
type ProbState = 'running' | 'review due' | 'overdue' | 'escalated' | 'waiting';

/** A queue row: the sample, or a live probation with where it stands and what the viewer may do. */
export type ProbRow = Prob & { live?: { stage: ProbState; reviewDueOn: Date; canReview: boolean; maxMonthsLeft: number } };

/** What the decision form holds (live: sent to the server). */
export interface ProbationDraft {
  comments: string;
  improve: string;
  rating: string | null;
  from: Date | null;
}

/** The live app's queue (design audit step 3). Managers review their direct reports; HR confirms or extends. */
export interface LiveProbation {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  /** employee.change.manage: confirm (a change someone else approves) or extend. */
  canDecide: boolean;
  onReview: (id: string, outcome: ProbationOutcome, months: number | null, draft: ProbationDraft) => Promise<void>;
  /** A confirmation waiting for approval opens the change list. */
  onOpenApproval: () => void;
}

const EMPTY_DRAFT: ProbationDraft = { comments: '', improve: '', rating: null, from: null };

// PPL-16
export function ProbationQueue({ rows, today, persona = 'hr', defaultOpenId, live }: { rows: ProbRow[]; today: Date; persona?: Persona; defaultOpenId?: string; live?: LiveProbation }) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const [outcome, setOutcome] = useState<ProbationOutcome>('confirm');
  const [months, setMonths] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProbationDraft>(EMPTY_DRAFT);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const narrow = useNarrow();
  const mgr = persona === 'mgr';
  const withState = rows.map((r) => ({ ...r, state: (r.live?.stage ?? probationState(r.end, today, 15, r.reviewDone)) as ProbState }));
  type Row = (typeof withState)[number];
  const open = withState.find((r) => r.id === openId);
  const first = open?.name.split(' ')[0] ?? '';
  const stateText = (r: Row) => (r.state === 'running' ? 'Not due' : r.state === 'review due' ? 'Review due' : r.state === 'overdue' ? 'Overdue' : r.state === 'waiting' ? 'Waiting for approval' : 'With HR');
  const cols: TableColumn<Row>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.role }), width: 215 },
    ...(mgr ? [] : [{ key: 'manager', header: 'Manager', value: (r: Row) => r.manager, width: 187, optional: true } as TableColumn<Row>]),
    { key: 'end', header: 'Ends', type: 'date', value: (r) => r.end, render: (r) => <EndsCell row={r} today={today} />, width: 165 },
    {
      key: 'state',
      header: 'Review',
      type: 'status',
      value: stateText,
      statusTone: (v) => (v === 'Not due' || v === 'Waiting for approval' ? 'neutral' : v === 'Review due' ? 'warning' : 'danger'),
      width: 133,
    },
  ];
  const openRow = (r: Row) => {
    setOutcome('confirm');
    setMonths(null);
    setDraft({ ...EMPTY_DRAFT, from: addDays(r.end, 1) });
    setTried(false);
    setFailed(null);
    setOpenId(r.id);
  };
  // Live: the manager reviews their direct reports; HR decides any open probation. "Remind manager" has no live action yet.
  const mayAct = (r: Row) => (live ? (mgr ? Boolean(r.live?.canReview) : live.canDecide || Boolean(r.live?.canReview)) : true);
  const action = (r: Row) => {
    if (live) {
      if (r.state === 'waiting') return <Button size="sm" variant="review" onClick={live.onOpenApproval}>Review</Button>;
      if (mgr && r.state === 'escalated') return <Text size="sm" tone="secondary">HR decides</Text>;
      if (!mayAct(r)) return null;
      return <Button size="sm" variant="review" onClick={() => openRow(r)}>{r.live?.canReview ? 'Review' : 'Decide'}</Button>;
    }
    if (r.state === 'running') return null;
    if (mgr) return <Button size="sm" variant="review" onClick={() => openRow(r)}>Review</Button>;
    if (r.state === 'escalated') return <Button size="sm" variant="review" onClick={() => openRow(r)}>Decide</Button>;
    return <Button size="sm">Remind manager</Button>;
  };
  const escalated = withState.filter((r) => r.state === 'escalated');
  const empty = <EmptyState title="No one is on probation" description="New joiners appear here with their probation end date." />;
  const sorted = [...withState].sort((a, b) => a.end.getTime() - b.end.getTime());
  // PPL-16: HR decides with the same review as the manager (confirm, extend or recommend ending, rating, comments);
  // the API takes HR's review on everyone its job-change grant reaches.
  const outcomes: ProbationOutcome[] = ['confirm', 'extend', 'terminate'];
  const problem =
    !live || !open
      ? null
      : outcome === 'extend' && (!months || months < 1 || months > (open.live?.maxMonthsLeft ?? 0))
        ? 'months'
        : draft.comments.trim().length < 3
            ? 'comments'
            : null;
  const submit = async () => {
    if (!live || !open) return;
    setTried(true);
    if (problem) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onReview(open.id, outcome, outcome === 'extend' ? months : null, draft);
      setOpenId(null);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <PeopleFrame active="Probation" persona={persona}>
      <PageHeader title="Probation reviews" description="Managers get the review 15 days before probation ends. Nothing confirms on its own; a missed review goes to HR on the end date." />
      {!mgr && escalated.length > 0 && (
        <InlineAlert
          tone="danger"
          title={`${plural(escalated.length, 'review')} went to HR`}
          actions={escalated.length === 1 && mayAct(escalated[0]) ? <Button size="sm" variant="review" onClick={() => openRow(escalated[0])}>Decide</Button> : undefined}
        >
          {escalated.length === 1
            ? `${escalated[0].name}'s probation ended on ${formatDate(escalated[0].end)} without a review. Confirm, extend or end it now.`
            : `${escalated.map((r) => r.name).join(', ')} passed their end date without a review. Confirm, extend or end each one now.`}
        </InlineAlert>
      )}
      {live?.state === 'no-access' ? (
        <NoAccessState what="probations" grantedBy="your HR admin" />
      ) : live?.state === 'error' ? (
        <ErrorState title="We couldn't load probations" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : live?.state === 'loading' ? (
        <ListSkeleton label="Loading probations" />
      ) : narrow ? (
        rows.length === 0 ? (
          empty
        ) : (
          <ul className="yx-ppl__cards" aria-label="Probation reviews">
            {sorted.map((r) => (
              <li key={r.id} className="yx-ppl__rcard">
                <span className="yx-ppl__rcard-name">{r.name}</span>
                <span className="yx-ppl__sub">{mgr || !r.manager ? r.role : `${r.role} · manager ${r.manager}`}</span>
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
          onRowClick={(r) => (live && r.state === 'waiting' ? live.onOpenApproval() : openRow(r))}
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
        subtitle={open ? `${open.role ? `${open.role} · ` : ''}probation ${formatDate(open.start)} to ${formatDate(open.end)}` : undefined}
        footer={
          open && (live ? !mayAct(open) : open.state === 'running') ? (
            <Button onClick={() => setOpenId(null)}>Close</Button>
          ) : live ? (
            <>
              <Button onClick={() => setOpenId(null)}>Cancel</Button>
              <Button variant={outcome === 'terminate' ? 'danger' : 'primary'} loading={busy} onClick={() => void submit()}>
                {outcome === 'confirm' ? `Confirm ${first}` : outcome === 'extend' ? 'Extend probation' : 'Send to HR'}
              </Button>
            </>
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
            {failed && <InlineAlert tone="danger" title={failed} />}
            {open.state === 'escalated' && (
              <InlineAlert tone="danger">
                Probation ended on {formatDate(open.end)} and {open.manager || 'the manager'} didn&apos;t review it, so HR decides.{open.manager ? ` ${open.manager} is told the outcome.` : ''}
              </InlineAlert>
            )}
            {(live ? !mayAct(open) : open.state === 'running') ? (
              <InlineAlert tone="info">
                The review opens on {formatDate(open.live?.reviewDueOn ?? addDays(open.end, -15))}. {open.manager || 'The manager'} gets the form then.
              </InlineAlert>
            ) : (
              <ProbationFields
                outcome={outcome}
                setOutcome={setOutcome}
                months={months}
                setMonths={setMonths}
                first={first}
                end={open.end}
                extended={open.extended}
                {...(live
                  ? {
                      outcomes,
                      draft,
                      setDraft,
                      maxMonths: open.live?.maxMonthsLeft ?? 0,
                      errors: tried ? problem : null,
                    }
                  : {})}
              />
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

const OUTCOME_TEXT: Record<ProbationOutcome, { label: string; description: (first: string, live: boolean, confirmFrom: boolean) => string }> = {
  confirm: { label: 'Confirm', description: (_f, live, hr) => (live ? (hr ? 'Sends the confirmation for approval by someone else. They stay on probation until it is approved.' : 'HR approves the confirmation; until then they stay on probation.') : 'Sends a confirmation letter. Notice becomes 60 days and earned leave starts.') },
  extend: { label: 'Extend', description: () => 'Up to 12 months of probation in total (company policy).' },
  terminate: { label: 'Recommend ending employment', description: (first) => `HR reviews it and decides. Nothing is shared with ${first} until then.` },
};

function ProbationFields({
  outcome,
  setOutcome,
  months,
  setMonths,
  first,
  end,
  extended = 0,
  comment,
  outcomes = ['confirm', 'extend', 'terminate'],
  draft,
  setDraft,
  maxMonths,
  confirmFrom = false,
  errors = null,
}: {
  outcome: ProbationOutcome;
  setOutcome: (o: ProbationOutcome) => void;
  months: number | null;
  setMonths: (m: number | null) => void;
  first: string;
  end: Date;
  extended?: number;
  comment?: string;
  /** Live: the outcomes the viewer may choose, the controlled form, the months left and who decides. */
  outcomes?: ProbationOutcome[];
  draft?: ProbationDraft;
  setDraft?: (d: ProbationDraft) => void;
  maxMonths?: number;
  confirmFrom?: boolean;
  errors?: 'months' | 'from' | 'comments' | null;
}) {
  const [rating, setRating] = useState<string | null>(null);
  const [raised, setRaised] = useState<string | null>(null);
  const [raisedOn, setRaisedOn] = useState<Date | null>(null);
  const live = Boolean(draft && setDraft);
  const set = (patch: Partial<ProbationDraft>) => draft && setDraft?.({ ...draft, ...patch });
  const ok = live ? errors !== 'months' : outcome !== 'extend' || !months || extensionAllowed(6, extended, months, 12);
  return (
    <div className="yx-ppl__form">
      <FormField label="Outcome" required>
        <RadioGroup
          value={outcome}
          onChange={(v) => setOutcome(v as ProbationOutcome)}
          options={outcomes.map((o) => ({ value: o, label: OUTCOME_TEXT[o].label, description: o === 'extend' && live ? `Up to ${plural(maxMonths ?? 0, 'more month')} (company policy).` : OUTCOME_TEXT[o].description(first, live, confirmFrom) }))}
        />
      </FormField>
      {outcome === 'confirm' && confirmFrom && (
        <FormField label="Confirmed from" required helper="Usually the day after the probation ends." error={errors === 'from' ? 'Choose the day the confirmation starts.' : null}>
          <DatePicker value={draft?.from ?? null} onChange={(v) => set({ from: v })} />
        </FormField>
      )}
      {outcome === 'extend' && (
        <>
          <FormField
            label="Extend by (months)"
            required
            error={ok ? null : live ? `Extend by 1 to ${maxMonths} ${maxMonths === 1 ? 'month' : 'months'}. Probation has a company maximum in total.` : 'Extend by 1 to 6 months. Probation can be 12 months at most in total.'}
            helper={ok && months ? `New end date: ${formatDate(addMonths(end, months))}` : undefined}
          >
            <NumberField value={months} onChange={setMonths} />
          </FormField>
          <FormField label="What needs to improve" required={!live} optional={live} helper={`${first} sees this, so they know what to work on.`}>
            {live ? <TextArea rows={3} value={draft!.improve} onChange={(v) => set({ improve: v })} maxLength={1000} /> : <TextArea rows={3} />}
          </FormField>
        </>
      )}
      {outcome === 'terminate' && (
        <>
          <FormField label={`Did you raise these concerns with ${first} earlier?`} required={!live} optional={live}>
            <RadioGroup value={raised ?? undefined} onChange={setRaised} orientation="horizontal" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          </FormField>
          {raised === 'yes' && (
            <FormField label="When" required={!live} optional={live}>
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
      {!confirmFrom && (
        <FormField label="Rating" optional>
          <Select options={['Exceeds', 'Meets', 'Below'].map((x) => ({ value: x, label: x }))} value={live ? draft!.rating : rating} onChange={live ? (v) => set({ rating: v }) : setRating} placeholder="Choose a rating" />
        </FormField>
      )}
      <FormField label={confirmFrom ? 'Reason' : 'Comments'} required helper={confirmFrom ? 'Kept on the record.' : `Shared with HR. ${first} sees the outcome and the letter.`} error={errors === 'comments' ? (confirmFrom ? 'Enter the reason.' : 'Enter your comments.') : null}>
        {live ? <TextArea rows={3} value={draft!.comments} onChange={(v) => set({ comments: v })} maxLength={2000} /> : <TextArea rows={3} defaultValue={comment} />}
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

/** The live app's buddy pool (PPL-41): the API names joiners only where the onboarding keys reach. */
export interface LiveBuddies {
  state: 'loading' | 'ready' | 'error' | 'no-access';
  onRetry: () => void;
  today: Date;
  data: {
    pool: LiveBuddy[];
    needs: LiveBuddyJoiner[];
    checkins: { id: string; title: string; pair: string; due: string; status: 'Done' | 'Overdue' | 'Pending' }[];
  } | null;
  /** Current employees who can join the pool. */
  people: { id: string; name: string; role?: string }[];
  /** lifecycle.onboarding.manage: add, remove and assign (left out: the page is read-only). */
  onAdd?: (employeeId: string, cap: number) => Promise<void>;
  onRemove?: (employeeId: string) => Promise<void>;
  onAssign?: (joiner: LiveBuddyJoiner, employeeId: string) => Promise<void>;
}
export interface LiveBuddy {
  employeeId: string;
  name: string;
  team: string;
  location: string;
  cap: number;
  /** Every joiner they look after now, named or not. */
  load: number;
  joiners: { name: string; joins: string }[];
  leavingOn: string | null;
}
export interface LiveBuddyJoiner {
  id: string;
  version: number;
  name: string;
  role: string;
  team: string;
  location: string;
  manager: string;
  managerEmployeeId: string | null;
  joins: string;
}

const CAPS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 1 ? '1 joiner' : `${n} joiners` }));

/** Add a colleague to the buddy pool, with how many joiners they look after at a time. */
export function AddToPoolDialog({ open, onOpenChange, people, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; people: { id: string; name: string; role?: string }[]; onAdd?: (employeeId: string, cap: number) => Promise<void> }) {
  const [who, setWho] = useState<string | null>(null);
  const [cap, setCap] = useState('2');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const close = () => {
    onOpenChange(false);
    setWho(null);
    setCap('2');
    setError(null);
  };
  const add = async () => {
    if (!who) return;
    setSaving(true);
    try {
      await onAdd?.(who, Number(cap));
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title="Add to the buddy pool"
      size="md"
      preventClose={saving}
      notice={error && <InlineAlert tone="danger">{error}</InlineAlert>}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!who} loading={saving} onClick={() => void add()}>
            Add to pool
          </Button>
        </>
      }
    >
      <div className="yx-ppl__form">
        <FormField label="Colleague" required helper="Choose someone from the joiner's team or location. A buddy is never the joiner's manager.">
          <PersonPicker people={people} value={who} onChange={setWho} />
        </FormField>
        <FormField label="Looks after at a time" required>
          <Select options={CAPS} value={cap} onChange={(v) => v && setCap(v)} />
        </FormField>
      </div>
    </Dialog>
  );
}

const isoDay = (iso: string) => new Date(`${iso}T00:00:00`);

function LiveBuddyPanel({ live }: { live: LiveBuddies }) {
  const d = live.data;
  const [forId, setForId] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const narrow = useNarrow();
  const pool = d?.pool ?? [];
  const needs = d?.needs ?? [];
  const joiner = needs.find((j) => j.id === forId);
  const joinText = (iso: string) => {
    const n = daysBetween(live.today, isoDay(iso));
    return n === 0 ? 'joins today' : n > 0 ? `joins ${formatDate(isoDay(iso))}` : `joined ${formatDate(isoDay(iso))}`;
  };
  const full = (b: LiveBuddy) => b.load >= b.cap;
  const free = (b: LiveBuddy, j: LiveBuddyJoiner) => !full(b) && !b.leavingOn && b.employeeId !== j.managerEmployeeId;
  // Suggest the least-loaded buddy from the joiner's team and location.
  const suggest = (j: LiveBuddyJoiner) =>
    [...pool].filter((b) => free(b, j)).sort((a, b) => Number(b.team === j.team && b.location === j.location) - Number(a.team === j.team && a.location === j.location) || a.load - b.load)[0]?.employeeId ?? null;
  const openFor = (j: LiveBuddyJoiner) => {
    setForId(j.id);
    setPick(suggest(j));
    setError(null);
  };
  const assign = async () => {
    if (!joiner || !pick) return;
    setSaving(true);
    try {
      await live.onAssign?.(joiner, pick);
      setForId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setSaving(false);
    }
  };
  const assignBtn = (j: LiveBuddyJoiner) =>
    live.onAssign ? (
      <Button size="sm" icon={UserPlus} onClick={() => openFor(j)}>
        Assign buddy
      </Button>
    ) : null;
  const load = (b: LiveBuddy) => <Meter value={b.load} max={b.cap} label={`${b.name} joiners`} valueText={`${b.load} of ${b.cap}`} warnAt={101} dangerAt={101} />;
  const who = (b: LiveBuddy) => (b.joiners.length ? b.joiners.map((j) => `${j.name} · ${joinText(j.joins)}`).join('; ') : b.load ? `${b.load} ${b.load === 1 ? 'joiner' : 'joiners'}` : 'No one yet');
  const status = (b: LiveBuddy) => (b.leavingOn ? 'Leaving' : full(b) ? 'Full' : 'Available');
  const place = (b: { team: string; location: string }) => [b.team, b.location].filter(Boolean).join(' · ');
  const leavingNote = (b: LiveBuddy) =>
    b.leavingOn ? (
      <Text size="sm" tone="danger">
        Leaving {formatDate(isoDay(b.leavingOn))}
        {b.joiners.length ? ` · reassign ${b.joiners.map((j) => j.name).join(' and ')}` : ''}
      </Text>
    ) : null;
  const cols: TableColumn<LiveBuddy>[] = [
    { key: 'name', header: 'Buddy', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: place(r) }), width: 220 },
    {
      key: 'joiners',
      header: 'Looking after',
      value: who,
      render: (r) => (
        <span className="yx-ppl__type">
          {r.joiners.length ? (
            r.joiners.map((j) => (
              <span key={`${j.name}${j.joins}`}>
                {j.name} · {joinText(j.joins)}
              </span>
            ))
          ) : (
            <span className="yx-ppl__sub">{who(r)}</span>
          )}
          {leavingNote(r)}
        </span>
      ),
      width: 260,
    },
    { key: 'load', header: 'Load', value: (r) => r.load, render: load, width: 150 },
    { key: 'status', header: 'Status', type: 'status', value: status, statusTone: (v) => (v === 'Leaving' ? 'warning' : v === 'Full' ? 'neutral' : 'success'), width: 110 },
  ];
  const checks = d?.checkins ?? [];
  const checkRow = (c: (typeof checks)[number]): ChecklistRow => ({ id: c.id, title: c.title, note: c.pair, due: isoDay(c.due), status: c.status });
  const openChecks = checks.filter((c) => c.status !== 'Done');
  const done = checks.filter((c) => c.status === 'Done');
  const addBtn = live.onAdd ? (
    <Button icon={Plus} onClick={() => setAdding(true)}>
      Add to pool
    </Button>
  ) : undefined;
  const emptyPool = <EmptyState title="No buddies in the pool" description="Add volunteers from each team and location." action={addBtn} />;
  const leaving = pool.find((b) => b.employeeId === removing);
  return (
    <PeopleFrame active="Buddies">
      <PageHeader title="Buddies" description="A buddy is a colleague from the same team or location, never the joiner's manager. Each buddy looks after a set number of joiners at a time." actions={addBtn} />
      {live.state === 'no-access' ? (
        <NoAccessState what="the buddy pool" grantedBy="your HR admin" />
      ) : live.state === 'error' ? (
        <ErrorState title="We couldn't load the buddy pool" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : !d ? (
        <ListSkeleton label="Loading the buddy pool" />
      ) : (
        <>
          {needs.length > 0 && (
            <Card title={`Needs a buddy (${needs.length})`}>
              {narrow ? (
                <ul className="yx-ppl__cards" aria-label="Joiners without a buddy">
                  {needs.map((j) => (
                    <li key={j.id} className="yx-ppl__rcard">
                      <span className="yx-ppl__rcard-name">{j.name}</span>
                      <span className="yx-ppl__sub">{[j.role, j.location].filter(Boolean).join(' · ')}</span>
                      <JoinsCell date={isoDay(j.joins)} today={live.today} />
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
                            {[j.role, j.location].filter(Boolean).join(' · ')}
                          </Text>
                        </span>
                      </div>
                      <div className="yx-ppl__check-side">
                        <JoinsCell date={isoDay(j.joins)} today={live.today} />
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
                    <li key={b.employeeId} className="yx-ppl__rcard">
                      <span className="yx-ppl__rcard-name">{b.name}</span>
                      <span className="yx-ppl__sub">{place(b)}</span>
                      <span>{who(b)}</span>
                      {leavingNote(b)}
                      {load(b)}
                      <StatusBadge status={status(b)} />
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <DataTable
                label="Buddy pool"
                columns={cols}
                rows={pool}
                getRowId={(r) => r.employeeId}
                empty={emptyPool}
                rowActions={live.onRemove ? (r) => <MenuItem onSelect={() => setRemoving(r.employeeId)}>Remove {r.name} from the pool</MenuItem> : undefined}
              />
            )}
            {checks.length > 0 && (
              <Card title="Check-ins">
                <StatusChecklist label="Upcoming buddy check-ins" rows={openChecks.map(checkRow)} today={live.today} />
                {done.length > 0 && (
                  <details className="yx-ppl__done-fold">
                    <summary>Done ({done.length})</summary>
                    <StatusChecklist label="Done buddy check-ins" rows={done.map(checkRow)} />
                  </details>
                )}
              </Card>
            )}
          </div>
        </>
      )}
      <Drawer
        open={!!joiner}
        onOpenChange={(o) => !o && !saving && setForId(null)}
        title={`Assign a buddy to ${joiner?.name ?? ''}`}
        notice={error && <InlineAlert tone="danger">{error}</InlineAlert>}
        footer={
          <>
            <Button onClick={() => setForId(null)}>Cancel</Button>
            <Button variant="primary" disabled={!pick} loading={saving} onClick={() => void assign()}>
              Assign buddy
            </Button>
          </>
        }
      >
        {joiner && (
          <div className="yx-ppl__stack yx-ppl__drawer-body">
            <dl className="yx-ppl__dl">
              <div className="yx-ppl__dl-row"><dt>Role</dt><dd>{joiner.role || '—'}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Team</dt><dd>{joiner.team || '—'}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Location</dt><dd>{joiner.location || '—'}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Joins</dt><dd>{formatDate(isoDay(joiner.joins))}</dd></div>
              <div className="yx-ppl__dl-row"><dt>Manager</dt><dd>{joiner.manager || '—'}</dd></div>
            </dl>
            <FormField label="Buddy" required helper={`Suggested from ${joiner.team || 'the same team'} at ${joiner.location || 'the same location'}.${joiner.manager ? ` ${joiner.manager} is the manager, so isn't listed.` : ''}`}>
              <PersonPicker
                people={pool
                  .filter((b) => b.employeeId !== joiner.managerEmployeeId)
                  .map((b) => ({ id: b.employeeId, name: b.name, role: b.team, department: b.location, note: b.leavingOn ? 'leaving' : `${b.load} of ${b.cap}${full(b) ? ', full' : ''}`, disabled: full(b) || !!b.leavingOn }))}
                value={pick}
                onChange={setPick}
              />
            </FormField>
            <InlineAlert tone="info">The buddy gets the buddy tasks on the joiner&apos;s checklist, with reminders.</InlineAlert>
          </div>
        )}
      </Drawer>
      <AddToPoolDialog open={adding} onOpenChange={setAdding} people={live.people.filter((p) => !pool.some((b) => b.employeeId === p.id))} onAdd={live.onAdd} />
      <ConfirmDialog
        open={!!leaving}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${leaving?.name ?? ''} from the buddy pool?`}
        consequence={`${leaving?.name ?? ''} keeps the joiners they look after now, and is not suggested for new joiners.`}
        confirmLabel="Remove from pool"
        onConfirm={async () => {
          if (leaving) await live.onRemove?.(leaving.employeeId);
          setRemoving(null);
        }}
      />
    </PeopleFrame>
  );
}

// PPL-41
export function BuddyPanel(props: { pool: Buddy[]; needs?: Joiner[]; assignFor?: string; live?: LiveBuddies }) {
  return props.live ? <LiveBuddyPanel live={props.live} /> : <SampleBuddyPanel {...props} />;
}

function SampleBuddyPanel({ pool, needs = NEEDS_BUDDY, assignFor }: { pool: Buddy[]; needs?: Joiner[]; assignFor?: string }) {
  const [adding, setAdding] = useState(false);
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
  const emptyPool = <EmptyState title="No buddies in the pool" description="Add volunteers from each team and location." action={<Button icon={Plus} onClick={() => setAdding(true)}>Add to pool</Button>} />;
  return (
    <PeopleFrame active="Buddies">
      <PageHeader
        title="Buddies"
        description="A buddy is a colleague from the same team or location, never the joiner's manager. Each buddy looks after at most 2 joiners at a time."
        actions={<Button icon={Plus} onClick={() => setAdding(true)}>Add to pool</Button>}
      />
      <AddToPoolDialog open={adding} onOpenChange={setAdding} people={[{ id: 'p1', name: 'Selvi Perumal', role: 'Quality' }, { id: 'p2', name: 'Ramesh Gowda', role: 'Operations' }]} onAdd={async () => {}} />
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
