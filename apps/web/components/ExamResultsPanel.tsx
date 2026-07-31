'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Table, Input, StatusBadge, IntegrityBadge, type Column, type StatusTone } from './ui';
import { useResultsList } from '../lib/hooks/usePanelReports';
import { RESULT_STATUS_LABEL, RESULT_STATUS_TONE } from '../lib/candidate-status';
import { ExamResultRow } from '../lib/types';

const PASS_FAIL_TONE: Record<string, StatusTone> = { pass: 'success', fail: 'danger' };

export function ExamResultsPanel({ examId }: { examId: string }) {
  const { data: results, isLoading } = useResultsList(examId);
  const [search, setSearch] = useState('');

  // Only candidates who actually attended: an invitation with no attempt yet
  // (still 'invited') or a revoked one never took the exam, so there's no
  // result to show -- this tab is deliberately just the attended cohort,
  // unlike the full recruiter-facing Results page's Candidates tab.
  const attended = (results ?? []).filter((row) => row.attemptId !== null);
  const query = search.trim().toLowerCase();
  const visible = query ? attended.filter((row) => row.candidateName.toLowerCase().includes(query)) : attended;

  const columns: Column<ExamResultRow>[] = [
    {
      key: 'name',
      header: 'Candidate',
      render: (row) => (
        <Link href={`/reports/${examId}/candidates/${row.candidateId}?attemptId=${row.attemptId ?? ''}`} className="font-medium text-primary hover:underline">
          {row.candidateName}
        </Link>
      ),
      sortValue: (row) => row.candidateName.toLowerCase(),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge tone={RESULT_STATUS_TONE[row.status] ?? 'neutral'}>{RESULT_STATUS_LABEL[row.status] ?? row.status}</StatusBadge>,
      sortValue: (row) => RESULT_STATUS_LABEL[row.status] ?? row.status,
    },
    {
      key: 'score',
      header: 'Score',
      render: (row) => (row.percentage !== null ? `${row.percentage.toFixed(1)}%` : '—'),
      sortValue: (row) => row.percentage ?? -1,
    },
    {
      key: 'result',
      header: 'Result',
      render: (row) => (row.passFail ? <StatusBadge tone={PASS_FAIL_TONE[row.passFail] ?? 'neutral'}>{row.passFail}</StatusBadge> : '—'),
      sortValue: (row) => row.passFail ?? '',
    },
    {
      key: 'integrity',
      header: 'Integrity',
      render: (row) => <IntegrityBadge level={row.integrityLevel} />,
      sortValue: (row) => row.integrityLevel ?? '',
    },
  ];

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-xs">
        <Input label="Search candidates" hideLabel value={search} onChange={setSearch} placeholder="Search candidates…" icon={<Search size={14} />} />
      </div>
      <Table
        columns={columns}
        rows={visible}
        rowKey={(row) => row.candidateId}
        emptyMessage={query ? 'No candidates match your search.' : 'No candidates have attended this exam yet.'}
      />
    </div>
  );
}
