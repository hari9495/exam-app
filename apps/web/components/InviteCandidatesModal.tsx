'use client';

import { useState } from 'react';
import { useCandidates } from '../lib/hooks/useCandidates';
import { useBulkInvite } from '../lib/hooks/useInvitations';
import { useDebouncedValue } from '../lib/hooks/useDebouncedValue';
import { Modal, Checkbox, Button, useToast } from './ui';

interface InviteCandidatesModalProps {
  examId: string;
  open: boolean;
  onClose: () => void;
  existingCandidateIds: string[];
}

export function InviteCandidatesModal({ examId, open, onClose, existingCandidateIds }: InviteCandidatesModalProps) {
  const [search, setSearch] = useState('');
  // Server-side search (debounced): the typed term finds any active candidate, so #101+ are reachable
  // by name/email rather than capped by the page. status:'active' keeps deactivated candidates out.
  const debouncedSearch = useDebouncedValue(search, 250);
  const { data: candidatesResponse } = useCandidates({ pageSize: 50, search: debouncedSearch || undefined, status: 'active' });
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
    <Modal open={open} title="Invite Candidates" onClose={onClose}>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search candidates…"
        aria-label="Search Candidates"
        className="mb-3 w-full rounded-md border border-rule px-3 py-1.5 text-sm"
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
