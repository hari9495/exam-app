import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Candidate } from '../types';
import { useAuth } from '../auth-context';

export function useCandidates() {
  const { accessToken } = useAuth();
  return useQuery<Candidate[]>({
    queryKey: ['candidates'],
    queryFn: () => apiFetch('/candidates', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface CreateCandidateInput {
  name: string;
  email: string;
  phone?: string;
}

export function useCreateCandidate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCandidateInput) =>
      apiFetch('/candidates', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });
}
