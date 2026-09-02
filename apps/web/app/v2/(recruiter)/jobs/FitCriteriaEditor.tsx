'use client';

// v2 FitCriteriaEditor — free-text fit criteria + optional weighted rubric. Re-skin on v2 primitives;
// parse/save/validation logic verbatim.
import { useState } from 'react';
import { useUpdateJob } from '../../../../lib/hooks/usePipeline';
import { JobDetail, RubricDimension } from '../../../../lib/types';
import { useToast } from '../../../../components/ui';
import { dt } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' };

// job.fitRubric is a nullable JSON string — empty/missing/malformed all mean "no rubric yet".
function parseRubric(json?: string | null): RubricDimension[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((d): d is RubricDimension => Boolean(d) && typeof d.label === 'string' && typeof d.weight === 'number') : [];
  } catch {
    return [];
  }
}

export function FitCriteriaEditor({ job, jobId }: { job: JobDetail; jobId: string }) {
  const updateJob = useUpdateJob(jobId);
  const { toast } = useToast();
  const [fitCriteria, setFitCriteria] = useState(job.fitCriteria ?? '');
  const [rubric, setRubric] = useState<RubricDimension[]>(() => parseRubric(job.fitRubric));

  const weightTotal = rubric.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);
  const rubricValid = rubric.length === 0 || weightTotal === 100;

  const updateRow = (index: number, patch: Partial<RubricDimension>) => setRubric((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const addRow = () => setRubric((current) => [...current, { label: '', weight: 0 }]);
  const removeRow = (index: number) => setRubric((current) => current.filter((_, i) => i !== index));

  function handleSave() {
    updateJob.mutate({ fitCriteria: fitCriteria.trim() || null, fitRubric: rubric }, {
      onSuccess: () => toast('Fit criteria saved.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to save fit criteria.', 'error'),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
      <div>
        <label htmlFor="fit-criteria" className="v2-label">What you&apos;re looking for</label>
        <textarea id="fit-criteria" value={fitCriteria} onChange={(e) => setFitCriteria(e.target.value)} rows={3} placeholder="Describe the ideal candidate for this role…" style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="v2-label" style={{ marginBottom: 0 }}>Weighted rubric (optional)</span>
        {rubric.map((row, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="text" value={row.label} onChange={(e) => updateRow(index, { label: e.target.value })} aria-label={`Rubric dimension ${index + 1} label`} placeholder="e.g. Communication" style={{ ...input, flex: 1, minWidth: 0 }} />
            <input type="number" value={row.weight} onChange={(e) => updateRow(index, { weight: Number(e.target.value) })} aria-label={`Rubric dimension ${index + 1} weight`} style={{ ...input, width: 80, textAlign: 'right' }} />
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>%</span>
            <button type="button" onClick={() => removeRow(index)} style={{ background: 'none', border: 'none', fontSize: 12.5, fontWeight: 500, color: 'var(--danger)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={addRow} style={{ ...dt.toolBtn, alignSelf: 'flex-start' }}>Add dimension</button>
        {rubric.length > 0 && (
          <p style={{ fontSize: 13, fontWeight: 500, color: weightTotal === 100 ? STATUS.ok : '#a16207', margin: 0 }}>
            {weightTotal === 100 ? `Weights total: ${weightTotal}%` : `Weights total: ${weightTotal}% — dimensions must sum to 100% before saving`}
          </p>
        )}
      </div>

      <div>
        <button type="button" onClick={handleSave} disabled={updateJob.isPending || !rubricValid} style={{ ...dt.primaryBtn, opacity: updateJob.isPending || !rubricValid ? 0.5 : 1, cursor: updateJob.isPending || !rubricValid ? 'not-allowed' : 'pointer' }}>{updateJob.isPending ? 'Saving…' : 'Save fit criteria'}</button>
      </div>
    </div>
  );
}
