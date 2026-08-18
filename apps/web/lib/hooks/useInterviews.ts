import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { Interview } from '../types';

export function useCandidateInterviews(candidateId: string) {
  const { accessToken } = useAuth();
  return useQuery<Interview[]>({
    queryKey: ['candidate-interviews', candidateId],
    queryFn: () => apiFetch(`/candidates/${candidateId}/interviews`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && candidateId),
  });
}

export interface CreateInterviewInput {
  slots: { startsAt: string; endsAt: string }[];
  panelistUserIds: string[];
  location: string;
  timeZone: string;
  recruiterNote?: string;
}

// candidateId is needed (beyond entryId) purely to invalidate the right ['candidate-interviews', X]
// list -- the create endpoint is keyed by pipeline entry, same split as useCreateOffer.
export function useCreateInterview(entryId: string, candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Interview, Error, CreateInterviewInput>({
    mutationFn: (input) =>
      apiFetch(`/pipeline/entries/${entryId}/interviews`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<Interview>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-interviews', candidateId] }),
  });
}

export function useSendInterview(candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Interview, Error, string>({
    mutationFn: (interviewId) => apiFetch(`/interviews/${interviewId}/send`, { method: 'POST' }, accessToken ?? undefined) as Promise<Interview>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-interviews', candidateId] }),
  });
}

// The caller's own assigned interviews (panel console). listMine only includes slots -- no
// candidate/job -- so the panel page renders time/location/status only.
export function useMyInterviews() {
  const { accessToken } = useAuth();
  return useQuery<Interview[]>({
    queryKey: ['my-interviews'],
    queryFn: () => apiFetch('/interviews/mine', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useCancelInterview(candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Interview, Error, string>({
    mutationFn: (interviewId) => apiFetch(`/interviews/${interviewId}/cancel`, { method: 'POST' }, accessToken ?? undefined) as Promise<Interview>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-interviews', candidateId] }),
  });
}
