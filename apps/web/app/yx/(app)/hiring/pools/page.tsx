'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TalentCrmScreen, type LivePool, type LivePoolMember, type LivePostingJob, type LiveTalentCrm } from '@yukthix/ui/hiring';
import { useAuth } from '../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { useApiWrite, useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';

const enc = encodeURIComponent;
const listState = (q: { isError: boolean; data?: unknown }): 'error' | 'ready' | 'loading' => (q.isError ? 'error' : q.data ? 'ready' : 'loading');

// Hiring › Talent CRM (HIR-20): the designed TalentCrmScreen with `live`. It replaces the talent pools stand-in and keeps
// all it did (lists, create, archive, members, remove, open the candidate). A talent pool holds only people with a
// current consent (the API refuses the rest); postings are each job's board postings, changed through the job as on
// the job workspace. Campaigns, sequences and sourced profiles are not built. The API refuses writes while acting.
export default function YxHiringPoolsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const lists = useHiring<LivePool[]>('/pools');
  const members = useHiring<{ members: LivePoolMember[] }>(selected ? `/pools/${enc(selected)}/members` : null);
  const postings = useHiring<LivePostingJob[]>('/postings', perms.has('pipeline:manage') || perms.has('results:view'));
  const write = useHiringWrite();
  const apiWrite = useApiWrite();
  const acting = impersonating || actingSuperAdmin;
  const status = (lists.error as { status?: number } | null)?.status;
  const live: LiveTalentCrm = {
    state: lists.isError ? (status === 403 ? 'denied' : 'error') : lists.data ? 'ready' : 'loading',
    onRetry: () => void Promise.all([lists.refetch(), postings.refetch()]),
    pools: lists.data ?? [],
    canManage: perms.has('candidate:manage') && !acting,
    selectedId: selected,
    onSelect: setSelected,
    members: { state: listState(members), rows: members.data?.members ?? [] },
    onCreate: (input) => write('POST', '/pools', input),
    onArchive: async (pool) => {
      await write('DELETE', `/pools/${enc(pool.id)}`);
      if (selected === pool.id) setSelected(null);
    },
    onRemove: (pool, candidateId) => write('DELETE', `/pools/${enc(pool.id)}/members/${enc(candidateId)}`),
    onOpenCandidate: (id) => router.push(`/yx/hiring/candidates/${enc(id)}`),
    postings: { state: listState(postings), jobs: postings.data ?? [] },
    canPost: perms.has('pipeline:manage') && !acting,
    onPosting: (job, p, action) => {
      const next = new Set(job.postings.filter((x) => x.status !== 'not posted' && x.status !== 'closed').map((x) => x.boardId));
      if (action === 'close') next.delete(p.boardId);
      else next.add(p.boardId);
      return apiWrite('PATCH', `/jobs/${enc(job.jobId)}`, { jobBoardIds: [...next] });
    },
  };
  return <TalentCrmScreen live={live} />;
}
