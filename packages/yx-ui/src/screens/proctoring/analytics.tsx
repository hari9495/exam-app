// Analytics (P09, 11-analytics §6.2): home, role dashboards, dashboard builder, metric explorer, report builder,
// report library, metric catalogue + calculated metrics, schedules + export log, Ask analytics. ANL-01 … ANL-09.
import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Download, Info, Lock, Plus, Search, Star } from 'lucide-react';
import { Button, ButtonGroup } from '../../components/button';
import { Badge, AiBadge } from '../../components/display';
import { DataTable } from '../../components/table';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { Dialog } from '../../components/overlay';
import { Icon } from '../../components/foundations';
import { BarChart, DonutChart, Funnel, Gauge, LineChart, StatCard } from '../../components/charts';
import { DashboardGrid, NeedsActionList, type DashboardWidget } from '../../components/dashboard';
import { AssistantPanel, type AssistantMessage } from '../../components/notify';
import { Timeline } from '../../components/timeline';
import { formatDate, formatINR } from '../../lib/format';
import { AnlFrame } from './proctoring-shared';
import { deliveryMode, inheritedSensitivity, suppress, type Sensitivity } from './proctoring-logic';
import { EXPORTS, METRICS, MONTHS, REPORTS, SCHEDULES, d, type MetricRow, type ReportRow, type ScheduleRow } from './proctoring-data';

const DEPTS = ['Engineering', 'Operations', 'Finance', 'People', 'Sales', 'Quality'];
const SENS_TONE: Record<Sensitivity, 'neutral' | 'warning' | 'danger'> = { Internal: 'neutral', Confidential: 'warning', Special: 'danger' };

/** Scope + freshness chip shown on every widget (YX-MET-05). */
export function ScopeChip({ scope = 'Kaveri Foods Pvt Ltd · all entities', period = 'FY 2026-27', fresh = 'data as of today 2:00 am' }: { scope?: string; period?: string; fresh?: string }) {
  return (
    <span className="yx-anl-scope">
      <Icon icon={Info} /> {scope} · {period} · {fresh}
    </span>
  );
}

const stat = (id: string, label: string, value: number, extra: Partial<Parameters<typeof StatCard>[0]> = {}): DashboardWidget => ({
  id,
  title: label,
  size: 3,
  bare: true,
  content: <StatCard label={label} value={value} drill={{ label: 'View records', href: '#drill' }} {...extra} />,
});
const chart = (id: string, title: string, size: 4 | 6 | 8 | 12, content: ReactNode): DashboardWidget => ({ id, title, size, bare: true, content });

/* ================================================================== */
/* ANL-02 · Role dashboards                                            */
/* ================================================================== */

export type RoleKey =
  | 'executive' | 'hr' | 'payroll' | 'recruiter' | 'depthead' | 'manager'
  | 'compliance' | 'ld' | 'helpdesk' | 'ethics' | 'staffing' | 'expenses' | 'sysadmin' | 'proctoring' | 'dei';

export const ROLE_LABEL: Record<RoleKey, string> = {
  executive: 'Executive', hr: 'HR', payroll: 'Payroll and finance', recruiter: 'Recruiter', depthead: 'Department head', manager: 'Manager',
  compliance: 'Compliance owner', ld: 'L&D', helpdesk: 'Helpdesk lead', ethics: 'Ethics officer / IC', staffing: 'Staffing head', expenses: 'Finance · expenses',
  sysadmin: 'System Admin operations', proctoring: 'Proctoring admin', dei: 'Diversity, equity & inclusion',
};

