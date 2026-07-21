'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useExam } from '../../../../lib/hooks/useExams';
import { useResultsSummary, useQuestionAccuracy, useResultsList, useResultsExport } from '../../../../lib/hooks/usePanelReports';
import { CardGrid, Badge, Button, Checkbox, Card, Select, IntegrityBadge, useToast } from '../../../../components/ui';
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

  function renderCandidateCard(row: ExamResultRow) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Checkbox
            checked={selectedIds.includes(row.candidateId)}
            onChange={() => toggleSelected(row.candidateId)}
            label={`Select ${row.candidateName}`}
            hideLabel
          />
          <Link
            href={`/reports/${examId}/candidates/${row.candidateId}?attemptId=${row.attemptId ?? ''}`}
            className="flex-1 truncate text-sm font-semibold text-gray-900 hover:underline"
          >
            {row.candidateName}
          </Link>
          {row.passFail && <Badge variant={PASS_FAIL_VARIANT[row.passFail] ?? 'default'}>{row.passFail}</Badge>}
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{row.status}</span>
          <span>{row.percentage !== null ? `${row.percentage.toFixed(1)}%` : '—'}</span>
          <IntegrityBadge level={row.integrityLevel} />
        </div>
      </div>
    );
  }

  function renderAccuracyCard(row: QuestionAccuracyRow) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-gray-800">{row.questionText}</p>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{row.accuracyPercentage.toFixed(1)}% accuracy</span>
          <span>
            {row.timesAttempted} / {row.timesIncluded}
          </span>
        </div>
      </div>
    );
  }

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

      <div className="mb-6">
        <h2 className="mb-2 text-lg font-medium">Question accuracy</h2>
        {accuracyLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <CardGrid
            items={accuracyRows ?? []}
            cardKey={(row) => row.questionId}
            renderCard={renderAccuracyCard}
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
          <CardGrid
            items={(results ?? []).filter((row) => integrityFilter === 'all' || row.integrityLevel === integrityFilter)}
            cardKey={(row) => row.candidateId}
            renderCard={renderCandidateCard}
            emptyMessage="No candidates invited yet."
          />
        )}
      </div>
    </div>
  );
}
