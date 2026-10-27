// PPL-32 Profile change request · PPL-33 My data + Who accessed my data · PPL-38 Disability declaration
// PPL-43 BFSI declarations · PPL-44 Personal-trading pre-clearance (M01 §3.1, §3.11; P02 §4.5, §6, §7; P08 Q6).
import { useState, type ReactNode } from 'react';
import { Download, FileText, Plus, ShieldCheck } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { FileUpload } from '../../components/upload';
import { ApprovalTimeline } from '../../components/timeline';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { dayKey } from '../../lib/dates';
import { addDays, isIfsc, isPan, preclearanceState } from './people-logic';
import { ACCESS_LOG } from './people-data';
import { ClassBadge, ListSkeleton, MeFrame, PeopleFrame, StatusBadge } from './people-kit';
import { useRun } from '../org/org-kit';
import { KIND_FIELDS } from '../access/profile';
import type { AccessLog, ChangeForm, ProfileRequest, ProfileRequestInput, RequestKind } from '../access/types';

/* ================================================================== PPL-32 profile change request */

export type ProfileChangeKind = 'bank' | 'legal-name' | 'pan';

function ChangeFields({ kind, value, setValue, ifsc, setIfsc }: { kind: ProfileChangeKind; value: string; setValue: (v: string) => void; ifsc: string; setIfsc: (v: string) => void }) {
  const panErr = kind === 'pan' && value && !isPan(value) ? 'Enter a 10-character PAN like ABCDE1234F.' : null;
  const ifscErr = kind === 'bank' && ifsc && !isIfsc(ifsc) ? 'Enter an 11-character IFSC like CNRB0001234. The fifth character is zero.' : null;
  const old = kind === 'bank' ? 'Canara Bank · XXXX XXXX 6789 · CNRB0001234' : kind === 'pan' ? 'XXXXXX821M' : 'Divya Raghunathan';
  return (
    <div className="yx-ppl__form">
      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
      <table className="yx-ppl__impact">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Now</th>
            <th scope="col">Change to</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{kind === 'bank' ? 'Salary account' : kind === 'pan' ? 'PAN' : 'Legal name'}</th>
            <td className="yx-mono">{old}</td>
            <td className="yx-mono" data-changed>{kind === 'bank' ? `${value} · ${ifsc}` : value}</td>
          </tr>
        </tbody>
      </table>
      </div>
      {kind === 'bank' && (
        <>
          <FormField label="Account number" required>
            <TextField value={value} onChange={setValue} inputMode="numeric" />
          </FormField>
          <FormField label="IFSC" required error={ifscErr} helper={!ifscErr && ifsc ? 'State Bank of India, Hosur branch' : undefined}>
            <TextField value={ifsc} onChange={setIfsc} />
          </FormField>
        </>
      )}
      {kind === 'pan' && (
        <FormField label="New PAN" required error={panErr}>
          <TextField value={value} onChange={setValue} />
        </FormField>
      )}
      {kind === 'legal-name' && (
        <>
          <FormField label="New legal name" required helper="Used on letters, payslips and statutory filings from the effective date.">
            <TextField value={value} onChange={setValue} />
          </FormField>
          <FormField label="Effective from" required>
            <DatePicker value={new Date(2026, 9, 1)} onChange={() => {}} />
          </FormField>
        </>
      )}
      <FormField label={kind === 'bank' ? 'Cancelled cheque or passbook page' : kind === 'pan' ? 'PAN card' : 'Gazette notification or marriage certificate'} required>
        <FileUpload upload={async () => {}} accept={['.pdf', '.jpg', '.png']} maxSize={5 * 1024 * 1024} />
      </FormField>
      <InlineAlert tone="info">
        {kind === 'bank'
          ? 'HR approves the change and we run a penny drop. Salary goes to the new account after a 3-day cooling period, and we tell your old contact.'
          : 'HR approves this change. We tell your old contact when it is done.'}
      </InlineAlert>
    </div>
  );
}

/** The live page (PPL-32): my own identity, bank and legal-name changes with proof, and where each one stands. */
export interface LiveProfileChange {
  state: 'ready' | 'loading' | 'error';
  onRetry: () => void;
  form: ChangeForm | null;
  /** Requests about me. */
  requests: ProfileRequest[];
  /** Uploads the proof to my documents; resolves to the document id. */
  onProof: (kind: RequestKind, file: File) => Promise<string>;
  onSend: (input: ProfileRequestInput) => Promise<unknown>;
  onCancel: () => void;
}