function roleWidgets(role: RoleKey): DashboardWidget[] {
  switch (role) {
    case 'executive':
      return [
        stat('hc', 'Headcount', 248, { previous: 239, previousLabel: 'Apr', trend: [239, 241, 242, 244, 246, 248] }),
        stat('attr', 'Attrition, annualised (%)', 14, { unit: '%', previous: 16, previousLabel: 'last year' }),
        stat('cost', 'Payroll cost, Sep', 1_82_40_500, { money: true, previous: 1_79_10_000, previousLabel: 'Aug' }),
        stat('open', 'Open positions', 18, { previous: 22, previousLabel: 'Aug' }),
        chart('trend', 'Headcount and exits', 8, <LineChart title="Headcount by month" description="Active employees on the last day; exits by last working day" categories={MONTHS} series={[{ name: 'Headcount', values: [239, 241, 242, 244, 246, 248] }]} footnote={<ScopeChip />} />),
        chart('costdept', 'Cost by department', 4, <BarChart title="Payroll cost by department, Sep" money orientation="horizontal" categories={DEPTS} series={[{ name: 'Cost', values: [6240000, 4810000, 1920000, 1400000, 2380000, 1490000] }]} footnote={<ScopeChip period="Sep 2026 · run approved" />} />),
      ];
    case 'hr':
      return [
        stat('hc', 'Headcount', 248),
        stat('join', 'Joiners this month', 7),
        stat('exit', 'Exits this month', 3, { previous: 5, previousLabel: 'Aug' }),
        stat('notice', 'Serving notice', 4),
        chart('attr', 'Attrition by department', 6, <BarChart title="Attrition by department, last 12 months (%)" categories={DEPTS} series={[{ name: 'Voluntary', values: [11, 18, 6, 4, 22, 9] }, { name: 'Involuntary', values: [2, 4, 0, 0, 3, 1] }]} stacked footnote={<ScopeChip />} />),
        chart('tenure', 'Tenure bands', 6, <BarChart title="Employees by tenure band" categories={['< 1 yr', '1–3 yrs', '3–5 yrs', '5+ yrs']} series={[{ name: 'Employees', values: [52, 96, 58, 42] }]} footnote={<ScopeChip scope="All entities" period="As on 29 Sep 2026" />} />),
      ];
    case 'payroll':
      return [
        stat('gross', 'Gross pay, Sep', 1_58_20_000, { money: true, previous: 1_55_60_000, previousLabel: 'Aug' }),
        stat('net', 'Net pay, Sep', 1_31_04_000, { money: true }),
        stat('liab', 'Statutory due by 15 Oct', 24_18_600, { money: true }),
        stat('overdue', 'Statutory overdue', 0),
        chart('var', 'Variance', 8, <BarChart title="Change vs August, by reason" money categories={['Joiners', 'Leavers', 'Revisions', 'Loss of pay', 'Bonus']} series={[{ name: 'Change', values: [410000, -180000, 220000, -40000, 0] }]} footnote={<ScopeChip period="Pay period Sep 2026 · run approved, not paid" />} />),
        chart('comp', 'Statutory', 4, <DonutChart title="Statutory due, Sep" money slices={[{ label: 'PF', value: 1540000 }, { label: 'ESI', value: 212000 }, { label: 'TDS', value: 612000 }, { label: 'PT and LWF', value: 54600 }]} />),
      ];
    case 'recruiter':
      return [
        stat('open', 'Open positions', 18),
        stat('tth', 'Time to hire (median days)', 34, { previous: 39, previousLabel: 'Q1' }),
        stat('offer', 'Offer acceptance (%)', 82, { unit: '%' }),
        stat('cph', 'Cost per hire', 48_500, { money: true }),
        chart('funnel', 'Pipeline', 6, <Funnel title="Pipeline conversion, Backend hiring Q3" stages={[{ label: 'Applied', count: 1240 }, { label: 'Assessed', count: 412 }, { label: 'Interviewed', count: 96 }, { label: 'Offered', count: 22 }, { label: 'Joined', count: 14 }]} />),
        chart('src', 'Sources', 6, <BarChart title="Hires and 90-day retention by source" categories={['Careers site', 'Referral', 'Job boards', 'Campus', 'Agency']} series={[{ name: 'Hires', values: [9, 7, 5, 12, 3] }]} />),
      ];
    case 'depthead':
      return [
        stat('hc', 'Headcount, Quality', 26),
        stat('attr', 'Attrition, Quality (%)', 9, { unit: '%' }),
        stat('ot', 'Overtime hours, Sep', 312),
        stat('pos', 'Open positions', 2),
        chart('cost', 'Cost by location', 12, <BarChart title="Payroll cost by location, Quality" money categories={['Bengaluru', 'Chennai', 'Hosur']} series={[{ name: 'Cost', values: [540000, 610000, 0] }]} groupSizes={[6, 17, 3]} minGroupSize={5} footnote={<ScopeChip scope="Quality department (your subtree)" period="Sep 2026" />} />),
      ];
    case 'manager':
      return [
        { id: 'act', title: 'Needs your action', size: 12, pinned: true, bare: true, content: <NeedsActionList viewAllHref="#inbox" today={d(29)} items={[{ id: 'l1', type: 'Leave', title: 'Casual leave 5–6 Oct', who: 'Kavya Reddy', due: d(1, 9), kind: 'approve' }, { id: 't1', type: 'Timesheet', title: 'Week of 21 Sep', who: 'Rohan Das', due: d(30), kind: 'review' }]} /> },
        stat('team', 'Team size', 9),
        stat('today', 'In today', 7),
        stat('risk', 'High attrition risk', 2, { drill: { label: 'Names are visible to HR only', href: '#risk' } }),
        stat('goals', 'Goals on track (%)', 78, { unit: '%' }),
        chart('att', 'Attendance', 12, <LineChart title="Team attendance (%)" categories={MONTHS} series={[{ name: 'Attendance', values: [96, 95, 97, 94, 96, 97] }]} target={{ value: 95, label: 'Target 95 %' }} yMin={80} footnote={<ScopeChip scope="Your team (9)" />} />),
      ];
    case 'compliance':
      return [stat('due', 'Filings due this month', 6), stat('late', 'Late filings', 0), stat('ids', 'Missing statutory IDs', 5), stat('reg', 'Registers generated', 14), chart('cal', 'Status', 12, <BarChart title="Statutory payments by month" categories={MONTHS} series={[{ name: 'On time', values: [5, 5, 6, 5, 6, 4] }, { name: 'Late', values: [0, 1, 0, 0, 0, 0] }]} stacked />)];
    case 'ld':
      return [stat('hrs', 'Training hours per employee', 11), stat('comp', 'Mandatory training done (%)', 87, { unit: '%' }), stat('over', 'Overdue mandatory', 32), stat('budget', 'Training budget used', 6_40_000, { money: true }), chart('c', 'Completion', 12, <BarChart title="Mandatory training completion by department (%)" categories={DEPTS} series={[{ name: 'Completed', values: [91, 78, 96, 100, 84, 88] }]} />)];
    case 'helpdesk':
      return [stat('open', 'Open tickets', 41), stat('sla', 'Within SLA (%)', 92, { unit: '%' }), stat('first', 'First response (median hours)', 3), stat('csat', 'Satisfaction (out of 5)', 4), chart('vol', 'Volume', 12, <LineChart title="Tickets by week" categories={['W35', 'W36', 'W37', 'W38', 'W39']} series={[{ name: 'Opened', values: [38, 44, 51, 40, 36] }, { name: 'Closed', values: [35, 42, 47, 45, 39] }]} />)];
    case 'ethics':
      return [
        stat('open', 'Open cases', 3),
        stat('closed', 'Closed this year', 7),
        stat('over90', 'Pending over 90 days', 0),
        stat('ic', 'IC meetings this quarter', 4),
        chart('note', 'Counts only', 12, <InlineAlert tone="info">Counts only. Case details stay inside the restricted case area; breakdowns under 5 are combined for every viewer.</InlineAlert>),
      ];
    case 'staffing':
      return [stat('pl', 'Active placements', 64), stat('bench', 'Bench', 9), stat('margin', 'Average margin per placement', 38_200, { money: true }), stat('ar', 'Overdue invoices', 4_82_000, { money: true }), chart('bc', 'Billing', 12, <BarChart title="Billed vs collected" money categories={MONTHS} series={[{ name: 'Billed', values: [4200000, 4450000, 4610000, 4820000, 4900000, 5100000] }, { name: 'Collected', values: [3900000, 4300000, 4400000, 4500000, 4700000, 4200000] }]} />)];
    case 'expenses':
      return [stat('pend', 'Claims to pay', 38), stat('amt', 'Amount to pay', 3_12_400, { money: true }), stat('age', 'Oldest claim (days)', 12), stat('policy', 'Out-of-policy claims (%)', 6, { unit: '%' }), chart('cat', 'By category', 12, <BarChart title="Claims by category, Sep" money categories={['Travel', 'Stay', 'Food', 'Local conveyance', 'Other']} series={[{ name: 'Amount', values: [184000, 96000, 42000, 28000, 12000] }]} />)];
    case 'sysadmin':
      return [stat('users', 'Weekly active users (%)', 86, { unit: '%' }), stat('jobs', 'Failed jobs, 24 h', 2), stat('int', 'Integration errors', 1), stat('seats', 'Seats used', 248), chart('g', 'Setup', 12, <Gauge label="Set-up complete" value={92} format="percent" />)];
    case 'proctoring':
      return [
        stat('att', 'Attempts this month', 5310),
        stat('flag', 'Attempts with high concern (%)', 4, { unit: '%' }),
        stat('rev', 'Incidents open', 18),
        stat('sla', 'Reviewed within 3 days (%)', 91, { unit: '%' }),
        chart('dist', 'Scores', 6, <BarChart title="Score distribution, Campus aptitude 2026" categories={['0–19', '20–39', '40–59', '60–79', '80–100']} series={[{ name: 'Candidates', values: [210, 980, 1920, 1640, 560] }]} />),
        chart('fair', 'Fairness', 6, <BarChart title="Pass rate by group (self-declared)" categories={['Men', 'Women', 'Prefer not to say', 'Other groups']} series={[{ name: 'Pass rate %', values: [52, 32, 51, null] }]} groupSizes={[1180, 1210, 140, 3]} minGroupSize={5} footnote="Groups under 5 are hidden for every viewer." />),
      ];
    case 'dei': {
      const s = suppress([{ label: 'Hosur plant', value: 2, n: 2 }, { label: 'Chennai office', value: 4, n: 61 }, { label: 'Bengaluru head office', value: 3, n: 185 }]);
      return [
        stat('women', 'Women in workforce (%)', 38, { unit: '%', previous: 35, previousLabel: 'last year' }),
        stat('lead', 'Women in grade M1 and above (%)', 27, { unit: '%' }),
        stat('gap', 'Median gender pay gap (%)', 7, { unit: '%' }),
        stat('flags', 'Pay-equity flags (±10 %)', 11),
        chart('funnel', 'Hiring funnel', 6, <BarChart title="Selection rate by stage, women ÷ men" categories={['Shortlisted', 'Interviewed', 'Offered', 'Joined']} series={[{ name: 'Ratio', values: [0.94, 0.88, 0.79, 0.83] }]} footnote="Ratios below 0.80 are reviewed (same rule as assessment fairness)." />),
        chart('dis', 'Disability', 6, <BarChart title="Employees with a declared disability by location" categories={s.map((x) => x.label)} series={[{ name: 'Employees', values: s.map((x) => x.shown) }]} groupSizes={s.map((x) => x.n)} minGroupSize={5} footnote="Combined for every viewer, HR included, when fewer than 5." />),
      ];
    }
  }
}

