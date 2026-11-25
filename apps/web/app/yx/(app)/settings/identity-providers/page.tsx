'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@yukthix/ui';
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
  const { toast } = useToast();
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

  const name = (id: string) => providers.data?.find((p) => p.id === id)?.name ?? 'The provider';

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
      onSave={async (id, input: IdentityProviderInput) => {
        await (id ? send(`/security/identity-providers/${encodeURIComponent(id)}`, 'PATCH', input) : send('/security/identity-providers', 'POST', input));
        toast({ tone: 'success', title: id ? `${input.name ?? name(id)} saved` : `${input.name ?? 'The provider'} added`, ...(id ? {} : { description: 'It is off. Turn it on when people should use it.' }) });
      }}
      onSetStatus={async (id, status) => {
        await send(`/security/identity-providers/${encodeURIComponent(id)}`, 'PATCH', { status });
        toast({ tone: 'success', title: `${name(id)} is ${status === 'active' ? 'on' : 'off'}` });
      }}
      onRemove={async (id) => {
        const was = name(id);
        await send(`/security/identity-providers/${encodeURIComponent(id)}`, 'DELETE');
        toast({ tone: 'success', title: `${was} removed` });
      }}
    />
  );
}
