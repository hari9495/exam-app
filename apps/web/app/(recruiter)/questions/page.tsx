'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useQuestions, useArchiveQuestion, useRestoreQuestion, useFlaggedQuestions } from '../../../lib/hooks/useQuestions';
import { Select, Button, Checkbox, Modal, Pagination, StatusBadge, Table, useToast, useColumnVisibility, FilterableHeader, type Column } from '../../../components/ui';
import { GenerateQuestionsModal } from '../../../components/GenerateQuestionsModal';
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
  { value: 'draft', label: 'Drafts' },
  { value: 'archived', label: 'Archived' },
];

export default function QuestionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [status, setStatus] = useState('active');
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  // "Group by" groups whatever's already loaded, which is one 20-row page by default -- a
  // topic with 15 real questions could show "3" if only 3 of them happened to land on the
  // current page (ADO #6843). Widen to the server's max page size while grouping so the
  // counts reflect (up to) the whole filtered set instead of one page of it.
  // "Needs review" has the identical problem: `rows` below intersects the flagged set against
  // whatever page is loaded, so the single worst (critical) question in the bank could sit on
  // page 12 while page 1 shows nothing but `info`-level items. Widen and pin to page 1 here too.
  // ponytail: still a real ceiling for an org with >100 questions matching the filter -- a
  // dedicated backend group-by/count endpoint is the real fix if that becomes a problem.
  const widenPage = groupBy !== 'none' || needsReviewOnly;
  const effectivePageSize = widenPage ? 100 : 20;
  const effectivePage = widenPage ? 1 : page;
  const { data: questions, isLoading, isError } = useQuestions({
    page: effectivePage,
    pageSize: effectivePageSize,
    search: search || undefined,
    status,
  });
  // pageSize 1: we only want `total`, not the rows. Runs on every status view so the count is
  // visible from Active, which is where a recruiter actually is.
  const { data: draftCount } = useQuestions({ status: 'draft', pageSize: 1 });
  const pendingDrafts = draftCount?.total ?? 0;
  // Worst-first, per the API's own ordering -- never re-sorted client-side (see below).
  const { data: flaggedQuestions } = useFlaggedQuestions();
  const [questionPendingDelete, setQuestionPendingDelete] = useState<Question | null>(null);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const archiveQuestion = useArchiveQuestion();
  const restoreQuestion = useRestoreQuestion();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fetchedRows = questions?.data ?? [];
  // Read-only shortlist: never a re-sort, just an intersection with the current page's rows,
  // walked in the flagged API's own worst-first order (critical, then warning, then info).
  const rows = needsReviewOnly
    ? (flaggedQuestions ?? [])
        .map((flagged) => fetchedRows.find((question) => question.id === flagged.questionId))
        .filter((question): question is Question => Boolean(question))
    : fetchedRows;

  // The widened page above caps at 100, and the question list is ordered `createdAt desc` --
  // so the window is the NEWEST 100, while a question can only be flagged once it has 20+
  // responses, which correlates with age. The truncation is therefore biased AGAINST exactly
  // the questions that can be flagged, and a flagged question in another status never appears
  // at all. Without this line the button would claim 56 while the list showed ten, silently.
  const hiddenFlaggedCount = needsReviewOnly ? Math.max(0, (flaggedQuestions?.length ?? 0) - rows.length) : 0;

  // Bulk select/publish/discard -- only meaningful in the Drafts view (see the checkbox column
  // below). Carrying a selection across a status, page, search, or Needs review change would act
  // on rows the recruiter can no longer see, so it's cleared whenever any of them moves.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionPending, setBulkActionPending] = useState(false);
  useEffect(() => {
    setSelectedIds(new Set());
  }, [status, page, search, needsReviewOnly]);

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

  // Each group renders its own Table, so column-header sorting applies within a group. Computed
  // here (ahead of the early returns below) because visibleRowIds needs it too.
  const groups = groupBy === 'none' ? [{ label: '', questions: rows }] : groupQuestions(rows, groupBy);

  // A row can drop out of view two ways without status/page/search moving: a per-row
  // Publish/Discard refetches this view and the row it acted on is simply gone, or its group
  // gets collapsed -- the row stays in `rows` (the fetched page) but nothing renders in the DOM.
  // Deriving the visible set from the *expanded* groups, not from `rows`, is what keeps a bulk
  // action from ever reaching a row the recruiter can't currently see.
  const visibleRowIds = new Set(
    groups
      .filter((group) => groupBy === 'none' || expandedGroups.has(group.label))
      .flatMap((group) => group.questions.map((question) => question.id)),
  );
  const selectedVisibleIds = Array.from(selectedIds).filter((id) => visibleRowIds.has(id));

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // N separate requests, not a batch endpoint -- there isn't one. allSettled so one failure
  // doesn't cancel the rest, and the toast always states the real count so a recruiter is never
  // told "published 7" when only 5 landed.
  async function handleBulkAction(action: 'publish' | 'discard') {
    // Never the raw selection -- an id whose row has already left `rows` (a per-row action, a
    // refetch) must not be recounted or resubmitted, only what's still actually on screen.
    const ids = selectedVisibleIds;
    const mutation = action === 'publish' ? restoreQuestion : archiveQuestion;
    const verb = action === 'publish' ? 'published' : 'discarded';
    setBulkActionPending(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => mutation.mutateAsync(id)));
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed === 0) {
        toast(`${ids.length} question${ids.length === 1 ? '' : 's'} ${verb}.`);
      } else {
        toast(`${ids.length - failed} of ${ids.length} ${verb} — ${failed} failed.`, 'error');
      }
      setSelectedIds(new Set());
    } finally {
      setBulkActionPending(false);
    }
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
    // Same endpoint (archived -> active or draft -> active) but the toast copy must match what
    // actually happened -- a draft was never archived, so "restored" would be misleading there.
    const isDraft = question.status === 'draft';
    restoreQuestion.mutate(question.id, {
      onSuccess: () => toast(isDraft ? 'Question published.' : 'Question restored.'),
      onError: (error) =>
        toast(error instanceof Error ? error.message : isDraft ? 'Failed to publish question.' : 'Failed to restore question.', 'error'),
    });
  }

  const selectionColumn: Column<NumberedQuestion> | null =
    status === 'draft'
      ? {
          key: '__select',
          // Only meaningful ungrouped -- bound to the whole page (`rows`). The grouped case gets
          // its own column per group below, scoped to that group's own rows.
          header:
            groupBy === 'none' ? (
              <Checkbox
                checked={rows.length > 0 && rows.every((question) => selectedIds.has(question.id))}
                onChange={(checked) => setSelectedIds(checked ? new Set(rows.map((question) => question.id)) : new Set())}
                label="Select all questions on this page"
                hideLabel
              />
            ) : null,
          width: '3%',
          render: (question) => (
            <Checkbox
              checked={selectedIds.has(question.id)}
              onChange={() => toggleSelected(question.id)}
              label={`Select question ${question.id}`}
              hideLabel
            />
          ),
        }
      : null;

  // Grouped view renders one <Table> per group -- this binds a select-all to that one group's
  // own rows (`group.questions`, in hand where the tables render below), so checking it can
  // never reach into a different, possibly-collapsed group. Safe by construction: visibleRowIds
  // above already restricts bulk actions to expanded groups regardless of what's in selectedIds.
  function groupSelectionColumn(group: { label: string; questions: Question[] }): Column<NumberedQuestion> {
    return {
      key: '__select',
      header: (
        <Checkbox
          checked={group.questions.length > 0 && group.questions.every((question) => selectedIds.has(question.id))}
          onChange={(checked) =>
            setSelectedIds((current) => {
              const next = new Set(current);
              for (const question of group.questions) {
                if (checked) next.add(question.id);
                else next.delete(question.id);
              }
              return next;
            })
          }
          label={`Select all questions in ${group.label}`}
          hideLabel
        />
      ),
      width: '3%',
      render: (question) => (
        <Checkbox
          checked={selectedIds.has(question.id)}
          onChange={() => toggleSelected(question.id)}
          label={`Select question ${question.id}`}
          hideLabel
        />
      ),
    };
  }

  // Kept out of useColumnVisibility (below) and prepended after it: hiding this column would
  // strand an in-progress selection with no way to bring it back except clearing storage --
  // ExamResultsPanel's selectColumn (components/ExamResultsPanel.tsx) is the same call.
  const dataColumns: Column<NumberedQuestion>[] = [
    {
      key: 'number',
      header: '#',
      width: '3%',
      render: (question) => <span className="text-recruiter-text-tertiary">{question.number}</span>,
      sortValue: (question) => question.number,
    },
    {
      key: 'text',
      header: 'Question',
      width: '28%',
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
      width: '10%',
      sortLabel: 'Status',
      render: (question) => {
        const tone = question.status === 'active' ? 'success' : question.status === 'draft' ? 'warning' : 'neutral';
        const label = question.status === 'active' ? 'Active' : question.status === 'draft' ? 'Draft' : 'Archived';
        return <StatusBadge tone={tone}>{label}</StatusBadge>;
      },
    },
    {
      key: 'type',
      header: 'Type',
      width: '9%',
      render: (question) => (
        <StatusBadge tone={TYPE_TONE[question.type] ?? 'neutral'}>{TYPE_LABEL[question.type] ?? question.type}</StatusBadge>
      ),
      sortValue: (question) => TYPE_LABEL[question.type] ?? question.type,
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      width: '10%',
      render: (question) => DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty,
      sortValue: (question) => DIFFICULTY_LEVEL[question.difficulty] ?? 0,
    },
    {
      key: 'marks',
      header: 'Marks',
      width: '7%',
      render: (question) => question.marks,
      sortValue: (question) => question.marks,
    },
    {
      key: 'topic',
      header: 'Topic',
      width: '15%',
      render: (question) => (
        <span className="block max-w-[10rem] truncate" title={question.topic ?? undefined}>
          {question.topic ?? '—'}
        </span>
      ),
      sortValue: (question) => question.topic ?? '',
    },
    {
      key: 'category',
      header: 'Category',
      width: '15%',
      render: (question) => (
        <span className="block max-w-[10rem] truncate" title={question.category ?? undefined}>
          {question.category ?? '—'}
        </span>
      ),
      sortValue: (question) => question.category ?? '',
    },
    {
      key: 'actions',
      header: '',
      width: '3%',
      render: (question) => (
        <div className="flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {question.status === 'draft' ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleRestore(question)}
                disabled={restoreQuestion.isPending}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                Publish
              </button>
              <button
                type="button"
                onClick={() =>
                  archiveQuestion.mutate(question.id, {
                    onSuccess: () => toast('Question discarded.'),
                    onError: (error) => toast(error instanceof Error ? error.message : 'Failed to discard question.', 'error'),
                  })
                }
                disabled={archiveQuestion.isPending}
                className="text-xs font-medium text-status-danger hover:underline disabled:opacity-50"
              >
                Discard
              </button>
            </div>
          ) : question.status === 'archived' ? (
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
  const { visibleColumns, chooser } = useColumnVisibility('recruiter-questions', dataColumns);

  function columnsForGroup(group: { label: string; questions: Question[] }): Column<NumberedQuestion>[] {
    if (!selectionColumn) return visibleColumns;
    const select = groupBy === 'none' ? selectionColumn : groupSelectionColumn(group);
    return [select, ...visibleColumns];
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
          <Button type="button" variant="secondary" onClick={() => setGenerateModalOpen(true)}>
            Generate with AI
          </Button>
          <Link href="/questions/new">
            <Button className="inline-flex items-center gap-1.5">
              <Plus size={14} />
              New question
            </Button>
          </Link>
        </div>
      </div>

      {pendingDrafts > 0 && (
        <button
          type="button"
          onClick={() => {
            setStatus('draft');
            setPage(1);
          }}
          className="mb-3 block text-sm font-medium text-primary hover:underline"
        >
          {pendingDrafts} {pendingDrafts === 1 ? 'draft' : 'drafts'} awaiting review
        </button>
      )}

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
        {/* Rendered once something is actually flagged -- an always-visible "(0)" control trains
            recruiters to ignore it. Also rendered whenever the filter is already on, even if the
            flagged set has since emptied out from under it, so there's always a way to turn it
            back off (a transient "(0)" while filtering is honest, not noise). */}
        {((flaggedQuestions && flaggedQuestions.length > 0) || needsReviewOnly) && (
          <Button
            type="button"
            variant={needsReviewOnly ? 'primary' : 'secondary'}
            aria-pressed={needsReviewOnly}
            onClick={() => {
              setNeedsReviewOnly((current) => !current);
              setPage(1);
            }}
          >
            {`Needs review (${flaggedQuestions?.length ?? 0})`}
          </Button>
        )}
        {chooser}
      </div>

      {status === 'draft' && selectedVisibleIds.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-recruiter-border bg-recruiter-bg-subtle px-3 py-2">
          <span className="text-sm text-recruiter-text-secondary">{selectedVisibleIds.length} selected</span>
          <Button type="button" size="sm" loading={bulkActionPending} onClick={() => handleBulkAction('publish')}>
            {`Publish selected (${selectedVisibleIds.length})`}
          </Button>
          <Button type="button" size="sm" variant="danger" loading={bulkActionPending} onClick={() => handleBulkAction('discard')}>
            {`Discard selected (${selectedVisibleIds.length})`}
          </Button>
        </div>
      )}

      {hiddenFlaggedCount > 0 && rows.length > 0 && (
        <p className="mb-3 text-sm text-recruiter-text-secondary">
          {`Showing ${rows.length} of ${flaggedQuestions?.length ?? 0} flagged questions. The rest sit outside this view — a different status, or beyond the first 100 questions.`}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-recruiter-text-tertiary">
          <p>
            {needsReviewOnly
              ? // The generic copy below would otherwise sit right under a "Needs review (N)"
                // control still showing N > 0 -- a flagged question can sit outside the current
                // view (a different status, page, or excluded by search) even though the flagged
                // set itself isn't empty. Say so explicitly instead of claiming there's nothing.
                `No flagged questions in this view. ${flaggedQuestions?.length ?? 0} question${
                  (flaggedQuestions?.length ?? 0) === 1 ? ' needs' : 's need'
                } review under a different status or search.`
              : status === 'archived'
                ? 'No archived questions.'
                : status === 'draft'
                  ? 'No drafts to review.'
                  : 'No questions yet.'}
          </p>
          {/* The Status filter lives inside the Table's column header, which never renders when
              there are no rows -- without this, draining a non-active view (the designed happy
              path once Discard/Publish empty the Drafts list) leaves status stuck with no way
              back except a page reload. */}
          {status !== 'active' && (
            <button
              type="button"
              onClick={() => {
                setStatus('active');
                setPage(1);
              }}
              className="mt-2 font-medium text-primary hover:underline"
            >
              Back to Active
            </button>
          )}
        </div>
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
                    <Table columns={columnsForGroup(group)} rows={numberedQuestions} rowKey={(question) => question.id} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Paging is meaningless while grouped or while Needs review is active -- effectivePage is
          pinned to 1 above in both cases, so every group's count (or the flagged shortlist)
          stays consistent regardless of which "page" the control might show. */}
      {!widenPage && (
        <Pagination page={questions?.page ?? 1} totalPages={questions?.totalPages ?? 1} onPageChange={setPage} />
      )}

      {questionPendingDelete && (
        <Modal open title="Delete Question" onClose={() => setQuestionPendingDelete(null)}>
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

      <GenerateQuestionsModal
        open={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        onCompleted={() => {
          // The count query has a 30s staleTime and nothing else invalidates ['questions'] when
          // a job lands -- without this, the pending-drafts count and the Drafts list can lag a
          // just-completed generation.
          queryClient.invalidateQueries({ queryKey: ['questions'] });
          setStatus('draft');
          setPage(1);
        }}
      />
    </div>
  );
}
