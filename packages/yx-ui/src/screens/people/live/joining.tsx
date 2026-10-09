import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Meter } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { Choice, JoinerForms, JoinerPlaces, Letter, LetterTemplate, LetterTemplates, LoadState, PortalAnswers, PortalMe, ReadyOffer, SectionKey, Signatory } from './types';

// Lifecycle batch 6b, wired (design §8, §9, §14): HR's joiner panel (forms, BGV, Mark joined, cancel), the
// pre-boarding portal (T9-01), letter templates and signatories (PPL-29), the letters register (PPL-28), my letters,
// and Ready to onboard (PPL-12). Plain words; errors show after Save, never while typing.

const SECTION_LABEL: Record<SectionKey, string> = { personal: 'Personal details', identity: 'PAN and ID', bank: 'Bank account', emergency: 'Emergency contact', nominees: 'Nominees (PF and gratuity)', tax: 'Tax regime' };
const LETTER_STATUS: Record<Letter['status'], { label: string; tone: BadgeTone }> = {
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
  onCancel: (input: { outcome: 'did_not_join' | 'reneged' | 'withdrawn'; reason: string }) => Promise<unknown>;
  bgv?: {
    onAsk: () => Promise<unknown>;
    onAdd: (checkType: string, gate: string) => Promise<unknown>;
    onUpdate: (checkId: string, version: number, input: { status: string; note: string; file: File | null }) => Promise<unknown>;
  };
}

const CHECKS: Choice[] = ['identity', 'address', 'education', 'employment', 'criminal', 'reference', 'credit'].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }));

