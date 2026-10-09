// Integrations, developers, audit log, support access, billing & sandbox (PLT-14, 15, 16, 17, 19).
import { useState } from 'react';
import { Copy, KeyRound, Link2, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import { PageHeader, ObjectHeader, Card, Tabs, TabsContent, TabsList, TabsTrigger, DescriptionList } from '../../components/shell';
import { Button, Link } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { Dialog, ConfirmDialog } from '../../components/overlay';
import { Stepper } from '../../components/stepper';
import { FormField, FieldRow } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select, MultiSelect } from '../../components/select';
import { Checkbox, RadioGroup } from '../../components/choice';
import { DataTable, type TableColumn } from '../../components/table';
import { BarChart, LineChart } from '../../components/charts';
import { Timeline } from '../../components/timeline';
import { MenuItem } from '../../components/menu';
import { PageBanner } from '../../components/notify';
import { formatDate, formatINR } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import { DesktopFrame } from '../_kit/frames';
import { TODAY } from '../_kit/data';
import { DiffTable, ListPage, Tile, settingsPanel, toneFor, type DiffRow } from './platform-kit';
import { at } from './platform-data';

const stamp = (x: Date) => `${formatDate(x)}, ${timeOf(x)}`;

/* ================================================================ PLT-14 Integrations */

export interface Connector {
  id: string;
  name: string;
  area: 'Attendance devices' | 'Accounting' | 'Chat' | 'Sign-in' | 'Job boards' | 'Banking';
  method: 'OAuth' | 'API key' | 'Agent download' | 'Device registration';
  status: 'Connected' | 'Degraded' | 'Broken' | 'Available';
  lastRun?: Date;
  note: string;
}

export interface RunRow {
  id: string;
  at: Date;
  kind: string;
  records: number;
  errors: number;
  status: 'Done' | 'Failed' | 'Retrying';
}

