import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import type { JobBoard } from '../types';

// Web data layer for GET/POST/PATCH/DELETE /organizations/job-boards (all org:manage_settings).
// Mirrors useOrgSenderAddresses.ts's fetch-wrapper/invalidation conventions.

export function useJobBoards() {
  const { accessToken } = useAuth();
  return useQuery<JobBoard[]>({
    queryKey: ['job-boards'],
    queryFn: () => apiFetch('/organizations/job-boards', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useCreateJobBoard() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch('/organizations/job-boards', { method: 'POST', body: JSON.stringify({ name }) }, accessToken ?? undefined) as Promise<JobBoard>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job-boards'] }),
  });
}

export interface UpdateJobBoardInput { id: string; name: string; }

export function useUpdateJobBoard() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateJobBoardInput) =>
      apiFetch(`/organizations/job-boards/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<JobBoard>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job-boards'] }),
  });
}

export function useDeleteJobBoard() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/organizations/job-boards/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job-boards'] }),
  });
}
