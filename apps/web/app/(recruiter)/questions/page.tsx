'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useQuestions, useArchiveQuestion, useRestoreQuestion } from '../../../lib/hooks/useQuestions';
import { Select, Button, Modal, Pagination, StatusBadge, Table, useToast, useColumnVisibility, FilterableHeader, type Column } from '../../../components/ui';
import { groupQuestions, type GroupBy } from '../../../lib/question-grouping';
import { TYPE_TONE, TYPE_LABEL, DIFFICULTY_LABEL, DIFFICULTY_LEVEL } from '../../../lib/question-display';
import { Question } from '../../../lib/types';

// Numbered within its own group (topic, category, ...) so a recruiter can say "question 7
// under Arrays" -- not a running count across the whole filtered set, which would keep
// changing as other groups load/collapse.
type NumberedQuestion = Question & { number: number };

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'topic', label: 'Topic' },
  { value: 'category', label: 'Category' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'tag', label: 'Tag' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export default function QuestionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [status, setStatus] = useState('active');
  // "Group by" groups whatever's already loaded, which is one 20-row page by default -- a
  // topic with 15 real questions could show "3" if only 3 of them happened to land on the
  // current page (ADO #6843). Widen to the server's max page size while grouping so the
  // counts reflect (up to) the whole filtered set instead of one page of it.
  // ponytail: still a real ceiling for an org with >100 questions matching the filter -- a
  // dedicated backend group-by/count endpoint is the real fix if that becomes a problem.
  const effectivePageSize = groupBy === 'none' ? 20 : 100;
  const effectivePage = groupBy === 'none' ? page : 1;
  const { data: questions, isLoading, isError } = useQuestions({
    page: effectivePage,
    pageSize: effectivePageSize,
    search: search || undefined,
    status,
  });
  const [questionPendingDelete, setQuestionPendingDelete] = useState<Question | null>(null);
  const archiveQuestion = useArchiveQuestion();
  const restoreQuestion = useRestoreQuestion();
  const { toast } = useToast();
  // Collapsed by default: with many topics/categories, dumping every group's full row list
  // open at once is exactly the clutter grouping is meant to cut through. Keyed by group
  // label rather than index -- stable across a re-group even though group order can shift.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(label: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function handleConfirmDelete() {
    if (!questionPendingDelete) return;
    archiveQuestion.mutate(questionPendingDelete.id, {
      onSuccess: () => {
        toast('Question deleted.');
        setQuestionPendingDelete(null);
      },
      onError: (error) => {
        toast(error instanceof Error ? error.message : 'Failed to delete question.', 'error');
        setQuestionPendingDelete(null);
      },
    });
  }

  function handleRestore(question: Question) {
    restoreQuestion.mutate(question.id, {
      onSuccess: () => toast('Question restored.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to restore question.', 'error'),
    });
  }

  const columns: Column<NumberedQuestion>[] = [
    {
      key: 'number',
      header: '#',
      render: (question) => <span className="text-recruiter-text-tertiary">{question.number}</span>,
      sortValue: (question) => question.number,
    },
    {
      key: 'text',
      header: 'Question',
      render: (question) => (
        <Link
          href={`/questions/${question.id}/edit`}
          className="block max-w-md truncate font-medium text-primary hover:underline"
          title={question.text}
        >
          {question.text}
        </Link>
      ),
      sortValue: (question) => question.text.toLowerCase(),
    },
    {
      key: 'status',
      header: (
        <FilterableHeader
          label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={STATUS_OPTIONS}
        />
      ),
      sortLabel: 'Status',
      render: (question) => <StatusBadge tone={question.status === 'active' ? 'success' : 'neutral'}>{question.status === 'active' ? 'Active' : 'Archived'}</StatusBadge>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (question) => (
        <StatusBadge tone={TYPE_TONE[question.type] ?? 'neutral'}>{TYPE_LABEL[question.type] ?? question.type}</StatusBadge>
      ),
      sortValue: (question) => TYPE_LABEL[question.type] ?? question.type,
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      render: (question) => DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty,
      sortValue: (question) => DIFFICULTY_LEVEL[question.difficulty] ?? 0,
    },
    {
      key: 'marks',
      header: 'Marks',
      render: (question) => question.marks,
      sortValue: (question) => question.marks,
    },
    {
      key: 'topic',
      header: 'Topic',
      render: (question) => question.topic ?? '—',
      sortValue: (question) => question.topic ?? '',
    },
    {
      key: 'category',
      header: 'Category',
      render: (question) => question.category ?? '—',
      sortValue: (question) => question.category ?? '',
    },
    {
      key: 'actions',
      header: '',
      render: (question) => (
        <div className="flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {question.status === 'archived' ? (
            <button
              type="button"
              onClick={() => handleRestore(question)}
              disabled={restoreQuestion.isPending}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setQuestionPendingDelete(question)}
              className="text-xs font-medium text-status-danger hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];
  const { visibleColumns, chooser } = useColumnVisibility('recruiter-questions', columns);

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
  // Each group renders its own Table, so column-header sorting applies within a group.
  const groups = groupBy === 'none' ? [{ label: '', questions: rows }] : groupQuestions(rows, groupBy);

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
            aria-label="Search Questions"
            className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>

        <Select label="Group By" value={groupBy} onChange={(value) => setGroupBy(value as GroupBy)} options={GROUP_BY_OPTIONS} />
        {chooser}
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-recruiter-text-tertiary">
          {status === 'archived' ? 'No archived questions.' : 'No questions yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const totalMarks = group.questions.reduce((sum, question) => sum + (question.marks ?? 0), 0);
            const numberedQuestions: NumberedQuestion[] = group.questions.map((question, index) => ({ ...question, number: index + 1 }));
            const expanded = groupBy === 'none' || expandedGroups.has(group.label);
            return (
              <section key={group.label} className={groupBy !== 'none' ? 'overflow-hidden rounded-lg border border-recruiter-border' : undefined}>
                {groupBy !== 'none' && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={expanded}
                    className="flex w-full flex-wrap items-baseline gap-2 bg-recruiter-bg-subtle px-3 py-2 text-left"
                  >
                    <ChevronDown
                      size={14}
                      className={clsx('shrink-0 self-center text-recruiter-text-secondary transition-transform', !expanded && '-rotate-90')}
                      aria-hidden="true"
                    />
                    <h2 className="text-sm font-semibold text-recruiter-text">{group.label}</h2>
                    <span className="text-xs text-recruiter-text-tertiary">
                      {group.questions.length} {group.questions.length === 1 ? 'question' : 'questions'} · {totalMarks}{' '}
                      {totalMarks === 1 ? 'mark' : 'marks'}
                    </span>
                  </button>
                )}
                {expanded && (
                  <div className={groupBy !== 'none' ? 'p-3' : undefined}>
                    <Table columns={visibleColumns} rows={numberedQuestions} rowKey={(question) => question.id} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Paging is meaningless while grouped -- effectivePage is pinned to 1 above so every
          group's count stays consistent regardless of which "page" the control might show. */}
      {groupBy === 'none' && (
        <Pagination page={questions?.page ?? 1} totalPages={questions?.totalPages ?? 1} onPageChange={setPage} />
      )}

      {questionPendingDelete && (
        <Modal open title="Delete question" onClose={() => setQuestionPendingDelete(null)}>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            Delete this question? It will be removed from the question bank. Exams that already use it keep their copy.
          </p>
          <p className="mb-4 truncate text-sm font-medium text-recruiter-text" title={questionPendingDelete.text}>
            {questionPendingDelete.text}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setQuestionPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={archiveQuestion.isPending} onClick={handleConfirmDelete}>
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
