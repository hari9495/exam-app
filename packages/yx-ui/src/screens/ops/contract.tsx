// Contract labour screens (M13, P07 IN.CLRA / IN.OSH): CLB-01 contractors, CLB-02 contract workers, CLB-03 vendor compliance,
// CLB-04 CLRA registers & returns, CLB-05 convert worker to employee, CLB-06 client establishments, CLB-07 own licences,
// CLB-08 client compliance packs.
import { useEffect, useState } from 'react';
import { Download, FileText, Plus, Upload } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { DataTable, type TableColumn } from '../../components/table';
import { PlainTable } from '../../components/plain-table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { BarChart } from '../../components/charts';
import { Stepper } from '../../components/stepper';
import { formatDate, formatINR } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { Actions, CardGrid, CheckList, Facts, OpsDesk, PhotoPlaceholder, StatusTrail, useSay, type CheckRow } from './ops-kit';
import { Segment } from '../../components/segment';
import { hintText, useMinWage, type MinWageHint } from '../portals/contractor-portal';
import { FileButton } from '../pay/pay-kit';
import { deployBlocks, expiryTone } from './ops-rules';
import type { ListState } from './helpdesk';
import type { ContractWorker, Contractor, Licence, ProofStatus, WorkOrder } from './contract-data';
import { LivePage } from '../time/live/kit';
import { LiveContractors, LiveVendorCompliance, LiveWorkers, type ContractorsLive, type VendorComplianceLive, type WorkersLive } from './contract-live';

const multi = (key: string, label: string, values: string[]): FilterFieldDef => ({ key, label, type: 'multi', options: values.map((v) => ({ value: v, label: v })) });
function applyFilters<R>(rows: R[], filters: FilterValue[]): R[] {
  let r = rows;
  for (const f of filters) if (f.type === 'multi' && f.values.length) r = r.filter((x) => f.values.includes(String((x as unknown as Record<string, unknown>)[f.key])));
  return r;
}

/* =========================================================================================
 * CLB-01 · Contractors register (licence, registration, validity, renewal alerts)
 * ======================================================================================= */

/** Where a licence stands (CL-1 live: the server's state with the company's alert days; the design: expiryTone). */
/** A month as people read it: "2026-10" is "Oct 2026"; other text is kept (the design passes "Aug 2026"). */
const monthText = (m: string) => (/^\d{4}-\d{2}$/.test(m) ? new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : m);

export type LicenceStateName = 'pending' | 'rejected' | 'not-started' | 'valid' | 'expiring' | 'expired' | 'renewed';
const LICENCE_BADGE: Record<LicenceStateName, BadgeTone> = { pending: 'info', rejected: 'neutral', 'not-started': 'neutral', valid: 'success', expiring: 'warning', expired: 'danger', renewed: 'neutral' };
export function licenceBadge(l: Licence, today: Date): { tone: BadgeTone; text: string } {
  if (!l.state) return expiryTone(l.validTo, today);
  const left = Math.round((l.validTo.getTime() - today.getTime()) / 86_400_000);
  const text: Record<LicenceStateName, string> = {
    pending: l.renewalOf ? 'Renewal waiting for verification' : 'Waiting for verification',
    rejected: 'Rejected',
    'not-started': `Starts ${formatDate(l.validFrom ?? l.validTo)}`,
    valid: 'Valid',
    expiring: `Expires in ${left} days`,
    expired: `Expired ${-left} days ago`,
    renewed: 'Renewed',
  };
  return { tone: LICENCE_BADGE[l.state], text: text[l.state] };
}

export interface ContractorsScreenProps {
  contractors: Contractor[];
  establishments: { name: string; state: string; rc: string; family: string; workers: number; threshold: number; validTo: Date | null; licenceMax?: number; peak?: number }[];
  today: Date;
  state?: ListState;
  openId?: string | null;
  /** CL-1 states drawn first: the add / change sheets, and the reader without the contractor key to change. */
  sheet?: ContractorsSheet | null;
  readOnly?: boolean;
  /** CL-1 live (the page passes it; docs/yukthix/contract-labour-design-map.md). */
  live?: ContractorsLive;
}
export type ContractorsSheet = { kind: 'contact'; contractorId: string } | { kind: 'workorder'; contractorId: string; id: string | null } | { kind: 'contractor'; id: string | null } | { kind: 'licence'; contractorId: string } | { kind: 'renew'; licenceId: string } | { kind: 'reject'; licenceId: string };

/** What the view needs beyond the rows: the actions, each optional (the design shows them without doing anything). */
export interface ContractorsViewProps {
  contractors: Contractor[];
  establishments: ContractorsScreenProps['establishments'];
  today: Date;
  state: ListState;
  openId: string | null;
  sheet: ContractorsSheet | null;
  canManage: boolean;
  locations: { id: string; name: string; state: string }[];
  states: { code: string; name: string }[];
  onRetry?: () => void;
  onSaveContractor?: (id: string | null, input: ContractorInput) => Promise<unknown>;
  onAddLicence?: (contractorId: string, input: LicenceInput, file: File) => Promise<unknown>;
  onRenew?: (licenceId: string, input: RenewalInput, file: File) => Promise<unknown>;
  onVerify?: (licenceId: string) => Promise<unknown>;
  onReject?: (licenceId: string, reason: string) => Promise<unknown>;
  onOpenFile?: (licenceId: string) => void;
  onSaveWorkOrder?: (contractorId: string, id: string | null, input: WorkOrderInput) => Promise<unknown>;
  /** CL-3 (answer 631): give a contractor's contact the portal, or take it away. */
  onAddContact?: (contractorId: string, input: { name: string; email: string }) => Promise<unknown>;
  onRemoveContact?: (contractorId: string, contactId: string) => Promise<unknown>;
  /** "60, 30 and 7 days before expiry" from the company setting. */
  alertText?: string;
}

const SAMPLE_LOCATIONS = [
  { id: 'hosur', name: 'Hosur plant', state: 'IN-TN' },
  { id: 'blr', name: 'Bengaluru head office', state: 'IN-KA' },
];
const SAMPLE_STATES = [
  { code: 'IN-KA', name: 'Karnataka' },
  { code: 'IN-KL', name: 'Kerala' },
  { code: 'IN-TN', name: 'Tamil Nadu' },
];

export function ContractorsScreen({ contractors, establishments, today, state = 'ready', openId = null, sheet = null, readOnly = false, live }: ContractorsScreenProps) {
  if (live) return <LiveContractors live={live} />;
  return (
    <ContractorsView
      contractors={contractors}
      establishments={establishments}
      today={today}
      state={state}
      openId={openId}
      sheet={sheet}
      canManage={!readOnly}
      locations={SAMPLE_LOCATIONS}
      states={SAMPLE_STATES}
    />
  );
}

