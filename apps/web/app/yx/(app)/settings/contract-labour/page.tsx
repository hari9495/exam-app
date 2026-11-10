'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SETTINGS_GROUPS, SettingsPageScreen } from '@yukthix/ui/hiring';
import { clraSettingsChanges, clraSettingsPage, type ClraSettingsData } from '@yukthix/ui/desk';
import { loadState } from '../../../../../lib/yx-org';
import { useClra, useClraWrite } from '../../../../../lib/yx-contract-labour';
import { useAuth } from '../../../../../lib/auth-context';

const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '4.9')!;

// Settings › Payroll & Statutory › Contract labour (4.9, CL-1): the designed settings page with `live`. The law rows come
// from the rule set IN.CLRA (read-only, verify); the licence expiry alert days are a company setting (default 60, 30
// and 7). HR with the contract labour settings key (or the settings key) changes them, never while acting for someone
// else; each change is audited.
export default function YxContractLabourSettingsPage() {
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const acting = Boolean(impersonating || actingSuperAdmin);
  const data = useClra<ClraSettingsData>('/settings');
  const write = useClraWrite();
  const state = loadState(data);
  const page = useMemo(() => (data.data ? clraSettingsPage(design, data.data) : design), [data.data]);
  return (
    <SettingsPageScreen
      groups={SETTINGS_GROUPS}
      pageId="4.9"
      live={{
        page,
        canEdit: Boolean(data.data?.canEdit) && !acting,
        lastChange: data.data?.lastChange ? { by: data.data.lastChange.by, role: '', at: data.data.lastChange.at, what: data.data.lastChange.what } : null,
        state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : state === 'no-access' ? 'no-access' : 'error',
        onRetry: () => void data.refetch(),
        savedTitle: 'Contract labour settings saved',
        onSave: async (values) => {
          const changes = clraSettingsChanges(values);
          if (changes.length) await write('PUT', '/settings', { changes });
        },
        onOpenScreen: (screenId) => (screenId === 'CLB-01' ? router.push('/yx/contract-labour/contractors') : undefined),
      }}
    />
  );
}
