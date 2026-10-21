// Contract labour, live (founder decision 21 Oct 2026): CLB-01 Contractors and CLB-02 Contract workers as designed, with
// real data. Each worker is one person record with a contract_worker role. Presentational: the API checks the keys and
// their reach (company, legal entity or site) and runs the deployment checks again.
import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Meter } from '../../../components/feedback';
import { FieldRow, FormField } from '../../../components/field';
import { TextField } from '../../../components/inputs';
import { PageBanner, useToast } from '../../../components/notify';
import { ConfirmDialog } from '../../../components/overlay';
import { MultiSelect, Select } from '../../../components/select';
import { Card, DescriptionList, PageHeader } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { FilterBar, type FilterFieldDef } from '../../../components/filters';
import { DatePicker } from '../../../components/date';
import { formatDate, formatINR } from '../../../lib/format';
import type { FilterValue } from '../../../lib/table';
import { CheckList } from '../ops-kit';
import { deployBlocks, expiryTone } from '../ops-rules';

export type LoadState = 'loading' | 'ready' | 'error' | 'no-access';

/** Indian states and union territories (ISO 3166-2:IN), for licence scope. */
export const IN_STATES: Record<string, string> = {
  'IN-AN': 'Andaman and Nicobar Islands', 'IN-AP': 'Andhra Pradesh', 'IN-AR': 'Arunachal Pradesh', 'IN-AS': 'Assam', 'IN-BR': 'Bihar', 'IN-CH': 'Chandigarh', 'IN-CT': 'Chhattisgarh',
  'IN-DH': 'Dadra and Nagar Haveli and Daman and Diu', 'IN-DL': 'Delhi', 'IN-GA': 'Goa', 'IN-GJ': 'Gujarat', 'IN-HP': 'Himachal Pradesh', 'IN-HR': 'Haryana', 'IN-JH': 'Jharkhand',
  'IN-JK': 'Jammu and Kashmir', 'IN-KA': 'Karnataka', 'IN-KL': 'Kerala', 'IN-LA': 'Ladakh', 'IN-LD': 'Lakshadweep', 'IN-MH': 'Maharashtra', 'IN-ML': 'Meghalaya', 'IN-MN': 'Manipur',
  'IN-MP': 'Madhya Pradesh', 'IN-MZ': 'Mizoram', 'IN-NL': 'Nagaland', 'IN-OR': 'Odisha', 'IN-PB': 'Punjab', 'IN-PY': 'Puducherry', 'IN-RJ': 'Rajasthan', 'IN-SK': 'Sikkim',
  'IN-TG': 'Telangana', 'IN-TN': 'Tamil Nadu', 'IN-TR': 'Tripura', 'IN-UP': 'Uttar Pradesh', 'IN-UT': 'Uttarakhand', 'IN-WB': 'West Bengal',
};
const stateName = (code: string) => IN_STATES[code] ?? code;
const D = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const isoOf = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');

export interface LiveLicence {
  id: string;
  licenceNo: string;
  locationId: string;
  site: string;
  states: string[];
  maxWorkers: number;
  /** Waiting for approval or deployed under this licence. */
  active: number;
  validFrom: string;
  validTo: string;
}
export interface LiveContractor {
  id: string;
  legalEntityId: string;
  name: string;
  work: string;
  pan: string | null;
  contact: string | null;
  status: 'active' | 'inactive';
  licences: LiveLicence[];
}
export interface LiveWorker {
  id: string;
  personId: string;
  name: string;
  contractorId: string;
  contractor: string;
  licenceNo: string;
  legalEntity: { id: string; name: string | null };
  site: { id: string; name: string | null };
  work: string;
  skill: 'unskilled' | 'semi_skilled' | 'skilled';
  wage: string | null;
  fromOn: string;
  toOn: string | null;
  status: 'pending' | 'deployed' | 'released';
}
export interface LiveSite {
  id: string;
  name: string;
  state: string;
  legalEntityId: string;
}
export interface DeployInput {
  contractorId: string;
  licenceId: string;
  locationId: string;
  givenName: string;
  familyName?: string;
  phone?: string;
  dateOfBirth: string;
  work: string;
  skill: LiveWorker['skill'];
  wage?: string;
  fromOn: string;
}

