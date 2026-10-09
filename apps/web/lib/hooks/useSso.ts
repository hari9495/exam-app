import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { IdentityProvider } from '../types';
import { useAuth } from '../auth-context';

// Lightweight, permission-free "is SSO on for my org" check -- unlike useIdentityProviders below
// (which needs org:manage_settings and is only ever rendered where that's guaranteed), this
// is safe to call from any staff role's UI: it hits the same public-by-design endpoint the
// login page uses (GET /auth/saml/:slug/status: any active SAML or OIDC provider), just with the
// caller's own slug from their session instead of the slug typed into the login form.
export function useSsoStatus() {
  const { organizationSlug } = useAuth();
  return useQuery<{ enabled: boolean }>({
    queryKey: ['sso-status', organizationSlug],
    queryFn: () => apiFetch(`/auth/saml/${organizationSlug}/status`),
    enabled: Boolean(organizationSlug),
  });
}

const KEY = ['identity-providers'];

export function useIdentityProviders() {
  const { accessToken } = useAuth();
  return useQuery<IdentityProvider[]>({
    queryKey: KEY,
    queryFn: () => apiFetch('/security/identity-providers', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

// Create (no id) or update (id) a provider. Only the fields sent change; the client secret is
// sent only when typed. Changing a provider is a step-up action (the API asks for it).
export type IdentityProviderInput = Partial<Omit<IdentityProvider, 'id' | 'clientSecretSet'>> & { oidcClientSecret?: string };

export function useSaveIdentityProvider() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: IdentityProviderInput & { id?: string }): Promise<IdentityProvider> =>
      apiFetch(
        id ? `/security/identity-providers/${id}` : '/security/identity-providers',
        { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ['sso-status'] });
    },
  });
}

export function useDeleteIdentityProvider() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/security/identity-providers/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ['sso-status'] });
    },
  });
}