export function ContractorsView(p: ContractorsViewProps) {
  const { contractors, establishments, today, state, canManage } = p;
  const [open, setOpen] = useState<string | null>(p.openId);
  const [sheet, setSheet] = useState<ContractorsSheet | null>(p.sheet);
  const { say } = useSay();
  const c = contractors.find((x) => x.id === open);
  const licences = contractors.flatMap((x) => x.licences.map((l) => ({ l, c: x })));
  const expiring = contractors.filter((x) => x.licences.some((l) => (l.state ? l.state === 'expiring' || l.state === 'expired' : expiryTone(l.validTo, today).tone !== 'success')));
  const first = (x: Contractor) => x.licences.find((l) => l.status !== 'rejected' && l.state !== 'renewed') ?? x.licences[0];
  const cols: TableColumn<Contractor>[] = [
    { key: 'name', header: 'Contractor', value: (x) => x.name, width: 240, render: (x) => <span className="yx-ops-stack" data-gap="sm"><strong>{x.name}</strong><span className="yx-ops-muted">{x.work}</span></span> },
    { key: 'pan', header: 'PAN', type: 'id', value: (x) => x.pan, render: (x) => <span className="yx-ops-row"><span className="yx-ops-mono">{x.pan || '—'}</span>{x.pan ? x.panVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge> : null}</span>, width: 200 },
    { key: 'lic', header: 'Licence', value: (x) => first(x)?.no, render: (x) => <span className="yx-ops-mono">{first(x)?.no ?? 'No licence yet'}</span>, width: 190 },
    { key: 'val', header: 'Validity', value: (x) => first(x)?.validTo, render: (x) => { const l = first(x); if (!l) return <Badge tone="warning">Add a licence</Badge>; const t = licenceBadge(l, today); return <span className="yx-ops-stack" data-gap="sm"><span>{formatDate(l.validTo)}</span><Badge tone={t.tone}>{t.text}</Badge></span>; }, width: 180 },
    { key: 'use', header: 'Workers / licence max', value: (x) => first(x)?.active ?? 0, render: (x) => { const l = first(x); if (!l) return '—'; return l.active === undefined ? <span>Up to {l.max}</span> : <Meter label={`${x.name} workers`} value={l.active} max={l.max} warnAt={90} dangerAt={100} valueText={`${l.active} of ${l.max}`} />; }, width: 200 },
    { key: 'status', header: 'Status', type: 'status', value: (x) => x.status, statusTone: (v) => (v === 'Payment held' ? 'danger' : v === 'Active' ? 'success' : 'neutral') },
  ];
  const add = canManage ? <Button variant="primary" icon={Plus} onClick={() => setSheet({ kind: 'contractor', id: null })}>Add contractor</Button> : undefined;
  const renewalOf = (id: string) => licences.find((x) => x.l.id === id)?.l;
  const target = sheet && (sheet.kind === 'renew' || sheet.kind === 'reject') ? licences.find((x) => x.l.id === sheet.licenceId) : undefined;
  const editing = sheet?.kind === 'contractor' && sheet.id ? contractors.find((x) => x.id === sheet.id) : undefined;
  const run = (fn: (() => Promise<unknown>) | undefined, title: string) => (fn ? fn().then(() => say(title), (e: unknown) => say(errText(e))) : Promise.resolve(say(title)));
  return (
    <OpsDesk area="contract" active="Contractors">
      <PageHeader title="Contractors" description="Licensed contractors supplying workers to your sites. You are the principal employer." actions={add} />
      {expiring.length > 0 && <PageBanner tone="warning">{expiring.length} contractor licences expire soon or have expired. Deployments stop when a licence isn't valid.</PageBanner>}
      {establishments.length > 0 && (
        <CardGrid>
          {establishments.map((e) => (
            <article key={e.name} className="yx-ops-card" data-tone={e.workers >= e.threshold && e.rc === '—' ? 'danger' : undefined}>
              <div className="yx-ops-card__head">
                <h3 className="yx-ops-card__title">{e.name}</h3>
                <Badge tone={e.rc === '—' ? (e.workers >= e.threshold ? 'danger' : 'neutral') : 'success'}>{e.rc === '—' ? (e.workers >= e.threshold ? 'Registration needed' : 'Below threshold') : 'Registered'}</Badge>
              </div>
              <Facts items={[{ label: 'Contract workers', value: e.workers }, ...(e.licenceMax !== undefined ? [{ label: 'Licence maximum', value: e.licenceMax, tone: e.workers > e.licenceMax ? ('danger' as const) : undefined }] : []), ...(e.peak !== undefined ? [{ label: 'Highest in 12 months', value: e.peak }] : []), { label: 'Threshold (OSH Code, verify)', value: e.threshold }]} />
              <p className="yx-ops-muted">{e.rc === '—' ? `No registration needed below ${e.threshold} contract workers.` : `${e.family} registration ${e.rc}${e.validTo ? `, valid to ${formatDate(e.validTo)}` : ''}`}</p>
            </article>
          ))}
        </CardGrid>
      )}
      <DataTable label="Contractors" columns={cols} rows={state === 'empty' ? [] : contractors} getRowId={(x) => x.id} state={state === 'empty' ? 'ready' : state} onRetry={p.onRetry ?? (() => {})} empty={<EmptyState title="No contractors yet." description="Add a contractor with their licence to deploy workers." action={add} />} onRowClick={(x) => setOpen(x.id)} activeRowId={open} />
      <Drawer
        open={!!c && !sheet}
        onOpenChange={(o) => !o && setOpen(null)}
        size="lg"
        title={c?.name ?? ''}
        subtitle={c ? `${c.work}${c.contact ? ` · contact ${c.contact}` : ''}` : ''}
        footer={
          c && canManage ? (
            <>
              <Button onClick={() => setSheet({ kind: 'contact', contractorId: c.id })}>Invite to contractor login</Button>
              <Button onClick={() => setSheet({ kind: 'contractor', id: c.id })}>Change details</Button>
              <Button variant="primary" icon={Plus} onClick={() => setSheet({ kind: 'licence', contractorId: c.id })}>Add licence</Button>
            </>
          ) : undefined
        }
      >
        {c && (
          <div className="yx-ops-stack">
            <DescriptionList columns={2} items={[{ label: 'PAN', value: c.pan || '—', mono: true }, { label: 'GSTIN', value: c.gstin || '—', mono: true }, { label: 'PF code', value: c.pfCode || '—', mono: true }, { label: 'ESIC code', value: c.esicCode || '—', mono: true }, { label: 'LIN', value: c.lin || '—', mono: true }]} />
            <Card title="Contractor login">
              {(c.contacts ?? []).length === 0 ? (
                <p className="yx-ops-muted">No one from {c.name} can sign in yet. Invite a contact: they sign in with a one-time code to their email and see only {c.name}'s licences, work orders and workers.</p>
              ) : (
                <ul className="yx-ops-plain yx-ops-stack" data-gap="sm" aria-label="Contractor login">
                  {(c.contacts ?? []).map((x) => (
                    <li key={x.id} className="yx-ops-row" data-between>
                      <span className="yx-ops-stack" data-gap="sm">
                        <strong>{x.name}</strong>
                        <span className="yx-ops-muted">{x.email}</span>
                      </span>
                      <span className="yx-ops-row">
                        <Badge tone={x.portal === 'active' ? 'success' : 'info'}>{x.portal === 'active' ? 'Signed in' : 'Invited'}</Badge>
                        {canManage && <Button size="sm" onClick={() => void run(p.onRemoveContact && (() => p.onRemoveContact!(c.id, x.id)), `Access removed for ${x.name}`)}>Remove access</Button>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {c.licences.length === 0 && <EmptyState title="No licence yet." description="Add the contractor's licence for your establishment. Workers can be deployed only under a verified licence." />}
            {c.licences.map((l) => {
              const t = licenceBadge(l, today);
              const renews = l.renewalOf ? renewalOf(l.renewalOf) : undefined;
              const hasRenewal = licences.some((x) => x.l.renewalOf === l.id && x.l.status !== 'rejected');
              return (
                <Card key={l.id ?? l.no} title={renews ? `Renewal of licence ${renews.no}` : `Licence ${l.no}`} actions={<Badge tone={t.tone}>{t.text}</Badge>}>
                  <div className="yx-ops-stack">
                    <DescriptionList
                      items={[
                        ...(renews ? [{ label: 'Licence number', value: l.no, mono: true }] : []),
                        { label: 'Establishment', value: l.establishment },
                        { label: 'Scope', value: `${l.scope} (${l.states.join(', ')})` },
                        ...(l.issuedBy ? [{ label: 'Issued by', value: l.issuedBy }] : []),
                        { label: 'Maximum workers', value: l.max },
                        ...(l.validFrom ? [{ label: 'Valid from', value: formatDate(l.validFrom) }] : []),
                        { label: 'Valid to', value: formatDate(l.validTo) },
                        { label: 'Renewal alerts', value: p.alertText ?? '60, 30 and 7 days before expiry' },
                        ...(l.decided ? [{ label: l.status === 'rejected' ? 'Rejected by' : 'Verified by', value: `${l.decided.by}, ${formatDate(new Date(l.decided.at))}` }] : []),
                        ...(l.rejectReason ? [{ label: 'Reason', value: l.rejectReason }] : []),
                      ]}
                    />
                    {l.block && l.status === 'verified' && l.state !== 'renewed' && <InlineAlert tone="danger" title="Deployment blocked">{l.block}</InlineAlert>}
                    {l.status === 'pending' && <InlineAlert tone="info" title="Not counted yet">Check the copy against the original, then verify. Until then the licence does not allow deployment.</InlineAlert>}
                    {(canManage || l.fileName) && (
                      <Actions>
                        {l.fileName && <Button size="sm" icon={Download} onClick={() => l.id && p.onOpenFile?.(l.id)}>Licence copy</Button>}
                        {canManage && l.status === 'pending' && l.id && (
                          <>
                            <Button size="sm" onClick={() => setSheet({ kind: 'reject', licenceId: l.id! })}>Reject</Button>
                            <Button size="sm" variant="primary" onClick={() => void run(p.onVerify && (() => p.onVerify!(l.id!)), 'Licence verified')}>Verify</Button>
                          </>
                        )}
                        {canManage && l.status === 'verified' && !hasRenewal && l.state !== 'renewed' && l.id && <Button size="sm" icon={Upload} onClick={() => setSheet({ kind: 'renew', licenceId: l.id! })}>Add renewal</Button>}
                      </Actions>
                    )}
                  </div>
                </Card>
              );
            })}
            {(c.workOrders ?? []).map((w) => (
              <Card key={w.id} title={`Work order ${w.number}`} actions={w.active !== undefined && w.active > w.headcount ? <Badge tone="warning">Over headcount</Badge> : undefined}>
                <div className="yx-ops-stack">
                  <DescriptionList items={[{ label: 'Sites', value: w.sites.map((x) => x.name).join(', ') }, { label: 'Headcount', value: w.active !== undefined ? `${w.active} of ${w.headcount} deployed or waiting` : w.headcount }, { label: 'Period', value: `${formatDate(w.from)} to ${formatDate(w.to)}` }]} />
                  {canManage && (
                    <Actions>
                      <Button size="sm" onClick={() => setSheet({ kind: 'workorder', contractorId: c.id, id: w.id })}>Change work order</Button>
                    </Actions>
                  )}
                </div>
              </Card>
            ))}
            {canManage && (
              <Actions>
                <Button icon={Plus} onClick={() => setSheet({ kind: 'workorder', contractorId: c.id, id: null })}>Add work order</Button>
              </Actions>
            )}
          </div>
        )}
      </Drawer>
      {sheet?.kind === 'contractor' && (
        <ContractorSheet
          key={sheet.id ?? 'new'}
          initial={editing ? { name: editing.name, work: editing.work, contactEmail: editing.contactEmail ?? null, pan: editing.pan || null, gstin: editing.gstin && editing.gstin !== '—' ? editing.gstin : null, pfCode: editing.pfCode || null, esicCode: editing.esicCode || null, lin: editing.lin && editing.lin !== '—' ? editing.lin : null, active: editing.status !== 'Inactive' } : null}
          onClose={() => setSheet(null)}
          onSave={(input) => (p.onSaveContractor ? p.onSaveContractor(sheet.id, input) : Promise.resolve())}
        />
      )}
      {sheet?.kind === 'licence' && (
        <LicenceSheet mode="add" locations={p.locations} states={p.states} contractor={contractors.find((x) => x.id === sheet.contractorId)?.name ?? ''} onClose={() => setSheet(null)} onSave={(input, file) => (p.onAddLicence ? p.onAddLicence(sheet.contractorId, input, file) : Promise.resolve())} />
      )}
      {sheet?.kind === 'renew' && target && (
        <LicenceSheet mode="renew" current={target.l} locations={p.locations} states={p.states} contractor={target.c.name} onClose={() => setSheet(null)} onSave={(input, file) => (p.onRenew ? p.onRenew(sheet.licenceId, { licenceNo: input.licenceNo, issuedBy: input.issuedBy, maxWorkers: input.maxWorkers, validFrom: input.validFrom, validTo: input.validTo }, file) : Promise.resolve())} />
      )}
      {sheet?.kind === 'contact' && <ContactDialog contractor={contractors.find((x) => x.id === sheet.contractorId)?.name ?? ''} onClose={() => setSheet(null)} onSave={(input) => (p.onAddContact ? p.onAddContact(sheet.contractorId, input) : Promise.resolve())} />}
      {sheet?.kind === 'workorder' && (
        <WorkOrderSheet
          key={sheet.id ?? 'new'}
          contractor={contractors.find((x) => x.id === sheet.contractorId)?.name ?? ''}
          initial={contractors.find((x) => x.id === sheet.contractorId)?.workOrders?.find((w) => w.id === sheet.id) ?? null}
          locations={p.locations}
          onClose={() => setSheet(null)}
          onSave={(input) => (p.onSaveWorkOrder ? p.onSaveWorkOrder(sheet.contractorId, sheet.id, input) : Promise.resolve())}
        />
      )}
      {sheet?.kind === 'reject' && target && <RejectLicenceDialog licence={target.l} onClose={() => setSheet(null)} onReject={(reason) => (p.onReject ? p.onReject(sheet.licenceId, reason) : Promise.resolve())} />}
    </OpsDesk>
  );
}

/* ---------------- CL-1 sheets: contractor, licence or renewal, reject ---------------- */

export interface ContractorInput {
  name: string;
  work: string;
  contactEmail: string | null;
  pan: string | null;
  gstin: string | null;
  pfCode: string | null;
  esicCode: string | null;
  lin: string | null;
  active: boolean;
}
export interface LicenceInput {
  locationId: string;
  licenceNo: string;
  scope: string;
  /** Answer 731: optional. */
  issuedBy: string | null;
  states: string[];
  maxWorkers: number;
  validFrom: string;
  validTo: string;
}
export type RenewalInput = Pick<LicenceInput, 'licenceNo' | 'issuedBy' | 'maxWorkers' | 'validFrom' | 'validTo'>;

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PF_RE = /^[A-Z]{5}[0-9]{7}([0-9]{3})?$/;
const ESIC_RE = /^[0-9]{17}$/;
const LIN_RE = /^[0-9][0-9-]{8,11}[0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const focusOn = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);
const isoDay = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not save. Try again.');

/** Add or change a contractor: the vendor record with its statutory codes (answer 623). */
export function ContractorSheet({ initial, onClose, onSave }: { initial: ContractorInput | null; onClose: () => void; onSave: (input: ContractorInput) => Promise<unknown> }) {
  const { say } = useSay();
  const [f, setF] = useState<ContractorInput>(initial ?? { name: '', work: '', contactEmail: null, pan: null, gstin: null, pfCode: null, esicCode: null, lin: null, active: true });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const set = (x: Partial<ContractorInput>) => setF((o) => ({ ...o, ...x }));
  const bad = {
    name: !f.name.trim() ? 'Enter the contractor’s name.' : null,
    work: !f.work.trim() ? 'Say what work they do, like Housekeeping.' : null,
    email: f.contactEmail && !EMAIL_RE.test(f.contactEmail) ? 'Enter an email like ops@contractor.in.' : null,
    pan: f.pan && !PAN_RE.test(f.pan) ? 'A PAN has 10 characters, like ABCDE1234F.' : null,
    gstin: f.gstin && !GSTIN_RE.test(f.gstin) ? 'A GSTIN has 15 characters, like 33ABCDE1234F1Z5.' : f.gstin && f.pan && f.gstin.slice(2, 12) !== f.pan ? 'The GSTIN does not carry this PAN.' : null,
    pf: f.pfCode && !PF_RE.test(f.pfCode) ? 'A PF code looks like TNMAS0012345000.' : null,
    esic: f.esicCode && !ESIC_RE.test(f.esicCode) ? 'An ESIC code has 17 digits.' : null,
    lin: f.lin && !LIN_RE.test(f.lin) ? 'A LIN has 10 digits.' : null,
  };
  const save = () => {
    setTried(true);
    const order: [keyof typeof bad, string][] = [['name', 'cl-name'], ['work', 'cl-work'], ['email', 'cl-email'], ['pan', 'cl-pan'], ['gstin', 'cl-gstin'], ['pf', 'cl-pf'], ['esic', 'cl-esic'], ['lin', 'cl-lin']];
    const miss = order.find(([k]) => bad[k]);
    if (miss) return focusOn(miss[1]);
    setBusy(true);
    setFailed(null);
    onSave({ ...f, name: f.name.trim(), work: f.work.trim(), contactEmail: f.contactEmail?.trim() || null })
      .then(() => (say(initial ? 'Contractor saved' : 'Contractor added'), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  const err = (k: keyof typeof bad) => (tried ? bad[k] : null);
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} size="lg" title={initial ? `Change ${initial.name}` : 'Add contractor'} subtitle="Contractors" dirty notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{initial ? 'Save contractor' : 'Add contractor'}</Button></>}>
      <div className="yx-ops-stack">
        <p className="yx-ops-muted">A vendor you already have (a staffing vendor or agency) with the same name becomes a contractor too: one record.</p>
        <FieldRow>
          <FormField id="cl-name" label="Contractor name" required error={err('name')}>
            <TextField value={f.name} onChange={(v) => set({ name: v })} maxLength={200} />
          </FormField>
          <FormField id="cl-work" label="Kind of work" required error={err('work')}>
            <TextField value={f.work} onChange={(v) => set({ work: v })} maxLength={200} />
          </FormField>
        </FieldRow>
        <FormField id="cl-email" label="Contact email" optional error={err('email')}>
          <TextField value={f.contactEmail ?? ''} onChange={(v) => set({ contactEmail: v })} maxLength={254} />
        </FormField>
        <FieldRow>
          <FormField id="cl-pan" label="PAN" optional error={err('pan')}>
            <TextField value={f.pan ?? ''} onChange={(v) => set({ pan: v.toUpperCase() || null })} maxLength={10} />
          </FormField>
          <FormField id="cl-gstin" label="GSTIN" optional helper="It carries the PAN." error={err('gstin')}>
            <TextField value={f.gstin ?? ''} onChange={(v) => set({ gstin: v.toUpperCase() || null })} maxLength={15} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="cl-pf" label="PF code" optional error={err('pf')}>
            <TextField value={f.pfCode ?? ''} onChange={(v) => set({ pfCode: v.toUpperCase() || null })} maxLength={15} />
          </FormField>
          <FormField id="cl-esic" label="ESIC code" optional error={err('esic')}>
            <TextField value={f.esicCode ?? ''} onChange={(v) => set({ esicCode: v || null })} maxLength={17} />
          </FormField>
        </FieldRow>
        <FormField id="cl-lin" label="LIN (Shram Suvidha)" optional error={err('lin')}>
          <TextField value={f.lin ?? ''} onChange={(v) => set({ lin: v || null })} maxLength={13} />
        </FormField>
        {initial && <Checkbox label="Active" description="An inactive contractor gets no licence alerts." checked={f.active} onChange={(v) => set({ active: v })} />}
      </div>
    </Drawer>
  );
}

/** A licence for one of our establishments, or its renewal (answer 627: it counts once verified). */
export function LicenceSheet({ mode, current, contractor, locations, states, onClose, onSave }: { mode: 'add' | 'renew'; current?: Licence; contractor: string; locations: { id: string; name: string; state: string }[]; states: { code: string; name: string }[]; onClose: () => void; onSave: (input: LicenceInput, file: File) => Promise<unknown> }) {
  const { say } = useSay();
  const [loc, setLoc] = useState<string | null>(current?.locationId ?? null);
  const [no, setNo] = useState(mode === 'renew' ? (current?.no ?? '') : '');
  const [scope, setScope] = useState(current?.scope ?? '');
  const [covered, setCovered] = useState<string[]>(current?.stateCodes ?? []);
  const [max, setMax] = useState<number | null>(current?.max ?? null);
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [office, setOffice] = useState(current?.issuedBy ?? '');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const site = locations.find((l) => l.id === loc);
  const pickSite = (id: string | null) => {
    setLoc(id);
    const st = locations.find((l) => l.id === id)?.state;
    if (st && !covered.includes(st)) setCovered((c) => [...c, st]);
  };
  const bad = {
    loc: mode === 'add' && !loc ? 'Choose the establishment.' : null,
    no: !no.trim() ? 'Enter the licence number.' : null,
    scope: mode === 'add' && !scope.trim() ? 'Say what work the licence covers.' : null,
    states: mode === 'add' && !covered.length ? 'Choose the states the licence covers.' : mode === 'add' && site && !covered.includes(site.state) ? `The licence must cover ${site.name}’s state.` : null,
    max: !max || max < 1 ? 'Enter the maximum number of workers.' : null,
    from: !from ? 'Choose the day the licence starts.' : current && mode === 'renew' && current.validFrom && from <= current.validFrom ? 'The renewal starts after the current licence started.' : null,
    to: !to ? 'Choose the day the licence ends.' : from && to < from ? 'The licence ends before it starts.' : current && mode === 'renew' && to <= current.validTo ? `The renewal must end after ${formatDate(current.validTo)}.` : null,
    file: !file ? 'Attach a copy of the licence.' : null,
  };
  const save = () => {
    setTried(true);
    const order: [keyof typeof bad, string][] = [['loc', 'lc-loc'], ['no', 'lc-no'], ['scope', 'lc-scope'], ['states', 'lc-states'], ['max', 'lc-max'], ['from', 'lc-from'], ['to', 'lc-to'], ['file', 'lc-file']];
    const miss = order.find(([k]) => bad[k]);
    if (miss) return focusOn(miss[1]);
    setBusy(true);
    setFailed(null);
    onSave({ locationId: loc ?? '', licenceNo: no.trim(), scope: scope.trim(), issuedBy: office.trim() || null, states: covered, maxWorkers: max!, validFrom: isoDay(from), validTo: isoDay(to) }, file!)
      .then(() => (say(mode === 'renew' ? 'Renewal added, waiting for verification' : 'Licence added, waiting for verification'), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  const err = (k: keyof typeof bad) => (tried ? bad[k] : null);
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} size="lg" title={mode === 'renew' ? `Renew licence ${current?.no ?? ''}` : 'Add licence'} subtitle={contractor} dirty notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{mode === 'renew' ? 'Add renewal' : 'Add licence'}</Button></>}>
      <div className="yx-ops-stack">
        <InlineAlert tone="info" title="Verified before it counts">Someone with the contractor key checks the copy and verifies it. Until then it does not allow deployment.</InlineAlert>
        {mode === 'renew' && current ? (
          <DescriptionList columns={2} items={[{ label: 'Establishment', value: current.establishment }, { label: 'Scope', value: `${current.scope} (${current.states.join(', ')})` }, { label: 'Current licence ends', value: formatDate(current.validTo) }, { label: 'Maximum workers now', value: current.max }]} />
        ) : (
          <>
            <FormField id="lc-loc" label="Establishment" required error={err('loc')} helper="Your site where the contractor's workers work.">
              <Select options={locations.map((l) => ({ value: l.id, label: l.name }))} value={loc} onChange={(v) => pickSite(v)} />
            </FormField>
            <FormField id="lc-scope" label="Work covered" required error={err('scope')}>
              <TextField value={scope} onChange={setScope} maxLength={200} />
            </FormField>
            <FormField id="lc-states" label="States covered" required error={err('states')} helper="Under the OSH Code one licence may cover several states.">
              <MultiSelect options={states.map((s) => ({ value: s.code, label: s.name }))} value={covered} onChange={setCovered} searchable />
            </FormField>
          </>
        )}
        <FieldRow>
          <FormField id="lc-no" label="Licence number" required error={err('no')}>
            <TextField value={no} onChange={setNo} maxLength={40} />
          </FormField>
          <FormField id="lc-max" label="Maximum workers" required error={err('max')}>
            <NumberField value={max} onChange={setMax} min={1} max={100000} />
          </FormField>
        </FieldRow>
        <FormField id="lc-office" label="Issuing office" optional helper="As written on the licence, e.g. Assistant Commissioner of Labour, Hosur.">
          <TextField value={office} onChange={setOffice} maxLength={200} />
        </FormField>
        <FieldRow>
          <FormField id="lc-from" label="Valid from" required error={err('from')}>
            <DatePicker value={from} onChange={setFrom} />
          </FormField>
          <FormField id="lc-to" label="Valid to" required error={err('to')}>
            <DatePicker value={to} onChange={setTo} />
          </FormField>
        </FieldRow>
        <FormField id="lc-file" label="Licence copy" required error={err('file')} helper="PDF, JPG or PNG, up to 10 MB.">
          <FileUpload id="lc-file" multiple={false} accept={['.pdf', '.jpg', '.png']} upload={async (x) => void setFile(x)} onItemsChange={(items) => !items.length && setFile(null)} />
        </FormField>
      </div>
    </Drawer>
  );
}

/** CL-3 (answer 631): invite a contractor's contact to the portal. */
function ContactDialog({ contractor, onClose, onSave }: { contractor: string; onClose: () => void; onSave: (input: { name: string; email: string }) => Promise<unknown> }) {
  const { say } = useSay();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = { name: !name.trim() ? 'Enter the contact’s name.' : null, email: !EMAIL_RE.test(email.trim()) ? 'Enter an email like ops@contractor.in.' : null };
  const go = () => {
    setTried(true);
    if (bad.name) return focusOn('ct-name');
    if (bad.email) return focusOn('ct-email');
    setBusy(true);
    setFailed(null);
    onSave({ name: name.trim(), email: email.trim() })
      .then(() => (say(`Invited ${name.trim()}`), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="md" title="Invite to contractor login" description={`${contractor}. We email the portal link; they sign in with a one-time code and see only this contractor's records. Licence alerts go to them too.`} notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}>Send invitation</Button></>}>
      <div className="yx-ops-stack">
        <FormField id="ct-name" label="Name" required error={tried ? bad.name : null}>
          <TextField value={name} onChange={setName} maxLength={120} />
        </FormField>
        <FormField id="ct-email" label="Email" required error={tried ? bad.email : null}>
          <TextField value={email} onChange={setEmail} maxLength={254} type="email" />
        </FormField>
      </div>
    </Dialog>
  );
}

export interface WorkOrderInput {
  number: string;
  fromOn: string;
  toOn: string;
  headcount: number;
  locationIds: string[];
  version?: number;
}

/** Answer 675: a contractor's work order. Deploying past its headcount warns; the licence maximum is the legal limit. */
export function WorkOrderSheet({ contractor, initial, locations, onClose, onSave }: { contractor: string; initial: WorkOrder | null; locations: { id: string; name: string }[]; onClose: () => void; onSave: (input: WorkOrderInput) => Promise<unknown> }) {
  const { say } = useSay();
  const [no, setNo] = useState(initial?.number ?? '');
  const [from, setFrom] = useState<Date | null>(initial?.from ?? null);
  const [to, setTo] = useState<Date | null>(initial?.to ?? null);
  const [head, setHead] = useState<number | null>(initial?.headcount ?? null);
  const [sites, setSites] = useState<string[]>(initial?.sites.map((x) => x.id) ?? []);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = {
    no: !no.trim() ? 'Enter the work order number.' : null,
    from: !from ? 'Choose the first day.' : null,
    to: !to ? 'Choose the last day.' : from && to < from ? 'The work order ends before it starts.' : null,
    head: !head || head < 1 ? 'Enter the headcount.' : null,
    sites: !sites.length ? 'Choose the sites it covers.' : null,
  };
  const save = () => {
    setTried(true);
    const order: [keyof typeof bad, string][] = [['no', 'wo-no'], ['from', 'wo-from'], ['to', 'wo-to'], ['head', 'wo-head'], ['sites', 'wo-sites']];
    const miss = order.find(([k]) => bad[k]);
    if (miss) return focusOn(miss[1]);
    setBusy(true);
    setFailed(null);
    onSave({ number: no.trim(), fromOn: isoDay(from), toOn: isoDay(to), headcount: head!, locationIds: sites, ...(initial?.version ? { version: initial.version } : {}) })
      .then(() => (say(initial ? 'Work order saved' : 'Work order added'), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  const err = (k: keyof typeof bad) => (tried ? bad[k] : null);
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} size="md" title={initial ? `Change work order ${initial.number}` : 'Add work order'} subtitle={contractor} dirty notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{initial ? 'Save work order' : 'Add work order'}</Button></>}>
      <div className="yx-ops-stack">
        <FormField id="wo-no" label="Work order number" required error={err('no')}>
          <TextField value={no} onChange={setNo} maxLength={40} />
        </FormField>
        <FieldRow>
          <FormField id="wo-from" label="From" required error={err('from')}>
            <DatePicker value={from} onChange={setFrom} />
          </FormField>
          <FormField id="wo-to" label="To" required error={err('to')}>
            <DatePicker value={to} onChange={setTo} />
          </FormField>
        </FieldRow>
        <FormField id="wo-head" label="Headcount" required error={err('head')} helper="Deploying past it warns; the licence maximum still blocks.">
          <NumberField value={head} onChange={setHead} min={1} max={100000} />
        </FormField>
        <FormField id="wo-sites" label="Sites" required error={err('sites')}>
          <MultiSelect options={locations.map((l) => ({ value: l.id, label: l.name }))} value={sites} onChange={setSites} />
        </FormField>
      </div>
    </Drawer>
  );
}

/** Reject a licence or renewal with the reason (the contractor sees it once the portal is built). */
export function RejectLicenceDialog({ licence, onClose, onReject }: { licence: Licence; onClose: () => void; onReject: (reason: string) => Promise<unknown> }) {
  const { say } = useSay();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = reason.trim().length < 3 ? 'Say why, so the contractor can fix it.' : null;
  const go = () => {
    setTried(true);
    if (bad) return focusOn('lc-reason');
    setBusy(true);
    setFailed(null);
    onReject(reason.trim())
      .then(() => (say('Licence rejected'), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Reject licence ${licence.no}?`} description="It will not count for deployment. Add a new licence or renewal once the contractor sends a correct copy." notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} onClick={go}>Reject licence</Button></>}>
      <FormField id="lc-reason" label="Reason" required error={tried ? bad : null}>
        <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} />
      </FormField>
    </Dialog>
  );
}

/* =========================================================================================
 * CLB-02 · Contract workers register
 * ======================================================================================= */

export interface WorkersScreenProps {
  workers: ContractWorker[];
  contractors: Contractor[];
  today: Date;
  state?: ListState;
  deploy?: 'ok' | 'limit' | 'underage' | 'scope' | 'duplicate' | 'threshold' | null;
  /** CL-2 states drawn first: site approval with the induction, release, and the reader without the key to change. */
  sheet?: WorkersSheet | null;
  readOnly?: boolean;
  /** CL-2 live (the page passes it; docs/yukthix/contract-labour-design-map.md). */
  live?: WorkersLive;
}
export type WorkersSheet = { kind: 'deploy' } | { kind: 'approve'; id: string } | { kind: 'release'; id: string } | { kind: 'renew'; id: string } | { kind: 'card'; id: string } | { kind: 'pin'; id: string; pin?: string };

/** The deploy form (answers 635, 636): the Aadhaar number is sent once; only its last 4 digits come back. */
export interface WorkerInput {
  contractorId: string;
  locationId: string;
  givenName: string;
  familyName: string | null;
  dob: string;
  aadhaar: string;
  skill: 'unskilled' | 'semi_skilled' | 'skilled' | 'highly_skilled';
  wage: string | null;
  uan: string | null;
  esicIp: string | null;
  fromOn: string;
  toOn: string | null;
}
export interface WorkersViewProps {
  workers: ContractWorker[];
  contractors: { id: string; name: string }[];
  locations: { id: string; name: string; state: string }[];
  today: Date;
  state: ListState;
  sheet: WorkersSheet | null;
  canManage: boolean;
  inductionRequired: boolean;
  inductionMonths: number;
  /** The design's sample checks and form (live: none, the server checks). */
  design?: { checks: CheckRow[]; dob: Date; site: string };
  onRetry?: () => void;
  onCheck?: (input: WorkerInput) => Promise<CheckRow[]>;
  onSend?: (input: WorkerInput) => Promise<unknown>;
  onApprove?: (id: string, version: number, induction: { on: string | null; by: string | null }) => Promise<unknown>;
  onRelease?: (id: string, version: number, on: string, reason: string) => Promise<unknown>;
  /** Answer 685: the minimum wage for a site and skill. */
  onMinWage?: (locationId: string, skill: string) => Promise<MinWageHint | null>;
  /** CL-5: renew a gate pass keeping its number (684); the photo and the card (735); the kiosk PIN, shown once (625). */
  onRenewPass?: (id: string, version: number, induction: { on: string | null; by: string | null }) => Promise<unknown>;
  onPhoto?: (id: string, file: File) => Promise<unknown>;
  photoUrl?: (id: string) => Promise<string | null>;
  onKioskPin?: (id: string) => Promise<string>;
  /** CL-7 (answer 637): opens CLB-05 for a deployed worker (HR with the onboarding key). */
  onConvert?: (id: string) => void;
}

const SKILLS = [
  { value: 'unskilled', label: 'Unskilled' },
  { value: 'semi_skilled', label: 'Semi-skilled' },
  { value: 'skilled', label: 'Skilled' },
  { value: 'highly_skilled', label: 'Highly skilled' },
] as const;
const AADHAAR_RE = /^[2-9][0-9]{11}$/;

export function WorkersScreen({ workers, contractors, today, state = 'ready', deploy = null, sheet = null, readOnly = false, live }: WorkersScreenProps) {
  if (live) return <LiveWorkers live={live} />;
  const lic = contractors[0]!.licences[0]!;
  const dob = deploy === 'underage' ? new Date(2009, 4, 12) : new Date(1994, 6, 3);
  const blocks = deployBlocks({
    dob,
    on: today,
    licenceValidTo: lic.validTo,
    licenceMax: lic.max,
    activeDeployments: deploy === 'limit' ? lic.max : lic.max - 5,
    licenceStates: lic.states,
    siteState: deploy === 'scope' ? 'Kerala' : 'Tamil Nadu',
  });
  const checks: CheckRow[] = [
    { id: 'age', status: blocks.some((b) => b.includes('under 18')) ? 'fail' : 'pass', label: 'Age 18 or over', detail: blocks.find((b) => b.includes('under 18')) },
    { id: 'lic', status: blocks.some((b) => b.includes('not valid')) ? 'fail' : 'pass', label: `Licence ${lic.no} valid on ${formatDate(today)}` },
    { id: 'scope', status: blocks.some((b) => b.includes('scope')) ? 'fail' : 'pass', label: 'Licence scope covers the site', detail: blocks.find((b) => b.includes('scope')) },
    { id: 'max', status: blocks.some((b) => b.includes('allows')) ? 'fail' : 'pass', label: 'Within the licence maximum', detail: blocks.find((b) => b.includes('allows')) },
    { id: 'dup', status: deploy === 'duplicate' ? 'fail' : 'pass', label: 'Not already deployed', detail: deploy === 'duplicate' ? 'The same ID is already deployed or waiting at Bengaluru head office.' : 'Matched on the ID' },
    { id: 'threshold', status: deploy === 'threshold' ? 'warn' : 'pass', label: 'Principal-employer registration threshold', detail: deploy === 'threshold' ? 'This makes 50 contract workers at Hosur plant; registration is needed from 50. Make sure the site is registered.' : '42 of 50 before registration is needed.' },
  ];
  return (
    <WorkersView
      workers={workers}
      contractors={contractors.map((c) => ({ id: c.id, name: c.name }))}
      locations={[{ id: 'hosur', name: deploy === 'scope' ? 'Kochi warehouse' : 'Hosur plant', state: deploy === 'scope' ? 'IN-KL' : 'IN-TN' }, { id: 'blr', name: 'Bengaluru head office', state: 'IN-KA' }]}
      today={today}
      state={state}
      sheet={deploy ? { kind: 'deploy' } : sheet}
      canManage={!readOnly}
      inductionRequired
      inductionMonths={12}
      design={deploy ? { checks, dob, site: 'hosur' } : undefined}
    />
  );
}

const WORKER_TONE: Record<ContractWorker['status'], 'success' | 'warning' | 'neutral'> = { Deployed: 'success', 'Pending approval': 'warning', Released: 'neutral' };

export function WorkersView(p: WorkersViewProps) {
  const { workers, today, state, canManage } = p;
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [sheet, setSheet] = useState<WorkersSheet | null>(p.sheet);
  const { say } = useSay();
  const cols: TableColumn<ContractWorker>[] = [
    { key: 'name', header: 'Worker', value: (w) => w.name, render: (w) => <span className="yx-ops-row"><PhotoPlaceholder name={w.name} size="sm" /><span className="yx-ops-stack" data-gap="sm"><strong>{w.name}</strong><span className="yx-ops-muted">ID {w.idMasked}</span></span></span>, width: 220 },
    { key: 'contractor', header: 'Contractor', value: (w) => w.contractor, groupable: true, width: 200 },
    { key: 'site', header: 'Site', value: (w) => w.site },
    { key: 'from', header: 'Deployed from', type: 'date', value: (w) => w.from },
    { key: 'gate', header: 'Gate pass', type: 'id', value: (w) => w.gatePass ?? '', render: (w) => (w.gatePass ? <span className="yx-ops-stack" data-gap="sm"><span className="yx-ops-mono">{w.gatePass}</span>{w.gateValidTo && <span className="yx-ops-muted">to {formatDate(w.gateValidTo)}</span>}</span> : <span className="yx-ops-muted">After approval</span>), width: 170 },
    { key: 'skill', header: 'Skill', value: (w) => w.skill },
    { key: 'wage', header: 'Wage (by contractor)', type: 'money', value: (w) => w.wage ?? 0, render: (w) => (w.wage === null ? '—' : formatINR(w.wage)) },
    { key: 'uan', header: 'UAN', type: 'id', value: (w) => w.uan || '—' },
    { key: 'ip', header: 'ESI IP', type: 'id', value: (w) => w.ip || '—' },
    { key: 'status', header: 'Status', type: 'status', value: (w) => w.status, statusTone: (v) => WORKER_TONE[v as ContractWorker['status']] ?? 'neutral' },
  ];
  const rows = applyFilters(workers, filters);
  const target = sheet && sheet.kind !== 'deploy' ? workers.find((w) => w.id === sheet.id) : undefined;
  const add = canManage ? <Button variant="primary" icon={Plus} onClick={() => setSheet({ kind: 'deploy' })}>Deploy worker</Button> : undefined;
  return (
    <OpsDesk area="contract" active="Contract workers" counts={{ 'Contract workers': workers.filter((w) => w.status === 'Deployed').length }}>
      <PageHeader title="Contract workers" description="Deployed by contractors. Not employees: their punches never create payroll inputs. Each worker is one person record, so history follows them." actions={add} />
      <DataTable
        label="Contract workers"
        columns={cols}
        rows={state === 'empty' ? [] : rows}
        getRowId={(w) => w.id}
        state={state === 'empty' ? 'ready' : state}
        onRetry={p.onRetry ?? (() => {})}
        empty={<EmptyState title="No contract workers deployed." description="Deploy a worker of a licensed contractor to one of your sites." action={add} />}
        filtered={filters.length > 0}
        onClearFilters={() => setFilters([])}
        toolbar={<FilterBar fields={[multi('contractor', 'Contractor', p.contractors.map((c) => c.name)), multi('site', 'Site', p.locations.map((l) => l.name)), multi('status', 'Status', ['Deployed', 'Pending approval', 'Released'])]} value={filters} onChange={setFilters} searchPlaceholder="Search name, gate pass or UAN" />}
        rowButtons={(w) =>
          !canManage ? null : w.status === 'Pending approval' ? (
            <>
              <Button size="sm" onClick={() => setSheet({ kind: 'release', id: w.id })}>Withdraw</Button>
              <Button variant="approve" size="sm" onClick={() => setSheet({ kind: 'approve', id: w.id })}>Approve</Button>
            </>
          ) : w.status === 'Deployed' ? (
            <>
              <Button size="sm" onClick={() => setSheet({ kind: 'card', id: w.id })}>Gate pass</Button>
              {p.onConvert && <Button size="sm" onClick={() => p.onConvert!(w.id)}>Make employee</Button>}
              <Button size="sm" onClick={() => setSheet({ kind: 'release', id: w.id })}>Release</Button>
            </>
          ) : null
        }
      />
      {sheet?.kind === 'deploy' && <DeployWorkerSheet {...p} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'approve' && target && <ApproveWorkerDialog worker={target} today={today} required={p.inductionRequired} months={p.inductionMonths} onClose={() => setSheet(null)} onApprove={(induction) => (p.onApprove ? p.onApprove(target.id, target.version ?? 1, induction) : Promise.resolve(say('Approved')))} />}
      {sheet?.kind === 'card' && target && (
        <GatePassCard
          worker={target}
          today={today}
          canManage={canManage}
          photoUrl={p.photoUrl}
          onClose={() => setSheet(null)}
          onRenew={() => setSheet({ kind: 'renew', id: target.id })}
          onPin={() => (p.onKioskPin ? p.onKioskPin(target.id).then((pin) => setSheet({ kind: 'pin', id: target.id, pin })) : Promise.resolve(setSheet({ kind: 'pin', id: target.id, pin: '4821' })))}
          onPhoto={(file) => (p.onPhoto ? p.onPhoto(target.id, file) : Promise.resolve())}
        />
      )}
      {sheet?.kind === 'renew' && target && <ApproveWorkerDialog renew worker={target} today={today} required={p.inductionRequired} months={p.inductionMonths} onClose={() => setSheet(null)} onApprove={(induction) => (p.onRenewPass ? p.onRenewPass(target.id, target.version ?? 1, induction) : Promise.resolve())} />}
      {sheet?.kind === 'pin' && target && (
        <Dialog open onOpenChange={(o) => !o && setSheet(null)} size="sm" title={`Kiosk PIN for ${target.name}`} description="Give it to the worker with the gate pass. At the site's kiosk they enter the gate pass number and this PIN. It is shown only now; a new PIN replaces it." footer={<Button variant="primary" onClick={() => setSheet(null)}>Done</Button>}>
          <p className="yx-ops-pin" aria-label="Kiosk PIN">{sheet.pin}</p>
        </Dialog>
      )}
      {sheet?.kind === 'release' && target && <ReleaseWorkerDialog worker={target} today={today} onClose={() => setSheet(null)} onRelease={(on, reason) => (p.onRelease ? p.onRelease(target.id, target.version ?? 1, on, reason) : Promise.resolve())} />}
    </OpsDesk>
  );
}

/** Deploy a worker: the server checks age, licence, licence maximum and the same ID before anything is saved (635). */
function DeployWorkerSheet(p: WorkersViewProps & { onClose: () => void }) {
  const { say } = useSay();
  const [f, setF] = useState({ contractorId: p.design ? (p.contractors[0]?.id ?? null) : null as string | null, locationId: p.design ? p.design.site : null as string | null, givenName: p.design ? 'Kannan' : '', familyName: p.design ? 'S.' : '', aadhaar: p.design ? '234567890123' : '', skill: 'unskilled' as WorkerInput['skill'], uan: '', esicIp: '' });
  const [dob, setDob] = useState<Date | null>(p.design?.dob ?? null);
  const [from, setFrom] = useState<Date | null>(p.design ? p.today : null);
  const [to, setTo] = useState<Date | null>(null);
  const [wage, setWage] = useState<number | null>(p.design ? 14820 : null);
  const [checks, setChecks] = useState<CheckRow[] | null>(p.design?.checks ?? null);
  const hint = useMinWage(f.locationId, f.skill, p.onMinWage, p.design ? { monthly: '14820.00', daily: '570.00', source: 'TN 2026-04, zone A, unskilled', verify: true } : null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const set = (x: Partial<typeof f>) => setF((o) => ({ ...o, ...x }));
  const bad = {
    contractor: !f.contractorId ? 'Choose the contractor.' : null,
    site: !f.locationId ? 'Choose the site.' : null,
    name: !f.givenName.trim() ? 'Enter the worker’s name.' : null,
    dob: !dob ? 'Enter the date of birth: it is checked against the minimum age.' : null,
    aadhaar: !AADHAAR_RE.test(f.aadhaar) ? 'Enter the 12-digit Aadhaar number. Only the last 4 digits are kept.' : null,
    from: !from ? 'Choose the first day.' : null,
    to: to && from && to < from ? 'The deployment ends before it starts.' : null,
    uan: f.uan && !/^[0-9]{12}$/.test(f.uan) ? 'A UAN has 12 digits.' : null,
    ip: f.esicIp && !/^[0-9]{10}$/.test(f.esicIp) ? 'An ESI IP number has 10 digits.' : null,
  };
  const input = (): WorkerInput => ({ contractorId: f.contractorId!, locationId: f.locationId!, givenName: f.givenName.trim(), familyName: f.familyName.trim() || null, dob: isoDay(dob), aadhaar: f.aadhaar, skill: f.skill, wage: wage ? wage.toFixed(2) : null, uan: f.uan || null, esicIp: f.esicIp || null, fromOn: isoDay(from), toOn: to ? isoDay(to) : null });
  const send = () => {
    setTried(true);
    const order: [keyof typeof bad, string][] = [['contractor', 'dw-contractor'], ['site', 'dw-site'], ['name', 'dw-name'], ['dob', 'dw-dob'], ['aadhaar', 'dw-aadhaar'], ['from', 'dw-from'], ['to', 'dw-to'], ['uan', 'dw-uan'], ['ip', 'dw-ip']];
    const miss = order.find(([k]) => bad[k]);
    if (miss) return focusOn(miss[1]);
    if (p.design) return say(checks?.some((c) => c.status === 'fail') ? `This worker can't be deployed yet. ${checks.filter((c) => c.status === 'fail').map((c) => c.detail ?? c.label).join(' ')}` : 'Sent for site approval');
    setBusy(true);
    setFailed(null);
    // The checks first (shown in the list); only when nothing fails is the worker sent.
    p.onCheck!(input())
      .then(async (rows) => {
        setChecks(rows);
        if (rows.some((r) => r.status === 'fail')) return setFailed('This worker can’t be deployed. See the checks.');
        await p.onSend!(input());
        say('Sent for site approval');
        p.onClose();
      })
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  const err = (k: keyof typeof bad) => (tried ? bad[k] : null);
  const fails = checks?.filter((c) => c.status === 'fail') ?? [];
  return (
    <Drawer open onOpenChange={(o) => !o && p.onClose()} size="lg" title="Deploy a worker" subtitle="Contract workers" dirty notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={p.onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={send}>Send for site approval</Button></>}>
      <div className="yx-ops-stack">
        <FieldRow>
          <FormField id="dw-contractor" label="Contractor" required error={err('contractor')}>
            <Select options={p.contractors.map((c) => ({ value: c.id, label: c.name }))} value={f.contractorId} onChange={(v) => set({ contractorId: v })} />
          </FormField>
          <FormField id="dw-site" label="Site" required error={err('site')}>
            <Select options={p.locations.map((l) => ({ value: l.id, label: l.name }))} value={f.locationId} onChange={(v) => set({ locationId: v })} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="dw-name" label="Name" required error={err('name')}>
            <TextField value={f.givenName} onChange={(v) => set({ givenName: v })} maxLength={100} />
          </FormField>
          <FormField id="dw-family" label="Family name" optional>
            <TextField value={f.familyName} onChange={(v) => set({ familyName: v })} maxLength={100} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="dw-dob" label="Date of birth" required error={err('dob')}>
            <DatePicker value={dob} onChange={setDob} />
          </FormField>
          <FormField id="dw-aadhaar" label="Aadhaar number" required error={err('aadhaar')} helper="Only the last 4 digits are kept, with a check that finds the same person again.">
            <TextField value={f.aadhaar} onChange={(v) => set({ aadhaar: v.replace(/\D/g, '').slice(0, 12) })} inputMode="numeric" autoComplete="off" maxLength={12} />
          </FormField>
        </FieldRow>
        <FormField id="dw-skill" label="Skill category" required>
          <Segment label="Skill category" options={[...SKILLS]} value={f.skill} onChange={(v) => set({ skill: v })} />
        </FormField>
        <FieldRow>
          <FormField id="dw-from" label="First day" required error={err('from')}>
            <DatePicker value={from} onChange={setFrom} />
          </FormField>
          <FormField id="dw-to" label="Last day" optional error={err('to')}>
            <DatePicker value={to} onChange={setTo} />
          </FormField>
        </FieldRow>
        <FormField id="dw-wage" label="Monthly wage paid by the contractor" optional helper={hintText(hint) ?? "Checked against the minimum wage with the contractor's monthly proofs."}>
          <CurrencyField value={wage} onChange={setWage} />
        </FormField>
        <FieldRow>
          <FormField id="dw-uan" label="UAN" optional error={err('uan')}>
            <TextField value={f.uan} onChange={(v) => set({ uan: v.replace(/\D/g, '').slice(0, 12) })} inputMode="numeric" maxLength={12} />
          </FormField>
          <FormField id="dw-ip" label="ESI IP number" optional error={err('ip')}>
            <TextField value={f.esicIp} onChange={(v) => set({ esicIp: v.replace(/\D/g, '').slice(0, 10) })} inputMode="numeric" maxLength={10} />
          </FormField>
        </FieldRow>
        {checks ? <CheckList label="Deployment checks" items={checks} /> : <p className="yx-ops-muted">Age, the contractor's licence for the site, the licence maximum and the same ID are checked when you send. There is no override.</p>}
        {fails.length > 0 && <InlineAlert tone="danger" title="Deployment blocked">{fails.map((c) => c.detail ?? c.label).join(' ')}</InlineAlert>}
      </div>
    </Drawer>
  );
}

/** Site approval (632, 633): the safety induction is recorded and the gate pass is issued. */
function ApproveWorkerDialog({ worker, today, required, months, renew = false, onClose, onApprove }: { worker: ContractWorker; today: Date; required: boolean; months: number; renew?: boolean; onClose: () => void; onApprove: (induction: { on: string | null; by: string | null }) => Promise<unknown> }) {
  const { say } = useSay();
  const [on, setOn] = useState<Date | null>(worker.induction ? worker.induction.on : null);
  const [by, setBy] = useState(worker.induction?.by ?? '');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = {
    on: required && !renew && !on ? 'Enter the day of the safety induction.' : on && on > today ? 'The induction cannot be in the future.' : null,
    by: (required && !renew && !by.trim()) || (renew && on && !by.trim()) ? 'Enter who gave the induction.' : null,
  };
  const go = () => {
    setTried(true);
    if (bad.on) return focusOn('ap-on');
    if (bad.by) return focusOn('ap-by');
    setBusy(true);
    setFailed(null);
    onApprove({ on: on ? isoDay(on) : null, by: by.trim() || null })
      .then(() => (say(renew ? `${worker.name}'s gate pass renewed` : `${worker.name} approved; gate pass issued`), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="md" title={renew ? `Renew ${worker.name}'s gate pass?` : `Approve ${worker.name}?`} description={renew ? `${worker.gatePass ?? ''} keeps its number. The new end is the first of the deployment's last day, the licence in force and the induction (${months} months). Record a new induction if the last one has run out.` : `${worker.contractor} · ${worker.site}. The checks run again; the gate pass ends with the deployment, the licence or the induction (${months} months), whichever comes first.`} notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}>{renew ? 'Renew gate pass' : 'Approve and issue gate pass'}</Button></>}>
      <div className="yx-ops-stack">
        <FieldRow>
          <FormField id="ap-on" label="Safety induction on" required={required} optional={!required} error={tried ? bad.on : null}>
            <DatePicker value={on} onChange={setOn} />
          </FormField>
          <FormField id="ap-by" label="Given by" required={required} optional={!required} error={tried ? bad.by : null}>
            <TextField value={by} onChange={setBy} maxLength={120} />
          </FormField>
        </FieldRow>
      </div>
    </Dialog>
  );
}

/** Answers 684, 735, 625: the gate pass card (photo, name, number, site, end) with its actions; printable. */
function GatePassCard({ worker, today, canManage, photoUrl, onClose, onRenew, onPin, onPhoto }: { worker: ContractWorker; today: Date; canManage: boolean; photoUrl?: (id: string) => Promise<string | null>; onClose: () => void; onRenew: () => void; onPin: () => Promise<unknown>; onPhoto: (file: File) => Promise<unknown> }) {
  const { say } = useSay();
  const [url, setUrl] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!worker.photo || !photoUrl) return;
    let live = true;
    photoUrl(worker.id).then((u) => live && setUrl(u), () => undefined);
    return () => {
      live = false;
    };
  }, [worker.id, worker.photo, photoUrl]);
  const ending = worker.gateValidTo ? Math.round((worker.gateValidTo.getTime() - today.getTime()) / 86_400_000) : null;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Gate pass"
      subtitle={`${worker.contractor} · ${worker.site}`}
      footer={
        <>
          <Button onClick={() => window.print()}>Print card</Button>
          {canManage && <Button onClick={() => void onPin().catch((e: unknown) => say(errText(e)))}>{worker.kioskPin ? 'New kiosk PIN' : 'Kiosk PIN'}</Button>}
          {canManage && <Button variant="primary" onClick={onRenew}>Renew gate pass</Button>}
        </>
      }
    >
      <div className="yx-ops-stack">
        <article className="yx-ops-gatepass" aria-label={`Gate pass ${worker.gatePass ?? ''}`}>
          {url ? <img className="yx-ops-gatepass__photo" src={url} alt={`Photo of ${worker.name}`} /> : <PhotoPlaceholder name={worker.name} size="lg" />}
          <DescriptionList items={[{ label: 'Name', value: worker.name }, { label: 'Gate pass', value: worker.gatePass ?? '—', mono: true }, { label: 'Valid to', value: worker.gateValidTo ? formatDate(worker.gateValidTo) : '—' }, { label: 'ID', value: worker.idMasked }]} />
        </article>
        {ending !== null && ending <= 30 && <InlineAlert tone={ending < 0 ? 'danger' : 'warning'} title={ending < 0 ? 'The gate pass has ended' : `The gate pass ends in ${ending} days`}>Renew it: the number stays the same.</InlineAlert>}
        {canManage && !worker.photo && !adding && (
          <Actions>
            <Button size="sm" icon={Upload} onClick={() => setAdding(true)}>Add photo</Button>
          </Actions>
        )}
        {canManage && (adding || worker.photo) && (
          <FormField id="gp-photo" label={worker.photo ? 'Replace the photo' : 'Photo'} optional helper="A clear face.">
            <FileUpload id="gp-photo" multiple={false} accept={['.jpg', '.png']} maxSize={5 * 1024 * 1024} upload={async (f) => { await onPhoto(f); say('Photo saved'); }} />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}

/** Release a deployed worker, or withdraw one waiting for approval: the deployment and the role end on the day. */
function ReleaseWorkerDialog({ worker, today, onClose, onRelease }: { worker: ContractWorker; today: Date; onClose: () => void; onRelease: (on: string, reason: string) => Promise<unknown> }) {
  const { say } = useSay();
  const pending = worker.status === 'Pending approval';
  const [on, setOn] = useState<Date | null>(today);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = { on: !on ? 'Choose the last day.' : on > today ? 'Release on today or an earlier day.' : null, reason: reason.trim().length < 3 ? 'Say why.' : null };
  const go = () => {
    setTried(true);
    if (bad.on) return focusOn('rl-on');
    if (bad.reason) return focusOn('rl-reason');
    setBusy(true);
    setFailed(null);
    onRelease(isoDay(on), reason.trim())
      .then(() => (say(pending ? `${worker.name} withdrawn` : `${worker.name} released`), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="md" title={pending ? `Withdraw ${worker.name}?` : `Release ${worker.name}?`} description={`${worker.contractor} · ${worker.site}. The gate pass stops working after the last day.`} notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}>{pending ? 'Withdraw' : 'Release'}</Button></>}>
      <div className="yx-ops-stack">
        <FormField id="rl-on" label="Last day" required error={tried ? bad.on : null}>
          <DatePicker value={on} onChange={setOn} />
        </FormField>
        <FormField id="rl-reason" label="Reason" required error={tried ? bad.reason : null}>
          <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}

/* =========================================================================================
 * CLB-03 · Vendor compliance tracker
 * ======================================================================================= */

const PROOF_TONE: Record<ProofStatus, BadgeTone> = { Verified: 'success', Submitted: 'info', Discrepancy: 'danger', Overdue: 'danger', 'Not required': 'neutral', Open: 'neutral' };
export interface VendorComplianceProps {
  month: string;
  proofTypes: string[];
  matrix: { contractor: string; statuses: ProofStatus[] }[];
  alerts: { id: string; type: string; contractor: string; month: string; detail: string; liability: number; raised: Date; severity: string }[];
  verifyOpen?: boolean;
  overrideOpen?: boolean;
  persona?: 'compliance' | 'fin';
  /** CL-4: recording a payment the company made itself (answer 626). */
  payOpen?: boolean;
  /** CL-4 live (the page passes it; docs/yukthix/contract-labour-design-map.md). */
  live?: VendorComplianceLive;
}

/** One contractor's pack for a site and month, as the matrix shows it. */
export interface VcRow {
  key: string;
  contractorId: string;
  contractor: string;
  site?: string;
  month: string;
  cells: { label: string; status: ProofStatus; itemId?: string; version?: number; fileName?: string; note?: string | null }[];
  held: boolean;
  released?: { reason: string } | null;
  /** The checks for the verification drawer, by proof label. */
  checks?: Record<string, CheckRow[]>;
}
export interface VcAlert {
  id: string;
  type: string;
  contractor: string;
  contractorId?: string;
  month: string;
  detail: string;
  liability: number | null;
  severity: string;
  deploymentId?: string;
}
export interface VendorComplianceViewProps {
  month: string;
  due?: string;
  months?: string[];
  onMonth?: (month: string) => void;
  holdMode: 'hold' | 'alert';
  proofLabels: string[];
  rows: VcRow[];
  alerts: VcAlert[];
  canManage: boolean;
  state?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  verify?: { row: string; label: string } | null;
  release?: string | null;
  pay?: string | null;
  onVerify?: (itemId: string, version: number) => Promise<unknown>;
  onDiscrepancy?: (itemId: string, version: number, note: string) => Promise<unknown>;
  onOpenFile?: (itemId: string) => void;
  onRelease?: (contractorId: string, month: string, reason: string) => Promise<unknown>;
  onPayByUs?: (input: { deploymentId: string; month: string; amount: string; paidOn: string; reference: string; reason: string }) => Promise<unknown>;
}

const SAMPLE_CHECKS: CheckRow[] = [
  { id: 'p', status: 'pass', label: 'Challan period matches (Aug 2026)' },
  { id: 'w', status: 'fail', label: 'Workers covered ≥ workers on site', detail: 'Covers 12; 14 deployed in the month. Short by 2.' },
  { id: 'm', status: 'pass', label: 'Wages at or above minimum wage (IN.MW Tamil Nadu 2026-04, verify)' },
];

export function VendorComplianceScreen({ month, proofTypes, matrix, alerts, verifyOpen, overrideOpen, payOpen, persona = 'compliance', live }: VendorComplianceProps) {
  if (live) return <LiveVendorCompliance live={live} />;
  // The design's four proofs (answer 634 asks for these; PT / LWF is question 741).
  const labels = proofTypes.filter((p) => p !== 'PT / LWF');
  const rows: VcRow[] = matrix.map((m, r) => ({
    key: m.contractor,
    contractorId: `c${r + 1}`,
    contractor: m.contractor,
    site: 'Hosur plant',
    month,
    cells: labels.map((label) => ({ label, status: m.statuses[proofTypes.indexOf(label)]!, itemId: `${r}-${label}`, version: 1, fileName: 'challan.pdf', note: m.statuses[proofTypes.indexOf(label)] === 'Discrepancy' ? 'Covers 12; 14 deployed.' : null })),
    held: m.statuses.some((s) => s === 'Overdue' || s === 'Discrepancy'),
    checks: Object.fromEntries(labels.map((l) => [l, SAMPLE_CHECKS])),
  }));
  return (
    <VendorComplianceView
      month={month}
      due="15 Oct 2026"
      holdMode="hold"
      proofLabels={labels}
      rows={rows}
      alerts={alerts.map((a) => ({ ...a, liability: a.liability || null, deploymentId: a.type === 'Wage below minimum' ? 'w9' : undefined }))}
      canManage={persona === 'compliance'}
      verify={verifyOpen ? { row: 'Vetri Security Agency', label: 'ESI challan' } : null}
      release={overrideOpen ? 'Kaveri Loaders Co-op' : null}
      pay={payOpen ? 'la4' : null}
    />
  );
}

export function VendorComplianceView(p: VendorComplianceViewProps) {
  const [verify, setVerify] = useState(p.verify ?? null);
  const [release, setRelease] = useState<string | null>(p.release ?? null);
  const [pay, setPay] = useState<string | null>(p.pay ?? null);
  const { say } = useSay();
  const row = verify ? p.rows.find((r) => r.key === verify.row) : undefined;
  const cell = row?.cells.find((c) => c.label === verify?.label);
  const rel = release ? p.rows.find((r) => r.key === release) : undefined;
  const alert = pay ? p.alerts.find((a) => a.id === pay) : undefined;
  const exposure = p.alerts.reduce((s, a) => s + (a.liability ?? 0), 0);
  const run = (fn: (() => Promise<unknown>) | undefined, title: string, after?: () => void) => (fn ? fn().then(() => (say(title), after?.()), (e: unknown) => say(errText(e))) : Promise.resolve(say(title)));
  return (
    <OpsDesk area="contract" active="Vendor compliance" counts={{ 'Vendor compliance': p.alerts.length }}>
      <PageHeader
        title="Vendor compliance"
        description={`Monthly proofs from each contractor for ${monthText(p.month)} wages${p.due ? `, due by ${/^\d{4}-\d{2}-\d{2}$/.test(p.due) ? formatDate(new Date(`${p.due}T00:00:00`)) : p.due}` : ''}. You can be liable for unpaid wages and dues.`}
        facts={`${p.alerts.length} liability alerts · estimated exposure ${formatINR(exposure)}`}
        actions={p.months && p.months.length > 1 && p.onMonth ? <Select value={p.month} onChange={(v) => v && p.onMonth!(v)} options={p.months.map((m) => ({ value: m, label: monthText(m) }))} /> : undefined}
      />
      {p.holdMode === 'alert' && <InlineAlert tone="info" title="Bills are not held">Your company chose alerts only (Settings › Contract labour). Overdue or disputed proofs still raise liability alerts.</InlineAlert>}
      {p.state === 'error' ? (
        <EmptyState title="This page could not be loaded." action={<Button onClick={p.onRetry}>Try again</Button>} />
      ) : (
        <Card title={`Compliance matrix · ${monthText(p.month)}`}>
          {p.rows.length === 0 ? (
            <EmptyState compact title={p.state === 'loading' ? 'Loading…' : 'No contract workers were deployed this month.'} />
          ) : (
            <PlainTable
              label="Contractor by proof type"
              rows={p.rows}
              getRowId={(m) => m.key}
              columns={[
                { key: 'contractor', header: 'Contractor', rowHeader: true, cell: (m) => (m.site ? <span className="yx-ops-stack" data-gap="sm"><strong>{m.contractor}</strong><span className="yx-ops-muted">{m.site}</span></span> : m.contractor) },
                ...p.proofLabels.map((label) => ({
                  key: label,
                  header: label,
                  cell: (m: VcRow) => {
                    const c = m.cells.find((x) => x.label === label)!;
                    return c.itemId && c.status !== 'Open' && c.status !== 'Overdue' ? (
                      <button type="button" className="yx-ops-cellbtn" onClick={() => setVerify({ row: m.key, label })} aria-label={`${label}, ${m.contractor}: ${c.status}. Open verification`}>
                        <Badge tone={PROOF_TONE[c.status]}>{c.status}</Badge>
                      </button>
                    ) : (
                      <Badge tone={PROOF_TONE[c.status]}>{c.status}</Badge>
                    );
                  },
                })),
                {
                  key: 'bill',
                  header: 'Bill payment',
                  cell: (m: VcRow) =>
                    m.held ? (
                      <span className="yx-ops-row">
                        <Badge tone="danger">Held</Badge>
                        {p.canManage && <Button size="sm" onClick={() => setRelease(m.key)}>Release</Button>}
                      </span>
                    ) : m.released ? (
                      <Badge tone="warning">Released by the compliance owner</Badge>
                    ) : (
                      <Badge tone="success">Can be paid</Badge>
                    ),
                },
              ]}
            />
          )}
        </Card>
      )}
      <Card title="Liability alerts">
        <DataTable
          label="Liability alerts"
          columns={[
            { key: 't', header: 'Alert', value: (a: VcAlert) => a.type, width: 200 },
            { key: 'c', header: 'Contractor', value: (a) => a.contractor, width: 200 },
            { key: 'd', header: 'Detail', value: (a) => a.detail, width: 340 },
            { key: 'l', header: 'Possible liability', type: 'money', value: (a) => a.liability ?? 0, total: 'sum' },
            { key: 's', header: 'Severity', type: 'status', value: (a) => a.severity, statusTone: (v) => (v === 'High' ? 'danger' : 'warning') },
          ]}
          rows={p.alerts}
          getRowId={(a) => a.id}
          rowButtons={(a) => (p.canManage && a.deploymentId ? <Button size="sm" onClick={() => setPay(a.id)}>Record payment by us</Button> : null)}
          empty={<EmptyState compact title="No open alerts." />}
        />
      </Card>
      {row && cell && (
        <ProofDrawer
          title={`Verify ${cell.label.toLowerCase()} · ${row.contractor} · ${row.month}`}
          cell={cell}
          checks={row.checks?.[cell.label] ?? []}
          canManage={p.canManage}
          onClose={() => setVerify(null)}
          onOpenFile={() => cell.itemId && p.onOpenFile?.(cell.itemId)}
          onVerify={() => run(p.onVerify && (() => p.onVerify!(cell.itemId!, cell.version ?? 1)), 'Proof verified', () => setVerify(null))}
          onDiscrepancy={(note) => (p.onDiscrepancy ? p.onDiscrepancy(cell.itemId!, cell.version ?? 1, note) : Promise.resolve())}
        />
      )}
      {rel && <ReleaseHoldDialog contractor={rel.contractor} month={rel.month} onClose={() => setRelease(null)} onRelease={(reason) => (p.onRelease ? p.onRelease(rel.contractorId, rel.month, reason) : Promise.resolve())} />}
      {alert && <PayByUsDialog alert={alert} onClose={() => setPay(null)} onSave={(input) => (p.onPayByUs ? p.onPayByUs({ deploymentId: alert.deploymentId!, month: alert.month, ...input }) : Promise.resolve())} />}
    </OpsDesk>
  );
}

/** Verify a proof or raise a discrepancy with a note (a short challan cannot be verified). */
function ProofDrawer({ title, cell, checks, canManage, onClose, onOpenFile, onVerify, onDiscrepancy }: { title: string; cell: VcRow['cells'][number]; checks: CheckRow[]; canManage: boolean; onClose: () => void; onOpenFile: () => void; onVerify: () => Promise<unknown>; onDiscrepancy: (note: string) => Promise<unknown> }) {
  const { say } = useSay();
  const [raising, setRaising] = useState(false);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const open = cell.status === 'Submitted' || cell.status === 'Discrepancy';
  const raise = () => {
    setTried(true);
    if (note.trim().length < 3) return focusOn('pd-note');
    setBusy(true);
    setFailed(null);
    onDiscrepancy(note.trim())
      .then(() => (say('Discrepancy raised; the contractor is asked to replace the proof'), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={title}
      subtitle={cell.status === 'Discrepancy' ? `Discrepancy: ${cell.note ?? ''}` : 'Uploaded by the contractor on the portal. Check the copy, then verify or raise a discrepancy.'}
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        canManage && open ? (
          raising ? (
            <>
              <Button onClick={() => setRaising(false)}>Back</Button>
              <Button variant="primary" loading={busy} onClick={raise}>Raise discrepancy</Button>
            </>
          ) : (
            <>
              {cell.status === 'Submitted' && <Button onClick={() => setRaising(true)}>Raise discrepancy</Button>}
              {cell.status === 'Submitted' && <Button variant="primary" onClick={() => void onVerify()}>Mark verified</Button>}
            </>
          )
        ) : undefined
      }
    >
      <div className="yx-ops-stack">
        {cell.fileName && (
          <Actions>
            <Button size="sm" icon={Download} onClick={onOpenFile}>{cell.fileName}</Button>
          </Actions>
        )}
        <CheckList label="Automatic checks" items={checks} />
        {raising && (
          <FormField id="pd-note" label="What is wrong" required error={tried && note.trim().length < 3 ? 'Say what is wrong, so the contractor can fix it.' : null}>
            <TextArea rows={3} value={note} onChange={setNote} maxLength={500} />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}

/** Answer 634: release a month's hold on the contractor's bills, with a reason (the compliance owner only). */
function ReleaseHoldDialog({ contractor, month, onClose, onRelease }: { contractor: string; month: string; onClose: () => void; onRelease: (reason: string) => Promise<unknown> }) {
  const { say } = useSay();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const go = () => {
    setTried(true);
    if (reason.trim().length < 3) return focusOn('rh-reason');
    setBusy(true);
    setFailed(null);
    onRelease(reason.trim())
      .then(() => (say(`${contractor}'s ${month} bill released`), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="md" title={`Release ${contractor}'s ${month} bill?`} description="The proofs are still overdue or disputed. Releasing it is recorded with your reason. Alerts stay open." notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}>Release bill</Button></>}>
      <FormField id="rh-reason" label="Reason" required error={tried && reason.trim().length < 3 ? 'Say why the bill can be paid.' : null}>
        <TextArea rows={3} value={reason} onChange={setReason} maxLength={500} />
      </FormField>
    </Dialog>
  );
}

/** Answer 626: wages the company paid a worker itself; taken off the contractor's next bill. */
function PayByUsDialog({ alert, onClose, onSave }: { alert: VcAlert; onClose: () => void; onSave: (input: { amount: string; paidOn: string; reference: string; reason: string }) => Promise<unknown> }) {
  const { say } = useSay();
  const [amount, setAmount] = useState<number | null>(alert.liability);
  const [paidOn, setPaidOn] = useState<Date | null>(null);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('Wage shortfall paid to the worker.');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = { amount: !amount || amount <= 0 ? 'Enter the amount paid.' : null, paidOn: !paidOn ? 'Choose the day it was paid.' : null, reference: !reference.trim() ? 'Enter the payment reference.' : null, reason: reason.trim().length < 3 ? 'Say why.' : null };
  const go = () => {
    setTried(true);
    const order: [keyof typeof bad, string][] = [['amount', 'pb-amount'], ['paidOn', 'pb-on'], ['reference', 'pb-ref'], ['reason', 'pb-reason']];
    const miss = order.find(([k]) => bad[k]);
    if (miss) return focusOn(miss[1]);
    setBusy(true);
    setFailed(null);
    onSave({ amount: amount!.toFixed(2), paidOn: isoDay(paidOn), reference: reference.trim(), reason: reason.trim() })
      .then(() => (say('Payment recorded; it comes off the contractor’s next bill'), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="md" title="Record payment by us" description={`${alert.contractor} · ${alert.detail} The amount is taken off the contractor's next approved bill.`} notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}>Record payment</Button></>}>
      <div className="yx-ops-stack">
        <FieldRow>
          <FormField id="pb-amount" label="Amount paid" required error={tried ? bad.amount : null}>
            <CurrencyField value={amount} onChange={setAmount} allowPaise />
          </FormField>
          <FormField id="pb-on" label="Paid on" required error={tried ? bad.paidOn : null}>
            <DatePicker value={paidOn} onChange={setPaidOn} />
          </FormField>
        </FieldRow>
        <FormField id="pb-ref" label="Payment reference" required error={tried ? bad.reference : null}>
          <TextField value={reference} onChange={setReference} maxLength={100} />
        </FormField>
        <FormField id="pb-reason" label="Reason" required error={tried ? bad.reason : null}>
          <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}

/* =========================================================================================
 * CLB-04 · CLRA registers & returns (T7)
 * ======================================================================================= */

/** GET contract-labour/registers (CL-6, answer 629). */
export interface ClraRegistersData {
  month: string;
  canMake: boolean;
  establishments: { id: string; name: string }[];
  registers: { id: string; type: string; locationId: string | null; location: string; formatVersion: string; version: number; status: 'generated' | 'frozen' | 'signed' | 'superseded'; rows: number }[];
  /** Contractors without a wage register for the month: the muster and wage registers wait for them. */
  waiting: { locationId: string; contractors: string[] }[];
  chart: { months: string[]; series: { name: string; values: number[] }[] };
}
/** GET contract-labour/returns (answer 630). */
export interface ClraReturnsData {
  year: number;
  canFile: boolean;
  daysNote: string;
  returns: { locationId: string; location: string; title: string; due: string; figures: { contractors: number; workers: number; maxWorkersOnADay: number; daysWorked: number; wagesPaid: string }; filed: { on: string; reference: string } | null }[];
}
export interface LiveClraRegisters {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  month: string;
  months: { value: string; label: string }[];
  onMonth: (m: string) => void;
  data: ClraRegistersData | null;
  /** Freezing and the DSC signature need the company's register-signing key (statutory.register.sign). */
  canSign: boolean;
  onMake: (locationId: string, reason?: string) => Promise<unknown>;
  onDownload: (id: string) => Promise<unknown>;
  onFreeze: (id: string) => Promise<unknown>;
  onSign: (id: string, file: File) => Promise<unknown>;
  returns: {
    state: 'ready' | 'loading' | 'error';
    data: ClraReturnsData | null;
    year: number;
    years: number[];
    onYear: (y: number) => void;
    onDraft: (locationId: string, year: number) => Promise<unknown>;
    onFiled: (locationId: string, year: number, input: { filedOn: string; reference: string }) => Promise<unknown>;
  };
}

const CLRA_TITLE: Record<string, string> = { clra_contractors: 'Register of contractors', clra_workmen: 'Register of contract workers', clra_muster: 'Muster roll', clra_wages: 'Register of wages' };
const CLRA_STATUS: Record<string, string> = { generated: 'Made', frozen: 'Frozen', signed: 'Signed', superseded: 'Replaced' };
const monthWord = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

export function ClraRegistersScreen({ loading, tab = 'registers', live }: { loading?: boolean; tab?: 'registers' | 'returns'; live?: LiveClraRegisters }) {
  const [current, setCurrent] = useState(tab);
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [making, setMaking] = useState(false);
  const [filing, setFiling] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useSay();
  const d = live?.data ?? null;
  const go = (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setFailed(null);
    return fn()
      .then(() => done && toast({ tone: 'success', title: done }))
      .catch((e: Error) => setFailed(e.message))
      .finally(() => setBusy(null));
  };
  const sample = [
    { id: 'r1', name: 'Register of contractors', est: 'Hosur plant', period: 'Aug 2026', format: 'IN.CLRA.REGISTERS osh-2025-v1', status: 'Signed' },
    { id: 'r2', name: 'Register of contract workers', est: 'Hosur plant', period: 'Aug 2026', format: 'IN.CLRA.REGISTERS osh-2025-v1', status: 'Signed' },
    { id: 'r3', name: 'Muster roll', est: 'Hosur plant', period: 'Aug 2026', format: 'IN.CLRA.REGISTERS osh-2025-v1', status: 'Frozen' },
    { id: 'r4', name: 'Register of wages', est: 'Hosur plant', period: 'Aug 2026', format: 'IN.CLRA.REGISTERS osh-2025-v1', status: 'Waiting for 2 contractors' },
    { id: 'r5', name: 'Register of contractors', est: 'Bengaluru head office', period: 'Aug 2026', format: 'IN.CLRA.REGISTERS osh-2025-v1', status: 'Made' },
  ];
  type Row = (typeof sample)[number] & { live?: ClraRegistersData['registers'][number] };
  const registers: Row[] = d
    ? [
        ...d.registers.map((r) => ({ id: r.id, name: CLRA_TITLE[r.type] ?? r.type, est: r.location, period: monthWord(d.month), format: `IN.CLRA.REGISTERS ${r.formatVersion} · v${r.version}`, status: CLRA_STATUS[r.status] ?? r.status, live: r })),
        ...d.waiting.flatMap((w) => [
          { id: `wm-${w.locationId}`, name: 'Muster roll', est: d.establishments.find((e) => e.id === w.locationId)?.name ?? '', period: monthWord(d.month), format: '', status: `Waiting for ${w.contractors.length} contractor${w.contractors.length === 1 ? '' : 's'}` },
          { id: `ww-${w.locationId}`, name: 'Register of wages', est: d.establishments.find((e) => e.id === w.locationId)?.name ?? '', period: monthWord(d.month), format: '', status: `Waiting for ${w.contractors.length} contractor${w.contractors.length === 1 ? '' : 's'}` },
        ]),
      ]
    : sample;
  const ests = d ? d.establishments.map((e) => e.name) : ['Hosur plant', 'Bengaluru head office'];
  const chart = d ? d.chart : { months: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'], series: [{ name: 'Hosur plant', values: [58, 61, 63, 64, 66, 66] }, { name: 'Bengaluru head office', values: [8, 8, 8, 8, 8, 8] }] };
  const rowButtons = (r: Row) => {
    if (!live) return r.status === 'Frozen' ? <Button size="sm">Sign with DSC</Button> : r.status === 'Signed' ? <Button size="sm" icon={Download}>PDF</Button> : null;
    if (!r.live) return null;
    const x = r.live;
    return (
      <>
        <Button size="sm" icon={Download} loading={busy === `d-${x.id}`} onClick={() => void go(`d-${x.id}`, () => live.onDownload(x.id))}>
          PDF
        </Button>
        {live.canSign && x.status === 'generated' && (
          <Button size="sm" loading={busy === `f-${x.id}`} onClick={() => void go(`f-${x.id}`, () => live.onFreeze(x.id), `${r.name} frozen.`)}>
            Freeze
          </Button>
        )}
        {live.canSign && x.status === 'frozen' && <FileButton label="Sign with DSC" accept=".pdf,application/pdf" ariaLabel={`Upload the signed ${r.name}`} loading={busy === `s-${x.id}`} onFile={(f) => void go(`s-${x.id}`, () => live.onSign(x.id, f), `${r.name} signed.`)} />}
      </>
    );
  };
  const months = live?.months ?? [];
  const actions = live ? (
    <>
      <FormField label="Month" hideLabel>
        <Select aria-label="Month" value={live.month} onChange={(v) => v && live.onMonth(v)} options={months} />
      </FormField>
      {d?.canMake && (
        <Button variant="primary" icon={Plus} onClick={() => setMaking(true)}>
          Make registers
        </Button>
      )}
    </>
  ) : (
    <Button icon={Download}>Inspection pack</Button>
  );
  const rd = live?.returns.data ?? null;
  const returnsCards = rd
    ? rd.returns.map((x) => ({ ...x, live: true }))
    : [{ locationId: 'hsr', location: 'Hosur plant', title: 'Annual return of the principal employer', due: '2027-02-15', figures: { contractors: 3, workers: 74, maxWorkersOnADay: 68, daysWorked: 17940, wagesPaid: '2,61,40,000' }, filed: null, live: false }];
  const year = live?.returns.year ?? 2026;
  const body = (
    <>
      {failed && <InlineAlert tone="danger" title="Not done">{failed}</InlineAlert>}
      <FilterBar fields={[multi('est', 'Establishment', ests)]} value={filters} onChange={setFilters} />
      <Tabs value={current} onValueChange={(v) => setCurrent(v as typeof current)}>
        <TabsList aria-label="Registers and returns">
          <TabsTrigger value="registers">Registers</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
        </TabsList>
        <TabsContent value="registers">
          <div className="yx-ops-stack">
            <BarChart title="Contract workers on site, by month" xLabel="Month" categories={chart.months.map((m) => monthWord(m).split(' ')[0]!)} series={chart.series} stacked loading={loading || live?.state === 'loading'} />
            <DataTable
              label="Registers"
              columns={[
                { key: 'n', header: 'Register', value: (r: Row) => r.name, width: 260 },
                { key: 'est', header: 'Establishment', value: (r) => r.est },
                { key: 'p', header: 'Period', value: (r) => r.period },
                { key: 'f', header: 'Format', type: 'id', value: (r) => r.format, width: 240 },
                { key: 's', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Signed' ? 'success' : v === 'Frozen' ? 'info' : v === 'Made' ? 'neutral' : 'warning') },
              ]}
              rows={applyFilters(registers, filters)}
              getRowId={(r) => r.id}
              state={loading || live?.state === 'loading' ? 'loading' : 'ready'}
              empty={<EmptyState compact title="No registers for this month." description={d?.canMake ? 'Make them once the month has ended.' : 'The compliance owner makes them after the month ends.'} />}
              rowButtons={rowButtons}
            />
            {d && <p className="yx-ops-muted">The muster roll's days come from the contractors' wage registers until site attendance is live. Freeze a register, then sign the frozen PDF with the company DSC and upload it.</p>}
          </div>
        </TabsContent>
        <TabsContent value="returns">
          <div className="yx-ops-stack">
            {live && (
              <FormField label="Year" hideLabel>
                <Select aria-label="Year" value={String(year)} onChange={(v) => v && live.returns.onYear(Number(v))} options={live.returns.years.map((y) => ({ value: String(y), label: String(y) }))} />
              </FormField>
            )}
            {live && live.returns.state === 'ready' && !returnsCards.length && <EmptyState compact title={`No contract workers worked at any establishment in ${year}.`} />}
            {returnsCards.map((r) => (
              <Card key={r.locationId} title={`${r.title} ${year} · ${r.location}`}>
                <div className="yx-ops-stack">
                  <StatusTrail steps={[{ label: 'Drafted from the year’s data' }, { label: r.filed ? `Filed on ${formatDate(new Date(`${r.filed.on}T00:00:00`))} · ${r.filed.reference}` : 'Filed on the portal' }]} current={r.filed ? 1 : 0} />
                  <Facts items={[{ label: 'Contractors', value: r.figures.contractors }, { label: 'Max workers on any day', value: r.figures.maxWorkersOnADay }, { label: 'Days worked', value: r.figures.daysWorked.toLocaleString('en-IN') }, { label: 'Due', value: formatDate(new Date(`${r.due}T00:00:00`)) }]} />
                  <Actions>
                    <Button icon={FileText} loading={busy === `r-${r.locationId}`} onClick={() => live && void go(`r-${r.locationId}`, () => live.returns.onDraft(r.locationId, year))}>
                      Open draft
                    </Button>
                    {live && rd?.canFile && !r.filed && <Button onClick={() => setFiling(r.locationId)}>Record filing</Button>}
                  </Actions>
                </div>
              </Card>
            ))}
            {rd && <p className="yx-ops-muted">Filing is on the government portal; record the day and the portal’s reference here. {rd.daysNote}.</p>}
          </div>
        </TabsContent>
      </Tabs>
      {making && live && d && <MakeRegistersDialog month={monthWord(d.month)} establishments={d.establishments} existing={new Set(d.registers.map((r) => r.locationId ?? ''))} onClose={() => setMaking(false)} onMake={(loc, reason) => live.onMake(loc, reason)} />}
      {filing && live && <RecordFilingDialog place={returnsCards.find((r) => r.locationId === filing)?.location ?? ''} year={year} onClose={() => setFiling(null)} onFiled={(input) => live.returns.onFiled(filing, year, input)} />}
    </>
  );
  const title = 'Registers & returns';
  const description = 'Generated from contractor, worker and wage records in the format valid for each state and period; frozen and signed with the company DSC.';
  if (live)
    return (
      <LivePage title={title} description={description} actions={actions} state={live.state} onRetry={live.onRetry} what="the contract labour registers" grantedBy="an admin (the contract labour key)">
        {body}
      </LivePage>
    );
  return (
    <OpsDesk area="contract" active="CLRA registers & returns">
      <PageHeader title={title} description={description} actions={actions} />
      {body}
    </OpsDesk>
  );
}

/** Make the month's registers for one establishment; a new version over existing ones needs a reason. */
function MakeRegistersDialog({ month, establishments, existing, onClose, onMake }: { month: string; establishments: { id: string; name: string }[]; existing: Set<string>; onClose: () => void; onMake: (locationId: string, reason?: string) => Promise<unknown> }) {
  const [loc, setLoc] = useState<string | null>(establishments.length === 1 ? establishments[0]!.id : null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useSay();
  const again = Boolean(loc && existing.has(loc));
  const bad = { loc: !loc ? 'Choose the establishment.' : null, reason: again && reason.trim().length < 3 ? 'Say why a new version is needed.' : null };
  const go = () => {
    setTried(true);
    if (bad.loc || bad.reason) return;
    setBusy(true);
    setFailed(null);
    onMake(loc!, again ? reason.trim() : undefined)
      .then(() => (toast({ tone: 'success', title: `Registers made for ${month}` }), onClose()))
      .catch((e: Error) => setFailed(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="md" title={`Make the ${month} registers`} description="Made from the deployments and the contractors’ wage registers, in the state’s format. A new version keeps the earlier one as replaced." notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}>Make registers</Button></>}>
      <div className="yx-ops-stack">
        <FormField id="mr-loc" label="Establishment" required error={tried ? bad.loc : null}>
          <Select value={loc} onChange={setLoc} options={establishments.map((e) => ({ value: e.id, label: e.name }))} placeholder="Choose" />
        </FormField>
        {again && (
          <FormField id="mr-reason" label="Why a new version" required error={tried ? bad.reason : null}>
            <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
          </FormField>
        )}
      </div>
    </Dialog>
  );
}

/** Answer 630: the return was filed on the portal; record the day and the portal's reference (once). */
function RecordFilingDialog({ place, year, onClose, onFiled }: { place: string; year: number; onClose: () => void; onFiled: (input: { filedOn: string; reference: string }) => Promise<unknown> }) {
  const [on, setOn] = useState<Date | null>(null);
  const [reference, setReference] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useSay();
  const bad = { on: !on ? 'Choose the day it was filed.' : null, ref: reference.trim().length < 3 ? 'Give the portal’s reference.' : null };
  const go = () => {
    setTried(true);
    if (bad.on || bad.ref) return;
    setBusy(true);
    setFailed(null);
    onFiled({ filedOn: isoDay(on!), reference: reference.trim() })
      .then(() => (toast({ tone: 'success', title: `${year} return recorded as filed` }), onClose()))
      .catch((e: Error) => setFailed(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="md" title={`Record the ${year} return as filed`} description={`${place}. Filed on the government portal; this records the day and its reference. It cannot be changed afterwards.`} notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}>Record filing</Button></>}>
      <div className="yx-ops-stack">
        <FormField id="rf-on" label="Filed on" required error={tried ? bad.on : null}>
          <DatePicker value={on} onChange={setOn} />
        </FormField>
        <FormField id="rf-ref" label="Portal reference" required error={tried ? bad.ref : null}>
          <TextField value={reference} onChange={setReference} maxLength={60} />
        </FormField>
      </div>
    </Dialog>
  );
}

/* =========================================================================================
 * CLB-05 · Convert contract worker to employee (T5)
 * ======================================================================================= */

/** GET lifecycle/joiners/from-contract-worker/:deploymentId (CL-7, answer 637). */
export interface ConversionData {
  deploymentId: string;
  version: number;
  /** False with `block` when the worker cannot be converted now (not deployed, already an employee or a joiner). */
  canStart: boolean;
  block: string | null;
  person: { id: string; name: string; email: string | null; phone: string | null };
  /** They worked here before as an employee: they join again on their own record (a rehire). */
  rehire: boolean;
  contractor: string;
  site: { id: string; name: string; legalEntityId: string } | null;
  fromOn: string;
  gatePass: string | null;
  uan: string | null;
  esicIp: string | null;
  idMasked: string;
  today: string;
}
export interface ConversionInput {
  joiningOn: string;
  legalEntityId: string;
  locationId: string;
  departmentId: string | null;
  designationId: string | null;
  employmentTypeId: string | null;
  managerEmployeeId: string | null;
  version: number;
}
type Choice = { value: string; label: string };
/** CLB-05 live: the PPL-12 joiner flow with the contract_worker source. */
export interface LiveConvert {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  data: ConversionData | null;
  places: { entities: Choice[]; locations: (Choice & { entityId: string })[]; departments: Choice[]; designations: Choice[]; employmentTypes: Choice[]; managers: Choice[] };
  /** False while acting for someone else. */
  canChange: boolean;
  onStart: (input: ConversionInput) => Promise<{ id: string }>;
  /** Opens the new joiner's onboarding checklist. */
  onDone: (preboardingId: string) => void;
}

const dayOf = (s: string) => new Date(`${s}T00:00:00`);
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayBefore = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);

const NO_WORKER: ContractWorker = { id: '', name: '', contractor: '', site: '', skill: 'Unskilled', wage: null, from: new Date(0), to: null, gatePass: null, gateValidTo: null, uan: '', ip: '', idMasked: '', status: 'Deployed' };

/** The design's sample worker, or (live) the worker loaded from the API. */
export function ConvertWorkerScreen({ worker = NO_WORKER, current = 'person', finishing, live }: { worker?: ContractWorker; current?: string; finishing?: boolean; live?: LiveConvert }) {
  const d = live?.data ?? null;
  const name = d ? d.person.name : worker.name;
  const contractor = d ? d.contractor : worker.contractor;
  const site = d ? (d.site?.name ?? '') : worker.site;
  const places = live?.places;
  const [step, setStep] = useState(current);
  const [joining, setJoining] = useState<Date | null>(live ? null : new Date(2026, 9, 1));
  const [entity, setEntity] = useState<string | null>(live ? (d?.site?.legalEntityId ?? null) : 'tn');
  const [location, setLocation] = useState<string | null>(live ? (d?.site?.id ?? null) : 'hsr');
  const [dept, setDept] = useState<string | null>(null);
  const [desig, setDesig] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [manager, setManager] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useSay();
  const from = d ? dayOf(d.fromOn) : worker.from;
  const lastDay = joining ? dayBefore(joining) : null;
  const joinErr = !joining ? 'Choose the joining date.' : joining <= from ? `Join after ${formatDate(from)}, when the deployment started.` : live && d && isoOf(joining) < d.today ? 'The joining date cannot be in the past.' : null;
  const placeErr = { entity: !entity ? 'Choose the legal entity.' : null, location: !location ? 'Choose the location.' : null };
  const [tried, setTried] = useState(false);
  const show = (e: string | null) => (tried ? e : null);
  const entityLocs = (places?.locations ?? []).filter((l) => l.entityId === entity);
  const stepOk = (id: string) => (id === 'employee' ? !joinErr && !placeErr.entity && !placeErr.location : id === 'person' ? !d?.block : true);
  const finish = () => {
    setTried(true);
    if (!live || !d) return;
    if (d.block) return void setStep('person');
    if (!stepOk('employee')) return void setStep('employee');
    setBusy(true);
    setFailed(null);
    live
      .onStart({ joiningOn: isoOf(joining!), legalEntityId: entity!, locationId: location!, departmentId: dept, designationId: desig, employmentTypeId: type, managerEmployeeId: manager, version: d.version })
      .then((r) => {
        toast({ tone: 'success', title: `${name} joins on ${formatDate(joining!)}`, description: 'Pre-boarding started. The contract role ends the day before.' });
        live.onDone(r.id);
      })
      .catch((e: Error) => setFailed(e.message))
      .finally(() => setBusy(false));
  };
  const carry = d
    ? [
        { id: 'person', status: 'pass' as const, label: 'Same person record', detail: d.rehire ? 'Worked here before as an employee: joins again on the same record (rehire)' : 'No second record is made' },
        { id: 'uan', status: d.uan ? ('pass' as const) : ('warn' as const), label: d.uan ? `UAN ${d.uan}` : 'No UAN on the deployment', detail: d.uan ? 'Raised on the employee record on the joining day for HR to approve' : 'HR adds it after joining if the person has one' },
        { id: 'ip', status: d.esicIp ? ('pass' as const) : ('warn' as const), label: d.esicIp ? `ESIC IP ${d.esicIp}` : 'No ESIC IP number on the deployment', detail: d.esicIp ? 'Raised on the employee record on the joining day for HR to approve' : 'HR adds it after joining if the person has one' },
        { id: 'id', status: 'warn' as const, label: `ID ${d.idMasked}`, detail: 'Only the last 4 digits are kept; check the original ID on the joining day' },
      ]
    : [
        { id: 'person', status: 'pass' as const, label: 'Same person record', detail: 'No second record is made' },
        { id: 'uan', status: 'pass' as const, label: `UAN ${worker.uan}`, detail: 'Raised on the employee record on the joining day for HR to approve' },
        { id: 'ip', status: 'pass' as const, label: `ESIC IP ${worker.ip}`, detail: 'Raised on the employee record on the joining day for HR to approve' },
        { id: 'id', status: 'warn' as const, label: `ID ${worker.idMasked}`, detail: 'Only the last 4 digits are kept; check the original ID on the joining day' },
      ];
  const stepper = (
    <Stepper
      title="Convert contract worker to employee"
      current={step}
      onCurrentChange={setStep}
      onContinue={(id) => {
        if (stepOk(id)) return true;
        setTried(true);
        return false;
      }}
      finishLabel="Start pre-boarding"
      finishing={finishing || busy}
      onFinish={finish}
      review={{ title: 'Check and start', note: failed ? <InlineAlert tone="danger" title="Not started">{failed}</InlineAlert> : <InlineAlert tone="info">{name} joins the Onboarding board as a joiner. Nothing changes for them as a contract worker until the joining day.</InlineAlert> }}
      steps={[
        {
          id: 'person',
          title: 'Same person',
          content: (
            <div className="yx-ops-stack">
              <span className="yx-ops-row">
                <PhotoPlaceholder name={name} size="lg" />
                <DescriptionList items={[{ label: 'Person', value: `${name} · ID ${d ? d.idMasked : worker.idMasked}` }, { label: 'Now', value: `Contract worker, ${contractor}, ${site}` }, { label: 'UAN', value: (d ? d.uan : worker.uan) || '—', mono: true }]} />
              </span>
              {d?.block ? (
                <InlineAlert tone="danger" title="Can't convert now">{d.block}</InlineAlert>
              ) : (
                <CheckList label="Duplicate check" items={[{ id: 'd', status: 'pass', label: d?.rehire ? 'A former employee: joins again on their own record' : 'No current employee or joiner record for this person', detail: 'The same person record is used' }]} />
              )}
            </div>
          ),
          summary: `${name}, same person record`,
        },
        {
          id: 'end',
          title: 'End contract role',
          content: (
            <div className="yx-ops-stack">
              <DescriptionList items={[{ label: 'Last day as contract worker', value: lastDay ? `${formatDate(lastDay)}: the day before joining` : 'The day before the joining date (chosen next)' }, { label: 'Gate pass', value: (d ? d.gatePass : worker.gatePass) ?? '—' }]} />
              <InlineAlert tone="info">On the joining day the deployment with {contractor} ends, the gate pass stops working after the last day, and the contract-worker role closes. Earlier punches, deployments and register rows stay as contract-worker records.</InlineAlert>
            </div>
          ),
          summary: lastDay ? `Contract role ends ${formatDate(lastDay)}` : 'Contract role ends the day before joining',
        },
        {
          id: 'employee',
          title: 'Employee details',
          content: (
            <div className="yx-ops-stack">
              <FieldRow>
                <FormField id="cv-entity" label="Legal entity" required error={show(placeErr.entity)}>
                  <Select value={entity} onChange={(v) => (setEntity(v), setLocation(null))} options={places ? places.entities : [{ value: 'tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }]} placeholder="Choose" />
                </FormField>
                <FormField id="cv-location" label="Location" required error={show(placeErr.location)}>
                  <Select value={location} onChange={setLocation} options={places ? entityLocs : [{ value: 'hsr', label: 'Hosur plant' }]} placeholder="Choose" />
                </FormField>
              </FieldRow>
              <FieldRow>
                <FormField id="cv-joining" label="Joining date" required error={show(joinErr)} helper="The contract role ends the day before.">
                  <DatePicker value={joining} onChange={setJoining} />
                </FormField>
                <FormField label="Designation" optional>
                  <Select value={desig} onChange={setDesig} options={places ? places.designations : [{ value: 'hk', label: 'Housekeeping associate' }]} placeholder="Choose" />
                </FormField>
              </FieldRow>
              <FieldRow>
                <FormField label="Department" optional>
                  <Select value={dept} onChange={setDept} options={places ? places.departments : [{ value: 'fac', label: 'Facilities' }]} placeholder="Choose" />
                </FormField>
                <FormField label="Employment type" optional>
                  <Select value={type} onChange={setType} options={places ? places.employmentTypes : [{ value: 'perm', label: 'Permanent' }]} placeholder="Choose" />
                </FormField>
              </FieldRow>
              <FormField label="Manager" optional>
                <Select value={manager} onChange={setManager} options={places ? places.managers : [{ value: 'm', label: 'Ravi Shankar' }]} placeholder="Choose" />
              </FormField>
              <p className="yx-ops-muted">Department, designation and employment type can be added on the checklist before the joining day. Pay is set in Pay after joining.</p>
            </div>
          ),
          summary: joining ? `Joins ${formatDate(joining)}` : 'Joining date not chosen',
        },
        {
          id: 'carry',
          title: 'Carry over',
          content: <CheckList label="Carried over" items={carry} />,
          summary: 'The same person; UAN and ESIC IP raised on the employee record',
        },
      ]}
    />
  );
  const title = `Make ${name} an employee`;
  const description = 'The same person record is kept. They join through pre-boarding; on the joining day the contract-worker role ends and the employee record starts.';
  if (live)
    return (
      <LivePage title={title} description={description} state={live.state} onRetry={live.onRetry} what="this contract worker" grantedBy="an admin (the onboarding key)">
        {!live.canChange && <InlineAlert tone="info">You are acting for someone else: you can read this, not convert.</InlineAlert>}
        {stepper}
      </LivePage>
    );
  return (
    <OpsDesk area="contract" active="Contract workers">
      <PageHeader title={title} description={description} />
      {stepper}
    </OpsDesk>
  );
}

/* =========================================================================================
 * CLB-06 · Client establishments (contractor tenant)
 * ======================================================================================= */

export interface ClientEst {
  id: string;
  client: string;
  site: string;
  principal: string;
  rc: string;
  deployed: number;
  max: number;
  portal: string;
  state: string;
}
export function ClientEstablishmentsScreen({ clients, state = 'ready', openId = null }: { clients: ClientEst[]; state?: ListState; openId?: string | null }) {
  const [open, setOpen] = useState<string | null>(openId);
  const c = clients.find((x) => x.id === open);
  return (
    <OpsDesk area="contractor" active="Client establishments">
      <PageHeader title="Client establishments" description="Sites where your employees work as contract labour. The client is the principal employer." actions={<Button variant="primary" icon={Plus}>Add client site</Button>} />
      <DataTable
        label="Client establishments"
        columns={[
          { key: 'client', header: 'Client', value: (x: ClientEst) => x.client, width: 200 },
          { key: 'site', header: 'Site', value: (x) => x.site, width: 200 },
          { key: 'rc', header: 'Principal registration', type: 'id', value: (x) => x.rc, width: 220 },
          { key: 'dep', header: 'Deployed / licence max', value: (x) => x.deployed, render: (x) => (x.max ? <Meter label={`${x.site} deployment`} value={x.deployed} max={x.max} warnAt={90} dangerAt={100} valueText={`${x.deployed} of ${x.max}`} /> : <Badge tone="danger">No licence covers this site</Badge>), width: 220 },
          { key: 'portal', header: 'Pack goes to', value: (x) => x.portal },
        ]}
        rows={state === 'empty' ? [] : clients}
        getRowId={(x) => x.id}
        state={state === 'empty' ? 'ready' : state}
        empty={<EmptyState title="No client sites yet." description="Add each site where you deploy staff, with the client's registration number." />}
        onRowClick={(x) => setOpen(x.id)}
        activeRowId={open}
      />
      <Drawer open={!!c} onOpenChange={(o) => !o && setOpen(null)} size="lg" title={c ? `${c.client} · ${c.site}` : ''} subtitle={c ? `Principal employer: ${c.principal}` : ''}>
        {c && (
          <div className="yx-ops-stack">
            <DescriptionList items={[{ label: 'Registration', value: c.rc, mono: true }, { label: 'State', value: c.state }, { label: 'Deployed', value: `${c.deployed} employees` }, { label: 'Monthly pack', value: `Due 10th of next month, via ${c.portal}` }]} />
            {c.deployed >= c.max && c.max > 0 && <InlineAlert tone="warning">At the licence maximum. Deploying one more is blocked until the licence is amended.</InlineAlert>}
            {c.max === 0 && <InlineAlert tone="danger">Your licences don't cover Kerala. Deployment here is blocked.</InlineAlert>}
          </div>
        )}
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * CLB-07 · Own licences (contractor tenant)
 * ======================================================================================= */

export interface OwnLicence {
  no: string;
  scope: string;
  states: string;
  max: number;
  deployed: number;
  validTo: Date;
  authority: string;
}
export function OwnLicencesScreen({ licences, today, blocked }: { licences: OwnLicence[]; today: Date; blocked?: boolean }) {
  return (
    <OpsDesk area="contractor" active="Own licences">
      <PageHeader title="Own licences" description="Your contractor licences per client establishment, or single licences covering several sites or states." actions={<Button variant="primary" icon={Plus}>Add licence</Button>} />
      {blocked && <InlineAlert tone="danger" title="Deployment blocked">A 51st guard for Nilgiri Pharma Ltd, Ambattur: licence TN/OSH/CL/2026/2211 allows 50. Amend the licence or deploy elsewhere.</InlineAlert>}
      <DataTable
        label="Own licences"
        columns={[
          { key: 'no', header: 'Licence', type: 'id', value: (l: OwnLicence) => l.no, width: 200 },
          { key: 'scope', header: 'Scope', value: (l) => l.scope, width: 260 },
          { key: 'states', header: 'States', value: (l) => l.states },
          { key: 'use', header: 'Deployed / max', value: (l) => l.deployed, render: (l) => <Meter label={`${l.no} usage`} value={l.deployed} max={l.max} warnAt={90} dangerAt={100} valueText={`${l.deployed} of ${l.max}`} />, width: 200 },
          { key: 'valid', header: 'Valid to', value: (l) => l.validTo, render: (l) => { const t = expiryTone(l.validTo, today); return <span className="yx-ops-row">{formatDate(l.validTo)}<Badge tone={t.tone}>{t.text}</Badge></span>; }, width: 240 },
          { key: 'auth', header: 'Authority', value: (l) => l.authority, width: 240 },
        ]}
        rows={licences}
        getRowId={(l) => l.no}
        rowButtons={(l) => (expiryTone(l.validTo, today).tone !== 'success' ? <Button size="sm">Start renewal</Button> : null)}
        empty={<EmptyState title="No licences yet." description="Add a licence before deploying staff to a client site." />}
      />
    </OpsDesk>
  );
}

/* =========================================================================================
 * CLB-08 · Client compliance packs (contractor tenant)
 * ======================================================================================= */

export interface ClientPack {
  client: string;
  month: string;
  items: string[];
  status: 'Generated' | 'Uploaded' | 'Accepted' | 'Overdue';
  due: Date;
  uploaded: Date | null;
  ref: string;
}
const PACK_TONE = { Generated: 'info', Uploaded: 'warning', Accepted: 'success', Overdue: 'danger' } as const;
export function ClientPacksScreen({ packs, recordOpen }: { packs: ClientPack[]; recordOpen?: boolean }) {
  const [open, setOpen] = useState(!!recordOpen);
  const overdue = packs.filter((p) => p.status === 'Overdue');
  return (
    <OpsDesk area="contractor" active="Client compliance packs" counts={{ 'Client compliance packs': overdue.length }}>
      <PageHeader title="Client compliance packs" description="Built each month from payroll and attendance for the staff you deploy at each client. Record the upload to the client's portal." />
      {overdue.length > 0 && <PageBanner tone="danger">{overdue.length} pack is overdue. HR and the account owner have been told.</PageBanner>}
      <CardGrid min="lg">
        {packs.map((p) => (
          <article key={p.client + p.month} className="yx-ops-card" data-tone={p.status === 'Overdue' ? 'danger' : undefined}>
            <div className="yx-ops-card__head">
              <div>
                <h3 className="yx-ops-card__title">
                  {p.client} · {p.month}
                </h3>
                <span className="yx-ops-card__sub">Due {formatDate(p.due)}</span>
              </div>
              <Badge tone={PACK_TONE[p.status]}>{p.status === 'Uploaded' ? 'Uploaded, awaiting acceptance' : p.status}</Badge>
            </div>
            <StatusTrail steps={[{ label: 'Generated' }, { label: 'Uploaded to client' }, { label: 'Accepted' }]} current={p.status === 'Accepted' ? 3 : p.status === 'Uploaded' ? 2 : 1} failed={p.status === 'Overdue'} />
            <ul className="yx-ops-row yx-ops-plain" aria-label="Pack contents">
              {p.items.map((i) => (
                <li key={i}>
                  <Badge tone="neutral">{i}</Badge>
                </li>
              ))}
            </ul>
            {p.uploaded && <p className="yx-ops-muted">Uploaded {formatDate(p.uploaded)} · {p.ref}</p>}
            <Actions>
              <Button size="sm" icon={Download}>Download pack</Button>
              {!p.uploaded && (
                <Button size="sm" onClick={() => setOpen(true)}>
                  Record upload
                </Button>
              )}
            </Actions>
          </article>
        ))}
      </CardGrid>
      <Drawer open={open} onOpenChange={setOpen} title="Record portal upload" subtitle="Nilgiri Pharma Ltd · Sep 2026" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary">Save upload</Button></>}>
        <div className="yx-ops-stack">
          <FormField label="Uploaded on" required>
            <DatePicker value={new Date(2026, 8, 29)} onChange={() => {}} />
          </FormField>
          <FormField label="Portal reference" required>
            <TextField />
          </FormField>
          <FormField label="Acknowledgement" optional>
            <FileUpload accept={['.pdf', '.png']} upload={async () => {}} />
          </FormField>
        </div>
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * CL-5 · Contract workers' attendance (answer 625): the month per contractor and site, confirmed by the site in-charge
 * ======================================================================================= */

export interface AttendanceRow {
  contractorId: string;
  contractor: string;
  site: { id: string; name: string };
  contractorEnters: boolean;
  confirmed: { at: string; days: number } | null;
  workers: { deploymentId: string; name: string; gatePass: string | null; present: number; days: { day: string; source: string }[] }[];
}
export interface AttendanceMonthProps {
  month: string;
  months?: string[];
  rows: AttendanceRow[];
  canManage: boolean;
  canConfirm: boolean;
  state?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  onMonth?: (month: string) => void;
  onConfirm?: (contractorId: string, locationId: string, month: string) => Promise<unknown>;
  /** The design opens the confirmation for this row. */
  confirmOpen?: string | null;
}

export function AttendanceMonthScreen(p: AttendanceMonthProps) {
  const { say } = useSay();
  const [confirming, setConfirming] = useState<string | null>(p.confirmOpen ?? null);
  const row = p.rows.find((r) => `${r.contractorId}:${r.site.id}` === confirming);
  return (
    <OpsDesk area="contract" active="Contract workers">
      <PageHeader
        title="Contract workers' attendance"
        description={`Days on site in ${monthText(p.month)}: kiosk punches with the gate pass number and PIN, or the contractor's entry where a site has no kiosk. Confirm a month once it ends; it is then locked and used in the wage check.`}
        actions={p.months && p.months.length > 1 && p.onMonth ? <Select value={p.month} onChange={(v) => v && p.onMonth!(v)} options={p.months.map((m) => ({ value: m, label: monthText(m) }))} /> : undefined}
      />
      {p.state === 'error' ? (
        <EmptyState title="This page could not be loaded." action={<Button onClick={p.onRetry}>Try again</Button>} />
      ) : p.rows.length === 0 ? (
        <EmptyState title={p.state === 'loading' ? 'Loading…' : 'No contract workers were deployed this month.'} />
      ) : (
        p.rows.map((r) => (
          <Card
            key={`${r.contractorId}:${r.site.id}`}
            title={`${r.contractor} · ${r.site.name}`}
            actions={
              <span className="yx-ops-row">
                <Badge tone="neutral">{r.contractorEnters ? 'Entered by the contractor' : 'Kiosk'}</Badge>
                {r.confirmed ? <Badge tone="success">Confirmed</Badge> : p.canManage && p.canConfirm ? <Button size="sm" variant="primary" onClick={() => setConfirming(`${r.contractorId}:${r.site.id}`)}>Confirm month</Button> : <Badge tone="info">Open</Badge>}
              </span>
            }
          >
            <PlainTable
              label={`Attendance, ${r.contractor}, ${r.site.name}`}
              rows={r.workers}
              getRowId={(w) => w.deploymentId}
              columns={[
                { key: 'n', header: 'Worker', rowHeader: true, cell: (w) => w.name },
                { key: 'g', header: 'Gate pass', cell: (w) => <span className="yx-ops-mono">{w.gatePass ?? '—'}</span> },
                { key: 'p', header: 'Days on site', cell: (w) => String(w.present) },
              ]}
            />
          </Card>
        ))
      )}
      {row && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirming(null)}
          title={`Confirm ${row.contractor}'s ${monthText(p.month)} at ${row.site.name}?`}
          consequence={`${row.workers.reduce((n, w) => n + w.present, 0)} days on site for ${row.workers.length} workers. The month is then locked: no more punches or entries, and the wage check uses these days.`}
          confirmLabel="Confirm month"
          onConfirm={() => void (p.onConfirm ? p.onConfirm(row.contractorId, row.site.id, p.month) : Promise.resolve()).then(() => (say('Month confirmed'), setConfirming(null)), (e: unknown) => say(errText(e)))}
        />
      )}
    </OpsDesk>
  );
}

/** Answer 673: a site's principal-employer registration (Settings 4.9). */
export interface RegistrationInput {
  locationId: string;
  registrationNo: string;
  maxWorkers: number;
  validTo: string | null;
  version?: number;
}
export function RegistrationSheet({ initial, sites, onClose, onSave, onRemove }: { initial: (RegistrationInput & { id: string }) | null; sites: { id: string; name: string }[]; onClose: () => void; onSave: (input: RegistrationInput) => Promise<unknown>; onRemove?: () => Promise<unknown> }) {
  const { say } = useSay();
  const [site, setSite] = useState<string | null>(initial?.locationId ?? null);
  const [no, setNo] = useState(initial?.registrationNo ?? '');
  const [max, setMax] = useState<number | null>(initial?.maxWorkers ?? null);
  const [to, setTo] = useState<Date | null>(initial?.validTo ? new Date(`${initial.validTo}T00:00:00`) : null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = { site: !site ? 'Choose the site.' : null, no: !no.trim() ? 'Enter the registration number.' : null, max: !max || max < 1 ? 'Enter the maximum contract workers it allows.' : null };
  const save = () => {
    setTried(true);
    const order: [keyof typeof bad, string][] = [['site', 'rg-site'], ['no', 'rg-no'], ['max', 'rg-max']];
    const miss = order.find(([k]) => bad[k]);
    if (miss) return focusOn(miss[1]);
    setBusy(true);
    setFailed(null);
    onSave({ locationId: site!, registrationNo: no.trim(), maxWorkers: max!, validTo: to ? isoDay(to) : null, ...(initial?.version ? { version: initial.version } : {}) })
      .then(() => (say(initial ? 'Registration saved' : 'Registration added'), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} size="md" title={initial ? 'Change registration' : 'Add registration'} subtitle="Principal-employer registration" dirty notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<>{initial && onRemove && <Button onClick={() => void onRemove().then(() => (say('Registration removed'), onClose()), (e: unknown) => setFailed(errText(e)))}>Remove</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{initial ? 'Save registration' : 'Add registration'}</Button></>}>
      <div className="yx-ops-stack">
        <FormField id="rg-site" label="Establishment" required error={tried ? bad.site : null}>
          <Select options={sites.map((s) => ({ value: s.id, label: s.name }))} value={site} onChange={setSite} />
        </FormField>
        <FormField id="rg-no" label="Registration number" required error={tried ? bad.no : null}>
          <TextField value={no} onChange={setNo} maxLength={60} />
        </FormField>
        <FieldRow>
          <FormField id="rg-max" label="Maximum contract workers" required error={tried ? bad.max : null}>
            <NumberField value={max} onChange={setMax} min={1} max={100000} />
          </FormField>
          <FormField id="rg-to" label="Valid to" optional>
            <DatePicker value={to} onChange={setTo} />
          </FormField>
        </FieldRow>
      </div>
    </Drawer>
  );
}
