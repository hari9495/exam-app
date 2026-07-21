'use client';

import Link from 'next/link';
import { useExams } from '../../../lib/hooks/useExams';
import { CardGrid, Badge } from '../../../components/ui';
import { ExamListItem, ExamStatus } from '../../../lib/types';

const STATUS_VARIANT: Record<ExamStatus, 'default' | 'success' | 'warning'> = {
  draft: 'warning',
  published: 'success',
  archived: 'default',
};

function renderCard(exam: ExamListItem) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Link href={`/reports/${exam.id}`} className="truncate text-sm font-semibold text-gray-900 hover:underline">
        {exam.title}
      </Link>
      <Badge variant={STATUS_VARIANT[exam.status]}>{exam.status}</Badge>
    </div>
  );
}

export default function PanelReportsPage() {
  // ponytail: pageSize:100 is the server's max -- an org with >100 exams
  // silently omits #101+ from this report list. Upgrade path: replace with a
  // real paginated/typeahead picker if this becomes a real constraint.
  const { data: examsResponse, isLoading, isError } = useExams(undefined, { pageSize: 100 });
  const exams = examsResponse?.data;

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Exams</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Exams</h1>
        <p role="alert" className="text-sm text-red-600">
          Failed to load exams.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Exams</h1>
      <CardGrid items={exams ?? []} cardKey={(exam) => exam.id} renderCard={renderCard} emptyMessage="No exams yet." />
    </div>
  );
}
