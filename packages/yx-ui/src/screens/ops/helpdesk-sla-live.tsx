// HLP-05 SLA dashboard, live (Helpdesk design wiring): the designed SlaDashboardScreen in helpdesk.tsx renders this when
// the page passes `live`. The design's layout (header with period and export, four stat cards, breaches by queue,
// the weekly trend, the at-risk table with Reassign, agent load) with the server's exact figures, plus the states the
// old Service desk reports page had, drawn in the same layout as tabs: desk numbers, KPIs with targets, the report
// library, the self-service funnel, my reports and schedules, wall screens, customer reports and NPS surveys. Counts
// only, except the at-risk list, which holds only tickets the person may open; the server checks every action.
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Download, Play, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { BarChart, LineChart, StatCard } from '../../components/charts';
import { Checkbox } from '../../components/choice';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { PlainTable } from '../../components/plain-table';
import { Segment } from '../../components/segment';
import { MultiSelect, Select } from '../../components/select';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { formatDate } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { CopyValue, OPEN_STATES, PRIORITY_LABEL, STATE_LABEL, when } from '../desk/desk-kit';
import type { DeskSummary, LoadState, SystemState } from '../desk/types';
import type {
  CustomReport,
  CustomReportInput,
  CustomerMonthReport,
  FunnelStep,
  Kpi,
  LibraryReport,
  Rag,
  ReportDashboard,
  ReportTable,
  ScheduleFrequency,
  SlaAtRiskRow,
  SlaDashboard,
  Survey,
  SurveyAnswer,
  SurveyInput,
  UserHit,
  Wallboard,
  WallboardInput,
} from '../desk/report-types';
import { CardGrid, OpsDesk, SlaBadge, useSay } from './ops-kit';

export type SlaReportTab = 'sla' | 'numbers' | 'kpis' | 'library' | 'funnel' | 'mine' | 'walls' | 'customers' | 'surveys';
export type SlaDays = '7' | '30' | '90';

/** Columns a custom report may hold, in plain words (the server's allowed list). */
export const REPORT_COLUMNS: Record<string, string> = {
  number: 'Number',
  subject: 'Subject',
  desk: 'Desk',
  status: 'Status',
  state: 'State',
  priority: 'Priority',
  category: 'Category',
  group: 'Group',
  assignee: 'Assignee',
  requester: 'Requester',
  account: 'Company',
  channel: 'Raised from',
  created: 'Raised',
  first_response: 'First reply',
  resolved: 'Solved',
  rating: 'Rating',
  tags: 'Tags',
};

export interface LiveSla {
  /** The page itself (permissions loaded). */
  state: LoadState;
  onRetry: () => void;
  /** desk.report.view / desk.report.manage / desk.survey.manage; customer reports also need desk.customer.manage or desk.desk.create; Reassign needs desk.ticket.assign. */
  canView: boolean;
  canManage: boolean;
  canSurveys: boolean;
  canCustomers: boolean;
  canAssign: boolean;
  desks: DeskSummary[];
  tab: SlaReportTab;
  onTab: (tab: SlaReportTab) => void;
  /** The data of the open tab. */
  tabState: LoadState;
  onRetryTab: () => void;
  days: SlaDays;
  onDays: (d: SlaDays) => void;
  /** null: every desk I report on. */
  deskId: string | null;
  onDesk: (deskId: string | null) => void;
  /** Where "View open tickets" goes. */
  ticketsHref: string;
  sla: SlaDashboard | null;
  onExport: () => Promise<void>;
  onOpenTicket: (id: string) => void;
  onLoadTeam: (deskId: string) => Promise<{ userId: string; name: string }[]>;
  onReassign: (ticket: SlaAtRiskRow, userId: string) => Promise<unknown>;
  dashboard: ReportDashboard | null;
  kpis: Kpi[];
  onSetTarget: (deskId: string, input: { metric: string; target: number; amber: number }) => Promise<void>;
  library: LibraryReport[];
  onRunReport: (key: string) => Promise<ReportTable>;
  onDownloadReport: (key: string) => Promise<void>;
  funnel: FunnelStep[];
  customReports: CustomReport[];
  onSaveCustom: (report: CustomReport | null, input: CustomReportInput) => Promise<void>;
  onDeleteCustom: (id: string) => Promise<void>;
  onRunCustom: (id: string) => Promise<ReportTable>;
  onDownloadCustom: (id: string) => Promise<void>;
  onSchedule: (reportId: string, input: { frequency: ScheduleFrequency; recipients: string[] }) => Promise<void>;
  onEndSchedule: (scheduleId: string) => Promise<void>;
  onSearchUsers: (q: string) => Promise<UserHit[]>;
  wallboards: Wallboard[];
  onCreateWallboard: (input: WallboardInput) => Promise<{ id: string; url: string }>;
  onRevokeWallboard: (id: string) => Promise<void>;
  accounts: { id: string; name: string }[];
  onCustomerReport: (accountId: string, month: string) => Promise<CustomerMonthReport>;
  surveys: Survey[];
  onSaveSurvey: (survey: Survey | null, input: SurveyInput) => Promise<void>;
  onLoadAnswers: (surveyId: string) => Promise<SurveyAnswer[]>;
  /** Stories and tests only: the Reassign dialog open on first render. */
  start?: { reassignId?: string };
}

const RAG_TEXT: Record<Rag, { label: string; tone: BadgeTone }> = {
  green: { label: 'Green · on target', tone: 'success' },
  amber: { label: 'Amber · near the limit', tone: 'warning' },
  red: { label: 'Red · off target', tone: 'danger' },
};
const FREQ_LABEL: Record<ScheduleFrequency, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const ALL = 'all';
/** "—" for no value, else the number with its unit. */
export const numText = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '—' : `${v}${unit}`);
export const npsText = (v: number | null) => (v === null ? '—' : v > 0 ? `+${v}` : String(v));
const cellText = (v: string | number | null) => (v === null || v === '' ? '—' : typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? when(v) : String(v));
const deskNames = (desks: DeskSummary[], ids: string[]) => ids.map((id) => desks.find((d) => d.id === id)?.name ?? 'A desk').join(', ');
/** "2 Nov" for a YYYY-MM-DD week start on a chart axis. */
const dayMonth = (iso: string) => formatDate(new Date(`${iso}T00:00:00`)).replace(/ \d{4}$/, '');
/** A drill that opens another tab of this page instead of leaving it. */
const toTab = (go: () => void) => (e: MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  go();
};

