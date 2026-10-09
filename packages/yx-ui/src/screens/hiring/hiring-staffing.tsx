// Hiring › Staffing desk: clients, rate cards, submissions, placements & bench, invoices, collections, vendors, fees.
// HIR-14, HIR-15, HIR-16, HIR-17, HIR-18, HIR-19, HIR-21, HIR-30, HIR-31 (M10 Q7 / Q8, YX-ATS-10 / 11 / 15 / 16 / 25…30 / 43 / 44).
import { useState, type ReactNode } from 'react';
import { Building2, FileText, Handshake, Plus, Receipt, Send, Share2 } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { MultiSelect, Select } from '../../components/select';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { KanbanBoard, type KanbanColumn } from '../../components/kanban';
import { DataTable, type TableColumn } from '../../components/table';
import { MenuItem } from '../../components/menu';
import { BarChart } from '../../components/charts';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import {
  AGEING_BUCKETS,
  ageingBucket,
  benchPolicyState,
  conversionFee,
  daysBetween,
  duplicateCheck,
  guaranteeOutcome,
  invoiceTotals,
  placementFee,
  placementMargin,
  rateCapCheck,
  suggestedRateCap,
  tdsMatch,
  type FeeModel,
  type InvoiceLine,
  type PriorSubmission,
} from './hiring-logic';
import { EInvoiceBanner, HireFrame, RecordLayout, SummaryTiles, useListControls } from './hiring-kit';
import type { Client, ClientInvoice, Placement, RateCardRow, Submission, Vendor } from './hiring-data';
import './hiring.css';

type ListState = 'ready' | 'loading' | 'error';
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/* ================================================================== HIR-14 · Clients */

