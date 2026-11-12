'use client';

import { useRouter } from 'next/navigation';
import { BenchRequestsScreen, type RequestMatches, type ResourceRequestsData } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useProjects, useProjectsGet, useProjectsWrite } from '../../../../../lib/yx-projects';

// Projects › Resource requests (PRJ-07), Projects P-4 (answers 1417, 1418): the Resource requests tab only; the one
// bench is Staffing desk › Bench. Only Projects resource or manage fill a request.
export default function YxResourceRequestsPage() {
  const router = useRouter();
  const data = useProjects<ResourceRequestsData>('/requests');
  const write = useProjectsWrite();
  const get = useProjectsGet();
  const state = loadState(data);
  const id = encodeURIComponent;
  return (
    <BenchRequestsScreen
      live={{
        state: (data.error as { code?: string } | null)?.code === 'PROJECTS_OFF' ? 'off' : state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onRaise: async (input) => void (await write('POST', '/requests', input)),
        onMatches: (rid) => get<RequestMatches>(`/requests/${id(rid)}/matches`),
        onFill: async (rid, employeeId, version) => void (await write('POST', `/requests/${id(rid)}/fill`, { employeeId, version })),
        onWithdraw: async (rid, version) => void (await write('POST', `/requests/${id(rid)}/withdraw`, { version })),
        onBench: () => router.push('/yx/staffing/bench'),
      }}
    />
  );
}
