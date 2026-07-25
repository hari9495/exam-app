'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search, LayoutGrid, List, ArrowUp, ArrowDown } from 'lucide-react';
import clsx from 'clsx';
import { useQuestions } from '../../../lib/hooks/useQuestions';
import { Select, Button, Pagination } from '../../../components/ui';
import { QuestionPreviewCard } from '../../../components/QuestionPreviewCard';
import { QuestionListRow } from '../../../components/QuestionListRow';
import { groupQuestions, type GroupBy } from '../../../lib/question-grouping';
import { DIFFICULTY_LEVEL } from '../../../lib/question-display';
import { Question } from '../../../lib/types';

type ViewMode = 'cards' | 'list';
type SortKey = 'default' | 'text' | 'difficulty' | 'marks';

const SORT_VALUE: Record<Exclude<SortKey, 'default'>, (question: Question) => string | number> = {
  text: (question) => question.text,
  difficulty: (question) => DIFFICULTY_LEVEL[question.difficulty] ?? 0,
  marks: (question) => question.marks,
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'default', label: 'Default order' },
  { value: 'text', label: 'Text' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'marks', label: 'Marks' },
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
  const [view, setView] = useState<ViewMode>('cards');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
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

  // Sorted before grouping, so each group's questions inherit the sort order
  // (grouping preserves the order questions arrive in).
  const sortValue = sortKey === 'default' ? null : SORT_VALUE[sortKey];
  const sorted = sortValue
    ? [...rows].sort((a, b) => {
        const av = sortValue(a);
        const bv = sortValue(b);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : rows;

  const groups = groupBy === 'none' ? [{ label: '', questions: sorted }] : groupQuestions(sorted, groupBy);

  function renderQuestions(groupQuestionsList: Question[]) {
    if (view === 'list') {
      return (
        <div className="overflow-hidden rounded-xl border border-recruiter-border bg-white">
          {groupQuestionsList.map((question) => (
            <QuestionListRow key={question.id} question={question} />
          ))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groupQuestionsList.map((question) => (
          <div key={question.id} className={CARD_SHELL}>
            <QuestionPreviewCard question={question} />
          </div>
        ))}
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

      <div className="mb-3 flex flex-wrap items-end gap-2">
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

        <Select label="Sort by" value={sortKey} onChange={(value) => setSortKey(value as SortKey)} options={SORT_OPTIONS} />
        <button
          type="button"
          aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
          disabled={sortKey === 'default'}
          onClick={() => setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))}
          className="rounded border border-recruiter-border p-2 text-recruiter-text-tertiary transition-colors hover:bg-recruiter-bg-subtle disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        </button>

        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-recruiter-border">
          <button
            type="button"
            onClick={() => setView('cards')}
            aria-pressed={view === 'cards'}
            className={clsx(
              'inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium transition-colors',
              view === 'cards' ? 'bg-recruiter-bg-subtle text-recruiter-text' : 'text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle',
            )}
          >
            <LayoutGrid size={14} />
            Cards
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            className={clsx(
              'inline-flex items-center gap-1.5 border-l border-recruiter-border px-2.5 py-2 text-xs font-medium transition-colors',
              view === 'list' ? 'bg-recruiter-bg-subtle text-recruiter-text' : 'text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle',
            )}
          >
            <List size={14} />
            List
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-recruiter-text-tertiary">No questions yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => {
            const totalMarks = group.questions.reduce((sum, question) => sum + (question.marks ?? 0), 0);
            return (
              <section key={group.label}>
                {groupBy !== 'none' && (
                  <div className="mb-2.5 flex flex-wrap items-baseline gap-2 border-b border-recruiter-border pb-1.5">
                    <h2 className="text-sm font-semibold text-recruiter-text">{group.label}</h2>
                    <span className="text-xs text-recruiter-text-tertiary">
                      {group.questions.length} {group.questions.length === 1 ? 'question' : 'questions'} · {totalMarks}{' '}
                      {totalMarks === 1 ? 'mark' : 'marks'}
                    </span>
                  </div>
                )}
                {renderQuestions(group.questions)}
              </section>
            );
          })}
        </div>
      )}

      <Pagination page={questions?.page ?? 1} totalPages={questions?.totalPages ?? 1} onPageChange={setPage} />
    </div>
  );
}