const SKILL: Record<LiveWorker['skill'], string> = { unskilled: 'Unskilled', semi_skilled: 'Semi-skilled', skilled: 'Skilled' };
const STATUS: Record<LiveWorker['status'], string> = { pending: 'Pending approval', deployed: 'Deployed', released: 'Released' };
const multi = (key: string, label: string, values: string[]): FilterFieldDef => ({ key, label, type: 'multi', options: [...new Set(values)].sort().map((v) => ({ value: v, label: v })) });

/* ========================================================================== CLB-02 · Contract workers (live) */

export interface ContractWorkersLiveProps {
  state: LoadState;
  onRetry?: () => void;
  today: string;
  workers: LiveWorker[];
  contractors: LiveContractor[];
  sites: LiveSite[];
  canManage: boolean;
  onDeploy: (input: DeployInput) => Promise<unknown>;
  onApprove: (w: LiveWorker) => Promise<unknown>;
  onRelease: (w: LiveWorker) => Promise<unknown>;
  /** Open the deploy drawer at once (?deploy=1 from the Directory's Add). */
  defaultDeployOpen?: boolean;
}

export function ContractWorkersLiveScreen(p: ContractWorkersLiveProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [open, setOpen] = useState(Boolean(p.defaultDeployOpen && p.canManage));
  // The page knows the person may deploy only once their keys load: open the form then (?deploy=1).
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (p.defaultDeployOpen && p.canManage && !asked) {
      setOpen(true);
      setAsked(true);
    }
  }, [p.defaultDeployOpen, p.canManage, asked]);
  const [releasing, setReleasing] = useState<LiveWorker | null>(null);
  const rows = useMemo(
    () =>
      p.workers
        .map((w) => ({ ...w, contractorName: w.contractor, siteName: w.site.name ?? '', statusText: STATUS[w.status] }))
        .filter((w) => filters.every((f) => f.type !== 'multi' || !f.values.length || f.values.includes(String((w as Record<string, unknown>)[f.key])))),
    [p.workers, filters],
  );
  type Row = (typeof rows)[number];
  const cols: TableColumn<Row>[] = [
    { key: 'name', header: 'Worker', type: 'person', value: (w) => w.name, person: (w) => ({ name: w.name, secondary: w.work }), width: 220 },
    { key: 'contractor', header: 'Contractor', value: (w) => w.contractor, groupable: true, width: 200 },
    { key: 'site', header: 'Site', value: (w) => w.siteName },
    { key: 'from', header: 'Deployed from', type: 'date', value: (w) => D(w.fromOn) },
    { key: 'licence', header: 'Licence', type: 'id', value: (w) => w.licenceNo },
    { key: 'skill', header: 'Skill', value: (w) => SKILL[w.skill] },
    { key: 'wage', header: 'Wage (by contractor)', type: 'money', value: (w) => (w.wage === null ? null : Number(w.wage)) },
    { key: 'status', header: 'Status', type: 'status', value: (w) => w.statusText, statusTone: (v) => (v === 'Deployed' ? 'success' : v === 'Pending approval' ? 'warning' : 'neutral') },
  ];
  return (
    <div className="yx-auth__page">
      <PageHeader
        title="Contract workers"
        description="Deployed by contractors. Not employees: their punches never create payroll inputs. Each worker is one person record, so history follows them."
        actions={p.state === 'ready' && p.canManage ? <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Deploy worker</Button> : undefined}
      />
      <DataTable
        label="Contract workers"
        columns={cols}
        rows={p.state === 'ready' ? rows : []}
        getRowId={(w) => w.id}
        state={p.state === 'loading' ? 'loading' : p.state === 'error' ? 'error' : 'ready'}
        onRetry={p.onRetry}
        empty={<EmptyState title="No contract workers deployed." description={p.canManage ? 'Deploy a worker for a contractor with a valid licence.' : 'Workers appear here once HR deploys them.'} />}
        filtered={filters.length > 0}
        onClearFilters={() => setFilters([])}
        toolbar={<FilterBar fields={[multi('contractorName', 'Contractor', p.workers.map((w) => w.contractor)), multi('siteName', 'Site', p.workers.map((w) => w.site.name ?? '')), multi('statusText', 'Status', Object.values(STATUS))]} value={filters} onChange={setFilters} />}
        rowButtons={
          p.canManage
            ? (w) =>
                w.status === 'pending' ? (
                  <Button variant="approve" size="sm" onClick={() => void p.onApprove(w).then(() => toast({ tone: 'success', title: `${w.name} is deployed at ${w.site.name}` }))}>
                    Approve
                  </Button>
                ) : w.status === 'deployed' ? (
                  <Button size="sm" onClick={() => setReleasing(w)}>
                    Release
                  </Button>
                ) : null
            : undefined
        }
      />
      {p.canManage && <DeployDrawer {...p} open={open} onOpenChange={setOpen} />}
      <ConfirmDialog
        open={Boolean(releasing)}
        onOpenChange={(o) => !o && setReleasing(null)}
        title={`Release ${releasing?.name ?? ''}?`}
        consequence={`${releasing?.name ?? ''} leaves ${releasing?.site.name ?? 'the site'} today and is no longer counted against ${releasing?.contractor ?? 'the contractor'}'s licence. Their person record and history stay.`}
        confirmLabel="Release worker"
        destructive
        onConfirm={async () => {
          if (!releasing) return;
          await p.onRelease(releasing);
          toast({ tone: 'success', title: `${releasing.name} is released` });
          setReleasing(null);
        }}
      />
    </div>
  );
}

