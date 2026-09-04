import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Candidate, PaginatedResponse } from '../types';
import { useAuth } from '../auth-context';

interface UseCandidatesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  globalStage?: string;
}

function buildCandidatesQuery(params: UseCandidatesParams): string {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.globalStage) query.set('globalStage', params.globalStage);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export function useCandidates(params: UseCandidatesParams = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<Candidate>>({
    queryKey: ['candidates', params],
    queryFn: () => apiFetch(`/candidates${buildCandidatesQuery(params)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    // Keep showing the previous page while a search/page/filter change refetches --
    // without this, isLoading flips true on every keystroke and the page's loading
    // early-return unmounts the search input, dropping focus mid-word.
    placeholderData: (prev) => prev,
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

export interface UpdateCandidateInput {
  name?: string;
  email?: string;
  phone?: string;
  status?: 'active' | 'inactive';
}

export function useUpdateCandidate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCandidateInput & { id: string }) =>
      apiFetch(`/candidates/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });
}

export function useDeleteCandidate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/candidates/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });
}
