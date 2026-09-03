'use client';

// v2 Job detail — v2 shell (back link, header, status, close/reopen, public-apply) around the reused
// pipeline components (LinkedExams, FitCriteriaEditor, PipelineBoard, AddCandidateModal). Logic and
// hooks are verbatim (format only); the pipeline board itself is reused as-is for now.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { useToast } from '../../../../../components/ui';
import { LinkedExams } from '../LinkedExams';
import { AddCandidateModal } from '../AddCandidateModal';
import { PipelineBoard } from '../PipelineBoard';
import { FitCriteriaEditor } from '../FitCriteriaEditor';
import { RequisitionSection } from '../RequisitionSection';
import { useJob, useUpdateJob } from '../../../../../lib/hooks/usePipeline';
import { useAuth } from '../../../../../lib/auth-context';
import { JobDetail, JobStatus } from '../../../../../lib/types';
import { dt, Pill, FormAlert } from '../../../../../components/ui-v2';
import { STATUS } from '../../../../../components/ui-v2/viz';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };
const STATUS_TONE: Record<JobStatus, { c: string; label: string }> = {
  draft: { c: 'var(--muted)', label: 'Draft' },
  pending_approval: { c: STATUS.warn, label: 'Pending approval' },
  open: { c: STATUS.ok, label: 'Open' },
  closed: { c: 'var(--muted)', label: 'Closed' },
};
// Requires an open (approved) requisition -- matches the API's draft/pending_approval gate on
// add-entry and enabling public-apply (pipeline.service.ts). Closed jobs are left alone: the API
// doesn't gate them either, and disabling would regress today's (pre-gate) closed-job behavior.
const goLiveGated = (status: JobStatus) => status === 'draft' || status === 'pending_approval';
const GO_LIVE_HINT = 'Requires approval to go live';

// Side-label section, same pattern as the exam form's <Section>: title + description on the left,
// the reused control on the right. `first` drops the top divider.
function JobSection({ title, description, first, children }: { title: string; description: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div className="wf-section" style={{ borderTop: first ? 'none' : '1px solid var(--hair)' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{description}</div>
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

// Copy-to-clipboard pattern shared with WalkInShareCard: writeText, toast, 2s "Copied" swap.
function PublicApplyControl({ job, jobId }: { job: JobDetail; jobId: string }) {
  const updateJob = useUpdateJob(jobId);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applyUrl = job.applyToken && typeof window !== 'undefined' ? `${window.location.origin}/apply/${job.applyToken}` : '';
  const gated = goLiveGated(job.status);

  function toggle(next: boolean) {
    setError(null);
    updateJob.mutate({ publicApplyEnabled: next }, { onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update job.') });
  }
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(applyUrl);
      setCopied(true); toast('Link copied.'); setTimeout(() => setCopied(false), 2000);
    } catch { toast('Failed to copy link.', 'error'); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: gated ? 'var(--muted)' : 'var(--ink)', cursor: gated ? 'not-allowed' : 'pointer' }}>
        <input type="checkbox" checked={job.publicApplyEnabled} disabled={updateJob.isPending || gated} onChange={(e) => toggle(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }} />
        Enable public applications
      </label>
      {gated && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{GO_LIVE_HINT}</p>}
      {error && <FormAlert>{error}</FormAlert>}
      {job.publicApplyEnabled && applyUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 560 }}>
          <input readOnly value={applyUrl} aria-label="Public apply link" onFocus={(e) => e.target.select()}
            className="v2-mono" style={{ minWidth: 0, flex: 1, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', padding: '7px 11px', fontSize: 12, color: 'var(--ink)' }} />
          <button type="button" onClick={handleCopy} className="v2-hoverbtn" style={{ ...dt.toolBtn, whiteSpace: 'nowrap' }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy link'}</button>
        </div>
      )}
    </div>
  );
}

export default function V2JobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { role } = useAuth();
  const canManage = role !== 'panel';
  const { toast } = useToast();
  const { data: job } = useJob(jobId);
  const updateJob = useUpdateJob(jobId);
  const [addOpen, setAddOpen] = useState(false);

  function toggleStatus() {
    if (!job) return;
    const nextStatus: JobStatus = job.status === 'open' ? 'closed' : 'open';
    updateJob.mutate({ status: nextStatus }, {
      onSuccess: () => toast(nextStatus === 'closed' ? 'Job closed.' : 'Job reopened.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update job.', 'error'),
    });
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Link href="/v2/jobs" style={backLink}><ArrowLeft size={15} /> Back to Jobs</Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>{job?.title ?? 'Job'}</h1>
            {job && <Pill c={STATUS_TONE[job.status].c} label={STATUS_TONE[job.status].label} />}
          </div>
          {canManage && job && (job.status === 'open' || job.status === 'closed') && (
            <button type="button" onClick={toggleStatus} disabled={updateJob.isPending} className="v2-hoverbtn" style={dt.toolBtn}>{job.status === 'open' ? 'Close job' : 'Reopen job'}</button>
          )}
        </div>
        {job?.description && <p style={{ marginTop: 6, fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>{job.description}</p>}
      </div>

      {job && (
        <div className="wf-editor" style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '0 28px' }}>
          {canManage && (
            <JobSection first title="Requisition" description="Role details, and the approval status for opening this requisition.">
              <RequisitionSection job={job} jobId={jobId} />
            </JobSection>
          )}
          <JobSection first={!canManage} title="Linked exams" description="Attach the exams candidates take for this role.">
            <LinkedExams jobId={jobId} linkedExams={job.linkedExams} canManage={canManage} />
          </JobSection>
          {canManage && (
            <JobSection title="Public applications" description="Share a public link so anyone can apply to this role.">
              <PublicApplyControl job={job} jobId={jobId} />
            </JobSection>
          )}
          {canManage && (
            <JobSection title="Fit criteria" description="Describe the ideal candidate and set an optional weighted scoring rubric.">
              <FitCriteriaEditor job={job} jobId={jobId} />
            </JobSection>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
        <h2 className="v2-title" style={{ fontSize: 16, margin: 0 }}>Pipeline</h2>
        {canManage && job && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <button type="button" onClick={() => setAddOpen(true)} disabled={goLiveGated(job.status)} className="v2-hoverbtn" style={{ ...dt.primaryBtn, opacity: goLiveGated(job.status) ? 0.5 : 1, cursor: goLiveGated(job.status) ? 'not-allowed' : 'pointer' }}>Add candidate</button>
            {goLiveGated(job.status) && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{GO_LIVE_HINT}</span>}
          </div>
        )}
      </div>

      <PipelineBoard jobId={jobId} />

      {canManage && <AddCandidateModal jobId={jobId} open={addOpen} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