function DeployDrawer(p: ContractWorkersLiveProps & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const usable = p.contractors.filter((k) => k.status === 'active' && k.licences.length);
  const [contractorId, setContractorId] = useState<string | null>(usable[0]?.id ?? null);
  const contractor = usable.find((k) => k.id === contractorId) ?? null;
  const [licenceId, setLicenceId] = useState<string | null>(null);
  const lic = contractor?.licences.find((l) => l.id === licenceId) ?? contractor?.licences[0] ?? null;
  const sites = p.sites.filter((s) => s.legalEntityId === contractor?.legalEntityId);
  const [siteId, setSiteId] = useState<string | null>(null);
  const site = sites.find((s) => s.id === (siteId ?? lic?.locationId)) ?? null;
  const [given, setGiven] = useState('');
  const [family, setFamily] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [work, setWork] = useState('');
  const [skill, setSkill] = useState<LiveWorker['skill']>('unskilled');
  const [wage, setWage] = useState('');
  const [from, setFrom] = useState<Date | null>(D(p.today));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blocks =
    lic && site && from
      ? // The age is checked once the date of birth is in; the licence checks run straight away.
        deployBlocks({ dob: dob ?? new Date(1970, 0, 1), on: from, licenceValidTo: from >= D(lic.validFrom) ? D(lic.validTo) : null, licenceMax: lic.maxWorkers, activeDeployments: lic.active, licenceStates: lic.states.map(stateName), siteState: stateName(site.state) })
      : [];
  const has = (t: string) => blocks.some((b) => b.includes(t));
  const ready = Boolean(contractor && lic && site && given.trim() && work.trim() && dob && from && !blocks.length && (!wage || /^\d+(\.\d{1,2})?$/.test(wage.replace(/,/g, ''))));
  return (
    <Drawer
      open={p.open}
      onOpenChange={p.onOpenChange}
      size="lg"
      title="Deploy a worker"
      subtitle={contractor && site ? `${contractor.name} · ${site.name} (${stateName(site.state)})` : 'Choose a contractor with a licence'}
      footer={
        <>
          <Button onClick={() => p.onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!ready}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await p.onDeploy({ contractorId: contractor!.id, licenceId: lic!.id, locationId: site!.id, givenName: given.trim(), ...(family.trim() ? { familyName: family.trim() } : {}), ...(phone.trim() ? { phone: phone.trim() } : {}), dateOfBirth: isoOf(dob), work: work.trim(), skill, ...(wage ? { wage: wage.replace(/,/g, '') } : {}), fromOn: isoOf(from) });
                toast({ tone: 'success', title: `${given.trim()} sent for site approval`, description: `${contractor!.name} · ${site!.name}` });
                p.onOpenChange(false);
                setGiven('');
                setFamily('');
                setPhone('');
                setDob(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'The worker was not deployed. Try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Send for site approval
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {!usable.length && <InlineAlert tone="warning" title="No contractor with a licence">Add a contractor and their licence first, on Contractors.</InlineAlert>}
        <FieldRow>
          <FormField label="Contractor" required>
            <Select value={contractorId} onChange={(v) => { setContractorId(v); setLicenceId(null); setSiteId(null); }} options={usable.map((k) => ({ value: k.id, label: k.name }))} />
          </FormField>
          <FormField label="Licence" required>
            <Select value={lic?.id ?? null} onChange={(v) => { setLicenceId(v); setSiteId(null); }} options={(contractor?.licences ?? []).map((l) => ({ value: l.id, label: `${l.licenceNo} · ${l.site}` }))} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Site" required>
            <Select value={site?.id ?? null} onChange={setSiteId} options={sites.map((s) => ({ value: s.id, label: s.name }))} />
          </FormField>
          <FormField label="Deployed from" required>
            <DatePicker value={from} onChange={setFrom} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="First name" required>
            <TextField value={given} onChange={setGiven} />
          </FormField>
          <FormField label="Last name" optional>
            <TextField value={family} onChange={setFamily} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Date of birth" required>
            <DatePicker value={dob} onChange={setDob} />
          </FormField>
          <FormField label="Mobile" optional helper="The same mobile on another person record is checked with you first.">
            <TextField value={phone} onChange={setPhone} inputMode="tel" />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Work" required>
            <TextField value={work} onChange={setWork} placeholder="Housekeeping, Security guard…" />
          </FormField>
          <FormField label="Skill category">
            <Select value={skill} onChange={(v) => v && setSkill(v as LiveWorker['skill'])} options={Object.entries(SKILL).map(([value, label]) => ({ value, label }))} />
          </FormField>
        </FieldRow>
        <FormField label="Wage rate paid by contractor" optional helper="A month, in rupees">
          <TextField value={wage} onChange={setWage} prefix="₹" inputMode="decimal" />
        </FormField>
        {lic && site && (
          <CheckList
            label="Deployment checks"
            items={[
              { id: 'age', status: !dob ? 'pending' : has('under 18') ? 'fail' : 'pass', label: 'Age 18 or over' },
              { id: 'lic', status: has('not valid') ? 'fail' : 'pass', label: `Licence ${lic.licenceNo} valid on ${from ? formatDate(from) : 'the deployment date'}`, detail: `Valid ${formatDate(D(lic.validFrom))} to ${formatDate(D(lic.validTo))}` },
              { id: 'scope', status: has('scope') ? 'fail' : 'pass', label: 'Licence scope covers the site', detail: blocks.find((b) => b.includes('scope')) ?? lic.states.map(stateName).join(', ') },
              { id: 'max', status: has('allows') ? 'fail' : 'pass', label: 'Within the licence maximum', detail: blocks.find((b) => b.includes('allows')) ?? `${lic.active} of ${lic.maxWorkers} deployed` },
              { id: 'dup', status: 'pass', label: 'Not already deployed by another contractor', detail: 'Matched on the person record when you send' },
            ]}
          />
        )}
        {blocks.length > 0 && <InlineAlert tone="danger">{blocks.join(' ')}</InlineAlert>}
        {error && <InlineAlert tone="danger" title="That didn’t work">{error}</InlineAlert>}
      </div>
    </Drawer>
  );
}

/* ========================================================================== CLB-01 · Contractors (live) */

export interface LicenceInput {
  licenceNo: string;
  locationId: string;
  states: string[];
  maxWorkers: number;
  validFrom: string;
  validTo: string;
}
export interface ContractorsLiveProps {
  state: LoadState;
  onRetry?: () => void;
  today: string;
  contractors: LiveContractor[];
  entities: { id: string; name: string }[];
  sites: LiveSite[];
  canManage: boolean;
  onAdd: (input: { legalEntityId: string; name: string; work: string; pan?: string; contact?: string; licence: LicenceInput }) => Promise<unknown>;
  onAddLicence: (contractorId: string, licence: LicenceInput) => Promise<unknown>;
}

function LicenceFields({ sites, value, onChange }: { sites: LiveSite[]; value: Partial<LicenceInput>; onChange: (v: Partial<LicenceInput>) => void }) {
  const site = sites.find((s) => s.id === value.locationId);
  return (
    <>
      <FieldRow>
        <FormField label="Licence number" required>
          <TextField value={value.licenceNo ?? ''} onChange={(v) => onChange({ ...value, licenceNo: v })} />
        </FormField>
        <FormField label="Establishment (site)" required>
          <Select value={value.locationId ?? null} onChange={(v) => { const s = sites.find((x) => x.id === v); onChange({ ...value, locationId: v ?? undefined, states: value.states?.length ? value.states : s ? [s.state] : [] }); }} options={sites.map((s) => ({ value: s.id, label: s.name }))} />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="States it covers" required helper={site ? `The site is in ${stateName(site.state)}.` : undefined}>
          <MultiSelect value={value.states ?? []} onChange={(v) => onChange({ ...value, states: v })} options={Object.entries(IN_STATES).map(([code, name]) => ({ value: code, label: name }))} />
        </FormField>
        <FormField label="Most workers allowed" required>
          <TextField value={value.maxWorkers ? String(value.maxWorkers) : ''} onChange={(v) => onChange({ ...value, maxWorkers: Number(v.replace(/\D/g, '')) || undefined })} inputMode="numeric" />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="Valid from" required>
          <DatePicker value={value.validFrom ? D(value.validFrom) : null} onChange={(d) => onChange({ ...value, validFrom: isoOf(d) || undefined })} />
        </FormField>
        <FormField label="Valid to" required>
          <DatePicker value={value.validTo ? D(value.validTo) : null} onChange={(d) => onChange({ ...value, validTo: isoOf(d) || undefined })} />
        </FormField>
      </FieldRow>
    </>
  );
}
const licenceReady = (l: Partial<LicenceInput>): l is LicenceInput => Boolean(l.licenceNo?.trim() && l.locationId && l.states?.length && l.maxWorkers && l.validFrom && l.validTo && l.validTo >= l.validFrom);

export function ContractorsLiveScreen(p: ContractorsLiveProps) {
  const { toast } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ legalEntityId?: string; name?: string; work?: string; pan?: string; contact?: string; licence: Partial<LicenceInput> }>({ licence: {} });
  const [newLicence, setNewLicence] = useState<Partial<LicenceInput> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = D(p.today);
  const open = p.contractors.find((k) => k.id === openId) ?? null;
  const first = (k: LiveContractor) => k.licences[0];
  const cols: TableColumn<LiveContractor>[] = [
    { key: 'name', header: 'Contractor', value: (x) => x.name, width: 240, render: (x) => <span className="yx-ops-stack" data-gap="sm"><strong>{x.name}</strong><span className="yx-ops-muted">{x.work}</span></span> },
    { key: 'pan', header: 'PAN', type: 'id', value: (x) => x.pan ?? '' },
    { key: 'lic', header: 'Licence', value: (x) => first(x)?.licenceNo ?? '', render: (x) => <span className="yx-ops-mono">{first(x)?.licenceNo ?? '—'}</span>, width: 190 },
    { key: 'val', header: 'Validity', value: (x) => first(x)?.validTo ?? '', render: (x) => { const l = first(x); if (!l) return null; const t = expiryTone(D(l.validTo), today); return <span className="yx-ops-stack" data-gap="sm"><span>{formatDate(D(l.validTo))}</span><Badge tone={t.tone}>{t.text}</Badge></span>; }, width: 160 },
    { key: 'use', header: 'Workers / licence max', value: (x) => first(x)?.active ?? 0, render: (x) => { const l = first(x); return l ? <Meter label={`${x.name} workers`} value={l.active} max={l.maxWorkers} warnAt={90} dangerAt={100} valueText={`${l.active} of ${l.maxWorkers}`} /> : null; }, width: 200 },
    { key: 'status', header: 'Status', type: 'status', value: (x) => (x.status === 'active' ? 'Active' : 'Inactive'), statusTone: (v) => (v === 'Active' ? 'success' : 'neutral') },
  ];
  const expiring = p.contractors.filter((k) => k.licences.some((l) => expiryTone(D(l.validTo), today).tone !== 'success'));
  const entitySites = p.sites.filter((s) => s.legalEntityId === draft.legalEntityId);
  const ready = Boolean(draft.legalEntityId && draft.name?.trim() && draft.work?.trim() && (!draft.pan || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(draft.pan)) && licenceReady(draft.licence));
  const save = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast({ tone: 'success', title: done });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="yx-auth__page">
      <PageHeader
        title="Contractors"
        description="Licensed contractors supplying workers to your sites. You are the principal employer."
        actions={p.state === 'ready' && p.canManage ? <Button variant="primary" icon={Plus} onClick={() => { setDraft({ legalEntityId: p.entities[0]?.id, licence: {} }); setError(null); setAdding(true); }}>Add contractor</Button> : undefined}
      />
      {p.state === 'ready' && expiring.length > 0 && (
        <PageBanner tone="warning">
          {expiring.length} contractor {expiring.length === 1 ? 'licence expires' : 'licences expire'} within 60 days or {expiring.length === 1 ? 'has' : 'have'} expired. Deployments stop when a licence isn't valid.
        </PageBanner>
      )}
      <DataTable
        label="Contractors"
        columns={cols}
        rows={p.state === 'ready' ? p.contractors : []}
        getRowId={(x) => x.id}
        state={p.state === 'loading' ? 'loading' : p.state === 'error' ? 'error' : 'ready'}
        onRetry={p.onRetry}
        onRowClick={(x) => { setOpenId(x.id); setNewLicence(null); setError(null); }}
        empty={<EmptyState title="No contractors yet." description={p.canManage ? 'Add a contractor with their licence to deploy workers.' : 'Contractors appear here once HR adds them.'} />}
      />
      <Drawer
        open={Boolean(open)}
        onOpenChange={(o) => !o && setOpenId(null)}
        size="lg"
        title={open?.name ?? ''}
        subtitle={open ? `${open.work}${open.contact ? ` · ${open.contact}` : ''}` : undefined}
        footer={
          open && p.canManage ? (
            newLicence ? (
              <>
                <Button onClick={() => setNewLicence(null)}>Cancel</Button>
                <Button variant="primary" loading={busy} disabled={!licenceReady(newLicence)} onClick={async () => { if (licenceReady(newLicence) && (await save(() => p.onAddLicence(open.id, newLicence), `Licence ${newLicence.licenceNo} added for ${open.name}`))) setNewLicence(null); }}>
                  Add licence
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => setNewLicence({})}>Add licence</Button>
            )
          ) : undefined
        }
      >
        {open && (
          <div className="yx-ops-stack">
            <DescriptionList columns={2} items={[{ label: 'PAN', value: open.pan ?? 'Not given', mono: Boolean(open.pan) }, { label: 'Status', value: open.status === 'active' ? 'Active' : 'Inactive' }]} />
            {open.licences.map((l) => {
              const t = expiryTone(D(l.validTo), today);
              return (
                <Card key={l.id} title={`Licence ${l.licenceNo}`} actions={<Badge tone={t.tone}>{t.text}</Badge>}>
                  <DescriptionList
                    items={[
                      { label: 'Establishment', value: l.site },
                      { label: 'Scope', value: l.states.map(stateName).join(', ') },
                      { label: 'Maximum workers', value: <Meter label={`${l.licenceNo} workers`} value={l.active} max={l.maxWorkers} warnAt={90} dangerAt={100} valueText={`${l.active} of ${l.maxWorkers}`} /> },
                      { label: 'Valid', value: `${formatDate(D(l.validFrom))} to ${formatDate(D(l.validTo))}` },
                    ]}
                  />
                </Card>
              );
            })}
            {newLicence && <LicenceFields sites={p.sites.filter((s) => s.legalEntityId === open.legalEntityId)} value={newLicence} onChange={setNewLicence} />}
            {error && <InlineAlert tone="danger" title="That didn’t work">{error}</InlineAlert>}
          </div>
        )}
      </Drawer>
      <Drawer
        open={adding}
        onOpenChange={setAdding}
        size="lg"
        title="Add contractor"
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!ready}
              onClick={async () => {
                if (!ready) return;
                const ok = await save(() => p.onAdd({ legalEntityId: draft.legalEntityId!, name: draft.name!.trim(), work: draft.work!.trim(), ...(draft.pan ? { pan: draft.pan } : {}), ...(draft.contact?.trim() ? { contact: draft.contact.trim() } : {}), licence: draft.licence as LicenceInput }), `${draft.name!.trim()} added with licence ${draft.licence.licenceNo}`);
                if (ok) setAdding(false);
              }}
            >
              Add contractor
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <FieldRow>
            <FormField label="Principal employer (legal entity)" required>
              <Select value={draft.legalEntityId ?? null} onChange={(v) => setDraft({ ...draft, legalEntityId: v ?? undefined, licence: {} })} options={p.entities.map((e) => ({ value: e.id, label: e.name }))} />
            </FormField>
            <FormField label="Contractor name" required>
              <TextField value={draft.name ?? ''} onChange={(v) => setDraft({ ...draft, name: v })} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="Work they do" required>
              <TextField value={draft.work ?? ''} onChange={(v) => setDraft({ ...draft, work: v })} placeholder="Housekeeping, Security…" />
            </FormField>
            <FormField label="PAN" optional>
              <TextField value={draft.pan ?? ''} onChange={(v) => setDraft({ ...draft, pan: v.toUpperCase().trim() })} aria-invalid={Boolean(draft.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(draft.pan)) || undefined} />
            </FormField>
          </FieldRow>
          <FormField label="Contact person" optional>
            <TextField value={draft.contact ?? ''} onChange={(v) => setDraft({ ...draft, contact: v })} />
          </FormField>
          <LicenceFields sites={entitySites} value={draft.licence} onChange={(l) => setDraft({ ...draft, licence: l })} />
          {error && <InlineAlert tone="danger" title="That didn’t work">{error}</InlineAlert>}
        </div>
      </Drawer>
    </div>
  );
}

/** Rupees in Indian format for summaries. */
export const wageText = (w: string | null) => (w === null ? '' : formatINR(Number(w)));
