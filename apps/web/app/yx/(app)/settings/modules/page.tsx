'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ModulesScreen } from '@yukthix/ui/frame';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import type { CompanyModule } from '../../../../../lib/yx-modules';

// Settings › Modules (T2-G 41, answer 2746): the drawn ModulesScreen with `live`. HR's settings key switches modules on
// and off and orders the rail; the API refuses the rest, audits each change and keeps People and Payroll on.
export default function YxModulesPage() {
  const qc = useQueryClient();
  const perms = useYxPermissions();
  const { accessToken, impersonating, actingSuperAdmin } = useAuth();
  const q = useOrg<{ modules: CompanyModule[] }>('/modules');
  return (
    <ModulesScreen
      modules={q.data?.modules ?? []}
      canEdit={perms.has('org.settings.manage') && !impersonating && !actingSuperAdmin}
      live={{
        state: loadState(q),
        onRetry: () => void q.refetch(),
        onSave: async (next) => {
          const saved = (await apiFetch('/org/modules', { method: 'PUT', body: JSON.stringify(next) }, accessToken ?? undefined)) as { modules: CompanyModule[] };
          qc.setQueryData(['yx', 'org', '/modules'], saved);
        },
      }}
    />
  );
}