export function LiveSlaDashboard({ live }: { live: LiveSla }) {
  const tabs: [SlaReportTab, string, boolean][] = [
    ['sla', 'Response targets', live.canView],
    ['numbers', 'Desk numbers', live.canView],
    ['kpis', 'KPIs', live.canView],
    ['library', 'Report library', live.canView],
    ['funnel', 'Self-service', live.canView],
    ['mine', 'My reports', live.canView],
    ['walls', 'Wall screens', live.canView],
    ['customers', 'Customer reports', live.canView && live.canCustomers],
    ['surveys', 'Surveys', live.canSurveys],
  ];
  const shown = tabs.filter(([, , ok]) => ok);
  const periodTab = ['sla', 'numbers', 'library', 'funnel'].includes(live.tab);
  const deskTab = periodTab || live.tab === 'kpis';
  const { busy, error, run } = useRun();
  if (live.state !== 'ready')
    return (
      <OpsDesk area="helpdesk" active="SLAs">
        <PageHeader title="SLAs" />
        {live.state === 'no-access' ? (
          <NoAccessState what="SLAs and desk reports" grantedBy="your Service Desk admin (desk.report.view)" note="It shows how the desks you lead or run keep their response targets." />
        ) : live.state === 'error' ? (
          <ErrorState title="We couldn't load SLAs and reports." description="Nothing has changed. Try again in a moment." onRetry={live.onRetry} />
        ) : (
          <SlaBody live={live} loading />
        )}
      </OpsDesk>
    );
  const body = (node: ReactNode) =>
    live.tabState === 'error' ? (
      <ErrorState title="We couldn't load this report." description="Nothing has changed. Try again in a moment." onRetry={live.onRetryTab} />
    ) : live.tabState === 'no-access' ? (
      <NoAccessState what="this report" grantedBy="your Service Desk admin" />
    ) : (
      node
    );
  return (
    <OpsDesk area="helpdesk" active="SLAs">
      <PageHeader
        title="SLAs"
        description="Response and resolution against targets, by queue. Targets use each queue's business hours and pause while waiting on the employee."
        actions={
          <>
            {deskTab && (
              <Select
                aria-label="Queue"
                size="sm"
                value={live.deskId ?? (live.tab === 'kpis' ? null : ALL)}
                onChange={(v) => live.onDesk(!v || v === ALL ? null : v)}
                options={[...(live.tab === 'kpis' ? [] : [{ value: ALL, label: 'All my queues' }]), ...live.desks.map((d) => ({ value: d.id, label: d.name }))]}
                placeholder="Choose a queue"
              />
            )}
            {periodTab && (
              <Select
                aria-label="Period"
                size="sm"
                value={live.days}
                onChange={(v) => v && live.onDays(v as SlaDays)}
                options={[
                  { value: '7', label: 'Last 7 days' },
                  { value: '30', label: 'Last 30 days' },
                  { value: '90', label: 'Last 90 days' },
                ]}
              />
            )}
            {live.tab === 'sla' && (
              <Button icon={Download} loading={busy === 'export'} onClick={() => void run('export', live.onExport)}>
                Export
              </Button>
            )}
          </>
        }
      />
      {error && (
        <InlineAlert tone="danger" title="The export didn't work">
          {error}
        </InlineAlert>
      )}
      <Tabs value={live.tab} onValueChange={(v) => live.onTab(v as SlaReportTab)}>
        <TabsList aria-label="SLAs and reports">
          {shown.map(([v, label]) => (
            <TabsTrigger key={v} value={v}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="sla">{body(<SlaBody live={live} loading={live.tabState === 'loading'} />)}</TabsContent>
        <TabsContent value="numbers">{body(<NumbersView live={live} />)}</TabsContent>
        <TabsContent value="kpis">{body(<KpisView live={live} />)}</TabsContent>
        <TabsContent value="library">{body(<LibraryView live={live} />)}</TabsContent>
        <TabsContent value="funnel">{body(<FunnelView live={live} />)}</TabsContent>
        <TabsContent value="mine">{body(<MyReportsView live={live} />)}</TabsContent>
        <TabsContent value="walls">{body(<WallsView live={live} />)}</TabsContent>
        <TabsContent value="customers">{body(<CustomerReportView live={live} />)}</TabsContent>
        <TabsContent value="surveys">{body(<SurveysView live={live} />)}</TabsContent>
      </Tabs>
    </OpsDesk>
  );
}

// ---------------------------------------------------------------------------------------------- the design's dashboard

function SlaBody({ live, loading }: { live: LiveSla; loading: boolean }) {
  const s = live.sla;
  const [reassign, setReassign] = useState<SlaAtRiskRow | null>(() => s?.atRisk.find((t) => t.id === live.start?.reassignId) ?? null);
  if (!loading && s && s.open === 0 && s.queues.every((q) => q.met + q.breached === 0))
    return <EmptyState title="No tickets in this period." description="SLA figures appear once your queues receive tickets." />;
  const prev = `the ${live.days} days before`;
  const weeks = s?.weeks ?? [];
  const columns: TableColumn<SlaAtRiskRow>[] = [
    { key: 'id', header: 'Ticket', type: 'id', value: (t) => t.number },
    { key: 'subject', header: 'Subject', value: (t) => t.subject },
    { key: 'queue', header: 'Queue', value: (t) => t.deskName },
    { key: 'sla', header: 'Resolution SLA', value: (t) => t.resolution.usedMinutes / Math.max(1, t.resolution.targetMinutes), render: (t) => <SlaBadge elapsedMin={t.resolution.usedMinutes} targetMin={t.resolution.targetMinutes} paused={t.resolution.paused} /> },
    { key: 'assignee', header: 'Assignee', type: 'person', value: (t) => t.assignee?.name ?? 'Unassigned', person: (t) => ({ name: t.assignee?.name ?? 'Unassigned' }) },
  ];
  return (
    <div className="yx-ops-stack">
      <CardGrid min="sm">
        <StatCard label="Open tickets" value={s?.open ?? 0} drill={{ label: `View ${s?.open ?? 0} open tickets`, href: live.ticketsHref }} loading={loading} />
        <StatCard label="Breached now" value={s?.breachedNow ?? 0} drill={{ label: 'View breached tickets', href: '#sla-at-risk' }} loading={loading} />
        <StatCard
          label="First response met"
          value={s?.firstResponseMetPct ?? 0}
          unit="%"
          previous={s?.firstResponseMetPctBefore ?? undefined}
          previousLabel={prev}
          trend={s ? trendOf(s.firstResponseWeeks) : undefined}
          empty={s && s.firstResponseMetPct === null ? 'No first responses due in this period' : undefined}
          drill={{ label: 'View first responses', href: '#library', onClick: toTab(() => live.onTab('library')) }}
          loading={loading}
        />
        <StatCard
          label="Answered by an article"
          value={s?.articlePct ?? 0}
          unit="%"
          previous={s?.articlePctBefore ?? undefined}
          previousLabel={prev}
          empty={s && s.articlePct === null ? 'No searches or tickets in this period' : undefined}
          drill={{ label: 'View deflected searches', href: '#funnel', onClick: toTab(() => live.onTab('funnel')) }}
          loading={loading}
        />
      </CardGrid>
      <CardGrid min="lg">
        <BarChart
          title="Resolution breaches by queue"
          xLabel="Queue"
          categories={(s?.queues ?? []).map((q) => q.name)}
          series={[
            { name: 'Breached', values: (s?.queues ?? []).map((q) => q.breached) },
            { name: 'Met', values: (s?.queues ?? []).map((q) => q.met) },
          ]}
          stacked
          emphasis="Breached"
          loading={loading}
        />
        <LineChart
          title="Resolution target met, weekly"
          xLabel="Week"
          categories={weeks.map((w) => dayMonth(w.week))}
          series={[{ name: 'Met %', values: weeks.map((w) => w.metPct) }]}
          target={s?.resolutionTarget != null ? { value: s.resolutionTarget, label: `Target ${s.resolutionTarget}%` } : undefined}
          yMin={Math.max(0, Math.min(70, ...weeks.map((w) => w.metPct ?? 100)) - 10)}
          loading={loading}
        />
      </CardGrid>
      <section id="sla-at-risk">
        <Card title={`At risk or breached (${s?.atRiskCount ?? 0})`}>
          {s && s.atRiskHidden > 0 && (
            <p className="yx-ops-muted">
              {s.atRiskHidden} more {s.atRiskHidden === 1 ? 'is' : 'are'} sensitive or private and stay with that desk's own team.
            </p>
          )}
          <DataTable
            label="At risk or breached tickets"
            columns={columns}
            rows={s?.atRisk ?? []}
            getRowId={(t) => t.id}
            state={loading ? 'loading' : 'ready'}
            empty={<EmptyState compact title="Nothing at risk right now." />}
            onRowClick={(t) => live.onOpenTicket(t.id)}
            rowButtons={(t) =>
              live.canAssign ? (
                <Button size="sm" onClick={() => setReassign(t)}>
                  Reassign
                </Button>
              ) : (
                <Button size="sm" onClick={() => live.onOpenTicket(t.id)}>
                  Open ticket
                </Button>
              )
            }
          />
        </Card>
      </section>
      <Card title="Agent load">
        <DataTable
          label="Agent load"
          columns={[
            { key: 'agent', header: 'Agent', type: 'person', value: (r: SlaDashboard['agents'][number]) => r.name, person: (r) => ({ name: r.name, secondary: r.desks }) },
            { key: 'open', header: 'Open', type: 'number', value: (r) => r.open },
            { key: 'risk', header: 'At risk', type: 'number', value: (r) => r.atRisk },
            { key: 'csat', header: 'Rating (of 5)', type: 'number', value: (r) => r.rating, render: (r) => numText(r.rating) },
          ]}
          rows={s?.agents ?? []}
          getRowId={(r) => r.userId}
          state={loading ? 'loading' : 'ready'}
          empty={<EmptyState compact title="No open tickets are assigned to anyone." />}
        />
      </Card>
      {reassign && <ReassignDialog ticket={reassign} live={live} onClose={() => setReassign(null)} />}
    </div>
  );
}

const trendOf = (weeks: { metPct: number | null }[]) => {
  const v = weeks.map((w) => w.metPct).filter((x): x is number => x !== null);
  return v.length >= 2 ? v : undefined;
};

function ReassignDialog({ ticket, live, onClose }: { ticket: SlaAtRiskRow; live: LiveSla; onClose: () => void }) {
  const [team, setTeam] = useState<{ userId: string; name: string }[] | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const { toast } = useSay();
  useEffect(() => {
    void run('team', async () => setTeam(await live.onLoadTeam(ticket.deskId)));
  }, [ticket.deskId]); // eslint-disable-line react-hooks/exhaustive-deps
  const early = useTooEarly(to ? [] : [{ fieldId: 'sla-to', message: 'Choose who takes the ticket.' }]);
  const options = (team ?? []).filter((m) => m.userId !== ticket.assignee?.id).map((m) => ({ value: m.userId, label: m.name }));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Reassign ${ticket.number}`}
      description={ticket.subject}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() =>
              !early.stop() &&
              void run('save', async () => {
                await live.onReassign(ticket, to!);
                toast({ title: `${ticket.number} is now with ${options.find((o) => o.value === to)?.label ?? 'them'}.` });
                onClose();
              })
            }
          >
            Reassign
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && (
          <InlineAlert tone="danger" title="The ticket was not reassigned">
            {error}
          </InlineAlert>
        )}
        <p className="yx-ops-muted">
          Now with {ticket.assignee?.name ?? 'nobody'}. The resolution clock keeps running; it is not restarted.
        </p>
        <FormField id="sla-to" label="Give it to" required error={early.errorOf('sla-to')} helper={team && !options.length ? 'Nobody else on this queue can take it.' : undefined}>
          <Select value={to} onChange={setTo} options={options} placeholder={team ? 'Choose an agent' : 'Loading the team…'} searchable emptyText="No agent matches" />
        </FormField>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------- desk numbers (was the dashboard)

function NumbersView({ live }: { live: LiveSla }) {
  const d = live.dashboard;
  if (!d) return <SkeletonGrid />;
  const lib = { label: 'View in the report library', href: '#library', onClick: toTab(() => live.onTab('library')) };
  const tickets = (n: number) => ({ label: `View ${n} tickets`, href: live.ticketsHref });
  const hours = (label: string, v: number | null, hint: string) => <StatCard label={label} value={v ?? 0} unit="hours" empty={v === null ? 'Nothing to measure in this period' : undefined} drill={{ ...lib, label: hint }} />;
  const pct = (label: string, v: number | null) => <StatCard label={label} value={v ?? 0} unit="%" empty={v === null ? 'Nothing to measure in this period' : undefined} drill={lib} />;
  return (
    <div className="yx-ops-stack">
      <CardGrid min="sm">
        <StatCard label="Open tickets (backlog)" value={d.backlog} drill={tickets(d.backlog)} />
        <StatCard label="Open and unassigned" value={d.unassigned} drill={tickets(d.unassigned)} />
        <StatCard label="New in the period" value={d.created} drill={lib} />
        <StatCard label="Solved in the period" value={d.solved} drill={lib} />
        {hours('First reply', d.firstResponseHours, 'Average · view in the report library')}
        {hours('Time to pick up (MTTA)', d.mttaHours, 'Average, raised to first assigned')}
        {hours('Time to solve (MTTR)', d.mttrHours, 'Average · view in the report library')}
        {pct('Response targets met', d.slaMetPct)}
        {pct('Solved with one reply', d.fcrPct)}
        <StatCard label="Happy ratings" value={d.csatPct ?? 0} unit="%" empty={d.csatPct === null ? 'No ratings in this period' : undefined} drill={{ ...lib, label: `${d.ratings} ${d.ratings === 1 ? 'rating' : 'ratings'}${d.csatAverage !== null ? `, average ${d.csatAverage} of 5` : ''}` }} />
      </CardGrid>
      <Card title="Self-service">
        <CardGrid min="sm">
          <StatCard label="Help-centre searches" value={d.selfService.searches} drill={{ label: 'View the self-service funnel', href: '#funnel', onClick: toTab(() => live.onTab('funnel')) }} />
          <StatCard label="Articles read" value={d.selfService.views} drill={{ label: 'View the self-service funnel', href: '#funnel', onClick: toTab(() => live.onTab('funnel')) }} />
          <StatCard label="Solved by an article" value={d.selfService.solved} drill={{ label: 'View the self-service funnel', href: '#funnel', onClick: toTab(() => live.onTab('funnel')) }} />
        </CardGrid>
      </Card>
      <BarChart
        title="How long open tickets have waited"
        xLabel="Waiting"
        categories={['Under a day', '1 to 3 days', '3 to 7 days', 'Over a week']}
        series={[{ name: 'Open tickets', values: [d.ageing.day, d.ageing.threeDays, d.ageing.week, d.ageing.older] }]}
        height={200}
      />
      <Card title="Agents">
        <DataTable
          label="Agents"
          columns={[
            { key: 'name', header: 'Agent', type: 'person', value: (a: ReportDashboard['agents'][number]) => a.name, person: (a) => ({ name: a.name }) },
            { key: 'solved', header: 'Solved', type: 'number', value: (a) => a.solved },
            { key: 'open', header: 'Open now', type: 'number', value: (a) => a.open },
            { key: 'hours', header: 'Average hours to solve', type: 'number', value: (a) => a.resolutionHours, render: (a) => numText(a.resolutionHours) },
            { key: 'rating', header: 'Average rating (1 to 5)', type: 'number', value: (a) => a.rating, render: (a) => numText(a.rating) },
          ]}
          rows={d.agents}
          getRowId={(a) => a.userId}
          empty={<EmptyState compact title="No tickets assigned to anyone yet." />}
        />
      </Card>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <CardGrid min="sm">
      {['One', 'Two', 'Three', 'Four'].map((k) => (
        <StatCard key={k} label="Loading" value={0} drill={{ label: '', href: '#' }} loading />
      ))}
    </CardGrid>
  );
}

// ---------------------------------------------------------------------------------------------- KPIs

function KpisView({ live }: { live: LiveSla }) {
  const [editing, setEditing] = useState<Kpi | null>(null);
  if (!live.deskId) return <EmptyState compact title="Choose a queue to see its KPIs." description="Use the Queue choice at the top." />;
  return (
    <div className="yx-ops-stack">
      <CardGrid>
        {live.kpis.map((k) => {
          const rag = k.latest?.rag ? RAG_TEXT[k.latest.rag] : null;
          const days = k.points.map((p) => p.day);
          const ahead = k.forecast.map((_, i) => `+${i + 1} d`);
          return (
            <Card key={k.metric} title={k.label} actions={live.canManage ? <Button size="sm" onClick={() => setEditing(k)}>Set target</Button> : undefined}>
              <div className="yx-ops-stack" data-gap="sm">
                <div className="yx-ops-row">
                  <strong>{numText(k.latest?.value)}</strong>
                  {rag ? <Badge tone={rag.tone}>{rag.label}</Badge> : <Badge tone="neutral">No target set</Badge>}
                </div>
                <p className="yx-ops-muted">
                  {k.target !== null ? `Target ${k.target} · amber limit ${k.amber} · ${k.higherIsBetter ? 'higher is better' : 'lower is better'}` : k.higherIsBetter ? 'Higher is better.' : 'Lower is better.'}
                  {k.latest ? ` Last recorded ${formatDate(new Date(`${k.latest.day}T00:00:00`))}.` : ' Nothing recorded yet.'}
                </p>
                {k.points.length < 2 ? (
                  <p className="yx-ops-muted">Not enough days recorded for a trend yet.</p>
                ) : (
                  <LineChart
                    title={`${k.label}, by day`}
                    xLabel="Day"
                    height={72}
                    categories={[...days.map(dayMonth), ...ahead]}
                    series={[
                      { name: 'Recorded', values: [...k.points.map((p) => p.value), ...k.forecast.map(() => null)] },
                      ...(k.forecast.length ? [{ name: 'Forecast, next 7 days', values: [...k.points.map((_, i) => (i === k.points.length - 1 ? k.points[i].value : null)), ...k.forecast] }] : []),
                    ]}
                    emphasis="Recorded"
                    target={k.target !== null ? { value: k.target, label: `Target ${k.target}` } : undefined}
                  />
                )}
              </div>
            </Card>
          );
        })}
      </CardGrid>
      {editing && live.deskId && <TargetDialog kpi={editing} onClose={() => setEditing(null)} onSave={(input) => live.onSetTarget(live.deskId!, input)} />}
    </div>
  );
}

function TargetDialog({ kpi, onClose, onSave }: { kpi: Kpi; onClose: () => void; onSave: (input: { metric: string; target: number; amber: number }) => Promise<void> }) {
  const [target, setTarget] = useState<number | null>(kpi.target);
  const [amber, setAmber] = useState<number | null>(kpi.amber);
  const { busy, error, run } = useRun();
  const { toast } = useSay();
  const wrong = target !== null && amber !== null && (kpi.higherIsBetter ? amber > target : amber < target);
  const wrongText = kpi.higherIsBetter ? 'The amber limit must not be above the target.' : 'The amber limit must not be below the target.';
  const early = useTooEarly([...(target === null ? [{ fieldId: 'rt-target', message: 'Give the target.' }] : []), ...(amber === null ? [{ fieldId: 'rt-amber', message: 'Give the amber limit.' }] : wrong ? [{ fieldId: 'rt-amber', message: wrongText }] : [])]);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Target for ${kpi.label.toLowerCase()}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() =>
              !early.stop() &&
              void run('save', async () => {
                await onSave({ metric: kpi.metric, target: target!, amber: amber! });
                toast({ title: 'Target saved.' });
                onClose();
              })
            }
          >
            Save target
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && (
          <InlineAlert tone="danger" title="The target was not saved">
            {error}
          </InlineAlert>
        )}
        <p className="yx-ops-muted">{kpi.higherIsBetter ? 'Higher is better: at or above the target is green, down to the amber limit is amber, below it is red.' : 'Lower is better: at or below the target is green, up to the amber limit is amber, above it is red.'}</p>
        <FormField id="rt-target" label="Target" required error={early.errorOf('rt-target')}>
          <NumberField decimals min={0} max={1_000_000} value={target} onChange={setTarget} />
        </FormField>
        <FormField id="rt-amber" label="Amber limit" required error={wrong ? wrongText : early.errorOf('rt-amber')}>
          <NumberField decimals min={0} max={1_000_000} value={amber} onChange={setAmber} />
        </FormField>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------- report library

function ResultTable({ table, label }: { table: ReportTable; label?: string }) {
  if (table.rows.length === 0) return <EmptyState compact title="No rows for this choice." />;
  return (
    <PlainTable
      label={label ?? table.title}
      columns={table.columns.map((c, j) => ({ key: String(j), header: c, cell: (r: { i: number; v: (string | number | null)[] }) => cellText(r.v[j]), rowHeader: j === 0 }))}
      rows={table.rows.map((v, i) => ({ i, v }))}
      getRowId={(r) => String(r.i)}
    />
  );
}

function LibraryView({ live }: { live: LiveSla }) {
  const [result, setResult] = useState<{ key: string; table: ReportTable } | null>(null);
  const { busy, error, run } = useRun();
  const practices = [...new Set(live.library.map((r) => r.practice))];
  return (
    <div className="yx-ops-stack">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <CardGrid>
        {practices.map((p) => (
          <Card key={p} title={p}>
            <ul className="yx-ops-list" aria-label={p}>
              {live.library
                .filter((r) => r.practice === p)
                .map((r) => (
                  <li key={r.key} className="yx-ops-list__item">
                    <span className="yx-ops-row" data-between>
                      <span>{r.name}</span>
                      <Button size="sm" icon={Play} loading={busy === `run:${r.key}`} aria-label={`Run ${r.name}`} onClick={() => void run(`run:${r.key}`, async () => setResult({ key: r.key, table: await live.onRunReport(r.key) }))}>
                        Run
                      </Button>
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </CardGrid>
      {result && (
        <Card
          title={result.table.title}
          actions={
            <Button size="sm" icon={Download} loading={busy === 'csv'} onClick={() => void run('csv', () => live.onDownloadReport(result.key))}>
              Download CSV
            </Button>
          }
        >
          <ResultTable table={result.table} />
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- self-service funnel

function FunnelView({ live }: { live: LiveSla }) {
  const counts = live.funnel.filter((s) => s.key !== 'rate');
  const rate = live.funnel.find((s) => s.key === 'rate');
  return (
    <CardGrid min="md">
      {rate && (
          <StatCard label="Self-service rate" value={rate.count} unit="%" drill={{ label: 'Solved by an article, of those solved by an article or raised as a ticket', href: '#library', onClick: toTab(() => live.onTab('library')) }} />
      )}
      <BarChart title="From a search to a ticket" xLabel="Step" orientation="horizontal" categories={counts.map((s) => s.label)} series={[{ name: 'Count', values: counts.map((s) => s.count) }]} />
    </CardGrid>
  );
}

// ---------------------------------------------------------------------------------------------- my reports

function MyReportsView({ live }: { live: LiveSla }) {
  const [edit, setEdit] = useState<CustomReport | 'new' | null>(null);
  const [scheduling, setScheduling] = useState<CustomReport | null>(null);
  const [result, setResult] = useState<{ id: string; table: ReportTable } | null>(null);
  const { busy, error, run } = useRun();
  const { toast } = useSay();
  return (
    <div className="yx-ops-stack">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <Card title="My reports" actions={live.canManage ? <Button size="sm" icon={Plus} onClick={() => setEdit('new')}>New report</Button> : undefined}>
        {live.customReports.length === 0 ? (
          <EmptyState compact title="No reports yet." description={live.canManage ? 'Choose the columns and filters you need, then run it or have it emailed.' : undefined} />
        ) : (
          <ul className="yx-ops-list" aria-label="My reports">
            {live.customReports.map((r) => {
              const own = r.mine && live.canManage;
              const on = r.schedules.filter((s) => s.active);
              return (
                <li key={r.id} className="yx-ops-list__item">
                  <span className="yx-ops-list__main">
                    <span className="yx-ops-row">
                      <strong>{r.name}</strong>
                      {r.shared && <Badge tone="info">Shared</Badge>}
                      {!r.mine && <Badge tone="neutral">Shared with you</Badge>}
                    </span>
                    <span className="yx-ops-list__sub">{r.columns.map((c) => REPORT_COLUMNS[c] ?? c).join(', ')}</span>
                    {on.map((s) => (
                      <span key={s.id} className="yx-ops-row">
                        <span className="yx-ops-muted">
                          {FREQ_LABEL[s.frequency]} to {s.recipients.length} {s.recipients.length === 1 ? 'person' : 'people'} · next {when(s.nextRunAt)}
                          {s.lastResult ? ` · last time: ${s.lastResult}` : ''}
                        </span>
                        {own && (
                          <Button size="sm" loading={busy === `end:${s.id}`} onClick={() => void run(`end:${s.id}`, async () => { await live.onEndSchedule(s.id); toast({ title: 'Schedule ended.' }); })}>
                            End schedule
                          </Button>
                        )}
                      </span>
                    ))}
                    <span className="yx-ops-row">
                      <Button size="sm" icon={Play} loading={busy === `run:${r.id}`} onClick={() => void run(`run:${r.id}`, async () => setResult({ id: r.id, table: await live.onRunCustom(r.id) }))}>
                        Run
                      </Button>
                      <Button size="sm" icon={Download} loading={busy === `csv:${r.id}`} onClick={() => void run(`csv:${r.id}`, () => live.onDownloadCustom(r.id))}>
                        Download CSV
                      </Button>
                      {own && (
                        <>
                          <Button size="sm" onClick={() => setScheduling(r)}>
                            Schedule
                          </Button>
                          <Button size="sm" onClick={() => setEdit(r)}>
                            Edit
                          </Button>
                          <ConfirmDialog
                            trigger={<Button size="sm" variant="danger">Delete</Button>}
                            title={`Delete the report ${r.name}?`}
                            consequence="Its schedules stop too. You can't undo this."
                            confirmLabel="Delete report"
                            destructive
                            onConfirm={async () => {
                              await live.onDeleteCustom(r.id);
                              toast({ title: 'Report deleted.' });
                            }}
                          />
                        </>
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {result && (
        <Card title={result.table.title}>
          <ResultTable table={result.table} />
        </Card>
      )}
      {edit && (
        <CustomReportDrawer
          report={edit === 'new' ? null : edit}
          desks={live.desks}
          onClose={() => setEdit(null)}
          onSave={async (input) => {
            await live.onSaveCustom(edit === 'new' ? null : edit, input);
            toast({ title: 'Report saved.' });
            setEdit(null);
          }}
        />
      )}
      {scheduling && (
        <ScheduleDrawer
          report={scheduling}
          onSearchUsers={live.onSearchUsers}
          onClose={() => setScheduling(null)}
          onSave={async (input) => {
            await live.onSchedule(scheduling.id, input);
            toast({ title: 'Schedule started.' });
            setScheduling(null);
          }}
        />
      )}
    </div>
  );
}

function CustomReportDrawer({ report, desks, onClose, onSave }: { report: CustomReport | null; desks: DeskSummary[]; onClose: () => void; onSave: (input: CustomReportInput) => Promise<void> }) {
  const f = report?.filters ?? {};
  const [name, setName] = useState(report?.name ?? '');
  const [columns, setColumns] = useState<string[]>(report?.columns ?? ['number', 'subject', 'status', 'priority', 'assignee', 'created']);
  const [deskIds, setDeskIds] = useState<string[]>(f.deskIds ?? []);
  const [states, setStates] = useState<string[]>(f.states ?? []);
  const [priorities, setPriorities] = useState<string[]>((f.priorities ?? []).map(String));
  const [days, setDays] = useState<number | null>(f.days ?? null);
  const [shared, setShared] = useState(report?.shared ?? false);
  const { busy, error, run } = useRun();
  const all: SystemState[] = [...OPEN_STATES, 'solved', 'closed'];
  const early = useTooEarly([...(name.trim() ? [] : [{ fieldId: 'rc-name', message: 'Name the report.' }]), ...(columns.length ? [] : [{ fieldId: 'rc-cols', message: 'Choose at least one column.' }])]);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={report ? `Edit ${report.name}` : 'New report'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() =>
              !early.stop() &&
              void run('save', () =>
                onSave({
                  name: name.trim(),
                  columns,
                  filters: {
                    ...(deskIds.length ? { deskIds } : {}),
                    ...(states.length ? { states } : {}),
                    ...(priorities.length ? { priorities: priorities.map(Number) } : {}),
                    ...(f.categoryIds?.length ? { categoryIds: f.categoryIds } : {}),
                    ...(days ? { days } : {}),
                  },
                  shared,
                }),
              )
            }
          >
            Save report
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && (
          <InlineAlert tone="danger" title="The report was not saved">
            {error}
          </InlineAlert>
        )}
        <FormField id="rc-name" label="Report name" required error={early.errorOf('rc-name')}>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField id="rc-cols" error={early.errorOf('rc-cols')} label="Columns" required helper="Never message text: only these ticket details.">
          <MultiSelect value={columns} onChange={setColumns} options={Object.entries(REPORT_COLUMNS).map(([value, label]) => ({ value, label }))} placeholder="Choose columns" />
        </FormField>
        <FormField label="Desks" helper="Empty: every desk you report on.">
          <MultiSelect value={deskIds} onChange={setDeskIds} options={desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Every desk" />
        </FormField>
        <FormField label="States" helper="Empty: any state.">
          <MultiSelect value={states} onChange={setStates} options={all.map((s) => ({ value: s, label: STATE_LABEL[s] }))} placeholder="Any state" />
        </FormField>
        <FormField label="Priorities" helper="Empty: any priority.">
          <MultiSelect value={priorities} onChange={setPriorities} options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: PRIORITY_LABEL[p] }))} placeholder="Any priority" />
        </FormField>
        <FormField label="Raised in the last … days" helper="Empty: any time.">
          <NumberField min={1} max={366} value={days} onChange={setDays} />
        </FormField>
        <Checkbox checked={shared} onChange={setShared} label="Share with everyone who sees desk reports" description="They see only the tickets they may see themselves." />
      </div>
    </Drawer>
  );
}

function ScheduleDrawer({ report, onSearchUsers, onClose, onSave }: { report: CustomReport; onSearchUsers: (q: string) => Promise<UserHit[]>; onClose: () => void; onSave: (input: { frequency: ScheduleFrequency; recipients: string[] }) => Promise<void> }) {
  const [frequency, setFrequency] = useState<ScheduleFrequency>('weekly');
  const [find, setFind] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [known, setKnown] = useState<UserHit[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const { busy, error, run } = useRun();
  useEffect(() => {
    if (!find.trim()) return;
    const h = setTimeout(() => void onSearchUsers(find.trim()).then(setHits).catch(() => setHits([])), 250);
    return () => clearTimeout(h);
  }, [find]); // eslint-disable-line react-hooks/exhaustive-deps
  const early = useTooEarly(recipients.length ? [] : [{ fieldId: 'rs-to', message: 'Choose at least one colleague.' }]);
  const options = [...known, ...hits.filter((u) => !known.some((k) => k.id === u.id))].map((u) => ({ value: u.id, label: u.name ?? u.email, description: u.email }));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Email ${report.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void run('save', () => onSave({ frequency, recipients }))}>
            Start schedule
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && (
          <InlineAlert tone="danger" title="The schedule was not saved">
            {error}
          </InlineAlert>
        )}
        <p className="yx-ops-muted">Each person gets a CSV at 7 am India time, holding only the tickets they may see themselves.</p>
        <FormField label="How often">
          <Segment label="How often" value={frequency} onChange={setFrequency} options={(['daily', 'weekly', 'monthly'] as const).map((v) => ({ value: v, label: FREQ_LABEL[v] }))} />
        </FormField>
        <FormField label="Find a colleague" helper="Name or email">
          <TextField type="search" value={find} onChange={setFind} />
        </FormField>
        <FormField id="rs-to" label="Send to" required error={early.errorOf('rs-to')}>
          <MultiSelect
            value={recipients}
            onChange={(ids) => {
              setKnown(options.filter((o) => ids.includes(o.value)).map((o) => ({ id: o.value, name: o.label, email: String(o.description ?? '') })));
              setRecipients(ids);
            }}
            options={options}
            placeholder="Choose colleagues"
            emptyText="Find a colleague above"
          />
        </FormField>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------- wall screens

function WallsView({ live }: { live: LiveSla }) {
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const { error, run } = useRun();
  const { toast } = useSay();
  return (
    <div className="yx-ops-stack">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      {link && (
        <InlineAlert tone="warning" title="Copy the link now, it is shown once" actions={<Button size="sm" onClick={() => setLink(null)}>I have copied it</Button>}>
          <span className="yx-ops-stack" data-gap="sm">
            <span>Open this link on the wall screen. It opens without signing in and shows counts only, never ticket text. Anyone with the link can see the counts, so keep it private. If it gets out, switch the screen off and make a new one.</span>
            <CopyValue label="Wall screen link" value={link} />
          </span>
        </InlineAlert>
      )}
      <Card title="Wall screens" actions={live.canManage ? <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>New wall screen</Button> : undefined}>
        {live.wallboards.length === 0 ? (
          <EmptyState compact title="No wall screens yet." description="A wall screen shows each desk's open, unassigned and late counts on a TV, refreshed every minute." />
        ) : (
          <ul className="yx-ops-list" aria-label="Wall screens">
            {live.wallboards.map((w) => (
              <li key={w.id} className="yx-ops-list__item">
                <span className="yx-ops-row" data-between>
                  <span className="yx-ops-list__main">
                    <strong>{w.name}</strong>
                    <span className="yx-ops-list__sub">
                      {deskNames(live.desks, w.deskIds)}
                      {w.backlogAlert !== null ? ` · leads are told above ${w.backlogAlert} open tickets` : ''} · made {when(w.createdAt)}
                    </span>
                  </span>
                  {live.canManage && (
                    <ConfirmDialog
                      trigger={<Button size="sm" variant="danger">Switch off</Button>}
                      title={`Switch off ${w.name}?`}
                      consequence="Its link stops working at once. You can't switch it back on; make a new wall screen instead."
                      confirmLabel="Switch off"
                      destructive
                      onConfirm={() => run(`off:${w.id}`, async () => { await live.onRevokeWallboard(w.id); toast({ title: `${w.name} is switched off.` }); }).then(() => undefined)}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {creating && (
        <WallDrawer
          desks={live.desks}
          onClose={() => setCreating(false)}
          onSave={async (input) => {
            const r = await live.onCreateWallboard(input);
            setCreating(false);
            setLink(r.url);
          }}
        />
      )}
    </div>
  );
}

function WallDrawer({ desks, onClose, onSave }: { desks: DeskSummary[]; onClose: () => void; onSave: (input: WallboardInput) => Promise<void> }) {
  const [name, setName] = useState('');
  const [deskIds, setDeskIds] = useState<string[]>([]);
  const [alert, setAlert] = useState<number | null>(null);
  const { busy, error, run } = useRun();
  const early = useTooEarly([...(name.trim() ? [] : [{ fieldId: 'rw-name', message: 'Name the wall screen.' }]), ...(deskIds.length ? [] : [{ fieldId: 'rw-desks', message: 'Choose at least one desk.' }])]);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="New wall screen"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void run('save', () => onSave({ name: name.trim(), deskIds, ...(alert ? { backlogAlert: alert } : {}) }))}>
            Make the link
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && (
          <InlineAlert tone="danger" title="The wall screen was not made">
            {error}
          </InlineAlert>
        )}
        <FormField id="rw-name" label="Name" required error={early.errorOf('rw-name')} helper="For example: IT floor TV">
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField id="rw-desks" label="Desks" required error={early.errorOf('rw-desks')} helper="Up to 10.">
          <MultiSelect value={deskIds} onChange={(v) => setDeskIds(v.slice(0, 10))} options={desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose desks" />
        </FormField>
        <FormField label="Queue alert line" optional helper="Tell the desks' team leads when open tickets go above this number.">
          <NumberField min={1} max={100_000} value={alert} onChange={setAlert} />
        </FormField>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------- customer reports

function CustomerReportView({ live }: { live: LiveSla }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rep, setRep] = useState<CustomerMonthReport | null>(null);
  const { busy, error, run } = useRun();
  const early = useTooEarly(accountId ? [] : [{ fieldId: 'rr-account', message: 'Choose a company first.' }]);
  return (
    <div className="yx-ops-stack">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <Card title="Customer report">
        <div className="yx-ops-row">
          <FormField id="rr-account" label="Customer company" error={early.errorOf('rr-account')}>
            <Select value={accountId} onChange={setAccountId} options={live.accounts.map((a) => ({ value: a.id, label: a.name }))} placeholder="Choose a company" searchable emptyText="No company matches" />
          </FormField>
          <FormField label="Month">
            <TextField type="month" value={month} onChange={(m) => m && setMonth(m)} />
          </FormField>
          <Button loading={busy === 'show'} onClick={() => !early.stop() && void run('show', async () => setRep(await live.onCustomerReport(accountId!, month)))}>
            Show report
          </Button>
        </div>
      </Card>
      {rep && (
        <Card title={`${rep.account}, ${rep.month}`}>
          <p className="yx-ops-muted">
            {rep.tickets} {rep.tickets === 1 ? 'ticket' : 'tickets'} raised this month.
          </p>
          <ResultTable
            label="Response targets"
            table={{ title: 'Response targets', columns: ['Measure', 'Severity', 'On time', 'Late', 'On time %'], rows: rep.lines.map((l) => [l.measure, `P${l.severity}`, l.kept, l.missed, l.kept + l.missed ? Math.round((l.kept * 1000) / (l.kept + l.missed)) / 10 : null]) }}
          />
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- NPS surveys

function SurveysView({ live }: { live: LiveSla }) {
  const [edit, setEdit] = useState<Survey | 'new' | null>(null);
  const [answers, setAnswers] = useState<{ survey: Survey; rows: SurveyAnswer[] } | null>(null);
  const { busy, error, run } = useRun();
  const { toast } = useSay();
  return (
    <div className="yx-ops-stack">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <Card title="Surveys" actions={<Button size="sm" icon={Plus} onClick={() => setEdit('new')}>New survey</Button>}>
        <DataTable
          label="Surveys"
          columns={[
            { key: 'name', header: 'Survey', value: (s: Survey) => s.name, render: (s) => <span className="yx-ops-list__main"><strong>{s.name}</strong><span className="yx-ops-list__sub">{deskNames(live.desks, [s.deskId])}</span></span> },
            { key: 'on', header: 'On', type: 'status', value: (s) => (s.active ? 'On' : 'Off'), statusTone: (v) => (v === 'On' ? 'success' : 'neutral') },
            { key: 'nps', header: 'NPS', type: 'number', value: (s) => s.nps, render: (s) => npsText(s.nps) },
            { key: 'mix', header: 'Promoters · passives · detractors', value: (s) => `${s.promoters} · ${s.passives} · ${s.detractors}` },
            { key: 'sent', header: 'Sent', type: 'number', value: (s) => s.sent },
            { key: 'answered', header: 'Answered', type: 'number', value: (s) => s.answered },
            { key: 'next', header: 'Next send', value: (s) => s.nextRunAt, render: (s) => (s.active ? when(s.nextRunAt) : '—') },
          ]}
          rows={live.surveys}
          getRowId={(s) => s.id}
          empty={<EmptyState compact title="No surveys yet." description="A survey asks people who recently had a ticket solved how likely they are to recommend you, on a 0 to 10 scale." />}
          rowButtons={(s) => (
            <>
              <Button size="sm" onClick={() => setEdit(s)}>
                Edit
              </Button>
              <Button size="sm" loading={busy === `ans:${s.id}`} onClick={() => void run(`ans:${s.id}`, async () => setAnswers({ survey: s, rows: await live.onLoadAnswers(s.id) }))}>
                See answers
              </Button>
            </>
          )}
        />
      </Card>
      {edit && (
        <SurveyDrawer
          survey={edit === 'new' ? null : edit}
          desks={live.desks}
          onClose={() => setEdit(null)}
          onSave={async (input) => {
            await live.onSaveSurvey(edit === 'new' ? null : edit, input);
            toast({ title: 'Survey saved.' });
            setEdit(null);
          }}
        />
      )}
      {answers && (
        <Drawer open onOpenChange={(o) => !o && setAnswers(null)} size="lg" title={`Answers to ${answers.survey.name}`} subtitle="The newest 200. Comments have personal details hidden.">
          {answers.rows.length === 0 ? (
            <EmptyState compact title="No answers yet." />
          ) : (
            <PlainTable
              label="Answers"
              columns={[
                { key: 'score', header: 'Score (0 to 10)', num: true, cell: (a: SurveyAnswer & { i: number }) => a.score },
                { key: 'comment', header: 'Comment', cell: (a) => a.comment ?? '—' },
                { key: 'account', header: 'Company', cell: (a) => a.account ?? '—' },
                { key: 'at', header: 'When', date: true, cell: (a) => when(a.at) },
              ]}
              rows={answers.rows.map((a, i) => ({ ...a, i }))}
              getRowId={(a) => String(a.i)}
            />
          )}
        </Drawer>
      )}
    </div>
  );
}

function SurveyDrawer({ survey, desks, onClose, onSave }: { survey: Survey | null; desks: DeskSummary[]; onClose: () => void; onSave: (input: SurveyInput) => Promise<void> }) {
  const [deskId, setDeskId] = useState<string | null>(survey?.deskId ?? null);
  const [name, setName] = useState(survey?.name ?? '');
  const [question, setQuestion] = useState(survey?.question ?? 'How likely are you to recommend us to a friend or colleague?');
  const [everyDays, setEveryDays] = useState<number | null>(survey?.everyDays ?? 30);
  const [periodDays, setPeriodDays] = useState<number | null>(survey?.periodDays ?? 90);
  const [startAt, setStartAt] = useState('');
  const [active, setActive] = useState(survey?.active ?? true);
  const { busy, error, run } = useRun();
  const days = (n: number | null) => n !== null && n >= 7 && n <= 366;
  const early = useTooEarly([
    ...(deskId ? [] : [{ fieldId: 'sv-desk', message: 'Choose a desk.' }]),
    ...(name.trim() ? [] : [{ fieldId: 'sv-name', message: 'Name the survey.' }]),
    ...(question.trim() ? [] : [{ fieldId: 'sv-question', message: 'Write the question.' }]),
    ...(days(everyDays) ? [] : [{ fieldId: 'sv-every', message: 'Use 7 to 366 days.' }]),
    ...(days(periodDays) ? [] : [{ fieldId: 'sv-period', message: 'Use 7 to 366 days.' }]),
  ]);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={survey ? `Edit ${survey.name}` : 'New survey'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => !early.stop() && void run('save', () => onSave({ deskId: deskId!, name: name.trim(), question: question.trim(), everyDays: everyDays!, periodDays: periodDays!, ...(startAt ? { startAt: new Date(`${startAt}T09:00:00+05:30`).toISOString() } : {}), active }))}
          >
            Save survey
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && (
          <InlineAlert tone="danger" title="The survey was not saved">
            {error}
          </InlineAlert>
        )}
        <FormField id="sv-desk" error={early.errorOf('sv-desk')} label="Desk" required helper="Sent to people whose tickets on this desk were solved recently.">
          <Select value={deskId} onChange={setDeskId} options={desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose a desk" />
        </FormField>
        <FormField id="sv-name" label="Name" required error={early.errorOf('sv-name')}>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField id="sv-question" error={early.errorOf('sv-question')} label="Question" required helper="Answered on a 0 to 10 scale.">
          <TextArea value={question} onChange={setQuestion} maxLength={300} rows={2} />
        </FormField>
        <FormField id="sv-every" error={early.errorOf('sv-every')} label="Send every … days" required helper="7 to 366.">
          <NumberField min={7} max={366} value={everyDays} onChange={setEveryDays} />
        </FormField>
        <FormField id="sv-period" error={early.errorOf('sv-period')} label="Ask the same person at most once in … days" required helper="7 to 366.">
          <NumberField min={7} max={366} value={periodDays} onChange={setPeriodDays} />
        </FormField>
        <FormField label="First send on" optional helper={survey?.nextRunAt ? `Now: ${when(survey.nextRunAt)}` : 'Empty: at the next daily run.'}>
          <TextField type="date" value={startAt} onChange={setStartAt} />
        </FormField>
        <Checkbox checked={active} onChange={setActive} label="On" description="Switch off to stop sending; answers stay." />
      </div>
    </Drawer>
  );
}
