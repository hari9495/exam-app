// Settings S-8, 5.1 Document types (answer 1331): the drawn page with the company's document types. YukthiX's starter
// types are listed and cannot be changed or removed; HR adds the company's own and chooses, per type, its sensitivity,
// whether HR verifies it, whether it expires and when to remind, and who uploads it. A type with no documents can be
// retired. The drawn Verification, Expiry and Retention sections are not built yet and are left out, never shown with
// sample values.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import type { SettingDef, SettingsPageDef } from './settings-types';

/** GET /documents/types, one row. */
export interface DocTypeRow {
  key: string;
  name: string;
  sensitivity: 'internal' | 'personal' | 'confidential' | 'special';
  requiresVerification: boolean;
  expiryTracked: boolean;
  reminderDays: number[];
  uploadBy: string[];
  /** A YukthiX starter type (cannot be removed; the company may set its verification and reminders, answer 1822). */
  system: boolean;
  /** The company set its own verification or reminders for this starter type. */
  ownChoices?: boolean;
  /** HR always verifies it before payroll uses it (PAN, Aadhaar, bank proof, education, experience). */
  verifyLocked?: boolean;
}

export type DocTypeInput = Pick<DocTypeRow, 'name' | 'sensitivity' | 'requiresVerification' | 'expiryTracked' | 'reminderDays' | 'uploadBy'>;

const SENSITIVITY: Record<DocTypeRow['sensitivity'], string> = { internal: 'Internal', personal: 'Personal', confidential: 'Confidential', special: 'Special' };
/** The reminder choices a company type may have (days before the expiry date). */
export const REMINDER_CHOICES: number[][] = [[90, 30, 7], [60, 30, 7], [30, 7], [30], [15, 7]];
const daysText = (d: number[]) => (d.length ? `${d.length > 1 ? `${d.slice(0, -1).join(', ')} and ${d[d.length - 1]}` : d[0]} days before` : 'No reminder');

/** The drawn 5.1 page with the live list (the other drawn sections are left out). */
export function documentTypesPage(design: SettingsPageDef, types: DocTypeRow[]): SettingsPageDef {
  const drawn = design.sections.find((s) => s.settings.some((d) => d.key === 'doc.types'));
  const def = drawn!.settings.find((d) => d.key === 'doc.types')!;
  const list: SettingDef = {
    ...def,
    columns: ['Type', 'Sensitivity', 'HR verifies', 'Expiry reminder', 'Who uploads', 'From'],
    rows: types.map((t) => [t.name, SENSITIVITY[t.sensitivity], t.requiresVerification ? 'Yes' : 'No', t.expiryTracked ? daysText(t.reminderDays) : '—', t.uploadBy.includes('person') ? 'Employee and HR' : 'HR only', t.system ? (t.ownChoices ? 'YukthiX starter, your choices' : 'YukthiX starter') : 'Your company']),
    starter: false,
    helper: 'For a YukthiX starter type you choose whether HR verifies it and when to remind; the rest stays as YukthiX set it. Your own types can be changed, or retired while no document uses them.',
  };
  return { ...design, note: undefined, sections: [{ title: drawn!.title, description: drawn!.description, settings: [list] }] };
}

