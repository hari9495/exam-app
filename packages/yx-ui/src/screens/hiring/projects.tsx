// Projects › Projects list + workspace, timesheet approvals, capacity & utilisation, costing & margin.
// PRJ-01, PRJ-02, PRJ-03, PRJ-04 (M12 §7, YX-PRJ-01…14).
import { useState, type ReactNode } from 'react';
import { CheckCheck, FolderKanban, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Meter, NoAccessState, Skeleton } from '../../components/feedback';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { ConfirmDialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { MenuItem } from '../../components/menu';
import { TimesheetApprovalCard } from '../../components/notify';
import { TimesheetWeekDrill } from '../../components/timesheet';
import { BarChart, CapacityHeatmap, Gauge, type CapacityPerson } from '../../components/charts';
import { Timeline, type TimelineItem } from '../../components/timeline';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { useToast } from '../../components/notify';
import { AllocationDrawer, MilestoneDrawer, ProjectDrawer, TaskAssigneesDrawer, TaskDrawer } from './projects-drawers';
import { KanbanBoard } from '../../components/kanban';
import { toAllocation, toMilestone, toProject, toTask, type AllocationInput, type LiveLoad, type LiveProjectDetail, type LiveProjectRow, type MilestoneInput, type ProjectChoices, type ProjectInput, type ProjectStatus, type TaskInput } from './projects-live';
import { PhoneFrame } from '../_kit/frames';
import { bulkEligible, burnState, costVisible, marginPct, milestoneSummary, suppressGroup, tmBilling, utilisation, type Milestone, type RateCardEntry, type WipLine } from './projects-logic';
import { BudgetBars, ProjectsFrame, RecordLayout, SummaryTiles, useListControls } from './hiring-kit';
import type { Allocation, ApprovalGroup, Project, Task } from './projects-data';
import './hiring.css';

type ListState = 'ready' | 'loading' | 'error';
export type PrjPersona = 'pm' | 'finance' | 'hr';
const STATUS_TONE: Record<Project['status'], BadgeTone> = { Draft: 'neutral', Active: 'success', 'On hold': 'warning', Closed: 'neutral' };

/** Projects switched off for the company, shown only to people who would otherwise open the page (answer 1401). */
export function ProjectsOffState() {
  return <EmptyState title="Projects is switched off" description="Your company has not switched Projects on yet. A System Admin switches it on in Settings › Projects & timesheets." />;
}

/* ================================================================== PRJ-01 · Projects list */

/** Projects P-1 (answers 1401 to 1404, 1412, 1420): the live projects API behind PRJ-01's list. */
export interface LiveProjectsList {
  state: LiveLoad;
  onRetry?: () => void;
  rows: LiveProjectRow[];
  /** projects.manage creates; Projects finance sees and sets fee and cost (1412). */
  can: { create: boolean; finance: boolean };
  choices: ProjectChoices | null;
  onOpen: (id: string) => void;
  onCreate: (input: ProjectInput) => Promise<string>;
  /** Story: the new-project drawer open. */
  defaultNew?: boolean;
}

// PRJ-01
export function ProjectsListScreen({ rows: drawnRows = [], persona: drawnPersona = 'pm', me = 'Karthik Subramanian', state = 'ready', live }: { rows?: Project[]; persona?: PrjPersona; me?: string; state?: ListState; live?: LiveProjectsList }) {
  const [creating, setCreating] = useState(!!live?.defaultNew);
  const { toast } = useToast();
  // Live: everyone sees all projects (a manager without a key gets only theirs from the API); fee only for finance.
  const persona: PrjPersona = live ? (live.can.finance ? 'finance' : 'hr') : drawnPersona;
  const rows = live ? live.rows.map(toProject) : drawnRows;
  const marginOf = (id: string) => live?.rows.find((x) => x.id === id)?.margin ?? null;
  const base = !live && persona === 'pm' ? rows.filter((r) => r.pm === me) : rows;
  const list = useListControls({
    rows: base,
    fields: [
      { key: 'status', label: 'Status', type: 'multi', options: ['Draft', 'Active', 'On hold', 'Closed'].map((v) => ({ value: v, label: v })) },
      { key: 'model', label: 'Billing model', type: 'multi', options: ['Time & material', 'Fixed fee', 'Retainer', 'Non-billable'].map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.code} ${r.name} ${r.client ?? 'internal'}`,
    fieldValue: (r, k) => (k === 'status' ? r.status : r.model),
    views: [
      { id: 'active', name: persona === 'pm' ? 'My active projects' : 'Active projects' },
      { id: 'burn', name: 'Burn above 80%', shared: true },
    ],
    searchPlaceholder: 'Search projects or clients',
  });
  const cols: TableColumn<Project>[] = [
    { key: 'code', header: 'Code', type: 'id', value: (r) => r.code, width: 150, render: (r) => <span className="yx-hire-clip" title={r.code}>{r.code}</span> },
    {
      key: 'name',
      header: 'Project',
      value: (r) => r.name,
      width: 340,
      render: (r) =>
        live ? (
          <span className="yx-hire-clip2">
            <span title={r.name}>{r.name}</span>
            <span title={r.client ?? 'Internal'}>
              <Text as="span" size="sm" tone="secondary">
                {r.client ?? 'Internal'}
              </Text>
            </span>
          </span>
        ) : (
          <PersonLabel name={r.name} secondary={r.client ?? 'Internal'} />
        ),
    },
    { key: 'model', header: 'Billing', value: (r) => r.model, groupable: true, optional: Boolean(live) },
    { key: 'pm', header: 'Project manager', type: 'person', value: (r) => r.pm, person: (r) => ({ name: r.pm }), optional: Boolean(live) },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => STATUS_TONE[v as Project['status']], width: live ? 120 : undefined },
    {
      key: 'burn',
      header: 'Hours burn',
      value: (r) => burnState(r.usedHours, r.budgetHours).pct,
      width: 180,
      render: (r) => (r.budgetHours ? <Meter value={r.usedHours} max={r.budgetHours} label={`${r.code} hours used`} valueText={`${burnState(r.usedHours, r.budgetHours).pct}%`} /> : <Text tone="muted">No budget</Text>),
    },
    ...(persona !== 'hr' && !live
      ? [
          {
            key: 'fee',
            header: 'Fee billed',
            value: (r: Project) => (r.fee ? burnState(r.billed, r.fee).pct : 0),
            width: 160,
            render: (r: Project) => (r.fee ? <Meter value={r.billed} max={r.fee} label={`${r.code} fee billed`} warnAt={101} dangerAt={200} valueText={formatINR(r.billed)} /> : <Text tone="muted">—</Text>),
          } as TableColumn<Project>,
        ]
      : []),
    ...(live && persona === 'finance' ? [{ key: 'feeLive', header: 'Fee', type: 'money', value: (r: Project) => r.fee } as TableColumn<Project>] : []),
    // P-6 (FinanceList): fee billed and margin from the stored project totals, Projects finance only.
    ...(live && persona === 'finance'
      ? [
          { key: 'fee', header: 'Fee billed', value: (r: Project) => (r.fee ? burnState(r.billed, r.fee).pct : 0), width: 160, optional: true, render: (r: Project) => (r.fee ? <Meter value={r.billed} max={r.fee} label={`${r.code} fee billed`} warnAt={101} dangerAt={200} valueText={formatINR(r.billed)} /> : r.billed ? formatINR(r.billed) : <Text tone="muted">—</Text>) } as TableColumn<Project>,
          { key: 'margin', header: 'Margin', type: 'number', value: (r: Project) => marginOf(r.id), render: (r: Project) => (marginOf(r.id) == null ? '—' : `${marginOf(r.id)}%`) } as TableColumn<Project>,
        ]
      : []),
    ...(live ? [{ key: 'people', header: 'People', type: 'number', value: (r: Project) => r.people, width: 104 } as TableColumn<Project>] : [{ key: 'util', header: 'Utilisation', type: 'number', value: (r: Project) => r.utilisation, render: (r: Project) => (r.utilisation ? `${r.utilisation}%` : '—') } as TableColumn<Project>]),
    ...(persona === 'finance' && !live ? [{ key: 'margin', header: 'Margin', type: 'number', value: (r: Project) => marginPct(r.billed + r.wip, r.cost), render: (r: Project) => (r.fee ? `${marginPct(r.billed + r.wip, r.cost)}%` : '—') } as TableColumn<Project>] : []),
  ];
  const canCreate = live ? live.can.create : persona !== 'hr';
  const newButton = canCreate ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New project</Button> : undefined;
  // Walk 12 Nov (answers 946, 972): the kit's no-access page (Request access), never naming a key.
  if (live?.state === 'no-access' || live?.state === 'off')
    return <ProjectsFrame active="Projects">{live.state === 'off' ? <ProjectsOffState /> : <NoAccessState what="Projects" grantedBy="your System Admin" />}</ProjectsFrame>;
  return (
    <ProjectsFrame active="Projects">
      <PageHeader title="Projects" description="Client and internal projects with budgets in hours, cost and fee. Burn alerts at 80% and 100%." actions={newButton} />
      <DataTable
        label="Projects"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={live ? (live.state === 'error' ? 'error' : live.state === 'loading' ? 'loading' : 'ready') : state}
        onRetry={live?.onRetry ?? (() => {})}
        errorReference="PRJ-1102"
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        onRowClick={(r) => live?.onOpen(r.id)}
        rowActions={(r) =>
          live ? (
            <MenuItem onSelect={() => live.onOpen(r.id)}>Open workspace</MenuItem>
          ) : (
            <>
              <MenuItem>Open workspace</MenuItem>
              <MenuItem>Put on hold</MenuItem>
              <MenuItem destructive>Close project</MenuItem>
            </>
          )
        }
        empty={<EmptyState title="No projects yet." description="Create a project with its client, billing model, budgets and team." action={newButton} />}
        onExport={live ? undefined : () => {}}
      />
      {creating && live && (
        <ProjectDrawer
          project={null}
          choices={live.choices ?? { clients: [], managers: [], people: [] }}
          finance={live.can.finance}
          onClose={() => setCreating(false)}
          onSave={async (input) => {
            const id = await live.onCreate(input);
            toast({ tone: 'success', title: `${input.code} created as a draft` });
            live.onOpen(id);
          }}
        />
      )}
    </ProjectsFrame>
  );
}

/* ================================================================== PRJ-01 · Project workspace */

export interface ProjectExpense {
  id: string;
  person: string;
  what: string;
  date: Date;
  amount: number;
  rebill: boolean;
  status: 'Approved' | 'Pending';
}

/** Projects P-1: the live project behind PRJ-01's workspace (overview, team, tasks and milestones). */
export interface LiveProjectWorkspace {
  state: LiveLoad;
  onRetry?: () => void;
  detail: LiveProjectDetail | null;
  choices: ProjectChoices | null;
  /** The company's burn alert levels (answer 1405). */
  burn: { warn: number; over: number };
  onUpdate: (input: ProjectInput & { version: number }) => Promise<void>;
  onStatus: (status: ProjectStatus, version: number) => Promise<void>;
  onAllocate: (input: AllocationInput) => Promise<void>;
  onChangeAllocation: (id: string, input: AllocationInput & { version: number }) => Promise<void>;
  onEndAllocation: (id: string, version: number) => Promise<void>;
  /** Batch D B3 (answer 2537): the Team tab's hours range (this week by default). */
  onHoursRange?: (range: 'week' | 'month' | 'all') => void;
  onAddTask: (input: TaskInput) => Promise<void>;
  onChangeTask: (id: string, input: TaskInput) => Promise<void>;
  onAddMilestone: (input: MilestoneInput) => Promise<void>;
  onCompleteMilestone: (id: string, version: number) => Promise<void>;
  /** T2-D 56 (2865): move a task on the board (by drag or the Move to menu). */
  onMoveTask?: (id: string, stage: string, version: number) => Promise<void>;
  /** T2-D 56 (2866): who a task is assigned to. */
  onAssignTask?: (id: string, employeeIds: string[], version: number) => Promise<void>;
  /** Stories: the Tasks tab as a board. */
  defaultTaskView?: 'list' | 'board';
  /** T2-D 57 (2867, 2868): GET /projects/:id/glance, actions pending (the PM only) and who is away (absent: no cards). */
  glance?: LiveProjectGlance | null;
  /** Opens a link of an action pending (an app path). */
  onOpenLink?: (href: string) => void;
  /** Answer 1412: GET /projects/:id/cost (absent: no cost shown; finance or the manager with enough people only). */
  cost?: { finance: boolean; hiddenMonths: number; provisional: boolean; total: string; months: { month: string; cost: string; expenses: string; basis: 'provisional' | 'final'; restatedFrom: string | null }[] } | null;
  /** Answer 1419: GET /projects/:id/expenses (absent: no Expenses tab). */
  expenses?: { id: string; person: string; what: string; spentOn: string; amount: string; rebill: boolean; status: 'Approved' | 'Pending' }[] | null;
  /** P-6: GET /projects/billing/project/:id, the Billing tab for Projects finance and account managers (absent: no tab). */
  billing?: LiveProjectBilling | null;
  /** Opens an invoice in Staffing desk › Invoices (the one invoice list). */
  onOpenInvoice?: (id: string) => void;
  /** Answer 1541: the Timesheets tab, a week at a time (absent: no tab). */
  timesheets?: { week: string; rows: LiveTimesheetRow[] } | null;
  onTimesheetWeek?: (week: string) => void;
  /** Stories: a drawer open. */
  defaultDrawer?: 'edit' | 'allocate' | 'task' | 'milestone';
}

/** T2-D 57: GET /projects/:id/glance. `pending` only for the project manager; `away` for the manager and the team. */
export interface LiveProjectGlance {
  pending: { kind: PendingKind; count: number; people?: string[]; href: string }[] | null;
  /** Answer 2868: away only, never the leave type. */
  away: { from: string; to: string; people: { employeeId: string; person: string; days: string[] }[] } | null;
}
type PendingKind = 'approvals' | 'not_sent' | 'requests' | 'billing';
const PENDING_TEXT: Record<PendingKind, (n: number) => string> = {
  approvals: (n) => `${n} ${n === 1 ? 'week is' : 'weeks are'} waiting for your approval`,
  not_sent: (n) => `${n} ${n === 1 ? 'person has' : 'people have'} not sent last week`,
  requests: (n) => `${n} resource ${n === 1 ? 'request is' : 'requests are'} waiting`,
  billing: (n) => `${n} ${n === 1 ? 'item is' : 'items are'} ready to invoice`,
};
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** T2-D 57 (answers 2867, 2868): the project manager's actions pending, and who on the project is away in the next 14 days. */
export function ProjectGlanceCards({ glance, onOpenLink }: { glance: LiveProjectGlance; onOpenLink?: (href: string) => void }) {
  const pending = glance.pending?.filter((x) => x.count > 0) ?? null;
  return (
    <>
      {pending && (
        <Card title="Actions pending">
          {pending.length === 0 ? (
            <EmptyState compact title="Nothing waiting for you." description="Weeks to approve, weeks not sent, resource requests and work ready to invoice show here." />
          ) : (
            <ul className="yx-hire-list">
              {pending.map((x) => (
                <li key={x.kind} className="yx-hire-list__item">
                  <div className="yx-hire-list__main">
                    <Text weight="medium">{PENDING_TEXT[x.kind](x.count)}</Text>
                    {x.people?.length ? <Text size="sm" tone="secondary">{x.people.join(', ')}</Text> : null}
                  </div>
                  {onOpenLink && (
                    <Button size="sm" onClick={() => onOpenLink(x.href)}>
                      Open
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {glance.away && (
        <Card title="Away in the next 14 days">
          {glance.away.people.length === 0 ? (
            <EmptyState compact title="No one on the project is away." description={`From ${shortDay(glance.away.from)} to ${shortDay(glance.away.to)}.`} />
          ) : (
            <ul className="yx-hire-list">
              {glance.away.people.map((x) => (
                <li key={x.employeeId} className="yx-hire-list__item">
                  <div className="yx-hire-list__main">
                    <Text weight="medium">{x.person}</Text>
                    <Text size="sm" tone="secondary">Away {x.days.map(shortDay).join(', ')}</Text>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

/** GET /projects/billing/project/:id (P-6): one project's unbilled work, waiting hours, billed to date and invoices. */
export interface LiveProjectBilling {
  model: 'time_material' | 'fixed_fee' | 'retainer' | 'non_billable';
  fee: string | null;
  ready: string;
  readyHours: number;
  waitingHours: number;
  billed: string;
  unbilled: { id: string; source: string; detail: string; hours: number | null; amount: string; held: string | null }[];
  invoices: { id: string; number: string | null; kind: 'Invoice' | 'Credit note'; status: 'draft' | 'issued'; date: string | null; amount: string }[];
}

/** GET /projects/:id/timesheets row (answer 1541). */
export interface LiveTimesheetRow {
  employeeId: string;
  person: string;
  bookedHours: number;
  approvedHours: number;
  allocatedHours: number;
  status: 'missing' | 'draft' | 'pending' | 'approved' | 'rejected' | 'reduced';
  /** The person's whole week against attendance (an hour or more apart). */
  mismatch: string | null;
}
const TS_STATUS: Record<LiveTimesheetRow['status'], string> = { missing: 'Not started', draft: 'Draft', pending: 'Waiting', approved: 'Approved', reduced: 'Reduced', rejected: 'Rejected' };
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export interface ProjectWorkspaceProps {
  project?: Project;
  persona?: PrjPersona;
  allocations?: Allocation[];
  tasks?: Task[];
  milestones?: Milestone[];
  wip?: WipLine[];
  rateCard?: RateCardEntry[];
  expenses?: ProjectExpense[];
  activity?: TimelineItem[];
  today?: Date;
  defaultTab?: 'overview' | 'team' | 'tasks' | 'timesheets' | 'billing' | 'expenses';
  live?: LiveProjectWorkspace;
}

const STATUS_MOVES: Record<ProjectStatus, { to: ProjectStatus; label: string; destructive?: boolean }[]> = {
  draft: [{ to: 'active', label: 'Start project' }, { to: 'closed', label: 'Close project', destructive: true }],
  active: [{ to: 'on_hold', label: 'Put on hold' }, { to: 'closed', label: 'Close project', destructive: true }],
  on_hold: [{ to: 'active', label: 'Resume project' }, { to: 'closed', label: 'Close project', destructive: true }],
  closed: [{ to: 'active', label: 'Reopen project' }],
};

// PRJ-01 (workspace)
export function ProjectWorkspaceScreen({ project: drawnProject, persona: drawnPersona = 'pm', allocations: drawnAllocations = [], tasks: drawnTasks = [], milestones: drawnMilestones = [], wip = [], rateCard = [], expenses = [], activity = [], today = new Date(), defaultTab = 'overview', live }: ProjectWorkspaceProps) {
  const [drawer, setDrawer] = useState<{ kind: 'edit' | 'allocate' | 'task' | 'milestone' | 'assign'; id?: string } | null>(live?.defaultDrawer ? { kind: live.defaultDrawer } : null);
  const [taskView, setTaskView] = useState<'list' | 'board'>(live?.defaultTaskView ?? 'list');
  const [confirm, setConfirm] = useState<{ title: string; consequence: string; label: string; destructive?: boolean; action: () => Promise<void> } | null>(null);
  const [drawnRange, setDrawnRange] = useState<'week' | 'month' | 'all'>('week');
  const { toast } = useToast();
  const d = live?.detail ?? null;
  if (live && !d)
    return (
      <ProjectsFrame active="Projects">
        {live.state === 'error' ? <ErrorState title="We couldn't load the project." onRetry={live.onRetry} /> : live.state === 'off' ? <ProjectsOffState /> : live.state === 'no-access' ? <NoAccessState what="this project" grantedBy="your System Admin" /> : <Skeleton height={320} />}
      </ProjectsFrame>
    );
  const p = d ? toProject(d.project) : drawnProject!;
  const persona: PrjPersona = d ? (d.can.finance ? 'finance' : d.can.run ? 'pm' : 'hr') : drawnPersona;
  const allocations = d ? d.allocations.map(toAllocation) : drawnAllocations;
  const tasks = d ? d.tasks.map(toTask) : drawnTasks;
  const milestones = d ? d.milestones.map((m) => toMilestone(m, d.project.clientAcceptsMilestones)) : drawnMilestones;
  const thresholds: [number, number] = live ? [live.burn.warn, live.burn.over] : [80, 100];
  const hours = burnState(p.usedHours, p.budgetHours, thresholds);
  const cost = burnState(p.cost, p.budgetCost, thresholds);
  const billing = tmBilling(wip, rateCard);
  const ms = milestoneSummary(milestones, p.fee);
  const closed = p.status === 'Closed';
  const alerts = [hours.state !== 'ok' && `hours at ${hours.pct}%`, !live && cost.state !== 'ok' && `cost at ${cost.pct}%`].filter(Boolean);
  const run = (fn: () => Promise<void>, done: string) => async () => {
    await fn();
    toast({ tone: 'success', title: done });
  };
  const ask = (move: { to: ProjectStatus; label: string; destructive?: boolean }) =>
    setConfirm({
      title: `${move.label}?`,
      consequence:
        move.to === 'closed'
          ? 'No new time can be booked. Hours already booked stay. You can reopen it later.'
          : move.to === 'on_hold'
            ? 'No new time can be booked until it is resumed.'
            : 'People allocated to it can book time from now on.',
      label: move.label,
      destructive: move.destructive,
      action: run(() => live!.onStatus(move.to, d!.project.version), `${p.code}: ${move.label.toLowerCase()} done`),
    });
  const allocationOf = (id?: string) => (d && id ? (d.allocations.find((a) => a.id === id) ?? null) : null);
  const taskOf = (id?: string) => (d && id ? (d.tasks.find((t) => t.id === id) ?? null) : null);
  return (
    <ProjectsFrame active="Projects">
      <RecordLayout
        banner={
          closed ? (
            <InlineAlert tone="info" title="Closed project">No new time or costs can be booked. Late entries go through an adjustment in an open week.</InlineAlert>
          ) : alerts.length ? (
            <InlineAlert tone={hours.state === 'over' || cost.state === 'over' ? 'danger' : 'warning'} title="Budget burn alert">
              {p.code}: {alerts.join(', ')} of budget. Sent to {p.pm}{live ? ' and Projects finance' : ' and the account manager'}.
            </InlineAlert>
          ) : undefined
        }
        header={
          <ObjectHeader
            name={p.name}
            icon={FolderKanban}
            secondary={`${p.code} · ${p.client ?? 'Internal'} · ${p.model} · PM ${p.pm}`}
            status={<Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>}
            facts={[
              { label: 'Dates', value: Number.isNaN(p.start.getTime()) ? 'Not set' : `${formatDate(p.start)} – ${Number.isNaN(p.end.getTime()) ? 'open' : formatDate(p.end)}` },
              { label: 'People', value: p.people },
              ...(live ? [{ label: 'Hours booked', value: `${p.usedHours.toLocaleString('en-IN')} h` }] : [{ label: 'Utilisation', value: p.utilisation ? `${p.utilisation}%` : '—' }]),
              ...(persona !== 'hr' && !live ? [{ label: 'Unbilled (WIP)', value: formatINR(p.wip) }] : []),
              ...(live && persona === 'finance' && p.fee ? [{ label: 'Fee', value: formatINR(p.fee) }] : []),
            ]}
            actions={
              live ? (
                d!.can.team && !closed ? (
                  <Button variant="primary" icon={Plus} onClick={() => setDrawer({ kind: 'allocate' })}>
                    Add allocation
                  </Button>
                ) : undefined
              ) : closed ? undefined : persona === 'finance' ? (
                <Button variant="primary">Open billing workbench</Button>
              ) : persona === 'pm' ? (
                <>
                  <Button>Raise resource request</Button>
                  <Button variant="primary" icon={Plus}>
                    Add allocation
                  </Button>
                </>
              ) : undefined
            }
            menu={
              live ? (
                d!.can.edit ? (
                  <>
                    <MenuItem onSelect={() => setDrawer({ kind: 'edit' })}>Edit details and budgets</MenuItem>
                    {STATUS_MOVES[d!.project.status].map((m) => (
                      <MenuItem key={m.to} destructive={m.destructive} onSelect={() => ask(m)}>
                        {m.label}
                      </MenuItem>
                    ))}
                  </>
                ) : undefined
              ) : persona === 'hr' ? undefined : (
                <>
                  <MenuItem>Edit budgets</MenuItem>
                  <MenuItem>Rate card</MenuItem>
                  <MenuItem destructive>Close project</MenuItem>
                </>
              )
            }
          />
        }
        aside={
          live ? undefined : (
            <>
              <Text weight="semibold">Activity</Text>
              <Timeline items={activity} today={today} />
            </>
          )
        }
      >
        <Tabs defaultValue={defaultTab}>
          <TabsList aria-label="Project sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="team" count={allocations.length}>
              Team & allocations
            </TabsTrigger>
            <TabsTrigger value="tasks">Tasks & milestones</TabsTrigger>
            {(!live || live.timesheets !== undefined) && <TabsTrigger value="timesheets">Timesheets</TabsTrigger>}
            {((!live && persona !== 'hr') || (live && live.billing !== undefined)) && <TabsTrigger value="billing">Billing</TabsTrigger>}
            {(!live || live.expenses !== undefined) && (
              <TabsTrigger value="expenses" count={live ? (live.expenses?.length ?? 0) : expenses.length}>
                Expenses
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="overview">
            <div className="yx-hire-stack">
              {live?.glance && <ProjectGlanceCards glance={live.glance} onOpenLink={live.onOpenLink} />}
              {live && !p.budgetHours ? (
                <InlineAlert tone="info" title="No hours budget yet">
                  Burn alerts need an hours budget. {d!.can.edit ? 'Add it in Edit details and budgets.' : 'Ask someone who manages projects to add it.'}
                </InlineAlert>
              ) : (
                <BudgetBars
                  rows={[
                    { label: 'Hours', used: p.usedHours, budget: p.budgetHours },
                    ...(live ? [] : [{ label: `Cost${p.costProvisional ? ' (provisional until September payroll is paid)' : ''}`, used: p.cost, budget: p.budgetCost, money: true, hidden: persona === 'hr' }]),
                    ...(p.fee && !live ? [{ label: 'Fee billed', used: p.billed, budget: p.fee, money: true, hidden: persona === 'hr' }] : []),
                  ]}
                />
              )}
              {persona === 'finance' && p.fee > 0 && !live && (
                <SummaryTiles
                  label="Margin"
                  tiles={[
                    { label: 'Revenue (billed + WIP)', value: formatINR(p.billed + p.wip) },
                    { label: 'Cost to date', value: formatINR(p.cost), sub: p.costProvisional ? 'provisional' : 'final' },
                    { label: 'Margin', value: `${marginPct(p.billed + p.wip, p.cost)}%`, tone: marginPct(p.billed + p.wip, p.cost) < 20 ? 'warning' : 'default' },
                  ]}
                />
              )}
              {/* Projects P-5 (1412, 1413): cost to date, totals only, from the nightly job. */}
              {live?.cost && (
                <>
                  {live.cost.finance && p.budgetCost > 0 ? (
                    <BudgetBars rows={[{ label: `Cost${live.cost.provisional ? ' (provisional until payroll is final)' : ''}`, used: Number(live.cost.total), budget: p.budgetCost, money: true }]} />
                  ) : (
                    <SummaryTiles label="Cost" tiles={[{ label: 'Cost to date', value: formatINR(Number(live.cost.total)), sub: live.cost.provisional ? 'provisional' : 'final' }, ...(live.cost.finance && p.fee ? [{ label: 'Fee', value: formatINR(p.fee) }] : [])]} />
                  )}
                  {live.cost.hiddenMonths > 0 && <Text size="sm" tone="secondary">{live.cost.hiddenMonths} {live.cost.hiddenMonths === 1 ? 'month is' : 'months are'} left out: too few people on the project, so a person's rate could be worked out.</Text>}
                </>
              )}
              {(persona === 'pm' || (live?.cost && !live.cost.finance)) && <Text size="sm" tone="secondary">You see project cost as totals. Individual cost rates are visible to payroll and finance only.</Text>}
            </div>
          </TabsContent>
          <TabsContent value="team">
            <div className="yx-hire-stack">
            {/* Batch D B3 (answer 2537): approved billable and non-billable hours and all hours booked, over a range. */}
            <Segment label="Hours for" value={live ? (d?.hoursRange ?? 'week') : drawnRange} onChange={(v) => (live ? live.onHoursRange?.(v) : setDrawnRange(v))} options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'all', label: 'Since the start' }]} />
            <DataTable
              label="Allocations"
              rows={allocations}
              getRowId={(r) => r.id}
              columns={[
                { key: 'person', header: 'Person', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person, secondary: r.role }) },
                { key: 'pct', header: 'Allocation', type: 'number', value: (r) => r.percent, render: (r) => `${r.percent}% · ${Math.round((r.percent / 100) * 40)} h a week` },
                { key: 'from', header: 'From', type: 'date', value: (r) => r.from },
                ...(live ? [{ key: 'toLive', header: 'To', value: (r: Allocation) => (Number.isNaN(r.to.getTime()) ? 'Open' : formatDate(r.to)) } as TableColumn<Allocation>] : [{ key: 'to', header: 'To', type: 'date', value: (r: Allocation) => r.to } as TableColumn<Allocation>]),
                ...(allocations.some((a) => a.hours)
                  ? ([
                      { key: 'billable', header: 'Billable (approved)', type: 'number', value: (r: Allocation) => r.hours?.billable ?? 0, total: 'sum' },
                      { key: 'nonBillable', header: 'Non-billable (approved)', type: 'number', value: (r: Allocation) => r.hours?.nonBillable ?? 0, total: 'sum' },
                      { key: 'booked', header: 'Total booked', type: 'number', value: (r: Allocation) => r.hours?.booked ?? 0, total: 'sum' },
                    ] as TableColumn<Allocation>[])
                  : live
                  ? [{ key: 'booked', header: 'Hours booked', type: 'number', value: (r: Allocation) => r.bookedThisWeek, total: 'sum' } as TableColumn<Allocation>]
                  : []),
                { key: 'tentative', header: 'Status', type: 'status', value: (r) => (r.tentative ? 'Tentative' : 'Confirmed'), statusTone: (v) => (v === 'Tentative' ? 'warning' : 'success') },
              ]}
              rowActions={
                live
                  ? d!.can.team && !closed
                    ? (r) => (
                        <>
                          <MenuItem onSelect={() => setDrawer({ kind: 'allocate', id: r.id })}>Change allocation</MenuItem>
                          <MenuItem
                            destructive
                            onSelect={() => {
                              const a = allocationOf(r.id)!;
                              setConfirm({ title: `End ${a.person}'s allocation?`, consequence: 'It ends today. Their hours stay; from tomorrow they can no longer book time to the project.', label: 'End allocation', destructive: true, action: run(() => live.onEndAllocation(a.id, a.version), 'Allocation ended') });
                            }}
                          >
                            End allocation
                          </MenuItem>
                        </>
                      )
                    : undefined
                  : persona === 'pm'
                    ? () => (
                        <>
                          <MenuItem>Change allocation</MenuItem>
                          <MenuItem destructive>End allocation</MenuItem>
                        </>
                      )
                    : undefined
              }
              empty={<EmptyState title="No one is allocated yet." description="Only allocated people can book time to this project." />}
            />
            </div>
          </TabsContent>
          <TabsContent value="tasks">
            <div className="yx-hire-stack">
              {live && (d!.stages || (d!.can.run && !closed)) && (
                <div className="yx-hire-actions">
                  {d!.stages && <Segment label="Show tasks as" value={taskView} onChange={setTaskView} options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }]} />}
                  {d!.can.run && !closed && (
                    <Button icon={Plus} onClick={() => setDrawer({ kind: 'task' })}>
                      Add task
                    </Button>
                  )}
                </div>
              )}
              {/* T2-D 56 (answers 2865, 2866): the board of tasks in use by stage; the project manager moves them. */}
              {live && d!.stages && taskView === 'board' ? (
                <KanbanBoard
                  aria-label={`Tasks of ${p.code} by stage`}
                  noun="task"
                  readOnly={!(d!.can.run && !closed && live.onMoveTask)}
                  columns={d!.stages.map((s) => ({
                    id: s.id,
                    title: s.label,
                    emptyText: 'No tasks',
                    cards: d!.tasks
                      .filter((t) => t.active && (t.stage ?? 'todo') === s.id)
                      .map((t) => ({ id: t.id, name: t.name, facts: [t.assignees?.length ? t.assignees.map((a) => a.name).join(', ') : 'Not assigned', t.budgetHours ? `${t.usedHours} of ${t.budgetHours} h` : `${t.usedHours} h booked`] as [string, string] })),
                  }))}
                  onMove={(id, _from, to) => {
                    const t = taskOf(id)!;
                    void run(() => live.onMoveTask!(id, to, t.version ?? 1), `${t.name} moved to ${d!.stages!.find((s) => s.id === to)?.label ?? to}`)().catch((e: unknown) => toast({ tone: 'error', title: e instanceof Error ? e.message : 'The task did not move.' }));
                  }}
                />
              ) : (
              <DataTable
                label="Tasks"
                rows={tasks}
                getRowId={(r) => r.id}
                columns={[
                  { key: 'name', header: 'Task', value: (r) => r.name },
                  { key: 'billable', header: 'Billable', type: 'status', value: (r) => (r.billable ? 'Billable' : 'Non-billable'), statusTone: (v) => (v === 'Billable' ? 'info' : 'neutral') },
                  { key: 'budget', header: 'Budget hours', type: 'number', value: (r) => r.budgetHours, total: 'sum' },
                  { key: 'used', header: 'Used hours', type: 'number', value: (r) => r.usedHours, total: 'sum' },
                  { key: 'burn', header: 'Burn', value: (r) => (r.budgetHours ? r.usedHours / r.budgetHours : 0), width: 160, render: (r) => (r.budgetHours ? <Meter value={r.usedHours} max={r.budgetHours} label={`${r.name} burn`} /> : <Text tone="muted">No budget</Text>) },
                  ...(live ? [{ key: 'active', header: 'In use', type: 'status', value: (r: Task) => (taskOf(r.id)?.active === false ? 'Not in use' : 'In use'), statusTone: (v: unknown) => (v === 'In use' ? 'success' : 'neutral') } as TableColumn<Task>] : []),
                  ...(live && d!.stages
                    ? ([
                        { key: 'stage', header: 'Stage', value: (r: Task) => d!.stages!.find((s) => s.id === (taskOf(r.id)?.stage ?? 'todo'))?.label ?? 'To do' },
                        { key: 'assignees', header: 'Assigned to', value: (r: Task) => taskOf(r.id)?.assignees?.map((a) => a.name).join(', ') || 'Not assigned' },
                      ] as TableColumn<Task>[])
                    : []),
                ]}
                rowActions={
                  live && d!.can.run && !closed
                    ? (r) => (
                        <>
                          <MenuItem onSelect={() => setDrawer({ kind: 'task', id: r.id })}>Change task</MenuItem>
                          {live.onAssignTask && <MenuItem onSelect={() => setDrawer({ kind: 'assign', id: r.id })}>Assign people</MenuItem>}
                        </>
                      )
                    : undefined
                }
                empty={live ? <EmptyState title="No tasks yet." description="People book their hours to a task (an activity on their timesheet)." /> : undefined}
              />
              )}
              {(milestones.length > 0 || (live && p.model === 'Fixed fee')) && (
                <Card
                  title="Milestones"
                  actions={
                    live ? (
                      d!.can.run && !closed ? (
                        <Button size="sm" icon={Plus} onClick={() => setDrawer({ kind: 'milestone' })}>
                          Add milestone
                        </Button>
                      ) : undefined
                    ) : (
                      <Text size="sm" tone="secondary">Contract value {formatINR(p.fee)}</Text>
                    )
                  }
                >
                  {ms.warning && <InlineAlert tone="warning">{ms.warning}</InlineAlert>}
                  {milestones.length === 0 && <EmptyState compact title="No milestones yet." description="Split the fixed fee into milestones that add up to 100%." />}
                  <ul className="yx-hire-list">
                    {milestones.map((m) => (
                      <li key={m.id} className="yx-hire-list__item">
                        <div className="yx-hire-list__main">
                          <Text weight="medium">
                            {m.name} · {m.pct}%{persona === 'finance' && p.fee ? ` · ${formatINR(Math.round((p.fee * m.pct) / 100))}` : ''}
                          </Text>
                          <Text size="sm" tone="secondary">
                            Due {formatDate(m.due)}
                            {m.needsClientAcceptance ? ' · client acceptance in the portal' : ''}
                          </Text>
                        </div>
                        <Badge tone={m.status === 'invoiced' ? 'success' : m.status === 'completed' ? 'warning' : m.status === 'accepted' ? 'info' : 'neutral'}>
                          {m.status === 'completed' && m.needsClientAcceptance ? 'Completed · waiting for client' : m.status[0].toUpperCase() + m.status.slice(1)}
                        </Badge>
                        {m.status === 'planned' && (live ? d!.can.run && !closed : persona === 'pm') && (
                          <Button
                            size="sm"
                            onClick={() => {
                              if (!live) return;
                              const lm = d!.milestones.find((x) => x.id === m.id)!;
                              setConfirm({ title: `Mark ${m.name} complete?`, consequence: d!.project.clientAcceptsMilestones ? 'It then waits for the client to accept it in the client portal.' : 'It is then ready to bill.', label: 'Mark complete', action: run(() => live.onCompleteMilestone(lm.id, lm.version), 'Milestone complete') });
                            }}
                          >
                            Mark complete
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </TabsContent>
          {live && live.timesheets !== undefined && (
            <TabsContent value="timesheets">
              <div className="yx-hire-stack">
                <div className="yx-hire-row">
                  <Text weight="semibold">Week of {live.timesheets ? formatDate(new Date(`${live.timesheets.week}T00:00:00`)) : ''}</Text>
                  {live.timesheets && live.onTimesheetWeek && (
                    <div className="yx-hire-actions">
                      <Button size="sm" onClick={() => live.onTimesheetWeek!(plusDays(live.timesheets!.week, -7))}>Previous week</Button>
                      <Button size="sm" onClick={() => live.onTimesheetWeek!(plusDays(live.timesheets!.week, 7))}>Next week</Button>
                    </div>
                  )}
                </div>
                {!live.timesheets ? (
                  <Skeleton height={200} />
                ) : (
                  <DataTable
                    label="Timesheets this week"
                    rows={live.timesheets.rows}
                    getRowId={(r) => r.employeeId}
                    columns={[
                      { key: 'person', header: 'Person', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person }) },
                      { key: 'booked', header: 'Booked', type: 'number', value: (r) => r.bookedHours, total: 'sum' },
                      { key: 'approved', header: 'Approved', type: 'number', value: (r) => r.approvedHours, total: 'sum' },
                      { key: 'allocated', header: 'Allocated', type: 'number', value: (r) => r.allocatedHours, total: 'sum' },
                      { key: 'status', header: 'Status', type: 'status', value: (r) => TS_STATUS[r.status], statusTone: (v) => (v === 'Approved' ? 'success' : v === 'Rejected' ? 'danger' : v === 'Not started' ? 'neutral' : 'warning') },
                      { key: 'flag', header: 'Attendance check', value: (r) => r.mismatch ?? '—', render: (r) => (r.mismatch ? <Text size="sm">{r.mismatch}: flagged, not changed</Text> : '—') },
                    ]}
                    empty={<EmptyState compact title="No one is allocated this week." />}
                  />
                )}
              </div>
            </TabsContent>
          )}
          {!live && (
            <TabsContent value="timesheets">
              <DataTable
                label="Timesheets this week"
                rows={allocations.filter((a) => !a.tentative)}
                getRowId={(r) => r.id}
                columns={[
                  { key: 'person', header: 'Person', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person, secondary: r.role }) },
                  { key: 'booked', header: 'Booked (week of 21 Sep)', type: 'number', value: (r) => r.bookedThisWeek, total: 'sum' },
                  { key: 'expected', header: 'Allocated', type: 'number', value: (r) => r.expectedThisWeek, total: 'sum' },
                  {
                    key: 'status',
                    header: 'Status',
                    type: 'status',
                    value: (r) => (r.bookedThisWeek > r.expectedThisWeek ? 'Over allocation' : r.bookedThisWeek < r.expectedThisWeek ? 'Under allocation' : 'Approved'),
                    statusTone: (v) => (v === 'Approved' ? 'success' : 'warning'),
                  },
                  { key: 'flag', header: 'Attendance check', value: (r) => (r.person === 'Rohit Bhat' ? '42 h booked vs 40 h worked: flagged, not changed' : '—') },
                ]}
              />
            </TabsContent>
          )}
          {live && live.billing !== undefined && (
            <TabsContent value="billing">
              {!live.billing ? (
                <Skeleton height={200} />
              ) : (
                <div className="yx-hire-stack">
                  <SummaryTiles
                    label="Billing"
                    tiles={
                      live.billing.model === 'time_material'
                        ? [
                            { label: 'Ready to bill', value: formatINR(Number(live.billing.ready)), sub: `${live.billing.readyHours} approved billable hours` },
                            { label: 'Waiting for client approval', value: `${live.billing.waitingHours} h`, sub: 'stays in WIP until the client approves', tone: live.billing.waitingHours ? 'warning' : 'default' },
                            { label: 'Billed to date', value: formatINR(Number(live.billing.billed)) },
                          ]
                        : [
                            { label: live.billing.model === 'retainer' ? 'Retainers to bill' : 'Billable milestones', value: formatINR(Number(live.billing.ready)) },
                            { label: 'Billed to date', value: formatINR(Number(live.billing.billed)) },
                            { label: live.billing.model === 'retainer' ? 'Monthly retainer' : 'Contract value', value: live.billing.fee ? formatINR(Number(live.billing.fee)) : '—' },
                          ]
                    }
                  />
                  <DataTable
                    label="Unbilled work"
                    rows={live.billing.unbilled}
                    getRowId={(r) => r.id}
                    columns={[
                      { key: 'source', header: 'Source', value: (r) => r.source },
                      { key: 'detail', header: 'Detail', value: (r) => r.detail },
                      { key: 'hours', header: 'Hours', type: 'number', value: (r) => r.hours, total: 'sum' },
                      { key: 'amount', header: 'Amount', type: 'money', value: (r) => Number(r.amount), total: 'sum' },
                      { key: 'held', header: 'Status', type: 'status', value: (r) => (r.held ? `Held: ${r.held}` : 'Ready'), statusTone: (v) => (v === 'Ready' ? 'success' : 'warning') },
                    ]}
                    empty={<EmptyState title="Nothing to bill." description="Approved billable hours, accepted milestones, retainers and re-billed expenses appear here." />}
                  />
                  <DataTable
                    label="Invoices"
                    rows={live.billing.invoices}
                    getRowId={(r) => r.id}
                    onRowClick={live.onOpenInvoice ? (r) => live.onOpenInvoice!(r.id) : undefined}
                    columns={[
                      { key: 'number', header: 'Number', type: 'id', value: (r) => r.number ?? 'Draft' },
                      { key: 'kind', header: 'Kind', value: (r) => r.kind },
                      { key: 'date', header: 'Date', value: (r) => r.date, render: (r) => (r.date ? formatDate(new Date(`${r.date}T00:00:00`)) : '—') },
                      { key: 'amount', header: 'This project', type: 'money', value: (r) => Number(r.amount) },
                      { key: 'status', header: 'Status', type: 'status', value: (r) => (r.status === 'issued' ? 'Issued' : 'Draft'), statusTone: (v) => (v === 'Issued' ? 'success' : 'neutral') },
                    ]}
                    empty={<EmptyState title="No invoices yet." description="Invoices made in the billing workbench appear here; each opens in Staffing desk › Invoices." />}
                  />
                  <Text size="sm" tone="secondary">
                    Unapproved, non-billable and already-invoiced hours are never billed. Invoices open in Staffing desk › Invoices.
                  </Text>
                </div>
              )}
            </TabsContent>
          )}
          {!live && persona !== 'hr' && (
            <TabsContent value="billing">
              <div className="yx-hire-stack">
                {p.model === 'Time & material' ? (
                  <SummaryTiles
                    label="Billing"
                    tiles={[
                      { label: 'Ready to bill', value: formatINR(billing.amount), sub: `${billing.billHours} approved billable hours` },
                      { label: 'Waiting for client approval', value: `${billing.heldHours} h`, sub: 'stays in WIP until the client approves', tone: billing.heldHours ? 'warning' : 'default' },
                      { label: 'Billed to date', value: formatINR(p.billed) },
                    ]}
                  />
                ) : (
                  <SummaryTiles
                    label="Billing"
                    tiles={[
                      { label: 'Billable milestones', value: formatINR(ms.billableAmount) },
                      { label: 'Billed to date', value: formatINR(p.billed) },
                      { label: 'Contract value', value: formatINR(p.fee) },
                    ]}
                  />
                )}
                <Text size="sm" tone="secondary">
                  Rates: person override, then project role, then project default. Unapproved, non-billable and already-invoiced hours are never billed.
                </Text>
              </div>
            </TabsContent>
          )}
          {live && live.expenses !== undefined && (
            <TabsContent value="expenses">
              {!live.expenses ? (
                <Skeleton height={200} />
              ) : (
                <DataTable
                  label="Project expenses"
                  rows={live.expenses}
                  getRowId={(r) => r.id}
                  columns={[
                    { key: 'person', header: 'Claimed by', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person }) },
                    { key: 'what', header: 'Expense', value: (r) => r.what },
                    { key: 'date', header: 'Date', value: (r) => r.spentOn, render: (r) => formatDate(new Date(`${r.spentOn}T00:00:00`)) },
                    { key: 'amount', header: 'Amount', type: 'money', value: (r) => Number(r.amount), total: 'sum' },
                    { key: 'rebill', header: 'Rebill to client', type: 'status', value: (r) => (r.rebill ? 'Rebill' : 'Cost only'), statusTone: (v) => (v === 'Rebill' ? 'info' : 'neutral') },
                    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Approved' ? 'success' : 'warning') },
                  ]}
                  empty={<EmptyState title="No expenses tagged to this project." description="Expense lines that name the project appear here once submitted." />}
                />
              )}
            </TabsContent>
          )}
          {!live && (
            <TabsContent value="expenses">
              <DataTable
                label="Project expenses"
                rows={expenses}
                getRowId={(r) => r.id}
                columns={[
                  { key: 'person', header: 'Claimed by', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person }) },
                  { key: 'what', header: 'Expense', value: (r) => r.what },
                  { key: 'date', header: 'Date', type: 'date', value: (r) => r.date },
                  { key: 'amount', header: 'Amount', type: 'money', value: (r) => r.amount, total: 'sum' },
                  { key: 'rebill', header: 'Rebill to client', type: 'status', value: (r) => (r.rebill ? 'Rebill' : 'Cost only'), statusTone: (v) => (v === 'Rebill' ? 'info' : 'neutral') },
                  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Approved' ? 'success' : 'warning') },
                ]}
                empty={<EmptyState title="No expenses tagged to this project." description="Expense lines tagged to the project appear here once approved." />}
              />
            </TabsContent>
          )}
        </Tabs>
      </RecordLayout>
      {live && d && drawer?.kind === 'edit' && (
        <ProjectDrawer project={d.project} choices={live.choices ?? { clients: [], managers: [], people: [] }} finance={d.can.finance} onClose={() => setDrawer(null)} onSave={async (input) => { await live.onUpdate({ ...input, version: d.project.version }); toast({ tone: 'success', title: 'Project saved' }); }} />
      )}
      {live && d && drawer?.kind === 'allocate' && (
        <AllocationDrawer
          allocation={allocationOf(drawer.id)}
          people={live.choices?.people ?? []}
          onClose={() => setDrawer(null)}
          onSave={async (input) => {
            const a = allocationOf(drawer.id);
            if (a) await live.onChangeAllocation(a.id, { ...input, version: a.version });
            else await live.onAllocate(input);
            toast({ tone: 'success', title: a ? 'Allocation saved' : 'Added to the team' });
          }}
        />
      )}
      {live && d && drawer?.kind === 'task' && (
        <TaskDrawer
          task={taskOf(drawer.id)}
          onClose={() => setDrawer(null)}
          onSave={async (input) => {
            const t = taskOf(drawer.id);
            if (t) await live.onChangeTask(t.id, input);
            else await live.onAddTask(input);
            toast({ tone: 'success', title: t ? 'Task saved' : 'Task added' });
          }}
        />
      )}
      {live && d && drawer?.kind === 'assign' && taskOf(drawer.id) && (
        <TaskAssigneesDrawer
          task={{ name: taskOf(drawer.id)!.name, assignees: (taskOf(drawer.id)!.assignees ?? []).map((a) => a.employeeId) }}
          team={d.allocations}
          onClose={() => setDrawer(null)}
          onSave={async (ids) => {
            const t = taskOf(drawer.id)!;
            await live.onAssignTask!(t.id, ids, t.version ?? 1);
            toast({ tone: 'success', title: `${t.name}: assigned` });
          }}
        />
      )}
      {live && d && drawer?.kind === 'milestone' && (
        <MilestoneDrawer
          onClose={() => setDrawer(null)}
          onSave={async (input) => {
            await live.onAddMilestone(input);
            toast({ tone: 'success', title: 'Milestone added' });
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog open onOpenChange={(o) => !o && setConfirm(null)} title={confirm.title} consequence={confirm.consequence} confirmLabel={confirm.label} destructive={confirm.destructive} onConfirm={async () => { await confirm.action(); setConfirm(null); }} />
      )}
    </ProjectsFrame>
  );
}

