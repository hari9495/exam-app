'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useQuestions } from '../../../lib/hooks/useQuestions';
import { Table, StatusBadge, Button, type Column, type StatusTone } from '../../../components/ui';
import { Question, QuestionType, Difficulty } from '../../../lib/types';

const TYPE_TONE: Record<QuestionType, StatusTone> = {
  single_mcq: 'info',
  multi_mcq: 'info',
  true_false: 'info',
  code: 'purple',
};

const TYPE_LABEL: Record<QuestionType, string> = {
  single_mcq: 'MCQ',
  multi_mcq: 'MCQ',
  true_false: 'True/False',
  code: 'Code',
};

const DIFFICULTY_LEVEL: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

function DifficultyDots({ difficulty }: { difficulty: Difficulty }) {
  const level = DIFFICULTY_LEVEL[difficulty];
  return (
    <div className="flex gap-0.5" aria-label={`Difficulty: ${difficulty}`}>
      {[1, 2, 3].map((dot) => (
        <span key={dot} className={dot <= level ? 'h-1.5 w-1.5 rounded-full bg-primary' : 'h-1.5 w-1.5 rounded-full bg-recruiter-border'} />
      ))}
    </div>
  );
}

export default function QuestionsPage() {
  const { data: questions, isLoading, isError } = useQuestions();
  const [search, setSearch] = useState('');

  const columns: Column<Question>[] = [
    { key: 'text', header: 'Question', render: (q) => <span className="font-semibold text-recruiter-text">{q.text}</span>, sortValue: (q) => q.text },
    { key: 'type', header: 'Type', render: (q) => <StatusBadge tone={TYPE_TONE[q.type]}>{TYPE_LABEL[q.type]}</StatusBadge> },
    { key: 'difficulty', header: 'Difficulty', render: (q) => <DifficultyDots difficulty={q.difficulty} />, sortValue: (q) => DIFFICULTY_LEVEL[q.difficulty] },
    { key: 'marks', header: 'Marks', render: (q) => String(q.marks), sortValue: (q) => q.marks },
    {
      key: 'actions',
      header: '',
      render: (q) => (
        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Link href={`/questions/${q.id}/edit`} className="text-xs font-medium text-primary">
            Edit
          </Link>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Question Bank</h1>
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Question Bank</h1>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load questions.
        </p>
      </div>
    );
  }

  const filtered = (questions ?? []).filter((q) => q.text.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="mb-4.5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-recruiter-text">Question Bank</h1>
        <div className="flex gap-2">
          <Link href="/questions/bulk-upload">
            <Button variant="secondary">Bulk upload</Button>
          </Link>
          <Link href="/questions/new">
            <Button className="inline-flex items-center gap-1.5">
              <Plus size={14} />
              New question
            </Button>
          </Link>
        </div>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-recruiter-text-tertiary" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search questions…"
            aria-label="Search questions"
            className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
      </div>
      <Table columns={columns} rows={filtered} rowKey={(q) => q.id} emptyMessage="No questions yet." />
    </div>
  );
}
