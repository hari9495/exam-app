import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { IntegrationsResponse, WebhookDeliveryRow } from '../types';
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
  fromAddress?: string;
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

interface UpdateAiKeyInput {
  provider: 'anthropic' | 'openai-compatible';
  apiKey: string;
  baseUrl?: string;
  modelFast?: string;
  modelStandard?: string;
}

export function useUpdateAiKey() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAiKeyInput): Promise<{ aiKeyConfigured: boolean }> =>
      apiFetch('/organizations/integrations/ai-key', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useGenerateApiKey() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ apiKey: string; apiKeyPrefix: string }> =>
      apiFetch('/organizations/integrations/api-key', { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useRevokeApiKey() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ apiKeyConfigured: boolean }> =>
      apiFetch('/organizations/integrations/api-key', { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useUpdateWebhookUrl() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string): Promise<{ webhookUrl: string }> =>
      apiFetch('/organizations/integrations/webhook', { method: 'PATCH', body: JSON.stringify({ url }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useGenerateWebhookSecret() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ webhookSecret: string }> =>
      apiFetch('/organizations/integrations/webhook-secret', { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useWebhookDeliveries() {
  const { accessToken } = useAuth();
  return useQuery<WebhookDeliveryRow[]>({
    queryKey: ['webhook-deliveries'],
    queryFn: () => apiFetch('/organizations/integrations/webhook-deliveries', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
