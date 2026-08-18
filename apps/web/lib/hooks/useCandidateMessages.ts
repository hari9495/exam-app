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
