'use client';

import { useParams, useRouter } from 'next/navigation';
import { GoalScreen, type GoalDetail } from '@yukthix/ui/performance';
import type { MasterRecord } from '@yukthix/ui/org';
import type { TeamMember } from '@yukthix/ui/workforce';
import { loadState, useOrg, useYxPermissions } from '../../../../../../lib/yx-org';
import { usePeople } from '../../../../../../lib/yx-people';
import { usePerf, usePerfWrite } from '../../../../../../lib/yx-performance';

// One goal (PRF-02, M06 batch PM2): key results and their progress, the goals aligned to it, check-ins, and the
// owner's actions. The API decides what each viewer may do (goal.can).
export default function YxGoalPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/goals/${encodeURIComponent(id)}`;
  const perms = useYxPermissions();
  const goal = usePerf<GoalDetail>(base);
  const align = usePerf<{ id: string; title: string; owner: string }[]>(goal.data ? `/goals/align-options?period=${goal.data.periodId}` : null);
  const departments = useOrg<MasterRecord[]>('/masters/departments', perms.has('perf.goal.manage'));
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  const write = usePerfWrite();
  return (
    <GoalScreen
      state={loadState(goal)}
      onRetry={() => void goal.refetch()}
      goal={goal.data ?? null}
      alignOptions={align.data ?? []}
      departments={(departments.data ?? []).filter((d) => !d.archivedAt).map((d) => ({ value: d.id, label: d.name }))}
      team={(team.data?.members ?? []).filter((m) => m.relation !== 'dotted').map((m) => ({ value: m.id, label: m.name }))}
      onBack={() => router.push('/yx/performance')}
      onSave={(input) => write('PUT', base, input)}
      onCheckIn={(input) => write('POST', `${base}/checkins`, input)}
      onDrop={(reason) => write('POST', `${base}/drop`, { reason })}
      onCascade={(employeeIds) => write('POST', `${base}/cascade`, { employeeIds })}
      onOpen={(goalId) => router.push(`/yx/performance/goals/${encodeURIComponent(goalId)}`)}
    />
  );
}
