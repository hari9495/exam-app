'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SETTINGS_GROUPS, SettingsPageScreen, StageTargetsSheet, hiringSettingsChanges, hiringSettingsPage, type HiringSettingsData } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useApiWrite, useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';
import { useAuth } from '../../../../../lib/auth-context';

const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.1')!;

// Settings › Hiring & Assessments › Hiring (6.1): the designed settings page with `live`. Recruiting, hiring admins and
// HR read it; the hiring settings key (or HR's settings key) for the whole company changes it, never while acting for
// someone else (the API checks both). Each change is a company setting, audited with before and after. A pipeline's
// stage targets (answer 302) are changed from its row with the pipelines key.
export default function YxHiringSettingsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin } = useAuth();
  const acting = Boolean(impersonating || actingSuperAdmin);
  const data = useHiring<HiringSettingsData>('/settings');
  const write = useHiringWrite();
  const apiWrite = useApiWrite();
  const [targets, setTargets] = useState<number | null>(null);
  const state = loadState(data);
  const page = useMemo(() => (data.data ? hiringSettingsPage(design, data.data) : design), [data.data]);
  const pipeline = targets != null ? data.data?.pipelines[targets] : undefined;
  return (
    <>
      <SettingsPageScreen
        groups={SETTINGS_GROUPS}
        pageId="6.1"
        live={{
          page,
          canEdit: Boolean(data.data?.canEdit) && !acting,
          lastChange: data.data?.lastChange ? { by: data.data.lastChange.by, role: '', at: data.data.lastChange.at, what: data.data.lastChange.what } : null,
          state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : 'error',
          onRetry: () => void data.refetch(),
          savedTitle: 'Hiring settings saved',
          onSave: async (values, rows) => {
            const changes = hiringSettingsChanges(values, rows, data.data!);
            if (changes.length) await write('PUT', '/settings', { changes });
          },
          onRowAction: (key, i) => key === 'hire.pipelines' && setTargets(i),
          onOpenScreen: (screenId) => screenId === 'HIR-05' && router.push('/yx/hiring/retention'),
        }}
      />
      {pipeline && (
        <StageTargetsSheet
          key={pipeline.id}
          open
          onOpenChange={(o) => !o && setTargets(null)}
          pipelineName={pipeline.name}
          stages={pipeline.stages}
          canEdit={perms.has('pipelines:configure') && !acting}
          onSave={async (changes) => {
            for (const c of changes) await apiWrite('PATCH', `/pipelines/stages/${encodeURIComponent(c.stageId)}`, { daysTarget: c.daysTarget, limit: c.limit });
            await data.refetch();
          }}
        />
      )}
    </>
  );
}
