'use client';

import Link from 'next/link';
import { useQuestions } from '../../../lib/hooks/useQuestions';
import { Table, Badge, Button, type Column } from '../../../components/ui';
import { Question } from '../../../lib/types';

const columns: Column<Question>[] = [
  { key: 'text', header: 'Question', render: (q) => q.text, sortValue: (q) => q.text },
  { key: 'type', header: 'Type', render: (q) => q.type },
  { key: 'difficulty', header: 'Difficulty', render: (q) => <Badge>{q.difficulty}</Badge>, sortValue: (q) => q.difficulty },
  { key: 'marks', header: 'Marks', render: (q) => String(q.marks), sortValue: (q) => q.marks },
  { key: 'edit', header: '', render: (q) => <Link href={`/questions/${q.id}/edit`}>Edit</Link> },
];

export default function QuestionsPage() {
  const { data: questions, isLoading, isError } = useQuestions();

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Question Bank</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Question Bank</h1>
        <p role="alert" className="text-sm text-red-600">
          Failed to load questions.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Question Bank</h1>
        <Link href="/questions/new">
          <Button>New question</Button>
        </Link>
      </div>
      <Table columns={columns} rows={questions ?? []} rowKey={(q) => q.id} emptyMessage="No questions yet." />
    </div>
  );
}
