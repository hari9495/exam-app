import { useState } from 'react';
import { Button, IconButton } from '../../components/button';
import { Eye, Lock } from 'lucide-react';
import { Checkbox } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Select } from '../../components/select';
import { Breadcrumbs, Card, DescriptionList, PageHeader } from '../../components/shell';
import { dayKey } from '../../lib/dates';
import { formatPhone } from '../../lib/format';
import { dateLabel, errorText } from '../org/org-kit';
import { GENDER_LABEL, KIND_LABEL, shown } from './access-kit';
import type { LoadState, PersonalDetails, ProfileRequest, ProfileRequestInput, ProfileView, RequestKind, RevealField } from './types';

// People › Profile (PPL-03 / PPL-32; P02 §4.4–4.5): the record by sensitivity class. Personal details for the
// person and HR with personal-data access, edited directly; identity and bank details masked, each full look
// recorded (YX-SEC-09), Aadhaar in full only with its own grant (YX-SEC-08); identity, bank and legal-name
// changes go to approval with old and new side by side. Pay stays on Job history behind "Show pay" (R1).

export interface ProfileScreenProps {
  state: LoadState;
  onRetry?: () => void;
  profile: ProfileView | null;
  /** HR: whose record to open (people the API lets them open). */
  people?: { id: string; name: string; employeeCode?: string | null }[];
  onPickPerson?: (id: string) => void;
  /** ISO 3166-2 states of India for the address. */
  states: { code: string; name: string }[];
  requests: ProfileRequest[];
  onSavePersonal: (input: Partial<PersonalDetails>) => Promise<void>;
  onReveal: (field: RevealField) => Promise<string>;
  onRequestChange: (input: ProfileRequestInput) => Promise<void>;
  onCancelRequest: (id: string, reason: string) => Promise<void>;
  onOpenHistory?: () => void;
}

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const KIND_FIELDS: Record<RequestKind, { key: keyof ProfileRequestInput['value']; label: string; check: (v: string) => string | null }[]> = {
  pan: [{ key: 'pan', label: 'New PAN', check: (v) => (PAN.test(v) ? null : 'Enter a PAN like ABCPE1234F') }],
  aadhaar: [{ key: 'aadhaar', label: 'New Aadhaar number', check: (v) => (/^[2-9][0-9]{11}$/.test(v) ? null : 'Enter the 12-digit Aadhaar number') }],
  uan: [{ key: 'uan', label: 'New UAN', check: (v) => (/^[0-9]{12}$/.test(v) ? null : 'Enter the 12-digit UAN') }],
  esic: [{ key: 'esic', label: 'New ESIC IP number', check: (v) => (/^[0-9]{10}$/.test(v) ? null : 'Enter the 10-digit ESIC IP number') }],
  legal_name: [{ key: 'legalName', label: 'Legal name as on PAN', check: (v) => (v.trim() ? null : 'Enter the legal name') }],
  bank_salary: [
    { key: 'holderName', label: 'Account holder', check: (v) => (v.trim() ? null : 'Enter the account holder') },
    { key: 'accountNumber', label: 'Account number', check: (v) => (/^[0-9]{9,18}$/.test(v) ? null : 'Enter 9 to 18 digits') },
    { key: 'ifsc', label: 'IFSC', check: (v) => (IFSC.test(v) ? null : 'Enter an IFSC like HDFC0001234') },
  ],
  bank_reimbursement: [],
};
KIND_FIELDS.bank_reimbursement = KIND_FIELDS.bank_salary;

