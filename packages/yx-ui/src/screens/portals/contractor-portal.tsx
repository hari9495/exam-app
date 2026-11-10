// T9-13 contractor portal, the parts CL-3 makes live (answers 631, 636, 678): what is due, licences per site with their
// renewal, work orders, and the workers with the add-worker form. The designed ContractorPortalScreen and its live path
// render these same pieces; the design passes sample rows and no actions, live passes the contractor's own records.
import { useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, DescriptionList } from '../../components/shell';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { useToastIfAny } from '../../components/notify';
import { formatDate, formatINR } from '../../lib/format';
import { licenceAlert } from './portals-logic';

export interface PortalDue {
  tone: 'danger' | 'warning' | 'info';
  text: string;
}
export interface PortalLicence {
  id: string;
  site: string;
  licenceNo: string;
  /** The issuing office (the design's sample; not recorded yet). */
  authority?: string;
  nature: string;
  maxWorkers: number;
  deployed: number;
  validTo: Date;
  renewal?: { licenceNo: string; status: 'pending' | 'verified' | 'rejected'; validTo: Date; rejectReason?: string | null } | null;
}
export interface PortalWorkOrder {
  id: string;
  number: string;
  from: Date;
  to: Date;
  headcount: number;
  active: number;
  sites: string[];
}
export interface PortalWorker {
  id: string;
  name: string;
  idMasked: string;
  uan: string;
  esic: string;
  skill: string;
  /** Monthly, paid by the contractor. */
  wage: number | null;
  site: string;
  from: Date;
  gatePass: string | null;
  gateValidTo: Date | null;
  status: 'Deployed' | 'Pending approval';
}
export interface PortalRenewalInput {
  licenceNo: string;
  maxWorkers: number;
  validFrom: string;
  validTo: string;
}
export interface PortalWorkerInput {
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
export interface PortalCheck {
  id: string;
  status: 'pass' | 'fail' | 'warn';
  label: string;
  detail?: string;
}

const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
const focusOn = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);
const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
const DUE_ICON: Record<PortalDue['tone'], BadgeTone> = { danger: 'danger', warning: 'warning', info: 'info' };
const DUE_WORD: Record<PortalDue['tone'], string> = { danger: 'Act now', warning: 'Soon', info: 'Waiting' };

