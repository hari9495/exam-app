import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Candidate, PaginatedResponse } from '../types';
import { useAuth } from '../auth-context';

interface UseCandidatesParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildCandidatesQuery(params: UseCandidatesParams): string {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export function useCandidates(params: UseCandidatesParams = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<Candidate>>({
    queryKey: ['candidates', params],
    queryFn: () => apiFetch(`/candidates${buildCandidatesQuery(params)}`, {}, accessToken ?? undefined),
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
