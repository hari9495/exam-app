'use client';

import { useRouter } from 'next/navigation';
import { SurveysListScreen } from '@yukthix/ui/engage';
import { engageState, useEngage } from '../../../../../lib/yx-engage';

// Engage › Team surveys (a manager): the ENG-04 list with `live`, the surveys my team answered (batch G2 item 74).
export default function YxTeamSurveysPage() {
  const router = useRouter();
  const rows = useEngage<{ id: string; name: string; responded: number; shown: boolean; status: 'open' | 'closed' }[]>('/my/team-surveys');
  return (
    <SurveysListScreen
      live={{
        state: engageState(rows),
        onRetry: () => void rows.refetch(),
        rows: (rows.data ?? []).map((r) => ({ id: r.id, name: r.name, type: 'pulse', anonymous: true, audience: r.shown ? 'Your team' : 'Your team (too few answers to show)', status: r.status, invited: 0, responded: r.responded, opensOn: '', closesOn: '' })),
        onOpen: (r) => router.push(`/yx/engage/team-surveys/${encodeURIComponent(r.id)}`),
      }}
    />
  );
}
