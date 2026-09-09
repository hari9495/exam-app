import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { CandidateSmsTemplate } from '../types';

// SMS counterpart of useCandidateMessages' template hooks (Zoho #16) -- same shape, no subject.
export function useSmsTemplates() {
  const { accessToken } = useAuth();
  return useQuery<CandidateSmsTemplate[]>({
    queryKey: ['candidate-sms-templates'],
    queryFn: () => apiFetch('/candidate-sms-templates', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface UpsertSmsTemplateInput {
  id?: string;
  name: string;
  triggerStageId: string | null;
  triggerMode: 'manual' | 'prompt' | 'auto';
  body: string;
  enabled?: boolean;
}

// No id -> POST (create/override-by-stage); id present -> PATCH :id -- same upsert-by-stage
// dispatch as useUpsertTemplate (email).
export function useUpsertSmsTemplate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CandidateSmsTemplate, Error, UpsertSmsTemplateInput>({
    mutationFn: ({ id, ...input }) =>
      apiFetch(
        id ? `/candidate-sms-templates/${id}` : '/candidate-sms-templates',
        { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ) as Promise<CandidateSmsTemplate>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-sms-templates'] }),
  });
}

export function useSetSmsTemplateEnabled() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CandidateSmsTemplate, Error, { id: string; enabled: boolean }>({
    mutationFn: ({ id, enabled }) =>
      apiFetch(
        `/candidate-sms-templates/${id}/enabled`,
        { method: 'PATCH', body: JSON.stringify({ enabled }) },
        accessToken ?? undefined,
      ) as Promise<CandidateSmsTemplate>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-sms-templates'] }),
  });
}

// Deletes the org's saved override for a template, reverting it to the built-in default (or
// removing it outright if it has none -- same as useDeleteTemplate for email).
export function useDeleteSmsTemplate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiFetch(`/candidate-sms-templates/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-sms-templates'] }),
  });
}
