import { useState } from 'react';
import { Button } from '../../../components/button';
import { FormField } from '../../../components/field';
import { TextField } from '../../../components/inputs';
import { useRun } from '../../org/org-kit';

// Shared live helpers: the person picker and the API's LOP and hold rows. Payroll › Inputs itself is the designed
// OneTimePayScreen (PAY-04 … PAY-06) with `live`, in ../payroll-inputs-live.tsx.

export interface PersonHit {
  id: string;
  name: string;
  employeeCode?: string;
}

/** Find a person by name or code, then pick one. */
export function PersonPicker({ id, label, value, onChange, onSearch, error }: { id: string; label: string; value: PersonHit | null; onChange: (p: PersonHit) => void; onSearch: (q: string) => Promise<PersonHit[]>; error?: string }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PersonHit[] | null>(null);
  const { busy, run } = useRun();
  return (
    <>
      <FormField id={id} label={label} required error={error} helper={value ? `Chosen: ${value.name}${value.employeeCode ? ` · ${value.employeeCode}` : ''}` : 'Search by name or employee code.'}>
        <div className="yx-tim-row">
          <TextField value={q} onChange={setQ} aria-label={`Find ${label.toLowerCase()}`} />
          <Button loading={busy === 'find'} onClick={() => void run('find', async () => setHits(await onSearch(q)))}>
            Search
          </Button>
        </div>
      </FormField>
      {hits && !hits.length && <p className="yx-tim-note">Nobody found.</p>}
      {hits && hits.length > 0 && (
        <ul className="yx-tim-row" aria-label="People found">
          {hits.map((h) => (
            <li key={h.id}>
              <Button size="sm" variant={value?.id === h.id ? 'primary' : undefined} aria-pressed={value?.id === h.id} onClick={() => onChange(h)}>
                {h.name}
                {h.employeeCode ? ` · ${h.employeeCode}` : ''}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export interface LopRow {
  employeeId: string;
  lopDays: string;
  reason: string;
  source: string;
}

export interface HoldRow {
  id: string;
  employeeId: string;
  reasonCode: string;
  note: string;
  amount: string | null;
  released: boolean;
  ageDays: number | null;
}
