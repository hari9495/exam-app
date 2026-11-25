// Hiring › Staffing desk: clients, rate cards, submissions, placements & bench, invoices, collections, vendors, fees.
// HIR-14, HIR-15, HIR-16, HIR-17, HIR-18, HIR-19, HIR-21, HIR-30, HIR-31 (M10 Q7 / Q8, YX-ATS-10 / 11 / 15 / 16 / 25…30 / 43 / 44).
import { useState, type ReactNode } from 'react';
import { Building2, FileText, Handshake, Plus, Receipt, Send, Share2 } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Meter, NoAccessState, Skeleton } from '../../components/feedback';
import { useToastIfAny } from '../../components/notify';
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
import { Segment } from '../../components/segment';
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
import { EInvoiceBanner, HireFrame, HireTable, RecordLayout, SummaryTiles, useListControls } from './hiring-kit';
import type { Client, ClientInvoice, Placement, RateCardRow, Submission, Vendor } from './hiring-data';
import './hiring.css';

type ListState = 'ready' | 'loading' | 'error';
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/* ================================================================== HIR-14 · Clients */

/** Live list row (slice 1: open jobs, placements and money come with slices 2 and 3). */
export interface ClientRowView {
  id: string;
  name: string;
  gstin: string | null;
  stateName: string;
  status: 'onboarding' | 'active' | 'on_hold';
  accountManager: string;
  contractEnd: string | null;
  contacts: number;
}
export interface LiveClients {
  state: 'ready' | 'loading' | 'error' | 'denied' | 'off';
  onRetry: () => void;
  rows: ClientRowView[];
  canManage: boolean;
  onAdd: () => void;
  onOpen: (id: string) => void;
}
const STATUS_WORD: Record<ClientRowView['status'], Client['status']> = { onboarding: 'Onboarding', active: 'Active', on_hold: 'On hold' };
const statusTone = (v: unknown) => (v === 'Active' ? 'success' : v === 'On hold' ? 'warning' : 'info');

/** The desk is off, or the viewer has no key: the same calm states on every staffing page. */
function DeskState({ state, what, onRetry, title }: { state: 'loading' | 'error' | 'denied' | 'off'; what: string; onRetry: () => void; title: string }) {
  if (state === 'loading') return <div className="yx-hire-stack" role="status" aria-busy="true" aria-label={`Loading ${what}`}><Skeleton height={64} /><Skeleton height={320} /></div>;
  if (state === 'error') return <ErrorState title={`${title} could not be loaded.`} onRetry={onRetry} />;
  if (state === 'off') return <EmptyState title="The staffing desk is off." description="An admin turns it on in Settings › Staffing desk, for a company that places its people with client companies." />;
  return <NoAccessState grantedBy="your admin (Staffing account manager)" what={what} />;
}

// HIR-14
export function ClientsScreen(props: { rows: Client[]; state?: ListState } | { live: LiveClients }) {
  if ('live' in props) return <LiveClientsView live={props.live} />;
  const { rows, state = 'ready' } = props;
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
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone },
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