export function RoleDashboardScreen({ role = 'executive', loading = false }: { role?: RoleKey; loading?: boolean }) {
  // ANL-02
  const widgets = roleWidgets(role).map((w) => (loading ? { ...w, content: <StatCard label={w.title} value={0} loading drill={{ label: '', href: '#' }} /> } : w));
  return (
    <AnlFrame page="Dashboards">
      <PageHeader
        title={`${ROLE_LABEL[role]} dashboard`}
        description={role === 'dei' ? 'YukthiX starter — edit for your company' : 'Shipped role template'}
        facts={<ScopeChip scope={role === 'manager' ? 'Your team' : role === 'depthead' ? 'Quality department' : 'Kaveri Foods Pvt Ltd · all entities'} />}
        actions={
          <>
            <Select aria-label="Period" value="fy" onChange={() => {}} options={[{ value: 'fy', label: 'FY 2026-27' }, { value: 'q2', label: 'Jul – Sep 2026' }]} size="sm" />
            <Button>Schedule</Button>
            <Button>Clone and edit</Button>
          </>
        }
      />
      <DashboardGrid label={`${ROLE_LABEL[role]} dashboard`} widgets={widgets} />
    </AnlFrame>
  );
}

/* ================================================================== */
/* ANL-01 · Analytics home                                             */
/* ================================================================== */