/** Add, change or retire a company document type; a starter type opens with only its verification and reminders to choose. */
export function DocumentTypeDrawer({ initial, onClose, onSave, onRetire, onReset }: { initial: DocTypeRow | null; onClose: () => void; onSave: (input: DocTypeInput) => Promise<unknown>; onRetire?: () => Promise<unknown>; onReset?: () => Promise<unknown> }) {
  const { toast } = useToast();
  const locked = Boolean(initial?.system);
  const [name, setName] = useState(initial?.name ?? '');
  const [sensitivity, setSensitivity] = useState<DocTypeRow['sensitivity']>(initial?.sensitivity ?? 'personal');
  const [verify, setVerify] = useState(initial?.requiresVerification ?? true);
  const [expires, setExpires] = useState(initial?.expiryTracked ?? false);
  const [remind, setRemind] = useState(initial?.reminderDays.length ? initial.reminderDays.join(',') : '60,30,7');
  const [person, setPerson] = useState<'both' | 'hr'>(initial && !initial.uploadBy.includes('person') ? 'hr' : 'both');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const nameError = name.trim().length < 2 ? 'Give the type a name of at least 2 characters.' : /[<>]/.test(name) ? 'Leave out < and >.' : null;
  const fail = (e: unknown) => setFailed(e instanceof Error ? e.message : 'It could not be saved. Try again.');
  const save = () => {
    setTried(true);
    if (nameError) return document.getElementById('dt-name')?.focus();
    setBusy(true);
    setFailed(null);
    onSave({ name: name.trim(), sensitivity, requiresVerification: verify, expiryTracked: expires, reminderDays: expires ? remind.split(',').map(Number) : [], uploadBy: person === 'hr' ? ['hr'] : ['person', 'hr'] })
      .then(() => (toast({ tone: 'success', title: initial ? 'Document type saved' : 'Document type added' }), onClose()))
      .catch(fail)
      .finally(() => setBusy(false));
  };
  const retire = () =>
    onRetire?.().then(() => (toast({ tone: 'success', title: 'Document type retired' }), onClose()), fail);
  const reset = () =>
    onReset?.().then(() => (toast({ tone: 'success', title: 'Back to YukthiX’s choices' }), onClose()), fail);
  const title = locked ? initial!.name : initial ? 'Change document type' : 'Add document type';
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={title}
      subtitle={locked ? 'YukthiX starter type' : 'Your company’s document type'}
      dirty
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : locked ? <InlineAlert tone="info" title="A YukthiX starter type: choose whether HR verifies it and when to remind. The rest stays as YukthiX set it, and it cannot be removed." /> : undefined}
      footer={
        locked ? (
          <>
            {initial?.ownChoices && onReset && <Button onClick={() => void reset()}>Back to YukthiX’s choices</Button>}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>Save your choices</Button>
          </>
        ) : (
          <>
            {initial && onRetire && <Button onClick={() => void retire()}>Retire</Button>}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>{initial ? 'Save document type' : 'Add document type'}</Button>
          </>
        )
      }
    >
      <div className="yx-set-stack">
        <FormField id="dt-name" label="Name" required error={tried ? nameError : null}>
          <TextField value={name} onChange={setName} maxLength={60} disabled={locked} />
        </FormField>
        <FormField id="dt-sensitivity" label="Sensitivity" helper="Internal: the employee and all HR. Personal: the employee and HR. Confidential: the employee and HR admins.">
          {locked ? <span>{SENSITIVITY[sensitivity]}</span> : <Segment label="Sensitivity" options={(['internal', 'personal', 'confidential'] as const).map((v) => ({ value: v, label: SENSITIVITY[v] }))} value={sensitivity} onChange={setSensitivity} />}
        </FormField>
        <Checkbox checked={verify} onChange={setVerify} label="HR verifies it" description={initial?.verifyLocked ? 'Always: HR verifies it before payroll uses it.' : 'It waits in the verification queue until HR verifies it.'} disabled={Boolean(initial?.verifyLocked)} />
        <Checkbox checked={expires} onChange={setExpires} label="It has an expiry date" description="The person gives the expiry date when uploading; it turns Expired on that day." disabled={locked} />
        {expires && (
          <FormField id="dt-remind" label="Remind the person">
            <Select aria-label="Remind the person" options={[...REMINDER_CHOICES.map((d) => d.join(',')), ...(REMINDER_CHOICES.some((d) => d.join(',') === remind) ? [] : [remind])].map((v) => ({ value: v, label: daysText(v.split(',').map(Number)) }))} value={remind} onChange={(v) => v && setRemind(v)} />
          </FormField>
        )}
        <FormField id="dt-who" label="Who uploads it">
          {locked ? <span>{person === 'hr' ? 'HR only' : 'Employee and HR'}</span> : <Segment label="Who uploads it" options={[{ value: 'both' as const, label: 'Employee and HR' }, { value: 'hr' as const, label: 'HR only' }]} value={person} onChange={setPerson} />}
        </FormField>
      </div>
    </Drawer>
  );
}
