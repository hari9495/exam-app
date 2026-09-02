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
import { AddCandidateModal } from '../../../../../components/pipeline/AddCandidateModal';
import { PipelineBoard } from '../PipelineBoard';
import { FitCriteriaEditor } from '../FitCriteriaEditor';
import { useJob, useUpdateJob } from '../../../../../lib/hooks/usePipeline';
import { useAuth } from '../../../../../lib/auth-context';
import { JobDetail, JobStatus } from '../../../../../lib/types';
import { dt, Pill } from '../../../../../components/ui-v2';
import { STATUS } from '../../../../../components/ui-v2/viz';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };
const STATUS_TONE: Record<JobStatus, { c: string; label: string }> = { open: { c: STATUS.ok, label: 'Open' }, closed: { c: 'var(--muted)', label: 'Closed' } };

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
  const applyUrl = job.applyToken && typeof window !== 'undefined' ? `${window.location.origin}/apply/${job.applyToken}` : '';

  function toggle(next: boolean) {
    updateJob.mutate({ publicApplyEnabled: next }, { onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update job.', 'error') });
  }
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(applyUrl);
      setCopied(true); toast('Link copied.'); setTimeout(() => setCopied(false), 2000);
    } catch { toast('Failed to copy link.', 'error'); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
        <input type="checkbox" checked={job.publicApplyEnabled} disabled={updateJob.isPending} onChange={(e) => toggle(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }} />
        Enable public applications
      </label>
      {job.publicApplyEnabled && applyUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 560 }}>
          <input readOnly value={applyUrl} aria-label="Public apply link" onFocus={(e) => e.target.select()}
            className="v2-mono" style={{ minWidth: 0, flex: 1, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', padding: '7px 11px', fontSize: 12, color: 'var(--ink)' }} />
          <button type="button" onClick={handleCopy} style={{ ...dt.toolBtn, whiteSpace: 'nowrap' }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy link'}</button>
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
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Link href="/v2/jobs" style={backLink}><ArrowLeft size={15} /> Back to Jobs</Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>{job?.title ?? 'Job'}</h1>
            {job && <Pill c={STATUS_TONE[job.status].c} label={STATUS_TONE[job.status].label} />}
          </div>
          {canManage && job && (
            <button type="button" onClick={toggleStatus} disabled={updateJob.isPending} style={dt.toolBtn}>{job.status === 'open' ? 'Close job' : 'Reopen job'}</button>
          )}
        </div>
        {job?.description && <p style={{ marginTop: 6, fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>{job.description}</p>}
      </div>

      {job && (
        <div className="wf-editor" style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '0 28px' }}>
          <JobSection first title="Linked exams" description="Attach the exams candidates take for this role.">
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
        {canManage && <button type="button" onClick={() => setAddOpen(true)} style={dt.primaryBtn}>Add candidate</button>}
      </div>

      <PipelineBoard jobId={jobId} />

      {canManage && <AddCandidateModal jobId={jobId} open={addOpen} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
