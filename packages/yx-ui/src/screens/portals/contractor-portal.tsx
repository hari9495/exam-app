// T9-13 contractor portal, the parts CL-3 makes live (answers 631, 636, 678): what is due, licences per site with their
// renewal, work orders, and the workers with the add-worker form. The designed ContractorPortalScreen and its live path
// render these same pieces; the design passes sample rows and no actions, live passes the contractor's own records.
import { useEffect, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, DescriptionList } from '../../components/shell';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox } from '../../components/choice';
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
  /** Answer 731: optional. */
  issuedBy: string | null;
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
export interface MinWageHint {
  monthly: string;
  daily: string;
  source: string;
  verify: boolean;
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

/** Answer 685: the minimum wage for the chosen site and skill (from the company's rule sets; verify). */
export function useMinWage(site: string | null, skill: string, fetch?: (locationId: string, skill: string) => Promise<MinWageHint | null>, fixed: MinWageHint | null = null) {
  const [hint, setHint] = useState<MinWageHint | null>(fixed);
  useEffect(() => {
    if (!site || !fetch) return;
    let live = true;
    fetch(site, skill).then((h) => live && setHint(h), () => live && setHint(null));
    return () => {
      live = false;
    };
  }, [site, skill, fetch]);
  return hint;
}
/** Answer 810: a wage below the minimum is a clear warning at deploy, never a block (the monthly wage check flags it). */
export const belowMinimum = (wage: number | null, h: MinWageHint | null) =>
  wage && h && wage < Number(h.monthly) ? `₹${wage.toLocaleString('en-IN')} a month is below the minimum wage of ₹${Number(h.monthly).toLocaleString('en-IN')} (${h.source}${h.verify ? ', verify' : ''}). The worker can still be deployed; the monthly wage check will show the shortfall.` : null;
export const hintText = (h: MinWageHint | null) => (h ? `Minimum ₹${h.monthly} a month (₹${h.daily} a day): ${h.source}${h.verify ? ', verify' : ''}.` : undefined);

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
  const [office, setOffice] = useState(licence.authority ?? '');
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
    onSave({ licenceNo: no.trim(), issuedBy: office.trim() || null, maxWorkers: max!, validFrom: iso(from), validTo: iso(to) }, file!)
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
        <FormField id={`rn-office-${licence.id}`} label="Issuing office" optional>
          <TextField value={office} onChange={setOffice} maxLength={200} />
        </FormField>
        <FieldRow>
          <FormField id={`rn-from-${licence.id}`} label="Valid from" required error={err('from')}>
            <DatePicker value={from} onChange={setFrom} />
          </FormField>
          <FormField id={`rn-to-${licence.id}`} label="Valid to" required error={err('to')}>
            <DatePicker value={to} onChange={setTo} />
          </FormField>
        </FieldRow>
        <FormField id={`rn-file-${licence.id}`} label="Licence copy" required error={err('file')}>
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
export function ClWorkerList({ workers, sites, today, adding: addingAtStart = false, design, onCheck, onAdd, onPhoto, onMinWage, withdrawingId = null, onWithdraw }: {
  workers: PortalWorker[];
  sites: { id: string; name: string }[];
  today: Date;
  adding?: boolean;
  /** The design's sample form and checks. */
  design?: { dob: Date; siteId: string; checks: PortalCheck[]; wage?: number };
  onCheck?: (input: PortalWorkerInput) => Promise<PortalCheck[]>;
  /** Resolves with the new worker's id (for the photo). */
  onAdd?: (input: PortalWorkerInput) => Promise<unknown>;
  /** Answer 754: the worker's photo, sent with the worker for the site to check at approval. */
  onPhoto?: (id: string, file: File) => Promise<unknown>;
  /** Answer 685: the minimum wage for a site and skill. */
  onMinWage?: (locationId: string, skill: string) => Promise<MinWageHint | null>;
  /** Answer 736: withdraw a worker still waiting for site approval. */
  withdrawingId?: string | null;
  onWithdraw?: (id: string, reason: string) => Promise<unknown>;
}) {
  const [adding, setAdding] = useState(addingAtStart || Boolean(design));
  const [withdrawing, setWithdrawing] = useState<string | null>(withdrawingId);
  const leaving = workers.find((w) => w.id === withdrawing);
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
                    <td>{w.status === 'Pending approval' ? <span className="yx-ps-row"><Badge tone="info">Waiting for site approval</Badge><Button size="sm" onClick={() => setWithdrawing(w.id)}>Withdraw</Button></span> : <><span className="yx-ps-mono">{w.gatePass}</span> · to {w.gateValidTo ? formatDate(w.gateValidTo) : '—'}</>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {leaving && <WithdrawForm worker={leaving} onClose={() => setWithdrawing(null)} onWithdraw={(reason) => (onWithdraw ? onWithdraw(leaving.id, reason) : Promise.resolve())} />}
      {sites.length === 0 && <InlineAlert tone="warning" title="No site to deploy to">You can add workers once the company has a valid licence of yours on record for one of its sites.</InlineAlert>}
      {adding && sites.length > 0 && <AddWorkerForm sites={sites} today={today} design={design} onCheck={onCheck} onAdd={onAdd} onPhoto={onPhoto} onMinWage={onMinWage} onClose={() => setAdding(false)} />}
    </div>
  );
}

function WithdrawForm({ worker, onClose, onWithdraw }: { worker: PortalWorker; onClose: () => void; onWithdraw: (reason: string) => Promise<unknown> }) {
  const toast = useToastIfAny();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const go = () => {
    setTried(true);
    if (reason.trim().length < 3) return focusOn('wd-reason');
    setBusy(true);
    setFailed(null);
    onWithdraw(reason.trim())
      .then(() => (toast?.toast({ tone: 'success', title: `${worker.name} withdrawn` }), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Card title={`Withdraw ${worker.name}?`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}>Withdraw</Button></>}>
      <div className="yx-ps-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <p className="yx-ps-muted">{worker.site}. The company will not approve this deployment; you can add the worker again later.</p>
        <FormField id="wd-reason" label="Reason" required error={tried && reason.trim().length < 3 ? 'Say why.' : null}>
          <TextField value={reason} onChange={setReason} maxLength={500} />
        </FormField>
      </div>
    </Card>
  );
}

function AddWorkerForm({ sites, today, design, onCheck, onAdd, onPhoto, onMinWage, onClose }: { sites: { id: string; name: string }[]; today: Date; design?: { dob: Date; siteId: string; checks: PortalCheck[]; wage?: number }; onCheck?: (input: PortalWorkerInput) => Promise<PortalCheck[]>; onAdd?: (input: PortalWorkerInput) => Promise<unknown>; onPhoto?: (id: string, file: File) => Promise<unknown>; onMinWage?: (locationId: string, skill: string) => Promise<MinWageHint | null>; onClose: () => void }) {
  const toast = useToastIfAny();
  const [site, setSite] = useState<string | null>(design?.siteId ?? (sites.length === 1 ? sites[0]!.id : null));
  const [given, setGiven] = useState(design ? 'Ramesh' : '');
  const [family, setFamily] = useState(design ? 'Pandi' : '');
  const [dob, setDob] = useState<Date | null>(design?.dob ?? null);
  const [aadhaar, setAadhaar] = useState(design ? '234567890123' : '');
  const [skill, setSkill] = useState<PortalWorkerInput['skill']>('unskilled');
  const [from, setFrom] = useState<Date | null>(design ? today : null);
  const [wage, setWage] = useState<number | null>(design?.wage ?? null);
  const [uan, setUan] = useState('');
  const [ip, setIp] = useState('');
  // Answer 754: kept here and sent once the worker exists.
  const [photo, setPhoto] = useState<File | null>(null);
  const [checks, setChecks] = useState<PortalCheck[] | null>(design?.checks ?? null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const hint = useMinWage(site, skill, onMinWage, design ? { monthly: '14820.00', daily: '570.00', source: 'TN 2026-04, zone A, unskilled', verify: true } : null);
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
        if (rows.some((r) => r.status === 'fail')) return setFailed(`This worker can’t be deployed. ${rows.filter((r) => r.status === 'fail').map((r) => r.detail ?? r.label).join(' ')}`);
        const made = (await onAdd(input())) as { id?: string } | undefined;
        if (photo && made?.id && onPhoto) {
          const sent = await onPhoto(made.id, photo).then(() => true, () => false);
          if (!sent) toast?.toast({ tone: 'warning', title: 'Sent for site approval; the photo did not upload', description: 'The site can add the photo at approval.' });
          else toast?.toast({ tone: 'success', title: 'Sent for site approval with the photo' });
          return onClose();
        }
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
        <FormField id="aw-wage" label="Monthly wage you pay" optional helper={hintText(hint)}>
          <CurrencyField value={wage} onChange={setWage} />
        </FormField>
        {belowMinimum(wage, hint) && <InlineAlert tone="warning" title="Below the minimum wage">{belowMinimum(wage, hint)}</InlineAlert>}
        <FormField id="aw-photo" label="Photo" optional helper="JPG or PNG, a clear face, up to 5 MB. The site checks it against the worker before the gate pass.">
          <FileUpload
            id="aw-photo"
            multiple={false}
            accept={['.jpg', '.jpeg', '.png']}
            maxSize={5 * 1024 * 1024}
            capture="user"
            onItemsChange={(items) => !items.length && setPhoto(null)}
            upload={async (file) => {
              if (!/\.(jpe?g|png)$/i.test(file.name)) throw new Error('Choose a JPG or PNG photo.');
              setPhoto(file);
            }}
          />
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

/* ---------------- CL-4: monthly packs and bills (answers 626, 634) ---------------- */

export type PortalProofKind = 'pf_challan' | 'esi_challan' | 'wage_register' | 'bank_proof' | 'muster_roll';
export type PortalPackStatus = 'open' | 'submitted' | 'verified' | 'discrepancy' | 'overdue';
export interface PortalPackSummary {
  month: string;
  site: { id: string; name: string };
  due: string;
  status: PortalPackStatus;
}
export interface PortalPack {
  site: { id: string; name: string };
  month: string;
  due: Date;
  status: PortalPackStatus;
  items: Record<PortalProofKind, { state: 'submitted' | 'verified' | 'discrepancy'; note: string | null; fileName: string; workersCovered: number | null; amount: string | null } | null>;
  workers: { deploymentId: string; name: string; idMasked: string; skill: string; line: { days: number; gross: string; paidOn: string } | null; minimum: { monthly: string; daily: string; source: string; verify: boolean } | null; short: string | null }[];
  checks: { id: string; label: string; status: 'pass' | 'fail' | 'pending'; detail?: string }[];
  /** Answer 741: the proofs the company requires; the others may be given. Absent: all. */
  required?: PortalProofKind[];
}
export interface PortalUploadInput {
  kind: PortalProofKind;
  workersCovered?: number;
  amount?: string;
  lines?: { deploymentId: string; days: number; gross: string; paidOn: string }[];
}
export interface PortalBill {
  id: string;
  no: string;
  period: string;
  amount: number;
  tds: number | null;
  recovery: number;
  net: number | null;
  status: 'Paid' | 'Rejected' | 'On hold' | 'Being checked' | 'Due';
  paidOn: string | null;
}

/** "Wage register" reads "wage register" mid-sentence; an acronym ("PF ECR", "ESI") keeps its capitals. */
const lowerWord = (t: string) => (/^[A-Z][a-z]/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t);
const PROOF_LABEL: Record<PortalProofKind, string> = { pf_challan: 'PF ECR and challan', esi_challan: 'ESI challan', wage_register: 'Wage register (each worker’s days and pay)', bank_proof: 'Wage payment proof (bank statement)', muster_roll: 'Muster roll (the days each worker was on site)' };
const STATE_TONE: Record<'submitted' | 'verified' | 'discrepancy' | 'missing', { tone: BadgeTone; text: string }> = {
  submitted: { tone: 'info', text: 'Being checked' },
  verified: { tone: 'success', text: 'Verified' },
  discrepancy: { tone: 'danger', text: 'Discrepancy' },
  missing: { tone: 'warning', text: 'Not uploaded' },
};
const PACK_TONE: Record<PortalPackStatus, { tone: BadgeTone; text: string }> = { open: { tone: 'neutral', text: 'To upload' }, submitted: { tone: 'info', text: 'Submitted' }, verified: { tone: 'success', text: 'Verified' }, discrepancy: { tone: 'danger', text: 'Discrepancy' }, overdue: { tone: 'danger', text: 'Overdue' } };
const CHECK_STATE: Record<'pass' | 'fail' | 'pending', { tone: BadgeTone; text: string }> = { pass: { tone: 'success', text: 'Passed' }, fail: { tone: 'danger', text: 'Failed' }, pending: { tone: 'neutral', text: 'Waiting' } };
const monthText = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/** The months and sites a pack is owed for; one opens its proofs. */
export function ClPackList({ items, onOpen }: { items: PortalPackSummary[]; onOpen: (p: PortalPackSummary) => void }) {
  if (items.length === 0) return <EmptyState title="No packs owed yet." description="A pack is owed for each site and month you had workers deployed." />;
  return (
    <Card title="Monthly packs">
      <ul className="yx-ps-list" aria-label="Monthly packs">
        {items.map((p) => (
          <li key={`${p.site.id}-${p.month}`}>
            <div className="yx-ps-list__main">
              <span className="yx-ps-list__title">{p.site.name} · {monthText(p.month)}</span>
              <span className="yx-ps-list__meta">Due by {formatDate(new Date(`${p.due}T00:00:00`))}</span>
            </div>
            <Badge tone={PACK_TONE[p.status].tone}>{PACK_TONE[p.status].text}</Badge>
            <Button size="sm" onClick={() => onOpen(p)}>Open</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** One month's pack for a site: each proof with its upload, the workers' pay against the minimum wage, the checks. */
export function ClPackView({ pack, today, onBack, onUpload, uploading: uploadingAtStart = null }: { pack: PortalPack; today: Date; onBack?: () => void; onUpload?: (input: PortalUploadInput, file: File) => Promise<unknown>; uploading?: PortalProofKind | null }) {
  const [uploading, setUploading] = useState<PortalProofKind | null>(uploadingAtStart);
  const late = pack.due < today && pack.status !== 'verified';
  return (
    <div className="yx-ps-stack">
      <div className="yx-ps-row" data-between>
        <h1 className="yx-ps-h">
          {pack.site.name} · {monthText(pack.month)}
        </h1>
        <Badge tone={PACK_TONE[pack.status].tone}>{PACK_TONE[pack.status].text}</Badge>
      </div>
      <p className="yx-ps-muted">
        Due by {formatDate(pack.due)}{late ? ' (late)' : ''}. Bills are held while a pack is overdue or has a discrepancy.{onBack && ' '}
        {onBack && <Button size="sm" onClick={onBack}>All packs</Button>}
      </p>
      <div className="yx-split">
        <div className="yx-split__main">
          <Card title="Proofs">
            <ul className="yx-ps-list">
              {(Object.keys(PROOF_LABEL) as PortalProofKind[]).map((k) => {
                const i = pack.items[k];
                const st = STATE_TONE[i?.state ?? 'missing'];
                const optional = !i && pack.required !== undefined && !pack.required.includes(k);
                return (
                  <li key={k}>
                    <div className="yx-ps-list__main">
                      <span className="yx-ps-list__title">{PROOF_LABEL[k]}</span>
                      {i?.note && <span className="yx-ps-list__meta">{i.note}</span>}
                      {i?.workersCovered !== null && i?.workersCovered !== undefined && <span className="yx-ps-list__meta">Covers {i.workersCovered} workers · ₹{i.amount}</span>}
                    </div>
                    {optional ? <Badge tone="neutral">Optional</Badge> : <Badge tone={st.tone}>{st.text}</Badge>}
                    {i?.state !== 'verified' && uploading !== k && (
                      <Button size="sm" icon={Upload} onClick={() => setUploading(k)}>
                        {i ? 'Replace' : 'Upload'}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          {uploading && <ProofForm kind={uploading} pack={pack} onClose={() => setUploading(null)} onSave={(input, file) => (onUpload ? onUpload(input, file) : Promise.resolve())} />}
        </div>
        <div className="yx-split__aside">
          <Card title="Automatic checks">
            <ul className="yx-ps-list">
              {pack.checks.map((c) => (
                <li key={c.id}>
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title">{c.label}</span>
                    {c.detail && <span className="yx-ps-list__meta">{c.detail}</span>}
                  </div>
                  <Badge tone={CHECK_STATE[c.status].tone}>{CHECK_STATE[c.status].text}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProofForm({ kind, pack, onClose, onSave }: { kind: PortalProofKind; pack: PortalPack; onClose: () => void; onSave: (input: PortalUploadInput, file: File) => Promise<unknown> }) {
  const toast = useToastIfAny();
  const challan = kind === 'pf_challan' || kind === 'esi_challan';
  const [covered, setCovered] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [lines, setLines] = useState(pack.workers.map((w) => ({ deploymentId: w.deploymentId, days: w.line?.days ?? null as number | null, gross: w.line ? Number(w.line.gross) : (null as number | null), paidOn: w.line ? new Date(`${w.line.paidOn}T00:00:00`) : (null as Date | null) })));
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const setLine = (i: number, x: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...x } : l)));
  const lineBad = (l: (typeof lines)[number]) => l.days === null || l.days < 0 || l.days > 31 || l.gross === null || l.gross < 0 || !l.paidOn;
  const bad = {
    covered: challan && (covered === null || covered < 0) ? 'Enter how many workers the challan covers.' : null,
    amount: challan && (amount === null || amount < 0) ? 'Enter the challan amount.' : null,
    lines: kind === 'wage_register' && lines.some(lineBad) ? 'Enter every worker’s days (0 to 31), the wage paid and the day it was paid.' : null,
    file: !file ? 'Attach the proof.' : null,
  };
  const save = () => {
    setTried(true);
    const order: [keyof typeof bad, string][] = [['covered', `pf-covered`], ['amount', `pf-amount`], ['lines', `pf-lines`], ['file', `pf-file`]];
    const miss = order.find(([k]) => bad[k]);
    if (miss) return focusOn(miss[1]);
    setBusy(true);
    setFailed(null);
    const input: PortalUploadInput = { kind, ...(challan ? { workersCovered: covered!, amount: amount!.toFixed(2) } : {}), ...(kind === 'wage_register' ? { lines: lines.map((l) => ({ deploymentId: l.deploymentId, days: l.days!, gross: l.gross!.toFixed(2), paidOn: iso(l.paidOn) })) } : {}) };
    onSave(input, file!)
      .then(() => (toast?.toast({ tone: 'success', title: 'Proof uploaded; the company checks it' }), onClose()))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Card title={`Upload ${lowerWord(PROOF_LABEL[kind].split(' (')[0]!)}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Upload</Button></>}>
      <div className="yx-ps-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        {challan && (
          <FieldRow>
            <FormField id="pf-covered" label="Workers covered" required error={tried ? bad.covered : null} helper={`${pack.workers.length} deployed at ${pack.site.name} in the month.`}>
              <NumberField value={covered} onChange={setCovered} min={0} max={100000} />
            </FormField>
            <FormField id="pf-amount" label="Amount paid" required error={tried ? bad.amount : null}>
              <CurrencyField value={amount} onChange={setAmount} allowPaise />
            </FormField>
          </FieldRow>
        )}
        {kind === 'wage_register' && (
          <div id="pf-lines" tabIndex={-1} className="yx-ps-stack">
            {tried && bad.lines && <InlineAlert tone="danger" title={bad.lines} />}
            {pack.workers.map((w, i) => (
              <FieldRow key={w.deploymentId}>
                <FormField id={`pf-days-${i}`} label={`${w.name} · days`} required>
                  <NumberField value={lines[i]!.days} onChange={(v) => setLine(i, { days: v })} min={0} max={31} />
                </FormField>
                <FormField id={`pf-gross-${i}`} label="Wage paid" required helper={w.minimum ? `Minimum ₹${w.minimum.monthly} a month (₹${w.minimum.daily} a day)${w.minimum.verify ? ', verify' : ''}` : undefined}>
                  <CurrencyField value={lines[i]!.gross} onChange={(v) => setLine(i, { gross: v })} allowPaise />
                </FormField>
                <FormField id={`pf-paid-${i}`} label="Paid on" required>
                  <DatePicker value={lines[i]!.paidOn} onChange={(v) => setLine(i, { paidOn: v })} />
                </FormField>
              </FieldRow>
            ))}
          </div>
        )}
        <FormField id="pf-file" label="Copy" required error={tried ? bad.file : null}>
          <FileUpload id="pf-file" multiple={false} accept={['.pdf', '.jpg', '.png']} upload={async (x) => void setFile(x)} onItemsChange={(items) => !items.length && setFile(null)} />
        </FormField>
      </div>
    </Card>
  );
}

/** The contractor's bills: TDS, wages the company paid workers itself and took back, and any hold. */
export function ClBillList({ bills, held }: { bills: PortalBill[]; held: string[] }) {
  return (
    <div className="yx-ps-stack">
      {held.length > 0 && (
        <InlineAlert tone="warning" title="Your bills are on hold">
          Proofs for {held.map(monthText).join(', ')} are overdue or have a discrepancy. Fix them in Monthly packs; the company pays once they are verified.
        </InlineAlert>
      )}
      <Card title="Bills and payments">
        {bills.length === 0 ? (
          <p className="yx-ps-muted">No bills yet.</p>
        ) : (
          <ul className="yx-ps-list">
            {bills.map((b) => (
              <li key={b.id}>
                <div className="yx-ps-list__main">
                  <span className="yx-ps-list__title">
                    <span className="yx-ps-mono">{b.no}</span> · {monthText(b.period)}
                  </span>
                  <span className="yx-ps-list__meta">
                    {formatINR(b.amount)}
                    {b.tds !== null ? ` · TDS ${formatINR(b.tds)}` : ''}
                    {b.recovery > 0 ? ` · wages we paid your workers ${formatINR(b.recovery)}` : ''}
                    {b.net !== null ? ` · paid to you ${formatINR(b.net)}` : ''}
                    {b.paidOn ? ` · paid ${formatDate(new Date(`${b.paidOn}T00:00:00`))}` : ''}
                  </span>
                </div>
                <Badge tone={b.status === 'Paid' ? 'success' : b.status === 'On hold' || b.status === 'Rejected' ? 'danger' : 'warning'}>{b.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------------- CL-5: the contractor's attendance entry (answer 625) ---------------- */

export interface PortalAttendance {
  month: string;
  site: string;
  contractorEnters: boolean;
  editable: boolean;
  confirmed: { at: string; days: number } | null;
  workers: { deploymentId: string; name: string; gatePass: string | null; from: string; to: string | null; days: { day: string; source: string }[]; present: number }[];
}

/** The days each worker was on site: marked here where the site has no kiosk, read-only at a kiosk site or once confirmed. */
export function ClAttendance({ data, today, sites, siteId, month, onPick, onSave }: { data: PortalAttendance | null; today: Date; sites: { id: string; name: string }[]; siteId: string | null; month: string; onPick?: (siteId: string, month: string) => void; onSave?: (entries: { deploymentId: string; days: string[] }[]) => Promise<unknown> }) {
  const toast = useToastIfAny();
  const [marks, setMarks] = useState<Record<string, string[]>>(() => Object.fromEntries((data?.workers ?? []).map((w) => [w.deploymentId, w.days.map((d) => d.day)])));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const todayIso = iso(today);
  const days = Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).filter((d) => d <= todayIso);
  const months = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const toggle = (id: string, d: string) => setMarks((x) => ({ ...x, [id]: (x[id] ?? []).includes(d) ? (x[id] ?? []).filter((v) => v !== d) : [...(x[id] ?? []), d].sort() }));
  const save = () => {
    if (!onSave || !data) return;
    setBusy(true);
    setFailed(null);
    onSave(data.workers.map((w) => ({ deploymentId: w.deploymentId, days: marks[w.deploymentId] ?? [] })))
      .then(() => toast?.toast({ tone: 'success', title: 'Days saved' }))
      .catch((e: unknown) => setFailed(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <div className="yx-ps-stack">
      <FieldRow>
        <FormField id="at-site" label="Site">
          <Select value={siteId} onChange={(v) => v && onPick?.(v, month)} options={sites.map((s) => ({ value: s.id, label: s.name }))} />
        </FormField>
        <FormField id="at-month" label="Month">
          <Segment label="Month" options={months.map((x) => ({ value: x, label: new Date(`${x}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) }))} value={month} onChange={(v) => siteId && onPick?.(siteId, v)} />
        </FormField>
      </FieldRow>
      {!data ? (
        <EmptyState compact title="Choose a site." />
      ) : (
        <Card title="Days on site" actions={data.confirmed ? <Badge tone="success">Confirmed by the company</Badge> : data.contractorEnters ? undefined : <Badge tone="neutral">From the kiosk</Badge>} footer={data.editable ? <Button variant="primary" loading={busy} onClick={save}>Save days</Button> : undefined}>
          <div className="yx-ps-stack">
            {failed && <InlineAlert tone="danger" title={failed} />}
            {!data.contractorEnters && <p className="yx-ps-muted">Workers punch at the site's kiosk with the gate pass number and PIN; the days come from there.</p>}
            {data.workers.length === 0 && <p className="yx-ps-muted">No workers deployed here this month.</p>}
            {data.workers.map((w) => (
              <fieldset key={w.deploymentId} className="yx-ps-days">
                <legend>{w.name} · {(marks[w.deploymentId] ?? []).length} days</legend>
                {data.editable ? (
                  <div className="yx-ps-row">
                    {days
                      .filter((d) => d >= w.from && (w.to === null || d <= w.to))
                      .map((d) => (
                        <Checkbox key={d} label={String(Number(d.slice(8)))} checked={(marks[w.deploymentId] ?? []).includes(d)} onChange={() => toggle(w.deploymentId, d)} />
                      ))}
                  </div>
                ) : (
                  <p className="yx-ps-muted">{w.days.length ? w.days.map((d) => Number(d.day.slice(8))).join(', ') : 'No days yet.'}</p>
                )}
              </fieldset>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
