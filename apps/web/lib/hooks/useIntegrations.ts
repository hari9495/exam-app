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

interface UpdateEmbeddingConfigInput { apiKey: string; baseUrl: string; model: string }

export function useUpdateEmbeddingConfig() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEmbeddingConfigInput): Promise<{ embeddingConfigured: boolean }> =>
      apiFetch('/organizations/integrations/embedding-config', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useBackfillEmbeddings() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (): Promise<{ queued: number }> =>
      apiFetch('/candidates/embeddings/backfill', { method: 'POST' }, accessToken ?? undefined),
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

export interface HrisConfigInput {
  enabled: boolean;
  provider?: string;
  targetUrl?: string; // generic / workday
  authHeader?: string; // generic
  apiKey?: string; // greenhouse / lever / bamboohr / workday
  subdomain?: string; // bamboohr
  onBehalfOf?: string; // greenhouse
  performAs?: string; // lever
}

export function useUpdateHrisConfig() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HrisConfigInput): Promise<{ hrisExportConfigured: boolean; hrisExportEnabled: boolean }> =>
      apiFetch('/organizations/integrations/hris-config', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
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
