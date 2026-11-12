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
  /** A YukthiX starter type (cannot be changed or removed). */
  system: boolean;
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
    rows: types.map((t) => [t.name, SENSITIVITY[t.sensitivity], t.requiresVerification ? 'Yes' : 'No', t.expiryTracked ? daysText(t.reminderDays) : '—', t.uploadBy.includes('person') ? 'Employee and HR' : 'HR only', t.system ? 'YukthiX starter' : 'Your company']),
    starter: false,
    helper: 'YukthiX starter types cannot be changed or removed. Your own types can be changed, or retired while no document uses them.',
  };
  return { ...design, note: undefined, sections: [{ title: drawn!.title, description: drawn!.description, settings: [list] }] };
}

/** Add, change or retire a company document type; a starter type opens read-only. */
export function DocumentTypeDrawer({ initial, onClose, onSave, onRetire }: { initial: DocTypeRow | null; onClose: () => void; onSave: (input: DocTypeInput) => Promise<unknown>; onRetire?: () => Promise<unknown> }) {
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
  const title = locked ? initial!.name : initial ? 'Change document type' : 'Add document type';
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={title}
      subtitle={locked ? 'YukthiX starter type' : 'Your company’s document type'}
      dirty={!locked}
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : locked ? <InlineAlert tone="info" title="A YukthiX starter type: it cannot be changed or removed." /> : undefined}
      footer={
        locked ? (
          <Button onClick={onClose}>Close</Button>
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
        <Checkbox checked={verify} onChange={setVerify} label="HR verifies it" description="It waits in the verification queue until HR verifies it." disabled={locked} />
        <Checkbox checked={expires} onChange={setExpires} label="It has an expiry date" description="The person gives the expiry date when uploading; it turns Expired on that day." disabled={locked} />
        {expires && (
          <FormField id="dt-remind" label="Remind the person">
            <Select aria-label="Remind the person" options={REMINDER_CHOICES.map((d) => ({ value: d.join(','), label: daysText(d) }))} value={remind} onChange={(v) => v && setRemind(v)} disabled={locked} />
          </FormField>
        )}
        <FormField id="dt-who" label="Who uploads it">
          {locked ? <span>{person === 'hr' ? 'HR only' : 'Employee and HR'}</span> : <Segment label="Who uploads it" options={[{ value: 'both' as const, label: 'Employee and HR' }, { value: 'hr' as const, label: 'HR only' }]} value={person} onChange={setPerson} />}
        </FormField>
      </div>
    </Drawer>
  );
}