export function IntegrationsScreen({ view, connectors, runs, wizardStep = 'method' }: { view: 'catalogue' | 'wizard' | 'detail'; connectors: Connector[]; runs: RunRow[]; wizardStep?: string }) {
  const [area, setArea] = useState('All');
  const areas = ['All', ...Array.from(new Set(connectors.map((c) => c.area)))];
  const shown = connectors.filter((c) => area === 'All' || c.area === area);
  const device = connectors.find((c) => c.area === 'Attendance devices')!;
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('7.1 Integrations')}>
      {view === 'catalogue' && (
        <>
          <PageHeader title="Integrations" description="Connect devices, accounting, chat, sign-in, job boards and banks. Health and runs are shown for each." facts={`${connectors.filter((c) => c.status !== 'Available').length} connected · ${connectors.filter((c) => c.status === 'Broken').length} need attention`} />
          <div className="yx-plt-grid" data-cols="3">
            {connectors
              .filter((c) => c.status !== 'Available')
              .map((c) => (
                <Tile key={c.id} title={c.name} tone={c.status === 'Broken' ? 'danger' : c.status === 'Degraded' ? 'warning' : undefined} badge={<Badge tone={toneFor(c.status)}>{c.status}</Badge>} actions={<Button size="sm">Open</Button>}>
                  <p className="yx-plt-muted">{c.note}</p>
                  {c.lastRun && <p className="yx-plt-muted">Last run {stamp(c.lastRun)}</p>}
                </Tile>
              ))}
          </div>
          <Tabs value={area} onValueChange={setArea}>
            <TabsList aria-label="Catalogue areas">
              {areas.map((a) => (
                <TabsTrigger key={a} value={a}>
                  {a}
                </TabsTrigger>
              ))}
            </TabsList>
            {areas.map((a) => (
              <TabsContent key={a} value={a} forceMount hidden={a !== area}>
                {a === area && (
                  <div className="yx-plt-grid" data-cols="3">
                    {shown.map((c) => (
                      <Tile key={c.id} title={c.name} badge={<Badge>{c.method}</Badge>} actions={c.status === 'Available' ? <Button size="sm" icon={Link2}>Connect</Button> : <Button size="sm">Manage</Button>}>
                        <p className="yx-plt-muted">
                          {c.area} · {c.note}
                        </p>
                      </Tile>
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}
      {view === 'wizard' && (
        <>
          <PageHeader title="Connect LedgerBook accounting" description="Post payroll and expense journals to your accounting system." />
          <Stepper
            title="Connect LedgerBook"
            defaultCurrent={wizardStep}
            finishLabel="Turn on integration"
            steps={[
              { id: 'method', title: 'Sign in', description: 'OAuth consent', content: <InlineAlert title="You'll be sent to LedgerBook to sign in">YukthiX asks to read your chart of accounts and post journals. You can disconnect any time.</InlineAlert>, summary: <p className="yx-plt-p">Signed in as accounts@kaverifoods.in</p> },
              {
                id: 'scope',
                title: 'What to send',
                content: (
                  <div className="yx-plt-stack">
                    <Checkbox label="Payroll journal per run" defaultChecked />
                    <Checkbox label="Expense claims paid" defaultChecked />
                    <Checkbox label="Per-employee salary lines" description="Confidential: sends each person's pay. Needs the Confidential field class on this key." />
                  </div>
                ),
                summary: <p className="yx-plt-p">Payroll journal, expense claims</p>,
              },
              {
                id: 'map',
                title: 'Map ledgers',
                description: '3 unmapped',
                status: 'error',
                statusNote: '3 components need a ledger',
                content: (
                  <DataTable
                    label="Ledger mapping"
                    columns={[
                      { key: 'c', header: 'Pay component', value: (r: { c: string; l: string | null }) => r.c },
                      { key: 'l', header: 'Ledger', value: (r) => r.l ?? '', render: (r) => (r.l ? r.l : <Badge tone="warning">Choose a ledger</Badge>) },
                    ]}
                    rows={[
                      { c: 'Basic', l: '5010 Salaries and wages' },
                      { c: 'HRA', l: '5010 Salaries and wages' },
                      { c: 'Employer PF', l: null },
                      { c: 'Employer ESI', l: null },
                      { c: 'Night shift allowance', l: null },
                    ]}
                    getRowId={(r) => r.c}
                  />
                ),
                summary: <p className="yx-plt-p">5 components mapped</p>,
              },
              { id: 'test', title: 'Test', content: <InlineAlert tone="success" title="Test journal posted">August 2026 journal posted to LedgerBook sandbox: 14 lines, balanced.</InlineAlert>, summary: <p className="yx-plt-p">Test passed</p> },
            ]}
            review={{}}
          />
        </>
      )}
      {view === 'detail' && (
        <>
          <ObjectHeader
            name={device.name}
            icon={Link2}
            secondary={`${device.area} · ${device.method} · Hosur plant gate and canteen`}
            status={<Badge tone={toneFor(device.status)}>{device.status}</Badge>}
            facts={[
              { label: 'Devices', value: '6 of 7 online' },
              { label: 'Punches today', value: '312' },
              { label: 'Last sync', value: device.lastRun ? timeOf(device.lastRun) : '—' },
            ]}
            actions={
              <>
                <Button icon={RefreshCw}>Sync now</Button>
                <Button variant="danger">Disconnect</Button>
              </>
            }
          />
          <InlineAlert tone="warning" title="Canteen gate device offline since 7:10 am">
            Punches are stored on the device and sent when it reconnects. Check the power and network at the canteen gate.
          </InlineAlert>
          <Tabs defaultValue="runs">
            <TabsList aria-label="Integration sections">
              <TabsTrigger value="runs">Run log</TabsTrigger>
              <TabsTrigger value="map" count={4}>Device mapping</TabsTrigger>
            </TabsList>
            <TabsContent value="runs">
              <DataTable
                label="Run log"
                columns={[
                  { key: 'at', header: 'Time', value: (r: RunRow) => r.at, render: (r) => stamp(r.at) },
                  { key: 'kind', header: 'Run', value: (r) => r.kind },
                  { key: 'records', header: 'Records', type: 'number', value: (r) => r.records },
                  { key: 'errors', header: 'Errors', type: 'number', value: (r) => r.errors },
                  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => toneFor(v) },
                ]}
                rows={runs}
                getRowId={(r) => r.id}
                rowButtons={(r) => (r.status === 'Failed' ? <Button size="sm">Retry</Button> : null)}
              />
            </TabsContent>
            <TabsContent value="map">
              <DataTable
                label="Unmatched device users"
                columns={[
                  { key: 'id', header: 'Device user ID', type: 'id', value: (r: { id: string; name: string }) => r.id },
                  { key: 'name', header: 'Name on device', value: (r) => r.name },
                ]}
                rows={[
                  { id: 'HSR-0412', name: 'RAVI S' },
                  { id: 'HSR-0419', name: 'MURUGAN K' },
                  { id: 'HSR-0433', name: 'PRIYA D' },
                  { id: 'HSR-0440', name: 'ANAND' },
                ]}
                getRowId={(r) => r.id}
                rowButtons={() => <Button size="sm">Match employee</Button>}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </DesktopFrame>
  );
}

/* ================================================================ PLT-15 Developers */

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  classes: string;
  lastUsed: Date | null;
  expires: Date | null;
  status: 'Active' | 'Revoked' | 'Expired';
}

export interface WebhookDelivery {
  id: string;
  at: Date;
  event: string;
  endpoint: string;
  code: number | null;
  attempts: number;
  status: 'Delivered' | 'Failed' | 'Retrying';
}

export function DevelopersScreen({ tab = 'keys', keys, deliveries, createOpen, newSecret }: { tab?: 'keys' | 'oauth' | 'webhooks' | 'usage'; keys: ApiKeyRow[]; deliveries: WebhookDelivery[]; createOpen?: boolean; newSecret?: boolean }) {
  const [create, setCreate] = useState(Boolean(createOpen));
  const [shown, setShown] = useState(Boolean(newSecret));
  const [classes, setClasses] = useState<string[]>(['Public', 'Internal']);
  const [revoke, setRevoke] = useState<string | null>(null);
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('7.2 Developers')}>
      <PageHeader title="Developers" description="API keys, connected apps, webhooks and usage. Keys never have more access than the person who made them." actions={<Link href="#">Open API reference</Link>} />
      {shown && (
        <InlineAlert tone="warning" title="Copy this key now. You won't see it again." actions={<Button size="sm" icon={Copy}>Copy key</Button>}>
          <span className="yx-plt-mono">yx_live_kf_7Hq2••••••••••••••••••••P9</span> · Payroll export key · expires 31 Mar 2027
        </InlineAlert>
      )}
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Developer settings">
          <TabsTrigger value="keys" count={keys.filter((k) => k.status === 'Active').length}>API keys</TabsTrigger>
          <TabsTrigger value="oauth">Connected apps</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="keys">
          <div className="yx-plt-stack">
            <div className="yx-plt-row" data-justify="between">
              <span />
              <Button variant="primary" icon={KeyRound} onClick={() => setCreate(true)}>
                Create API key
              </Button>
            </div>
            <DataTable
              label="API keys"
              columns={[
                { key: 'name', header: 'Name', value: (r: ApiKeyRow) => r.name },
                { key: 'prefix', header: 'Key', type: 'id', value: (r) => `${r.prefix}••••` },
                { key: 'scopes', header: 'Scopes', value: (r) => r.scopes, width: 220 },
                { key: 'classes', header: 'Field classes', value: (r) => r.classes },
                { key: 'lastUsed', header: 'Last used', value: (r) => r.lastUsed, render: (r) => (r.lastUsed ? stamp(r.lastUsed) : 'Never') },
                { key: 'expires', header: 'Expires', type: 'date', value: (r) => r.expires },
                { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => toneFor(v) },
              ]}
              rows={keys}
              getRowId={(r) => r.id}
              empty={<EmptyState title="No API keys yet." description="Create a key for each system that calls the YukthiX API." />}
              rowActions={(r) =>
                r.status === 'Active' ? (
                  <>
                    <MenuItem icon={RotateCcw}>Rotate key</MenuItem>
                    <MenuItem destructive onSelect={() => setRevoke(r.id)}>
                      Revoke key
                    </MenuItem>
                  </>
                ) : null
              }
            />
          </div>
        </TabsContent>
        <TabsContent value="oauth">
          <ul className="yx-plt-list">
            <li>
              <div className="yx-plt-list__main">
                <strong>LedgerBook accounting</strong>
                <span className="yx-plt-muted">Scopes: payroll.journals.read, expenses.read · approved by Suresh Pillai on 12 Aug 2026</span>
              </div>
              <Button size="sm">Revoke access</Button>
            </li>
            <li>
              <div className="yx-plt-list__main">
                <strong>ShiftWise rostering</strong>
                <span className="yx-plt-muted">Scopes: employees.read, rosters.write · approved by Lakshmi Venkatesan on 3 Sep 2026</span>
              </div>
              <Button size="sm">Revoke access</Button>
            </li>
          </ul>
        </TabsContent>
        <TabsContent value="webhooks">
          <div className="yx-plt-stack">
            <Card title="Endpoint · https://hooks.kaverifoods.in/yukthix" actions={<><Button size="sm">Send test event</Button><Button size="sm">Edit events</Button></>}>
              <p className="yx-plt-muted">Events: employee.hired, employee.exited, leave.approved, payroll.run.approved · signed with HMAC-SHA256 · failures: 2 in 24 hours</p>
            </Card>
            <DataTable
              label="Webhook deliveries"
              columns={[
                { key: 'at', header: 'Time', value: (r: WebhookDelivery) => r.at, render: (r) => stamp(r.at) },
                { key: 'event', header: 'Event', type: 'id', value: (r) => r.event },
                { key: 'code', header: 'Response', value: (r) => r.code ?? 'No response' },
                { key: 'attempts', header: 'Attempts', type: 'number', value: (r) => r.attempts },
                { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => toneFor(v) },
              ]}
              rows={deliveries}
              getRowId={(r) => r.id}
              rowButtons={() => <Button size="sm" icon={RotateCcw}>Replay</Button>}
            />
          </div>
        </TabsContent>
        <TabsContent value="usage">
          <div className="yx-plt-stack">
            <LineChart title="API calls per day" categories={['23 Sep', '24 Sep', '25 Sep', '26 Sep', '27 Sep', '28 Sep', '29 Sep']} series={[{ name: 'Calls', values: [4210, 4388, 4102, 1320, 980, 4460, 2210] }, { name: 'Errors', values: [12, 8, 40, 2, 1, 9, 3] }]} xLabel="Day" />
            <Meter value={23670} max={50000} label="Calls this month vs fair use" valueText="23,670 of 50,000" />
          </div>
        </TabsContent>
      </Tabs>
      <Dialog
        open={create}
        onOpenChange={setCreate}
        title="Create API key"
        size="md"
        footer={
          <>
            <Button onClick={() => setCreate(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setCreate(false);
                setShown(true);
              }}
            >
              Create key
            </Button>
          </>
        }
      >
        <div className="yx-plt-stack">
          <FormField label="Name" required>
            <TextField defaultValue="Payroll export key" />
          </FormField>
          <FormField label="Scope">
            <Select options={[{ value: 'tenant', label: 'All entities' }, { value: 'kf-ka', label: 'Kaveri Foods Pvt Ltd' }, { value: 'kf-tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }]} value="tenant" onChange={() => {}} />
          </FormField>
          <FormField label="Field classes it may read" helper="Special data (health, Aadhaar, POSH) is never available to keys.">
            <MultiSelect options={['Public', 'Internal', 'Personal', 'Confidential'].map((c) => ({ value: c, label: c }))} value={classes} onChange={setClasses} />
          </FormField>
          <FieldRow>
            <FormField label="Expires">
              <Select options={[{ value: '90', label: 'In 90 days' }, { value: '180', label: 'In 180 days' }, { value: 'never', label: 'Never (not advised)' }]} value="180" onChange={() => {}} />
            </FormField>
            <FormField label="IP allow-list" optional>
              <TextField placeholder="203.0.113.0/24" />
            </FormField>
          </FieldRow>
        </div>
      </Dialog>
      {revoke && (
        <ConfirmDialog open onOpenChange={(o) => !o && setRevoke(null)} destructive title={`Revoke ${keys.find((k) => k.id === revoke)?.name}?`} consequence="Calls with this key stop working at once. You can't undo this; create a new key instead." confirmLabel="Revoke key" onConfirm={() => setRevoke(null)} />
      )}
    </DesktopFrame>
  );
}

/* ================================================================ PLT-16 Audit log */

export interface AuditRow {
  id: string;
  at: Date;
  actor: string;
  actorRole: string;
  category: 'Data change' | 'Sensitive view' | 'Export' | 'Access & security' | 'Configuration' | 'Approval' | 'Lock';
  action: string;
  subject: string;
  channel: string;
  diff?: DiffRow[];
}

const auditColumns: TableColumn<AuditRow>[] = [
  { key: 'at', header: 'Time', type: 'date', value: (r) => r.at, render: (r) => stamp(r.at) },
  { key: 'actor', header: 'Who', type: 'person', value: (r) => r.actor, person: (r) => ({ name: r.actor, secondary: r.actorRole }) },
  { key: 'category', header: 'Category', type: 'status', value: (r) => r.category, statusTone: () => 'neutral' },
  { key: 'action', header: 'Action', value: (r) => r.action, width: 260 },
  { key: 'subject', header: 'Subject', value: (r) => r.subject },
  { key: 'channel', header: 'From', value: (r) => r.channel },
];

export function AuditLogScreen({ rows, openId, chain = 'verified', state = 'ready', masked }: { rows: AuditRow[]; openId?: string; chain?: 'verified' | 'broken'; state?: 'ready' | 'loading' | 'error'; masked?: boolean }) {
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const current = rows.find((r) => r.id === open);
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('2.7 Audit log')}>
      <ListPage
        title="Audit log"
        description="Every change, sensitive view, export, sign-in and approval. Entries can't be edited or deleted."
        status={chain === 'verified' ? <Badge tone="success">Chain verified today 2:00 am</Badge> : <Badge tone="danger">Chain check failed</Badge>}
        above={
          chain === 'broken' && (
            <InlineAlert tone="danger" title="The integrity check found a gap on 27 Sep 2026" actions={<Button size="sm">Contact YukthiX security</Button>}>
              Entries after 27 Sep, 11:40 pm don't match the daily anchor. YukthiX security has been alerted; keep this page's export for your records.
            </InlineAlert>
          )
        }
        actions={<Button>Export CSV</Button>}
        label="Audit entries"
        columns={auditColumns}
        rows={rows}
        getRowId={(r) => r.id}
        filters={[
          { key: 'actor', label: 'Person', type: 'text' },
          { key: 'subject', label: 'Subject', type: 'text' },
          { key: 'category', label: 'Category', type: 'multi', options: ['Data change', 'Sensitive view', 'Export', 'Access & security', 'Configuration', 'Approval', 'Lock'].map((v) => ({ value: v, label: v })) },
          { key: 'action', label: 'Action', type: 'text' },
          { key: 'at', label: 'Date', type: 'date' },
        ]}
        searchPlaceholder="Search person, subject or action"
        state={state}
        empty={<EmptyState title="No audit entries for this period." />}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
      >
        {current && (
          <Drawer open onOpenChange={(o) => !o && setOpen(null)} title={current.action} subtitle={`${stamp(current.at)} · ${current.channel}`} meta={<PersonLabel name={current.actor} secondary={current.actorRole} />} size="lg">
            <div className="yx-plt-stack">
              <DescriptionList
                items={[
                  { label: 'Subject', value: current.subject },
                  { label: 'Category', value: current.category },
                  { label: 'Entry hash', value: 'sha256 9f2c…a41e', mono: true, copyValue: '9f2c1b77e0a41e' },
                ]}
              />
              {current.diff ? <DiffTable caption="Changes" rows={masked ? current.diff.map((r) => ({ ...r, masked: r.field === 'Bank account' || r.field === 'Monthly CTC' })) : current.diff} /> : <p className="yx-plt-muted">No field changes for this entry.</p>}
            </div>
          </Drawer>
        )}
      </ListPage>
    </DesktopFrame>
  );
}

/* ================================================================ PLT-17 Support-access requests */

export interface SupportRequest {
  id: string;
  ticket: string;
  agent: string;
  reason: string;
  scope: string;
  requested: Date;
  hours: number;
  status: 'Requested' | 'Active' | 'Ended' | 'Rejected' | 'Expired';
  endsAt?: Date;
}

export function SupportAccessScreen({ rows, approveId, activeId }: { rows: SupportRequest[]; approveId?: string; activeId?: string }) {
  const [approve, setApprove] = useState<string | null>(approveId ?? null);
  const [hours, setHours] = useState('24');
  const [open, setOpen] = useState<string | null>(activeId ?? null);
  const req = rows.find((r) => r.id === approve);
  const active = rows.find((r) => r.id === open);
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('2.6 Support access')}>
      <ListPage
        title="Support access"
        description="YukthiX support can see your data only when you approve a time-boxed session. Restricted areas are never included."
        above={
          rows.some((r) => r.status === 'Active') && (
            <PageBanner tone="warning" action={<Button size="sm">End session now</Button>}>
              YukthiX support session active until {stamp(rows.find((r) => r.status === 'Active')!.endsAt!)}. Every action is logged below.
            </PageBanner>
          )
        }
        label="Support access requests"
        columns={[
          { key: 'ticket', header: 'Ticket', type: 'id', value: (r: SupportRequest) => r.ticket },
          { key: 'agent', header: 'YukthiX agent', value: (r) => r.agent },
          { key: 'reason', header: 'Reason', value: (r) => r.reason, width: 280 },
          { key: 'scope', header: 'Scope asked', value: (r) => r.scope },
          { key: 'requested', header: 'Requested', type: 'date', value: (r) => r.requested },
          { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => toneFor(v) },
        ]}
        rows={rows}
        getRowId={(r) => r.id}
        empty={<EmptyState title="No support access requests." description="When YukthiX support needs to look at your data for a ticket, the request appears here for your approval." />}
        rowButtons={(r) => (r.status === 'Requested' ? <Button variant="review" size="sm" onClick={() => setApprove(r.id)}>Review</Button> : r.status === 'Active' ? <Button size="sm" onClick={() => setOpen(r.id)}>View activity</Button> : null)}
        onRowClick={(r) => r.status === 'Active' && setOpen(r.id)}
      >
        {req && (
          <Dialog
            open
            onOpenChange={(o) => !o && setApprove(null)}
            title={`Approve support access for ${req.ticket}?`}
            description={`${req.agent} asks: “${req.reason}”`}
            size="md"
            footer={
              <>
                <Button onClick={() => setApprove(null)}>Reject</Button>
                <Button variant="primary" onClick={() => setApprove(null)}>
                  Approve for {hours} hours
                </Button>
              </>
            }
          >
            <div className="yx-plt-stack">
              <FormField label="Window">
                <RadioGroup aria-label="Window" value={hours} onChange={setHours} orientation="horizontal" options={[{ value: '4', label: '4 hours' }, { value: '24', label: '24 hours' }, { value: '72', label: '72 hours' }]} />
              </FormField>
              <FormField label="Scope">
                <TextField value={req.scope} readOnly />
              </FormField>
              <InlineAlert tone="info" title="Never included">
                POSH, disciplinary, grievance, whistleblower and medical records. The session ends automatically and every view is audited.
              </InlineAlert>
            </div>
          </Dialog>
        )}
        {active && (
          <Drawer open onOpenChange={(o) => !o && setOpen(null)} title={`Session ${active.ticket}`} subtitle={`${active.agent} · ends ${active.endsAt ? stamp(active.endsAt) : ''}`} footer={<Button variant="danger">End session now</Button>}>
            <Timeline
              today={TODAY}
              aria-label="Session activity"
              items={[
                { id: 'x1', actor: { name: active.agent }, action: 'opened Payroll › September run settings', at: at(29, 9, 30) },
                { id: 'x2', actor: { name: active.agent }, action: 'viewed PF component configuration', at: at(29, 9, 34) },
                { id: 'x3', actor: { name: 'Lakshmi Venkatesan' }, action: 'approved the session for 24 hours', at: at(29, 9, 20) },
              ]}
            />
          </Drawer>
        )}
      </ListPage>
    </DesktopFrame>
  );
}

/* ================================================================ PLT-19 Billing, usage & sandbox */

export interface InvoiceRow {
  id: string;
  number: string;
  period: string;
  amount: number;
  gst: number;
  status: 'Paid' | 'Due soon' | 'Overdue';
  date: Date;
}

export function BillingScreen({ tab = 'plan', invoices, sandbox, promoteStep }: { tab?: 'plan' | 'usage' | 'invoices' | 'units' | 'sandbox'; invoices: InvoiceRow[]; sandbox?: boolean; promoteStep?: string }) {
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel(tab === 'sandbox' ? '8.4 Sandbox' : '8.1 Plan & add-ons')}>
      {sandbox && (
        <div className="yx-plt-sandbox" role="status">
          <ShieldAlert aria-hidden="true" /> SANDBOX · copy of production from 20 Sep 2026 · expires 20 Oct 2026
          <Button size="sm">Refresh from production</Button>
          <Button size="sm">Promote changes</Button>
        </div>
      )}
      <PageHeader title="Billing, usage & sandbox" description="Your plan, usage against fair use, invoices and the test copy of your company." facts="Plan: HR + Payroll · 248 billable people · billed monthly" />
      {promoteStep ? (
        <Stepper
          title="Promote sandbox changes"
          defaultCurrent={promoteStep}
          finishLabel="Promote to production"
          steps={[
            {
              id: 'diff',
              title: 'Review changes',
              content: (
                <DiffTable
                  caption="Sandbox changes"
                  rows={[
                    { field: 'Leave type: Casual leave · days per year', before: '12', after: '14 for Mine sites' },
                    { field: 'Custom object: Uniform & PPE issue', before: null, after: 'New · 9 fields' },
                    { field: 'Approval policy: Expense > ₹10,000', before: 'Manager → Finance', after: 'Manager → Department head → Finance' },
                  ]}
                />
              ),
              summary: <p className="yx-plt-p">3 changes</p>,
            },
            { id: 'dry', title: 'Dry run', content: <InlineAlert tone="success" title="Dry run passed">Applying these to production changes 180 leave balances (+2 days) and adds 1 menu item. No validation failures.</InlineAlert>, summary: <p className="yx-plt-p">Passed</p> },
            { id: 'approve', title: 'Approval', content: <FormField label="Approver" helper="Someone other than you must approve a promotion."><TextField value="Suresh Pillai" readOnly /></FormField>, summary: <p className="yx-plt-p">Suresh Pillai</p> },
          ]}
          review={{}}
        />
      ) : (
        <Tabs defaultValue={tab}>
          <TabsList aria-label="Billing sections">
            <TabsTrigger value="plan">Plan & add-ons</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="invoices" count={invoices.filter((i) => i.status !== 'Paid').length || undefined}>Invoices</TabsTrigger>
            <TabsTrigger value="units">Billable people</TabsTrigger>
            <TabsTrigger value="sandbox">Sandbox</TabsTrigger>
          </TabsList>
          <TabsContent value="plan">
            <div className="yx-plt-grid" data-cols="3">
              <Tile title="HR + Payroll" badge={<Badge tone="success">Active</Badge>}>
                <span className="yx-plt-score">{formatINR(248 * 90)}</span>
                <p className="yx-plt-muted">per month · 248 people × ₹90 · GST extra</p>
              </Tile>
              <Tile title="Hiring & assessments" badge={<Badge>Not on</Badge>} actions={<Button size="sm">Switch on</Button>}>
                <p className="yx-plt-muted">Jobs, pipeline, offers and proctored tests.</p>
              </Tile>
              <Tile title="Storage add-on" badge={<Badge>Not needed</Badge>}>
                <p className="yx-plt-muted">You use 38 GB of 124 GB included.</p>
              </Tile>
            </div>
            <Card title="Account health">
              <DescriptionList columns={2} items={[{ label: 'Health score', value: '78 · Good' }, { label: 'Next step', value: 'Invite managers to the mobile app (31 of 48 have)' }, { label: 'Billing contact', value: 'accounts@kaverifoods.in' }, { label: 'GSTIN', value: '29AAECK1234F1Z5', mono: true }]} />
            </Card>
          </TabsContent>
          <TabsContent value="usage">
            <div className="yx-plt-stack">
              <div className="yx-plt-grid" data-cols="3">
                <Tile title="Storage">
                  <Meter value={38} max={124} label="Storage" valueText="38 of 124 GB" />
                </Tile>
                <Tile title="AI credits">
                  <Meter value={8600} max={10000} label="AI credits" valueText="8,600 of 10,000 · resets 1 Oct" />
                </Tile>
                <Tile title="Custom records">
                  <Meter value={1210} max={4960} label="Custom records" valueText="1,210 of 4,960" />
                </Tile>
              </div>
              <BarChart title="Billable people by month" categories={['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']} series={[{ name: 'People', values: [231, 234, 238, 240, 244, 248] }]} xLabel="Month" />
            </div>
          </TabsContent>
          <TabsContent value="invoices">
            <DataTable
              label="Invoices"
              columns={[
                { key: 'number', header: 'Invoice', type: 'id', value: (r: InvoiceRow) => r.number },
                { key: 'period', header: 'Period', value: (r) => r.period },
                { key: 'date', header: 'Date', type: 'date', value: (r) => r.date },
                { key: 'amount', header: 'Amount', type: 'money', value: (r) => r.amount },
                { key: 'gst', header: 'GST', type: 'money', value: (r) => r.gst },
                { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => toneFor(v) },
              ]}
              rows={invoices}
              getRowId={(r) => r.id}
              rowButtons={(r) => (r.status === 'Paid' ? <Button size="sm">Download PDF</Button> : <Button size="sm">Pay now</Button>)}
              empty={<EmptyState title="No invoices yet." description="Your first invoice is raised at the end of your first month." />}
            />
          </TabsContent>
          <TabsContent value="units">
            <InlineAlert title="Who is counted">A person is billed once a month if they were employed on any day of the month, across all entities. Contract workers and consultants are counted when paid.</InlineAlert>
            <DescriptionList columns={2} items={[{ label: 'Employees (distinct people)', value: '241' }, { label: 'Consultants paid', value: '4' }, { label: 'Exited in September', value: '3 (counted)' }, { label: 'Total billable', value: '248' }]} />
          </TabsContent>
          <TabsContent value="sandbox">
            <div className="yx-plt-grid" data-cols="3">
              <Tile title="Sandbox" badge={<Badge tone="info">Ready</Badge>} actions={<><Button size="sm">Open sandbox</Button><Button size="sm">Refresh from production</Button></>}>
                <p className="yx-plt-muted">Copied 20 Sep 2026 · expires 20 Oct 2026 · payslips and bank files are disabled</p>
              </Tile>
              <Tile title="Changes waiting" badge={<Badge tone="warning">3</Badge>} actions={<Button size="sm" variant="primary">Promote changes</Button>}>
                <p className="yx-plt-muted">Leave rule, new object, approval policy</p>
              </Tile>
              <Tile title="Dry runs">
                <p className="yx-plt-muted">Last dry run 28 Sep 2026: passed</p>
              </Tile>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </DesktopFrame>
  );
}