/* ================================================================== PRJ-02 · Timesheet approvals */

/** Projects P-2 (answers 1406, 1407, 1442): GET /time/line-approvals, the lines waiting for me. */
export interface LiveApprovalsData {
  withinAllocation: boolean;
  groups: {
    projectId: string;
    project: string;
    projectName: string;
    week: string;
    /** 1408: the client who approves this project's hours after the PM (null: none). */
    clientApproval: string | null;
    items: { id: string; timesheetId: string; /** Batch D B1: the person (By person regroups these same lines). */ employeeId: string; employee: string; allocationPercent: number | null; allocatedHours: number; unallocated: boolean; bulk: boolean; /** 1541: the week against attendance. */ mismatch?: string | null; lines: { id: string; task: string | null; hours: number; billable: boolean; /** Answer 1787: a comment per day. */ comments?: string[]; /** B1: hours Monday to Sunday. */ days?: number[]; version: number }[] }[];
  }[];
}
export type LiveLineDecision = { lineId: string; status: 'approved' | 'reduced' | 'rejected'; hours?: number; reason?: string; version: number };
export interface LiveTimesheetApprovals {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  data: LiveApprovalsData | null;
  onDecide: (decisions: LiveLineDecision[]) => Promise<void>;
  onBulk: (items: { lineId: string; version: number }[]) => Promise<void>;
  /** Story: the bulk confirmation open for the first group. */
  defaultBulk?: boolean;
  /** Story: start grouped by person (batch D B1). */
  defaultBy?: 'project' | 'person';
  /** Batch D answer 2535: people on my projects with weeks not sent (GET /time/line-approvals/not-sent). */
  notSent?: { state: 'ready' | 'loading' | 'error'; data: { people: NotSentPerson[] } | null; onRetry?: () => void; onRemind: (employeeId: string) => Promise<void> };
}

