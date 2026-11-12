'use client';

import { useParams } from 'next/navigation';
import { ProjectWorkspaceScreen, type LiveProjectDetail, type ProjectChoices } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useProjects, useProjectsWrite } from '../../../../../lib/yx-projects';

// Projects P-1 (answers 1401 to 1405, 1412, 1420): the designed PRJ-01 workspace, live (overview, team, tasks and
// milestones). The API checks every change: projects.manage, the project's manager, or projects.resource for the team.
export default function YxProjectPage() {
  const { id } = useParams<{ id: string }>();
  const p = `/${encodeURIComponent(id)}`;
  const detail = useProjects<LiveProjectDetail>(p);
  const can = detail.data?.can;
  const choices = useProjects<ProjectChoices>(can && (can.edit || can.team) ? '/choices' : null);
  const settings = useProjects<{ values: Record<string, string> }>(can?.edit ? '/settings' : null);
  const write = useProjectsWrite();
  const state = loadState(detail);
  const v = settings.data?.values;
  return (
    <ProjectWorkspaceScreen
      live={{
        // Walk 12 Nov: Projects switched off is its own plain state; no access gets the kit's Request access page.
        state: (detail.error as { code?: string } | null)?.code === 'PROJECTS_OFF' ? 'off' : state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void detail.refetch(),
        detail: detail.data ?? null,
        choices: choices.data ?? null,
        burn: { warn: Number(v?.['projects.burn.warn_pct'] ?? 80), over: Number(v?.['projects.burn.over_pct'] ?? 100) },
        onUpdate: async (input) => void (await write('PUT', p, input)),
        onStatus: async (status, version) => void (await write('POST', `${p}/status`, { status, version })),
        onAllocate: async (input) => void (await write('POST', `${p}/allocations`, input)),
        // The person on an allocation never changes.
        onChangeAllocation: async (aid, { employeeId: _person, ...input }) => void (await write('PUT', `${p}/allocations/${encodeURIComponent(aid)}`, input)),
        onEndAllocation: async (aid, version) => void (await write('POST', `${p}/allocations/${encodeURIComponent(aid)}/end`, { version })),
        onAddTask: async (input) => void (await write('POST', `${p}/tasks`, input)),
        onChangeTask: async (tid, input) => void (await write('PUT', `${p}/tasks/${encodeURIComponent(tid)}`, input)),
        onAddMilestone: async (input) => void (await write('POST', `${p}/milestones`, input)),
        onCompleteMilestone: async (mid, version) => void (await write('POST', `${p}/milestones/${encodeURIComponent(mid)}/complete`, { version })),
      }}
    />
  );
}
