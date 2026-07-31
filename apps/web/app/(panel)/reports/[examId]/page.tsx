'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useExam } from '../../../../lib/hooks/useExams';
import { useResultsSummary, useQuestionAccuracy, useResultsList, useResultsExport } from '../../../../lib/hooks/usePanelReports';
import {
  Table,
  Checkbox,
  Button,
  Card,
  Select,
  StatusBadge,
  IntegrityBadge,
  useToast,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type Column,
  type StatusTone,
} from '../../../../components/ui';
import { ExamResultRow, QuestionAccuracyRow } from '../../../../lib/types';

const PASS_FAIL_TONE: Record<string, StatusTone> = { pass: 'success', fail: 'danger' };

// The candidate's raw attempt/invitation status ('pending_manual_grade', 'submitted', ...) --
// same underlying values as the Candidates and Live tabs, kept distinct here (not collapsed
// to a 3-stage bucket) since a recruiter reading results specifically cares which kind of
// settlement a candidate got.
const RESULT_STATUS_LABEL: Record<string, string> = {
  invited: 'Invited',
  revoked: 'Revoked',
  in_progress: 'In Progress',
  paused: 'Paused',
  blocked: 'Blocked',
  pending_manual_grade: 'Pending Grade',
  submitted: 'Submitted',
  auto_submitted: 'Auto-submitted',
  force_submitted: 'Force-submitted',
};

const RESULT_STATUS_TONE: Record<string, StatusTone> = {
  invited: 'info',
  revoked: 'danger',
  in_progress: 'warning',
  paused: 'neutral',
  blocked: 'danger',
  pending_manual_grade: 'warning',
  submitted: 'success',
  auto_submitted: 'success',
  force_submitted: 'danger',
};

const INTEGRITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All integrity levels' },
  { value: 'clear', label: 'Clear' },
  { value: 'review', label: 'Review recommended' },
  { value: 'high_concern', label: 'High concern' },
];

export default function PanelExamResultsPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const { data: exam } = useExam(examId);
  const { data: summary, isLoading: summaryLoading } = useResultsSummary(examId);
  const { data: accuracyRows, isLoading: accuracyLoading } = useQuestionAccuracy(examId);
  const { data: results, isLoading: resultsLoading } = useResultsList(examId);
  const exportMutation = useResultsExport(examId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [integrityFilter, setIntegrityFilter] = useState('all');
  const { toast } = useToast();

  // Derived once: the tab count and the grid must show the same set, and the
  // integrity filter applies to both.
  const visibleResults = (results ?? []).filter(
    (row) => integrityFilter === 'all' || row.integrityLevel === integrityFilter,
  );

  function toggleSelected(candidateId: string) {
    setSelectedIds((current) =>
      current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId],
    );
  }

  async function handleExport(format: 'csv' | 'xlsx' | 'pdf') {
    try {
      const { blob, filename } = await exportMutation.mutateAsync(format);
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

  const candidateColumns: Column<ExamResultRow>[] = [
    {
      key: 'select',
      header: '',
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
        <Link
          href={`/reports/${examId}/candidates/${row.candidateId}?attemptId=${row.attemptId ?? ''}`}
          className="font-medium text-primary hover:underline"
        >
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

  const accuracyColumns: Column<QuestionAccuracyRow>[] = [
    {
      key: 'question',
      header: 'Question',
      render: (row) => (
        <span className="block max-w-xl truncate" title={row.questionText}>
          {row.questionText}
        </span>
      ),
      sortValue: (row) => row.questionText.toLowerCase(),
    },
    {
      key: 'accuracy',
      header: 'Accuracy',
      render: (row) => `${row.accuracyPercentage.toFixed(1)}%`,
      sortValue: (row) => row.accuracyPercentage,
    },
    {
      key: 'attempted',
      header: 'Attempted',
      render: (row) => `${row.timesAttempted} / ${row.timesIncluded}`,
      sortValue: (row) => row.timesAttempted,
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{exam?.title ?? 'Exam results'}</h1>

      {summaryLoading ? (
        <p className="mb-6 text-sm text-gray-500">Loading summary…</p>
      ) : summary ? (
        <div className="mb-6 grid grid-cols-4 gap-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}>
            <Card>
              <p className="text-xs text-gray-500">Total candidates</p>
              <p className="text-2xl font-semibold">{summary.totalCandidates}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
            <Card>
              <p className="text-xs text-gray-500">Settled</p>
              <p className="text-2xl font-semibold">{summary.settledCount}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}>
            <Card>
              <p className="text-xs text-gray-500">Pass rate</p>
              <p className="text-2xl font-semibold">{summary.passRate.toFixed(1)}%</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}>
            <Card>
              <p className="text-xs text-gray-500">Average score</p>
              <p className="text-2xl font-semibold">{summary.averagePercentage.toFixed(1)}%</p>
            </Card>
          </motion.div>
        </div>
      ) : null}

      {/* Candidates first and default: an exam with many questions pushed the
          candidate list far below the fold, which is the thing a recruiter
          actually opens this page to read. */}
      <Tabs defaultValue="candidates">
        <TabsList>
          <TabsTrigger value="candidates">
            Candidates{visibleResults.length > 0 ? ` (${visibleResults.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="accuracy">
            Question accuracy{accuracyRows?.length ? ` (${accuracyRows.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accuracy">
          {accuracyLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <Table
              columns={accuracyColumns}
              rows={accuracyRows ?? []}
              rowKey={(row) => row.questionId}
              emptyMessage="No settled attempts yet."
            />
          )}
        </TabsContent>

        <TabsContent value="candidates">
        <div className="mb-2 flex items-end justify-end">
          <div className="flex items-end gap-2">
            <Select label="Integrity" value={integrityFilter} onChange={setIntegrityFilter} options={INTEGRITY_FILTER_OPTIONS} />
            <Button variant="secondary" onClick={() => handleExport('csv')} disabled={exportMutation.isPending}>
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => handleExport('xlsx')} disabled={exportMutation.isPending}>
              Export Excel
            </Button>
            <Button variant="secondary" onClick={() => handleExport('pdf')} disabled={exportMutation.isPending}>
              Export PDF
            </Button>
            <Button
              disabled={selectedIds.length < 2}
              onClick={() => router.push(`/reports/${examId}/compare?candidateIds=${selectedIds.join(',')}`)}
            >
              Compare selected
            </Button>
          </div>
        </div>
        {resultsLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <Table
            columns={candidateColumns}
            rows={visibleResults}
            rowKey={(row) => row.candidateId}
            emptyMessage={integrityFilter === 'all' ? 'No candidates invited yet.' : 'No candidates match this integrity level.'}
          />
        )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