/** Batch D answer 2535: a person on my projects with past weeks not sent (for those projects only). */
export interface NotSentPerson {
  employeeId: string;
  name: string;
  projects: string[];
  weeks: { week: string; status: 'not_started' | 'draft' | 'sent_back'; totalMinutes: number; locked: boolean }[];
  remindedAt: string | null;
  /** False when reminded in the last day, or the person has no sign-in. */
  canRemind: boolean;
}

/** PRJ-02 Not sent: who still owes weeks on my projects, with a once-a-day Remind. */
export function NotSentPeople({ people, onRemind }: { people: NotSentPerson[]; onRemind?: (p: NotSentPerson) => void }) {
  const columns: TableColumn<NotSentPerson>[] = [
    { key: 'name', header: 'Person', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.projects.join(', ') }) },
    { key: 'weeks', header: 'Weeks not sent', type: 'number', value: (r) => r.weeks.length },
    { key: 'oldest', header: 'Oldest', value: (r) => `Week of ${formatDate(new Date(`${r.weeks[r.weeks.length - 1]!.week}T00:00:00`))}` },
    { key: 'sentBack', header: 'Sent back', type: 'number', value: (r) => r.weeks.filter((w) => w.status === 'sent_back').length },
    { key: 'reminded', header: 'Last reminded', value: (r) => (r.remindedAt ? formatDate(new Date(r.remindedAt)) : '—') },
  ];
  return (
    <div className="yx-hire-stack">
      <Text size="sm" tone="secondary">
        People on your projects with past weeks they have not sent. Payroll needs full weeks. A reminder goes at most once a day per person.
      </Text>
      {people.length === 0 ? (
        <EmptyState title="Everyone has sent their weeks." description="People on your projects who still owe a week appear here." />
      ) : (
        <DataTable label="People with weeks not sent" rows={people} columns={columns} getRowId={(r) => r.employeeId} rowButtons={(r) => (onRemind ? <Button size="sm" disabled={!r.canRemind} onClick={() => onRemind(r)}>{r.canRemind ? 'Remind' : 'Reminded today'}</Button> : null)} />
      )}
    </div>
  );
}

