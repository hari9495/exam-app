'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Table, Button, Input, Select, StatusBadge, useToast, type Column, type StatusTone } from './ui';
import { useExamInvitations, useUpdateAccommodation, useResendInvitation } from '../lib/hooks/useInvitations';
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
  paused: 'Paused',
  blocked: 'Blocked',
  submitted: 'Ended',
  auto_submitted: 'Ended',
  force_submitted: 'Ended',
  pending_manual_grade: 'Ended',
};

const CANDIDATE_STATUS_TONE: Record<string, StatusTone> = {
  invited: 'info',
  revoked: 'danger',
  in_progress: 'warning',
  paused: 'neutral',
  blocked: 'danger',
  submitted: 'success',
  auto_submitted: 'success',
  force_submitted: 'success',
  pending_manual_grade: 'success',
};

function candidateStatus(row: Invitation): string {
  return row.attempt?.status ?? row.status;
}

// Built from CANDIDATE_STATUS_LABEL rather than duplicating its groupings: the
// filter options always match whatever the Status column actually displays
// (e.g. "Paused" and "Blocked" collapsing into or splitting out of "In
// Progress"), with no separate list to keep in sync by hand.
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...Array.from(new Set(Object.values(CANDIDATE_STATUS_LABEL))).map((label) => ({ value: label, label })),
];

function matchesSearch(row: Invitation, query: string): boolean {
  if (!query) return true;
  return row.candidate.name.toLowerCase().includes(query) || row.candidate.email.toLowerCase().includes(query);
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
  const resendInvitation = useResendInvitation(examId);
  const { toast } = useToast();
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtersActive = search.trim() !== '' || statusFilter !== 'all';
  const visibleInvitations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (invitations ?? []).filter((row) => {
      const label = CANDIDATE_STATUS_LABEL[candidateStatus(row)] ?? candidateStatus(row);
      return matchesSearch(row, query) && (statusFilter === 'all' || label === statusFilter);
    });
  }, [invitations, search, statusFilter]);

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
    {
      key: 'actions',
      header: '',
      // Only offered before the candidate has actually started -- once an attempt
      // exists, resending a fresh link/token can't change anything they've already
      // done, and the backend itself only permits resend while status is 'invited'.
      render: (row) =>
        !row.attempt && row.status === 'invited' ? (
          <button
            type="button"
            disabled={resendInvitation.isPending}
            onClick={() =>
              resendInvitation.mutate(row.id, {
                onSuccess: () => toast('Invite resent.'),
                onError: (error) => toast(error instanceof Error ? error.message : 'Failed to resend invite.', 'error'),
              })
            }
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            Resend invite
          </button>
        ) : null,
    },
  ];

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem]">
            <Input
              label="Search candidates"
              hideLabel
              type="search"
              placeholder="Search by name or email…"
              value={search}
              onChange={setSearch}
              icon={<Search size={16} />}
            />
          </div>
          <Select label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />
        </div>
        <Button onClick={() => setInviteModalOpen(true)}>Invite candidates</Button>
      </div>
      <Table
        columns={columns}
        rows={visibleInvitations}
        rowKey={(row) => row.id}
        emptyMessage={filtersActive ? 'No candidates match your search or filter.' : 'No candidates invited yet.'}
      />
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
