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
import { CurrencyField, TextArea, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { ConfirmDialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { BarChart } from '../../components/charts';
import { Stepper } from '../../components/stepper';
import { formatDate, formatINR } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { Actions, CardGrid, CheckList, Facts, OpsDesk, PhotoPlaceholder, ReceiptImage, StatusTrail } from './ops-kit';
import { challanShortfall, deployBlocks, expiryTone } from './ops-rules';
import type { ListState } from './helpdesk';
import type { ContractWorker, Contractor, ProofStatus } from './contract-data';

const multi = (key: string, label: string, values: string[]): FilterFieldDef => ({ key, label, type: 'multi', options: values.map((v) => ({ value: v, label: v })) });
function applyFilters<R>(rows: R[], filters: FilterValue[]): R[] {
  let r = rows;
  for (const f of filters) if (f.type === 'multi' && f.values.length) r = r.filter((x) => f.values.includes(String((x as unknown as Record<string, unknown>)[f.key])));
  return r;
}

/* =========================================================================================
 * CLB-01 · Contractors register (licence, registration, validity, renewal alerts)
 * ======================================================================================= */

export interface ContractorsScreenProps {
  contractors: Contractor[];
  establishments: { name: string; state: string; rc: string; family: string; workers: number; threshold: number; validTo: Date | null }[];
  today: Date;
  state?: ListState;
  openId?: string | null;
}
export function ContractorsScreen({ contractors, establishments, today, state = 'ready', openId = null }: ContractorsScreenProps) {
  const [open, setOpen] = useState<string | null>(openId);
  const c = contractors.find((x) => x.id === open);
  const expiring = contractors.filter((x) => x.licences.some((l) => expiryTone(l.validTo, today).tone !== 'success'));
  const cols: TableColumn<Contractor>[] = [
    { key: 'name', header: 'Contractor', value: (x) => x.name, width: 240, render: (x) => <span className="yx-ops-stack" data-gap="sm"><strong>{x.name}</strong><span className="yx-ops-muted">{x.work}</span></span> },
    { key: 'pan', header: 'PAN', type: 'id', value: (x) => x.pan, render: (x) => <span className="yx-ops-row"><span className="yx-ops-mono">{x.pan}</span>{x.panVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}</span>, width: 200 },
    { key: 'lic', header: 'Licence', value: (x) => x.licences[0]?.no, render: (x) => <span className="yx-ops-mono">{x.licences[0]?.no}</span>, width: 190 },
    { key: 'val', header: 'Validity', value: (x) => x.licences[0]?.validTo, render: (x) => { const t = expiryTone(x.licences[0].validTo, today); return <span className="yx-ops-stack" data-gap="sm"><span>{formatDate(x.licences[0].validTo)}</span><Badge tone={t.tone}>{t.text}</Badge></span>; }, width: 160 },
    { key: 'use', header: 'Workers / licence max', value: (x) => x.licences[0].active, render: (x) => <Meter label={`${x.name} workers`} value={x.licences[0].active} max={x.licences[0].max} warnAt={90} dangerAt={100} valueText={`${x.licences[0].active} of ${x.licences[0].max}`} />, width: 200 },
    { key: 'status', header: 'Status', type: 'status', value: (x) => x.status, statusTone: (v) => (v === 'Payment held' ? 'danger' : v === 'Active' ? 'success' : 'neutral') },
  ];
  return (
    <OpsDesk area="contract" active="Contractors">
      <PageHeader title="Contractors" description="Licensed contractors supplying workers to your sites. You are the principal employer." actions={<Button variant="primary" icon={Plus}>Add contractor</Button>} />
      {expiring.length > 0 && <PageBanner tone="warning">{expiring.length} contractor licences expire within 60 days or have expired. Deployments stop when a licence isn't valid.</PageBanner>}
      <CardGrid>
        {establishments.map((e) => (
          <article key={e.name} className="yx-ops-card" data-tone={e.workers >= e.threshold && e.rc === '—' ? 'danger' : undefined}>
            <div className="yx-ops-card__head">
              <h3 className="yx-ops-card__title">{e.name}</h3>
              <Badge tone={e.rc === '—' ? (e.workers >= e.threshold ? 'danger' : 'neutral') : 'success'}>{e.rc === '—' ? (e.workers >= e.threshold ? 'Registration needed' : 'Below threshold') : 'Registered'}</Badge>
            </div>
            <Facts items={[{ label: 'Contract workers', value: e.workers }, { label: 'Threshold (OSH Code, verify)', value: e.threshold }]} />
            <p className="yx-ops-muted">{e.rc === '—' ? `No registration needed below ${e.threshold} contract workers.` : `${e.family} registration ${e.rc}, valid to ${formatDate(e.validTo)}`}</p>
          </article>
        ))}
      </CardGrid>
      <DataTable label="Contractors" columns={cols} rows={state === 'empty' ? [] : contractors} getRowId={(x) => x.id} state={state === 'empty' ? 'ready' : state} onRetry={() => {}} empty={<EmptyState title="No contractors yet." description="Add a contractor with their licence to deploy workers." action={<Button variant="primary" icon={Plus}>Add contractor</Button>} />} onRowClick={(x) => setOpen(x.id)} activeRowId={open} />
      <Drawer open={!!c} onOpenChange={(o) => !o && setOpen(null)} size="lg" title={c?.name ?? ''} subtitle={c ? `${c.work} · contact ${c.contact}` : ''} footer={<><Button>Invite to contractor login</Button><Button variant="primary">Add licence</Button></>}>
        {c && (
          <div className="yx-ops-stack">
            <DescriptionList columns={2} items={[{ label: 'PAN', value: c.pan, mono: true }, { label: 'GSTIN', value: c.gstin, mono: true }, { label: 'PF code', value: c.pfCode, mono: true }, { label: 'ESIC code', value: c.esicCode, mono: true }, { label: 'LIN', value: c.lin, mono: true }, { label: 'Contractor login', value: c.loginInvited ? 'Invited (OTP, own records only, not billed)' : 'Not invited' }]} />
            {c.licences.map((l) => {
              const t = expiryTone(l.validTo, today);
              return (
                <Card key={l.no} title={`Licence ${l.no}`} actions={<Badge tone={t.tone}>{t.text}</Badge>}>
                  <DescriptionList items={[{ label: 'Establishment', value: l.establishment }, { label: 'Scope', value: `${l.scope} (${l.states.join(', ')})` }, { label: 'Maximum workers', value: l.max }, { label: 'Valid to', value: formatDate(l.validTo) }, { label: 'Renewal alerts', value: '60, 30 and 7 days before expiry' }]} />
                </Card>
              );
            })}
            <Card title="Work order">
              <DescriptionList items={[{ label: 'Scope', value: `${c.work}, ${c.licences[0].establishment}` }, { label: 'Headcount', value: c.licences[0].max }, { label: 'Period', value: '1 Apr 2026 to 31 Mar 2027' }]} />
            </Card>
          </div>
        )}
      </Drawer>
    </OpsDesk>
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
  deploy?: 'ok' | 'limit' | 'underage' | 'scope' | null;
}
export function WorkersScreen({ workers, contractors, today, state = 'ready', deploy = null }: WorkersScreenProps) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [open, setOpen] = useState(!!deploy);
  const [dob, setDob] = useState<Date | null>(deploy === 'underage' ? new Date(2009, 4, 12) : new Date(1994, 6, 3));
  const lic = contractors[0].licences[0];
  const blocks = deployBlocks({
    dob: dob ?? new Date(1990, 0, 1),
    on: today,
    licenceValidTo: lic.validTo,
    licenceMax: lic.max,
    activeDeployments: deploy === 'limit' ? lic.max : lic.max - 5,
    licenceStates: lic.states,
    siteState: deploy === 'scope' ? 'Kerala' : 'Tamil Nadu',
  });
  const cols: TableColumn<ContractWorker>[] = [
    { key: 'name', header: 'Worker', value: (w) => w.name, render: (w) => <span className="yx-ops-row"><PhotoPlaceholder name={w.name} size="sm" /><span className="yx-ops-stack" data-gap="sm"><strong>{w.name}</strong><span className="yx-ops-muted">ID {w.idMasked}</span></span></span>, width: 220 },
    { key: 'contractor', header: 'Contractor', value: (w) => w.contractor, groupable: true, width: 200 },
    { key: 'site', header: 'Site', value: (w) => w.site },
    { key: 'from', header: 'Deployed from', type: 'date', value: (w) => w.from },
    { key: 'gate', header: 'Gate pass', type: 'id', value: (w) => w.gatePass },
    { key: 'skill', header: 'Skill', value: (w) => w.skill },
    { key: 'wage', header: 'Wage (by contractor)', type: 'money', value: (w) => w.wage },
    { key: 'uan', header: 'UAN', type: 'id', value: (w) => w.uan },
    { key: 'ip', header: 'ESI IP', type: 'id', value: (w) => w.ip },
    { key: 'status', header: 'Status', type: 'status', value: (w) => w.status, statusTone: (v) => (v === 'Deployed' ? 'success' : v === 'Pending approval' ? 'warning' : 'neutral') },
  ];
  const rows = applyFilters(workers, filters);
  return (
    <OpsDesk area="contract" active="Contract workers" counts={{ 'Contract workers': workers.filter((w) => w.status === 'Deployed').length }}>
      <PageHeader title="Contract workers" description="Deployed by contractors. Not employees: their punches never create payroll inputs. Each worker is one person record, so history follows them." actions={<><Button icon={Upload}>Import list</Button><Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Deploy worker</Button></>} />
      <DataTable
        label="Contract workers"
        columns={cols}
        rows={state === 'empty' ? [] : rows}
        getRowId={(w) => w.id}
        state={state === 'empty' ? 'ready' : state}
        onRetry={() => {}}
        empty={<EmptyState title="No contract workers deployed." description="Contractors add workers from their login, or you import a list." />}
        filtered={filters.length > 0}
        onClearFilters={() => setFilters([])}
        toolbar={<FilterBar fields={[multi('contractor', 'Contractor', contractors.map((c) => c.name)), multi('site', 'Site', ['Hosur plant', 'Bengaluru head office']), multi('status', 'Status', ['Deployed', 'Pending approval', 'Released'])]} value={filters} onChange={setFilters} searchPlaceholder="Search name, gate pass or UAN" />}
        rowButtons={(w) => (w.status === 'Pending approval' ? <Button variant="approve" size="sm">Approve</Button> : w.status === 'Deployed' ? <Button size="sm">Release</Button> : null)}
        onExport={() => {}}
      />
      <Drawer open={open} onOpenChange={setOpen} size="lg" title="Deploy a worker" subtitle={`${contractors[0].name} · ${deploy === 'scope' ? 'Kochi warehouse (Kerala)' : 'Hosur plant'}`} footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={blocks.length > 0}>Send for site approval</Button></>}>
        <div className="yx-ops-stack">
          <FieldRow>
            <FormField label="Name" required>
              <TextField defaultValue="Kannan S." />
            </FormField>
            <FormField label="Date of birth" required>
              <DatePicker value={dob} onChange={setDob} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="Skill category">
              <Select value="unskilled" onChange={() => {}} options={[{ value: 'unskilled', label: 'Unskilled' }, { value: 'semi', label: 'Semi-skilled' }, { value: 'skilled', label: 'Skilled' }]} />
            </FormField>
            <FormField label="Wage rate paid by contractor" helper="Minimum for Tamil Nadu, zone B, unskilled: ₹14,820 a month">
              <CurrencyField value={14820} onChange={() => {}} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="UAN" optional>
              <TextField />
            </FormField>
            <FormField label="ESI IP number" optional>
              <TextField />
            </FormField>
          </FieldRow>
          <CheckList
            label="Deployment checks"
            items={[
              { id: 'age', status: blocks.some((b) => b.includes('under 18')) ? 'fail' : 'pass', label: 'Age 18 or over' },
              { id: 'lic', status: blocks.some((b) => b.includes('not valid')) ? 'fail' : 'pass', label: `Licence ${lic.no} valid on ${formatDate(today)}` },
              { id: 'scope', status: blocks.some((b) => b.includes('scope')) ? 'fail' : 'pass', label: 'Licence scope covers the site', detail: blocks.find((b) => b.includes('scope')) },
              { id: 'max', status: blocks.some((b) => b.includes('allows')) ? 'fail' : 'pass', label: 'Within licence and registration maximum', detail: blocks.find((b) => b.includes('allows')) },
              { id: 'dup', status: 'pass', label: 'Not already deployed by another contractor', detail: 'Matched on the person record' },
            ]}
          />
          {blocks.length > 0 && <InlineAlert tone="danger">{blocks.join(' ')}</InlineAlert>}
        </div>
      </Drawer>
    </OpsDesk>
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
}
export function VendorComplianceScreen({ month, proofTypes, matrix, alerts, verifyOpen, overrideOpen, persona = 'compliance' }: VendorComplianceProps) {
  const [verify, setVerify] = useState(!!verifyOpen);
  const [override, setOverride] = useState(!!overrideOpen);
  const short = challanShortfall(12, 14);
  return (
    <OpsDesk area="contract" active="Vendor compliance" counts={{ 'Vendor compliance': alerts.length }}>
      <PageHeader title="Vendor compliance" description={`Monthly proofs from each contractor for ${month} wages, due by 15 Oct 2026. You can be liable for unpaid wages and dues.`} facts={`${alerts.length} liability alerts · estimated exposure ${formatINR(alerts.reduce((s, a) => s + a.liability, 0))}`} />
      <Card title={`Compliance matrix · ${month}`}>
        <div className="yx-ops-scroll">
          <table className="yx-ops-matrix" aria-label="Contractor by proof type">
            <thead>
              <tr>
                <th scope="col">Contractor</th>
                {proofTypes.map((p) => (
                  <th key={p} scope="col">
                    {p}
                  </th>
                ))}
                <th scope="col">Bill payment</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((m) => {
                const held = m.statuses.some((s) => s === 'Overdue' || s === 'Discrepancy');
                return (
                  <tr key={m.contractor}>
                    <th scope="row">{m.contractor}</th>
                    {m.statuses.map((s, i) => (
                      <td key={i}>
                        {s === 'Discrepancy' || s === 'Submitted' ? (
                          <button type="button" className="yx-ops-cellbtn" onClick={() => setVerify(true)} aria-label={`${proofTypes[i]}, ${m.contractor}: ${s}. Open verification`}>
                            <Badge tone={PROOF_TONE[s]}>{s}</Badge>
                          </button>
                        ) : (
                          <Badge tone={PROOF_TONE[s]}>{s}</Badge>
                        )}
                      </td>
                    ))}
                    <td>{held ? <span className="yx-ops-row"><Badge tone="danger">Held</Badge>{persona === 'compliance' && <Button size="sm" onClick={() => setOverride(true)}>Override</Button>}</span> : <Badge tone="success">Can be paid</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Liability alerts">
        <DataTable
          label="Liability alerts"
          columns={[
            { key: 't', header: 'Alert', value: (a: VendorComplianceProps['alerts'][number]) => a.type, width: 200 },
            { key: 'c', header: 'Contractor', value: (a) => a.contractor, width: 200 },
            { key: 'd', header: 'Detail', value: (a) => a.detail, width: 340 },
            { key: 'l', header: 'Possible liability', type: 'money', value: (a) => a.liability, total: 'sum' },
            { key: 's', header: 'Severity', type: 'status', value: (a) => a.severity, statusTone: (v) => (v === 'High' ? 'danger' : 'warning') },
          ]}
          rows={alerts}
          getRowId={(a) => a.id}
          rowButtons={() => <Button size="sm">Resolve with note</Button>}
          empty={<EmptyState compact title="No open alerts." />}
        />
      </Card>
      <Drawer open={verify} onOpenChange={setVerify} size="full" title="Verify ESI challan · Vetri Security Agency · Aug 2026" subtitle="Uploaded by Selvam K. (contractor login) on 16 Sep 2026. You can verify because you didn't upload it." footer={<><Button>Raise discrepancy</Button><Button variant="primary" disabled={short > 0}>Mark verified</Button></>}>
        <div className="yx-ops-split">
          <ReceiptImage merchant="ESIC challan 26081544901" amount={9412} date={new Date(2026, 8, 14)} />
          <CheckList
            label="Automatic checks"
            items={[
              { id: 'p', status: 'pass', label: 'Challan period matches (Aug 2026)' },
              { id: 'e', status: 'pass', label: 'Employer code matches the contractor (51000812300001001)' },
              { id: 'w', status: short ? 'fail' : 'pass', label: `Workers covered ≥ workers on site`, detail: `Covers 12; ${12 + short} had site attendance. Short by ${short}.` },
              { id: 'a', status: 'warn', label: 'Amount consistent with declared wages', detail: 'Declared wages imply ₹11,070; challan ₹9,412' },
              { id: 'm', status: 'pass', label: 'Wages at or above minimum wage (IN.MW Tamil Nadu 2026-04)' },
              { id: 'd', status: 'pass', label: 'Days paid ≥ days on site (from kiosk punches)' },
            ]}
          />
        </div>
      </Drawer>
      <ConfirmDialog open={override} onOpenChange={setOverride} title="Release Kaveri Loaders Co-op's September bill?" consequence="The pack still has overdue proofs. Releasing it is recorded with your reason in the audit log. Alerts stay open." confirmLabel="Release bill" onConfirm={() => setOverride(false)}>
        <FormField label="Reason" required>
          <TextArea rows={3} defaultValue="Contractor paid wages in cash on 6 Sep; payment register seen on site. Proof upload due by 5 Oct." />
        </FormField>
      </ConfirmDialog>
    </OpsDesk>
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