// The designed three first; the other kinds the API takes follow.
const LIVE_KINDS: { value: RequestKind; label: string }[] = [
  { value: 'bank_salary', label: 'Bank account' },
  { value: 'pan', label: 'PAN' },
  { value: 'legal_name', label: 'Legal name' },
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'uan', label: 'UAN' },
  { value: 'esic', label: 'ESIC IP number' },
  { value: 'passport', label: 'Passport' },
  { value: 'bank_reimbursement', label: 'Reimbursement bank account' },
];
const PROOF_LABEL: Partial<Record<RequestKind, string>> = { bank_salary: 'Cancelled cheque or passbook page', bank_reimbursement: 'Cancelled cheque or passbook page', pan: 'PAN card', legal_name: 'Gazette notification or marriage certificate', aadhaar: 'Aadhaar (masked copy)', passport: 'Passport' };
const ROW_LABEL: Record<RequestKind, string> = { bank_salary: 'Salary account', bank_reimbursement: 'Reimbursement account', pan: 'PAN', aadhaar: 'Aadhaar', uan: 'UAN', esic: 'ESIC IP number', legal_name: 'Legal name', passport: 'Passport' };
// The design's labels and messages where it has them; KIND_FIELDS (the record's dialog) for the rest.
const FIELD_LABEL: Record<string, string> = { legalName: 'New legal name' };
const FIELD_CHECK: Record<string, (v: string) => string | null> = {
  pan: (v) => (isPan(v) ? null : 'Enter a 10-character PAN like ABCDE1234F.'),
  ifsc: (v) => (isIfsc(v) ? null : 'Enter an 11-character IFSC like CNRB0001234. The fifth character is zero.'),
};
const shownValue = (kind: RequestKind, v: Record<string, string | null> | null) => {
  if (!v) return 'Not on file';
  if (kind === 'bank_salary' || kind === 'bank_reimbursement') return [v.account, v.ifsc].filter(Boolean).join(' · ');
  if (kind === 'legal_name') return v.legalName ?? '—';
  return [v.value, v.expiresOn ? `expires ${formatDate(new Date(`${v.expiresOn}T00:00:00`))}` : null].filter(Boolean).join(' · ');
};

function RequestCard({ r, now }: { r: ProfileRequest; now: Date }) {
  const at = (iso: string | null) => (iso ? new Date(iso) : undefined);
  const cooling = r.usableFrom && new Date(r.usableFrom) > now;
  return (
    <Card title={`${r.label} change`}>
      <ApprovalTimeline
        now={now}
        steps={[
          { id: 'asked', label: 'Requested', status: 'done', approver: r.mine ? 'You' : (r.requestedBy ?? undefined), at: at(r.requestedAt) },
          { id: 'hr', label: 'HR approval', status: r.status === 'approved' ? 'done' : 'current', approver: r.decidedBy ?? 'HR', at: at(r.decidedAt) },
          ...(r.usableFrom ? [{ id: 'cooling', label: 'Cooling period ends', status: cooling ? ('current' as const) : ('done' as const), approver: formatDate(new Date(r.usableFrom)) }] : []),
        ]}
      />
      {r.status === 'approved' && r.decidedAt && <Text size="sm" tone="secondary" as="p">{`We emailed your old contact on ${formatDate(new Date(r.decidedAt))}. If you didn't ask for this, tell HR now.`}</Text>}
    </Card>
  );
}

function LiveProfileChangeRequest({ today, live }: { today: Date; live: LiveProfileChange }) {
  const [kind, setKind] = useState<RequestKind>('bank_salary');
  const [value, setValue] = useState<Record<string, string>>({});
  const [proof, setProof] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [round, setRound] = useState(0);
  const { busy, error, run } = useRun();
  const frame = (body: ReactNode) => (
    <MeFrame active="Change requests">
      <PageHeader title="Change identity or bank details" description="PAN, bank account and legal name need HR approval with proof. Personal details like address and phone you edit directly on your profile." />
      {body}
    </MeFrame>
  );
  if (live.state === 'error') return frame(<ErrorState title="We couldn't load your details" description="Check your connection and try again." onRetry={live.onRetry} />);
  if (live.state === 'loading' || !live.form) return frame(<ListSkeleton label="Loading your details" />);
  const form = live.form;
  const now = new Date();
  const waiting = live.requests.filter((r) => r.status === 'pending').map((r) => r.kind);
  const open = live.requests.filter((r) => r.status === 'pending' || (r.status === 'approved' && r.usableFrom && new Date(r.usableFrom) > now));
  const fields = KIND_FIELDS[kind];
  const bank = kind === 'bank_salary' || kind === 'bank_reimbursement';
  const proofLabel = form.proofTypes[kind] && PROOF_LABEL[kind];
  const problem = (key: string, v: string) => (FIELD_CHECK[key] ?? fields.find((f) => f.key === key)!.check)(v);
  const errorOf = (key: string) => {
    const v = (value[key] ?? '').trim();
    return v ? problem(key, v) : tried ? 'Fill this in.' : null;
  };
  const proofMissing = Boolean(proofLabel) && form.proofRequired && !proof;
  const ready = fields.every((f) => (value[f.key] ?? '').trim() && !problem(f.key, (value[f.key] ?? '').trim())) && (kind !== 'legal_name' || Boolean(value.effectiveOn)) && !proofMissing;
  const pick = (k: RequestKind) => {
    setKind(k);
    setValue({});
    setProof(null);
    setTried(false);
    setRound((n) => n + 1);
  };
  const send = async () => {
    setTried(true);
    if (!ready) return;
    const ok = await run('send', () => live.onSend({ kind, value: Object.fromEntries(fields.map((f) => [f.key, (value[f.key] ?? '').trim()])), ...(proof ? { proofDocumentId: proof } : {}), ...(kind === 'legal_name' ? { effectiveOn: value.effectiveOn } : {}) }));
    if (ok) pick(kind);
  };
  const days = form.coolingHours / 24;
  const changeTo = (bank ? [value.accountNumber, value.ifsc] : fields.map((f) => value[f.key])).filter(Boolean).join(' · ');
  return frame(
    <div className="yx-ppl__stack">
      {open.map((r) => <RequestCard key={r.id} r={r} now={now} />)}
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <FormField label="What do you want to change?" required>
        <RadioGroup value={kind} onChange={(v) => pick(v as RequestKind)} orientation="horizontal" options={LIVE_KINDS.map((k) => ({ ...k, disabled: waiting.includes(k.value), description: waiting.includes(k.value) ? 'A change is already waiting' : undefined }))} />
      </FormField>
      <div className="yx-ppl__form">
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="yx-ppl__impact">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Now</th>
                <th scope="col">Change to</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{ROW_LABEL[kind]}</th>
                <td className="yx-mono">{shownValue(kind, form.current[kind])}</td>
                <td className="yx-mono" data-changed>{changeTo}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {fields.map((f) =>
          f.date ? (
            <FormField key={f.key} label={f.label} required error={tried && !value[f.key] ? 'Choose the date.' : null}>
              <DatePicker value={value[f.key] ? new Date(`${value[f.key]}T00:00:00`) : null} onChange={(d) => setValue((x) => ({ ...x, [f.key]: d ? dayKey(d) : '' }))} min={today} />
            </FormField>
          ) : (
            <FormField key={f.key} label={FIELD_LABEL[f.key] ?? f.label} required error={errorOf(f.key)} helper={f.key === 'legalName' ? 'Used on letters, payslips and statutory filings from the effective date.' : undefined}>
              <TextField value={value[f.key] ?? ''} onChange={(v) => setValue((x) => ({ ...x, [f.key]: ['pan', 'ifsc', 'passport'].includes(f.key) ? v.toUpperCase() : v }))} inputMode={f.key === 'accountNumber' ? 'numeric' : undefined} autoComplete="off" />
            </FormField>
          ),
        )}
        {kind === 'legal_name' && (
          <FormField label="Effective from" required error={tried && !value.effectiveOn ? 'Choose the date the name changed.' : null}>
            <DatePicker value={value.effectiveOn ? new Date(`${value.effectiveOn}T00:00:00`) : null} onChange={(d) => setValue((x) => ({ ...x, effectiveOn: d ? dayKey(d) : '' }))} max={today} />
          </FormField>
        )}
        {proofLabel && (
          <FormField label={proofLabel} required={form.proofRequired} optional={!form.proofRequired} error={tried && proofMissing ? 'Add the proof.' : null}>
            <FileUpload key={`${kind}-${round}`} upload={async (file) => setProof(await live.onProof(kind, file))} accept={['.pdf', '.jpg', '.png']} maxSize={5 * 1024 * 1024} multiple={false} />
          </FormField>
        )}
        <InlineAlert tone="info">
          {bank
            ? `HR approves the change. ${kind === 'bank_salary' ? 'Salary goes' : 'Reimbursements go'} to the new account ${days > 0 ? `after a ${days}-day cooling period` : 'once it is approved'}, and we tell your old contact.`
            : 'HR approves this change. We tell your old contact when it is done.'}
        </InlineAlert>
      </div>
      <div className="yx-ppl__row">
        <Button onClick={live.onCancel}>Cancel</Button>
        <Button variant="primary" loading={busy === 'send'} onClick={() => void send()}>
          Send for approval
        </Button>
      </div>
    </div>,
  );
}

