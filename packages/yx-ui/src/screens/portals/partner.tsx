// Partner portal (P16): clients (PTR-01), compliance calendar (PTR-02), tasks (PTR-03), requests (PTR-04), templates (PTR-05),
// team (PTR-06), billing and commission (PTR-07), profile (PTR-08), client switcher and "Working in" banner (PTR-09), plus partner sign-in.
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Copy, KeyRound, LogOut, Plus, Upload } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, DescriptionList } from '../../components/shell';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { PasswordField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { Dialog, ConfirmDialog } from '../../components/overlay';
import { Drawer } from '../../components/drawer';
import { KanbanBoard, type KanbanColumn } from '../../components/kanban';
import { MenuItem } from '../../components/menu';
import { DataTable } from '../../components/table';
import { formatDate, formatINR } from '../../lib/format';
import { monthGrid, isSameDay } from '../../lib/dates';
import { commissionTotals, daysUntil, HEALTH_LABEL, healthBand, linkActivationBlock, transferCompletesOn } from './portals-logic';
import { DesktopFrame } from '../_kit/frames';
import { BlockNote, Fact, FactRow, OtpInput, TenantPortal } from './portals-kit';
import { FilteredTable, opts } from './list-kit';
import type { CalItem, PartnerClient, PartnerTask } from './partner-data';

export type PartnerPage = 'Clients' | 'Calendar' | 'Tasks' | 'Requests' | 'Templates' | 'Team' | 'Billing' | 'Profile';
const PAGES: PartnerPage[] = ['Clients', 'Calendar', 'Tasks', 'Requests', 'Templates', 'Team', 'Billing', 'Profile'];

export interface PartnerInfo {
  firm: string;
  accent: string;
  types: string[];
  gstin: string;
  pan: string;
  icai: string;
  region: string;
  verification: 'pending' | 'verified' | 'suspended';
  agreementVersion: string;
  agreementCurrent: boolean;
  user: { name: string; email: string; role: string };
}

/** Partner-branded shell (PortalFrame): partner name and accent, one tab row, no entity or period switcher; the client switcher instead. */
export function PartnerShell({ partner, page, children, admin = true }: { partner: PartnerInfo; page: PartnerPage; children: ReactNode; admin?: boolean }) {
  const pages = admin ? PAGES : PAGES.filter((p) => !['Templates', 'Team', 'Billing', 'Profile'].includes(p));
  return (
    <TenantPortal
      tenant={partner.firm}
      portal="Partner portal"
      accent={partner.accent}
      nav={pages.map((p) => ({ label: p, active: p === page }))}
      access={{ kind: 'note', text: `${partner.user.name} · ${partner.user.role} · SSO with MFA` }}
      footer={{ privacy: 'YukthiX privacy notice (G-05)', terms: 'Partner programme agreement (G-34)' }}
    >
      {partner.verification === 'suspended' && (
        <InlineAlert tone="danger" title="Your firm is suspended">
          All client access is paused. YukthiX partner team will contact you; clients can switch to direct billing meanwhile.
        </InlineAlert>
      )}
      {children}
    </TenantPortal>
  );
}

const PAY_TONE: Record<PartnerClient['payroll'], BadgeTone> = { 'Inputs pending': 'warning', Processing: 'info', 'Awaiting client approval': 'warning', Paid: 'success', Locked: 'neutral' };
const COMP_TONE: Record<PartnerClient['compliance'], BadgeTone> = { 'On track': 'success', 'Due this week': 'warning', Late: 'danger' };

/* ================================================================== */
/* Partner sign-in (SSO / password + MFA; never OTP-only)              */
/* ================================================================== */

export function PartnerSignInScreen({ partner, stage = 'start' }: { partner: PartnerInfo; stage?: 'start' | 'mfa' | 'sso-required' }) {
  const [otp, setOtp] = useState('');
  return (
    <TenantPortal tenant={partner.firm} portal="Partner portal" accent={partner.accent} narrow access={{ kind: 'note', text: 'Partner users only · MFA required' }} footer={{ privacy: 'YukthiX privacy notice (G-05)' }}>
      <div className="yx-signin">
        <div className="yx-signin__head">
          <h2 className="yx-signin__title">Sign in to the partner portal</h2>
          <p className="yx-signin__intro">Use your firm's identity. Sign-in with a one-time code alone is not allowed for partners.</p>
        </div>
        {stage === 'start' && (
          <>
            <Button variant="primary" fullWidth icon={KeyRound}>
              Sign in with passkey
            </Button>
            <Button fullWidth>Sign in with your firm's SSO</Button>
            <span className="yx-signin__or">or</span>
            <FormField label="Work email">
              <TextField type="email" autoComplete="username" />
            </FormField>
            <FormField label="Password">
              <PasswordField autoComplete="current-password" />
            </FormField>
            <Button fullWidth>Continue</Button>
            <a href="#" className="yx-signin__fine">
              Forgot password
            </a>
          </>
        )}
        {stage === 'mfa' && (
          <>
            <p className="yx-signin__sent">Enter the 6-digit code from your authenticator app.</p>
            <OtpInput value={otp} onChange={setOtp} label="Authenticator code" />
            <Button variant="primary" fullWidth disabled={otp.length < 6}>
              Verify
            </Button>
            <a href="#" className="yx-signin__fine">
              Use a recovery code
            </a>
          </>
        )}
        {stage === 'sso-required' && (
          <InlineAlert tone="warning" title="Your firm must use SSO or passkeys" actions={<Button size="sm">Sign in with SSO</Button>}>
            Firms with 10 or more users can't sign in with a password. Your partner admin set this up on 2 Sep 2026.
          </InlineAlert>
        )}
      </div>
    </TenantPortal>
  );
}

/* ================================================================== */
/* PTR-01 Clients                                                      */
/* ================================================================== */

// PTR-01
/** Clients with health, payroll status for the month, compliance, ownership; create a client tenant or request a link. */
export function PartnerClientsScreen({
  partner,
  clients,
  today,
  dialog,
  state = 'ready',
}: {
  partner: PartnerInfo;
  clients: PartnerClient[];
  today: Date;
  dialog?: 'create' | 'link' | 'transfer';
  state?: 'ready' | 'loading' | 'error';
}) {
  const [open, setOpen] = useState(dialog ?? null);
  const [owner, setOwner] = useState<string | undefined>('client');
  const block = linkActivationBlock({ verification: partner.verification, agreementCurrent: partner.agreementCurrent });
  return (
    <PartnerShell partner={partner} page="Clients">
      <div className="yx-ps-row" data-between>
        <section className="yx-ps-hero">
          <h1>Clients</h1>
          <p>September 2026 payroll and compliance across your clients.</p>
        </section>
        <div className="yx-ps-row">
          <Button icon={Copy}>Export status report</Button>
          <Button onClick={() => setOpen('link')}>Request a link</Button>
          <Button variant="primary" icon={Plus} onClick={() => setOpen('create')}>
            Create client
          </Button>
        </div>
      </div>
      {block && (
        <InlineAlert tone="warning" title="New links can't activate yet">
          {block}
        </InlineAlert>
      )}
      <FactRow label="This month">
        <Fact label="Clients" value={clients.length} />
        <Fact label="Payroll paid or locked" value={clients.filter((c) => c.payroll === 'Paid' || c.payroll === 'Locked').length} tone="success" />
        <Fact label="Compliance late" value={clients.filter((c) => c.compliance === 'Late').length} tone="danger" />
      </FactRow>
      <FilteredTable
        label="Clients"
        rows={clients}
        state={state}
        getRowId={(r) => r.id}
        searchText={(r) => r.name}
        fields={[
          { key: 'payroll', label: 'Payroll status', type: 'multi', options: opts(['Inputs pending', 'Processing', 'Awaiting client approval', 'Paid', 'Locked']) },
          { key: 'compliance', label: 'Compliance', type: 'multi', options: opts(['On track', 'Due this week', 'Late']) },
          { key: 'ownership', label: 'Ownership', type: 'multi', options: opts(['Client-owned', 'Partner-owned']) },
        ]}
        views={[{ id: 'all', name: 'All clients' }, { id: 'late', name: 'Needs attention', shared: true }]}
        viewFilters={{ late: [{ key: 'compliance', type: 'multi', values: ['Late', 'Due this week'] }] }}
        empty={<EmptyState title="No clients yet." description="Create a client tenant or ask an existing YukthiX customer to link with you." action={<Button variant="primary">Create client</Button>} />}
        columns={[
          { key: 'name', header: 'Client', value: (r) => r.name, width: 200 },
          { key: 'health', header: 'Health', type: 'status', value: (r) => `${r.health} · ${HEALTH_LABEL[healthBand(r.health)]}`, statusTone: (_v, r) => (healthBand(r.health) === 'healthy' ? 'success' : healthBand(r.health) === 'watch' ? 'warning' : 'danger'), width: 130 },
          { key: 'payroll', header: 'Payroll · Sep', type: 'status', value: (r) => r.payroll, statusTone: (v) => PAY_TONE[v as PartnerClient['payroll']], width: 190 },
          { key: 'blockers', header: 'Blockers', value: (r) => r.blockers.join(', ') || '—', width: 220 },
          { key: 'compliance', header: 'Compliance', type: 'status', value: (r) => r.compliance, statusTone: (v) => COMP_TONE[v as PartnerClient['compliance']], width: 130 },
          { key: 'ownership', header: 'Ownership', value: (r) => `${r.ownership} · ${r.relationship}`, width: 190 },
          { key: 'link', header: 'Link', value: (r) => r.link, width: 170 },
          { key: 'employees', header: 'Employees', type: 'number', value: (r) => r.employees, width: 100, total: 'sum' },
        ]}
        rowButtons={() => <Button size="sm">Enter</Button>}
        rowActions={(r) => (
          <>
            <MenuItem>View grant</MenuItem>
            {r.ownership === 'Partner-owned' && <MenuItem onSelect={() => setOpen('transfer')}>Transfer to client</MenuItem>}
          </>
        )}
      />
      <Drawer
        open={open === 'create'}
        onOpenChange={() => setOpen(null)}
        size="lg"
        title="Create a client tenant"
        subtitle="You sign up on the client's behalf. Live payroll stays blocked until the named client contact accepts."
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="primary" disabled={!!block}>
              Create and invite contact
            </Button>
          </>
        }
      >
        <div className="yx-ps-stack">
          <FieldRow>
            <FormField label="Legal name" required>
              <TextField defaultValue="Belur Handlooms Pvt Ltd" />
            </FormField>
            <FormField label="GSTIN" required>
              <TextField className="yx-ps-mono" defaultValue="29AABCB7781Q1Z3" />
            </FormField>
          </FieldRow>
          <FormField label="Ownership" required>
            <RadioGroup
              value={owner}
              onChange={setOwner}
              options={[
                { value: 'client', label: 'Client-owned (recommended)', description: 'The client admin can change or end your access at any time.' },
                { value: 'partner', label: 'Partner-owned', description: 'You own the tenant; the named contact always keeps audit-log view, full export and the right to ask for transfer.' },
              ]}
            />
          </FormField>
          <FieldRow>
            <FormField label="Client contact name" required>
              <TextField defaultValue="Girish Belur" />
            </FormField>
            <FormField label="Client contact email" required>
              <TextField type="email" defaultValue="girish@belurhandlooms.example" />
            </FormField>
          </FieldRow>
          <FormField label="Billing">
            <Select value="partner" onChange={() => undefined} options={[{ value: 'direct', label: 'Direct: YukthiX bills the client' }, { value: 'partner', label: 'Partner-billed: on your consolidated invoice' }]} />
          </FormField>
        </div>
      </Drawer>
      <Dialog
        open={open === 'link'}
        onOpenChange={() => setOpen(null)}
        size="md"
        title="Request a link with an existing customer"
        description="The client admin chooses what you can do and approves. Your partner admin then assigns users."
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="primary" disabled={!!block}>
              Send request
            </Button>
          </>
        }
      >
        <FormField label="Client admin email" required>
          <TextField type="email" />
        </FormField>
        <FormField label="Suggested access">
          <Select value="ops" onChange={() => undefined} options={[{ value: 'ops', label: 'Operates payroll' }, { value: 'adv', label: 'Advises compliance' }, { value: 'aud', label: 'Auditor read-only' }]} />
        </FormField>
      </Dialog>
      <ConfirmDialog
        open={open === 'transfer'}
        onOpenChange={() => setOpen(null)}
        title="Transfer Tumkur Agro Mills to the client?"
        consequence={`It completes on ${formatDate(transferCompletesOn(today))} after the 30-day notice. Finish or hand over open runs first. Billing moves to the client; commission stops from next month.`}
        confirmLabel="Start transfer"
        onConfirm={() => undefined}
      />
    </PartnerShell>
  );
}

