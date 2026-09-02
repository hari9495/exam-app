'use client';

// Shared Add/Edit candidate form, on the ui-v2 Dialog + TextField primitives. Presentational: the
// page owns the create/update mutations and passes onSubmit + submitting + error.
import { useEffect, useState } from 'react';
import { Dialog, TextField, Button, dt } from '../../../../components/ui-v2';

export interface CandidateFormValues { name: string; email: string; phone?: string }

export function CandidateFormDialog({
  open, mode, initial, submitting, error, onClose, onSubmit,
}: {
  open: boolean;
  mode: 'add' | 'edit';
  initial?: { name: string; email: string; phone: string | null };
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: CandidateFormValues) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Re-seed the fields whenever the dialog opens (or the target candidate changes).
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setEmail(initial?.email ?? '');
    setPhone(initial?.phone ?? '');
    setLocalError(null);
  }, [open, initial]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const em = email.trim();
    if (!n) { setLocalError('Name is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setLocalError('Enter a valid email address.'); return; }
    setLocalError(null);
    onSubmit({ name: n, email: em, phone: phone.trim() || undefined });
  }

  const shown = localError ?? error;

  return (
    <Dialog open={open} onClose={onClose} title={mode === 'add' ? 'Add candidate' : 'Edit candidate'}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextField id="cand-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
          <TextField id="cand-email" label="Email" type="email" value={email} onChange={setEmail} required autoComplete="off" />
          <TextField id="cand-phone" label="Phone (optional)" value={phone} onChange={setPhone} autoComplete="off" />
        </div>
        {shown && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{shown}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={dt.toolBtn}>Cancel</button>
          <Button type="submit" loading={submitting}>{mode === 'add' ? 'Add candidate' : 'Save changes'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
