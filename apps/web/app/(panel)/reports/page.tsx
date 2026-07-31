'use client';

import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { useExams } from '../../../lib/hooks/useExams';
import { StatusBadge, type Column, type StatusTone } from '../../../components/ui';
import { ListView } from '../../(platform)/components/ListView';
import { ExamListItem, ExamStatus } from '../../../lib/types';

const STATUS_TONE: Record<ExamStatus, StatusTone> = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
};

const columns: Column<ExamListItem>[] = [
  {
    key: 'title',
    header: 'Exam',
    render: (exam) => (
      <Link href={`/reports/${exam.id}`} className="font-medium text-primary hover:underline">
        {exam.title}
      </Link>
    ),
    sortValue: (exam) => exam.title.toLowerCase(),
  },
  {
    key: 'status',
    header: 'Status',
    render: (exam) => <StatusBadge tone={STATUS_TONE[exam.status] ?? 'neutral'}>{exam.status}</StatusBadge>,
    sortValue: (exam) => exam.status,
  },
  {
    key: 'attempts',
    header: 'Attempts',
    // settled / total -- how many candidates have a finalised result out of all who started.
    render: (exam) => `${exam.attemptSettledCount}/${exam.attemptTotalCount}`,
    sortValue: (exam) => exam.attemptTotalCount,
  },
  {
    key: 'duration',
    header: 'Duration',
    render: (exam) => `${exam.durationMinutes} min`,
    sortValue: (exam) => exam.durationMinutes,
  },
  {
    key: 'passMark',
    header: 'Pass mark',
    render: (exam) => `${exam.passCriteriaPercent}%`,
    sortValue: (exam) => exam.passCriteriaPercent,
  },
  {
    key: 'createdAt',
    header: 'Created',
    render: (exam) => new Date(exam.createdAt).toLocaleDateString(),
    sortValue: (exam) => exam.createdAt,
  },
];

export default function PanelReportsPage() {
  // ponytail: pageSize:100 is the server's max -- an org with >100 exams silently omits #101+.
  // ListView's totalCount surfaces the shortfall; upgrade to a typeahead picker if it bites.
  const { data: examsResponse, isLoading, isError } = useExams(undefined, { pageSize: 100 });

  return (
    <ListView<ExamListItem>
      title="Results"
      icon={<BarChart3 size={20} />}
      columns={columns}
      rows={examsResponse?.data ?? []}
      rowKey={(exam) => exam.id}
      searchMatch={(exam, query) => exam.title.toLowerCase().includes(query)}
      storageKey="reports-exams"
      isLoading={isLoading}
      isError={isError}
      totalCount={examsResponse?.total}
      searchPlaceholder="Search exams…"
      emptyMessage="No exams yet."
    />
  );
}