// PPL-32
export function ProfileChangeRequest(props: { kind?: ProfileChangeKind; submitted?: boolean; today: Date; defaultValue?: string; live?: LiveProfileChange }) {
  return props.live ? <LiveProfileChangeRequest today={props.today} live={props.live} /> : <SampleProfileChangeRequest {...props} />;
}

function SampleProfileChangeRequest({ kind: initial = 'bank', submitted = false, today, defaultValue }: { kind?: ProfileChangeKind; submitted?: boolean; today: Date; defaultValue?: string }) {
  const [kind, setKind] = useState<ProfileChangeKind>(initial);
  const [value, setValue] = useState(defaultValue ?? (initial === 'bank' ? '3890 1122 4410' : initial === 'pan' ? 'BRGPR7712K' : 'Divya Raghunathan Iyer'));
  const [ifsc, setIfsc] = useState('SBIN0012765');
  return (
    <MeFrame active="Change requests">
      <PageHeader title="Change identity or bank details" description="PAN, bank account and legal name need HR approval with proof. Personal details like address and phone you edit directly on your profile." />
      {submitted ? (
        <Card title="Bank account change · PCR-2026-0081">
          <ApprovalTimeline
            now={today}
            steps={[
              { id: '1', label: 'Requested', status: 'done', approver: 'You', at: new Date(2026, 8, 28, 15, 10) },
              { id: '2', label: 'HR approval', status: 'done', approver: 'Lakshmi Venkatesan', at: new Date(2026, 8, 28, 16, 12) },
              { id: '3', label: 'Penny drop', status: 'done', approver: 'Account holder: DIVYA RAGHUNATHAN', at: new Date(2026, 8, 28, 16, 13) },
              { id: '4', label: 'Cooling period ends', status: 'current', approver: formatDate(addDays(new Date(2026, 8, 28), 3)) },
            ]}
          />
          <Text size="sm" tone="secondary" as="p">We emailed your old contact on 28 Sep. If you didn't ask for this, tell HR now.</Text>
        </Card>
      ) : (
        <>
          <FormField label="What do you want to change?" required>
            <RadioGroup value={kind} onChange={(v) => setKind(v as ProfileChangeKind)} orientation="horizontal" options={[{ value: 'bank', label: 'Bank account' }, { value: 'pan', label: 'PAN' }, { value: 'legal-name', label: 'Legal name' }]} />
          </FormField>
          <ChangeFields kind={kind} value={value} setValue={setValue} ifsc={ifsc} setIfsc={setIfsc} />
          <div className="yx-ppl__row">
            <Button>Cancel</Button>
            <Button variant="primary">Send for approval</Button>
          </div>
        </>
      )}
    </MeFrame>
  );
}

