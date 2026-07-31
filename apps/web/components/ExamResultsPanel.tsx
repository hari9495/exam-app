'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, ChevronDown } from 'lucide-react';
import {
  Table,
  Input,
  Button,
  Checkbox,
  StatusBadge,
  IntegrityBadge,
  useToast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  type Column,
  type StatusTone,
} from './ui';
import { useResultsList, useResultsExport } from '../lib/hooks/usePanelReports';
import { RESULT_STATUS_LABEL, RESULT_STATUS_TONE } from '../lib/candidate-status';
import { AdvanceToNextRoundModal } from './AdvanceToNextRoundModal';
import { ExamResultRow } from '../lib/types';

const PASS_FAIL_TONE: Record<string, StatusTone> = { pass: 'success', fail: 'danger' };

// This tab only ever shows attended candidates, so the invited/revoked statuses
// that RESULT_STATUS_LABEL also knows about would never match a row here.
const ATTENDED_STATUSES = ['in_progress', 'paused', 'blocked', 'pending_manual_grade', 'submitted', 'auto_submitted', 'force_submitted'];
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...ATTENDED_STATUSES.map((value) => ({ value, label: RESULT_STATUS_LABEL[value] })),
];

// Same low/medium/high split as the Question accuracy tab's accuracy filter --
// one glance at who's struggling vs. acing it, not a raw percent range picker.
type ScoreBucket = 'low' | 'medium' | 'high';
function scoreBucket(percentage: number): ScoreBucket {
  if (percentage < 30) return 'low';
  if (percentage < 70) return 'medium';
  return 'high';
}
const SCORE_FILTER_OPTIONS = [
  { value: 'all', label: 'All scores' },
  { value: 'low', label: 'Low (<30%)' },
  { value: 'medium', label: 'Medium (30–69%)' },
  { value: 'high', label: 'High (≥70%)' },
];

const RESULT_FILTER_OPTIONS = [
  { value: 'all', label: 'All results' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'pending', label: 'Pending grade' },
];

const INTEGRITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All integrity levels' },
  { value: 'clear', label: 'Clear' },
  { value: 'review', label: 'Review recommended' },
  { value: 'high_concern', label: 'High concern' },
];

// A column header that's a filter trigger instead of plain text: clicking it opens
// a dropdown of values rather than sorting the column, mirroring the toolbar
// Select-based filters used elsewhere but living directly in the header the way a
// Salesforce list view's column filters do.
function FilterableHeader({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const active = value !== 'all';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Filter by ${label}`}
        className={`flex items-center gap-1 ${active ? 'text-primary' : ''}`}
      >
        {label}
        <ChevronDown size={12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {options.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => onChange(option.value)} className={value === option.value ? 'font-semibold text-primary' : ''}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ExamResultsPanel({ examId }: { examId: string }) {
  const { data: results, isLoading } = useResultsList(examId);
  const exportMutation = useResultsExport(examId);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [integrityFilter, setIntegrityFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);

  // Only candidates who actually attended: an invitation with no attempt yet
  // (still 'invited') or a revoked one never took the exam, so there's no
  // result to show -- this tab is deliberately just the attended cohort,
  // unlike the full recruiter-facing Results page's Candidates tab.
  const attended = (results ?? []).filter((row) => row.attemptId !== null);
  const query = search.trim().toLowerCase();
  const visible = attended.filter((row) => {
    if (query && !row.candidateName.toLowerCase().includes(query)) return false;
    if (statusFilter !== 'all' && row.status !== statusFilter) return false;
    if (scoreFilter !== 'all' && (row.percentage === null || scoreBucket(row.percentage) !== scoreFilter)) return false;
    if (resultFilter !== 'all') {
      const bucket = row.passFail ?? 'pending';
      if (bucket !== resultFilter) return false;
    }
    if (integrityFilter !== 'all' && row.integrityLevel !== integrityFilter) return false;
    return true;
  });
  const filtersActive = query !== '' || statusFilter !== 'all' || scoreFilter !== 'all' || resultFilter !== 'all' || integrityFilter !== 'all';

  const allVisibleSelected = visible.length > 0 && visible.every((row) => selectedIds.includes(row.candidateId));

  function toggleSelected(candidateId: string) {
    setSelectedIds((current) => (current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId]));
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const visibleIds = visible.map((row) => row.candidateId);
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return [...new Set([...current, ...visibleIds])];
    });
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    try {
      const { blob, filename } = await exportMutation.mutateAsync({ format, candidateIds: selectedIds });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? `exam-${examId}-results.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to export results.', 'error');
    }
  }

  const columns: Column<ExamResultRow>[] = [
    {
      key: 'select',
      header: <Checkbox checked={allVisibleSelected} onChange={toggleSelectAll} label="Select all" hideLabel />,
      sortLabel: 'Select',
      render: (row) => (
        <Checkbox
          checked={selectedIds.includes(row.candidateId)}
          onChange={() => toggleSelected(row.candidateId)}
          label={`Select ${row.candidateName}`}
          hideLabel
        />
      ),
    },
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
      header: <FilterableHeader label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />,
      sortLabel: 'Status',
      render: (row) => <StatusBadge tone={RESULT_STATUS_TONE[row.status] ?? 'neutral'}>{RESULT_STATUS_LABEL[row.status] ?? row.status}</StatusBadge>,
    },
    {
      key: 'score',
      header: <FilterableHeader label="Score" value={scoreFilter} onChange={setScoreFilter} options={SCORE_FILTER_OPTIONS} />,
      sortLabel: 'Score',
      render: (row) => (row.percentage !== null ? `${row.percentage.toFixed(1)}%` : '—'),
    },
    {
      key: 'result',
      header: <FilterableHeader label="Result" value={resultFilter} onChange={setResultFilter} options={RESULT_FILTER_OPTIONS} />,
      sortLabel: 'Result',
      render: (row) => (row.passFail ? <StatusBadge tone={PASS_FAIL_TONE[row.passFail] ?? 'neutral'}>{row.passFail}</StatusBadge> : '—'),
    },
    {
      key: 'integrity',
      header: <FilterableHeader label="Integrity" value={integrityFilter} onChange={setIntegrityFilter} options={INTEGRITY_FILTER_OPTIONS} />,
      sortLabel: 'Integrity',
      render: (row) => <IntegrityBadge level={row.integrityLevel} />,
    },
  ];

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="max-w-xs flex-1">
          <Input label="Search candidates" hideLabel value={search} onChange={setSearch} placeholder="Search candidates…" icon={<Search size={14} />} />
        </div>
        <div className="flex items-end gap-2">
          <Button variant="secondary" onClick={() => handleExport('csv')} disabled={exportMutation.isPending}>
            Export CSV
          </Button>
          <Button variant="secondary" onClick={() => handleExport('xlsx')} disabled={exportMutation.isPending}>
            Export Excel
          </Button>
          <Button onClick={() => setAdvanceModalOpen(true)} disabled={selectedIds.length === 0}>
            Advance to Next Round
          </Button>
        </div>
      </div>
      <Table
        columns={columns}
        rows={visible}
        rowKey={(row) => row.candidateId}
        emptyMessage={filtersActive ? 'No candidates match your search or filters.' : 'No candidates have attended this exam yet.'}
      />
      {advanceModalOpen && (
        <AdvanceToNextRoundModal
          examId={examId}
          candidateIds={selectedIds}
          open
          onClose={() => setAdvanceModalOpen(false)}
          onAdvanced={() => setSelectedIds([])}
        />
      )}
    </div>
  );
}
