import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { SsoSettingsResponse } from '../types';
import { useAuth } from '../auth-context';

// Lightweight, permission-free "is SSO on for my org" check -- unlike useSsoSettings below
// (which needs org:manage_settings and is only ever rendered where that's guaranteed), this
// is safe to call from any staff role's UI: it hits the same public-by-design endpoint the
// login page itself uses (GET /auth/saml/:slug/status), just with the caller's own slug from
// their session instead of the slug typed into the login form.
export function useSsoStatus() {
  const { organizationSlug } = useAuth();
  return useQuery<{ enabled: boolean }>({
    queryKey: ['sso-status', organizationSlug],
    queryFn: () => apiFetch(`/auth/saml/${organizationSlug}/status`),
    enabled: Boolean(organizationSlug),
  });
}

export function useSsoSettings() {
  const { accessToken } = useAuth();
  return useQuery<SsoSettingsResponse>({
    queryKey: ['sso-settings'],
    queryFn: () => apiFetch('/organizations/sso', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface UpdateSsoSettingsInput {
  samlEnabled?: boolean;
  samlIdpEntityId?: string;
  samlIdpSsoUrl?: string;
  samlIdpCertificate?: string;
}

export function useUpdateSsoSettings() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSsoSettingsInput): Promise<SsoSettingsResponse> =>
      apiFetch('/organizations/sso', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sso-settings'] }),
  });
}
