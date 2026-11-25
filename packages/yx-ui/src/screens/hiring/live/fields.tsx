import { DatePicker } from '../../../components/date';
import { FormField } from '../../../components/field';
import { NumberField, TextField } from '../../../components/inputs';
import { Select } from '../../../components/select';
import { dayKey } from '../../../lib/dates';
import type { JobCustomField } from './types';

export type CustomValues = Record<string, string | number | null>;

/** The company's custom fields as form inputs (jobs and candidates use the same definitions shape). */
export function CustomFieldInputs({ fields, values, onChange, idPrefix, tried = false }: { fields: JobCustomField[]; values: CustomValues; onChange: (v: CustomValues) => void; idPrefix: string; /** Show "required" errors after a save attempt. */ tried?: boolean }) {
  const empty = new Set(tried ? missingRequired(fields, values).map((f) => f.id) : []);
  const set = (id: string, v: string | number | null) => onChange({ ...values, [id]: v });
  return (
    <>
      {fields.map((f) => (
        <FormField key={f.id} id={`${idPrefix}-cf-${f.id}`} label={f.label} required={f.required} optional={!f.required} error={empty.has(f.id) ? `Enter the ${f.label}.` : null}>
          {f.fieldType === 'select' ? (
            <Select aria-label={f.label} value={(values[f.id] as string | undefined) ?? null} onChange={(v) => set(f.id, v)} options={(f.options ?? []).map((o) => ({ value: o, label: o }))} clearable />
          ) : f.fieldType === 'number' ? (
            <NumberField value={(values[f.id] as number | undefined) ?? null} onChange={(v) => set(f.id, v)} />
          ) : f.fieldType === 'date' ? (
            <DatePicker aria-label={f.label} value={values[f.id] ? new Date(`${values[f.id]}T00:00:00`) : null} onChange={(d) => set(f.id, d ? dayKey(d) : null)} />
          ) : (
            <TextField value={(values[f.id] as string | undefined) ?? ''} onChange={(v) => set(f.id, v)} maxLength={500} />
          )}
        </FormField>
      ))}
    </>
  );
}

/** The required custom fields left empty. */
export const missingRequired = (fields: JobCustomField[], values: CustomValues) => fields.filter((f) => f.required && (values[f.id] === undefined || values[f.id] === null || values[f.id] === ''));
