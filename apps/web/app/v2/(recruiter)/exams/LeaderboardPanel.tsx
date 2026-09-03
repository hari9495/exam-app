'use client';

// v2 LeaderboardPanel — re-skin on the shared DataTable. Logic (formatting, result tone, socket-fed
// prop) preserved verbatim from components/LeaderboardPanel.tsx. Format only.
import type { ColumnDef } from '@tanstack/react-table';
import { RecruiterLeaderboardRow } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

const UNFINISHED_STATUSES = new Set(['in_progress', 'paused', 'blocked']);

// mm:ss under an hour, h:mm:ss at or past it — a coding round can run long enough that a bare
// mm:ss would silently roll over and read as a much shorter time.
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

function resultCell(row: RecruiterLeaderboardRow): { label: string; c: string } {
  if (UNFINISHED_STATUSES.has(row.status)) return { label: 'In progress', c: 'var(--muted)' };
  if (row.passFail === 'pass') return { label: 'Pass', c: STATUS.ok };
  if (row.passFail === 'fail') return { label: 'Fail', c: STATUS.bad };
  // Finished but passFail is null: a code question is still awaiting manual grading.
  return { label: 'Pending grade', c: STATUS.warn };
}

const sortHead = (label: string) => ({ column }: { column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (d?: boolean) => void } }) =>
  <SortHead label={label} sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />;

export function LeaderboardPanel({ leaderboard }: { leaderboard: RecruiterLeaderboardRow[] }) {
  if (leaderboard.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--muted)' }}>No answers yet — the leaderboard fills in as candidates answer.</p>;
  }

  const columns: ColumnDef<typeof DT_FEATURES, RecruiterLeaderboardRow>[] = [
    { id: 'rank', accessorFn: (r) => r.rank, header: sortHead('Rank'), cell: ({ row }) => <span className="v2-mono">{row.original.rank}</span> },
    { id: 'candidateName', accessorFn: (r) => r.candidateName, header: sortHead('Candidate'), cell: ({ row }) => <span style={{ fontWeight: 500 }}>{row.original.candidateName}</span> },
    { id: 'correct', accessorFn: (r) => r.correctCount, header: sortHead('Correct'), cell: ({ row }) => <span className="v2-mono" style={dt.muted}>{row.original.correctCount} / {row.original.totalAutoGradableQuestions}</span> },
    { id: 'timeTaken', accessorFn: (r) => r.timeTakenSeconds, header: sortHead('Time taken'), cell: ({ row }) => <span className="v2-mono" style={dt.muted}>{formatDuration(row.original.timeTakenSeconds)}</span> },
    { id: 'timeLeft', accessorFn: (r) => r.remainingSeconds ?? -1, header: sortHead('Time left'), cell: ({ row }) => <span className="v2-mono" style={dt.muted}>{row.original.remainingSeconds === null ? '—' : formatDuration(row.original.remainingSeconds)}</span> },
    { id: 'score', accessorFn: (r) => r.score ?? -1, header: sortHead('Score'), cell: ({ row }) => <span className="v2-mono">{row.original.score === null ? (UNFINISHED_STATUSES.has(row.original.status) ? '—' : 'Pending') : `${row.original.score} / ${row.original.maxScore}`}</span> },
    { id: 'percentile', accessorFn: (r) => r.percentile, header: sortHead('Percentile'), cell: ({ row }) => <span className="v2-mono" style={dt.muted}>{row.original.percentile}%</span> },
    { id: 'result', accessorFn: (r) => resultCell(r).label, header: sortHead('Result'), cell: ({ row }) => { const { label, c } = resultCell(row.original); return <Pill c={c} label={label} />; } },
  ];

  return <DataTable columns={columns} data={leaderboard} getRowId={(r) => r.candidateId} hideToolbar />;
}
