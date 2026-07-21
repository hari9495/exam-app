'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { useCandidates, useCreateCandidate } from '../../../lib/hooks/useCandidates';
import { useExams } from '../../../lib/hooks/useExams';
import { useBulkInvite } from '../../../lib/hooks/useInvitations';
import { CandidateInviteForm } from '../../../components/CandidateInviteForm';
import { CardGrid, Checkbox, Select, Button, useToast, Pagination, type SortOption } from '../../../components/ui';
import { Candidate } from '../../../lib/types';

const CANDIDATE_SORT_OPTIONS: SortOption<Candidate>[] = [
  { key: 'name', label: 'Name', sortValue: (candidate) => candidate.name },
  { key: 'added', label: 'Added', sortValue: (candidate) => candidate.createdAt },
];

export default function CandidatesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data: candidatesResponse, isLoading, isError } = useCandidates({ page, pageSize: 20, search: search || undefined });
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

  function renderCard(candidate: Candidate) {
    return (
      <div className="flex items-start gap-2.5">
        <Checkbox
          label={candidate.name}
          hideLabel
          checked={selectedIds.includes(candidate.id)}
          onChange={(checked) => toggle(candidate.id, checked)}
        />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-recruiter-text">{candidate.name}</div>
          <div className="truncate text-xs text-recruiter-text-tertiary">{candidate.email}</div>
          <div className="mt-2 flex items-center justify-between border-t border-recruiter-border pt-2 text-xs text-recruiter-text-tertiary">
            <span>{candidate.phone ?? '—'}</span>
            <span>Added {new Date(candidate.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    );
  }

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
      <div className="mb-4.5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-recruiter-text">Candidates</h1>
        <Link href="/candidates/bulk-upload-invite">
          <Button variant="secondary">Upload &amp; invite</Button>
        </Link>
      </div>
      <div className="mb-6">
        <CandidateInviteForm
          onSubmit={(input) =>
            createCandidate.mutate(input, {
              onSuccess: () => toast('Candidate added.'),
              onError: (error) => toast(error instanceof Error ? error.message : 'Failed to add candidate.', 'error'),
            })
          }
        />
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
            aria-label="Search candidates"
            className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
        <Select
          label="Exam to invite to"
          value={examId}
          onChange={setExamId}
          options={(publishedExams ?? []).map((exam) => ({ value: exam.id, label: exam.title }))}
        />
        <Button onClick={handleInvite} disabled={!examId || selectedIds.length === 0} className="inline-flex items-center gap-1.5">
          <Plus size={14} />
          Send invitations
        </Button>
      </div>
      <CardGrid
        items={candidatesResponse?.data ?? []}
        cardKey={(candidate) => candidate.id}
        renderCard={renderCard}
        emptyMessage="No candidates yet."
        sortOptions={CANDIDATE_SORT_OPTIONS}
      />
      <Pagination page={candidatesResponse?.page ?? 1} totalPages={candidatesResponse?.totalPages ?? 1} onPageChange={setPage} />
    </div>
  );
}
