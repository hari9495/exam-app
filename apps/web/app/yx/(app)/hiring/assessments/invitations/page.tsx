'use client';

import { useState } from 'react';
import { InvitationsScreen, type LiveDriveRow, type LiveInvitationRow } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { loadState, type ExamListPage } from '../../../../../../lib/yx-assessments';

interface CandidatePage {
  data: { id: string; name: string; email: string; erasedAt: string | null }[];
}

// Assessments AS-3 › Invitations & drives (PRC-07): every invitation of the company with its state, the walk-in drives
// with their counts, inviting to a published test, reminders, revoking, and re-inviting a missed test once with a
// reason. People who invite candidates only (the API checks every call).
export default function YxInvitationsPage() {
  const [search, setSearch] = useState('');
  const invitations = useApi<LiveInvitationRow[]>('/asmt/invitations');
  const drives = useApi<LiveDriveRow[]>('/asmt/drives');
  const tests = useApi<ExamListPage>('/exams?status=published&pageSize=100');
  const candidates = useApi<CandidatePage>(`/candidates?pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ''}`);
  const write = useApiWrite();
  const each = async (ids: string[], path: (id: string) => string) => {
    for (const id of ids) await write('POST', path(id));
  };
  return (
    <InvitationsScreen
      live={{
        state: loadState({ isLoading: invitations.isLoading || drives.isLoading, isError: invitations.isError || drives.isError }),
        onRetry: () => {
          void invitations.refetch();
          void drives.refetch();
        },
        invitations: invitations.data ?? [],
        drives: drives.data ?? [],
        tests: (tests.data?.data ?? []).filter((t) => t.status === 'published').map((t) => ({ id: t.id, title: t.title })),
        candidates: (candidates.data?.data ?? []).filter((c) => !c.erasedAt).map((c) => ({ id: c.id, name: c.name, email: c.email })),
        onCandidateSearch: setSearch,
        onInvite: async (examId, candidateIds) => {
          const r = await write<{ created: unknown[]; skipped: unknown[] }>('POST', `/exams/${examId}/invitations`, { candidateIds });
          return { created: r.created.length, skipped: r.skipped.length };
        },
        onResend: (ids) => each(ids, (id) => `/invitations/${id}/resend`),
        onRevoke: (ids) => each(ids, (id) => `/invitations/${id}/revoke`),
        onReinvite: async (id, reason) => {
          await write('POST', `/asmt/invitations/${id}/reinvite`, { reason });
        },
      }}
    />
  );
}