// PPL-32 · phone
export function ProfileChangePhone({ kind = 'bank' }: { kind?: ProfileChangeKind }) {
  const [value, setValue] = useState(kind === 'pan' ? 'BRGPR7712' : '3890 1122 4410');
  const [ifsc, setIfsc] = useState('SBIN0012765');
  return (
    <PhoneFrame tab="me" title={kind === 'bank' ? 'Change bank account' : 'Change PAN'}>
      <ChangeFields kind={kind} value={value} setValue={setValue} ifsc={ifsc} setIfsc={setIfsc} />
      <Button variant="primary" fullWidth>
        Send for approval
      </Button>
    </PhoneFrame>
  );
}

/* ================================================================== PPL-33 my data + who accessed */

const HELD = [
  { what: 'Name, photo, designation, work contact', cls: 'Public' as const, why: 'Directory and collaboration', keep: 'While employed + alumni card' },
  { what: 'Joining date, grade, birthday (day and month)', cls: 'Internal' as const, why: 'Employment records', keep: 'Exit + 8 years' },
  { what: 'Address, personal phone, family, emergency contacts', cls: 'Personal' as const, why: 'Contact, nominations, benefits', keep: 'Exit + 3 years' },
  { what: 'Salary, bank account, PAN, UAN, payslips', cls: 'Confidential' as const, why: 'Payroll and statutory filings', keep: 'Legal minimum (8 years)' },
  { what: 'Aadhaar (masked), health check-up outcome', cls: 'Special' as const, why: 'Identity check, legal health check-up', keep: 'Exit + 1 year' },
];
type Access = (typeof ACCESS_LOG)[number];

/** The live Privacy page (PPL-33): what the company holds about me, my data as a file, who viewed my sensitive data. */
export interface LiveMyData {
  state: 'ready' | 'loading' | 'error';
  onRetry: () => void;
  log: AccessLog | null;
  onDownload: (format: 'pdf' | 'json') => Promise<unknown>;
}
type LiveAccess = AccessLog['entries'][number];

// What the record holds (P02 classes). The design's Special row named a health check-up, which YukthiX does not hold.
const LIVE_HELD = HELD.map((h) => (h.cls === 'Special' ? { ...h, what: 'Aadhaar (masked), background check reports', why: 'Identity check, background check' } : h));

