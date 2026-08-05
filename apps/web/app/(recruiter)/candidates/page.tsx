'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { useCandidates, useCreateCandidate, useUpdateCandidate, useDeleteCandidate } from '../../../lib/hooks/useCandidates';
import { useExams } from '../../../lib/hooks/useExams';
import { useBulkInvite } from '../../../lib/hooks/useInvitations';
import { CandidateInviteForm } from '../../../components/CandidateInviteForm';
import { CandidateEditModal } from '../../../components/CandidateEditModal';
import {
  Table,
  Checkbox,
  Select,
  Button,
  Modal,
  StatusBadge,
  useToast,
  useColumnVisibility,
  Pagination,
  FilterableHeader,
  type Column,
} from '../../../components/ui';
import { Candidate } from '../../../lib/types';

const STATUS_FILTER_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
];

export default function CandidatesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [candidateBeingEdited, setCandidateBeingEdited] = useState<Candidate | null>(null);
  const [candidatePendingDelete, setCandidatePendingDelete] = useState<Candidate | null>(null);
  const {
    data: candidatesResponse,
    isLoading,
    isError,
  } = useCandidates({
    page,
    pageSize: 20,
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });
  const updateCandidate = useUpdateCandidate();
  const deleteCandidate = useDeleteCandidate();
  // ponytail: pageSize:100 is the server's max -- an org with >100 published
  // exams silently omits #101+ from this invite dropdown. Upgrade path:
  // replace with a real paginated/typeahead picker if this becomes a real constraint.
  const { data: publishedExamsResponse } = useExams('published', { pageSize: 100 });
  const publishedExams = publishedExamsResponse?.data;
  const createCandidate = useCreateCandidate();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [examId, setExamId] = useState<string>('');
  const bulkInvite = useBulkInvite(examId);

  // ponytail: only auto-select when the choice is unambiguous (exactly one
  // published exam). With 0 or 2+ published exams, list order is
  // backend-determined and not meaningful to the recruiter -- silently
  // landing on exams[0] risked bulk-inviting candidates to the wrong exam.
  // Leave examId at '' so the disabled Send-invitations button forces an
  // explicit pick.
  useEffect(() => {
    if (!examId && publishedExams && publishedExams.length === 1) {
      setExamId(publishedExams[0].id);
    }
  }, [publishedExams, examId]);

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((existing) => existing !== id)));
  }

  function handleInvite() {
    bulkInvite.mutate(selectedIds, {
      onSuccess: (result) => {
        toast(`Invited ${result.created.length} candidate(s).${result.skipped.length ? ` ${result.skipped.length} skipped.` : ''}`);
        setSelectedIds([]);
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to send invitations.', 'error'),
    });
  }

  function handleToggleStatus(candidate: Candidate) {
    const nextStatus = candidate.status === 'inactive' ? 'active' : 'inactive';
    updateCandidate.mutate(
      { id: candidate.id, status: nextStatus },
      {
        onSuccess: () => toast(nextStatus === 'inactive' ? 'Candidate deactivated.' : 'Candidate reactivated.'),
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update candidate.', 'error'),
      },
    );
  }

  function handleConfirmDelete() {
    if (!candidatePendingDelete) return;
    deleteCandidate.mutate(candidatePendingDelete.id, {
      onSuccess: () => {
        toast('Candidate deleted.');
        setCandidatePendingDelete(null);
      },
      onError: (error) => {
        toast(error instanceof Error ? error.message : 'Failed to delete candidate.', 'error');
        setCandidatePendingDelete(null);
      },
    });
  }

  // Kept out of `columns` (and so out of useColumnVisibility below) so neither can be
  // hidden via the column chooser, same convention as ExamResultsPanel/CandidatesPanel.
  const selectColumn: Column<Candidate> = {
    key: 'select',
    header: '',
    render: (candidate) => (
      <Checkbox
        label={candidate.name}
        hideLabel
        checked={selectedIds.includes(candidate.id)}
        onChange={(checked) => toggle(candidate.id, checked)}
      />
    ),
  };
  const indexColumn: Column<Candidate> = { key: 'index', header: '#', render: (_candidate, index) => index + 1 };

  const columns: Column<Candidate>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (candidate) => <span className="font-medium text-recruiter-text">{candidate.name}</span>,
      sortValue: (candidate) => candidate.name.toLowerCase(),
    },
    {
      key: 'email',
      header: 'Email',
      render: (candidate) => <span className="text-recruiter-text-secondary">{candidate.email}</span>,
      sortValue: (candidate) => candidate.email,
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (candidate) => candidate.phone ?? '—',
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
      render: (candidate) => (
        <StatusBadge tone={candidate.status === 'inactive' ? 'neutral' : 'success'}>
          {candidate.status === 'inactive' ? 'Inactive' : 'Active'}
        </StatusBadge>
      ),
    },
    {
      key: 'added',
      header: 'Added',
      render: (candidate) => new Date(candidate.createdAt).toLocaleDateString(),
      sortValue: (candidate) => candidate.createdAt,
    },
    {
      key: 'actions',
      header: '',
      render: (candidate) => {
        const isInactive = candidate.status === 'inactive';
        const neverInvited = (candidate.invitationCount ?? 0) === 0;
        return (
          <div className="flex items-center gap-2 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button type="button" onClick={() => setCandidateBeingEdited(candidate)} className="font-medium text-primary">
              Edit
            </button>
            <button
              type="button"
              onClick={() => handleToggleStatus(candidate)}
              disabled={updateCandidate.isPending}
              className="font-medium text-recruiter-text-secondary hover:underline disabled:opacity-50"
            >
              {isInactive ? 'Reactivate' : 'Deactivate'}
            </button>
            {neverInvited && (
              <button
                type="button"
                onClick={() => setCandidatePendingDelete(candidate)}
                className="font-medium text-status-danger hover:underline"
              >
                Delete
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const { visibleColumns, chooser } = useColumnVisibility('recruiter-candidates', columns);

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Candidates</h1>
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Candidates</h1>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load candidates.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-recruiter-text">Candidates</h1>
        <div className="flex items-center gap-2">
          <CandidateInviteForm
            onSubmit={(input) =>
              createCandidate.mutate(input, {
                onSuccess: () => toast('Candidate added.'),
                onError: (error) => toast(error instanceof Error ? error.message : 'Failed to add candidate.', 'error'),
              })
            }
          />
          <Link href="/candidates/bulk-upload-invite">
            <Button variant="secondary">Upload &amp; invite</Button>
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
            placeholder="Search candidates…"
            aria-label="Search Candidates"
            className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
        <Select
          label="Exam To Invite To"
          value={examId}
          onChange={setExamId}
          options={(publishedExams ?? []).map((exam) => ({ value: exam.id, label: exam.title }))}
        />
        <Button onClick={handleInvite} disabled={!examId || selectedIds.length === 0} className="inline-flex items-center gap-1.5">
          <Plus size={14} />
          Send invitations
        </Button>
        {chooser}
      </div>
      <Table
        columns={[selectColumn, indexColumn, ...visibleColumns]}
        rows={candidatesResponse?.data ?? []}
        rowKey={(candidate) => candidate.id}
        emptyMessage="No candidates yet."
      />
      <Pagination page={candidatesResponse?.page ?? 1} totalPages={candidatesResponse?.totalPages ?? 1} onPageChange={setPage} />

      {candidateBeingEdited && (
        <CandidateEditModal candidate={candidateBeingEdited} onClose={() => setCandidateBeingEdited(null)} />
      )}

      {candidatePendingDelete && (
        <Modal open title="Delete candidate" onClose={() => setCandidatePendingDelete(null)}>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            Permanently delete &ldquo;{candidatePendingDelete.name}&rdquo;? They have never been invited to an exam, so nothing else
            is affected. This can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCandidatePendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleteCandidate.isPending} onClick={handleConfirmDelete}>
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
