'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SETTINGS_GROUPS, SettingsPageScreen, projectSettingsChanges, projectSettingsPage, type ProjectSettingsData } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useAuth } from '../../../../../lib/auth-context';
import { useProjects, useProjectsWrite } from '../../../../../lib/yx-projects';

const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.11')!;

// Settings › Time & Leave › Projects & timesheets (3.11), Projects P-1: the designed page with `live`. A System Admin
// switches Projects on and sets the booking rule and burn alerts (each an audited company setting); Projects managers read it.
export default function YxProjectSettingsPage() {
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const data = useProjects<ProjectSettingsData>('/settings');
  const write = useProjectsWrite();
  const state = loadState(data);
  const page = useMemo(() => (data.data ? projectSettingsPage(design, data.data) : design), [data.data]);
  return (
    <SettingsPageScreen
      groups={SETTINGS_GROUPS}
      pageId="3.11"
      live={{
        page,
        canEdit: Boolean(data.data?.canEdit) && !impersonating && !actingSuperAdmin,
        lastChange: data.data?.lastChange ? { by: data.data.lastChange.by, role: '', at: data.data.lastChange.at, what: data.data.lastChange.what } : null,
        state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : state === 'no-access' ? 'no-access' : 'error',
        onRetry: () => void data.refetch(),
        savedTitle: 'Projects settings saved',
        onSave: async (values) => {
          const changes = projectSettingsChanges(values);
          if (changes.length) await write('PUT', '/settings', { changes });
        },
        onOpenScreen: (screenId) => (screenId === 'PRJ-01' ? router.push('/yx/projects') : undefined),
      }}
    />
  );
}
