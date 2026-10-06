// YukthiX console: tenants and customer success (YX-04, incl. tenant detail, support access with tenant consent, feature flags),
// product analytics (YX-09), incidents / status / probes (YX-10), help-centre editor (YX-11), nudge editor (YX-12),
// sales assist (YX-13), cost per tenant (YX-17) and contain tenant (YX-18).
import { useState } from 'react';
import { Building2, Plus, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog, TypeToConfirmDialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { MenuItem } from '../../components/menu';
import { BarChart, Funnel, Heatmap, StatCard } from '../../components/charts';
import { RichTextEditor } from '../../components/editor';
import { formatDate, formatINR } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import { checkerError, csMessageAllowed, HEALTH_LABEL, healthBand, maintenanceBlock, stepUpFresh, supportWindowError, tenantMargin } from './portals-logic';
import { BlockNote, Fact, FactRow, OtpInput, StatusBadge } from './portals-kit';
import { FilteredTable, opts } from './list-kit';
import { Console } from './console-kit';
import type { TenantRow } from './console-data';

const STATE_TONE: Record<TenantRow['state'], BadgeTone> = { trial: 'info', active: 'success', 'past due': 'warning', restricted: 'danger', suspended: 'danger', cancelled: 'neutral' };
const CHURN_TONE = { low: 'success', medium: 'warning', high: 'danger' } as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/* ================================================================== */
/* YX-04 Customer-success console: tenants, health, alerts, composer   */
/* ================================================================== */

type Alert = { id: string; tenant: string; rule: string; before: number; after: number; assigned: string; status: 'open' | 'contacted' | 'resolved' };

// YX-04
/** Tenant health list (score, trend, churn band, factors), churn-risk alerts, admin message composer with second approval; no HR data. */
export function CustomerSuccessScreen({
  tenants,
  alerts,
  tab = 'health',
  composerOpen,
  state = 'ready',
  me,
}: {
  tenants: TenantRow[];
  alerts: Alert[];
  tab?: 'health' | 'alerts';
  composerOpen?: boolean;
  state?: 'ready' | 'loading' | 'error';
  me: string;
}) {
  const [composer, setComposer] = useState(!!composerOpen);
  return (
    <Console page="Customer success">
      <PageHeader
        title="Customer success"
        description="Scores update nightly. You see usage and set-up signals only, never employee names or HR data."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setComposer(true)}>
            Message admins
          </Button>
        }
      />
      <FactRow label="Health">
        <Fact label="Tenants" value={tenants.length} />
        <Fact label="High churn risk" value={tenants.filter((t) => t.churn === 'high').length} tone="danger" />
        <Fact label="Open alerts" value={alerts.filter((a) => a.status === 'open').length} tone="warning" />
      </FactRow>
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Customer success">
          <TabsTrigger value="health">Tenant health</TabsTrigger>
          <TabsTrigger value="alerts" count={alerts.filter((a) => a.status !== 'resolved').length}>
            Churn-risk alerts
          </TabsTrigger>
        </TabsList>
        <TabsContent value="health">
          <FilteredTable
            label="Tenant health"
            rows={tenants}
            state={state}
            getRowId={(r) => r.id}
            searchText={(r) => r.name}
            fields={[
              { key: 'churn', label: 'Churn risk', type: 'multi', options: opts(['low', 'medium', 'high']) },
              { key: 'state', label: 'Lifecycle', type: 'multi', options: opts(['trial', 'active', 'past due', 'restricted', 'suspended']) },
              { key: 'owner', label: 'CS owner', type: 'multi', options: opts(['Kavitha Rao', 'Joseph Thomas']) },
            ]}
            views={[{ id: 'all', name: 'All tenants' }, { id: 'risk', name: 'High churn risk', shared: true }]}
            viewFilters={{ risk: [{ key: 'churn', type: 'multi', values: ['high'] }] }}
            columns={[
              { key: 'name', header: 'Tenant', value: (r) => r.name, width: 220 },
              { key: 'health', header: 'Score', type: 'number', value: (r) => r.health, width: 80 },
              { key: 'band', header: 'Band', type: 'status', value: (r) => HEALTH_LABEL[healthBand(r.health)], statusTone: (v) => (v === 'Healthy' ? 'success' : v === 'Watch' ? 'warning' : 'danger'), width: 100 },
              { key: 'trend', header: '30-day change', type: 'number', value: (r) => r.trend, render: (r) => `${r.trend > 0 ? '+' : ''}${r.trend}`, width: 120 },
              { key: 'churn', header: 'Churn risk', type: 'status', value: (r) => cap(r.churn), statusTone: (v) => CHURN_TONE[String(v).toLowerCase() as 'low'], width: 110 },
              { key: 'factors', header: 'Main factor', value: (r) => r.factors, width: 280 },
              { key: 'state', header: 'Lifecycle', type: 'status', value: (r) => cap(r.state), statusTone: (v) => STATE_TONE[String(v).toLowerCase() as TenantRow['state']], width: 110 },
              { key: 'owner', header: 'CS owner', value: (r) => r.owner, width: 140 },
            ]}
            bulkActions={() => (
              <>
                <Button size="sm">Assign owner</Button>
                <Button size="sm" onClick={() => setComposer(true)}>
                  Message admins
                </Button>
              </>
            )}
          />
        </TabsContent>
        <TabsContent value="alerts">
          <Card>
            <ul className="yx-ps-list">
              {alerts.map((a) => (
                <li key={a.id}>
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title">
                      {a.tenant} · {a.rule}
                    </span>
                    <span className="yx-ps-list__meta">
                      Score {a.before} → {a.after} · {a.assigned}
                    </span>
                  </div>
                  <Badge tone={a.status === 'open' ? 'warning' : a.status === 'contacted' ? 'info' : 'success'}>{cap(a.status)}</Badge>
                  <Button size="sm">Log outreach</Button>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
      <MessageComposer open={composer} onOpenChange={setComposer} me={me} />
    </Console>
  );
}

function MessageComposer({ open, onOpenChange, me }: { open: boolean; onOpenChange: (o: boolean) => void; me: string }) {
  const [kind, setKind] = useState<string | null>('tip');
  const [approver, setApprover] = useState<string | null>(me);
  const [tried, setTried] = useState(false);
  const approverErr = checkerError(me, approver);
  const allowed = csMessageAllowed(kind ?? '', 2);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Message tenant admins"
      subtitle="Goes to System, HR and Payroll Admins and billing contacts only; never to employees."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => setTried(true)} disabled={!allowed}>
            Send for approval
          </Button>
        </>
      }
    >
      <div className="yx-ps-stack">
        <FieldRow>
          <FormField label="Audience" required>
            <Select value="seg" onChange={() => undefined} options={[{ value: 'seg', label: 'Segment: high churn risk (3 tenants)' }, { value: 'list', label: 'Pick tenants' }]} />
          </FormField>
          <FormField label="Kind" required>
            <Select value={kind} onChange={setKind} options={opts(['announcement', 'tip', 'survey', 'maintenance', 'lifecycle', 'incident']).map((o) => ({ ...o, label: cap(o.label) }))} />
          </FormField>
        </FieldRow>
        {!allowed && <BlockNote>These admins already got 2 non-critical messages this week. Only maintenance and incident messages can go now.</BlockNote>}
        <FieldRow>
          <FormField label="Channel">
            <Select value="banner" onChange={() => undefined} options={[{ value: 'banner', label: 'In-app banner' }, { value: 'inbox', label: 'Inbox' }, { value: 'email', label: 'Email' }]} />
          </FormField>
          <FormField label="Send on">
            <DatePicker value={new Date(2026, 8, 30)} onChange={() => undefined} />
          </FormField>
        </FieldRow>
        <FormField label="Message (English)" required>
          <TextArea rows={4} defaultValue="Your payroll readiness check shows 12 employees without verified bank details. Fix them before 25 Oct to avoid a held payment." />
        </FormField>
        <FormField label="Second approver" required error={tried ? approverErr : null} helper="Another staff member must approve before anything is sent.">
          <Select value={approver} onChange={setApprover} options={['Anand Iyer', 'Farah Siddiqui', 'Rahul Menon'].map((x) => ({ value: x, label: x }))} />
        </FormField>
        <p className="yx-ps-muted">Marketing content respects each admin's opt-out. Delivery and read receipts appear here after sending.</p>
      </div>
    </Drawer>
  );
}

