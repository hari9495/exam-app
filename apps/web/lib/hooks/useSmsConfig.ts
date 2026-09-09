import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { SmsConfigResponse } from '../types';

// SMS counterpart of useIntegrations' SMTP config query/mutation (Zoho #16). A separate endpoint
// (not folded into /organizations/integrations) -- see apps/api organizations.controller.ts.
export function useSmsConfig() {
  const { accessToken } = useAuth();
  return useQuery<SmsConfigResponse>({
    queryKey: ['sms-config'],
    queryFn: () => apiFetch('/organizations/sms-config', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface UpdateSmsConfigInput {
  smsEnabled?: boolean;
  smsAccountSid?: string;
  smsFromNumber?: string;
  // Write-only, like the SMTP password -- omitted/blank keeps the existing encrypted token.
  smsAuthToken?: string;
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
