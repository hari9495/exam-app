'use client';

import Link from 'next/link';
import { Card, StatusBadge, type StatusTone } from '../ui';
import { useDriveLive } from '../../lib/hooks/useDrives';
import { DriveRosterRow, DriveRosterState } from '../../lib/types';

const STATES: DriveRosterState[] = ['registered', 'in_progress', 'submitted', 'passed', 'failed'];

const STATE_LABEL: Record<DriveRosterState, string> = {
  registered: 'Registered',
  in_progress: 'In progress',
  submitted: 'Submitted',
  passed: 'Passed',
  failed: 'Failed',
};

const STATE_TONE: Record<DriveRosterState, StatusTone> = {
  registered: 'neutral',
  in_progress: 'info',
  submitted: 'warning',
  passed: 'success',
  failed: 'danger',
};

function CandidateChip({ row }: { row: DriveRosterRow }) {
  const chip = (
    <span className="inline-flex items-center rounded-full border border-rule bg-white px-3 py-1 text-xs font-medium text-ink">
      {row.candidateName}
    </span>
  );
  // The roster carries candidateId/examId, so the report link resolves. The guard below just
  // falls back to the plain chip for any row missing them (e.g. an unattached historical walk-in).
  if (!row.candidateId || !row.examId) return chip;
  return (
    <Link
      href={`/reports/${row.examId}/candidates/${row.candidateId}?attemptId=${row.attemptId ?? ''}`}
      className="inline-flex items-center rounded-full border border-rule bg-white px-3 py-1 text-xs font-medium text-primary hover:bg-ground hover:underline"
    >
      {row.candidateName}
    </Link>
  );
}

export function DriveLiveBoard({ driveId }: { driveId: string }) {
  const { data, isLoading, isError } = useDriveLive(driveId);

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm text-muted">Loading&hellip;</p>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load the live board.
        </p>
      </Card>
    );
  }

  const counts = data.counts;
  const groups = STATES.map((state) => ({ state, rows: data.rows.filter((row) => row.state === state) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="flex flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Registered</p>
          <p className="font-display text-2xl font-bold text-ink">{counts.registered}</p>
        </Card>
        <Card className="flex flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">In progress</p>
          <p className="font-display text-2xl font-bold text-ink">{counts.inProgress}</p>
        </Card>
        <Card className="flex flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Submitted</p>
          <p className="font-display text-2xl font-bold text-ink">{counts.submitted}</p>
        </Card>
        <Card className="flex flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Passed</p>
          <p className="font-display text-2xl font-bold text-ink">{counts.passed}</p>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <Card key={group.state}>
            <div className="mb-2 flex items-center gap-2">
              <StatusBadge tone={STATE_TONE[group.state]}>{STATE_LABEL[group.state]}</StatusBadge>
              <span className="text-xs text-muted">{group.rows.length}</span>
            </div>
            {group.rows.length === 0 ? (
              <p className="text-xs text-muted">None yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.rows.map((row) => (
                  <CandidateChip key={row.invitationId} row={row} />
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
