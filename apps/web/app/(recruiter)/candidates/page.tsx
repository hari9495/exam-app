'use client';

import { useEffect, useState } from 'react';
import { useCandidates, useCreateCandidate } from '../../../lib/hooks/useCandidates';
import { useExams } from '../../../lib/hooks/useExams';
import { useBulkInvite } from '../../../lib/hooks/useInvitations';
import { CandidateInviteForm } from '../../../components/CandidateInviteForm';
import { Table, Checkbox, Select, Button, useToast, type Column } from '../../../components/ui';
import { Candidate } from '../../../lib/types';

export default function CandidatesPage() {
  const { data: candidates, isLoading, isError } = useCandidates();
  const { data: publishedExams } = useExams('published');
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
    });
  }

  const columns: Column<Candidate>[] = [
    {
      key: 'select',
      header: '',
      render: (candidate) => (
        <Checkbox label={candidate.name} checked={selectedIds.includes(candidate.id)} onChange={(checked) => toggle(candidate.id, checked)} />
      ),
    },
    { key: 'email', header: 'Email', render: (candidate) => candidate.email, sortValue: (candidate) => candidate.email },
    { key: 'phone', header: 'Phone', render: (candidate) => candidate.phone ?? '—' },
  ];

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Candidates</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Candidates</h1>
        <p role="alert" className="text-sm text-red-600">
          Failed to load candidates.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Candidates</h1>
      <div className="mb-6">
        <CandidateInviteForm onSubmit={(input) => createCandidate.mutate(input)} />
      </div>
      <div className="mb-4 flex items-end gap-2">
        <Select
          label="Exam to invite to"
          value={examId}
          onChange={setExamId}
          options={(publishedExams ?? []).map((exam) => ({ value: exam.id, label: exam.title }))}
        />
        <Button onClick={handleInvite} disabled={!examId || selectedIds.length === 0}>
          Send invitations
        </Button>
      </div>
      <Table columns={columns} rows={candidates ?? []} rowKey={(candidate) => candidate.id} emptyMessage="No candidates yet." />
    </div>
  );
}
