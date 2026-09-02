'use client';

// v2 CandidatesPanel — re-skin on the shared DataTable. Status derivation, accommodation blur-save,
// resend rules and filtering logic are all verbatim from components/CandidatesPanel.tsx (format only).
// InviteCandidatesModal reused as-is.
import { useMemo, useState } from 'react';
import { ListFilter, Check } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useExamInvitations, useUpdateAccommodation, useResendInvitation } from '../../../../lib/hooks/useInvitations';
import { InviteCandidatesModal } from '../../../../components/InviteCandidatesModal';
import { useToast } from '../../../../components/ui';
import { Invitation } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Dropdown, DropdownItem } from '../../../../components/ui-v2';
import { VIZ, STATUS } from '../../../../components/ui-v2/viz';

const CANDIDATE_STATUS_LABEL: Record<string, string> = {
  invited: 'Invited', invite_queued: 'In queue', invite_failed: 'Invite failed', invite_resent: 'Resent', revoked: 'Revoked',
  in_progress: 'In Progress', paused: 'Paused', blocked: 'Blocked', submitted: 'Ended', auto_submitted: 'Ended', force_submitted: 'Ended', pending_manual_grade: 'Ended',
};
const CANDIDATE_STATUS_COLOR: Record<string, string> = {
  invited: VIZ.azure, invite_queued: STATUS.warn, invite_failed: STATUS.bad, invite_resent: VIZ.violet, revoked: STATUS.bad,
  in_progress: STATUS.warn, paused: 'var(--muted)', blocked: STATUS.bad, submitted: STATUS.ok, auto_submitted: STATUS.ok, force_submitted: STATUS.ok, pending_manual_grade: STATUS.ok,
};

// Below the invitation's own status and above the attempt's, the invite email has its own short-lived
// lifecycle. Only relevant before an attempt exists and while status is still 'invited'.
function candidateStatus(row: Invitation): string {
  if (row.attempt) return row.attempt.status;
  if (row.status !== 'invited') return row.status;
  if (row.emailStatus === 'pending') return 'invite_queued';
  if (row.emailStatus === 'failed') return 'invite_failed';
  if (row.resendCount > 0) return 'invite_resent';
  return 'invited';
}

const STATUS_FILTER_OPTIONS = [{ value: 'all', label: 'All statuses' }, ...Array.from(new Set(Object.values(CANDIDATE_STATUS_LABEL))).map((label) => ({ value: label, label }))];

function matchesSearch(row: Invitation, query: string): boolean {
  if (!query) return true;
  return row.candidate.name.toLowerCase().includes(query) || row.candidate.email.toLowerCase().includes(query);
}

const smallNum: React.CSSProperties = { width: 60, textAlign: 'right', padding: '5px 8px', fontSize: 13, borderRadius: 6, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' };

function AccommodationCell({ invitation, onSave, isPending }: { invitation: Invitation; onSave: (value: number) => void; isPending: boolean }) {
  const [value, setValue] = useState(String(invitation.extraTimePercent));
  if (invitation.attempt) return <span style={dt.muted}>{invitation.extraTimePercent}%</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="number" min={0} max={300} value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Extra time (%) for ${invitation.candidate.name}`} style={smallNum} />
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>%</span>
      <button type="button" disabled={isPending} onClick={() => onSave(Number(value))} style={{ ...dt.toolBtn, padding: '5px 9px', opacity: isPending ? 0.5 : 1 }}>Save</button>
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

  const columns: ColumnDef<typeof DT_FEATURES, Invitation>[] = [
    { id: 'index', enableSorting: false, enableHiding: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>#</span>, cell: ({ row }) => <span style={dt.muted}>{row.index + 1}</span> },
    { id: 'name', accessorFn: (r) => r.candidate.name, header: ({ column }) => <SortHead label="Candidate" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ fontWeight: 500 }}>{row.original.candidate.name}</span> },
    { id: 'email', accessorFn: (r) => r.candidate.email, header: ({ column }) => <SortHead label="Email" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.candidate.email}</span> },
    {
      id: 'status', enableSorting: false,
      header: () => (
        <Dropdown align="start" menuWidth={170} trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: statusFilter !== 'all' ? 'var(--org-primary)' : 'var(--muted)' }}>Status <ListFilter size={12} style={{ opacity: 0.75 }} /></span>}>
          {(close) => STATUS_FILTER_OPTIONS.map((o) => (
            <DropdownItem key={o.value} onClick={() => { close(); setStatusFilter(o.value); }}>
              <span style={{ width: 15, display: 'inline-flex', flexShrink: 0, color: 'var(--org-primary)' }}>{statusFilter === o.value && <Check size={15} />}</span>{o.label}
            </DropdownItem>
          ))}
        </Dropdown>
      ),
      cell: ({ row }) => { const s = candidateStatus(row.original); return <Pill c={CANDIDATE_STATUS_COLOR[s] ?? 'var(--muted)'} label={CANDIDATE_STATUS_LABEL[s] ?? s} />; },
    },
    {
      id: 'extraTime', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Extra time</span>,
      cell: ({ row }) => <AccommodationCell invitation={row.original} isPending={updateAccommodation.isPending}
        onSave={(extraTimePercent) => updateAccommodation.mutate({ invitationId: row.original.id, extraTimePercent }, { onSuccess: () => toast('Extra time saved.'), onError: (error) => toast(error instanceof Error ? error.message : 'Failed to save extra time.', 'error') })} />,
    },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => {
        // Backend only permits resend while status is 'invited' — shown disabled (not hidden) so it's clear why.
        const blockedReason = row.original.attempt ? 'This candidate has already started the exam.' : row.original.status !== 'invited' ? 'This invitation has been revoked.' : null;
        return (
          <button type="button" disabled={Boolean(blockedReason) || resendInvitation.isPending} title={blockedReason ?? undefined}
            onClick={() => resendInvitation.mutate(row.original.id, { onSuccess: () => toast('Invite resent.'), onError: (error) => toast(error instanceof Error ? error.message : 'Failed to resend invite.', 'error') })}
            style={{ background: 'none', border: 'none', fontSize: 12.5, fontWeight: 500, color: blockedReason ? 'var(--muted)' : 'var(--org-primary)', cursor: blockedReason ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            Resend invite
          </button>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" style={dt.primaryBtn} onClick={() => setInviteModalOpen(true)}>Invite candidates</button>
      </div>
      <DataTable
        columns={columns} data={visibleInvitations} getRowId={(r) => r.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search by name or email…"
        isLoading={isLoading} emptyMessage={filtersActive ? 'No candidates match your search or filter.' : 'No candidates invited yet.'}
        columnLabels={{ name: 'Candidate', email: 'Email', status: 'Status', extraTime: 'Extra time' }}
      />
      {inviteModalOpen && (
        <InviteCandidatesModal examId={examId} open onClose={() => setInviteModalOpen(false)} existingCandidateIds={(invitations ?? []).map((invitation) => invitation.candidateId)} />
      )}
    </div>
  );
}
