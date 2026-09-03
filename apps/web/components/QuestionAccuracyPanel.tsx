'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Table, FilterableHeader, type Column } from './ui';
import { useQuestionAccuracy } from '../lib/hooks/usePanelReports';
import { QuestionAccuracyRow } from '../lib/types';

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

/**
 * Per-question accuracy list for one exam: search, bucket filter, table.
 * Shared between the panel Results page and the recruiter exam edit page's
 * Results tab, so both show the identical view without a redirect.
 */
export function QuestionAccuracyPanel({ examId }: { examId: string }) {
  const { data: accuracyRows, isLoading } = useQuestionAccuracy(examId);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const query = search.trim().toLowerCase();
  const visibleRows = (accuracyRows ?? []).filter(
    (row) =>
      (filter === 'all' || accuracyBucket(row.accuracyPercentage) === filter) &&
      (!query || row.questionText.toLowerCase().includes(query)),
  );
  const filtersActive = filter !== 'all' || query !== '';

  const columns: Column<QuestionAccuracyRow>[] = [
    { key: 'index', header: '#', render: (_row, index) => index + 1 },
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
      header: <FilterableHeader label="Accuracy" value={filter} onChange={setFilter} options={ACCURACY_FILTER_OPTIONS} />,
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
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search questions…"
            aria-label="Search questions"
            className="w-full rounded-md border border-rule py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <Table
          columns={columns}
          rows={visibleRows}
          rowKey={(row) => row.questionId}
          emptyMessage={filtersActive ? 'No questions match your search or filter.' : 'No settled attempts yet.'}
        />
      )}
    </div>
  );
}
