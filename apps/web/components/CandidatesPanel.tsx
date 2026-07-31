'use client';

import { useState } from 'react';
import { Table, Button, StatusBadge, useToast, type Column, type StatusTone } from './ui';
import { useExamInvitations, useUpdateAccommodation } from '../lib/hooks/useInvitations';
import { InviteCandidatesModal } from './InviteCandidatesModal';
import { Invitation } from '../lib/types';

// The candidate's real progress: the invitation's own status ('invited'/'revoked')
// until an attempt exists, then the attempt's own status takes over. Every attempt
// status that means "still taking it" or "done" maps to the same label/tone, so the
// column reads as three simple stages instead of raw backend status strings.
const CANDIDATE_STATUS_LABEL: Record<string, string> = {
  invited: 'Invited',
  revoked: 'Revoked',
  in_progress: 'In Progress',
  paused: 'In Progress',
  blocked: 'In Progress',
  submitted: 'Ended',
  auto_submitted: 'Ended',
  force_submitted: 'Ended',
  pending_manual_grade: 'Ended',
};

const CANDIDATE_STATUS_TONE: Record<string, StatusTone> = {
  invited: 'info',
  revoked: 'danger',
  in_progress: 'warning',
  paused: 'warning',
  blocked: 'warning',
  submitted: 'success',
  auto_submitted: 'success',
  force_submitted: 'success',
  pending_manual_grade: 'success',
};

function candidateStatus(row: Invitation): string {
  return row.attempt?.status ?? row.status;
}

function AccommodationCell({ invitation, onSave, isPending }: { invitation: Invitation; onSave: (value: number) => void; isPending: boolean }) {
  const [value, setValue] = useState(String(invitation.extraTimePercent));

  if (invitation.attempt) {
    return <span>{invitation.extraTimePercent}%</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={300}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Extra time (%) for ${invitation.candidate.name}`}
        className="w-16 rounded border border-recruiter-border px-2 py-1 text-sm"
      />
      <span className="text-sm text-gray-500">%</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => onSave(Number(value))}
        className="rounded border border-recruiter-border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}

export function CandidatesPanel({ examId }: { examId: string }) {
  const { data: invitations, isLoading } = useExamInvitations(examId);
  const updateAccommodation = useUpdateAccommodation(examId);
  const { toast } = useToast();
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const columns: Column<Invitation>[] = [
    { key: 'name', header: 'Candidate', render: (row) => row.candidate.name },
    { key: 'email', header: 'Email', render: (row) => row.candidate.email },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const status = candidateStatus(row);
        return <StatusBadge tone={CANDIDATE_STATUS_TONE[status] ?? 'neutral'}>{CANDIDATE_STATUS_LABEL[status] ?? status}</StatusBadge>;
      },
    },
    {
      key: 'extraTime',
      header: 'Extra time (%)',
      render: (row) => (
        <AccommodationCell
          invitation={row}
          isPending={updateAccommodation.isPending}
          onSave={(extraTimePercent) =>
            updateAccommodation.mutate(
              { invitationId: row.id, extraTimePercent },
              {
                onSuccess: () => toast('Extra time saved.'),
                onError: (error) => toast(error instanceof Error ? error.message : 'Failed to save extra time.', 'error'),
              },
            )
          }
        />
      ),
    },
  ];

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => setInviteModalOpen(true)}>Invite candidates</Button>
      </div>
      <Table columns={columns} rows={invitations ?? []} rowKey={(row) => row.id} emptyMessage="No candidates invited yet." />
      {inviteModalOpen && (
        <InviteCandidatesModal
          examId={examId}
          open
          onClose={() => setInviteModalOpen(false)}
          existingCandidateIds={(invitations ?? []).map((invitation) => invitation.candidateId)}
        />
      )}
    </div>
  );
}
