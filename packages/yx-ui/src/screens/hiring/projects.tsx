// Projects › Projects list + workspace, timesheet approvals, capacity & utilisation, costing & margin.
// PRJ-01, PRJ-02, PRJ-03, PRJ-04 (M12 §7, YX-PRJ-01…14).
import { useState } from 'react';
import { CheckCheck, FolderKanban, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { Select } from '../../components/select';
import { ConfirmDialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { MenuItem } from '../../components/menu';
import { TimesheetApprovalCard } from '../../components/notify';
import { BarChart, CapacityHeatmap, Gauge, type CapacityPerson } from '../../components/charts';
import { Timeline, type TimelineItem } from '../../components/timeline';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { PhoneFrame } from '../_kit/frames';
import { bulkEligible, burnState, costVisible, marginPct, milestoneSummary, suppressGroup, tmBilling, utilisation, type Milestone, type RateCardEntry, type WipLine } from './projects-logic';
import { BudgetBars, ProjectsFrame, RecordLayout, SummaryTiles, useListControls } from './hiring-kit';
import type { Allocation, ApprovalGroup, Project, Task } from './projects-data';
import './hiring.css';

type ListState = 'ready' | 'loading' | 'error';
export type PrjPersona = 'pm' | 'finance' | 'hr';
const STATUS_TONE: Record<Project['status'], BadgeTone> = { Draft: 'neutral', Active: 'success', 'On hold': 'warning', Closed: 'neutral' };

/* ================================================================== PRJ-01 · Projects list */

// PRJ-01
export function ProjectsListScreen({ rows, persona, me = 'Karthik Subramanian', state = 'ready' }: { rows: Project[]; persona: PrjPersona; me?: string; state?: ListState }) {
  const base = persona === 'pm' ? rows.filter((r) => r.pm === me) : rows;
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
    { key: 'code', header: 'Code', type: 'id', value: (r) => r.code, width: 100 },
    { key: 'name', header: 'Project', value: (r) => r.name, render: (r) => <PersonLabel name={r.name} secondary={r.client ?? 'Internal'} /> },
    { key: 'model', header: 'Billing', value: (r) => r.model, groupable: true },
    { key: 'pm', header: 'Project manager', type: 'person', value: (r) => r.pm, person: (r) => ({ name: r.pm }) },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => STATUS_TONE[v as Project['status']] },
    {
      key: 'burn',
      header: 'Hours burn',
      value: (r) => burnState(r.usedHours, r.budgetHours).pct,
      width: 180,
      render: (r) => <Meter value={r.usedHours} max={r.budgetHours} label={`${r.code} hours used`} valueText={`${burnState(r.usedHours, r.budgetHours).pct}%`} />,
    },
    ...(persona !== 'hr'
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
    { key: 'util', header: 'Utilisation', type: 'number', value: (r) => r.utilisation, render: (r) => (r.utilisation ? `${r.utilisation}%` : '—') },
    ...(persona === 'finance' ? [{ key: 'margin', header: 'Margin', type: 'number', value: (r: Project) => marginPct(r.billed + r.wip, r.cost), render: (r: Project) => (r.fee ? `${marginPct(r.billed + r.wip, r.cost)}%` : '—') } as TableColumn<Project>] : []),
  ];
  return (
    <ProjectsFrame active="Projects">
      <PageHeader
        title="Projects"
        description="Client and internal projects with budgets in hours, cost and fee. Burn alerts at 80% and 100%."
        actions={persona === 'hr' ? undefined : <Button variant="primary" icon={Plus}>New project</Button>}
      />
      <DataTable
        label="Projects"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={() => {}}
        errorReference="PRJ-1102"
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        onRowClick={() => {}}
        rowActions={() => (
          <>
            <MenuItem>Open workspace</MenuItem>
            <MenuItem>Put on hold</MenuItem>
            <MenuItem destructive>Close project</MenuItem>
          </>
        )}
        empty={<EmptyState title="No projects yet." description="Create a project with its client, billing model, budgets and team." action={persona === 'hr' ? undefined : <Button variant="primary" icon={Plus}>New project</Button>} />}
        onExport={() => {}}
      />
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

export interface ProjectWorkspaceProps {
  project: Project;
  persona: PrjPersona;
  allocations: Allocation[];
  tasks: Task[];
  milestones?: Milestone[];
  wip: WipLine[];
  rateCard: RateCardEntry[];
  expenses: ProjectExpense[];
  activity: TimelineItem[];
  today: Date;
  defaultTab?: 'overview' | 'team' | 'tasks' | 'timesheets' | 'billing' | 'expenses';
}

// PRJ-01 (workspace)
export function ProjectWorkspaceScreen({ project: p, persona, allocations, tasks, milestones = [], wip, rateCard, expenses, activity, today, defaultTab = 'overview' }: ProjectWorkspaceProps) {
  const hours = burnState(p.usedHours, p.budgetHours);
  const cost = burnState(p.cost, p.budgetCost);
  const billing = tmBilling(wip, rateCard);
  const ms = milestoneSummary(milestones, p.fee);
  const closed = p.status === 'Closed';
  const alerts = [hours.state !== 'ok' && `hours at ${hours.pct}%`, cost.state !== 'ok' && `cost at ${cost.pct}%`].filter(Boolean);
  return (
    <ProjectsFrame active="Projects">
      <RecordLayout
        banner={
          closed ? (
            <InlineAlert tone="info" title="Closed project">No new time or costs can be booked. Late entries go through an adjustment in an open week.</InlineAlert>
          ) : alerts.length ? (
            <InlineAlert tone={hours.state === 'over' || cost.state === 'over' ? 'danger' : 'warning'} title="Budget burn alert">
              {p.code}: {alerts.join(', ')} of budget. Sent to {p.pm} and the account manager.
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
              { label: 'Dates', value: `${formatDate(p.start)} – ${formatDate(p.end)}` },
              { label: 'People', value: p.people },
              { label: 'Utilisation', value: p.utilisation ? `${p.utilisation}%` : '—' },
              ...(persona !== 'hr' ? [{ label: 'Unbilled (WIP)', value: formatINR(p.wip) }] : []),
            ]}
            actions={
              closed ? undefined : persona === 'finance' ? (
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
              persona === 'hr' ? undefined : (
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
          <>
            <Text weight="semibold">Activity</Text>
            <Timeline items={activity} today={today} />
          </>
        }
      >
        <Tabs defaultValue={defaultTab}>
          <TabsList aria-label="Project sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="team" count={allocations.length}>
              Team & allocations
            </TabsTrigger>
            <TabsTrigger value="tasks">Tasks & milestones</TabsTrigger>
            <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
            {persona !== 'hr' && <TabsTrigger value="billing">Billing</TabsTrigger>}
            <TabsTrigger value="expenses" count={expenses.length}>
              Expenses
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <div className="yx-hire-stack">
              <BudgetBars
                rows={[
                  { label: 'Hours', used: p.usedHours, budget: p.budgetHours },
                  { label: `Cost${p.costProvisional ? ' (provisional until September payroll is paid)' : ''}`, used: p.cost, budget: p.budgetCost, money: true, hidden: persona === 'hr' },
                  ...(p.fee ? [{ label: 'Fee billed', used: p.billed, budget: p.fee, money: true, hidden: persona === 'hr' }] : []),
                ]}
              />
              {persona === 'finance' && p.fee > 0 && (
                <SummaryTiles
                  label="Margin"
                  tiles={[
                    { label: 'Revenue (billed + WIP)', value: formatINR(p.billed + p.wip) },
                    { label: 'Cost to date', value: formatINR(p.cost), sub: p.costProvisional ? 'provisional' : 'final' },
                    { label: 'Margin', value: `${marginPct(p.billed + p.wip, p.cost)}%`, tone: marginPct(p.billed + p.wip, p.cost) < 20 ? 'warning' : 'default' },
                  ]}
                />
              )}
              {persona === 'pm' && <Text size="sm" tone="secondary">You see project cost as totals. Individual cost rates are visible to payroll and finance only.</Text>}
            </div>
          </TabsContent>
          <TabsContent value="team">
            <DataTable
              label="Allocations"
              rows={allocations}
              getRowId={(r) => r.id}
              columns={[
                { key: 'person', header: 'Person', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person, secondary: r.role }) },
                { key: 'pct', header: 'Allocation', type: 'number', value: (r) => r.percent, render: (r) => `${r.percent}% · ${Math.round((r.percent / 100) * 40)} h a week` },
                { key: 'from', header: 'From', type: 'date', value: (r) => r.from },
                { key: 'to', header: 'To', type: 'date', value: (r) => r.to },
                { key: 'tentative', header: 'Status', type: 'status', value: (r) => (r.tentative ? 'Tentative' : 'Confirmed'), statusTone: (v) => (v === 'Tentative' ? 'warning' : 'success') },
              ]}
              rowActions={persona === 'pm' ? () => (<><MenuItem>Change allocation</MenuItem><MenuItem destructive>End allocation</MenuItem></>) : undefined}
              empty={<EmptyState title="No one is allocated yet." description="Only allocated people can book time to this project." />}
            />
          </TabsContent>
          <TabsContent value="tasks">
            <div className="yx-hire-stack">
              <DataTable
                label="Tasks"
                rows={tasks}
                getRowId={(r) => r.id}
                columns={[
                  { key: 'name', header: 'Task', value: (r) => r.name },
                  { key: 'billable', header: 'Billable', type: 'status', value: (r) => (r.billable ? 'Billable' : 'Non-billable'), statusTone: (v) => (v === 'Billable' ? 'info' : 'neutral') },
                  { key: 'budget', header: 'Budget hours', type: 'number', value: (r) => r.budgetHours, total: 'sum' },
                  { key: 'used', header: 'Used hours', type: 'number', value: (r) => r.usedHours, total: 'sum' },
                  { key: 'burn', header: 'Burn', value: (r) => r.usedHours / r.budgetHours, width: 160, render: (r) => <Meter value={r.usedHours} max={r.budgetHours} label={`${r.name} burn`} /> },
                ]}
              />
              {milestones.length > 0 && (
                <Card title="Milestones" actions={<Text size="sm" tone="secondary">Contract value {formatINR(p.fee)}</Text>}>
                  {ms.warning && <InlineAlert tone="warning">{ms.warning}</InlineAlert>}
                  <ul className="yx-hire-list">
                    {milestones.map((m) => (
                      <li key={m.id} className="yx-hire-list__item">
                        <div className="yx-hire-list__main">
                          <Text weight="medium">
                            {m.name} · {m.pct}% · {formatINR(Math.round((p.fee * m.pct) / 100))}
                          </Text>
                          <Text size="sm" tone="secondary">
                            Due {formatDate(m.due)}
                            {m.needsClientAcceptance ? ' · client acceptance in the portal' : ''}
                          </Text>
                        </div>
                        <Badge tone={m.status === 'invoiced' ? 'success' : m.status === 'completed' ? 'warning' : m.status === 'accepted' ? 'info' : 'neutral'}>
                          {m.status === 'completed' && m.needsClientAcceptance ? 'Completed · waiting for client' : m.status[0].toUpperCase() + m.status.slice(1)}
                        </Badge>
                        {m.status === 'planned' && persona === 'pm' && <Button size="sm">Mark complete</Button>}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </TabsContent>
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
          {persona !== 'hr' && (
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
        </Tabs>
      </RecordLayout>
    </ProjectsFrame>
  );
}

/* ================================================================== PRJ-02 · Timesheet approvals */

export interface TimesheetApprovalsProps {
  groups: ApprovalGroup[];
  clientApproval?: boolean;
  state?: ListState;
  bulkConfirm?: boolean;
}

function ApprovalGroups({ groups, onBulk, done }: { groups: ApprovalGroup[]; onBulk: (ids: string[]) => void; done: string[] }) {
  return (
    <>
      {groups.map((g) => {
        const items = g.items.filter((i) => !done.includes(i.id));
        const eligible = items.filter((i) => bulkEligible({ id: i.id, hours: i.lines.reduce((s, l) => s + l.hours, 0), allocatedHours: i.allocatedHours }));
        return (
          <section key={g.project} className="yx-hire-stack" aria-label={`${g.project}, ${g.week}`}>
            <div className="yx-hire-row">
              <div>
                <Text weight="semibold">{g.project}</Text>
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
            {items.length === 0 ? (
              <Text size="sm" tone="secondary">
                All approved for this week.
              </Text>
            ) : (
              <div className="yx-hire-approvals">
                {items.map((i) => (
                  <div key={i.id} className="yx-hire-stack">
                    {i.mismatch && <InlineAlert tone="warning">{i.mismatch}. Pay is unchanged; check before approving.</InlineAlert>}
                    <TimesheetApprovalCard employee={{ name: i.employee, secondary: `${i.role} · allocated ${i.allocatedHours} h` }} weekLabel={g.week} lines={i.lines} onApprove={() => {}} onSendBack={() => {}} />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

// PRJ-02
export function TimesheetApprovalsScreen({ groups, clientApproval = false, state = 'ready', bulkConfirm = false }: TimesheetApprovalsProps) {
  const [done, setDone] = useState<string[]>([]);
  const [pending, setPending] = useState<string[] | null>(bulkConfirm ? groups[0].items.filter((i) => bulkEligible({ id: i.id, hours: i.lines.reduce((s, l) => s + l.hours, 0), allocatedHours: i.allocatedHours })).map((i) => i.id) : null);
  const total = groups.reduce((s, g) => s + g.items.length, 0) - done.length;
  return (
    <ProjectsFrame active="Timesheet approvals">
      <PageHeader
        title="Timesheet approvals"
        description="Grouped by project and week. Approve, reduce or reject lines with a reason the employee sees. Weeks within the allocation can be approved in bulk."
        facts={
          <div className="yx-hire-actions">
            <Select aria-label="Project" value="all" onChange={() => {}} options={[{ value: 'all', label: 'All my projects' }, { value: 'p1', label: 'NRP-WEB' }, { value: 'p2', label: 'CLL-WMS' }]} />
            <Select aria-label="Week" value="w39" onChange={() => {}} options={[{ value: 'w39', label: 'Week of 21 Sep 2026' }, { value: 'w38', label: 'Week of 14 Sep 2026' }]} />
          </div>
        }
      />
      {clientApproval && <InlineAlert tone="info">NRP-WEB needs client approval after yours: approved lines go to Rekha Balan in the client portal before they can be billed.</InlineAlert>}
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
        <ApprovalGroups groups={groups} onBulk={setPending} done={done} />
      )}
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

export interface CapacityProps {
  weeks: string[];
  people: CapacityPerson[];
  utilisationRows: { person: string; billable: number; available: number }[];
  target: number;
  persona: 'pm' | 'hr';
  teamSize?: number;
  loading?: boolean;
}

// PRJ-03
export function CapacityBoardScreen({ weeks, people, utilisationRows, target, persona, teamSize = people.length, loading }: CapacityProps) {
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

// PRJ-04
export function CostingMarginScreen({ rows, persona, period = 'Sep 2026', loading }: { rows: CostRow[]; persona: 'finance' | 'pm'; period?: string; loading?: boolean }) {
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
