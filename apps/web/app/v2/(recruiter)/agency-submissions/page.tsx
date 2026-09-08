'use client';

// v2 Agency submissions queue -- recruiter review inbox for candidates external agencies
// submitted through their portal (/agency/[token]). Gated server-side by pipeline:manage; no
// client-side role gate (same as jobs/candidates -- the nav already scopes who sees the link).
// Default view is the pending queue; a status Tabs switcher (nice-to-have per the brief) lets a
// recruiter also glance at what's already been accepted/rejected.
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText } from 'lucide-react';
import {
  useAgencySubmissions, useAcceptAgencySubmission, useRejectAgencySubmission,
} from '../../../../lib/hooks/useAgencies';
import type { AgencySubmission, AgencySubmissionStatus } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, Pill, Tabs } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

const STATUS_PILL: Record<AgencySubmissionStatus, { c: string; label: string }> = {
  pending: { c: STATUS.warn, label: 'Pending' },
  accepted: { c: STATUS.ok, label: 'Accepted' },
  rejected: { c: STATUS.bad, label: 'Rejected' },
};

function RowActions({ submission, notify }: { submission: AgencySubmission; notify: (type: 'success' | 'error', text: string) => void }) {
  const accept = useAcceptAgencySubmission();
  const reject = useRejectAgencySubmission();
  const busy = accept.isPending || reject.isPending;

  function handleAccept() {
    accept.mutate(submission.id, {
      onSuccess: () => notify('success', `${submission.candidateName} moved into the pipeline.`),
      onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to accept submission.'),
    });
  }

  function handleReject() {
    reject.mutate(submission.id, {
      onSuccess: () => notify('success', `${submission.candidateName}'s submission rejected.`),
      onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to reject submission.'),
    });
  }

  if (submission.status !== 'pending') return <span style={dt.muted}>Reviewed</span>;

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" style={{ ...dt.primaryBtn, padding: '7px 12px' }} onClick={handleAccept} disabled={busy}>Accept</button>
      <button type="button" style={{ ...dt.toolBtn, padding: '7px 12px', borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={handleReject} disabled={busy}>Reject</button>
    </div>
  );
}

export default function V2AgencySubmissionsPage() {
  const [status, setStatus] = useState<AgencySubmissionStatus>('pending');
  const { data, isLoading, isError } = useAgencySubmissions(status);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };
  const rows = data ?? [];

  const columns: ColumnDef<typeof DT_FEATURES, AgencySubmission>[] = [
    {
      id: 'agency', enableSorting: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Agency</span>,
      cell: ({ row }) => <span>{row.original.agencyName}</span>,
    },
    {
      id: 'job', enableSorting: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Job</span>,
      cell: ({ row }) => <span style={dt.muted}>{row.original.jobTitle}</span>,
    },
    {
      id: 'candidate', enableSorting: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Candidate</span>,
      cell: ({ row }) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 500 }}>{row.original.candidateName}</span>
            {row.original.isDuplicate && <Pill c={STATUS.warn} label="Duplicate" />}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{row.original.candidateEmail}</div>
        </div>
      ),
    },
    {
      id: 'resume', enableSorting: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Résumé</span>,
      cell: ({ row }) => row.original.resumeUrl ? (
        <a href={row.original.resumeUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--org-primary)', fontWeight: 500, fontSize: 13 }}>
          <FileText size={14} /> View
        </a>
      ) : <span style={dt.muted}>—</span>,
    },
    {
      id: 'status', enableSorting: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Status</span>,
      cell: ({ row }) => <Pill c={STATUS_PILL[row.original.status].c} label={STATUS_PILL[row.original.status].label} />,
    },
    {
      id: 'actions', enableSorting: false, enableHiding: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Actions</span>,
      cell: ({ row }) => <RowActions submission={row.original} notify={notify} />,
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Agencies</p>
        <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>Agency Submissions</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Review candidates external recruiting agencies have submitted against their assigned jobs.</p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      <Tabs
        divider={false}
        value={status}
        onChange={(v) => setStatus(v as AgencySubmissionStatus)}
        tabs={[
          { value: 'pending', label: 'Pending' },
          { value: 'accepted', label: 'Accepted' },
          { value: 'rejected', label: 'Rejected' },
        ]}
      />

      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.id} hideToolbar
        isLoading={isLoading} isError={isError}
        errorMessage="Failed to load agency submissions."
        emptyMessage={status === 'pending' ? 'No pending submissions right now.' : `No ${status} submissions.`}
      />
    </>
  );
}
