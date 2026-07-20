'use client';

import { useState } from 'react';
import { Table, useToast, type Column } from './ui';
import { useExamInvitations, useUpdateAccommodation } from '../lib/hooks/useInvitations';
import { Invitation } from '../lib/types';

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

  const columns: Column<Invitation>[] = [
    { key: 'name', header: 'Candidate', render: (row) => row.candidate.name },
    { key: 'email', header: 'Email', render: (row) => row.candidate.email },
    { key: 'status', header: 'Status', render: (row) => row.status },
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

  return <Table columns={columns} rows={invitations ?? []} rowKey={(row) => row.id} emptyMessage="No candidates invited yet." />;
}
