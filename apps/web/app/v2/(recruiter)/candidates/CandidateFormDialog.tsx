'use client';

// Shared Add/Edit candidate form, on the ui-v2 Dialog + TextField primitives. Presentational: the
// page owns the create/update mutations and passes onSubmit + submitting + error.
import { useEffect, useState } from 'react';
import { Dialog, TextField, Button, dt } from '../../../../components/ui-v2';
import { CustomFieldsInputs } from '../../../../components/CustomFieldsInputs';
import { useCustomFields } from '../../../../lib/hooks/useCustomFields';
import type { CustomFieldInputMap, CustomFieldRead } from '../../../../lib/types';

export interface CandidateFormValues { name: string; email: string; phone?: string; customFields: CustomFieldInputMap }

// definitionId -> value, seeded from the record's own CustomFieldRead[] on edit (add starts empty).
function seedCustomFields(fields: CustomFieldRead[] | undefined): CustomFieldInputMap {
  const map: CustomFieldInputMap = {};
  for (const f of fields ?? []) map[f.definitionId] = f.value;
  return map;
}

export function CandidateFormDialog({
  open, mode, initial, submitting, error, onClose, onSubmit,
}: {
  open: boolean;
  mode: 'add' | 'edit';
  initial?: { name: string; email: string; phone: string | null; customFields?: CustomFieldRead[] };
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: CandidateFormValues) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [customFields, setCustomFields] = useState<CustomFieldInputMap>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const { data: definitions } = useCustomFields('candidate');

  // Re-seed the fields whenever the dialog opens (or the target candidate changes).
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setEmail(initial?.email ?? '');
    setPhone(initial?.phone ?? '');
    setCustomFields(seedCustomFields(initial?.customFields));
    setLocalError(null);
  }, [open, initial]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const em = email.trim();
    if (!n) { setLocalError('Name is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setLocalError('Enter a valid email address.'); return; }
    setLocalError(null);
    onSubmit({ name: n, email: em, phone: phone.trim() || undefined, customFields });
  }

  const shown = localError ?? error;

  return (
    <Dialog open={open} onClose={onClose} title={mode === 'add' ? 'Add candidate' : 'Edit candidate'}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextField id="cand-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
          <TextField id="cand-email" label="Email" type="email" value={email} onChange={setEmail} required autoComplete="off" />
          <TextField id="cand-phone" label="Phone (optional)" value={phone} onChange={setPhone} autoComplete="off" />
          <CustomFieldsInputs definitions={definitions ?? []} values={customFields} onChange={setCustomFields} />
        </div>
        {shown && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{shown}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
          <Button type="submit" loading={submitting}>{mode === 'add' ? 'Add candidate' : 'Save changes'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
