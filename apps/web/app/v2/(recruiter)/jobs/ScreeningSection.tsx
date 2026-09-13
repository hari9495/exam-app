'use client';

// AI résumé screening: rank a job's applicants by candidate–job fit. Reuses the existing fit
// scoring (scoreJob fans out per applicant); this is the ranked, batch-oriented review view.
// Inert until résumés are parsed + an AI key is configured (scoring then reports skipped/failed rows).
import { Sparkles } from 'lucide-react';
import { useToast } from '../../../../components/ui';
import { dt } from '../../../../components/ui-v2';
import { useScoreJob, useJobFitScreening } from '../../../../lib/hooks/usePipeline';

const muted = 'var(--muted)';
const scoreColor = (s: number) => (s >= 75 ? '#15803d' : s >= 50 ? 'var(--org-primary)' : 'var(--danger)');
const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued…', processing: 'Scoring…', skipped_no_resume: 'No résumé', failed: 'Failed',
};

export function ScreeningSection({ jobId }: { jobId: string }) {
  const score = useScoreJob(jobId);
  const { data: rows, isLoading, isError, refetch } = useJobFitScreening(jobId, true);
  const { toast } = useToast();

  function handleScore() {
    score.mutate(undefined, {
      onSuccess: (r) => { toast(`Scoring ${r.queued} applicant${r.queued === 1 ? '' : 's'}${r.skipped ? `, ${r.skipped} skipped (no résumé)` : ''}.`); refetch(); },
      onError: (err) => toast(err instanceof Error ? err.message : 'Failed to start scoring.', 'error'),
    });
  }

  const scored = (rows ?? []).filter((r) => r.status === 'done' && r.overallScore !== null);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: muted, margin: 0 }}>
          {scored.length > 0 ? `${scored.length} applicant${scored.length === 1 ? '' : 's'} ranked by fit.` : 'Rank every applicant against this job by fit.'}
        </p>
        <button type="button" onClick={handleScore} disabled={score.isPending} className="v2-hoverbtn" style={{ ...dt.primaryBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} /> {score.isPending ? 'Starting…' : 'Score all applicants'}
        </button>
      </div>

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load screening.</p>}
      {rows && rows.length === 0 && <p style={{ fontSize: 13, color: muted }}>No applicants scored yet — click “Score all applicants”. Candidates need a parsed résumé + a configured AI key.</p>}

      {rows && rows.length > 0 && (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r, i) => {
            const done = r.status === 'done' && r.overallScore !== null;
            return (
              <li key={r.entryId} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--hair)', background: 'var(--paper)' }}>
                <span className="v2-mono" style={{ width: 22, textAlign: 'right', color: muted, fontSize: 13, flexShrink: 0 }}>{done ? i + 1 : '—'}</span>
                <span style={{ width: 46, flexShrink: 0 }}>
                  {done
                    ? <span className="v2-mono" style={{ fontSize: 15, fontWeight: 600, color: scoreColor(r.overallScore as number) }}>{r.overallScore}</span>
                    : <span style={{ fontSize: 11.5, color: muted }}>{STATUS_LABEL[r.status] ?? r.status}</span>}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{r.candidateName}{r.stale ? <span style={{ fontSize: 11, color: muted, fontWeight: 400 }}> · stale</span> : null}</span>
                  {r.summary && <span style={{ display: 'block', fontSize: 12.5, color: muted, marginTop: 2 }}>{r.summary}</span>}
                  {r.strengths.length > 0 && <span style={{ display: 'block', fontSize: 12, color: '#15803d', marginTop: 2 }}>+ {r.strengths.slice(0, 3).join(' · ')}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
