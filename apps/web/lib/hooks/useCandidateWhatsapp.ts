import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { CandidateWhatsappMessage, WhatsappTemplate } from '../types';

// Web data layer for candidate WhatsApp messages + templates -- mirrors
// useCandidateMessages.ts's fetch/mutate conventions and query-key/invalidation shape, minus
// subject (WhatsApp is body-only).

export function useCandidateWhatsapp(candidateId: string) {
  const { accessToken } = useAuth();
  return useQuery<CandidateWhatsappMessage[]>({
    queryKey: ['candidate-whatsapp', candidateId],
    queryFn: () => apiFetch(`/candidate-whatsapp/${candidateId}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && candidateId),
  });
}

export interface SendWhatsappInput {
  templateId?: string | null;
  body: string;
}

// candidateId is needed (beyond entryId) purely to invalidate the right
// ['candidate-whatsapp', X] list -- the send endpoint is keyed by pipeline entry.
export function useSendWhatsapp(entryId: string, candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CandidateWhatsappMessage, Error, SendWhatsappInput>({
    mutationFn: (input) =>
      apiFetch(`/candidate-whatsapp/${entryId}`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<CandidateWhatsappMessage>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-whatsapp', candidateId] }),
  });
}

export function useResendWhatsapp(candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CandidateWhatsappMessage, Error, string>({
    mutationFn: (messageId) =>
      apiFetch(`/candidate-whatsapp/${messageId}/resend`, { method: 'POST' }, accessToken ?? undefined) as Promise<CandidateWhatsappMessage>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-whatsapp', candidateId] }),
  });
}

export function useWhatsappTemplates() {
  const { accessToken } = useAuth();
  return useQuery<WhatsappTemplate[]>({
    queryKey: ['whatsapp-templates'],
    queryFn: () => apiFetch('/candidate-whatsapp-templates', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface UpsertWhatsappTemplateInput {
  id?: string;
  name: string;
  triggerStageId: string | null;
  triggerMode: 'manual' | 'prompt' | 'auto';
  body: string;
  enabled?: boolean;
}

// No id -> POST (create/override-by-stage); id present -> PATCH :id (update). Same
// upsert-by-triggerStageId shape as useUpsertTemplate (candidate-email-templates).
export function useUpsertWhatsappTemplate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<WhatsappTemplate, Error, UpsertWhatsappTemplateInput>({
    mutationFn: ({ id, ...input }) =>
      apiFetch(
        id ? `/candidate-whatsapp-templates/${id}` : '/candidate-whatsapp-templates',
        { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ) as Promise<WhatsappTemplate>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] }),
  });
}

export function useSetWhatsappTemplateEnabled() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<WhatsappTemplate, Error, { id: string; enabled: boolean }>({
    mutationFn: ({ id, enabled }) =>
      apiFetch(
        `/candidate-whatsapp-templates/${id}/enabled`,
        { method: 'PATCH', body: JSON.stringify({ enabled }) },
        accessToken ?? undefined,
      ) as Promise<WhatsappTemplate>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] }),
  });
}

// Deletes the org's saved override for a template, which reverts it to the built-in default.
export function useDeleteWhatsappTemplate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiFetch(`/candidate-whatsapp-templates/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] }),
  });
}

// PATCH /candidates/:id/whatsapp-opt-out -- lives on the candidates route (see
// candidates.controller.ts), not /candidate-whatsapp, but it's WhatsApp-specific state so the
// mutation lives beside the rest of this feature's hooks. Invalidates the ['candidates', ...]
// list queries too since that's where CandidateDrawer currently reads phone/opt-out state from
// (no dedicated get-one-candidate endpoint exists).
export function useSetCandidateWhatsappOptOut() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<{ id: string; whatsappOptedOutAt: string | null }, Error, { id: string; optedOut: boolean }>({
    mutationFn: ({ id, optedOut }) =>
      apiFetch(
        `/candidates/${id}/whatsapp-opt-out`,
        { method: 'PATCH', body: JSON.stringify({ optedOut }) },
        accessToken ?? undefined,
      ) as Promise<{ id: string; whatsappOptedOutAt: string | null }>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });
}