function LiveMyDataScreen({ live, tab }: { live: LiveMyData; tab: 'data' | 'access' }) {
  const [t, setT] = useState(tab);
  const { busy, error, run } = useRun();
  const log = live.log;
  const cols: TableColumn<LiveAccess>[] = [
    { key: 'who', header: 'Who', type: 'person', value: (r) => r.who, person: (r) => ({ name: r.who, secondary: r.role ?? undefined }), width: 240 },
    { key: 'what', header: 'What they viewed', value: (r) => r.what, width: 200 },
    { key: 'why', header: 'Context', value: (r) => r.context, width: 280 },
    { key: 'at', header: 'When', value: (r) => r.at, render: (r) => `${formatDate(new Date(r.at))}, ${new Date(r.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`, width: 200 },
  ];
  return (
    <MeFrame active="Privacy">
      <PageHeader title="Privacy" description={`What ${log?.company ?? 'your company'} holds about you, and who viewed your Confidential or Special data.`} />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load your privacy page" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : live.state === 'loading' || !log ? (
        <ListSkeleton label="Loading your privacy page" />
      ) : (
        <Tabs value={t} onValueChange={(v) => setT(v as 'data' | 'access')}>
          <TabsList aria-label="Privacy">
            <TabsTrigger value="data">My data</TabsTrigger>
            <TabsTrigger value="access" count={log.enabled ? log.entries.length : undefined}>
              Who accessed my data
            </TabsTrigger>
          </TabsList>
          <TabsContent value="data">
            <div className="yx-ppl__stack">
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                <table className="yx-ppl__impact">
                  <thead>
                    <tr>
                      <th scope="col">What we hold</th>
                      <th scope="col">Class</th>
                      <th scope="col">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LIVE_HELD.map((h) => (
                      <tr key={h.what}>
                        <td>{h.what}</td>
                        <td><ClassBadge cls={h.cls} /></td>
                        <td>{h.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {error && (
                <InlineAlert tone="danger" title="That didn't work">
                  {error}
                </InlineAlert>
              )}
              <div className="yx-ppl__row">
                <Button icon={Download} loading={busy === 'pdf'} onClick={() => void run('pdf', () => live.onDownload('pdf'))}>
                  Download my data (PDF)
                </Button>
                <Button icon={Download} loading={busy === 'json'} onClick={() => void run('json', () => live.onDownload('json'))}>
                  Download my data (JSON)
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="access">
            {!log.enabled ? (
              <InlineAlert tone="info" title="Your company has turned this view off">Every view of your Confidential and Special data is still recorded. If the view is turned back on, you'll see the full history.</InlineAlert>
            ) : (
              <div className="yx-ppl__stack">
                <Text as="p">People who viewed your Confidential or Special data. Automatic payroll processing isn't listed.</Text>
                <DataTable label="Who accessed my data" columns={cols} rows={log.entries} getRowId={(r) => r.id} cardSummary empty={<EmptyState title="No one has viewed your sensitive data" description="Views by HR, payroll or your manager appear here." />} />
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </MeFrame>
  );
}

// PPL-33
export function MyDataScreen(props: { tab?: 'data' | 'access'; viewOff?: boolean; live?: LiveMyData }) {
  return props.live ? <LiveMyDataScreen live={props.live} tab={props.tab ?? 'data'} /> : <SampleMyDataScreen {...props} />;
}

function SampleMyDataScreen({ tab = 'data', viewOff = false }: { tab?: 'data' | 'access'; viewOff?: boolean }) {
  const [t, setT] = useState(tab);
  const cols: TableColumn<Access>[] = [
    { key: 'who', header: 'Who', type: 'person', value: (r) => r.who, person: (r) => ({ name: r.who, secondary: r.role }), width: 240 },
    { key: 'what', header: 'What they viewed', value: (r) => r.what, width: 200 },
    { key: 'why', header: 'Context', value: (r) => r.why, width: 280 },
    { key: 'at', header: 'When', value: (r) => r.at, render: (r) => `${formatDate(r.at)}, ${r.at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`, width: 200 },
  ];
  return (
    <MeFrame active="Privacy">
      <PageHeader title="Privacy" description="What Kaveri Foods holds about you, and who viewed your Confidential or Special data." />
      <Tabs value={t} onValueChange={(v) => setT(v as 'data' | 'access')}>
        <TabsList aria-label="Privacy">
          <TabsTrigger value="data">My data</TabsTrigger>
          <TabsTrigger value="access" count={viewOff ? undefined : ACCESS_LOG.length}>
            Who accessed my data
          </TabsTrigger>
        </TabsList>
        <TabsContent value="data">
          <div className="yx-ppl__stack">
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="yx-ppl__impact">
              <thead>
                <tr>
                  <th scope="col">What we hold</th>
                  <th scope="col">Class</th>
                  <th scope="col">Why</th>
                  <th scope="col">How long</th>
                </tr>
              </thead>
              <tbody>
                {HELD.map((h) => (
                  <tr key={h.what}>
                    <td>{h.what}</td>
                    <td><ClassBadge cls={h.cls} /></td>
                    <td>{h.why}</td>
                    <td>{h.keep}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="yx-ppl__row">
              <Button icon={Download}>Download my data (PDF)</Button>
              <Button icon={Download}>Download my data (JSON)</Button>
              <Button>Nominate someone</Button>
              <Button variant="primary">Request a correction</Button>
            </div>
            <Text size="sm" tone="secondary" as="p">Requests are answered within the legal time limit. Data we must keep by law (payroll, tax) stays even if you ask for erasure; we tell you what and why.</Text>
          </div>
        </TabsContent>
        <TabsContent value="access">
          {viewOff ? (
            <InlineAlert tone="info" title="Your company has turned this view off">Every view of your Confidential and Special data is still recorded. If the view is turned back on, you'll see the full history.</InlineAlert>
          ) : (
            <div className="yx-ppl__stack">
              <Text as="p">People who viewed your Confidential or Special data. Automatic payroll processing isn't listed.</Text>
              <DataTable label="Who accessed my data" columns={cols} rows={ACCESS_LOG} getRowId={(r) => r.id} empty={<EmptyState title="No one has viewed your sensitive data" description="Views by HR, payroll or your manager appear here." />} />
              <div>
                <Button>Report a concern</Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </MeFrame>
  );
}

// PPL-33 · phone
export function WhoAccessedPhone() {
  return (
    <PhoneFrame tab="me" title="Who accessed my data">
      <ul className="yx-ppl__phone-list" aria-label="Access log">
        {ACCESS_LOG.map((a) => (
          <li key={a.id} className="yx-ppl__phone-row">
            <div className="yx-ppl__phone-btn">
              <span>
                <strong>{a.who}</strong> viewed {a.what.toLowerCase()}
                <Text size="sm" tone="secondary" as="div">{a.role} · {formatDate(a.at)}</Text>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <Button fullWidth icon={Download}>
        Download my data
      </Button>
    </PhoneFrame>
  );
}

/* ================================================================== PPL-38 disability declaration */

const RPWD = ['Locomotor disability', 'Low vision', 'Blindness', 'Hard of hearing', 'Deaf', 'Specific learning disability', 'Autism spectrum disorder', 'Intellectual disability', 'Mental illness', 'Multiple disabilities', 'Other benchmark disability'];

function DisabilityFields({ consent, setConsent }: { consent: boolean; setConsent: (b: boolean) => void }) {
  return (
    <div className="yx-ppl__form">
      <InlineAlert tone="info" title="This is voluntary">
        You can skip it or withdraw it at any time. It is Special data: you, the HR diversity role and payroll (only the ESI flag it needs) can see it. Your manager never does. Reports show only totals.
      </InlineAlert>
      <Checkbox checked={consent} onChange={setConsent} label="I agree Kaveri Foods may record this to provide reasonable adjustments and apply the correct ESI ceiling" description="Read the notice: how we use disability data" />
      <FormField label="Do you have a disability you want to declare?" required>
        <RadioGroup value="yes" onChange={() => {}} disabled={!consent} orientation="horizontal" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'skip', label: 'Prefer not to say' }]} />
      </FormField>
      <FormField label="Category (RPwD Act 2016)" required>
        <Select options={RPWD.map((x) => ({ value: x, label: x }))} value="Locomotor disability" onChange={() => {}} disabled={!consent} />
      </FormField>
      <FormField label="Percentage on the certificate" required>
        <NumberField value={45} onChange={() => {}} disabled={!consent} suffix="%" />
      </FormField>
      <FormField label="Disability certificate (UDID or medical board)" required helper="Valid until">
        <FileUpload upload={async () => {}} accept={['.pdf', '.jpg']} maxSize={5 * 1024 * 1024} disabled={!consent} />
      </FormField>
      <FormField label="Reasonable adjustments you need" optional>
        <TextArea rows={2} defaultValue="Ground-floor workstation near the lift; flexible start on physiotherapy days." disabled={!consent} />
      </FormField>
      <a href="#eop">Equal opportunity policy</a>
    </div>
  );
}

// PPL-38
export function DisabilityDeclaration({ declared = false, persona = 'emp' }: { declared?: boolean; persona?: 'emp' | 'hr' }) {
  const [consent, setConsent] = useState(declared);
  if (persona === 'hr')
    return (
      <PeopleFrame active="Declarations">
        <PageHeader title="Disability declarations" description="Special class. Visible to the HR diversity role; payroll sees only the ESI flag. Managers never see this." status={<Badge tone="danger">Special</Badge>} />
        <InlineAlert tone="info">Totals in reports are hidden for groups under 5 people.</InlineAlert>
        <DataTable
          label="Declarations"
          columns={[
            { key: 'n', header: 'Employee', type: 'person', value: (r: { n: string }) => r.n, person: (r: { n: string }) => ({ name: r.n }), width: 220 },
            { key: 'c', header: 'Category', value: (r: { c: string }) => r.c, width: 220 },
            { key: 'v', header: 'Certificate valid to', value: (r: { v: string }) => r.v, width: 180 },
            { key: 's', header: 'Status', type: 'status', value: (r: { s: string }) => r.s, statusTone: (v) => (v === 'Verified' ? 'success' : 'warning'), width: 140 },
          ]}
          rows={[
            { id: '1', n: 'Divya Raghunathan', c: 'Locomotor disability · 45%', v: '14 Mar 2031', s: 'Verified' },
            { id: '2', n: 'Joseph Mathew', c: 'Hard of hearing · 50%', v: '2 Nov 2026', s: 'Expiring' },
          ]}
          getRowId={(r) => r.id}
        />
      </PeopleFrame>
    );
  return (
    <MeFrame active="Declarations">
      <PageHeader title="Disability declaration" status={declared ? <StatusBadge status="Verified" /> : undefined} />
      {declared ? (
        <Card title="Your declaration" actions={<Button variant="danger">Withdraw consent</Button>}>
          <dl className="yx-ppl__rail-facts">
            <div><dt>Category</dt><dd>Locomotor disability · 45%</dd></div>
            <div><dt>Certificate</dt><dd>UDID · valid until 14 Mar 2031 · verified by HR</dd></div>
            <div><dt>Adjustments</dt><dd>Ground-floor workstation (done) · flexible start (approved)</dd></div>
            <div><dt>Consent</dt><dd>Given on 3 Feb 2026</dd></div>
          </dl>
          <Text size="sm" tone="secondary" as="p">Withdrawing hides this from everyone except the audit trail.</Text>
        </Card>
      ) : (
        <>
          <DisabilityFields consent={consent} setConsent={setConsent} />
          <div className="yx-ppl__row">
            <Button>Skip</Button>
            <Button variant="primary" disabled={!consent}>
              Save declaration
            </Button>
          </div>
        </>
      )}
    </MeFrame>
  );
}

// PPL-38 · phone
export function DisabilityPhone() {
  const [consent, setConsent] = useState(false);
  return (
    <PhoneFrame tab="me" title="Disability declaration">
      <DisabilityFields consent={consent} setConsent={setConsent} />
      <Button variant="primary" fullWidth disabled={!consent}>
        Save declaration
      </Button>
    </PhoneFrame>
  );
}

/* ================================================================== PPL-43 BFSI declarations */

const HOLDINGS = [
  { id: 'h1', security: 'Kaveri Foods Pvt Ltd (unlisted ESOP)', qty: 1200, how: 'ESOP grant 2024' },
  { id: 'h2', security: 'Deccan Agro Industries Ltd', qty: 350, how: 'Demat · NSDL' },
];
const RELATED = [
  { id: 'r1', name: 'Shalini Kulkarni', relation: 'Spouse', pan: 'XXXXXX4411', holdings: 'None' },
  { id: 'r2', name: 'Suman Kulkarni', relation: 'Mother', pan: 'XXXXXX9082', holdings: 'Deccan Agro Industries Ltd · 80' },
];

// PPL-43
export function BfsiDeclarations({ tab = 'holdings', otpSent = false }: { tab?: 'holdings' | 'related' | 'coi' | 'attest'; otpSent?: boolean }) {
  const [t, setT] = useState(tab);
  return (
    <MeFrame active="Declarations">
      <PageHeader title="Annual declarations 2026–27" description="You are a designated person. Submit holdings, related persons and conflicts by 15 Oct 2026, and attest the code of conduct." status={<Badge tone="warning">Due in 16 days</Badge>} />
      <Tabs value={t} onValueChange={(v) => setT(v as typeof t)}>
        <TabsList aria-label="Declarations">
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="related">Related persons</TabsTrigger>
          <TabsTrigger value="coi">Conflict of interest</TabsTrigger>
          <TabsTrigger value="attest">Code of conduct</TabsTrigger>
        </TabsList>
        <TabsContent value="holdings">
          <div className="yx-ppl__stack">
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="yx-ppl__impact">
              <thead>
                <tr><th scope="col">Security</th><th scope="col">Quantity</th><th scope="col">How held</th></tr>
              </thead>
              <tbody>
                {HOLDINGS.map((h) => (
                  <tr key={h.id}><td>{h.security}</td><td className="yx-ppl__num">{h.qty}</td><td>{h.how}</td></tr>
                ))}
              </tbody>
            </table>
            </div>
            <div><Button icon={Plus}>Add holding</Button></div>
          </div>
        </TabsContent>
        <TabsContent value="related">
          <div className="yx-ppl__stack">
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="yx-ppl__impact">
              <thead>
                <tr><th scope="col">Name</th><th scope="col">Relation</th><th scope="col">PAN</th><th scope="col">Holdings</th></tr>
              </thead>
              <tbody>
                {RELATED.map((r) => (
                  <tr key={r.id}><td>{r.name}</td><td>{r.relation}</td><td className="yx-mono">{r.pan}</td><td>{r.holdings}</td></tr>
                ))}
              </tbody>
            </table>
            </div>
            <div><Button icon={Plus}>Add related person</Button></div>
          </div>
        </TabsContent>
        <TabsContent value="coi">
          <div className="yx-ppl__form">
            <FormField label="Do you or a related person have an interest in a supplier, customer or competitor?" required>
              <RadioGroup value="yes" onChange={() => {}} orientation="horizontal" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
            </FormField>
            <FormField label="Details" required>
              <TextArea rows={3} defaultValue="My brother Vinod is a partner in Hosur Pack Solutions, a packaging vendor to the Hosur plant. I am not involved in vendor selection." />
            </FormField>
          </div>
        </TabsContent>
        <TabsContent value="attest">
          <div className="yx-ppl__form">
            <Card title="Code of conduct, version 2026.1">
              <Text as="p">Updated 1 Apr 2026: gifts limit ₹2,000, new trading-window rules. <a href="#coc">Read the code</a></Text>
            </Card>
            <Checkbox defaultChecked label="I have read and will follow the code of conduct, version 2026.1" />
            {otpSent ? (
              <FormField label="OTP sent to +91 98450 •••71" required helper="Valid for 10 minutes.">
                <TextField inputMode="numeric" defaultValue="" />
              </FormField>
            ) : null}
            <div className="yx-ppl__row">
              <Button>Save draft</Button>
              <Button variant="primary" icon={ShieldCheck}>{otpSent ? 'Verify and submit' : 'Send OTP to attest'}</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </MeFrame>
  );
}

// PPL-43 · compliance officer
export function BfsiComplianceList() {
  const rows = [
    { id: '1', name: 'Arjun Kulkarni', type: 'Holdings and relatives (annual)', due: new Date(2026, 9, 15), status: 'Pending' },
    { id: '2', name: 'Suresh Pillai', type: 'Fit and proper (KMP)', due: new Date(2026, 8, 30), status: 'Pending' },
    { id: '3', name: 'Sana Nizami', type: 'Holdings and relatives (annual)', due: new Date(2026, 8, 15), status: 'Overdue' },
    { id: '4', name: 'Priya Nair', type: 'Code of conduct attestation', due: new Date(2026, 9, 15), status: 'Done' },
  ];
  return (
    <PeopleFrame active="Declarations">
      <PageHeader title="Regulated declarations" description="Confidential to the compliance officer. Overdue items escalate to the head of compliance." status={<Badge tone="warning">Confidential</Badge>} actions={<Button icon={FileText}>Export register</Button>} />
      <DataTable
        label="Declarations"
        columns={[
          { key: 'name', header: 'Person', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name }), width: 220 },
          { key: 'type', header: 'Declaration', value: (r) => r.type, groupable: true, width: 280 },
          { key: 'due', header: 'Due', type: 'date', value: (r) => r.due, width: 130 },
          { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Done' ? 'success' : v === 'Overdue' ? 'danger' : 'warning'), width: 130 },
        ]}
        rows={rows}
        getRowId={(r) => r.id}
        rowButtons={(r) => (r.status === 'Done' ? <Button variant="review" size="sm">Review</Button> : <Button size="sm">Remind</Button>)}
      />
    </PeopleFrame>
  );
}

// PPL-43 · phone
export function BfsiPhone() {
  return (
    <PhoneFrame tab="me" title="Code of conduct">
      <Card title="Version 2026.1">
        <Text as="p">Gifts limit ₹2,000; new trading-window rules.</Text>
      </Card>
      <Checkbox defaultChecked label="I have read and will follow the code of conduct" />
      <Button variant="primary" fullWidth icon={ShieldCheck}>
        Send OTP to attest
      </Button>
    </PhoneFrame>
  );
}

/* ================================================================== PPL-44 trading pre-clearance */

export type PreclearView = 'request' | 'approved' | 'blocked' | 'report' | 'expired';

// PPL-44
export function TradingPreclearance({ view = 'request', today }: { view?: PreclearView; today: Date }) {
  const approvedOn = view === 'expired' ? new Date(2026, 8, 14) : new Date(2026, 8, 28);
  const state = preclearanceState(approvedOn, 7, today, view === 'report', view === 'blocked');
  const validUntil = addDays(approvedOn, 6);
  return (
    <MeFrame active="Declarations">
      <PageHeader title="Trading pre-clearance" description="Designated persons need pre-clearance for trades above ₹10,00,000 in a quarter. Approval is valid for 7 trading days and never during a closed trading window." />
      {view === 'blocked' && <InlineAlert tone="danger" title="Trading window closed until 16 Oct 2026">Quarterly results are due. You can't request or use a pre-clearance until the window reopens.</InlineAlert>}
      {view === 'request' || view === 'blocked' ? (
        <div className="yx-ppl__form">
          <FormField label="Security" required>
            <Select options={[{ value: 'dai', label: 'Deccan Agro Industries Ltd' }]} value="dai" onChange={() => {}} disabled={view === 'blocked'} />
          </FormField>
          <FormField label="Buy or sell" required>
            <RadioGroup value="sell" onChange={() => {}} orientation="horizontal" disabled={view === 'blocked'} options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} />
          </FormField>
          <FormField label="Quantity" required>
            <NumberField value={350} onChange={() => {}} disabled={view === 'blocked'} />
          </FormField>
          <FormField label="Approximate value" required>
            <CurrencyField value={1225000} onChange={() => {}} disabled={view === 'blocked'} />
          </FormField>
          <Checkbox label="I don't hold unpublished price-sensitive information about this company" defaultChecked disabled={view === 'blocked'} />
          <div className="yx-ppl__row">
            <Button>Cancel</Button>
            <Button variant="primary" disabled={view === 'blocked'}>
              Request pre-clearance
            </Button>
          </div>
        </div>
      ) : (
        <Card title="Sell 350 Deccan Agro Industries Ltd · PC-2026-0114" actions={<StatusBadge status={state === 'valid' ? 'Approved' : state === 'trade reported' ? 'Done' : 'Expired'} />}>
          <dl className="yx-ppl__rail-facts">
            <div><dt>Decision</dt><dd>Approved by Kavitha Menon (compliance officer) on {formatDate(approvedOn)}</dd></div>
            <div><dt>Valid until</dt><dd>{formatDate(validUntil)} ({state})</dd></div>
            <div><dt>Value</dt><dd>{formatINR(1225000)}</dd></div>
          </dl>
          {view === 'approved' && (
            <div className="yx-ppl__form">
              <h3 className="yx-ppl__section-title">Report the trade</h3>
              <FormField label="Traded on" required>
                <DatePicker value={today} onChange={() => {}} />
              </FormField>
              <FormField label="Quantity traded" required>
                <NumberField value={350} onChange={() => {}} />
              </FormField>
              <FormField label="Contract note" required>
                <FileUpload upload={async () => {}} accept={['.pdf']} maxSize={5 * 1024 * 1024} />
              </FormField>
              <div><Button variant="primary">Report trade</Button></div>
            </div>
          )}
          {view === 'expired' && <InlineAlert tone="warning">The window ended without a trade report. Report the trade if you made it, or request again.</InlineAlert>}
          {view === 'report' && <InlineAlert tone="success">Trade reported on {formatDate(today)}. Late or missing reports alert the compliance officer.</InlineAlert>}
        </Card>
      )}
    </MeFrame>
  );
}

// PPL-44 · compliance officer list
export function PreclearanceQueue() {
  const rows = [
    { id: '1', name: 'Arjun Kulkarni', trade: 'Sell 350 Deccan Agro Industries Ltd', value: 1225000, requested: new Date(2026, 8, 28), status: 'Pending' },
    { id: '2', name: 'Sana Nizami', trade: 'Buy 500 Coromandel Textiles Ltd', value: 1840000, requested: new Date(2026, 8, 26), status: 'Approved' },
    { id: '3', name: 'Suresh Pillai', trade: 'Sell 1,000 Nilgiri Logistics Ltd', value: 2100000, requested: new Date(2026, 8, 12), status: 'Expired' },
  ];
  return (
    <PeopleFrame active="Declarations">
      <PageHeader title="Pre-clearance requests" status={<Badge tone="warning">Confidential</Badge>} description="Decide within 2 working days. Approvals are valid for 7 trading days." />
      <DataTable
        label="Pre-clearance requests"
        columns={[
          { key: 'name', header: 'Person', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name }), width: 200 },
          { key: 'trade', header: 'Trade', value: (r) => r.trade, width: 300 },
          { key: 'value', header: 'Value', type: 'money', value: (r) => r.value, width: 140 },
          { key: 'requested', header: 'Requested', type: 'date', value: (r) => r.requested, width: 130 },
          { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Approved' ? 'success' : v === 'Expired' ? 'neutral' : 'warning'), width: 120 },
        ]}
        rows={rows}
        getRowId={(r) => r.id}
        rowButtons={(r) => (r.status === 'Pending' ? (<><Button size="sm">Reject</Button><Button variant="approve" size="sm">Approve</Button></>) : null)}
      />
    </PeopleFrame>
  );
}

// PPL-44 · phone
export function PreclearancePhone({ today }: { today: Date }) {
  const state = preclearanceState(new Date(2026, 8, 28), 7, today, false, false);
  return (
    <PhoneFrame tab="requests" title="Pre-clearance">
      <Card title="Sell 350 Deccan Agro">
        <Text as="p">Approved · valid until {formatDate(addDays(new Date(2026, 8, 28), 6))}</Text>
        <Badge tone={state === 'valid' ? 'success' : 'warning'}>{state}</Badge>
      </Card>
      <Button variant="primary" fullWidth>
        Report trade
      </Button>
      <Button fullWidth>New request</Button>
    </PhoneFrame>
  );
}
