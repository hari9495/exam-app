// Contract labour screens (M13, P07 IN.CLRA / IN.OSH): CLB-01 contractors, CLB-02 contract workers, CLB-03 vendor compliance,
// CLB-04 CLRA registers & returns, CLB-05 convert worker to employee, CLB-06 client establishments, CLB-07 own licences,
// CLB-08 client compliance packs.
import { useState } from 'react';
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
import { deployBlocks, expiryTone } from './ops-rules';
import type { ListState } from './helpdesk';
import type { ContractWorker, Contractor, Licence, ProofStatus, WorkOrder } from './contract-data';
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
  establishments: { name: string; state: string; rc: string; family: string; workers: number; threshold: number; validTo: Date | null; licenceMax?: number }[];
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
              <Facts items={[{ label: 'Contract workers', value: e.workers }, ...(e.licenceMax !== undefined ? [{ label: 'Licence maximum', value: e.licenceMax, tone: e.workers > e.licenceMax ? ('danger' as const) : undefined }] : []), { label: 'Threshold (OSH Code, verify)', value: e.threshold }]} />
              <p className="yx-ops-muted">{e.rc === '—' ? `No registration needed below ${e.threshold} contract workers.` : `${e.family} registration ${e.rc}, valid to ${formatDate(e.validTo)}`}</p>
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
        <LicenceSheet mode="renew" current={target.l} locations={p.locations} states={p.states} contractor={target.c.name} onClose={() => setSheet(null)} onSave={(input, file) => (p.onRenew ? p.onRenew(sheet.licenceId, { licenceNo: input.licenceNo, maxWorkers: input.maxWorkers, validFrom: input.validFrom, validTo: input.validTo }, file) : Promise.resolve())} />
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
  states: string[];
  maxWorkers: number;
  validFrom: string;
  validTo: string;
}
export type RenewalInput = Pick<LicenceInput, 'licenceNo' | 'maxWorkers' | 'validFrom' | 'validTo'>;

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
    onSave({ locationId: loc ?? '', licenceNo: no.trim(), scope: scope.trim(), states: covered, maxWorkers: max!, validFrom: isoDay(from), validTo: isoDay(to) }, file!)
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
export type WorkersSheet = { kind: 'deploy' } | { kind: 'approve'; id: string } | { kind: 'release'; id: string };

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
            <Button size="sm" onClick={() => setSheet({ kind: 'release', id: w.id })}>Release</Button>
          ) : null
        }
      />
      {sheet?.kind === 'deploy' && <DeployWorkerSheet {...p} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'approve' && target && <ApproveWorkerDialog worker={target} today={today} required={p.inductionRequired} months={p.inductionMonths} onClose={() => setSheet(null)} onApprove={(induction) => (p.onApprove ? p.onApprove(target.id, target.version ?? 1, induction) : Promise.resolve(say('Approved')))} />}
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
function ApproveWorkerDialog({ worker, today, required, months, onClose, onApprove }: { worker: ContractWorker; today: Date; required: boolean; months: number; onClose: () => void; onApprove: (induction: { on: string | null; by: string | null }) => Promise<unknown> }) {
  const { say } = useSay();
  const [on, setOn] = useState<Date | null>(worker.induction ? worker.induction.on : null);
  const [by, setBy] = useState(worker.induction?.by ?? '');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = {
    on: required && !on ? 'Enter the day of the safety induction.' : on && on > today ? 'The induction cannot be in the future.' : null,
    by: required && !by.trim() ? 'Enter who gave the induction.' : null,
  };
  const go = () => {
    setTried(true);
    if (bad.on) return focusOn('ap-on');
    if (bad.by) return focusOn('ap-by');
    setBusy(true);
    setFailed(null);
    onApprove({ on: on ? isoDay(on) : null, by: by.trim() || null })
      .then(() => (say(`${worker.name} approved; gate pass issued`), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="md" title={`Approve ${worker.name}?`} description={`${worker.contractor} · ${worker.site}. The checks run again; the gate pass ends with the deployment, the licence or the induction (${months} months), whichever comes first.`} notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}>Approve and issue gate pass</Button></>}>
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
        description={`Monthly proofs from each contractor for ${p.month} wages${p.due ? `, due by ${p.due}` : ''}. You can be liable for unpaid wages and dues.`}
        facts={`${p.alerts.length} liability alerts · estimated exposure ${formatINR(exposure)}`}
        actions={p.months && p.months.length > 1 && p.onMonth ? <Select value={p.month} onChange={(v) => v && p.onMonth!(v)} options={p.months.map((m) => ({ value: m, label: m }))} /> : undefined}
      />
      {p.holdMode === 'alert' && <InlineAlert tone="info" title="Bills are not held">Your company chose alerts only (Settings › Contract labour). Overdue or disputed proofs still raise liability alerts.</InlineAlert>}
      {p.state === 'error' ? (
        <EmptyState title="This page could not be loaded." action={<Button onClick={p.onRetry}>Try again</Button>} />
      ) : (
        <Card title={`Compliance matrix · ${p.month}`}>
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

export function ClraRegistersScreen({ loading, tab = 'registers' }: { loading?: boolean; tab?: 'registers' | 'returns' }) {
  const [current, setCurrent] = useState(tab);
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const registers = [
    { id: 'r1', name: 'Register of contractors', est: 'Hosur plant', period: 'Aug 2026', format: 'IN.REGISTERS TN OSH 2025-11-T', status: 'Signed' },
    { id: 'r2', name: 'Register of workmen, Sri Lakshmi Facility Services', est: 'Hosur plant', period: 'Aug 2026', format: 'IN.REGISTERS TN OSH 2025-11-T', status: 'Signed' },
    { id: 'r3', name: 'Muster roll (from kiosk punches)', est: 'Hosur plant', period: 'Aug 2026', format: 'IN.REGISTERS TN OSH 2025-11-T', status: 'Frozen' },
    { id: 'r4', name: 'Wage register (contractor uploads)', est: 'Hosur plant', period: 'Aug 2026', format: 'IN.REGISTERS TN OSH 2025-11-T', status: 'Waiting for 2 contractors' },
    { id: 'r5', name: 'Register of contractors', est: 'Bengaluru head office', period: 'Aug 2026', format: 'IN.REGISTERS KA OSH 2025-11', status: 'Signed' },
  ];
  return (
    <OpsDesk area="contract" active="CLRA registers & returns">
      <PageHeader title="Registers & returns" description="Generated from contractor, worker and attendance records in the format valid for each state and period; frozen on period lock and signed with the company DSC." actions={<Button icon={Download}>Inspection pack</Button>} />
      <FilterBar fields={[multi('est', 'Establishment', ['Hosur plant', 'Bengaluru head office'])]} value={filters} onChange={setFilters} />
      <Tabs value={current} onValueChange={(v) => setCurrent(v as typeof current)}>
        <TabsList aria-label="Registers and returns">
          <TabsTrigger value="registers">Registers</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
        </TabsList>
        <TabsContent value="registers">
          <div className="yx-ops-stack">
            <BarChart title="Contract workers on site, by month" xLabel="Month" categories={['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']} series={[{ name: 'Hosur plant', values: [58, 61, 63, 64, 66, 66] }, { name: 'Bengaluru head office', values: [8, 8, 8, 8, 8, 8] }]} stacked loading={loading} />
            <DataTable
              label="Registers"
              columns={[
                { key: 'n', header: 'Register', value: (r: (typeof registers)[number]) => r.name, width: 300 },
                { key: 'e', header: 'Establishment', value: (r) => r.est },
                { key: 'p', header: 'Period', value: (r) => r.period },
                { key: 'f', header: 'Format', type: 'id', value: (r) => r.format, width: 220 },
                { key: 's', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Signed' ? 'success' : v === 'Frozen' ? 'info' : 'warning') },
              ]}
              rows={applyFilters(registers, filters)}
              getRowId={(r) => r.id}
              state={loading ? 'loading' : 'ready'}
              rowButtons={(r) => (r.status === 'Frozen' ? <Button size="sm">Sign with DSC</Button> : r.status === 'Signed' ? <Button size="sm" icon={Download}>PDF</Button> : null)}
            />
          </div>
        </TabsContent>
        <TabsContent value="returns">
          <Card title="Annual return 2026 · Hosur plant (principal employer)">
            <div className="yx-ops-stack">
              <StatusTrail steps={[{ label: 'Drafted from the year’s data' }, { label: 'Reviewed' }, { label: 'Signed' }, { label: 'Filed' }]} current={0} />
              <Facts items={[{ label: 'Contractors', value: 3 }, { label: 'Max workers on any day', value: 68 }, { label: 'Days worked', value: '17,940' }, { label: 'Due', value: '15 Feb 2027' }]} />
              <Actions>
                <Button icon={FileText}>Open draft</Button>
              </Actions>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </OpsDesk>
  );
}

/* =========================================================================================
 * CLB-05 · Convert contract worker to employee (T5)
 * ======================================================================================= */

export function ConvertWorkerScreen({ worker, current = 'person', finishing }: { worker: ContractWorker; current?: string; finishing?: boolean }) {
  const [joining, setJoining] = useState<Date | null>(new Date(2026, 9, 1));
  const [ctc, setCtc] = useState<number | null>(264000);
  return (
    <OpsDesk area="contract" active="Contract workers">
      <PageHeader title={`Make ${worker.name} an employee`} description="The same person record is kept. The contract-worker role ends and an employee role starts, carrying identity and documents over." />
      <Stepper
        key={current}
        title="Convert contract worker to employee"
        defaultCurrent={current}
        finishLabel="Create employee"
        finishing={finishing}
        review={{ title: 'Check and create' }}
        steps={[
          {
            id: 'person',
            title: 'Same person',
            content: (
              <div className="yx-ops-stack">
                <span className="yx-ops-row">
                  <PhotoPlaceholder name={worker.name} size="lg" />
                  <DescriptionList items={[{ label: 'Person', value: `${worker.name} · ID ${worker.idMasked}` }, { label: 'Now', value: `Contract worker, ${worker.contractor}, ${worker.site}` }, { label: 'UAN', value: worker.uan, mono: true }]} />
                </span>
                <CheckList label="Duplicate check" items={[{ id: 'd', status: 'pass', label: 'No other employee or applicant record for this person', detail: 'Matched on ID, date of birth and mobile' }]} />
              </div>
            ),
            summary: `${worker.name}, same person record`,
          },
          {
            id: 'end',
            title: 'End contract role',
            content: (
              <div className="yx-ops-stack">
                <FormField label="Last day as contract worker" required>
                  <DatePicker value={new Date(2026, 8, 30)} onChange={() => {}} />
                </FormField>
                <Checkbox defaultChecked label={`Tell ${worker.contractor} and release the deployment`} description={`Gate pass ${worker.gatePass} is voided on that day`} />
                <InlineAlert tone="info">Earlier punches, deployments and register rows stay as contract-worker records.</InlineAlert>
              </div>
            ),
            summary: 'Contract role ends 30 Sep 2026',
          },
          {
            id: 'employee',
            title: 'Employee details',
            content: (
              <div className="yx-ops-stack">
                <FieldRow>
                  <FormField label="Legal entity" required>
                    <Select value="tn" onChange={() => {}} options={[{ value: 'tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }]} />
                  </FormField>
                  <FormField label="Joining date" required>
                    <DatePicker value={joining} onChange={setJoining} />
                  </FormField>
                </FieldRow>
                <FieldRow>
                  <FormField label="Designation" required>
                    <TextField defaultValue="Housekeeping associate" />
                  </FormField>
                  <FormField label="Annual CTC" required>
                    <CurrencyField value={ctc} onChange={setCtc} />
                  </FormField>
                </FieldRow>
              </div>
            ),
            summary: `Housekeeping associate from ${formatDate(joining)}, ${formatINR(ctc ?? 0)} a year`,
          },
          {
            id: 'carry',
            title: 'Carry over',
            content: (
              <CheckList
                label="Carried over"
                items={[
                  { id: 'id', status: 'pass', label: 'Identity and photo' },
                  { id: 'uan', status: 'pass', label: 'UAN and ESI IP number', detail: 'PF / ESI continue under the new employer code' },
                  { id: 'docs', status: 'pass', label: 'Documents: ID proof, address proof, bank details' },
                  { id: 'bio', status: 'pass', label: 'Kiosk and biometric enrolment', detail: 'Kept: the device map follows the person; punches from the joining date count as employee punches' },
                  { id: 'bgv', status: 'warn', label: 'Background verification', detail: 'Last done 14 months ago; company policy asks for a fresh check' },
                ]}
              />
            ),
            summary: 'Identity, statutory IDs, documents and enrolment carried over',
          },
        ]}
      />
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

