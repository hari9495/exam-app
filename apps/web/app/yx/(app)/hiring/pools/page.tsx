'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TalentPoolsScreen, type TalentList, type TalentListMember } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';

// Hiring › Talent pools (M10 batch AT4): pools need the candidate's talent-pool consent; hotlists are short lists.
export default function YxHiringPoolsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const [selected, setSelected] = useState<string | null>(null);
  const lists = useHiring<TalentList[]>('/pools');
  const members = useHiring<{ members: TalentListMember[] }>(selected ? `/pools/${selected}/members` : null);
  const write = useHiringWrite();
  return (
    <TalentPoolsScreen
      state={loadState(lists)}
      onRetry={() => void lists.refetch()}
      lists={lists.data ?? []}
      selectedId={selected}
      onSelect={setSelected}
      members={members.data?.members ?? []}
      canManage={perms.has('candidate:manage')}
      onCreate={(input) => write('POST', '/pools', input)}
      onArchive={async (id) => {
        await write('DELETE', `/pools/${id}`);
        if (selected === id) setSelected(null);
      }}
      onRemove={(listId, candidateId) => write('DELETE', `/pools/${listId}/members/${candidateId}`)}
      onOpenCandidate={(id) => router.push(`/yx/hiring/candidates/${encodeURIComponent(id)}`)}
    />
  );
}
