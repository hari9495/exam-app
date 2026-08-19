'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Search, MoreHorizontal } from 'lucide-react';
import { useExams, useDuplicateExam, useArchiveExam } from '../../../lib/hooks/useExams';
import { PageHeader, PageSurface } from '../../../components/PageChrome';
import {
  Table,
  StatusBadge,
  Button,
  Modal,
  useToast,
  useColumnVisibility,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Pagination,
  FilterableHeader,
  type StatusTone,
  type Column,
} from '../../../components/ui';
import { ExamListItem, ExamStatus } from '../../../lib/types';

const STATUS_TONE: Record<ExamStatus, StatusTone> = {
  draft: 'neutral',
  published: 'success',
  archived: 'danger',
};

const STATUS_LABEL: Record<ExamStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

export default function ExamsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [examPendingDelete, setExamPendingDelete] = useState<ExamListItem | null>(null);
  const { data: examsResponse, isLoading, isError } = useExams(statusFilter === 'all' ? undefined : statusFilter, {
    page,
    pageSize: 20,
    search: search || undefined,
  });
  const router = useRouter();
  const { toast } = useToast();
  const duplicateExam = useDuplicateExam();
  const archiveExam = useArchiveExam();

  function handleDuplicate(examId: string) {
    duplicateExam.mutate(examId, {
      onSuccess: (created) => {
        toast('Exam duplicated.');
        router.push(`/exams/${created.id}/edit`);
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to duplicate exam.', 'error'),
    });
  }

  function handleConfirmDelete() {
    if (!examPendingDelete) return;
    archiveExam.mutate(examPendingDelete.id, {
      onSuccess: () => {
        toast('Exam deleted.');
        setExamPendingDelete(null);
      },
      onError: (error) => {
        toast(error instanceof Error ? error.message : 'Failed to delete exam.', 'error');
        setExamPendingDelete(null);
      },
    });
  }

  const columns: Column<ExamListItem>[] = [
    {
      key: 'title',
      header: 'Exam',
      render: (exam) => (
        <Link href={`/exams/${exam.id}/edit`} className="font-medium text-primary hover:underline">
          {exam.title}
        </Link>
      ),
      sortValue: (exam) => exam.title.toLowerCase(),
    },
    {
      key: 'status',
      header: (
        <FilterableHeader
          label="Status"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
          options={STATUS_FILTER_OPTIONS}
        />
      ),
      sortLabel: 'Status',
      render: (exam) => (
        <span className="flex items-center gap-1.5">
          {exam.walkInEnabled && <StatusBadge tone="info">Walk-in</StatusBadge>}
          <StatusBadge tone={STATUS_TONE[exam.status]}>{STATUS_LABEL[exam.status]}</StatusBadge>
        </span>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (exam) => `${exam.durationMinutes} min`,
      sortValue: (exam) => exam.durationMinutes,
    },
    {
      key: 'candidates',
      header: 'Candidates',
      render: (exam) => exam.invitationCount,
      sortValue: (exam) => exam.invitationCount,
    },
    {
      key: 'attempts',
      header: 'Attempts',
      // settled / total finalised results; a dash when nobody has attempted yet.
      render: (exam) => (exam.attemptTotalCount > 0 ? `${exam.attemptSettledCount}/${exam.attemptTotalCount}` : '—'),
      sortValue: (exam) => exam.attemptTotalCount,
    },
    {
      key: 'created',
      header: 'Created',
      render: (exam) => new Date(exam.createdAt).toLocaleDateString(),
      sortValue: (exam) => exam.createdAt,
    },
    {
      key: 'actions',
      header: '',
      render: (exam) => (
        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Link href={`/exams/${exam.id}/edit`} className="font-medium text-primary">
            Edit
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={duplicateExam.isPending}
              aria-label="More Actions"
              className="rounded p-1 text-muted hover:bg-ground"
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => handleDuplicate(exam.id)}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem className="text-status-danger" onSelect={() => setExamPendingDelete(exam)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const { visibleColumns, chooser } = useColumnVisibility('recruiter-exams', columns);
  // Kept out of `columns` (and so out of useColumnVisibility) so it can't be hidden via
  // the column chooser, same convention as ExamResultsPanel/CandidatesPanel.
  const indexColumn: Column<ExamListItem> = { key: 'index', header: '#', render: (_exam, index) => index + 1 };

  if (isLoading) {
    return (
      <div>
        <PageHeader eyebrow="Assessments" title="Exams" />
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <PageHeader eyebrow="Assessments" title="Exams" />
        <p role="alert" className="text-sm text-status-danger">
          Failed to load exams.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Assessments"
        title="Exams"
        actions={
          <Link href="/exams/new">
            <Button className="inline-flex items-center gap-1.5">
              <Plus size={14} />
              New exam
            </Button>
          </Link>
        }
      />
      <PageSurface>
        <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search exams…"
              aria-label="Search Exams"
              className="w-full rounded-lg border border-rule py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          {chooser}
        </div>
        <Table
          columns={[indexColumn, ...visibleColumns]}
          rows={examsResponse?.data ?? []}
          rowKey={(exam) => exam.id}
          emptyMessage="No exams yet."
        />
        <div className="px-4 py-3">
          <Pagination page={examsResponse?.page ?? 1} totalPages={examsResponse?.totalPages ?? 1} onPageChange={setPage} />
        </div>
      </PageSurface>

      {examPendingDelete && (
        <Modal open title="Delete Exam" onClose={() => setExamPendingDelete(null)}>
          <p className="mb-4 text-sm text-muted">
            Delete &ldquo;{examPendingDelete.title}&rdquo;? Candidates and results already collected for this exam are kept, but it
            will no longer appear in your exam list.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setExamPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={archiveExam.isPending} onClick={handleConfirmDelete}>
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
