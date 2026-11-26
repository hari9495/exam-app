// PPL-03 "Additional details" and Settings › People & Access › Custom fields (P18): the company's own fields on the
// employee record. Each field has a data class (P02 §4.4) that decides who sees and changes its value; the server
// sends only the values the viewer may see, so these screens show what they are given.

import { useState } from 'react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Card } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { CustomFieldInputs, type CustomValues } from '../hiring/live/fields';
import { EditorDrawer, OrgPage, errorText, useRun } from '../org/org-kit';
import type { LoadState } from '../org/types';
import { ClassBadge, useSay } from './people-kit';
import type { FieldClass } from './people-logic';

export type DataClass = 'public' | 'internal' | 'personal' | 'confidential';
export type CustomFieldType = 'text' | 'number' | 'date' | 'select';

/** One field and its value on a person's record, as the server sends it (Confidential values come masked). */
export interface RecordCustomField {
  id: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[] | null;
  required: boolean;
  dataClass: DataClass;
  value: string | number | null;
  canEdit: boolean;
}

/** A field as HR defines it in settings. */
export interface EmployeeFieldDef {
  id: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[] | null;
  dataClass: DataClass;
  /** Candidate and job fields (answer 2425): must be filled in. */
  required?: boolean;
  /** Candidate fields: asked on the careers application form. */
  showOnApply?: boolean;
}

/** Answer 2425 (retiring /v2): which record the fields belong to. */
export type FieldEntity = 'employee' | 'candidate' | 'job';
const ENTITY_LABEL: Record<FieldEntity, string> = { employee: 'Employees', candidate: 'Candidates', job: 'Jobs' };
const ENTITY_TITLE: Record<FieldEntity, string> = { employee: 'Employee record fields', candidate: 'Candidate fields', job: 'Job fields' };
const ENTITY_WHERE: Record<FieldEntity, string> = {
  employee: "Shown under Additional details on each person's record.",
  candidate: 'Shown on each candidate record, and on the application form when you ask it there.',
  job: 'Shown on each job, and filled in when a job is opened.',
};

export const CLASS_LABEL: Record<DataClass, FieldClass> = { public: 'Public', internal: 'Internal', personal: 'Personal', confidential: 'Confidential' };
const CLASS_HELP: Record<DataClass, string> = {
  public: 'Everyone in the company sees it, like the directory.',
  internal: 'The person, their managers and HR see it.',
  personal: 'Only the person and HR with personal-data access see it. The person can change it.',
  confidential: 'Only the person and HR with identity access see it, and only the last four characters.',
};
const TYPE_LABEL: Record<CustomFieldType, string> = { text: 'Text', number: 'Number', date: 'Date', select: 'Pick-list' };

