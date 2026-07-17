'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Search, MoreHorizontal } from 'lucide-react';
import { useExams, useDuplicateExam } from '../../../lib/hooks/useExams';
import {
  Table,
  StatusBadge,
  Button,
  useToast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  type Column,
  type StatusTone,
} from '../../../components/ui';
import { Exam, ExamStatus } from '../../../lib/types';

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

export default function ExamsPage() {
  const { data: exams, isLoading, isError } = useExams();
  const router = useRouter();
  const { toast } = useToast();
  const duplicateExam = useDuplicateExam();
  const [search, setSearch] = useState('');

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
    {
      key: 'title',
      header: 'Exam',
      render: (exam) => (
        <div>
          <div className="font-semibold text-recruiter-text">{exam.title}</div>
          <div className="text-xs text-recruiter-text-tertiary">{exam.durationMinutes} min</div>
        </div>
      ),
      sortValue: (exam) => exam.title,
    },
    {
      key: 'status',
      header: 'Status',
      render: (exam) => <StatusBadge tone={STATUS_TONE[exam.status]}>{STATUS_LABEL[exam.status]}</StatusBadge>,
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (exam) =>
        exam.attemptTotalCount === 0 ? (
          <span className="text-xs text-recruiter-text-tertiary">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-[70px] overflow-hidden rounded-full bg-recruiter-bg-subtle">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((exam.attemptSettledCount / exam.attemptTotalCount) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-recruiter-text-tertiary">
              {exam.attemptSettledCount}/{exam.attemptTotalCount}
            </span>
          </div>
        ),
    },
    { key: 'candidates', header: 'Candidates', render: (exam) => exam.invitationCount },
    {
      key: 'created',
      header: 'Created',
      render: (exam) => <span className="text-recruiter-text-tertiary">{new Date(exam.createdAt).toLocaleDateString()}</span>,
      sortValue: (exam) => exam.createdAt,
    },
    {
      key: 'actions',
      header: '',
      render: (exam) => (
        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Link href={`/exams/${exam.id}/edit`} className="text-xs font-medium text-primary">
            Edit
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={duplicateExam.isPending}
              aria-label="More actions"
              className="rounded p-1 text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle"
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => handleDuplicate(exam.id)}>Duplicate</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Exams</h1>
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Exams</h1>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load exams.
        </p>
      </div>
    );
  }

  const filtered = (exams ?? []).filter((exam) => exam.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="mb-4.5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-recruiter-text">Exams</h1>
        <Link href="/exams/new">
          <Button className="inline-flex items-center gap-1.5">
            <Plus size={14} />
            New exam
          </Button>
        </Link>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-recruiter-text-tertiary" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search exams…"
            aria-label="Search exams"
            className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
      </div>
      <Table columns={columns} rows={filtered} rowKey={(exam) => exam.id} emptyMessage="No exams yet." />
    </div>
  );
}