/** Tenants list and one tenant: lifecycle, billing adjustment with a reason, support access that the tenant admin approves. */
export function TenantDetailScreen({ tenant, support = 'none', now }: { tenant: TenantRow; support?: 'none' | 'requested' | 'approved' | 'declined' | 'request-form'; now: Date }) {
  const [hours, setHours] = useState<number | null>(24);
  const [open, setOpen] = useState(support === 'request-form');
  const err = supportWindowError(hours ?? 0);
  return (
    <Console page="Tenants">
      <ObjectHeader
        name={tenant.name}
        icon={Building2}
        secondary={`${tenant.products} · region ${tenant.region} · since ${formatDate(tenant.signedUp)}`}
        status={<Badge tone={STATE_TONE[tenant.state]}>{cap(tenant.state)}</Badge>}
        facts={[
          { label: 'Billed employees', value: tenant.employees.toLocaleString('en-IN') },
          { label: 'Monthly revenue', value: formatINR(tenant.mrr) },
          { label: 'Health', value: `${tenant.health} · ${HEALTH_LABEL[healthBand(tenant.health)]}` },
          { label: 'CS owner', value: tenant.owner },
        ]}
        actions={
          <>
            <Button>Extend trial</Button>
            <Button variant="primary" onClick={() => setOpen(true)}>
              Request support access
            </Button>
          </>
        }
        menu={
          <>
            <MenuItem>Issue credit note</MenuItem>
            <MenuItem>Pause dunning</MenuItem>
            <MenuItem destructive>Suspend tenant</MenuItem>
          </>
        }
      />
      {support === 'approved' && (
        <PageBanner tone="warning" action={<Button size="sm">End session</Button>}>
          Support session active: approved by Lakshmi Venkatesan (System Admin) until 30 Sep 2026, 9:42 am. Confidential and Special data is masked; POSH and cases are excluded.
        </PageBanner>
      )}
      {support === 'requested' && (
        <InlineAlert tone="info" title="Waiting for the tenant to approve">
          Sent to 2 System Admins at 9:31 am. Nothing is visible until one of them approves.
        </InlineAlert>
      )}
      {support === 'declined' && (
        <InlineAlert tone="warning" title="The tenant declined support access">
          Lakshmi Venkatesan declined at 9:38 am: "Please walk us through it on a call instead." Book a guided session.
        </InlineAlert>
      )}
      <div className="yx-split">
        <div className="yx-split__main">
          <Card title="Lifecycle">
            <DescriptionList
              columns={2}
              items={[
                { label: 'State', value: cap(tenant.state) },
                { label: 'Dunning', value: tenant.state === 'past due' ? 'Reminder sent day +7; read-only from day +15, suspended from day +30' : 'Not in dunning' },
                { label: 'Plan changes', value: 'Adds prorated now; removals at period end' },
                { label: 'Renewal notices', value: '30 and 7 days before' },
              ]}
            />
          </Card>
          <Card title="Staff actions on this tenant">
            <p className="yx-ps-muted">Every action needs a reason, is audited with your name and is visible to the tenant's admins.</p>
            <ul className="yx-ps-list">
              <li>28 Sep 2026 · Joseph Thomas extended trial by 14 days · "Set-up call booked"</li>
              <li>12 Aug 2026 · Kavitha Rao issued credit note CN-0228 for ₹4,800 · "Duplicate SMS charges"</li>
            </ul>
          </Card>
        </div>
        <div className="yx-split__aside">
          <Card title="Support access">
            <p className="yx-ps-muted">A tenant admin approves every session. Default 24 hours, never more than 72. Restricted areas are always excluded.</p>
          </Card>
        </div>
      </div>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Request support access"
        subtitle={tenant.name}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!!err}>
              Send request to tenant
            </Button>
          </>
        }
      >
        <div className="yx-ps-stack">
          <FormField label="Reason" required helper="The tenant admin sees this.">
            <TextArea rows={3} defaultValue="Ticket TKT-8841: September payroll run stuck at readiness; need to check the PF mapping." />
          </FormField>
          <FormField label="How long (hours)" required error={err}>
            <NumberField value={hours} onChange={setHours} min={1} max={72} />
          </FormField>
          <FormField label="Areas">
            <MultiSelect value={['payroll']} onChange={() => undefined} options={[{ value: 'payroll', label: 'Payroll set-up' }, { value: 'time', label: 'Time and leave set-up' }, { value: 'people', label: 'People (masked)' }]} />
          </FormField>
          <InlineAlert tone="info" title="Always excluded">
            POSH, disciplinary, grievance, whistleblower and medical records. Confidential and Special fields stay masked.
          </InlineAlert>
          <p className="yx-ps-muted">Requested at {timeOf(now)}. The session ends on its own.</p>
        </div>
      </Drawer>
    </Console>
  );
}