/** What the contractor has to do or is waiting for (licence renewals, gate passes, approvals). */
export function ClDue({ items }: { items: PortalDue[] }) {
  return (
    <Card title="What is due">
      {items.length === 0 ? (
        <p className="yx-ps-muted">Nothing is due. Licences, gate passes and approvals are in order.</p>
      ) : (
        <ul className="yx-ps-list" aria-label="What is due">
          {items.map((d, i) => (
            <li key={i}>
              <div className="yx-ps-list__main">
                <span className="yx-ps-list__title">{d.text}</span>
              </div>
              <Badge tone={DUE_ICON[d.tone]}>{DUE_WORD[d.tone]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Licences per site, with the renewal upload (it waits for the company's verification). */
export function ClLicences({ items, today, renewingId = null, onRenew }: { items: PortalLicence[]; today: Date; renewingId?: string | null; onRenew?: (id: string, input: PortalRenewalInput, file: File) => Promise<unknown> }) {
  const [renewing, setRenewing] = useState<string | null>(renewingId);
  if (items.length === 0) return <EmptyState title="No licences yet." description="The company records your licence for each of its sites." />;
  return (
    <div className="yx-ps-stack">
      {items.map((e) => {
        const a = licenceAlert(e.validTo, today);
        const pending = e.renewal?.status === 'pending';
        return (
          <Card key={e.id} title={e.site} actions={<Badge tone={a.band === 'ok' ? 'success' : a.band === '60' ? 'info' : a.band === '30' ? 'warning' : 'danger'}>{a.band === 'expired' ? 'Licence expired' : a.band === 'ok' ? 'Licence valid' : `Licence ends in ${a.days} days`}</Badge>}>
            <div className="yx-ps-stack">
              <DescriptionList columns={2} items={[{ label: 'Licence number', value: e.licenceNo, mono: true }, ...(e.authority ? [{ label: 'Issued by', value: e.authority }] : []), { label: 'Nature of work', value: e.nature }, { label: 'Valid until', value: formatDate(e.validTo) }]} />
              <Meter label={`Workers deployed at ${e.site}`} value={e.deployed} max={e.maxWorkers} warnAt={90} valueText={`${e.deployed} of ${e.maxWorkers} allowed`} />
              {e.renewal && (
                <InlineAlert tone={e.renewal.status === 'rejected' ? 'danger' : e.renewal.status === 'pending' ? 'info' : 'success'} title={e.renewal.status === 'pending' ? `Renewal ${e.renewal.licenceNo} is being checked` : e.renewal.status === 'verified' ? `Renewal ${e.renewal.licenceNo} accepted, valid until ${formatDate(e.renewal.validTo)}` : `Renewal ${e.renewal.licenceNo} was not accepted`}>
                  {e.renewal.status === 'rejected' ? `${e.renewal.rejectReason ?? ''} Upload it again.` : undefined}
                </InlineAlert>
              )}
              {!pending && e.renewal?.status !== 'verified' && a.band !== 'ok' && renewing !== e.id && (
                <div className="yx-ps-row">
                  <Button size="sm" icon={Upload} onClick={() => setRenewing(e.id)}>
                    Upload renewed licence
                  </Button>
                </div>
              )}
              {renewing === e.id && <RenewForm licence={e} onClose={() => setRenewing(null)} onSave={(input, file) => (onRenew ? onRenew(e.id, input, file) : Promise.resolve())} />}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function RenewForm({ licence, onClose, onSave }: { licence: PortalLicence; onClose: () => void; onSave: (input: PortalRenewalInput, file: File) => Promise<unknown> }) {
  const toast = useToastIfAny();
  const [no, setNo] = useState('');
  const [max, setMax] = useState<number | null>(licence.maxWorkers);
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = {
    no: !no.trim() ? 'Enter the renewed licence number.' : null,
    max: !max || max < 1 ? 'Enter the maximum number of workers.' : null,
    from: !from ? 'Choose the day it starts.' : null,
    to: !to ? 'Choose the day it ends.' : to <= licence.validTo ? `It must end after ${formatDate(licence.validTo)}.` : from && to < from ? 'It ends before it starts.' : null,
    file: !file ? 'Attach a copy of the renewed licence.' : null,
  };
  const save = () => {
    setTried(true);
    const order: [keyof typeof bad, string][] = [['no', `rn-no-${licence.id}`], ['max', `rn-max-${licence.id}`], ['from', `rn-from-${licence.id}`], ['to', `rn-to-${licence.id}`], ['file', `rn-file-${licence.id}`]];
    const miss = order.find(([k]) => bad[k]);
    if (miss) return focusOn(miss[1]);
    setBusy(true);
    setFailed(null);
    onSave({ licenceNo: no.trim(), maxWorkers: max!, validFrom: iso(from), validTo: iso(to) }, file!)
      .then(() => (toast?.toast({ tone: 'success', title: 'Renewal uploaded; the company checks it' }), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  const err = (k: keyof typeof bad) => (tried ? bad[k] : null);
  return (
    <Card title="Upload the renewed licence" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Upload renewal</Button></>}>
      <div className="yx-ps-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <FieldRow>
          <FormField id={`rn-no-${licence.id}`} label="Renewed licence number" required error={err('no')}>
            <TextField value={no} onChange={setNo} maxLength={40} />
          </FormField>
          <FormField id={`rn-max-${licence.id}`} label="Maximum workers" required error={err('max')}>
            <NumberField value={max} onChange={setMax} min={1} max={100000} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id={`rn-from-${licence.id}`} label="Valid from" required error={err('from')}>
            <DatePicker value={from} onChange={setFrom} />
          </FormField>
          <FormField id={`rn-to-${licence.id}`} label="Valid to" required error={err('to')}>
            <DatePicker value={to} onChange={setTo} />
          </FormField>
        </FieldRow>
        <FormField id={`rn-file-${licence.id}`} label="Licence copy" required error={err('file')} helper="PDF, JPG or PNG, up to 10 MB.">
          <FileUpload id={`rn-file-${licence.id}`} multiple={false} accept={['.pdf', '.jpg', '.png']} upload={async (x) => void setFile(x)} onItemsChange={(items) => !items.length && setFile(null)} />
        </FormField>
      </div>
    </Card>
  );
}

/** Answer 675: the contractor's work orders with workers against the headcount. */
export function ClWorkOrders({ items }: { items: PortalWorkOrder[] }) {
  if (items.length === 0) return null;
  return (
    <Card title="Work orders">
      <ul className="yx-ps-list" aria-label="Work orders">
        {items.map((w) => (
          <li key={w.id}>
            <div className="yx-ps-list__main">
              <span className="yx-ps-list__title">{w.number}</span>
              <span className="yx-ps-list__meta">
                {w.sites.join(', ')} · {formatDate(w.from)} to {formatDate(w.to)}
              </span>
            </div>
            <Badge tone={w.active > w.headcount ? 'warning' : 'neutral'}>{`${w.active} of ${w.headcount} workers`}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const SKILLS = [
  { value: 'unskilled', label: 'Unskilled' },
  { value: 'semi_skilled', label: 'Semi-skilled' },
  { value: 'skilled', label: 'Skilled' },
  { value: 'highly_skilled', label: 'Highly skilled' },
] as const;
const CHECK_TONE: Record<PortalCheck['status'], BadgeTone> = { pass: 'success', fail: 'danger', warn: 'warning' };
const CHECK_WORD: Record<PortalCheck['status'], string> = { pass: 'Passed', fail: 'Failed', warn: 'Check' };

/**
 * The contractor's workers and the add-worker form (answers 635, 636): the Aadhaar number is sent once, only its last 4
 * digits are kept; the company's checks (age, licence, licence maximum, the same ID) run before anything is saved, with
 * no override; the worker then waits for site approval and the gate pass.
 */
export function ClWorkerList({ workers, sites, today, adding: addingAtStart = false, design, onCheck, onAdd }: {
  workers: PortalWorker[];
  sites: { id: string; name: string }[];
  today: Date;
  adding?: boolean;
  /** The design's sample form and checks. */
  design?: { dob: Date; siteId: string; checks: PortalCheck[] };
  onCheck?: (input: PortalWorkerInput) => Promise<PortalCheck[]>;
  onAdd?: (input: PortalWorkerInput) => Promise<unknown>;
}) {
  const [adding, setAdding] = useState(addingAtStart || Boolean(design));
  return (
    <div className="yx-ps-stack">
      <Card title={`Workers · ${workers.length}`} actions={sites.length > 0 ? <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add worker</Button> : undefined}>
        {workers.length === 0 ? (
          <p className="yx-ps-muted">No workers yet. Add a worker for site approval.</p>
        ) : (
          <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Workers, scrolls sideways on small screens">
            <table className="yx-ps-slabgrid">
              <caption className="yx-visually-hidden">Workers</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">ID</th>
                  <th scope="col">UAN</th>
                  <th scope="col">ESIC IP</th>
                  <th scope="col">Skill</th>
                  <th scope="col">Monthly wage</th>
                  <th scope="col">Site</th>
                  <th scope="col">Gate pass</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.id}>
                    <th scope="row">{w.name}</th>
                    <td>{w.idMasked}</td>
                    <td className="yx-ps-mono">{w.uan ? w.uan : <Badge tone="warning">Not linked</Badge>}</td>
                    <td className="yx-ps-mono">{w.esic || '—'}</td>
                    <td>{w.skill}</td>
                    <td data-num>{w.wage === null ? '—' : formatINR(w.wage)}</td>
                    <td>{w.site}</td>
                    <td>{w.status === 'Pending approval' ? <Badge tone="info">Waiting for site approval</Badge> : <><span className="yx-ps-mono">{w.gatePass}</span> · to {w.gateValidTo ? formatDate(w.gateValidTo) : '—'}</>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {sites.length === 0 && <InlineAlert tone="warning" title="No site to deploy to">You can add workers once the company has a valid licence of yours on record for one of its sites.</InlineAlert>}
      {adding && sites.length > 0 && <AddWorkerForm sites={sites} today={today} design={design} onCheck={onCheck} onAdd={onAdd} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddWorkerForm({ sites, today, design, onCheck, onAdd, onClose }: { sites: { id: string; name: string }[]; today: Date; design?: { dob: Date; siteId: string; checks: PortalCheck[] }; onCheck?: (input: PortalWorkerInput) => Promise<PortalCheck[]>; onAdd?: (input: PortalWorkerInput) => Promise<unknown>; onClose: () => void }) {
  const toast = useToastIfAny();
  const [site, setSite] = useState<string | null>(design?.siteId ?? (sites.length === 1 ? sites[0]!.id : null));
  const [given, setGiven] = useState(design ? 'Ramesh' : '');
  const [family, setFamily] = useState(design ? 'Pandi' : '');
  const [dob, setDob] = useState<Date | null>(design?.dob ?? null);
  const [aadhaar, setAadhaar] = useState(design ? '234567890123' : '');
  const [skill, setSkill] = useState<PortalWorkerInput['skill']>('unskilled');
  const [from, setFrom] = useState<Date | null>(design ? today : null);
  const [wage, setWage] = useState<number | null>(null);
  const [uan, setUan] = useState('');
  const [ip, setIp] = useState('');
  const [checks, setChecks] = useState<PortalCheck[] | null>(design?.checks ?? null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = {
    site: !site ? 'Choose the site.' : null,
    name: !given.trim() ? 'Enter the worker’s name.' : null,
    dob: !dob ? 'Enter the date of birth.' : null,
    aadhaar: !/^[2-9][0-9]{11}$/.test(aadhaar) ? 'Enter the 12-digit Aadhaar number.' : null,
    from: !from ? 'Choose the first day.' : null,
    uan: uan && !/^[0-9]{12}$/.test(uan) ? 'A UAN has 12 digits.' : null,
    ip: ip && !/^[0-9]{10}$/.test(ip) ? 'An ESI IP number has 10 digits.' : null,
  };
  const input = (): PortalWorkerInput => ({ locationId: site!, givenName: given.trim(), familyName: family.trim() || null, dob: iso(dob), aadhaar, skill, wage: wage ? wage.toFixed(2) : null, uan: uan || null, esicIp: ip || null, fromOn: iso(from), toOn: null });
  const fails = checks?.filter((c) => c.status === 'fail') ?? [];
  const send = () => {
    setTried(true);
    const order: [keyof typeof bad, string][] = [['site', 'aw-site'], ['name', 'aw-name'], ['dob', 'aw-dob'], ['aadhaar', 'aw-aadhaar'], ['from', 'aw-from'], ['uan', 'aw-uan'], ['ip', 'aw-ip']];
    const miss = order.find(([k]) => bad[k]);
    if (miss) return focusOn(miss[1]);
    if (!onCheck || !onAdd) return;
    setBusy(true);
    setFailed(null);
    onCheck(input())
      .then(async (rows) => {
        setChecks(rows);
        if (rows.some((r) => r.status === 'fail')) return setFailed('This worker can’t be deployed. See the checks.');
        await onAdd(input());
        toast?.toast({ tone: 'success', title: 'Sent for site approval' });
        onClose();
      })
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  const err = (k: keyof typeof bad) => (tried ? bad[k] : null);
  return (
    <Card title="Add a worker" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={send}>Send for site approval</Button></>}>
      <div className="yx-ps-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        {fails.length > 0 && (
          <InlineAlert tone="danger" title="This worker can't be deployed">
            {fails.map((c) => c.detail ?? c.label).join(' ')}
          </InlineAlert>
        )}
        <FieldRow>
          <FormField id="aw-name" label="Name" required error={err('name')}>
            <TextField value={given} onChange={setGiven} maxLength={100} />
          </FormField>
          <FormField id="aw-family" label="Family name" optional>
            <TextField value={family} onChange={setFamily} maxLength={100} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="aw-dob" label="Date of birth" required error={err('dob')}>
            <DatePicker value={dob} onChange={setDob} max={today} />
          </FormField>
          <FormField id="aw-aadhaar" label="Aadhaar number" required error={err('aadhaar')} helper="Only the last 4 digits are kept.">
            <TextField value={aadhaar} onChange={(v) => setAadhaar(v.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" autoComplete="off" maxLength={12} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="aw-site" label="Site" required error={err('site')}>
            <Select value={site} onChange={setSite} options={sites.map((s) => ({ value: s.id, label: s.name }))} />
          </FormField>
          <FormField id="aw-from" label="First day" required error={err('from')}>
            <DatePicker value={from} onChange={setFrom} />
          </FormField>
        </FieldRow>
        <FormField id="aw-skill" label="Skill category" required>
          <Segment label="Skill category" options={[...SKILLS]} value={skill} onChange={(v) => setSkill(v)} />
        </FormField>
        <FormField id="aw-wage" label="Monthly wage you pay" optional>
          <CurrencyField value={wage} onChange={setWage} />
        </FormField>
        <FieldRow>
          <FormField id="aw-uan" label="UAN" optional error={err('uan')}>
            <TextField value={uan} onChange={(v) => setUan(v.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" maxLength={12} />
          </FormField>
          <FormField id="aw-ip" label="ESI IP number" optional error={err('ip')}>
            <TextField value={ip} onChange={(v) => setIp(v.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" maxLength={10} />
          </FormField>
        </FieldRow>
        {checks && (
          <ul className="yx-ps-list" aria-label="Deployment checks">
            {checks.map((c) => (
              <li key={c.id}>
                <div className="yx-ps-list__main">
                  <span className="yx-ps-list__title">{c.label}</span>
                  {c.detail && <span className="yx-ps-list__meta">{c.detail}</span>}
                </div>
                <Badge tone={CHECK_TONE[c.status]}>{CHECK_WORD[c.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
