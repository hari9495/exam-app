'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useQuestions } from '../../../lib/hooks/useQuestions';
import { CardGrid, Select, Button, Pagination, type SortOption } from '../../../components/ui';
import { QuestionPreviewCard } from '../../../components/QuestionPreviewCard';
import { groupQuestions, type GroupBy } from '../../../lib/question-grouping';
import { Question, Difficulty } from '../../../lib/types';

const DIFFICULTY_LEVEL: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

const QUESTION_SORT_OPTIONS: SortOption<Question>[] = [
  { key: 'text', label: 'Text', sortValue: (q) => q.text },
  { key: 'difficulty', label: 'Difficulty', sortValue: (q) => DIFFICULTY_LEVEL[q.difficulty] },
  { key: 'marks', label: 'Marks', sortValue: (q) => q.marks },
];

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'topic', label: 'Topic' },
  { value: 'category', label: 'Category' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'tag', label: 'Tag' },
];

const CARD_SHELL = 'group rounded-2xl border border-recruiter-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md';

export default function QuestionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const { data: questions, isLoading, isError } = useQuestions({ page, pageSize: 20, search: search || undefined });

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

  const rows = questions?.data ?? [];
  const groups = groupBy === 'none' ? [] : groupQuestions(rows, groupBy);

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
      <div className="mb-3 flex items-end gap-2">
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
        <Select label="Group by" value={groupBy} onChange={(value) => setGroupBy(value as GroupBy)} options={GROUP_BY_OPTIONS} />
      </div>

      {groupBy === 'none' ? (
        <CardGrid
          items={rows}
          cardKey={(q) => q.id}
          renderCard={(q) => <QuestionPreviewCard question={q} />}
          emptyMessage="No questions yet."
          sortOptions={QUESTION_SORT_OPTIONS}
        />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-recruiter-text-tertiary">No questions yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => {
            const totalMarks = group.questions.reduce((sum, question) => sum + (question.marks ?? 0), 0);
            return (
              <section key={group.label}>
                <div className="mb-2.5 flex flex-wrap items-baseline gap-2 border-b border-recruiter-border pb-1.5">
                  <h2 className="text-sm font-semibold text-recruiter-text">{group.label}</h2>
                  <span className="text-xs text-recruiter-text-tertiary">
                    {group.questions.length} {group.questions.length === 1 ? 'question' : 'questions'} · {totalMarks}{' '}
                    {totalMarks === 1 ? 'mark' : 'marks'}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.questions.map((question) => (
                    <div key={question.id} className={CARD_SHELL}>
                      <QuestionPreviewCard question={question} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Pagination page={questions?.page ?? 1} totalPages={questions?.totalPages ?? 1} onPageChange={setPage} />
    </div>
  );
}
