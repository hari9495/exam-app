import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Badge } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { useToast } from '../../components/notify';
import { TextArea, TextField } from '../../components/inputs';
import { Dialog } from '../../components/overlay';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DescriptionList } from '../../components/shell';
import type { FilterFieldDef } from '../../components/filters';
import type { FilterValue } from '../../lib/table';
import type { Answers, FormDef } from '../../lib/forms';
import { useRun } from '../org/org-kit';
import { ServiceForm } from './service-form';

// Answers 1641, 1650: a desk's own ticket fields. The desk admin adds text, number, date or drop-down fields, for every
// ticket of the desk or one ticket type; a drop-down may narrow the next one (the forms engine's dependent list). Each
// field shows to everyone, to the desk's staff only (hidden from the requester) or to its team leads only. On a ticket
// they are filled in with the same form the catalogue uses (ServiceForm), so a dependent list behaves the same.

export type DeskFieldKind = 'text' | 'number' | 'date' | 'choice';
export type DeskFieldVisibility = 'all' | 'agents' | 'leads';
export interface DeskFieldOption {
  value: string;
  label: string;
}
export interface DeskField {
  id: string;
  key: string;
  label: string;
  fieldType: DeskFieldKind;
  ticketTypeId: string | null;
  options: DeskFieldOption[];
  dependsOn: string | null;
  optionsBy: Record<string, string[]> | null;
  visibility: DeskFieldVisibility;
  /** Answer 1843: the ticket cannot be solved until this field has a value. */
  requiredToSolve?: boolean;
  sortOrder: number;
  active: boolean;
  version: number;
}
export interface DeskFieldInput {
  key?: string;
  label: string;
  fieldType: DeskFieldKind;
  ticketTypeId: string | null;
  options?: DeskFieldOption[];
  dependsOn?: string | null;
  optionsBy?: Record<string, string[]> | null;
  visibility: DeskFieldVisibility;
  requiredToSolve?: boolean;
  active: boolean;
  version?: number;
}
/** A field as a ticket shows it to this person (the server leaves out what they may not see). */
export interface TicketFieldView {
  id: string;
  key: string;
  label: string;
  type: DeskFieldKind;
  visibility: DeskFieldVisibility;
  requiredToSolve?: boolean;
  options: DeskFieldOption[];
  dependsOn: string | null;
  optionsBy: Record<string, string[]> | null;
  value: string | number | null;
  display: string | null;
}

export const KIND_LABEL: Record<DeskFieldKind, string> = { text: 'Text', number: 'Number', date: 'Date', choice: 'Drop-down' };
export const VISIBILITY_LABEL: Record<DeskFieldVisibility, string> = { all: 'Everyone on the ticket', agents: 'Desk staff only', leads: 'Team leads only' };
const VISIBILITY_NOTE: Record<DeskFieldVisibility, string | null> = { all: null, agents: 'Not shown to the requester', leads: 'Team leads only' };

/** A choice's stored value from its label ("Bengaluru office" → "bengaluru_office"), kept when the label changes. */
export const choiceValue = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'choice';

// ------------------------------------------------------------------------------------------ desk set-up: Fields tab