export function JoinerPanel(p: JoinerPanelProps) {
  const f = p.forms;
  const [ask, setAsk] = useState<null | 'join' | 'cancel' | 'plan' | 'check'>(null);
  const [status, setStatus] = useState<'probation' | 'confirmed'>('probation');
  const [attested, setAttested] = useState(false);
  const [outcome, setOutcome] = useState<'did_not_join' | 'reneged' | 'withdrawn'>('reneged');
  const [reason, setReason] = useState('');
  const [dept, setDept] = useState<string | null>(p.plan.departmentId);
  const [desig, setDesig] = useState<string | null>(p.plan.designationId);
  const [type, setType] = useState<string | null>(p.plan.employmentTypeId);
  const [checkType, setCheckType] = useState<string | null>(null);
  const [gate, setGate] = useState<'none' | 'before_joining'>('none');
  const [result, setResult] = useState<{ id: string; version: number } | null>(null);
  const [resStatus, setResStatus] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
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
              <Button onClick={() => setAsk('cancel')}>Not joining</Button>
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
        <ConfirmDialog open onOpenChange={(o) => !o && setAsk(null)} size="md" title="Mark as joined?" consequence="The employee record is made today with the planned job. PAN, Aadhaar and bank details go to someone else for approval. The joining portal closes." confirmLabel="Mark joined" confirmDisabled={!attested} onConfirm={async () => void (await p.onJoin({ identityAttested: attested, status }))}>
          <Segment label="Starts on" value={status} onChange={setStatus} options={[{ value: 'probation', label: 'Probation' }, { value: 'confirmed', label: 'Confirmed' }]} />
          <Checkbox checked={attested} onChange={setAttested} label="I checked the joiner's original ID today" description="Required. YukthiX records who checked and when." />
        </ConfirmDialog>
      )}
      {ask === 'cancel' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAsk(null)}
          size="md"
          title="The joiner is not joining?"
          consequence="Their checklist and desk requests stop and their portal closes. Nothing is deleted; the record stays as cancelled."
          confirmLabel="Confirm"
          destructive
          confirmDisabled={reason.trim().length < 3}
          onConfirm={async () => void (await p.onCancel({ outcome, reason: reason.trim() }))}
        >
          <Segment
            label="What happened"
            value={outcome}
            onChange={setOutcome}
            options={[
              { value: 'reneged', label: 'Declined' },
              { value: 'withdrawn', label: 'Offer withdrawn' },
              ...(dayReached ? [{ value: 'did_not_join' as const, label: 'Did not come' }] : []),
            ]}
          />
          <FormField id="cj-reason" label="Reason" required helper="Kept on the record.">
            <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
          </FormField>
        </ConfirmDialog>
      )}
      {ask === 'plan' && (
        <ConfirmDialog open onOpenChange={(o) => !o && setAsk(null)} size="md" title="Job details" confirmLabel="Save" confirmDisabled={!dept || !desig || !type} onConfirm={async () => void (await p.onPlan({ departmentId: dept!, designationId: desig!, employmentTypeId: type! }))}>
          <FormField id="pl-dept" label="Department" required>
            <Select aria-label="Department" value={dept} onChange={setDept} options={p.places.departments} searchable />
          </FormField>
          <FormField id="pl-desig" label="Designation" required>
            <Select aria-label="Designation" value={desig} onChange={setDesig} options={p.places.designations} searchable />
          </FormField>
          <FormField id="pl-type" label="Employment type" required>
            <Select aria-label="Employment type" value={type} onChange={setType} options={p.places.employmentTypes} />
          </FormField>
        </ConfirmDialog>
      )}
      {ask === 'check' && p.bgv && (
        <ConfirmDialog open onOpenChange={(o) => !o && setAsk(null)} size="md" title="Add a background check" confirmLabel="Add check" confirmDisabled={!checkType} onConfirm={async () => void (await p.bgv!.onAdd(checkType!, gate))}>
          <FormField id="bg-type" label="What to check" required>
            <Select aria-label="What to check" value={checkType} onChange={setCheckType} options={CHECKS} />
          </FormField>
          <Segment label="Joining" value={gate} onChange={setGate} options={[{ value: 'none', label: 'Can join before the result' }, { value: 'before_joining', label: 'Must be clear first' }]} />
        </ConfirmDialog>
      )}
      {result && p.bgv && (
        <ConfirmDialog open onOpenChange={(o) => !o && setResult(null)} size="md" title="Record the result" confirmLabel="Save" confirmDisabled={!resStatus} onConfirm={async () => {
          await p.bgv!.onUpdate(result.id, result.version, { status: resStatus!, note: note.trim(), file });
          setResult(null);
        }}>
          <FormField id="bg-status" label="Result" required>
            <Select aria-label="Result" value={resStatus} onChange={setResStatus} options={[{ value: 'in_progress', label: 'In progress' }, { value: 'clear', label: 'Clear' }, { value: 'discrepancy', label: 'Discrepancy found' }, { value: 'unable', label: 'Could not be checked' }]} />
          </FormField>
          <FormField id="bg-note" label="Note" optional>
            <TextArea value={note} onChange={setNote} rows={2} maxLength={1000} />
          </FormField>
          <FormField id="bg-file" label="Report" optional helper="PDF, JPG or PNG. Kept as Special data.">
            <input id="bg-file" className="yx-input" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </FormField>
        </ConfirmDialog>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------ the pre-boarding portal

export interface PortalSignInProps {
  company: string;
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
      <Card title={`Joining ${p.company}`}>
        <Text as="p">Sign in with the personal email you gave HR. We send you a one-time code.</Text>
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
              <TextField value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
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
                <TextField value={code} onChange={setCode} inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
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
          {field('ifsc', 'IFSC', { max: 11 })}
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

function AcceptDialog({ letter, disclosureNeeded, onClose, onCode, onSign }: { letter: Letter; disclosureNeeded: boolean; onClose: () => void; onCode: () => Promise<unknown>; onSign: (x: { code: string; accept: boolean; disclosureAccepted: boolean }) => Promise<unknown> }) {
  const [disclosure, setDisclosure] = useState(!disclosureNeeded);
  const [accept, setAccept] = useState(false);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={`Accept: ${letter.title.split(': ')[0]}`}
      consequence="Download and read the letter first. Your acceptance is recorded with the time, your device and the code, and you get a sealed copy."
      confirmLabel="Accept"
      confirmDisabled={!disclosure || !accept || code.length !== 6}
      onConfirm={async () => {
        await onSign({ code, accept, disclosureAccepted: disclosure });
        onClose();
      }}
    >
      {disclosureNeeded && (
        <Checkbox
          checked={disclosure}
          onChange={setDisclosure}
          label="I agree to accept letters electronically"
          description="An electronic acceptance with a one-time code counts as your acceptance, like signing on paper. You can always download your copy. Ask HR for a paper copy if you need one."
        />
      )}
      <Checkbox checked={accept} onChange={setAccept} label="I have read the letter and I accept it" />
      {sendError && (
        <InlineAlert tone="danger" title="No code sent">
          {sendError}
        </InlineAlert>
      )}
      {sent ? (
        <FormField id="ac-code" label="Code from your email" required>
          <TextField value={code} onChange={setCode} inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
        </FormField>
      ) : (
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
      )}
    </ConfirmDialog>
  );
}

export interface MyLettersScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: { letters: Letter[]; esignAccepted: boolean } | null;
  onDownload: (l: Letter, which: 'letter' | 'acceptance') => Promise<unknown>;
  onSignCode: (l: Letter) => Promise<unknown>;
  onSign: (l: Letter, input: { code: string; accept: boolean; disclosureAccepted: boolean }) => Promise<unknown>;
}

export function MyLettersScreen(p: MyLettersScreenProps) {
  const [signing, setSigning] = useState<Letter | null>(null);
  return (
    <LivePage title="My letters" description="Letters issued to you. Anyone you give one to can check it with the code printed on it." state={p.state} onRetry={p.onRetry} what="your letters">
      {p.data && (p.data.letters.length ? <LetterList letters={p.data.letters} onDownload={p.onDownload} onAccept={setSigning} /> : <EmptyState compact title="No letters yet." />)}
      {signing && p.data && <AcceptDialog letter={signing} disclosureNeeded={!p.data.esignAccepted} onClose={() => setSigning(null)} onCode={() => p.onSignCode(signing)} onSign={(x) => p.onSign(signing, x)} />}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ HR: letters register

export interface LettersRegisterScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: Letter[] | null;
  onDownload: (l: Letter, which: 'letter' | 'acceptance') => Promise<unknown>;
  verifyUrl: (code: string) => string;
}

export function LettersRegisterScreen(p: LettersRegisterScreenProps) {
  const { busy, error, run } = useRun();
  const columns: TableColumn<Letter>[] = [
    { key: 'person', header: 'Person', type: 'person', value: (r) => r.person ?? '', person: (r) => ({ name: r.person ?? '' }), width: 200, hideable: false },
    { key: 'title', header: 'Letter', value: (r) => r.title.split(': ')[0], width: 200 },
    { key: 'ref', header: 'Reference', value: (r) => r.referenceNo ?? '', width: 200 },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <Badge tone={LETTER_STATUS[r.status].tone}>{LETTER_STATUS[r.status].label}</Badge>, width: 190 },
    { key: 'accepted', header: 'Accepted', value: (r) => r.acceptedAt ?? '', render: (r) => (!r.personSigns ? <Text tone="secondary">Not needed</Text> : r.acceptedAt ? <Text>{dateText(r.acceptedAt.slice(0, 10))}</Text> : <Text tone="secondary">Not yet</Text>), width: 130, optional: true },
  ];
  return (
    <LivePage title="Letters" description="Every letter as issued, with its reference and public check code. An issued letter never changes; a correction replaces it." state={p.state} onRetry={p.onRetry} what="letters" grantedBy="your HR admin">
      {error && (
        <InlineAlert tone="danger" title="Not downloaded">
          {error}
        </InlineAlert>
      )}
      {p.rows && (
        <DataTable
          label="Issued letters"
          columns={columns}
          rows={p.rows}
          getRowId={(r) => r.id}
          rowNoun={['letter', 'letters']}
          cardSummary
          empty={<EmptyState compact title="No letters yet." description="Issue letters from a joiner's checklist." />}
          rowButtons={(r) =>
            r.status === 'issued' || r.status === 'superseded' ? (
              <>
                <Button size="sm" loading={busy === r.id} onClick={() => void run(r.id, () => p.onDownload(r, 'letter'))}>
                  Download
                </Button>
                {r.verifyCode && (
                  <Button size="sm" asChild>
                    <a href={p.verifyUrl(r.verifyCode)} target="_blank" rel="noreferrer">
                      Check page
                    </a>
                  </Button>
                )}
              </>
            ) : null
          }
        />
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ settings: templates and signatories

export interface LetterTemplatesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: LetterTemplates | null;
  signatories: Signatory[];
  entities: Choice[];
  users: Choice[];
  onStarter: (letterType: string) => Promise<unknown>;
  onUpload: (input: { letterType: string; name: string; requiresApproval: boolean; personSigns: boolean; file: File }) => Promise<unknown>;
  onPreview: (t: LetterTemplate) => Promise<unknown>;
  onWord: (t: LetterTemplate) => Promise<unknown>;
  onStatus: (t: LetterTemplate, status: 'active' | 'retired') => Promise<unknown>;
  onAddSignatory: (input: { legalEntityId: string; userId: string; title: string; image: File | null }) => Promise<unknown>;
  onRemoveSignatory: (s: Signatory) => Promise<unknown>;
}

export function LetterTemplatesScreen(p: LetterTemplatesScreenProps) {
  const d = p.data;
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const { busy, error, run } = useRun();
  const columns: TableColumn<LetterTemplate>[] = [
    { key: 'name', header: 'Letter', value: (r) => r.name, width: 220, hideable: false },
    { key: 'version', header: 'Version', value: (r) => r.version, width: 90 },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <Badge tone={r.status === 'active' ? 'success' : 'neutral'}>{r.status === 'active' ? 'In use' : r.status === 'draft' ? 'Draft' : 'Not in use'}</Badge>, width: 110 },
    { key: 'rules', header: 'Rules', value: (r) => [r.requiresApproval ? 'Approved by the signatory' : 'Issued at once', r.personSigns ? 'The person accepts it' : null].filter(Boolean).join(' · '), width: 260, optional: true },
  ];
  return (
    <LivePage
      title="Letter templates"
      description="Word letters with placeholders like {{employee_name}}. Start from a YukthiX letter or upload your own. A template is used only after you looked at its sample preview."
      state={p.state}
      onRetry={p.onRetry}
      what="letter templates"
      grantedBy="your System Admin"
      actions={
        <Button icon={Upload} onClick={() => setUploading(true)}>
          Upload a Word letter
        </Button>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      {d && d.starters.some((s) => !s.added) && (
        <Card title="YukthiX letters">
          <ul className="yx-lif-list">
            {d.starters
              .filter((s) => !s.added)
              .map((s) => (
                <li key={s.letterType}>
                  <Text>{s.name}</Text>
                  <Button size="sm" loading={busy === s.letterType} onClick={() => void run(s.letterType, () => p.onStarter(s.letterType))}>
                    Add
                  </Button>
                </li>
              ))}
          </ul>
        </Card>
      )}
      {d && (
        <DataTable
          label="Letter templates"
          columns={columns}
          rows={d.templates}
          getRowId={(r) => r.id}
          rowNoun={['template', 'templates']}
          cardSummary
          empty={<EmptyState compact title="No letter templates yet." />}
          rowButtons={(r) => (
            <>
              <Button size="sm" loading={busy === `p-${r.id}`} onClick={() => void run(`p-${r.id}`, () => p.onPreview(r))}>
                Sample preview
              </Button>
              <Button size="sm" loading={busy === `w-${r.id}`} onClick={() => void run(`w-${r.id}`, () => p.onWord(r))}>
                Word file
              </Button>
              {r.status !== 'active' ? (
                <Button size="sm" variant="primary" disabled={!r.previewViewed} loading={busy === `a-${r.id}`} onClick={() => void run(`a-${r.id}`, () => p.onStatus(r, 'active'))}>
                  Use it
                </Button>
              ) : (
                <Button size="sm" loading={busy === `r-${r.id}`} onClick={() => void run(`r-${r.id}`, () => p.onStatus(r, 'retired'))}>
                  Stop using
                </Button>
              )}
            </>
          )}
        />
      )}
      <Card title="Who signs letters" actions={<Button onClick={() => setAdding(true)}>Add a signatory</Button>}>
        {p.signatories.length ? (
          <ul className="yx-lif-list">
            {p.signatories.map((s) => (
              <li key={s.id}>
                <Text>{`${s.name}, ${s.title}`}</Text> <Text tone="secondary" size="sm">{p.entities.find((e) => e.value === s.legalEntityId)?.label}</Text> {s.hasSignatureImage ? <Badge tone="success">Signature image</Badge> : <Badge tone="neutral">No image</Badge>}
                <Button size="sm" loading={busy === `s-${s.id}`} onClick={() => void run(`s-${s.id}`, () => p.onRemoveSignatory(s))}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Text tone="secondary">No one yet. Letters that print who signs need a signatory for the legal entity.</Text>
        )}
      </Card>
      {d && (
        <Card title="Placeholders you can use">
          <ul className="yx-lif-list">
            {d.fields.map((f) => (
              <li key={f.key}>
                <code>{f.flag ? `{{#${f.key}}} … {{/${f.key}}}` : `{{${f.key}}}`}</code> <Text tone="secondary" size="sm">{f.label}{f.personal ? ' (personal data)' : ''}</Text>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {uploading && <UploadTemplate onClose={() => setUploading(false)} onUpload={p.onUpload} />}
      {adding && <AddSignatory entities={p.entities} users={p.users} onClose={() => setAdding(false)} onAdd={p.onAddSignatory} />}
    </LivePage>
  );
}

function UploadTemplate({ onClose, onUpload }: { onClose: () => void; onUpload: LetterTemplatesScreenProps['onUpload'] }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [approval, setApproval] = useState<'yes' | 'no'>('yes');
  const [signs, setSigns] = useState<'yes' | 'no'>('no');
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = [
    ...(name.trim() ? [] : [{ fieldId: 'ut-name', message: 'Name the letter.' }]),
    ...(/^[a-z][a-z0-9_]{1,39}$/.test(type) ? [] : [{ fieldId: 'ut-type', message: 'Use lower-case letters, digits and _ (e.g. offer_revised).' }]),
    ...(file ? [] : [{ fieldId: 'ut-file', message: 'Choose a Word (.docx) file.' }]),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onUpload({ letterType: type, name: name.trim(), requiresApproval: approval === 'yes', personSigns: signs === 'yes', file: file! });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title="Upload a Word letter" size="md" dirty={Boolean(name || file)} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>Upload</Button></>}>
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not uploaded">
          {failed}
        </InlineAlert>
      )}
      <FormField id="ut-name" label="Letter name" required error={v.errorOf('ut-name')}>
        <TextField value={name} onChange={setName} maxLength={100} />
      </FormField>
      <FormField id="ut-type" label="Letter type" required error={v.errorOf('ut-type')} helper="The same type replaces an earlier version, e.g. appointment.">
        <TextField value={type} onChange={(x) => setType(x.toLowerCase())} maxLength={40} />
      </FormField>
      <Segment label="Approval" value={approval} onChange={setApproval} options={[{ value: 'yes', label: 'Signatory approves first' }, { value: 'no', label: 'Issued at once' }]} />
      <Segment label="The person" value={signs} onChange={setSigns} options={[{ value: 'no', label: 'Only receives it' }, { value: 'yes', label: 'Accepts it' }]} />
      <FormField id="ut-file" label="Word file (.docx)" required error={v.errorOf('ut-file')} helper="No macros and no linked pictures. Unknown placeholders are refused with a suggestion.">
        <input id="ut-file" className="yx-input" type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </FormField>
    </Drawer>
  );
}

function AddSignatory({ entities, users, onClose, onAdd }: { entities: Choice[]; users: Choice[]; onClose: () => void; onAdd: LetterTemplatesScreenProps['onAddSignatory'] }) {
  const [entity, setEntity] = useState<string | null>(entities.length === 1 ? entities[0].value : null);
  const [user, setUser] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [image, setImage] = useState<File | null>(null);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title="Add a signatory" consequence="Their name, title and signature image appear on letters of this legal entity, and they approve letters that need it. This asks for your second sign-in step." confirmLabel="Add" confirmDisabled={!entity || !user || title.trim().length < 2} onConfirm={async () => {
      await onAdd({ legalEntityId: entity!, userId: user!, title: title.trim(), image });
      onClose();
    }}>
      <FormField id="sg-entity" label="Legal entity" required>
        <Select aria-label="Legal entity" value={entity} onChange={setEntity} options={entities} />
      </FormField>
      <FormField id="sg-user" label="Person" required>
        <Select aria-label="Person" value={user} onChange={setUser} options={users} searchable />
      </FormField>
      <FormField id="sg-title" label="Title on letters" required>
        <TextField value={title} onChange={setTitle} maxLength={100} />
      </FormField>
      <FormField id="sg-image" label="Signature image" optional helper="PNG or JPG, up to 1 MB.">
        <input id="sg-image" className="yx-input" type="file" accept=".png,.jpg,.jpeg" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ Ready to onboard (PPL-12)

export interface ReadyToOnboardScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: ReadyOffer[] | null;
  places: JoinerPlaces;
  onCreate: (o: ReadyOffer, input: { givenName: string; familyName: string | null; joiningOn: string; legalEntityId: string; locationId: string; departmentId: string | null; designationId: string | null; employmentTypeId: string | null; managerEmployeeId: string | null }) => Promise<unknown>;
  changesHref: string;
}

const PERSON_TYPE: Record<ReadyOffer['personType'], { label: string; tone: BadgeTone }> = {
  new: { label: 'New person', tone: 'info' },
  ex_employee: { label: 'Worked here before', tone: 'warning' },
  internal: { label: 'Current employee', tone: 'neutral' },
};

export function ReadyToOnboardScreen(p: ReadyToOnboardScreenProps) {
  const [open, setOpen] = useState<ReadyOffer | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const columns: TableColumn<ReadyOffer>[] = [
    { key: 'name', header: 'Person', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.email }), width: 240, hideable: false },
    { key: 'job', header: 'Job', value: (r) => r.jobTitle, width: 200 },
    { key: 'start', header: 'Start date in the offer', value: (r) => r.startDate, render: (r) => dateText(r.startDate), width: 170 },
    { key: 'type', header: 'Who', value: (r) => r.personType, render: (r) => <Badge tone={PERSON_TYPE[r.personType].tone}>{PERSON_TYPE[r.personType].label}</Badge>, width: 170 },
  ];
  return (
    <LivePage title="Ready to onboard" description="Accepted offers waiting to become joiners. A current employee is never onboarded: their move is a job change." state={p.state} onRetry={p.onRetry} what="accepted offers">
      {done && (
        <InlineAlert tone="success" title="Done">
          {done}
        </InlineAlert>
      )}
      {p.rows && (
        <DataTable
          label="Accepted offers"
          columns={columns}
          rows={p.rows}
          getRowId={(r) => r.offerId}
          rowNoun={['offer', 'offers']}
          cardSummary
          empty={<EmptyState compact title="No accepted offers waiting." />}
          rowButtons={(r) =>
            r.personType === 'internal' ? (
              <Button size="sm" asChild>
                <a href={p.changesHref}>Job change</a>
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={() => setOpen(r)}>
                Create joiner
              </Button>
            )
          }
        />
      )}
      {open && <FromOfferDialog offer={open} places={p.places} onClose={() => setOpen(null)} onCreate={async (x) => {
        await p.onCreate(open, x);
        setDone(`${x.givenName} is now a joiner. Their checklist has started and they were invited to the joining portal.`);
        setOpen(null);
      }} />}
    </LivePage>
  );
}

function FromOfferDialog({ offer, places, onClose, onCreate }: { offer: ReadyOffer; places: JoinerPlaces; onClose: () => void; onCreate: (x: Parameters<ReadyToOnboardScreenProps['onCreate']>[1]) => Promise<void> }) {
  const [first, ...rest] = offer.name.split(' ');
  const [given, setGiven] = useState(first);
  const [family, setFamily] = useState(rest.join(' '));
  const [date, setDate] = useState<Date | null>(fromKey(offer.startDate));
  const [entity, setEntity] = useState<string | null>(places.entities.length === 1 ? places.entities[0].value : null);
  const [location, setLocation] = useState<string | null>(null);
  const [dept, setDept] = useState<string | null>(null);
  const [desig, setDesig] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [manager, setManager] = useState<string | null>(null);
  const ok = given.trim() && date && entity && location;
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title={`Create a joiner from ${offer.name}'s offer`} confirmLabel="Create joiner" confirmDisabled={!ok} onConfirm={async () => onCreate({ givenName: given.trim(), familyName: family.trim() || null, joiningOn: dayKey(date!), legalEntityId: entity!, locationId: location!, departmentId: dept, designationId: desig, employmentTypeId: type, managerEmployeeId: manager })}>
      <div className="yx-lif-grid">
        <FormField id="fo-given" label="First name" required>
          <TextField value={given} onChange={setGiven} maxLength={100} />
        </FormField>
        <FormField id="fo-family" label="Last name" optional>
          <TextField value={family} onChange={setFamily} maxLength={100} />
        </FormField>
        <FormField id="fo-date" label="Joining day" required>
          <DatePicker value={date} onChange={setDate} aria-label="Joining day" />
        </FormField>
        <FormField id="fo-entity" label="Legal entity" required>
          <Select aria-label="Legal entity" value={entity} onChange={(x) => { setEntity(x); setLocation(null); }} options={places.entities} />
        </FormField>
        <FormField id="fo-location" label="Location" required>
          <Select aria-label="Location" value={location} onChange={setLocation} options={places.locations.filter((l) => l.entityId === entity)} disabled={!entity} />
        </FormField>
        <FormField id="fo-dept" label="Department" optional>
          <Select aria-label="Department" value={dept} onChange={setDept} options={places.departments} clearable searchable />
        </FormField>
        <FormField id="fo-desig" label="Designation" optional>
          <Select aria-label="Designation" value={desig} onChange={setDesig} options={places.designations} clearable searchable />
        </FormField>
        <FormField id="fo-type" label="Employment type" optional>
          <Select aria-label="Employment type" value={type} onChange={setType} options={places.employmentTypes} clearable />
        </FormField>
        <FormField id="fo-manager" label="Manager" optional>
          <Select aria-label="Manager" value={manager} onChange={setManager} options={places.managers} clearable searchable />
        </FormField>
      </div>
    </ConfirmDialog>
  );
}