/** A value as the card shows it: dates in words, empty as null ("Not set"). */
export function customValueText(f: Pick<RecordCustomField, 'fieldType' | 'value'>): string | null {
  if (f.value === null || f.value === '') return null;
  if (f.fieldType === 'date') return new Date(`${f.value}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return String(f.value);
}

/** Edit drawer for the Additional details card: the fields the viewer may change, each with its own input. */
export function CustomFieldsDrawer({ fields, onSave, onClose }: { fields: RecordCustomField[]; onSave: (values: CustomValues) => Promise<void>; onClose: () => void }) {
  const editable = fields.filter((f) => f.canEdit);
  // A Confidential value comes masked: its box starts empty and is sent only when typed in.
  const [values, setValues] = useState<CustomValues>(() => Object.fromEntries(editable.map((f) => [f.id, f.dataClass === 'confidential' ? null : f.value])));
  const [touched, setTouched] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { say } = useSay();
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(Object.fromEntries(touched.map((id) => [id, values[id] ?? null])));
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const confidential = editable.some((f) => f.dataClass === 'confidential');
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Additional details"
      description={confidential ? 'Confidential fields show only their last four characters. Type a new value to replace one.' : undefined}
      dirty={touched.length > 0}
      notice={error ? <InlineAlert tone="danger">{error}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => say(!touched.length && 'Nothing has changed yet. Change a value, then save.', () => void save())} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="yx-ppl__stack">
        <CustomFieldInputs
          idPrefix="record"
          fields={editable}
          values={values}
          onChange={(next) => {
            setTouched((t) => [...new Set([...t, ...Object.keys(next).filter((k) => next[k] !== values[k])])]);
            setValues(next);
          }}
        />
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ settings */

export interface EmployeeFieldsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  fields: EmployeeFieldDef[];
  canManage: boolean;
  onCreate: (f: Omit<EmployeeFieldDef, 'id'>) => Promise<void>;
  onUpdate: (id: string, f: Pick<EmployeeFieldDef, 'label' | 'dataClass' | 'options' | 'required' | 'showOnApply'>) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  /** Answer 2425: the record the list is for (default employees). */
  entity?: FieldEntity;
  /** Given: a switch between employee, candidate and job fields. */
  onEntity?: (e: FieldEntity) => void;
}

type Draft = { label: string; fieldType: CustomFieldType; dataClass: DataClass; options: string; required: boolean; showOnApply: boolean };

function FieldEditor({ field, entity, onClose, onSave }: { field: EmployeeFieldDef | null; entity: FieldEntity; onClose: () => void; onSave: (d: Draft) => Promise<void> }) {
  const [d, setD] = useState<Draft>({ label: field?.label ?? '', fieldType: field?.fieldType ?? 'text', dataClass: field?.dataClass ?? 'internal', options: (field?.options ?? []).join('\n'), required: field?.required ?? false, showOnApply: field?.showOnApply ?? false });
  const [dirty, setDirty] = useState(false);
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const problems = [
    ...(!d.label.trim() ? [{ fieldId: 'cf-label', message: 'Give the field a name.' }] : []),
    ...(d.fieldType === 'select' && !d.options.split('\n').some((o) => o.trim()) ? [{ fieldId: 'cf-options', message: 'A pick-list needs at least one choice.' }] : []),
  ];
  const save = () => {
    setTried(true);
    if (problems.length) return;
    void run('save', () => onSave(d)).then((ok) => ok && onClose());
  };
  const shown = tried ? problems : [];
  return (
    <EditorDrawer open onClose={onClose} dirty={dirty} title={field ? `Edit ${field.label}` : 'Add custom field'} subtitle={ENTITY_WHERE[entity]} errors={shown} saving={busy === 'save'} failed={error} saveLabel={field ? 'Save' : 'Add field'} onSave={save}>
      <FormField id="cf-label" label="Name" required error={shown.find((p) => p.fieldId === 'cf-label')?.message}>
        <TextField value={d.label} onChange={(v) => set({ label: v })} maxLength={200} />
      </FormField>
      <FormField id="cf-type" label="Type" helper={field ? 'The type cannot change once people have values.' : undefined}>
        <Select aria-label="Type" value={d.fieldType} disabled={Boolean(field)} onChange={(v) => v && set({ fieldType: v as CustomFieldType })} options={(Object.keys(TYPE_LABEL) as CustomFieldType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
      </FormField>
      {d.fieldType === 'select' && (
        <FormField id="cf-options" label="Choices" required helper="One per line." error={shown.find((p) => p.fieldId === 'cf-options')?.message}>
          <TextArea value={d.options} onChange={(v) => set({ options: v })} rows={5} />
        </FormField>
      )}
      {entity === 'employee' ? (
        <FormField id="cf-class" label="Who can see it" helper={CLASS_HELP[d.dataClass]}>
          <Segment label="Who can see it" value={d.dataClass} onChange={(v) => set({ dataClass: v })} options={(Object.keys(CLASS_LABEL) as DataClass[]).map((c) => ({ value: c, label: CLASS_LABEL[c] }))} />
        </FormField>
      ) : (
        <>
          <Checkbox checked={d.required} onChange={(v) => set({ required: v })} label="Must be filled in" />
          {entity === 'candidate' && <Checkbox checked={d.showOnApply} onChange={(v) => set({ showOnApply: v })} label="Ask on the application form" description="Applicants answer it on the careers page." />}
        </>
      )}
    </EditorDrawer>
  );
}

export function EmployeeFieldsScreen({ state, onRetry, fields, canManage, onCreate, onUpdate, onArchive, entity = 'employee', onEntity }: EmployeeFieldsScreenProps) {
  const [editing, setEditing] = useState<EmployeeFieldDef | 'new' | null>(null);
  const [removing, setRemoving] = useState<EmployeeFieldDef | null>(null);
  const columns: TableColumn<EmployeeFieldDef>[] = [
    { key: 'label', header: 'Field', value: (f) => f.label, render: (f) => <Text weight="medium">{f.label}</Text>, hideable: false },
    { key: 'type', header: 'Type', value: (f) => TYPE_LABEL[f.fieldType] },
    ...(entity === 'employee' ? [{ key: 'class', header: 'Sensitivity', value: (f: EmployeeFieldDef) => CLASS_LABEL[f.dataClass], render: (f: EmployeeFieldDef) => <ClassBadge cls={CLASS_LABEL[f.dataClass]} /> }] : []),
    { key: 'options', header: 'Choices', value: (f) => (f.options ?? []).join(', '), render: (f) => (f.options?.length ? f.options.join(', ') : <Text tone="secondary">—</Text>) },
    ...(entity === 'employee'
      ? [{ key: 'self', header: 'Employee can edit', value: (f: EmployeeFieldDef) => (f.dataClass === 'personal' ? 'Yes' : 'No') }]
      : [{ key: 'required', header: 'Must be filled in', value: (f: EmployeeFieldDef) => (f.required ? 'Yes' : 'No') }, ...(entity === 'candidate' ? [{ key: 'apply', header: 'On the application form', value: (f: EmployeeFieldDef) => (f.showOnApply ? 'Yes' : 'No') }] : [])]),
    ...(canManage
      ? [
          {
            key: 'act',
            header: 'Action',
            sortable: false,
            value: () => '',
            width: 180,
            render: (f: EmployeeFieldDef) => (
              <span className="yx-ppl__head-actions">
                <Button size="sm" onClick={() => setEditing(f)} aria-label={`Edit ${f.label}`}>Edit</Button>
                <Button size="sm" onClick={() => setRemoving(f)} aria-label={`Remove ${f.label}`}>Remove</Button>
              </span>
            ),
          } as TableColumn<EmployeeFieldDef>,
        ]
      : []),
  ];
  const options = (s: string) => [...new Set(s.split('\n').map((o) => o.trim()).filter(Boolean))];
  return (
    <OrgPage
      group="People & Access"
      crumb="Custom fields"
      title="Custom fields"
      description="Fields you add to employee, candidate and job records. An employee field says how private it is: who sees it and who can change it."
      state={state}
      onRetry={onRetry}
      what="custom fields"
      actions={canManage ? <Button variant="primary" onClick={() => setEditing('new')}>Add custom field</Button> : undefined}
    >
      {onEntity && <Segment label="Fields for" value={entity} onChange={onEntity} options={(Object.keys(ENTITY_LABEL) as FieldEntity[]).map((e) => ({ value: e, label: ENTITY_LABEL[e] }))} />}
      <Card title={ENTITY_TITLE[entity]}>
        {state !== 'ready' ? (
          <Skeleton height={160} />
        ) : (
          <DataTable label="Custom fields" columns={columns} rows={fields} getRowId={(f) => f.id} rowNoun={['field', 'fields']} cardSummary empty={<EmptyState compact title="No custom fields yet." description="Add one to keep something about your people that YukthiX does not ask for, like a licence number or a uniform size." />} />
        )}
      </Card>
      {editing && (
        <FieldEditor
          key={`${entity}-${editing === 'new' ? 'new' : editing.id}`}
          entity={entity}
          field={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(d) =>
            editing === 'new'
              ? onCreate({ label: d.label.trim(), fieldType: d.fieldType, dataClass: d.dataClass, options: d.fieldType === 'select' ? options(d.options) : null, ...(entity === 'employee' ? {} : { required: d.required, ...(entity === 'candidate' ? { showOnApply: d.showOnApply } : {}) }) })
              : onUpdate(editing.id, { label: d.label.trim(), dataClass: d.dataClass, options: editing.fieldType === 'select' ? options(d.options) : null, ...(entity === 'employee' ? {} : { required: d.required, ...(entity === 'candidate' ? { showOnApply: d.showOnApply } : {}) }) })
          }
        />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove custom field ${removing?.label ?? ''}?`}
        consequence={entity === 'employee' ? "It leaves every person's record. Values already saved are kept in the history but no longer shown." : `It leaves every ${entity} record and form. Values already saved are kept but no longer shown.`}
        confirmLabel="Remove field"
        destructive
        onConfirm={async () => {
          if (removing) await onArchive(removing.id);
          setRemoving(null);
        }}
      />
    </OrgPage>
  );
}
