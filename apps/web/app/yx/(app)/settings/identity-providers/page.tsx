'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IdentityProvidersScreen, type IdentityProviderDetail, type IdentityProviderInput } from '@yukthix/ui/auth';
import { useAuth } from '../../../../../lib/auth-context';
import { API_BASE, apiFetch } from '../../../../../lib/api-client';
import { useOrgBranding } from '../../../../../lib/hooks/useBranding';

// Settings › Security › Single sign-on providers (P12 §7, YX-IAM-04/05). Every change is a step-up
// action: apiFetch asks the person to confirm it's them, then resends. Client secrets are write-only.
export default function YxIdentityProvidersPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const providers = useQuery({
    queryKey: ['yx', 'settings', 'providers'],
    queryFn: (): Promise<IdentityProviderDetail[]> => apiFetch('/security/identity-providers', {}, token),
    enabled: Boolean(token),
    retry: false,
  });
  // The slug comes from the company itself, not the sign-in: email-first sign-in never sets one.
  const slug = useOrgBranding().data?.slug;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['yx', 'settings', 'providers'] });
  const send = async (path: string, method: string, body?: unknown) => {
    await apiFetch(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }, token);
    await refresh();
  };

  // A plain 403 is a missing permission; MFA_REQUIRED is the MFA floor (the layout says what to do).
  const err = providers.error as { status?: number; code?: string } | null;
  const noAccess = err?.status === 403 && err.code !== 'MFA_REQUIRED';
  return (
    <IdentityProvidersScreen
      state={noAccess ? 'no-access' : providers.isError ? 'error' : providers.data ? 'ready' : 'loading'}
      onRetry={() => void providers.refetch()}
      providers={providers.data ?? []}
      samlMetadataUrl={slug ? `${API_BASE}/auth/saml/${encodeURIComponent(slug)}/metadata` : null}
      oidcRedirectUri={`${API_BASE}/auth/oidc/callback`}
      onSave={(id, input: IdentityProviderInput) =>
        id ? send(`/security/identity-providers/${encodeURIComponent(id)}`, 'PATCH', input) : send('/security/identity-providers', 'POST', input)
      }
      onSetStatus={(id, status) => send(`/security/identity-providers/${encodeURIComponent(id)}`, 'PATCH', { status })}
      onRemove={(id) => send(`/security/identity-providers/${encodeURIComponent(id)}`, 'DELETE')}
    />
  );
}
