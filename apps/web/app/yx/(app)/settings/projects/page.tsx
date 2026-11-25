'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PROJECT_SETTING_KEYS, SETTINGS_GROUPS, SettingsPageScreen, historyOnPage, projectSettingsChanges, projectSettingsPage, type ProjectSettingsData } from '@yukthix/ui/hiring';
import { useSettingsHistory } from '../../../../../lib/yx-settings-history';
import { loadState as _ls, useYxPermissions } from '../../../../../lib/yx-org';
import { AUDIT_LOG } from '../../../../../lib/yx-nav';
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
  const perms = useYxPermissions();
  const write = useProjectsWrite();
  const state = loadState(data);
  const page = useMemo(() => (data.data ? projectSettingsPage(design, data.data) : design), [data.data]);
  // Answer 1326: the last 20 changes, asked once the page itself opened (the same readers).
  const history = useSettingsHistory(data.data ? PROJECT_SETTING_KEYS : []);
  const past = history.data ? historyOnPage(page, history.data) : null;
  return (
    <SettingsPageScreen
      groups={SETTINGS_GROUPS}
      pageId="3.11"
      live={{
        page,
        canEdit: Boolean(data.data?.canEdit) && !impersonating && !actingSuperAdmin,
        lastChange: past ? past.lastChange : data.data?.lastChange ? { by: data.data.lastChange.by, role: '', at: data.data.lastChange.at, what: data.data.lastChange.what } : null,
        history: past?.history ?? [],
        auditHref: perms.has('audit.view') ? `${AUDIT_LOG}?area=settings` : undefined,
        state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : state === 'no-access' ? 'no-access' : 'error',
        onRetry: () => void data.refetch(),
        savedTitle: 'Projects settings saved',
        onSave: async (values) => {
          const changes = projectSettingsChanges(values);
          if (changes.length) await write('PUT', '/settings', { changes });
          void history.refetch();
        },
        onOpenScreen: (screenId) => (screenId === 'PRJ-01' ? router.push('/yx/projects') : screenId === 'PRJ-08' ? router.push('/yx/settings/projects/mapping-rules') : undefined),
      }}
    />
  );
}
