import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { MenuItem } from '../../../components/menu';
import { EmptyState, InlineAlert, Meter } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { ifscBank } from '../people-logic';
import { Text } from '../../../components/foundations';
import { FileUpload } from '../../../components/upload';
import { CodeField, NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { Choice, JoinerForms, JoinerPlaces, Letter, LoadState, PortalAnswers, PortalMe, SectionKey, Signatory } from './types';

// Lifecycle batch 6b, wired (design §8, §9, §14): HR's joiner panel (forms, BGV, Mark joined, cancel), the
// pre-boarding portal (T9-01), letter templates and signatories (PPL-29), the letters register (PPL-28), my letters,
// and Ready to onboard (PPL-12). Plain words; errors show after Save, never while typing.

const SECTION_LABEL: Record<SectionKey, string> = { personal: 'Personal details', identity: 'PAN and ID', bank: 'Bank account', emergency: 'Emergency contact', nominees: 'Nominees (PF and gratuity)', tax: 'Tax regime' };
const LETTER_STATUS: Record<Letter['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  discarded: { label: 'Discarded', tone: 'neutral' },
  pending_approval: { label: 'Waiting for approval', tone: 'info' },
  rejected: { label: 'Not approved', tone: 'danger' },
  rendering: { label: 'Being prepared', tone: 'warning' },
  awaiting_signature: { label: 'Waiting for the company signature', tone: 'warning' },
  issued: { label: 'Issued', tone: 'success' },
  superseded: { label: 'Replaced by a correction', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};
const fromKey = (iso: string) => new Date(`${iso}T00:00:00`);
const STATES: Choice[] = [
  ['IN-AP', 'Andhra Pradesh'], ['IN-AS', 'Assam'], ['IN-BR', 'Bihar'], ['IN-CT', 'Chhattisgarh'], ['IN-DL', 'Delhi'], ['IN-GA', 'Goa'], ['IN-GJ', 'Gujarat'], ['IN-HR', 'Haryana'], ['IN-HP', 'Himachal Pradesh'], ['IN-JH', 'Jharkhand'], ['IN-KA', 'Karnataka'], ['IN-KL', 'Kerala'], ['IN-MP', 'Madhya Pradesh'], ['IN-MH', 'Maharashtra'], ['IN-OR', 'Odisha'], ['IN-PB', 'Punjab'], ['IN-RJ', 'Rajasthan'], ['IN-TN', 'Tamil Nadu'], ['IN-TG', 'Telangana'], ['IN-UP', 'Uttar Pradesh'], ['IN-UT', 'Uttarakhand'], ['IN-WB', 'West Bengal'],
].map(([value, label]) => ({ value, label }));

function SectionsList({ sections }: { sections: Record<SectionKey, 'done' | 'to_do'> }) {
  return (
    <ul className="yx-lif-list">
      {(Object.keys(SECTION_LABEL) as SectionKey[]).map((k) => (
        <li key={k}>
          <Badge tone={sections[k] === 'done' ? 'success' : 'neutral'}>{sections[k] === 'done' ? 'Done' : 'To do'}</Badge> <Text>{SECTION_LABEL[k]}</Text>
        </li>
      ))}
    </ul>
  );
}

function AnswersList({ a }: { a: PortalAnswers }) {
  const rows: [string, string | null][] = [
    ['Date of birth', a.personal ? dateText(a.personal.dateOfBirth) : null],
    ['Address', a.personal ? [a.personal.addressLine1, a.personal.city, a.personal.postalCode].join(', ') : null],
    ['PAN', a.identity?.pan ?? null],
    ['Aadhaar', a.identity?.aadhaar ?? null],
    ['Bank account', a.bank ? `${a.bank.account} · ${a.bank.ifsc}` : null],
    ['Emergency contact', a.emergency ? `${a.emergency.name} (${a.emergency.relation}), ${a.emergency.phone}` : null],
    ['Nominees', a.nominees ? a.nominees.map((n) => `${n.name} ${n.sharePercent}%`).join(', ') : null],
    ['Tax regime', a.tax ? (a.tax.regime === 'new' ? 'New regime' : 'Old regime') : null],
  ];
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return <Text tone="secondary">Nothing filled in yet, or nothing you may see.</Text>;
  return (
    <ul className="yx-lif-list">
      {shown.map(([k, v]) => (
        <li key={k}>
          <Text tone="secondary">{k}:</Text> <Text>{v}</Text>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------------------------------ HR's joiner panel

export interface JoinerPanelProps {
  forms: JoinerForms;
  today: string;
  joiningOn: string;
  places: JoinerPlaces;
  plan: { departmentId: string | null; designationId: string | null; employmentTypeId: string | null };
  canJoin: boolean;
  onPlan: (patch: { departmentId?: string; designationId?: string; employmentTypeId?: string }) => Promise<unknown>;
  onJoin: (input: { identityAttested: boolean; status: 'probation' | 'confirmed' }) => Promise<unknown>;
  bgv?: {
    onAsk: () => Promise<unknown>;
    onAdd: (checkType: string, gate: string) => Promise<unknown>;
    onUpdate: (checkId: string, version: number, input: { status: string; note: string; file: File | null }) => Promise<unknown>;
  };
}

const CHECKS: Choice[] = ['identity', 'address', 'education', 'employment', 'criminal', 'reference', 'credit'].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }));

export function JoinerPanel(p: JoinerPanelProps) {
  const f = p.forms;
  const [ask, setAsk] = useState<null | 'join' | 'plan' | 'check'>(null);
  const [status, setStatus] = useState<'probation' | 'confirmed'>('probation');
  const [attested, setAttested] = useState(false);
  const [dept, setDept] = useState<string | null>(p.plan.departmentId);
  const [desig, setDesig] = useState<string | null>(p.plan.designationId);
  const [type, setType] = useState<string | null>(p.plan.employmentTypeId);
  const [checkType, setCheckType] = useState<string | null>(null);
  const [gate, setGate] = useState<'none' | 'before_joining'>('none');
  const [result, setResult] = useState<{ id: string; version: number } | null>(null);
  const [resStatus, setResStatus] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [triedResult, setTriedResult] = useState(false);
  const closeAsk = () => {
    setAsk(null);
    setTried(false);
  };
  const { busy, error, run } = useRun();
  const missingPlan = !p.plan.departmentId || !p.plan.designationId || !p.plan.employmentTypeId;
  const dayReached = p.joiningOn <= p.today;
  if (f.status !== 'invited') {
    return (
      <Card title="Joiner">
        <Badge tone={f.status === 'joined' ? 'success' : 'neutral'}>{f.status === 'joined' ? 'Joined' : `Cancelled: ${String(f.outcome).replace(/_/g, ' ')}`}</Badge>
      </Card>
    );
  }
  return (
    <>
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <Card
        title="Pre-boarding forms"
        actions={
          p.canJoin ? (
            <>
              {missingPlan && <Button onClick={() => setAsk('plan')}>Add job details</Button>}
              <Button variant="primary" disabled={!dayReached || missingPlan} onClick={() => setAsk('join')}>
                Mark joined
              </Button>
            </>
          ) : undefined
        }
      >
        <Meter value={f.completion} max={100} label="Pre-boarding done" warnAt={101} dangerAt={101} valueText={`${f.completion}% done by the joiner`} />
        {!dayReached && p.canJoin && <Text as="p" tone="secondary" size="sm">{`Mark joined becomes available on ${dateText(p.joiningOn)}, the joining day.`}</Text>}
        {missingPlan && p.canJoin && <Text as="p" tone="secondary" size="sm">Add the department, designation and employment type before the joining day.</Text>}
        <div className="yx-lif-grid">
          <SectionsList sections={f.sections} />
          <AnswersList a={f.answers} />
        </div>
      </Card>
      {f.bgv && p.bgv && (
        <Card
          title="Background check"
          actions={
            !f.bgv.requested ? (
              <Button loading={busy === 'ask'} onClick={() => void run('ask', p.bgv!.onAsk)}>
                Ask for consent
              </Button>
            ) : f.bgv.consent && !f.bgv.consent.withdrawnAt ? (
              <Button onClick={() => setAsk('check')}>Add a check</Button>
            ) : undefined
          }
        >
          <Text as="p">{!f.bgv.requested ? 'The joiner has not been asked for consent. No check can start without it.' : !f.bgv.consent ? 'Waiting for the joiner to give consent in the joining portal.' : f.bgv.consent.withdrawnAt ? `The joiner withdrew consent on ${dateText(f.bgv.consent.withdrawnAt.slice(0, 10))}. Checks stopped.` : `Consent given on ${dateText(f.bgv.consent.givenAt.slice(0, 10))}.`}</Text>
          {f.bgv.checks.length > 0 && (
            <ul className="yx-lif-list">
              {f.bgv.checks.map((k) => (
                <li key={k.id}>
                  <Text>{k.checkType[0].toUpperCase() + k.checkType.slice(1)}</Text> <Badge tone={k.status === 'clear' ? 'success' : k.status === 'discrepancy' ? 'warning' : 'neutral'}>{k.status.replace(/_/g, ' ')}</Badge>
                  {k.gate === 'before_joining' && <Badge tone="info">Must be clear before joining</Badge>}
                  {k.note && <Text tone="secondary" size="sm">{k.note}</Text>}
                  {!['cancelled'].includes(k.status) && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setResult({ id: k.id, version: k.version });
                        setResStatus(null);
                        setNote('');
                        setFile(null);
                      }}
                    >
                      Record result
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Text as="p" tone="secondary" size="sm">A discrepancy only flags it here for HR. Nothing about the offer changes by itself.</Text>
        </Card>
      )}
      {ask === 'join' && (
        <ConfirmDialog open onOpenChange={(o) => !o && closeAsk()} size="md" title="Mark as joined?" consequence="The employee record is made today with the planned job. PAN, Aadhaar and bank details go to someone else for approval. The joining portal closes." confirmLabel="Mark joined" onConfirm={async () => { setTried(true); if (!attested) return false; await p.onJoin({ identityAttested: attested, status }); }}>
          <Segment label="Starts on" value={status} onChange={setStatus} options={[{ value: 'probation', label: 'Probation' }, { value: 'confirmed', label: 'Confirmed' }]} />
          <FormField id="jn-id" label="Identity check" hideLabel required error={tried && !attested ? "Tick that you checked the joiner's original ID today." : null}>
            <Checkbox checked={attested} onChange={setAttested} label="I checked the joiner's original ID today" description="Required. YukthiX records who checked and when." />
          </FormField>
        </ConfirmDialog>
      )}
      {ask === 'plan' && (
        <ConfirmDialog open onOpenChange={(o) => !o && closeAsk()} size="md" title="Job details" confirmLabel="Save" onConfirm={async () => { setTried(true); if (!dept || !desig || !type) return false; await p.onPlan({ departmentId: dept, designationId: desig, employmentTypeId: type }); }}>
          <FormField id="pl-dept" label="Department" required error={tried && !dept ? 'Choose the department.' : null}>
            <Select aria-label="Department" value={dept} onChange={setDept} options={p.places.departments} searchable />
          </FormField>
          <FormField id="pl-desig" label="Designation" required error={tried && !desig ? 'Choose the designation.' : null}>
            <Select aria-label="Designation" value={desig} onChange={setDesig} options={p.places.designations} searchable />
          </FormField>
          <FormField id="pl-type" label="Employment type" required error={tried && !type ? 'Choose the employment type.' : null}>
            <Select aria-label="Employment type" value={type} onChange={setType} options={p.places.employmentTypes} />
          </FormField>
        </ConfirmDialog>
      )}
      {ask === 'check' && p.bgv && (
        <ConfirmDialog open onOpenChange={(o) => !o && closeAsk()} size="md" title="Add a background check" confirmLabel="Add check" onConfirm={async () => { setTried(true); if (!checkType) return false; await p.bgv!.onAdd(checkType, gate); }}>
          <FormField id="bg-type" label="What to check" required error={tried && !checkType ? 'Choose what to check.' : null}>
            <Select aria-label="What to check" value={checkType} onChange={setCheckType} options={CHECKS} />
          </FormField>
          <Segment label="Joining" value={gate} onChange={setGate} options={[{ value: 'none', label: 'Can join before the result' }, { value: 'before_joining', label: 'Must be clear first' }]} />
        </ConfirmDialog>
      )}
      {result && p.bgv && (
        <ConfirmDialog open onOpenChange={(o) => { if (!o) { setResult(null); setTriedResult(false); } }} size="md" title="Record the result" confirmLabel="Save" onConfirm={async () => {
          setTriedResult(true);
          if (!resStatus) return false;
          await p.bgv!.onUpdate(result.id, result.version, { status: resStatus!, note: note.trim(), file });
          setResult(null);
        }}>
          <FormField id="bg-status" label="Result" required error={triedResult && !resStatus ? 'Choose the result.' : null}>
            <Select aria-label="Result" value={resStatus} onChange={setResStatus} options={[{ value: 'in_progress', label: 'In progress' }, { value: 'clear', label: 'Clear' }, { value: 'discrepancy', label: 'Discrepancy found' }, { value: 'unable', label: 'Could not be checked' }]} />
          </FormField>
          <FormField id="bg-note" label="Note" optional>
            <TextArea value={note} onChange={setNote} rows={2} maxLength={1000} />
          </FormField>
          <FormField id="bg-file" label="Report" optional helper="Kept as Special data.">
            <FileUpload id="bg-file" upload={async (f) => setFile(f)} accept={['.pdf', '.jpg', '.jpeg', '.png']} multiple={false} onItemsChange={(items) => items.length === 0 && setFile(null)} />
          </FormField>
        </ConfirmDialog>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------ the pre-boarding portal

export interface PortalSignInProps {
  company: string;
  /** The alumni login reuses this (lifecycle 6d). */
  title?: string;
  intro?: string;
  onCode: (email: string) => Promise<unknown>;
  onVerify: (email: string, code: string) => Promise<unknown>;
}

export function PortalSignIn(p: PortalSignInProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useRun();
  return (
    <div className="yx-auth__page">
      <Card title={p.title ?? `Joining ${p.company}`}>
        <Text as="p">{p.intro ?? 'Sign in with the personal email you gave HR. We send you a one-time code.'}</Text>
        {error && (
          <InlineAlert tone="danger" title="Not signed in">
            {error}
          </InlineAlert>
        )}
        <FormField id="ps-email" label="Personal email" required>
          <TextField type="email" value={email} onChange={setEmail} autoComplete="email" disabled={sent} />
        </FormField>
        {sent ? (
          <>
            <FormField id="ps-code" label="Code" required helper="6 digits. It expires in a few minutes.">
              <CodeField value={code} onChange={setCode} />
            </FormField>
            <Button variant="primary" loading={busy === 'v'} disabled={code.length !== 6} onClick={() => void run('v', () => p.onVerify(email.trim(), code))}>
              Sign in
            </Button>
            <Button onClick={() => setSent(false)}>Use another email</Button>
          </>
        ) : (
          <Button variant="primary" loading={busy === 'c'} disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())} onClick={() => void run('c', async () => { await p.onCode(email.trim()); setSent(true); })}>
            Send me a code
          </Button>
        )}
      </Card>
    </div>
  );
}

export interface PortalScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: PortalMe | null;
  onSave: (section: SectionKey, value: unknown) => Promise<unknown>;
  onStepUpCode: () => Promise<unknown>;
  onStepUp: (code: string) => Promise<unknown>;
  onUpload: (typeKey: string, file: File) => Promise<unknown>;
  onBgv: (consent: boolean, noticeVersion: string) => Promise<unknown>;
  onDownload: (letter: Letter, which: 'letter' | 'acceptance') => Promise<unknown>;
  onSignCode: (letter: Letter) => Promise<unknown>;
  onSign: (letter: Letter, input: { code: string; accept: boolean; disclosureAccepted: boolean }) => Promise<unknown>;
  onSignOut: () => void;
}

/** T9-01: the joiner's own checklist before day one. */
export function PortalScreen(p: PortalScreenProps) {
  const d = p.data;
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [signing, setSigning] = useState<Letter | null>(null);
  const { busy, error, run } = useRun();
  return (
    <LivePage
      title={d ? `Welcome, ${d.name.split(' ')[0]}` : 'Joining'}
      description={d ? `You join ${d.employer} on ${dateText(d.joiningOn)} at ${d.location}${d.designation ? ` as ${d.designation}` : ''}${d.manager ? `. Your manager is ${d.manager}` : ''}.` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="your joining forms"
      actions={<Button onClick={p.onSignOut}>Sign out</Button>}
    >
      {d && (
        <>
          {error && (
            <InlineAlert tone="danger" title="That didn't work">
              {error}
            </InlineAlert>
          )}
          <Card title="Your progress">
            <Meter value={d.completion} max={100} label="Joining forms done" warnAt={101} dangerAt={101} valueText={`${d.completion}% done`} />
          </Card>
          <Card title="Your details">
            <ul className="yx-lif-list">
              {(Object.keys(SECTION_LABEL) as SectionKey[]).map((k) => (
                <li key={k}>
                  <Badge tone={d.sections[k] === 'done' ? 'success' : 'neutral'}>{d.sections[k] === 'done' ? 'Done' : 'To do'}</Badge> <Text>{SECTION_LABEL[k]}</Text>{' '}
                  <Button size="sm" onClick={() => setOpen(k)}>
                    {d.sections[k] === 'done' ? 'Change' : 'Fill in'}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
          {d.documents.length > 0 && (
            <Card title="Documents">
              <ul className="yx-lif-list">
                {d.documents.map((x) => (
                  <li key={x.typeKey}>
                    <Badge tone={x.status === 'verified' ? 'success' : x.status === 'uploaded' ? 'info' : x.status === 'rejected' ? 'danger' : 'neutral'}>{x.status === 'verified' ? 'Accepted' : x.status === 'uploaded' ? 'Sent, HR checks it' : x.status === 'rejected' ? 'Please send again' : 'To send'}</Badge> <Text>{x.name}</Text>
                    {x.rejectReason && x.status === 'rejected' && <Text tone="danger" size="sm">{x.rejectReason}</Text>}
                    {x.personUploads && x.status !== 'verified' && (
                      <label className="yx-button" data-variant="secondary" data-size="sm">
                        <Upload size={14} aria-hidden /> {busy === x.typeKey ? 'Sending…' : 'Upload'}
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          capture="environment"
                          className="yx-visually-hidden"
                          aria-label={`Upload ${x.name}`}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void run(x.typeKey, () => p.onUpload(x.typeKey, f));
                          }}
                        />
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {d.bgv && (
            <Card title="Background check consent">
              <ul>
                {d.bgv.items.map((i) => (
                  <li key={i}>
                    <Text>{i}</Text>
                  </li>
                ))}
              </ul>
              {d.bgv.consented ? (
                <>
                  <Text as="p">{`You gave consent on ${dateText(d.bgv.consentedAt!.slice(0, 10))}.`}</Text>
                  <Button loading={busy === 'bgv'} onClick={() => void run('bgv', () => p.onBgv(false, d.bgv!.notice))}>
                    Withdraw consent
                  </Button>
                </>
              ) : (
                <Button variant="primary" loading={busy === 'bgv'} onClick={() => void run('bgv', () => p.onBgv(true, d.bgv!.notice))}>
                  I give consent
                </Button>
              )}
            </Card>
          )}
          <LetterList letters={d.letters} onDownload={p.onDownload} onAccept={setSigning} />
          {open && <SectionDrawer section={open} me={d} onClose={() => setOpen(null)} onSave={p.onSave} onStepUpCode={p.onStepUpCode} onStepUp={p.onStepUp} />}
          {signing && <AcceptDialog letter={signing} disclosureNeeded={!d.esignAccepted} onClose={() => setSigning(null)} onCode={() => p.onSignCode(signing)} onSign={(x) => p.onSign(signing, x)} />}
        </>
      )}
    </LivePage>
  );
}

function SectionDrawer({ section, me, onClose, onSave, onStepUpCode, onStepUp }: { section: SectionKey; me: PortalMe; onClose: () => void; onSave: PortalScreenProps['onSave']; onStepUpCode: () => Promise<unknown>; onStepUp: (code: string) => Promise<unknown> }) {
  const a = me.answers;
  const [v, setV] = useState<Record<string, string>>(() => ({
    ...(section === 'personal' && a.personal ? { ...a.personal } : {}),
    ...(section === 'emergency' && a.emergency ? { ...a.emergency } : {}),
    ...(section === 'identity' && a.identity ? { legalName: a.identity.legalName } : {}),
    ...(section === 'bank' && a.bank ? { holderName: a.bank.holderName, ifsc: a.bank.ifsc } : {}),
    ...(section === 'tax' && a.tax ? { regime: a.tax.regime } : {}),
  }));
  const [nominees, setNominees] = useState(a.nominees ?? [{ name: '', relation: '', sharePercent: 100 }]);
  const [stepped, setStepped] = useState(me.steppedUp);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (x: string) => setV({ ...v, [k]: x });
  const need: Record<SectionKey, [string, string][]> = {
    personal: [['dateOfBirth', 'Give your date of birth.'], ['gender', 'Choose an option.'], ['addressLine1', 'Give your address.'], ['city', 'Give your city.'], ['stateCode', 'Choose your state.'], ['postalCode', 'Give your PIN code.']],
    identity: [['legalName', 'Give your name as on PAN.'], ['pan', 'Give your PAN.']],
    bank: [['holderName', 'Give the account holder name.'], ['accountNumber', 'Give the account number.'], ['ifsc', 'Give the IFSC.']],
    emergency: [['name', 'Give a name.'], ['relation', 'Give the relation.'], ['phone', 'Give a phone number.']],
    nominees: [],
    tax: [['regime', 'Choose a regime.']],
  };
  const errors = [
    ...need[section].filter(([k]) => !v[k]?.trim()).map(([k, m]) => ({ fieldId: `ps-${k}`, message: m })),
    ...(section === 'nominees' && nominees.reduce((n, x) => n + (x.sharePercent || 0), 0) !== 100 ? [{ fieldId: 'ps-nominees', message: 'The shares must add up to 100%.' }] : []),
  ];
  const sv = useSaveErrors(errors);
  const sensitive = section === 'identity' || section === 'bank';
  const save = async () => {
    if (errors.length) return sv.reveal();
    setSaving(true);
    setFailed(null);
    try {
      const value = section === 'nominees' ? { nominees } : Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''));
      await onSave(section, value);
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const field = (k: string, label: string, o: { type?: string; optional?: boolean; helper?: string; max?: number } = {}) => (
    <FormField id={`ps-${k}`} label={label} required={!o.optional} optional={o.optional} helper={o.helper} error={sv.errorOf(`ps-${k}`)}>
      <TextField type={o.type ?? 'text'} value={v[k] ?? ''} onChange={set(k)} maxLength={o.max ?? 200} autoComplete="off" />
    </FormField>
  );
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={SECTION_LABEL[section]} size="lg" footer={sensitive && !stepped ? <Button onClick={onClose}>Cancel</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>Save</Button></>}>
      {sv.showErrors && <ErrorSummary errors={sv.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      {sensitive && !stepped ? (
        <>
          <Text as="p">For PAN, Aadhaar and bank details we first send a fresh code to your email.</Text>
          {codeSent ? (
            <>
              <FormField id="ps-step" label="Code" required>
                <CodeField value={code} onChange={setCode} />
              </FormField>
              <Button
                variant="primary"
                disabled={code.length !== 6}
                onClick={async () => {
                  try {
                    await onStepUp(code);
                    setStepped(true);
                  } catch (e) {
                    setFailed(errorText(e));
                  }
                }}
              >
                Continue
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await onStepUpCode();
                  setCodeSent(true);
                } catch (e) {
                  setFailed(errorText(e));
                }
              }}
            >
              Send me a code
            </Button>
          )}
        </>
      ) : section === 'personal' ? (
        <>
          <FormField id="ps-dateOfBirth" label="Date of birth" required error={sv.errorOf('ps-dateOfBirth')}>
            <DatePicker value={v.dateOfBirth ? fromKey(v.dateOfBirth) : null} onChange={(x) => set('dateOfBirth')(x ? dayKey(x) : '')} max={new Date()} aria-label="Date of birth" />
          </FormField>
          <FormField id="ps-gender" label="Gender" required error={sv.errorOf('ps-gender')}>
            <Select aria-label="Gender" value={v.gender ?? null} onChange={(x) => set('gender')(x ?? '')} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'transgender', label: 'Transgender' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }]} />
          </FormField>
          {field('addressLine1', 'Address')}
          {field('addressLine2', 'Address line 2', { optional: true })}
          {field('city', 'City', { max: 100 })}
          <FormField id="ps-stateCode" label="State" required error={sv.errorOf('ps-stateCode')}>
            <Select aria-label="State" value={v.stateCode ?? null} onChange={(x) => set('stateCode')(x ?? '')} options={STATES} searchable />
          </FormField>
          {field('postalCode', 'PIN code', { max: 6 })}
        </>
      ) : section === 'identity' ? (
        <>
          {field('legalName', 'Name as on PAN')}
          {field('pan', 'PAN', { max: 10, helper: a.identity ? `On file: ${a.identity.pan}. Type it again to change it.` : '5 letters, 4 digits, 1 letter.' })}
          {field('aadhaar', 'Aadhaar', { optional: true, max: 12, helper: 'Optional. You can show another photo ID on your first day.' })}
          {field('uan', 'UAN (if you had a PF account before)', { optional: true, max: 12 })}
        </>
      ) : section === 'bank' ? (
        <>
          {field('holderName', 'Account holder name')}
          {field('accountNumber', 'Account number', { max: 18, helper: a.bank ? `On file: ${a.bank.account}. Type it again to change it.` : undefined })}
          {field('ifsc', 'IFSC', { max: 11, helper: ifscBank(v.ifsc ?? '') ?? undefined })}
        </>
      ) : section === 'emergency' ? (
        <>
          {field('name', 'Name', { max: 100 })}
          {field('relation', 'Relation', { max: 40 })}
          {field('phone', 'Phone', { type: 'tel', max: 16 })}
        </>
      ) : section === 'nominees' ? (
        <FormField id="ps-nominees" label="Who receives your PF and gratuity" required error={sv.errorOf('ps-nominees')} helper="The shares add up to 100%.">
          <div className="yx-lif-list">
            {nominees.map((n, i) => (
              <div key={i} className="yx-lif-grid">
                <TextField aria-label={`Nominee ${i + 1} name`} value={n.name} onChange={(x) => setNominees(nominees.map((y, j) => (j === i ? { ...y, name: x } : y)))} placeholder="Name" maxLength={100} />
                <TextField aria-label={`Nominee ${i + 1} relation`} value={n.relation} onChange={(x) => setNominees(nominees.map((y, j) => (j === i ? { ...y, relation: x } : y)))} placeholder="Relation" maxLength={40} />
                <NumberField aria-label={`Nominee ${i + 1} share (%)`} value={n.sharePercent} onChange={(x) => setNominees(nominees.map((y, j) => (j === i ? { ...y, sharePercent: x ?? 0 } : y)))} min={1} max={100} />
              </div>
            ))}
            {nominees.length < 6 && <Button size="sm" onClick={() => setNominees([...nominees, { name: '', relation: '', sharePercent: 0 }])}>Add a nominee</Button>}
          </div>
        </FormField>
      ) : (
        <FormField id="ps-regime" label="Income-tax regime" required error={sv.errorOf('ps-regime')} helper="You can change it later in the year, as the law allows.">
          <Segment label="Income-tax regime" value={(v.regime as 'new' | 'old') ?? null} onChange={set('regime')} options={[{ value: 'new', label: 'New regime' }, { value: 'old', label: 'Old regime' }]} />
        </FormField>
      )}
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ letters (person side)

function LetterList({ letters, onDownload, onAccept }: { letters: Letter[]; onDownload: (l: Letter, which: 'letter' | 'acceptance') => Promise<unknown>; onAccept: (l: Letter) => void }) {
  const { busy, error, run } = useRun();
  if (!letters.length) return null;
  return (
    <Card title="Letters">
      {error && (
        <InlineAlert tone="danger" title="Not downloaded">
          {error}
        </InlineAlert>
      )}
      <ul className="yx-lif-list">
        {letters.map((l) => (
          <li key={l.id}>
            <Text>{l.title.split(': ')[0]}</Text> <Text tone="secondary" size="sm">{l.referenceNo}</Text> <Badge tone={LETTER_STATUS[l.status].tone}>{LETTER_STATUS[l.status].label}</Badge>
            {l.signature?.status === 'signed' && <Badge tone="success">You accepted it</Badge>}
            <Button size="sm" loading={busy === l.id} onClick={() => void run(l.id, () => onDownload(l, 'letter'))}>
              Download
            </Button>
            {l.signature?.status === 'signed' && (
              <Button size="sm" loading={busy === `${l.id}-a`} onClick={() => void run(`${l.id}-a`, () => onDownload(l, 'acceptance'))}>
                Accepted copy
              </Button>
            )}
            {l.status === 'issued' && l.signature?.status === 'open' && (
              <Button size="sm" variant="primary" onClick={() => onAccept(l)}>
                Read and accept
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AcceptDialog({ letter, disclosureNeeded, onClose, onCode, onSign }: { letter: Letter; disclosureNeeded: boolean; onClose: () => void; onCode: () => Promise<unknown>; onSign: (x: { code: string; accept: boolean; disclosureAccepted: boolean }) => Promise<unknown> }) {
  const [disclosure, setDisclosure] = useState(!disclosureNeeded);
  const [accept, setAccept] = useState(false);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={`Accept: ${letter.title.split(': ')[0]}`}
      consequence="Download and read the letter first. Your acceptance is recorded with the time, your device and the code, and you get a sealed copy."
      confirmLabel="Accept"
      onConfirm={async () => {
        setTried(true);
        if (!disclosure || !accept || code.length !== 6) return false;
        await onSign({ code, accept, disclosureAccepted: disclosure });
        onClose();
      }}
    >
      {disclosureNeeded && (
        <FormField id="ac-disclosure" label="Electronic acceptance" hideLabel required error={tried && !disclosure ? 'Tick that you agree to accept letters electronically.' : null}>
          <Checkbox
            checked={disclosure}
            onChange={setDisclosure}
            label="I agree to accept letters electronically"
            description="An electronic acceptance with a one-time code counts as your acceptance, like signing on paper. You can always download your copy. Ask HR for a paper copy if you need one."
          />
        </FormField>
      )}
      <FormField id="ac-accept" label="Acceptance" hideLabel required error={tried && !accept ? 'Tick that you have read the letter and accept it.' : null}>
        <Checkbox checked={accept} onChange={setAccept} label="I have read the letter and I accept it" />
      </FormField>
      {sendError && (
        <InlineAlert tone="danger" title="No code sent">
          {sendError}
        </InlineAlert>
      )}
      {sent ? (
        <FormField id="ac-code" label="Code from your email" required error={tried && code.length !== 6 ? 'Enter the 6-digit code from your email.' : null}>
          <CodeField value={code} onChange={setCode} />
        </FormField>
      ) : (
        <FormField id="ac-code" label="Code from your email" hideLabel={!tried} required error={tried ? 'Send yourself a code, then enter it.' : null}>
          <Button
            onClick={async () => {
              try {
                await onCode();
                setSent(true);
              } catch (e) {
                setSendError(errorText(e));
              }
            }}
          >
            Send me a code
          </Button>
        </FormField>
      )}
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ settings: who signs letters

export interface SignatoriesDrawerProps {
  onClose: () => void;
  signatories: Signatory[];
  entities: Choice[];
  users: Choice[];
  onAdd: (input: { legalEntityId: string; userId: string; title: string; image: File | null }) => Promise<unknown>;
  onRemove: (s: Signatory) => Promise<unknown>;
}

/** Settings › Letter templates › Signatories (letter.signatory.manage): who signs each legal entity's letters. */
export function SignatoriesDrawer(p: SignatoriesDrawerProps) {
  const [adding, setAdding] = useState(false);
  const { busy, error, run } = useRun();
  return (
    <Drawer open onOpenChange={(o) => !o && p.onClose()} title="Who signs letters" size="lg" footer={<Button onClick={p.onClose}>Close</Button>}>
      <div className="yx-ppl__stack">
        {error && (
          <InlineAlert tone="danger" title="That didn't work">
            {error}
          </InlineAlert>
        )}
        <div>
          <Button onClick={() => setAdding(true)}>Add signatory</Button>
        </div>
        {/* The columns of the design's Authorised signatories table (Settings 5.3). */}
        <DataTable
          label="Authorised signatories"
          columns={[
            { key: 'name', header: 'Name', value: (s) => s.name },
            { key: 'title', header: 'Designation', value: (s) => s.title },
            { key: 'entity', header: 'Legal entity', value: (s) => p.entities.find((e) => e.value === s.legalEntityId)?.label ?? '' },
            { key: 'image', header: 'Signature image', type: 'status', value: (s) => (s.hasSignatureImage ? 'Uploaded' : 'No image'), statusTone: (v) => (v === 'Uploaded' ? 'success' : 'neutral') },
          ]}
          rows={p.signatories}
          getRowId={(s) => s.id}
          rowActions={(s) => <MenuItem disabled={busy === s.id} onSelect={() => void run(s.id, () => p.onRemove(s))}>Remove</MenuItem>}
          empty={<EmptyState title="No one yet" description="Letters that print who signs need a signatory for the legal entity." />}
        />
      </div>
      {adding && <AddSignatory entities={p.entities} users={p.users} onClose={() => setAdding(false)} onAdd={p.onAdd} />}
    </Drawer>
  );
}

function AddSignatory({ entities, users, onClose, onAdd }: { entities: Choice[]; users: Choice[]; onClose: () => void; onAdd: SignatoriesDrawerProps['onAdd'] }) {
  const [entity, setEntity] = useState<string | null>(entities.length === 1 ? entities[0].value : null);
  const [user, setUser] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title="Add a signatory" consequence="Their name, title and signature image appear on letters of this legal entity, and they approve letters that need it. This asks for your second sign-in step." confirmLabel="Add" onConfirm={async () => {
      setTried(true);
      if (!entity || !user || title.trim().length < 2) return false;
      await onAdd({ legalEntityId: entity!, userId: user!, title: title.trim(), image });
      onClose();
    }}>
      <FormField id="sg-entity" label="Legal entity" required error={tried && !entity ? 'Choose the legal entity.' : null}>
        <Select aria-label="Legal entity" value={entity} onChange={setEntity} options={entities} />
      </FormField>
      <FormField id="sg-user" label="Person" required error={tried && !user ? 'Choose the person.' : null}>
        <Select aria-label="Person" value={user} onChange={setUser} options={users} searchable />
      </FormField>
      <FormField id="sg-title" label="Title on letters" required error={tried && title.trim().length < 2 ? 'Enter a title of at least 2 characters.' : null}>
        <TextField value={title} onChange={setTitle} maxLength={100} />
      </FormField>
      <FormField id="sg-image" label="Signature image" optional>
        <FileUpload id="sg-image" upload={async (f) => setImage(f)} accept={['.png', '.jpg', '.jpeg']} maxSize={1024 * 1024} multiple={false} onItemsChange={(items) => items.length === 0 && setImage(null)} />
      </FormField>
    </ConfirmDialog>
  );
}
