'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InvitationsScreen, type BulkOutcome, type LiveDriveRow, type LiveInvitationRow } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { BANK_BASE, loadState, type ExamListPage } from '../../../../../../lib/yx-assessments';

interface CandidatePage {
  data: { id: string; name: string; email: string; erasedAt: string | null }[];
}

// Assessments AS-3 › Invitations & drives (PRC-07): every invitation of the company with its state, the walk-in drives
// with their counts, inviting to a published test, reminders and revokes in one call (answer 2211), re-inviting a
// missed test once with a reason, and a new drive (2214, for those who may make one). The API checks every call.
export default function YxInvitationsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const [search, setSearch] = useState('');
  const invitations = useApi<LiveInvitationRow[]>('/asmt/invitations');
  const drives = useApi<LiveDriveRow[]>('/asmt/drives');
  const tests = useApi<ExamListPage>('/exams?status=published&pageSize=100');
  const candidates = useApi<CandidatePage>(`/candidates?pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ''}`);
  const write = useApiWrite();
  const bulk = (action: 'remind' | 'revoke') => (ids: string[]) => write<BulkOutcome>('POST', '/asmt/invitations/bulk', { action, ids });
  const openDrive = (id: string) => router.push(`${BANK_BASE}/drives/${id}`);
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
        onResend: bulk('remind'),
        onRevoke: bulk('revoke'),
        onReinvite: async (id, reason) => {
          await write('POST', `/asmt/invitations/${id}/reinvite`, { reason });
        },
        // Drives are walk-in groups: test writers make them (the older key, or its YukthiX name).
        onNewDrive: perms.has('exam:manage') || perms.has('asmt.test.manage') ? async (name) => (await write<{ id: string }>('POST', '/walk-in-groups', { name })).id : undefined,
        onOpenDrive: openDrive,
      }}
    />
  );
}