/** "Waiting for me" and, for a project manager, "Not sent (n)" (answer 2535); without the list, just the waiting lines. */
function WaitingOrNotSent({ notSent, children }: { notSent?: { count: number | null; body: ReactNode }; children: ReactNode }) {
  if (!notSent) return <>{children}</>;
  return (
    <Tabs defaultValue="waiting">
      <TabsList aria-label="Timesheet approvals views">
        <TabsTrigger value="waiting">Waiting for me</TabsTrigger>
        <TabsTrigger value="not-sent">{notSent.count ? `Not sent (${notSent.count})` : 'Not sent'}</TabsTrigger>
      </TabsList>
      <TabsContent value="waiting">
        <div className="yx-hire-stack">{children}</div>
      </TabsContent>
      <TabsContent value="not-sent">{notSent.body}</TabsContent>
    </Tabs>
  );
}

export interface TimesheetApprovalsProps {
  /** Batch D answer 2535 (drawn): the Not sent tab's people. */
  notSent?: NotSentPerson[];
  groups?: ApprovalGroup[];
  clientApproval?: boolean;
  state?: ListState;
  bulkConfirm?: boolean;
  /** Batch D B1 (drawn): start grouped by person. */
  by?: 'project' | 'person';
  live?: LiveTimesheetApprovals;
}

