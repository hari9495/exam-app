import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { CandidateEmail, CandidateEmailTemplate } from '../types';

export function useCandidateMessages(candidateId: string) {
  const { accessToken } = useAuth();
  return useQuery<CandidateEmail[]>({
    queryKey: ['candidate-messages', candidateId],
    queryFn: () => apiFetch(`/candidates/${candidateId}/messages`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && candidateId),
  });
}

export interface SendMessageInput {
  templateId?: string | null;
  subject: string;
  body: string;
}

// candidateId is needed (beyond entryId) purely to invalidate the right ['candidate-messages', X]
// list -- the send endpoint is keyed by pipeline entry, but the timeline it feeds is keyed by
// candidate.
export function useSendMessage(entryId: string, candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CandidateEmail, Error, SendMessageInput>({
    mutationFn: (input) =>
      apiFetch(`/pipeline/entries/${entryId}/messages`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<CandidateEmail>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-messages', candidateId] }),
  });
}

export function useResendMessage(candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CandidateEmail, Error, string>({
    mutationFn: (messageId) =>
      apiFetch(`/candidate-emails/${messageId}/resend`, { method: 'POST' }, accessToken ?? undefined) as Promise<CandidateEmail>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-messages', candidateId] }),
  });
}

export function useMessageTemplates() {
  const { accessToken } = useAuth();
  return useQuery<CandidateEmailTemplate[]>({
    queryKey: ['candidate-email-templates'],
    queryFn: () => apiFetch('/candidate-email-templates', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface UpsertTemplateInput {
  id?: string;
  name: string;
  triggerStageId: string | null;
  triggerMode: 'manual' | 'prompt' | 'auto';
  subject: string;
  body: string;
  enabled?: boolean;
}

// No id -> POST (create/override-by-stage); id present -> PATCH :id (update). Both are the same
// upsert-by-triggerStageId server-side (see candidate-email-templates.controller.ts), so this
// just picks the route the id implies.
export function useUpsertTemplate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CandidateEmailTemplate, Error, UpsertTemplateInput>({
    mutationFn: ({ id, ...input }) =>
      apiFetch(
        id ? `/candidate-email-templates/${id}` : '/candidate-email-templates',
        { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ) as Promise<CandidateEmailTemplate>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-email-templates'] }),
  });
}

export function useSetTemplateEnabled() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CandidateEmailTemplate, Error, { id: string; enabled: boolean }>({
    mutationFn: ({ id, enabled }) =>
      apiFetch(
        `/candidate-email-templates/${id}/enabled`,
        { method: 'PATCH', body: JSON.stringify({ enabled }) },
        accessToken ?? undefined,
      ) as Promise<CandidateEmailTemplate>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-email-templates'] }),
  });
}

// Deletes the org's saved override for a template, which reverts it to the built-in default.
export function useDeleteTemplate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiFetch(`/candidate-email-templates/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-email-templates'] }),
  });
}