/* ================================================================== */
/* PTR-02 Cross-client compliance calendar                             */
/* ================================================================== */

const CAL_TONE = { due: 'warning', late: 'danger', filed: 'success' } as const;

// PTR-02
/** Month calendar and list of PF, ESI, PT, LWF, TDS, 24Q / 26Q (138 / 140) and registers across clients; status feed only, no personal data. */
export function ComplianceCalendarScreen({ partner, items, today, view = 'calendar' }: { partner: PartnerInfo; items: CalItem[]; today: Date; view?: 'calendar' | 'list' }) {
  const [statute, setStatute] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState(view);
  const shown = items.filter((i) => (statute.length === 0 || statute.includes(i.statute)) && (!status || i.status === status));
  const weeks = monthGrid(today.getFullYear(), today.getMonth());
  const tone = (i: CalItem) => (i.status === 'due' && daysUntil(i.due, today) < 0 ? 'late' : i.status);
  return (
    <PartnerShell partner={partner} page="Calendar">
      <div className="yx-ps-row" data-between>
        <section className="yx-ps-hero">
          <h1>Compliance calendar</h1>
          <p>Statuses and due dates from each client's status feed. No employee data is shown here; open an item to enter the client.</p>
        </section>
        <div className="yx-ps-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={mode === 'calendar'} onClick={() => setMode('calendar')}>
            Month
          </button>
          <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
            List
          </button>
        </div>
      </div>
      <div className="yx-ps-row">
        <FormField label="Statute">
          <MultiSelect value={statute} onChange={setStatute} options={opts(['PF', 'ESI', 'PT', 'LWF', 'TDS', '24Q / 138', '26Q / 140', 'Registers'])} placeholder="All statutes" />
        </FormField>
        <FormField label="Status">
          <Select value={status} onChange={setStatus} clearable placeholder="All" options={[{ value: 'due', label: 'Due' }, { value: 'late', label: 'Late' }, { value: 'filed', label: 'Filed' }]} />
        </FormField>
        <FormField label="State">
          <Select value={null} onChange={() => undefined} clearable placeholder="All states" options={opts(['Karnataka', 'Tamil Nadu'])} />
        </FormField>
      </div>
      {shown.length === 0 && <EmptyState title="No results for these filters" action={<Button onClick={() => { setStatute([]); setStatus(null); }}>Clear filters</Button>} />}
      {shown.length > 0 && mode === 'calendar' && (
        <>
          <div className="yx-ps-cal" role="region" aria-label="September 2026 compliance calendar">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
              <div key={w} className="yx-ps-cal__head" aria-hidden="true">
                {w}
              </div>
            ))}
            {weeks.flat().map((day) => (
              <div key={day.toISOString()} className="yx-ps-cal__day" data-out={day.getMonth() !== today.getMonth() || undefined} data-today={isSameDay(day, today) || undefined}>
                <span className="yx-ps-cal__n">{formatDate(day)}</span>
                {shown
                  .filter((i) => isSameDay(i.due, day))
                  .map((i) => (
                    <button key={i.id} type="button" className="yx-ps-cal__item" data-tone={CAL_TONE[tone(i)]} title={`${i.client} · ${i.statute} · ${tone(i)}`}>
                      {i.statute} · {i.client} · {tone(i)}
                    </button>
                  ))}
              </div>
            ))}
          </div>
          <p className="yx-ps-muted">On a phone, use the list view.</p>
        </>
      )}
      {shown.length > 0 && mode === 'list' && (
        <Card>
          <ul className="yx-ps-list">
            {shown
              .slice()
              .sort((a, b) => a.due.getTime() - b.due.getTime())
              .map((i) => (
                <li key={i.id}>
                  <Badge tone={CAL_TONE[tone(i)]}>{tone(i) === 'late' ? 'Late' : tone(i) === 'filed' ? 'Filed' : 'Due'}</Badge>
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title">
                      {i.statute} · {i.client}
                    </span>
                    <span className="yx-ps-list__meta">
                      {i.state} · due {formatDate(i.due)}
                    </span>
                  </div>
                  <Button size="sm">Open in client</Button>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </PartnerShell>
  );
}

/* ================================================================== */
/* PTR-03 Tasks board                                                  */
/* ================================================================== */

// PTR-03
/** Tasks across clients by status (drag or "Move to"), with type, due, owner and SLA; linked to calendar items and payroll runs. */
export function PartnerTasksScreen({ partner, tasks }: { partner: PartnerInfo; tasks: PartnerTask[] }) {
  const cols: KanbanColumn[] = (['To do', 'In progress', 'Waiting for client', 'Done'] as const).map((s) => ({
    id: s,
    title: s,
    slaDays: 3,
    addable: s === 'To do',
    cards: tasks
      .filter((t) => t.status === s)
      .map((t) => ({ id: t.id, name: `${t.type} · ${t.client}`, facts: [`${t.owner} · due ${formatDate(t.due)}`, `${t.sla} · ${t.link}`], daysInStage: Math.max(0, -daysUntil(t.due, new Date(2026, 8, 29))) })),
  }));
  return (
    <PartnerShell partner={partner} page="Tasks">
      <section className="yx-ps-hero">
        <h1>Tasks</h1>
        <p>When a client link ends, its open tasks go back to the client; you keep only your own work records.</p>
      </section>
      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet." description="Tasks are created from calendar items and payroll runs, or added by hand." action={<Button variant="primary">Add task</Button>} />
      ) : (
        <KanbanBoard aria-label="Partner tasks" defaultColumns={cols} addCardLabel="Add task" noun="task" onAddCard={() => undefined} />
      )}
    </PartnerShell>
  );
}

/* ================================================================== */
/* PTR-04 Requests                                                     */
/* ================================================================== */

// PTR-04
/** Document requests to clients (payroll inputs, investment proofs) using P05 document requests. */
export function PartnerRequestsScreen({ partner, requests, today, composeOpen }: { partner: PartnerInfo; requests: { id: string; client: string; what: string; sent: Date; due: Date; status: string }[]; today: Date; composeOpen?: boolean }) {
  const [open, setOpen] = useState(!!composeOpen);
  return (
    <PartnerShell partner={partner} page="Requests">
      <div className="yx-ps-row" data-between>
        <section className="yx-ps-hero">
          <h1>Requests to clients</h1>
          <p>Inputs → you process → client approves → bank file → lock → payslips → returns.</p>
        </section>
        <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
          New request
        </Button>
      </div>
      <FilteredTable
        label="Requests"
        rows={requests}
        getRowId={(r) => r.id}
        searchText={(r) => r.client + r.what}
        fields={[{ key: 'client', label: 'Client', type: 'multi', options: opts(Array.from(new Set(requests.map((r) => r.client)))) }]}
        empty={<EmptyState title="No requests yet." action={<Button variant="primary">New request</Button>} />}
        columns={[
          { key: 'client', header: 'Client', value: (r) => r.client, width: 190 },
          { key: 'what', header: 'What you asked for', value: (r) => r.what, width: 300 },
          { key: 'sent', header: 'Sent', type: 'date', value: (r) => r.sent, width: 120 },
          { key: 'due', header: 'Due', type: 'date', value: (r) => r.due, width: 120 },
          { key: 'status', header: 'Status', type: 'status', value: (r) => (r.status === 'Waiting' && daysUntil(r.due, today) < 0 ? 'Overdue' : r.status), statusTone: (v) => (String(v).startsWith('Received') ? 'success' : v === 'Overdue' ? 'danger' : 'warning'), width: 190 },
        ]}
        rowButtons={(r) => (r.status !== 'Received' ? <Button size="sm">Remind</Button> : null)}
      />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Request documents from a client"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary">Send request</Button>
          </>
        }
      >
        <div className="yx-ps-stack">
          <FormField label="Client" required>
            <Select value="c2" onChange={() => undefined} options={[{ value: 'c2', label: 'Hosur Castings' }]} />
          </FormField>
          <FormField label="Request type" required>
            <Select value="inputs" onChange={() => undefined} options={[{ value: 'inputs', label: 'Payroll inputs' }, { value: 'proofs', label: 'Investment proofs (employees upload)' }, { value: 'other', label: 'Other documents' }]} />
          </FormField>
          <FormField label="Due by" required>
            <TextField defaultValue="3 Oct 2026" />
          </FormField>
          <FormField label="Note to the client">
            <TextArea rows={3} defaultValue="Please upload October attendance and overtime by 3 Oct so we can run payroll on 5 Oct." />
          </FormField>
        </div>
      </Drawer>
    </PartnerShell>
  );
}

