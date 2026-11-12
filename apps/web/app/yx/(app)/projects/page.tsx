'use client';

import { useRouter } from 'next/navigation';
import { ProjectsListScreen, type LiveProjectRow, type ProjectChoices, type ProjectInput } from '@yukthix/ui/hiring';
import { loadState } from '../../../../lib/yx-org';
import { useProjects, useProjectsWrite } from '../../../../lib/yx-projects';

// Projects P-1 (answers 1401 to 1404, 1412, 1420): the designed PRJ-01 list, live. The API decides who sees which
// projects (a key: all; a project manager: their own) and whether Projects is on for the company.
export default function YxProjectsPage() {
  const router = useRouter();
  const list = useProjects<{ can: { create: boolean; finance: boolean }; rows: LiveProjectRow[] }>('');
  const choices = useProjects<ProjectChoices>(list.data?.can.create ? '/choices' : null);
  const write = useProjectsWrite();
  const state = loadState(list);
  return (
    <ProjectsListScreen
      live={{
        state: state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void list.refetch(),
        rows: list.data?.rows ?? [],
        can: list.data?.can ?? { create: false, finance: false },
        choices: choices.data ?? null,
        onOpen: (id) => router.push(`/yx/projects/${encodeURIComponent(id)}`),
        onCreate: async (input: ProjectInput) => (await write<{ id: string }>('POST', '', input)).id,
      }}
    />
  );
}
