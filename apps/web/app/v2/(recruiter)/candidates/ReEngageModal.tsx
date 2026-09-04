'use client';

// Re-engage a talent-pool candidate: reuses the existing add-candidate-to-job flow (useAddEntry,
// the same mutation AddCandidateModal's "existing candidate" tab uses from a job's own page) with
// the roles swapped -- candidate is fixed, the recruiter picks a job. No new API: POST
// /jobs/:jobId/entries creates a PipelineEntry, which recomputes the candidate's globalStage to
// `engaged` server-side, so the caller just needs to refetch the candidates list on success.
import { useState } from 'react';
import { Dialog, Combobox, Button, FormAlert, dt } from '../../../../components/ui-v2';
import { useAddEntry, useJobs } from '../../../../lib/hooks/usePipeline';
import type { Candidate } from '../../../../lib/types';

export function ReEngageModal({
  candidate, open, onClose, onSuccess,
}: { candidate: Candidate | null; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { data: jobs } = useJobs('open');
  const [jobId, setJobId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addEntry = useAddEntry(jobId);
  const jobOptions = (jobs ?? []).map((j) => ({ value: j.id, label: j.title }));

  function handleClose() {
    setJobId('');
    setError(null);
    onClose();
  }

  function handleSubmit() {
    if (!candidate || !jobId) return;
    setError(null);
    addEntry.mutate(
      { candidateId: candidate.id },
      {
        onSuccess: () => { onSuccess(); handleClose(); },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to re-engage candidate.'),
      },
    );
  }

  if (!open || !candidate) return null;

  return (
    <Dialog open={open} onClose={handleClose} title="Re-engage candidate" width={420}>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px' }}>
        Add <strong style={{ color: 'var(--ink)' }}>{candidate.name}</strong> to a job&apos;s pipeline.
      </p>
      <label className="v2-label">Job</label>
      <Combobox options={jobOptions} value={jobId} onChange={setJobId} placeholder="Choose an open job…" width="100%" />
      {error && <div style={{ marginTop: 14 }}><FormAlert>{error}</FormAlert></div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={handleClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
        <Button onClick={handleSubmit} loading={addEntry.isPending} disabled={!jobId}>Add to job</Button>
      </div>
    </Dialog>
  );
}
