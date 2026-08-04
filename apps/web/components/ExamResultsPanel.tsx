'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import {
  Table,
  Input,
  Button,
  Checkbox,
  StatusBadge,
  IntegrityBadge,
  useToast,
  useColumnVisibility,
  FilterableHeader,
  NumberFilterHeader,
  matchesNumberFilter,
  NO_NUMBER_FILTER,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type Column,
  type StatusTone,
  type NumberFilterValue,
} from './ui';
import { useResultsList, useResultsExport, useQuestionAccuracy } from '../lib/hooks/usePanelReports';
import { RESULT_STATUS_LABEL, RESULT_STATUS_TONE } from '../lib/candidate-status';
import { AdvanceToNextRoundModal } from './AdvanceToNextRoundModal';
import { QuestionAccuracyPanel } from './QuestionAccuracyPanel';
import { ExamResultRow } from '../lib/types';

const PASS_FAIL_TONE: Record<string, StatusTone> = { pass: 'success', fail: 'danger' };

// This tab only ever shows attended candidates, so the invited/revoked statuses
// that RESULT_STATUS_LABEL also knows about would never match a row here.
const ATTENDED_STATUSES = ['in_progress', 'paused', 'blocked', 'pending_manual_grade', 'submitted', 'auto_submitted', 'force_submitted'];
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...ATTENDED_STATUSES.map((value) => ({ value, label: RESULT_STATUS_LABEL[value] })),
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