/* ================================================================== */
/* PTR-05 Templates                                                    */
/* ================================================================== */

// PTR-05
/** Salary structures, letter templates and import mappings; "Copy into client" copies, never links (YX-PTR-09). */
export function PartnerTemplatesScreen({ partner, templates, copyOpen, clients }: { partner: PartnerInfo; templates: { id: string; kind: string; name: string; version: string; updated: Date; usedBy: number }[]; copyOpen?: boolean; clients: PartnerClient[] }) {
  const [open, setOpen] = useState(!!copyOpen);
  const [to, setTo] = useState<string[]>(['c1']);
  return (
    <PartnerShell partner={partner} page="Templates">
      <div className="yx-ps-row" data-between>
        <section className="yx-ps-hero">
          <h1>Templates</h1>
          <p>Copies are independent: editing a template never changes a client's copy, and copies stay with the client if the link ends.</p>
        </section>
        <Button variant="primary" icon={Plus}>
          New template
        </Button>
      </div>
      <FilteredTable
        label="Templates"
        rows={templates}
        getRowId={(r) => r.id}
        searchText={(r) => r.name}
        fields={[{ key: 'kind', label: 'Type', type: 'multi', options: opts(['Salary structure', 'Letter template', 'Import mapping']) }]}
        columns={[
          { key: 'name', header: 'Template', value: (r) => r.name, width: 320 },
          { key: 'kind', header: 'Type', value: (r) => r.kind, width: 160 },
          { key: 'version', header: 'Version', value: (r) => r.version, width: 90 },
          { key: 'updated', header: 'Updated', type: 'date', value: (r) => r.updated, width: 120 },
          { key: 'usedBy', header: 'Copied to clients', type: 'number', value: (r) => r.usedBy, width: 140 },
        ]}
        rowButtons={() => (
          <Button size="sm" icon={Copy} onClick={() => setOpen(true)}>
            Copy into client
          </Button>
        )}
      />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title="Copy “Manufacturing staff · Karnataka v3” into clients"
        description="Each client gets its own copy. Your later edits won't change it."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={to.length === 0}>
              Copy to {to.length} {to.length === 1 ? 'client' : 'clients'}
            </Button>
          </>
        }
      >
        <FormField label="Clients">
          <MultiSelect value={to} onChange={setTo} options={clients.filter((c) => c.relationship === 'Operates').map((c) => ({ value: c.id, label: c.name }))} />
        </FormField>
        <BlockNote>Kaveri Foods already has a structure with this name; the copy is added as “Manufacturing staff · Karnataka (partner copy)”.</BlockNote>
      </Dialog>
    </PartnerShell>
  );
}