/** Tenants list (T2): search, lifecycle and region filters, saved views. */
export function TenantsListScreen({ tenants, state = 'ready' }: { tenants: TenantRow[]; state?: 'ready' | 'loading' | 'error' }) {
  return (
    <Console page="Tenants">
      <PageHeader title="Tenants" description="Search across every tenant. Opening a tenant never shows HR data; use a support session for that." />
      <FilteredTable
        label="Tenants"
        rows={tenants}
        state={state}
        getRowId={(r) => r.id}
        searchText={(r) => r.name}
        fields={[
          { key: 'state', label: 'Lifecycle', type: 'multi', options: opts(['trial', 'active', 'past due', 'restricted', 'suspended', 'cancelled']) },
          { key: 'region', label: 'Region', type: 'multi', options: opts(['IN', 'ME-AE', 'SG']) },
        ]}
        columns={[
          { key: 'name', header: 'Tenant', value: (r) => r.name, width: 230 },
          { key: 'products', header: 'Products', value: (r) => r.products, width: 140 },
          { key: 'employees', header: 'Billed units', type: 'number', value: (r) => r.employees, width: 120, total: 'sum' },
          { key: 'mrr', header: 'Monthly revenue', type: 'money', value: (r) => r.mrr, width: 150, total: 'sum' },
          { key: 'region', header: 'Region', value: (r) => r.region, width: 90 },
          { key: 'state', header: 'Lifecycle', type: 'status', value: (r) => cap(r.state), statusTone: (v) => STATE_TONE[String(v).toLowerCase() as TenantRow['state']], width: 110 },
          { key: 'signedUp', header: 'Signed up', type: 'date', value: (r) => r.signedUp, width: 120 },
        ]}
        empty={<EmptyState title="No tenants yet." />}
      />
    </Console>
  );
}

/** Feature flags: per-wave flags, tenant beta groups and kill switches (P13 #7). */
export function FeatureFlagsScreen({ flags, killOpen }: { flags: { key: string; desc: string; scope: string; state: 'on' | 'off' | 'beta'; killSwitch: boolean }[]; killOpen?: boolean }) {
  const [kill, setKill] = useState(!!killOpen);
  return (
    <Console page="Feature flags">
      <PageHeader title="Feature flags" description="Changes need a reason and are audited. Kill switches fall back to the non-AI or previous path." actions={<Button variant="primary" icon={Plus}>New flag</Button>} />
      <FilteredTable
        label="Feature flags"
        rows={flags}
        getRowId={(r) => r.key}
        searchText={(r) => r.key + r.desc}
        fields={[{ key: 'state', label: 'State', type: 'multi', options: opts(['on', 'off', 'beta']) }]}
        columns={[
          { key: 'key', header: 'Flag', type: 'id', value: (r) => r.key, width: 240 },
          { key: 'desc', header: 'What it controls', value: (r) => r.desc, width: 240 },
          { key: 'scope', header: 'Who has it', value: (r) => r.scope, width: 220 },
          { key: 'state', header: 'State', type: 'status', value: (r) => cap(r.state), statusTone: (v) => (v === 'On' ? 'success' : v === 'Beta' ? 'info' : 'neutral'), width: 90 },
          { key: 'kill', header: 'Kill switch', value: (r) => (r.killSwitch ? 'Engaged' : 'Ready'), width: 120 },
        ]}
        rowActions={() => (
          <>
            <MenuItem>Edit beta group</MenuItem>
            <MenuItem destructive onSelect={() => setKill(true)}>
              Engage kill switch
            </MenuItem>
          </>
        )}
      />
      <ConfirmDialog open={kill} onOpenChange={setKill} destructive title="Engage the kill switch for hire.whatsapp_apply?" consequence="WhatsApp apply stops for every tenant within a minute. Candidates see the web form instead." confirmLabel="Engage kill switch" onConfirm={() => undefined}>
        <FormField label="Reason" required>
          <TextField defaultValue="Provider outage; messages not delivered" />
        </FormField>
      </ConfirmDialog>
    </Console>
  );
}

