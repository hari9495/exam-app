'use client';

import { useState } from 'react';
import { Button, useToast } from '../ui';
import { useUpdateJob } from '../../lib/hooks/usePipeline';
import { JobDetail, RubricDimension } from '../../lib/types';

// job.fitRubric is a JSON string (nullable) from the API -- an empty/missing/malformed
// value all mean "no rubric configured yet", same as ExamDetailsForm's disabledSignals parse.
function parseRubric(json?: string | null): RubricDimension[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((d): d is RubricDimension => Boolean(d) && typeof d.label === 'string' && typeof d.weight === 'number')
      : [];
  } catch {
    return [];
  }
}

// Recruiter-facing "what does this job look like to the AI fit scorer" editor: free-text
// criteria plus an optional weighted rubric, both saved together via the same useUpdateJob
// PATCH the rest of the job page already uses. Extracted out of the job page (rather than
// inlined) so that page stays a thin layout and this can carry its own Save button + state.
export function FitCriteriaEditor({ job, jobId }: { job: JobDetail; jobId: string }) {
  const updateJob = useUpdateJob(jobId);
  const { toast } = useToast();
  const [fitCriteria, setFitCriteria] = useState(job.fitCriteria ?? '');
  const [rubric, setRubric] = useState<RubricDimension[]>(() => parseRubric(job.fitRubric));

  const weightTotal = rubric.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);
  // Mirrors ExamSectionsPanel's weightTotal gate: an empty rubric is a valid "no rubric" state,
  // but as soon as a dimension exists the weights must add up before Save is allowed.
  const rubricValid = rubric.length === 0 || weightTotal === 100;

  function updateRow(index: number, patch: Partial<RubricDimension>) {
    setRubric((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRubric((current) => [...current, { label: '', weight: 0 }]);
  }

  function removeRow(index: number) {
    setRubric((current) => current.filter((_, i) => i !== index));
  }

  function handleSave() {
    updateJob.mutate(
      { fitCriteria: fitCriteria.trim() || null, fitRubric: rubric },
      {
        onSuccess: () => toast('Fit criteria saved.'),
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to save fit criteria.', 'error'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="fit-criteria" className="text-sm font-medium text-recruiter-text">
          What you&apos;re looking for
        </label>
        <textarea
          id="fit-criteria"
          value={fitCriteria}
          onChange={(e) => setFitCriteria(e.target.value)}
          rows={3}
          placeholder="Describe the ideal candidate for this role…"
          className="w-full rounded border border-recruiter-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-recruiter-text">Weighted rubric (optional)</span>
        {rubric.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={row.label}
              onChange={(e) => updateRow(index, { label: e.target.value })}
              aria-label={`Rubric dimension ${index + 1} label`}
              placeholder="e.g. Communication"
              className="min-w-0 flex-1 rounded border border-recruiter-border px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={row.weight}
              onChange={(e) => updateRow(index, { weight: Number(e.target.value) })}
              aria-label={`Rubric dimension ${index + 1} weight`}
              className="w-20 rounded border border-recruiter-border px-2 py-1 text-right text-sm"
            />
            <span className="text-sm text-recruiter-text-secondary">%</span>
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="text-xs font-medium text-status-danger hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={addRow} className="self-start">
          Add dimension
        </Button>
        {rubric.length > 0 && (
          <p className={`text-sm font-medium ${weightTotal === 100 ? 'text-status-success' : 'text-status-warning'}`}>
            {weightTotal === 100
              ? `Weights total: ${weightTotal}%`
              : `Weights total: ${weightTotal}% — dimensions must sum to 100% before saving`}
          </p>
        )}
      </div>

      <Button type="button" onClick={handleSave} loading={updateJob.isPending} disabled={!rubricValid} className="self-start">
        Save fit criteria
      </Button>
    </div>
  );
}
