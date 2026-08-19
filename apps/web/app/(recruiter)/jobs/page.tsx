'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, Input, Select, Table, StatusBadge, TableSkeleton, useToast, type Column, type StatusTone } from '../../../components/ui';
import { PageHeader, PageSurface } from '../../../components/PageChrome';
import { useJobs, useCreateJob, useDeleteJob } from '../../../lib/hooks/usePipeline';
import { JobListItem, JobStatus, PIPELINE_STAGES } from '../../../lib/types';

const STATUS_LABEL: Record<JobStatus, string> = { open: 'Open', closed: 'Closed' };
const STATUS_TONE: Record<JobStatus, StatusTone> = { open: 'success', closed: 'neutral' };

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

// e.g. "4 applied · 2 interview · 1 offer" -- stages with zero candidates are dropped so the
// summary stays short instead of listing every stage every time.
function stageSummary(stageCounts: JobListItem['stageCounts']): string {
  const parts = PIPELINE_STAGES.map((stage) => ({ stage, count: stageCounts[stage] })).filter((entry) => entry.count > 0);
  if (parts.length === 0) return 'No candidates yet';
  return parts.map((entry) => `${entry.count} ${entry.stage}`).join(' · ');
}

export default function JobsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: jobs, isLoading } = useJobs(statusFilter === 'all' ? undefined : (statusFilter as JobStatus));
  const createJob = useCreateJob();
  const deleteJob = useDeleteJob();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const canSubmit = Boolean(title.trim());

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    createJob.mutate(
      { title: title.trim(), description: description.trim() || undefined },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          toast('Job created.');
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to create job.', 'error'),
      },
    );
  }

  function handleDelete(job: JobListItem) {
    if (!confirm(`Delete job "${job.title}"?`)) return;
    deleteJob.mutate(job.id, {
      onSuccess: () => toast('Job deleted.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to delete job.', 'error'),
    });
  }

  const columns: Column<JobListItem>[] = useMemo(
    () => [
      {
        key: 'title',
        header: 'Job',
        sortValue: (job) => job.title,
        render: (job) => (
          <Link href={`/jobs/${job.id}`} className="font-medium text-primary hover:underline">
            {job.title}
          </Link>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (job) => <StatusBadge tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</StatusBadge>,
      },
      {
        key: 'pipeline',
        header: 'Pipeline',
        render: (job) => <span className="text-muted">{stageSummary(job.stageCounts)}</span>,
      },
      {
        key: 'createdAt',
        header: 'Created',
        sortValue: (job) => job.createdAt,
        render: (job) => new Date(job.createdAt).toLocaleDateString(),
      },
      {
        key: 'actions',
        header: '',
        render: (job) => (
          <button
            type="button"
            onClick={() => handleDelete(job)}
            className="text-muted hover:text-red-600"
            aria-label={`Delete ${job.title}`}
          >
            <Trash2 size={16} />
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        eyebrow="PIPELINE"
        title="Jobs"
        subtitle="Open a job to track candidates through applied, screened, interview, offer, and hired."
      />

      <Card>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Job Title" value={title} onChange={setTitle} placeholder="e.g. Backend Engineer" required />
            <Input label="Description (optional)" value={description} onChange={setDescription} placeholder="Role summary" />
          </div>
          <div>
            <Button type="submit" loading={createJob.isPending} disabled={!canSubmit} className="inline-flex items-center gap-1.5">
              <Plus size={14} />
              Create job
            </Button>
          </div>
        </form>
      </Card>

      <PageSurface>
        <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
          <Select label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />
        </div>
        {isLoading ? (
          <TableSkeleton />
        ) : (
          <Table columns={columns} rows={jobs ?? []} rowKey={(job) => job.id} emptyMessage="No jobs yet." />
        )}
      </PageSurface>
    </div>
  );
}