/* ================================================================== */
/* PTR-06 Team                                                         */
/* ================================================================== */

type TeamRow = { id: string; name: string; email: string; roles: string; clients: string; mfa: string; status: string };

// PTR-06
/** Partner users, roles, client assignments and the MFA / SSO policy (SSO or passkeys required at 10+ users). */
export function PartnerTeamScreen({ partner, team, inviteOpen }: { partner: PartnerInfo; team: TeamRow[]; inviteOpen?: boolean }) {
  const [open, setOpen] = useState(!!inviteOpen);
  const [sso, setSso] = useState(true);
  return (
    <PartnerShell partner={partner} page="Team">
      <div className="yx-ps-row" data-between>
        <section className="yx-ps-hero">
          <h1>Team</h1>
          <p>Each person sees only the clients you assign. Remove leavers promptly; the agreement requires it.</p>
        </section>
        <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
          Invite user
        </Button>
      </div>
      <Card title="Sign-in policy">
        <div className="yx-ps-stack">
          <Switch checked disabled label="Multi-factor sign-in for everyone" description="Always on for partner users." />
          <Switch checked={sso} onChange={setSso} label="Require SSO or passkeys" description="Required once your firm has 10 or more users. You have 5." />
          <p className="yx-ps-muted">Sessions end after 30 minutes idle or 12 hours. Payroll release, bank files, filing and DSC signing ask for a fresh second factor.</p>
        </div>
      </Card>
      {team.some((t) => t.mfa === 'Not set up') && (
        <InlineAlert tone="warning" title="1 user hasn't set up multi-factor sign-in">
          Meghana Joshi can't open any client until she does.
        </InlineAlert>
      )}
      <DataTable
        label="Partner users"
        rows={team}
        getRowId={(r) => r.id}
        columns={[
          { key: 'name', header: 'Name', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.email }), width: 240 },
          { key: 'roles', header: 'Roles', value: (r) => r.roles, width: 240 },
          { key: 'clients', header: 'Clients', value: (r) => r.clients, width: 280 },
          { key: 'mfa', header: 'Second factor', type: 'status', value: (r) => r.mfa, statusTone: (v) => (v === 'Not set up' ? 'warning' : 'success'), width: 150 },
          { key: 'status', header: 'Status', value: (r) => r.status, width: 100 },
        ]}
        rowActions={() => (
          <>
            <MenuItem>Change roles</MenuItem>
            <MenuItem>Assign clients</MenuItem>
            <MenuItem destructive>Remove user</MenuItem>
          </>
        )}
      />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Invite a partner user"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary">Send invite</Button>
          </>
        }
      >
        <div className="yx-ps-stack">
          <FormField label="Name" required>
            <TextField />
          </FormField>
          <FormField label="Work email" required>
            <TextField type="email" />
          </FormField>
          <FormField label="Roles" required>
            <MultiSelect
              value={['ops']}
              onChange={() => undefined}
              options={[
                { value: 'admin', label: 'Partner admin' },
                { value: 'ops', label: 'Payroll bureau operator' },
                { value: 'filing', label: 'Compliance / filing operator' },
                { value: 'reviewer', label: 'Reviewer / partner (CA)' },
                { value: 'auditor', label: 'Read-only auditor' },
                { value: 'sales', label: 'Sales / onboarding (no HR data)' },
              ]}
            />
          </FormField>
          <FormField label="Clients" helper="Never all clients by default.">
            <MultiSelect value={[]} onChange={() => undefined} options={[{ value: 'c1', label: 'Kaveri Foods Pvt Ltd' }, { value: 'c2', label: 'Hosur Castings' }]} placeholder="Choose clients" />
          </FormField>
        </div>
      </Drawer>
    </PartnerShell>
  );
}

