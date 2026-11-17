'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SETTINGS_GROUPS, SettingsPageScreen } from '@yukthix/ui/hiring';
import { FlexComponentSheet, fbpSettingsChanges, fbpSettingsPage, type FbpSettingsData, type FlexComponentInput } from '@yukthix/ui/pay';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';

const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '4.11')!;

// Settings › Payroll & Statutory › Benefits & FBP (4.11, B8/E5, answers 2406, 2407, 2411): the designed page with
// `live`. The flexible components (Add and Edit open the component sheet) and the unclaimed-balance rule (a company
// setting, default paid in March). HR with benefits.settings.manage changes them, never while acting for someone else;
// the API checks the key and audits every change.
export default function YxBenefitsSettingsPage() {
  const { accessToken, impersonating, actingSuperAdmin } = useAuth();
  const perms = useYxPermissions();
  const client = useQueryClient();
  const acting = Boolean(impersonating || actingSuperAdmin);
  const data = useQuery<FbpSettingsData>({ queryKey: ['benefits', 'flex', 'settings'], queryFn: () => apiFetch('/benefits/flex/settings', {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false });
  const write = async (method: 'POST' | 'PUT', path: string, body: unknown) => {
    await apiFetch(path, { method, body: JSON.stringify(body) }, accessToken ?? undefined);
    await client.invalidateQueries({ queryKey: ['benefits'] });
  };
  const [row, setRow] = useState<number | 'new' | null>(null);
  const canEdit = perms.has('benefits.settings.manage') && !acting;
  const comps = data.data?.components ?? [];
  const current = typeof row === 'number' ? (comps[row] ?? null) : null;
  const page = useMemo(() => (data.data ? fbpSettingsPage(design, data.data) : design), [data.data]);
  const state = loadState(data);
  return (
    <>
      <SettingsPageScreen
        groups={SETTINGS_GROUPS}
        pageId="4.11"
        live={{
          page,
          canEdit,
          listEditors: canEdit ? { 'ben.fbp_heads': setRow } : undefined,
          lastChange: data.data?.lastChange ? { by: data.data.lastChange.by, role: '', at: data.data.lastChange.at, what: data.data.lastChange.what } : null,
          state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : state === 'no-access' ? 'no-access' : 'error',
          onRetry: () => void data.refetch(),
          savedTitle: 'Benefits settings saved',
          onSave: async (values) => {
            for (const ch of fbpSettingsChanges(values)) await write('PUT', '/org/settings', { key: ch.key, scopeType: 'tenant', value: ch.value });
          },
        }}
      />
      {row !== null && (
        <FlexComponentSheet
          initial={current}
          categories={data.data?.categories ?? []}
          onClose={() => setRow(null)}
          onSave={(x: FlexComponentInput) => (current ? write('PUT', `/benefits/flex/components/${encodeURIComponent(current.id)}`, x) : write('POST', '/benefits/flex/components', x))}
        />
      )}
    </>
  );
}
