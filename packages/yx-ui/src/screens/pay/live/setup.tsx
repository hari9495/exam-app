import { FormField } from '../../../components/field';
import { Select } from '../../../components/select';
import type { SetupEntity } from './types-5b';

// Shared by the Pay live pages (the copies that lived here are gone: their pages render the designs): the legal entity
// picker, statute names and the CSV reader used by imports.

export function EntityPicker({ entities, value, onChange, id = 'pay-entity', error }: { entities: SetupEntity[]; value: string | null; onChange: (id: string | null) => void; id?: string; error?: string }) {
  return (
    <FormField id={id} label="Legal entity" error={error}>
      <Select value={value} onChange={onChange} placeholder="Choose a legal entity" options={entities.map((e) => ({ value: e.id, label: e.name }))} />
    </FormField>
  );
}

const STATUTE: Record<string, string> = {
  'IN.PF': 'Provident fund',
  'IN.ESI': 'ESI',
  'IN.PT': 'Professional tax',
  'IN.LWF': 'Labour welfare fund',
  'IN.TDS': 'Income tax (TDS)',
};
export const statuteText = (s: string) => STATUTE[s] ?? s;

// ------------------------------------------------------------------------------------------ imports (PAY-2.12)

/** Comma-separated text with a header row (no commas inside values) into rows. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}
