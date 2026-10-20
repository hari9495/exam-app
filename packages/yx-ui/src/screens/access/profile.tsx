import { useState } from 'react';
import { Button,  } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { InlineAlert,  } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Select } from '../../components/select';
import { dayKey } from '../../lib/dates';
import { errorText } from '../org/org-kit';
import { GENDER_LABEL, KIND_LABEL, MARITAL_LABEL } from './access-kit';
import type { LoadState, PersonalDetails, ProfileRequest, ProfileRequestInput, ProfileView, RequestKind, RevealField } from './types';

// People › the person record's dialogs (PPL-03 / PPL-32; P02 §4.4–4.5), used by the designed record: personal details
// edited directly, identity, bank and legal-name changes sent for approval, a waiting change withdrawn.
// Before the design audit this file also held a simpler Profile screen: the record by sensitivity class. Personal details for the
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
const KIND_FIELDS: Record<RequestKind, { key: keyof ProfileRequestInput['value']; label: string; check: (v: string) => string | null; date?: boolean }[]> = {
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
  passport: [
    { key: 'passport', label: 'Passport number', check: (v) => (/^[A-Z0-9]{6,9}$/.test(v) ? null : 'Enter the passport number, like Z4417728') },
    { key: 'passportExpiresOn', label: 'Expires on', date: true, check: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Choose the expiry date') },
  ],
};
KIND_FIELDS.bank_reimbursement = KIND_FIELDS.bank_salary;

export function PersonalDialog({ initial, states, onSave, onClose }: { initial: PersonalDetails; states: ProfileScreenProps['states']; onSave: ProfileScreenProps['onSavePersonal']; onClose: () => void }) {
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
      <FormField id="pd-marital" label="Marital status">
        <Select aria-label="Marital status" value={d.maritalStatus ?? null} onChange={(v) => set('maritalStatus', v)} clearable options={Object.entries(MARITAL_LABEL).map(([value, label]) => ({ value, label }))} />
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

export function ChangeDialog({ pending, onRequest, onClose }: { pending: RequestKind[]; onRequest: ProfileScreenProps['onRequestChange']; onClose: () => void }) {
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
          {f.date ? (
            <DatePicker value={value[f.key] ? new Date(`${value[f.key]}T00:00:00`) : null} onChange={(v) => setValue((x) => ({ ...x, [f.key]: v ? dayKey(v) : '' }))} min={new Date()} />
          ) : (
            <TextField value={value[f.key] ?? ''} onChange={(v) => setValue((x) => ({ ...x, [f.key]: f.key === 'pan' || f.key === 'ifsc' || f.key === 'passport' ? v.toUpperCase() : v }))} onBlur={() => setTouched(true)} autoComplete="off" />
          )}
        </FormField>
      ))}
      <FormField id="cr-reason" label="Reason" required helper="For example: new bank, correction of a typo.">
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

export function CancelDialog({ request, onCancel, onClose }: { request: ProfileRequest; onCancel: ProfileScreenProps['onCancelRequest']; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title={`Withdraw the ${request.label.toLowerCase()} change?`} consequence="Nothing changes on the record." confirmLabel="Withdraw" destructive confirmDisabled={!reason.trim()} onConfirm={async () => (await onCancel(request.id, reason.trim()), onClose())}>
      <FormField id="cc-reason" label="Reason" required>
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}