/* ================================================================== */
/* YX-09 Product analytics                                             */
/* ================================================================== */

// YX-09
/** Funnel, time to first value, cohort retention, feature adoption, quick-start drop-off. Pseudonymous; product analytics role only. */
export function ProductAnalyticsScreen({
  funnel,
  cohorts,
  adoption,
  quickstart,
  loading,
  noAccess,
}: {
  funnel: { step: string; n: number }[];
  cohorts: { cohort: string; m: number[] }[];
  adoption: { modules: string[]; small: number[]; mid: number[] };
  quickstart: { step: string; done: number }[];
  loading?: boolean;
  noAccess?: boolean;
}) {
  if (noAccess)
    return (
      <Console page="Product analytics">
        <PageHeader title="Product analytics" />
        <EmptyState title="You don't have access to product analytics" description="Only staff with the product analytics role can open these dashboards. Ask Farah Siddiqui to grant it; access is audited." />
      </Console>
    );
  return (
    <Console page="Product analytics">
      <PageHeader title="Product analytics" description="Pseudonymous events only: no names, no HR data. Raw events are kept 13 months. Tenants that opted out are excluded." facts="Last 6 months · all products · all size bands" actions={<Button>Export</Button>} />
      <div className="yx-ps-grid">
        <StatCard label="Median time to first value" value={3} unit="days" previous={4} previousLabel="previous quarter" trend={[6, 5, 5, 4, 4, 3]} drill={{ label: 'View 812 tenants', href: '#' }} loading={loading} />
        <StatCard label="Activated within 14 days" value={44} unit="%" previous={39} trend={[33, 35, 36, 39, 41, 44]} drill={{ label: 'View cohort', href: '#' }} loading={loading} />
        <StatCard label="Trial to paid" value={17} unit="%" previous={15} trend={[12, 13, 15, 15, 16, 17]} drill={{ label: 'View 214 paid', href: '#' }} loading={loading} />
      </div>
      <Card>
        <Funnel title="Sign-up to paid" stages={funnel.map((f) => ({ label: f.step, count: f.n }))} loading={loading} />
      </Card>
      <Card>
        <Heatmap
          title="Cohort retention (% of tenants active)"
          xLabel="Sign-up month"
          columns={['Month 0', 'Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5']}
          rows={cohorts.map((c) => ({ label: c.cohort, values: Array.from({ length: 6 }, (_, i) => c.m[i] ?? null) }))}
          format={(v) => `${v}%`}
          max={100}
          loading={loading}
        />
      </Card>
      <div className="yx-split">
        <Card className="yx-split__main">
          <BarChart title="Feature adoption by size band (% of tenants)" xLabel="Module" categories={adoption.modules} series={[{ name: 'Under 200 employees', values: adoption.small }, { name: '200+ employees', values: adoption.mid }]} loading={loading} />
        </Card>
        <Card>
          <BarChart title="Quick-start step completion (%)" orientation="horizontal" xLabel="Step" categories={quickstart.map((q) => q.step)} series={[{ name: 'Completed', values: quickstart.map((q) => q.done) }]} loading={loading} />
        </Card>
      </div>
    </Console>
  );
}

/* ================================================================== */
/* YX-10 Incident & maintenance composer + status admin + probes       */
/* ================================================================== */

type IncidentRow = { id: string; title: string; severity: string; stage: string; products: string; regions: string; started: Date; postedBy: string; approvedBy: string };

