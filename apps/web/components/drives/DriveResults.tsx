'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button, Card, StatusBadge, Table, type Column, type StatusTone } from '../ui';
import { useDriveResults } from '../../lib/hooks/useDrives';
import { DriveRosterRow, DriveRosterState } from '../../lib/types';

// The one relabel rule (design brief rule 4): a "registered" row on an ENDED drive means the
// candidate never started, so it reads as a no-show here. DriveLiveBoard does not do this --
// on a still-open drive, "registered" may just mean "hasn't started yet."
const STATE_LABEL: Record<DriveRosterState, string> = {
  registered: 'Did not attempt',
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

// GET /drives/:id/results returns the full roster as JSON, not a file stream -- there's no
// export endpoint on the backend to hit (unlike /exams/:id/results/export, which apiFetchBlob
// is built for). So the CSV is built client-side from the rows already on screen.
function toCsv(rows: DriveRosterRow[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ['Candidate', 'Exam', 'State', 'Time', 'Score'].map(escape).join(',');
  const lines = rows.map((row) =>
    [
      row.candidateName,
      row.examTitle,
      STATE_LABEL[row.state],
      row.startedAt ? new Date(row.startedAt).toLocaleString() : '',
      row.score !== null ? String(row.score) : '',
    ]
      .map((value) => escape(String(value)))
      .join(','),
  );
  return [header, ...lines].join('\n');
}

export function DriveResults({ driveId }: { driveId: string }) {
  const { data, isLoading, isError } = useDriveResults(driveId);
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (row) => !query || row.candidateName.toLowerCase().includes(query) || row.examTitle.toLowerCase().includes(query),
    );
  }, [data, search]);

  function handleExport() {
    if (!data || data.rows.length === 0) return;
    const blob = new Blob([toCsv(data.rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `drive-${driveId}-results.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load results.
        </p>
      </Card>
    );
  }

  const columns: Column<DriveRosterRow>[] = [
    {
      key: 'candidate',
      header: 'Candidate',
      sortValue: (row) => row.candidateName.toLowerCase(),
      render: (row) =>
        // candidateId/examId come from the roster; the guard just falls back to plain text for
        // any row that predates them (e.g. an unattached historical walk-in).
        row.candidateId && row.examId ? (
          <Link
            href={`/reports/${row.examId}/candidates/${row.candidateId}?attemptId=${row.attemptId ?? ''}`}
            className="font-medium text-primary hover:underline"
          >
            {row.candidateName}
          </Link>
        ) : (
          <span className="font-medium text-recruiter-text">{row.candidateName}</span>
        ),
    },
    { key: 'exam', header: 'Exam', sortValue: (row) => row.examTitle.toLowerCase(), render: (row) => row.examTitle },
    {
      key: 'state',
      header: 'State',
      sortValue: (row) => row.state,
      render: (row) => <StatusBadge tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</StatusBadge>,
    },
    {
      key: 'time',
      header: 'Time',
      sortValue: (row) => row.startedAt ?? '',
      render: (row) => (row.startedAt ? new Date(row.startedAt).toLocaleString() : '—'),
    },
    {
      key: 'score',
      header: 'Score',
      sortValue: (row) => row.score ?? -1,
      render: (row) => (row.score !== null ? `${row.score}%` : '—'),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-recruiter-text-tertiary" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search candidates…"
            aria-label="Search candidates"
            className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
        <Button variant="secondary" onClick={handleExport} disabled={data.rows.length === 0}>
          Export CSV
        </Button>
      </div>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(row) => row.invitationId}
        emptyMessage={search ? 'No candidates match your search.' : 'No candidates registered for this drive.'}
      />
    </div>
  );
}
