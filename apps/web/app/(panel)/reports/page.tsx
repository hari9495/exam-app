'use client';

import Link from 'next/link';
import { useExams } from '../../../lib/hooks/useExams';
import { Table, Badge, type Column } from '../../../components/ui';
import { ExamListItem, ExamStatus } from '../../../lib/types';

const STATUS_VARIANT: Record<ExamStatus, 'default' | 'success' | 'warning'> = {
  draft: 'warning',
  published: 'success',
  archived: 'default',
};

const columns: Column<ExamListItem>[] = [
  {
    key: 'title',
    header: 'Title',
    render: (exam) => <Link href={`/reports/${exam.id}`}>{exam.title}</Link>,
    sortValue: (exam) => exam.title,
  },
  { key: 'status', header: 'Status', render: (exam) => <Badge variant={STATUS_VARIANT[exam.status]}>{exam.status}</Badge> },
];

export default function PanelReportsPage() {
  const { data: exams, isLoading, isError } = useExams();

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
      <Table columns={columns} rows={exams ?? []} rowKey={(exam) => exam.id} emptyMessage="No exams yet." />
    </div>
  );
}
