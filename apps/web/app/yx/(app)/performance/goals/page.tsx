'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MyGoalsScreen, type GoalDetail, type GoalItem, type GoalPeriod, PerfNoAccessScreen } from '@yukthix/ui/performance';
import type { TeamMember } from '@yukthix/ui/workforce';
import { loadState } from '../../../../../lib/yx-org';
import { usePeople } from '../../../../../lib/yx-people';
import { perfState, usePerf, usePerfWrite, refused } from '../../../../../lib/yx-performance';

type List = { goals: GoalItem[]; totalWeight: number | null; canDecide: boolean };

// PRF-02 My goals and check-in: my goals (?employee= a person of my team, as their manager), the alignment view, the
// goal drawer (?goal=), check-ins, sending goals and the manager's approval. The API decides what each viewer may do.
export default function YxMyGoalsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const employeeId = params?.get('employee') ?? null;
  const goalId = params?.get('goal') ?? null;
  const periods = usePerf<GoalPeriod[]>('/goal-periods');
  const openGoal = usePerf<GoalDetail>(goalId ? `/goals/${encodeURIComponent(goalId)}` : null);
  const [chosen, setChosen] = useState<string | null>(null);
  // A goal opened by a link shows its own period.
  useEffect(() => {
    if (openGoal.data && !chosen) setChosen(openGoal.data.periodId);
  }, [openGoal.data, chosen]);
  const periodId = chosen ?? periods.data?.find((p) => p.status === 'open')?.id ?? periods.data?.[0]?.id ?? null;
  const view = employeeId ? `employee&employeeId=${encodeURIComponent(employeeId)}` : 'mine';
  const list = usePerf<List>(periodId ? `/goals?period=${periodId}&view=${view}` : null);
  const company = usePerf<List>(periodId ? `/goals?period=${periodId}&view=company` : null);
  const align = usePerf<{ id: string; title: string; owner: string }[]>(periodId ? `/goals/align-options?period=${periodId}` : null);
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  const write = usePerfWrite();
  const members = (team.data?.members ?? []).filter((m) => m.relation !== 'dotted');
  const ownerName = employeeId ? (members.find((m) => m.id === employeeId)?.name ?? list.data?.goals[0]?.owner ?? 'This person') : 'Me';
  const go = (goal: string | null) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    if (goal) next.set('goal', goal);
    else next.delete('goal');
    router.replace(`/yx/performance/goals${next.toString() ? `?${next.toString()}` : ''}`);
  };
  if (refused(periods)) return <PerfNoAccessScreen title="Goals" what="goals" grantedBy="HR" active="Goals" persona="emp" />;
  return (
    <MyGoalsScreen
      live={{
        state: perfState(loadState(periods, ...(periodId ? [list, company] : []))),
        onRetry: () => void Promise.all([periods.refetch(), list.refetch(), company.refetch()]),
        persona: employeeId ? 'mgr' : 'emp',
        ownerName,
        periods: periods.data ?? [],
        periodId,
        onPeriod: setChosen,
        goals: list.data?.goals ?? [],
        totalWeight: list.data?.totalWeight ?? null,
        canDecide: list.data?.canDecide ?? false,
        companyGoals: company.data?.goals ?? [],
        alignOptions: align.data ?? [],
        openGoalId: goalId,
        onOpenGoal: go,
        goal: openGoal.data ?? null,
        team: members.map((m) => ({ value: m.id, label: m.name })),
        onCreate: (input) => write('POST', '/goals', input),
        onSave: (id, input) => write('PUT', `/goals/${encodeURIComponent(id)}`, input),
        onSubmit: () => write('POST', '/goals/submit', { periodId }),
        onCheckIn: (id, input) => write('POST', `/goals/${encodeURIComponent(id)}/checkins`, input),
        onDrop: (id, reason) => write('POST', `/goals/${encodeURIComponent(id)}/drop`, { reason }),
        onCascade: (id, employeeIds) => write('POST', `/goals/${encodeURIComponent(id)}/cascade`, { employeeIds }),
        onDecide: (decision, reason) => write('POST', '/goals/decide', { employeeId, periodId, decision, ...(reason ? { reason } : {}) }),
      }}
    />
  );
}