// YX-10
/** Incidents and maintenance: stage templates, affected products / regions, second approval, 72 h notice and payroll-window check. */
export function IncidentComposerScreen({
  incidents,
  mode = 'list',
  me,
  maintenanceStart,
  now,
}: {
  incidents: IncidentRow[];
  mode?: 'list' | 'incident' | 'maintenance';
  me: string;
  maintenanceStart?: Date;
  now: Date;
}) {
  const [approver, setApprover] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>('identified');
  const [start, setStart] = useState<Date | null>(maintenanceStart ?? new Date(2026, 9, 11, 1, 0));
  const block = start ? maintenanceBlock(start, now) : null;
  return (
    <Console page="Incidents and status">
      <PageHeader
        title="Incidents and status"
        description="Sev-1 is posted within 30 minutes of detection. A person confirms every stage's wording; templates and changes need a second approver."
        actions={
          <>
            <Button>Schedule maintenance</Button>
            <Button variant="primary">Declare incident</Button>
          </>
        }
      />
      {mode === 'list' && (
        <FilteredTable
          label="Incidents and maintenance"
          rows={incidents}
          getRowId={(r) => r.id}
          searchText={(r) => r.title}
          fields={[{ key: 'stage', label: 'Stage', type: 'multi', options: opts(['Investigating', 'Identified', 'Monitoring', 'Resolved', 'Post-incident', 'Scheduled']) }]}
          columns={[
            { key: 'id', header: 'ID', type: 'id', value: (r) => r.id, width: 130 },
            { key: 'title', header: 'Title', value: (r) => r.title, width: 280 },
            { key: 'sev', header: 'Severity', value: (r) => r.severity, width: 120 },
            { key: 'stage', header: 'Stage', type: 'status', value: (r) => r.stage, statusTone: (v) => (v === 'Post-incident' || v === 'Resolved' ? 'success' : v === 'Scheduled' ? 'info' : 'warning'), width: 130 },
            { key: 'where', header: 'Products · regions', value: (r) => `${r.products} · ${r.regions}`, width: 160 },
            { key: 'started', header: 'Started', type: 'date', value: (r) => r.started, width: 120 },
            { key: 'by', header: 'Posted · approved', value: (r) => `${r.postedBy} · ${r.approvedBy}`, width: 240 },
          ]}
        />
      )}
      {mode === 'incident' && (
        <div className="yx-split">
          <Card title="Post an update · INC-2026-044" className="yx-split__main" footer={<Button variant="primary" disabled={!!checkerError(me, approver)}>Send for approval</Button>}>
            <div className="yx-ps-stack">
              <FieldRow>
                <FormField label="Stage" required>
                  <Select value={stage} onChange={setStage} options={['investigating', 'identified', 'monitoring', 'resolved', 'post-incident'].map((s) => ({ value: s, label: cap(s) }))} />
                </FormField>
                <FormField label="Severity">
                  <Select value="2" onChange={() => undefined} options={[{ value: '1', label: 'Sev-1' }, { value: '2', label: 'Sev-2' }, { value: '3', label: 'Sev-3' }]} />
                </FormField>
              </FieldRow>
              <FieldRow>
                <FormField label="Products">
                  <MultiSelect value={['hr']} onChange={() => undefined} options={[{ value: 'hr', label: 'YukthiX HR' }, { value: 'hire', label: 'YukthiX Hire' }, { value: 'assess', label: 'YukthiX Assess' }]} />
                </FormField>
                <FormField label="Regions">
                  <MultiSelect value={['IN']} onChange={() => undefined} options={opts(['IN', 'ME-AE', 'ME-SA', 'EU', 'US', 'SG'])} />
                </FormField>
              </FieldRow>
              <FormField label="Impact in plain words" required>
                <TextArea rows={3} defaultValue="Payslip PDFs take up to 40 seconds to open. Figures in the app are correct." />
              </FormField>
              <FormField label="What companies should do" required>
                <TextArea rows={2} defaultValue="No action needed. Publishing payslips still works." />
              </FormField>
              <Checkbox defaultChecked label="Add the payroll-day note (last 3 and first 7 days of the month)" />
              <FormField label="Next update at" required>
                <TextField defaultValue="10:30 am" />
              </FormField>
              <FormField label="Second approver" required error={approver ? checkerError(me, approver) : null}>
                <Select value={approver} onChange={setApprover} placeholder="Choose" options={['Anand Iyer', 'Farah Siddiqui', 'Joseph Thomas'].map((x) => ({ value: x, label: x }))} />
              </FormField>
            </div>
          </Card>
          <Card title="Preview on the status page">
            <div className="yx-ps-preview">
              <strong>Payslip PDFs slow to open</strong>
              <Badge tone="warning">Sev-2 · {cap(stage ?? '')}</Badge>
              <p className="yx-ps-p">Payslip PDFs take up to 40 seconds to open. Figures in the app are correct.</p>
              <p className="yx-ps-muted">Next update 10:30 am IST</p>
            </div>
          </Card>
        </div>
      )}
      {mode === 'maintenance' && (
        <Card title="Schedule maintenance" footer={<Button variant="primary" disabled={!!block}>Send for approval</Button>}>
          <div className="yx-ps-stack">
            <FormField label="Title" required>
              <TextField defaultValue="Database upgrade" />
            </FormField>
            <FieldRow>
              <FormField label="Start" required>
                <DatePicker value={start} onChange={setStart} />
              </FormField>
              <FormField label="Duration">
                <Select value="2" onChange={() => undefined} options={[{ value: '1', label: '1 hour' }, { value: '2', label: '2 hours' }]} />
              </FormField>
            </FieldRow>
            {block ? (
              <InlineAlert tone="danger" title="This window can't be used">
                {block}
              </InlineAlert>
            ) : (
              <InlineAlert tone="success" title="Window passes the checks">
                72 hours' notice, outside every tenant's payroll-critical window and statutory due dates. Reminder goes 24 hours before.
              </InlineAlert>
            )}
          </div>
        </Card>
      )}
    </Console>
  );
}

