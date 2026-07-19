import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { SsoSettingsResponse } from '../types';
import { useAuth } from '../auth-context';

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