function PersonalDialog({ initial, states, onSave, onClose }: { initial: PersonalDetails; states: ProfileScreenProps['states']; onSave: ProfileScreenProps['onSavePersonal']; onClose: () => void }) {
  const [d, setD] = useState(initial);
  const set = <K extends keyof PersonalDetails>(k: K, v: PersonalDetails[K]) => setD((x) => ({ ...x, [k]: v }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...d, country: d.stateCode ? 'IN' : d.country });
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Edit personal details"
      description="Saved at once. Only the fields that changed are recorded, never their values."
      preventClose={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <FormField id="pd-dob" label="Date of birth">
        <DatePicker value={d.dateOfBirth ? new Date(`${d.dateOfBirth}T00:00:00`) : null} onChange={(v) => set('dateOfBirth', v ? dayKey(v) : null)} max={new Date()} />
      </FormField>
      <FormField id="pd-gender" label="Gender">
        <Select aria-label="Gender" value={d.gender} onChange={(v) => set('gender', v)} clearable options={Object.entries(GENDER_LABEL).map(([value, label]) => ({ value, label }))} />
      </FormField>
      <FormField id="pd-email" label="Personal email">
        <TextField type="email" value={d.personalEmail ?? ''} onChange={(v) => set('personalEmail', v || null)} maxLength={254} />
      </FormField>
      <FormField id="pd-phone" label="Personal phone" helper="With the country code, e.g. +91 98450 12345.">
        <TextField type="tel" value={d.personalPhone ?? ''} onChange={(v) => set('personalPhone', v || null)} maxLength={30} />
      </FormField>
      <FormField id="pd-line1" label="Address">
        <TextField value={d.addressLine1 ?? ''} onChange={(v) => set('addressLine1', v || null)} maxLength={200} />
      </FormField>
      <FormField id="pd-line2" label="Address line 2" optional>
        <TextField value={d.addressLine2 ?? ''} onChange={(v) => set('addressLine2', v || null)} maxLength={200} />
      </FormField>
      <FormField id="pd-city" label="City">
        <TextField value={d.city ?? ''} onChange={(v) => set('city', v || null)} maxLength={100} />
      </FormField>
      <FormField id="pd-state" label="State">
        <Select aria-label="State" value={d.stateCode} onChange={(v) => set('stateCode', v)} clearable searchable options={states.map((s) => ({ value: s.code, label: s.name }))} />
      </FormField>
      <FormField id="pd-pin" label="PIN code">
        <TextField value={d.postalCode ?? ''} onChange={(v) => set('postalCode', v.replace(/\D/g, '').slice(0, 6) || null)} inputMode="numeric" />
      </FormField>
      <Checkbox checked={d.hideBirthday} onChange={(v) => set('hideBirthday', v)} label="Hide my birthday from the colleague directory" />
      {error && <InlineAlert tone="danger" title={error} />}
    </Dialog>
  );
}

