import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { SmsConfigResponse, SmsProviderCatalogEntry } from '../types';

// SMS counterpart of useIntegrations' SMTP config query/mutation (Zoho #16, catalog-driven per
// #16 follow-up). A separate endpoint (not folded into /organizations/integrations) -- see
// apps/api organizations.controller.ts.
export function useSmsConfig() {
  const { accessToken } = useAuth();
  return useQuery<SmsConfigResponse>({
    queryKey: ['sms-config'],
    queryFn: () => apiFetch('/organizations/sms-config', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

// Provider catalog (Twilio | Generic HTTP, ...) -- metadata only, drives which fields the config
// form renders. Rarely changes; no need to invalidate this on the config mutation.
export function useSmsProviders() {
  const { accessToken } = useAuth();
  return useQuery<SmsProviderCatalogEntry[]>({
    queryKey: ['sms-providers'],
    queryFn: () => apiFetch('/organizations/sms-providers', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface UpdateSmsConfigInput {
  smsEnabled?: boolean;
  smsProvider?: string;
  // Secret fields (per the catalog's SmsConfigField.secret) are write-only, like the SMTP
  // password -- omitted/blank keeps the existing encrypted value for that key.
  config?: Record<string, string>;
}

export function useUpdateSmsConfig() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<SmsConfigResponse, Error, UpdateSmsConfigInput>({
    mutationFn: (input) =>
      apiFetch('/organizations/sms-config', { method: 'PUT', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<SmsConfigResponse>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sms-config'] }),
  });
}
