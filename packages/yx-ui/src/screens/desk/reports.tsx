import { useEffect, useState, type ReactNode } from 'react';
import { Download, Play, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { BarChart } from '../../components/charts';
import { Checkbox } from '../../components/choice';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Figure } from '../../components/foundations';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { MultiSelect, Select } from '../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { CopyValue, DeskPage, OPEN_STATES, PRIORITY_LABEL, STATE_LABEL, when } from './desk-kit';
import type { DeskSummary, LoadState, SystemState } from './types';
import type {
  CustomReport,
  CustomReportInput,
  CustomerMonthReport,
  FunnelStep,
  Kpi,
  LibraryReport,
  Rag,
  ReportDashboard,
  ReportPeriod,
  ReportTable,
  ScheduleFrequency,
  Survey,
  SurveyAnswer,
  SurveyInput,
  UserHit,
  WallData,
  Wallboard,
  WallboardInput,
} from './report-types';

// Reports (SD-1.27) and NPS surveys (SD-1.26): the ready dashboard, KPIs against targets, the report library, the
// self-service funnel, my own reports and their schedules, wall screens, customer reports and surveys. Numbers only:
// no ticket text appears here (custom reports list only tickets the person may see, as the server builds them).

export type ReportsTab = 'dashboard' | 'kpis' | 'library' | 'funnel' | 'mine' | 'walls' | 'customers' | 'surveys';

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

export interface ReportsScreenProps {
  /** The page itself (permissions loaded). */
  state: LoadState;
  onRetry?: () => void;
  /** desk.report.view / desk.report.manage / desk.survey.manage; customer reports also need desk.customer.manage or desk.desk.create. */
  canView: boolean;
  canManage: boolean;
  canSurveys: boolean;
  canCustomers: boolean;
  desks: DeskSummary[];
  tab: ReportsTab;
  onTab: (tab: ReportsTab) => void;
  /** The data of the open tab. */
  tabState: LoadState;
  onRetryTab?: () => void;
  period: ReportPeriod;
  onPeriod: (p: ReportPeriod) => void;
  dashboard: ReportDashboard | null;
  kpiDeskId: string | null;
  onKpiDesk: (deskId: string) => void;
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
}