// HIR-14
export function ClientsScreen({ rows, state = 'ready' }: { rows: Client[]; state?: ListState }) {
  const list = useListControls({
    rows,
    fields: [
      { key: 'status', label: 'Status', type: 'multi', options: ['Active', 'Onboarding', 'On hold'].map((v) => ({ value: v, label: v })) },
      { key: 'am', label: 'Account manager', type: 'multi', options: ['Anita Kurian', 'Vikram Singh'].map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.name} ${r.gstin}`,
    fieldValue: (r, k) => (k === 'status' ? r.status : r.accountManager),
    views: [{ id: 'mine', name: 'My clients' }, { id: 'all', name: 'All clients', shared: true }],
    searchPlaceholder: 'Search clients or GSTIN',
  });
  const cols: TableColumn<Client>[] = [
    { key: 'name', header: 'Client', value: (r) => r.name, render: (r) => <PersonLabel name={r.name} secondary={`${r.state} · GSTIN ${r.gstin}`} /> },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Active' ? 'success' : v === 'On hold' ? 'warning' : 'info') },
    { key: 'jobs', header: 'Open jobs', type: 'number', value: (r) => r.openJobs, total: 'sum' },
    { key: 'placements', header: 'Active placements', type: 'number', value: (r) => r.activePlacements, total: 'sum' },
    { key: 'receivable', header: 'Receivable', type: 'money', value: (r) => r.receivable, total: 'sum' },
    { key: 'overdue', header: 'Overdue', type: 'money', value: (r) => r.overdue, total: 'sum' },
    { key: 'ends', header: 'Contract ends', type: 'date', value: (r) => r.contractEnds },
    { key: 'am', header: 'Account manager', type: 'person', value: (r) => r.accountManager, person: (r) => ({ name: r.accountManager }) },
  ];
  return (
    <HireFrame active="Clients">
      <PageHeader title="Clients" description="Companies you place people with. Client contacts sign in to the client portal and see only their own jobs, placements and invoices." actions={<Button variant="primary" icon={Plus}>Add client</Button>} />
      <DataTable
        label="Clients"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={() => {}}
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        onRowClick={() => {}}
        rowActions={() => (
          <>
            <MenuItem>Invite contact to portal</MenuItem>
            <MenuItem>New client job</MenuItem>
            <MenuItem destructive>Put on hold</MenuItem>
          </>
        )}
        empty={<EmptyState title="No clients yet." description="Add a client with its GSTIN, contract and rate card to start placing people." action={<Button variant="primary" icon={Plus}>Add client</Button>} />}
        onExport={() => {}}
      />
    </HireFrame>
  );
}

export interface ClientContact {
  name: string;
  role: string;
  email: string;
  portal: 'Active' | 'Invited' | 'No access';
  billing?: boolean;
}

// HIR-14 (workspace)
export function ClientWorkspaceScreen({ client, contacts, defaultTab = 'overview' }: { client: Client; contacts: ClientContact[]; defaultTab?: string }) {
  return (
    <HireFrame active="Clients">
      <RecordLayout
        header={
          <ObjectHeader
            name={client.name}
            icon={Building2}
            secondary={`GSTIN ${client.gstin} · ${client.state} · account manager ${client.accountManager}`}
            status={<Badge tone={client.status === 'Active' ? 'success' : 'warning'}>{client.status}</Badge>}
            facts={[
              { label: 'Open jobs', value: client.openJobs },
              { label: 'Active placements', value: client.activePlacements },
              { label: 'Receivable', value: formatINR(client.receivable) },
              { label: 'Overdue', value: formatINR(client.overdue) },
            ]}
            actions={
              <>
                <Button>Raise ticket for client</Button>
                <Button variant="primary" icon={Plus}>
                  New client job
                </Button>
              </>
            }
          />
        }
      >
        <Tabs defaultValue={defaultTab}>
          <TabsList aria-label="Client sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="contacts" count={contacts.length}>
              Contacts
            </TabsTrigger>
            <TabsTrigger value="contracts">Contracts</TabsTrigger>
            <TabsTrigger value="slas">SLAs</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Legal name', value: client.name },
                { label: 'Billing address', value: '14 Anna Salai, Chennai 600002' },
                { label: 'Place of supply', value: client.state },
                { label: 'Payment terms', value: '30 days from invoice' },
                { label: 'TDS by client', value: '194C at 2%' },
                { label: 'Invoice grouping', value: 'One invoice per month, lines by placement' },
              ]}
            />
          </TabsContent>
          <TabsContent value="contacts">
            <ul className="yx-hire-list">
              {contacts.map((c) => (
                <li key={c.email} className="yx-hire-list__item">
                  <PersonLabel name={c.name} secondary={`${c.role} · ${c.email}`} />
                  <div className="yx-hire-chips">
                    {c.billing && <Badge tone="info">Billing contact</Badge>}
                    <Badge tone={c.portal === 'Active' ? 'success' : c.portal === 'Invited' ? 'warning' : 'neutral'}>Portal: {c.portal}</Badge>
                  </div>
                  {c.portal === 'No access' && <Button size="sm">Invite to portal</Button>}
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="contracts">
            <ul className="yx-hire-list">
              <li className="yx-hire-list__item">
                <div className="yx-hire-list__main">
                  <Text weight="medium">Master services agreement 2026–27</Text>
                  <Text size="sm" tone="secondary">
                    1 Apr 2026 – {formatDate(client.contractEnds)} · contract staffing and permanent placement · notice 30 days
                  </Text>
                </div>
                <Badge tone="success">Signed</Badge>
                <Button size="sm">Fees and guarantee</Button>
              </li>
            </ul>
          </TabsContent>
          <TabsContent value="slas">
            <DescriptionList
              items={[
                { label: 'First submission', value: 'Within 3 working days of a new job' },
                { label: 'Client feedback', value: 'Client to respond within 2 working days' },
                { label: 'Ticket first response', value: '4 working hours' },
                { label: 'Ticket resolution', value: '2 working days' },
              ]}
            />
          </TabsContent>
        </Tabs>
      </RecordLayout>
    </HireFrame>
  );
}

/* ================================================================== HIR-15 · Rate cards */

// HIR-15
export function RateCardScreen({ client, rows, showHistory = false, editOpen = false, persona = 'am' }: { client: string; rows: RateCardRow[]; showHistory?: boolean; editOpen?: boolean; persona?: 'am' | 'recruiter' }) {
  const [history, setHistory] = useState(showHistory);
  const [edit, setEdit] = useState<RateCardRow | null>(editOpen ? rows[0] : null);
  const [bill, setBill] = useState<number | null>(edit?.billRate ?? null);
  const shown = history ? rows : rows.filter((r) => !r.to);
  const cols: TableColumn<RateCardRow>[] = [
    { key: 'role', header: 'Role', value: (r) => r.role, render: (r) => <PersonLabel name={r.role} secondary={`${r.skill} · ${r.location}`} /> },
    { key: 'unit', header: 'Unit', value: (r) => `Per ${r.unit}` },
    { key: 'bill', header: 'Bill rate', type: 'money', value: (r) => r.billRate },
    ...(persona === 'am'
      ? [
          { key: 'pay', header: 'Pay rate', type: 'money', value: (r: RateCardRow) => r.payRate } as TableColumn<RateCardRow>,
          { key: 'margin', header: 'Gross margin', type: 'number', value: (r: RateCardRow) => Math.round(((r.billRate - r.payRate) / r.billRate) * 1000) / 10, render: (r: RateCardRow) => pct(((r.billRate - r.payRate) / r.billRate) * 100) } as TableColumn<RateCardRow>,
        ]
      : []),
    { key: 'ot', header: 'OT', value: (r) => `${r.ot}×` },
    { key: 'holiday', header: 'Holiday', value: (r) => `${r.holiday}×` },
    { key: 'from', header: 'Valid from', type: 'date', value: (r) => r.from },
    { key: 'to', header: 'Valid to', value: (r) => (r.to ? formatDate(r.to) : 'Current'), render: (r) => (r.to ? formatDate(r.to) : <Badge tone="success">Current</Badge>) },
  ];
  return (
    <HireFrame active="Rate cards">
      <ObjectHeader
        name={`Rate card · ${client}`}
        icon={Receipt}
        secondary="Per role, skill and location. Changes are dated: a new rate applies from its valid-from date; timesheets before it keep the old rate."
        actions={
          persona === 'am' ? (
            <Button variant="primary" icon={Plus}>
              Add role
            </Button>
          ) : undefined
        }
      />
      <Switch className="yx-hire-switch" label="Show expired rates" checked={history} onChange={setHistory} />
      <DataTable
        label="Rate card"
        columns={cols}
        rows={shown}
        getRowId={(r) => r.id}
        rowButtons={persona === 'am' ? (r) => (!r.to ? <Button size="sm" onClick={() => { setEdit(r); setBill(r.billRate); }}>Change rate</Button> : null) : undefined}
        empty={<EmptyState title="No rates on this card yet." description="Add each role with bill rate, pay rate and OT and holiday multipliers." />}
      />
      {persona === 'recruiter' && <Text size="sm" tone="secondary">Pay rates and margins are visible to account managers and finance.</Text>}
      {edit && (
        <Drawer
          open
          onOpenChange={(o) => !o && setEdit(null)}
          title={`Change rate · ${edit.role}`}
          subtitle={`Current bill ${formatINR(edit.billRate)} per ${edit.unit} since ${formatDate(edit.from)}`}
          footer={
            <>
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary">Save dated change</Button>
            </>
          }
        >
          <div className="yx-hire-stack">
            <FormField label="Effective from" required helper="The current rate ends the day before.">
              <DatePicker value={new Date(2026, 9, 1)} onChange={() => {}} />
            </FormField>
            <FieldRow>
              <FormField label="New bill rate" required>
                <CurrencyField value={bill} onChange={setBill} />
              </FormField>
              <FormField label="Pay rate" required>
                <CurrencyField value={edit.payRate} onChange={() => {}} />
              </FormField>
            </FieldRow>
            {bill != null && (
              <Text size="sm" tone="secondary" aria-live="polite">
                Gross margin {pct(((bill - edit.payRate) / bill) * 100)} (was {pct(((edit.billRate - edit.payRate) / edit.billRate) * 100)}). Affects {edit.role === 'Java Developer' ? 2 : 1} active placements from the effective date.
              </Text>
            )}
            <FormField label="Reason" required>
              <TextArea rows={2} defaultValue="Annual revision agreed with client" />
            </FormField>
          </div>
        </Drawer>
      )}
    </HireFrame>
  );
}

/* ================================================================== HIR-16 · Submissions board */

const SUB_STAGES: Submission['stage'][] = ['Submitted', 'Client review', 'Interview', 'Selected', 'Rejected by client'];

// HIR-16
export function SubmissionsBoardScreen({ rows, persona = 'am', submitOpen = false, state = 'ready' }: { rows: Submission[]; persona?: 'am' | 'recruiter'; submitOpen?: boolean; state?: ListState }) {
  const [open, setOpen] = useState(submitOpen);
  const columns: KanbanColumn[] = SUB_STAGES.map((st) => ({
    id: st,
    title: st,
    slaDays: st === 'Client review' ? 2 : undefined,
    requiresReason: st === 'Rejected by client',
    cards: rows
      .filter((r) => r.stage === st)
      .map((r) => ({
        id: r.id,
        name: r.candidate,
        daysInStage: r.days,
        facts: [
          `${r.job} · ${r.client}`,
          (
            <span key="f" className="yx-hire-pfacts">
              <span>
                Bill {formatINR(r.billRate)}/h · {r.source}
              </span>
              {r.feedback && <span className="yx-hire-pfacts__next">Client: {r.feedback}</span>}
            </span>
          ),
        ] as [ReactNode, ReactNode],
      })),
  }));
  return (
    <HireFrame active="Submissions">
      <PageHeader
        title="Submissions"
        description="Candidates sent to client contacts. Clients review, shortlist or reject in the client portal; email submissions still work."
        actions={
          <Button variant="primary" icon={Send} onClick={() => setOpen(true)}>
            Submit to client
          </Button>
        }
      />
      {state === 'loading' ? (
        <div className="yx-hire-board">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={260} />
          ))}
        </div>
      ) : state === 'error' ? (
        <ErrorState title="Couldn't load submissions" description="Check your connection and try again." onRetry={() => {}} reference="SUB-2210" />
      ) : rows.length === 0 ? (
        <EmptyState title="No submissions yet." description="Submit candidates from the bench, pools or your pipeline to a client job." action={<Button variant="primary" icon={Send} onClick={() => setOpen(true)}>Submit to client</Button>} />
      ) : (
        <KanbanBoard aria-label="Client submissions" defaultColumns={columns} noun="submission" onMove={() => {}} onOpenCard={() => {}} />
      )}
      <Drawer
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Submit to client"
        subtitle="Java Developer · Nilgiri Retail Pvt Ltd"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Send}>
              Submit 2 candidates
            </Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          <FormField label="Candidates" required helper="Bench people are listed first">
            <MultiSelect
              value={['suresh', 'deepak']}
              onChange={() => {}}
              options={[
                { value: 'suresh', label: 'Suresh Menon', description: 'Bench since 1 Sep 2026' },
                { value: 'deepak', label: 'Deepak Rao', description: 'Talent pool' },
                { value: 'kiran', label: 'Kiran Joshi', description: 'Bench since 5 Aug 2026' },
              ]}
            />
          </FormField>
          <FormField label="Client contact" required>
            <Select value="rekha" onChange={() => {}} options={[{ value: 'rekha', label: 'Rekha Balan · Engineering manager' }]} />
          </FormField>
          <FieldRow>
            <FormField label="Bill rate per hour" required helper="From the rate card: ₹1,200">
              <CurrencyField value={1_200} onChange={() => {}} />
            </FormField>
            <FormField label="Send by">
              <RadioGroup aria-label="Send by" orientation="horizontal" defaultValue="portal" options={[{ value: 'portal', label: 'Client portal' }, { value: 'email', label: 'Email' }]} />
            </FormField>
          </FieldRow>
          <Checkbox label="Mask candidate phone and email until the client shortlists" defaultChecked />
          {persona === 'recruiter' && <InlineAlert tone="info">Pay rates and margins are hidden from the client and from vendors.</InlineAlert>}
        </div>
      </Drawer>
    </HireFrame>
  );
}

/* ================================================================== HIR-17 · Placements + bench board */

const PL_TONE: Record<Placement['status'], BadgeTone> = { Active: 'success', 'Ending soon': 'warning', Bench: 'info', Ended: 'neutral' };

// HIR-17
export function PlacementsScreen({ rows, state = 'ready', persona = 'am' }: { rows: Placement[]; state?: ListState; persona?: 'am' | 'finance' }) {
  const active = rows.filter((r) => r.status !== 'Bench');
  const list = useListControls({
    rows: active,
    fields: [
      { key: 'status', label: 'Status', type: 'multi', options: ['Active', 'Ending soon', 'Ended'].map((v) => ({ value: v, label: v })) },
      { key: 'supply', label: 'Supply', type: 'multi', options: ['Own payroll', 'Vendor supplied'].map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.person} ${r.client} ${r.role}`,
    fieldValue: (r, k) => (k === 'status' ? r.status : r.supply),
    views: [{ id: 'active', name: 'Active placements' }],
  });
  const cols: TableColumn<Placement>[] = [
    { key: 'person', header: 'Person', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person, secondary: r.role }) },
    { key: 'client', header: 'Client', value: (r) => r.client },
    { key: 'supply', header: 'Supply', value: (r) => (r.vendor ? `Vendor: ${r.vendor}` : r.supply) },
    { key: 'start', header: 'Start', type: 'date', value: (r) => r.start },
    { key: 'end', header: 'End', type: 'date', value: (r) => r.end },
    { key: 'bill', header: 'Bill rate', type: 'money', value: (r) => r.billRate },
    { key: 'margin', header: 'Margin per hour', type: 'money', value: (r) => placementMargin(r.billRate, r.payRate, r.statutoryPerHour) },
    { key: 'hours', header: 'Approved hours (Sep)', type: 'number', value: (r) => r.hoursThisMonth, total: 'sum' },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => PL_TONE[v as Placement['status']] },
  ];
  return (
    <HireFrame active="Placements & bench">
      <PageHeader
        title="Placements"
        description="Margin = bill − pay − statutory cost for own-payroll placements, bill − vendor rate for vendor-supplied ones."
        actions={<Button variant="primary" icon={Plus}>New placement</Button>}
      />
      <DataTable
        label="Placements"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={() => {}}
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        onRowClick={() => {}}
        rowActions={() => (
          <>
            <MenuItem>Extend placement</MenuItem>
            <MenuItem>Record client end notice</MenuItem>
            <MenuItem destructive>End early</MenuItem>
          </>
        )}
        empty={<EmptyState title="No placements yet." description="A selected submission becomes a placement." />}
        onExport={persona === 'finance' ? () => {} : undefined}
      />
    </HireFrame>
  );
}

