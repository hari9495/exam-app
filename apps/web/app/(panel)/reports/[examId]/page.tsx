'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Search, Users, CheckCircle2, Target, BarChart3 } from 'lucide-react';
import { useExam, useExams } from '../../../../lib/hooks/useExams';
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
  FilterableHeader,
  type Column,
  type StatusTone,
} from '../../../../components/ui';
import { ExamResultRow, QuestionAccuracyRow } from '../../../../lib/types';
import { RESULT_STATUS_LABEL, RESULT_STATUS_TONE } from '../../../../lib/candidate-status';

const PASS_FAIL_TONE: Record<string, StatusTone> = { pass: 'success', fail: 'danger' };

const INTEGRITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All integrity levels' },
  { value: 'clear', label: 'Clear' },
  { value: 'review', label: 'Review recommended' },
  { value: 'high_concern', label: 'High concern' },
];

// Built from RESULT_STATUS_LABEL rather than a separate hand-kept list, so the
// filter options always match whatever the Status column actually displays.
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...Object.entries(RESULT_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

// Accuracy buckets, not a raw percent range picker: the point is spotting
// questions worth a second look during validation -- e.g. everyone missing a
// question (low) can mean it's mis-keyed, everyone acing it (high) can mean
// it's too easy or leaking the answer.
type AccuracyBucket = 'low' | 'medium' | 'high';

function accuracyBucket(percentage: number): AccuracyBucket {
  if (percentage < 30) return 'low';
  if (percentage < 70) return 'medium';
  return 'high';
}

const ACCURACY_FILTER_OPTIONS = [
  { value: 'all', label: 'All accuracy' },
  { value: 'low', label: 'Low accuracy (<30%)' },
  { value: 'medium', label: 'Medium accuracy (30–69%)' },
  { value: 'high', label: 'High accuracy (≥70%)' },
];

// Same thresholds as the accuracy buckets above -- lets Pass rate and Average
// score read as a signal at a glance instead of a flat number.
function scoreTone(percent: number): string {
  if (percent < 30) return 'text-status-danger';
  if (percent < 70) return 'text-status-warning';
  return 'text-status-success';
}

export default function PanelExamResultsPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const { data: exam } = useExam(examId);
  // ponytail: pageSize:100 is the server's max -- an org with >100 exams won't see #101+
  // in this switcher. Same cap the /reports list itself already lives with.
  const { data: examsResponse } = useExams(undefined, { pageSize: 100 });
  const examOptions = (examsResponse?.data ?? []).map((item) => ({ value: item.id, label: item.title }));
  // The list query and the single-exam query can settle at different times -- without
  // this, switching into an exam whose own list page hasn't loaded yet briefly shows
  // an empty picklist instead of the exam the recruiter is already looking at.
  if (exam && !examOptions.some((option) => option.value === exam.id)) {
    examOptions.unshift({ value: exam.id, label: exam.title });
  }
  const { data: summary, isLoading: summaryLoading } = useResultsSummary(examId);
  const { data: accuracyRows, isLoading: accuracyLoading } = useQuestionAccuracy(examId);
  const { data: results, isLoading: resultsLoading } = useResultsList(examId);
  const exportMutation = useResultsExport(examId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [integrityFilter, setIntegrityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [accuracySearch, setAccuracySearch] = useState('');
  const [accuracyFilter, setAccuracyFilter] = useState('all');
  const { toast } = useToast();

  // Derived once: the tab count and the grid must show the same set, and every
  // filter below applies to both.
  const query = search.trim().toLowerCase();
  const visibleResults = (results ?? []).filter(
    (row) =>
      (integrityFilter === 'all' || row.integrityLevel === integrityFilter) &&
      (statusFilter === 'all' || row.status === statusFilter) &&
      (!query || row.candidateName.toLowerCase().includes(query)),
  );
  const filtersActive = integrityFilter !== 'all' || statusFilter !== 'all' || query !== '';

  const accuracyQuery = accuracySearch.trim().toLowerCase();
  const visibleAccuracyRows = (accuracyRows ?? []).filter(
    (row) =>
      (accuracyFilter === 'all' || accuracyBucket(row.accuracyPercentage) === accuracyFilter) &&
      (!accuracyQuery || row.questionText.toLowerCase().includes(accuracyQuery)),
  );
  const accuracyFiltersActive = accuracyFilter !== 'all' || accuracyQuery !== '';

  function toggleSelected(candidateId: string) {
    setSelectedIds((current) =>
      current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId],
    );
  }

  async function handleExport(format: 'csv' | 'xlsx' | 'pdf') {
    try {
      // Exports the checked rows; falls back to everything when nothing is checked,
      // same "no selection = no scoping" default the backend itself applies.
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
      header: <FilterableHeader label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />,
      sortLabel: 'Status',
      render: (row) => <StatusBadge tone={RESULT_STATUS_TONE[row.status] ?? 'neutral'}>{RESULT_STATUS_LABEL[row.status] ?? row.status}</StatusBadge>,
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
      header: <FilterableHeader label="Integrity" value={integrityFilter} onChange={setIntegrityFilter} options={INTEGRITY_FILTER_OPTIONS} />,
      sortLabel: 'Integrity',
      render: (row) => <IntegrityBadge level={row.integrityLevel} />,
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
      header: <FilterableHeader label="Accuracy" value={accuracyFilter} onChange={setAccuracyFilter} options={ACCURACY_FILTER_OPTIONS} />,
      sortLabel: 'Accuracy',
      render: (row) => `${row.accuracyPercentage.toFixed(1)}%`,
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
            <Card className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-recruiter-text-tertiary">
                <Users size={14} />
                <p className="text-xs font-medium uppercase tracking-wide">Total candidates</p>
              </div>
              <p className="text-2xl font-semibold text-recruiter-text">{summary.totalCandidates}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
            <Card className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-recruiter-text-tertiary">
                <CheckCircle2 size={14} />
                <p className="text-xs font-medium uppercase tracking-wide">Settled</p>
              </div>
              <p className="text-2xl font-semibold text-recruiter-text">{summary.settledCount}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}>
            <Card className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-recruiter-text-tertiary">
                <Target size={14} />
                <p className="text-xs font-medium uppercase tracking-wide">Pass rate</p>
              </div>
              <p className={`text-2xl font-semibold ${scoreTone(summary.passRate)}`}>{summary.passRate.toFixed(1)}%</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}>
            <Card className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-recruiter-text-tertiary">
                <BarChart3 size={14} />
                <p className="text-xs font-medium uppercase tracking-wide">Average score</p>
              </div>
              <p className={`text-2xl font-semibold ${scoreTone(summary.averagePercentage)}`}>{summary.averagePercentage.toFixed(1)}%</p>
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
            Question accuracy{visibleAccuracyRows.length > 0 ? ` (${visibleAccuracyRows.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accuracy">
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <div className="relative max-w-xs flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-recruiter-text-tertiary" />
              <input
                type="search"
                value={accuracySearch}
                onChange={(event) => setAccuracySearch(event.target.value)}
                placeholder="Search questions…"
                aria-label="Search questions"
                className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
              />
            </div>
          </div>
          {accuracyLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <Table
              columns={accuracyColumns}
              rows={visibleAccuracyRows}
              rowKey={(row) => row.questionId}
              emptyMessage={accuracyFiltersActive ? 'No questions match your search or filter.' : 'No settled attempts yet.'}
            />
          )}
        </TabsContent>

        <TabsContent value="candidates">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap items-end gap-2">
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
            <Select
              label="Exam"
              value={examId}
              onChange={(nextExamId) => nextExamId !== examId && router.push(`/reports/${nextExamId}`)}
              options={examOptions}
            />
          </div>
          <div className="flex items-end gap-2">
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
            // invitationId, not candidateId -- a re-invited candidate has more than one row
            // for the same exam, and a duplicate React key across rows makes sort reordering
            // mis-assign/duplicate DOM nodes (same class of bug as ADO #6841).
            rowKey={(row) => row.invitationId}
            emptyMessage={filtersActive ? 'No candidates match your search or filters.' : 'No candidates invited yet.'}
          />
        )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
