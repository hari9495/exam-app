'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CompanyGoalMapScreen, type GoalItem, type GoalPeriod } from '@yukthix/ui/performance';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { perfState, usePerf, usePerfWrite } from '../../../../../lib/yx-performance';

// PRF-03 Company goal map: company → team → person, unaligned and at-risk goals. HR with perf.goal.manage add company and
// team goals, open periods and suggest parents; others with perf.goal.view read it (the leadership view).
export default function YxGoalMapPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const manage = perms.has('perf.goal.manage');
  const periods = usePerf<GoalPeriod[]>('/goal-periods');
  const [chosen, setChosen] = useState<string | null>(null);
  const periodId = chosen ?? periods.data?.find((p) => p.status === 'open')?.id ?? periods.data?.[0]?.id ?? null;
  const map = usePerf<{ goals: GoalItem[]; unaligned: string[]; offTrack: string[] }>(periodId ? `/goal-map?period=${periodId}` : null);
  const align = usePerf<{ id: string; title: string; owner: string }[]>(periodId && manage ? `/goals/align-options?period=${periodId}` : null);
  const departments = useOrg<MasterRecord[]>('/masters/departments');
  const write = usePerfWrite();
  return (
    <CompanyGoalMapScreen
      live={{
        state: perfState(loadState(periods, ...(periodId ? [map] : []))),
        onRetry: () => void Promise.all([periods.refetch(), map.refetch()]),
        persona: manage ? 'hr' : 'exec',
        periods: periods.data ?? [],
        periodId,
        onPeriod: setChosen,
        departments: (departments.data ?? []).filter((d) => !d.archivedAt).map((d) => ({ value: d.id, label: d.name })),
        map: map.data ?? null,
        alignOptions: align.data ?? [],
        onOpenGoal: (id) => router.push(`/yx/performance/goals?goal=${encodeURIComponent(id)}`),
        onCreate: (input) => write('POST', '/goals', input),
        onSuggestParent: (goalId, parentGoalId) => write('POST', `/goals/${encodeURIComponent(goalId)}/suggest-parent`, { parentGoalId }),
        onAddPeriod: (p) => write('POST', '/goal-periods', p),
      }}
    />
  );
}