// HIR-17 (placement record: extend / end)
export function PlacementRecordScreen({ placement: p, today, action = null }: { placement: Placement; today: Date; action?: 'extend' | 'end' | null }) {
  const [open, setOpen] = useState(action);
  const margin = placementMargin(p.billRate, p.payRate, p.statutoryPerHour);
  const daysLeft = daysBetween(today, p.end);
  return (
    <HireFrame active="Placements & bench">
      <RecordLayout
        banner={
          daysLeft <= 30 && daysLeft >= 0 ? (
            <InlineAlert tone="warning" title={`Placement ends in ${daysLeft} days`}>
              Client gave 30 days&rsquo; notice on 15 Sep 2026. Extend, or plan redeployment: on the end date {p.person} moves to the bench.
            </InlineAlert>
          ) : undefined
        }
        header={
          <ObjectHeader
            name={`${p.person} at ${p.client}`}
            icon={Handshake}
            secondary={`${p.role} · ${p.supply}${p.vendor ? ` (${p.vendor})` : ''}`}
            status={<Badge tone={PL_TONE[p.status]}>{p.status}</Badge>}
            facts={[
              { label: 'Dates', value: `${formatDate(p.start)} – ${formatDate(p.end)}` },
              { label: 'Bill rate', value: `${formatINR(p.billRate)}/h` },
              { label: p.supply === 'Vendor supplied' ? 'Vendor rate' : 'Pay rate', value: `${formatINR(p.payRate)}/h` },
              { label: 'Margin per hour', value: formatINR(margin) },
            ]}
            actions={
              <>
                <Button onClick={() => setOpen('end')}>End early</Button>
                <Button variant="primary" onClick={() => setOpen('extend')}>
                  Extend
                </Button>
              </>
            }
          />
        }
      >
        <SummaryTiles
          label="September"
          tiles={[
            { label: 'Approved hours', value: p.hoursThisMonth, sub: 'client-approved in the portal' },
            { label: 'Billed', value: formatINR(p.hoursThisMonth * p.billRate) },
            { label: p.supply === 'Vendor supplied' ? 'Vendor cost' : 'Pay + statutory', value: formatINR(p.hoursThisMonth * (p.payRate + p.statutoryPerHour)) },
            { label: 'Margin', value: formatINR(p.hoursThisMonth * margin), sub: pct((margin / p.billRate) * 100) },
          ]}
        />
        <DescriptionList
          columns={2}
          items={[
            { label: 'Employment', value: p.supply === 'Vendor supplied' ? 'None: vendor worker with timesheet login' : 'Contract – deployed (Kaveri Foods Pvt Ltd)' },
            { label: 'Timesheet approver', value: 'Rekha Balan (client portal)' },
            { label: 'Commission', value: 'Anita Kurian 2% of margin' },
            { label: 'Client notice', value: 'Received 15 Sep 2026 · 30 days' },
          ]}
        />
      </RecordLayout>
      <Drawer
        open={open === 'extend'}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Extend placement"
        subtitle="A dated change; rates can change from the extension date"
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="primary">Save extension</Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          <FormField label="New end date" required>
            <DatePicker value={new Date(2027, 3, 15)} onChange={() => {}} min={p.end} />
          </FormField>
          <FieldRow>
            <FormField label="Bill rate from extension">
              <CurrencyField value={p.billRate} onChange={() => {}} />
            </FormField>
            <FormField label="Pay rate from extension">
              <CurrencyField value={p.payRate} onChange={() => {}} />
            </FormField>
          </FieldRow>
          <FormField label="Reason" required>
            <TextArea rows={2} defaultValue="Client PO extended to Apr 2027" />
          </FormField>
        </div>
      </Drawer>
      <ConfirmDialog
        open={open === 'end'}
        onOpenChange={(o) => !o && setOpen(null)}
        destructive
        title={`End ${p.person}'s placement early?`}
        consequence={`Timesheets close on the end date and ${p.person} moves to the bench under the bench policy (60% pay, up to 45 days, then redeploy or exit review). Nothing exits automatically.`}
        confirmLabel="End placement"
        onConfirm={() => setOpen(null)}
      >
        <FormField label="End date" required>
          <DatePicker value={new Date(2026, 9, 15)} onChange={() => {}} />
        </FormField>
        <FormField label="Reason" required>
          <Select value="client" onChange={() => {}} options={[{ value: 'client', label: 'Client ended the project' }, { value: 'perf', label: 'Performance' }, { value: 'resign', label: 'Resigned' }]} />
        </FormField>
      </ConfirmDialog>
    </HireFrame>
  );
}