/** Synthetic probes every 5 minutes per region; a failure must be confirmed from 2 locations before paging and updating status. */
export function ProbesScreen({ probes }: { probes: { journey: string; region: string; last: string; p95: string; status: 'operational' | 'degraded' | 'major' }[] }) {
  return (
    <Console page="Probes">
      <PageHeader title="Probes" description="Each journey runs about every 5 minutes from each region against probe tenants. Two locations must agree before on-call is paged." />
      <Card>
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Probes, scrolls sideways on small screens">
        <table className="yx-ps-slabgrid">
          <caption className="yx-visually-hidden">Probes</caption>
          <thead>
            <tr>
              <th scope="col">Journey</th>
              <th scope="col">Region</th>
              <th scope="col">Last run</th>
              <th scope="col">p95</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {probes.map((p) => (
              <tr key={p.journey + p.region}>
                <th scope="row">{p.journey}</th>
                <td>{p.region}</td>
                <td>{p.last}</td>
                <td data-num>{p.p95}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </Console>
  );
}

/* ================================================================== */
/* YX-11 Help-centre editor                                            */
/* ================================================================== */

type ArticleRow = { key: string; title: string; product: string; audience: string; locales: string; status: string; reviewed: Date; owner: string };

// YX-11
/** Articles keyed by screen ID, versions, captioned videos, no-result searches; articles unreviewed for 12 months are flagged. */
export function HelpEditorScreen({ articles, noResults, editing, today }: { articles: ArticleRow[]; noResults: { term: string; count: number }[]; editing?: boolean; today: Date }) {
  const stale = (d: Date) => today.getTime() - d.getTime() > 365 * 86_400_000;
  if (editing)
    return (
      <Console page="Help centre">
        <ObjectHeader
          name="Approve and lock a payroll run"
          secondary="PAY-07.approve-run · YukthiX HR · Admin · version 4 (draft)"
          status={<Badge tone="warning">In review</Badge>}
          actions={
            <>
              <Button>Save draft</Button>
              <Button variant="primary">Publish English</Button>
            </>
          }
        />
        <div className="yx-split">
          <Card title="Article (English)" className="yx-split__main">
            <RichTextEditor aria-label="Article body" mergeFields={[]} defaultValue="<p>Only a person who did not prepare the run can approve it.</p><ol><li>Open the run and check the variance.</li><li>Type the entity and month to confirm.</li></ol>" />
          </Card>
          <div className="yx-split__aside">
            <Card title="Settings">
              <div className="yx-ps-stack">
                <FormField label="Screen IDs">
                  <TextField defaultValue="PAY-07, PAY-09" />
                </FormField>
                <FormField label="Applies from">
                  <TextField defaultValue="Release 3.2" />
                </FormField>
                <FormField label="Video" helper="Captions are required before publishing.">
                  <Select value="v" onChange={() => undefined} options={[{ value: 'v', label: 'approve-run.mp4 · captions: en, hi' }]} />
                </FormField>
              </div>
            </Card>
            <Card title="Translations">
              <ul className="yx-ps-list">
                <li>Hindi · published</li>
                <li>Tamil · published</li>
                <li>Telugu · missing (English shown with a notice)</li>
              </ul>
            </Card>
          </div>
        </div>
      </Console>
    );
  return (
    <Console page="Help centre">
      <PageHeader title="Help-centre articles" description="Every screen's help key needs a published English article or the release check fails." actions={<Button variant="primary" icon={Plus}>New article</Button>} />
      <FilteredTable
        label="Articles"
        rows={articles}
        getRowId={(r) => r.key}
        searchText={(r) => r.key + r.title}
        fields={[
          { key: 'status', label: 'Status', type: 'multi', options: opts(['draft', 'in review', 'published', 'archived']) },
          { key: 'audience', label: 'Audience', type: 'multi', options: opts(['Admin', 'Employee', 'Candidate', 'Partner', 'Developer']) },
        ]}
        columns={[
          { key: 'key', header: 'Help key', type: 'id', value: (r) => r.key, width: 170 },
          { key: 'title', header: 'Title', value: (r) => r.title, width: 260 },
          { key: 'audience', header: 'Audience', value: (r) => r.audience, width: 100 },
          { key: 'locales', header: 'Languages', value: (r) => r.locales, width: 120 },
          { key: 'status', header: 'Status', type: 'status', value: (r) => cap(r.status), statusTone: (v) => (v === 'Published' ? 'success' : v === 'In review' ? 'warning' : 'neutral'), width: 110 },
          { key: 'reviewed', header: 'Last reviewed', type: 'date', value: (r) => r.reviewed, render: (r) => (stale(r.reviewed) ? `${formatDate(r.reviewed)} · over 12 months` : formatDate(r.reviewed)), width: 190 },
          { key: 'owner', header: 'Owner', value: (r) => r.owner, width: 140 },
        ]}
      />
      <Card title="Searches with no results · last 30 days">
        <ul className="yx-ps-list">
          {noResults.map((n) => (
            <li key={n.term}>
              <span className="yx-ps-list__main">"{n.term}"</span>
              <span className="yx-ps-num">{n.count} searches</span>
              <Button size="sm">Write article</Button>
            </li>
          ))}
        </ul>
        <p className="yx-ps-muted">Search terms are stored without tenant or user IDs.</p>
      </Card>
    </Console>
  );
}

/* ================================================================== */
/* YX-12 Nudge & switch-on copy editor                                 */
/* ================================================================== */

// YX-12
/** Trial nudges per day and trigger, switch-on cards, preview, second approval, A/B off by default. */
export function NudgeEditorScreen({ nudges, me, editing }: { nudges: { key: string; day: number; product: string; condition: string; channels: string; version: string; approvedBy: string | null }[]; me: string; editing?: boolean }) {
  const [ab, setAb] = useState(false);
  const [approver, setApprover] = useState<string | null>(me);
  return (
    <Console page="Nudges and copy">
      <PageHeader title="Nudges and switch-on copy" description="At most 1 lifecycle message per admin per day, none on a day they get a CS message. Trial-ending notices at 7 days and 1 day always go." />
      <Tabs defaultValue="nudges">
        <TabsList aria-label="Copy">
          <TabsTrigger value="nudges">Trial nudges</TabsTrigger>
          <TabsTrigger value="switch">Switch-on cards</TabsTrigger>
        </TabsList>
        <TabsContent value="nudges">
          <Card>
            <ul className="yx-ps-list">
              {nudges.map((n) => (
                <li key={n.key}>
                  <Badge>Day {n.day}</Badge>
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title yx-ps-mono">{n.key}</span>
                    <span className="yx-ps-list__meta">
                      {n.product} · when {n.condition} · {n.channels} · {n.version}
                    </span>
                  </div>
                  <Badge tone={n.approvedBy ? 'success' : 'warning'}>{n.approvedBy ? `Approved by ${n.approvedBy}` : 'Waiting for approval'}</Badge>
                  <Button size="sm">Edit</Button>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
        <TabsContent value="switch">
          <div className="yx-split">
            <Card title="Card copy · trigger: trial limit reached" className="yx-split__main" footer={<Button variant="primary" disabled={!!checkerError(me, approver)}>Send for approval</Button>}>
              <div className="yx-ps-stack">
                <FormField label="Heading">
                  <TextField defaultValue="Hire your next 10 people here too" />
                </FormField>
                <FormField label="Body">
                  <TextArea rows={2} defaultValue="Switch on YukthiX Hire to post jobs, run interviews and send offers from the same place." />
                </FormField>
                <p className="yx-ps-muted">Buttons are fixed: Switch on, Talk to us, Not now. A dismissed card returns after 14 days.</p>
                <Switch checked={ab} onChange={setAb} label="A/B test this copy" description="Off by default." />
                <FormField label="Second approver" required error={checkerError(me, approver)}>
                  <Select value={approver} onChange={setApprover} options={['Anand Iyer', 'Farah Siddiqui'].map((x) => ({ value: x, label: x }))} />
                </FormField>
              </div>
            </Card>
            <Card title="Preview">
              <div className="yx-ps-preview">
                <strong>Hire your next 10 people here too</strong>
                <p className="yx-ps-p">Switch on YukthiX Hire to post jobs, run interviews and send offers from the same place.</p>
                <div className="yx-ps-row">
                  <Button size="sm" variant="primary">
                    Switch on
                  </Button>
                  <Button size="sm">Talk to us</Button>
                  <Button size="sm">Not now</Button>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      {editing && <InlineAlert tone="info" title="Day 7 nudge v5 is waiting for approval">Farah Siddiqui was asked at 9:12 am.</InlineAlert>}
    </Console>
  );
}

/* ================================================================== */
/* YX-13 Sales-assist queue                                            */
/* ================================================================== */

type SalesRow = { id: string; tenant: string; band: string; trigger: string; setup: number; owner: string; due: Date; outcome: string };

// YX-13
/** "Talk to us" requests and size triggers; owner, 1-business-day SLA, outcome; no employee names, no private discounts. */
export function SalesAssistScreen({ rows, now, state = 'ready' }: { rows: SalesRow[]; now: Date; state?: 'ready' | 'loading' | 'error' }) {
  return (
    <Console page="Sales assist">
      <PageHeader title="Sales assist" description="Trials with 200+ employees, 3 entities, 10 recruiters or 2,000 test attempts, or asking for migration help. Reply within 1 business day. No private discounts." />
      <FilteredTable
        label="Sales-assist queue"
        rows={rows}
        state={state}
        getRowId={(r) => r.id}
        searchText={(r) => r.tenant}
        fields={[
          { key: 'outcome', label: 'Outcome', type: 'multi', options: opts(['Open', 'Demo booked', 'Converted', 'Lost']) },
          { key: 'owner', label: 'Owner', type: 'multi', options: opts(['Rahul Menon', 'Kavitha Rao', 'Unassigned']) },
        ]}
        columns={[
          { key: 'tenant', header: 'Tenant', value: (r) => r.tenant, width: 220 },
          { key: 'band', header: 'Size band', value: (r) => r.band, width: 120 },
          { key: 'trigger', header: 'Why', value: (r) => r.trigger, width: 220 },
          { key: 'setup', header: 'Set-up %', type: 'number', value: (r) => r.setup, width: 100 },
          { key: 'owner', header: 'Owner', value: (r) => r.owner, width: 140 },
          {
            key: 'sla',
            header: 'SLA',
            type: 'status',
            value: (r) => (r.outcome !== 'Open' ? 'Met' : r.due < now ? 'Breached' : `Due ${timeOf(r.due)}`),
            statusTone: (v) => (v === 'Breached' ? 'danger' : v === 'Met' ? 'success' : 'warning'),
            width: 130,
          },
          { key: 'outcome', header: 'Outcome', value: (r) => r.outcome, width: 120 },
        ]}
        rowButtons={(r) => (r.owner === 'Unassigned' ? <Button size="sm">Take</Button> : null)}
        empty={<EmptyState title="No requests waiting." />}
      />
    </Console>
  );
}

/* ================================================================== */
/* YX-17 Cost per tenant                                               */
/* ================================================================== */

type CostRow = { tenant: string; revenue: number; storage: number; egress: number; ai: number; compute: number };

// YX-17
/** Storage, egress, AI and compute beside revenue and margin; flags cost above the alert share (margin guard ≤ 40% from month 18). */
export function CostPerTenantScreen({ rows, alertShare = 35 }: { rows: CostRow[]; alertShare?: number }) {
  const data = rows.map((r) => {
    const cost = r.storage + r.egress + r.ai + r.compute;
    return { ...r, cost, ...tenantMargin(r.revenue, cost, alertShare) };
  });
  const flagged = data.filter((d) => d.alert);
  return (
    <Console page="Cost per tenant">
      <PageHeader title="Cost per tenant" description="Daily from metering tags; shared costs split by the documented key. Staff only." facts={`September 2026 to date · alert when cost passes ${alertShare}% of revenue`} />
      {flagged.length > 0 && (
        <InlineAlert tone="warning" title={`${flagged.length} tenants above the ${alertShare}% cost share`}>
          {flagged.map((f) => `${f.tenant} (${f.share}%)`).join(', ')}. AI usage is the main driver.
        </InlineAlert>
      )}
      <FilteredTable
        label="Cost per tenant"
        rows={data}
        getRowId={(r) => r.tenant}
        searchText={(r) => r.tenant}
        fields={[]}
        columns={[
          { key: 'tenant', header: 'Tenant', value: (r) => r.tenant, width: 220 },
          { key: 'revenue', header: 'Revenue', type: 'money', value: (r) => r.revenue, total: 'sum', width: 130 },
          { key: 'storage', header: 'Storage', type: 'money', value: (r) => r.storage, total: 'sum', width: 110 },
          { key: 'egress', header: 'Egress', type: 'money', value: (r) => r.egress, total: 'sum', width: 110 },
          { key: 'ai', header: 'AI', type: 'money', value: (r) => r.ai, total: 'sum', width: 110 },
          { key: 'compute', header: 'Compute', type: 'money', value: (r) => r.compute, total: 'sum', width: 110 },
          { key: 'margin', header: 'Gross margin', type: 'number', value: (r) => r.margin, render: (r) => `${r.margin}%`, width: 120 },
          { key: 'flag', header: 'Cost share', type: 'status', value: (r) => `${r.share}%`, statusTone: (_v, r) => (r.alert ? 'danger' : 'success'), width: 110 },
        ]}
      />
      <Card>
        <BarChart title="Cost by type, top tenants" money stacked xLabel="Tenant" categories={data.map((d) => d.tenant)} series={[{ name: 'Storage', values: data.map((d) => d.storage) }, { name: 'Egress', values: data.map((d) => d.egress) }, { name: 'AI', values: data.map((d) => d.ai) }, { name: 'Compute', values: data.map((d) => d.compute) }]} />
      </Card>
    </Console>
  );
}

/* ================================================================== */
/* YX-18 Contain tenant + tenant-side banner                           */
/* ================================================================== */

// YX-18
/** One action revokes sessions, keys and grants, forces MFA, freezes bank changes, exports and payouts; needs reason + step-up. Lift needs two people. */
export function ContainTenantScreen({ state = 'form', stepUpAt, now }: { state?: 'form' | 'contained' | 'lift'; stepUpAt: Date | null; now: Date }) {
  const [otp, setOtp] = useState('');
  const fresh = stepUpFresh(stepUpAt, now);
  return (
    <Console page="Contain tenant">
      <PageHeader title="Contain tenant" description="For a suspected compromise. Opens the DPDP / CERT-In breach clock." />
      {state === 'form' && (
        <Card title="Vaigai Motors" footer={fresh ? <TypeToConfirmDialog objectName="CONTAIN VAIGAI MOTORS" trigger={<Button variant="danger" icon={ShieldAlert}>Contain tenant</Button>} title="Contain Vaigai Motors now?" consequence="All 530 users are signed out and must sign in again with MFA. 4 API keys, 2 OAuth apps and 1 partner grant are revoked." confirmLabel="Contain tenant" onConfirm={() => undefined} /> : undefined}>
          <div className="yx-ps-stack">
            <FormField label="Reason" required>
              <TextArea rows={3} defaultValue="Admin account signed in from 3 new countries within 20 minutes; bulk export started." />
            </FormField>
            <FormField label="Scope">
              <RadioGroup defaultValue="all" options={[{ value: 'all', label: 'Whole tenant' }, { value: 'entity', label: 'One legal entity' }]} />
            </FormField>
            <InlineAlert tone="warning" title="What happens at once">
              Sessions, API keys, OAuth and partner grants revoked · everyone re-authenticates with MFA · bank-detail changes, bulk exports and payout release frozen · incident banner shown to the tenant's users.
            </InlineAlert>
            {!fresh && (
              <div className="yx-ps-stack">
                <p className="yx-ps-p">Confirm with your security key or a code to continue (step-up, valid 15 minutes).</p>
                <OtpInput value={otp} onChange={setOtp} label="Step-up code" />
                <Button disabled={otp.length < 6}>Verify</Button>
              </div>
            )}
          </div>
        </Card>
      )}
      {state === 'contained' && (
        <>
          <InlineAlert tone="danger" title="Vaigai Motors is contained since 9:20 am" actions={<Button size="sm">Request lift</Button>}>
            Breach clock opened: CERT-In report due by 29 Sep 2026, 3:20 pm (6 hours). Frozen items resume only after a two-person lift.
          </InlineAlert>
          <Card title="What the tenant's users see">
            <PageBanner tone="danger">We've paused some actions to protect your company's data. Sign in again with MFA. Bank-detail changes, exports and payouts are on hold; your admin has details.</PageBanner>
          </Card>
        </>
      )}
      {state === 'lift' && (
        <Card title="Lift containment" footer={<Button variant="primary" disabled>Lift containment</Button>}>
          <div className="yx-ps-stack">
            <DescriptionList items={[{ label: 'Requested by', value: 'Anand Iyer, 29 Sep 2026, 2:10 pm' }, { label: 'Second approver', value: 'Waiting for Farah Siddiqui' }]} />
            <BlockNote>Lifting needs two different people. Frozen items resume after the second approval.</BlockNote>
          </div>
        </Card>
      )}
    </Console>
  );
}
