import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { WhatsappConfigResponse, WhatsappProviderCatalogItem } from '../types';

// Web data layer for the org WhatsApp config -- mirrors useIntegrations.ts's fetch/mutate
// conventions. Both routes are gated org:manage_settings server-side (see
// apps/api/src/organizations/organizations.controller.ts).

export function useWhatsappProviders() {
  const { accessToken } = useAuth();
  return useQuery<WhatsappProviderCatalogItem[]>({
    queryKey: ['whatsapp-providers'],
    queryFn: () => apiFetch('/organizations/whatsapp-providers', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useWhatsappConfig() {
  const { accessToken } = useAuth();
  return useQuery<WhatsappConfigResponse>({
    queryKey: ['whatsapp-config'],
    queryFn: () => apiFetch('/organizations/whatsapp-config', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface UpdateWhatsappConfigInput {
  whatsappEnabled?: boolean;
  whatsappProvider?: string;
  config?: Record<string, unknown>;
}

export function useUpdateWhatsappConfig() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<WhatsappConfigResponse, Error, UpdateWhatsappConfigInput>({
    mutationFn: (input) =>
      apiFetch('/organizations/whatsapp-config', { method: 'PUT', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<WhatsappConfigResponse>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] }),
  });
}
