import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { IntegrationsResponse } from '../types';
import { useAuth } from '../auth-context';

export function useIntegrations() {
  const { accessToken } = useAuth();
  return useQuery<IntegrationsResponse>({
    queryKey: ['integrations'],
    queryFn: () => apiFetch('/organizations/integrations', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface UpdateSmtpInput {
  host: string;
  port: number;
  user: string;
  password: string;
  fromAddress: string;
}

export function useUpdateSmtpSettings() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSmtpInput): Promise<{ smtpConfigured: boolean }> =>
      apiFetch('/organizations/integrations/smtp', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useUpdateAiKey() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string): Promise<{ aiKeyConfigured: boolean }> =>
      apiFetch('/organizations/integrations/ai-key', { method: 'PATCH', body: JSON.stringify({ apiKey }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}
