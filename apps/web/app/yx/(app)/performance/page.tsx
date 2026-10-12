'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoalsScreen, type GoalPeriod, type GoalSummary } from '@yukthix/ui/performance';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, useOrg, useYxPermissions } from '../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../lib/yx-performance';

// Goals (PRF-01 / PRF-02, M06 batch PM2): my goals with the weights check, my team's, and the company's and teams'.
export default function YxGoalsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const periods = usePerf<GoalPeriod[]>('/goal-periods');
  const [chosen, setChosen] = useState<string | null>(null);
  const [view, setView] = useState<'mine' | 'team' | 'company'>('mine');
  const periodId = chosen ?? periods.data?.find((p) => p.status === 'open')?.id ?? periods.data?.[0]?.id ?? null;
  const goals = usePerf<{ goals: GoalSummary[]; totalWeight: number | null }>(periodId ? `/goals?period=${periodId}&view=${view}` : null);
  const align = usePerf<{ id: string; title: string; owner: string }[]>(periodId ? `/goals/align-options?period=${periodId}` : null);
  const canManage = perms.has('perf.goal.manage');
  const departments = useOrg<MasterRecord[]>('/masters/departments', canManage);
  const write = usePerfWrite();
  return (
    <GoalsScreen
      state={loadState(periods, ...(periodId ? [goals] : []))}
      onRetry={() => void Promise.all([periods.refetch(), goals.refetch()])}
      periods={periods.data ?? []}
      periodId={periodId}
      onPeriod={setChosen}
      view={view}
      onView={setView}
      goals={goals.data?.goals ?? []}
      totalWeight={goals.data?.totalWeight ?? null}
      canManage={canManage}
      departments={(departments.data ?? []).filter((d) => !d.archivedAt).map((d) => ({ value: d.id, label: d.name }))}
      alignOptions={align.data ?? []}
      onCreate={async (input) => {
        const g = await write<{ id: string }>('POST', '/goals', input);
        router.push(`/yx/performance/goals/${encodeURIComponent(g.id)}`);
      }}
      onSubmitGoals={() => write('POST', '/goals/submit', { periodId })}
      onAddPeriod={(p) => write('POST', '/goal-periods', p)}
      onOpen={(id) => router.push(`/yx/performance/goals/${encodeURIComponent(id)}`)}
    />
  );
}
