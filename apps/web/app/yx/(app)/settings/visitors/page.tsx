'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SETTINGS_GROUPS, SettingsPageScreen, visitorSettingsChanges, visitorSettingsPage, type VisitorSettingsData } from '@yukthix/ui/visitors';
import { loadState } from '../../../../../lib/yx-org';
import { useAuth } from '../../../../../lib/auth-context';
import { useVisitors, useVisitorsWrite } from '../../../../../lib/yx-visitors';

const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.12')!;

// Settings › Time & Leave › Visitors (3.12): the designed page with `live`. Facility admins and HR change the company
// values (each an audited company setting); a location's own value is set on Company rules and named on the field.
export default function YxVisitorSettingsPage() {
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const data = useVisitors<VisitorSettingsData>('/settings');
  const write = useVisitorsWrite();
  const state = loadState(data);
  const page = useMemo(() => (data.data ? visitorSettingsPage(design, data.data) : design), [data.data]);
  return (
    <SettingsPageScreen
      groups={SETTINGS_GROUPS}
      pageId="3.12"
      live={{
        page,
        canEdit: Boolean(data.data?.canEdit) && !impersonating && !actingSuperAdmin,
        lastChange: data.data?.lastChange ? { by: data.data.lastChange.by, role: '', at: data.data.lastChange.at, what: data.data.lastChange.what } : null,
        state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : state === 'no-access' ? 'no-access' : 'error',
        onRetry: () => void data.refetch(),
        savedTitle: 'Visitor settings saved',
        onSave: async (values) => {
          const changes = visitorSettingsChanges(values);
          if (changes.length) await write('PUT', '/settings', { changes });
        },
        onOpenScreen: (screenId) => (screenId === 'VIS-01' ? router.push('/yx/visitors') : screenId === 'VIS-04' ? router.push('/yx/visitors/log') : undefined),
      }}
    />
  );
}
