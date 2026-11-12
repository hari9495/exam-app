'use client';

import { CapacityBoardScreen, type LiveCapacityData } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useProjects } from '../../../../../lib/yx-projects';

// Projects › Capacity & utilisation (PRJ-03), Projects P-4 (answer 1411): six weeks of allocated against available
// hours and last month's billable utilisation. The API hides per-person figures from a PM's small team.
export default function YxCapacityPage() {
  const data = useProjects<LiveCapacityData>('/capacity');
  const state = loadState(data);
  return (
    <CapacityBoardScreen
      live={{
        state: (data.error as { code?: string } | null)?.code === 'PROJECTS_OFF' ? 'off' : state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
      }}
    />
  );
}
