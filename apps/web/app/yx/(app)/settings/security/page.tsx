'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SecuritySettingsScreen, type IdentityProviderRow, type SecurityFloor, type SecurityPolicy } from '@yukthix/ui/auth';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetch } from '../../../../../lib/api-client';
import type { PaginatedResponse, StaffUser } from '../../../../../lib/types';

interface PolicyResponse {
  policy: SecurityPolicy;
  floor: SecurityFloor;
  updatedAt: string | null;
}

// Settings › People & Access › Security (P12 §7, Q8). Saving is a step-up action: apiFetch asks the
// person to confirm it's them, then resends. The API re-checks every value against the floor.
export default function YxSecuritySettingsPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const get = <T,>(key: string, path: string) => ({ queryKey: ['yx', 'settings', key], queryFn: (): Promise<T> => apiFetch(path, {}, token), enabled: Boolean(token), retry: false });

  const policy = useQuery(get<PolicyResponse>('policy', '/security/policy'));
  const providers = useQuery(get<IdentityProviderRow[]>('providers', '/security/identity-providers'));
  const users = useQuery(get<PaginatedResponse<StaffUser>>('users', '/users?pageSize=100'));

  // A plain 403 is a missing permission; MFA_REQUIRED is the MFA floor (the layout says what to do).
  const err = policy.error as { status?: number; code?: string } | null;
  const noAccess = err?.status === 403 && err.code !== 'MFA_REQUIRED';
  return (
    <SecuritySettingsScreen
      state={noAccess ? 'no-access' : policy.isError ? 'error' : policy.data ? 'ready' : 'loading'}
      onRetry={() => void policy.refetch()}
      policy={policy.data?.policy ?? null}
      floor={policy.data?.floor ?? null}
      updatedAt={policy.data?.updatedAt}
      providers={providers.data ?? []}
      admins={(users.data?.data ?? [])
        .filter((u) => u.role === 'org_admin' && u.status === 'active')
        .map((u) => ({ id: u.id, name: u.name || u.email, email: u.email }))}
      providersHref="/v2/settings/sso"
      onSave={async (changes) => {
        await apiFetch('/security/policy', { method: 'PATCH', body: JSON.stringify(changes) }, token);
        await queryClient.invalidateQueries({ queryKey: ['yx', 'settings', 'policy'] });
      }}
    />
  );
}
