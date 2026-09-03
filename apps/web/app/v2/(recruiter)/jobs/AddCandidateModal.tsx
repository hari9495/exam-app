'use client';

// v2 Add-candidate modal — re-skin of components/pipeline/AddCandidateModal on the v2 Dialog +
// primitives (covers the sticky header, soft-grey panel, v2 tabs/inputs/buttons). All hooks and
// the add-entry payload are verbatim (format only).
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, Tabs, TextField, Button, FormAlert, dt } from '../../../../components/ui-v2';
import { useToast } from '../../../../components/ui';
import { useAddEntry } from '../../../../lib/hooks/usePipeline';
import { useCandidates } from '../../../../lib/hooks/useCandidates';

export function AddCandidateModal({ jobId, open, onClose }: { jobId: string; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const addEntry = useAddEntry(jobId);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [search, setSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const { data: candidates } = useCandidates({ search: search.trim() || undefined, pageSize: 10 });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode('existing');
    setSearch('');
    setSelectedCandidateId(null);
    setName('');
    setEmail('');
    setPhone('');
    setError(null);
  }
  function handleClose() {
    reset();
    onClose();
  }

  const canSubmit = mode === 'existing' ? Boolean(selectedCandidateId) : Boolean(name.trim() && email.trim());

  function handleSubmit() {
    const input =
      mode === 'existing'
        ? selectedCandidateId ? { candidateId: selectedCandidateId } : null
        : name.trim() && email.trim() ? { newCandidate: { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined } } : null;
    if (!input) return;
    setError(null);
    addEntry.mutate(input, {
      onSuccess: () => { toast('Candidate added to the pipeline.'); handleClose(); },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to add candidate.'),
    });
  }

  if (!open) return null;

  return (
    <Dialog open={open} onClose={handleClose} title="Add candidate" width={480}>
      <Tabs tabs={[{ value: 'existing', label: 'Existing candidate' }, { value: 'new', label: 'New candidate' }]} value={mode} onChange={(v) => setMode(v as 'existing' | 'new')} />

      <div style={{ marginTop: 16 }}>
        {mode === 'existing' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…" aria-label="Search candidates"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px 9px 34px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 224, overflowY: 'auto' }}>
              {(candidates?.data ?? []).map((candidate) => {
                const selected = selectedCandidateId === candidate.id;
                return (
                  <button key={candidate.id} type="button" onClick={() => setSelectedCandidateId(candidate.id)}
                    style={{ textAlign: 'left', padding: '8px 11px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${selected ? 'var(--org-primary)' : 'var(--hair)'}`,
                      background: selected ? 'color-mix(in srgb, var(--org-primary) 8%, var(--paper))' : 'var(--paper)' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{candidate.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{candidate.email}</div>
                  </button>
                );
              })}
              {(candidates?.data ?? []).length === 0 && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0' }}>No candidates found.</p>}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TextField id="add-cand-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
            <TextField id="add-cand-email" label="Email" type="email" value={email} onChange={setEmail} required autoComplete="off" />
            <TextField id="add-cand-phone" label="Phone (optional)" value={phone} onChange={setPhone} autoComplete="off" />
          </div>
        )}
      </div>

      {error && <div style={{ marginTop: 14 }}><FormAlert>{error}</FormAlert></div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={handleClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
        <Button onClick={handleSubmit} loading={addEntry.isPending} disabled={!canSubmit}>Add</Button>
      </div>
    </Dialog>
  );
}