function LiveClientsView({ live }: { live: LiveClients }) {
  const list = useListControls({
    rows: live.rows,
    fields: [{ key: 'status', label: 'Status', type: 'multi', options: ['Active', 'Onboarding', 'On hold'].map((v) => ({ value: v, label: v })) }],
    text: (r) => `${r.name} ${r.gstin ?? ''}`,
    fieldValue: (r) => STATUS_WORD[r.status],
    views: [{ id: 'all', name: 'All clients', shared: true }],
    searchPlaceholder: 'Search clients or GSTIN',
  });
  const cols: TableColumn<ClientRowView>[] = [
    { key: 'name', header: 'Client', value: (r) => r.name, render: (r) => <PersonLabel name={r.name} secondary={`${r.stateName}${r.gstin ? ` · GSTIN ${r.gstin}` : ' · no GSTIN'}`} /> },
    { key: 'status', header: 'Status', type: 'status', value: (r) => STATUS_WORD[r.status], statusTone },
    { key: 'contacts', header: 'Contacts', type: 'number', value: (r) => r.contacts },
    { key: 'ends', header: 'Contract ends', type: 'date', value: (r) => (r.contractEnd ? new Date(`${r.contractEnd}T00:00:00`) : null) },
    { key: 'am', header: 'Account manager', type: 'person', value: (r) => r.accountManager, person: (r) => ({ name: r.accountManager || 'Nobody yet' }) },
  ];
  const add = live.canManage ? <Button variant="primary" icon={Plus} onClick={live.onAdd}>Add client</Button> : undefined;
  return (
    <HireFrame active="Clients">
      <PageHeader title="Clients" description="Companies you place people with: their contacts, contract, SLAs and rate card." actions={live.state === 'ready' ? add : undefined} />
      {live.state !== 'ready' ? (
        <DeskState state={live.state} what="clients" title="Clients" onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Clients"
          columns={cols}
          rows={list.rows}
          getRowId={(r) => r.id}
          toolbar={list.toolbar}
          filtered={list.filtered}
          onClearFilters={list.clear}
          onRowClick={(r) => live.onOpen(r.id)}
          rowButtons={(r) => <Button size="sm" onClick={() => live.onOpen(r.id)}>Open {r.name}</Button>}
          empty={<EmptyState title="No clients yet." description="Add a client with its GSTIN, contract and SLAs, then its rate card." action={add} />}
        />
      )}
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

/** Live workspace data (GET staffing/clients/:id). */
export interface ClientView {
  id: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  stateName: string;
  billingAddress: string;
  status: ClientRowView['status'];
  accountManager: string;
  paymentTermsDays: number | null;
  defaultPaymentTermsDays: number;
  contractStart: string | null;
  contractEnd: string | null;
  noticeDays: number | null;
  slaFirstSubmissionDays: number | null;
  slaFeedbackDays: number | null;
  /** Slice 3 (answer 454). */
  tdsSection?: '194C' | '194J' | null;
  invoiceGrouping?: 'month' | 'placement';
}
export interface ContactView {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string | null;
  billing: boolean;
  /** Slice 3 (answer 453): client portal access. */
  portal?: 'none' | 'invited' | 'active';
}
export interface LiveClientWorkspace {
  client: ClientView;
  contacts: ContactView[];
  canManage: boolean;
  onEdit: () => void;
  onRates: () => void;
  onAddContact: () => void;
  onEditContact: (id: string) => void;
  onRemoveContact: (id: string) => Promise<unknown>;
  /** Slice 3: give or take back a contact's portal access; the fees and guarantee page. */
  onPortal?: (id: string, access: boolean) => Promise<unknown>;
  onFees?: () => void;
}
const d = (s: string | null) => (s ? formatDate(new Date(`${s}T00:00:00`)) : null);

// HIR-14 (workspace)
export function ClientWorkspaceScreen(props: { client: Client; contacts: ClientContact[]; defaultTab?: string } | { live: LiveClientWorkspace; defaultTab?: string }) {
  if ('live' in props) return <LiveClientWorkspaceView live={props.live} defaultTab={props.defaultTab} />;
  const { client, contacts, defaultTab = 'overview' } = props;
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
                <Button>Rate card</Button>
                <Button>Change client</Button>
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
            <div className="yx-hire-stack">
              <div>
                <Button size="sm" icon={Plus}>Add contact</Button>
              </div>
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
            </div>
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

function LiveClientWorkspaceView({ live, defaultTab = 'overview' }: { live: LiveClientWorkspace; defaultTab?: string }) {
  const toastIf = useToastIfAny();
  const toastPortal = (title: string) => toastIf?.toast({ tone: 'success', title });
  const c = live.client;
  const [removing, setRemoving] = useState<ContactView | null>(null);
  const toast = useToastIfAny();
  const terms = c.paymentTermsDays ?? c.defaultPaymentTermsDays;
  return (
    <HireFrame active="Clients">
      <RecordLayout
        header={
          <ObjectHeader
            name={c.name}
            icon={Building2}
            secondary={`${c.gstin ? `GSTIN ${c.gstin}` : 'No GSTIN'} · ${c.stateName}${c.accountManager ? ` · account manager ${c.accountManager}` : ''}`}
            status={<Badge tone={c.status === 'active' ? 'success' : c.status === 'on_hold' ? 'warning' : 'info'}>{STATUS_WORD[c.status]}</Badge>}
            facts={[
              { label: 'Contacts', value: live.contacts.length },
              { label: 'Payment terms', value: `${terms} days` },
              { label: 'Contract ends', value: d(c.contractEnd) ?? 'Not set' },
            ]}
            actions={
              <>
                <Button onClick={live.onRates}>Rate card</Button>
                {live.onFees && <Button onClick={live.onFees}>Fees and guarantee</Button>}
                {live.canManage && <Button onClick={live.onEdit}>Change client</Button>}
              </>
            }
          />
        }
      >
        <Tabs defaultValue={defaultTab}>
          <TabsList aria-label="Client sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="contacts" count={live.contacts.length}>
              Contacts
            </TabsTrigger>
            <TabsTrigger value="contracts">Contracts</TabsTrigger>
            <TabsTrigger value="slas">SLAs</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Legal name', value: c.legalName || c.name },
                { label: 'Billing address', value: c.billingAddress },
                { label: 'Place of supply', value: c.stateName },
                { label: 'Payment terms', value: `${terms} days from invoice${c.paymentTermsDays == null ? ' (company default)' : ''}` },
                { label: 'TDS by client', value: c.tdsSection ? `${c.tdsSection} (rates from the TDS rule set)` : 'Not set' },
                { label: 'Invoice grouping', value: c.invoiceGrouping === 'placement' ? 'One invoice per placement each month' : 'One invoice per month, lines by placement' },
              ]}
            />
          </TabsContent>
          <TabsContent value="contacts">
            <div className="yx-hire-stack">
              {live.canManage && (
                <div>
                  <Button size="sm" icon={Plus} onClick={live.onAddContact}>Add contact</Button>
                </div>
              )}
              {live.contacts.length === 0 ? (
                <EmptyState compact title="No contacts yet." description="Add the people you work with, and mark who gets invoices." />
              ) : (
                <ul className="yx-hire-list">
                  {live.contacts.map((x) => (
                    <li key={x.id} className="yx-hire-list__item">
                      <PersonLabel name={x.name} secondary={`${x.role} · ${x.email}${x.phone ? ` · ${x.phone}` : ''}`} />
                      <div className="yx-hire-chips">
                        {x.billing && <Badge tone="info">Billing contact</Badge>}
                        {x.portal && <Badge tone={x.portal === 'active' ? 'success' : x.portal === 'invited' ? 'warning' : 'neutral'}>Portal: {x.portal === 'active' ? 'Active' : x.portal === 'invited' ? 'Invited' : 'No access'}</Badge>}
                      </div>
                      {live.canManage && (
                        <span className="yx-hire-actions">
                          {live.onPortal && x.portal === 'none' && <Button size="sm" onClick={() => void live.onPortal!(x.id, true).then(() => toastPortal(`Portal invite sent to ${x.name}`))}>Invite {x.name} to portal</Button>}
                          {live.onPortal && x.portal && x.portal !== 'none' && <Button size="sm" onClick={() => void live.onPortal!(x.id, false).then(() => toastPortal(`${x.name} no longer has portal access`))}>Remove portal access for {x.name}</Button>}
                          <Button size="sm" onClick={() => live.onEditContact(x.id)}>Change {x.name}</Button>
                          <Button size="sm" variant="danger" onClick={() => setRemoving(x)}>Remove {x.name}</Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
          <TabsContent value="contracts">
            {c.contractStart || c.contractEnd ? (
              <DescriptionList items={[{ label: 'Starts', value: d(c.contractStart) ?? 'Not set' }, { label: 'Ends', value: d(c.contractEnd) ?? 'Open-ended' }, { label: 'Notice', value: c.noticeDays != null ? `${c.noticeDays} days` : 'Not set' }]} />
            ) : (
              <EmptyState compact title="No contract dates yet." description={live.canManage ? 'Add them with Change client.' : undefined} />
            )}
          </TabsContent>
          <TabsContent value="slas">
            <DescriptionList
              items={[
                { label: 'First submission', value: c.slaFirstSubmissionDays ? `Within ${c.slaFirstSubmissionDays} working days of a new job` : 'Not agreed' },
                { label: 'Client feedback', value: c.slaFeedbackDays ? `Client to respond within ${c.slaFeedbackDays} working days` : 'Not agreed' },
              ]}
            />
          </TabsContent>
        </Tabs>
      </RecordLayout>
      {removing && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setRemoving(null)}
          title={`Remove ${removing.name}?`}
          consequence="They are no longer a contact of this client. Past records keep their name."
          confirmLabel="Remove contact"
          onConfirm={async () => {
            await live.onRemoveContact(removing.id);
            toast?.toast({ tone: 'success', title: 'Contact removed' });
            setRemoving(null);
          }}
        />
      )}
    </HireFrame>
  );
}

/* ================================================================== HIR-15 · Rate cards */

/** Live rate-card row (GET staffing/clients/:id/rates): money as rupee text, pay and margin only for account managers. */
export interface RateRowView {
  id: string;
  role: string;
  skill: string;
  location: string;
  unit: 'hour' | 'day' | 'month';
  billRate: string;
  payRate?: string;
  marginPct?: string;
  ot: string;
  holiday: string;
  validFrom: string;
  validTo: string | null;
}
export interface RateChangeInput {
  validFrom: string;
  billRate: number;
  payRate: number;
  reason: string;
}
export interface LiveRateCard {
  state: 'ready' | 'loading' | 'error' | 'denied' | 'off';
  onRetry: () => void;
  clientName: string | null;
  rows: RateRowView[];
  showPay: boolean;
  canManage: boolean;
  history: boolean;
  onHistory: (on: boolean) => void;
  today: Date;
  onAdd: () => void;
  onChange: (rateId: string, input: RateChangeInput) => Promise<unknown>;
  /** e.g. the client picker. */
  extra?: ReactNode;
}

// HIR-15
export function RateCardScreen(props: { client: string; rows: RateCardRow[]; showHistory?: boolean; editOpen?: boolean; persona?: 'am' | 'recruiter' } | { live: LiveRateCard }) {
  if ('live' in props) return <LiveRateCardView live={props.live} />;
  const { client, rows, showHistory = false, editOpen = false, persona = 'am' } = props;
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

const isoDay = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

function LiveRateCardView({ live }: { live: LiveRateCard }) {
  const toast = useToastIfAny();
  const [edit, setEdit] = useState<RateRowView | null>(null);
  const [from, setFrom] = useState<Date | null>(null);
  const [bill, setBill] = useState<number | null>(null);
  const [pay, setPay] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const money = (s: string | undefined) => (s == null ? 0 : Number(s));
  const cols: TableColumn<RateRowView>[] = [
    { key: 'role', header: 'Role', value: (r) => r.role, render: (r) => <PersonLabel name={r.role} secondary={`${r.skill} · ${r.location}`} /> },
    { key: 'unit', header: 'Unit', value: (r) => `Per ${r.unit}` },
    { key: 'bill', header: 'Bill rate', type: 'money', value: (r) => money(r.billRate) },
    ...(live.showPay
      ? [
          { key: 'pay', header: 'Pay rate', type: 'money', value: (r: RateRowView) => money(r.payRate) } as TableColumn<RateRowView>,
          { key: 'margin', header: 'Gross margin', type: 'number', value: (r: RateRowView) => Number(r.marginPct ?? 0), render: (r: RateRowView) => `${r.marginPct}%` } as TableColumn<RateRowView>,
        ]
      : []),
    { key: 'ot', header: 'OT', value: (r) => `${r.ot}×` },
    { key: 'holiday', header: 'Holiday', value: (r) => `${r.holiday}×` },
    { key: 'from', header: 'Valid from', type: 'date', value: (r) => new Date(`${r.validFrom}T00:00:00`) },
    { key: 'to', header: 'Valid to', value: (r) => r.validTo ?? 'Current', render: (r) => (r.validTo ? d(r.validTo) : <Badge tone="success">Current</Badge>) },
  ];
  const open = (r: RateRowView) => {
    setEdit(r);
    setFrom(live.today);
    setBill(money(r.billRate));
    setPay(r.payRate != null ? money(r.payRate) : null);
    setReason('');
    setTried(false);
    setFailed(null);
  };
  const payBad = pay == null || pay <= 0 || (bill != null && pay > bill);
  const save = async () => {
    if (!edit) return;
    setTried(true);
    if (!from) return focus('rc-from');
    if (bill == null || bill <= 0) return focus('rc-bill');
    if (payBad) return focus('rc-pay');
    if (reason.trim().length < 3) return focus('rc-reason');
    setBusy(true);
    setFailed(null);
    try {
      await live.onChange(edit.id, { validFrom: isoDay(from), billRate: bill, payRate: pay!, reason: reason.trim() });
      toast?.toast({ tone: 'success', title: 'Rate changed', description: `From ${formatDate(from)}; the old rate ends the day before.` });
      setEdit(null);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <HireFrame active="Rate cards">
      <ObjectHeader
        name={live.clientName ? `Rate card · ${live.clientName}` : 'Rate cards'}
        icon={Receipt}
        secondary="Per role, skill and location. Changes are dated: a new rate applies from its valid-from date; the old rate stays for the days before."
        actions={
          <>
            {live.extra}
            {live.canManage && live.clientName && live.state === 'ready' && (
              <Button variant="primary" icon={Plus} onClick={live.onAdd}>
                Add role
              </Button>
            )}
          </>
        }
      />
      {live.state !== 'ready' ? (
        <DeskState state={live.state} what="rate cards" title="The rate card" onRetry={live.onRetry} />
      ) : !live.clientName ? (
        <EmptyState title="Choose a client." description="Each client has its own rate card." />
      ) : (
        <>
          <Switch className="yx-hire-switch" label="Show expired rates" checked={live.history} onChange={live.onHistory} />
          <DataTable
            label="Rate card"
            columns={cols}
            rows={live.rows}
            getRowId={(r) => r.id}
            rowButtons={live.canManage ? (r) => (!r.validTo ? <Button size="sm" onClick={() => open(r)}>Change rate</Button> : null) : undefined}
            empty={<EmptyState title="No rates on this card yet." description="Add each role with bill rate, pay rate and OT and holiday multipliers." />}
          />
          {!live.showPay && <Text size="sm" tone="secondary">Pay rates and margins are visible to account managers.</Text>}
        </>
      )}
      {edit && (
        <Drawer
          open
          onOpenChange={(o) => !o && setEdit(null)}
          title={`Change rate · ${edit.role}`}
          subtitle={`Current bill ${formatINR(money(edit.billRate))} per ${edit.unit} since ${d(edit.validFrom)}`}
          dirty
          footer={
            <>
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={() => void save()}>
                Save dated change
              </Button>
            </>
          }
        >
          <div className="yx-hire-stack">
            {failed && <InlineAlert tone="danger" title={failed} />}
            <FormField id="rc-from" label="Effective from" required helper="The current rate ends the day before." error={tried && !from ? 'Choose the day it starts.' : null}>
              <DatePicker value={from} onChange={setFrom} />
            </FormField>
            <FieldRow>
              <FormField id="rc-bill" label="New bill rate" required error={tried && (bill == null || bill <= 0) ? 'Enter the bill rate.' : null}>
                <CurrencyField value={bill} onChange={setBill} />
              </FormField>
              <FormField id="rc-pay" label="Pay rate" required error={tried && payBad ? (pay != null && bill != null && pay > bill ? 'The pay rate is above the bill rate.' : 'Enter the pay rate.') : null}>
                <CurrencyField value={pay} onChange={setPay} />
              </FormField>
            </FieldRow>
            {bill != null && bill > 0 && pay != null && edit.marginPct && (
              <Text size="sm" tone="secondary" aria-live="polite">
                Gross margin {pct(((bill - pay) / bill) * 100)} (was {edit.marginPct}%).
              </Text>
            )}
            <FormField id="rc-reason" label="Reason" required error={tried && reason.trim().length < 3 ? 'Say why the rate changes.' : null}>
              <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
            </FormField>
          </div>
        </Drawer>
      )}
    </HireFrame>
  );
}

const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

/* ================================================================== HIR-16 · Submissions board */

const SUB_STAGES: Submission['stage'][] = ['Submitted', 'Client review', 'Interview', 'Selected', 'Rejected by client'];

// HIR-16
export function SubmissionsBoardScreen(props: { rows: Submission[]; persona?: 'am' | 'recruiter'; submitOpen?: boolean; state?: ListState } | { live: LiveSubmissions }) {
  if ('live' in props) return <LiveSubmissionsView live={props.live} />;
  const { rows, persona = 'am', submitOpen = false, state = 'ready' } = props;
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
export function PlacementsScreen(props: { rows: Placement[]; state?: ListState; persona?: 'am' | 'finance' } | { live: LivePlacements }) {
  if ('live' in props) return <LivePlacementsView live={props.live} />;
  const { rows, state = 'ready', persona = 'am' } = props;
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
export function PlacementRecordScreen(props: { placement: Placement; today: Date; action?: 'extend' | 'end' | null } | { live: LivePlacementRecord }) {
  if ('live' in props) return <LivePlacementRecordView live={props.live} />;
  const { placement: p, today, action = null } = props;
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
export function BenchBoardScreen(props: { rows: Placement[]; today: Date; maxBenchDays?: number; benchPayPct?: number } | { live: LiveBench }) {
  if ('live' in props) return <LiveBenchView live={props.live} />;
  const { rows, today, maxBenchDays = 45, benchPayPct = 60 } = props;
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
export function InvoicesScreen(props: { rows: ClientInvoice[]; today: Date; state?: ListState; persona?: 'finance' | 'am' } | { live: LiveInvoices }) {
  if ('live' in props) return <LiveInvoicesView live={props.live} />;
  const { rows, today, state = 'ready', persona = 'finance' } = props;
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
export function InvoiceRecordScreen(props: InvoiceRecordProps | { live: LiveInvoiceRecord }) {
  if ('live' in props) return <LiveInvoiceRecordView live={props.live} />;
  const { invoice: inv, lines, supplierState, today, aboveThreshold = true, creditNotes = [], persona = 'finance' } = props;
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
        <HireTable
          label="Invoice lines, scrolls sideways on small screens"
          caption="Invoice lines"
          head={['Description', 'Hours', 'Rate', 'Amount']}
          rows={lines.map((l) => ({ key: l.description, cells: [l.description, l.qty, formatINR(l.rate), formatINR(Math.round(l.qty * l.rate))] }))}
          foot={[
            { label: 'Taxable value', value: formatINR(t.subtotal) },
            ...(t.interState ? [{ label: 'IGST 18% (inter-state)', value: formatINR(t.igst) }] : [{ label: 'CGST 9%', value: formatINR(t.cgst) }, { label: 'SGST 9%', value: formatINR(t.sgst) }]),
            { label: 'Total', value: formatINR(t.total) },
          ]}
        />
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
export function CollectionsScreen(props: { rows: LedgerRow[]; today: Date; receiptOpen?: boolean; state?: ListState } | { live: LiveCollections }) {
  if ('live' in props) return <LiveCollectionsView live={props.live} />;
  const { rows, today, receiptOpen = false, state = 'ready' } = props;
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
export function VendorsScreen(props: VendorsProps | { live: LiveVendors }) {
  if ('live' in props) return <LiveVendorsView live={props.live} />;
  const { vendors, submissions, prior, today, defaultTab = 'register', shareOpen = false } = props;
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

function VendorInvoices(props: { live?: VendorInvoicesLive } = {}) {
  if (props.live) return <LiveVendorInvoicesView {...props.live} />;
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
export function PlacementFeeSettingsScreen(props: FeeSettingsProps | { live: LiveFeeTerms }) {
  if ('live' in props) return <LiveFeeTermsView key={props.live.terms?.version ?? 0} live={props.live} />;
  const { client, model: m0, taper, guaranteeDays: g0, remedy: r0, exampleCtc, exampleLeftAfter, persona = 'am' } = props;
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
            <HireTable
              label="Conversion fee taper, scrolls sideways on small screens"
              caption="Conversion fee taper"
              hideCaption
              head={['Months served', 'Fee (% of CTC)', `On ${formatINR(exampleCtc)}`]}
              rows={taper.map((t, i) => ({ key: t.fromMonth, cells: [i < taper.length - 1 ? `${t.fromMonth}–${taper[i + 1].fromMonth - 1}` : `${t.fromMonth}+`, `${t.pct}%`, formatINR(conversionFee(taper, t.fromMonth, exampleCtc))] }))}
            />
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

/* ================================================================== Staffing slice 2 made live (HIR-16, HIR-17, HIR-21) */

const isoDate = (s: string) => new Date(`${s}T00:00:00`);
const isoOfDate = (x: Date | null) => (x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` : null);
type DeskLoad = 'ready' | 'loading' | 'error' | 'denied' | 'off';

export type SubmissionStage = 'submitted' | 'client_review' | 'interview' | 'selected' | 'rejected';
const STAGE_TITLE: Record<SubmissionStage, Submission['stage']> = { submitted: 'Submitted', client_review: 'Client review', interview: 'Interview', selected: 'Selected', rejected: 'Rejected by client' };

/** GET /staffing/submissions row. */
export interface SubmissionRowView {
  id: string;
  person: string;
  job: string;
  jobId: string;
  client: string;
  contact: string;
  billRate: string;
  source: string;
  kind: 'employee' | 'candidate';
  stage: SubmissionStage;
  daysInStage: number;
  slaDays: number | null;
  feedback: string | null;
  rejectedReason: string | null;
  emailed: boolean;
}
export interface LiveSubmissions {
  state: DeskLoad;
  onRetry: () => void;
  rows: SubmissionRowView[];
  onSubmit: () => void;
  /** Account managers open a client job on a rate-card line. */
  onNewJob?: () => void;
  /** A move; the board refreshes from the server after it (a refused move snaps back with the reason). */
  onMove: (id: string, stage: SubmissionStage, reason?: string) => void;
}

function LiveSubmissionsView({ live }: { live: LiveSubmissions }) {
  const sla = live.rows.filter((r) => r.slaDays != null).map((r) => r.slaDays!);
  const columns: KanbanColumn[] = (Object.keys(STAGE_TITLE) as SubmissionStage[]).map((st) => ({
    id: st,
    title: STAGE_TITLE[st],
    slaDays: st === 'client_review' && sla.length ? Math.min(...sla) : undefined,
    requiresReason: st === 'rejected',
    cards: live.rows
      .filter((r) => r.stage === st)
      .map((r) => ({
        id: r.id,
        name: r.person,
        daysInStage: r.daysInStage,
        facts: [
          `${r.job} · ${r.client}`,
          (
            <span key="f" className="yx-hire-pfacts">
              <span>
                Bill {formatINR(Number(r.billRate))} · {r.source}
                {r.emailed ? '' : ' · email not sent'}
              </span>
              {(r.rejectedReason || r.feedback) && <span className="yx-hire-pfacts__next">Client: {r.rejectedReason ?? r.feedback}</span>}
            </span>
          ),
        ] as [ReactNode, ReactNode],
      })),
  }));
  const submit = live.state === 'ready' ? <Button variant="primary" icon={Send} onClick={live.onSubmit}>Submit to client</Button> : undefined;
  return (
    <HireFrame active="Submissions">
      <PageHeader title="Submissions" description="People sent to client contacts by email. Move a card as the client replies; a rejection needs the client's reason." actions={submit && <>{live.onNewJob && <Button icon={Plus} onClick={live.onNewJob}>New client job</Button>}{submit}</>} />
      {live.state !== 'ready' ? (
        <DeskState state={live.state} what="submissions" title="Submissions" onRetry={live.onRetry} />
      ) : live.rows.length === 0 ? (
        <EmptyState title="No submissions yet." description="Submit people from the bench or a client job's pipeline to a client contact." action={submit} />
      ) : (
        <KanbanBoard aria-label="Client submissions" columns={columns} onColumnsChange={() => {}} noun="submission" onMove={(id, _from, to, reason) => live.onMove(id, to as SubmissionStage, reason)} />
      )}
    </HireFrame>
  );
}

/** GET /staffing/placements row (cost, statutory and margin only for account managers). */
export interface PlacementRowView {
  id: string;
  person: string;
  role: string;
  unit: string;
  clientId: string;
  client: string;
  supply: 'own' | 'vendor';
  vendor: string | null;
  startOn: string;
  endOn: string;
  status: 'active' | 'ending_soon' | 'ended';
  endedReason: string | null;
  billRate: string | null;
  costRate?: string;
  statutory?: string;
  margin?: string | null;
  marginPct?: string | null;
  version: number;
}
const PL_WORD: Record<PlacementRowView['status'], Placement['status']> = { active: 'Active', ending_soon: 'Ending soon', ended: 'Ended' };
const ENDED_WORD: Record<string, string> = { client: 'Client ended the project', performance: 'Performance', resigned: 'Resigned', completed: 'Completed' };
const supplyWord = (r: PlacementRowView) => (r.supply === 'vendor' ? `Vendor: ${r.vendor ?? ''}` : 'Own payroll');

export interface LivePlacements {
  state: DeskLoad;
  onRetry: () => void;
  rows: PlacementRowView[];
  showPay: boolean;
  canManage: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onBench: () => void;
}

function LivePlacementsView({ live }: { live: LivePlacements }) {
  const list = useListControls({
    rows: live.rows,
    fields: [
      { key: 'status', label: 'Status', type: 'multi', options: ['Active', 'Ending soon', 'Ended'].map((v) => ({ value: v, label: v })) },
      { key: 'supply', label: 'Supply', type: 'multi', options: ['Own payroll', 'Vendor supplied'].map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.person} ${r.client} ${r.role}`,
    fieldValue: (r, k) => (k === 'status' ? PL_WORD[r.status] : r.supply === 'vendor' ? 'Vendor supplied' : 'Own payroll'),
    views: [{ id: 'all', name: 'All placements', shared: true }],
  });
  const cols: TableColumn<PlacementRowView>[] = [
    { key: 'person', header: 'Person', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person, secondary: r.role }) },
    { key: 'client', header: 'Client', value: (r) => r.client },
    { key: 'supply', header: 'Supply', value: supplyWord },
    { key: 'start', header: 'Start', type: 'date', value: (r) => isoDate(r.startOn) },
    { key: 'end', header: 'End', type: 'date', value: (r) => isoDate(r.endOn) },
    { key: 'bill', header: 'Bill rate', type: 'money', value: (r) => (r.billRate != null ? Number(r.billRate) : null) },
    ...(live.showPay ? [{ key: 'margin', header: 'Margin per unit', type: 'money', value: (r: PlacementRowView) => (r.margin != null ? Number(r.margin) : null) } as TableColumn<PlacementRowView>] : []),
    { key: 'status', header: 'Status', type: 'status', value: (r) => PL_WORD[r.status], statusTone: (v) => PL_TONE[v as Placement['status']] },
  ];
  const add = live.canManage ? <Button variant="primary" icon={Plus} onClick={live.onNew}>New placement</Button> : undefined;
  return (
    <HireFrame active="Placements & bench">
      <PageHeader
        title="Placements"
        description={live.showPay ? 'Margin = bill − pay − statutory cost for own payroll, bill − vendor rate for vendor supplied.' : 'Who works where, from when to when. Pay rates and margins are for account managers.'}
        actions={live.state === 'ready' ? <><Button onClick={live.onBench}>Bench</Button>{add}</> : undefined}
      />
      {live.state !== 'ready' ? (
        <DeskState state={live.state} what="placements" title="Placements" onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Placements"
          columns={cols}
          rows={list.rows}
          getRowId={(r) => r.id}
          toolbar={list.toolbar}
          filtered={list.filtered}
          onClearFilters={list.clear}
          onRowClick={(r) => live.onOpen(r.id)}
          rowButtons={(r) => <Button size="sm" onClick={() => live.onOpen(r.id)}>Open {r.person}</Button>}
          empty={<EmptyState title="No placements yet." description="A submission the client selected becomes a placement." action={add} />}
        />
      )}
    </HireFrame>
  );
}

export interface PlacementExtendInput {
  endOn: string;
  reason: string;
  version: number;
}
export interface PlacementEndInput {
  endOn: string;
  reason: 'client' | 'performance' | 'resigned';
  note: string | null;
  version: number;
}
export interface LivePlacementRecord {
  state: DeskLoad;
  onRetry: () => void;
  placement: PlacementRowView | null;
  showPay: boolean;
  canManage: boolean;
  today: Date;
  onExtend: (input: PlacementExtendInput) => Promise<unknown>;
  onEnd: (input: PlacementEndInput) => Promise<unknown>;
  /** Slice 3: the weekly hours (account managers and finance). */
  hours?: LiveHours | null;
  /** Answer 494: the client hired the person (fee invoice) and left inside the guarantee (credit note). */
  fee?: LivePlacementFee | null;
}
export interface LivePlacementFee {
  hiredOn: string | null;
  ctc: string | null;
  feeInvoice: { id: string; number: string | null; status: string; total: string } | null;
  leftOn: string | null;
  guarantee: 'replace' | 'credit' | 'none' | null;
  series: { value: string; label: string }[];
  terms: boolean;
  today: Date;
  onHired: (input: { hiredOn: string; ctc: number; seriesId: string; endPlacement: boolean }) => Promise<unknown>;
  onLeft: (leftOn: string) => Promise<unknown>;
  onOpenInvoice: (id: string) => void;
}

function LivePlacementRecordView({ live }: { live: LivePlacementRecord }) {
  const toast = useToastIfAny();
  const [open, setOpen] = useState<'extend' | 'end' | null>(null);
  const [newEnd, setNewEnd] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const [endOn, setEndOn] = useState<Date | null>(null);
  const [why, setWhy] = useState<PlacementEndInput['reason'] | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const p = live.placement;
  if (live.state !== 'ready' || !p) return <HireFrame active="Placements & bench"><DeskState state={live.state === 'ready' ? 'loading' : live.state} what="this placement" title="The placement" onRetry={live.onRetry} /></HireFrame>;
  const daysLeft = daysBetween(live.today, isoDate(p.endOn));
  const unit = `/${p.unit}`;
  const begin = (which: 'extend' | 'end') => {
    setOpen(which);
    setTried(false);
    setFailed(null);
    setNewEnd(null);
    setReason('');
    setEndOn(live.today < isoDate(p.startOn) ? isoDate(p.startOn) : live.today);
    setWhy(null);
    setNote('');
  };
  const extendBad = !newEnd || isoOfDate(newEnd)! <= p.endOn;
  const extend = async () => {
    setTried(true);
    if (extendBad) return focus('px-end');
    if (reason.trim().length < 3) return focus('px-reason');
    setBusy(true);
    setFailed(null);
    try {
      await live.onExtend({ endOn: isoOfDate(newEnd)!, reason: reason.trim(), version: p.version });
      toast?.toast({ tone: 'success', title: 'Placement extended' });
      setOpen(null);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const endBad = !endOn || isoOfDate(endOn)! < p.startOn || isoOfDate(endOn)! > p.endOn;
  const end = async () => {
    setTried(true);
    if (endBad) return (focus('pe-end'), false);
    if (!why) return (focus('pe-reason'), false);
    await live.onEnd({ endOn: isoOfDate(endOn)!, reason: why, note: note.trim() || null, version: p.version });
    toast?.toast({ tone: 'success', title: 'Placement ended' });
    return true;
  };
  const cost = p.supply === 'vendor' ? 'Vendor rate' : 'Pay rate';
  const facts = [
    { label: 'Dates', value: `${formatDate(isoDate(p.startOn))} – ${formatDate(isoDate(p.endOn))}` },
    { label: 'Bill rate', value: p.billRate != null ? `${formatINR(Number(p.billRate))}${unit}` : 'No rate on the card' },
    ...(live.showPay && p.costRate != null ? [{ label: cost, value: `${formatINR(Number(p.costRate))}${unit}` }, { label: 'Margin', value: p.margin != null ? `${formatINR(Number(p.margin))}${unit} (${p.marginPct}%)` : '—' }] : []),
  ];
  const manage = live.canManage && p.status !== 'ended';
  return (
    <HireFrame active="Placements & bench">
      <RecordLayout
        banner={
          p.status === 'ending_soon' && daysLeft >= 0 ? (
            <InlineAlert tone="warning" title={`Placement ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}>
              Extend it, or plan what comes next{p.supply === 'own' ? `: after the last day ${p.person} moves to the bench when you end it` : ''}.
            </InlineAlert>
          ) : undefined
        }
        header={
          <ObjectHeader
            name={`${p.person} at ${p.client}`}
            icon={Handshake}
            secondary={`${p.role} · ${supplyWord(p)}`}
            status={<Badge tone={PL_TONE[PL_WORD[p.status]]}>{PL_WORD[p.status]}</Badge>}
            facts={facts}
            actions={
              manage ? (
                <>
                  <Button onClick={() => begin('end')}>End early</Button>
                  <Button variant="primary" onClick={() => begin('extend')}>
                    Extend
                  </Button>
                </>
              ) : undefined
            }
          />
        }
      >
        <DescriptionList
          columns={2}
          items={[
            { label: 'Supply', value: p.supply === 'vendor' ? `Vendor supplied by ${p.vendor ?? ''}, paid at the vendor's quote` : 'Own payroll' },
            ...(live.showPay && p.statutory != null && p.supply === 'own' ? [{ label: 'Statutory cost', value: `${formatINR(Number(p.statutory))}${unit} (Settings › Staffing desk)` }] : []),
            ...(p.endedReason ? [{ label: 'Ended because', value: ENDED_WORD[p.endedReason] ?? p.endedReason }] : []),
            { label: 'Rates', value: 'From the client’s rate card on each day; change them there with a dated rate change.' },
          ]}
        />
        {live.hours && <PlacementHours live={live.hours} />}
        {live.fee && <PlacementFee fee={live.fee} canManage={live.canManage} person={p.person} />}
      </RecordLayout>
      <Drawer
        open={open === 'extend'}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Extend placement"
        subtitle={`${p.person} at ${p.client}`}
        dirty
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void extend()}>
              Save extension
            </Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          {failed && <InlineAlert tone="danger" title={failed} />}
          <FormField id="px-end" label="New last day" required helper={`Now ${formatDate(isoDate(p.endOn))}.`} error={tried && extendBad ? 'Choose a day after the current last day.' : null}>
            <DatePicker value={newEnd} onChange={setNewEnd} min={isoDate(p.endOn)} />
          </FormField>
          <FormField id="px-reason" label="Reason" required error={tried && reason.trim().length < 3 ? 'Say why, like “Client extended the PO”.' : null}>
            <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
          </FormField>
        </div>
      </Drawer>
      <ConfirmDialog
        open={open === 'end'}
        onOpenChange={(o) => !o && setOpen(null)}
        destructive
        title={`End ${p.person}'s placement early?`}
        consequence={p.supply === 'own' ? `${p.person} moves to the bench from the next day, under the bench policy. Nothing exits automatically.` : `The vendor's worker leaves the client on the last day.`}
        confirmLabel="End placement"
        onConfirm={end}
      >
        <FormField id="pe-end" label="Last day" required error={tried && endBad ? `Choose a day from ${formatDate(isoDate(p.startOn))} to ${formatDate(isoDate(p.endOn))}.` : null}>
          <DatePicker value={endOn} onChange={setEndOn} min={isoDate(p.startOn)} max={isoDate(p.endOn)} />
        </FormField>
        <FormField id="pe-reason" label="Reason" required error={tried && !why ? 'Choose the reason.' : null}>
          <Select value={why} onChange={(v) => setWhy(v as PlacementEndInput['reason'] | null)} options={[{ value: 'client', label: 'Client ended the project' }, { value: 'performance', label: 'Performance' }, { value: 'resigned', label: 'Resigned' }]} placeholder="Choose a reason" />
        </FormField>
        <FormField id="pe-note" label="Note" optional>
          <TextArea rows={2} value={note} onChange={setNote} maxLength={500} />
        </FormField>
      </ConfirmDialog>
    </HireFrame>
  );
}

/** GET /staffing/bench. */
export interface BenchRowView {
  id: string;
  employeeId: string;
  person: string;
  sinceOn: string;
  days: number;
  left: number;
  overPolicy: boolean;
  lastClient: string | null;
  note: string | null;
  /** Answer 1417: their project allocation today (0 on the bench; 1 to 99 partly allocated). */
  allocatedPct?: number;
}
export interface LiveBench {
  state: DeskLoad;
  onRetry: () => void;
  rows: BenchRowView[];
  policy: { maxDays: number; payPct: number; after: 'review' | 'unpaid' };
  canManage: boolean;
  onAdd: () => void;
  onRemove: (id: string) => Promise<unknown>;
  onSubmit: () => void;
  onPlacements: () => void;
}

function LiveBenchView({ live }: { live: LiveBench }) {
  const toast = useToastIfAny();
  const [removing, setRemoving] = useState<BenchRowView | null>(null);
  const after = live.policy.after === 'unpaid' ? 'then unpaid bench' : 'then redeploy or an exit review';
  const add = live.canManage ? <Button onClick={live.onAdd}>Add to bench</Button> : undefined;
  return (
    <HireFrame active="Placements & bench">
      <PageHeader
        title="Bench"
        description={`Employees between placements. Bench policy (Settings › Staffing desk): ${live.policy.payPct}% pay, up to ${live.policy.maxDays} days, ${after}. Nothing exits automatically.`}
        actions={
          live.state === 'ready' ? (
            <>
              <Button onClick={live.onPlacements}>Placements</Button>
              {add}
              <Button variant="primary" icon={Send} onClick={live.onSubmit}>
                Submit from bench
              </Button>
            </>
          ) : undefined
        }
      />
      {live.state !== 'ready' ? (
        <DeskState state={live.state} what="the bench" title="The bench" onRetry={live.onRetry} />
      ) : live.rows.length === 0 ? (
        <EmptyState title="No one is on the bench." description="People whose placement ends appear here until they're placed again." action={add} />
      ) : (
        <div className="yx-hire-board">
          {live.rows.map((b) => (
            <article key={b.id} className="yx-hire-board__card">
              <PersonLabel name={b.person} secondary={`Since ${formatDate(isoDate(b.sinceOn))}${b.lastClient ? ` · last at ${b.lastClient}` : ''}`} />
              <Meter value={Math.min(b.days, live.policy.maxDays)} max={live.policy.maxDays} label={`${b.person} bench days`} warnAt={75} valueText={`${b.days} of ${live.policy.maxDays} days`} />
              {/* Answer 1417: the one bench shows project allocation too (kit first; PRJ-07 links here). */}
              {b.allocatedPct != null && (
                <div className="yx-hire-row">
                  <Meter value={b.allocatedPct} max={100} label={`${b.person} allocated`} warnAt={101} dangerAt={200} valueText={`${b.allocatedPct}% allocated`} />
                  {b.allocatedPct > 0 && <Badge tone={b.allocatedPct >= 100 ? 'success' : 'info'}>{b.allocatedPct >= 100 ? 'Fully allocated' : 'Partly allocated'}</Badge>}
                </div>
              )}
              {b.overPolicy ? <Badge tone="warning">{live.policy.after === 'unpaid' ? 'Over the limit: unpaid bench' : 'Redeploy or start an exit review'}</Badge> : <Text size="sm" tone="secondary">{b.left} days left under the policy</Text>}
              {b.note && <Text size="sm" tone="secondary">{b.note}</Text>}
              <div className="yx-hire-actions">
                <Button size="sm" onClick={live.onSubmit}>Submit to a job</Button>
                {live.canManage && <Button size="sm" onClick={() => setRemoving(b)}>Take off the bench</Button>}
              </div>
            </article>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Take ${removing?.person ?? ''} off the bench?`}
        consequence="Their bench days stop today. Placing them takes them off the bench on its own; use this when they leave the desk for another reason."
        confirmLabel="Take off the bench"
        onConfirm={async () => {
          await live.onRemove(removing!.id);
          toast?.toast({ tone: 'success', title: 'Taken off the bench' });
        }}
      />
    </HireFrame>
  );
}

/** GET /staffing/vendors row (the existing agencies with their documents). */
export interface VendorRowView {
  id: string;
  name: string;
  contactEmail: string | null;
  pan: string | null;
  gstin: string | null;
  tdsSection: '194C' | '194J' | null;
  tier: 'preferred' | 'standard' | 'probation' | null;
  agreementSignedOn: string | null;
  bankVerified: boolean;
  active: boolean;
  status: 'inactive' | 'pending' | 'active';
  missing: string[];
  sharedJobs: number;
  submissions: number;
  duplicateRate: number;
  placements: number;
  portalToken: string;
  jobs: { id: string; title: string; expiresOn: string | null }[];
}
/** GET /staffing/vendor-submissions row: quote, cap and over-by only for account and vendor managers. */
export interface VendorSubmissionView {
  id: string;
  vendor: string;
  candidate: string;
  job: string;
  jobId: string;
  clientJob: boolean;
  at: string;
  quoted: string | null;
  cap: string | null;
  overBy: string | null;
  overCap: boolean;
  exception: { reason: string; at: string } | null;
  duplicate: { holder: string; until: string | null } | null;
  rightToRepresent: boolean;
  consent: boolean;
  status: 'pending' | 'accepted' | 'rejected';
  /** Answer 489: an account manager's override of the duplicate, with the reason. */
  override?: { reason: string; at: string } | null;
}
export interface LiveVendors {
  state: 'ready' | 'loading' | 'error' | 'denied';
  onRetry: () => void;
  vendors: VendorRowView[];
  /** Null while loading or when the viewer only manages vendors without reviewing. */
  submissions: VendorSubmissionView[] | null;
  canManage: boolean;
  /** Forwarding to a client is the account manager's, with the desk on. */
  canForward: boolean;
  defaultTab?: 'register' | 'submissions' | 'scorecards' | 'invoices';
  onAdd: () => void;
  onEdit: (id: string) => void;
  onShare: () => void;
  onException: (id: string, reason: string) => Promise<unknown>;
  loadContacts: (jobId: string) => Promise<{ value: string; label: string }[]>;
  onForward: (id: string, contactId: string) => Promise<unknown>;
  /** Recruiters (pipeline key) accept or reject a submission for an ordinary job into its pipeline. */
  canReview: boolean;
  onAccept: (id: string) => Promise<unknown>;
  onReject: (id: string) => Promise<unknown>;
  /** False when the viewer reviews submissions but does not manage vendors: no register or scorecards. */
  showRegister?: boolean;
  /** Answer 489 (the design's Review dispute): override a duplicate with a reason (account managers). */
  onOverride?: (id: string, reason: string) => Promise<unknown>;
  /** Stories: open the dispute review for this submission. */
  defaultDisputeId?: string;
  /** Slice 3 (answer 490): vendor invoices for staffing finance; absent hides the tab. */
  bills?: VendorInvoicesLive | null;
}
const TIER: Record<string, string> = { preferred: 'Preferred', standard: 'Standard', probation: 'Probation' };
const V_STATUS: Record<VendorRowView['status'], string> = { active: 'Active', pending: 'Pending documents', inactive: 'Inactive' };

function LiveVendorsView({ live }: { live: LiveVendors }) {
  const toast = useToastIfAny();
  const [exc, setExc] = useState<VendorSubmissionView | null>(null);
  const [dispute, setDispute] = useState<VendorSubmissionView | null>(() => live.submissions?.find((x) => x.id === live.defaultDisputeId) ?? null);
  const [fwd, setFwd] = useState<VendorSubmissionView | null>(null);
  const [reason, setReason] = useState('');
  const [contacts, setContacts] = useState<{ value: string; label: string }[] | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const vcols: TableColumn<VendorRowView>[] = [
    { key: 'name', header: 'Vendor', value: (r) => r.name, render: (r) => <PersonLabel name={r.name} secondary={[r.pan ? `PAN ${r.pan}` : null, r.gstin ? `GSTIN ${r.gstin}` : null].filter(Boolean).join(' · ') || 'No tax details yet'} /> },
    { key: 'tier', header: 'Tier', value: (r) => (r.tier ? TIER[r.tier] : '—') },
    { key: 'tds', header: 'TDS section', value: (r) => r.tdsSection ?? '—' },
    { key: 'status', header: 'Status', type: 'status', value: (r) => V_STATUS[r.status], statusTone: (v) => (v === 'Active' ? 'success' : v === 'Pending documents' ? 'warning' : 'neutral') },
    { key: 'missing', header: 'Missing', value: (r) => (r.missing.length ? r.missing.join(', ') : '—') },
    { key: 'shares', header: 'Shared jobs', type: 'number', value: (r) => r.sharedJobs },
    { key: 'subs', header: 'Submissions', type: 'number', value: (r) => r.submissions, total: 'sum' },
  ];
  const subs = live.submissions ?? [];
  const register = live.showRegister !== false;
  const review = async (fn: () => Promise<unknown>, title: string) => {
    try {
      await fn();
      toast?.toast({ tone: 'success', title });
    } catch (e) {
      toast?.toast({ tone: 'error', title: e instanceof Error && e.message ? e.message : 'That did not save. Try again.' });
    }
  };
  const openFwd = (s: VendorSubmissionView) => {
    setFwd(s);
    setContact(null);
    setContacts(null);
    setTried(false);
    void live.loadContacts(s.jobId).then((c) => {
      setContacts(c);
      if (c.length === 1) setContact(c[0]!.value);
    });
  };
  const actions =
    live.state === 'ready' && live.canManage ? (
      <>
        <Button icon={Plus} onClick={live.onAdd}>Add vendor</Button>
        <Button variant="primary" icon={Share2} onClick={live.onShare}>
          Share a job
        </Button>
      </>
    ) : undefined;
  return (
    <HireFrame active="Vendors">
      <PageHeader title="Vendors" description="Agencies that supply candidates. A vendor gets client jobs only with a signed agreement, PAN, verified bank account and TDS section. Vendors never see other vendors, bill rates or margins." actions={actions} />
      {live.state !== 'ready' ? (
        live.state === 'denied' ? <NoAccessState grantedBy="your admin (vendor manager)" what="vendors" /> : <DeskState state={live.state} what="vendors" title="Vendors" onRetry={live.onRetry} />
      ) : (
        <Tabs defaultValue={register ? (live.defaultTab ?? 'register') : 'submissions'}>
          <TabsList aria-label="Vendor sections">
            {register && (
              <TabsTrigger value="register" count={live.vendors.length}>
                Register
              </TabsTrigger>
            )}
            <TabsTrigger value="submissions" count={subs.filter((s) => s.status === 'pending').length}>
              Vendor submissions
            </TabsTrigger>
            {live.bills && <TabsTrigger value="invoices">Vendor invoices</TabsTrigger>}
            {register && <TabsTrigger value="scorecards">Scorecards</TabsTrigger>}
          </TabsList>
          {live.bills && (
            <TabsContent value="invoices">
              <VendorInvoices live={live.bills} />
            </TabsContent>
          )}
          <TabsContent value="register">
            <DataTable
              label="Vendor register"
              columns={vcols}
              rows={live.vendors}
              getRowId={(r) => r.id}
              onRowClick={live.canManage ? (r) => live.onEdit(r.id) : undefined}
              rowButtons={live.canManage ? (r) => <Button size="sm" onClick={() => live.onEdit(r.id)}>Change {r.name}</Button> : undefined}
              empty={<EmptyState title="No vendors yet." description="Add a vendor, then share jobs with a rate cap." action={live.canManage ? <Button icon={Plus} onClick={live.onAdd}>Add vendor</Button> : undefined} />}
            />
          </TabsContent>
          <TabsContent value="submissions">
            {subs.length === 0 ? (
              <EmptyState title="No vendor submissions yet." description="Vendors submit through their portal link once you share a job with them." />
            ) : (
              <ul className="yx-hire-list" aria-label="Vendor submissions">
                {subs.map((s) => {
                  const consentOk = s.rightToRepresent && s.consent;
                  const dup = s.duplicate && !s.override;
                  const ready = s.status === 'pending' && !dup && consentOk && !s.overCap;
                  return (
                    <li key={s.id} className="yx-hire-list__item">
                      <div className="yx-hire-list__main">
                        <PersonLabel name={s.candidate} secondary={`${s.job} · from ${s.vendor} · ${formatDate(new Date(s.at))}`} />
                        <div className="yx-hire-chips">
                          {s.status !== 'pending' ? <Badge tone="neutral">{s.status === 'accepted' ? 'Accepted' : 'Rejected'}</Badge> : null}
                          <Badge tone={dup ? 'warning' : 'success'}>{s.duplicate ? `${s.override ? 'Duplicate overridden' : 'Duplicate'}: held by ${s.duplicate.holder}${s.duplicate.until ? ` until ${d(s.duplicate.until)}` : ''}` : 'Unique'}</Badge>
                          {s.clientJob && (
                            <Badge tone={s.overCap ? 'danger' : 'neutral'}>
                              {s.quoted != null
                                ? `Quote ${formatINR(Number(s.quoted))} ${s.overBy ? `over cap ${formatINR(Number(s.cap))} by ${formatINR(Number(s.overBy))}` : `within cap ${formatINR(Number(s.cap))}`}`
                                : s.overCap
                                  ? 'Quote over the rate cap'
                                  : 'Quote within the rate cap'}
                              {s.exception ? ' · exception approved' : ''}
                            </Badge>
                          )}
                          <Badge tone={consentOk ? 'success' : 'warning'}>{consentOk ? 'Right to represent + consent' : 'Consent missing'}</Badge>
                        </div>
                        {s.duplicate && <Text size="sm" tone="secondary">{s.override ? `Overridden: ${s.override.reason}` : 'The vendor sees “duplicate” and not who holds the candidate.'}</Text>}
                      </div>
                      <div className="yx-hire-list__actions">
                        {s.status === 'pending' && s.clientJob && s.overCap && live.canManage && (
                          <Button size="sm" onClick={() => (setExc(s), setReason(''), setTried(false))}>
                            Approve exception with reason
                          </Button>
                        )}
                        {s.status === 'pending' && dup && live.canForward && live.onOverride && (
                          <Button size="sm" onClick={() => (setDispute(s), setReason(''), setTried(false))}>
                            Review dispute
                          </Button>
                        )}
                        {ready && s.clientJob && live.canForward && (
                          <Button size="sm" onClick={() => openFwd(s)}>
                            Forward to client
                          </Button>
                        )}
                        {s.status === 'pending' && !s.clientJob && live.canReview && (
                          <>
                            <Button size="sm" onClick={() => void review(() => live.onReject(s.id), 'Submission rejected')}>
                              Reject
                            </Button>
                            <Button size="sm" onClick={() => void review(() => live.onAccept(s.id), 'Added to the job’s pipeline')}>
                              Accept into pipeline
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="scorecards">
            <DataTable
              label="Vendor scorecards"
              columns={[
                { key: 'name', header: 'Vendor', value: (r: VendorRowView) => r.name },
                { key: 'subs', header: 'Submissions', type: 'number', value: (r: VendorRowView) => r.submissions },
                { key: 'dup', header: 'Duplicate rate', type: 'number', value: (r: VendorRowView) => r.duplicateRate, render: (r: VendorRowView) => `${r.duplicateRate}%` },
                { key: 'placements', header: 'Placements', type: 'number', value: (r: VendorRowView) => r.placements },
                { key: 'tier', header: 'Tier (set by you)', value: (r: VendorRowView) => (r.tier ? TIER[r.tier] : '—') },
              ]}
              rows={live.vendors}
              getRowId={(r) => r.id}
            />
          </TabsContent>
        </Tabs>
      )}
      <ConfirmDialog
        open={Boolean(dispute)}
        onOpenChange={(o) => !o && setDispute(null)}
        title={`Override the duplicate for ${dispute?.candidate ?? ''}?`}
        consequence={dispute?.duplicate ? `${dispute.duplicate.holder} holds this person${dispute.duplicate.until ? ` until ${d(dispute.duplicate.until)}` : ''}. With your reason (kept in the audit log) you can forward them; the other vendor is not told.` : undefined}
        confirmLabel="Override with reason"
        onConfirm={async () => {
          setTried(true);
          if (reason.trim().length < 3) return (focus('vd-reason'), false);
          await live.onOverride!(dispute!.id, reason.trim());
          toast?.toast({ tone: 'success', title: 'Duplicate overridden' });
        }}
      >
        <FormField id="vd-reason" label="Reason" required error={tried && reason.trim().length < 3 ? 'Say why, like “The first vendor withdrew the candidate”.' : null}>
          <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(exc)}
        onOpenChange={(o) => !o && setExc(null)}
        title={`Approve ${exc?.candidate ?? ''} over the rate cap?`}
        consequence="The quote stays above the cap; your reason is kept with the submission and in the audit log."
        confirmLabel="Approve exception"
        onConfirm={async () => {
          setTried(true);
          if (reason.trim().length < 3) return (focus('vx-reason'), false);
          await live.onException(exc!.id, reason.trim());
          toast?.toast({ tone: 'success', title: 'Exception approved' });
        }}
      >
        <FormField id="vx-reason" label="Reason" required error={tried && reason.trim().length < 3 ? 'Say why, like “Rare skill; client agreed”.' : null}>
          <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(fwd)}
        onOpenChange={(o) => !o && setFwd(null)}
        title={`Forward ${fwd?.candidate ?? ''} to the client?`}
        consequence="The candidate joins this job's pipeline and a client submission is made from this vendor. The vendor's quote is never shown to the client."
        confirmLabel="Forward to client"
        onConfirm={async () => {
          setTried(true);
          if (!contact) return (focus('vf-contact'), false);
          await live.onForward(fwd!.id, contact);
          toast?.toast({ tone: 'success', title: 'Forwarded to the client' });
        }}
      >
        <FormField id="vf-contact" label="Client contact" required error={tried && !contact ? (contacts && !contacts.length ? 'Add a contact to this client first.' : 'Choose the client contact.') : null}>
          <Select value={contact} onChange={setContact} options={contacts ?? []} placeholder={contacts ? 'Choose a contact' : 'Loading contacts…'} />
        </FormField>
      </ConfirmDialog>
    </HireFrame>
  );
}

/* ================================================================== Staffing slice 3 made live (HIR-18, HIR-19, HIR-30, HIR-31) */

const money = (s: string | null | undefined) => (s == null ? null : Number(s));
export type WindowView = { days: number; state: 'ok' | 'warning' | 'blocked' | 'not_applicable' };
const INV_WORD: Record<string, ClientInvoice['status']> = { draft: 'Draft', issued: 'Issued', part_paid: 'Part paid', paid: 'Paid' };
const irnWord = (irn: InvoiceRowView['irn'], status: string) =>
  status === 'draft' || irn == null ? '—' : irn === 'not_needed' ? 'Not needed' : irn.state === 'blocked' ? `Blocked · day ${irn.days}` : irn.state === 'not_applicable' ? 'Not needed' : `Pending · day ${irn.days}`;

/** GET /staffing/invoices row. */
export interface InvoiceRowView {
  id: string;
  number: string | null;
  client: string;
  kind: 'staffing' | 'credit_note';
  date: string | null;
  period: string | null;
  taxable: string;
  gst: string;
  total: string;
  status: 'draft' | 'issued' | 'part_paid' | 'paid';
  irn: 'not_needed' | WindowView | null;
}
export interface LiveInvoices {
  state: DeskLoad;
  onRetry: () => void;
  rows: InvoiceRowView[];
  canCreate: boolean;
  onCreate: () => void;
  onOpen: (id: string) => void;
  /** Answer 522: Export to accounting (finance). */
  onExport?: () => void;
}

function LiveInvoicesView({ live }: { live: LiveInvoices }) {
  const list = useListControls({
    rows: live.rows,
    fields: [{ key: 'status', label: 'Status', type: 'multi', options: ['Draft', 'Issued', 'Part paid', 'Paid'].map((v) => ({ value: v, label: v })) }],
    text: (r) => `${r.number ?? ''} ${r.client}`,
    fieldValue: (r) => INV_WORD[r.status]!,
    views: [{ id: 'all', name: 'All invoices', shared: true }],
    searchPlaceholder: 'Search invoice number or client',
  });
  const cols: TableColumn<InvoiceRowView>[] = [
    { key: 'number', header: 'Invoice', type: 'id', value: (r) => r.number ?? 'Draft', width: 170 },
    { key: 'client', header: 'Client', value: (r) => r.client },
    { key: 'date', header: 'Date', type: 'date', value: (r) => (r.date ? new Date(`${r.date}T00:00:00`) : null) },
    { key: 'period', header: 'Period', value: (r) => r.period ?? '—' },
    { key: 'type', header: 'Type', value: (r) => (r.kind === 'credit_note' ? 'Credit note' : 'Contract staffing') },
    { key: 'taxable', header: 'Taxable value', type: 'money', value: (r) => (r.kind === 'credit_note' ? -money(r.taxable)! : money(r.taxable)), total: 'sum' },
    { key: 'gst', header: 'GST', type: 'money', value: (r) => (r.kind === 'credit_note' ? -money(r.gst)! : money(r.gst)), total: 'sum' },
    { key: 'total', header: 'Total', type: 'money', value: (r) => (r.kind === 'credit_note' ? -money(r.total)! : money(r.total)), total: 'sum' },
    { key: 'status', header: 'Status', type: 'status', value: (r) => INV_WORD[r.status], statusTone: (v) => INV_TONE[v as ClientInvoice['status']] },
    { key: 'irn', header: 'IRN', type: 'status', value: (r) => irnWord(r.irn, r.status), statusTone: (v) => (String(v).startsWith('Blocked') ? 'danger' : String(v).startsWith('Pending') ? 'warning' : 'neutral') },
  ];
  const create = live.canCreate ? <Button variant="primary" onClick={live.onCreate}>Create invoices</Button> : undefined;
  const exportBtn = live.canCreate && live.onExport ? <Button onClick={live.onExport}>Export to accounting</Button> : null;
  return (
    <HireFrame active="Invoices">
      <PageHeader title="Invoices" description="GST tax invoices from client-approved timesheets, numbered per entity and GSTIN. Issued invoices are never edited: corrections are credit notes." actions={live.state === 'ready' && create ? <>{exportBtn}{create}</> : undefined} />
      {live.state !== 'ready' ? (
        <DeskState state={live.state} what="invoices" title="Invoices" onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Client invoices"
          columns={cols}
          rows={list.rows}
          getRowId={(r) => r.id}
          toolbar={list.toolbar}
          filtered={list.filtered}
          onClearFilters={list.clear}
          onRowClick={(r) => live.onOpen(r.id)}
          rowButtons={(r) => <Button size="sm" onClick={() => live.onOpen(r.id)}>Open {r.number ?? 'draft'}</Button>}
          empty={<EmptyState title="No invoices yet." description="Invoices are created from client-approved timesheets each month." action={create} />}
        />
      )}
    </HireFrame>
  );
}

/** HIR-31 live: the window from the rule set (verify) and the company setting; the IRP is not connected. */
export function LiveEInvoiceBanner({ window: w, invoiceNo, invoiceDate, rule, onReissue }: { window: WindowView; invoiceNo: string; invoiceDate: string; rule: { reportWithinDays: number; warnFromDay: number }; onReissue?: () => void }) {
  const date = formatDate(new Date(`${invoiceDate}T00:00:00`));
  if (w.state === 'not_applicable')
    return <InlineAlert tone="info" title="E-invoice not needed">E-invoicing is off for your company (Settings › Staffing desk), so {invoiceNo} goes to the client without an IRN.</InlineAlert>;
  if (w.state === 'ok')
    return <InlineAlert tone="info" title={`Day ${w.days} of ${rule.reportWithinDays} for IRN`}>Report {invoiceNo} for an IRN within {rule.reportWithinDays - w.days} more days of its invoice date ({date}).</InlineAlert>;
  if (w.state === 'warning')
    return <InlineAlert tone="warning" title={`Day ${w.days} of ${rule.reportWithinDays}: report for IRN soon`}>{invoiceNo} is dated {date}. After day {rule.reportWithinDays} the IRP won&rsquo;t accept it and you&rsquo;ll need to cancel and reissue it with a new date.</InlineAlert>;
  return (
    <InlineAlert tone="danger" title={`Day ${w.days}: IRN blocked`} actions={onReissue ? <Button size="sm" onClick={onReissue}>Cancel and reissue</Button> : undefined}>
      {invoiceNo} is more than {rule.reportWithinDays} days old, so it can&rsquo;t be reported for IRN. Cancel it and issue a new invoice; the credit note links the two.
    </InlineAlert>
  );
}

/** GET /staffing/invoices/:id. */
export interface InvoiceDetail {
  canEdit: boolean;
  invoice: {
    id: string; number: string | null; kind: 'staffing' | 'credit_note'; creditOf: string | null; client: string; clientState: string; supplierState: string; interState: boolean; gstPct: string;
    date: string | null; dueOn: string | null; period: string | null; po: string | null; reason: string | null;
    taxable: string; cgst: string; sgst: string; igst: string; total: string; paid: string; outstanding: string; status: InvoiceRowView['status']; irn: string; version: number; window: WindowView | null;
  };
  lines: { description: string; qty: string; rate: string; amount: string }[];
  creditNotes: { id: string; number: string; date: string; amount: string; reason: string }[];
  rule: { reportWithinDays: number; warnFromDay: number };
}
export interface LiveInvoiceRecord {
  state: DeskLoad;
  onRetry: () => void;
  data: InvoiceDetail | null;
  onIssue: () => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onCreditNote: (input: { amount: number; reason: string }) => Promise<unknown>;
  onReissue: (reason: string) => Promise<unknown>;
  onOpen: (id: string) => void;
  /** Answer 492: download the GST PDF of an issued invoice or credit note. */
  onPdf?: () => void;
}

function LiveInvoiceRecordView({ live }: { live: LiveInvoiceRecord }) {
  const toast = useToastIfAny();
  const [open, setOpen] = useState<'credit' | 'reissue' | 'issue' | 'delete' | 'irn' | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const data = live.data;
  if (live.state !== 'ready' || !data) return <HireFrame active="Invoices"><DeskState state={live.state === 'ready' ? 'loading' : live.state} what="this invoice" title="The invoice" onRetry={live.onRetry} /></HireFrame>;
  const inv = data.invoice;
  const cn = inv.kind === 'credit_note';
  const left = Number(inv.taxable) - data.creditNotes.reduce((s, c) => s + Number(c.amount) / (1 + Number(inv.gstPct) / 100), 0);
  const begin = (w: typeof open) => (setOpen(w), setTried(false), setFailed(null), setAmount(null), setReason(''));
  const go = async (fn: () => Promise<unknown>, title: string) => {
    setBusy(true);
    setFailed(null);
    try {
      await fn();
      toast?.toast({ tone: 'success', title });
      setOpen(null);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const name = inv.number ? `${cn ? 'Credit note' : 'Invoice'} ${inv.number}` : 'Draft invoice';
  const tax = inv.interState ? [[`IGST ${inv.gstPct}% (inter-state)`, inv.igst]] : [[`CGST ${Number(inv.gstPct) / 2}%`, inv.cgst], [`SGST ${Number(inv.gstPct) / 2}%`, inv.sgst]];
  const pdfButton = live.onPdf && inv.status !== 'draft' ? <Button icon={FileText} onClick={live.onPdf}>Download PDF</Button> : null;
  const editActions = data.canEdit ? (
    inv.status === 'draft' ? (
      <>
        <Button onClick={() => begin('delete')}>Delete draft</Button>
        <Button variant="primary" onClick={() => begin('issue')}>Issue invoice</Button>
      </>
    ) : !cn ? (
      <>
        <Button onClick={() => begin('credit')}>Raise credit note</Button>
        {inv.window && inv.window.state !== 'not_applicable' && <Button onClick={() => begin('irn')}>Send for IRN</Button>}
      </>
    ) : undefined
  ) : undefined;
  const actions = pdfButton || editActions ? <>{pdfButton}{editActions}</> : undefined;
  return (
    <HireFrame active="Invoices">
      <RecordLayout
        banner={inv.window && inv.number && inv.date ? <LiveEInvoiceBanner window={inv.window} invoiceNo={inv.number} invoiceDate={inv.date} rule={data.rule} onReissue={data.canEdit && !cn ? () => begin('reissue') : undefined} /> : undefined}
        header={
          <ObjectHeader
            name={name}
            icon={FileText}
            secondary={`${inv.client}${inv.period ? ` · ${inv.period}` : ''} · ${cn ? 'Credit note' : 'Contract staffing'}`}
            status={<Badge tone={INV_TONE[INV_WORD[inv.status]!]}>{INV_WORD[inv.status]}</Badge>}
            facts={[
              { label: cn ? 'Credit note date' : 'Invoice date', value: inv.date ? formatDate(new Date(`${inv.date}T00:00:00`)) : 'On issue' },
              ...(!cn ? [{ label: 'Client PO', value: inv.po ?? 'Not given' }, { label: 'Due', value: inv.dueOn ? formatDate(new Date(`${inv.dueOn}T00:00:00`)) : 'On issue' }] : [{ label: 'Reason', value: inv.reason ?? '' }]),
              { label: 'Place of supply', value: inv.clientState },
            ]}
            actions={actions}
          />
        }
      >
        <HireTable
          label="Invoice lines, scrolls sideways on small screens"
          caption={cn ? 'Credit note' : 'Invoice lines'}
          head={['Description', 'Hours', 'Rate', 'Amount']}
          rows={data.lines.map((l, i) => ({ key: i, cells: [l.description, cn ? '—' : l.qty, cn ? '—' : formatINR(Number(l.rate)), formatINR(Number(l.amount))] }))}
          foot={[
            { label: 'Taxable value', value: formatINR(Number(inv.taxable)) },
            ...tax.map(([label, v]) => ({ label, value: formatINR(Number(v)) })),
            { label: 'Total', value: formatINR(Number(inv.total)) },
            ...(!cn && inv.status !== 'draft' ? [{ label: 'Outstanding', value: formatINR(Number(inv.outstanding)) }] : []),
          ]}
        />
        {data.creditNotes.length > 0 && (
          <Card title="Credit notes against this invoice">
            <ul className="yx-hire-list">
              {data.creditNotes.map((c) => (
                <li key={c.id} className="yx-hire-list__item">
                  <div className="yx-hire-list__main">
                    <Text weight="medium">{c.number}</Text>
                    <Text size="sm" tone="secondary">
                      {formatDate(new Date(`${c.date}T00:00:00`))} · {c.reason}
                    </Text>
                  </div>
                  <Text className="yx-hire-num">{formatINR(-Number(c.amount))}</Text>
                  <Button size="sm" onClick={() => live.onOpen(c.id)}>Open {c.number}</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {cn && inv.creditOf && (
          <div>
            <Button size="sm" onClick={() => live.onOpen(inv.creditOf!)}>Open the invoice it corrects</Button>
          </div>
        )}
      </RecordLayout>
      <Drawer
        open={open === 'credit'}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Raise credit note"
        subtitle={name}
        dirty
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => {
                setTried(true);
                if (amount == null || amount <= 0 || amount > left + 0.005) return focus('cn-amount');
                if (reason.trim().length < 3) return focus('cn-reason');
                void go(() => live.onCreditNote({ amount, reason: reason.trim() }), 'Credit note issued');
              }}
            >
              Issue credit note
            </Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          {failed && <InlineAlert tone="danger" title={failed} />}
          <FormField id="cn-amount" label="Taxable amount to credit" required helper={`At most ${formatINR(Math.round(left * 100) / 100)}; GST is credited at the invoice's rate.`} error={tried && (amount == null || amount <= 0 || amount > left + 0.005) ? (amount != null && amount > left ? 'That is more than is left on the invoice.' : 'Enter the amount to credit.') : null}>
            <CurrencyField allowPaise value={amount} onChange={setAmount} />
          </FormField>
          <FormField id="cn-reason" label="Reason" required error={tried && reason.trim().length < 3 ? 'Say why, like “8 h duplicate on 14 Aug”.' : null}>
            <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
          </FormField>
          <Text size="sm" tone="secondary">The credit note gets its own number in this series and is never edited either.</Text>
        </div>
      </Drawer>
      <ConfirmDialog
        open={open === 'reissue'}
        onOpenChange={(o) => !o && setOpen(null)}
        destructive
        title={`Cancel ${inv.number} and reissue?`}
        consequence="A credit note for the whole invoice is issued now, and the same lines come back as a draft to issue with today's date."
        confirmLabel="Cancel and reissue"
        onConfirm={async () => {
          setTried(true);
          if (reason.trim().length < 3) return (focus('ri-reason'), false);
          await live.onReissue(reason.trim());
          toast?.toast({ tone: 'success', title: 'Cancelled; the new draft is ready' });
        }}
      >
        <FormField id="ri-reason" label="Reason" required error={tried && reason.trim().length < 3 ? 'Say why.' : null}>
          <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={open === 'issue'}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Issue this invoice?"
        consequence="It takes the next number of its series and today's date. After this it is never edited: corrections are credit notes."
        confirmLabel="Issue invoice"
        onConfirm={async () => {
          await live.onIssue();
          toast?.toast({ tone: 'success', title: 'Invoice issued' });
        }}
      />
      <ConfirmDialog
        open={open === 'delete'}
        onOpenChange={(o) => !o && setOpen(null)}
        destructive
        title="Delete this draft?"
        consequence="Its hours become free to invoice again."
        confirmLabel="Delete draft"
        onConfirm={async () => {
          await live.onDelete();
          toast?.toast({ tone: 'success', title: 'Draft deleted' });
        }}
      />
      <ConfirmDialog open={open === 'irn'} onOpenChange={(o) => !o && setOpen(null)} title="The IRP is not connected" consequence="YukthiX does not report invoices to the invoice registration portal yet. Report this invoice on the IRP yourself within the window shown above." confirmLabel="Close" onConfirm={() => undefined} />
    </HireFrame>
  );
}

/** GET /staffing/receivables row. */
export interface LedgerRowView {
  invoiceId: string;
  invoice: string;
  clientId: string;
  client: string;
  tdsSection: string | null;
  date: string;
  dueOn: string;
  bucket: '0–30' | '31–60' | '61–90' | '90+';
  overdueDays: number;
  total: string;
  outstanding: string;
  tdsDeducted: string;
  tds26as: string | null;
  dispute: string | null;
  nextReminder: string | null;
  version: number;
}
export interface ReceiptInput {
  clientId: string;
  receivedOn: string;
  amount: number;
  tds: number;
  reference: string | null;
  allocations: { invoiceId: string; amount: number }[];
}
export interface LiveCollections {
  state: DeskLoad;
  onRetry: () => void;
  rows: LedgerRowView[];
  canRecord: boolean;
  today: Date;
  onReceipt: (input: ReceiptInput) => Promise<unknown>;
  onCollection: (invoiceId: string, change: { tds26as?: number | null; dispute?: string | null; version: number }) => Promise<unknown>;
}
const tdsMatchLive = (deducted: string, in26: string | null) => (in26 == null ? 'Not in 26AS yet' : Number(in26) === Number(deducted) ? 'Matched' : `Mismatch of ${formatINR(Math.abs(Number(deducted) - Number(in26)))}`);

function LiveCollectionsView({ live }: { live: LiveCollections }) {
  const toast = useToastIfAny();
  const [receipt, setReceipt] = useState(false);
  const [edit, setEdit] = useState<LedgerRowView | null>(null);
  const [in26, setIn26] = useState<number | null>(null);
  const [dispute, setDispute] = useState('');
  const rows = live.rows;
  const clients = Array.from(new Set(rows.map((r) => r.client)));
  const series = (['0–30', '31–60', '61–90', '90+'] as const).map((b) => ({ name: `${b} days`, values: clients.map((c) => rows.filter((r) => r.client === c && r.bucket === b).reduce((s, r) => s + Number(r.outstanding), 0)) }));
  const total = rows.reduce((s, r) => s + Number(r.outstanding), 0);
  const over60 = rows.filter((r) => r.bucket === '61–90' || r.bucket === '90+').reduce((s, r) => s + Number(r.outstanding), 0);
  const day = (s: string | null) => (s ? new Date(`${s}T00:00:00`) : null);
  const cols: TableColumn<LedgerRowView>[] = [
    { key: 'client', header: 'Client', value: (r) => r.client, groupable: true },
    { key: 'invoice', header: 'Invoice', type: 'id', value: (r) => r.invoice },
    { key: 'date', header: 'Invoice date', type: 'date', value: (r) => day(r.date) },
    { key: 'bucket', header: 'Ageing', type: 'status', value: (r) => `${r.bucket} days`, statusTone: (v) => (String(v).startsWith('0') ? 'neutral' : String(v).startsWith('31') ? 'info' : 'warning') },
    { key: 'outstanding', header: 'Outstanding', type: 'money', value: (r) => Number(r.outstanding), total: 'sum' },
    { key: 'tds', header: 'TDS receivable', type: 'money', value: (r) => Number(r.tdsDeducted), total: 'sum' },
    { key: '26as', header: '26AS match', type: 'status', value: (r) => tdsMatchLive(r.tdsDeducted, r.tds26as), statusTone: (v) => (v === 'Matched' ? 'success' : String(v).startsWith('Mismatch') ? 'warning' : 'neutral') },
    { key: 'dispute', header: 'Dispute', value: (r) => r.dispute ?? '—' },
    { key: 'reminder', header: 'Next reminder', type: 'date', value: (r) => day(r.nextReminder) },
  ];
  return (
    <HireFrame active="Collections">
      <PageHeader title="Receivables and collections" description="Ageing per client, reminders to billing contacts on your schedule (Settings › Staffing desk), client-side TDS against 26AS and disputes by invoice." actions={live.state === 'ready' && live.canRecord ? <Button variant="primary" icon={Plus} onClick={() => setReceipt(true)}>Record receipt</Button> : undefined} />
      {live.state !== 'ready' ? (
        <DeskState state={live.state} what="receivables" title="Receivables" onRetry={live.onRetry} />
      ) : (
        <>
          <SummaryTiles
            label="Receivables"
            tiles={[
              { label: 'Outstanding', value: formatINR(total) },
              { label: 'Over 60 days', value: formatINR(over60), tone: over60 > 0 ? 'warning' : 'default', sub: total ? `${Math.round((over60 / total) * 100)}% of outstanding` : undefined },
              { label: 'TDS receivable', value: formatINR(rows.reduce((s, r) => s + Number(r.tdsDeducted), 0)), sub: `${rows.filter((r) => r.tds26as == null || Number(r.tds26as) !== Number(r.tdsDeducted)).length} not matched in 26AS` },
              { label: 'Open disputes', value: rows.filter((r) => r.dispute).length },
            ]}
          />
          {rows.length > 0 && <BarChart title="Ageing by client" description="Outstanding amount by days since invoice date" categories={clients} series={series} stacked orientation="horizontal" money xLabel="Client" />}
          <DataTable
            label="Receivables ledger"
            columns={cols}
            rows={rows}
            getRowId={(r) => r.invoiceId}
            defaultGroupBy="client"
            rowButtons={live.canRecord ? (r) => <Button size="sm" onClick={() => (setEdit(r), setIn26(r.tds26as != null ? Number(r.tds26as) : null), setDispute(r.dispute ?? ''))}>Update {r.invoice}</Button> : undefined}
            empty={<EmptyState title="Nothing outstanding." description="Every issued invoice is paid." />}
          />
        </>
      )}
      {receipt && <ReceiptSheet open onOpenChange={(o) => !o && setReceipt(false)} rows={rows} today={live.today} onSave={live.onReceipt} />}
      <ConfirmDialog
        open={Boolean(edit)}
        onOpenChange={(o) => !o && setEdit(null)}
        title={`Update ${edit?.invoice ?? ''}`}
        consequence="A dispute pauses the reminders for this invoice until you clear it."
        confirmLabel="Save"
        onConfirm={async () => {
          await live.onCollection(edit!.invoiceId, { tds26as: in26, dispute: dispute.trim() || null, version: edit!.version });
          toast?.toast({ tone: 'success', title: 'Saved' });
        }}
      >
        <FormField label="TDS seen in 26AS" optional helper={edit ? `TDS deducted by the client: ${formatINR(Number(edit.tdsDeducted))}` : undefined}>
          <CurrencyField allowPaise value={in26} onChange={setIn26} />
        </FormField>
        <FormField label="Dispute" optional helper="Empty clears it.">
          <TextArea rows={2} value={dispute} onChange={setDispute} maxLength={500} />
        </FormField>
      </ConfirmDialog>
    </HireFrame>
  );
}

/** HIR-19 Record receipt: amount, date, client TDS, and how it settles the client's invoices (adds up exactly). */
export function ReceiptSheet({ open, onOpenChange, rows, today, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; rows: LedgerRowView[]; today: Date; onSave: (input: ReceiptInput) => Promise<unknown> }) {
  const toast = useToastIfAny();
  const clients = Array.from(new Map(rows.map((r) => [r.clientId, r.client])).entries()).map(([value, label]) => ({ value, label }));
  const [client, setClient] = useState<string | null>(clients.length === 1 ? clients[0]!.value : null);
  const [amount, setAmount] = useState<number | null>(null);
  const [on, setOn] = useState<Date | null>(today);
  const [tds, setTds] = useState<number | null>(null);
  const [ref, setRef] = useState('');
  const [alloc, setAlloc] = useState<Record<string, number | null>>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const mine = rows.filter((r) => r.clientId === client);
  const settled = Math.round(mine.reduce((s, r) => s + (alloc[r.invoiceId] ?? 0), 0) * 100);
  const due = Math.round(((amount ?? 0) + (tds ?? 0)) * 100);
  const over = mine.find((r) => (alloc[r.invoiceId] ?? 0) > Number(r.outstanding) + 0.005);
  const section = mine[0]?.tdsSection;
  const save = async () => {
    setTried(true);
    if (!client) return focus('rc-client');
    if (amount == null || amount < 0 || due <= 0) return focus('rc-amount');
    if (!on) return focus('rc-on');
    if (over || settled !== due) return focus('rc-alloc');
    setBusy(true);
    setFailed(null);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      await onSave({ clientId: client, receivedOn: `${on.getFullYear()}-${pad(on.getMonth() + 1)}-${pad(on.getDate())}`, amount, tds: tds ?? 0, reference: ref.trim() || null, allocations: mine.filter((r) => (alloc[r.invoiceId] ?? 0) > 0).map((r) => ({ invoiceId: r.invoiceId, amount: alloc[r.invoiceId]! })) });
      toast?.toast({ tone: 'success', title: 'Receipt recorded' });
      onOpenChange(false);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="lg" title="Record receipt" subtitle={clients.find((c) => c.value === client)?.label ?? 'Receivables'} dirty footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save receipt</Button></>}>
      <div className="yx-hire-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <FormField id="rc-client" label="Client" required error={tried && !client ? 'Choose the client.' : null}>
          <Select value={client} onChange={(v) => (setClient(v), setAlloc({}))} options={clients} placeholder="Choose a client" />
        </FormField>
        <FieldRow>
          <FormField id="rc-amount" label="Amount received" required error={tried && (amount == null || due <= 0) ? 'Enter the amount received.' : null}>
            <CurrencyField allowPaise value={amount} onChange={setAmount} />
          </FormField>
          <FormField id="rc-on" label="Received on" required error={tried && !on ? 'Choose the day.' : null}>
            <DatePicker value={on} onChange={setOn} max={today} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="rc-tds" label={`TDS deducted by client${section ? ` (${section})` : ''}`} optional helper="Recorded as TDS receivable and matched to 26AS">
            <CurrencyField allowPaise value={tds} onChange={setTds} />
          </FormField>
          <FormField id="rc-ref" label="Reference" optional>
            <TextField value={ref} onChange={setRef} maxLength={60} />
          </FormField>
        </FieldRow>
        <Text weight="semibold">Allocate to invoices</Text>
        <ul className="yx-hire-list" id="rc-alloc" tabIndex={-1}>
          {mine.map((r) => (
            <li key={r.invoiceId} className="yx-hire-list__item">
              <div className="yx-hire-list__main">
                <Text weight="medium">{r.invoice}</Text>
                <Text size="sm" tone="secondary">Outstanding {formatINR(Number(r.outstanding))}</Text>
              </div>
              <FormField label={`Allocate to ${r.invoice}`} hideLabel>
                <CurrencyField allowPaise value={alloc[r.invoiceId] ?? null} onChange={(v) => setAlloc((x) => ({ ...x, [r.invoiceId]: v }))} />
              </FormField>
            </li>
          ))}
        </ul>
        <Text size="sm" tone={tried && (over || settled !== due) ? 'danger' : 'secondary'} aria-live="polite">
          {over ? `More than is outstanding on ${over.invoice}.` : settled === due ? 'Amount plus TDS is fully allocated. Anything left on an invoice stays outstanding.' : `Allocate ${formatINR((due - settled) / 100)} more to match the amount plus TDS.`}
        </Text>
      </div>
    </Drawer>
  );
}

/** GET /staffing/clients/:id/terms. */
export interface FeeTermsView {
  feeKind: 'percent' | 'fixed';
  feePct: string | null;
  feeAmount: string | null;
  taper: { fromMonth: number; pct: string }[];
  guaranteeDays: number;
  remedy: 'replace' | 'refund';
  version: number;
}
export interface FeeTermsInput {
  feeKind: 'percent' | 'fixed';
  feePct: string | null;
  feeAmount: number | null;
  taper: { fromMonth: number; pct: string }[];
  guaranteeDays: number;
  remedy: 'replace' | 'refund';
  version?: number;
}
export interface LiveFeeTerms {
  state: DeskLoad;
  onRetry: () => void;
  client: string;
  contract: string | null;
  canEdit: boolean;
  terms: FeeTermsView | null;
  onSave: (input: FeeTermsInput) => Promise<unknown>;
  onCancel: () => void;
}
const EXAMPLE_CTC = 18_00_000;

function LiveFeeTermsView({ live }: { live: LiveFeeTerms }) {
  const toast = useToastIfAny();
  const t0 = live.terms;
  const [kind, setKind] = useState<'percent' | 'fixed'>(t0?.feeKind ?? 'percent');
  const [pctV, setPct] = useState<number | null>(t0?.feePct != null ? Number(t0.feePct) : 8.33);
  const [amount, setAmount] = useState<number | null>(t0?.feeAmount != null ? Number(t0.feeAmount) : null);
  const [taper, setTaper] = useState<{ fromMonth: number | null; pct: number | null }[]>(t0?.taper.length ? t0.taper.map((x) => ({ fromMonth: x.fromMonth, pct: Number(x.pct) })) : [{ fromMonth: 0, pct: 8.33 }, { fromMonth: 3, pct: 6 }, { fromMonth: 6, pct: 4 }, { fromMonth: 12, pct: 0 }]);
  const [days, setDays] = useState<number | null>(t0?.guaranteeDays ?? 90);
  const [remedy, setRemedy] = useState<'replace' | 'refund'>(t0?.remedy ?? 'replace');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  if (live.state !== 'ready') return <HireFrame active="Clients"><DeskState state={live.state} what="these terms" title="The terms" onRetry={live.onRetry} /></HireFrame>;
  const ok2 = (n: number | null) => n != null && n >= 0 && n <= 100 && Math.round(n * 100) === n * 100;
  const taperBad = taper.some((r) => r.fromMonth == null || !ok2(r.pct)) || taper[0]?.fromMonth !== 0 || taper.some((r, i) => i > 0 && (r.fromMonth! <= taper[i - 1]!.fromMonth! || r.pct! > taper[i - 1]!.pct!));
  const feeBad = kind === 'percent' ? !ok2(pctV) || !pctV : amount == null || amount <= 0;
  const fee = kind === 'fixed' ? (amount ?? 0) : Math.round((EXAMPLE_CTC * (pctV ?? 0)) / 100);
  const tier = (m: number) => [...taper].filter((r) => r.fromMonth != null).sort((a, b) => b.fromMonth! - a.fromMonth!).find((r) => m >= r.fromMonth!);
  const outcome = guaranteeOutcome(fee, days ?? 0, 40, remedy);
  const save = async () => {
    setTried(true);
    if (feeBad) return focus('ft-fee');
    if (taperBad) return focus('ft-taper');
    if (days == null || days < 0 || days > 365) return focus('ft-days');
    setBusy(true);
    setFailed(null);
    try {
      await live.onSave({ feeKind: kind, feePct: kind === 'percent' ? pctV!.toFixed(2) : null, feeAmount: kind === 'fixed' ? amount : null, taper: taper.map((r) => ({ fromMonth: r.fromMonth!, pct: r.pct!.toFixed(2) })), guaranteeDays: days, remedy, version: t0?.version });
      toast?.toast({ tone: 'success', title: 'Contract terms saved' });
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const ro = !live.canEdit;
  return (
    <HireFrame active="Clients">
      <PageHeader title={`Fees and guarantee · ${live.client}`} description="Per client contract: permanent placement fee, contract-to-hire conversion fee and replacement guarantee." status={live.contract ? <Badge>{live.contract}</Badge> : undefined} />
      <div className="yx-hire-sheet">
        <div className="yx-hire-sheet__form">
          {failed && <InlineAlert tone="danger" title={failed} />}
          {ro && <InlineAlert tone="info">You can read these terms; account managers change them.</InlineAlert>}
          <Card title="Permanent placement fee">
            <Segment label="Fee model" value={kind} onChange={(v) => !ro && setKind(v)} options={[{ value: 'percent', label: '% of first-year CTC' }, { value: 'fixed', label: 'Fixed amount' }]} />
            <FormField id="ft-fee" label="Fee" required error={tried && feeBad ? (kind === 'percent' ? 'Enter a % up to 100, with at most 2 decimals.' : 'Enter the fee.') : null}>
              {kind === 'percent' ? <NumberField value={pctV} onChange={setPct} decimals suffix="% of CTC" disabled={ro} /> : <CurrencyField value={amount} onChange={setAmount} disabled={ro} />}
            </FormField>
          </Card>
          <Card title="Conversion fee (contract to hire)">
            <Text as="p" size="sm" tone="secondary">Tapers by months the contractor served before the client hires them. It starts at month 0 and only goes down.</Text>
            <HireTable
              id="ft-taper"
              label="Conversion fee taper, scrolls sideways on small screens"
              caption="Conversion fee taper"
              hideCaption
              head={['From month', 'Fee (% of CTC)', `On ${formatINR(EXAMPLE_CTC)}`]}
              rows={taper.map((r, i) => ({
                key: i,
                cells: [
                  <FormField key="m" label={`Row ${i + 1} from month`} hideLabel>
                    <NumberField value={r.fromMonth} onChange={(v) => setTaper((xs) => xs.map((x, j) => (j === i ? { ...x, fromMonth: v } : x)))} min={0} max={120} disabled={ro} />
                  </FormField>,
                  <FormField key="p" label={`Row ${i + 1} fee`} hideLabel>
                    <NumberField value={r.pct} onChange={(v) => setTaper((xs) => xs.map((x, j) => (j === i ? { ...x, pct: v } : x)))} decimals suffix="%" disabled={ro} />
                  </FormField>,
                  formatINR(Math.round((EXAMPLE_CTC * (r.pct ?? 0)) / 100)),
                ],
              }))}
            />
            {tried && taperBad && <Text size="sm" tone="danger">Start at month 0; each row starts later and its fee is no higher than the row before.</Text>}
          </Card>
          <Card title="Replacement guarantee">
            <FieldRow>
              <FormField id="ft-days" label="Guarantee period" required error={tried && (days == null || days < 0 || days > 365) ? 'Enter 0 to 365 days.' : null}>
                <NumberField value={days} onChange={setDays} suffix="days" disabled={ro} />
              </FormField>
              <FormField label="If the person leaves inside it">
                <Segment label="If the person leaves inside it" value={remedy} onChange={(v) => !ro && setRemedy(v)} options={[{ value: 'replace', label: 'Free replacement' }, { value: 'refund', label: 'Pro-rated credit note' }]} />
              </FormField>
            </FieldRow>
          </Card>
          {!ro && (
            <div className="yx-hire-actions">
              <Button onClick={live.onCancel}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={() => void save()}>Save contract terms</Button>
            </div>
          )}
        </div>
        <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="Example">
          <Text weight="semibold">Example</Text>
          <Text size="sm">Permanent hire at {formatINR(EXAMPLE_CTC)} CTC: fee {formatINR(fee)} + GST.</Text>
          <Text size="sm">Converted after 7 months: {formatINR(Math.round((EXAMPLE_CTC * (tier(7)?.pct ?? 0)) / 100))}.</Text>
          <Text size="sm">
            Leaves after 40 days: {outcome.text}
            {outcome.credit ? ` ${formatINR(outcome.credit)}.` : ''}
          </Text>
        </aside>
      </div>
    </HireFrame>
  );
}

/** Answer 490: vendor invoices, proposed from approved hours × the vendor rate (GET /staffing/vendor-bills row). */
export interface VendorBillView {
  id: string | null;
  status: 'waiting' | 'confirmed' | 'paid';
  vendorInvoiceNo: string | null;
  vendor: string;
  worker: string;
  placementId: string;
  month: string;
  hours: string;
  rate: string;
  net: string;
  gst: string;
  tdsSection: string;
  tds: string;
  /** Answer 496: the consultant invoice in payroll it became. */
  payroll?: { status: string; paidOn: string | null; tds: string | null } | null;
}
const BILL_WORD = { waiting: 'Waiting for vendor', confirmed: 'Vendor confirmed', paid: 'Paid' } as const;

export interface VendorInvoicesLive {
  rows: VendorBillView[];
  canEdit: boolean;
  onConfirm: (placementId: string, month: string, vendorInvoiceNo: string, invoiceDate?: string) => Promise<unknown>;
  onPaid: (id: string, paidOn: string) => Promise<unknown>;
  /** Answer 496: each vendor's consultant record in payroll (PAY 8), and the records to pick from. */
  vendors?: { id: string; name: string; consultantId: string | null }[];
  consultants?: { value: string; label: string }[];
  onLink?: (vendorId: string, consultantId: string | null) => Promise<unknown>;
}
export { VendorInvoices };

function LiveVendorInvoicesView({ rows, canEdit, onConfirm, onPaid, vendors, consultants, onLink }: VendorInvoicesLive) {
  const toast = useToastIfAny();
  const [invDate, setInvDate] = useState<Date | null>(new Date());
  const [confirming, setConfirming] = useState<VendorBillView | null>(null);
  const [paying, setPaying] = useState<VendorBillView | null>(null);
  const [no, setNo] = useState('');
  const [tried, setTried] = useState(false);
  const month = (m: string) => formatDate(new Date(`${m}-01T00:00:00`)).replace(/^\d+ /, '');
  return (
    <div className="yx-hire-stack">
      <InlineAlert tone="info">Proposed from client-approved hours × the vendor rate. GST is added when the vendor has a GSTIN; TDS follows the vendor&rsquo;s section (rates from the TDS rule set). A confirmed invoice goes to payroll as an invoice of the vendor&rsquo;s consultant record, where it is approved, paid with TDS and certified. Pay-when-paid is off.</InlineAlert>
      {vendors && onLink && canEdit && (
        <Card title="Vendors in payroll">
          <ul className="yx-hire-list">
            {vendors.map((v) => (
              <li key={v.id} className="yx-hire-list__item">
                <FormField label={`${v.name}: consultant record in payroll`}>
                  <Select value={v.consultantId} onChange={(c) => void onLink(v.id, c).then(() => toast?.toast({ tone: 'success', title: c ? `${v.name} linked to payroll` : `${v.name} unlinked` }))} options={consultants ?? []} placeholder="Not linked" clearable />
                </FormField>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {rows.length === 0 ? (
        <EmptyState compact title="No vendor invoices yet." description="They appear once the client approves a vendor worker's hours." />
      ) : (
        <ul className="yx-hire-list">
          {rows.map((r) => (
            <li key={r.id ?? `${r.placementId}-${r.month}`} className="yx-hire-list__item">
              <div className="yx-hire-list__main">
                <Text weight="medium">
                  {r.vendor} · {month(r.month)}
                </Text>
                <Text size="sm" tone="secondary">
                  {r.worker}: {r.hours} h × {formatINR(Number(r.rate))} = {formatINR(Number(r.net))} + GST {formatINR(Number(r.gst))} · TDS {r.tdsSection} {formatINR(Number(r.tds))}
                  {r.vendorInvoiceNo ? ` · vendor invoice ${r.vendorInvoiceNo}` : ''}
                </Text>
              </div>
              <Badge tone={r.payroll?.paidOn || r.status === 'paid' ? 'success' : r.status === 'confirmed' ? 'info' : 'warning'}>{r.payroll ? (r.payroll.paidOn ? `Paid in payroll on ${formatDate(new Date(`${r.payroll.paidOn}T00:00:00`))}` : `In payroll: ${r.payroll.status}`) : BILL_WORD[r.status]}</Badge>
              {canEdit && r.status === 'waiting' && <Button size="sm" onClick={() => (setConfirming(r), setNo(''), setTried(false), setInvDate(new Date()))}>Vendor confirmed</Button>}
              {canEdit && r.status === 'confirmed' && !r.payroll && <Button size="sm" onClick={() => setPaying(r)}>Mark paid</Button>}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(confirming)}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={`${confirming?.vendor ?? ''} confirmed ${confirming ? month(confirming.month) : ''}?`}
        consequence="The amounts are fixed with the vendor's invoice number."
        confirmLabel="Save"
        onConfirm={async () => {
          setTried(true);
          if (!no.trim()) return (focus('vb-no'), false);
          if (!invDate) return (focus('vb-date'), false);
          const pad = (n: number) => String(n).padStart(2, '0');
          await onConfirm(confirming!.placementId, confirming!.month, no.trim(), `${invDate.getFullYear()}-${pad(invDate.getMonth() + 1)}-${pad(invDate.getDate())}`);
          toast?.toast({ tone: 'success', title: 'Vendor invoice confirmed' });
        }}
      >
        <FormField id="vb-no" label="Vendor's invoice number" required error={tried && !no.trim() ? "Enter the vendor's invoice number." : null}>
          <TextField value={no} onChange={setNo} maxLength={40} />
        </FormField>
        <FormField id="vb-date" label="Vendor's invoice date" required error={tried && !invDate ? 'Choose the date on the vendor’s invoice.' : null}>
          <DatePicker value={invDate} onChange={setInvDate} max={new Date()} />
        </FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(paying)}
        onOpenChange={(o) => !o && setPaying(null)}
        title={`Mark ${paying?.vendorInvoiceNo ?? ''} paid today?`}
        confirmLabel="Mark paid"
        onConfirm={async () => {
          const t = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          await onPaid(paying!.id!, `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`);
          toast?.toast({ tone: 'success', title: 'Marked paid' });
        }}
      />
    </div>
  );
}

/** HIR-17/18: a placement's weekly hours (approved by the client in the portal, or recorded here for a client without it). */
export interface HoursRowView {
  id: string;
  weekStart: string;
  hours: string;
  overtime: string;
  status: 'waiting' | 'approved' | 'sent_back';
  note: string | null;
  invoiced: boolean;
  version: number;
  /** Answer 497: 'time' when the week came from the worker's approved Time timesheet (its hours in `timeHours`). */
  source?: 'manual' | 'time';
  timeHours?: string | null;
}
export interface LiveHours {
  canEnter: boolean;
  contacts: { id: string; name: string; role: string }[];
  rows: HoursRowView[];
  today: Date;
  onSave: (input: { weekStart: string; hours: string; overtime: string | null }) => Promise<unknown>;
  onApprove: (id: string, contactId: string, version: number) => Promise<unknown>;
}
const H_WORD = { waiting: 'Waiting for the client', approved: 'Approved', sent_back: 'Sent back' } as const;
const QTY = /^\d{1,3}(\.\d{1,2})?$/;

export function PlacementHours({ live }: { live: LiveHours }) {
  const toast = useToastIfAny();
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState<Date | null>(null);
  const [h, setH] = useState('');
  const [ot, setOt] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [approving, setApproving] = useState<HoursRowView | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  const isMonday = (x: Date | null) => Boolean(x && x.getDay() === 1);
  const save = async () => {
    setTried(true);
    if (!isMonday(week) || week! > live.today) return focus('ph-week');
    if (!QTY.test(h) || (Number(h) === 0 && !Number(ot))) return focus('ph-hours');
    if (ot && !QTY.test(ot)) return focus('ph-ot');
    setBusy(true);
    setFailed(null);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      await live.onSave({ weekStart: `${week!.getFullYear()}-${pad(week!.getMonth() + 1)}-${pad(week!.getDate())}`, hours: h, overtime: ot || null });
      toast?.toast({ tone: 'success', title: 'Hours sent to the client for approval' });
      setOpen(false);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Hours" actions={live.canEnter ? <Button size="sm" icon={Plus} onClick={() => (setOpen(true), setTried(false), setFailed(null), setWeek(null), setH(''), setOt(''))}>Enter a week</Button> : undefined}>
      {live.rows.length === 0 ? (
        <EmptyState compact title="No hours yet." description="Enter each week; the client approves it in the client portal." />
      ) : (
        <ul className="yx-hire-list">
          {live.rows.map((r) => (
            <li key={r.id} className="yx-hire-list__item">
              <div className="yx-hire-list__main">
                <Text weight="medium">Week of {formatDate(new Date(`${r.weekStart}T00:00:00`))}</Text>
                <Text size="sm" tone="secondary">
                  {r.hours} h{Number(r.overtime) ? ` + ${r.overtime} h overtime` : ''}
                  {r.note ? ` · client: ${r.note}` : ''}
                  {r.invoiced ? ' · invoiced' : ''}
                  {r.source === 'time' && r.timeHours && r.timeHours !== r.hours ? ` · the timesheet had ${r.timeHours} h` : ''}
                </Text>
              </div>
              {r.source === 'time' && <Badge tone="neutral">From the Time timesheet</Badge>}
              <Badge tone={r.status === 'approved' ? 'success' : r.status === 'sent_back' ? 'danger' : 'warning'}>{H_WORD[r.status]}</Badge>
              {live.canEnter && r.status === 'waiting' && live.contacts.length > 0 && <Button size="sm" onClick={() => (setApproving(r), setContact(live.contacts.length === 1 ? live.contacts[0]!.id : null), setTried(false))}>Record client approval</Button>}
            </li>
          ))}
        </ul>
      )}
      <Drawer open={open} onOpenChange={setOpen} title="Enter a week" subtitle="Hours" dirty footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Send to client</Button></>}>
        <div className="yx-hire-stack">
          {failed && <InlineAlert tone="danger" title={failed} />}
          <FormField id="ph-week" label="Week starting (Monday)" required error={tried && (!isMonday(week) || (week && week > live.today)) ? 'Choose the Monday of a week that has started.' : null}>
            <DatePicker value={week} onChange={setWeek} max={live.today} />
          </FormField>
          <FieldRow>
            <FormField id="ph-hours" label="Hours" required error={tried && (!QTY.test(h) || (Number(h) === 0 && !Number(ot))) ? 'Enter the hours, up to 2 decimals.' : null}>
              <TextField value={h} onChange={setH} inputMode="decimal" maxLength={6} />
            </FormField>
            <FormField id="ph-ot" label="Overtime hours" optional error={tried && ot && !QTY.test(ot) ? 'Up to 2 decimals.' : null}>
              <TextField value={ot} onChange={setOt} inputMode="decimal" maxLength={6} />
            </FormField>
          </FieldRow>
          <Text size="sm" tone="secondary">A week the client sent back can be entered again; an approved week cannot.</Text>
        </div>
      </Drawer>
      <ConfirmDialog
        open={Boolean(approving)}
        onOpenChange={(o) => !o && setApproving(null)}
        title="Record the client's approval?"
        consequence="For a client contact who approved outside the portal (by email). The hours become billable."
        confirmLabel="Record approval"
        onConfirm={async () => {
          setTried(true);
          if (!contact) return (focus('ph-contact'), false);
          await live.onApprove(approving!.id, contact, approving!.version);
          toast?.toast({ tone: 'success', title: 'Approval recorded' });
        }}
      >
        <FormField id="ph-contact" label="Who approved" required error={tried && !contact ? 'Choose the client contact.' : null}>
          <Select value={contact} onChange={setContact} options={live.contacts.map((c) => ({ value: c.id, label: `${c.name} · ${c.role}` }))} placeholder="Choose a contact" />
        </FormField>
      </ConfirmDialog>
    </Card>
  );
}

/** Answer 494: the placement fee when the client hires the person, and the guarantee when they leave. */
export function PlacementFee({ fee: f, canManage, person }: { fee: LivePlacementFee; canManage: boolean; person: string }) {
  const toast = useToastIfAny();
  const [open, setOpen] = useState<'hired' | 'left' | null>(null);
  const [on, setOn] = useState<Date | null>(f.today);
  const [ctc, setCtc] = useState<number | null>(null);
  const [series, setSeries] = useState<string | null>(f.series.length === 1 ? f.series[0]!.value : null);
  const [endIt, setEndIt] = useState(true);
  const [tried, setTried] = useState(false);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const begin = (w: 'hired' | 'left') => (setOpen(w), setTried(false), setOn(f.today));
  const G = { replace: 'Inside the guarantee: a free replacement is due', credit: 'Inside the guarantee: a pro-rated credit note was raised', none: 'Outside the guarantee: no replacement or credit' } as const;
  return (
    <Card title="Placement fee" actions={canManage && !f.hiredOn ? <Button size="sm" onClick={() => begin('hired')}>Client hired {person}</Button> : canManage && f.hiredOn && !f.leftOn ? <Button size="sm" onClick={() => begin('left')}>Left the client</Button> : undefined}>
      {!f.hiredOn ? (
        <Text size="sm" tone="secondary">{f.terms ? 'When the client hires this person, record it here: the fee invoice is drafted from the client’s fees and guarantee.' : 'Set this client’s fees and guarantee before a hire can be invoiced.'}</Text>
      ) : (
        <DescriptionList
          items={[
            { label: 'Hired by the client', value: `${formatDate(new Date(`${f.hiredOn}T00:00:00`))}${f.ctc ? ` · CTC ${formatINR(Number(f.ctc))}` : ''}` },
            { label: 'Fee invoice', value: f.feeInvoice ? <Button size="sm" onClick={() => f.onOpenInvoice(f.feeInvoice!.id)}>{f.feeInvoice.number ?? 'Draft'} · {formatINR(Number(f.feeInvoice.total))} · {f.feeInvoice.status}</Button> : 'No fee under the terms' },
            ...(f.leftOn ? [{ label: 'Left the client', value: `${formatDate(new Date(`${f.leftOn}T00:00:00`))}: ${f.guarantee ? G[f.guarantee] : ''}` }] : []),
          ]}
        />
      )}
      <ConfirmDialog
        open={open === 'hired'}
        onOpenChange={(o) => !o && setOpen(null)}
        title={`The client hired ${person}?`}
        consequence="A draft fee invoice is made from the client’s terms (the conversion taper for the months served, else the placement fee). Finance issues it."
        confirmLabel="Record the hire"
        onConfirm={async () => {
          setTried(true);
          if (!on || on > f.today) return (focus('pf-on'), false);
          if (ctc == null || ctc <= 0) return (focus('pf-ctc'), false);
          if (!series) return (focus('pf-series'), false);
          await f.onHired({ hiredOn: iso(on), ctc, seriesId: series, endPlacement: endIt });
          toast?.toast({ tone: 'success', title: 'Hire recorded; the fee invoice is drafted' });
        }}
      >
        <FormField id="pf-on" label="Hired on" required error={tried && (!on || on > f.today) ? 'Choose the hire date (not in the future).' : null}>
          <DatePicker value={on} onChange={setOn} max={f.today} />
        </FormField>
        <FormField id="pf-ctc" label="First-year CTC" required error={tried && (ctc == null || ctc <= 0) ? 'Enter the CTC.' : null}>
          <CurrencyField value={ctc} onChange={setCtc} />
        </FormField>
        <FormField id="pf-series" label="Invoice series" required error={tried && !series ? 'Choose the series.' : null}>
          <Select value={series} onChange={setSeries} options={f.series} placeholder="Choose a series" />
        </FormField>
        <Checkbox label="End the placement on the day before the hire" description="They leave your desk for the client’s payroll; no bench." checked={endIt} onChange={setEndIt} />
      </ConfirmDialog>
      <ConfirmDialog
        open={open === 'left'}
        onOpenChange={(o) => !o && setOpen(null)}
        title={`${person} left the client?`}
        consequence="Inside the guarantee, a free replacement is due or a pro-rated credit note is raised against the fee invoice (by the client’s terms). Outside it, nothing."
        confirmLabel="Record leaving"
        onConfirm={async () => {
          setTried(true);
          if (!on || on > f.today) return (focus('pl-left'), false);
          await f.onLeft(iso(on));
          toast?.toast({ tone: 'success', title: 'Leaving recorded' });
        }}
      >
        <FormField id="pl-left" label="Left on" required error={tried && (!on || on > f.today) ? 'Choose the leaving date (not in the future).' : null}>
          <DatePicker value={on} onChange={setOn} max={f.today} />
        </FormField>
      </ConfirmDialog>
    </Card>
  );
}