export function FieldsTab({ fields, types, canSetUp, onSave }: { fields: DeskField[]; types: { id: string; name: string }[]; canSetUp: boolean; onSave?: (id: string | null, input: DeskFieldInput) => Promise<unknown> }) {
  const [edit, setEdit] = useState<DeskField | 'new' | null>(null);
  const typeName = (id: string | null) => (id ? (types.find((t) => t.id === id)?.name ?? 'one type') : 'every ticket');
  return (
    <div className="yx-ops-stack">
      <p className="yx-ops-muted">Fields agents fill in on this desk’s tickets. A drop-down can narrow the next one, and each field says who may see it.</p>
      {fields.length === 0 ? (
        <p className="yx-ops-muted">No fields yet.</p>
      ) : (
        <ul className="yx-ops-list" aria-label="Ticket fields">
          {fields.map((f) => (
            <li key={f.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span className="yx-ops-list__title">{f.label}</span>
                <span className="yx-ops-list__sub">
                  {KIND_LABEL[f.fieldType]}
                  {f.dependsOn ? ` · narrowed by ${fields.find((x) => x.key === f.dependsOn)?.label ?? f.dependsOn}` : ''} · for {typeName(f.ticketTypeId)} · {VISIBILITY_LABEL[f.visibility]}
                  {f.requiredToSolve ? ' · required before solving' : ''}
                  {f.active ? '' : ' · off'}
                </span>
              </span>
              {canSetUp && onSave && (
                <Button size="sm" aria-label={`Edit ${f.label}`} onClick={() => setEdit(f)}>
                  Edit
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canSetUp && onSave && (
        <div className="yx-ops-row">
          <Button icon={Plus} onClick={() => setEdit('new')}>
            New field
          </Button>
        </div>
      )}
      {edit && onSave && <FieldDialog field={edit === 'new' ? null : edit} fields={fields} types={types} onClose={() => setEdit(null)} onSave={(input) => onSave(edit === 'new' ? null : edit.id, input)} />}
    </div>
  );
}

function FieldDialog({ field, fields, types, onClose, onSave }: { field: DeskField | null; fields: DeskField[]; types: { id: string; name: string }[]; onClose: () => void; onSave: (input: DeskFieldInput) => Promise<unknown> }) {
  const [label, setLabel] = useState(field?.label ?? '');
  const [key, setKey] = useState(field?.key ?? '');
  const [kind, setKind] = useState<DeskFieldKind>(field?.fieldType ?? 'text');
  const [typeId, setTypeId] = useState<string | null>(field?.ticketTypeId ?? null);
  const [visibility, setVisibility] = useState<DeskFieldVisibility>(field?.visibility ?? 'all');
  const [choices, setChoices] = useState((field?.options ?? []).map((o) => o.label).join('\n'));
  const [dependsOn, setDependsOn] = useState<string | null>(field?.dependsOn ?? null);
  const [by, setBy] = useState<Record<string, string[]>>(field?.optionsBy ?? {});
  const [active, setActive] = useState(field?.active ?? true);
  const [required, setRequired] = useState(field?.requiredToSolve ?? false);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  // A choice keeps its stored value when only its label changes.
  const options: DeskFieldOption[] = choices
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ label: l, value: field?.options.find((o) => o.label === l)?.value ?? choiceValue(l) }));
  const parents = fields.filter((f) => f.fieldType === 'choice' && f.active && f.key !== (field?.key ?? key) && (f.ticketTypeId === null || f.ticketTypeId === typeId));
  const parent = parents.find((p) => p.key === dependsOn) ?? null;
  const early = useTooEarly([
    ...(label.trim() ? [] : [{ fieldId: 'df-label', message: 'Name the field.' }]),
    ...(field || /^[a-z][a-z0-9_]{0,39}$/.test(key) ? [] : [{ fieldId: 'df-key', message: 'A key is lower-case letters, digits and _, starting with a letter.' }]),
    ...(kind !== 'choice' || options.length ? [] : [{ fieldId: 'df-choices', message: 'Write at least one choice.' }]),
  ]);
  const save = () =>
    !early.stop() &&
    void run('save', async () => {
      await onSave({
        ...(field ? { version: field.version } : { key }),
        label: label.trim(),
        fieldType: kind,
        ticketTypeId: typeId,
        visibility,
        // Answer 1843: never for a field only team leads see (agents could not solve).
        requiredToSolve: required && visibility !== 'leads',
        active,
        ...(kind === 'choice' ? { options, dependsOn: parent ? parent.key : null, optionsBy: parent ? Object.fromEntries(parent.options.map((p) => [p.value, (by[p.value] ?? []).filter((v) => options.some((o) => o.value === v))])) : null } : {}),
      });
      toast({ tone: 'success', title: field ? 'Field saved.' : 'Field added.' });
      onClose();
    });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={field ? `Edit ${field.label}` : 'New field'}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={save}>
            Save field
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The field was not saved">{error}</InlineAlert>}
        <span className="yx-ops-row">
          <FormField id="df-label" label="Name" required error={early.errorOf('df-label')}>
            <TextField
              value={label}
              onChange={(v) => {
                setLabel(v);
                if (!field) setKey(choiceValue(v).replace(/^[^a-z]+/, '').slice(0, 40));
              }}
              maxLength={100}
            />
          </FormField>
          <FormField id="df-key" label="Key" required helper={field ? 'A field keeps its key.' : 'Used in saved views and reports.'} error={early.errorOf('df-key')}>
            <TextField value={key} onChange={(v) => setKey(v.toLowerCase())} maxLength={40} disabled={Boolean(field)} />
          </FormField>
        </span>
        <FormField label="Kind" helper={field ? 'A field keeps its kind.' : undefined}>
          <Segment label="Kind" options={(Object.keys(KIND_LABEL) as DeskFieldKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} value={kind} onChange={(v) => !field && setKind(v)} />
        </FormField>
        <span className="yx-ops-row">
          <FormField label="For tickets">
            <Select value={typeId ?? 'all'} onChange={(v) => setTypeId(v === 'all' || !v ? null : v)} options={[{ value: 'all', label: 'Every ticket of this desk' }, ...types.map((t) => ({ value: t.id, label: t.name }))]} />
          </FormField>
          <FormField label="Who sees it">
            <Select value={visibility} onChange={(v) => v && setVisibility(v as DeskFieldVisibility)} options={(Object.keys(VISIBILITY_LABEL) as DeskFieldVisibility[]).map((v) => ({ value: v, label: VISIBILITY_LABEL[v] }))} />
          </FormField>
        </span>
        {kind === 'choice' && (
          <>
            <FormField id="df-choices" label="Choices" helper="One a line." error={early.errorOf('df-choices')}>
              <TextArea value={choices} onChange={setChoices} rows={4} />
            </FormField>
            {parents.length > 0 && (
              <FormField label="Narrowed by" optional helper="Its choices then depend on what that drop-down says.">
                <Select value={dependsOn} onChange={setDependsOn} clearable placeholder="Not narrowed" options={parents.map((p) => ({ value: p.key, label: p.label }))} />
              </FormField>
            )}
            {parent &&
              parent.options.map((p) => (
                <FormField key={p.value} label={`Choices when ${parent.label} is ${p.label}`}>
                  <MultiSelect value={by[p.value] ?? []} onChange={(v) => setBy({ ...by, [p.value]: v })} options={options.map((o) => ({ value: o.value, label: o.label }))} placeholder="Choose" />
                </FormField>
              ))}
          </>
        )}
        {visibility !== 'leads' && <Checkbox checked={required} onChange={setRequired} label="Required before solving" description="Agents fill it in before the ticket can be solved." />}
        <Checkbox checked={active} onChange={setActive} label="Field is on" />
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------ the ticket

/** A field's note on the ticket: who may see it and (1843) whether it is needed before solving. */
const helpOf = (f: TicketFieldView) => [VISIBILITY_NOTE[f.visibility], f.requiredToSolve ? 'Required before solving' : null].filter(Boolean).join(' · ') || null;

/** The ticket's fields as one form of the forms engine (the same dependent lists as the server). */
export function fieldsForm(fields: TicketFieldView[]): FormDef {
  return {
    sections: [{ id: 'fields', columns: 1, fields: fields.map((f) => ({ key: f.key, type: f.type, label: f.label, ...(helpOf(f) ? { help: helpOf(f)! } : {}), ...(f.type === 'choice' ? { options: f.options } : {}), ...(f.dependsOn ? { dependsOn: f.dependsOn, optionsBy: f.optionsBy ?? {} } : {}) })) }],
    rules: [],
  };
}

/** Answers 1641, 1650: the ticket's own fields on the agent's ticket: editable with a Save, else read only. */
export function TicketFieldsPanel({ fields, canSet, onSave }: { fields: TicketFieldView[]; canSet: boolean; onSave?: (values: Record<string, string | number | null>) => Promise<unknown> }) {
  const start = Object.fromEntries(fields.map((f) => [f.key, f.value])) as Answers;
  const [values, setValues] = useState<Answers>(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  if (!fields.length) return null;
  if (!canSet || !onSave)
    return (
      <DescriptionList
        items={fields.map((f) => ({ label: f.label, value: f.display ?? '—', ...(helpOf(f) ? { hint: helpOf(f)! } : {}) }))}
      />
    );
  const changed = Object.fromEntries(fields.filter((f) => (values[f.key] ?? null) !== (f.value ?? null)).map((f) => [f.key, (values[f.key] ?? null) as string | number | null]));
  return (
    <div className="yx-ops-stack" data-gap="sm">
      {error && <InlineAlert tone="danger" title="The fields were not saved">{error}</InlineAlert>}
      <ServiceForm form={fieldsForm(fields)} values={values} onChange={setValues} errors={errors} onPick={async () => []} />
      <div className="yx-ops-row">
        <Button
          size="sm"
          loading={busy === 'fields'}
          onClick={() => {
            if (!Object.keys(changed).length) return toast({ tone: 'default', title: 'Nothing has changed yet.' });
            void run('fields', async () => {
              try {
                await onSave(changed);
                setErrors({});
                toast({ tone: 'success', title: 'Fields saved.' });
              } catch (e) {
                const errs = (e as { body?: { errors?: Record<string, string> } }).body?.errors ?? (e as { errors?: Record<string, string> }).errors;
                if (errs) setErrors(errs);
                throw e;
              }
            });
          }}
        >
          Save fields
        </Button>
      </div>
    </div>
  );
}

/** Answer 1842: a field the raise form asks (the desk's fields everyone sees); value and display are empty. */
export type RaiseField = TicketFieldView;
type FieldAnswer = string | number;

/** The field values a raise sends: only the ones filled in. */
export const raiseFieldValues = (fields: RaiseField[] | undefined, values: Answers): Record<string, FieldAnswer> | undefined => {
  const out = Object.fromEntries((fields ?? []).filter((f) => values[f.key] !== undefined && values[f.key] !== null && values[f.key] !== '').map((f) => [f.key, values[f.key] as FieldAnswer]));
  return Object.keys(out).length ? out : undefined;
};

/** The server's per-field messages (400 FIELD_ERRORS) from a refused raise or save. */
export const fieldErrorsOf = (e: unknown): Record<string, string> | null => (e as { body?: { errors?: Record<string, string> } }).body?.errors ?? (e as { errors?: Record<string, string> }).errors ?? null;

/** Answer 1842: the desk's own fields on a raise form (dependent drop-downs as on the agent's ticket). */
export function RaiseFields({ fields, values, onChange, errors }: { fields?: RaiseField[]; values: Answers; onChange: (v: Answers) => void; errors: Record<string, string> }) {
  if (!fields?.length) return null;
  // The desk's "required before solving" is for its agents, not a note for the requester.
  return <ServiceForm form={fieldsForm(fields.map((f) => ({ ...f, requiredToSolve: false })))} values={values} onChange={onChange} errors={errors} onPick={async () => []} />;
}

/** Answers 1641, 1650: the filled fields a requester may see, on their own ticket (help centre and portal). */
export function RequesterFields({ fields }: { fields?: { label: string; value: string | null }[] }) {
  if (!fields?.length) return null;
  return <DescriptionList items={fields.map((f) => ({ label: f.label, value: f.value ?? '—' }))} />;
}

/** A small mark for a field the requester cannot see. */
export function FieldVisibilityBadge({ visibility }: { visibility: DeskFieldVisibility }) {
  return VISIBILITY_NOTE[visibility] ? <Badge tone="neutral">{VISIBILITY_NOTE[visibility]}</Badge> : null;
}

// ------------------------------------------------------------------------------------------ lists and saved views

/** The desks' fields as filter-bar fields (one key per field; a drop-down offers its choices). */
export function fieldFilters(fields: Pick<DeskField, 'key' | 'label' | 'fieldType' | 'options' | 'active'>[]): FilterFieldDef[] {
  const seen = new Set<string>();
  return fields
    .filter((f) => f.active && !seen.has(f.key) && seen.add(f.key))
    .map((f) => (f.fieldType === 'choice' ? { key: `field:${f.key}`, label: f.label, type: 'multi' as const, options: f.options.map((o) => ({ value: o.value, label: o.label })) } : { key: `field:${f.key}`, label: f.label, type: 'text' as const }));
}

/** One desk field at a time as the server's filter (the first one set). */
export function fieldFilterOf(v: FilterValue[]): { fieldKey?: string; fieldValues?: string[] } {
  for (const x of v) {
    if (!x.key.startsWith('field:')) continue;
    const values = x.type === 'multi' ? x.values : x.type === 'text' && x.contains.trim() ? [x.contains.trim()] : [];
    if (values.length) return { fieldKey: x.key.slice(6), fieldValues: values };
  }
  return {};
}
