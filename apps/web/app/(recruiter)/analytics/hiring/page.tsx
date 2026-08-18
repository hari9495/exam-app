'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Select, Table, StatusBadge, type Column, type StatusTone } from '../../../../components/ui';
import { FunnelChart } from '../../../../components/charts/FunnelChart';
import { useHiringAnalytics } from '../../../../lib/hooks/useHiringAnalytics';
import { useJobs } from '../../../../lib/hooks/usePipeline';
import { HiringJobRow, HiringSourceRow, JobStatus, STAGE_LABEL } from '../../../../lib/types';

const WINDOW_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const STATUS_LABEL: Record<JobStatus, string> = { open: 'Open', closed: 'Closed' };
const STATUS_TONE: Record<JobStatus, StatusTone> = { open: 'success', closed: 'neutral' };
const SOURCE_LABEL: Record<string, string> = { manual: 'Manual', exam: 'Exam', application: 'Application', drive: 'Drive' };

// The backend's status is a plain string (falls back to 'unknown' when a cohort entry's job
// has no meta) -- these degrade any value outside JobStatus to a neutral tone / humanized
// label instead of an undefined (blank) badge.
function statusTone(status: string): StatusTone {
  return status in STATUS_TONE ? STATUS_TONE[status as JobStatus] : 'neutral';
}
function statusLabel(status: string): string {
  return status in STATUS_LABEL ? STATUS_LABEL[status as JobStatus] : status.charAt(0).toUpperCase() + status.slice(1);
}

function fmtDays(value: number | null) {
  return value === null ? '—' : value.toFixed(1);
}

export default function HiringAnalyticsPage() {
  const [windowDays, setWindowDays] = useState('90');
  const [jobId, setJobId] = useState('all');

  // ponytail: recomputed on every render, not memoized on a stable "now" -- the couple of
  // seconds of drift between renders never crosses a day boundary in practice.
  const { from, to } = useMemo(() => {
    const now = Date.now();
    const days = Number(windowDays);
    return { from: new Date(now - days * 86_400_000).toISOString(), to: new Date(now).toISOString() };
  }, [windowDays]);

  const { data: jobs } = useJobs();
  const { data, isLoading } = useHiringAnalytics({ from, to, jobId: jobId === 'all' ? undefined : jobId });

  const jobOptions = [{ value: 'all', label: 'All jobs' }, ...(jobs ?? []).map((job) => ({ value: job.id, label: job.title }))];

  const jobColumns: Column<HiringJobRow>[] = [
    {
      key: 'title',
      header: 'Job',
      render: (row) => (
        <Link href={`/jobs/${row.jobId}`} className="font-medium text-primary hover:underline">
          {row.title}
        </Link>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge> },
    { key: 'entered', header: 'Entered', render: (row) => row.entered },
    { key: 'hired', header: 'Hired', render: (row) => row.hired },
    { key: 'conversion', header: 'Conversion', render: (row) => `${Math.round(row.conversionPct)}%` },
    { key: 'avgTimeToHire', header: 'Avg Time to Hire', render: (row) => fmtDays(row.avgTimeToHireDays) },
  ];

  const sourceColumns: Column<HiringSourceRow>[] = [
    { key: 'source', header: 'Source', render: (row) => SOURCE_LABEL[row.source] ?? row.source },
    { key: 'entered', header: 'Entered', render: (row) => row.entered },
    { key: 'hired', header: 'Hired', render: (row) => row.hired },
    { key: 'hireRate', header: 'Hire Rate', render: (row) => `${Math.round(row.hireRate * 100)}%` },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-recruiter-text">Hiring Analytics</h1>
        <p className="mt-1 text-sm text-recruiter-text-secondary">Funnel, time-to-hire, and source performance across your pipeline.</p>
      </div>

      <div className="flex items-center gap-3">
        <Select label="Window" value={windowDays} onChange={setWindowDays} options={WINDOW_OPTIONS} />
        <Select label="Job" value={jobId} onChange={setJobId} options={jobOptions} />
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>
      ) : (
        <>
          <Card>
            <h2 className="mb-3 text-sm font-bold text-recruiter-text">Funnel</h2>
            <FunnelChart stages={data.funnel.map((row) => ({ label: STAGE_LABEL[row.stage], value: row.reached }))} />
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <Card>
              <p className="text-xs text-recruiter-text-tertiary">Avg time to hire</p>
              <p className="text-2xl font-bold text-recruiter-text">
                {fmtDays(data.timeToHire.avgDays)}
                {data.timeToHire.avgDays !== null && <span className="ml-1 text-sm font-normal text-recruiter-text-tertiary">days</span>}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-recruiter-text-tertiary">Median time to hire</p>
              <p className="text-2xl font-bold text-recruiter-text">
                {fmtDays(data.timeToHire.medianDays)}
                {data.timeToHire.medianDays !== null && <span className="ml-1 text-sm font-normal text-recruiter-text-tertiary">days</span>}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-recruiter-text-tertiary">Hired</p>
              <p className="text-2xl font-bold text-recruiter-text">{data.timeToHire.hiredCount}</p>
            </Card>
          </div>

          <Card>
            <h2 className="mb-3 text-sm font-bold text-recruiter-text">Sources</h2>
            <Table columns={sourceColumns} rows={data.sources} rowKey={(row) => row.source} emptyMessage="No applications in this window." />
          </Card>

          {jobId === 'all' && (
            <Card>
              <h2 className="mb-3 text-sm font-bold text-recruiter-text">Jobs</h2>
              <Table columns={jobColumns} rows={data.jobs} rowKey={(row) => row.jobId} emptyMessage="No jobs in this window." />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
