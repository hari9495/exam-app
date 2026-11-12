'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PREFILL_KEY, SETTINGS_GROUPS, SettingsPageScreen, prefillChange, projectSettingsChanges, projectSettingsPage, type ProjectSettingsData } from '@yukthix/ui/hiring';
import { loadState, useOrg, useOrgWrite, useYxPermissions } from '../../../../../lib/yx-org';
import { useAuth } from '../../../../../lib/auth-context';
import { useProjects, useProjectsWrite } from '../../../../../lib/yx-projects';

const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.11')!;

// Settings › Time & Leave › Projects & timesheets (3.11), Projects P-1: the designed page with `live`. A System Admin
// switches Projects on and sets the booking rule and burn alerts (each an audited company setting); Projects managers read it.
// Settings S-2 follow-up (answers 1323, 1409): "Pre-fill from work tools" (timesheet.tool_suggestions, off by default) is a
// company setting read and saved through /org/settings with HR's settings key; shown to whoever can read the settings.
export default function YxProjectSettingsPage() {
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const data = useProjects<ProjectSettingsData>('/settings');
  const write = useProjectsWrite();
  const perms = useYxPermissions();
  const manage = perms.has('org.settings.manage');
  const org = useOrg<{ registry: Record<string, { default: string }>; overrides: { key: string; scopeType: string; validFrom: string | null; value: unknown }[] }>('/settings', manage || perms.has('org.structure.view'));
  const orgWrite = useOrgWrite();
  // The form starts once both reads are in, so the pre-fill switch never joins a form already open (403 on the org read: left out).
  const readsOrg = manage || perms.has('org.structure.view');
  const state = !perms.isSuccess || (readsOrg && !org.data && !org.isError) ? 'loading' : loadState(data);
  const prefill = useMemo(() => {
    const def = org.data?.registry[PREFILL_KEY];
    if (!def) return undefined;
    const own = org.data!.overrides.find((o) => o.key === PREFILL_KEY && o.scopeType === 'tenant' && !o.validFrom);
    return { value: own ? String(own.value) : def.default, default: def.default, canEdit: manage && !impersonating && !actingSuperAdmin };
  }, [org.data, manage, impersonating, actingSuperAdmin]);
  const page = useMemo(() => (data.data ? projectSettingsPage(design, data.data, prefill) : design), [data.data, prefill]);
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
          const pre = prefillChange(values);
          if (pre) await orgWrite('PUT', '/settings', pre);
        },
        onOpenScreen: (screenId) => (screenId === 'PRJ-01' ? router.push('/yx/projects') : screenId === 'PRJ-08' ? router.push('/yx/settings/projects/mapping-rules') : undefined),
      }}
    />
  );
}