function ChangeDialog({ pending, onRequest, onClose }: { pending: RequestKind[]; onRequest: ProfileScreenProps['onRequestChange']; onClose: () => void }) {
  const [kind, setKind] = useState<RequestKind | null>(null);
  const [value, setValue] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const fields = kind ? KIND_FIELDS[kind] : [];
  const problems = fields.map((f) => f.check((value[f.key] ?? '').trim()));
  const ready = Boolean(kind) && problems.every((p) => !p) && reason.trim().length > 0;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Change identity or bank details"
      consequence="HR or payroll approves it; you will be asked to confirm it is you. A new bank account is used for pay only after a short waiting period, and we tell you by email when it changes."
      confirmLabel="Send for approval"
      confirmDisabled={!ready}
      onConfirm={async () => {
        await onRequest({ kind: kind!, value: Object.fromEntries(fields.map((f) => [f.key, (value[f.key] ?? '').trim()])), reason: reason.trim() });
        onClose();
      }}
    >
      <FormField id="cr-kind" label="What changes" required>
        <Select
          aria-label="What changes"
          value={kind}
          onChange={(v) => (setKind(v), setValue({}), setTouched(false))}
          options={(Object.keys(KIND_LABEL) as RequestKind[]).map((k) => ({ value: k, label: pending.includes(k) ? `${KIND_LABEL[k]} (a change is already waiting)` : KIND_LABEL[k], disabled: pending.includes(k) }))}
        />
      </FormField>
      {fields.map((f, i) => (
        <FormField key={f.key} id={`cr-${f.key}`} label={f.label} required error={touched ? problems[i] : null}>
          <TextField value={value[f.key] ?? ''} onChange={(v) => setValue((x) => ({ ...x, [f.key]: f.key === 'pan' || f.key === 'ifsc' ? v.toUpperCase() : v }))} onBlur={() => setTouched(true)} autoComplete="off" />
        </FormField>
      ))}
      <FormField id="cr-reason" label="Reason" required helper="For example: new bank, correction of a typo.">
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

function CancelDialog({ request, onCancel, onClose }: { request: ProfileRequest; onCancel: ProfileScreenProps['onCancelRequest']; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title={`Withdraw the ${request.label.toLowerCase()} change?`} consequence="Nothing changes on the record." confirmLabel="Withdraw" destructive confirmDisabled={!reason.trim()} onConfirm={async () => (await onCancel(request.id, reason.trim()), onClose())}>
      <FormField id="cc-reason" label="Reason" required>
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

export function ProfileScreen(props: ProfileScreenProps) {
  const { state, onRetry, profile: p, people, onPickPerson, requests } = props;
  const [editing, setEditing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [cancelling, setCancelling] = useState<ProfileRequest | null>(null);
  const [revealed, setRevealed] = useState<Partial<Record<RevealField, string>>>({});
  const [revealError, setRevealError] = useState<string | null>(null);
  const [busy, setBusy] = useState<RevealField | null>(null);
  const reveal = async (field: RevealField) => {
    setBusy(field);
    setRevealError(null);
    try {
      const value = await props.onReveal(field);
      setRevealed((r) => ({ ...r, [field]: value }));
    } catch (e) {
      setRevealError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const REVEAL_NAME: Record<RevealField, string> = { pan: 'PAN', aadhaar: 'Aadhaar', uan: 'UAN', esic: 'ESIC IP number', bank_salary: 'salary account number', bank_reimbursement: 'reimbursement account number' };
  const masked = (field: RevealField, value: string | null, allowed: boolean) =>
    value ? (
      <span className="yx-ppl2__row">
        <Text mono>{revealed[field] ?? value}</Text>
        {allowed && !revealed[field] && (
          <IconButton icon={Eye} size="sm" label={`Show full ${REVEAL_NAME[field]}`} disabled={busy === field} onClick={() => void reveal(field)} />
        )}
      </span>
    ) : (
      'Not on file'
    );
  const pending = requests.filter((r) => r.status === 'pending');
  return (
    <div className="yx-auth__page">
      <PageHeader breadcrumbs={<Breadcrumbs items={[{ label: 'People' }, { label: p?.self ? 'My profile' : 'Profile' }]} />} title={p ? p.name : 'Profile'} description={p?.employeeCode ? `${p.employeeCode}${p.joinedOn ? ` · joined ${dateLabel(p.joinedOn)}` : ''}` : 'Personal, identity and bank details.'} />
      {people && onPickPerson && (
        <FormField id="pf-person" label="Person">
          <Select aria-label="Person" value={p?.employeeId ?? null} onChange={(v) => v && onPickPerson(v)} searchable options={people.map((x) => ({ value: x.id, label: x.employeeCode ? `${x.name} · ${x.employeeCode}` : x.name }))} />
        </FormField>
      )}
      {state === 'loading' && <Skeleton height={240} />}
      {state === 'error' && <ErrorState title="We couldn't load this profile." description="It may not be yours to see, or the connection dropped." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="HR" what="this profile" />}
      {state === 'ready' && !p && <EmptyState title="Pick a person" description="Choose whose profile to open." />}
      {state === 'ready' && p && (
        <>
          <Card title="Personal details" actions={p.can.editPersonal && p.personal ? <Button size="sm" onClick={() => setEditing(true)}>Edit</Button> : undefined}>
            {p.personal ? (
              <DescriptionList
                columns={2}
                items={[
                  { label: 'Date of birth', value: p.personal.dateOfBirth ? dateLabel(p.personal.dateOfBirth) : '—' },
                  { label: 'Gender', value: p.personal.gender ? GENDER_LABEL[p.personal.gender] ?? p.personal.gender : '—' },
                  { label: 'Personal email', value: p.personal.personalEmail ?? '—' },
                  { label: 'Personal phone', value: p.personal.personalPhone ? formatPhone(p.personal.personalPhone) : '—', mono: true },
                  { label: 'Address', value: [p.personal.addressLine1, p.personal.addressLine2, p.personal.city, p.personal.postalCode].filter(Boolean).join(', ') || '—' },
                  { label: 'Birthday in the directory', value: p.personal.hideBirthday ? 'Hidden' : 'Shown' },
                ]}
              />
            ) : (
              <Text as="p" tone="secondary">
                Personal details are for the person and HR with personal-data access.
              </Text>
            )}
          </Card>
          <Card title="Identity and bank" actions={p.can.requestChange ? <Button size="sm" onClick={() => setChanging(true)}>Request a change</Button> : undefined}>
            {p.identity ? (
              <>
                <p className="yx-ppl2__confidential">
                  <Lock size={14} aria-hidden />
                  <Text as="span" size="sm" weight="medium">Confidential</Text>
                  <Text as="span" tone="secondary" size="sm">{p.self ? '· Only you, HR and payroll with access can see these.' : '· Each full look is recorded and shown to the person.'}</Text>
                </p>
                <DescriptionList
                  columns={2}
                  items={[
                    { label: 'Legal name', value: p.identity.legalName ?? 'Not on file' },
                    { label: 'PAN', value: masked('pan', p.identity.pan, p.can.reveal) },
                    { label: 'UAN', value: masked('uan', p.identity.uan, p.can.reveal) },
                    { label: 'ESIC IP number', value: masked('esic', p.identity.esic, p.can.reveal) },
                    {
                      label: 'Aadhaar',
                      value: (
                        <span className="yx-auth__item-main">
                          {masked('aadhaar', p.identity.aadhaar, p.classes.aadhaar)}
                          {p.identity.aadhaar && !p.classes.aadhaar && <Text tone="secondary" size="sm">Never shown in full</Text>}
                        </span>
                      ),
                    },
                    ...p.identity.bankAccounts.map((b) => ({
                      label: b.purpose === 'salary' ? 'Salary account' : 'Reimbursement account',
                      value: (
                        <span className="yx-auth__item-main">
                          {masked(b.purpose === 'salary' ? 'bank_salary' : 'bank_reimbursement', b.account, p.can.reveal)}
                          <Text tone="secondary" size="sm">{`${b.holderName} · ${b.ifsc}`}</Text>
                          {new Date(b.usableFrom) > new Date() && <Badge tone="info">{`Used for pay from ${dateLabel(b.usableFrom.slice(0, 10))}`}</Badge>}
                        </span>
                      ),
                    })),
                  ]}
                />
                {revealError && <InlineAlert tone="danger" title={revealError} />}
              </>
            ) : (
              <Text as="p" tone="secondary">
                Identity and bank details are for the person and payroll.
              </Text>
            )}
          </Card>
          {pending.length > 0 && (
            <Card title="Changes waiting for approval">
              <ul className="yx-acc__list">
                {pending.map((r) => (
                  <li key={r.id}>
                    <span className="yx-auth__item-main">
                      <Text weight="medium">{r.label}</Text>
                      <Text tone="secondary" size="sm">{`${shown(r.current)} → ${shown(r.proposed)}`}</Text>
                    </span>
                    {(r.mine || p.self) && (
                      <Button size="sm" onClick={() => setCancelling(r)}>
                        Withdraw
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Pay">
            <span className="yx-ppl2__row">
              <Text tone="secondary">{p.classes.pay ? 'Pay is on Job history, behind "Show pay". Each look by someone else is recorded.' : 'Pay is visible only with pay access.'}</Text>
              {p.classes.pay && props.onOpenHistory && <Button size="sm" onClick={props.onOpenHistory}>Open job history</Button>}
            </span>
          </Card>
        </>
      )}
      {editing && p?.personal && <PersonalDialog initial={p.personal} states={props.states} onSave={props.onSavePersonal} onClose={() => setEditing(false)} />}
      {changing && p && <ChangeDialog pending={pending.map((r) => r.kind)} onRequest={props.onRequestChange} onClose={() => setChanging(false)} />}
      {cancelling && <CancelDialog request={cancelling} onCancel={props.onCancelRequest} onClose={() => setCancelling(null)} />}
    </div>
  );
}