/** Batch D B1: "By project" or "By person", one pick (answer 2538: the switch only regroups the lines already shown). */
type ApprovalsBy = 'project' | 'person';
function BySwitch({ by, onChange }: { by: ApprovalsBy; onChange: (v: ApprovalsBy) => void }) {
  return <Segment label="Group the lines" value={by} onChange={onChange} options={[{ value: 'project', label: 'By project' }, { value: 'person', label: 'By person' }]} />;
}

/** B1: the same items keyed by project and week, or by person and week. Never adds an item (2538). */
export function regroupApprovals<I extends { person: string; project: string; week: string }>(items: I[], by: ApprovalsBy): { key: string; title: string; week: string; items: I[] }[] {
  const out = new Map<string, { key: string; title: string; week: string; items: I[] }>();
  for (const i of items) {
    const title = by === 'project' ? i.project : i.person;
    const key = `${title}:${i.week}`;
    if (!out.has(key)) out.set(key, { key, title, week: i.week, items: [] });
    out.get(key)!.items.push(i);
  }
  return [...out.values()];
}

function ApprovalGroups({ groups, by, onBulk, done }: { groups: ApprovalGroup[]; by: ApprovalsBy; onBulk: (ids: string[]) => void; done: string[] }) {
  const all = groups.flatMap((g) => g.items.filter((i) => !done.includes(i.id)).map((i) => ({ ...i, person: i.employee, project: g.project, week: g.week, weekStart: g.weekStart })));
  return (
    <>
      {regroupApprovals(all, by).map((g) => {
        const items = g.items;
        const eligible = items.filter((i) => bulkEligible({ id: i.id, hours: i.lines.reduce((s, l) => s + l.hours, 0), allocatedHours: i.allocatedHours }));
        const weekStart = items[0]?.weekStart;
        return (
          <section key={g.key} className="yx-hire-stack" aria-label={`${g.title}, ${g.week}`}>
            <div className="yx-hire-row">
              <div>
                <Text weight="semibold">{g.title}</Text>
                <Text as="div" size="sm" tone="secondary">
                  {g.week} · {items.length} waiting
                </Text>
              </div>
              {eligible.length > 0 && (
                <Button icon={CheckCheck} onClick={() => onBulk(eligible.map((e) => e.id))}>
                  Approve {eligible.length} within allocation
                </Button>
              )}
            </div>
            {weekStart && <TimesheetWeekDrill weekStart={new Date(`${weekStart}T00:00:00`)} lines={items.flatMap((i) => i.lines.map((l) => ({ id: l.id, label: by === 'project' ? (l.task ?? 'No task') : `${l.project}${l.task ? ` · ${l.task}` : ''}`, secondary: by === 'project' ? i.employee : undefined, days: l.days ?? [] })))} />}
            <div className="yx-hire-approvals">
              {items.map((i) => (
                <div key={i.id} className="yx-hire-stack">
                  {i.mismatch && <InlineAlert tone="warning">{i.mismatch}. Pay is unchanged; check before approving.</InlineAlert>}
                  <TimesheetApprovalCard employee={{ name: i.employee, secondary: by === 'project' ? `${i.role} · allocated ${i.allocatedHours} h` : `${i.project.split(' · ')[0]} · allocated ${i.allocatedHours} h` }} weekLabel={g.week} lines={i.lines} onApprove={() => {}} onSendBack={() => {}} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

const weekOf = (iso: string) => `Week of ${formatDate(new Date(`${iso}T00:00:00`))}`;

/** PRJ-02 live: my lines by project and week; each card decides one person's lines; bulk only within the allocation. */
function LiveTimesheetApprovalsView({ live }: { live: LiveTimesheetApprovals }) {
  const d = live.data;
  const { toast } = useToast();
  const [project, setProject] = useState<string>('all');
  const [week, setWeek] = useState<string>('all');
  const [by, setBy] = useState<ApprovalsBy>(live.defaultBy ?? 'project');
  const [bulk, setBulk] = useState<{ key: string; items: { lineId: string; version: number }[] } | null>(() => {
    const g = live.defaultBulk ? d?.groups[0] : undefined;
    return g ? { key: `project:${g.projectId}:${g.week}`, items: g.items.filter((i) => i.bulk).flatMap((i) => i.lines.map((l) => ({ lineId: l.id, version: l.version }))) } : null;
  });
  const [failed, setFailed] = useState<string | null>(null);
  const act = async (fn: () => Promise<void>, done: string) => {
    setFailed(null);
    try {
      await fn();
      toast({ tone: 'success', title: done });
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Nothing was changed.');
    }
  };
  const groups = (d?.groups ?? []).filter((g) => (project === 'all' || g.projectId === project) && (week === 'all' || g.week === week));
  const projects = [...new Map((d?.groups ?? []).map((g) => [g.projectId, g.project])).entries()];
  const weeks = [...new Set((d?.groups ?? []).map((g) => g.week))].sort().reverse();
  const clients = [...new Set(groups.filter((g) => g.clientApproval).map((g) => `${g.project} (${g.clientApproval})`))];
  return (
    <ProjectsFrame active="Timesheet approvals">
      <PageHeader
        title="Timesheet approvals"
        description="By project or by person, a week at a time. Open a week to see its days and tasks. Approve, reduce or reject lines with a reason the employee sees; weeks within the allocation can be approved in bulk."
        facts={
          d && d.groups.length > 0 ? (
            <div className="yx-hire-actions">
              <BySwitch by={by} onChange={setBy} />
              <Select aria-label="Project" value={project} onChange={(v) => setProject(v ?? 'all')} options={[{ value: 'all', label: 'All my projects' }, ...projects.map(([id, code]) => ({ value: id, label: code }))]} />
              <Select aria-label="Week" value={week} onChange={(v) => setWeek(v ?? 'all')} options={[{ value: 'all', label: 'All weeks' }, ...weeks.map((w) => ({ value: w, label: weekOf(w) }))]} />
            </div>
          ) : undefined
        }
      />
      {clients.length > 0 && <InlineAlert tone="info">{clients.join(', ')}: approved lines then go to the client in the client portal before they can be billed.</InlineAlert>}
      {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
      <WaitingOrNotSent
        notSent={
          live.notSent && live.state === 'ready'
            ? {
                count: live.notSent.data?.people.length ?? null,
                body:
                  live.notSent.state === 'loading' || !live.notSent.data ? (
                    live.notSent.state === 'error' ? <ErrorState title="Couldn't load the weeks not sent" description="Check your connection and try again." onRetry={live.notSent.onRetry ?? (() => {})} /> : <Skeleton height={200} />
                  ) : (
                    <NotSentPeople people={live.notSent.data.people} onRemind={(p) => void act(() => live.notSent!.onRemind(p.employeeId), `Reminder sent to ${p.name}`)} />
                  ),
              }
            : undefined
        }
      >
        {live.state === 'loading' || (!d && live.state === 'ready') ? (
          <div className="yx-hire-approvals">
            {[0, 1].map((i) => (
              <Skeleton key={i} height={260} />
            ))}
          </div>
        ) : live.state === 'error' ? (
          <ErrorState title="Couldn't load timesheets" description="Check your connection and try again. Nothing was approved." onRetry={live.onRetry ?? (() => {})} />
        ) : live.state === 'no-access' ? (
          <NoAccessState what="timesheet approvals" grantedBy="your System Admin" />
        ) : groups.length === 0 ? (
          <EmptyState title="You're all caught up." description="No timesheet lines are waiting for your approval." />
        ) : (
          regroupApprovals(
            groups.flatMap((g) => g.items.map((i) => ({ ...i, person: i.employeeId, project: g.projectId, week: g.week, code: g.project, projectName: g.projectName }))),
            by,
          ).map((g) => {
            const eligible = g.items.filter((i) => i.bulk);
            const first = g.items[0]!;
            const key = `${by}:${g.key}`;
            const drill = g.items.flatMap((i) => i.lines.map((l) => ({ id: l.id, label: by === 'project' ? (l.task ?? 'No task') : `${i.code}${l.task ? ` · ${l.task}` : ''}`, secondary: by === 'project' ? i.employee : undefined, days: l.days ?? [] })));
            return (
              <section key={key} className="yx-hire-stack" aria-label={`${by === 'project' ? first.code : first.employee}, ${weekOf(g.week)}`}>
                <div className="yx-hire-row">
                  <div>
                    <Text weight="semibold">{by === 'project' ? `${first.code} · ${first.projectName}` : first.employee}</Text>
                    <Text as="div" size="sm" tone="secondary">
                      {weekOf(g.week)} · {g.items.length} waiting
                    </Text>
                  </div>
                  {eligible.length > 0 && (
                    <Button icon={CheckCheck} onClick={() => setBulk({ key, items: eligible.flatMap((i) => i.lines.map((l) => ({ lineId: l.id, version: l.version }))) })}>
                      Approve {eligible.length} within allocation
                    </Button>
                  )}
                </div>
                {drill.every((l) => l.days.length === 7) && <TimesheetWeekDrill weekStart={new Date(`${g.week}T00:00:00`)} lines={drill} />}
                <div className="yx-hire-approvals">
                  {g.items.map((i) => (
                    <div key={i.id} className="yx-hire-stack">
                      {i.mismatch && <InlineAlert tone="warning">{i.mismatch}. Pay is unchanged; check before approving.</InlineAlert>}
                      {i.unallocated && <InlineAlert tone="warning">Booked outside {i.employee}'s allocation{by === 'person' ? ` on ${i.code}` : ''}. Approve it on its own; it is never approved in bulk.</InlineAlert>}
                      <TimesheetApprovalCard
                        employee={{ name: i.employee, secondary: `${by === 'person' ? `${i.code} · ` : ''}${i.allocationPercent != null ? `allocated ${i.allocatedHours} h a week` : 'not allocated to this project'}` }}
                        weekLabel={weekOf(g.week)}
                        lines={i.lines.map((l) => ({ id: l.id, project: i.code, task: l.task ?? undefined, hours: l.hours, billable: l.billable, comments: l.comments }))}
                        onApprove={(decisions) =>
                          void act(
                            () => live.onDecide(i.lines.map((l) => { const x = decisions[l.id]!; return { lineId: l.id, version: l.version, status: x.status, ...(x.status === 'reduced' ? { hours: x.hours, reason: x.reason } : x.status === 'rejected' ? { reason: x.reason } : {}) }; })),
                            `${i.employee}: decided`,
                          )
                        }
                        onSendBack={(reason) => void act(() => live.onDecide(i.lines.map((l) => ({ lineId: l.id, version: l.version, status: 'rejected', reason }))), `${i.employee}: sent back`)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </WaitingOrNotSent>
      <ConfirmDialog
        open={bulk != null}
        onOpenChange={(o) => !o && setBulk(null)}
        title={`Approve ${bulk?.items.length ?? 0} lines?`}
        consequence={d?.withinAllocation === false ? 'Each line is approved as booked. Approved lines are locked; later fixes are adjustment lines.' : "Every line is within the person's allocation. Approved lines are locked; later fixes are adjustment lines."}
        confirmLabel={`Approve ${bulk?.items.length ?? 0} lines`}
        onConfirm={async () => {
          const items = bulk!.items;
          setBulk(null);
          await act(() => live.onBulk(items), `${items.length} lines approved`);
        }}
      />
    </ProjectsFrame>
  );
}

// PRJ-02
export function TimesheetApprovalsScreen({ groups = [], clientApproval = false, state = 'ready', bulkConfirm = false, notSent, by, live }: TimesheetApprovalsProps) {
  if (live) return <LiveTimesheetApprovalsView live={live} />;
  return <DrawnTimesheetApprovals groups={groups} clientApproval={clientApproval} state={state} bulkConfirm={bulkConfirm} notSent={notSent} defaultBy={by} />;
}

function DrawnTimesheetApprovals({ groups, clientApproval, state, bulkConfirm, notSent, defaultBy = 'project' }: { groups: ApprovalGroup[]; clientApproval: boolean; state: ListState; bulkConfirm: boolean; notSent?: NotSentPerson[]; defaultBy?: ApprovalsBy }) {
  const [done, setDone] = useState<string[]>([]);
  const [by, setBy] = useState<ApprovalsBy>(defaultBy);
  const [pending, setPending] = useState<string[] | null>(bulkConfirm ? groups[0].items.filter((i) => bulkEligible({ id: i.id, hours: i.lines.reduce((s, l) => s + l.hours, 0), allocatedHours: i.allocatedHours })).map((i) => i.id) : null);
  const total = groups.reduce((s, g) => s + g.items.length, 0) - done.length;
  return (
    <ProjectsFrame active="Timesheet approvals">
      <PageHeader
        title="Timesheet approvals"
        description="By project or by person, a week at a time. Open a week to see its days and tasks. Approve, reduce or reject lines with a reason the employee sees; weeks within the allocation can be approved in bulk."
        facts={
          <div className="yx-hire-actions">
            <BySwitch by={by} onChange={setBy} />
            <Select aria-label="Project" value="all" onChange={() => {}} options={[{ value: 'all', label: 'All my projects' }, { value: 'p1', label: 'NRP-WEB' }, { value: 'p2', label: 'CLL-WMS' }]} />
            <Select aria-label="Week" value="w39" onChange={() => {}} options={[{ value: 'w39', label: 'Week of 21 Sep 2026' }, { value: 'w38', label: 'Week of 14 Sep 2026' }]} />
          </div>
        }
      />
      {clientApproval && <InlineAlert tone="info">NRP-WEB needs client approval after yours: approved lines go to Rekha Balan in the client portal before they can be billed.</InlineAlert>}
      <WaitingOrNotSent notSent={notSent ? { count: notSent.length, body: <NotSentPeople people={notSent} onRemind={() => {}} /> } : undefined}>
        {state === 'loading' ? (
          <div className="yx-hire-approvals">
            {[0, 1].map((i) => (
              <Skeleton key={i} height={260} />
            ))}
          </div>
        ) : state === 'error' ? (
          <ErrorState title="Couldn't load timesheets" description="Check your connection and try again. Nothing was approved." onRetry={() => {}} reference="TSA-7781" />
        ) : total <= 0 || groups.length === 0 ? (
          <EmptyState title="You're all caught up." description="No timesheets are waiting for your approval. Reminders go out on Friday and missing weeks are nudged on Monday." />
        ) : (
          <ApprovalGroups groups={groups} by={by} onBulk={setPending} done={done} />
        )}
      </WaitingOrNotSent>
      <span className="yx-visually-hidden" aria-live="polite">
        {done.length ? `${done.length} timesheets approved` : ''}
      </span>
      <ConfirmDialog
        open={pending != null}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Approve ${pending?.length ?? 0} timesheets?`}
        consequence="Every line is within the person's allocation. Approved lines are locked; later fixes are adjustment lines."
        confirmLabel={`Approve ${pending?.length ?? 0} timesheets`}
        onConfirm={() => {
          setDone((d) => [...d, ...(pending ?? [])]);
          setPending(null);
        }}
      />
    </ProjectsFrame>
  );
}

// PRJ-02 (phone)
export function TimesheetApprovalsPhone({ groups }: { groups: ApprovalGroup[] }) {
  // One card at a time: keeps each card clear of the sticky header and tab bar (target size).
  const items = groups.flatMap((g) => g.items.map((i) => ({ ...i, project: g.project, week: g.week })));
  const [at, setAt] = useState(0);
  const i = items[at];
  return (
    <PhoneFrame tab="requests" title="Timesheets to approve">
      {!i ? (
        <EmptyState title="You're all caught up." />
      ) : (
        <>
          <Text size="sm" tone="secondary" aria-live="polite">
            {i.project} · {at + 1} of {items.length}
          </Text>
          {i.mismatch && <InlineAlert tone="warning">{i.mismatch}. Pay is unchanged; check before approving.</InlineAlert>}
          <TimesheetApprovalCard key={i.id} employee={{ name: i.employee, secondary: `${i.role} · allocated ${i.allocatedHours} h` }} weekLabel={i.week} lines={i.lines} onApprove={() => setAt((a) => a + 1)} onSendBack={() => setAt((a) => a + 1)} />
          <div className="yx-hire-row">
            <Button disabled={at === 0} onClick={() => setAt((a) => a - 1)}>
              Previous
            </Button>
            <Button disabled={at >= items.length - 1} onClick={() => setAt((a) => a + 1)}>
              Next
            </Button>
          </div>
        </>
      )}
    </PhoneFrame>
  );
}

/* ================================================================== PRJ-03 · Capacity & utilisation */

/** Projects P-4 (answer 1411): GET /projects/capacity. */
export interface LiveCapacityData {
  from: string;
  weeks: string[];
  target: number;
  limit: number;
  teamSize: number;
  /** Projects manage or resource (HR's view): per-person figures always shown. */
  privileged: boolean;
  suppressed: boolean;
  month?: string;
  people: { employeeId: string; name: string; weeks: { allocated: number; available: number }[]; billableHours: number; availableHours: number; utilisation: number }[];
  team: { billableHours: number; availableHours: number; utilisation: number } | null;
}
export interface LiveCapacity {
  state: 'ready' | 'loading' | 'error' | 'no-access' | 'off';
  onRetry?: () => void;
  data: LiveCapacityData | null;
}

export interface CapacityProps {
  weeks?: string[];
  people?: CapacityPerson[];
  utilisationRows?: { person: string; billable: number; available: number }[];
  target?: number;
  persona?: 'pm' | 'hr';
  teamSize?: number;
  loading?: boolean;
  live?: LiveCapacity;
}

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/** PRJ-03 live: allocated against available hours for six weeks, and last month's billable utilisation (1411). */
function LiveCapacityView({ live }: { live: LiveCapacity }) {
  const d = live.data;
  const page = (body: ReactNode) => (
    <ProjectsFrame active="Capacity & utilisation">
      <PageHeader title="Capacity and utilisation" description="Allocated against available hours (weekdays less leave and holidays), and billable utilisation against the company's target." />
      {body}
    </ProjectsFrame>
  );
  if (!d)
    return page(live.state === 'error' ? <ErrorState title="We couldn't load capacity." onRetry={live.onRetry ?? (() => {})} /> : live.state === 'off' ? <ProjectsOffState /> : live.state === 'no-access' ? <NoAccessState what="capacity" grantedBy="your System Admin" /> : <Skeleton height={320} />);
  if (d.suppressed)
    return page(
      <InlineAlert tone="info" title="Hidden for small teams">
        This team has {d.teamSize} {d.teamSize === 1 ? 'person' : 'people'}, fewer than {d.limit}, so per-person capacity and utilisation are hidden for your role. HR can see them.
      </InlineAlert>,
    );
  if (!d.people.length) return page(<EmptyState title="No one is allocated in these weeks." description="Capacity shows people with a confirmed allocation." />);
  const over = d.people.filter((p) => p.weeks.some((w) => w.allocated > w.available)).length;
  const free = Math.round(d.people.reduce((s, p) => s + p.weeks.slice(0, 2).reduce((a, w) => a + Math.max(0, w.available - w.allocated), 0), 0));
  const team = d.team!;
  return page(
    <>
      <SummaryTiles
        label="Next two weeks"
        tiles={[
          { label: 'Free hours, next 2 weeks', value: `${free} h` },
          { label: 'Over-allocated people', value: over, tone: over ? 'warning' : 'default', sub: over ? 'shown in the warning colour below' : undefined },
          { label: `Team utilisation (${d.month ? monthName(d.month) : 'last month'})`, value: `${team.utilisation}%`, sub: `target ${d.target}%`, tone: team.utilisation < d.target ? 'warning' : 'success' },
        ]}
      />
      <CapacityHeatmap title="People × weeks" description="Allocated of available hours" weeks={d.weeks.map((w) => formatDate(new Date(`${w}T00:00:00`)).replace(/ \d{4}$/, ''))} people={d.people.map((p) => ({ name: p.name, weeks: p.weeks }))} xLabel="Person" />
      <div className="yx-hire-cols">
        <BarChart
          title={`Utilisation by person, ${d.month ? monthName(d.month) : 'last month'}`}
          description={`Approved billable ÷ available hours. Target ${d.target}%.`}
          categories={d.people.map((p) => p.name)}
          series={[{ name: 'Utilisation %', values: d.people.map((p) => p.utilisation) }]}
          orientation="horizontal"
          xLabel="Person"
        />
        <Card title="Team against target">
          <Gauge label="Allocated people" value={team.utilisation} target={d.target} />
          <DescriptionList items={[{ label: 'Billable hours', value: team.billableHours.toLocaleString('en-IN') }, { label: 'Available hours', value: team.availableHours.toLocaleString('en-IN') }]} />
        </Card>
      </div>
    </>,
  );
}

// PRJ-03
export function CapacityBoardScreen({ weeks = [], people = [], utilisationRows = [], target = 75, persona = 'hr', teamSize, loading, live }: CapacityProps) {
  if (live) return <LiveCapacityView live={live} />;
  return <DrawnCapacityBoard weeks={weeks} people={people} utilisationRows={utilisationRows} target={target} persona={persona} teamSize={teamSize ?? people.length} loading={loading} />;
}

function DrawnCapacityBoard({ weeks, people, utilisationRows, target, persona, teamSize, loading }: { weeks: string[]; people: CapacityPerson[]; utilisationRows: { person: string; billable: number; available: number }[]; target: number; persona: 'pm' | 'hr'; teamSize: number; loading?: boolean }) {
  const [skill, setSkill] = useState<string | null>(null);
  const suppressed = suppressGroup(teamSize, persona);
  const teamBillable = utilisationRows.reduce((s, r) => s + r.billable, 0);
  const teamAvail = utilisationRows.reduce((s, r) => s + r.available, 0);
  const over = people.filter((p) => p.weeks.some((w) => w.allocated > w.available)).length;
  const free = people.reduce((s, p) => s + p.weeks.slice(0, 2).reduce((a, w) => a + Math.max(0, w.available - w.allocated), 0), 0);
  return (
    <ProjectsFrame active="Capacity & utilisation">
      <PageHeader
        title="Capacity and utilisation"
        description="Allocated against available hours (expected hours minus leave and holidays), and billable utilisation against the target for billable roles."
        facts={
          <div className="yx-hire-actions">
            <Select aria-label="Skill" value={skill} onChange={setSkill} clearable placeholder="All skills" options={['React', 'Java', 'SQL', 'Testing', 'Design'].map((v) => ({ value: v, label: v }))} />
            <Select aria-label="Role" value={null} onChange={() => {}} clearable placeholder="All roles" options={['Senior developer', 'Developer', 'QA lead', 'Designer'].map((v) => ({ value: v, label: v }))} />
            <Select aria-label="Location" value={null} onChange={() => {}} clearable placeholder="All locations" options={['Chennai office', 'Bengaluru head office'].map((v) => ({ value: v, label: v }))} />
          </div>
        }
      />
      {suppressed ? (
        <InlineAlert tone="info" title="Hidden for small teams">
          This team has {teamSize} people, fewer than 5, so per-person capacity and utilisation are hidden for your role. HR can see them.
        </InlineAlert>
      ) : (
        <>
          <SummaryTiles
            label="Next two weeks"
            tiles={[
              { label: 'Free hours, next 2 weeks', value: `${free} h` },
              { label: 'Over-allocated people', value: over, tone: over ? 'warning' : 'default', sub: over ? 'shown in the warning colour below' : undefined },
              { label: 'Team utilisation (Sep)', value: `${utilisation(teamBillable, teamAvail)}%`, sub: `target ${target}%`, tone: utilisation(teamBillable, teamAvail) < target ? 'warning' : 'success' },
            ]}
          />
          <CapacityHeatmap title="People × weeks" description="Allocated of available hours" weeks={weeks} people={people} loading={loading} xLabel="Person" />
          <div className="yx-hire-cols">
            <BarChart
              title="Utilisation by person, September"
              description={`Approved billable ÷ available hours. Target ${target}%.`}
              categories={utilisationRows.map((r) => r.person)}
              series={[{ name: 'Utilisation %', values: utilisationRows.map((r) => utilisation(r.billable, r.available)) }]}
              orientation="horizontal"
              xLabel="Person"
              loading={loading}
            />
            <Card title="Team against target">
              <Gauge label="Design and development team" value={utilisation(teamBillable, teamAvail)} target={target} />
              <DescriptionList items={[{ label: 'Billable hours', value: teamBillable.toLocaleString('en-IN') }, { label: 'Available hours', value: teamAvail.toLocaleString('en-IN') }]} />
            </Card>
          </div>
        </>
      )}
    </ProjectsFrame>
  );
}

/* ================================================================== PRJ-04 · Costing & margin */

export interface CostRow {
  code: string;
  name: string;
  client: string;
  pm: string;
  revenue: number;
  cost: number;
  expenses: number;
  provisional: boolean;
  peopleInMonth: number;
  restated?: number;
}

/** Projects P-5 (answers 1412, 1413): GET /projects/costs, totals only. */
export interface LiveCostsData {
  month: string;
  finance: boolean;
  minPeople: number;
  rows: { projectId: string; code: string; name: string; client: string | null; manager: string | null; hours: number; people: number; hidden: boolean; cost: string | null; expenses: string | null; rebill: string | null; revenue: string | null; margin: number | null; basis: 'provisional' | 'final'; restatedFrom: string | null }[];
}
export interface LiveCosts {
  state: 'ready' | 'loading' | 'error' | 'no-access' | 'off';
  onRetry?: () => void;
  data: LiveCostsData | null;
  /** The periods to choose from: months (YYYY-MM) and P-6 quarters (YYYY-Qn), newest first. */
  months: string[];
  onMonth: (month: string) => void;
  onOpen: (projectId: string) => void;
  /** P-6 (1622): download the month's project cost journal (Projects finance). */
  onExport?: (month: string) => Promise<void>;
}

const QUARTER = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];
const monthLabel = (ym: string) => (/^\d{4}-Q[1-4]$/.test(ym) ? `${QUARTER[Number(ym.slice(6)) - 1]} ${ym.slice(0, 4)}` : new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }));

/** PRJ-04 live: totals only. Finance sees revenue, margin and restatements; a PM sees totals, hidden under the people limit. */
function LiveCostsView({ live }: { live: LiveCosts }) {
  const d = live.data;
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const exportJournal = async () => {
    const period = d?.month ?? live.months[0]!;
    if (period.includes('Q')) return toast({ tone: 'error', title: 'The journal is by month. Choose a month to export it.' });
    setExporting(true);
    try {
      await live.onExport!(period);
      toast({ tone: 'success', title: `Project cost journal for ${monthLabel(period)} downloaded` });
    } catch (e) {
      toast({ tone: 'error', title: e instanceof Error && e.message ? e.message : 'We could not export the journal.' });
    } finally {
      setExporting(false);
    }
  };
  type Row = LiveCostsData['rows'][number];
  const money = (x: string | null) => (x == null ? null : Number(x));
  const cols: TableColumn<Row>[] = [
    { key: 'code', header: 'Project', type: 'id', value: (r) => r.code, width: 130 },
    { key: 'name', header: 'Name', value: (r) => r.name, render: (r) => <span className="yx-hire-clip" title={r.name}>{r.name}</span> },
    { key: 'client', header: 'Client', value: (r) => r.client ?? 'Internal', groupable: true, optional: true },
    { key: 'hours', header: 'Hours', type: 'number', value: (r) => r.hours, total: 'sum', width: 100 },
    { key: 'cost', header: 'People cost', type: 'money', value: (r) => money(r.cost), render: (r) => (r.hidden ? <Text tone="muted">Hidden</Text> : formatINR(Number(r.cost))), total: 'sum' },
    { key: 'expenses', header: 'Expenses', type: 'money', value: (r) => money(r.expenses), render: (r) => (r.hidden ? <Text tone="muted">Hidden</Text> : formatINR(Number(r.expenses))), total: 'sum' },
    ...(d?.finance
      ? [
          { key: 'revenue', header: 'Revenue', type: 'money', value: (r: Row) => money(r.revenue), render: (r: Row) => (r.revenue ? formatINR(Number(r.revenue)) : <Text tone="muted">—</Text>), total: 'sum' } as TableColumn<Row>,
          { key: 'margin', header: 'Margin', type: 'number', value: (r: Row) => r.margin, render: (r: Row) => (r.margin == null ? '—' : `${r.margin}%`) } as TableColumn<Row>,
        ]
      : []),
    { key: 'basis', header: 'Cost basis', type: 'status', value: (r) => (r.restatedFrom ? 'Restated' : r.basis === 'provisional' ? 'Provisional' : 'Final'), statusTone: (v) => (v === 'Final' ? 'success' : v === 'Restated' ? 'info' : 'warning') },
  ];
  const head = (
    <PageHeader
      title="Costing and margin"
      description="Cost = approved hours × each person's cost rate for the month (provisional until the month's payroll is final) + approved project expenses. Worked out nightly; only totals are kept."
      facts={
        live.months.length ? (
          <div className="yx-hire-actions">
            <Select aria-label="Period" value={d?.month ?? live.months[0]!} onChange={(m) => m && live.onMonth(m)} options={live.months.map((m) => ({ value: m, label: monthLabel(m) }))} />
          </div>
        ) : undefined
      }
      actions={
        d?.finance && live.onExport ? (
          <Button loading={exporting} onClick={() => void exportJournal()}>
            Export project cost journal
          </Button>
        ) : undefined
      }
    />
  );
  if (!d)
    return (
      <ProjectsFrame active="Costing & margin">
        {head}
        {live.state === 'error' ? <ErrorState title="We couldn't load project cost." onRetry={live.onRetry ?? (() => {})} /> : live.state === 'off' ? <ProjectsOffState /> : live.state === 'no-access' ? <NoAccessState what="project cost" grantedBy="your System Admin" /> : <Skeleton height={320} />}
      </ProjectsFrame>
    );
  const restated = d.rows.filter((r) => r.restatedFrom);
  return (
    <ProjectsFrame active="Costing & margin">
      {head}
      {!d.finance && <InlineAlert tone="info">You see totals for your projects. A month with fewer than {d.minPeople} people on a project shows no cost, so nobody's rate can be worked out.</InlineAlert>}
      {d.rows.some((r) => r.basis === 'provisional') && <InlineAlert tone="warning">{monthLabel(d.month)} costs are provisional. They are restated from final cost rates once the month's payroll is final.</InlineAlert>}
      {restated.length > 0 && (
        <InlineAlert tone="info" title="Restated">
          {restated.map((r) => `${r.code}: provisional ${formatINR(Number(r.restatedFrom))}, final ${formatINR(Number(r.cost))}`).join('; ')}.
        </InlineAlert>
      )}
      <DataTable label="Project cost" columns={cols} rows={d.rows} getRowId={(r) => r.projectId} onRowClick={(r) => live.onOpen(r.projectId)} empty={<EmptyState title="No project costs for this month." description="Costs post nightly from approved timesheets and approved project expenses." />} />
    </ProjectsFrame>
  );
}

// PRJ-04
export function CostingMarginScreen(props: { rows?: CostRow[]; persona?: 'finance' | 'pm'; period?: string; loading?: boolean; live?: LiveCosts }) {
  if (props.live) return <LiveCostsView live={props.live} />;
  return <DrawnCostingMargin rows={props.rows ?? []} persona={props.persona ?? 'finance'} period={props.period} loading={props.loading} />;
}

function DrawnCostingMargin({ rows, persona, period = 'Sep 2026', loading }: { rows: CostRow[]; persona: 'finance' | 'pm'; period?: string; loading?: boolean }) {
  const [groupBy, setGroupBy] = useState<string | null>('project');
  const visible = (r: CostRow) => costVisible(r.peopleInMonth, persona);
  const cols: TableColumn<CostRow>[] = [
    { key: 'name', header: 'Project', value: (r) => r.name, render: (r) => <PersonLabel name={r.name} secondary={`${r.code} · ${r.client}`} /> },
    { key: 'pm', header: 'PM', value: (r) => r.pm, groupable: true },
    { key: 'client', header: 'Client', value: (r) => r.client, groupable: true },
    { key: 'revenue', header: 'Revenue', type: 'money', value: (r) => r.revenue, total: 'sum' },
    { key: 'cost', header: 'People cost', type: 'money', value: (r) => (visible(r) ? r.cost : null), render: (r) => (visible(r) ? formatINR(r.cost) : 'Hidden'), total: 'sum' },
    { key: 'expenses', header: 'Expenses', type: 'money', value: (r) => r.expenses, total: 'sum' },
    { key: 'margin', header: 'Margin', type: 'number', value: (r) => (visible(r) ? marginPct(r.revenue, r.cost + r.expenses) : null), render: (r) => (visible(r) ? `${marginPct(r.revenue, r.cost + r.expenses)}%` : 'Hidden') },
    { key: 'basis', header: 'Cost basis', type: 'status', value: (r) => (r.restated ? 'Restated' : r.provisional ? 'Provisional' : 'Final'), statusTone: (v) => (v === 'Final' ? 'success' : v === 'Restated' ? 'info' : 'warning') },
  ];
  const withRevenue = rows.filter((r) => r.revenue > 0);
  return (
    <ProjectsFrame active="Costing & margin">
      <PageHeader
        title="Costing and margin"
        description="Cost = approved hours × each person's cost rate for the month (provisional until payroll is paid) + approved project expenses."
        facts={
          <div className="yx-hire-actions">
            <Select aria-label="Period" value="sep" onChange={() => {}} options={[{ value: 'sep', label: period }, { value: 'q2', label: 'Jul–Sep 2026' }]} />
            <Select aria-label="Group by" value={groupBy} onChange={setGroupBy} options={[{ value: 'project', label: 'By project' }, { value: 'client', label: 'By client' }, { value: 'pm', label: 'By PM' }]} />
          </div>
        }
        actions={<Button>Export project cost journal</Button>}
      />
      {persona === 'pm' && <InlineAlert tone="info">You see totals. A cost that would reveal one person&rsquo;s rate (one person on the project in the month) is hidden.</InlineAlert>}
      {rows.some((r) => r.provisional) && <InlineAlert tone="warning">September costs are provisional. They are recomputed from final cost rates when September payroll is paid.</InlineAlert>}
      <BarChart
        title={`Revenue and cost by project, ${period}`}
        categories={withRevenue.map((r) => r.code)}
        series={[
          { name: 'Revenue', values: withRevenue.map((r) => r.revenue) },
          { name: 'Cost', values: withRevenue.map((r) => (visible(r) ? r.cost + r.expenses : null)) },
        ]}
        money
        xLabel="Project"
        loading={loading}
      />
      <DataTable key={groupBy ?? "none"} label="Project margin" columns={cols} rows={rows} getRowId={(r) => r.code} state={loading ? 'loading' : 'ready'} defaultGroupBy={groupBy === 'project' ? null : groupBy} onExport={() => {}} empty={<EmptyState title="No project costs for this period." description="Costs post nightly from approved timesheets." />} />
    </ProjectsFrame>
  );
}
