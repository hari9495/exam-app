'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PipsScreen, type PipSummary, type PipsView } from '@yukthix/ui/performance';
import type { TeamMember } from '@yukthix/ui/workforce';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople } from '../../../../../lib/yx-people';
import { usePerf, usePerfWrite } from '../../../../../lib/yx-performance';

// shortcut: the starter perf.pip.lengths; a company that narrows it gets the API's refusal, read the setting when that matters.
const LENGTHS = [30, 60, 90];

// Improvement plans (PRF-12, M06 batch PM8): my team's plans and proposing one; HR with perf.pip.manage, those in scope.
export default function YxPipsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  const hasTeam = (team.data?.members ?? []).length > 0;
  const [chosen, setView] = useState<PipsView | null>(null);
  const view: PipsView = chosen ?? (hasTeam ? 'team' : perms.has('perf.pip.manage') ? 'scope' : 'mine');
  const pips = usePerf<PipSummary[]>(`/pips?view=${view}`);
  const write = usePerfWrite();
  const open = (id: string) => router.push(`/yx/performance/pips/${encodeURIComponent(id)}`);
  return (
    <PipsScreen
      state={loadState(pips)}
      onRetry={() => void pips.refetch()}
      view={view}
      onView={setView}
      hasTeam={hasTeam}
      canScope={perms.has('perf.pip.manage')}
      pips={pips.data ?? []}
      onOpen={open}
      // The dotted line is not the manager chain (M01 Q5): plans are for direct and indirect reports.
      team={(team.data?.members ?? []).filter((m) => m.relation !== 'dotted').map((m) => ({ id: m.id, name: m.name, department: m.department?.name ?? undefined }))}
      lengths={LENGTHS}
      onPropose={async (input) => open((await write<{ id: string }>('POST', '/pips', input)).id)}
    />
  );
}
