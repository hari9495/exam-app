'use client';

import { useState } from 'react';
import { useCandidates } from '../lib/hooks/useCandidates';
import { useBulkInvite } from '../lib/hooks/useInvitations';
import { Modal, Checkbox, Button, useToast } from './ui';

interface InviteCandidatesModalProps {
  examId: string;
  open: boolean;
  onClose: () => void;
  existingCandidateIds: string[];
}

export function InviteCandidatesModal({ examId, open, onClose, existingCandidateIds }: InviteCandidatesModalProps) {
  const [search, setSearch] = useState('');
  // ponytail: pageSize:100 is the server's max -- an org with >100 matching
  // candidates silently can't invite #101+ in one go. Upgrade path: replace
  // with a real paginated/typeahead picker if this becomes a real constraint.
  // status:'active' keeps deactivated candidates out of the invite path.
  const { data: candidatesResponse } = useCandidates({ pageSize: 100, search: search || undefined, status: 'active' });
  const candidates = (candidatesResponse?.data ?? []).filter((candidate) => !existingCandidateIds.includes(candidate.id));
  const bulkInvite = useBulkInvite(examId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { toast } = useToast();

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((existing) => existing !== id)));
  }

  function handleInvite() {
    bulkInvite.mutate(selectedIds, {
      onSuccess: (result) => {
        toast(`Invited ${result.created.length} candidate(s).${result.skipped.length ? ` ${result.skipped.length} skipped.` : ''}`);
        setSelectedIds([]);
        onClose();
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to send invitations.', 'error'),
    });
  }

  return (
    <Modal open={open} title="Invite candidates" onClose={onClose}>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search candidates…"
        aria-label="Search Candidates"
        className="mb-3 w-full rounded-md border border-recruiter-border px-3 py-1.5 text-sm"
      />
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {candidates.length === 0 && <p className="text-sm text-gray-500">No candidates available to invite.</p>}
        {candidates.map((candidate) => (
          <Checkbox
            key={candidate.id}
            label={`${candidate.name} (${candidate.email})`}
            checked={selectedIds.includes(candidate.id)}
            onChange={(checked) => toggle(candidate.id, checked)}
          />
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={handleInvite} disabled={selectedIds.length === 0} loading={bulkInvite.isPending}>
          Send invitations
        </Button>
      </div>
    </Modal>
  );
}
