'use client';

import { Table, StatusBadge, type Column, type StatusTone } from './ui';
import { RecruiterLeaderboardRow } from '../lib/types';

const UNFINISHED_STATUSES = new Set(['in_progress', 'paused', 'blocked']);

// mm:ss under an hour, h:mm:ss at or past it -- a coding round can run long enough
// that a bare mm:ss would silently roll over and read as a much shorter time.
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

function resultCell(row: RecruiterLeaderboardRow): { label: string; tone: StatusTone } {
  if (UNFINISHED_STATUSES.has(row.status)) {
    return { label: 'In Progress', tone: 'neutral' };
  }
  if (row.passFail === 'pass') return { label: 'Pass', tone: 'success' };
  if (row.passFail === 'fail') return { label: 'Fail', tone: 'danger' };
  // Finished but passFail is null: a code question is still awaiting manual grading.
  return { label: 'Pending Grade', tone: 'warning' };
}

// Fed from the page's single monitoring socket. Calling useExamMonitoring here would
// open a second socket per recruiter -- two join-exam handlers, two roster snapshots,
// two leaderboard computations -- for data the page already has.
export function LeaderboardPanel({ leaderboard }: { leaderboard: RecruiterLeaderboardRow[] }) {
  if (leaderboard.length === 0) {
    return <p className="text-sm text-gray-500">No answers yet — the leaderboard fills in as candidates answer.</p>;
  }

  const columns: Column<RecruiterLeaderboardRow>[] = [
    { key: 'rank', header: 'Rank', render: (row) => row.rank, sortValue: (row) => row.rank },
    { key: 'candidateName', header: 'Candidate', render: (row) => row.candidateName, sortValue: (row) => row.candidateName },
    {
      key: 'correctAnswers',
      header: 'Correct Answers',
      render: (row) => `${row.correctCount} / ${row.totalAutoGradableQuestions}`,
      sortValue: (row) => row.correctCount,
    },
    {
      key: 'timeTaken',
      header: 'Time Taken',
      render: (row) => formatDuration(row.timeTakenSeconds),
      sortValue: (row) => row.timeTakenSeconds,
    },
    {
      key: 'timeLeft',
      header: 'Time Left',
      render: (row) => (row.remainingSeconds === null ? '—' : formatDuration(row.remainingSeconds)),
      sortValue: (row) => row.remainingSeconds ?? -1,
    },
    {
      key: 'score',
      header: 'Score',
      render: (row) => (row.score === null ? (UNFINISHED_STATUSES.has(row.status) ? '—' : 'Pending') : `${row.score} / ${row.maxScore}`),
      sortValue: (row) => row.score ?? -1,
    },
    {
      key: 'percentile',
      header: 'Percentile',
      render: (row) => `${row.percentile}%`,
      sortValue: (row) => row.percentile,
    },
    {
      key: 'result',
      header: 'Result',
      render: (row) => {
        const { label, tone } = resultCell(row);
        return <StatusBadge tone={tone}>{label}</StatusBadge>;
      },
      sortValue: (row) => resultCell(row).label,
    },
  ];

  return <Table columns={columns} rows={leaderboard} rowKey={(row) => row.candidateId} />;
}