export function ReportsScreen(props: ReportsScreenProps) {
  const tabs: [ReportsTab, string, boolean][] = [
    ['dashboard', 'Dashboard', props.canView],
    ['kpis', 'KPIs', props.canView],
    ['library', 'Report library', props.canView],
    ['funnel', 'Self-service', props.canView],
    ['mine', 'My reports', props.canView],
    ['walls', 'Wall screens', props.canView],
    ['customers', 'Customer reports', props.canView && props.canCustomers],
    ['surveys', 'Surveys', props.canSurveys],
  ];
  const shown = tabs.filter(([, , ok]) => ok);
  const inner = (body: ReactNode) => (
    <DeskPage state={props.tabState} onRetry={props.onRetryTab} what="this report">
      {body}
    </DeskPage>
  );
  return (
    <DeskPage title="Reports" description="How your desks are doing, in numbers. No ticket text is shown here." state={props.state} onRetry={props.onRetry} what="the reports" grantedBy="your Service Desk admin (desk.report.view)">
      <Tabs value={props.tab} onValueChange={(v) => props.onTab(v as ReportsTab)}>
        <TabsList aria-label="Reports">
          {shown.map(([v, label]) => (
            <TabsTrigger key={v} value={v}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="dashboard">
          <PeriodBar {...props} />
          {inner(props.dashboard && <DashboardView d={props.dashboard} />)}
        </TabsContent>
        <TabsContent value="kpis">{inner(<KpisView {...props} />)}</TabsContent>
        <TabsContent value="library">
          <PeriodBar {...props} />
          {inner(<LibraryView {...props} />)}
        </TabsContent>
        <TabsContent value="funnel">
          <PeriodBar {...props} />
          {inner(<FunnelView steps={props.funnel} />)}
        </TabsContent>
        <TabsContent value="mine">{inner(<MyReportsView {...props} />)}</TabsContent>
        <TabsContent value="walls">{inner(<WallsView {...props} />)}</TabsContent>
        <TabsContent value="customers">{inner(<CustomerReportView {...props} />)}</TabsContent>
        <TabsContent value="surveys">{inner(<SurveysView {...props} />)}</TabsContent>
      </Tabs>
    </DeskPage>
  );
}

// ---------------------------------------------------------------------------------------------- shared pieces

function PeriodBar({ desks, period, onPeriod }: Pick<ReportsScreenProps, 'desks' | 'period' | 'onPeriod'>) {
  return (
    <div className="yx-rep-period">
      <FormField label="Desk">
        <Select value={period.deskId ?? ALL} onChange={(v) => onPeriod({ ...period, deskId: !v || v === ALL ? null : v })} options={[{ value: ALL, label: 'All my desks' }, ...desks.map((d) => ({ value: d.id, label: d.name }))]} />
      </FormField>
      <FormField label="From">
        <TextField type="date" value={period.from} max={period.to} onChange={(v) => v && onPeriod({ ...period, from: v })} />
      </FormField>
      <FormField label="To">
        <TextField type="date" value={period.to} min={period.from} onChange={(v) => v && onPeriod({ ...period, to: v })} />
      </FormField>
    </div>
  );
}

/** One number with its label. */
export function Tile({ label, value, unit = '', hint }: { label: string; value: number | null; unit?: string; hint?: string }) {
  return (
    <section className="yx-stat" aria-label={label}>
      <span className="yx-stat__label">{label}</span>
      <Figure size="md" className="yx-stat__figure">
        {numText(value)}
        {value !== null && unit && <span className="yx-stat__unit">{unit === '%' ? unit : ` ${unit}`}</span>}
      </Figure>
      {hint && <span className="yx-ops-muted">{hint}</span>}
    </section>
  );
}

function ResultTable({ table, label }: { table: ReportTable; label?: string }) {
  if (table.rows.length === 0) return <EmptyState compact title="No rows for this choice." />;
  return (
    <div className="yx-rep-scroll">
      <table className="yx-desk-matrix" aria-label={label ?? table.title}>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>{cellText(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const deskNames = (desks: DeskSummary[], ids: string[]) => ids.map((id) => desks.find((d) => d.id === id)?.name ?? 'A desk').join(', ');

// ---------------------------------------------------------------------------------------------- dashboard

function DashboardView({ d }: { d: ReportDashboard }) {
  return (
    <div className="yx-ops-stack">
      <div className="yx-ops-grid" data-min="sm">
        <Tile label="Open tickets (backlog)" value={d.backlog} />
        <Tile label="Open and unassigned" value={d.unassigned} />
        <Tile label="New in the period" value={d.created} />
        <Tile label="Solved in the period" value={d.solved} />
        <Tile label="First reply" value={d.firstResponseHours} unit="hours" hint="Average" />
        <Tile label="Time to pick up (MTTA)" value={d.mttaHours} unit="hours" hint="Average, raised to first assigned" />
        <Tile label="Time to solve (MTTR)" value={d.mttrHours} unit="hours" hint="Average" />
        <Tile label="Response targets met" value={d.slaMetPct} unit="%" />
        <Tile label="Solved with one reply" value={d.fcrPct} unit="%" />
        <Tile label="Happy ratings" value={d.csatPct} unit="%" hint={`${d.ratings} ${d.ratings === 1 ? 'rating' : 'ratings'}${d.csatAverage !== null ? `, average ${d.csatAverage} of 5` : ''}`} />
      </div>
      <Card title="Self-service">
        <div className="yx-ops-grid" data-min="sm">
          <Tile label="Help-centre searches" value={d.selfService.searches} />
          <Tile label="Articles read" value={d.selfService.views} />
          <Tile label="Solved by an article" value={d.selfService.solved} />
        </div>
      </Card>
      <BarChart
        title="How long open tickets have waited"
        xLabel="Waiting"
        categories={['Under a day', '1 to 3 days', '3 to 7 days', 'Over a week']}
        series={[{ name: 'Open tickets', values: [d.ageing.day, d.ageing.threeDays, d.ageing.week, d.ageing.older] }]}
        height={200}
      />
      <Card title="Agents">
        {d.agents.length === 0 ? (
          <EmptyState compact title="No tickets assigned to anyone yet." />
        ) : (
          <div className="yx-rep-scroll">
            <table className="yx-desk-matrix" aria-label="Agents">
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Solved</th>
                  <th scope="col">Open now</th>
                  <th scope="col">Average hours to solve</th>
                  <th scope="col">Average rating (1 to 5)</th>
                </tr>
              </thead>
              <tbody>
                {d.agents.map((a) => (
                  <tr key={a.userId}>
                    <td>{a.name}</td>
                    <td>{a.solved}</td>
                    <td>{a.open}</td>
                    <td>{numText(a.resolutionHours)}</td>
                    <td>{numText(a.rating)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- KPIs

/** A small trend: the recorded points as a line, the 7-day forecast dashed. */
function KpiTrend({ kpi }: { kpi: Kpi }) {
  const vals = kpi.points.map((p) => p.value);
  if (vals.length < 2) return <p className="yx-ops-muted">Not enough days recorded for a trend yet.</p>;
  const all = [...vals, ...kpi.forecast];
  const W = 240;
  const H = 56;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const x = (i: number) => 2 + (i * (W - 6)) / Math.max(1, all.length - 1);
  const y = (v: number) => (hi === lo ? H / 2 : H - 4 - ((v - lo) * (H - 8)) / (hi - lo));
  const line = (from: number, list: number[]) => list.map((v, i) => `${i ? 'L' : 'M'}${x(from + i)},${y(v)}`).join(' ');
  const last = vals[vals.length - 1];
  const summary = `${kpi.label}: from ${vals[0]} to ${last} over ${vals.length} days${kpi.forecast.length ? `; forecast in 7 days about ${kpi.forecast[kpi.forecast.length - 1]}` : ''}.`;
  return (
    <svg className="yx-rep-trend" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
      <path className="yx-rep-trend__line" d={line(0, vals)} />
      {kpi.forecast.length > 0 && <path className="yx-rep-trend__forecast" d={line(vals.length - 1, [last, ...kpi.forecast])} />}
    </svg>
  );
}

function KpisView(props: ReportsScreenProps) {
  const [editing, setEditing] = useState<Kpi | null>(null);
  return (
    <div className="yx-ops-stack">
      <div className="yx-rep-period">
        <FormField label="Desk">
          <Select value={props.kpiDeskId} onChange={(v) => v && props.onKpiDesk(v)} options={props.desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose a desk" />
        </FormField>
      </div>
      {!props.kpiDeskId ? (
        <EmptyState compact title="Choose a desk to see its KPIs." />
      ) : (
        <div className="yx-ops-grid">
          {props.kpis.map((k) => {
            const rag = k.latest?.rag ? RAG_TEXT[k.latest.rag] : null;
            return (
              <Card key={k.metric} title={k.label} actions={props.canManage ? <Button size="sm" onClick={() => setEditing(k)}>Set target</Button> : undefined}>
                <div className="yx-ops-stack" data-gap="sm">
                  <div className="yx-ops-row">
                    <Figure size="md">{numText(k.latest?.value)}</Figure>
                    {rag ? <Badge tone={rag.tone}>{rag.label}</Badge> : <Badge tone="neutral">No target set</Badge>}
                  </div>
                  <p className="yx-ops-muted">
                    {k.target !== null ? `Target ${k.target} · amber limit ${k.amber} · ${k.higherIsBetter ? 'higher is better' : 'lower is better'}` : k.higherIsBetter ? 'Higher is better.' : 'Lower is better.'}
                    {k.latest ? ` Last recorded ${k.latest.day}.` : ' Nothing recorded yet.'}
                  </p>
                  <KpiTrend kpi={k} />
                  {k.forecast.length > 0 && <p className="yx-ops-muted">Dashed line: where it is heading in the next 7 days.</p>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && props.kpiDeskId && <TargetDialog kpi={editing} onClose={() => setEditing(null)} onSave={(input) => props.onSetTarget(props.kpiDeskId!, input)} />}
    </div>
  );
}

function TargetDialog({ kpi, onClose, onSave }: { kpi: Kpi; onClose: () => void; onSave: (input: { metric: string; target: number; amber: number }) => Promise<void> }) {
  const [target, setTarget] = useState<number | null>(kpi.target);
  const [amber, setAmber] = useState<number | null>(kpi.amber);
  const { busy, error, run } = useRun();
  const wrong = target !== null && amber !== null && (kpi.higherIsBetter ? amber > target : amber < target);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Target for ${kpi.label.toLowerCase()}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={target === null || amber === null || wrong} loading={busy === 'save'} onClick={() => void run('save', async () => { await onSave({ metric: kpi.metric, target: target!, amber: amber! }); onClose(); })}>
            Save target
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The target was not saved">{error}</InlineAlert>}
        <p className="yx-ops-muted">{kpi.higherIsBetter ? 'Higher is better: at or above the target is green, down to the amber limit is amber, below it is red.' : 'Lower is better: at or below the target is green, up to the amber limit is amber, above it is red.'}</p>
        <FormField label="Target" required>
          <NumberField decimals min={0} max={1_000_000} value={target} onChange={setTarget} />
        </FormField>
        <FormField label="Amber limit" required error={wrong ? (kpi.higherIsBetter ? 'The amber limit must not be above the target.' : 'The amber limit must not be below the target.') : null}>
          <NumberField decimals min={0} max={1_000_000} value={amber} onChange={setAmber} />
        </FormField>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------- report library

function LibraryView(props: ReportsScreenProps) {
  const [result, setResult] = useState<{ key: string; table: ReportTable } | null>(null);
  const { busy, error, run } = useRun();
  const practices = [...new Set(props.library.map((r) => r.practice))];
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <div className="yx-ops-grid">
        {practices.map((p) => (
          <Card key={p} title={p}>
            <ul className="yx-ops-list" aria-label={p}>
              {props.library
                .filter((r) => r.practice === p)
                .map((r) => (
                  <li key={r.key} className="yx-ops-list__item">
                    <span className="yx-ops-row" data-between>
                      <span>{r.name}</span>
                      <Button size="sm" icon={Play} loading={busy === `run:${r.key}`} aria-label={`Run ${r.name}`} onClick={() => void run(`run:${r.key}`, async () => setResult({ key: r.key, table: await props.onRunReport(r.key) }))}>
                        Run
                      </Button>
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
      {result && (
        <Card
          title={result.table.title}
          actions={
            <Button size="sm" icon={Download} loading={busy === 'csv'} onClick={() => void run('csv', () => props.onDownloadReport(result.key))}>
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

function FunnelView({ steps }: { steps: FunnelStep[] }) {
  const counts = steps.filter((s) => s.key !== 'rate');
  const rate = steps.find((s) => s.key === 'rate');
  return (
    <div className="yx-ops-stack">
      {rate && <Tile label="Self-service rate" value={rate.count} unit="%" hint="Solved by an article, out of those solved by an article or raised as a ticket" />}
      <BarChart title="From a search to a ticket" xLabel="Step" orientation="horizontal" categories={counts.map((s) => s.label)} series={[{ name: 'Count', values: counts.map((s) => s.count) }]} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- my reports

function MyReportsView(props: ReportsScreenProps) {
  const [edit, setEdit] = useState<CustomReport | 'new' | null>(null);
  const [scheduling, setScheduling] = useState<CustomReport | null>(null);
  const [result, setResult] = useState<{ id: string; table: ReportTable } | null>(null);
  const { busy, error, run } = useRun();
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <Card title="My reports" actions={props.canManage ? <Button size="sm" icon={Plus} onClick={() => setEdit('new')}>New report</Button> : undefined}>
        {props.customReports.length === 0 ? (
          <EmptyState compact title="No reports yet." description={props.canManage ? 'Choose the columns and filters you need, then run it or have it emailed.' : undefined} />
        ) : (
          <ul className="yx-ops-list" aria-label="My reports">
            {props.customReports.map((r) => {
              const own = r.mine && props.canManage;
              const live = r.schedules.filter((s) => s.active);
              return (
                <li key={r.id} className="yx-ops-list__item">
                  <span className="yx-ops-list__main">
                    <span className="yx-ops-row">
                      <strong>{r.name}</strong>
                      {r.shared && <Badge tone="info">Shared</Badge>}
                      {!r.mine && <Badge tone="neutral">Shared with you</Badge>}
                    </span>
                    <span className="yx-ops-list__sub">{r.columns.map((c) => REPORT_COLUMNS[c] ?? c).join(', ')}</span>
                    {live.map((s) => (
                      <span key={s.id} className="yx-ops-row">
                        <span className="yx-ops-muted">
                          {FREQ_LABEL[s.frequency]} to {s.recipients.length} {s.recipients.length === 1 ? 'person' : 'people'} · next {when(s.nextRunAt)}
                          {s.lastResult ? ` · last time: ${s.lastResult}` : ''}
                        </span>
                        {own && (
                          <Button size="sm" loading={busy === `end:${s.id}`} onClick={() => void run(`end:${s.id}`, () => props.onEndSchedule(s.id))}>
                            End schedule
                          </Button>
                        )}
                      </span>
                    ))}
                    <span className="yx-ops-row">
                      <Button size="sm" icon={Play} loading={busy === `run:${r.id}`} onClick={() => void run(`run:${r.id}`, async () => setResult({ id: r.id, table: await props.onRunCustom(r.id) }))}>
                        Run
                      </Button>
                      <Button size="sm" icon={Download} loading={busy === `csv:${r.id}`} onClick={() => void run(`csv:${r.id}`, () => props.onDownloadCustom(r.id))}>
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
                            onConfirm={() => props.onDeleteCustom(r.id)}
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
      {edit && <CustomReportDrawer report={edit === 'new' ? null : edit} desks={props.desks} onClose={() => setEdit(null)} onSave={async (input) => { await props.onSaveCustom(edit === 'new' ? null : edit, input); setEdit(null); }} />}
      {scheduling && <ScheduleDrawer report={scheduling} onSearchUsers={props.onSearchUsers} onClose={() => setScheduling(null)} onSave={async (input) => { await props.onSchedule(scheduling.id, input); setScheduling(null); }} />}
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
  const states6: SystemState[] = [...OPEN_STATES, 'solved', 'closed'];
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
            disabled={!name.trim() || columns.length === 0}
            loading={busy === 'save'}
            onClick={() =>
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
        {error && <InlineAlert tone="danger" title="The report was not saved">{error}</InlineAlert>}
        <FormField label="Report name" required>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField label="Columns" required helper="Never message text: only these ticket details.">
          <MultiSelect value={columns} onChange={setColumns} options={Object.entries(REPORT_COLUMNS).map(([value, label]) => ({ value, label }))} placeholder="Choose columns" />
        </FormField>
        <FormField label="Desks" helper="Empty: every desk you report on.">
          <MultiSelect value={deskIds} onChange={setDeskIds} options={desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Every desk" />
        </FormField>
        <FormField label="States" helper="Empty: any state.">
          <MultiSelect value={states} onChange={setStates} options={states6.map((s) => ({ value: s, label: STATE_LABEL[s] }))} placeholder="Any state" />
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
  const options = [...known, ...hits.filter((u) => !known.some((k) => k.id === u.id))].map((u) => ({ value: u.id, label: u.name ?? u.email, description: u.email }));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Email ${report.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={recipients.length === 0} loading={busy === 'save'} onClick={() => void run('save', () => onSave({ frequency, recipients }))}>
            Start schedule
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The schedule was not saved">{error}</InlineAlert>}
        <p className="yx-ops-muted">Each person gets a CSV at 7 am India time, holding only the tickets they may see themselves.</p>
        <FormField label="How often">
          <Segment label="How often" value={frequency} onChange={setFrequency} options={(['daily', 'weekly', 'monthly'] as const).map((v) => ({ value: v, label: FREQ_LABEL[v] }))} />
        </FormField>
        <FormField label="Find a colleague" helper="Name or email">
          <TextField type="search" value={find} onChange={setFind} />
        </FormField>
        <FormField label="Send to" required>
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

function WallsView(props: ReportsScreenProps) {
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const { error, run } = useRun();
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      {link && (
        <InlineAlert tone="warning" title="Copy the link now, it is shown once" actions={<Button size="sm" onClick={() => setLink(null)}>I have copied it</Button>}>
          <span className="yx-ops-stack" data-gap="sm">
            <span>Open this link on the wall screen. It opens without signing in and shows counts only, never ticket text. Anyone with the link can see the counts, so keep it private. If it gets out, switch the screen off and make a new one.</span>
            <CopyValue label="Wall screen link" value={link} />
          </span>
        </InlineAlert>
      )}
      <Card title="Wall screens" actions={props.canManage ? <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>New wall screen</Button> : undefined}>
        {props.wallboards.length === 0 ? (
          <EmptyState compact title="No wall screens yet." description="A wall screen shows each desk's open, unassigned and late counts on a TV, refreshed every minute." />
        ) : (
          <ul className="yx-ops-list" aria-label="Wall screens">
            {props.wallboards.map((w) => (
              <li key={w.id} className="yx-ops-list__item">
                <span className="yx-ops-row" data-between>
                  <span className="yx-ops-list__main">
                    <strong>{w.name}</strong>
                    <span className="yx-ops-list__sub">
                      {deskNames(props.desks, w.deskIds)}
                      {w.backlogAlert !== null ? ` · leads are told above ${w.backlogAlert} open tickets` : ''} · made {when(w.createdAt)}
                    </span>
                  </span>
                  {props.canManage && (
                    <ConfirmDialog
                      trigger={<Button size="sm" variant="danger">Switch off</Button>}
                      title={`Switch off ${w.name}?`}
                      consequence="Its link stops working at once. You can't switch it back on; make a new wall screen instead."
                      confirmLabel="Switch off"
                      destructive
                      onConfirm={() => run(`off:${w.id}`, () => props.onRevokeWallboard(w.id)).then(() => undefined)}
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
          desks={props.desks}
          onClose={() => setCreating(false)}
          onSave={async (input) => {
            const r = await props.onCreateWallboard(input);
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
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="New wall screen"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || deskIds.length === 0} loading={busy === 'save'} onClick={() => void run('save', () => onSave({ name: name.trim(), deskIds, ...(alert ? { backlogAlert: alert } : {}) }))}>
            Make the link
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The wall screen was not made">{error}</InlineAlert>}
        <FormField label="Name" required helper="For example: IT floor TV">
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField label="Desks" required helper="Up to 10.">
          <MultiSelect value={deskIds} onChange={(v) => setDeskIds(v.slice(0, 10))} options={desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose desks" />
        </FormField>
        <FormField label="Queue alert line" optional helper="Tell the desks' team leads when open tickets go above this number.">
          <NumberField min={1} max={100_000} value={alert} onChange={setAlert} />
        </FormField>
      </div>
    </Drawer>
  );
}

/** The wall screen itself (outside the app, no sign-in): big counts per desk. */
export function WallScreen({ state, wall, onRetry }: { state: LoadState | 'not-found'; wall: WallData | null; onRetry?: () => void }) {
  return (
    <div className="yx-wall" data-theme="dark">
      {state === 'not-found' && (
        <div className="yx-wall__message">
          <h1>This wall screen is switched off</h1>
          <p>The link no longer works. Ask your team lead for a new one.</p>
        </div>
      )}
      {state === 'error' && <ErrorState title="We couldn't load the wall screen." description="We will try again in a minute." onRetry={onRetry} />}
      {state === 'loading' && <p className="yx-wall__message">Loading…</p>}
      {state === 'ready' && wall && (
        <>
          <header className="yx-wall__head">
            <h1>{wall.name}</h1>
            <p>Last updated {new Date(wall.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · refreshes every minute</p>
          </header>
          <div className="yx-wall__desks">
            {wall.desks.map((d) => (
              <section key={d.name} className="yx-wall__desk" aria-label={d.name}>
                <h2>{d.name}</h2>
                <dl className="yx-wall__counts">
                  {(
                    [
                      ['Open', d.open, false],
                      ['Unassigned', d.unassigned, d.unassigned > 0],
                      ['Urgent (P1)', d.urgent, d.urgent > 0],
                      ['Due within an hour', d.dueWithinHour, d.dueWithinHour > 0],
                      ['Late', d.late, d.late > 0],
                      ['Solved today', d.solvedToday, false],
                    ] as [string, number, boolean][]
                  ).map(([label, n, warn]) => (
                    <div key={label} className="yx-wall__count" data-warn={warn || undefined}>
                      <dt>{label}</dt>
                      <dd>{n}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- customer reports

function CustomerReportView(props: ReportsScreenProps) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rep, setRep] = useState<CustomerMonthReport | null>(null);
  const { busy, error, run } = useRun();
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <div className="yx-rep-period">
        <FormField label="Customer company">
          <Select value={accountId} onChange={setAccountId} options={props.accounts.map((a) => ({ value: a.id, label: a.name }))} placeholder="Choose a company" searchable emptyText="No company matches" />
        </FormField>
        <FormField label="Month">
          <TextField type="month" value={month} onChange={(m) => m && setMonth(m)} />
        </FormField>
        <Button disabled={!accountId} loading={busy === 'show'} onClick={() => void run('show', async () => setRep(await props.onCustomerReport(accountId!, month)))}>
          Show report
        </Button>
      </div>
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

function SurveysView(props: ReportsScreenProps) {
  const [edit, setEdit] = useState<Survey | 'new' | null>(null);
  const [answers, setAnswers] = useState<{ survey: Survey; rows: SurveyAnswer[] } | null>(null);
  const { busy, error, run } = useRun();
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <Card title="Surveys" actions={<Button size="sm" icon={Plus} onClick={() => setEdit('new')}>New survey</Button>}>
        {props.surveys.length === 0 ? (
          <EmptyState compact title="No surveys yet." description="A survey asks people who recently had a ticket solved how likely they are to recommend you, on a 0 to 10 scale." />
        ) : (
          <div className="yx-rep-scroll">
            <table className="yx-desk-matrix" aria-label="Surveys">
              <thead>
                <tr>
                  <th scope="col">Survey</th>
                  <th scope="col">NPS</th>
                  <th scope="col">Promoters · passives · detractors</th>
                  <th scope="col">Sent</th>
                  <th scope="col">Answered</th>
                  <th scope="col">Next send</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {props.surveys.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      <br />
                      <span className="yx-ops-muted">{deskNames(props.desks, [s.deskId])}</span> {s.active ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>}
                    </td>
                    <td>{npsText(s.nps)}</td>
                    <td>
                      {s.promoters} · {s.passives} · {s.detractors}
                    </td>
                    <td>{s.sent}</td>
                    <td>{s.answered}</td>
                    <td>{s.active ? when(s.nextRunAt) : '—'}</td>
                    <td>
                      <span className="yx-ops-row">
                        <Button size="sm" onClick={() => setEdit(s)}>
                          Edit
                        </Button>
                        <Button size="sm" loading={busy === `ans:${s.id}`} onClick={() => void run(`ans:${s.id}`, async () => setAnswers({ survey: s, rows: await props.onLoadAnswers(s.id) }))}>
                          See answers
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && <SurveyDrawer survey={edit === 'new' ? null : edit} desks={props.desks} onClose={() => setEdit(null)} onSave={async (input) => { await props.onSaveSurvey(edit === 'new' ? null : edit, input); setEdit(null); }} />}
      {answers && (
        <Drawer open onOpenChange={(o) => !o && setAnswers(null)} size="lg" title={`Answers to ${answers.survey.name}`} subtitle="The newest 200. Comments have personal details hidden.">
          {answers.rows.length === 0 ? (
            <EmptyState compact title="No answers yet." />
          ) : (
            <table className="yx-desk-matrix" aria-label="Answers">
              <thead>
                <tr>
                  <th scope="col">Score (0 to 10)</th>
                  <th scope="col">Comment</th>
                  <th scope="col">Company</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {answers.rows.map((a, i) => (
                  <tr key={i}>
                    <td>{a.score}</td>
                    <td>{a.comment ?? '—'}</td>
                    <td>{a.account ?? '—'}</td>
                    <td>{when(a.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  const ok = deskId && name.trim() && question.trim() && everyDays && everyDays >= 7 && everyDays <= 366 && periodDays && periodDays >= 7 && periodDays <= 366;
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
            disabled={!ok}
            loading={busy === 'save'}
            onClick={() => void run('save', () => onSave({ deskId: deskId!, name: name.trim(), question: question.trim(), everyDays: everyDays!, periodDays: periodDays!, ...(startAt ? { startAt: new Date(`${startAt}T09:00:00+05:30`).toISOString() } : {}), active }))}
          >
            Save survey
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The survey was not saved">{error}</InlineAlert>}
        <FormField label="Desk" required helper="Sent to people whose tickets on this desk were solved recently.">
          <Select value={deskId} onChange={setDeskId} options={desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose a desk" />
        </FormField>
        <FormField label="Name" required>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField label="Question" required helper="Answered on a 0 to 10 scale.">
          <TextArea value={question} onChange={setQuestion} maxLength={300} rows={2} />
        </FormField>
        <FormField label="Send every … days" required helper="7 to 366.">
          <NumberField min={7} max={366} value={everyDays} onChange={setEveryDays} />
        </FormField>
        <FormField label="Ask the same person at most once in … days" required helper="7 to 366.">
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