export function ExamResultsPanel({ examId }: { examId: string }) {
  const { data: results, isLoading } = useResultsList(examId);
  // Only for the sub-tab trigger count -- QuestionAccuracyPanel fetches the same
  // query itself, and React Query dedupes the two by key.
  const { data: accuracyRows } = useQuestionAccuracy(examId);
  const exportMutation = useResultsExport(examId);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [percentageFilter, setPercentageFilter] = useState<NumberFilterValue>(NO_NUMBER_FILTER);
  const [resultFilter, setResultFilter] = useState('all');
  const [integrityFilter, setIntegrityFilter] = useState('all');
  // invitationId, not candidateId -- a re-invited candidate has multiple rows sharing
  // one candidateId, and a candidateId-keyed selection would check/export every one of
  // that candidate's invitations at once instead of just the row picked.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);

  // Only candidates who actually attended: an invitation with no attempt yet
  // (still 'invited') or a revoked one never took the exam, so there's no
  // result to show -- this tab is deliberately just the attended cohort,
  // unlike the full recruiter-facing Results page's Candidates tab.
  const attended = (results ?? []).filter((row) => row.attemptId !== null);
  // Above/Below Average compares against the whole attended cohort's mean, not just
  // whatever's currently visible -- otherwise applying the filter would shrink the
  // set it's being measured against on every keystroke of an unrelated filter.
  const settledPercentages = attended.map((row) => row.percentage).filter((value): value is number => value !== null);
  const averagePercentage =
    settledPercentages.length > 0 ? settledPercentages.reduce((sum, value) => sum + value, 0) / settledPercentages.length : 0;
  const query = search.trim().toLowerCase();
  const visible = attended.filter((row) => {
    if (query && !row.candidateName.toLowerCase().includes(query)) return false;
    if (statusFilter !== 'all' && row.status !== statusFilter) return false;
    if (!matchesNumberFilter(row.percentage, percentageFilter, averagePercentage)) return false;
    if (resultFilter !== 'all') {
      const bucket = row.passFail ?? 'pending';
      if (bucket !== resultFilter) return false;
    }
    if (integrityFilter !== 'all' && row.integrityLevel !== integrityFilter) return false;
    return true;
  });
  const filtersActive =
    query !== '' || statusFilter !== 'all' || percentageFilter.operator !== null || resultFilter !== 'all' || integrityFilter !== 'all';

  const allVisibleSelected = visible.length > 0 && visible.every((row) => selectedIds.includes(row.invitationId));

  function toggleSelected(invitationId: string) {
    setSelectedIds((current) => (current.includes(invitationId) ? current.filter((id) => id !== invitationId) : [...current, invitationId]));
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const visibleIds = visible.map((row) => row.invitationId);
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return [...new Set([...current, ...visibleIds])];
    });
  }

  // Advancing to the next round targets the candidate, not a specific invitation --
  // dedupe back to candidateId so selecting both of a re-invited candidate's rows
  // advances them once, not twice.
  const selectedCandidateIds = [...new Set(attended.filter((row) => selectedIds.includes(row.invitationId)).map((row) => row.candidateId))];

  async function handleExport(format: 'csv' | 'xlsx') {
    try {
      const { blob, filename } = await exportMutation.mutateAsync({ format, invitationIds: selectedIds });
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

  // Kept out of the column chooser (below): hiding the bulk-select checkbox would
  // strand an in-progress selection with no way to change it, so this one column
  // is never optional.
  const selectColumn: Column<ExamResultRow> = {
    key: 'select',
    header: <Checkbox checked={allVisibleSelected} onChange={toggleSelectAll} label="Select all" hideLabel />,
    sortLabel: 'Select',
    render: (row) => (
      <Checkbox
        checked={selectedIds.includes(row.invitationId)}
        onChange={() => toggleSelected(row.invitationId)}
        label={`Select ${row.candidateName}`}
        hideLabel
      />
    ),
  };

  // Position in the currently sorted/filtered view, 1-based -- a quick way to see
  // "how many candidates" at a glance without counting rows. Not sortable itself
  // (it's derived from whatever sort is active, not an independent value) and kept
  // out of the column chooser alongside the select checkbox for the same reason.
  const indexColumn: Column<ExamResultRow> = {
    key: 'index',
    header: '#',
    render: (_row, index) => index + 1,
  };

  const dataColumns: Column<ExamResultRow>[] = [
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
      // 'rawScore', not 'score' -- that key already belongs to the Percentage column
      // below (a holdover from before it was renamed) and column-visibility choices
      // are persisted by key, so reusing it would collide with a saved preference.
      key: 'rawScore',
      header: 'Score',
      render: (row) => (row.score !== null && row.maxScore !== null ? `${row.score}/${row.maxScore}` : '—'),
      sortValue: (row) => row.score ?? -1,
    },
    {
      key: 'score',
      header: <NumberFilterHeader label="Percentage" value={percentageFilter} onChange={setPercentageFilter} unit="%" />,
      sortLabel: 'Percentage',
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

  const { visibleColumns: visibleDataColumns, chooser } = useColumnVisibility('exam-results', dataColumns);

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  // Same Candidates / Question accuracy split the panel-facing Results page has,
  // embedded here so a recruiter can sanity-check question quality for THIS exam
  // without leaving the exam edit page.
  return (
    <Tabs defaultValue="candidates">
      <TabsList>
        <TabsTrigger value="candidates">Candidates{visible.length > 0 ? ` (${visible.length})` : ''}</TabsTrigger>
        <TabsTrigger value="accuracy">
          Question accuracy{(accuracyRows ?? []).length > 0 ? ` (${(accuracyRows ?? []).length})` : ''}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="candidates">
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
              {chooser}
            </div>
          </div>
          <Table
            columns={[selectColumn, indexColumn, ...visibleDataColumns]}
            rows={visible}
            rowKey={(row) => row.invitationId}
            emptyMessage={filtersActive ? 'No candidates match your search or filters.' : 'No candidates have attended this exam yet.'}
          />
          {advanceModalOpen && (
            <AdvanceToNextRoundModal
              examId={examId}
              candidateIds={selectedCandidateIds}
              open
              onClose={() => setAdvanceModalOpen(false)}
              onAdvanced={() => setSelectedIds([])}
            />
          )}
        </div>
      </TabsContent>

      <TabsContent value="accuracy">
        <QuestionAccuracyPanel examId={examId} />
      </TabsContent>
    </Tabs>
  );
}