// HIR-17 (bench board)
export function BenchBoardScreen({ rows, today, maxBenchDays = 45, benchPayPct = 60 }: { rows: Placement[]; today: Date; maxBenchDays?: number; benchPayPct?: number }) {
  const bench = rows.filter((r) => r.status === 'Bench' && r.benchSince);
  return (
    <HireFrame active="Placements & bench">
      <PageHeader
        title="Bench"
        description={`Contractors between placements. Bench policy (YukthiX starter, edit in Settings › Staffing desk): ${benchPayPct}% pay, up to ${maxBenchDays} days, then redeploy or an exit review. Nothing exits automatically.`}
        actions={<Button variant="primary" icon={Send}>Submit from bench</Button>}
      />
      {bench.length === 0 ? (
        <EmptyState title="No one is on the bench." description="People whose placement ends appear here until they're redeployed." />
      ) : (
        <div className="yx-hire-board">
          {bench.map((b) => {
            const s = benchPolicyState(b.benchSince!, today, maxBenchDays);
            return (
              <article key={b.id} className="yx-hire-board__card">
                <PersonLabel name={b.person} secondary={`${b.role} · last at ${b.client === '—' ? 'Nilgiri Retail' : b.client}`} />
                <Meter value={s.days} max={maxBenchDays} label={`${b.person} bench days`} warnAt={75} valueText={`${s.days} of ${maxBenchDays} days`} />
                {s.action ? <Badge tone="warning">{s.action}</Badge> : <Text size="sm" tone="secondary">{s.left} days left under the policy</Text>}
                <div className="yx-hire-actions">
                  <Button size="sm">Submit to a job</Button>
                  {s.action && <Button size="sm">Start exit review</Button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </HireFrame>
  );
}

/* ================================================================== HIR-18 · Invoices */

const INV_TONE: Record<ClientInvoice['status'], BadgeTone> = { Draft: 'neutral', Approved: 'info', Issued: 'info', 'Part paid': 'warning', Paid: 'success', Cancelled: 'neutral' };

// HIR-18
export function InvoicesScreen({ rows, today, state = 'ready', persona = 'finance' }: { rows: ClientInvoice[]; today: Date; state?: ListState; persona?: 'finance' | 'am' }) {
  const list = useListControls({
    rows,
    fields: [
      { key: 'status', label: 'Status', type: 'multi', options: ['Draft', 'Issued', 'Part paid', 'Paid'].map((v) => ({ value: v, label: v })) },
      { key: 'irn', label: 'IRN', type: 'multi', options: ['Pending', 'Generated', 'Blocked', 'Not needed'].map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.number} ${r.client}`,
    fieldValue: (r, k) => (k === 'status' ? r.status : r.irn),
    views: [{ id: 'all', name: 'All invoices' }, { id: 'irn', name: 'IRN pending', shared: true }],
    searchPlaceholder: 'Search invoice number or client',
  });
  const cols: TableColumn<ClientInvoice>[] = [
    { key: 'number', header: 'Invoice', type: 'id', value: (r) => r.number, width: 190 },
    { key: 'client', header: 'Client', value: (r) => r.client },
    { key: 'date', header: 'Date', type: 'date', value: (r) => r.date },
    { key: 'period', header: 'Period', value: (r) => r.period },
    { key: 'type', header: 'Type', value: (r) => r.source },
    { key: 'subtotal', header: 'Taxable value', type: 'money', value: (r) => r.subtotal, total: 'sum' },
    { key: 'gst', header: 'GST', type: 'money', value: (r) => r.gst, total: 'sum' },
    { key: 'total', header: 'Total', type: 'money', value: (r) => r.subtotal + r.gst, total: 'sum' },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => INV_TONE[v as ClientInvoice['status']] },
    {
      key: 'irn',
      header: 'IRN',
      type: 'status',
      value: (r) => (r.irn === 'Pending' && r.status !== 'Draft' ? `Pending · day ${daysBetween(r.date, today)}` : r.irn),
      statusTone: (v) => (String(v).startsWith('Blocked') ? 'danger' : String(v).startsWith('Pending') ? 'warning' : v === 'Generated' ? 'success' : 'neutral'),
    },
  ];
  return (
    <HireFrame active="Invoices">
      <PageHeader
        title="Invoices"
        description="GST tax invoices from client-approved timesheets, numbered per entity and GSTIN. Issued invoices are never edited: corrections are credit notes."
        actions={
          persona === 'finance' ? (
            <>
              <Button>Export to accounting</Button>
              <Button variant="primary">Create invoices</Button>
            </>
          ) : (
            <Button>Download</Button>
          )
        }
      />
      <DataTable
        label="Client invoices"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={() => {}}
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        onRowClick={() => {}}
        selectable={persona === 'finance'}
        bulkActions={() => <Button size="sm">Send for IRN</Button>}
        rowActions={() => (
          <>
            <MenuItem>Download PDF</MenuItem>
            <MenuItem>Raise credit note</MenuItem>
          </>
        )}
        empty={<EmptyState title="No invoices yet." description="Invoices are created from client-approved timesheets each month." />}
        onExport={() => {}}
      />
    </HireFrame>
  );
}

export interface InvoiceRecordProps {
  invoice: ClientInvoice;
  lines: InvoiceLine[];
  supplierState: string;
  today: Date;
  aboveThreshold?: boolean;
  creditNotes?: { number: string; date: Date; amount: number; reason: string }[];
  persona?: 'finance' | 'am';
}

// HIR-18 (record) + HIR-31 banner
export function InvoiceRecordScreen({ invoice: inv, lines, supplierState, today, aboveThreshold = true, creditNotes = [], persona = 'finance' }: InvoiceRecordProps) {
  const t = invoiceTotals(lines, supplierState, inv.clientState);
  const blocked = inv.irn === 'Blocked' || (aboveThreshold && daysBetween(inv.date, today) > 30 && inv.irn === 'Pending');
  return (
    <HireFrame active="Invoices">
      <RecordLayout
        banner={inv.status !== 'Draft' && inv.irn !== 'Generated' ? <EInvoiceBanner invoiceDate={inv.date} today={today} aboveThreshold={aboveThreshold} invoiceNo={inv.number} /> : undefined}
        header={
          <ObjectHeader
            name={`Invoice ${inv.number}`}
            icon={FileText}
            secondary={`${inv.client} · ${inv.period} · ${inv.source}`}
            status={<Badge tone={INV_TONE[inv.status]}>{inv.status}</Badge>}
            facts={[
              { label: 'Invoice date', value: formatDate(inv.date) },
              { label: 'Client PO', value: inv.po ?? 'Not given' },
              { label: 'Place of supply', value: inv.clientState },
              { label: 'IRN', value: inv.irn },
            ]}
            actions={
              persona === 'finance' ? (
                <>
                  <Button>Raise credit note</Button>
                  <Button variant="primary" disabled={blocked || inv.irn === 'Generated'}>
                    Send for IRN
                  </Button>
                </>
              ) : (
                <Button>Download PDF</Button>
              )
            }
          />
        }
      >
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Invoice lines, scrolls sideways on small screens">
        <table className="yx-hire-ctc">
          <caption>Invoice lines</caption>
          <thead>
            <tr>
              <th scope="col">Description</th>
              <th scope="col">Hours</th>
              <th scope="col">Rate</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.description}>
                <th scope="row">{l.description}</th>
                <td>{l.qty}</td>
                <td>{formatINR(l.rate)}</td>
                <td>{formatINR(Math.round(l.qty * l.rate))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Taxable value
              </th>
              <td>{formatINR(t.subtotal)}</td>
            </tr>
            {t.interState ? (
              <tr>
                <th scope="row" colSpan={3}>
                  IGST 18% (inter-state)
                </th>
                <td>{formatINR(t.igst)}</td>
              </tr>
            ) : (
              <>
                <tr>
                  <th scope="row" colSpan={3}>
                    CGST 9%
                  </th>
                  <td>{formatINR(t.cgst)}</td>
                </tr>
                <tr>
                  <th scope="row" colSpan={3}>
                    SGST 9%
                  </th>
                  <td>{formatINR(t.sgst)}</td>
                </tr>
              </>
            )}
            <tr>
              <th scope="row" colSpan={3}>
                Total
              </th>
              <td>{formatINR(t.total)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
        {creditNotes.length > 0 && (
          <Card title="Credit notes against this invoice">
            <ul className="yx-hire-list">
              {creditNotes.map((c) => (
                <li key={c.number} className="yx-hire-list__item">
                  <div className="yx-hire-list__main">
                    <Text weight="medium">{c.number}</Text>
                    <Text size="sm" tone="secondary">
                      {formatDate(c.date)} · {c.reason}
                    </Text>
                  </div>
                  <Text className="yx-hire-num">{formatINR(c.amount)}</Text>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </RecordLayout>
    </HireFrame>
  );
}

/* ================================================================== HIR-19 · Receivables & collections */

export interface LedgerRow {
  client: string;
  invoice: string;
  date: Date;
  outstanding: number;
  tdsDeducted: number;
  tds26as: number | null;
  dispute?: string;
  nextReminder?: Date;
}

// HIR-19
export function CollectionsScreen({ rows, today, receiptOpen = false, state = 'ready' }: { rows: LedgerRow[]; today: Date; receiptOpen?: boolean; state?: ListState }) {
  const [open, setOpen] = useState(receiptOpen);
  const clients = Array.from(new Set(rows.map((r) => r.client)));
  const series = AGEING_BUCKETS.map((b) => ({ name: `${b} days`, values: clients.map((c) => rows.filter((r) => r.client === c && ageingBucket(r.date, today) === b).reduce((s, r) => s + r.outstanding, 0)) }));
  const total = rows.reduce((s, r) => s + r.outstanding, 0);
  const over60 = rows.filter((r) => ['61–90', '90+'].includes(ageingBucket(r.date, today))).reduce((s, r) => s + r.outstanding, 0);
  const cols: TableColumn<LedgerRow>[] = [
    { key: 'client', header: 'Client', value: (r) => r.client, groupable: true },
    { key: 'invoice', header: 'Invoice', type: 'id', value: (r) => r.invoice },
    { key: 'date', header: 'Invoice date', type: 'date', value: (r) => r.date },
    { key: 'bucket', header: 'Ageing', type: 'status', value: (r) => `${ageingBucket(r.date, today)} days`, statusTone: (v) => (String(v).startsWith('0') ? 'neutral' : String(v).startsWith('31') ? 'info' : 'warning') },
    { key: 'outstanding', header: 'Outstanding', type: 'money', value: (r) => r.outstanding, total: 'sum' },
    { key: 'tds', header: 'TDS receivable', type: 'money', value: (r) => r.tdsDeducted, total: 'sum' },
    { key: '26as', header: '26AS match', type: 'status', value: (r) => tdsMatch(r.tdsDeducted, r.tds26as), statusTone: (v) => (v === 'Matched' ? 'success' : String(v).startsWith('Mismatch') ? 'warning' : 'neutral') },
    { key: 'dispute', header: 'Dispute', value: (r) => r.dispute ?? '—' },
    { key: 'reminder', header: 'Next reminder', type: 'date', value: (r) => r.nextReminder ?? null },
  ];
  return (
    <HireFrame active="Collections">
      <PageHeader
        title="Receivables and collections"
        description="Ageing per client, dunning to billing contacts on your schedule, client-side TDS against 26AS and disputes by invoice line."
        actions={
          <>
            <Button>Dunning schedule</Button>
            <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
              Record receipt
            </Button>
          </>
        }
      />
      <SummaryTiles
        label="Receivables"
        tiles={[
          { label: 'Outstanding', value: formatINR(total) },
          { label: 'Over 60 days', value: formatINR(over60), tone: over60 > 0 ? 'warning' : 'default', sub: total ? `${Math.round((over60 / total) * 100)}% of outstanding` : undefined },
          { label: 'TDS receivable', value: formatINR(rows.reduce((s, r) => s + r.tdsDeducted, 0)), sub: `${rows.filter((r) => r.tds26as !== r.tdsDeducted).length} not matched in 26AS` },
          { label: 'Open disputes', value: rows.filter((r) => r.dispute).length },
        ]}
      />
      <BarChart
        title="Ageing by client"
        description="Outstanding amount by days since invoice date"
        categories={clients}
        series={series}
        stacked
        orientation="horizontal"
        money
        xLabel="Client"
        loading={state === 'loading'}
      />
      <DataTable label="Receivables ledger" columns={cols} rows={rows} getRowId={(r) => r.invoice} state={state} onRetry={() => {}} defaultGroupBy="client" onExport={() => {}} empty={<EmptyState title="Nothing outstanding." description="Every issued invoice is paid." />} />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Record receipt"
        subtitle="Nilgiri Retail Pvt Ltd"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary">Save receipt</Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          <FieldRow>
            <FormField label="Amount received" required>
              <CurrencyField value={8_00_000} onChange={() => {}} />
            </FormField>
            <FormField label="Received on" required>
              <DatePicker value={today} onChange={() => {}} max={today} />
            </FormField>
          </FieldRow>
          <FormField label="TDS deducted by client (194C)" helper="Recorded as TDS receivable and matched to 26AS">
            <CurrencyField value={16_000} onChange={() => {}} />
          </FormField>
          <Text weight="semibold">Allocate to invoices</Text>
          <ul className="yx-hire-list">
            {rows
              .filter((r) => r.client === 'Nilgiri Retail Pvt Ltd')
              .map((r, i) => (
                <li key={r.invoice} className="yx-hire-list__item">
                  <div className="yx-hire-list__main">
                    <Text weight="medium">{r.invoice}</Text>
                    <Text size="sm" tone="secondary">
                      Outstanding {formatINR(r.outstanding)}
                    </Text>
                  </div>
                  <FormField label={`Allocate to ${r.invoice}`} hideLabel>
                    <CurrencyField value={i === 0 ? Math.min(r.outstanding, 8_16_000) : 0} onChange={() => {}} />
                  </FormField>
                </li>
              ))}
          </ul>
          <Text size="sm" tone="secondary" aria-live="polite">
            Part payment: the rest stays outstanding and the next reminder goes on the schedule.
          </Text>
        </div>
      </Drawer>
    </HireFrame>
  );
}

/* ================================================================== HIR-21 · Vendors */

export interface VendorSubmission {
  id: string;
  vendor: string;
  candidate: string;
  candidateKey: string;
  job: string;
  jobId: string;
  quoted: number;
  cap: number;
  at: Date;
  rtr: boolean;
  consent: boolean;
}

export interface VendorsProps {
  vendors: Vendor[];
  submissions: VendorSubmission[];
  prior: PriorSubmission[];
  today: Date;
  defaultTab?: 'register' | 'submissions' | 'invoices' | 'scorecards';
  shareOpen?: boolean;
}

// HIR-21
export function VendorsScreen({ vendors, submissions, prior, today, defaultTab = 'register', shareOpen = false }: VendorsProps) {
  const [share, setShare] = useState(shareOpen);
  const [margin, setMargin] = useState<number | null>(25);
  const [cap, setCap] = useState<number | null>(suggestedRateCap(1_200, 25));
  const [masked, setMasked] = useState(true);
  const vcols: TableColumn<Vendor>[] = [
    { key: 'name', header: 'Vendor', value: (r) => r.name, render: (r) => <PersonLabel name={r.name} secondary={`PAN ${r.pan} · GSTIN ${r.gstin}`} /> },
    { key: 'tier', header: 'Tier', value: (r) => r.tier },
    { key: 'tds', header: 'TDS section', value: (r) => r.tds },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Active' ? 'success' : v === 'Pending documents' ? 'warning' : 'neutral') },
    { key: 'missing', header: 'Missing', value: (r) => r.missing ?? '—' },
    { key: 'shares', header: 'Shared jobs', type: 'number', value: (r) => r.sharedJobs },
    { key: 'subs', header: 'Submissions', type: 'number', value: (r) => r.submissions, total: 'sum' },
  ];
  return (
    <HireFrame active="Vendors">
      <PageHeader
        title="Vendors"
        description="Agencies that supply candidates. A vendor is active only with a signed agreement, PAN, verified bank account and TDS section. Vendors never see other vendors, bill rates or margins."
        actions={
          <>
            <Button icon={Plus}>Add vendor</Button>
            <Button variant="primary" icon={Share2} onClick={() => setShare(true)}>
              Share a job
            </Button>
          </>
        }
      />
      <Tabs defaultValue={defaultTab}>
        <TabsList aria-label="Vendor sections">
          <TabsTrigger value="register" count={vendors.length}>
            Register
          </TabsTrigger>
          <TabsTrigger value="submissions" count={submissions.length}>
            Vendor submissions
          </TabsTrigger>
          <TabsTrigger value="invoices">Vendor invoices</TabsTrigger>
          <TabsTrigger value="scorecards">Scorecards</TabsTrigger>
        </TabsList>
        <TabsContent value="register">
          <DataTable label="Vendor register" columns={vcols} rows={vendors} getRowId={(r) => r.id} onRowClick={() => {}} empty={<EmptyState title="No vendors yet." description="Add a vendor to share jobs with rate caps." />} />
        </TabsContent>
        <TabsContent value="submissions">
          <ul className="yx-hire-list" aria-label="Vendor submissions">
            {submissions.map((s) => {
              const dup = duplicateCheck(s.candidateKey, s.jobId, prior, today);
              const capCheck = rateCapCheck(s.quoted, s.cap);
              return (
                <li key={s.id} className="yx-hire-list__item">
                  <div className="yx-hire-list__main">
                    <PersonLabel name={s.candidate} secondary={`${s.job} · from ${s.vendor} · ${formatDate(s.at)}`} />
                    <div className="yx-hire-chips">
                      <Badge tone={dup.status === 'duplicate' ? 'warning' : 'success'}>{dup.status === 'duplicate' ? `Duplicate: held by ${dup.holder} until ${formatDate(dup.ownerUntil)}` : 'Unique'}</Badge>
                      <Badge tone={capCheck.ok ? 'neutral' : 'danger'}>
                        Quote {formatINR(s.quoted)}/h {capCheck.ok ? `within cap ${formatINR(s.cap)}` : `over cap by ${formatINR(capCheck.overBy)}`}
                      </Badge>
                      <Badge tone={s.rtr && s.consent ? 'success' : 'warning'}>{s.rtr && s.consent ? 'Right to represent + consent' : 'Consent missing'}</Badge>
                    </div>
                    {dup.status === 'duplicate' && (
                      <Text size="sm" tone="secondary">
                        The vendor sees &ldquo;{dup.vendorMessage}&rdquo; and not who holds the candidate.
                      </Text>
                    )}
                  </div>
                  <div className="yx-hire-list__actions">
                    {dup.status === 'unique' && capCheck.ok && <Button size="sm">Forward to client</Button>}
                    {!capCheck.ok && <Button size="sm">Approve exception with reason</Button>}
                    {dup.status === 'duplicate' && <Button size="sm">Review dispute</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </TabsContent>
        <TabsContent value="invoices">
          <VendorInvoices />
        </TabsContent>
        <TabsContent value="scorecards">
          <DataTable
            label="Vendor scorecards, Sep 2026"
            columns={[
              { key: 'name', header: 'Vendor', value: (r: Vendor) => r.name },
              { key: 'subs', header: 'Submissions', type: 'number', value: (r: Vendor) => r.submissions },
              { key: 'dup', header: 'Duplicate rate', type: 'number', value: (r: Vendor) => r.duplicateRate, render: (r: Vendor) => `${r.duplicateRate}%` },
              { key: 'placements', header: 'Placements', type: 'number', value: (r: Vendor) => r.placements },
              { key: 'ttfs', header: 'Time to first submission', value: (r: Vendor) => (r.submissions ? `${r.duplicateRate > 20 ? 4.5 : 1.8} days` : '—') },
              { key: 'tier', header: 'Tier (set by you)', value: (r: Vendor) => r.tier },
            ]}
            rows={vendors}
            getRowId={(r) => r.id}
          />
        </TabsContent>
      </Tabs>
      <Drawer
        open={share}
        onOpenChange={setShare}
        size="lg"
        title="Share job with vendors"
        subtitle="Java Developer · Nilgiri Retail · bill rate ₹1,200/h"
        footer={
          <>
            <Button onClick={() => setShare(false)}>Cancel</Button>
            <Button variant="primary" icon={Share2}>
              Share with 2 vendors
            </Button>
          </>
        }
      >
        <div className="yx-hire-sheet">
          <div className="yx-hire-sheet__form">
            <FormField label="Vendors" required helper="Only active vendors can be chosen">
              <MultiSelect
                value={['v1', 'v2']}
                onChange={() => {}}
                options={vendors.map((v) => ({ value: v.id, label: v.name, description: v.status === 'Active' ? v.tier : v.missing, disabled: v.status !== 'Active' }))}
              />
            </FormField>
            <FieldRow>
              <FormField label="Target margin" helper="Company margin policy">
                <NumberField
                  value={margin}
                  onChange={(v) => {
                    setMargin(v);
                    if (v != null) setCap(suggestedRateCap(1_200, v));
                  }}
                  suffix="%"
                />
              </FormField>
              <FormField label="Rate cap per hour" required helper="Suggested: bill rate − target margin">
                <CurrencyField value={cap} onChange={setCap} />
              </FormField>
            </FieldRow>
            <FieldRow>
              <FormField label="Max submissions per vendor" required>
                <NumberField value={5} onChange={() => {}} />
              </FormField>
              <FormField label="Share expires" required>
                <DatePicker value={new Date(2026, 9, 20)} onChange={() => {}} />
              </FormField>
            </FieldRow>
            <Switch className="yx-hire-switch" label="Hide the client's name from vendors" checked={masked} onChange={setMasked} />
          </div>
          <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="What vendors see">
            <Text weight="semibold">What vendors see</Text>
            <ul className="yx-hire-plainlist">
              <li>Role, skills, location, dates</li>
              <li>Client: {masked ? 'hidden (“A retail company in Chennai”)' : 'Nilgiri Retail Pvt Ltd'}</li>
              <li>Rate cap {cap != null ? formatINR(cap) : '—'}/h; quotes above it are blocked unless you approve an exception</li>
              <li>Never: bill rate, margin, other vendors</li>
            </ul>
          </aside>
        </div>
      </Drawer>
    </HireFrame>
  );
}

function VendorInvoices() {
  const rows = [
    { id: 'vi1', vendor: 'Sahyadri Staffing LLP', period: 'Sep 2026', worker: 'Priya Nair', hours: 160, rate: 900, tds: '194C', status: 'Waiting for vendor', vendorNo: '' },
    { id: 'vi2', vendor: 'Sahyadri Staffing LLP', period: 'Aug 2026', worker: 'Priya Nair', hours: 152, rate: 900, tds: '194C', status: 'Paid', vendorNo: 'SS/26-27/044' },
  ];
  return (
    <div className="yx-hire-stack">
      <InlineAlert tone="info">Proposed from client-approved hours × vendor rate. Once the vendor confirms, it becomes a consultant invoice in payroll with TDS under the vendor&rsquo;s section. Pay-when-paid is off.</InlineAlert>
      <ul className="yx-hire-list">
        {rows.map((r) => {
          const net = r.hours * r.rate;
          return (
            <li key={r.id} className="yx-hire-list__item">
              <div className="yx-hire-list__main">
                <Text weight="medium">
                  {r.vendor} · {r.period}
                </Text>
                <Text size="sm" tone="secondary">
                  {r.worker}: {r.hours} h × {formatINR(r.rate)} = {formatINR(net)} + GST {formatINR(Math.round(net * 0.18))} · TDS {r.tds} {formatINR(Math.round(net * 0.02))}
                  {r.vendorNo ? ` · vendor invoice ${r.vendorNo}` : ''}
                </Text>
              </div>
              <Badge tone={r.status === 'Paid' ? 'success' : 'warning'}>{r.status}</Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ================================================================== HIR-30 · Placement fee & guarantee settings */

export interface FeeSettingsProps {
  client: string;
  model: FeeModel;
  taper: { fromMonth: number; pct: number }[];
  guaranteeDays: number;
  remedy: 'replace' | 'refund';
  exampleCtc: number;
  exampleLeftAfter: number;
  persona?: 'am' | 'finance';
}

// HIR-30
export function PlacementFeeSettingsScreen({ client, model: m0, taper, guaranteeDays: g0, remedy: r0, exampleCtc, exampleLeftAfter, persona = 'am' }: FeeSettingsProps) {
  const [kind, setKind] = useState<FeeModel['kind']>(m0.kind);
  const [amount, setAmount] = useState<number | null>(m0.kind === 'fixed' ? m0.amount : 1_50_000);
  const [pctV, setPct] = useState<number | null>(m0.kind === 'percent' ? m0.pct : 8.33);
  const [days, setDays] = useState<number | null>(g0);
  const [remedy, setRemedy] = useState(r0);
  const model: FeeModel = kind === 'fixed' ? { kind, amount: amount ?? 0 } : { kind, pct: pctV ?? 0 };
  const fee = placementFee(model, exampleCtc);
  const outcome = guaranteeOutcome(fee, days ?? 0, exampleLeftAfter, remedy);
  return (
    <HireFrame active="Clients">
      <PageHeader title={`Fees and guarantee · ${client}`} description="Per client contract: permanent placement fee, contract-to-hire conversion fee and replacement guarantee." status={<Badge>Contract MSA 2026–27</Badge>} />
      <div className="yx-hire-sheet">
        <div className="yx-hire-sheet__form">
          <Card title="Permanent placement fee">
            <RadioGroup aria-label="Fee model" orientation="horizontal" value={kind} onChange={(v) => setKind(v as FeeModel['kind'])} options={[{ value: 'percent', label: '% of first-year CTC' }, { value: 'fixed', label: 'Fixed amount' }]} />
            {kind === 'percent' ? (
              <FormField label="Fee" required>
                <NumberField value={pctV} onChange={setPct} decimals suffix="% of CTC" />
              </FormField>
            ) : (
              <FormField label="Fee" required>
                <CurrencyField value={amount} onChange={setAmount} />
              </FormField>
            )}
          </Card>
          <Card title="Conversion fee (contract to hire)">
            <Text as="p" size="sm" tone="secondary">
              Tapers by months the contractor served before the client hires them.
            </Text>
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Conversion fee taper, scrolls sideways on small screens">
            <table className="yx-hire-ctc">
              <caption className="yx-visually-hidden">Conversion fee taper</caption>
              <thead>
                <tr>
                  <th scope="col">Months served</th>
                  <th scope="col">Fee (% of CTC)</th>
                  <th scope="col">On {formatINR(exampleCtc)}</th>
                </tr>
              </thead>
              <tbody>
                {taper.map((t, i) => (
                  <tr key={t.fromMonth}>
                    <th scope="row">{i < taper.length - 1 ? `${t.fromMonth}–${taper[i + 1].fromMonth - 1}` : `${t.fromMonth}+`}</th>
                    <td>{t.pct}%</td>
                    <td>{formatINR(conversionFee(taper, t.fromMonth, exampleCtc))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
          <Card title="Replacement guarantee">
            <FieldRow>
              <FormField label="Guarantee period" required>
                <NumberField value={days} onChange={setDays} suffix="days" />
              </FormField>
              <FormField label="If the person leaves inside it">
                <RadioGroup aria-label="Remedy" value={remedy} onChange={(v) => setRemedy(v as 'replace' | 'refund')} options={[{ value: 'replace', label: 'Free replacement' }, { value: 'refund', label: 'Pro-rated credit note' }]} />
              </FormField>
            </FieldRow>
          </Card>
          {persona === 'finance' && <InlineAlert tone="info">Credit notes from the guarantee link to the original fee invoice and restate that month&rsquo;s revenue.</InlineAlert>}
          <div className="yx-hire-actions">
            <Button>Cancel</Button>
            <Button variant="primary">Save contract terms</Button>
          </div>
        </div>
        <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="Example">
          <Text weight="semibold">Example</Text>
          <Text size="sm">
            Permanent hire at {formatINR(exampleCtc)} CTC: fee {formatINR(fee)} + GST.
          </Text>
          <Text size="sm">
            Converted after 7 months: {formatINR(conversionFee(taper, 7, exampleCtc))}.
          </Text>
          <Text size="sm">
            Leaves after {exampleLeftAfter} days: {outcome.text}
            {outcome.credit ? ` ${formatINR(outcome.credit)}.` : ''}
          </Text>
        </aside>
      </div>
    </HireFrame>
  );
}
