'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, Copy } from 'lucide-react';
import { Button, Checkbox, StatusBadge, useToast, type StatusTone } from '../../../../components/ui';
import { BackLink } from '../../../../components/BackLink';
import { PageHeader } from '../../../../components/PageChrome';
import { LinkedExams } from '../../../../components/pipeline/LinkedExams';
import { AddCandidateModal } from '../../../../components/pipeline/AddCandidateModal';
import { PipelineBoard } from '../../../../components/pipeline/PipelineBoard';
import { FitCriteriaEditor } from '../../../../components/pipeline/FitCriteriaEditor';
import { useJob, useUpdateJob } from '../../../../lib/hooks/usePipeline';
import { useAuth } from '../../../../lib/auth-context';
import { JobDetail, JobStatus } from '../../../../lib/types';

const STATUS_LABEL: Record<JobStatus, string> = { open: 'Open', closed: 'Closed' };
const STATUS_TONE: Record<JobStatus, StatusTone> = { open: 'success', closed: 'neutral' };

// Same copy-to-clipboard pattern as WalkInShareCard: navigator.clipboard.writeText, a
// toast, and a 2s "Copied" icon swap.
function PublicApplyControl({ job, jobId }: { job: JobDetail; jobId: string }) {
  const updateJob = useUpdateJob(jobId);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const applyUrl = job.applyToken && typeof window !== 'undefined' ? `${window.location.origin}/apply/${job.applyToken}` : '';

  function toggle(next: boolean) {
    updateJob.mutate(
      { publicApplyEnabled: next },
      { onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update job.', 'error') },
    );
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(applyUrl);
      setCopied(true);
      toast('Link copied.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Failed to copy link.', 'error');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Checkbox label="Public applications" checked={job.publicApplyEnabled} onChange={toggle} disabled={updateJob.isPending} />
      {job.publicApplyEnabled && applyUrl && (
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={applyUrl}
            aria-label="Public apply link"
            onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded border border-rule bg-ground px-3 py-1.5 font-mono text-xs text-ink"
          />
          <Button type="button" variant="secondary" size="sm" onClick={handleCopy} className="inline-flex items-center gap-1.5">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function JobPage() {
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
    updateJob.mutate(
      { status: nextStatus },
      {
        onSuccess: () => toast(nextStatus === 'closed' ? 'Job closed.' : 'Job reopened.'),
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update job.', 'error'),
      },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <BackLink href="/jobs" label="Back to Jobs" />
        <PageHeader
          eyebrow="PIPELINE"
          title={String(job?.title ?? 'Job')}
          subtitle={job?.description || undefined}
          actions={
            <>
              {job && <StatusBadge tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</StatusBadge>}
              {canManage && job && (
                <Button variant="secondary" size="sm" onClick={toggleStatus} loading={updateJob.isPending}>
                  {job.status === 'open' ? 'Close job' : 'Reopen job'}
                </Button>
              )}
            </>
          }
        />
      </div>

      {job && <LinkedExams jobId={jobId} linkedExams={job.linkedExams} canManage={canManage} />}
      {job && canManage && <PublicApplyControl job={job} jobId={jobId} />}
      {job && canManage && <FitCriteriaEditor job={job} jobId={jobId} />}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Pipeline</h2>
        {canManage && <Button onClick={() => setAddOpen(true)}>Add candidate</Button>}
      </div>

      <PipelineBoard jobId={jobId} />

      {canManage && <AddCandidateModal jobId={jobId} open={addOpen} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
