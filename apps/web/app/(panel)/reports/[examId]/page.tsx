'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useExam } from '../../../../lib/hooks/useExams';
import { useResultsSummary, useQuestionAccuracy, useResultsList, useResultsExport } from '../../../../lib/hooks/usePanelReports';
import { Table, Badge, Button, Checkbox, Card, Select, IntegrityBadge, useToast, type Column } from '../../../../components/ui';
import { ExamResultRow, QuestionAccuracyRow } from '../../../../lib/types';

const PASS_FAIL_VARIANT: Record<string, 'success' | 'danger'> = { pass: 'success', fail: 'danger' };

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

  const columns: Column<ExamResultRow>[] = [
    {
      key: 'select',
      header: '',
      render: (row) => (
        <Checkbox
          checked={selectedIds.includes(row.candidateId)}
          onChange={() => toggleSelected(row.candidateId)}
          label={`Select ${row.candidateName}`}
        />
      ),
    },
    {
      key: 'name',
      header: 'Candidate',
      render: (row) => (
        <Link href={`/reports/${examId}/candidates/${row.candidateId}?attemptId=${row.attemptId ?? ''}`}>
          {row.candidateName}
        </Link>
      ),
      sortValue: (row) => row.candidateName,
    },
    { key: 'status', header: 'Status', render: (row) => row.status },
    {
      key: 'percentage',
      header: 'Score %',
      render: (row) => (row.percentage !== null ? `${row.percentage.toFixed(1)}%` : '—'),
      sortValue: (row) => row.percentage ?? -1,
    },
    {
      key: 'passFail',
      header: 'Result',
      render: (row) => (row.passFail ? <Badge variant={PASS_FAIL_VARIANT[row.passFail] ?? 'default'}>{row.passFail}</Badge> : '—'),
    },
    {
      key: 'integrity',
      header: 'Integrity',
      render: (row) => <IntegrityBadge level={row.integrityLevel} />,
    },
  ];

  const accuracyColumns: Column<QuestionAccuracyRow>[] = [
    { key: 'question', header: 'Question', render: (row) => row.questionText },
    {
      key: 'accuracy',
      header: 'Accuracy',
      render: (row) => `${row.accuracyPercentage.toFixed(1)}%`,
      sortValue: (row) => row.accuracyPercentage,
    },
    { key: 'attempted', header: 'Attempted / Included', render: (row) => `${row.timesAttempted} / ${row.timesIncluded}` },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{exam?.title ?? 'Exam results'}</h1>

      {summaryLoading ? (
        <p className="mb-6 text-sm text-gray-500">Loading summary…</p>
      ) : summary ? (
        <div className="mb-6 grid grid-cols-4 gap-4">
          <Card>
            <p className="text-xs text-gray-500">Total candidates</p>
            <p className="text-2xl font-semibold">{summary.totalCandidates}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Settled</p>
            <p className="text-2xl font-semibold">{summary.settledCount}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Pass rate</p>
            <p className="text-2xl font-semibold">{summary.passRate.toFixed(1)}%</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Average score</p>
            <p className="text-2xl font-semibold">{summary.averagePercentage.toFixed(1)}%</p>
          </Card>
        </div>
      ) : null}

      <div className="mb-6">
        <h2 className="mb-2 text-lg font-medium">Question accuracy</h2>
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
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Candidates</h2>
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
            columns={columns}
            rows={(results ?? []).filter((row) => integrityFilter === 'all' || row.integrityLevel === integrityFilter)}
            rowKey={(row) => row.candidateId}
            emptyMessage="No candidates invited yet."
          />
        )}
      </div>
    </div>
  );
}