/* ================================================================== */
/* PTR-07 Billing & commission                                         */
/* ================================================================== */

// PTR-07
/** Billing mode per client, consolidated partner invoices, commission statements, sub-partner roll-up totals. Rates are placeholders. */
export function PartnerBillingScreen({ partner, clients, commission }: { partner: PartnerInfo; clients: PartnerClient[]; commission: { client: string; billed: number; ratePct: number; status: 'accrued' | 'approved' | 'paid'; month: string; invoice: string; payout: string }[] }) {
  const t = useMemo(() => commissionTotals(commission), [commission]);
  return (
    <PartnerShell partner={partner} page="Billing">
      <section className="yx-ps-hero">
        <h1>Billing and commission</h1>
        <p>A client never pays more than the published price. If you don't pay a consolidated invoice, clients can switch to direct billing and aren't suspended for it.</p>
      </section>
      <InlineAlert tone="info" title="Commission and discount rates shown are placeholders">
        Final rates will be published in the partner programme agreement.
      </InlineAlert>
      <FactRow label="Commission">
        <Fact label="Accrued (Sep)" value={formatINR(t.accrued)} />
        <Fact label="Approved, to be paid" value={formatINR(t.approved)} tone="warning" />
        <Fact label="Paid" value={formatINR(t.paid)} tone="success" />
        <Fact label="Sub-partner roll-up (Kaveri Payroll Bureau)" value={formatINR(8_210)} />
      </FactRow>
      <Card title="Billing mode per client">
        <ul className="yx-ps-list">
          {clients.map((c) => (
            <li key={c.id}>
              <span className="yx-ps-list__main">{c.name}</span>
              <Badge tone={c.billing === 'Direct' ? 'info' : 'neutral'}>{c.billing === 'Direct' ? 'Direct · you earn commission' : 'Partner-billed · on your invoice'}</Badge>
              <Button size="sm" icon={ArrowLeftRight}>
                Change
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Commission statement">
        <DataTable
          label="Commission statement"
          rows={t.lines}
          getRowId={(r) => r.invoice}
          columns={[
            { key: 'client', header: 'Client', value: (r) => r.client, width: 200 },
            { key: 'month', header: 'Month', value: (r) => r.month, width: 100 },
            { key: 'invoice', header: 'Client invoice', type: 'id', value: (r) => r.invoice, width: 150 },
            { key: 'billed', header: 'Billed', type: 'money', value: (r) => r.billed, width: 120 },
            { key: 'rate', header: 'Rate', value: (r) => `${r.ratePct}%`, width: 80 },
            { key: 'amount', header: 'Commission', type: 'money', value: (r) => r.amount, total: 'sum', width: 130 },
            { key: 'status', header: 'Status', type: 'status', value: (r) => r.status[0].toUpperCase() + r.status.slice(1), statusTone: (v) => (v === 'Paid' ? 'success' : v === 'Approved' ? 'info' : 'neutral'), width: 110 },
            { key: 'payout', header: 'Payout', type: 'id', value: (r) => r.payout || '—', width: 180 },
          ]}
        />
      </Card>
      <Card title="Consolidated invoices">
        <ul className="yx-ps-list">
          <li>
            <span className="yx-ps-list__main">YX/PTR/26-27/0031 · September 2026 · 4 clients · {formatINR(1_12_640)} + GST</span>
            <Badge tone="warning">Due 15 Oct 2026</Badge>
            <Button size="sm">Download</Button>
          </li>
        </ul>
        <DescriptionList items={[{ label: 'Billing GSTIN', value: partner.gstin, mono: true }, { label: 'Payment method', value: 'e-NACH, Sethu Bank ••4410' }]} />
      </Card>
    </PartnerShell>
  );
}

/* ================================================================== */
/* PTR-08 Profile                                                      */
/* ================================================================== */

// PTR-08
/** Firm details and types, verification, G-34 agreement, branding (with client consent on login pages), directory listing (G-35). */
export function PartnerProfileScreen({ partner }: { partner: PartnerInfo }) {
  const [listed, setListed] = useState(true);
  const block = linkActivationBlock(partner);
  return (
    <PartnerShell partner={partner} page="Profile">
      <section className="yx-ps-hero">
        <h1>Firm profile</h1>
      </section>
      <div className="yx-split">
        <div className="yx-split__main">
          <Card title="Firm details" footer={<Button variant="primary">Save changes</Button>}>
            <div className="yx-ps-stack">
              <FieldRow>
                <FormField label="Firm name">
                  <TextField defaultValue={partner.firm} />
                </FormField>
                <FormField label="Types">
                  <MultiSelect value={['ca', 'bureau']} onChange={() => undefined} options={[{ value: 'ca', label: 'Accountant / CA firm' }, { value: 'bureau', label: 'Payroll bureau' }, { value: 'reseller', label: 'Reseller / referral' }, { value: 'impl', label: 'Implementation partner' }]} />
                </FormField>
              </FieldRow>
              <DescriptionList columns={2} items={[{ label: 'GSTIN', value: partner.gstin, mono: true }, { label: 'PAN', value: partner.pan, mono: true }, { label: 'ICAI firm registration', value: partner.icai }, { label: 'Region', value: partner.region }]} />
              <p className="yx-ps-muted">Changing GSTIN, PAN or ICAI details sends your firm back to verification.</p>
            </div>
          </Card>
          <Card title="Branding">
            <div className="yx-ps-stack">
              <div className="yx-ps-row">
                <span className="yx-ps-brand" aria-hidden="true">
                  SR
                </span>
                <Button icon={Upload}>Upload logo</Button>
              </div>
              <Checkbox defaultChecked label="Show our logo and name on client login pages, where the client agrees" description="2 of 6 clients have agreed." />
            </div>
          </Card>
          <Card title="Directory listing (G-35)">
            <div className="yx-ps-stack">
              <Switch checked={listed} onChange={setListed} label="List us in the partner directory" description="Ordered by fit and verified reviews only, never by payment." />
              <FieldRow>
                <FormField label="Services">
                  <TextField defaultValue="Payroll, PF / ESI filing, TDS" />
                </FormField>
                <FormField label="Fee range">
                  <TextField defaultValue="₹60–120 per employee a month" />
                </FormField>
              </FieldRow>
              <FieldRow>
                <FormField label="States">
                  <TextField defaultValue="Karnataka, Tamil Nadu" />
                </FormField>
                <FormField label="Languages">
                  <TextField defaultValue="English, Kannada, Tamil" />
                </FormField>
              </FieldRow>
            </div>
          </Card>
        </div>
        <div className="yx-split__aside">
          <Card title="Verification">
            <Badge tone={partner.verification === 'verified' ? 'success' : partner.verification === 'pending' ? 'warning' : 'danger'}>{partner.verification[0].toUpperCase() + partner.verification.slice(1)}</Badge>
            {block && <BlockNote>{block}</BlockNote>}
          </Card>
          <Card title="Partner programme agreement">
            {partner.agreementCurrent ? (
              <p className="yx-ps-muted">{partner.agreementVersion} accepted on 26 Sep 2026 by Shalini Sridhar (authorised signatory).</p>
            ) : (
              <div className="yx-ps-stack">
                <InlineAlert tone="warning" title="A new version needs your acceptance">
                  G-34 v3 changes clawback rules. Until an authorised signatory accepts, new client links can't activate.
                </InlineAlert>
                <Button variant="primary">Read and accept v3</Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </PartnerShell>
  );
}

/* ================================================================== */
/* PTR-09 Client switcher + "Working in" banner                        */
/* ================================================================== */

// PTR-09
/** Switcher lists only assigned clients; inside a client a persistent banner shows client and partner; every action lands in the client's audit log. */
export function ClientSwitcherScreen({ partner, clients, state }: { partner: PartnerInfo; clients: PartnerClient[]; state: 'switcher' | 'working' | 'ended' | 'step-up' }) {
  const [q, setQ] = useState('');
  const [otp, setOtp] = useState('');
  const mine = clients.filter((c) => ['c1', 'c2', 'c3'].includes(c.id) && c.name.toLowerCase().includes(q.toLowerCase()));
  const c = clients[0];
  if (state === 'switcher')
    return (
      <PartnerShell partner={partner} page="Clients" admin={false}>
        <Dialog defaultOpen title="Switch client" description="Only clients you are assigned to are listed." size="md">
          <FormField label="Search clients" hideLabel>
            <TextField value={q} onChange={setQ} placeholder="Search clients" />
          </FormField>
          <ul className="yx-ps-list">
            {mine.map((x) => (
              <li key={x.id}>
                <div className="yx-ps-list__main">
                  <span className="yx-ps-list__title">{x.name}</span>
                  <span className="yx-ps-list__meta">As {x.grant.toLowerCase()} · payroll {x.payroll.toLowerCase()}</span>
                </div>
                <Button size="sm">Enter</Button>
              </li>
            ))}
            {mine.length === 0 && <li>No assigned client matches “{q}”.</li>}
          </ul>
        </Dialog>
      </PartnerShell>
    );
  return (
    <DesktopFrame area="pay" panelTitle="Pay" panel={[{ items: [{ label: 'Payroll', active: true }, { label: 'Compensation' }, { label: 'Tax centre' }, { label: 'Payments and files' }, { label: 'Reports' }] }]}>
      {state !== 'ended' && (
        <div className="yx-ps-working" role="status">
          <span>
            Working in: <strong>{c.name}</strong> as <strong>{partner.firm}</strong> · {c.grant}
          </span>
          <span>Every action is recorded in {c.name}'s audit log and in employees' “who accessed my data”.</span>
          <Button size="sm" icon={LogOut}>
            Leave client
          </Button>
          <Button size="sm" icon={ArrowLeftRight}>
            Switch client
          </Button>
        </div>
      )}
      <>
        {state === 'working' && (
          <>
            <section className="yx-ps-hero">
              <h1>Payroll · September 2026</h1>
              <p>Kaveri Foods Pvt Ltd · 248 employees · waiting for client approval</p>
            </section>
            <FactRow label="Run">
              <Fact label="Net pay" value={formatINR(1_12_48_600)} />
              <Fact label="Employees" value={248} />
              <Fact label="Variance vs August" value="+2.1%" />
            </FactRow>
            <Meter label="Readiness" value={100} max={100} warnAt={101} dangerAt={101} valueText="All checks passed" />
            <InlineAlert tone="info" title="Payroll approval stays with the client">
              {c.name} has not delegated approval, bank-file release, filing or DSC signing to you. Medical, POSH and biometric data are never included in your access.
            </InlineAlert>
          </>
        )}
        {state === 'step-up' && (
          <Card title="Confirm it's you to release the bank file">
            <div className="yx-ps-stack">
              <p className="yx-ps-p">{c.name} delegated bank-file release to your firm. Enter a code from your authenticator app (valid for this action, 15 minutes).</p>
              <OtpInput value={otp} onChange={setOtp} label="Authenticator code" />
              <Button variant="primary" disabled={otp.length < 6}>
                Verify and release
              </Button>
            </div>
          </Card>
        )}
        {state === 'ended' && (
          <InlineAlert tone="warning" title="Your access to Kaveri Foods Pvt Ltd has ended">
            The client withdrew the grant at 9:40 am, so this request was refused. Open tasks for this client were handed back to them.
          </InlineAlert>
        )}
      </>
    </DesktopFrame>
  );
}
