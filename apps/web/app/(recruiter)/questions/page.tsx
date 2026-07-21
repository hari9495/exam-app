'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useQuestions } from '../../../lib/hooks/useQuestions';
import { CardGrid, StatusBadge, Button, Pagination, type StatusTone } from '../../../components/ui';
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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data: questions, isLoading, isError } = useQuestions({ page, pageSize: 20, search: search || undefined });

  function renderCard(q: Question) {
    return (
      <div>
        <p className="mb-2.5 font-semibold text-recruiter-text">{q.text}</p>
        <div className="flex items-center justify-between border-t border-recruiter-border pt-2.5 text-xs">
          <div className="flex items-center gap-2">
            <StatusBadge tone={TYPE_TONE[q.type]}>{TYPE_LABEL[q.type]}</StatusBadge>
            <DifficultyDots difficulty={q.difficulty} />
            <span className="text-recruiter-text-tertiary">{q.marks} marks</span>
          </div>
          <Link
            href={`/questions/${q.id}/edit`}
            className="font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Edit
          </Link>
        </div>
      </div>
    );
  }

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
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search questions…"
            aria-label="Search questions"
            className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
      </div>
      <CardGrid items={questions?.data ?? []} cardKey={(q) => q.id} renderCard={renderCard} emptyMessage="No questions yet." />
      <Pagination page={questions?.page ?? 1} totalPages={questions?.totalPages ?? 1} onPageChange={setPage} />
    </div>
  );
}
