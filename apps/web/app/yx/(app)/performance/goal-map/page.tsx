'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoalMapScreen, type GoalMap, type GoalPeriod } from '@yukthix/ui/performance';
import { loadState } from '../../../../../lib/yx-org';
import { usePerf } from '../../../../../lib/yx-performance';

// Company goal map (PRF-03, M06 batch PM2): company → team → person, with what is not aligned and what is off track.
export default function YxGoalMapPage() {
  const router = useRouter();
  const periods = usePerf<GoalPeriod[]>('/goal-periods');
  const [chosen, setChosen] = useState<string | null>(null);
  const periodId = chosen ?? periods.data?.find((p) => p.status === 'open')?.id ?? periods.data?.[0]?.id ?? null;
  const map = usePerf<GoalMap>(periodId ? `/goal-map?period=${periodId}` : null);
  return (
    <GoalMapScreen
      state={loadState(periods, ...(periodId ? [map] : []))}
      onRetry={() => void Promise.all([periods.refetch(), map.refetch()])}
      periods={periods.data ?? []}
      periodId={periodId}
      onPeriod={setChosen}
      map={map.data ?? null}
      onOpen={(id) => router.push(`/yx/performance/goals/${encodeURIComponent(id)}`)}
    />
  );
}
