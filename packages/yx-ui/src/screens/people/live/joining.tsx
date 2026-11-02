import { useState } from 'react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { MenuItem } from '../../../components/menu';
import { EmptyState, InlineAlert, Meter } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { FileUpload } from '../../../components/upload';
import { CodeField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable } from '../../../components/table';
import { formatINR } from '../../../lib/format';
import { errorText, useRun } from '../../org/org-kit';
import { dateText } from '../../time/live/kit';
import type { Choice, JoinerForms, JoinerPlaces, Letter, PortalAnswers, SectionKey, Signatory } from './types';

// Lifecycle batch 6b, wired (design §8, §9, §14): HR's joiner panel (forms, BGV, Mark joined, cancel), the letter
// accept step (the joining portal T9-01 and my letters), signatories (PPL-29). The joining portal itself is the
// designed T9-01 screen (portals/t9-workforce.tsx). Plain words; errors show after Save, never while typing.

const SECTION_LABEL: Record<SectionKey, string> = { personal: 'Personal details', identity: 'PAN and ID', bank: 'Bank account', emergency: 'Emergency contact', nominees: 'Nominees', tax: 'Tax regime' };
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
    ['Nominees', a.nominees ? a.nominees.map((n) => `${n.name} (PF ${n.pf}%, gratuity ${n.gratuity}%, insurance ${n.insurance}%)`).join(', ') : null],
    ['Tax regime', a.tax ? (a.tax.regime === 'new' ? 'New regime' : 'Old regime') : null],
    ['Earlier employer this year (Form 12B)', a.tax?.previousIncome ? `Gross ${formatINR(a.tax.previousIncome.grossSalary)}, TDS ${formatINR(a.tax.previousIncome.tds)}` : null],
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
  const [triedJoin, setTriedJoin] = useState(false);
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
              <Button variant="primary" onClick={() => (dayReached && !missingPlan ? setAsk('join') : setTriedJoin(true))}>
                Mark joined
              </Button>
            </>
          ) : undefined
        }
      >
        <Meter value={f.completion} max={100} label="Pre-boarding done" warnAt={101} dangerAt={101} valueText={`${f.completion}% done by the joiner`} />
        {!dayReached && p.canJoin && <Text as="p" tone={triedJoin ? 'danger' : 'secondary'} size="sm">{`Mark joined becomes available on ${dateText(p.joiningOn)}, the joining day.`}</Text>}
        {missingPlan && p.canJoin && <Text as="p" tone={triedJoin ? 'danger' : 'secondary'} size="sm">Add the department, designation and employment type before the joining day.</Text>}
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
          <FormField id="jn-status" label="Starts on">
            <Segment label="Starts on" value={status} onChange={setStatus} options={[{ value: 'probation', label: 'Probation' }, { value: 'confirmed', label: 'Confirmed' }]} />
          </FormField>
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
          <FormField id="bg-gate" label="Joining">
            <Segment label="Joining" value={gate} onChange={setGate} options={[{ value: 'none', label: 'Can join before the result' }, { value: 'before_joining', label: 'Must be clear first' }]} />
          </FormField>
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

// ------------------------------------------------------------------------------------------ letters (person side)

/** The emailed-code acceptance of a letter: the joining portal's accept step (T9-01) and My letters. */
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
