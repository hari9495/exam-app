'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useExams, useDuplicateExam } from '../../../lib/hooks/useExams';
import { Table, Badge, Button, useToast, type Column } from '../../../components/ui';
import { Exam, ExamStatus } from '../../../lib/types';

const STATUS_VARIANT: Record<ExamStatus, 'default' | 'success' | 'warning'> = {
  draft: 'warning',
  published: 'success',
  archived: 'default',
};

export default function ExamsPage() {
  const { data: exams, isLoading, isError } = useExams();
  const router = useRouter();
  const { toast } = useToast();
  const duplicateExam = useDuplicateExam();

  function handleDuplicate(examId: string) {
    duplicateExam.mutate(examId, {
      onSuccess: (created) => {
        toast('Exam duplicated.');
        router.push(`/exams/${created.id}/edit`);
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to duplicate exam.', 'error'),
    });
  }

  const columns: Column<Exam>[] = [
    { key: 'title', header: 'Title', render: (exam) => exam.title, sortValue: (exam) => exam.title },
    { key: 'status', header: 'Status', render: (exam) => <Badge variant={STATUS_VARIANT[exam.status]}>{exam.status}</Badge> },
    { key: 'edit', header: '', render: (exam) => <Link href={`/exams/${exam.id}/edit`}>Edit</Link> },
    {
      key: 'duplicate',
      header: '',
      render: (exam) => (
        <Button variant="secondary" onClick={() => handleDuplicate(exam.id)} disabled={duplicateExam.isPending}>
          Duplicate
        </Button>
      ),
    },
  ];

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Exams</h1>
        <Link href="/exams/new">
          <Button>New exam</Button>
        </Link>
      </div>
      <Table columns={columns} rows={exams ?? []} rowKey={(exam) => exam.id} emptyMessage="No exams yet." />
    </div>
  );
}