export function AnalyticsHomeScreen({ firstUse = false }: { firstUse?: boolean }) {
  // ANL-01
  const mine = firstUse ? [] : [{ name: 'Hosur plant weekly', desc: '6 widgets · edited 26 Sep' }, { name: 'Campus drive tracker', desc: '5 widgets · shared with 3 people' }];
  const shared = firstUse ? [] : [{ name: 'Leadership monthly', desc: 'From Lakshmi Venkatesan · you see your own scope' }];
  return (
    <AnlFrame page="Dashboards">
      <PageHeader title="Analytics" description="Every number comes from one governed metric, so it matches everywhere." actions={<Button variant="primary" icon={Plus}>New dashboard</Button>} />
      <div className="yx-prc-row">
        <TextField prefix={<Icon icon={Search} />} placeholder="Search dashboards, reports and metrics" aria-label="Search analytics" />
        <Button>Open the explorer</Button>
        <Button>Ask a question</Button>
      </div>
      <section className="yx-prc-stack">
        <h2 className="yx-prc-h">My dashboards</h2>
        {mine.length === 0 ? (
          <EmptyState compact title="You have no dashboards yet." description="Start from a role template below, or build one from metrics." action={<Button>New dashboard</Button>} />
        ) : (
          <div className="yx-anl-cards">
            {mine.map((m) => (
              <div key={m.name} className="yx-anl-card">
                <h3>{m.name}</h3>
                <span className="yx-prc-small yx-prc-muted">{m.desc}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="yx-prc-stack">
        <h2 className="yx-prc-h">Shared with me</h2>
        {shared.length === 0 ? (
          <p className="yx-prc-muted">Nothing shared with you yet.</p>
        ) : (
          <div className="yx-anl-cards">
            {shared.map((m) => (
              <div key={m.name} className="yx-anl-card">
                <h3>{m.name}</h3>
                <span className="yx-prc-small yx-prc-muted">{m.desc}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="yx-prc-stack">
        <h2 className="yx-prc-h">Templates</h2>
        <div className="yx-anl-cards">
          {(Object.keys(ROLE_LABEL) as RoleKey[]).map((r) => (
            <div key={r} className="yx-anl-card">
              <h3>{ROLE_LABEL[r]}</h3>
              <span className="yx-prc-small yx-prc-muted">{roleWidgets(r).length} widgets</span>
              <div className="yx-prc-row">
                <Button size="sm">Open</Button>
                <Button size="sm">Clone</Button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="yx-prc-stack">
        <h2 className="yx-prc-h">From the report library</h2>
        <div className="yx-anl-cards">
          {['Who is leaving?', 'What does payroll cost?', 'Where do good hires come from?', 'How did the assessments go?'].map((q) => (
            <div key={q} className="yx-anl-card">
              <h3>{q}</h3>
              <span className="yx-prc-small yx-prc-muted">{REPORTS.filter((r) => r.question === q).length} reports</span>
            </div>
          ))}
        </div>
      </section>
    </AnlFrame>
  );
}

/* ================================================================== */
/* ANL-03 · Dashboard builder                                          */
/* ================================================================== */

const CHARTS = ['Number', 'Trend', 'Bar', 'Stacked bar', 'Table', 'Funnel', 'Gauge'];

export function DashboardBuilderScreen({ wizard = true, step = 'chart', share = false, noSalaryAccess = false }: { wizard?: boolean; step?: 'metric' | 'dimension' | 'period' | 'chart'; share?: boolean; noSalaryAccess?: boolean }) {
  // ANL-03
  const [metric, setMetric] = useState('workforce.attrition_rate');
  const [dim, setDim] = useState('Department');
  const [period, setPeriod] = useState('Last 6 months vs same period last year');
  const [chartType, setChart] = useState('Bar');
  const [shareOpen, setShare] = useState(share);
  const steps = ['metric', 'dimension', 'period', 'chart'] as const;
  const at = steps.indexOf(step);
  const widgets: DashboardWidget[] = [
    stat('hc', 'Headcount', 248),
    stat('ot', 'Overtime cost per head', 1_840, { money: true }),
    chart('p', 'Plant attendance', 6, <LineChart title="Attendance, Hosur plant (%)" categories={MONTHS} series={[{ name: 'Attendance', values: [93, 92, 94, 91, 95, 96] }]} yMin={80} />),
  ];
  const m = METRICS.find((x) => x.key === metric)!;
  return (
    <AnlFrame page="Dashboards">
      <PageHeader
        title="Hosur plant weekly"
        description="Custom dashboard · editing"
        actions={
          <>
            <Button onClick={() => setShare(true)}>Share</Button>
            <Button icon={Plus}>Add widget</Button>
            <Button variant={wizard ? 'secondary' : 'primary'}>Save dashboard</Button>
          </>
        }
      />
      <div className="yx-prc-row">
        <Select aria-label="Entity" value="all" onChange={() => {}} options={[{ value: 'all', label: 'Entity: all' }]} size="sm" />
        <Select aria-label="Location" value="hosur" onChange={() => {}} options={[{ value: 'hosur', label: 'Location: Hosur plant' }]} size="sm" />
        <Select aria-label="Period" value="p" onChange={() => {}} options={[{ value: 'p', label: 'Period: last 6 months' }]} size="sm" />
      </div>
      {wizard && (
        <Card title={`Add widget · step ${at + 1} of 4`}>
          <div className="yx-prc-stack">
            <ol className="yx-prc-steps">
              {['Metric', 'Dimension', 'Period', 'Chart'].map((s, i) => (
                <li key={s} data-state={i < at ? 'done' : undefined} aria-current={i === at ? 'step' : undefined}>
                  {i + 1}. {s}
                </li>
              ))}
            </ol>
            {step === 'metric' && (
              <div className="yx-anl-wizard" role="radiogroup" aria-label="Metric">
                {METRICS.map((x) => {
                  const locked = noSalaryAccess && x.sensitivity === 'Confidential';
                  return (
                    <button key={x.key} type="button" role="radio" aria-checked={metric === x.key} aria-disabled={locked} className="yx-anl-choice" onClick={() => !locked && setMetric(x.key)}>
                      <strong className="yx-prc-row">
                        {locked && <Lock size={14} aria-hidden="true" />} {x.name}
                      </strong>
                      <span>{locked ? "You don't have access to salary data" : x.definition}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {step === 'dimension' && <RadioGroup aria-label="Dimension" value={dim} onChange={setDim} orientation="horizontal" options={['Department', 'Location', 'Grade', 'Employment type', 'Tenure band', 'Gender'].map((x) => ({ value: x, label: x, description: x === 'Gender' ? 'Small groups combined' : undefined }))} />}
            {step === 'period' && <RadioGroup aria-label="Period and comparison" value={period} onChange={setPeriod} options={['Last 6 months', 'Last 6 months vs same period last year', 'This financial year vs last', 'As on a date'].map((x) => ({ value: x, label: x }))} />}
            {step === 'chart' && (
              <>
                <ButtonGroup aria-label="Chart type">
                  {CHARTS.map((c) => (
                    <Button key={c} size="sm" aria-pressed={chartType === c} onClick={() => setChart(c)}>
                      {c}
                    </Button>
                  ))}
                </ButtonGroup>
                <BarChart title={`${m.name} by ${dim.toLowerCase()}`} description={period} categories={DEPTS} series={[{ name: 'This period', values: [11, 18, 6, 4, 22, 9] }, { name: 'Last year', values: [13, 20, 8, 5, 19, 10] }]} footnote={<ScopeChip scope="Hosur plant" />} />
              </>
            )}
            <div className="yx-prc-row">
              <Button>Back</Button>
              <Button variant="primary">{step === 'chart' ? 'Add to dashboard' : 'Next'}</Button>
            </div>
          </div>
        </Card>
      )}
      <DashboardGrid label="Hosur plant weekly" widgets={widgets} defaultEditing />
      <Dialog
        open={shareOpen}
        onOpenChange={setShare}
        title="Share Hosur plant weekly"
        description="Viewers see only the data their own access allows. A plant supervisor sees only their line."
        footer={
          <>
            <Button onClick={() => setShare(false)}>Cancel</Button>
            <Button variant="primary">Share</Button>
          </>
        }
      >
        <div className="yx-prc-stack">
          <FormField label="Share with roles or people">
            <TextField value="Plant managers, Karthik Subramanian" readOnly />
          </FormField>
          <Switch label="Set as home dashboard for Plant managers" />
        </div>
      </Dialog>
    </AnlFrame>
  );
}

/* ================================================================== */
/* ANL-04 · Metric explorer                                            */
/* ================================================================== */

export function MetricExplorerScreen({ view = 'breakdown', dimension = 'Department', suppressed = false, loading = false }: { view?: 'trend' | 'breakdown' | 'table'; dimension?: string; suppressed?: boolean; loading?: boolean }) {
  // ANL-04
  const [v, setV] = useState(view);
  const [metric, setMetric] = useState<string | null>(suppressed ? 'payroll.cost' : 'workforce.attrition_rate');
  const [dim, setDim] = useState<string | null>(dimension);
  const m = METRICS.find((x) => x.key === metric) ?? METRICS[1];
  const rows = suppress(
    suppressed
      ? [{ label: 'Engineering', value: 6240000, n: 64 }, { label: 'Operations', value: 4810000, n: 88 }, { label: 'Finance', value: 1920000, n: 14 }, { label: 'People', value: 480000, n: 3 }, { label: 'Sales', value: 2380000, n: 41 }, { label: 'Quality', value: 1490000, n: 26 }]
      : DEPTS.map((dd, i) => ({ label: dd, value: [13, 22, 6, 4, 25, 10][i], n: [64, 88, 14, 12, 41, 26][i] })),
  );
  return (
    <AnlFrame page="Explorer">
      <PageHeader title="Metric explorer" description="Any metric by any allowed dimension and period" actions={<Button variant="primary">Save as widget</Button>} />
      <div className="yx-prc-grid4">
        <FormField label="Metric">
          <Select value={metric} onChange={setMetric} options={METRICS.map((x) => ({ value: x.key, label: x.name, description: x.key }))} />
        </FormField>
        <FormField label="Split by">
          <Select value={dim} onChange={setDim} options={['Department', 'Location', 'Grade', 'Employment type', 'Tenure band'].map((x) => ({ value: x, label: x }))} />
        </FormField>
        <FormField label="Period">
          <Select value="12m" onChange={() => {}} options={[{ value: '12m', label: 'Last 12 months' }]} />
        </FormField>
        <FormField label="Compare with">
          <Select value="ly" onChange={() => {}} options={[{ value: 'ly', label: 'Same period last year' }, { value: 'none', label: 'No comparison' }]} />
        </FormField>
      </div>
      <ButtonGroup aria-label="View">
        {(['trend', 'breakdown', 'table'] as const).map((x) => (
          <Button key={x} size="sm" aria-pressed={v === x} onClick={() => setV(x)}>
            {x[0].toUpperCase() + x.slice(1)}
          </Button>
        ))}
      </ButtonGroup>
      <div className="yx-prc-split">
        {v === 'trend' ? (
          <LineChart title={`${m.name} by month`} categories={MONTHS} series={[{ name: 'This year', values: [15, 14, 16, 13, 14, 14] }, { name: 'Last year', values: [17, 16, 16, 17, 15, 16] }]} loading={loading} footnote={<ScopeChip />} />
        ) : v === 'breakdown' ? (
          <BarChart title={`${m.name} by ${(dim ?? 'department').toLowerCase()}`} money={suppressed} categories={rows.map((r) => r.label)} series={[{ name: m.name, values: rows.map((r) => r.shown) }]} groupSizes={rows.map((r) => r.n)} minGroupSize={5} loading={loading} footnote={<ScopeChip />} />
        ) : (
          <DataTable
            label={m.name}
            columns={[
              { key: 'label', header: dim ?? 'Department', value: (r: (typeof rows)[number]) => r.label, width: 180 },
              { key: 'shown', header: m.name, type: suppressed ? 'money' : 'number', value: (r: (typeof rows)[number]) => r.shown, render: (r) => (r.shown == null ? 'Suppressed (under 5)' : suppressed ? formatINR(r.shown) : `${r.shown} %`), width: 200 },
              { key: 'n', header: 'People', type: 'number', value: (r: (typeof rows)[number]) => r.n, width: 100 },
            ]}
            rows={rows}
            getRowId={(r) => r.label}
            state={loading ? 'loading' : 'ready'}
          />
        )}
        <Card title="Definition">
          <div className="yx-prc-stack">
            <p className="yx-prc-p">{m.definition}</p>
            <code className="yx-anl-formula" tabIndex={0} role="region" aria-label={`Formula for ${m.name}`}>{m.formula}</code>
            <DescriptionList items={[{ label: 'Key', value: m.key, mono: true }, { label: 'Version', value: `v${m.version}` }, { label: 'Sensitivity', value: <Badge tone={SENS_TONE[m.sensitivity]}>{m.sensitivity}</Badge> }, { label: 'Owner', value: m.owner }]} />
            {suppressed && <InlineAlert tone="info">Groups under 5 people show as "suppressed" because you don't have individual-level access to salary data in this scope. The same applies to exports.</InlineAlert>}
          </div>
        </Card>
      </div>
    </AnlFrame>
  );
}

/* ================================================================== */
/* ANL-05 · Report builder                                             */
/* ================================================================== */

const REPORT_COLUMNS = [
  { key: 'name', label: 'Employee name', locked: false },
  { key: 'dept', label: 'Department', locked: false },
  { key: 'loc', label: 'Location', locked: false },
  { key: 'doj', label: 'Date of joining', locked: false },
  { key: 'lwd', label: 'Last working day', locked: false },
  { key: 'reason', label: 'Exit reason', locked: false },
  { key: 'ctc', label: 'Annual CTC', locked: true },
  { key: 'rating', label: 'Last rating', locked: true },
];

export function ReportBuilderScreen({ grouped = true, chartOn = false, empty = false }: { grouped?: boolean; chartOn?: boolean; empty?: boolean }) {
  // ANL-05
  const [cols, setCols] = useState(['name', 'dept', 'loc', 'lwd', 'reason']);
  const [chartView, setChart] = useState(chartOn);
  const rows = empty
    ? []
    : [
        { id: '1', name: 'Rohan Das', dept: 'Operations', loc: 'Hosur plant', lwd: d(12, 7), reason: 'Higher studies' },
        { id: '2', name: 'Swathi Menon', dept: 'Sales', loc: 'Chennai office', lwd: d(28, 7), reason: 'Better pay' },
        { id: '3', name: 'Ajay Kulkarni', dept: 'Operations', loc: 'Hosur plant', lwd: d(5, 8), reason: 'Relocation' },
        { id: '4', name: 'Bhavna Shetty', dept: 'Engineering', loc: 'Bengaluru head office', lwd: d(19, 8), reason: 'Better pay' },
        { id: '5', name: 'Naveen Prasad', dept: 'Sales', loc: 'Chennai office', lwd: d(26, 8), reason: 'Career change' },
      ];
  type R = (typeof rows)[number];
  const all = [
    { key: 'name', header: 'Employee', value: (r: R) => r.name, width: 180 },
    { key: 'dept', header: 'Department', value: (r: R) => r.dept, groupable: true, width: 150 },
    { key: 'loc', header: 'Location', value: (r: R) => r.loc, groupable: true, width: 190 },
    { key: 'lwd', header: 'Last working day', type: 'date' as const, value: (r: R) => r.lwd, width: 150 },
    { key: 'reason', header: 'Exit reason', value: (r: R) => r.reason, groupable: true, width: 160 },
  ];
  return (
    <AnlFrame page="Reports">
      <PageHeader
        title="Exits in Q2 by department"
        description="Base: Exits · joins to employee and position through the metric layer"
        actions={
          <>
            <Button icon={Download}>Export</Button>
            <Button>Schedule</Button>
            <Button variant="primary">Save report</Button>
          </>
        }
      />
      <div className="yx-prc-facets">
        <aside className="yx-prc-stack" aria-label="Report settings">
          <FormField label="Start from">
            <Select value="exits" onChange={() => {}} options={[{ value: 'exits', label: 'Exits' }, { value: 'emp', label: 'Employees' }, { value: 'leave', label: 'Leave' }, { value: 'pay', label: 'Payroll lines' }, { value: 'cand', label: 'Candidates' }, { value: 'claims', label: 'Claims' }]} />
          </FormField>
          <section className="yx-prc-facet">
            <h3>Columns</h3>
            {REPORT_COLUMNS.map((c) => (
              <Checkbox key={c.key} label={<span className="yx-prc-row">{c.locked && <Lock size={14} aria-hidden="true" />} {c.label}</span>} description={c.locked ? 'Confidential: you need salary access' : undefined} disabled={c.locked} checked={cols.includes(c.key)} onChange={(on) => setCols(on ? [...cols, c.key] : cols.filter((x) => x !== c.key))} />
            ))}
          </section>
          <section className="yx-prc-facet">
            <h3>Filters</h3>
            <span className="yx-prc-small">Last working day: 1 Jul – 30 Sep 2026</span>
            <span className="yx-prc-small">Exit type: voluntary</span>
            <Button size="sm" icon={Plus}>
              Add filter
            </Button>
          </section>
          <FormField label="Group by">
            <Select value={grouped ? 'dept' : null} onChange={() => {}} options={[{ value: 'dept', label: 'Department' }, { value: 'loc', label: 'Location' }]} clearable />
          </FormField>
          <Switch label="Show chart" checked={chartView} onChange={setChart} />
        </aside>
        <div className="yx-prc-stack">
          <ScopeChip period="1 Jul – 30 Sep 2026" />
          {chartView && <BarChart title="Voluntary exits by department" categories={['Engineering', 'Operations', 'Sales']} series={[{ name: 'Exits', values: [1, 2, 2] }]} />}
          <DataTable
            label="Report preview"
            columns={all.filter((c) => cols.includes(c.key))}
            rows={rows}
            getRowId={(r) => r.id}
            defaultGroupBy={grouped ? 'dept' : null}
            empty={<EmptyState title="No rows match these filters." description="Widen the date range or remove a filter." />}
          />
        </div>
      </div>
    </AnlFrame>
  );
}

/* ================================================================== */
/* ANL-06 · Report library                                             */
/* ================================================================== */

export function ReportLibraryScreen({ query = '', favouritesOnly = false }: { query?: string; favouritesOnly?: boolean }) {
  // ANL-06
  const [q, setQ] = useState(query);
  const [fav, setFav] = useState(favouritesOnly);
  const rows = REPORTS.filter((r) => (!q || r.name.toLowerCase().includes(q.toLowerCase())) && (!fav || r.favourite));
  const groups = useMemo(() => Array.from(new Set(rows.map((r) => r.question))), [rows]);
  return (
    <AnlFrame page="Reports">
      <PageHeader title="Report library" description="Standard reports grouped by the question they answer. Statutory registers are under Compliance." actions={<Button variant="primary" icon={Plus}>New report</Button>} />
      <div className="yx-prc-row">
        <TextField value={q} onChange={setQ} prefix={<Icon icon={Search} />} placeholder="Search reports" aria-label="Search reports" />
        <Switch label="Favourites only" checked={fav} onChange={setFav} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title={`No reports match "${q}".`} description="Try another word, or build your own report." action={<Button onClick={() => setQ('')}>Clear search</Button>} />
      ) : (
        groups.map((g) => (
          <Card key={g} title={g === 'Statutory registers' ? 'Compliance · statutory registers' : g}>
            <ul className="yx-prc-plain">
              {rows
                .filter((r) => r.question === g)
                .map((r: ReportRow) => (
                  <li key={r.id}>
                    <span className="yx-prc-stack" data-gap="sm">
                      <strong className="yx-prc-row">
                        {r.favourite && <Star size={14} role="img" aria-label="Favourite" />} {r.name}
                      </strong>
                      <span className="yx-prc-small yx-prc-muted">
                        {r.id} · {r.owner} · {r.format} {!r.standard && '· made by you'}
                      </span>
                    </span>
                    <span className="yx-prc-row">
                      <Badge tone={SENS_TONE[r.sensitivity]}>{r.sensitivity}</Badge>
                      <Button size="sm">Open</Button>
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        ))
      )}
    </AnlFrame>
  );
}

/* ================================================================== */
/* ANL-07 · Metric catalogue + calculated-metric builder               */
/* ================================================================== */

export function MetricCatalogueScreen({ selected = 'workforce.attrition_rate', builder = false, persona = 'HR' }: { selected?: string; builder?: boolean; persona?: 'HR' | 'Employee' }) {
  // ANL-07
  const [sel, setSel] = useState(selected);
  const m = METRICS.find((x) => x.key === sel)!;
  const inputs: Sensitivity[] = ['Confidential', 'Internal'];
  return (
    <AnlFrame page="Metric catalogue">
      <PageHeader title="Metric catalogue" description="Governed definitions. Standard metrics can't be changed; your company can add calculated metrics from them." actions={persona === 'HR' ? <Button variant="primary" icon={Plus}>New calculated metric</Button> : undefined} />
      <div className="yx-prc-split" data-wide-aside>
        <DataTable
          label="Metrics"
          columns={[
            { key: 'name', header: 'Metric', value: (r: MetricRow) => r.name, render: (r) => <span className="yx-prc-row">{r.name} {r.calculated && <Badge tone="info">Calculated</Badge>}</span>, width: 220 },
            { key: 'key', header: 'Key', type: 'id', value: (r: MetricRow) => r.key, width: 220 },
            { key: 'domain', header: 'Domain', value: (r: MetricRow) => r.domain, groupable: true, width: 130 },
            { key: 'sens', header: 'Sensitivity', type: 'status', value: (r: MetricRow) => r.sensitivity, statusTone: (v) => SENS_TONE[v as Sensitivity], width: 120 },
            { key: 'v', header: 'Version', value: (r: MetricRow) => `v${r.version}`, width: 80 },
          ]}
          rows={METRICS}
          getRowId={(r) => r.key}
          onRowClick={(r) => setSel(r.key)}
          activeRowId={sel}
        />
        {builder ? (
          <Card title="New calculated metric">
            <div className="yx-prc-stack">
              <FormField label="Name" required>
                <TextField value="Overtime cost per head" readOnly />
              </FormField>
              <FormField label="Formula" helper="Only governed metrics, numbers and + − × ÷. No SQL.">
                <code className="yx-anl-formula" tabIndex={0} role="region" aria-label="Formula">time.overtime_cost ÷ workforce.avg_headcount</code>
              </FormField>
              <InlineAlert tone="info">Sensitivity: {inheritedSensitivity(inputs)}, inherited from time.overtime_cost (the most restrictive input).</InlineAlert>
              <DescriptionList items={[{ label: 'Preview, Sep 2026', value: formatINR(1840) }, { label: 'Unit', value: '₹ per person' }]} />
              <Button variant="primary">Save metric</Button>
            </div>
          </Card>
        ) : (
          <Card title={m.name}>
            <div className="yx-prc-stack">
              <p className="yx-prc-p">{m.definition}</p>
              <code className="yx-anl-formula" tabIndex={0} role="region" aria-label={`Formula for ${m.name}`}>{m.formula}</code>
              <DescriptionList items={[{ label: 'Unit', value: m.unit }, { label: 'Grain', value: m.grain }, { label: 'Owner', value: m.owner }, { label: 'Sensitivity', value: m.sensitivity }, { label: 'Used in', value: `${m.usedIn} dashboards and reports` }]} />
              <h3 className="yx-prc-h">Changelog</h3>
              <Timeline items={[{ id: 'v2', actor: { name: 'YukthiX' }, action: `v${m.version}: probation employees now counted by default`, at: d(1, 6) }, { id: 'v1', actor: { name: 'YukthiX' }, action: 'v1: first definition', at: d(1, 3) }]} />
            </div>
          </Card>
        )}
      </div>
    </AnlFrame>
  );
}

/* ================================================================== */
/* ANL-08 · Schedules & subscriptions + export log                     */
/* ================================================================== */

export function SchedulesScreen({ tab = 'schedules', dialog = false, persona = 'HR' }: { tab?: 'schedules' | 'exports'; dialog?: boolean; persona?: 'HR' | 'Auditor' }) {
  // ANL-08
  const [open, setOpen] = useState(dialog);
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'in-app'>('email');
  const sens: Sensitivity = 'Confidential';
  return (
    <AnlFrame page="Schedules">
      <PageHeader title={persona === 'Auditor' ? 'Export log' : 'Schedules and exports'} description="Each recipient gets only what their own access allows. Every export is audited." actions={persona === 'HR' ? <Button variant="primary" onClick={() => setOpen(true)}>New schedule</Button> : <Button icon={Download}>Download log</Button>} />
      <Tabs defaultValue={persona === 'Auditor' ? 'exports' : tab}>
        <TabsList aria-label="Schedules and exports">
          {persona === 'HR' && (
            <TabsTrigger value="schedules" count={SCHEDULES.length}>
              Schedules
            </TabsTrigger>
          )}
          <TabsTrigger value="exports" count={EXPORTS.length}>
            Export log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="schedules">
          <DataTable
            label="Schedules"
            columns={[
              { key: 'target', header: 'Dashboard or report', value: (r: ScheduleRow) => r.target, width: 260 },
              { key: 'frequency', header: 'When', value: (r: ScheduleRow) => r.frequency, width: 200 },
              { key: 'recipients', header: 'Recipients', value: (r: ScheduleRow) => r.recipients, width: 220 },
              { key: 'delivery', header: 'Delivery', value: (r: ScheduleRow) => `${r.channel} · ${deliveryMode(r.sensitivity, r.channel === 'WhatsApp' ? 'whatsapp' : 'email')}`, width: 190 },
              { key: 'lastRun', header: 'Last run', type: 'date', value: (r: ScheduleRow) => r.lastRun, width: 120 },
              { key: 'status', header: 'Status', type: 'status', value: (r: ScheduleRow) => r.status, statusTone: (v) => (v === 'Delivered' ? 'success' : v === 'Failed' ? 'danger' : 'neutral'), width: 150 },
            ]}
            rows={SCHEDULES}
            getRowId={(r) => r.id}
            rowButtons={(r) => (r.status === 'Failed' ? <Button size="sm">Retry</Button> : null)}
          />
        </TabsContent>
        <TabsContent value="exports">
          <DataTable
            label="Export log"
            columns={[
              { key: 'at', header: 'When', type: 'date', value: (r: (typeof EXPORTS)[number]) => r.at, width: 120 },
              { key: 'who', header: 'Who', value: (r: (typeof EXPORTS)[number]) => r.who, width: 200 },
              { key: 'what', header: 'What', value: (r: (typeof EXPORTS)[number]) => r.what, width: 260 },
              { key: 'format', header: 'Format', value: (r: (typeof EXPORTS)[number]) => r.format, width: 90 },
              { key: 'rows', header: 'Rows', type: 'number', value: (r: (typeof EXPORTS)[number]) => r.rows, width: 80 },
              { key: 'sens', header: 'Sensitivity', type: 'status', value: (r: (typeof EXPORTS)[number]) => r.sensitivity, statusTone: (v) => SENS_TONE[v as Sensitivity], width: 130 },
            ]}
            rows={EXPORTS}
            getRowId={(r) => r.id}
          />
        </TabsContent>
      </Tabs>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Schedule: Payroll cost by cost centre"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary">Save schedule</Button>
          </>
        }
      >
        <div className="yx-prc-stack">
          <div className="yx-prc-grid2">
            <FormField label="How often">
              <Select value="m" onChange={() => {}} options={[{ value: 'd', label: 'Daily' }, { value: 'wd', label: 'Weekdays' }, { value: 'w', label: 'Weekly' }, { value: 'm', label: 'Monthly, 1st' }]} />
            </FormField>
            <FormField label="Format">
              <Select value="xlsx" onChange={() => {}} options={[{ value: 'xlsx', label: 'XLSX' }, { value: 'csv', label: 'CSV' }, { value: 'pdf', label: 'PDF' }]} />
            </FormField>
          </div>
          <FormField label="Recipients">
            <TextField value="Suresh Pillai, Finance controller role" readOnly />
          </FormField>
          <FormField label="Channel">
            <RadioGroup value={channel} onChange={(v) => setChannel(v as typeof channel)} orientation="horizontal" aria-label="Channel" options={[{ value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'in-app', label: 'In-app' }]} />
          </FormField>
          <InlineAlert tone="info">This report has Confidential data, so it is sent as a {deliveryMode(sens, channel)}, not an attachment.</InlineAlert>
          <Checkbox label="Send only if there is data" defaultChecked />
        </div>
      </Dialog>
    </AnlFrame>
  );
}

/* ================================================================== */
/* ANL-09 · Ask analytics (AI)                                         */
/* ================================================================== */

export function AskAnalyticsScreen({ variant = 'answer' }: { variant?: 'empty' | 'answer' | 'refused' | 'generating' }) {
  // ANL-09
  const answer: AssistantMessage[] = [
    { id: 'q1', role: 'user', text: 'What was attrition in Chennai sales in the last 6 months?' },
    {
      id: 'a1',
      role: 'assistant',
      text: (
        <div className="yx-prc-stack">
          <p className="yx-prc-p">
            Annualised attrition for Sales at the Chennai office was <strong>25 %</strong> from Apr to Sep 2026 (5 exits, average headcount 40). That is up from 19 % in the same period last year.
          </p>
          <LineChart title="Attrition, Sales · Chennai office (%)" categories={MONTHS} series={[{ name: 'Annualised', values: [18, 21, 24, 27, 26, 25] }]} />
          <DescriptionList items={[{ label: 'Metric used', value: 'workforce.attrition_rate v2', mono: true }, { label: 'Filters', value: 'Department = Sales · Location = Chennai office · Apr–Sep 2026' }, { label: 'Scope', value: 'Your access: all entities' }]} />
        </div>
      ),
      sources: [{ label: 'Metric definition', href: '#metric' }],
    },
  ];
  const refused: AssistantMessage[] = [
    { id: 'q2', role: 'user', text: 'Which Chennai sales people earn the most?' },
    { id: 'a2', role: 'assistant', text: "I can't answer that: it needs salary data, and your access doesn't include it. I can show headcount or attrition for Chennai sales instead.", uncertain: 'Answers use only governed metrics, with your own permissions.' },
  ];
  return (
    <AnlFrame page="Ask (AI)">
      <PageHeader title={<span className="yx-prc-row">Ask analytics <AiBadge /></span>} description="Answers come only from governed metrics with your permissions. The definition and filters are shown with every answer; no free-form queries run." />
      {variant === 'empty' ? (
        <div className="yx-prc-stack">
          <EmptyState title="Ask a question about your data." description="For example: How many joiners did Hosur have this quarter? What is payroll cost by department in September?" />
          <AssistantPanel messages={[]} onSend={() => {}} />
        </div>
      ) : (
        <AssistantPanel messages={variant === 'refused' ? refused : answer} onSend={() => {}} generating={variant === 'generating'} onStop={() => {}} onFeedback={() => {}} />
      )}
      <p className="yx-prc-muted yx-prc-small">
        <Icon icon={BarChart3} /> Uses AI credits. Monthly leadership digest narrative is generated the same way, {formatDate(d(1, 9))}.
      </p>
    </AnlFrame>
  );
}
